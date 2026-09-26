// 每日页：24h 时间轴（实线 = 记录，虚线 = 当天有开始时间的计划）+ 右侧当天分布 / 空白时段 / 未定时的计划。
// 计划只读展示：点计划块 = 按实际时间记一条并完成任务；排期仍在任务页。

import { Notice } from "obsidian";
import type LubiPlugin from "../main";
import { confirmed, isPending, ParsedLine, Rec } from "../core/records";
import { fmtDuration, fmtHours, hmToMin, minToHM, nowHM, shiftDate, shortDate, todayStr } from "../core/time";
import { dayTimeStats, invalidTimedSpan } from "../core/metrics";
import { categoryOf } from "../settings";
import { button, catChip, catDot, donut, el, emptyState, HOUR_PX, icon, iconButton, stopAll, tip, undoNotice } from "./components";
import { minuteAt, startDrag } from "./drag";
import { RecordModal } from "./modals";
import { addRecordAsDone, afterDone, completeFromRecord, dayTasks, deleteRecord, OpenRecord, syncLinkedTask } from "./taskList";
import type { Task } from "../core/tasks";

const PX_PER_MIN = HOUR_PX / 60;
const snap5 = (m: number) => Math.max(0, Math.min(1440, Math.round(m / 5) * 5));

interface Lane {
  row: ParsedLine;
  lane: number;
  lanes: number;
}

