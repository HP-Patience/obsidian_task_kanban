// 任务页：左 今日清单 + 未安排；右 七日日程（今天居中）（拖放）

import { Notice } from "obsidian";
import type LubiPlugin from "../main";
import { Task, blankTask } from "../core/tasks";
import { daysBetween, fmtDuration, hmToMin, minToHM, nowHM, shiftDate, shortDate, todayStr, weekdayZh } from "../core/time";
import { categoryOf } from "../settings";
import { button, catDot, el, emptyState, HOUR_PX, hoverTip, infoTip, iconButton, segmented, stopAll, tip, undoNotice } from "./components";
import { TaskModal, RecordModal, openUnifiedRecord } from "./modals";
import { dayTasks, groupedRows, OpenRecord, renderDayTaskList, taskRow } from "./taskList";
import { startDrag } from "./drag";
import { Rec } from "../core/records";
import { explicitSpan, GanttPeriod, ganttWindow, stepGanttDate } from "../core/gantt";
import { renderGantt } from "./gantt";
import { renderDailyGantt } from "./dailyGantt";

const SNAP = 15;
let weekDayLabelId = 0;

export interface TasksState {
  weekAnchor: string;
  selectedDate: string;
  agendaDate: string;
  agendaSpan: 1 | 3;
  scheduleView?: "week" | "gantt";
  ganttPeriod?: GanttPeriod;
  ganttCollapsed?: Set<string>;
}

type ScheduleFields = Pick<Task, "date" | "start" | "estimate" | "startDate" | "endDate">;

async function writeSchedule(plugin: LubiPlugin, task: Task, patch: Partial<ScheduleFields>): Promise<void> {
  const attempted = { ...task, ...patch };
  const saving = plugin.tasks.upsert(attempted);
  const writtenStamp = attempted.updated;
  try { await saving; }
  catch (error) {
    const latest = plugin.tasks.byId(task.id);
    if (latest === attempted) {
      for (const key of Object.keys(patch) as (keyof ScheduleFields)[]) if (latest[key] === patch[key]) Object.assign(latest, { [key]: task[key] });
      if (latest.updated === writtenStamp) latest.updated = task.updated;
    }
    throw error;
  }
}

/** 只恢复本次实际改动且仍保持本次值的字段，绝不覆盖撤销期间对任务的其他修改。 */
export async function updateScheduleWithUndo(plugin: LubiPlugin, id: string, patch: Partial<ScheduleFields>, message: string, rerender: () => void): Promise<void> {
  const task = plugin.tasks.byId(id);
  if (!task) { new Notice("任务已不存在，无法调整"); return; }
  const keys = Object.keys(patch) as (keyof ScheduleFields)[];
  const original: ScheduleFields = { date: task.date, start: task.start, estimate: task.estimate, startDate: task.startDate, endDate: task.endDate };
  const changed = keys.filter((key) => original[key] !== patch[key]);
  if (!changed.length) { rerender(); return; }
  const written: ScheduleFields = { ...original, ...patch };
  try {
    await writeSchedule(plugin, task, patch);
    undoNotice(message, async () => {
      const latest = plugin.tasks.byId(id);
      if (!latest) { new Notice("任务已删除，无法撤销"); return; }
      const restored: Partial<ScheduleFields> = {};
      let conflicts = 0;
      for (const key of changed) {
        if (latest[key] === written[key]) Object.assign(restored, { [key]: original[key] });
        else conflicts++;
      }
      if (!Object.keys(restored).length) { new Notice("任务的排期已再次修改，未覆盖新修改"); return; }
      const candidate = { ...latest, ...restored };
      if (["date", "startDate", "endDate"].some(key => Object.prototype.hasOwnProperty.call(restored, key)) && (candidate.startDate || candidate.endDate)) {
        const span = explicitSpan(candidate);
        if (!span || (candidate.date && (candidate.date < span.from || candidate.date > span.to))) {
          new Notice("排期已再次修改，未撤销以免造成日期冲突"); return;
        }
      }
      try {
        await writeSchedule(plugin, latest, restored);
        if (conflicts) new Notice("已撤销未再次修改的排期字段；其他修改已保留");
        rerender();
      } catch (e) { new Notice(`撤销失败：${(e as Error).message}`, 6000); }
    });
    rerender();
  } catch (e) { new Notice(`调整失败：${(e as Error).message}`, 6000); rerender(); }
}

