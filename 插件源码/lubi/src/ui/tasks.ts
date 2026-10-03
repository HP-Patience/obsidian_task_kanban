// 任务页：左 今日清单 + 未安排；右 七日日程（今天居中）（拖放）；底部 项目（极简甘特）

import { Notice } from "obsidian";
import type LubiPlugin from "../main";
import { Task, blankTask } from "../core/tasks";
import { daysBetween, eachDate, fmtDuration, hmToMin, minToHM, nowHM, shiftDate, shortDate, todayStr, weekdayZh, weekStart } from "../core/time";
import { categoryOf } from "../settings";
import { button, catDot, el, emptyState, HOUR_PX, icon, iconButton, segmented, stopAll, tip, undoNotice } from "./components";
import { TaskModal, RecordModal } from "./modals";
import { AiTaskModal } from "./aiTask";
import { dayTasks, groupedRows, OpenRecord, renderDayTaskList, taskRow } from "./taskList";
import { startDrag } from "./drag";
import { Rec } from "../core/records";

const SNAP = 15;

export interface TasksState {
  weekAnchor: string;
  selectedDate: string;
  agendaDate: string;
  agendaSpan: 1 | 3;
  projectsOpen: boolean;
  expanded: Set<string>;
}

type ScheduleFields = Pick<Task, "date" | "start" | "estimate" | "startDate" | "endDate">;

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
    await plugin.tasks.upsert({ ...task, ...patch });
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
      try {
        await plugin.tasks.upsert({ ...latest, ...restored });
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
  const openNew: OpenRecord = (d, onRec) => new RecordModal(plugin.app, plugin, { date, defaults: d, onSaved: async (rec) => { if (rec && onRec) await onRec(rec); rerender(); } }).open();
  const edit = (t: Task) => new TaskModal(plugin.app, plugin, { task: t, onSaved: rerender }).open();
  const create = (defaults: Partial<Task> = {}) => new TaskModal(plugin.app, plugin, { defaults, onSaved: rerender }).open();

  const top = host.createDiv({ cls: "lubi-tasks-top" });
  const lists = top.createDiv({ cls: "lubi-tasks-left" });
  renderLists(plugin, lists, date, rerender, openNew, edit, create);
  // DOM 顺序即键盘顺序：选中日任务 → 窄屏议程 → 未安排；宽屏隐藏议程，保留右侧周日程。
  const agendaHost = lists.createDiv({ cls: "lubi-agenda-host" });
  renderAgenda(plugin, agendaHost, state, rerender, edit);
  const inbox = lists.querySelectorAll(".lubi-list-card")[1];
  if (inbox) lists.insertBefore(agendaHost, inbox);
  renderWeek(plugin, top.createDiv({ cls: "lubi-tasks-week" }), date, state, rerender, edit);
  renderProjects(plugin, host.createDiv({ cls: "lubi-tasks-projects" }), state, rerender, edit, create);
}

// ---------- 左栏 ----------

function renderLists(plugin: LubiPlugin, host: HTMLElement, date: string, rerender: () => void, openNew: OpenRecord, edit: (t: Task) => void, create: (d?: Partial<Task>) => void): void {
  const today = dayTasks(plugin, date);
  const card = host.createDiv({ cls: "lubi-card lubi-list-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", date === todayStr() ? "今天" : `${shortDate(date)} 周${weekdayZh(date)}`);
  const done = today.filter((t) => plugin.tasks.isDoneOn(t, date)).length;
  head.createSpan({ cls: "lubi-muted", text: today.length ? `${done}/${today.length}` : "" });
  iconButton(head, "plus", "新建任务", () => create({ date }), "lubi-push-right");
  button(head, "✦ AI 创建", () => new AiTaskModal(plugin.app, plugin, date, rerender).open(), { cls: "lubi-btn-ghost lubi-btn-sm" });

  const list = card.createDiv({ cls: "lubi-task-list" });
  if (!today.length) list.createDiv({ cls: "lubi-muted lubi-pad", text: "这天没有安排。可从下方「未安排」选择日期，或添加待办。" });
  renderDayTaskList(plugin, list, date, rerender, openNew, edit, (li, t) => makeDraggable(li, t));
  // 快速输入：键盘按回车，触屏有明确的添加按钮。
  const quick = card.createDiv({ cls: "lubi-quick-add" });
  icon(quick, "plus", "lubi-icon");
  const input = quick.createEl("input", { type: "text", attr: { placeholder: "添加待办（安排在当天）", "aria-label": `添加 ${date} 的待办`, "data-lubi-focus": "quick-add" } });
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
  const ib = host.createDiv({ cls: "lubi-card lubi-list-card" });
  const ih = ib.createDiv({ cls: "lubi-panel-head" });
  el(ih, "h3", "lubi-panel-title", "未安排");
  ih.createSpan({ cls: "lubi-muted", text: inbox.length ? String(inbox.length) : "" });
  iconButton(ih, "plus", "新建未安排任务", () => create(), "lubi-push-right");
  const il = ib.createDiv({ cls: "lubi-task-list" });
  if (!inbox.length) il.createDiv({ cls: "lubi-muted lubi-pad", text: "空。所有任务都已经安排了日期。" });
  groupedRows(plugin, il, inbox, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    makeDraggable(li, t);
    const act = li.querySelector<HTMLElement>(".lubi-task-actions") ?? li.createDiv({ cls: "lubi-task-actions" });
    iconButton(act, "calendar-plus", `安排 ${t.title} 到 ${date}（可撤销）`, () => void updateScheduleWithUndo(plugin, t.id, { date, start: "" }, `${t.title} → ${date}`, rerender));
    iconButton(act, "calendar-days", `为 ${t.title} 选择日期和时间`, () => new TaskModal(plugin.app, plugin, { task: t, focusDate: true, onSaved: rerender }).open());
  });
}

