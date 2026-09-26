// 任务模型 v14：一张扁平表，parent 表示层级。没有"规划/管理"双来源，没有"放行"。
// 安排到某天 = 填 date；重复任务用 repeat 规则投影到每天，完成情况记在 doneDates。

import { App, TFile, normalizePath } from "obsidian";
import { LubiSettings } from "../settings";
import { parseDate, shiftDate, stamp, uid, weekStart } from "./time";

export type TaskStatus = "todo" | "doing" | "done";
export type RepeatKind = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: string;
  title: string;
  category: string;
  parent: string | null;
  status: TaskStatus;
  blocked: boolean;
  /** 安排执行日 YYYY-MM-DD，空 = 未安排 */
  date: string;
  /** 安排开始时间 HH:MM，空 = 全天 */
  start: string;
  /** 预计分钟 */
  estimate: number;
  repeat: { kind: RepeatKind; days: number[] };
  /** 重复任务：已完成的日期 */
  doneDates: string[];
  /** 项目跨度（可选，用于甘特） */
  startDate: string;
  endDate: string;
  notes: string;
  order: number;
  doneAt: string;
  created: string;
  updated: string;
}

export interface TaskStore {
  version: 14;
  tasks: Task[];
}

export function blankTask(partial: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: "",
    category: "",
    parent: null,
    status: "todo",
    blocked: false,
    date: "",
    start: "",
    estimate: 0,
    repeat: { kind: "none", days: [] },
    doneDates: [],
    startDate: "",
    endDate: "",
    notes: "",
    order: Date.now(),
    doneAt: "",
    created: now,
    updated: now,
    ...partial,
  };
}

export class Tasks {
  private store: TaskStore = { version: 14, tasks: [] };
  private loaded = false;
  private writing: Promise<void> = Promise.resolve();
  /** 迁移发生时记录备份路径，供 UI 提示 */
  lastMigrationBackup: string | null = null;
  onChange: (() => void) | null = null;

  constructor(private app: App, private settings: () => LubiSettings) {}

  get all(): Task[] {
    return this.store.tasks;
  }

  private filePath(): string {
    return normalizePath(this.settings().taskFile);
  }

  async load(force = false): Promise<void> {
    if (this.loaded && !force) return;
    const f = this.app.vault.getAbstractFileByPath(this.filePath());
    if (!(f instanceof TFile)) {
      this.store = { version: 14, tasks: [] };
      this.loaded = true;
      return;
    }
    const raw = await this.app.vault.read(f);
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    const obj = (data || {}) as { version?: number; tasks?: unknown[] };
    if (obj.version === 14 && Array.isArray(obj.tasks)) {
      this.store = { version: 14, tasks: obj.tasks.map((t) => normalize(t as Partial<Task>)) };
    } else if (Array.isArray(obj.tasks)) {
      // 旧版 (v13 及更早) → 先备份再迁移
      const backup = normalizePath(`${this.settings().backupFolder}/迁移前-任务数据-v${obj.version ?? 0}-${stamp()}.json`);
      await ensureFolder(this.app, backup.slice(0, backup.lastIndexOf("/")));
      await this.app.vault.adapter.write(backup, raw);
      this.lastMigrationBackup = backup;
      this.store = migrateLegacy(obj as LegacyStore);
      await this.persist();
    } else {
      this.store = { version: 14, tasks: [] };
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const text = JSON.stringify(this.store, null, 2);
    this.writing = this.writing.then(async () => {
      const p = this.filePath();
      await ensureFolder(this.app, p.slice(0, p.lastIndexOf("/")));
      const f = this.app.vault.getAbstractFileByPath(p);
      if (f instanceof TFile) await this.app.vault.modify(f, text);
      else await this.app.vault.create(p, text);
    });
    await this.writing;
  }

  private async commit(): Promise<void> {
    await this.persist();
    this.onChange?.();
  }

  // ---------- 查询 ----------

  byId(id: string): Task | undefined {
    return this.store.tasks.find((t) => t.id === id);
  }

  children(id: string): Task[] {
    return this.store.tasks.filter((t) => t.parent === id).sort(byOrder);
  }

  roots(): Task[] {
    return this.store.tasks.filter((t) => !t.parent || !this.byId(t.parent)).sort(byOrder);
  }

  pathOf(task: Task): Task[] {
    const out: Task[] = [];
    let cur: Task | undefined = task;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parent ? this.byId(cur.parent) : undefined;
    }
    return out;
  }