export function renderTasks(plugin: LubiPlugin, host: HTMLElement, date: string, state: TasksState, rerender: () => void): void {
  host.empty();
  host.addClass("lubi-tasks");
  host.toggleClass("is-gantt", state.scheduleView === "gantt");
  const openNew: OpenRecord = (d, onRec) => openUnifiedRecord(plugin, date, d, async (rec) => { if (rec && onRec) await onRec(rec); rerender(); });
  const edit = (t: Task) => new TaskModal(plugin.app, plugin, { task: t, recordDate: date, onSaved: rerender }).open();
  const create = (defaults: Partial<Task> = {}) => new TaskModal(plugin.app, plugin, { defaults, onSaved: rerender }).open();

  const top = host.createDiv({ cls: "lubi-tasks-top" });
  const lists = top.createDiv({ cls: "lubi-tasks-left lubi-card lubi-task-lists" });
  renderLists(plugin, lists, date, rerender, openNew, edit, create);
  // DOM 顺序即键盘顺序：选中日任务 → 窄屏议程 → 未安排；宽屏隐藏议程，保留右侧周日程。
  const agendaHost = lists.createDiv({ cls: "lubi-agenda-host" });
  renderAgenda(plugin, agendaHost, state, rerender, edit);
  const inbox = lists.querySelectorAll(".lubi-list-card")[1];
  if (inbox) lists.insertBefore(agendaHost, inbox);
  renderWeek(plugin, top.createDiv({ cls: "lubi-tasks-week" }), date, state, rerender, edit);
}

// ---------- 左栏 ----------

function renderLists(plugin: LubiPlugin, host: HTMLElement, date: string, rerender: () => void, openNew: OpenRecord, edit: (t: Task) => void, create: (d?: Partial<Task>) => void): void {
  const today = dayTasks(plugin, date);
  const card = host.createDiv({ cls: "lubi-section lubi-list-card" });
  // 整张当天清单都可接收任务，包括空列表、标题和快速输入区域。
  bindDrop(plugin, card, date, null, rerender);
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", date === todayStr() ? "今天" : `${shortDate(date)} 周${weekdayZh(date)}`);
  const done = today.filter((t) => plugin.tasks.isDoneOn(t, date)).length;
  head.createSpan({ cls: "lubi-muted", text: today.length ? `${done}/${today.length}` : "" });

  const list = card.createDiv({ cls: "lubi-task-list" });
  if (!today.length) list.createDiv({ cls: "lubi-muted lubi-pad", text: "暂无安排" });
  renderDayTaskList(plugin, list, date, rerender, openNew, edit, (li, t) => {
    makeDraggable(li, t);
    bindTaskSort(plugin, li, t, list, rerender);
  });
  // 快速输入：键盘按回车，触屏有明确的添加按钮。
  const quick = card.createDiv({ cls: "lubi-quick-add" });
  const input = quick.createEl("input", { type: "text", attr: { placeholder: "添加当天任务", "aria-label": `添加 ${date} 的待办`, "data-lubi-focus": "quick-add" } });
  let saving = false;
  const add = async () => {
    const title = input.value.trim();
    if (!title || saving) { input.focus(); return; }
    saving = true;
    try {
      const firstCat = plugin.settings.categories.find((c) => c.kind === "time")?.name || "";
      await plugin.tasks.upsert(blankTask({ title, date, category: firstCat }));
      input.value = "";
      rerender();
    } catch (e) { new Notice(`添加失败：${(e as Error).message}`, 6000); }
    finally { saving = false; }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    void add();
  });
  button(quick, "添加", () => void add(), { cls: "lubi-btn-sm" });

  // 未安排
  const inbox = plugin.tasks.inbox();
  const ib = host.createDiv({ cls: "lubi-section lubi-list-card" });
  const ih = ib.createDiv({ cls: "lubi-panel-head" });
  el(ih, "h3", "lubi-panel-title", "未安排");
  ih.createSpan({ cls: "lubi-muted", text: inbox.length ? String(inbox.length) : "" });
  iconButton(ih, "plus", "新建未安排任务", () => create(), "lubi-push-right");
  const il = ib.createDiv({ cls: "lubi-task-list" });
  if (!inbox.length) il.createDiv({ cls: "lubi-muted lubi-pad", text: "暂无未安排任务" });
  groupedRows(plugin, il, inbox, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    makeDraggable(li, t);
    bindTaskSort(plugin, li, t, il, rerender);
    const act = li.querySelector<HTMLElement>(".lubi-task-actions") ?? li.createDiv({ cls: "lubi-task-actions" });
    iconButton(act, "calendar-plus", `安排 ${t.title} 到 ${date}（可撤销）`, () => void updateScheduleWithUndo(plugin, t.id, { date, start: "" }, `${t.title} → ${date}`, rerender));
    iconButton(act, "calendar-days", `为 ${t.title} 选择日期和时间`, () => new TaskModal(plugin.app, plugin, { task: t, focusDate: true, onSaved: rerender }).open());
  });
}

/** 对同一项目的叶子任务保留可见父级路径；父级名称可直接打开编辑。 */
function makeDraggable(elm: HTMLElement, t: Task): void {
  elm.dataset.taskId = t.id;
  elm.draggable = true;
  elm.addClass("is-draggable");
  elm.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/lubi-task", t.id);
    e.dataTransfer?.setData("text/plain", t.title);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    elm.addClass("is-dragging");
  });
  elm.addEventListener("dragend", () => elm.removeClass("is-dragging"));
}

