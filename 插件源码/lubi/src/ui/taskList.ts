// 任务行与「某天的任务清单」：每日页与任务页共用同一套渲染，保证两边显示和行为完全一致。

import { Notice } from "obsidian";
import type LubiPlugin from "../main";
import { Rec } from "../core/records";
import { Task, DoneLog } from "../core/tasks";
import { fmtDuration, hmToMin, nowHM, todayStr } from "../core/time";
import { categoryOf } from "../settings";
import { button, catDot, icon, iconButton, undoNotice } from "./components";

/** 打开「记一条」；onRec 在记录真正保存后回调（取消则不调用） */
export type OpenRecord = (defaults?: Partial<Rec>, onRec?: (rec: Rec) => void | Promise<void>) => void;

/** 某天应显示的任务：有子任务的父任务不单列（它们以分组标题出现） */
export function dayTasks(plugin: LubiPlugin, date: string): Task[] {
  return plugin.tasks.forDate(date).filter((t) => !plugin.tasks.children(t.id).length);
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
      path.title = `编辑父任务：${group.title}`;
      path.setAttribute("aria-label", `编辑父任务：${group.title}`);
    }
    else if (groups.size > 1) section.createDiv({ cls: "lubi-task-group-title lubi-muted", text: "独立任务" });
    for (const task of group.tasks) row(section, task);
  }
}

/** 某天的任务清单（分组 + 任务行）。decorate 用于任务页追加拖拽等能力。 */
export function renderDayTaskList(plugin: LubiPlugin, list: HTMLElement, date: string, rerender: () => void, openNew: OpenRecord, edit: (t: Task) => void, decorate?: (li: HTMLElement, t: Task) => void): Task[] {
  const items = dayTasks(plugin, date);
  groupedRows(plugin, list, items, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    decorate?.(li, t);
  });
  return items;
}

const sameRecord = (r: Rec, taskId: string, log: DoneLog) =>
  r.task === taskId && r.start === log.start && r.title === log.title && r.category === log.category;

/**
 * 勾选完成后：若开启「勾掉任务时顺手记一条」且这天还没有关联该任务的记录，弹出预填的记录框；
 * 保存后把这条记录登记到任务上（doneLogs），以便取消勾选时精确删掉它。
 */
async function afterDone(plugin: LubiPlugin, t: Task, date: string, openNew: OpenRecord): Promise<void> {
  if (!plugin.settings.promptLogOnComplete) return;
  const rows = await plugin.journal.read(date);
  if (rows.some((r) => r.rec.task === t.id)) return; // 已有关联记录（比如用 ▶ 记过），不重复记
  const prevEnd = plugin.lastEndOf(date, date === todayStr() ? hmToMin(nowHM()) : undefined);
  openNew(
    { title: t.title, category: t.category || undefined, task: t.id, minutes: t.estimate || 30, start: t.start || prevEnd || undefined },
    async (rec) => {
      // 记录框打开期间任务可能又被取消了：此时不登记，避免留下孤儿标记
      const latest = plugin.tasks.byId(t.id);
      if (!latest || !plugin.tasks.isDoneOn(latest, date)) return;
      await plugin.tasks.setDoneLog(t.id, date, { date: rec.date, start: rec.start, title: rec.title, category: rec.category });
    },
  );
}

/** 取消勾选后：删掉当初勾选时记下的那条记录（可撤销）；记录被改过则保留并提示 */
async function afterUndone(plugin: LubiPlugin, id: string, date: string, rerender: () => void): Promise<void> {
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

export function taskRow(plugin: LubiPlugin, ul: HTMLElement, t: Task, date: string, rerender: () => void, openNew: OpenRecord, onClick?: () => void): HTMLElement {
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
      if (nowDone) await afterDone(plugin, t, date, openNew);
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
  if (t.blocked) icon(line, "octagon-alert", "lubi-icon lubi-blocked-icon").title = "受阻";
  const parents = plugin.tasks.pathOf(t).slice(0, -1);
  const meta: string[] = [];
  if (parents.length) meta.push(parents.map((p) => p.title).join(" / "));
  if (t.start) meta.push(t.start);
  if (t.estimate) meta.push(fmtDuration(t.estimate));
  if (t.repeat.kind !== "none") meta.push("重复");
  if (meta.length) {
    const text = meta.join(" · ");
    const detail = body.createDiv({ cls: "lubi-task-meta", text });
    detail.title = text;
  }
  // ▶ 开始：以此刻为开始打开「记一条」，并关联该任务
  if (!done) {
    const acts = li.createDiv({ cls: "lubi-task-actions" });
    iconButton(acts, "play", `开始「${t.title}」：预填记一条`, () => openNew({
      title: t.title,
      category: t.category || undefined,
      task: t.id,
      start: date === todayStr() ? nowHM() : t.start || undefined,
      minutes: t.estimate || 30,
    }), "lubi-task-start");
  }
  if (onClick) li.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    onClick();
  });
  return li;
}
