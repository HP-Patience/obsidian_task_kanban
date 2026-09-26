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
check(!root.querySelector(".lubi-day-tasks") && !root.querySelector(".lubi-today .lubi-task"), "daily page no longer duplicates the task list");
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
{
  const t = plugin.tasks.all.find((x) => x.title === "写测试");
  check(!!t && t.origin === "record" && t.status === "done" && t.date === "2026-09-24" && t.start === "20:00" && t.estimate === 45, "new daily record also creates a done task");
  check(app.vault.files.get("日记/2026-09-24.md").includes(`[任务:: ${t?.id}]`), "new daily record is linked to its done task");
}
await new Promise((r) => setTimeout(r, 250)); check(blocks().length === 2, "timeline now 2 blocks (after debounce)");
// 跨夜拆分
await plugin.journal.add({ date: "2026-09-24", start: "23:30", minutes: 90, category: "睡眠", title: "睡觉", extra: {} });
check(app.vault.files.get("日记/2026-09-24.md").includes("23:30–00:00 睡眠") && app.vault.files.get("日记/2026-09-25.md")?.includes("00:00–01:00 睡眠"), "midnight split across files");
// 24h 上限
let capErr = null; try { await plugin.journal.add({ date: "2026-09-24", start: "00:00", minutes: 1440, category: "日常", title: "x", extra: {} }); } catch (e) { capErr = e.message; }
check(capErr?.includes("24"), "24h cap enforced: " + capErr);
// 勾任务 → 直接生成记录，不弹窗
plugin.settings.promptLogOnComplete = true;
view.show("tasks", "2026-09-24"); await tick();
{
  const tk = [...root.querySelectorAll(".lubi-task")].find((t) => !t.classList.contains("is-done"));
  const title = tk.querySelector(".lubi-task-title-text").textContent;
  const before = O.openModals.length;
  tk.querySelector("input[type=checkbox]").click(); for (let i = 0; i < 4; i++) await tick();
  check(O.openModals.length === before, "completing task does not open a dialog");
  check(app.vault.files.get("日记/2026-09-24.md").includes(`· ${title}`), "completing task writes a record directly: " + title);
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
}
view.show("today"); await tick();
// ---------- 勾选 ↔ 取消：时间线记录成对出现 / 消失（不弹窗）；任务页完成的事出现在每日页时间轴 ----------
{
  const D = "2026-09-24", ID = "sync-1";
  await plugin.tasks.upsert({ ...plugin.tasks.all[0], id: ID, title: "同步测试", parent: null, status: "todo", blocked: false, date: D, start: "06:00", estimate: 30, repeat: { kind: "none", days: [] }, doneDates: [], doneLogs: undefined, startDate: "", endDate: "", origin: undefined });
  const linked = () => (app.vault.files.get(`日记/${D}.md`) || "").split("\n").filter((l) => l.includes(`[任务:: ${ID}]`));
  const row = () => [...root.querySelectorAll(".lubi-task")].find((r) => r.querySelector(".lubi-task-title-text")?.textContent === "同步测试");
  const toggle = async () => { row().querySelector("input[type=checkbox]").click(); for (let i = 0; i < 4; i++) await tick(); };
  view.show("tasks", D); await tick();
  const modalsBefore = O.openModals.length;
  await toggle();
  check(O.openModals.length === modalsBefore, "sync: checking does not open a dialog");
  check(linked().length === 1 && linked()[0].startsWith("- 06:00–06:30") && plugin.tasks.byId(ID).doneLogs?.[D]?.start === "06:00", "sync: checking writes the planned slot and registers it");
  check(document.body.textContent.includes("已按计划记下「同步测试」"), "sync: auto record is announced with undo");
  check(linked()[0]?.includes("[待确认:: 按计划]"), "sync: auto record is marked 待确认 (planned, not actual)");
  // 撤销自动记录 = 撤销这次勾选
  [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1).click(); for (let i = 0; i < 4; i++) await tick();
  check(linked().length === 0 && !plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D) && !plugin.tasks.byId(ID).doneLogs, "sync: undo removes the record and unchecks the task");
  view.show("tasks", D); await tick();
  await toggle();
  await toggle();
  check(linked().length === 0 && !plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D) && !plugin.tasks.byId(ID).doneLogs, "sync: unchecking removes the record created by checking");
  check(document.body.textContent.includes("已取消完成") && !!document.body.querySelector(".lubi-notice-btn"), "sync: removal is announced with undo");
  [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1).click(); for (let i = 0; i < 4; i++) await tick();
  check(linked().length === 1 && plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D) && !!plugin.tasks.byId(ID).doneLogs?.[D], "sync: undo restores record, done state and registration");
  view.show("tasks", D); await tick();
  await toggle();
  // 反复勾选 / 取消 5 轮：任何时刻最多 1 条
  let maxSeen = 0;
  for (let i = 0; i < 5; i++) {
    await toggle(); maxSeen = Math.max(maxSeen, linked().length);
    await toggle(); maxSeen = Math.max(maxSeen, linked().length);
  }
  check(maxSeen === 1 && linked().length === 0, `sync: 5 check/uncheck rounds never duplicate (max ${maxSeen}, end ${linked().length})`);
  // 连点：写盘期间的第二次点击被忽略
  row().querySelector("input[type=checkbox]").click(); row().querySelector("input[type=checkbox]").click();
  for (let i = 0; i < 4; i++) await tick();
  check(plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D) && linked().length === 1, "sync: rapid double click toggles once");
  // 每日页：拖动这条记录后再取消勾选，仍能精确删掉它
  view.show("today", D); await tick();
  const blk = [...root.querySelectorAll(".lubi-block-title")].find((b) => b.textContent === "同步测试");
  check(!!blk, "sync: task completed on the task page shows on the daily timeline");
  const blockEl = blk.closest(".lubi-block");
  blockEl.dispatchEvent(new window.FocusEvent("focus"));
  blockEl.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  for (let i = 0; i < 4; i++) await tick();
  check(linked()[0]?.startsWith("- 06:05") && plugin.tasks.byId(ID).doneLogs?.[D]?.start === "06:05", "sync: moving the record on the timeline updates the pairing");
  view.show("tasks", D); await tick();
  await toggle();
  check(linked().length === 0, "sync: a moved record still pairs with the checkbox");
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
  // 已有关联记录（▶ 记的）时再勾选：不重复；取消勾选时保留它
  await plugin.journal.add({ date: D, start: "06:30", minutes: 20, category: "学习", title: "同步测试", task: ID, extra: {} });
  await toggle();
  check(linked().length === 1, "sync: no extra record when a linked record already exists");
  await toggle();
  check(linked().length === 1, "sync: unchecking keeps records not created by the checkbox");
  await plugin.journal.remove(D, await plugin.journal.findLine(D, { start: "06:30", minutes: 20, category: "学习", title: "同步测试" }));
  // 勾选时记下的记录在外部被改过（例如直接改日记）：取消勾选不动它
  await toggle();
  const line = await plugin.journal.findLine(D, { start: "06:00", minutes: 30, category: plugin.tasks.byId(ID).category, title: "同步测试" });
  const rec = (await plugin.journal.read(D)).find((r) => r.line === line).rec;
  await plugin.journal.update(D, line, { ...rec, start: "06:10" });
  view.show("tasks", D); await tick();
  await toggle();
  check(linked().length === 1 && O.notices.at(-1).includes("已被修改"), "sync: externally edited record is kept on uncheck");
  await plugin.journal.remove(D, await plugin.journal.findLine(D, { ...rec, start: "06:10" }));
  // 在每日页删除勾选生成的记录 → 任务回到未完成
  await toggle();
  view.show("today", D); await tick();
  const b2 = [...root.querySelectorAll(".lubi-block")].find((b) => b.querySelector(".lubi-block-title")?.textContent === "同步测试");
  b2.querySelector('.lubi-block-actions [aria-label="删除"]').click(); for (let i = 0; i < 4; i++) await tick();
  check(linked().length === 0 && !plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D), "sync: deleting the checkbox record unchecks the task");
  await plugin.tasks.remove(ID);
  // 清掉本段产生的撤销提示，避免后面的用例点到它们
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
}
// ---------- 每日页新记的事 ↔ 任务页的已完成任务 ----------
{
  const D = "2026-09-24";
  const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
  view.show("today", D); await tick();
  plugin.quickLog();
  const m = O.openModals.at(-1);
  check(m.constructor.name === "RecordModal" && !!m.contentEl.querySelector(".lubi-kind-seg"), "new: daily page opens the unified dialog on 记录");
  check(![...m.contentEl.querySelectorAll(".lubi-ghost-btn")].some((b) => b.textContent.includes("关联")), "new: the manual 关联待办 field is gone");
  const tt = m.contentEl.querySelector('input[type="text"]'); tt.value = "补记午饭后散步"; tt.dispatchEvent(new window.Event("input"));
  const st = m.contentEl.querySelector('input[type="time"]'); st.value = "05:00"; st.dispatchEvent(new window.Event("change"));
  const du = m.contentEl.querySelector('input[type="number"]'); du.value = "20"; du.dispatchEvent(new window.Event("input"));
  m.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await settle();
  const t = plugin.tasks.all.find((x) => x.title === "补记午饭后散步");
  check(!!t && t.origin === "record" && plugin.tasks.isDoneOn(t, D), "new: daily record creates a done task");
  view.show("tasks", D); await tick();
  check([...root.querySelectorAll(".lubi-task.is-done .lubi-task-title-text")].some((x) => x.textContent === "补记午饭后散步"), "new: the done task shows on the task page");
  // 在任务页取消勾选 → 记录一起移除
  const r = [...root.querySelectorAll(".lubi-task")].find((x) => x.querySelector(".lubi-task-title-text")?.textContent === "补记午饭后散步");
  r.querySelector("input[type=checkbox]").click(); await settle();
  check(!app.vault.files.get(`日记/${D}.md`).includes("补记午饭后散步"), "new: unchecking the done task removes its record");
  [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1).click(); await settle();
  check(app.vault.files.get(`日记/${D}.md`).includes("补记午饭后散步"), "new: undo brings the record back");
  // 在每日页删除这条记录 → 任务一起删除，可撤销
  view.show("today", D); await tick();
  const b = [...root.querySelectorAll(".lubi-block")].find((x) => x.querySelector(".lubi-block-title")?.textContent === "补记午饭后散步");
  b.querySelector('.lubi-block-actions [aria-label="删除"]').click(); await settle();
  check(!plugin.tasks.byId(t.id) && !app.vault.files.get(`日记/${D}.md`).includes("补记午饭后散步"), "new: deleting the record also deletes its generated task");
  [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1).click(); await settle();
  check(!!plugin.tasks.byId(t.id) && app.vault.files.get(`日记/${D}.md`).includes(`[任务:: ${t.id}]`), "new: undo restores both record and task");
  // 切到「任务」：带着内容换成任务表单
  plugin.quickLog();
  const m2 = O.openModals.at(-1);
  const t2 = m2.contentEl.querySelector('input[type="text"]'); t2.value = "明天买菜"; t2.dispatchEvent(new window.Event("input"));
  [...m2.contentEl.querySelectorAll(".lubi-kind-seg .lubi-seg-item")].find((x) => x.textContent.includes("任务")).click(); await tick();
  const tm = O.openModals.at(-1);
  check(!O.openModals.includes(m2) && tm.constructor.name === "TaskModal" && tm.t.title === "明天买菜" && tm.t.date === D, "new: switching to 任务 carries the draft into the task form");
  [...tm.contentEl.querySelectorAll(".lubi-kind-seg .lubi-seg-item")].find((x) => x.textContent.includes("记录")).click(); await tick();
  const back = O.openModals.at(-1);
  check(back.constructor.name === "RecordModal" && back.rec.title === "明天买菜", "new: switching back to 记录 keeps the draft");
  back.close();
  await plugin.tasks.remove(t.id);
  await plugin.journal.remove(D, await plugin.journal.findLine(D, { start: "05:00", minutes: 20, category: t.category, title: "补记午饭后散步" }));
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
}
// ---------- 删除任务：关联记录默认保留并解除关联，可选一起删除；均可撤销 ----------
{
  const D = "2026-09-24";
  const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
  const mk = async (id, title, start) => {
    await plugin.tasks.upsert({ ...plugin.tasks.all[0], id, title, parent: null, status: "todo", blocked: false, date: D, start: "", estimate: 0, repeat: { kind: "none", days: [] }, doneDates: [], doneLogs: undefined, startDate: "", endDate: "" });
    await plugin.journal.add({ date: D, start, minutes: 15, category: "学习", title, task: id, extra: {} });
  };
  const jtext = () => app.vault.files.get(`日记/${D}.md`) || "";
  const openDelete = async (title) => {
    view.show("tasks", D); await tick();
    const r = [...root.querySelectorAll(".lubi-task")].find((x) => x.querySelector(".lubi-task-title-text")?.textContent === title);
    r.querySelector(".lubi-task-title-button").click(); await tick();
    O.openModals.at(-1).contentEl.querySelector(".lubi-text-btn-danger").click(); await settle();
    return O.openModals.at(-1);
  };
  const undoLast = async () => { [...document.body.querySelectorAll(".lubi-notice-btn")].at(-1).click(); await settle(); };

  await mk("del-keep", "删除保留测试", "04:00");
  let m = await openDelete("删除保留测试");
  check(m.constructor.name === "DeleteTaskModal" && m.contentEl.querySelectorAll(".lubi-delete-opt").length === 2, "delete: linked records offer keep / remove choice");
  m.contentEl.querySelector(".lubi-btn-danger").click(); await settle();
  check(!plugin.tasks.byId("del-keep") && jtext().includes("删除保留测试") && !jtext().includes("[任务:: del-keep]"), "delete: default keeps the record and strips the link");
  check(!O.openModals.some((x) => x.constructor.name === "TaskModal" || x.constructor.name === "DeleteTaskModal"), "delete: dialogs close after deleting");
  await undoLast();
  check(!!plugin.tasks.byId("del-keep") && jtext().includes("[任务:: del-keep]"), "delete: undo restores task and link");

  await mk("del-rm", "删除记录测试", "04:30");
  m = await openDelete("删除记录测试");
  m.contentEl.querySelectorAll(".lubi-delete-opt input")[1].click();
  m.contentEl.querySelector(".lubi-btn-danger").click(); await settle();
  check(!plugin.tasks.byId("del-rm") && !jtext().includes("删除记录测试"), "delete: remove option deletes linked records");
  await undoLast();
  check(!!plugin.tasks.byId("del-rm") && jtext().includes("[任务:: del-rm]"), "delete: undo restores task and deleted record");

  // 取消删除：任务和编辑窗口都保留
  m = await openDelete("删除记录测试");
  m.contentEl.querySelector(".lubi-modal-actions .lubi-btn-ghost").click(); await tick();
  check(!!plugin.tasks.byId("del-rm") && O.openModals.at(-1)?.constructor.name === "TaskModal", "delete: cancel keeps task and its edit dialog");
  O.openModals.at(-1).close();

  // 任务已不存在时，时间轴不再显示「关联任务」
  await plugin.tasks.remove("del-rm");
  view.show("today", D); await tick();
  const blk = [...root.querySelectorAll(".lubi-block-title")].find((b) => b.textContent === "删除记录测试")?.closest("[class*=lubi-block]")?.parentElement;
  const keep = [...root.querySelectorAll(".lubi-block-title")].find((b) => b.textContent === "删除保留测试");
  check(!!blk && !blk.textContent.includes("关联任务"), "timeline hides link label when the task is gone");
  check(!!keep && keep.parentElement.parentElement.textContent.includes("关联任务"), "timeline still labels links to existing tasks");

  await plugin.tasks.remove("del-keep");
  for (const [s, t] of [["04:00", "删除保留测试"], ["04:30", "删除记录测试"]]) await plugin.journal.remove(D, await plugin.journal.findLine(D, { start: s, minutes: 15, category: "学习", title: t }));
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
}
// ---------- 编辑窗口改状态也直接记；漏记的任务可一键补记 ----------
{
  const D = "2026-09-24", ID = "log-miss";
  const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
  await plugin.tasks.upsert({ ...plugin.tasks.all[0], id: ID, title: "漏记测试", parent: null, status: "todo", blocked: false, date: D, start: "03:00", estimate: 20, repeat: { kind: "none", days: [] }, doneDates: [], doneLogs: undefined, startDate: "", endDate: "", origin: undefined });
  const linked = () => (app.vault.files.get(`日记/${D}.md`) || "").split("\n").filter((l) => l.includes(`[任务:: ${ID}]`));
  const row = () => [...root.querySelectorAll(".lubi-task")].find((r) => r.querySelector(".lubi-task-title-text")?.textContent === "漏记测试");
  const setStatus = async (v) => {
    row().querySelector(".lubi-task-title-button").click(); await tick();
    const m = O.openModals.at(-1);
    m.contentEl.querySelector(`.lubi-status-seg [data-task-status="${v}"]`).click();
    m.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await settle();
  };
  view.show("tasks", D); await tick();
  await setStatus("done");
  check(!O.openModals.some((x) => x.constructor.name === "RecordModal"), "log: marking done in the task dialog does not open a record dialog");
  check(linked().length === 1 && plugin.tasks.byId(ID).doneLogs?.[D]?.start === "03:00", "log: marking done in the task dialog writes and registers the record");
  view.show("tasks", D); await settle();
  check(!row().querySelector(".lubi-task-unlogged"), "log: no backfill hint when the time is recorded");
  await setStatus("todo");
  check(linked().length === 0 && !plugin.tasks.byId(ID).doneLogs, "log: setting back to todo in the dialog removes that record");
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
  // 记录在外部被删 → 待办里出现「未记时间 · 补记」
  view.show("tasks", D); await tick();
  row().querySelector("input[type=checkbox]").click(); await settle();
  await plugin.journal.remove(D, await plugin.journal.findLine(D, { start: "03:00", minutes: 20, category: plugin.tasks.byId(ID).category, title: "漏记测试" }));
  view.show("tasks", D); await settle();
  const hint = row()?.querySelector(".lubi-task-unlogged");
  check(!!hint && hint.textContent.includes("补记") && !hint.hasAttribute("title"), "log: done task without a record shows the backfill hint");
  hint.click(); await settle();
  check(!O.openModals.some((x) => x.constructor.name === "RecordModal") && linked().length === 1, "log: backfill writes the record directly");
  view.show("tasks", D); await settle();
  check(!row().querySelector(".lubi-task-unlogged") && !!plugin.tasks.byId(ID).doneLogs?.[D], "log: backfilled record clears the hint and is registered");
  // 关闭「勾掉任务时自动记一条」时不提示
  await plugin.journal.remove(D, await plugin.journal.findLine(D, { start: "03:00", minutes: 20, category: plugin.tasks.byId(ID).category, title: "漏记测试" }));
  plugin.settings.promptLogOnComplete = false;
  view.show("tasks", D); await settle();
  check(!row().querySelector(".lubi-task-unlogged"), "log: no hint when completion logging is turned off");
  plugin.settings.promptLogOnComplete = true;
  await plugin.tasks.remove(ID);
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
}
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
await tick();
check(statusDraft.titleEl.querySelector(".lubi-dirty")?.classList.contains("is-on") && !statusDraft.contentEl.querySelector(".lubi-status-hint"), "status change is flagged only by the unsaved marker");
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
const PXM = 48 / 60;
const journal = () => app.vault.files.get("日记/2026-09-24.md");
for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
view.show("today", "2026-09-24"); await tick(); await new Promise((r) => setTimeout(r, 200));
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
  check(!!em.contentEl.querySelector(".lubi-timebar") && em.contentEl.querySelectorAll(".lubi-ghost-btn").length === 1, "modal has timebar + notes toggle only");
  check(em.contentEl.querySelector('.lubi-quick-chip[aria-pressed="true"]')?.textContent === "1.5h", "quick chip highlights current duration");
  em.contentEl.querySelectorAll(".lubi-ghost-btn")[0].click(); await tick();
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
// 9c. 回顾 → 点柱子跳到每日页 → 再点顶栏「回顾」能回来
{ view.show("review"); await tick(); await tick();
  const col = [...root.querySelectorAll(".lubi-bar-col")].find((c) => !c.classList.contains("is-empty")) || root.querySelector(".lubi-bar-col");
  col.click(); await tick(); await tick();
  check(view.tab === "today", "clicking a bar jumps to today page");
  const tabs = [...root.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item")];
  check(tabs[0].getAttribute("aria-pressed") === "true" && tabs[1].getAttribute("aria-pressed") === "false", "top tabs reflect the jump");
  tabs[1].click(); await tick(); await tick();
  check(view.tab === "review" && root.querySelector(".lubi-bars") !== null, "clicking 回顾 returns to review page"); }
// 10. 周日程 pointer 拖动：跨列 + 改时间
plugin.settings.scheduleStartHour = 0; view.tasksState.weekAnchor = "2026-09-24"; view.show("tasks", "2026-09-24"); await tick(); // 窗口固定为 9/21–9/27
{ const cols = [...root.querySelectorAll(".lubi-week-day-button")].map((b) => b.getAttribute("aria-label")); check(cols.length === 7 && cols[3].includes("2026-09-24"), `week window centred on anchor: ${cols[3]}`); }
const wb = root.querySelector(".lubi-wblock");
const wt = plugin.tasks.all.find((t) => t.title === wb.querySelector(".lubi-wblock-title").textContent);
const beforeDate = plugin.tasks.forDate("2026-09-25").some((t) => t.id === wt.id) ? "2026-09-25" : null;
const origStart = wt.start;
await drag(wb, 100, 100 + 48, 0, 1);
const after = plugin.tasks.byId(wt.id);
check(after.start === (() => { const [h, m] = origStart.split(":").map(Number); const v = Math.round((h * 60 + m + 60) / 15) * 15; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; })(), `week block moved +1h (snapped to 15min): ${origStart} → ${after.start}`);
check(plugin.tasks.forDate("2026-09-25").some((t) => t.id === wt.id) !== !!beforeDate, `week block moved to next column (was ${beforeDate ? "9/25" : "other day"})`);
const wb2 = [...root.querySelectorAll(".lubi-wblock")].find((x) => x.querySelector(".lubi-wblock-title").textContent === wt.title);
check(!!wb2.querySelector(".lubi-block-handle.is-bottom"), "week block has resize handle");
const est0 = plugin.tasks.byId(wt.id).estimate || 30;
await drag(wb2.querySelector(".lubi-block-handle.is-bottom"), 200, 200 + 24);
check((plugin.tasks.byId(wt.id).estimate || 0) === est0 + 30, `week block resize +30min estimate: ${est0} → ${plugin.tasks.byId(wt.id).estimate}`);
// 11. 周日程 上边缘拉伸：开始提前 30min，预计 +30
const wb3 = [...root.querySelectorAll(".lubi-wblock")].find((x) => x.querySelector(".lubi-wblock-title").textContent === wt.title);
const s0 = plugin.tasks.byId(wt.id).start, e0 = plugin.tasks.byId(wt.id).estimate;
await drag(wb3.querySelector(".lubi-block-handle.is-top"), 300, 300 - 24);
{ const t2 = plugin.tasks.byId(wt.id); const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  check(toMin(t2.start) === toMin(s0) - 30 && t2.estimate === e0 + 30, `week block resize-start: ${s0}/${e0} → ${t2.start}/${t2.estimate}`); }
// 12a. 周日程空白处拖出新任务（与每日页时间轴一致）
{
  view.show("tasks", "2026-09-24"); await tick();
  const cols = [...root.querySelectorAll(".lubi-week-col")];
  const wkDays = [...root.querySelectorAll(".lubi-week-day-button")].map((b) => b.getAttribute("aria-label").match(/\d{4}-\d{2}-\d{2}/)[0]);
  const ci = 2, col = cols[ci], sh = plugin.settings.scheduleStartHour, px = 48 / 60;
  const yAt = (hm) => { const [h, m] = hm.split(":").map(Number); return ((h - sh) * 60 + m) * px + 1; };
  const before = O.openModals.length;
  const ghostOn = () => col.querySelector(".lubi-wghost.is-on");
  pe(col, "pointerdown", yAt("09:00"), 0); pe(window, "pointermove", yAt("09:00") + 5, 0); pe(window, "pointermove", yAt("10:30"), 0);
  check(!!ghostOn() && ghostOn().textContent.includes("09:00–10:30"), `week create: dashed preview follows the drag (${ghostOn()?.textContent})`);
  pe(window, "pointerup", yAt("10:30"), 0); await tick(); await tick();
  const m = O.openModals.at(-1);
  check(O.openModals.length === before + 1 && m.constructor.name === "TaskModal" && m.t.date === wkDays[ci] && m.t.start === "09:00" && m.t.estimate === 90, `week create: drag opens new task prefilled (${m.t?.date} ${m.t?.start} ${m.t?.estimate})`);
  check(!ghostOn(), "week create: preview hidden after release");
  m.close();
  // 向上拖同样可以
  pe(col, "pointerdown", yAt("15:00"), 0); pe(window, "pointermove", yAt("15:00") - 5, 0); pe(window, "pointermove", yAt("14:00"), 0); pe(window, "pointerup", yAt("14:00"), 0); await tick();
  const up = O.openModals.at(-1);
  check(up.constructor.name === "TaskModal" && up.t.start === "14:00" && up.t.estimate === 60, `week create: dragging upward works (${up.t?.start} ${up.t?.estimate})`);
  up.close();
  // Esc 取消 / 单击不新建
  const n0 = O.openModals.length;
  pe(col, "pointerdown", yAt("11:00"), 0); pe(window, "pointermove", yAt("11:00") + 5, 0); pe(window, "pointermove", yAt("12:00"), 0);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
  pe(col, "pointerdown", yAt("13:00"), 0); pe(window, "pointerup", yAt("13:00"), 0); await tick();
  check(O.openModals.length === n0 && !ghostOn(), "week create: Esc cancels and a plain click creates nothing");
  // 保存后出现在周日程
  pe(col, "pointerdown", yAt("07:00"), 0); pe(window, "pointermove", yAt("07:00") + 5, 0); pe(window, "pointermove", yAt("07:45"), 0); pe(window, "pointerup", yAt("07:45"), 0); await tick();
  const nm = O.openModals.at(-1);
  const ti = nm.contentEl.querySelector("input[type=text]"); ti.value = "拖出的任务"; ti.dispatchEvent(new window.Event("input", { bubbles: true }));
  nm.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await tick(); await tick();
  await tick(); await tick();
  const made = plugin.tasks.all.find((t) => t.title === "拖出的任务");
  await new Promise((r) => setTimeout(r, 300));
  check(!!made && made.date === wkDays[ci] && made.start === "07:00" && made.estimate === 45 && [...root.querySelectorAll(".lubi-wblock-title")].some((x) => x.textContent === "拖出的任务"), "week create: saved task appears on the schedule");
  if (made) await plugin.tasks.remove(made.id);
}
// 12. 甘特：项目条整体右移 7 天 + 右端拉长 3 天
view.tasksState.projectsOpen = true; view.show("tasks"); await tick();
const proj = plugin.tasks.projects().find((p) => plugin.tasks.span(p));
const bar = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.getAttribute("aria-label")?.startsWith(proj.title));
check(!!bar && bar.querySelector(".lubi-gantt-handle.is-left") && bar.querySelector(".lubi-gantt-handle.is-right"), "gantt bar has both handles");
const span0 = plugin.tasks.span(proj);
await drag(bar, 10, 10, 0, 7);
const span1 = plugin.tasks.span(plugin.tasks.byId(proj.id));
const dayDiff = (x, y) => Math.round((new Date(y) - new Date(x)) / 864e5);
check(dayDiff(span0.from, span1.from) === 7 && dayDiff(span0.to, span1.to) === 7, `gantt move +7d: ${span0.from}→${span1.from}, ${span0.to}→${span1.to}`);
const bar2 = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.getAttribute("aria-label")?.startsWith(proj.title));
await drag(bar2.querySelector(".lubi-gantt-handle.is-right"), 10, 10, 0, 5);
const span2 = plugin.tasks.span(plugin.tasks.byId(proj.id));
check(span2.from === span1.from && dayDiff(span1.to, span2.to) === 5, `gantt resize right +5d: ${span1.to}→${span2.to}`);
const bar3 = [...root.querySelectorAll(".lubi-gantt-bar")].find((x) => x.getAttribute("aria-label")?.startsWith(proj.title));
await drag(bar3.querySelector(".lubi-gantt-handle.is-left"), 10, 10, 0, 4);
const span3 = plugin.tasks.span(plugin.tasks.byId(proj.id));
check(dayDiff(span2.from, span3.from) === 4 && span3.to === span2.to, `gantt resize left +4d: ${span2.from}→${span3.from}`);
check(!root.querySelector(".lubi-error"), "no render errors after drag tests");
// ---------- UX 回归：页面日期、表单键盘、异常/表格、任务撤销 ----------
await new Promise((resolve) => setTimeout(resolve, 200));
view.show("today", "2026-09-13"); await tick(); await tick();
check(root.querySelector(".lubi-today-side")?.textContent.includes("9/13 分布"), "historical summary uses selected date");
check(!root.querySelector(".lubi-today-side .lubi-day-tasks"), "daily side panel no longer repeats the task list");
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
check(!!document.body.querySelector(".lubi-tip") && focusBar.querySelector(".lubi-sr-only")?.textContent.includes("覆盖"), "review chart explains values on keyboard focus");
check(!root.querySelector(".lubi-bar-col[aria-label], .lubi-bar-col[title]"), "tooltip: chart bars show only the custom hover card");
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
check(O.openModals.at(-1).constructor.name === "TaskModal" && O.openModals.at(-1).t.date === "2026-09-22", "N on the task page opens 待做 on the selected date");
O.openModals.at(-1).close();
view.show("today"); await tick();
check(view.date === "2026-09-22", "daily page follows the date picked on the task page");
view.setDate("2026-09-23"); view.show("tasks"); await tick();
check(view.tasksState.selectedDate === "2026-09-23" && root.querySelector(".lubi-date-label")?.textContent.includes("2026-09-23"), "task page follows the date picked on the daily page");
check(!root.querySelector(".lubi-error"), "no render errors after keyboard and schedule flows");