/** 清单内排序独立于排期；不同项目不混排，保留可见父级分组。 */
function bindTaskSort(plugin: LubiPlugin, row: HTMLElement, task: Task, list: HTMLElement, rerender: () => void): void {
  const rows = () => Array.from(row.parentElement!.querySelectorAll<HTMLElement>(".lubi-task[data-task-id]"));
  const clear = () => list.querySelectorAll(".is-sort-before, .is-sort-after").forEach(el => el.removeClass("is-sort-before", "is-sort-after"));
  const source = (e: DragEvent) => {
    const id = e.dataTransfer?.getData("text/lubi-task") || list.querySelector<HTMLElement>(".is-dragging")?.dataset.taskId;
    return rows().find(el => el.dataset.taskId === id);
  };
  const move = async (id: string, after: boolean) => {
    const ids = rows().map(el => el.dataset.taskId!);
    if (!ids.includes(id) || id === task.id) return;
    const next = ids.filter(value => value !== id);
    next.splice(next.indexOf(task.id) + (after ? 1 : 0), 0, id);
    if (next.every((value, i) => value === ids[i])) return;
    try { await plugin.tasks.reorder(next); rerender(); }
    catch (e) { new Notice(`排序失败：${(e as Error).message}`, 6000); rerender(); }
  };
  row.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("text/lubi-task") || !source(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    clear();
    if (source(e) === row) return;
    const rect = row.getBoundingClientRect();
    row.addClass(e.clientY < rect.top + rect.height / 2 ? "is-sort-before" : "is-sort-after");
  });
  row.addEventListener("dragleave", (e) => {
    if (e.relatedTarget instanceof Node && row.contains(e.relatedTarget)) return;
    clear();
  });
  row.addEventListener("dragend", clear);
  row.addEventListener("drop", (e) => {
    const from = source(e);
    clear();
    if (!from) {
      const id = e.dataTransfer?.getData("text/lubi-task");
      if (Array.from(list.querySelectorAll<HTMLElement>("[data-task-id]")).some(el => el.dataset.taskId === id)) {
        e.preventDefault(); e.stopPropagation();
        new Notice("请在同一项目分组内排序；排序不会改变任务所属项目");
      }
      return; // 从未安排拖入当天仍由卡片的排期处理器负责。
    }
    e.preventDefault(); e.stopPropagation();
    list.closest(".lubi-list-card")?.removeClass("is-drop");
    const rect = row.getBoundingClientRect();
    void move(from.dataset.taskId!, e.clientY >= rect.top + rect.height / 2);
  });
  row.tabIndex = 0;
  row.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown");
  row.addEventListener("keydown", (e) => {
    if (e.target !== row || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    const all = rows(), index = all.indexOf(row), neighbor = all[index + (e.key === "ArrowUp" ? -1 : 1)];
    if (!neighbor) return;
    e.preventDefault(); e.stopPropagation();
    const ids = all.map(el => el.dataset.taskId!);
    [ids[index], ids[all.indexOf(neighbor)]] = [ids[all.indexOf(neighbor)], ids[index]];
    const root = list.closest(".lubi-root");
    void plugin.tasks.reorder(ids).then(() => {
      rerender();
      // 刷新有 150ms 防抖；仅在旧行仍存在时恢复相同任务的焦点。
      window.setTimeout(() => {
        if (!row.isConnected) Array.from(root?.querySelectorAll<HTMLElement>("[data-task-id]") || []).find(el => el.dataset.taskId === task.id)?.focus();
      }, 180);
    }).catch(e => { new Notice(`排序失败：${(e as Error).message}`, 6000); rerender(); });
  });
}

function scheduleSwitch(host: HTMLElement, state: TasksState, rerender: () => void): void {
  const control = segmented<"week" | "gantt">(host, [{ id: "week", label: "周日程" }, { id: "gantt", label: "甘特图" }], state.scheduleView || "week", mode => {
    state.scheduleView = mode;
    state.weekAnchor = state.selectedDate;
    rerender();
  });
  control.addClass("lubi-schedule-switch");
  control.querySelectorAll<HTMLElement>("button").forEach((b, i) => b.dataset.lubiFocus = `schedule:${i === 0 ? "week" : "gantt"}`);
}

// ---------- 窄面板：可切换的单日 / 三日议程，日期、完成与编辑都不依赖拖动 ----------

