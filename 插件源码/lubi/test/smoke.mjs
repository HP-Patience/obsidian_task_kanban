import * as O from "./mock-obsidian.js";
import { fixtureVault } from "./fixtures.mjs";
import Module from "module";
import { createRequire } from "module";
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "obsidian" ? O : origLoad.call(this, req, ...a); };
const require = createRequire(import.meta.url);
const LubiPlugin = require("./plugin.cjs").default;
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const tick = () => new Promise((r) => setTimeout(r, 30));

// 在内存 Vault 装入合成夹具，不依赖真实仓库数据或私人备份。
const app = new O.App();
for (const [path, text] of Object.entries(fixtureVault)) app.vault.files.set(path, text);

const plugin = new LubiPlugin(app, { id: "lubi", version: "1.0.0" });
await plugin.onload();
for (const fn of app.workspace._ready) await fn();
await tick();
check(plugin.tasks.all.length === 18, `tasks loaded & migrated: ${plugin.tasks.all.length}`);
check(plugin.tasks.lastMigrationBackup?.startsWith("备份/迁移前-任务数据-v13"), "v13 backup written: " + plugin.tasks.lastMigrationBackup);
const v14 = JSON.parse(app.vault.files.get("任务/任务数据.json")); check(v14.version === 14, "task file rewritten as v14");
// 自动迁移应该弹出确认框
const confirm = O.openModals.find((m) => m.constructor.name === "ConfirmModal");
check(!!confirm, "legacy journal prompt shown");
if (confirm) { const ok = [...confirm.contentEl.querySelectorAll("button")].find((b) => b.textContent === "转换"); ok.click(); await tick(); await tick(); }
const j24 = app.vault.files.get("日记/2026-09-24.md");
check(j24.includes("## 记录") && !j24.includes("journal-card") && !j24.includes("daily-task-log"), "2026-09-24 migrated");
check([...app.vault.files.keys()].some((k) => k.startsWith("备份/迁移-") && k.endsWith("/日记/2026-09-13.md")), "journal backup written");
check(!(await import("./core.mjs")).hasLegacyCards(app.vault.files.get("日记/2026-09-13.md")), "no legacy left in 09-13");
console.log("notices:", O.notices.slice(-3));

// 打开视图，渲染三页
const view = await plugin.activateView("today", "2026-09-24");
await tick();
const root = view.contentEl;
const blocks = () => [...root.querySelectorAll(".lubi-block:not(.lubi-block-ghost)")];
check(blocks().length === 1, "today timeline shows 1 block");
check(root.querySelector(".lubi-donut") !== null, "donut rendered");
check(root.querySelectorAll(".lubi-task").length >= 1, `today tasks listed: ${root.querySelectorAll(".lubi-task").length}`);
view.show("review", "2026-09-24"); await tick(); await tick();
check(root.querySelectorAll(".lubi-kpi").length >= 4, "review KPIs rendered");
check(root.querySelectorAll(".lubi-bar-col").length === 7, "review week has 7 bars");
view.review.period = "month"; view.show("review"); await tick(); await tick();
check(root.querySelectorAll(".lubi-bar-col").length === 30, "review month has 30 bars");
view.show("tasks", "2026-09-24"); await tick();
check(root.querySelectorAll(".lubi-week-col").length === 7, "week schedule 7 columns");
check(root.querySelectorAll(".lubi-wblock").length >= 1, `week blocks: ${root.querySelectorAll(".lubi-wblock").length}`);
check(root.querySelector(".lubi-project-toggle")?.getAttribute("aria-expanded") === "false", "project section starts collapsed");
root.querySelector(".lubi-project-toggle")?.click(); await new Promise((resolve) => setTimeout(resolve, 200)); await tick();
check(root.querySelectorAll(".lubi-gantt-row").length >= 2, `gantt rows: ${root.querySelectorAll(".lubi-gantt-row").length}`);
check(!root.querySelector(".lubi-error"), "no render errors");

