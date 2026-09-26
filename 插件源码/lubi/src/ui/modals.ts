import { App, Modal, Notice } from "obsidian";
import type LubiPlugin from "../main";
import { Rec } from "../core/records";
import { Task, blankTask, RepeatKind } from "../core/tasks";
import { hmToMin, minToHM, nowHM, todayStr, fmtDuration, shortDate, weekdayZh } from "../core/time";
import { categoryOf } from "../settings";
import { parseEstimate, parseQuick, QuickParse } from "../core/quickparse";
import { button, icon, iconButton, segmented, stopAll } from "./components";

let fieldId = 0;
function associate(label: HTMLLabelElement, control: HTMLElement): void {
  const id = `lubi-field-${++fieldId}`;
  label.htmlFor = id;
  control.id = id;
}
function errorHost(control: HTMLElement): HTMLElement | null {
  return (control.closest(".lubi-field") as HTMLElement | null)
    || (control.closest(".lubi-timebar-dur")?.parentElement as HTMLElement | null)
    || control.parentElement;
}
function fieldError(control: HTMLInputElement | HTMLSelectElement | undefined, message: string): void {
  if (!control) { new Notice(message); return; }
  const host = errorHost(control);
  host?.querySelector(".lubi-field-error")?.remove();
  const id = `lubi-error-${++fieldId}`;
  host?.createDiv({ cls: "lubi-field-error", text: message, attr: { id, role: "alert" } });
  control.setAttribute("aria-invalid", "true");
  control.setAttribute("aria-describedby", id);
  control.focus();
}
function clearFieldError(control: HTMLElement): void {
  const host = errorHost(control);
  host?.querySelector(".lubi-field-error")?.remove();
  control.removeAttribute("aria-invalid");
  control.removeAttribute("aria-describedby");
}
function formError(host: HTMLElement, message: string): void {
  let error = host.querySelector<HTMLElement>(".lubi-modal-error");
  if (!error) {
    error = host.createDiv({ cls: "lubi-modal-error", attr: { role: "alert", tabindex: "-1" } });
    host.querySelector(".lubi-modal-actions")?.before(error);
  }
  error.setText(message);
  error.focus();
}

// ---------------- 通用确认 ----------------

export class ConfirmModal extends Modal {
  constructor(app: App, private title: string, private body: string, private onOk: () => void, private okLabel = "确定", private danger = true) {
    super(app);
  }
  onOpen(): void {
    this.modalEl.addClass("lubi-modal", "lubi-modal-sm");
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.body, cls: "lubi-confirm-body" });
    const row = this.contentEl.createDiv({ cls: "lubi-modal-actions" });
    button(row, "取消", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(row, this.okLabel, () => {
      this.close();
      this.onOk();
    }, { primary: !this.danger });
    if (this.danger) ok.addClass("lubi-btn-danger");
  }
}

// ---------------- 快捷键速查 ----------------

export const SHORTCUTS: [string, string][] = [
  ["N", "记一条"],
  ["1 / 2 / 3", "切换 记录 · 回顾 · 任务"],
  ["T", "每日页回到今天"],
  ["← / →", "每日页前一天 / 后一天"],
  ["?", "打开本速查卡"],
  ["↑ / ↓", "时间轴：选中块移动 5 分钟（Alt 为 1 分钟）"],
  ["Shift + ↑ / ↓", "时间轴：改时长"],
  ["Enter / Delete", "时间轴：编辑 / 删除选中块"],
  ["Alt + 1…9", "记一条：切换分类"],
  ["Enter", "记一条 / 任务：保存"],
  ["Esc", "取消拖动 / 关闭窗口"],
];

export class ShortcutsModal extends Modal {
  onOpen(): void {
    this.modalEl.addClass("lubi-modal", "lubi-modal-sm", "lubi-shortcuts-modal");
    this.titleEl.setText("快捷键");
    const list = this.contentEl.createDiv({ cls: "lubi-shortcuts" });
    for (const [k, d] of SHORTCUTS) {
      const row = list.createDiv({ cls: "lubi-shortcut-row" });
      const keys = row.createSpan({ cls: "lubi-shortcut-keys" });
      k.split(" ").forEach((part) => {
        if (part === "/" || part === "+" || part === "…") keys.createSpan({ cls: "lubi-muted", text: ` ${part} ` });
        else keys.createEl("kbd", { text: part });
      });
      row.createSpan({ cls: "lubi-shortcut-desc", text: d });
    }
  }
}

// ---------------- 记一条 ----------------

export interface RecordModalOptions {
  date: string;
  rec?: Rec;
  line?: number;
  defaults?: Partial<Rec>;
  /** 保存后回调；新增 / 修改时带上保存的记录，删除时不带 */
  onSaved?: (rec?: Rec) => void;
}

export class RecordModal extends Modal {
  private rec: Rec;
  private editing: boolean;
  private saving = false;
  private titleInput?: HTMLInputElement;
  private amountInput?: HTMLInputElement;
  private durationInput?: HTMLInputElement;
  private parsed: QuickParse | null = null;
  private lastTimeCat = "";