function renderAgenda(plugin: LubiPlugin, host: HTMLElement, state: TasksState, rerender: () => void, edit: (task: Task) => void): void {
  const card = host.createDiv({ cls: "lubi-section lubi-agenda-card" });
  const span = state.agendaSpan;
  const first = state.agendaDate || state.selectedDate;
  const dates = Array.from({ length: span }, (_, i) => shiftDate(first, i));
  const head = card.createDiv({ cls: "lubi-panel-head lubi-agenda-head" });
  el(head, "h3", "lubi-panel-title", "日程");
  scheduleSwitch(head, state, rerender);
  head.createSpan({ cls: "lubi-muted", text: dates.length === 1 ? first : `${shortDate(first)} – ${shortDate(dates[dates.length - 1])}` });
  const navigate = (target: string) => {
    state.agendaDate = target;
    state.selectedDate = target;
    state.weekAnchor = recenterWeek(state.weekAnchor, target);
    rerender();
  };
  const nav = head.createDiv({ cls: "lubi-nav lubi-push-right" });
  iconButton(nav, "chevron-left", `向前 ${span} 天`, () => navigate(shiftDate(first, -span)));
  button(nav, "今天", () => navigate(todayStr()), { cls: "lubi-btn-sm" });
  iconButton(nav, "chevron-right", `向后 ${span} 天`, () => navigate(shiftDate(first, span)));
  segmented<"one" | "three">(card, [{ id: "one", label: "单日" }, { id: "three", label: "三日" }], span === 1 ? "one" : "three", (value) => {
    state.agendaSpan = value === "one" ? 1 : 3;
    state.agendaDate = state.selectedDate;
    rerender();
  }).addClass("lubi-agenda-range");
  for (const d of dates) {
    const section = card.createDiv({ cls: "lubi-agenda-day" });
    const day = section.createEl("button", { cls: `lubi-agenda-day-title ${d === state.selectedDate ? "is-selected" : ""}`, text: `${d === todayStr() ? "今天 · " : ""}${shortDate(d)} 周${weekdayZh(d)}`, attr: { type: "button", "aria-current": d === state.selectedDate ? "date" : "false" } });
    day.addEventListener("click", () => navigate(d));
    const list = section.createDiv({ cls: "lubi-task-list" });
    const tasks = plugin.tasks.forDate(d).filter((t) => !plugin.tasks.children(t.id).length);
    if (!tasks.length) list.createDiv({ cls: "lubi-muted lubi-pad-sm", text: "没有安排" });
    else for (const task of tasks) {
      taskRow(plugin, list, task, d, rerender, (defaults, onRec) => openUnifiedRecord(plugin, d, defaults, async (rec) => { if (rec && onRec) await onRec(rec); rerender(); }), () => edit(task));
    }
    button(section, `在 ${shortDate(d)} 新建任务`, () => new TaskModal(plugin.app, plugin, { defaults: { date: d }, onSaved: rerender }).open(), { cls: "lubi-btn-ghost lubi-btn-sm lubi-agenda-add" });
  }
}

// ---------- 七日周日程（宽面板保留拖动） ----------

/** 周日程窗口：以锚点日为中心的连续 7 天（前 3 天 · 锚点 · 后 3 天），默认锚点是今天，今天就在正中 */
export function weekWindow(anchor: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(anchor, i - 3));
}

/** 选中日期仍在当前 7 天窗口里就不挪窗口（点表头不会让整张表跳动），跳出窗口才以它为新中心 */
export function recenterWeek(anchor: string, d: string): string {
  return Math.abs(daysBetween(anchor, d)) <= 3 ? anchor : d;
}