// 悬浮提示不重复：Obsidian 会给带 aria-label 的元素显示提示，再有 title 就会出现两个一样的
{
  const dupes = [];
  const scan = (where, host) => dupes.push(...[...host.querySelectorAll("[title]")].map((e) => `${where}:${e.tagName.toLowerCase()}.${e.className}`));
  for (const tab of ["today", "review", "tasks"]) { view.show(tab, "2026-09-24"); await tick(); await tick(); scan(tab, view.containerEl); }
  view.tasksState.projectsOpen = true; view.show("tasks", "2026-09-24"); await tick(); scan("tasks+projects", view.containerEl);
  plugin.quickLog(); await tick(); scan("record-modal", O.openModals.at(-1).modalEl); O.openModals.at(-1).close();
  const anyTask = [...root.querySelectorAll(".lubi-task-title-button")][0];
  if (anyTask) { anyTask.click(); await tick(); scan("task-modal", O.openModals.at(-1).modalEl); O.openModals.at(-1).close(); }
  check(dupes.length === 0, `tooltip: no element uses a native title tooltip (${dupes.length}${dupes.length ? ": " + dupes.slice(0, 6).join(", ") : ""})`);
  check(root.querySelectorAll(".lubi-icon-btn[aria-label]").length > 0, "tooltip: icon buttons keep their Obsidian tooltip (aria-label)");
}