  constructor(app: App, private plugin: LubiPlugin, private opts: RecordModalOptions) {
    super(app);
    const s = plugin.settings;
    const firstCat = s.categories.find((c) => c.kind === "time")?.name || "日常";
    this.editing = !!opts.rec;
    this.rec = opts.rec
      ? { ...opts.rec, extra: { ...opts.rec.extra } }
      : {
          date: opts.date,
          start: opts.defaults?.start || (opts.date === todayStr() ? nowHM() : "09:00"),
          minutes: opts.defaults?.minutes ?? 30,
          category: opts.defaults?.category || firstCat,
          title: opts.defaults?.title || "",
          task: opts.defaults?.task,
          amount: opts.defaults?.amount,
          expenseType: opts.defaults?.expenseType,
          notes: opts.defaults?.notes,
          extra: {},
        };
  }

  onOpen(): void {
    this.modalEl.addClass("lubi-modal");
    this.render();
  }

  private render(focusTitle = true): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    const s = this.plugin.settings;
    const cat = categoryOf(s, this.rec.category);
    const isMoney = cat.kind === "money";
    this.modalEl.addClass("lubi-record-modal");
    this.modalEl.style.setProperty("--chip", cat.color);

    // 标题：带日期与原时间段
    titleEl.empty();
    titleEl.createSpan({ text: this.editing ? "编辑记录" : "记一条" });
    const ctx = [`${shortDate(this.rec.date)} 周${weekdayZh(this.rec.date)}`];
    if (this.editing && this.opts.rec) ctx.push(this.opts.rec.minutes > 0 ? `${this.opts.rec.start}–${minToHM(hmToMin(this.opts.rec.start) + this.opts.rec.minutes)}` : this.opts.rec.start);
    titleEl.createSpan({ cls: "lubi-modal-ctx", text: ctx.join(" · ") });

    // 模式：时间 | 支出（财务不再混在时间分类里）
    const timeCats = s.categories.filter((c) => c.kind === "time");
    const moneyCats = s.categories.filter((c) => c.kind === "money");
    if (timeCats.length && moneyCats.length) {
      segmented<"time" | "money">(contentEl, [
        { id: "time", label: "时间", icon: "clock" },
        { id: "money", label: "支出", icon: "wallet" },
      ], isMoney ? "money" : "time", (mode) => {
        if (mode === "money") {
          this.lastTimeCat = this.rec.category;
          this.rec.category = moneyCats[0].name;
          if (this.rec.minutes === 30 && !this.editing) this.rec.minutes = 0;
        } else {
          this.rec.category = this.lastTimeCat && timeCats.some((c) => c.name === this.lastTimeCat) ? this.lastTimeCat : timeCats[0].name;
          if (this.rec.minutes <= 0) this.rec.minutes = 30;
        }
        this.render(false);
        this.contentEl.querySelector<HTMLElement>('.lubi-mode-seg .lubi-seg-item[aria-pressed="true"]')?.focus();
      }).addClass("lubi-mode-seg");
    }

    // 分类：单行胶囊，Alt + 数字切换
    const pool = isMoney ? moneyCats : timeCats;
    const pickCat = (name: string, focus = true) => {
      const next = categoryOf(s, name);
      if (next.kind !== cat.kind) return;
      this.rec.category = name;
      this.modalEl.style.setProperty("--chip", next.color);
      cats.querySelectorAll<HTMLButtonElement>(".lubi-cat-option").forEach((b) => {
        const on = b.dataset.cat === name;
        b.setAttribute("aria-pressed", String(on));
        if (on && focus) b.focus();
      });
      const dl = contentEl.querySelector("#lubi-title-suggest");
      if (dl) { dl.empty(); for (const t of this.plugin.recentTitles(name)) dl.createEl("option", { value: t }); }
    };
    const cats = contentEl.createDiv({ cls: "lubi-cat-picker lubi-cat-pills", attr: { role: "group", "aria-label": "分类" } });
    const markOverflow = () => cats.toggleClass("is-overflow", cats.scrollWidth - cats.scrollLeft - cats.clientWidth > 4);
    cats.addEventListener("scroll", markOverflow, { passive: true });
    window.requestAnimationFrame(markOverflow);
    cats.toggleClass("is-hidden", pool.length <= 1 && isMoney);
    pool.forEach((c, i) => {
      const b = cats.createEl("button", { cls: "lubi-cat-option", attr: { type: "button", "aria-pressed": String(c.name === this.rec.category), "data-cat": c.name, title: i < 9 ? `${c.name}（Alt+${i + 1}）` : c.name } });
      b.style.setProperty("--chip", c.color);
      icon(b, c.icon, "lubi-icon");
      b.createSpan({ text: c.name });
      if (i < 9) b.createSpan({ cls: "lubi-cat-key", text: String(i + 1), attr: { "aria-hidden": "true" } });
      b.addEventListener("click", (e) => {
        stopAll(e);
        pickCat(c.name);
      });
    });

