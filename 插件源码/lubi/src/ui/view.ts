// 主视图：顶栏（日期 + 三页切换）+ 内容区

import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type LubiPlugin from "../main";
import { shiftDate, shortDate, todayStr, weekdayZh, weekStart, monthStart, monthEnd } from "../core/time";
import { iconButton, segmented, button, debounce, hideTip } from "./components";
import { renderToday } from "./today";
import { renderReview, ReviewState } from "./review";
import { renderTasks, TasksState } from "./tasks";
import { RecordModal, ShortcutsModal } from "./modals";

export const VIEW_TYPE = "lubi-dashboard";
export type Tab = "today" | "review" | "tasks";

export class DashboardView extends ItemView {
  date = todayStr();
  tab: Tab = "today";
  review: ReviewState = { period: "week", anchor: todayStr(), display: "chart" };
  tasksState: TasksState = { weekAnchor: todayStr(), selectedDate: todayStr(), agendaDate: todayStr(), agendaSpan: 1, projectsOpen: false, expanded: new Set() };
  private body!: HTMLElement;
  private dateLabel!: HTMLElement;
  private todayBtn!: HTMLButtonElement;
  private contextLabel!: HTMLElement;
  private keyHandler?: (e: KeyboardEvent) => void;
  private serial = 0;
  private lastRenderKey = "";
  private visitedReview = false;
  private readonly scrollCache = new Map<string, { body: number; timeline?: number; week?: number }>();
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
    this.dateLabel = nav.createEl("button", { cls: "lubi-date-label", attr: { title: "点击选择日期" } });
    const picker = nav.createEl("input", { type: "date", cls: "lubi-date-picker", attr: { tabindex: "-1", "aria-hidden": "true" } });
    this.dateLabel.addEventListener("click", () => {
      picker.value = this.date;
      const p = picker as HTMLInputElement & { showPicker?: () => void };
      if (p.showPicker) p.showPicker();
      else picker.click();
    });
    picker.addEventListener("change", () => picker.value && this.setDate(picker.value));
    iconButton(nav, "chevron-right", "后一天（→）", () => this.setDate(shiftDate(this.date, 1)));
    this.todayBtn = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm lubi-today-btn", text: "今天", attr: { title: "回到今天（T）" } });
    this.todayBtn.addEventListener("click", () => this.setDate(todayStr()));
    this.contextLabel = left.createDiv({ cls: "lubi-context", attr: { "aria-live": "polite" } });