function renderWeek(plugin: LubiPlugin, host: HTMLElement, date: string, state: TasksState, rerender: () => void, edit: (t: Task) => void): void {
  const s = plugin.settings;
  const startH = Math.max(0, Math.min(23, s.scheduleStartHour));
  const endH = Math.max(startH + 1, Math.min(24, s.scheduleEndHour));
  const isGantt = state.scheduleView === "gantt";
  const period = state.ganttPeriod || "day";
  const isDaily = isGantt && period === "day";
  const days = isGantt ? ganttWindow(state.selectedDate, period) : weekWindow(state.weekAnchor);

  const card = host.createDiv({ cls: `lubi-card ${isGantt ? "lubi-gantt-card" : "lubi-week-card"}` });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  scheduleSwitch(head, state, rerender);
  if (isGantt) {
    const periods = segmented<GanttPeriod>(head, [{ id: "day", label: "日" }, { id: "week", label: "周" }, { id: "month", label: "月" }], period, value => { state.ganttPeriod = value; rerender(); });
    periods.addClass("lubi-gantt-period-switch");
    periods.querySelectorAll<HTMLElement>("button").forEach((button, i) => button.dataset.lubiFocus = `gantt-period:${["day", "week", "month"][i]}`);
  }
  head.createSpan({ cls: "lubi-muted lubi-schedule-range", text: isDaily ? `${days[0]}${days[0] === todayStr() ? " · 今天" : ""}` : `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}` });
  const nav = head.createDiv({ cls: "lubi-nav lubi-push-right" });
  const shift = (direction: number) => {
    const next = isGantt ? stepGanttDate(state.selectedDate, period, direction) : shiftDate(state.selectedDate, direction * 7);
    state.weekAnchor = isGantt ? next : shiftDate(state.weekAnchor, direction * 7);
    state.selectedDate = next; state.agendaDate = next; rerender();
  };
  const unit = isGantt ? (period === "day" ? "天" : period === "week" ? "周" : "月") : "7 天";
  iconButton(nav, "chevron-left", `向前 ${unit}`, () => shift(-1));
  const wk = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm", text: "今天" });
  wk.addEventListener("click", () => { state.weekAnchor = todayStr(); state.selectedDate = todayStr(); state.agendaDate = state.selectedDate; rerender(); });
  iconButton(nav, "chevron-right", `向后 ${unit}`, () => shift(1));

  if (isDaily) {
    card.addClass("lubi-daily-gantt-card");
    renderDailyGantt(plugin, card, state.selectedDate, rerender, edit, (id, patch, message) => updateScheduleWithUndo(plugin, id, patch, message, rerender));
    return;
  }
  if (isGantt) {
    renderGantt(plugin, card, days, state.ganttCollapsed ||= new Set(), rerender, edit,
      (id, patch, message) => updateScheduleWithUndo(plugin, id, patch, message, rerender));
    return;
  }

  const grid = card.createDiv({ cls: "lubi-week" });
  // 表头 + 全天条
  const corner = grid.createDiv({ cls: "lubi-week-corner" });
  corner.setText("");
  const heads: HTMLElement[] = [];
  for (const d of days) {
    const h = grid.createDiv({ cls: `lubi-week-day ${d === todayStr() ? "is-today" : ""} ${d === date ? "is-selected" : ""}`.trim() });
    heads.push(h);
    const dayButton = h.createEl("button", { cls: "lubi-week-day-button", attr: { type: "button", "aria-current": d === date ? "date" : "false" } });
    const dayLabel = dayButton.createSpan({ cls: "lubi-sr-only", text: `查看 ${d} 周${weekdayZh(d)} 的任务`, attr: { id: `lubi-week-day-label-${++weekDayLabelId}` } });
    dayButton.setAttribute("aria-labelledby", dayLabel.id);
    dayButton.createSpan({ cls: "lubi-week-dow", text: `周${weekdayZh(d)}` });
    dayButton.createSpan({ cls: "lubi-week-date", text: String(Number(d.slice(8, 10))) });
    dayButton.addEventListener("click", () => plugin.openDate(d, "tasks"));
    renderLoad(plugin, h, d);
    const allDay = plugin.tasks.forDate(d).filter((t) => !t.start && !plugin.tasks.children(t.id).length);
    // 没有全天任务就不占表头高度；表头本身仍是全天任务的拖放区
    const strip = allDay.length ? h.createDiv({ cls: "lubi-allday" }) : null;
    if (strip) for (const t of allDay) {
      const doneChip = plugin.tasks.isDoneOn(t, d);
      const chip = strip.createEl("button", { cls: `lubi-allday-chip ${doneChip ? "is-done" : ""}`, attr: { type: "button" } });
      const summary = [
        `${shortDate(d)} · 全天（未设置开始时间）`,
        `预计用时：${t.estimate > 0 ? fmtDuration(t.estimate) : "未设置"}`,
        doneChip ? "已完成" : "待完成",
      ];
      // aria-labelledby 为读屏提供摘要，不使用会触发 Obsidian 黑色提示的 aria-label。
      const description = chip.createSpan({ cls: "lubi-sr-only", text: `${t.title}。${summary.join("。")}`, attr: { id: `lubi-allday-${d}-${t.id}` } });
      chip.setAttribute("aria-labelledby", description.id);
      hoverTip(chip, ".lubi-allday-chip", () => {
        const title = createDiv({ cls: "lubi-task-tip-title", text: t.title });
        const rows: (string | HTMLElement)[] = [title, ...summary];
        if (t.notes.trim()) rows.push(createDiv({ cls: "lubi-task-tip-notes", text: t.notes }));
        return rows;
      }, "side");
      chip.style.setProperty("--chip", categoryOf(s, t.category).color);
      if (doneChip) chip.createSpan({ cls: "lubi-allday-check", text: "✓ ", attr: { "aria-hidden": "true" } });
      chip.createSpan({ text: t.title });
      chip.addEventListener("click", (e) => {
        stopAll(e);
        edit(t);
      });
      makeDraggable(chip, t);
    }
    bindDrop(plugin, h, d, null, rerender);
  }
  // 时间轴 + 7 列
  const body = grid.createDiv({ cls: "lubi-week-body" });
  // 表身有纵向滚动条、表头没有：把滚动条宽度补成表头最右侧的一条空轨道，列线才能上下对齐
  const syncGutter = () => grid.style.setProperty("--lubi-week-sbw", `${Math.max(0, body.offsetWidth - body.clientWidth)}px`);
  window.requestAnimationFrame(syncGutter);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(syncGutter).observe(body);
  const hours = body.createDiv({ cls: "lubi-week-hours" });
  hours.style.height = `${(endH - startH) * HOUR_PX}px`;
  for (let h = startH; h < endH; h++) {
    const l = hours.createDiv({ cls: "lubi-week-hour" });
    l.style.top = `${(h - startH) * HOUR_PX}px`;
    l.setText(`${String(h).padStart(2, "0")}:00`);
  }
  const endLabel = hours.createDiv({ cls: "lubi-week-hour is-day-end" });
  endLabel.style.top = `${(endH - startH) * HOUR_PX}px`;
  endLabel.setText(`${String(endH).padStart(2, "0")}:00`);
  // 悬停十字指示：横向虚线贯穿整周（当前列加深）+ 当前列与表头高亮 + 左侧刻度栏时间标签；拖动时跟随
  const hoverLabel = hours.createDiv({ cls: "lubi-week-hover-label", attr: { "aria-hidden": "true" } });
  const hovers: HTMLElement[] = [];
  let dragging = false;
  const yOf = (m: number) => ((m - startH * 60) / 60) * HOUR_PX;
  const showHover = (col: number, m: number, top = yOf(m)) => {
    hovers.forEach((h, i) => {
      h.addClass("is-on");
      h.toggleClass("is-current", i === col);
      h.style.top = `${top}px`;
    });
    cols.forEach((c, i) => c.toggleClass("is-hover", i === col));
    heads.forEach((h, i) => h.toggleClass("is-hover", i === col));
    hoverLabel.style.top = `${top}px`;
    hoverLabel.setText(minToHM(m));
    hoverLabel.addClass("is-on");
  };
  const hideHover = () => {
    hovers.forEach((h) => h.removeClass("is-on", "is-current"));
    cols.forEach((c) => c.removeClass("is-hover"));
    heads.forEach((h) => h.removeClass("is-hover"));
    hoverLabel.removeClass("is-on");
  };
  const cols: HTMLElement[] = [];
  days.forEach((d, dayIdx) => {
    const col = body.createDiv({ cls: `lubi-week-col ${d === todayStr() ? "is-today" : ""}` });
    cols.push(col);
    col.style.height = `${(endH - startH) * HOUR_PX}px`;
    const colHover = col.createDiv({ cls: "lubi-tl-hover lubi-week-hover", attr: { "aria-hidden": "true" } });
    hovers.push(colHover);
    // 拖入任务的落点仍按原有时间网格吸附；普通悬停不做网格取整。
    const minuteAtY = (clientY: number, round = false) => {
      const rect = col.getBoundingClientRect();
      const raw = ((clientY - rect.top) / HOUR_PX) * 60;
      const m = startH * 60 + (round ? snap(raw) : Math.floor(raw / SNAP) * SNAP);
      return Math.max(startH * 60, Math.min(endH * 60 - SNAP, m));
    };
    col.addEventListener("pointermove", (e) => {
      if (dragging || (e.target as HTMLElement).closest(".lubi-wblock")) {
        if (!dragging) hideHover();
        return;
      }
      const rect = col.getBoundingClientRect();
      const height = (endH - startH) * HOUR_PX;
      // Pointer coordinates are viewport pixels; the guide is positioned in local CSS pixels.
      const top = Math.max(0, Math.min(height, (e.clientY - rect.top) * height / (rect.height || height)));
      const minute = Math.min(endH * 60 - 1, startH * 60 + top / HOUR_PX * 60);
      showHover(dayIdx, minute, top);
    });
    col.addEventListener("pointerleave", () => { if (!dragging) hideHover(); });
    // 从左侧清单拖任务进来时，同样提示落点时间
    col.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes("text/lubi-task")) return;
      showHover(dayIdx, minuteAtY(e.clientY, true));
    });
    col.addEventListener("dragleave", (e) => { if (!col.contains(e.relatedTarget as Node | null)) hideHover(); });
    col.addEventListener("drop", () => hideHover());
    for (let h = startH; h < endH; h++) {
      const line = col.createDiv({ cls: "lubi-week-line" });
      line.style.top = `${(h - startH) * HOUR_PX}px`;
      const half = col.createDiv({ cls: "lubi-week-line is-half" });
      half.style.top = `${(h - startH + 0.5) * HOUR_PX}px`;
    }
    const endLine = col.createDiv({ cls: "lubi-week-line is-day-end" });
    endLine.style.top = `${(endH - startH) * HOUR_PX}px`;
    if (d === todayStr()) {
      const now = col.createDiv({ cls: "lubi-now" });
      now.style.top = `${((hmToMin(nowHM()) - startH * 60) / 60) * HOUR_PX}px`;
    }
    const items = plugin.tasks.forDate(d).filter((t) => t.start && !plugin.tasks.children(t.id).length);
    for (const t of items) {
      const startMin = hmToMin(t.start);
      const dur = Math.max(t.estimate || 30, SNAP);
      const block = col.createDiv({ cls: `lubi-wblock ${plugin.tasks.isDoneOn(t, d) ? "is-done" : ""} ${t.blocked ? "is-blocked" : ""}`.trim() });
      const place = (s: number, m: number) => {
        block.style.top = `${((s - startH * 60) / 60) * HOUR_PX}px`;
        block.style.height = `${Math.max((m / 60) * HOUR_PX - 2, 18)}px`;
      };
      place(startMin, dur);
      block.style.setProperty("--chip", categoryOf(s, t.category).color);
      block.createDiv({ cls: "lubi-wblock-title", text: t.title });
      const timeEl = block.createDiv({ cls: "lubi-wblock-time", text: `${t.start}–${minToHM(startMin + dur)}${t.estimate ? "" : " · 未填预计"}` });
      const handleTop = block.createDiv({ cls: "lubi-block-handle is-top" });
      const handle = block.createDiv({ cls: "lubi-block-handle is-bottom" });
      block.setAttribute("tabindex", "0");
      block.setAttribute("role", "button");
      infoTip(block, t.title, [`${shortDate(d)} · ${t.start}–${minToHM(startMin + dur)}`, `预计用时：${t.estimate ? fmtDuration(t.estimate) : "未设置（显示按 30 分钟）"}`, plugin.tasks.isDoneOn(t, d) ? "已完成" : "待完成"], t.notes);
      block.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(t); }
      });
      const pxPerMin = HOUR_PX / 60;
      const bindDrag = (target: HTMLElement, mode: "move" | "resize-start" | "resize-end") => {
        target.addEventListener("pointerdown", (e) => {
          if (mode !== "move") e.stopPropagation();
          const colWidth = col.getBoundingClientRect().width || 1;
          startDrag(e, {
            mode,
            start: startMin,
            minutes: dur,
            pxPerMin,
            min: startH * 60,
            max: endH * 60,
            minMinutes: SNAP,
            snap: SNAP,
            horizontal: mode === "move" ? { colWidth, minCol: -dayIdx, maxCol: 6 - dayIdx } : undefined,
            onStart: () => {
              dragging = true;
              block.addClass("is-dragging", mode === "move" ? "is-moving" : "is-resizing");
            },
            onMove: (st) => {
              place(st.start, st.minutes);
              block.style.transform = st.col ? `translateX(calc(${st.col * 100}% + ${st.col * 1}px))` : "";
              timeEl.setText(`${minToHM(st.start)}–${minToHM(st.start + st.minutes)}`);
              cols.forEach((c, i) => c.toggleClass("is-drop", i === dayIdx + st.col && st.col !== 0));
              showHover(dayIdx + (st.col || 0), mode === "resize-end" ? st.start + st.minutes : st.start);
            },
            onEnd: (st) => {
              dragging = false;
              hideHover();
              block.removeClass("is-dragging", "is-moving", "is-resizing");
              block.style.transform = "";
              cols.forEach((c) => c.removeClass("is-drop"));
              if (st === null) {
                place(startMin, dur);
                timeEl.setText(`${t.start}–${minToHM(startMin + dur)}`);
                return;
              }
              if (!st.moved) {
                if (mode === "move") edit(t);
                return;
              }
              void (async () => {
                const cur = plugin.tasks.byId(t.id);
                if (!cur) return;
                if (mode === "move") {
                  const nd = days[dayIdx + st.col];
                  if (cur.repeat.kind !== "none" && nd !== d) {
                    new Notice("重复任务不能用拖动换天；请在编辑中调整重复规则"); rerender(); return;
                  }
                  const patch = cur.repeat.kind === "none" ? { date: nd, start: minToHM(st.start) } : { start: minToHM(st.start) };
                  await updateScheduleWithUndo(plugin, t.id, patch, `${t.title} → ${nd} ${minToHM(st.start)}`, rerender);
                } else if (mode === "resize-start") {
                  await updateScheduleWithUndo(plugin, t.id, { start: minToHM(st.start), estimate: st.minutes }, `${t.title} → ${minToHM(st.start)}–${minToHM(st.start + st.minutes)}`, rerender);
                } else {
                  await updateScheduleWithUndo(plugin, t.id, { estimate: st.minutes }, `${t.title} 预计 ${fmtDuration(st.minutes)}`, rerender);
                }
              })();
            },
          });
        });
      };
      bindDrag(block, "move");
      bindDrag(handleTop, "resize-start");
      bindDrag(handle, "resize-end");
    }
    // 空白处：按下拖出一段时间 → 松手新建任务，日期 / 开始时间 / 预计时长已填好（与每日页时间轴拖出新记录一致）
    const ghost = col.createDiv({ cls: "lubi-wghost", attr: { "aria-hidden": "true" } });
    const colPxPerMin = HOUR_PX / 60;
    col.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".lubi-wblock")) return;
      const rect = col.getBoundingClientRect();
      const raw = startH * 60 + Math.floor((e.clientY - rect.top) / colPxPerMin / SNAP) * SNAP;
      const at = Math.max(startH * 60, Math.min(endH * 60 - SNAP, raw));
      startDrag(e, {
        mode: "create",
        start: at,
        minutes: 0,
        pxPerMin: colPxPerMin,
        min: startH * 60,
        max: endH * 60,
        minMinutes: SNAP,
        snap: SNAP,
        onStart: () => {
          dragging = true;
          ghost.addClass("is-on");
        },
        onMove: (st) => {
          ghost.style.top = `${((st.start - startH * 60) / 60) * HOUR_PX}px`;
          ghost.style.height = `${Math.max((st.minutes / 60) * HOUR_PX - 2, 16)}px`;
          ghost.setText(`${minToHM(st.start)}–${minToHM(st.start + st.minutes)} · ${fmtDuration(st.minutes)}`);
          showHover(dayIdx, st.start + st.minutes);
        },
        onEnd: (st) => {
          dragging = false;
          hideHover();
          ghost.removeClass("is-on");
          if (!st || !st.moved) return;
          new TaskModal(plugin.app, plugin, { defaults: { date: d, start: minToHM(st.start), estimate: st.minutes }, onSaved: rerender }).open();
        },
      });
    });
    col.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".lubi-wblock")) return;
      const rect = col.getBoundingClientRect();
      const min = startH * 60 + snap(((e.clientY - rect.top) / HOUR_PX) * 60);
      new TaskModal(plugin.app, plugin, { defaults: { date: d, start: minToHM(min), estimate: 60 }, onSaved: rerender }).open();
    });
    bindDrop(plugin, col, d, startH, rerender);
  });
  // 首屏：窗口含今天 = 现在 − 1h；否则 = 最早的定时任务（没有则从头）
  const scrollEl = card.querySelector(".lubi-week-body") as HTMLElement | null;
  const earliest = Math.min(...days.flatMap((d) => plugin.tasks.forDate(d).filter((t) => t.start).map((t) => hmToMin(t.start))), Infinity);
  const targetMin = days.includes(todayStr()) ? hmToMin(nowHM()) - 60 : Number.isFinite(earliest) ? earliest - 30 : startH * 60;
  const targetPx = Math.max(0, Math.round(((targetMin - startH * 60) / 60) * HOUR_PX));
  if (scrollEl) scrollEl.dataset.scrollTarget = String(targetPx);
  window.requestAnimationFrame(() => {
    if (scrollEl && !scrollEl.dataset.restored) scrollEl.scrollTop = targetPx;
  });
}