// 记一条：通过模态保存
view.show("today"); await tick();
plugin.quickLog();
const rm = O.openModals.at(-1);
const q = (s) => rm.contentEl.querySelector(s);
q('input[type="text"]').value = "写测试"; q('input[type="text"]').dispatchEvent(new window.Event("input"));
q('input[type="time"]').value = "20:00"; q('input[type="time"]').dispatchEvent(new window.Event("change"));
q('input[type="number"]').value = "45"; q('input[type="number"]').dispatchEvent(new window.Event("input"));
[...rm.contentEl.querySelectorAll("button")].find((b) => b.textContent.includes("记下")).click();
await tick(); await tick();
check(app.vault.files.get("日记/2026-09-24.md").includes("- 20:00–20:45 学习 · 写测试 [时长:: 45min]"), "record saved via modal");
await new Promise((r) => setTimeout(r, 250)); check(blocks().length === 2, "timeline now 2 blocks (after debounce)");
// 跨夜拆分
await plugin.journal.add({ date: "2026-09-24", start: "23:30", minutes: 90, category: "睡眠", title: "睡觉", extra: {} });
check(app.vault.files.get("日记/2026-09-24.md").includes("23:30–00:00 睡眠") && app.vault.files.get("日记/2026-09-25.md")?.includes("00:00–01:00 睡眠"), "midnight split across files");
// 24h 上限
let capErr = null; try { await plugin.journal.add({ date: "2026-09-24", start: "00:00", minutes: 1440, category: "日常", title: "x", extra: {} }); } catch (e) { capErr = e.message; }
check(capErr?.includes("24"), "24h cap enforced: " + capErr);
// 勾任务 → 弹记录框
plugin.settings.promptLogOnComplete = true;
await tick();
const tk = [...root.querySelectorAll(".lubi-task")].find((t) => !t.classList.contains("is-done"));
const before = O.openModals.length;
tk.querySelector("input[type=checkbox]").click(); await tick(); await tick();
check(O.openModals.length === before + 1, "completing task prompts record modal");
check(O.openModals.at(-1).contentEl.querySelector('input[type="text"]').value.length > 0, "prompt prefilled with task title: " + O.openModals.at(-1).contentEl.querySelector('input[type="text"]').value);
O.openModals.at(-1).close();
// 快速添加待办
view.show("tasks", "2026-09-24"); await tick();
const qa = root.querySelector(".lubi-quick-add input"); qa.value = "买牛奶"; qa.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" })); await tick(); await tick();
check(plugin.tasks.all.some((t) => t.title === "买牛奶" && t.date === "2026-09-24"), "quick add creates dated task");
// 拖放安排
const milk = plugin.tasks.all.find((t) => t.title === "买牛奶");
await plugin.tasks.schedule(milk.id, "2026-09-25", "09:15");
check(plugin.tasks.byId(milk.id).start === "09:15" && plugin.tasks.forDate("2026-09-25").some((t) => t.id === milk.id), "schedule moves task");
// 编辑任务状态：视觉状态由 aria-pressed / 勾号决定，保存前不写盘；取消放弃草稿。
view.show("tasks", "2026-09-25"); await tick();
const milkRow = [...root.querySelectorAll(".lubi-task")].find((row) => row.querySelector(".lubi-task-title-text")?.textContent === "买牛奶");
check(!!milkRow?.querySelector(".lubi-task-title-button"), "task row provides an edit entry for its full title");
milkRow.querySelector(".lubi-task-title-button").click();
const statusDraft = O.openModals.at(-1);
const statusBtn = (modal, value) => modal.contentEl.querySelector(`.lubi-status-seg [data-task-status="${value}"]`);
check(statusBtn(statusDraft, "todo")?.getAttribute("aria-pressed") === "true" && !!statusBtn(statusDraft, "todo")?.querySelector(".lubi-status-check"), "initial task state is marked in the modal");
statusBtn(statusDraft, "doing").click();
check(statusBtn(statusDraft, "doing")?.getAttribute("aria-pressed") === "true" && statusBtn(statusDraft, "todo")?.getAttribute("aria-pressed") === "false", "clicking task state updates selected button immediately");
check(statusDraft.contentEl.querySelector('[role="status"]')?.textContent.includes("进行中") && statusDraft.contentEl.querySelector('[role="status"]')?.textContent.includes("保存后生效"), "status change explains the pending save");
check(plugin.tasks.byId(milk.id).status === "todo", "state draft is not persisted before save");
statusDraft.contentEl.querySelector(".lubi-modal-actions .lubi-btn-ghost").click();
check(!O.openModals.includes(statusDraft) && plugin.tasks.byId(milk.id).status === "todo", "cancel leaves task state unchanged");
milkRow.querySelector(".lubi-task-title-button").click();
const statusSaved = O.openModals.at(-1);
statusBtn(statusSaved, "done").click();
statusSaved.contentEl.querySelector(".lubi-quick-chip-warn").click();
check(statusBtn(statusSaved, "done")?.getAttribute("aria-pressed") === "true" && statusSaved.contentEl.querySelector(".lubi-quick-chip-warn")?.getAttribute("aria-pressed") === "true", "done and blocked draft both provide selected-state feedback");
statusSaved.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await tick(); await tick();
check(plugin.tasks.byId(milk.id).status === "done" && plugin.tasks.byId(milk.id).blocked === true && !O.openModals.includes(statusSaved), "save persists the selected state and closes modal");