    let syncTime: () => void = () => undefined;
    // 标题（支持一行输入：9:00-10:30 学习 三明治定理 / 30min 跑步）
    const titleRow = contentEl.createDiv({ cls: "lubi-field" });
    const titleLabel = titleRow.createEl("label", { text: isMoney ? "买了什么" : "做了什么" });
    const titleInput = titleRow.createEl("input", { type: "text", value: this.rec.title, attr: { placeholder: isMoney ? "午饭 / 地铁 / 书" : "做了什么 · 也可一行写完：9:00-10:30 学习 三明治定理", list: "lubi-title-suggest", autocomplete: "off" } });
    associate(titleLabel, titleInput);
    this.titleInput = titleInput;
    const parseHint = titleRow.createDiv({ cls: "lubi-parse-preview", attr: { "aria-live": "polite" } });
    const applyParse = () => {
      this.parsed = isMoney ? null : parseQuick(titleInput.value, timeCats.map((c) => c.name));
      parseHint.empty();
      const q = this.parsed;
      if (!q) return;
      if (q.start) this.rec.start = q.start;
      if (q.minutes) this.rec.minutes = q.minutes;
      if (q.category) pickCat(q.category, false);
      syncTime();
      icon(parseHint, "sparkles", "lubi-icon");
      const bits: string[] = [];
      if (q.category) bits.push(q.category);
      if (q.start) bits.push(q.minutes ? `${q.start}–${minToHM(hmToMin(q.start) + q.minutes)}` : `${q.start} 开始`);
      if (q.minutes) bits.push(fmtDuration(q.minutes));
      parseHint.createSpan({ text: `识别为 ${bits.join(" · ")} ·「${q.title || "（还没写做了什么）"}」` });
    };
    titleInput.addEventListener("input", () => { this.rec.title = titleInput.value; clearFieldError(titleInput); applyParse(); });
    const dl = titleRow.createEl("datalist", { attr: { id: "lubi-title-suggest" } });
    for (const t of this.plugin.recentTitles(this.rec.category)) dl.createEl("option", { value: t });
    if (focusTitle) window.setTimeout(() => { if (titleInput.isConnected) titleInput.focus(); }, 20);

