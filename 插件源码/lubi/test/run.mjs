import * as C from "./core.mjs";
import { legacyJournal, legacyTasks } from "./fixtures.mjs";
let fails = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.log("FAIL", msg, "\n  got:", JSON.stringify(a), "\n  exp:", JSON.stringify(b)); } else console.log("ok  ", msg); };

// 1. 记录行 往返
const r1 = C.parseRecordLine("- 09:00–10:30 学习 · 三明治定理习题 [时长:: 1.5h] [任务:: abc] [备注:: 做了 12 题]", "2026-09-24");
eq([r1.start, r1.minutes, r1.category, r1.title, r1.task, r1.notes], ["09:00", 90, "学习", "三明治定理习题", "abc", "做了 12 题"], "parse timed line");
eq(C.serializeRecord(r1), "- 09:00–10:30 学习 · 三明治定理习题 [时长:: 1.5h] [任务:: abc] [备注:: 做了 12 题]", "serialize roundtrip");
const r2 = C.parseRecordLine("- 12:30 财务 · 午饭 [金额:: 35] [类别:: 餐饮]", "2026-09-24");
eq([r2.minutes, r2.amount, r2.expenseType], [0, 35, "餐饮"], "parse money line");
eq(C.serializeRecord(r2), "- 12:30 财务 · 午饭 [金额:: 35] [类别:: 餐饮]", "serialize money");
const r3 = C.parseRecordLine("- 23:00-01:00 睡眠 · 小睡", "2026-09-24");
eq(r3.minutes, 120, "cross-midnight range without 时长 field");
eq(C.parseRecordLine("- 随便写的一行", "x"), null, "non-record line ignored");
eq(C.parseRecordLine("- 09:00 学习: 冒号分隔 [时长:: 45min]", "x").minutes, 45, "colon separator + min unit");
// 拆分
const sp = C.splitAtMidnight({ date: "2026-09-24", start: "23:00", minutes: 180, category: "睡眠", title: "睡", extra: {} });
eq([sp.today.minutes, sp.tomorrow.start, sp.tomorrow.minutes], [60, "00:00", 120], "split at midnight");

// 预计用时快照：新字段独立于实际时长，旧记录与无效手写字段仍能往返。
const estimated = C.parseRecordLine("- 09:00–10:00 学习 · 预计对比 [时长:: 1h] [预计用时:: 45min] [任务:: estimate-task]", "2026-09-24");
eq([estimated.minutes, estimated.estimatedMinutes, estimated.task], [60, 45, "estimate-task"], "estimate: parse snapshot separately from actual duration");
eq(C.serializeRecord(estimated), "- 09:00–10:00 学习 · 预计对比 [时长:: 1h] [预计用时:: 45min] [任务:: estimate-task]", "estimate: snapshot roundtrip");
eq(r1.estimatedMinutes, undefined, "estimate: legacy records do not invent an estimate");
const invalidEstimate = C.parseRecordLine("- 09:00–09:30 学习 · 手写字段 [预计用时:: 未知]", "2026-09-24");
eq([invalidEstimate.estimatedMinutes, C.serializeRecord(invalidEstimate).includes("[预计用时:: 未知]")], [undefined, true], "estimate: preserve an invalid handwritten field without comparing it");
const estimatedSplit = C.splitAtMidnight({ ...estimated, start: "23:30", minutes: 90 });
eq([estimatedSplit.today.estimatedMinutes, estimatedSplit.tomorrow.estimatedMinutes], [45, 45], "estimate: midnight segments retain the same task snapshot, not additive forecasts");
eq(C.normalizeEstimatedMinutes(0), undefined, "estimate: zero is not a forecast");
eq([C.normalizeEstimatedMinutes(-10), C.normalizeEstimatedMinutes(NaN), C.normalizeEstimatedMinutes(Infinity)], [undefined, undefined, undefined], "estimate: invalid minutes are not forecasts");
eq(C.formatEstimateComparison(estimated), "预计 45min · 实际 1h · 超出 15min", "estimate: overrun comparison");
eq(C.formatEstimateComparison({ ...estimated, minutes: 30 }), "预计 45min · 实际 30min · 少于 15min", "estimate: underrun comparison is not an efficiency judgment");
eq(C.formatEstimateComparison({ ...estimated, minutes: 45 }), "预计 45min · 实际 45min · 与预计一致", "estimate: equal duration comparison");
eq(C.formatEstimateComparison(r1), "", "estimate: no comparison without a snapshot");
eq(C.formatEstimateComparison({ ...estimated, extra: { [C.PENDING_KEY]: "按计划" } }), "预计 45min · 记录 1h（待确认） · 核对后再比较", "estimate: pending time is not presented as verified actual time");
eq(C.parseRecordLine(C.serializeRecord({ ...estimated, estimatedMinutes: 61 }), estimated.date).estimatedMinutes, 61, "estimate: minute precision survives duration formatting");
eq(C.serializeRecord({ ...estimated, extra: { 预计用时: "90min" } }).match(/预计用时::/g).length, 1, "estimate: only one authoritative snapshot field is serialized");
eq(C.parseRecordLine("- 09:00–10:00 学习 · 长预计 [预计用时:: 1h30m]", estimated.date).estimatedMinutes, 90, "estimate: handwritten duration units are supported");