/** 每日负载条：计划（未完成任务的预计时长）/ 可用小时（设置），≥90% 橙、>100% 红（借鉴 Sunsama 的超载提醒） */
function renderLoad(plugin: LubiPlugin, host: HTMLElement, d: string): void {
  const capacity = Math.max(1, plugin.settings.dailyCapacityHours || 8) * 60;
  const planned = plugin.tasks.forDate(d)
    .filter((t) => !plugin.tasks.children(t.id).length && !plugin.tasks.isDoneOn(t, d))
    .reduce((sum, t) => sum + (t.estimate || 0), 0);
  // 没排计划的日子不画空负载条，免得整行都是灰条和“—”
  if (!planned) return;
  const ratio = planned / capacity;
  const level = ratio > 1 ? "is-over" : ratio >= 0.9 ? "is-high" : "is-ok";
  const load = host.createDiv({ cls: `lubi-load ${level}`, attr: {
    role: "meter", "aria-valuemin": "0", "aria-valuemax": String(capacity), "aria-valuenow": String(Math.min(planned, capacity * 2)),
  } });
  infoTip(load, `${shortDate(d)} · 当天负载`, [`已安排：${fmtDuration(planned)}`, `可用时间：${fmtDuration(capacity)}`, `${ratio > 1 ? "超出" : "剩余"}：${fmtDuration(Math.abs(capacity - planned))}`, "统计口径：计划用时，非实际投入"]);
  const track = load.createDiv({ cls: "lubi-load-track" });
  track.createDiv({ cls: "lubi-load-fill" }).style.width = `${Math.min(100, ratio * 100)}%`;
  load.createSpan({ cls: "lubi-load-text", text: `${fmtHoursShort(planned)}/${fmtHoursShort(capacity)}` });
}