    // 时间联动条：开始 ── 时长 ── 结束
    if (!isMoney) {
      const bar = contentEl.createDiv({ cls: "lubi-timebar" });
      const startCell = bar.createDiv({ cls: "lubi-timebar-cell" });
      const startLabel = startCell.createEl("label", { text: "开始" });
      const startInput = startCell.createEl("input", { type: "time", value: this.rec.start });
      associate(startLabel, startInput);
      bar.createDiv({ cls: "lubi-timebar-seg" }).createSpan({ cls: "lubi-timebar-line" });
      const durCell = bar.createDiv({ cls: "lubi-timebar-dur" });
      const durLabel = durCell.createEl("label", { cls: "lubi-sr-only", text: "时长" });
      const durInput = durCell.createEl("input", { type: "number", attr: { min: "0", step: "5" } });
      associate(durLabel, durInput);
      this.durationInput = durInput;
      const unitBtn = durCell.createEl("button", { cls: "lubi-timebar-unit", text: "min" });
      bar.createDiv({ cls: "lubi-timebar-seg" }).createSpan({ cls: "lubi-timebar-line" });
      const endCell = bar.createDiv({ cls: "lubi-timebar-cell" });
      const endLabel = endCell.createEl("label", { text: "结束" });
      const endInput = endCell.createEl("input", { type: "time" });
      associate(endLabel, endInput);
      let unit: "min" | "h" = this.rec.minutes >= 60 && this.rec.minutes % 30 === 0 ? "h" : "min";

      const quick = contentEl.createDiv({ cls: "lubi-quick" });
      const chips: { m: number; el: HTMLButtonElement }[] = [];
      syncTime = () => {
        startInput.value = this.rec.start;
        endInput.value = minToHM(hmToMin(this.rec.start) + this.rec.minutes);
        durInput.value = unit === "h" ? String(Math.round((this.rec.minutes / 60) * 100) / 100) : String(this.rec.minutes);
        durInput.step = unit === "h" ? "0.25" : "5";
        unitBtn.setText(unit);
        for (const c of chips) c.el.setAttribute("aria-pressed", String(c.m === this.rec.minutes));
      };
      startInput.addEventListener("change", () => {
        if (startInput.value) this.rec.start = startInput.value;
        syncTime();
      });
      durInput.addEventListener("input", () => {
        clearFieldError(durInput);
        const v = Number(durInput.value) || 0;
        this.rec.minutes = Math.max(0, Math.round(unit === "h" ? v * 60 : v));
        endInput.value = minToHM(hmToMin(this.rec.start) + this.rec.minutes);
        for (const c of chips) c.el.setAttribute("aria-pressed", String(c.m === this.rec.minutes));
      });
      unitBtn.addEventListener("click", (e) => {
        stopAll(e);
        unit = unit === "h" ? "min" : "h";
        syncTime();
      });
      endInput.addEventListener("change", () => {
        if (!endInput.value) return;
        let diff = hmToMin(endInput.value) - hmToMin(this.rec.start);
        if (diff < 0) diff += 1440;
        this.rec.minutes = diff;
        syncTime();
      });
      for (const m of [15, 30, 45, 60, 90, 120]) {
        const b = quick.createEl("button", { cls: "lubi-quick-chip", text: fmtDuration(m) });
        b.addEventListener("click", (e) => {
          stopAll(e);
          this.rec.minutes = m;
          syncTime();
        });
        chips.push({ m, el: b });
      }
      // 「接着记」= 当前时刻（历史日为当天结束）之前最近一条记录的结束时间，而不是当天最晚的一条
      const before = this.rec.date === todayStr() ? hmToMin(nowHM()) : undefined;
      const prevEnd = this.plugin.lastEndOf(this.rec.date, before);
      if (prevEnd && !this.editing && prevEnd !== this.rec.start) {
        const b = quick.createEl("button", { cls: "lubi-quick-chip lubi-quick-chip-accent", attr: { type: "button", title: "上一条记录的结束时间" } });
        icon(b, "corner-down-right", "lubi-icon");
        b.createSpan({ text: `从 ${prevEnd} 接着记` });
        b.addEventListener("click", (e) => {
          stopAll(e);
          this.rec.start = prevEnd;
          syncTime();
        });
      }
      syncTime();
    } else {
      const row = contentEl.createDiv({ cls: "lubi-field-row" });
      const timeF = row.createDiv({ cls: "lubi-field lubi-field-narrow" });
      const timeLabel = timeF.createEl("label", { text: "时间" });
      const startInput = timeF.createEl("input", { type: "time", value: this.rec.start });
      associate(timeLabel, startInput);
      startInput.addEventListener("change", () => (this.rec.start = startInput.value || this.rec.start));
      const amtF = row.createDiv({ cls: "lubi-field" });
      const amtLabel = amtF.createEl("label", { text: "金额" });
      const amtWrap = amtF.createDiv({ cls: "lubi-amount" });
      amtWrap.createSpan({ cls: "lubi-amount-cur", text: "¥" });
      const amt = amtWrap.createEl("input", { type: "number", value: this.rec.amount !== undefined ? String(this.rec.amount) : "", attr: { step: "0.01", placeholder: "0.00" } });
      associate(amtLabel, amt);
      this.amountInput = amt;
      amt.addEventListener("input", () => { this.rec.amount = amt.value === "" ? undefined : Number(amt.value); clearFieldError(amt); });
      const typeF = row.createDiv({ cls: "lubi-field" });
      const expenseLabel = typeF.createEl("label", { text: "类别" });
      const sel = typeF.createEl("select");
      associate(expenseLabel, sel);
      for (const t of s.expenseTypes) sel.createEl("option", { value: t, text: t });
      sel.value = this.rec.expenseType && s.expenseTypes.includes(this.rec.expenseType) ? this.rec.expenseType : s.expenseTypes[0];
      this.rec.expenseType = sel.value;
      sel.addEventListener("change", () => (this.rec.expenseType = sel.value));
    }

    // 可选字段：关联待办 / 备注（ghost 按钮，点开才出现）
    const extras = contentEl.createDiv({ cls: "lubi-extras" });
    const toggles = extras.createDiv({ cls: "lubi-extras-toggles" });
    const fields = extras.createDiv({ cls: "lubi-extras-fields" });
    const optional = (key: "task" | "notes", label: string, iconName: string, build: (host: HTMLElement) => void, initiallyOpen: boolean) => {
      const tg = toggles.createEl("button", { cls: "lubi-ghost-btn" });
      icon(tg, iconName, "lubi-icon");
      tg.createSpan({ text: label });
      let box: HTMLElement | null = null;
      const open = () => {
        if (box) return;
        box = fields.createDiv({ cls: "lubi-field lubi-extra-field" });
        const head = box.createDiv({ cls: "lubi-extra-head" });
        head.createEl("label", { text: label });
        iconButton(head, "x", "收起", () => {
          box?.remove();
          box = null;
          tg.removeClass("is-open");
          if (key === "task") this.rec.task = undefined;
          else this.rec.notes = undefined;
        }, "lubi-icon-btn-sm lubi-push-right");
        build(box);
        tg.addClass("is-open");
      };
      tg.addEventListener("click", (e) => {
        stopAll(e);
        open();
        (box?.querySelector("select, textarea, input") as HTMLElement | null)?.focus();
      });
      if (initiallyOpen) open();
    };
    optional("task", "关联待办", "link", (host) => {
      const taskSel = host.createEl("select", { attr: { "aria-label": "关联待办" } });
      taskSel.createEl("option", { value: "", text: "（不关联）" });
      const candidates = this.plugin.tasks.forDate(this.rec.date).filter((t) => !this.plugin.tasks.children(t.id).length);
      const inbox = this.plugin.tasks.inbox();
      const seen = new Set<string>();
      for (const t of [...candidates, ...inbox]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        taskSel.createEl("option", { value: t.id, text: this.plugin.tasks.pathOf(t).map((p) => p.title).join(" / ") });
      }
      if (this.rec.task && !seen.has(this.rec.task)) {
        const t = this.plugin.tasks.byId(this.rec.task);
        taskSel.createEl("option", { value: this.rec.task, text: t ? this.plugin.tasks.pathOf(t).map((p) => p.title).join(" / ") : `（已删除的任务 ${this.rec.task.slice(0, 8)}）` });
      }
      taskSel.value = this.rec.task || "";
      taskSel.addEventListener("change", () => {
        this.rec.task = taskSel.value || undefined;
        const t = taskSel.value ? this.plugin.tasks.byId(taskSel.value) : null;
        if (t && !this.rec.title) {
          this.rec.title = t.title;
          titleInput.value = t.title;
        }
      });
    }, !!this.rec.task);
    optional("notes", "备注", "sticky-note", (host) => {
      const notes = host.createEl("textarea", { attr: { rows: "2", placeholder: "补一句上下文", "aria-label": "备注" } });
      notes.value = this.rec.notes || "";
      notes.addEventListener("input", () => (this.rec.notes = notes.value.trim() || undefined));
    }, !!this.rec.notes);