    const tabs = segmented<Tab>(bar, [
      { id: "today", label: "每日", icon: "hourglass" },
      { id: "review", label: "回顾", icon: "bar-chart-3" },
      { id: "tasks", label: "任务", icon: "list-todo" },
    ], this.tab, (t) => this.setTab(t));
    tabs.addClass("lubi-topbar-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.querySelectorAll<HTMLElement>(".lubi-seg-item").forEach((b, i) => {
      const label = b.textContent || "";
      b.title = `${label}（${i + 1}）`;
      b.setAttribute("aria-label", label);
    });

    const right = bar.createDiv({ cls: "lubi-topbar-right" });
    const cta = button(right, "记一条", () => this.openRecord(), { primary: true, icon: "plus", cls: "lubi-topbar-cta" });
    cta.title = "记一条（N）";
    cta.createSpan({ cls: "lubi-kbd lubi-kbd-cta", text: "N" });
    iconButton(right, "more-horizontal", "更多", () => undefined, "lubi-more-btn").addEventListener("click", (e) => this.openMore(e));

    // 视图内快捷键（输入框、模态内不触发）
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
      document.addEventListener("keydown", this.keyHandler);
    }
  }

  private openRecord(): void {
    new RecordModal(this.app, this.plugin, { date: this.activeDate(), onSaved: () => this.refresh() }).open();
  }

  private openMore(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("打开日记文件").setIcon("file-text").onClick(() => void this.plugin.openJournal(this.activeDate())));
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
    if (key === "n" || key === "N") { e.preventDefault(); this.openRecord(); }
    else if (key === "1" || key === "2" || key === "3") { e.preventDefault(); this.setTab((["today", "review", "tasks"] as Tab[])[Number(key) - 1]); }
    else if ((key === "t" || key === "T") && this.tab === "today") { e.preventDefault(); this.setDate(todayStr()); }
    else if (key === "?") { e.preventDefault(); new ShortcutsModal(this.app).open(); }
    else if ((key === "ArrowLeft" || key === "ArrowRight") && this.tab === "today") {
      // 时间轴块内的方向键另有用途；只在非块元素上切换日期
      if (t && t.closest(".lubi-block, .lubi-timeline, .lubi-chart, .lubi-week")) return;
      e.preventDefault();
      this.setDate(shiftDate(this.date, key === "ArrowLeft" ? -1 : 1));
    }
  }

  private contextText(): string {
    if (this.tab === "review") {
      const a = this.review.anchor;
      if (this.review.period === "week") { const f = weekStart(a); return `回顾 · ${shortDate(f)} – ${shortDate(shiftDate(f, 6))}`; }
      if (this.review.period === "month") return `回顾 · ${shortDate(monthStart(a))} – ${shortDate(monthEnd(a))}`;
      return `回顾 · ${a.slice(0, 4)} 年`;
    }
    const f = weekStart(this.tasksState.weekAnchor);
    const thisWeek = weekStart(todayStr()) === f;
    return `任务 · ${thisWeek ? "本周 " : ""}${shortDate(f)} – ${shortDate(shiftDate(f, 6))}`;
  }

  activeDate(): string {
    return this.tab === "today" ? this.date : this.tab === "tasks" ? this.tasksState.selectedDate : todayStr();
  }

  setDate(d: string): void {
    this.date = d;
    void this.render();
  }

  setTab(t: Tab): void {
    if (this.tab === t) return;
    if (t === "review" && !this.visitedReview) {
      this.review.anchor = this.tab === "today" ? this.date : this.tasksState.selectedDate;
      this.visitedReview = true;
    }
    this.tab = t;
    this.syncTabs();
    void this.render();
  }

  private syncTabs(): void {
    this.contentEl.dataset.tab = this.tab;
    this.contentEl.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item").forEach((b, i) => b.setAttribute("aria-pressed", String(["today", "review", "tasks"][i] === this.tab)));
  }

  /** 外部跳转：可同时指定页与日期，不重建顶栏 */
  show(tab?: Tab, date?: string): void {
    if (date) {
      const target = tab || this.tab;
      if (target === "today") this.date = date;
      else if (target === "review") { this.review.anchor = date; this.visitedReview = true; }
      else {
        this.tasksState.selectedDate = date;
        this.tasksState.weekAnchor = date;
        this.tasksState.agendaDate = date;
      }
    }
    if (tab) {
      if (tab === "review" && !this.visitedReview) {
        this.review.anchor = this.tab === "today" ? this.date : this.tasksState.selectedDate;
        this.visitedReview = true;
      }
      this.tab = tab;
    }
    this.syncTabs();
    void this.render();
  }

  async render(): Promise<void> {
    const serial = ++this.serial;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.body.contains(active) ? active.getAttribute("data-lubi-focus") : null;
    hideTip();
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
      });
      if (this.scrollCache.size > 50) this.scrollCache.delete(this.scrollCache.keys().next().value!);
    }
    const key = this.tab === "today" ? `today:${this.date}`
      : this.tab === "review" ? `review:${this.review.period}:${this.review.anchor}`
      : `tasks:${this.tasksState.selectedDate}:${this.tasksState.weekAnchor}`;
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
      else renderTasks(this.plugin, host, this.tasksState.selectedDate, this.tasksState, rerender);
    } catch (e) {
      host.empty();
      const err = host.createDiv({ cls: "lubi-error" });
      err.createEl("strong", { text: "页面渲染出错" });
      err.createEl("pre", { text: (e as Error).stack || String(e) });
    }
    if (serial !== this.serial) return;
    this.body.empty();
    this.body.appendChild(host);
    this.lastRenderKey = key;
    if (focusKey && (document.activeElement === active || document.activeElement === document.body)) {
      const replacement = Array.from(this.body.querySelectorAll<HTMLElement>("[data-lubi-focus]"))
        .find((element) => element.getAttribute("data-lubi-focus") === focusKey);
      replacement?.focus({ preventScroll: true });
    }
    const saved = this.scrollCache.get(key);
    if (saved) {
      this.body.scrollTop = saved.body;
      window.requestAnimationFrame(() => {
        if (this.lastRenderKey !== key) return;
        const tl = this.body.querySelector<HTMLElement>(".lubi-timeline-scroll");
        const week = this.body.querySelector<HTMLElement>(".lubi-week-body");
        if (tl && saved.timeline !== undefined) { tl.dataset.restored = "1"; tl.scrollTop = saved.timeline; }
        if (week && saved.week !== undefined) { week.dataset.restored = "1"; week.scrollTop = saved.week; }
      });
    }
  }
}