/** 对同一项目的叶子任务保留可见父级路径；父级名称可直接打开编辑。 */
function makeDraggable(elm: HTMLElement, t: Task): void {
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

// ---------- 窄面板：可切换的单日 / 三日议程，日期、完成与编辑都不依赖拖动 ----------

function renderAgenda(plugin: LubiPlugin, host: HTMLElement, state: TasksState, rerender: () => void, edit: (task: Task) => void): void {
  const card = host.createDiv({ cls: "lubi-card lubi-agenda-card" });
  const span = state.agendaSpan;
  const first = state.agendaDate || state.selectedDate;
  const dates = Array.from({ length: span }, (_, i) => shiftDate(first, i));
  const head = card.createDiv({ cls: "lubi-panel-head lubi-agenda-head" });
  el(head, "h3", "lubi-panel-title", "日程");
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
      taskRow(plugin, list, task, d, rerender, (defaults, onRec) => new RecordModal(plugin.app, plugin, { date: d, defaults, onSaved: async (rec) => { if (rec && onRec) await onRec(rec); rerender(); } }).open(), () => edit(task));
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
  const days = weekWindow(state.weekAnchor);

  const card = host.createDiv({ cls: "lubi-card lubi-week-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "周日程");
  head.createSpan({ cls: "lubi-muted", text: `${shortDate(days[0])} – ${shortDate(days[6])}` });
  const nav = head.createDiv({ cls: "lubi-nav lubi-push-right" });
  iconButton(nav, "chevron-left", "向前 7 天", () => {
    state.weekAnchor = shiftDate(state.weekAnchor, -7);
    state.selectedDate = shiftDate(state.selectedDate, -7);
    state.agendaDate = state.selectedDate;
    rerender();
  });
  const wk = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm", text: "今天" });
  wk.addEventListener("click", () => {
    state.weekAnchor = todayStr();
    state.selectedDate = todayStr();
    state.agendaDate = state.selectedDate;
    rerender();
  });
  iconButton(nav, "chevron-right", "向后 7 天", () => {
    state.weekAnchor = shiftDate(state.weekAnchor, 7);
    state.selectedDate = shiftDate(state.selectedDate, 7);
    state.agendaDate = state.selectedDate;
    rerender();
  });

  const grid = card.createDiv({ cls: "lubi-week" });
  // 表头 + 全天条
  const corner = grid.createDiv({ cls: "lubi-week-corner" });
  corner.setText("");
  const heads: HTMLElement[] = [];
  for (const d of days) {
    const h = grid.createDiv({ cls: `lubi-week-day ${d === todayStr() ? "is-today" : ""} ${d === date ? "is-selected" : ""}`.trim() });
    heads.push(h);
    const dayButton = h.createEl("button", { cls: "lubi-week-day-button", attr: { type: "button", "aria-label": `查看 ${d} 周${weekdayZh(d)} 的任务`, "aria-current": d === date ? "date" : "false" } });
    dayButton.createSpan({ cls: "lubi-week-dow", text: `周${weekdayZh(d)}` });
    dayButton.createSpan({ cls: "lubi-week-date", text: String(Number(d.slice(8, 10))) });
    dayButton.addEventListener("click", () => plugin.openDate(d, "tasks"));
    renderLoad(plugin, h, d);
    const allDay = plugin.tasks.forDate(d).filter((t) => !t.start && !plugin.tasks.children(t.id).length);
    // 没有全天任务就不占表头高度；表头本身仍是全天任务的拖放区
    const strip = allDay.length ? h.createDiv({ cls: "lubi-allday" }) : null;
    if (strip) for (const t of allDay) {
      const doneChip = plugin.tasks.isDoneOn(t, d);
      const chip = tip(strip.createEl("button", { cls: `lubi-allday-chip ${doneChip ? "is-done" : ""}`, attr: { type: "button" } }), `${d} 全天任务 ${t.title}${doneChip ? "（已完成）" : ""}：点击编辑，拖到下方时段可定时`);
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
  // 悬停十字指示：横向虚线贯穿整周（当前列加深）+ 当前列与表头高亮 + 左侧刻度栏时间标签；拖动时跟随
  const hoverLabel = hours.createDiv({ cls: "lubi-week-hover-label", attr: { "aria-hidden": "true" } });
  const hovers: HTMLElement[] = [];
  let dragging = false;
  const yOf = (m: number) => ((m - startH * 60) / 60) * HOUR_PX;
  const showHover = (col: number, m: number) => {
    hovers.forEach((h, i) => {
      h.addClass("is-on");
      h.toggleClass("is-current", i === col);
      h.style.top = `${yOf(m)}px`;
    });
    cols.forEach((c, i) => c.toggleClass("is-hover", i === col));
    heads.forEach((h, i) => h.toggleClass("is-hover", i === col));
    hoverLabel.style.top = `${yOf(m)}px`;
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
    // 与「空白处拖出新任务」同一套取整规则，悬停线所在位置即拖动起点
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
      showHover(dayIdx, minuteAtY(e.clientY));
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
      tip(block, `${d} ${t.title}，${t.start}，预计 ${fmtDuration(dur)}。拖动改时间 / 换天；点击或回车编辑`);
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
  tip(load, `${d} 计划 ${fmtDuration(planned)} / 可用 ${fmtDuration(capacity)}${ratio > 1 ? " · 排太满了" : ""}`);
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
    target.addClass("is-drop");
  });
  target.addEventListener("dragleave", () => target.removeClass("is-drop"));
  target.addEventListener("drop", async (e) => {
    target.removeClass("is-drop");
    const id = e.dataTransfer?.getData("text/lubi-task");
    if (!id) return;
    e.preventDefault();
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

// ---------- 项目（极简甘特） ----------

function renderProjects(plugin: LubiPlugin, host: HTMLElement, state: TasksState, rerender: () => void, edit: (t: Task) => void, create: (d?: Partial<Task>) => void): void {
  const projects = plugin.tasks.projects();
  const card = host.createDiv({ cls: "lubi-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  const toggle = head.createEl("button", { cls: "lubi-project-toggle", attr: { type: "button", "aria-expanded": String(state.projectsOpen) } });
  icon(toggle, state.projectsOpen ? "chevron-down" : "chevron-right", "lubi-icon");
  toggle.createSpan({ cls: "lubi-panel-title", text: "项目" });
  toggle.createSpan({ cls: "lubi-muted", text: projects.length ? `${projects.length} 个` : "" });
  toggle.addEventListener("click", () => { state.projectsOpen = !state.projectsOpen; rerender(); });
  const addProject = iconButton(head, "plus", "新建项目", () => create({}), "lubi-push-right");
  // 折叠时也给一眼进度：最多 4 个项目的名称 + 进度条，不占额外高度
  if (!state.projectsOpen && projects.length) {
    const peek = createDiv({ cls: "lubi-project-peek" });
    head.insertBefore(peek, addProject);
    for (const p of projects.slice(0, 4)) {
      const { done, total } = plugin.tasks.progress(p);
      const chip = tip(peek.createEl("button", { cls: "lubi-project-chip", attr: { type: "button" } }), `${p.title} · ${done}/${total}，点击编辑`);
      chip.style.setProperty("--chip", categoryOf(plugin.settings, p.category).color);
      chip.createSpan({ cls: "lubi-project-chip-name", text: p.title });
      const bar = chip.createSpan({ cls: "lubi-project-chip-bar" });
      bar.createSpan().style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      chip.createSpan({ cls: "lubi-muted lubi-project-chip-n", text: `${done}/${total}` });
      chip.addEventListener("click", (e) => { stopAll(e); edit(p); });
    }
    if (projects.length > 4) peek.createSpan({ cls: "lubi-muted", text: `+${projects.length - 4}` });
  }
  const projectBody = card.createDiv({ cls: "lubi-project-body" });
  projectBody.hidden = !state.projectsOpen;
  if (!state.projectsOpen) return;
  if (!projects.length) {
    emptyState(projectBody, "layers", "还没有项目", "有子任务的顶层任务会自动出现在这里，并显示进度与时间跨度。", { label: "新建项目", onClick: () => create({}) });
    return;
  }

  // 时间范围
  const spans = projects.map((p) => plugin.tasks.span(p)).filter((x): x is { from: string; to: string } => !!x);
  const today = todayStr();
  let from = spans.length ? spans.map((s) => s.from).sort()[0] : weekStart(today);
  let to = spans.length ? spans.map((s) => s.to).sort().reverse()[0] : shiftDate(from, 27);
  from = weekStart(from < today ? from : today);
  if (daysBetween(from, to) < 27) to = shiftDate(from, 27);
  to = shiftDate(to, 6 - ((daysBetween(from, to)) % 7));
  const days = eachDate(from, to);

  const gantt = projectBody.createDiv({ cls: "lubi-gantt" });
  gantt.style.setProperty("--days", String(days.length));
  // 表头：周
  const hdr = gantt.createDiv({ cls: "lubi-gantt-row lubi-gantt-head" });
  hdr.createDiv({ cls: "lubi-gantt-name" });
  const scale = hdr.createDiv({ cls: "lubi-gantt-scale" });
  for (let i = 0; i < days.length; i += 7) {
    const w = scale.createDiv({ cls: "lubi-gantt-week" });
    w.style.left = `${(i / days.length) * 100}%`;
    w.style.width = `${(7 / days.length) * 100}%`;
    w.setText(shortDate(days[i]));
  }
  const todayIdx = days.indexOf(today);

  const row = (t: Task, depth: number) => {
    const r = gantt.createDiv({ cls: `lubi-gantt-row ${t.status === "done" ? "is-done" : ""}` });
    const name = r.createDiv({ cls: "lubi-gantt-name" });
    name.style.paddingLeft = `${8 + depth * 16}px`;
    const kids = plugin.tasks.children(t.id);
    if (kids.length) {
      const tg = iconButton(name, state.expanded.has(t.id) ? "chevron-down" : "chevron-right", `${state.expanded.has(t.id) ? "收起" : "展开"}${t.title}的子任务`, () => {
        if (state.expanded.has(t.id)) state.expanded.delete(t.id);
        else state.expanded.add(t.id);
        rerender();
      }, "lubi-icon-btn-sm");
      tg.setAttribute("aria-expanded", String(state.expanded.has(t.id)));
    } else name.createSpan({ cls: "lubi-gantt-spacer" });
    if (t.category) catDot(name, categoryOf(plugin.settings, t.category));
    const label = name.createEl("button", { cls: "lubi-gantt-label", text: t.title, attr: { type: "button", "aria-label": `编辑 ${t.title}` } });
    label.addEventListener("click", () => edit(t));
    const { done, total } = plugin.tasks.progress(t);
    if (kids.length) name.createSpan({ cls: "lubi-muted lubi-gantt-progress", text: `${done}/${total}` });
    const track = r.createDiv({ cls: "lubi-gantt-track" });
    if (todayIdx >= 0) {
      const tl = track.createDiv({ cls: "lubi-gantt-today" });
      tl.style.left = `${((todayIdx + 0.5) / days.length) * 100}%`;
    }
    const span = kids.length ? plugin.tasks.span(t) : t.date ? { from: t.date, to: t.date } : plugin.tasks.span(t);
    if (span) {
      const a = Math.max(0, daysBetween(from, span.from));
      const b = Math.min(days.length - 1, daysBetween(from, span.to));
      if (b >= 0 && a < days.length) {
        const bar = track.createDiv({ cls: `lubi-gantt-bar ${kids.length ? "is-project" : ""}` });
        const placeBar = (x: number, y: number) => {
          bar.style.left = `${(x / days.length) * 100}%`;
          bar.style.width = `${((y - x + 1) / days.length) * 100}%`;
        };
        placeBar(a, b);
        bar.style.setProperty("--chip", categoryOf(plugin.settings, t.category).color);
        const fill = bar.createDiv({ cls: "lubi-gantt-fill" });
        fill.style.width = `${total ? (done / total) * 100 : 0}%`;
        const liveLabel = bar.createDiv({ cls: "lubi-gantt-live" });
        bar.createDiv({ cls: "lubi-gantt-handle is-left" });
        bar.createDiv({ cls: "lubi-gantt-handle is-right" });
        bar.setAttribute("tabindex", "0");
        bar.setAttribute("role", "button");
        tip(bar, `${t.title}，${span.from} → ${span.to}${kids.length ? `，完成 ${done}/${total}` : ""}。点按或回车编辑；拖动整条移动，拉两端改跨度`);
        bar.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(t); }
        });
        const spanDays = b - a;
        const bindBar = (target: HTMLElement, which: "move" | "left" | "right") => {
          target.addEventListener("pointerdown", (e) => {
            if (which !== "move") e.stopPropagation();
            const dayW = (track.getBoundingClientRect().width || days.length) / days.length;
            const range = which === "move" ? { minCol: -a, maxCol: days.length - 1 - b } : which === "left" ? { minCol: -a, maxCol: spanDays } : { minCol: -spanDays, maxCol: days.length - 1 - b };
            const calc = (col: number) => (which === "move" ? [a + col, b + col] : which === "left" ? [a + col, b] : [a, b + col]);
            startDrag(e, {
              mode: "move",
              start: 0,
              minutes: 0,
              pxPerMin: 1e9,
              min: 0,
              max: 1e9,
              minMinutes: 0,
              horizontal: { colWidth: dayW, ...range },
              onStart: () => {
                bar.addClass("is-dragging");
                gantt.addClass("is-dragging");
              },
              onMove: (st) => {
                const [x, y] = calc(st.col);
                placeBar(x, y);
                liveLabel.setText(`${shortDate(days[x])} → ${shortDate(days[y])} · ${y - x + 1} 天`);
              },
              onEnd: (st) => {
                bar.removeClass("is-dragging");
                gantt.removeClass("is-dragging");
                liveLabel.setText("");
                if (st === null) {
                  placeBar(a, b);
                  return;
                }
                if (!st.moved) {
                  if (which === "move") edit(t);
                  return;
                }
                const [x, y] = calc(st.col);
                if (x === a && y === b) return;
                const from = days[x];
                const to = days[y];
                void (async () => {
                  const cur = plugin.tasks.byId(t.id);
                  if (!cur) return;
                  const next = { ...cur };
                  if (which === "move" && !kids.length && cur.date && !(cur.startDate && cur.endDate)) {
                    // 叶子任务：整体移动 = 改安排日期
                    next.date = shiftDate(cur.date, st.col);
                  } else {
                    next.startDate = from;
                    next.endDate = to;
                    if (which === "move" && cur.date) next.date = shiftDate(cur.date, st.col);
                  }
                  await updateScheduleWithUndo(plugin, t.id, {
                    ...(next.date !== cur.date ? { date: next.date } : {}),
                    ...(next.startDate !== cur.startDate ? { startDate: next.startDate } : {}),
                    ...(next.endDate !== cur.endDate ? { endDate: next.endDate } : {}),
                  }, `${t.title} → ${shortDate(from)} – ${shortDate(to)}`, rerender);
                })();
              },
            });
          });
        };
        bindBar(bar, "move");
        bindBar(bar.querySelector(".lubi-gantt-handle.is-left") as HTMLElement, "left");
        bindBar(bar.querySelector(".lubi-gantt-handle.is-right") as HTMLElement, "right");
      }
    } else if (!kids.length) {
      track.createDiv({ cls: "lubi-muted lubi-gantt-unset", text: "未安排" });
    } else {
      track.createDiv({ cls: "lubi-muted lubi-gantt-unset", text: "子任务都没有日期 · 编辑项目可手动设置跨度" });
    }
    if (state.expanded.has(t.id)) for (const k of kids) row(k, depth + 1);
  };
  for (const p of projects) row(p, 0);
  const foot = projectBody.createDiv({ cls: "lubi-muted lubi-pad-sm" });
  foot.setText("跨度 = 项目自身的开始/截止，或由子任务日期推导。点名称或条形打开日期表单；拖动排期后可撤销。");
}