    // 操作
    const actions = contentEl.createDiv({ cls: "lubi-modal-actions" });
    if (this.editing && this.opts.line !== undefined) {
      const del = actions.createEl("button", { cls: "lubi-text-btn lubi-text-btn-danger lubi-push-left", text: "删除" });
      del.addEventListener("click", (e) => {
        stopAll(e);
        new ConfirmModal(this.app, "删除这条记录？", `${this.rec.start} ${this.rec.category} · ${this.rec.title}`, async () => {
          await this.plugin.journal.remove(this.opts.date, this.opts.line!);
          this.close();
          this.opts.onSaved?.();
        }, "删除").open();
      });
    }
    button(actions, "取消", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(actions, this.editing ? "保存" : "记下", () => void this.save(), { primary: true });
    ok.createSpan({ cls: "lubi-kbd", text: "⏎" });

    contentEl.onkeydown = (e) => {
      if (e.key === "Enter" && e.target === titleInput && !e.isComposing) {
        e.preventDefault();
        void this.save();
        return;
      }
      // Alt + 1…9 切换分类
      if (e.altKey && /^[1-9]$/.test(e.key) && pool[Number(e.key) - 1]) {
        e.preventDefault();
        pickCat(pool[Number(e.key) - 1].name, false);
      }
    };
    if (this.parsed === null && titleInput.value) applyParse();
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    const r = this.rec;
    if (this.parsed) {
      r.title = this.parsed.title;
      this.parsed = null;
      if (this.titleInput) this.titleInput.value = r.title;
    }
    if (!r.title.trim()) {
      fieldError(this.titleInput, "先写一下做了什么");
      return;
    }
    const isMoney = categoryOf(this.plugin.settings, r.category).kind === "money";
    if (isMoney && (r.amount === undefined || isNaN(r.amount))) {
      fieldError(this.amountInput, "填一下金额");
      return;
    }
    if (!isMoney && r.minutes <= 0) {
      fieldError(this.durationInput, "时长需要大于 0");
      return;
    }
    this.saving = true;
    try {
      if (this.editing && this.opts.line !== undefined) await this.plugin.journal.update(this.opts.date, this.opts.line, r);
      else await this.plugin.journal.add(r);
      this.close();
      this.opts.onSaved?.({ ...r, extra: { ...r.extra } });
    } catch (e) {
      formError(this.contentEl, `无法保存：${(e as Error).message}`);
    } finally {
      this.saving = false;
    }
  }
}

// ---------------- 任务 ----------------

export interface TaskModalOptions {
  task?: Task;
  focusDate?: boolean;
  defaults?: Partial<Task>;
  onSaved?: (t: Task) => void;
}

export class TaskModal extends Modal {
  private t: Task;
  private editing: boolean;
  private saving = false;
  private statusTouched = false;
  private titleInput?: HTMLInputElement;
  private repeatSelect?: HTMLSelectElement;
  private dateInput?: HTMLInputElement;
  private estimateInput?: HTMLInputElement;
  private estimateInvalid = false;
  private readonly initial: string;

  constructor(app: App, private plugin: LubiPlugin, private opts: TaskModalOptions) {
    super(app);
    this.editing = !!opts.task;
    this.t = opts.task ? { ...opts.task, repeat: { ...opts.task.repeat, days: [...opts.task.repeat.days] }, doneDates: [...opts.task.doneDates] } : blankTask(opts.defaults);
    if (!this.t.category) this.t.category = plugin.settings.categories.find((c) => c.kind === "time")?.name || "";
    this.initial = JSON.stringify(this.t);
  }