  isDoneOn(t: Task, date: string): boolean {
    return t.repeat.kind === "none" ? t.status === "done" : t.doneDates.includes(date);
  }

  /** 某天应出现的任务（安排在当天的 + 重复规则命中的） */
  forDate(date: string): Task[] {
    return this.store.tasks.filter((t) => occursOn(t, date)).sort(byTime);
  }

  /** 未安排的叶子任务（没有 date、非重复、未完成、没有子任务） */
  inbox(): Task[] {
    return this.store.tasks
      .filter((t) => !t.date && t.repeat.kind === "none" && t.status !== "done" && !this.children(t.id).length)
      .sort(byOrder);
  }

  /** 项目 = 顶层且有子任务，或设置了跨度 */
  projects(): Task[] {
    return this.roots().filter((t) => this.children(t.id).length > 0 || (t.startDate && t.endDate));
  }

  descendants(id: string): Task[] {
    const out: Task[] = [];
    const walk = (pid: string) => {
      for (const c of this.children(pid)) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }

  progress(t: Task): { done: number; total: number } {
    const leaves = this.descendants(t.id).filter((d) => !this.children(d.id).length);
    if (!leaves.length) return { done: t.status === "done" ? 1 : 0, total: 1 };
    return { done: leaves.filter((l) => l.status === "done").length, total: leaves.length };
  }

  /** 项目的时间跨度：自身 startDate/endDate，否则由后代 date 推导 */
  span(t: Task): { from: string; to: string } | null {
    if (t.startDate && t.endDate) return { from: t.startDate, to: t.endDate };
    const dates = [t, ...this.descendants(t.id)].map((d) => d.date).filter(Boolean).sort();
    if (!dates.length) return null;
    return { from: t.startDate || dates[0], to: t.endDate || dates[dates.length - 1] };
  }

  // ---------- 变更 ----------

  async upsert(task: Task): Promise<Task> {
    task.updated = new Date().toISOString();
    const i = this.store.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) this.store.tasks[i] = task;
    else this.store.tasks.push(task);
    await this.commit();
    return task;
  }

  async remove(id: string, withChildren = true): Promise<void> {
    const ids = new Set([id, ...(withChildren ? this.descendants(id).map((d) => d.id) : [])]);
    this.store.tasks = this.store.tasks.filter((t) => !ids.has(t.id));
    if (!withChildren) for (const t of this.store.tasks) if (t.parent === id) t.parent = null;
    await this.commit();
  }

  async toggleDone(id: string, date: string): Promise<boolean> {
    const t = this.byId(id);
    if (!t) return false;
    let done: boolean;
    if (t.repeat.kind === "none") {
      done = t.status !== "done";
      t.status = done ? "done" : "todo";
      t.doneAt = done ? new Date().toISOString() : "";
      if (done && !t.date) t.date = date;
    } else {
      done = !t.doneDates.includes(date);
      t.doneDates = done ? [...t.doneDates, date] : t.doneDates.filter((d) => d !== date);
    }
    t.updated = new Date().toISOString();
    if (done && t.parent) this.autoCompleteParent(t.parent);
    await this.commit();
    return done;
  }

  private autoCompleteParent(pid: string): void {
    const p = this.byId(pid);
    if (!p) return;
    const kids = this.children(pid);
    if (kids.length && kids.every((k) => k.status === "done")) {
      p.status = "done";
      p.doneAt = new Date().toISOString();
      if (p.parent) this.autoCompleteParent(p.parent);
    }
  }

  async schedule(id: string, date: string, start: string): Promise<void> {
    const t = this.byId(id);
    if (!t) return;
    t.date = date;
    t.start = start;
    t.updated = new Date().toISOString();
    await this.commit();
  }

  async reorder(ids: string[]): Promise<void> {
    ids.forEach((id, i) => {
      const t = this.byId(id);
      if (t) t.order = i + 1;
    });
    await this.commit();
  }
}

// ---------- helpers ----------

function byOrder(a: Task, b: Task): number {
  return a.order - b.order || a.created.localeCompare(b.created);
}
function byTime(a: Task, b: Task): number {
  if (a.start && b.start) return a.start.localeCompare(b.start) || byOrder(a, b);
  if (a.start) return -1;
  if (b.start) return 1;
  return byOrder(a, b);
}

