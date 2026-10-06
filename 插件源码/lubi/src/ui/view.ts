// 主视图：顶栏（日期 + 三页切换）+ 内容区

import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type LubiPlugin from "../main";
import { shiftDate, shortDate, todayStr, weekdayZh, weekStart } from "../core/time";
import { iconButton, segmented, button, debounce, hideTip, tip } from "./components";
import { renderToday } from "./today";
import { renderReview, ReviewState } from "./review";
import { ganttWindow } from "../core/gantt";
import { renderTasks, TasksState } from "./tasks";
import { ShortcutsModal, TaskModal } from "./modals";
import { AiTaskModal } from "./aiTask";

export const VIEW_TYPE = "lubi-dashboard";
export type Tab = "today" | "review" | "tasks";

let tabLabelId = 0;

export class DashboardView extends ItemView {
  date = todayStr();
  tab: Tab = "today";
  review: ReviewState = { period: "week", anchor: todayStr(), display: "chart" };
  tasksState: TasksState = { selectedDate: todayStr(), scheduleView: "calendar", period: "week", ganttCollapsed: new Set() };
  private body!: HTMLElement;
  private dateLabel!: HTMLElement;
  private todayBtn!: HTMLButtonElement;
  private contextLabel!: HTMLElement;
  private ctaLabel?: HTMLElement;
  private keyHandler?: (e: KeyboardEvent) => void;
  private serial = 0;
  private lastRenderKey = "";
  private visitedReview = false;
  private readonly scrollCache = new Map<string, { body: number; timeline?: number; week?: number; ganttLeft?: number; ganttTop?: number }>();
  private panelObserver?: ResizeObserver;
  readonly refresh = debounce(() => void this.render(), 150);

  constructor(leaf: WorkspaceLeaf, private plugin: LubiPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Lubi 记录";
  }
  getIcon(): string {
    return "hourglass";
  }

  async onClose(): Promise<void> {
    hideTip();
    this.panelObserver?.disconnect();
    if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = undefined;
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("lubi-root");
    const sizePanel = () => {
      const height = root.getBoundingClientRect().height;
      if (height >= 200) root.style.setProperty("--lubi-panel-height", `${Math.round(height)}px`);
    };
    sizePanel();
    if (typeof ResizeObserver !== "undefined") {
      this.panelObserver?.disconnect();
      this.panelObserver = new ResizeObserver(sizePanel);
      this.panelObserver.observe(root);
    }
    this.buildHeader(root);
    this.body = root.createDiv({ cls: "lubi-body" });
    await this.plugin.tasks.load();
    await this.render();
  }

  private buildHeader(root: HTMLElement): void {
    // 三段式栅格：左 = 日期 / 周期上下文（永不留空）；中 = 三页切换（位置恒定）；右 = 主操作 + 更多
    const bar = root.createDiv({ cls: "lubi-topbar" });
    const left = bar.createDiv({ cls: "lubi-topbar-left" });
    const nav = left.createDiv({ cls: "lubi-nav lubi-day-nav" });
    iconButton(nav, "chevron-left", "前一天（←）", () => this.setDate(shiftDate(this.date, -1)));
    this.dateLabel = tip(nav.createEl("button", { cls: "lubi-date-label" }), "点击选择日期");
    const picker = nav.createEl("input", { type: "date", cls: "lubi-date-picker", attr: { tabindex: "-1", "aria-hidden": "true" } });
    this.dateLabel.addEventListener("click", () => {
      picker.value = this.date;
      const p = picker as HTMLInputElement & { showPicker?: () => void };
      if (p.showPicker) p.showPicker();
      else picker.click();
    });
    picker.addEventListener("change", () => picker.value && this.setDate(picker.value));
    iconButton(nav, "chevron-right", "后一天（→）", () => this.setDate(shiftDate(this.date, 1)));
    this.todayBtn = tip(nav.createEl("button", { cls: "lubi-btn lubi-btn-sm lubi-today-btn", text: "今天" }), "回到今天（T）");
    this.todayBtn.addEventListener("click", () => this.setDate(todayStr()));
    this.contextLabel = left.createDiv({ cls: "lubi-context", attr: { "aria-live": "polite" } });

    const tabs = segmented<Tab>(bar, [
      { id: "today", label: "每日" },
      { id: "tasks", label: "计划" },
      { id: "review", label: "回顾" },
    ], this.tab, (t) => this.setTab(t));
    tabs.addClass("lubi-topbar-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.querySelectorAll<HTMLElement>(".lubi-seg-item").forEach((b, i) => {
      const label = b.querySelector("span")!;
      label.id = `lubi-tab-label-${++tabLabelId}`;
      b.setAttribute("aria-labelledby", label.id);
      b.setAttribute("aria-keyshortcuts", String(i + 1));
    });