  /** 有未保存修改时，标题旁显示「● 未保存」 */
  private syncDirty(): void {
    const dirty = this.editing && JSON.stringify(this.t) !== this.initial;
    this.titleEl.querySelector(".lubi-dirty")?.toggleClass("is-on", dirty);
  }

  onOpen(): void {
    this.modalEl.addClass("lubi-modal");
    // 捕获阶段监听：子控件 stopPropagation 也能更新「未保存」
    const dirtyCheck = () => window.setTimeout(() => this.syncDirty(), 0);
    for (const ev of ["input", "change", "click"]) this.contentEl.addEventListener(ev, dirtyCheck, true);
    this.render();
  }

  private render(focusTitle = true): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    const parent = this.t.parent ? this.plugin.tasks.byId(this.t.parent) : null;
    this.modalEl.addClass("lubi-record-modal", "lubi-task-modal");
    const s = this.plugin.settings;
    const cat = categoryOf(s, this.t.category);
    this.modalEl.style.setProperty("--chip", cat.color);
    titleEl.empty();
    titleEl.createSpan({ text: this.editing ? "编辑任务" : parent ? "新建子任务" : "新建任务" });
    if (parent) titleEl.createSpan({ cls: "lubi-modal-ctx", text: this.plugin.tasks.pathOf(parent).map((p) => p.title).join(" / ") });
    titleEl.createSpan({ cls: "lubi-dirty", text: "● 未保存", attr: { "aria-live": "polite" } });
    this.syncDirty();

    // 分类
    const cats = contentEl.createDiv({ cls: "lubi-cat-picker" });
    for (const c of s.categories.filter((c) => c.kind === "time")) {
      const b = cats.createEl("button", { cls: "lubi-cat-option", attr: { "aria-pressed": String(c.name === this.t.category) } });
      b.style.setProperty("--chip", c.color);
      icon(b, c.icon, "lubi-icon");
      b.createSpan({ text: c.name });
      b.addEventListener("click", (e) => {
        stopAll(e);
        this.t.category = c.name;
        this.render(false);
        (Array.from(contentEl.querySelectorAll<HTMLButtonElement>(".lubi-cat-option")).find((item) => item.textContent === c.name))?.focus();
      });
    }

    // 任务名
    const titleF = contentEl.createDiv({ cls: "lubi-field" });
    const titleLabel = titleF.createEl("label", { text: "任务" });
    const titleInput = titleF.createEl("input", { type: "text", value: this.t.title, attr: { placeholder: "要做什么" } });
    associate(titleLabel, titleInput);
    this.titleInput = titleInput;
    titleInput.addEventListener("input", () => { this.t.title = titleInput.value; clearFieldError(titleInput); });
    if (focusTitle) window.setTimeout(() => {
      const target = this.opts.focusDate && this.dateInput?.isConnected ? this.dateInput : titleInput;
      if (target.isConnected) target.focus();
    }, 20);

    // 安排：重复 · 日期 · 开始 · 预计
    const grid = contentEl.createDiv({ cls: "lubi-grid" });
    const repF = grid.createDiv({ cls: "lubi-field" });
    const repLabel = repF.createEl("label", { text: "重复" });
    const repSel = repF.createEl("select", { cls: "lubi-repeat-select" });
    associate(repLabel, repSel);
    this.repeatSelect = repSel;
    const kinds: [RepeatKind, string][] = [
      ["none", "不重复"],
      ["daily", "每天"],
      ["weekly", "每周几"],
      ["monthly", "每月几号"],
    ];
    for (const [k, l] of kinds) repSel.createEl("option", { value: k, text: l });
    repSel.value = this.t.repeat.kind;
    repSel.addEventListener("change", () => {
      this.t.repeat.kind = repSel.value as RepeatKind;
      this.t.repeat.days = [];
      this.render(false);
      this.contentEl.querySelector<HTMLSelectElement>(".lubi-repeat-select")?.focus();
    });
    if (this.t.repeat.kind === "none") {
      const dateF = grid.createDiv({ cls: "lubi-field" });
      const dateLabel = dateF.createEl("label", { text: "安排日期" });
      const date = dateF.createEl("input", { type: "date", value: this.t.date });
      associate(dateLabel, date);
      this.dateInput = date;
      date.addEventListener("change", () => (this.t.date = date.value));
    }
    const startF = grid.createDiv({ cls: "lubi-field" });
    const startLabel = startF.createEl("label", { text: "开始时间" });
    const start = startF.createEl("input", { type: "time", value: this.t.start });
    associate(startLabel, start);
    start.addEventListener("change", () => (this.t.start = start.value));
    const estF = grid.createDiv({ cls: "lubi-field" });
    const estLabel = estF.createEl("label", { text: "预计" });
    const estWrap = estF.createDiv({ cls: "lubi-timebar-dur lubi-timebar-dur-block" });
    const est = estWrap.createEl("input", { type: "text", value: this.t.estimate ? fmtDuration(this.t.estimate) : "", attr: { inputmode: "decimal", placeholder: "如 45min / 2.5h", autocomplete: "off" } });
    associate(estLabel, est);
    this.estimateInput = est;
    const estHint = estWrap.createSpan({ cls: "lubi-timebar-unit is-static" });
    const syncEst = () => {
      const v = parseEstimate(est.value);
      this.estimateInvalid = v === null;
      if (v !== null) this.t.estimate = v;
      estHint.setText(v === null ? "?" : v ? `${v} min` : "min");
    };
    syncEst();
    est.addEventListener("input", () => { clearFieldError(est); syncEst(); });
    est.addEventListener("blur", () => { if (!this.estimateInvalid && this.t.estimate) est.value = fmtDuration(this.t.estimate); });

