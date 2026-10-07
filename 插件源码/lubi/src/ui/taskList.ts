// 任务行、「某天的任务清单」，以及任务 ↔ 时间线记录的配对规则：
//   勾选任务 = 直接在时间线生成一条记录（可撤销）；取消勾选 = 删掉那条记录；
//   在每日页新记一条时间 = 同时生成一个已完成任务；删掉这条记录 = 连同该任务一起删除。

import { Notice } from "obsidian";
import type LubiPlugin from "../main";
import { normalizeEstimatedMinutes, ParsedLine, PENDING_KEY, Rec } from "../core/records";
import { Task, DoneLog, blankTask } from "../core/tasks";
import { fmtDuration, hmToMin, minToHM, nowHM, todayStr } from "../core/time";
import { planOccurrences } from "../core/planning";
import { categoryOf } from "../settings";
import { button, catDot, icon, iconButton, tip, undoNotice } from "./components";

/** 打开「新建 · 已完成」记录框；onRec 在记录真正保存后回调（取消则不调用） */
export type OpenRecord = (defaults?: Partial<Rec>, onRec?: (rec: Rec) => void | Promise<void>) => void;

/** 当天清单：排期投影 + 原有记录任务；只有推导出跨度的父任务不单列。 */
export function dayTasks(plugin: LubiPlugin, date: string): Task[] {
  const items = new Map(plugin.tasks.forDate(date).filter(t => !plugin.tasks.children(t.id).length).map(t => [t.id, t]));
  for (const { task } of planOccurrences(plugin.tasks.all, [date])) items.set(task.id, task);
  return [...items.values()].sort((a, b) => a.order - b.order || a.created.localeCompare(b.created));
}