// ---------- 二期：拖动 / 模态 / 图表 ----------
if (!window.PointerEvent) window.PointerEvent = class extends window.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId ?? 1; } };
const pe = (el, type, y, x = 0, extra = {}) => el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, ...extra }));
const drag = async (el, y0, y1, x0 = 0, x1 = 0, opts = {}) => { pe(el, "pointerdown", y0, x0); pe(window, "pointermove", y0 + 3, x0); pe(window, "pointermove", y1, x1, opts); if (opts.cancel) window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); else pe(window, "pointerup", y1, x1, opts); await tick(); await tick(); await new Promise((r) => setTimeout(r, 200)); };
const PXM = 56 / 60;
const journal = () => app.vault.files.get("日记/2026-09-24.md");
view.show("today"); await tick(); await new Promise((r) => setTimeout(r, 200));
// 1. 拖动移动：写测试 20:00 → 21:00
let b = blocks().find((x) => x.textContent.includes("写测试"));
check(!!b && b.querySelector(".lubi-block-handle.is-top") && b.querySelector(".lubi-block-handle.is-bottom"), "block has resize handles");
await drag(b, 20 * 60 * PXM + 10, 21 * 60 * PXM + 10);
check(journal().includes("- 21:00–21:45 学习 · 写测试"), "drag move shifts record by 1h: " + (journal().match(/.*写测试.*/) || [""])[0]);
check(O.notices.at(-1) === "" && document.body.querySelector(".lubi-notice-btn"), "undo notice shown after drag");
// 2. 撤销
document.body.querySelector(".lubi-notice-btn").click(); await tick(); await tick(); await new Promise((r) => setTimeout(r, 200));
check(journal().includes("- 20:00–20:45 学习 · 写测试"), "undo restores original time");
// 3. 拉伸下边缘 +30min
b = blocks().find((x) => x.textContent.includes("写测试"));
await drag(b.querySelector(".lubi-block-handle.is-bottom"), 20.75 * 60 * PXM, 21.25 * 60 * PXM);
check(journal().includes("- 20:00–21:15 学习 · 写测试 [时长:: 1.25h]"), "resize-end extends by 30min: " + (journal().match(/.*写测试.*/) || [""])[0]);
// 4. 拉伸上边缘 -15min（Shift 1 分钟粒度不测）
b = blocks().find((x) => x.textContent.includes("写测试"));
await drag(b.querySelector(".lubi-block-handle.is-top"), 20 * 60 * PXM, 19.75 * 60 * PXM);
check(journal().includes("- 19:45–21:15 学习 · 写测试 [时长:: 1.5h]"), "resize-start moves start earlier: " + (journal().match(/.*写测试.*/) || [""])[0]);
// 5. Esc 取消
b = blocks().find((x) => x.textContent.includes("写测试"));
await drag(b, 20 * 60 * PXM, 22 * 60 * PXM, 0, 0, { cancel: true });
check(journal().includes("- 19:45–21:15 学习 · 写测试"), "Esc cancels drag, file untouched");
check(!document.body.classList.contains("lubi-dragging"), "dragging class cleaned up");
// 6. 点击（无位移）仍然打开编辑
b = blocks().find((x) => x.textContent.includes("写测试"));
{ const n = O.openModals.length; pe(b, "pointerdown", 20 * 60 * PXM); pe(window, "pointerup", 20 * 60 * PXM); await tick();
  check(O.openModals.length === n + 1, "click without movement opens edit modal");
  const em = O.openModals.at(-1);
  check(em.titleEl.textContent.includes("编辑记录") && em.titleEl.textContent.includes("19:45–21:15"), "modal title shows date + original span: " + em.titleEl.textContent);
  check(!!em.contentEl.querySelector(".lubi-timebar") && em.contentEl.querySelectorAll(".lubi-ghost-btn").length === 2, "modal has timebar + 2 ghost toggles");
  check(em.contentEl.querySelector('.lubi-quick-chip[aria-pressed="true"]')?.textContent === "1.5h", "quick chip highlights current duration");
  em.contentEl.querySelectorAll(".lubi-ghost-btn")[1].click(); await tick();
  check(!!em.contentEl.querySelector("textarea"), "notes field appears after ghost click");
  check(!!em.contentEl.querySelector(".lubi-text-btn-danger"), "delete is a text button");
  em.close(); }