// 2. 旧卡片解析：仅合成夹具
const legacy = legacyJournal;
const cards = C.parseLegacyCards(legacy, "2026-09-24");
eq(cards.length, 1, "legacy card count");
eq([cards[0].title, cards[0].category, cards[0].minutes, cards[0].start, cards[0].task], ["三明治定理习题", "学习", 375, "01:10", "427a21a1-a226-442f-8a9d-e7775e8e0b0d"], "legacy card fields");
const converted = C.convertText(legacy, "2026-09-24", cards);
console.log("---- converted 2026-09-24.md ----\n" + converted + "\n----");
eq(converted.includes("journal-card"), false, "html removed");
eq(converted.includes("daily-task-log"), false, "task log removed");
eq(C.parseLines(converted, "2026-09-24").length, 1, "converted parses back");
// 旧卡片里的 [任务::stage:xxx] 应该规范化为纯 id
// 3. writeSection 保留其他内容
const doc = "---\ndate: 2026-09-01\n---\n\n# 2026-09-01\n\n## 记录\n- 08:00–09:00 学习 · A [时长:: 1h]\n\n手写的一段说明\n\n## 我的日记\n今天很好\n";
const next = C.writeSection(doc, [...C.parseLines(doc, "2026-09-01").map(x => x.rec), { date: "2026-09-01", start: "07:00", minutes: 30, category: "运动", title: "跑步", extra: {} }]);
console.log("---- writeSection ----\n" + next + "\n----");
eq(next.includes("## 我的日记\n今天很好"), true, "other sections preserved");
eq(next.includes("手写的一段说明"), true, "manual text preserved");
eq(next.indexOf("07:00") < next.indexOf("08:00"), true, "sorted by time");
// 无节的文件
const bare = "---\ndate: 2026-09-02\n---\n\n# 2026-09-02\n\n随笔\n";
const withSec = C.writeSection(bare, [{ date: "2026-09-02", start: "10:00", minutes: 60, category: "学习", title: "X", extra: {} }]);
eq(withSec.includes("# 2026-09-02\n\n## 记录\n- 10:00–11:00 学习 · X [时长:: 1h]\n\n随笔"), true, "section inserted after H1");