    if (this.t.repeat.kind === "weekly") {
      const days = contentEl.createDiv({ cls: "lubi-days" });
      ["一", "二", "三", "四", "五", "六", "日"].forEach((l, i) => {
        const n = i + 1;
        const b = days.createEl("button", { cls: "lubi-quick-chip", text: `周${l}`, attr: { "aria-pressed": String(this.t.repeat.days.includes(n)) } });
        b.addEventListener("click", (e) => {
          stopAll(e);
          const has = this.t.repeat.days.includes(n);
          this.t.repeat.days = has ? this.t.repeat.days.filter((d) => d !== n) : [...this.t.repeat.days, n].sort();
          b.setAttribute("aria-pressed", String(!has));
        });
      });
    } else if (this.t.repeat.kind === "monthly") {
      const days = contentEl.createDiv({ cls: "lubi-days lubi-days-month" });
      for (let n = 1; n <= 31; n++) {
        const b = days.createEl("button", { cls: "lubi-quick-chip", text: String(n), attr: { "aria-pressed": String(this.t.repeat.days.includes(n)) } });
        b.addEventListener("click", (e) => {
          stopAll(e);
          const has = this.t.repeat.days.includes(n);
          this.t.repeat.days = has ? this.t.repeat.days.filter((d) => d !== n) : [...this.t.repeat.days, n].sort((a, b) => a - b);
          b.setAttribute("aria-pressed", String(!has));
        });
      }
    }