// 7. 空白处框选新建 → 模态预填
{ const canvas = root.querySelector(".lubi-tl-canvas"); const n = O.openModals.length;
  await drag(canvas, 10 * 60 * PXM, 11 * 60 * PXM);
  check(O.openModals.length === n + 1, "drag on empty area opens new-record modal");
  const nm = O.openModals.at(-1);
  check(nm.rec.start === "10:00" && nm.rec.minutes === 60, `prefilled 10:00 / 60min (got ${nm.rec.start} / ${nm.rec.minutes})`);
  nm.close(); }
// 8. 键盘微调
b = blocks().find((x) => x.textContent.includes("写测试"));
pe(b, "pointerdown", 20 * 60 * PXM); pe(window, "pointerup", 20 * 60 * PXM); await tick(); O.openModals.at(-1)?.close();
root.querySelector(".lubi-timeline").dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); await tick(); await tick(); await new Promise((r) => setTimeout(r, 200));
check(journal().includes("- 19:50–21:20 学习 · 写测试"), "ArrowDown nudges 5min: " + (journal().match(/.*写测试.*/) || [""])[0]);
// 9. 回顾图表
view.review.period = "week"; view.show("review", "2026-09-24"); await tick(); await tick();
check(root.querySelectorAll(".lubi-chart-gridline").length === 4, "chart has 4 gridlines (6/12/18/24h)");
check(!!root.querySelector(".lubi-bar-val.is-over"), "103h day flagged as over-cap");
check(root.querySelector(".lubi-kpi")?.textContent.includes("记录总时长") && root.querySelector(".lubi-kpis")?.textContent.includes("待校对异常日后计算"), "anomalous day does not yield a misleading daily average");
check(root.querySelector(".lubi-chart-avg-label")?.textContent.startsWith("有效日均") && !root.querySelector(".lubi-chart-avg-label")?.textContent.includes("103"), "anomalous bar is excluded from chart average");
check(!root.querySelector(".lubi-bar-stack[style*='height: 100%']:not(.is-over)"), "no non-over bar at full height");
check(root.querySelectorAll(".lubi-chart-legend-item").length >= 1, "chart legend rendered");
// 9b. tooltip 不残留：悬停出现 → 重绘后消失 → 离开后消失
{ const barsEl = root.querySelector(".lubi-bars"); const col = root.querySelector(".lubi-bar-col");
  col.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }));
  check(document.body.querySelectorAll(".lubi-tip").length === 1, "tooltip appears on hover");
  const col2 = root.querySelectorAll(".lubi-bar-col")[3];
  col2.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, clientX: 20, clientY: 10 }));
  check(document.body.querySelectorAll(".lubi-tip").length === 1, "still exactly one tooltip after moving to another bar");
  view.show("review"); await tick(); await tick();
  check(document.body.querySelectorAll(".lubi-tip").length === 0, "tooltip removed on re-render");
  const c3 = root.querySelector(".lubi-bar-col"); c3.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }));
  root.querySelector(".lubi-bars").dispatchEvent(new window.PointerEvent("pointerleave", { bubbles: false }));
  check(document.body.querySelectorAll(".lubi-tip").length === 0, "tooltip removed on pointerleave");
  void barsEl; }