// 4. 任务迁移：合成 v13
const v13 = legacyTasks;
const v14 = C.migrateLegacy(v13);
eq(v14.version, 14, "v14 version");
eq(v14.tasks.length, [...v13.tasks, ...v13.subtasks].filter(n => !n.retired).length, "all non-retired nodes migrated");
const byId = new Map(v14.tasks.map(t => [t.id, t]));
const sandwich = v14.tasks.find(t => t.title === "三明治定理习题");
eq([sandwich.status, sandwich.date, sandwich.start, sandwich.estimate, sandwich.category], ["done", "2026-09-24", "01:10", 120, "学习"], "subtask fields");
eq(byId.get(sandwich.parent)?.title, "学习三明治定理", "parent chain kept");
const synth = C.migrateLegacy({ categories: [{ id: "c", name: "运动" }], tasks: [{ id: "r1", title: "晨跑", categoryId: "c", status: "blocked", schedule: { repeat: "weekly", weekdays: [1, 3, 5], startTime: "07:00", endTime: "07:40" } }], subtasks: [] });
const rec = synth.tasks[0];
eq([rec.repeat.kind, rec.repeat.days, rec.blocked, rec.status, rec.start, rec.estimate], ["weekly", [1, 3, 5], true, "todo", "07:00", 40], "recurring + blocked mapped");
const roots = v14.tasks.filter(t => !t.parent);
console.log("roots:", roots.map(t => `${t.title}(${t.status}${t.repeat.kind !== 'none' ? ',' + t.repeat.kind : ''})`).join(", "));
const limit = v14.tasks.find(t => t.title === "学习极限");
eq(byId.get(limit.parent)?.title, "学习微积分", "top subtask parent = root task");
// occursOn
eq(C.occursOn({ ...rec, repeat: { kind: "daily", days: [] }, created: "2026-09-01T00:00:00Z" }, "2026-09-24"), true, "daily occurs");
eq(C.occursOn(sandwich, "2026-09-24"), true, "dated occurs");
eq(C.occursOn(sandwich, "2026-09-25"), false, "dated not other day");
const weekly = { ...rec, repeat: { kind: "weekly", days: [1, 3] }, created: "2026-09-01T00:00:00Z" };
eq([C.occursOn(weekly, "2026-09-21"), C.occursOn(weekly, "2026-09-22")], [true, false], "weekly Mon yes Tue no");
eq([C.occursOn({ ...weekly, skipDates: ["2026-09-21"] }, "2026-09-21"), C.occursOn({ ...weekly, skipDates: ["2026-09-21"] }, "2026-09-22")], [false, false], "repeat skip date");

// 5. time utils
eq(C.weekStart("2026-09-24"), "2026-09-21", "weekStart Monday");
eq(C.monthEnd("2026-02-10"), "2026-02-28", "monthEnd");
eq([C.isValidDate("2026-02-28"), C.isValidDate("2026-02-29"), C.isValidDate("2026-02-31"), C.isValidDate("2026-13-01")], [true, false, false, false], "strict calendar dates");
eq(C.fmtDuration(90), "1.5h", "fmtDuration");
eq(C.fmtDurationField(375), "6.25h", "fmtDurationField");

// 6. 重叠、跨日、边界和全天覆盖的纯函数（只用于展示，不写文件）
eq(C.dayTimeStats([{ start: "10:00", minutes: 60 }, { start: "10:30", minutes: 60 }]),
  { recordedMinutes: 120, coveredMinutes: 90, overlapMinutes: 30, emptyMinutes: 1350, invalidCount: 0 }, "overlapping spans: 120 recorded, 90 covered");
eq(C.dayTimeStats([{ start: "00:00", minutes: 1440 }]),
  { recordedMinutes: 1440, coveredMinutes: 1440, overlapMinutes: 0, emptyMinutes: 0, invalidCount: 0 }, "full-day upper boundary");
eq(C.dayTimeStats([{ start: "23:30", minutes: 90 }, { start: "08:00", minutes: 0 }]),
  { recordedMinutes: 90, coveredMinutes: 30, overlapMinutes: 0, emptyMinutes: 1410, invalidCount: 1 }, "cross-midnight legacy: clipped and flagged");