    // 可选：父任务 / 跨度 / 状态 / 备注
    const extras = contentEl.createDiv({ cls: "lubi-extras" });
    const toggles = extras.createDiv({ cls: "lubi-extras-toggles" });
    const fields = extras.createDiv({ cls: "lubi-extras-fields" });
    const optional = (label: string, iconName: string, build: (host: HTMLElement) => void, onClear: () => void, initiallyOpen: boolean) => {
      const tg = toggles.createEl("button", { cls: "lubi-ghost-btn" });
      icon(tg, iconName, "lubi-icon");
      tg.createSpan({ text: label });
      let box: HTMLElement | null = null;
      const open = () => {
        if (box) return;
        box = fields.createDiv({ cls: "lubi-field lubi-extra-field" });
        const head = box.createDiv({ cls: "lubi-extra-head" });
        head.createEl("label", { text: label });
        iconButton(head, "x", "收起", () => {
          box?.remove();
          box = null;
          tg.removeClass("is-open");
          onClear();
        }, "lubi-icon-btn-sm lubi-push-right");
        build(box);
        tg.addClass("is-open");
      };
      tg.addEventListener("click", (e) => {
        stopAll(e);
        open();
        (box?.querySelector("select, textarea, input") as HTMLElement | null)?.focus();
      });
      if (initiallyOpen) open();
    };
    optional("父任务", "corner-down-right", (host) => {
      const parentSel = host.createEl("select", { attr: { "aria-label": "父任务" } });
      parentSel.createEl("option", { value: "", text: "（无 · 顶层）" });
      const forbidden = new Set([this.t.id, ...this.plugin.tasks.descendants(this.t.id).map((d) => d.id)]);
      for (const cand of this.plugin.tasks.all.filter((x) => !forbidden.has(x.id) && x.status !== "done")) {
        parentSel.createEl("option", { value: cand.id, text: this.plugin.tasks.pathOf(cand).map((p) => p.title).join(" / ") });
      }
      parentSel.value = this.t.parent || "";
      parentSel.addEventListener("change", () => (this.t.parent = parentSel.value || null));
    }, () => (this.t.parent = null), !!this.t.parent);
    const spanLabel = this.t.repeat.kind === "none" ? "项目跨度" : "生效范围";
    optional(spanLabel, "calendar-range", (host) => {
      const row = host.createDiv({ cls: "lubi-grid lubi-grid-2" });
      const sdF = row.createDiv({ cls: "lubi-field" });
      const sdLabel = sdF.createEl("label", { text: this.t.repeat.kind === "none" ? "开始" : "从" });
      const sd = sdF.createEl("input", { type: "date", value: this.t.startDate });
      associate(sdLabel, sd);
      sd.addEventListener("change", () => (this.t.startDate = sd.value));
      const edF = row.createDiv({ cls: "lubi-field" });
      const edLabel = edF.createEl("label", { text: this.t.repeat.kind === "none" ? "截止" : "到" });
      const ed = edF.createEl("input", { type: "date", value: this.t.endDate });
      associate(edLabel, ed);
      ed.addEventListener("change", () => (this.t.endDate = ed.value));
    }, () => {
      this.t.startDate = "";
      this.t.endDate = "";
    }, !!(this.t.startDate || this.t.endDate));
    optional("状态", "circle-dot", (host) => {
      const row = host.createDiv({ cls: "lubi-inline" });
      const seg = row.createDiv({ cls: "lubi-seg lubi-status-seg", attr: { role: "group", "aria-label": "任务状态" } });
      const hint = host.createDiv({ cls: "lubi-status-hint", attr: { role: "status", "aria-live": "polite" } });
      // 只在改动后提示；未改动时不重复说明当前状态（选中态已足够清楚）
      const updateHint = () => {
        const label = { todo: "待办", doing: "进行中", done: "已完成" }[this.t.status];
        hint.setText(this.statusTouched ? `已选择「${label}」${this.t.blocked ? "，已标记受阻" : ""}，保存后生效` : "");
        hint.toggleClass("is-hidden", !this.statusTouched);
      };
      updateHint();
      for (const [v, l] of [["todo", "待办"], ["doing", "进行中"], ["done", "已完成"]] as [Task["status"], string][]) {
        const b = seg.createEl("button", { cls: "lubi-seg-item", attr: { type: "button", "data-task-status": v, "aria-pressed": String(this.t.status === v) } });
        b.createSpan({ cls: "lubi-status-check", text: "✓", attr: { "aria-hidden": "true" } });
        b.createSpan({ text: l });
        b.addEventListener("click", (e) => {
          stopAll(e);
          this.t.status = v;
          this.statusTouched = true;
          seg.querySelectorAll(".lubi-seg-item").forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          updateHint();
        });
      }
      const blocked = row.createEl("button", { cls: "lubi-quick-chip lubi-quick-chip-warn lubi-switch", attr: { type: "button", "aria-pressed": String(this.t.blocked) } });
      blocked.createSpan({ cls: "lubi-switch-track", attr: { "aria-hidden": "true" } }).createSpan({ cls: "lubi-switch-thumb" });
      blocked.createSpan({ text: "受阻" });
      blocked.title = "被外部因素卡住，列表里会显示提示";
      blocked.addEventListener("click", (e) => {
        stopAll(e);
        this.t.blocked = !this.t.blocked;
        this.statusTouched = true;
        blocked.setAttribute("aria-pressed", String(this.t.blocked));
        updateHint();
      });
    }, () => undefined, this.editing || this.t.blocked);
    optional("备注", "sticky-note", (host) => {
      const notes = host.createEl("textarea", { attr: { rows: "2", placeholder: "补一句上下文", "aria-label": "备注" } });
      notes.value = this.t.notes;
      notes.addEventListener("input", () => (this.t.notes = notes.value));
    }, () => (this.t.notes = ""), !!this.t.notes);

    const actions = contentEl.createDiv({ cls: "lubi-modal-actions" });
    if (this.editing) {
      const kids = this.plugin.tasks.descendants(this.t.id).length;
      const del = actions.createEl("button", { cls: "lubi-text-btn lubi-text-btn-danger lubi-push-left", text: "删除" });
      del.addEventListener("click", (e) => {
        stopAll(e);
        new ConfirmModal(this.app, "删除任务？", kids ? `会连同 ${kids} 个子任务一起删除。` : this.t.title, async () => {
          await this.plugin.tasks.remove(this.t.id);
          this.close();
          this.opts.onSaved?.(this.t);
        }, "删除").open();
      });
    }
    button(actions, "取消", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(actions, this.editing ? "保存" : "创建", () => void this.save(), { primary: true });
    ok.createSpan({ cls: "lubi-kbd", text: "⏎" });
    contentEl.onkeydown = (e) => {
      if (e.key === "Enter" && e.target === titleInput && !e.isComposing) {
        e.preventDefault();
        void this.save();
      }
    };
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    if (!this.t.title.trim()) {
      fieldError(this.titleInput, "任务名不能为空");
      return;
    }
    if (this.estimateInvalid) {
      fieldError(this.estimateInput, "预计时长写成 45min、2.5h 或 90 这样的格式");
      return;
    }
    if (this.t.repeat.kind !== "none" && this.t.repeat.kind !== "daily" && !this.t.repeat.days.length) {
      fieldError(this.repeatSelect, "选一下重复的日子");
      return;
    }
    if (this.t.status === "done" && !this.t.doneAt) this.t.doneAt = new Date().toISOString();
    if (this.t.status !== "done") this.t.doneAt = "";
    this.saving = true;
    try {
      const saved = await this.plugin.tasks.upsert(this.t);
      this.close();
      this.opts.onSaved?.(saved);
    } catch (e) {
      formError(this.contentEl, `无法保存：${(e as Error).message}`);
    } finally {
      this.saving = false;
    }
  }
}