// 9c. 回顾 → 点柱子跳到记录页 → 再点顶栏「回顾」能回来
{ view.show("review"); await tick(); await tick();
  const col = [...root.querySelectorAll(".lubi-bar-col")].find((c) => !c.classList.contains("is-empty")) || root.querySelector(".lubi-bar-col");
  col.click(); await tick(); await tick();
  check(view.tab === "today", "clicking a bar jumps to today page");
  const tabs = [...root.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item")];
  check(tabs[0].getAttribute("aria-pressed") === "true" && tabs[1].getAttribute("aria-pressed") === "false", "top tabs reflect the jump");
  tabs[1].click(); await tick(); await tick();
  check(view.tab === "review" && root.querySelector(".lubi-bars") !== null, "clicking 回顾 returns to review page"); }
// 10. 周日程 pointer 拖动：跨列 + 改时间
plugin.settings.scheduleStartHour = 0; view.show("tasks", "2026-09-24"); await tick();
const wb = root.querySelector(".lubi-wblock");
const wt = plugin.tasks.all.find((t) => t.title === wb.querySelector(".lubi-wblock-title").textContent);
const beforeDate = plugin.tasks.forDate("2026-09-25").some((t) => t.id === wt.id) ? "2026-09-25" : null;
const origStart = wt.start;
await drag(wb, 100, 100 + 44, 0, 1);
const after = plugin.tasks.byId(wt.id);
check(after.start === (() => { const [h, m] = origStart.split(":").map(Number); const v = Math.round((h * 60 + m + 60) / 15) * 15; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; })(), `week block moved +1h (snapped to 15min): ${origStart} → ${after.start}`);
check(plugin.tasks.forDate("2026-09-25").some((t) => t.id === wt.id) !== !!beforeDate, `week block moved to next column (was ${beforeDate ? "9/25" : "other day"})`);
const wb2 = [...root.querySelectorAll(".lubi-wblock")].find((x) => x.querySelector(".lubi-wblock-title").textContent === wt.title);
check(!!wb2.querySelector(".lubi-block-handle.is-bottom"), "week block has resize handle");
const est0 = plugin.tasks.byId(wt.id).estimate || 30;
await drag(wb2.querySelector(".lubi-block-handle.is-bottom"), 200, 200 + 22);
check((plugin.tasks.byId(wt.id).estimate || 0) === est0 + 30, `week block resize +30min estimate: ${est0} → ${plugin.tasks.byId(wt.id).estimate}`);
// 11. 周日程 上边缘拉伸：开始提前 30min，预计 +30
const wb3 = [...root.querySelectorAll(".lubi-wblock")].find((x) => x.querySelector(".lubi-wblock-title").textContent === wt.title);
const s0 = plugin.tasks.byId(wt.id).start, e0 = plugin.tasks.byId(wt.id).estimate;
await drag(wb3.querySelector(".lubi-block-handle.is-top"), 300, 300 - 22);
{ const t2 = plugin.tasks.byId(wt.id); const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  check(toMin(t2.start) === toMin(s0) - 30 && t2.estimate === e0 + 30, `week block resize-start: ${s0}/${e0} → ${t2.start}/${t2.estimate}`); }
// 12. 甘特：项目条整体右移 7 天 + 右端拉长 3 天
view.tasksState.projectsOpen = true; view.show("tasks"); await tick();
const proj = plugin.tasks.projects().find((p) => plugin.tasks.span(p));
const bar = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.title.startsWith(proj.title));
check(!!bar && bar.querySelector(".lubi-gantt-handle.is-left") && bar.querySelector(".lubi-gantt-handle.is-right"), "gantt bar has both handles");
const span0 = plugin.tasks.span(proj);
await drag(bar, 10, 10, 0, 7);
const span1 = plugin.tasks.span(plugin.tasks.byId(proj.id));
const dayDiff = (x, y) => Math.round((new Date(y) - new Date(x)) / 864e5);
check(dayDiff(span0.from, span1.from) === 7 && dayDiff(span0.to, span1.to) === 7, `gantt move +7d: ${span0.from}→${span1.from}, ${span0.to}→${span1.to}`);
const bar2 = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.title.startsWith(proj.title));
await drag(bar2.querySelector(".lubi-gantt-handle.is-right"), 10, 10, 0, 5);
const span2 = plugin.tasks.span(plugin.tasks.byId(proj.id));
check(span2.from === span1.from && dayDiff(span1.to, span2.to) === 5, `gantt resize right +5d: ${span1.to}→${span2.to}`);
const bar3 = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.title.startsWith(proj.title));
await drag(bar3.querySelector(".lubi-gantt-handle.is-left"), 10, 10, 0, 4);
const span3 = plugin.tasks.span(plugin.tasks.byId(proj.id));
check(dayDiff(span2.from, span3.from) === 4 && span3.to === span2.to, `gantt resize left +4d: ${span2.from}→${span3.from}`);
check(!root.querySelector(".lubi-error"), "no render errors after drag tests");
// ---------- UX 回归：页面日期、表单键盘、异常/表格、任务撤销 ----------
await new Promise((resolve) => setTimeout(resolve, 200));
view.show("today", "2026-09-13"); await tick(); await tick();
check(root.querySelector(".lubi-today-side")?.textContent.includes("9/13 分布"), "historical summary uses selected date");
check(root.querySelector(".lubi-today-side")?.textContent.includes("9/13 待办"), "historical task header uses selected date");
root.querySelector(".lubi-timeline-scroll").scrollTop = 320;
view.show("review", "2026-09-24"); await tick(); await tick();
check(root.dataset.tab === "review", "non-day tab exposes context for hiding day navigation");
view.show("today"); await tick(); await tick();
check(view.date === "2026-09-13" && root.querySelector(".lubi-timeline-scroll")?.scrollTop === 320, "tab switch restores date and timeline scroll");
view.show("today", "2026-09-24"); await tick();
plugin.quickLog();
const keyboardRecord = O.openModals.at(-1);
const recordTitle = keyboardRecord.contentEl.querySelector('input[type="text"]');
const recordDuration = keyboardRecord.contentEl.querySelector('input[type="number"]');
recordDuration.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check(O.openModals.includes(keyboardRecord), "Enter on duration does not submit the record");
keyboardRecord.contentEl.querySelector(".lubi-cat-option").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check(O.openModals.includes(keyboardRecord), "Enter on category does not submit the record");
recordTitle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check(recordTitle.getAttribute("aria-invalid") === "true" && !!keyboardRecord.contentEl.querySelector(".lubi-field-error"), "empty title shows adjacent error and focusable invalid field");
recordTitle.value = "键盘记录"; recordTitle.dispatchEvent(new window.Event("input", { bubbles: true }));
const recordTime = keyboardRecord.contentEl.querySelector('input[type="time"]');
recordTime.value = "18:00"; recordTime.dispatchEvent(new window.Event("change", { bubbles: true }));
recordDuration.value = "15"; recordDuration.dispatchEvent(new window.Event("input", { bubbles: true }));
recordTitle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await tick(); await tick();
check(!O.openModals.includes(keyboardRecord) && app.vault.files.get("日记/2026-09-24.md").includes("键盘记录"), "Enter on valid title saves record");
plugin.quickLog();
const invalidRecord = O.openModals.at(-1);
const invalidTitle = invalidRecord.contentEl.querySelector('input[type="text"]');
invalidTitle.value = "超出上限"; invalidTitle.dispatchEvent(new window.Event("input", { bubbles: true }));
const invalidStart = invalidRecord.contentEl.querySelector('input[type="time"]');
invalidStart.value = "00:00"; invalidStart.dispatchEvent(new window.Event("change", { bubbles: true }));
const tooLong = invalidRecord.contentEl.querySelector('input[type="number"]');
tooLong.value = "1440"; tooLong.dispatchEvent(new window.Event("input", { bubbles: true }));
invalidRecord.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await tick();
check(O.openModals.includes(invalidRecord) && invalidRecord.contentEl.querySelector(".lubi-modal-error") && invalidTitle.value === "超出上限", "save error keeps draft and explains failure in modal");
invalidRecord.close();
view.show("review", "2026-09-24"); await tick(); await tick();
check(!!root.querySelector(".lubi-data-warning .lubi-btn"), "legacy out-of-day record has a visible correction entry");
const focusBar = root.querySelector(".lubi-bar-col"); focusBar.focus();
check(!!document.body.querySelector(".lubi-tip") && focusBar.getAttribute("aria-label")?.includes("覆盖"), "review chart explains values on keyboard focus");
focusBar.blur();
const tableChoice = [...root.querySelectorAll(".lubi-chart-mode button")].find((x) => x.textContent === "表格");
tableChoice.focus(); tableChoice.click(); await tick(); await tick();
check(document.activeElement?.textContent === "表格", "chart/table switch retains keyboard focus after redraw");
check(!root.querySelector(".lubi-review-table-wrap").hidden && !!root.querySelector(".lubi-review-table caption"), "chart has readable table alternative");
check(root.querySelector(".lubi-review-table")?.textContent.includes("2026-09-21"), "table names the abnormal date to correct");
await plugin.journal.add({ date: "2026-10-12", start: "09:00", minutes: 60, category: "学习", title: "一期有效记录", extra: {} });
view.review.period = "week"; view.show("review", "2026-10-12"); await tick(); await tick();
check(root.querySelector(".lubi-insight")?.textContent.includes("至少 2 天"), "sparse comparison does not claim a trend");
view.show("tasks", "2026-09-24"); await tick(); await tick();
check(root.querySelector(".lubi-agenda-card")?.textContent.includes("日程"), "narrow-panel agenda provides a date and task path");
const visibleOrder = [...root.querySelectorAll(".lubi-tasks-left > .lubi-list-card, .lubi-tasks-left > .lubi-agenda-host")].map((node) => node.classList.contains("lubi-agenda-host") ? "agenda" : node.textContent.includes("未安排") ? "inbox" : "today");
check(JSON.stringify(visibleOrder) === JSON.stringify(["today", "agenda", "inbox"]), "agenda precedes inbox in DOM and keyboard order");
const assign = root.querySelector('button[aria-label^="安排 待安排事项 1 到"]');
check(!!assign, "unscheduled task has non-drag scheduling action");
assign.click(); await tick();
check(plugin.tasks.byId("inbox-0").date === "2026-09-24", "schedule action writes selected date");
await plugin.tasks.upsert({ ...plugin.tasks.byId("inbox-0"), notes: "安排后新增的备注" });
const taskUndo = [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1);
check(!!taskUndo, "task reschedule shows undo action");
taskUndo.click(); await tick();
check(plugin.tasks.byId("inbox-0").date === "" && plugin.tasks.byId("inbox-0").notes === "安排后新增的备注", "task undo restores only schedule fields, preserving later notes");
view.show("tasks", "2026-09-24"); await tick();
const chooseDate = root.querySelector('button[aria-label^="为 待安排事项 1 选择日期"]');
chooseDate.click(); await tick();
check(document.activeElement?.getAttribute("type") === "date", "choose-date action focuses accessible date input");
O.openModals.at(-1).close();
root.querySelector(".lubi-tasks-left .lubi-list-card .lubi-panel-head .lubi-icon-btn").click();
const keyboardTask = O.openModals.at(-1);
const taskTitle = keyboardTask.contentEl.querySelector('input[type="text"]');
keyboardTask.contentEl.querySelector(".lubi-repeat-select").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check(O.openModals.includes(keyboardTask), "Enter on repeat selector does not save task");
taskTitle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
check(taskTitle.getAttribute("aria-invalid") === "true", "task title validation stays visible next to field");
taskTitle.value = "键盘新任务"; taskTitle.dispatchEvent(new window.Event("input", { bubbles: true }));
taskTitle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await tick();
check(!O.openModals.includes(keyboardTask) && plugin.tasks.all.some((t) => t.title === "键盘新任务" && t.date === "2026-09-24"), "Enter on valid task title saves task");
view.show("tasks", "2026-09-22"); await tick();
plugin.quickLog();
check(O.openModals.at(-1).rec.date === "2026-09-22", "quick record uses selected task date, not stale header date");
O.openModals.at(-1).close();
check(!root.querySelector(".lubi-error"), "no render errors after keyboard and schedule flows");

console.log("data file now:", app.vault.files.get("任务/任务数据.json").slice(0, 120).replace(/\n/g, " "));
console.log(fails ? `\n${fails} FAILED` : "\nSMOKE ALL PASSED");
process.exit(fails ? 1 : 0);