export async function renderToday(plugin: LubiPlugin, host: HTMLElement, date: string, rerender: () => void): Promise<void> {
  host.empty();
  host.addClass("lubi-today");
  const rows = await plugin.journal.read(date);
  const timed = rows.filter((r) => r.rec.minutes > 0).sort((a, b) => hmToMin(a.rec.start) - hmToMin(b.rec.start));
  const money = rows.filter((r) => r.rec.minutes <= 0);
  const stats = dayTimeStats(timed.map((row) => row.rec));
  const invalidRows = timed.filter((row) => invalidTimedSpan(row.rec));

  const openNew: OpenRecord = (defaults = {}, onRec) => new RecordModal(plugin.app, plugin, { date, defaults, onSaved: async (rec) => { if (rec && onRec) await onRec(rec); rerender(); } }).open();
  const openEdit = (row: ParsedLine) => new RecordModal(plugin.app, plugin, { date, rec: row.rec, line: row.line, onSaved: rerender }).open();

  // ---------- 左：时间轴 ----------
  // 标题行（引导 / 统计 / 跨日警告）单独占第一行，时间轴与右栏同在第二行，保证右栏顶部与时间轴框顶部对齐
  const top = host.createDiv({ cls: "lubi-today-top" });
  if (!plugin.settings.onboardingDone && plugin.journal.dates().length === 0) renderOnboarding(plugin, top, () => openNew());

  const tlHead = top.createDiv({ cls: "lubi-panel-head" });
  el(tlHead, "h3", "lubi-panel-title", "时间轴");
  el(tlHead, "span", "lubi-muted lubi-tl-stats", timed.length
    ? `记录 ${fmtHours(stats.recordedMinutes)} · 覆盖 ${fmtHours(stats.coveredMinutes)} · 空白 ${fmtHours(stats.emptyMinutes)}`
    : "还没有记录");
  if (stats.overlapMinutes) {
    // 并行记录不再占一整条横幅：统计行里一个可悬停的徽标 + 时间轴上的重叠标记
    const badge = tlHead.createSpan({ cls: "lubi-badge lubi-badge-overlap lubi-data-overlap", attr: { tabindex: "0", role: "note" } });
    icon(badge, "layers", "lubi-icon");
    badge.createSpan({ text: `并行 ${fmtDuration(stats.overlapMinutes)}` });
    tip(badge, `并行记录 ${fmtDuration(stats.overlapMinutes)}：记录时长可能大于实际覆盖时间。重叠的块会并排显示并带斜线标记。`);
  }
  const hint = tlHead.createSpan({ cls: "lubi-muted lubi-tl-hint" });
  icon(hint, "move-vertical", "lubi-icon");
  hint.createSpan({ text: "拖动移动 · 拉边缘改时长 · 空白处拖出新记录" });

  if (invalidRows.length) {
    const warning = top.createDiv({ cls: "lubi-data-warning", attr: { role: "status" } });
    warning.createDiv({ text: `${invalidRows.length} 条记录跨出当天。覆盖时间只按当天计算，请核对原记录。` });
    const links = warning.createDiv({ cls: "lubi-data-warning-links" });
    for (const row of invalidRows) button(links, `${row.rec.start} · ${row.rec.title}（${fmtHours(row.rec.minutes)}）`, () => openEdit(row), { cls: "lubi-btn-sm" });
  }
  const left = host.createDiv({ cls: "lubi-today-main" });
  const tlWrap = left.createDiv({ cls: "lubi-timeline-wrap" });
  const scroller = tlWrap.createDiv({ cls: "lubi-timeline-scroll" });
  const tl = scroller.createDiv({ cls: `lubi-timeline ${money.length ? "has-rail" : ""}`.trim(), attr: { tabindex: "0" } });
  tl.style.height = `${24 * HOUR_PX}px`;
  const gutter = tl.createDiv({ cls: "lubi-tl-gutter" });
  const hourLabels: HTMLElement[] = [];
  for (let h = 0; h <= 24; h++) {
    if (h < 24) {
      const line = tl.createDiv({ cls: `lubi-tl-line ${h === 0 ? "is-first" : ""}`.trim() });
      line.style.top = `${h * HOUR_PX}px`;
      const half = tl.createDiv({ cls: "lubi-tl-line lubi-tl-line-half" });
      half.style.top = `${(h + 0.5) * HOUR_PX}px`;
    }
    if (h > 0 && h < 24) {
      const lab = gutter.createSpan({ cls: "lubi-hour-label", text: `${String(h).padStart(2, "0")}:00` });
      lab.style.top = `${h * HOUR_PX}px`;
      hourLabels[h] = lab;
    }
  }
  const canvas = tl.createDiv({ cls: "lubi-tl-canvas" });
  // 悬停指示线
  const hover = canvas.createDiv({ cls: "lubi-tl-hover" });
  const hoverLabel = hover.createSpan({ cls: "lubi-tl-hover-label" });
  let dragging = false;
  canvas.addEventListener("pointermove", (e) => {
    if (dragging || (e.target as HTMLElement).closest(".lubi-block, .lubi-plan")) {
      hover.removeClass("is-on");
      return;
    }
    const m = snap5(minuteAt(e.clientY, canvas, PX_PER_MIN));
    hover.style.top = `${m * PX_PER_MIN}px`;
    hoverLabel.setText(minToHM(m));
    hover.addClass("is-on");
  });
  canvas.addEventListener("pointerleave", () => hover.removeClass("is-on"));

  if (date === todayStr()) {
    const nowMin = hmToMin(nowHM());
    const now = tl.createDiv({ cls: "lubi-now" });
    now.style.top = `${nowMin * PX_PER_MIN}px`;
    const nl = gutter.createSpan({ cls: "lubi-now-label", text: nowHM() });
    nl.style.top = `${nowMin * PX_PER_MIN}px`;
    const nearHour = Math.round(nowMin / 60);
    if (Math.abs(nowMin - nearHour * 60) <= 12 && hourLabels[nearHour]) hourLabels[nearHour].addClass("is-hidden");
  }

  // 所有记录边缘（Alt 吸附用）
  const edges = [...new Set(timed.flatMap((r) => [hmToMin(r.rec.start), hmToMin(r.rec.start) + r.rec.minutes]))];

  // 提交拖动结果（带撤销）
  const commit = async (row: ParsedLine, start: number, minutes: number) => {
    const old = row.rec;
    if (hmToMin(old.start) === start && old.minutes === minutes) return;
    // 拖到实际时间即视为已核对：去掉「待确认」
    const next: Rec = confirmed({ ...old, start: minToHM(start), minutes, extra: { ...old.extra } });
    try {
      await plugin.journal.update(date, row.line, next);
      await syncLinkedTask(plugin, old, next);
    } catch (e) {
      new Notice((e as Error).message, 6000);
      rerender();
      return;
    }
    undoNotice(`${next.title} → ${next.start}–${minToHM(start + minutes)}`, async () => {
      const line = await plugin.journal.findLine(date, next);
      if (line === null) return;
      await plugin.journal.update(date, line, old);
      await syncLinkedTask(plugin, next, old);
      rerender();
    });
    rerender();
  };

  let selected: { row: ParsedLine; el: HTMLElement } | null = null;
  const select = (row: ParsedLine, blockEl: HTMLElement) => {
    canvas.querySelectorAll(".lubi-block.is-selected").forEach((b) => b.removeClass("is-selected"));
    blockEl.addClass("is-selected");
    selected = { row, el: blockEl };
  };

  // ---------- 计划层：当天有开始时间、还没完成的任务，画在记录右侧的虚线列 ----------
  const planned = dayTasks(plugin, date);
  // 已经有关联记录的计划（比如用 ▶ 记过、还没勾完成）不再画虚线块，避免同一件事出现两次
  const loggedTasks = new Set(rows.map((r) => r.rec.task).filter((id): id is string => !!id));
  const openPlans = planned.filter((t) => !plugin.tasks.isDoneOn(t, date) && !loggedTasks.has(t.id));
  const timedPlans = openPlans.filter((t) => t.start);
  const untimedPlans = openPlans.filter((t) => !t.start);
  canvas.toggleClass("has-plans", timedPlans.length > 0);
  const logPlan = (t: Task) => openNew({
    title: t.title,
    category: t.category && categoryOf(plugin.settings, t.category).kind === "time" ? t.category : undefined,
    task: t.id,
    start: t.start || (date === todayStr() ? nowHM() : undefined),
    minutes: t.estimate || 30,
  }, (rec) => completeFromRecord(plugin, t.id, date, rec));
  if (timedPlans.length) {
    const lane = canvas.createDiv({ cls: "lubi-plan-lane", attr: { "aria-label": "当天计划" } });
    lane.createDiv({ cls: "lubi-plan-lane-title", text: "计划" });
    for (const t of timedPlans) {
      const cat = categoryOf(plugin.settings, t.category);
      const s0 = hmToMin(t.start);
      const mins = Math.max(15, t.estimate || 30);
      const h = Math.max(Math.min(mins, 1440 - s0) * PX_PER_MIN, 20);
      const pb = lane.createEl("button", { cls: "lubi-plan", attr: { type: "button" } });
      pb.style.top = `${s0 * PX_PER_MIN}px`;
      pb.style.height = `${h - 2}px`;
      pb.style.setProperty("--chip", cat.color);
      pb.toggleClass("is-compact", h < 34);
      const ph = pb.createDiv({ cls: "lubi-plan-head" });
      ph.createSpan({ cls: "lubi-plan-title", text: t.title });
      pb.createDiv({ cls: "lubi-plan-time", text: `${t.start}–${minToHM(s0 + mins)}` });
      const late = date === todayStr() && s0 + mins < hmToMin(nowHM());
      pb.toggleClass("is-late", late);
      tip(pb, `计划 ${t.start}–${minToHM(s0 + mins)} · ${t.title}${late ? "（已过计划时间）" : ""}。点击按实际时间记一条，保存后任务自动完成`);
      pb.addEventListener("pointerdown", (e) => e.stopPropagation());
      pb.addEventListener("click", (e) => {
        stopAll(e);
        logPlan(t);
      });
    }
  }

  const lanes = layoutLanes(timed);
  for (const { row, lane, lanes: n } of lanes) {
    const r = row.rec;
    const cat = categoryOf(plugin.settings, r.category);
    const block = canvas.createDiv({ cls: "lubi-block" });
    const startMin = hmToMin(r.start);
    const top = startMin * PX_PER_MIN;
    const invalid = invalidTimedSpan(r);
    const height = Math.max(Math.min(r.minutes, 1440 - startMin) * PX_PER_MIN, 18);
    block.style.top = `${top}px`;
    block.style.height = `${height - 2}px`;
    block.style.left = `calc(var(--lubi-rec-w) * ${lane / n} + ${lane ? 2 : 0}px)`;
    block.style.width = `calc(var(--lubi-rec-w) * ${1 / n} - ${lane ? 2 : 0}px)`;
    block.style.setProperty("--chip", cat.color);
    block.toggleClass("is-invalid", invalid);
    block.toggleClass("is-rest", !!cat.rest);
    block.toggleClass("is-parallel", n > 1);
    const pending = isPending(r);
    block.toggleClass("is-pending", pending);
    block.setAttribute("tabindex", "0");
    block.setAttribute("role", "button");
    block.addEventListener("focus", () => select(row, block));
    if (height < 30) block.addClass("lubi-block-compact");
    if (height >= 40) block.addClass("has-meta");
    if (height >= 56) block.addClass("lubi-block-tall");
    block.createDiv({ cls: "lubi-block-handle is-top" });
    block.createDiv({ cls: "lubi-block-handle is-bottom" });
    // 第一行：图标 · 标题 · 时长（紧跟标题，视线不必横跨整行）；第二行：时间段 · 关联 · 备注
    const head = block.createDiv({ cls: "lubi-block-head" });
    icon(head, cat.icon, "lubi-icon lubi-block-icon");
    head.createSpan({ cls: "lubi-block-title", text: r.title });
    if (pending) head.createSpan({ cls: "lubi-pending-badge", text: "待确认" });
    const durEl = head.createSpan({ cls: "lubi-block-dur", text: fmtDuration(r.minutes) });
    const meta = block.createDiv({ cls: "lubi-block-meta" });
    const timeEl = meta.createSpan({ cls: "lubi-block-time", text: invalid ? `${r.start} · 需校对` : `${r.start}–${minToHM(startMin + r.minutes)}` });
    const subParts = [r.task && plugin.tasks.byId(r.task) ? "关联任务" : "", r.notes || ""].filter(Boolean);
    if (subParts.length) meta.createSpan({ cls: "lubi-block-sub", text: subParts.join(" · ") });
    tip(block, `${invalid ? `${r.start} · 时长跨出当天，需校对` : `${r.start}–${minToHM(startMin + r.minutes)}`} ${r.category} · ${r.title}，${fmtDuration(r.minutes)}${r.notes ? `（${r.notes}）` : ""}。${pending ? "按计划自动记下，待确认：拖到实际时间或点 ✓。" : ""}${invalid ? "点击或回车校对" : "拖动移动 · 拉边缘改时长 · 回车编辑"}`);
    const acts = block.createDiv({ cls: "lubi-block-actions" });
    if (pending) iconButton(acts, "check", "确认：时间与计划一致", async () => {
      try {
        await plugin.journal.update(date, row.line, confirmed(r));
      } catch (e) {
        new Notice((e as Error).message, 6000);
      }
      rerender();
    });
    iconButton(acts, "pencil", "编辑", () => openEdit(row));
    iconButton(acts, "copy", "复制到明天", async () => {
      const copy: Rec = { ...r, date: plugin.shiftDate(date, 1), task: undefined, extra: { ...r.extra } };
      try {
        await addRecordAsDone(plugin, copy);
        new Notice(`已复制到 ${copy.date}`);
      } catch (e) {
        new Notice((e as Error).message);
      }
    });
    iconButton(acts, "trash-2", "删除", () => void deleteRecord(plugin, date, row, rerender));

    const live = (s: { start: number; minutes: number }) => {
      block.style.top = `${s.start * PX_PER_MIN}px`;
      block.style.height = `${Math.max(s.minutes * PX_PER_MIN, 18) - 2}px`;
      timeEl.setText(`${minToHM(s.start)}–${minToHM(s.start + s.minutes)}`);
      durEl.setText(fmtDuration(s.minutes));
      hover.style.top = `${s.start * PX_PER_MIN}px`;
      hoverLabel.setText(`${minToHM(s.start)} – ${minToHM(s.start + s.minutes)}`);
      hover.addClass("is-on");
    };
    const bind = (target: HTMLElement, mode: "move" | "resize-start" | "resize-end") => {
      target.addEventListener("pointerdown", (e) => {
        if ((e.target as HTMLElement).closest(".lubi-block-actions")) return;
        if (mode !== "move") e.stopPropagation();
        select(row, block);
        block.focus({ preventScroll: true });
        startDrag(e, {
          mode,
          start: startMin,
          minutes: r.minutes,
          pxPerMin: PX_PER_MIN,
          edges: edges.filter((x) => x !== startMin && x !== startMin + r.minutes),
          onStart: () => {
            dragging = true;
            block.addClass("is-dragging");
            block.addClass(mode === "move" ? "is-moving" : "is-resizing");
          },
          onMove: live,
          onEnd: (s) => {
            dragging = false;
            hover.removeClass("is-on");
            block.removeClass("is-dragging", "is-moving", "is-resizing");
            if (s === null) {
              live({ start: startMin, minutes: r.minutes });
              return;
            }
            if (!s.moved) {
              if (mode === "move") openEdit(row);
              return;
            }
            void commit(row, s.start, s.minutes);
          },
        });
      });
    };
    if (invalid) {
      block.addEventListener("click", (e) => {
        if (!(e.target as HTMLElement).closest(".lubi-block-actions")) openEdit(row);
      });
    } else {
      bind(block, "move");
      bind(block.querySelector(".lubi-block-handle.is-top") as HTMLElement, "resize-start");
      bind(block.querySelector(".lubi-block-handle.is-bottom") as HTMLElement, "resize-end");
    }
  }

  // 时间黑洞：≥30 分钟的空白段，悬停显示「记这段」（借鉴 Timing / Toggl 的事后补记）
  const gaps = blackHoles(timed.map((row) => row.rec), date);
  for (const g of gaps) {
    const gap = canvas.createDiv({ cls: "lubi-gap" });
    gap.style.top = `${g.start * PX_PER_MIN + 1}px`;
    gap.style.height = `${g.minutes * PX_PER_MIN - 2}px`;
    const fill = gap.createEl("button", { cls: "lubi-gap-btn", attr: { type: "button", "aria-label": `补记空白 ${minToHM(g.start)}–${minToHM(g.start + g.minutes)}，${fmtDuration(g.minutes)}` } });
    icon(fill, "plus", "lubi-icon");
    fill.createSpan({ text: `记这段 · ${minToHM(g.start)}–${minToHM(g.start + g.minutes)} · ${fmtDuration(g.minutes)}` });
    fill.addEventListener("pointerdown", (e) => e.stopPropagation());
    fill.addEventListener("click", (e) => {
      stopAll(e);
      openNew({ start: minToHM(g.start), minutes: g.minutes });
    });
  }

  // 空白处：按下拖出一条新记录
  const ghost = canvas.createDiv({ cls: "lubi-block lubi-block-ghost" });
  const ghostLabel = ghost.createDiv({ cls: "lubi-block-head" });
  canvas.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".lubi-block, .lubi-gap-btn, .lubi-plan")) return;
    const at = snap5(minuteAt(e.clientY, canvas, PX_PER_MIN));
    startDrag(e, {
      mode: "create",
      start: at,
      minutes: 0,
      pxPerMin: PX_PER_MIN,
      minMinutes: 15,
      edges,
      onStart: () => {
        dragging = true;
        ghost.addClass("is-on");
      },
      onMove: (s) => {
        ghost.style.top = `${s.start * PX_PER_MIN}px`;
        ghost.style.height = `${s.minutes * PX_PER_MIN - 2}px`;
        ghostLabel.setText(`${minToHM(s.start)} – ${minToHM(s.start + s.minutes)} · ${fmtDuration(s.minutes)}`);
        hover.style.top = `${s.start * PX_PER_MIN}px`;
        hoverLabel.setText(minToHM(s.start));
        hover.addClass("is-on");
      },
      onEnd: (s) => {
        dragging = false;
        ghost.removeClass("is-on");
        hover.removeClass("is-on");
        if (!s || !s.moved) return;
        openNew({ start: minToHM(s.start), minutes: s.minutes });
      },
    });
  });
  canvas.addEventListener("dblclick", (e) => {
    if ((e.target as HTMLElement).closest(".lubi-block, .lubi-gap-btn, .lubi-plan")) return;
    const m = Math.round(minuteAt(e.clientY, canvas, PX_PER_MIN) / 15) * 15;
    openNew({ start: minToHM(m) });
  });

  // 键盘：选中块后 ↑↓ 移动 5 分钟，Shift+↑↓ 改时长，Enter 编辑，Delete 删除
  tl.addEventListener("keydown", (e) => {
    if (!selected || (e.target !== tl && !(e.target as HTMLElement).classList.contains("lubi-block"))) return;
    const r = selected.row.rec;
    if (invalidTimedSpan(r) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      new Notice("请先在编辑表单校对这条跨日记录的时长");
      return;
    }
    const s = hmToMin(r.start);
    const step = e.altKey ? 1 : 5;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const d = e.key === "ArrowUp" ? -step : step;
      if (e.shiftKey) void commit(selected.row, s, Math.max(5, Math.min(1440 - s, r.minutes + d)));
      else void commit(selected.row, Math.max(0, Math.min(1440 - r.minutes, s + d)), r.minutes);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEdit(selected.row);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void deleteRecord(plugin, date, selected.row, rerender);
    } else if (e.key === "Escape") {
      selected.el.removeClass("is-selected");
      selected = null;
    }
  });

  // 财务记录：只有存在时才显示右侧栏
  if (money.length) {
    const rail = tl.createDiv({ cls: "lubi-tl-rail" });
    for (const row of money) {
      const r = row.rec;
      const cat = categoryOf(plugin.settings, r.category);
      const pin = rail.createEl("button", { cls: "lubi-pin", attr: { type: "button", "aria-label": `${r.start} ${r.category} ${r.title}${r.amount !== undefined ? `，¥${r.amount}` : ""}。点击编辑。` } });
      pin.style.top = `${hmToMin(r.start) * PX_PER_MIN}px`;
      pin.style.setProperty("--chip", cat.color);
      icon(pin, cat.icon, "lubi-icon");
      pin.createSpan({ cls: "lubi-pin-title", text: r.title });
      if (r.amount !== undefined) pin.createSpan({ cls: "lubi-pin-amt", text: `¥${r.amount}` });
      pin.addEventListener("click", (e) => {
        stopAll(e);
        openEdit(row);
      });
    }
  }
  // 首屏位置：今天 = max(首条记录, 现在 − 2h)；其他日期 = 首条记录（没有则 06:00）
  const firstStart = timed.length ? hmToMin(timed[0].rec.start) : null;
  const targetMin = date === todayStr()
    ? Math.max(firstStart ?? 0, hmToMin(nowHM()) - 120)
    : firstStart ?? 6 * 60;
  const targetPx = Math.max(0, Math.round(targetMin * PX_PER_MIN - 16));
  scroller.dataset.scrollTarget = String(targetPx);

  // 视口外还有记录时的浮标：「↑ 更早 2 条」「↓ 更晚 1 条」，点击平滑滚到最近的一条
  const moreUp = tlWrap.createEl("button", { cls: "lubi-tl-more is-up", attr: { type: "button" } });
  const moreDown = tlWrap.createEl("button", { cls: "lubi-tl-more is-down", attr: { type: "button" } });
  const spans = timed.map((row) => ({ start: hmToMin(row.rec.start), end: Math.min(1440, hmToMin(row.rec.start) + row.rec.minutes) }));
  const scrollToMin = (m: number) => {
    const top = Math.max(0, m * PX_PER_MIN - 24);
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior: "smooth" });
    else scroller.scrollTop = top;
  };
  const updateMore = () => {
    const h = scroller.clientHeight;
    const topMin = scroller.scrollTop / PX_PER_MIN;
    const bottomMin = (scroller.scrollTop + h) / PX_PER_MIN;
    const above = h ? spans.filter((x) => x.end <= topMin + 1) : [];
    const below = h ? spans.filter((x) => x.start >= bottomMin - 1) : [];
    moreUp.toggleClass("is-on", above.length > 0);
    moreDown.toggleClass("is-on", below.length > 0);
    moreUp.setText(above.length ? `↑ 更早 ${above.length} 条 · ${minToHM(above[0].start)}–${minToHM(above[above.length - 1].end)}` : "");
    moreDown.setText(below.length ? `↓ 更晚 ${below.length} 条 · ${minToHM(below[0].start)} 起` : "");
    moreUp.onclick = () => above.length && scrollToMin(above[above.length - 1].start);
    moreDown.onclick = () => below.length && scrollToMin(below[0].start);
  };
  scroller.addEventListener("scroll", updateMore, { passive: true });
  window.requestAnimationFrame(() => {
    if (!scroller.dataset.restored) scroller.scrollTop = targetPx;
    updateMore();
  });

  // ---------- 右：摘要 ----------
  const side = host.createDiv({ cls: "lubi-today-side" });
  renderSummary(plugin, side, rows.map((r) => r.rec), date);
  renderPlanCard(plugin, side, date, planned, openPlans.length, untimedPlans, logPlan, rerender);
  renderGapCard(side, gaps, scrollToMin, openNew);
}