export function occursOn(t: Task, date: string): boolean {
  if (t.repeat.kind === "none") return t.date === date;
  if (t.startDate && date < t.startDate) return false;
  if (t.endDate && date > t.endDate) return false;
  if (t.created && date < t.created.slice(0, 10) && !t.startDate) return false;
  const d = parseDate(date);
  if (t.repeat.kind === "daily") return true;
  if (t.repeat.kind === "weekly") return t.repeat.days.includes((d.getDay() + 6) % 7 + 1);
  if (t.repeat.kind === "monthly") return t.repeat.days.includes(d.getDate());
  return false;
}

export function weekOf(date: string): string[] {
  const s = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => shiftDate(s, i));
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  if (!folder) return;
  const parts = folder.split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!(await app.vault.adapter.exists(cur))) await app.vault.createFolder(cur);
  }
}

function normalize(t: Partial<Task>): Task {
  const b = blankTask();
  return {
    ...b,
    ...t,
    repeat: { kind: t.repeat?.kind || "none", days: Array.isArray(t.repeat?.days) ? t.repeat!.days : [] },
    doneDates: Array.isArray(t.doneDates) ? t.doneDates : [],
    order: typeof t.order === "number" ? t.order : b.order,
    estimate: typeof t.estimate === "number" ? t.estimate : 0,
  };
}

// ---------- v13 → v14 ----------

interface LegacyNode {
  id: string;
  title?: string;
  categoryId?: string;
  taskId?: string;
  parentId?: string | null;
  status?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  estimate?: number | null;
  retired?: boolean;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  sequenceOrder?: number | null;
  schedule?: {
    repeat?: string;
    weekdays?: number[];
    monthDays?: number[];
    startTime?: string;
    endTime?: string;
    anchor?: string;
  };
}
interface LegacyStore {
  version?: number;
  categories?: { id: string; name: string }[];
  tasks?: LegacyNode[];
  subtasks?: LegacyNode[];
}

const STATUS_MAP: Record<string, TaskStatus> = { pending: "todo", doing: "doing", blocked: "todo", done: "done" };

export function migrateLegacy(old: LegacyStore): TaskStore {
  const cats = new Map((old.categories || []).map((c) => [c.id, c.name]));
  const roots = old.tasks || [];
  const rootCat = new Map(roots.map((t) => [t.id, cats.get(t.categoryId || "") || ""]));
  const out: Task[] = [];
  let order = 1;
  const convert = (n: LegacyNode, parent: string | null, category: string): Task => {
    const sched = n.schedule || {};
    const rk = sched.repeat as RepeatKind | undefined;
    const kind: RepeatKind = rk === "daily" || rk === "weekly" || rk === "monthly" ? rk : "none";
    const est = typeof n.estimate === "number" && n.estimate > 0 ? n.estimate : 0;
    const start = n.startTime || sched.startTime || "";
    let estimate = est;
    if (!estimate && start && (n.endTime || sched.endTime)) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = (n.endTime || sched.endTime || "").split(":").map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) estimate = diff;
    }
    const t = blankTask({
      id: n.id,
      title: n.title || "未命名",
      category,
      parent,
      status: STATUS_MAP[n.status || "pending"] || "todo",
      blocked: n.status === "blocked",
      date: kind === "none" ? n.startDate || "" : "",
      start: kind === "none" ? (n.startDate ? start : "") : start,
      estimate,
      repeat: { kind, days: kind === "weekly" ? sched.weekdays || [] : kind === "monthly" ? sched.monthDays || [] : [] },
      startDate: kind !== "none" ? n.startDate || sched.anchor || "" : "",
      endDate: kind !== "none" ? n.endDate || "" : "",
      notes: n.notes || "",
      order: typeof n.sequenceOrder === "number" ? n.sequenceOrder : order++,
      doneAt: n.completedAt || "",
      created: n.createdAt || new Date().toISOString(),
      updated: n.updatedAt || new Date().toISOString(),
    });
    return t;
  };
  for (const r of roots) if (!r.retired) out.push(convert(r, null, rootCat.get(r.id) || ""));
  for (const s of old.subtasks || []) {
    if (s.retired) continue;
    const parent = s.parentId || s.taskId || null;
    out.push(convert(s, parent, rootCat.get(s.taskId || "") || ""));
  }
  return { version: 14, tasks: out };
}