    const right = bar.createDiv({ cls: "lubi-topbar-right" });
    const cta = button(right, this.ctaText(), () => this.openNew(), { primary: true, icon: "plus", cls: "lubi-topbar-cta" });
    this.ctaLabel = cta.querySelector<HTMLElement>("span:not(.lubi-icon)") || undefined;
    tip(cta, "新建（N）：统一任务表单，可填写预计及实际用时，或切换记录支出");
    cta.createSpan({ cls: "lubi-kbd lubi-kbd-cta", text: "N" });
    iconButton(right, "more-horizontal", "更多", () => undefined, "lubi-more-btn").addEventListener("click", (e) => this.openMore(e));

    // 视图内快捷键（输入框、模态内不触发）
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
      document.addEventListener("keydown", this.keyHandler);
    }
  }

  /** 唯一的新建入口：任务页默认「待做」，其他页默认「已完成」；窗口顶部可随时切换 */
  openNew(): void {
    if (this.tab === "tasks") new TaskModal(this.app, this.plugin, { defaults: { date: this.tasksState.selectedDate }, recordDate: this.tasksState.selectedDate, onSaved: () => this.refresh() }).open();
    else new TaskModal(this.app, this.plugin, { defaults: { date: this.activeDate() }, recordDate: this.activeDate(), quickActual: true, onSaved: () => this.refresh() }).open();
  }

  private openMore(e: MouseEvent): void {
    const menu = new Menu();
    if (this.tab === "tasks") {
      menu.addItem((i) => i.setTitle("AI 创建任务").setIcon("sparkles").onClick(() => new AiTaskModal(this.app, this.plugin, this.activeDate(), () => this.refresh()).open()));
      menu.addSeparator();
    }
    menu.addItem((i) => i.setTitle("打开日记文件").setIcon("file-text").onClick(() => void this.plugin.openJournal(this.activeDate())));
    menu.addItem((i) => i.setTitle("导出全部记录 CSV").setIcon("download").onClick(() => void this.plugin.exportCsv()));
    menu.addItem((i) => i.setTitle("快捷键").setIcon("keyboard").onClick(() => new ShortcutsModal(this.app).open()));
    menu.addItem((i) => i.setTitle("设置").setIcon("settings").onClick(() => this.plugin.openSettings()));
    menu.showAtMouseEvent(e);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest("input, textarea, select, [contenteditable='true'], .modal, .modal-container, .menu") || t.isContentEditable)) return;
    if (document.body.querySelector(".modal-container, .lubi-modal")) return;
    // 只响应当前激活的 Lubi 面板：焦点在面板内，或它是工作区的活动视图
    const ws = this.app.workspace as unknown as { getActiveViewOfType?: (c: unknown) => unknown };
    const active = (t && this.contentEl.contains(t)) || ws.getActiveViewOfType?.(DashboardView) === this;
    if (!active) return;
    const key = e.key;
    if (key === "n" || key === "N") { e.preventDefault(); this.openNew(); }
    else if (key === "1" || key === "2" || key === "3") { e.preventDefault(); this.setTab((["today", "tasks", "review"] as Tab[])[Number(key) - 1]); }
    else if ((key === "t" || key === "T") && this.tab !== "review") { e.preventDefault(); this.setDate(todayStr()); }
    else if (key === "?") { e.preventDefault(); new ShortcutsModal(this.app).open(); }
    else if ((key === "ArrowLeft" || key === "ArrowRight") && this.tab !== "review") {
      // 时间轴块内的方向键另有用途；只在非块元素上切换日期
      if (t && t.closest(".lubi-block, .lubi-timeline, .lubi-chart, .lubi-week, .lubi-gantt-scroll")) return;
      e.preventDefault();
      this.setDate(shiftDate(this.date, key === "ArrowLeft" ? -1 : 1));
    }
  }

  private contextText(): string {
    if (this.tab === "review") {
      const a = this.review.anchor;
      if (this.review.period === "week") { const f = weekStart(a); return `${shortDate(f)} – ${shortDate(shiftDate(f, 6))}`; }
      if (this.review.period === "month") return `${a.slice(0, 4)} 年 ${Number(a.slice(5, 7))} 月`;
      return `${a.slice(0, 4)} 年`;
    }
    const days = ganttWindow(this.tasksState.selectedDate, this.tasksState.period);
    return days.length === 1 ? days[0] : `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`;
  }

  activeDate(): string {
    return this.tab === "today" ? this.date : this.tab === "tasks" ? this.tasksState.selectedDate : todayStr();
  }

  /** 每日页与任务页共用同一个日期：任一页翻天，另一页跟着走 */
  private syncTasksDate(d: string): void {
    this.tasksState.selectedDate = d;
  }

  setDate(d: string): void {
    this.date = d;
    this.syncTasksDate(d);
    void this.render();
  }

  setTab(t: Tab): void {
    if (this.tab === t) return;
    if (t === "review" && !this.visitedReview) {
      this.review.anchor = this.tab === "today" ? this.date : this.tasksState.selectedDate;
      this.visitedReview = true;
    }
    if (t === "tasks" && this.tasksState.selectedDate !== this.date) this.syncTasksDate(this.date);
    this.tab = t;
    this.syncTabs();
    void this.render();
  }

  /** 主按钮文字跟着页面走：说清楚按下去会得到什么 */
  private ctaText(): string {
    return "新建任务";
  }

  private syncTabs(): void {
    this.contentEl.dataset.tab = this.tab;
    this.ctaLabel?.setText(this.ctaText());
    this.contentEl.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item").forEach((b, i) => b.setAttribute("aria-pressed", String(["today", "tasks", "review"][i] === this.tab)));
  }

  /** 外部跳转：可同时指定页与日期，不重建顶栏 */
  show(tab?: Tab, date?: string): void {
    if (date) {
      const target = tab || this.tab;
      if (target === "review") { this.review.anchor = date; this.visitedReview = true; }
      else {
        this.date = date;
        this.syncTasksDate(date);
      }
    }
    if (tab) {
      if (tab === "review" && !this.visitedReview) {
        this.review.anchor = this.tab === "today" ? this.date : this.tasksState.selectedDate;
        this.visitedReview = true;
      }
      if (tab === "tasks" && !date && this.tasksState.selectedDate !== this.date) this.syncTasksDate(this.date);
      this.tab = tab;
    }
    this.syncTabs();
    void this.render();
  }

  async render(): Promise<void> {
    const serial = ++this.serial;
    const sameReview = this.tab === "review" && this.lastRenderKey.startsWith("review:");
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.body.contains(active) ? active.getAttribute("data-lubi-focus") : null;
    hideTip();
    // 任务页内部（周日程翻周、点表头、议程）改了选中日：顶栏日期跟着它
    if (this.tab === "tasks") this.date = this.tasksState.selectedDate;
    const isToday = this.date === todayStr();
    this.dateLabel.empty();
    this.dateLabel.createSpan({ text: `${this.date} 周${weekdayZh(this.date)}` });
    if (isToday) this.dateLabel.createSpan({ cls: "lubi-today-badge", text: "今天" });
    this.dateLabel.toggleClass("is-today", isToday);
    this.todayBtn.disabled = isToday;
    this.todayBtn.toggleClass("is-hidden", isToday);
    this.contentEl.dataset.tab = this.tab;
    if (this.tab !== "today") this.contextLabel.setText(this.contextText());
    if (this.lastRenderKey) {
      this.scrollCache.set(this.lastRenderKey, {
        body: this.body.scrollTop,
        timeline: this.body.querySelector<HTMLElement>(".lubi-timeline-scroll")?.scrollTop,
        week: this.body.querySelector<HTMLElement>(".lubi-week-body")?.scrollTop,
        ganttLeft: this.body.querySelector<HTMLElement>(".lubi-gantt-scroll")?.scrollLeft,
        ganttTop: this.body.querySelector<HTMLElement>(".lubi-gantt-scroll")?.scrollTop,
      });
      if (this.scrollCache.size > 50) this.scrollCache.delete(this.scrollCache.keys().next().value!);
    }
    const scheduleChanged = this.tab === "tasks" && this.lastRenderKey.startsWith("tasks:") && this.lastRenderKey.split(":")[1] !== this.tasksState.scheduleView;
    const key = this.tab === "today" ? `today:${this.date}`
      : this.tab === "review" ? `review:${this.review.period}:${this.review.anchor}`
      : `tasks:${this.tasksState.scheduleView}:${this.tasksState.period}:${this.tasksState.selectedDate}`;
    const host = createDiv();
    host.addClass("lubi-page");
    const rerender = () => this.refresh();
    try {
      if (this.tab === "today") await renderToday(this.plugin, host, this.date, rerender);
      else if (this.tab === "review")
        await renderReview(this.plugin, host, this.review, (s) => {
          Object.assign(this.review, s);
          void this.render();
        });
      else await renderTasks(this.plugin, host, this.tasksState.selectedDate, this.tasksState, rerender);
    } catch (e) {
      host.empty();
      const err = host.createDiv({ cls: "lubi-error" });
      err.createEl("strong", { text: "页面渲染出错" });
      err.createEl("pre", { text: (e as Error).stack || String(e) });
    }
    if (serial !== this.serial) return;
    const planDetails = host.querySelector<HTMLDetailsElement>(".lubi-plan-task-details");
    if (planDetails) planDetails.open = key === this.lastRenderKey ? this.body.querySelector<HTMLDetailsElement>(".lubi-plan-task-details")?.open ?? true : true;
    const bodyScroll = this.body.scrollTop;
    this.body.empty();
    this.body.appendChild(host);
    this.lastRenderKey = key;
    if (focusKey && (document.activeElement === active || document.activeElement === document.body)) {
      const replacements = Array.from(this.body.querySelectorAll<HTMLElement>("[data-lubi-focus]"))
        .filter(element => element.getAttribute("data-lubi-focus") === focusKey);
      const replacement = replacements.find(element => element.getClientRects().length > 0) || replacements[0];
      replacement?.focus({ preventScroll: true });
    }
    if (scheduleChanged) window.requestAnimationFrame(() => {
      if (this.lastRenderKey !== key) return;
      const control = Array.from(this.body.querySelectorAll<HTMLElement>(".lubi-schedule-switch")).find(element => element.getClientRects().length > 0);
      if (!control) return;
      const viewport = this.body.getBoundingClientRect(), rect = control.getBoundingClientRect();
      // Narrow layouts move between the existing agenda and the schedule region: keep the selected view in sight.
      if (rect.top < viewport.top || rect.bottom > viewport.bottom) control.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    });
    const saved = this.scrollCache.get(key);
    if (sameReview) this.body.scrollTop = bodyScroll;
    if (saved) {
      if (!sameReview) this.body.scrollTop = saved.body;
      window.requestAnimationFrame(() => {
        if (this.lastRenderKey !== key) return;
        const tl = this.body.querySelector<HTMLElement>(".lubi-timeline-scroll");
        const week = this.body.querySelector<HTMLElement>(".lubi-week-body");
      const gantt = this.body.querySelector<HTMLElement>(".lubi-gantt-scroll");
      if (gantt) { if (saved.ganttLeft !== undefined) gantt.scrollLeft = saved.ganttLeft; if (saved.ganttTop !== undefined) gantt.scrollTop = saved.ganttTop; }
        if (tl && saved.timeline !== undefined) { tl.dataset.restored = "1"; tl.scrollTop = saved.timeline; }
        if (week && saved.week !== undefined) { week.dataset.restored = "1"; week.scrollTop = saved.week; }
      });
    }
  }
}