function fmtHoursShort(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return `${h}h`;
}

function snap(min: number): number {
  return Math.round(min / SNAP) * SNAP;
}

function bindDrop(plugin: LubiPlugin, target: HTMLElement, date: string, startH: number | null, rerender: () => void): void {
  target.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("text/lubi-task")) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    target.addClass("is-drop");
  });
  target.addEventListener("dragleave", (e) => {
    if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
    target.removeClass("is-drop");
  });
  target.addEventListener("drop", async (e) => {
    target.removeClass("is-drop");
    const id = e.dataTransfer?.getData("text/lubi-task");
    if (!id) return;
    e.preventDefault();
    // 同一清单空白处落下不应把已有时间清掉。
    if (target.classList.contains("lubi-list-card") && Array.from(target.querySelectorAll<HTMLElement>("[data-task-id]")).some(el => el.dataset.taskId === id)) return;
    let start = "";
    if (startH !== null) {
      const rect = target.getBoundingClientRect();
      start = minToHM(startH * 60 + snap(((e.clientY - rect.top) / HOUR_PX) * 60));
    }
    const task = plugin.tasks.byId(id);
    if (!task) return;
    if (task.repeat.kind !== "none") { new Notice("重复任务请在编辑中调整规则或时间"); return; }
    await updateScheduleWithUndo(plugin, id, { date, start }, `${task.title} → ${date}${start ? ` ${start}` : " 全天"}`, rerender);
  });
}