/** 当天计划的完成情况 + 没定时间的计划（定了时间的已经画在时间轴上，不重复列出） */
function renderPlanCard(plugin: LubiPlugin, side: HTMLElement, date: string, planned: Task[], openCount: number, untimed: Task[], logPlan: (t: Task) => void, rerender: () => void): void {
  if (!planned.length) return;
  const card = side.createDiv({ cls: "lubi-card lubi-plan-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", date === todayStr() ? "今日计划" : "当天计划");
  const done = planned.length - openCount;
  head.createSpan({ cls: "lubi-muted", text: `${done}/${planned.length} 已做` });
  const bar = card.createDiv({ cls: "lubi-plan-progress", attr: { role: "meter", "aria-valuemin": "0", "aria-valuemax": String(planned.length), "aria-valuenow": String(done), "aria-label": "计划完成度（已完成或已有记录）" } });
  bar.createDiv({ cls: "lubi-plan-progress-fill" }).style.width = `${Math.round((done / planned.length) * 100)}%`;
  if (!untimed.length) {
    card.createDiv({ cls: "lubi-muted lubi-plan-note", text: done === planned.length ? "都完成了。" : "定了时间的计划画在时间轴右侧的虚线列里，点一下即可记录。" });
    return;
  }
  card.createDiv({ cls: "lubi-muted lubi-plan-note", text: "没定时间：" });
  const list = card.createDiv({ cls: "lubi-plan-list" });
  for (const t of untimed) {
    const cat = categoryOf(plugin.settings, t.category);
    const row = list.createDiv({ cls: "lubi-plan-row" });
    const b = row.createEl("button", { cls: "lubi-plan-row-main", attr: { type: "button" } });
    if (t.category) catDot(b, cat);
    b.createSpan({ cls: "lubi-plan-row-title", text: t.title });
    if (t.estimate) b.createSpan({ cls: "lubi-muted lubi-plan-row-est", text: fmtDuration(t.estimate) });
    tip(b, `记一条「${t.title}」，保存后任务自动完成`);
    b.addEventListener("click", () => logPlan(t));
    iconButton(row, "check", `按预计时长直接完成「${t.title}」（记录标为待确认）`, async () => {
      try {
        await plugin.tasks.toggleDone(t.id, date);
        await afterDone(plugin, t, date, undefined, rerender);
      } catch (e) {
        new Notice(`任务更新失败：${(e as Error).message}`, 6000);
      }
      rerender();
    }, "lubi-plan-row-done");
  }
}

/** 空白时段：最长的几段，点一下滚到那里 / 直接补记 */
function renderGapCard(side: HTMLElement, gaps: { start: number; minutes: number }[], scrollTo: (m: number) => void, openNew: OpenRecord): void {
  if (!gaps.length) return;
  const card = side.createDiv({ cls: "lubi-card lubi-gap-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "空白时段");
  const total = gaps.reduce((s, g) => s + g.minutes, 0);
  head.createSpan({ cls: "lubi-muted", text: `${gaps.length} 段 · ${fmtHours(total)}` });
  const list = card.createDiv({ cls: "lubi-gap-list" });
  const top = gaps.slice().sort((a, b) => b.minutes - a.minutes).slice(0, 4).sort((a, b) => a.start - b.start);
  for (const g of top) {
    const row = list.createDiv({ cls: "lubi-gap-row" });
    const jump = row.createEl("button", { cls: "lubi-gap-row-main", attr: { type: "button" } });
    jump.createSpan({ cls: "lubi-gap-row-time", text: `${minToHM(g.start)}–${minToHM(g.start + g.minutes)}` });
    jump.createSpan({ cls: "lubi-muted", text: fmtDuration(g.minutes) });
    tip(jump, "在时间轴上定位");
    jump.addEventListener("click", () => scrollTo(g.start));
    iconButton(row, "plus", `补记 ${minToHM(g.start)}–${minToHM(g.start + g.minutes)}`, () => openNew({ start: minToHM(g.start), minutes: g.minutes }), "lubi-gap-row-add");
  }
  if (gaps.length > top.length) card.createDiv({ cls: "lubi-muted lubi-plan-note", text: `另有 ${gaps.length - top.length} 段较短的空白` });
}

/** 当天 ≥ minGap 分钟的空白段。今天只算到此刻，未来日期没有黑洞。 */
export function blackHoles(recs: readonly Rec[], date: string, minGap = 30): { start: number; minutes: number }[] {
  const today = todayStr();
  const limit = date < today ? 1440 : date === today ? hmToMin(nowHM()) : 0;
  if (limit <= 0) return [];
  const spans = recs
    .filter((r) => r.minutes > 0 && !invalidTimedSpan(r))
    .map((r) => [hmToMin(r.start), Math.min(1440, hmToMin(r.start) + r.minutes)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: { start: number; minutes: number }[] = [];
  let cursor = 0;
  for (const [s, e] of spans) {
    if (s > cursor) {
      const end = Math.min(s, limit);
      if (end - cursor >= minGap) out.push({ start: cursor, minutes: end - cursor });
    }
    cursor = Math.max(cursor, e);
    if (cursor >= limit) break;
  }
  if (limit - cursor >= minGap) out.push({ start: cursor, minutes: limit - cursor });
  return out;
}

function layoutLanes(rows: ParsedLine[]): Lane[] {
  // 贪心分道：重叠的记录并排显示
  const out: Lane[] = [];
  let cluster: ParsedLine[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placed: { row: ParsedLine; lane: number }[] = [];
    for (const row of cluster) {
      const s = hmToMin(row.rec.start);
      let lane = laneEnds.findIndex((e) => e <= s);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = s + row.rec.minutes;
      placed.push({ row, lane });
    }
    for (const p of placed) out.push({ ...p, lanes: laneEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const row of rows) {
    const s = hmToMin(row.rec.start);
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push(row);
    clusterEnd = Math.max(clusterEnd, s + row.rec.minutes);
  }
  flush();
  return out;
}

function renderSummary(plugin: LubiPlugin, side: HTMLElement, recs: Rec[], date: string): void {
  const card = side.createDiv({ cls: "lubi-card" });
  el(card, "h3", "lubi-panel-title", date === todayStr() ? "今日分布" : `${shortDate(date)} 分布`);
  const byCat = new Map<string, number>();
  let total = 0;
  for (const r of recs) {
    if (r.minutes <= 0) continue;
    byCat.set(r.category, (byCat.get(r.category) || 0) + r.minutes);
    total += r.minutes;
  }
  if (!total) {
    card.createDiv({ cls: "lubi-muted", text: "记录后这里会显示时间去向。" });
  } else {
    const wrap = card.createDiv({ cls: "lubi-donut-wrap" });
    const slices = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ label: name, value: v, color: categoryOf(plugin.settings, name).color }));
    const covered = dayTimeStats(recs).coveredMinutes;
    donut(wrap, slices, fmtHours(total), `覆盖 ${Math.round((covered / 1440) * 100)}%`);
    const list = wrap.createDiv({ cls: "lubi-legend" });
    for (const s of slices) {
      const li = list.createDiv({ cls: "lubi-legend-row lubi-legend-bar" });
      li.style.setProperty("--pct", `${Math.round((s.value / total) * 100)}%`);
      li.style.setProperty("--dot", s.color);
      catDot(li, categoryOf(plugin.settings, s.label));
      li.createSpan({ cls: "lubi-legend-name", text: s.label });
      li.createSpan({ cls: "lubi-legend-val", text: fmtHours(s.value) });
      li.createSpan({ cls: "lubi-muted lubi-legend-pct", text: `${Math.round((s.value / total) * 100)}%` });
    }
  }
  const spend = recs.filter((r) => r.amount !== undefined && !isNaN(r.amount));
  if (spend.length) {
    const sum = spend.reduce((s, r) => s + (r.amount || 0), 0);
    const row = card.createDiv({ cls: "lubi-kv" });
    row.createSpan({ text: date === todayStr() ? "今日支出" : `${shortDate(date)} 支出` });
    row.createSpan({ cls: "lubi-kv-val", text: `¥${sum.toFixed(2)} · ${spend.length} 笔` });
  }
}

function renderOnboarding(plugin: LubiPlugin, host: HTMLElement, onAdd: () => void): void {
  const box = host.createDiv({ cls: "lubi-onboard" });
  const head = box.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "三步上手");
  iconButton(head, "x", "不再显示", async () => {
    plugin.settings.onboardingDone = true;
    await plugin.saveSettings();
    box.remove();
  }, "lubi-push-right");
  const steps = box.createDiv({ cls: "lubi-steps" });
  const step = (n: string, t: string, d: string) => {
    const s = steps.createDiv({ cls: "lubi-step" });
    s.createSpan({ cls: "lubi-step-n", text: n });
    const b = s.createDiv();
    b.createDiv({ cls: "lubi-step-t", text: t });
    b.createDiv({ cls: "lubi-muted", text: d });
  };
  step("1", "做完一件事就记一条", "写做了什么、从几点开始、用了多久。时间轴上留白的地方，就是时间黑洞。");
  step("2", "回顾页看时间去向", "按周 / 月汇总每个分类的小时数，这是柳比歇夫法的核心：月末算账。");
  step("3", "任务页安排明天", "把待办拖到日程表上；勾掉一个任务，时间轴上就自动记下这段时间。");
  button(box, "记第一条", onAdd, { primary: true, icon: "plus" });
  void catChip;
  void emptyState;
}