/** 按父任务分组渲染；只有一组且无父任务时不显示组标题 */
export function groupedRows(plugin: LubiPlugin, list: HTMLElement, items: Task[], edit: (task: Task) => void, row: (group: HTMLElement, task: Task) => void): void {
  const groups = new Map<string, { parent?: Task; title: string; tasks: Task[] }>();
  for (const task of items) {
    const parents = plugin.tasks.pathOf(task).slice(0, -1);
    const key = parents.map((p) => p.id).join("/") || "__root__";
    if (!groups.has(key)) groups.set(key, { parent: parents[parents.length - 1], title: parents.map((p) => p.title).join(" / "), tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  for (const group of groups.values()) {
    const section = list.createDiv({ cls: "lubi-task-group" });
    if (group.parent) {
      const path = button(section, group.title, () => edit(group.parent!), { cls: "lubi-task-group-title" });
      tip(path, `编辑父任务：${group.title}`);
    }
    else if (groups.size > 1) section.createDiv({ cls: "lubi-task-group-title lubi-muted", text: "独立任务" });
    for (const task of group.tasks) row(section, task);
  }
}

/** 某天的任务清单（分组 + 任务行）。decorate 用于任务页追加拖拽等能力。 */
export function renderDayTaskList(plugin: LubiPlugin, list: HTMLElement, date: string, rerender: () => void, openNew: OpenRecord, edit: (t: Task) => void, decorate?: (li: HTMLElement, t: Task) => void, sortByTime = false): Task[] {
  const items = dayTasks(plugin, date);
  if (sortByTime) {
    const time = (task: Task) => task.start ? hmToMin(task.start) : Number.MAX_SAFE_INTEGER;
    items.sort((a, b) => time(a) - time(b));
  }
  groupedRows(plugin, list, items, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    decorate?.(li, t);
  });
  return items;
}

const sameRecord = (r: Rec, taskId: string, log: DoneLog) =>
  r.task === taskId && r.start === log.start && r.title === log.title && r.category === log.category;

const logOf = (r: Rec): DoneLog => ({ date: r.date, start: r.start, title: r.title, category: r.category });

function firstTimeCategory(plugin: LubiPlugin): string {
  return plugin.settings.categories.find((c) => c.kind === "time")?.name || "日常";
}

/** 这天是否已有关联该任务的记录 */
export async function hasLinkedRecord(plugin: LubiPlugin, taskId: string, date: string): Promise<boolean> {
  return (await plugin.journal.read(date)).some((r) => r.rec.task === taskId);
}

/**
 * 按任务直接在时间线上记一条（不弹窗）：
 * 开始 = 任务的计划开始；没有计划时，今天按「此刻往前推预计时长」，其他日子接在当天最后一条记录后（没有则 09:00）。
 * 时长 = 预计时长（没填按 30 分钟）。生成后登记到任务上，并给出「撤销」。
 * 这条记录是按计划估出来的，不是实际用时：标记为「待确认」，在时间轴上虚线显示，回顾页单独提示。
 */
export async function logDone(plugin: LubiPlugin, t: Task, date: string, rerender?: () => void): Promise<Rec | null> {
  const minutes = Math.max(5, t.estimate || 30);
  let start = t.start;
  if (!start) {
    if (date === todayStr()) start = minToHM(Math.max(0, hmToMin(nowHM()) - minutes));
    else start = plugin.lastEndOf(date) || "09:00";
  }
  const category = t.category && categoryOf(plugin.settings, t.category).kind === "time" ? t.category : firstTimeCategory(plugin);
  const rec: Rec = { date, start, minutes, estimatedMinutes: normalizeEstimatedMinutes(t.estimate), category, title: t.title, task: t.id, extra: { [PENDING_KEY]: "按计划" } };
  try {
    await plugin.journal.add(rec);
  } catch (e) {
    new Notice(`「${t.title}」已完成，但没能自动记录时间：${(e as Error).message}`, 6000);
    return null;
  }
  const latest = plugin.tasks.byId(t.id);
  if (latest) {
    if (!plugin.tasks.isDoneOn(latest, date)) await plugin.tasks.toggleDone(t.id, date);
    await plugin.tasks.setDoneLog(t.id, date, logOf(rec));
  }
  undoNotice(`已按计划记下「${t.title}」${start}–${minToHM(hmToMin(start) + minutes)}（待确认）：在时间轴拖到实际时间，或点 ✓ 确认`, async () => {
    const line = await plugin.journal.findLine(date, rec);
    if (line !== null) await plugin.journal.remove(date, line);
    const cur = plugin.tasks.byId(t.id);
    if (cur) {
      await plugin.tasks.setDoneLog(t.id, date, null);
      if (plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(t.id, date);
    }
    rerender?.();
  });
  return rec;
}

/**
 * 任务变为完成后（勾选或在编辑窗口改状态）：若开启「勾掉任务时自动记一条」且这天还没有关联该任务的记录，直接生成记录。
 * 第四个参数保留给旧调用方，不再使用。
 */
export async function afterDone(plugin: LubiPlugin, t: Task, date: string, _openNew?: OpenRecord, rerender?: () => void): Promise<void> {
  if (!plugin.settings.promptLogOnComplete) return;
  if (await hasLinkedRecord(plugin, t.id, date)) return; // 已有关联记录（比如用 ▶ 记过），不重复记
  await logDone(plugin, t, date, rerender);
}

/**
 * 用一条已保存的记录完成任务（任务行 ▶ / 时间轴计划块 → 填实际时间 → 保存）：
 * 勾上任务并登记这条记录，之后取消勾选仍能精确撤掉它。已完成的任务只补登记。
 */
export async function completeFromRecord(plugin: LubiPlugin, taskId: string, date: string, rec: Rec): Promise<void> {
  const t = plugin.tasks.byId(taskId);
  if (!t) return;
  if (!plugin.tasks.isDoneOn(t, date)) await plugin.tasks.toggleDone(taskId, date);
  await plugin.tasks.setDoneLog(taskId, date, logOf(rec));
}

/** 取消勾选后：删掉当初勾选时记下的那条记录（可撤销）；记录被外部改过则保留并提示 */
export async function afterUndone(plugin: LubiPlugin, id: string, date: string, rerender: () => void): Promise<void> {
  const t = plugin.tasks.byId(id);
  const log = t?.doneLogs?.[date];
  if (!t || !log) return;
  await plugin.tasks.setDoneLog(id, date, null);
  const rows = await plugin.journal.read(log.date);
  const hit = rows.find((r) => sameRecord(r.rec, id, log));
  if (!hit) {
    new Notice("勾选时记下的那条记录已被修改或删除，时间线未作改动");
    return;
  }
  await plugin.journal.remove(log.date, hit.line);
  const removed = hit.rec;
  undoNotice(`已取消完成，并从时间线移除「${removed.title}」`, async () => {
    const cur = plugin.tasks.byId(id);
    if (!cur) { new Notice("任务已删除，无法撤销"); return; }
    await plugin.journal.add({ ...removed, extra: { ...removed.extra } });
    if (!plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(id, date);
    await plugin.tasks.setDoneLog(id, date, log);
    rerender();
  });
}

/**
 * 新增一条记录。时间类、且还没关联任务的记录会同时生成一个「已完成」任务（origin = record），
 * 让每日页补记的事项也出现在任务页。写日记失败时回滚任务，调用方的 rec 不被修改。
 */
export async function addRecordAsDone(plugin: LubiPlugin, rec: Rec): Promise<Rec> {
  const r: Rec = { ...rec, extra: { ...rec.extra } };
  // 表单已取过快照（也包括当时未填预计）；其他新增入口才在这里补取。
  if (r.task && !Object.prototype.hasOwnProperty.call(r, "estimatedMinutes")) r.estimatedMinutes = normalizeEstimatedMinutes(plugin.tasks.byId(r.task)?.estimate);
  const isTime = categoryOf(plugin.settings, r.category).kind !== "money" && r.minutes > 0;
  if (!isTime || r.task) {
    await plugin.journal.add(r);
    return r;
  }
  const task = blankTask({
    title: r.title,
    category: r.category,
    date: r.date,
    start: r.start,
    estimate: r.minutes,
    status: "done",
    doneAt: new Date().toISOString(),
    origin: "record",
    doneLogs: { [r.date]: logOf(r) },
  });
  await plugin.tasks.upsert(task);
  r.task = task.id;
  try {
    await plugin.journal.add(r);
  } catch (e) {
    await plugin.tasks.remove(task.id);
    throw e;
  }
  return r;
}

/**
 * 记录被界面修改（拖动、改时长、编辑窗口）后，保持与任务的配对：
 * 由这条记录生成的任务同步标题 / 分类 / 时间；勾选生成的记录更新登记，取消勾选时仍能精确删掉它。
 */
export async function syncLinkedTask(plugin: LubiPlugin, old: Rec, next: Rec): Promise<void> {
  const id = next.task || old.task;
  if (!id) return;
  const t = plugin.tasks.byId(id);
  if (!t) return;
  const log = t.doneLogs?.[old.date];
  const paired = !!log && sameRecord(old, id, log);
  if (t.origin === "record") {
    await plugin.tasks.upsert({
      ...t,
      title: next.title,
      category: categoryOf(plugin.settings, next.category).kind === "time" ? next.category : t.category,
      start: next.start,
      estimate: next.minutes > 0 ? next.minutes : t.estimate,
      doneLogs: paired || !log ? { ...(t.doneLogs || {}), [old.date]: logOf(next) } : t.doneLogs,
    });
  } else if (paired) {
    await plugin.tasks.setDoneLog(id, old.date, logOf(next));
  }
}

/**
 * 删除一条记录，并同步任务页：
 * - 关联的是一次性任务（不重复、没有子任务），且时间线上已没有别的记录关联它 → 任务一起删除；
 * - 重复任务 / 带子任务的项目 / 还有别的记录关联 → 不删任务，只取消当天完成（当天已没有关联记录，或删的正是勾选时生成的那条）。
 * 全部可撤销。
 */
export async function deleteRecord(plugin: LubiPlugin, date: string, row: ParsedLine, rerender: () => void): Promise<void> {
  const r = row.rec;
  await plugin.journal.remove(date, row.line);
  let removedTask: Task | null = null;
  let unchecked: { id: string; log: DoneLog | null } | null = null;
  let keptFor = "";
  const t = r.task ? plugin.tasks.byId(r.task) : undefined;
  if (t) {
    const log = t.doneLogs?.[date] ?? null;
    const project = plugin.tasks.children(t.id).length > 0;
    const others = (await plugin.journal.linkedTo(new Set([t.id]))).length;
    if (t.repeat.kind === "none" && !project && !others) {
      removedTask = JSON.parse(JSON.stringify(t)) as Task;
      await plugin.tasks.remove(t.id);
    } else {
      keptFor = t.repeat.kind !== "none" ? "重复任务" : project ? "项目" : `还有 ${others} 条记录关联`;
      const ownLog = !!log && sameRecord(r, t.id, log);
      const stillToday = await hasLinkedRecord(plugin, t.id, date);
      if (plugin.tasks.isDoneOn(t, date) && (ownLog || !stillToday)) {
        unchecked = { id: t.id, log };
        await plugin.tasks.toggleDone(t.id, date);
      }
      if (ownLog) await plugin.tasks.setDoneLog(t.id, date, null);
    }
  }
  const what = removedTask ? `，任务页里的「${removedTask.title}」也已删除`
    : unchecked ? `，「${t!.title}」是${keptFor}，已保留、只取消当天完成`
    : keptFor ? `，「${t!.title}」是${keptFor}，已保留` : "";
  undoNotice(`已删除 ${r.title}${what}`, async () => {
    if (removedTask && !plugin.tasks.byId(removedTask.id)) await plugin.tasks.upsert(removedTask);
    await plugin.journal.add({ ...r, extra: { ...r.extra } });
    if (unchecked) {
      const cur = plugin.tasks.byId(unchecked.id);
      if (cur) {
        if (!plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(unchecked.id, date);
        if (unchecked.log) await plugin.tasks.setDoneLog(unchecked.id, date, unchecked.log);
      }
    }
    rerender();
  });
  rerender();
}

export function taskRow(plugin: LubiPlugin, ul: HTMLElement, t: Task, date: string, rerender: () => void, openNew: OpenRecord, onClick?: () => void, options: { compact?: boolean; span?: string; timed?: boolean } = {}): HTMLElement {
  const done = plugin.tasks.isDoneOn(t, date);
  const li = ul.createDiv({ cls: `lubi-task ${done ? "is-done" : ""} ${t.blocked ? "is-blocked" : ""}`.trim() });
  const cb = li.createEl("input", { type: "checkbox" });
  cb.checked = done;
  cb.setAttribute("aria-label", `${done ? "取消完成" : "完成"} ${t.title}（${date}）`);
  cb.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (cb.dataset.busy) { e.preventDefault(); return; } // 连点时等上一次写盘完成
    cb.dataset.busy = "1";
    try {
      const nowDone = await plugin.tasks.toggleDone(t.id, date);
      if (nowDone) await afterDone(plugin, t, date, openNew, rerender);
      else await afterUndone(plugin, t.id, date, rerender);
    } catch (error) { new Notice(`任务更新失败：${(error as Error).message}`, 6000); }
    finally { delete cb.dataset.busy; }
    rerender();
  });
  const body = li.createDiv({ cls: "lubi-task-body" });
  const line = onClick
    ? body.createEl("button", { cls: "lubi-task-title lubi-task-title-button", attr: { type: "button", "aria-label": `编辑 ${t.title}` } })
    : body.createDiv({ cls: "lubi-task-title" });
  if (onClick) line.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  if (t.category) catDot(line, categoryOf(plugin.settings, t.category));
  line.createSpan({ cls: "lubi-task-title-text", text: t.title });
  if (t.blocked) tip(icon(line, "octagon-alert", "lubi-icon lubi-blocked-icon"), "受阻");
  if (t.origin === "record") tip(line, `由记录生成${onClick ? " · 点击编辑" : ""}：${t.title}`);
  const parents = plugin.tasks.pathOf(t).slice(0, -1);
  const meta: string[] = [];
  if (parents.length && !options.compact) meta.push(parents.map((p) => p.title).join(" / "));
  if (t.start && options.timed !== false) meta.push(options.compact && t.estimate ? `${t.start}–${minToHM(hmToMin(t.start) + t.estimate)}` : t.start);
  if (options.span) meta.push(options.span);
  if (t.estimate && !options.compact) meta.push(fmtDuration(t.estimate));
  if (t.repeat.kind !== "none" && !options.compact) meta.push("重复");
  if (meta.length) {
    const text = meta.join(" · ");
    const metadata = body.createDiv({ cls: "lubi-task-meta" });
    meta.forEach((value, index) => {
      if (index) metadata.appendChild(document.createTextNode(" · "));
      metadata.createSpan({ cls: value === t.start ? "lubi-task-meta-time" : "lubi-task-meta-item", text: value });
    });
    tip(metadata, text);
  }
  // 已完成却没有对应记录（自动记录失败、记录被删）：提示并可一键补记
  if (done && date <= todayStr() && plugin.settings.promptLogOnComplete) {
    void hasLinkedRecord(plugin, t.id, date).then((has) => {
      if (has || body.querySelector(".lubi-task-unlogged")) return;
      const fix = tip(body.createEl("button", { cls: "lubi-task-unlogged", attr: { type: "button" } }), `「${t.title}」已完成，但时间线上还没有对应的记录。点击按计划时间补记`);
      icon(fix, "clock", "lubi-icon");
      fix.createSpan({ text: "未记时间 · 补记" });
      fix.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cur = plugin.tasks.byId(t.id) || t;
        await logDone(plugin, cur, date, rerender);
        rerender();
      });
    });
  }
  // ▶ 开始：预填关联记录，保存成功后完成任务并登记实际记录；取消时不改变状态
  if (!done) {
    const acts = li.createDiv({ cls: "lubi-task-actions" });
    iconButton(acts, "play", `开始「${t.title}」：预填一条记录，保存后完成任务`, () => openNew({
      title: t.title,
      category: t.category || undefined,
      task: t.id,
      start: date === todayStr() ? nowHM() : t.start || undefined,
      minutes: t.estimate || 30,
    }, (rec) => completeFromRecord(plugin, t.id, rec.date, rec)), "lubi-task-start");
    if (t.repeat.kind !== "none") {
      iconButton(acts, "circle-off", `跳过「${t.title}」${date}（仅本次）`, async () => {
        try {
          await plugin.tasks.toggleSkip(t.id, date);
          new Notice(`已跳过「${t.title}」${date}，重复规则未改变。`, 4000);
          rerender();
        } catch (e) { new Notice(`跳过任务失败：${(e as Error).message}`, 6000); }
      }, "lubi-task-skip");
    }
  }
  if (onClick) li.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    onClick();
  });
  return li;
}