eq(C.dayTimeStats([{ start: "23:00", minutes: 1500 }, { start: "23:30", minutes: 90 }]).emptyMinutes >= 0, true, "no negative blank with invalid and overlapping data");
eq(C.invalidTimedSpan({ start: "23:59", minutes: 1 }), false, "23:59 + 1min is valid");
eq(C.dayTimeStats([{ start: "not-a-time", minutes: 20 }]),
  { recordedMinutes: 20, coveredMinutes: 0, overlapMinutes: 0, emptyMinutes: 1440, invalidCount: 1 }, "malformed time does not produce false coverage");

// 7. v1.4 一行输入解析
const CATS = ["学习", "运动", "睡眠", "饮食", "日常"];
eq(C.parseQuick("9:00-10:30 学习 三明治定理", CATS), { title: "三明治定理", start: "09:00", minutes: 90, category: "学习" }, "quick: range + category + title");
eq(C.parseQuick("30min 跑步", CATS), { title: "跑步", minutes: 30 }, "quick: minutes");
eq(C.parseQuick("看书 1h30m", CATS), { title: "看书", minutes: 90 }, "quick: 1h30m suffix");
eq(C.parseQuick("1.5h 运动 游泳", CATS), { title: "游泳", minutes: 90, category: "运动" }, "quick: decimal hours + category");
eq(C.parseQuick("14:00 午饭", CATS), { title: "午饭", start: "14:00" }, "quick: single start time");
eq(C.parseQuick("23:00-01:00 睡眠 小睡", CATS).minutes, 120, "quick: range across midnight");
eq(C.parseQuick("读《1984》", CATS), null, "quick: plain title untouched");
eq(C.parseQuick("跑步 5km", CATS), null, "quick: 5km is not a duration");
eq(C.parseQuick("学习", CATS), null, "quick: lone category word stays a title");
eq(C.parseQuick("45分钟 冥想", CATS), { title: "冥想", minutes: 45 }, "quick: Chinese minutes");
eq(C.parseEstimate("2.5h"), 150, "estimate: 2.5h");
eq(C.parseEstimate("150"), 150, "estimate: bare minutes");
eq(C.parseEstimate("1h30m"), 90, "estimate: 1h30m");
eq(C.parseEstimate("abc"), null, "estimate: invalid");
eq(C.parseEstimate(""), 0, "estimate: empty = 0");

// 8. v1.4 色板：默认分类色与 Obsidian 默认强调色色相差 >= 30°
const accent = C.resolveDefault("var(--interactive-accent)");
const minHue = Math.min(...C.DEFAULT_CATEGORIES.map((c) => C.resolveDefault(c.color)).filter((rgb) => rgb && C.hsl(rgb).s >= 0.25).map((rgb) => C.hueDistance(rgb, accent)));
eq(minHue >= 30, true, `default palette keeps >= 30° hue distance from accent (min ${Math.round(minHue)}°)`);
eq(C.accentConflicts(C.DEFAULT_CATEGORIES, "var(--interactive-accent)"), [], "no default category conflicts with accent");
eq(C.accentConflicts([{ name: "睡眠", color: "var(--color-purple)" }], "var(--interactive-accent)"), ["睡眠"], "legacy purple sleep is flagged");
const legacySettings = { ...C.DEFAULT_SETTINGS, paletteVersion: 1, categories: [{ name: "睡眠", icon: "moon", color: "var(--color-purple)", kind: "time" }, { name: "学习", icon: "book-open", color: "#123456", kind: "time" }, { name: "日常", icon: "coffee", color: "var(--color-red)", kind: "time" }] };
eq(C.migratePalette(legacySettings), true, "palette migration runs once");
eq(legacySettings.categories.map((c) => [c.name, c.color, !!c.rest]), [["睡眠", "#6b7a99", true], ["学习", "#123456", false], ["日常", "var(--color-red)", false]], "migration only replaces untouched legacy defaults");
eq(C.migratePalette(legacySettings), false, "palette migration is idempotent");
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
