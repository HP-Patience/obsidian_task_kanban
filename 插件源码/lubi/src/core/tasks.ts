// 任务模型 v14：一张扁平表，parent 表示层级。没有"规划/管理"双来源，没有"放行"。
// 安排到某天 = 填 date；重复任务用 repeat 规则投影到每天，完成情况记在 doneDates。

import { App, Notice, TFile, normalizePath } from "obsidian";
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
  /** 重复任务：主动跳过的日期（只影响当天，不改变重复规则） */
  skipDates: string[];
  /** 项目跨度（可选，用于甘特） */
  startDate: string;
  endDate: string;
  notes: string;
  order: number;
  doneAt: string;
  created: string;
  updated: string;
  /** 勾选完成时顺手记下的记录（完成日期 → 记录标识），取消勾选时据此删掉那条记录 */
  doneLogs?: Record<string, DoneLog>;
  /** "record"：在每日页直接记下的已完成事项自动生成的任务；删掉那条记录时一起删除 */
  origin?: "record";
}

/** 用开始时间 + 标题 + 分类（+ 关联任务）定位一条记录；不含时长，跨夜拆分后仍能找到 */
export interface DoneLog {
  date: string;
  start: string;
  title: string;
  category: string;
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
    skipDates: [],
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
  private loadBlocked = false;
  private writing: Promise<void> = Promise.resolve();
  private diskText: string | null = null;
  lastImportBackup: string | null = null;
  /** 迁移发生时记录备份路径，供 UI 提示 */
  lastMigrationBackup: string | null = null;
  lastLoadError: string | null = null;
  /** 最近一次由本实例写入任务文件的时间，用于忽略自己的 Vault 事件。 */
  lastWriteAt = 0;
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
      this.diskText = null;
      this.loaded = true;
      return;
    }
    const raw = await this.app.vault.read(f);
    this.diskText = raw;
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      const backup = normalizePath(`${this.settings().backupFolder}/损坏-任务数据-${stamp()}.json`);
      await ensureFolder(this.app, backup.slice(0, backup.lastIndexOf("/")));
      await this.app.vault.adapter.write(backup, raw);
      this.lastLoadError = `任务数据 JSON 无法解析，原文件已备份到 ${backup}`;
      this.loadBlocked = true;
      this.store = { version: 14, tasks: [] };
      this.loaded = true;
      new Notice(`${this.lastLoadError}。已进入只读保护，请修复后再继续操作。`, 10000);
      return;
    }
    this.loadBlocked = false;
    this.lastLoadError = null;
    const obj = (data || {}) as { version?: number; tasks?: unknown[] };
    if (obj.version === 14 && Array.isArray(obj.tasks)) {
      this.store = { ...obj, version: 14, tasks: obj.tasks.map((t) => normalize(t as Partial<Task>)) };
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

  /** Read the saved store without normalizing, migrating, or dropping unknown fields. */
  async exportSnapshot(): Promise<TaskStore> {
    await this.writing;
    const file = this.app.vault.getAbstractFileByPath(this.filePath());
    if (!(file instanceof TFile)) {
      if (file || this.store.tasks.length) throw new Error("任务文件不可读取，请刷新后重试");
      return { version: 14, tasks: [] };
    }
    const data = JSON.parse(await this.app.vault.read(file)) as TaskStore | null;
    if (!data || data.version !== 14 || !Array.isArray(data.tasks)) throw new Error("任务文件格式异常，请先核对任务数据");
    return data;
  }

  private async persist(added: Task[] = []): Promise<void> {
    if (this.loadBlocked) throw new Error(this.lastLoadError || "任务数据无法写入：数据加载失败。");
    const next = this.writing.catch(() => undefined).then(async () => {
      const p = this.filePath();
      await ensureFolder(this.app, p.slice(0, p.lastIndexOf("/")));
      const f = this.app.vault.getAbstractFileByPath(p);
      if (added.length) {
        const ids = new Set(this.store.tasks.map(task => task.id));
        for (const task of added) { if (ids.has(task.id)) throw new Error("任务 ID 重复，未导入");ids.add(task.id); }
        if (f instanceof TFile) {
          const before = await this.app.vault.read(f);
          if (before !== this.diskText) throw new Error("任务文件已在外部更新，请刷新后重新导入");
          let raw: { version?: number; tasks?: unknown[] };
          try { raw = JSON.parse(before); } catch { throw new Error("任务文件 JSON 无效，未导入"); }
          if (raw?.version !== 14 || !Array.isArray(raw.tasks)) throw new Error("任务文件格式无效，未导入");
          const backup = normalizePath(`${this.settings().backupFolder}/导入前-任务数据-${stamp()}-${uid()}.json`);
          await ensureFolder(this.app, backup.slice(0, backup.lastIndexOf("/")));
          await this.app.vault.adapter.write(backup, before);this.lastImportBackup = backup;
          let text = "";
          this.lastWriteAt = Date.now();
          await this.app.vault.process(f, current => {
            if (current !== before) throw new Error("备份后任务文件已变化，未导入，请刷新重试");
            text = JSON.stringify({ ...this.store, tasks: [...this.store.tasks, ...added] }, null, 2);
            return text;
          });
          this.diskText = text;this.store.tasks.push(...added);return;
        }
        if (this.store.tasks.length) throw new Error("任务文件已被移除，请刷新后再导入");
      }
      const text = JSON.stringify({ ...this.store, tasks: [...this.store.tasks, ...added] }, null, 2);
      this.lastWriteAt = Date.now();
      if (f instanceof TFile) await this.app.vault.modify(f, text);
      else await this.app.vault.create(p, text);
      this.diskText = text;if (added.length) this.store.tasks.push(...added);
    });
    this.writing = next;
    await next;
  }

  /** Only new, validated tasks; one write, no in-memory publication on failure. */
  async addBatch(tasks: Task[]): Promise<void> {
    if (!tasks.length) throw new Error("没有可导入的任务");
    await this.load();
    await this.persist(tasks);
    this.onChange?.();
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

  async upsert(task: Task, completeParents = false): Promise<Task> {
    task.updated = new Date().toISOString();
    const i = this.store.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) this.store.tasks[i] = task;
    else this.store.tasks.push(task);
    if (completeParents && task.status === "done" && task.parent) this.autoCompleteParent(task.parent);
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

  /** 登记 / 清除「勾选完成时记下的记录」 */
  async setDoneLog(id: string, date: string, log: DoneLog | null): Promise<void> {
    const t = this.byId(id);
    if (!t) return;
    const next = { ...(t.doneLogs || {}) };
    if (log) next[date] = log;
    else if (next[date]) delete next[date];
    else return;
    t.doneLogs = Object.keys(next).length ? next : undefined;
    t.updated = new Date().toISOString();
    await this.commit();
  }

  /** 重复任务的单日例外：跳过 / 恢复当天，不改变重复规则。 */
  async toggleSkip(id: string, date: string): Promise<boolean> {
    const t = this.byId(id);
    if (!t || t.repeat.kind === "none") return false;
    const skipped = t.skipDates.includes(date);
    t.skipDates = skipped ? t.skipDates.filter((d) => d !== date) : [...t.skipDates, date];
    t.updated = new Date().toISOString();
    await this.commit();
    return !skipped;
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

  /** 取消某天的计划：一次性任务清除排期，重复任务只跳过当天。 */
  async cancelPlanOn(id: string, date: string): Promise<"cleared" | "skipped" | null> {
    const t = this.byId(id);
    if (!t) return null;
    if (t.repeat.kind !== "none") {
      await this.toggleSkip(id, date);
      return "skipped";
    }
    if (t.date !== date) return null;
    t.date = "";
    t.start = "";
    t.updated = new Date().toISOString();
    await this.commit();
    return "cleared";
  }

  async reorder(ids: string[]): Promise<void> {
    const original = new Map(ids.map(id => [id, this.byId(id)?.order]));
    ids.forEach((id, i) => {
      const t = this.byId(id);
      if (t) t.order = i + 1;
    });
    try { await this.commit(); }
    catch (e) {
      ids.forEach((id, i) => {
        const t = this.byId(id), order = original.get(id);
        if (t && order !== undefined && t.order === i + 1) t.order = order;
      });
      throw e;
    }
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
  if (t.skipDates?.includes(date)) return false;
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
    skipDates: Array.isArray(t.skipDates) ? t.skipDates : [],
    order: typeof t.order === "number" ? t.order : b.order,
    estimate: typeof t.estimate === "number" ? t.estimate : 0,
    doneLogs: cleanDoneLogs(t.doneLogs),
  };
}

function cleanDoneLogs(v: unknown): Record<string, DoneLog> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, DoneLog> = {};
  for (const [k, x] of Object.entries(v as Record<string, Partial<DoneLog>>)) {
    if (x && typeof x.start === "string" && typeof x.title === "string") out[k] = { date: x.date || k, start: x.start, title: x.title, category: x.category || "" };
  }
  return Object.keys(out).length ? out : undefined;
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
