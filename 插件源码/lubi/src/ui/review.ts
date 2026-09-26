// 回顾页：周 / 月 / 年 汇总。柳比歇夫法的核心是"月末算账"。

import type LubiPlugin from "../main";
import { isPending, Rec } from "../core/records";
import { eachDate, fmtDuration, fmtHours, monthEnd, monthStart, parseDate, shiftDate, shortDate, weekStart, weekdayZh, todayStr, dateStr } from "../core/time";
import { categoryOf } from "../settings";
import { dayTimeStats } from "../core/metrics";
import { button, catDot, el, emptyState, hoverTip, icon, iconButton, segmented, tip } from "./components";

export type Period = "week" | "month" | "year";

export interface ReviewState {
  period: Period;
  anchor: string; // 任一日期，用于定位周期
  display?: "chart" | "table";
}

interface Bucket {
  key: string;
  label: string;
  dates: string[];
}

export async function renderReview(plugin: LubiPlugin, host: HTMLElement, state: ReviewState, setState: (s: Partial<ReviewState>) => void): Promise<void> {
  host.empty();
  host.addClass("lubi-review");
  const { from, to, label, buckets } = range(state);

  // 工具条
  const bar = host.createDiv({ cls: "lubi-toolbar" });
  segmented<Period>(bar, [
    { id: "week", label: "周" },
    { id: "month", label: "月" },
    { id: "year", label: "年" },
  ], state.period, (p) => setState({ period: p }));
  const nav = bar.createDiv({ cls: "lubi-nav" });
  iconButton(nav, "chevron-left", "上一个", () => setState({ anchor: step(state, -1) }));
  nav.createSpan({ cls: "lubi-nav-label", text: label });
  iconButton(nav, "chevron-right", "下一个", () => setState({ anchor: step(state, 1) }));
  const todayBtn = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm", text: "本期" });
  todayBtn.addEventListener("click", () => setState({ anchor: todayStr() }));

  const existing = new Set(plugin.journal.dates());
  const dates = eachDate(from, to).filter((d) => existing.has(d));
  const data = await plugin.journal.readRange(dates);
  const all: Rec[] = [];
  for (const recs of data.values()) all.push(...recs);
  const timed = all.filter((r) => r.minutes > 0);
  const total = timed.reduce((s, r) => s + r.minutes, 0);
  const dailyStats = new Map([...data].map(([date, recs]) => [date, dayTimeStats(recs)] as const));
  const invalidDates = [...dailyStats].filter(([, stats]) => stats.invalidCount).map(([date]) => date).sort();

  if (!timed.length && !all.length) {
    emptyState(host, "calendar-search", `${label} 没有记录`, "切换周期，或回到每日页补记。");
    return;
  }

  // 上一期（用于环比与趋势说明）
  const previous = range({ period: state.period, anchor: step(state, -1) });
  const oldDates = eachDate(previous.from, previous.to).filter((date) => existing.has(date));
  const oldData = await plugin.journal.readRange(oldDates);
  const oldTimed = [...oldData.values()].flat().filter((rec) => rec.minutes > 0);
  const oldDays = new Set(oldTimed.map((rec) => rec.date)).size;
  const oldInvalid = [...oldData.values()].some((recs) => dayTimeStats(recs).invalidCount);
  const oldTotal = oldTimed.reduce((sum, rec) => sum + rec.minutes, 0);

  // KPI：1 张主卡（总时长 + 环比）+ 4 张次卡
  const daysLogged = new Set(timed.map((r) => r.date)).size;
  const spend = all.filter((r) => r.amount !== undefined && !isNaN(r.amount));
  const kpis = host.createDiv({ cls: "lubi-kpis lubi-kpis-v2" });
  const primary = kpi(kpis, "记录总时长", fmtHours(total), undefined, "is-primary");
  const minDays = state.period === "week" ? 2 : state.period === "month" ? 5 : 14;
  if (!invalidDates.length && !oldInvalid && oldTotal > 0 && daysLogged >= minDays && oldDays >= minDays) {
    const pct = Math.round(((total - oldTotal) / oldTotal) * 100);
    const delta = primary.createDiv({ cls: `lubi-kpi-delta ${pct >= 0 ? "is-up" : "is-down"}` });
    delta.createSpan({ text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}%` });
    delta.createSpan({ cls: "lubi-muted", text: ` 较上一期 ${fmtHours(oldTotal)}` });
  } else {
    primary.createDiv({ cls: "lubi-muted lubi-kpi-sub", text: invalidDates.length ? "有待校对的异常日，暂不做环比" : "上一期记录不足，暂不做环比" });
  }
  // 按计划自动记下、还没核对的记录：时长是估计值，单独提示，避免把「计划」当成「实际」
  const pendingRecs = timed.filter((r) => isPending(r));
  if (pendingRecs.length) {
    const pm = pendingRecs.reduce((sum, r) => sum + r.minutes, 0);
    const note = primary.createDiv({ cls: "lubi-kpi-pending" });
    note.setText(`其中 ${fmtHours(pm)} 按计划估计 · ${pendingRecs.length} 条待确认`);
    tip(note, "勾选任务时按计划时间 / 预计时长自动生成的记录。在每日页拖到实际时间或点 ✓ 确认后计入实际。");
  }
  const secondary = kpis.createDiv({ cls: "lubi-kpi-grid" });
  kpi(secondary, "有记录的天数", `${daysLogged} / ${eachDate(from, to).filter((d) => d <= todayStr()).length}`);
  if (invalidDates.length) {
    const validDays = [...dailyStats].filter(([, st]) => !st.invalidCount && st.recordedMinutes > 0);
    const validAvg = validDays.length ? validDays.reduce((sum2, [, st]) => sum2 + st.recordedMinutes, 0) / validDays.length : 0;
    kpi(secondary, "有效日均", validDays.length ? fmtHours(validAvg) : "—", `剔除 ${invalidDates.length} 个待校对异常日后计算`);
  } else {
    kpi(secondary, "日均记录", daysLogged ? fmtHours(total / daysLogged) : "—", "有记录的天");
  }
  const coveredTotal = [...dailyStats.values()].reduce((sum2, stats) => sum2 + stats.coveredMinutes, 0);
  kpi(secondary, "覆盖率", daysLogged ? `${Math.round((coveredTotal / (daysLogged * 1440)) * 100)}%` : "—", "有记录日的区间并集 / 24h");
  kpi(secondary, "支出", spend.length ? `¥${spend.reduce((s2, r) => s2 + (r.amount || 0), 0).toFixed(0)}` : "¥0", spend.length ? `${spend.length} 笔` : "本期没有支出");

  if (invalidDates.length) {
    // 异常提示压成一行：说明 + 直接可点的校对按钮；柱顶另有 ⚠ 徽标
    const warning = host.createDiv({ cls: "lubi-data-warning is-compact", attr: { role: "status" } });
    icon(warning, "triangle-alert", "lubi-icon lubi-warning-icon");
    warning.createSpan({ cls: "lubi-warning-text", text: `${invalidDates.length} 天有跨出当日的记录，统计按日边界截断。` });
    let links: HTMLElement;
    if (invalidDates.length > 5) {
      const details = warning.createEl("details");
      details.createEl("summary", { text: `展开 ${invalidDates.length} 个待校对日期` });
      links = details.createDiv({ cls: "lubi-data-warning-links" });
    } else links = warning.createDiv({ cls: "lubi-data-warning-links" });
    for (const date of invalidDates) button(links, `校对 ${date}`, () => plugin.openDate(date), { cls: "lubi-btn-sm" });
  } else {
    const insight = host.createDiv({ cls: "lubi-insight", attr: { role: "status" } });
    if (daysLogged >= minDays && oldDays >= minDays && !oldInvalid) {
      const currentAvg = total / daysLogged;
      const oldAvg = oldTotal / oldDays;
      const change = currentAvg - oldAvg;
      insight.createSpan({ text: `有记录日的日均 ${fmtHours(currentAvg)}，较上一期${change >= 0 ? "多" : "少"} ${fmtHours(Math.abs(change))}。仅比较有记录的天，不代表效率好坏。` });
    } else {
      insight.createSpan({ text: `本期已记录 ${daysLogged} 天；两期各有至少 ${minDays} 天有效记录时，才显示有依据的趋势对比。` });
    }
  }

  // 堆叠柱：纵轴 24h 封顶（年视图按最大月），无底轨，横向网格 + 日均线 + tooltip
  const catOrder = plugin.settings.categories.map((c) => c.name);
  // 堆叠自下而上 = 图例自左而右；「背景时间」（睡眠）固定在最底层
  const isRest = (c: string) => !!categoryOf(plugin.settings, c).rest;
  const cats = [...new Set(timed.map((r) => r.category))].sort((a, b) => {
    if (isRest(a) !== isRest(b)) return isRest(a) ? -1 : 1;
    const ia = catOrder.indexOf(a);
    const ib = catOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const chart = host.createDiv({ cls: "lubi-card lubi-chart-card" });
  const chartHead = chart.createDiv({ cls: "lubi-panel-head" });
  el(chartHead, "h3", "lubi-panel-title", state.period === "year" ? "每月记录时长" : "每日记录时长");
  segmented<"chart" | "table">(chartHead, [{ id: "chart", label: "图表" }, { id: "table", label: "表格" }], state.display || "chart", (display) => setState({ display })).addClass("lubi-chart-mode");
  const legend = chartHead.createDiv({ cls: "lubi-chart-legend lubi-push-right" });
  for (const c of cats) {
    const li = legend.createSpan({ cls: "lubi-chart-legend-item" });
    catDot(li, categoryOf(plugin.settings, c));
    li.createSpan({ text: c });
  }
  const bucketTotals = buckets.map((b) => b.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0).reduce((s, r) => s + r.minutes, 0));
  const bucketStats = buckets.map((b) => b.dates.reduce((result, date) => {
    const stats = dailyStats.get(date);
    if (stats) {
      result.covered += stats.coveredMinutes;
      result.overlap += stats.overlapMinutes;
      result.invalid += stats.invalidCount;
    }
    return result;
  }, { covered: 0, overlap: 0, invalid: 0 }));
  const isYear = state.period === "year";
  const cap = isYear ? Math.max(60, ...bucketTotals) : 1440;
  const ticks = isYear ? niceTicks(cap) : [360, 720, 1080, 1440];
  const chartBox = chart.createDiv({ cls: `lubi-chart ${state.period === "month" ? "is-dense" : ""}`.trim() });
  chartBox.hidden = state.display === "table";
  const gridEl = chartBox.createDiv({ cls: "lubi-chart-grid" });
  for (const t of ticks) {
    const g = gridEl.createDiv({ cls: "lubi-chart-gridline" });
    g.style.bottom = `${(t / cap) * 100}%`;
    g.createSpan({ cls: "lubi-chart-tick", text: fmtHours(t) });
  }
  const loggedBuckets = bucketTotals.filter((v, i) => v > 0 && !bucketStats[i].invalid).map((v) => Math.min(v, cap));
  if (loggedBuckets.length > 1) {
    const avg = loggedBuckets.reduce((s, v) => s + v, 0) / loggedBuckets.length;
    const a = gridEl.createDiv({ cls: "lubi-chart-avg" });
    a.style.bottom = `${Math.min(100, (avg / cap) * 100)}%`;
    a.createSpan({ cls: "lubi-chart-avg-label", text: `${invalidDates.length ? "有效日均" : "均"} ${fmtHours(avg)}` });
  }
  const bars = chartBox.createDiv({ cls: "lubi-bars" });
  const today = todayStr();
  buckets.forEach((b, i) => {
    const recs = b.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0);
    const bt = bucketTotals[i];
    const isFuture = b.dates[0] > today;
    const stats = bucketStats[i];
    // 柱子已有自绘的悬浮明细卡：读屏文字放进隐藏的 span，不用 aria-label，免得 Obsidian 再叠一个提示
    const col = bars.createEl("button", { cls: `lubi-bar-col ${b.dates.includes(today) ? "is-today" : ""} ${isFuture ? "is-future" : ""} ${bt ? "" : "is-empty"}`.trim(), attr: { type: "button" } });
    col.createSpan({ cls: "lubi-sr-only", text: `${b.label}，记录 ${fmtHours(bt)}，覆盖 ${fmtHours(stats.covered)}${stats.invalid ? "，存在待校对记录" : stats.overlap ? `，并行 ${fmtDuration(stats.overlap)}` : ""}。按回车查看` });
    col.dataset.idx = String(i);
    const stack = col.createDiv({ cls: "lubi-bar-stack" });
    const over = bt > cap + 1;
    stack.style.height = `${Math.min(100, (bt / cap) * 100)}%`;
    if (bt) {
      for (const c of cats) {
        const v = sum(recs, c);
        if (!v) continue;
        const seg = stack.createDiv({ cls: `lubi-bar-seg ${isRest(c) ? "is-rest" : ""}`.trim() });
        seg.style.flexBasis = `${(v / bt) * 100}%`;
        seg.style.setProperty("--chip", categoryOf(plugin.settings, c).color);
        seg.style.background = categoryOf(plugin.settings, c).color;
      }
      const val = stack.createDiv({ cls: "lubi-bar-val", text: fmtHours(bt) });
      if (stats.invalid) {
        val.addClass("is-over");
        val.setText(`⚠ ${fmtHours(bt)}`);
        stack.addClass("is-over");
      } else if (over) {
        val.addClass("is-parallel");
        val.setText(`∥ ${fmtHours(bt)}`);
      }
    }
    col.createDiv({ cls: "lubi-bar-label", text: b.label });
    col.addEventListener("click", () => {
      if (isYear) setState({ period: "month", anchor: b.dates[0] });
      else plugin.openDate(b.dates[0]);
    });
  });
  hoverTip(bars, ".lubi-bar-col", (t) => {
    const i = Number(t.dataset.idx);
    const b = buckets[i];
    const bt = bucketTotals[i];
    const recs = b.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0);
    const head = isYear ? b.label : `周${weekdayZh(b.dates[0])} ${shortDate(b.dates[0])}`;
    if (!bt) return [`${head} · 没有记录`];
    const rows: (string | HTMLElement)[] = [`${head} · ${fmtHours(bt)}`];
    const stats = bucketStats[i];
    if (stats.invalid) rows.push("⚠ 有记录跨出当天，点击后校对");
    else if (bt > cap + 1 && !isYear) rows.push("∥ 有并行记录，柱高已截断");
    rows.push(`实际覆盖 ${fmtHours(stats.covered)}${stats.overlap ? ` · 并行 ${fmtDuration(stats.overlap)}` : ""}`);
    for (const c of cats) {
      const v = sum(recs, c);
      if (!v) continue;
      const line = document.createElement("div");
      line.className = "lubi-tip-row";
      const d = document.createElement("span");
      d.className = "lubi-dot";
      d.style.setProperty("--dot", categoryOf(plugin.settings, c).color);
      line.append(d, `${c} ${fmtHours(v)}`, ` · ${Math.round((v / bt) * 100)}%`);
      rows.push(line);
    }
    return rows;
  });

  const tableWrap = chart.createDiv({ cls: "lubi-review-table-wrap" });
  tableWrap.hidden = state.display !== "table";
  const table = tableWrap.createEl("table", { cls: "lubi-review-table" });
  table.createEl("caption", { text: `${label} · 按日期与分类的记录时长` });
  const header = table.createEl("thead").createEl("tr");
  for (const title of ["日期", "记录", "覆盖", ...cats, "校对"]) header.createEl("th", { text: title, attr: { scope: "col" } });
  const tbody = table.createEl("tbody");
  buckets.forEach((bucket, i) => {
    const row = tbody.createEl("tr");
    const day = row.createEl("th", { attr: { scope: "row" } });
    const open = day.createEl("button", { cls: "lubi-table-link", text: bucket.label, attr: { type: "button" } });
    open.addEventListener("click", () => state.period === "year" ? setState({ period: "month", anchor: bucket.dates[0] }) : plugin.openDate(bucket.dates[0]));
    row.createEl("td", { text: fmtHours(bucketTotals[i]) });
    row.createEl("td", { text: fmtHours(bucketStats[i].covered) });
    const recs = bucket.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0);
    for (const cat of cats) row.createEl("td", { text: sum(recs, cat) ? fmtHours(sum(recs, cat)) : "—" });
    const issues = row.createEl("td");
    const flagged = bucket.dates.filter((date) => dailyStats.get(date)?.invalidCount);
    if (!flagged.length) issues.setText("—");
    else for (const date of flagged) {
      const fix = issues.createEl("button", { cls: "lubi-table-link", text: date, attr: { type: "button", "aria-label": `校对 ${date} 的跨日记录` } });
      fix.addEventListener("click", () => plugin.openDate(date));
    }
  });

  if (isYear) renderHeatmap(plugin, host, from, to, dailyStats);

  // 分类明细 + 事项 Top
  const grid = host.createDiv({ cls: "lubi-review-grid" });
  const byCat = grid.createDiv({ cls: "lubi-card" });
  el(byCat, "h3", "lubi-panel-title", "按分类");
  for (const c of cats) {
    const v = sum(timed, c);
    const row = byCat.createDiv({ cls: "lubi-row-bar" });
    const head = row.createDiv({ cls: "lubi-row-bar-head" });
    catDot(head, categoryOf(plugin.settings, c));
    head.createSpan({ cls: "lubi-legend-name", text: c });
    head.createSpan({ cls: "lubi-legend-val", text: fmtHours(v) });
    head.createSpan({ cls: "lubi-muted lubi-legend-pct", text: `${Math.round((v / total) * 100)}%` });
    const track = row.createDiv({ cls: "lubi-track" });
    const fill = track.createDiv({ cls: "lubi-fill" });
    fill.style.width = `${(v / total) * 100}%`;
    fill.style.background = categoryOf(plugin.settings, c).color;
  }

  const top = grid.createDiv({ cls: "lubi-card" });
  el(top, "h3", "lubi-panel-title", "事项 Top 10");
  const byTitle = new Map<string, { min: number; n: number; cat: string }>();
  for (const r of timed) {
    const k = `${r.category}·${r.title}`;
    const cur = byTitle.get(k) || { min: 0, n: 0, cat: r.category };
    cur.min += r.minutes;
    cur.n++;
    byTitle.set(k, cur);
  }
  const ranked = [...byTitle.entries()].sort((a, b) => b[1].min - a[1].min).slice(0, 10);
  const topMax = ranked.length ? ranked[0][1].min : 1;
  for (const [k, v] of ranked) {
    const row = top.createDiv({ cls: "lubi-legend-row lubi-legend-bar" });
    row.style.setProperty("--pct", `${Math.round((v.min / topMax) * 100)}%`);
    row.style.setProperty("--dot", categoryOf(plugin.settings, v.cat).color);
    catDot(row, categoryOf(plugin.settings, v.cat));
    row.createSpan({ cls: "lubi-legend-name", text: k.split("·").slice(1).join("·") });
    row.createSpan({ cls: "lubi-muted", text: `${v.n} 次` });
    row.createSpan({ cls: "lubi-legend-val", text: fmtHours(v.min) });
  }

  if (spend.length) {
    const sp = grid.createDiv({ cls: "lubi-card" });
    el(sp, "h3", "lubi-panel-title", "支出");
    const byType = new Map<string, number>();
    for (const r of spend) byType.set(r.expenseType || "其他", (byType.get(r.expenseType || "其他") || 0) + (r.amount || 0));
    const totalSpend = [...byType.values()].reduce((s, v) => s + v, 0);
    for (const [t, v] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      const row = sp.createDiv({ cls: "lubi-row-bar" });
      const head = row.createDiv({ cls: "lubi-row-bar-head" });
      head.createSpan({ cls: "lubi-legend-name", text: t });
      head.createSpan({ cls: "lubi-legend-val", text: `¥${v.toFixed(2)}` });
      head.createSpan({ cls: "lubi-muted lubi-legend-pct", text: totalSpend ? `${Math.round((v / totalSpend) * 100)}%` : "—" });
      const track = row.createDiv({ cls: "lubi-track" });
      const fill = track.createDiv({ cls: "lubi-fill" });
      fill.style.width = `${totalSpend ? Math.max(0, Math.min(100, (v / totalSpend) * 100)) : 0}%`;
    }
    const list = sp.createDiv({ cls: "lubi-spend-list" });
    for (const r of spend.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).reverse().slice(0, 30)) {
      const row = list.createDiv({ cls: "lubi-legend-row" });
      row.createSpan({ cls: "lubi-muted", text: `${shortDate(r.date)} ${r.start}` });
      row.createSpan({ cls: "lubi-legend-name", text: r.title });
      row.createSpan({ cls: "lubi-muted", text: r.expenseType || "" });
      row.createSpan({ cls: "lubi-legend-val", text: `¥${(r.amount || 0).toFixed(2)}` });
    }
  }
}

function niceTicks(cap: number): number[] {
  const hours = cap / 60;
  const step = hours <= 40 ? 10 : hours <= 100 ? 25 : hours <= 200 ? 50 : 100;
  const out: number[] = [];
  for (let h = step; h * 60 <= cap; h += step) out.push(h * 60);
  return out;
}

function kpi(parent: HTMLElement, label: string, value: string, sub?: string, cls = ""): HTMLElement {
  const k = parent.createDiv({ cls: `lubi-kpi ${cls}`.trim() });
  k.createDiv({ cls: "lubi-kpi-label", text: label });
  k.createDiv({ cls: "lubi-kpi-value", text: value });
  if (sub) k.createDiv({ cls: "lubi-muted lubi-kpi-sub", text: sub });
  return k;
}

/** 年视图：GitHub 式覆盖热力图（颜色 = 当天覆盖率），点击某天跳到每日页 */
function renderHeatmap(plugin: LubiPlugin, host: HTMLElement, from: string, to: string, dailyStats: Map<string, { coveredMinutes: number; invalidCount: number }>): void {
  const card = host.createDiv({ cls: "lubi-card lubi-heat-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "全年覆盖");
  head.createSpan({ cls: "lubi-muted", text: "颜色越深 = 当天记录覆盖越多" });
  const legend = head.createDiv({ cls: "lubi-heat-legend lubi-push-right" });
  legend.createSpan({ cls: "lubi-muted", text: "少" });
  for (let lv = 0; lv <= 4; lv++) legend.createSpan({ cls: `lubi-heat-cell lv-${lv}` });
  legend.createSpan({ cls: "lubi-muted", text: "多" });
  const scroll = card.createDiv({ cls: "lubi-heat-scroll" });
  const grid = scroll.createDiv({ cls: "lubi-heat", attr: { role: "grid", "aria-label": "全年每日覆盖率" } });
  const first = weekStart(from);
  const today = todayStr();
  const allDays = eachDate(first, to);
  const weeks = Math.ceil(allDays.length / 7);
  grid.style.setProperty("--weeks", String(weeks));
  for (let w = 0; w < weeks; w++) {
    const label = grid.createDiv({ cls: "lubi-heat-month" });
    label.style.gridColumn = String(w + 2);
    // 本周内出现某月 1 号（或是区间第一周）就标月份
    const week = allDays.slice(w * 7, w * 7 + 7).filter((d) => d >= from && d <= to);
    const first = week.find((d) => d.endsWith("-01")) || (w === 0 || (week[0] === from) ? week[0] : "");
    if (first) label.setText(`${Number(first.slice(5, 7))}月`);
  }
  ["一", "", "三", "", "五", "", "日"].forEach((t, i) => {
    const l = grid.createDiv({ cls: "lubi-heat-dow", text: t });
    l.style.gridRow = String(i + 2);
  });
  allDays.forEach((d, i) => {
    const cell = grid.createDiv({ cls: "lubi-heat-cell" });
    cell.style.gridColumn = String(Math.floor(i / 7) + 2);
    cell.style.gridRow = String((i % 7) + 2);
    if (d < from || d > to) { cell.addClass("is-out"); return; }
    const st = dailyStats.get(d);
    const ratio = st ? st.coveredMinutes / 1440 : 0;
    const lv = !st ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4;
    cell.addClass(`lv-${lv}`);
    if (st?.invalidCount) cell.addClass("is-invalid");
    if (d === today) cell.addClass("is-today");
    if (d > today) cell.addClass("is-future");
    cell.dataset.date = d;
    tip(cell, `${d} 周${weekdayZh(d)} · ${st ? `覆盖 ${Math.round(ratio * 100)}%` : "没有记录"}${st?.invalidCount ? " · 待校对" : ""}`);
  });
  grid.addEventListener("click", (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>(".lubi-heat-cell")?.dataset.date;
    if (d) plugin.openDate(d);
  });
}

function sum(recs: Rec[], cat: string): number {
  return recs.reduce((s, r) => s + (r.category === cat ? r.minutes : 0), 0);
}

function range(state: ReviewState): { from: string; to: string; label: string; buckets: Bucket[] } {
  const a = state.anchor;
  if (state.period === "week") {
    const from = weekStart(a);
    const to = shiftDate(from, 6);
    return {
      from,
      to,
      label: `${shortDate(from)} – ${shortDate(to)}`,
      buckets: eachDate(from, to).map((d) => ({ key: d, label: `${weekdayZh(d)} ${shortDate(d)}`, dates: [d] })),
    };
  }
  if (state.period === "month") {
    const from = monthStart(a);
    const to = monthEnd(a);
    return {
      from,
      to,
      label: `${a.slice(0, 4)} 年 ${Number(a.slice(5, 7))} 月`,
      buckets: eachDate(from, to).map((d) => ({ key: d, label: String(Number(d.slice(8, 10))), dates: [d] })),
    };
  }
  const y = a.slice(0, 4);
  const buckets: Bucket[] = [];
  for (let m = 1; m <= 12; m++) {
    const ms = `${y}-${String(m).padStart(2, "0")}-01`;
    buckets.push({ key: ms, label: `${m}月`, dates: eachDate(ms, monthEnd(ms)) });
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} 年`, buckets };
}

function step(state: ReviewState, dir: number): string {
  if (state.period === "week") return shiftDate(state.anchor, 7 * dir);
  const d = parseDate(state.anchor);
  if (state.period === "month") d.setMonth(d.getMonth() + dir, 1);
  else d.setFullYear(d.getFullYear() + dir, 0, 1);
  return dateStr(d);
}