// ---------- v1.5：计划层 + 待确认记录 ----------
{
  const D = "2026-09-26", ID = "plan-1";
  const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
  for (const n of [...document.body.children]) if (n.querySelector?.(".lubi-notice-btn")) n.remove();
  await plugin.tasks.upsert({ ...plugin.tasks.all[0], id: ID, title: "计划层测试", category: "学习", parent: null, status: "todo", blocked: false, date: D, start: "15:00", estimate: 60, repeat: { kind: "none", days: [] }, doneDates: [], doneLogs: undefined, startDate: "", endDate: "", origin: undefined });
  view.show("today", D); await settle();
  const plan = [...root.querySelectorAll(".lubi-plan")].find((x) => x.textContent.includes("计划层测试"));
  check(!!plan && !!root.querySelector(".lubi-tl-canvas.has-plans"), "plan: a timed task is drawn in the plan lane");
  check(!!root.querySelector(".lubi-plan-card"), "plan: side panel shows plan progress");
  plan?.click(); await tick();
  const pm = O.openModals.at(-1);
  check(pm?.constructor.name === "RecordModal" && pm.rec.task === ID && pm.rec.start === "15:00" && pm.rec.minutes === 60, "plan: clicking a plan pre-fills a linked record");
  pm?.contentEl.querySelector(".lubi-modal-actions .mod-cta").click(); await settle();
  check(plugin.tasks.isDoneOn(plugin.tasks.byId(ID), D) && plugin.tasks.byId(ID).doneLogs?.[D]?.start === "15:00", "plan: saving the record completes the task");
  check(!(app.vault.files.get(`日记/${D}.md`) || "").includes("[待确认::"), "plan: a record confirmed in the form is not pending");
  view.show("today", D); await settle();
  check(![...root.querySelectorAll(".lubi-plan")].some((x) => x.textContent.includes("计划层测试")), "plan: a completed plan leaves the plan lane");
  // 待确认：虚线 + 徽标；点 ✓ 去掉标记
  await plugin.journal.add({ date: D, start: "17:00", minutes: 30, category: "学习", title: "待确认测试", extra: { 待确认: "按计划" } });
  view.show("today", D); await settle();
  const pb = [...root.querySelectorAll(".lubi-block.is-pending")].find((x) => x.textContent.includes("待确认测试"));
  check(!!pb?.querySelector(".lubi-pending-badge"), "pending: an estimated record is flagged on the timeline");
  view.show("review", D); await settle();
  check(!!root.querySelector(".lubi-kpi-pending"), "pending: review KPI calls out estimated time");
  view.show("today", D); await settle();
  const pb2 = [...root.querySelectorAll(".lubi-block.is-pending")].find((x) => x.textContent.includes("待确认测试"));
  pb2?.querySelector('.lubi-block-actions [aria-label="确认：时间与计划一致"]')?.click(); await settle();
  check(!(app.vault.files.get(`日记/${D}.md`) || "").includes("[待确认::"), "pending: ✓ confirms the record");
  // 主按钮文字随页面变化
  view.show("tasks", D); await settle();
  check(root.querySelector(".lubi-topbar-cta")?.textContent.includes("加任务"), "cta: task page button reads 加任务");
  view.show("today", D); await settle();
  check(root.querySelector(".lubi-topbar-cta")?.textContent.includes("记一条"), "cta: daily page button reads 记一条");
  check(!root.querySelector(".lubi-error"), "no render errors after plan / pending flows");
}

console.log("data file now:", app.vault.files.get("任务/任务数据.json").slice(0, 120).replace(/\n/g, " "));
console.log(fails ? `\n${fails} FAILED` : "\nSMOKE ALL PASSED");
process.exit(fails ? 1 : 0);
