"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LubiPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian11 = require("obsidian");

// src/settings.ts
var DEFAULT_CATEGORIES = [
  { name: "\u5B66\u4E60", icon: "book-open", color: "var(--color-blue)", kind: "time" },
  { name: "\u8FD0\u52A8", icon: "dumbbell", color: "var(--color-green)", kind: "time" },
  { name: "\u7761\u7720", icon: "moon", color: "#6b7a99", kind: "time", rest: true },
  { name: "\u996E\u98DF", icon: "utensils", color: "var(--color-orange)", kind: "time" },
  { name: "\u65E5\u5E38", icon: "coffee", color: "#a0856b", kind: "time" },
  { name: "\u8D22\u52A1", icon: "wallet", color: "var(--color-yellow)", kind: "money" }
];
var LEGACY_DEFAULT_COLORS = {
  \u7761\u7720: "var(--color-purple)",
  \u65E5\u5E38: "var(--color-base-60)"
};
function migratePalette(settings) {
  if ((settings.paletteVersion || 1) >= 2) return false;
  let changed = false;
  for (const c of settings.categories) {
    const def = DEFAULT_CATEGORIES.find((d) => d.name === c.name);
    if (!def) continue;
    if (LEGACY_DEFAULT_COLORS[c.name] && c.color === LEGACY_DEFAULT_COLORS[c.name]) {
      c.color = def.color;
      changed = true;
    }
    if (def.rest && c.rest === void 0) {
      c.rest = true;
      changed = true;
    }
  }
  settings.paletteVersion = 2;
  return true;
}
var DEFAULT_SETTINGS = {
  journalFolder: "\u65E5\u8BB0",
  taskFile: "\u4EFB\u52A1/\u4EFB\u52A1\u6570\u636E.json",
  backupFolder: "\u5907\u4EFD",
  scheduleStartHour: 6,
  scheduleEndHour: 24,
  promptLogOnComplete: true,
  onboardingDone: false,
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  expenseTypes: ["\u9910\u996E", "\u5C45\u4F4F", "\u4EA4\u901A", "\u670D\u9970\u4E2A\u62A4", "\u4F11\u95F2\u5A31\u4E50", "\u533B\u7597\u4FDD\u5065", "\u6559\u80B2\u63D0\u5347", "\u5176\u4ED6"],
  dailyCapacityHours: 8,
  paletteVersion: 2
};
function categoryOf(settings, name) {
  return settings.categories.find((c) => c.name === name) || {
    name,
    icon: "tag",
    color: "var(--color-base-50)",
    kind: "time"
  };
}

// src/core/journal.ts
var import_obsidian = require("obsidian");

// src/core/time.ts
function pad(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  return dateStr(/* @__PURE__ */ new Date());
}
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}
function shiftDate(s, days) {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return dateStr(d);
}
function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s).getTime());
}
function nowHM() {
  const d = /* @__PURE__ */ new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
function minToHM(min) {
  const m = (Math.round(min) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function fmtDuration(min) {
  if (!min) return "0min";
  if (min < 60) return `${Math.round(min)}min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(h < 10 ? 2 : 1).replace(/\.?0+$/, "")}h`;
}
function fmtHours(min) {
  const h = min / 60;
  return h.toFixed(1).replace(/\.0$/, "") + "h";
}
function weekStart(s) {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  return shiftDate(s, -dow);
}
function monthStart(s) {
  return s.slice(0, 7) + "-01";
}
function monthEnd(s) {
  const d = parseDate(monthStart(s));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return dateStr(d);
}
function daysBetween(a, b) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5);
}
function eachDate(from, to) {
  const out = [];
  for (let s = from; s <= to; s = shiftDate(s, 1)) out.push(s);
  return out;
}
var WEEKDAY_ZH = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
function weekdayZh(s) {
  return WEEKDAY_ZH[(parseDate(s).getDay() + 6) % 7];
}
function shortDate(s) {
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
}
function uid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function stamp() {
  const d = /* @__PURE__ */ new Date();
  return `${dateStr(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// src/core/records.ts
var LINE_RE = /^-\s+(\d{1,2}:\d{2})(?:\s*[–\-~到至]\s*(\d{1,2}:\d{2}))?\s+(\S+?)\s*[·:：]\s*(.*)$/;
var FIELD_RE = /\[([^\[\]:]+)::\s*([^\]]*)\]/g;
var KNOWN = {
  \u65F6\u957F: "minutes",
  \u4EFB\u52A1: "task",
  \u91D1\u989D: "amount",
  \u7C7B\u522B: "expenseType",
  \u5907\u6CE8: "notes"
};
function parseDuration(text) {
  const t = text.trim();
  let m = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/i.exec(t) || /^(\d+(?:\.\d+)?)\s*小时$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|分钟|分)$/i.exec(t);
  if (m) return Math.round(Number(m[1]));
  m = /^(\d+)\s*h\s*(\d+)\s*(m|min)?$/i.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  if (m) return Math.round(Number(m[1]));
  return null;
}
function fmtDurationField(min) {
  if (min % 60 === 0) return `${min / 60}h`;
  if (min < 60) return `${min}min`;
  const h = min / 60;
  return `${Math.round(h * 100) / 100}h`;
}
function parseRecordLine(line, date) {
  const m = LINE_RE.exec(line.trim());
  if (!m) return null;
  const [, start, end, category, restRaw] = m;
  const extra = {};
  const fields = {};
  const title = restRaw.replace(FIELD_RE, (_all, k, v) => {
    fields[k.trim()] = v.trim();
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  let minutes = 0;
  if (fields["\u65F6\u957F"] !== void 0) minutes = parseDuration(fields["\u65F6\u957F"]) ?? 0;
  else if (end) {
    const diff = hmToMin(end) - hmToMin(start);
    minutes = diff >= 0 ? diff : diff + 1440;
  }
  const rec = { date, start: minToHM(hmToMin(start)), minutes, category, title, extra };
  for (const [k, v] of Object.entries(fields)) {
    const key = KNOWN[k];
    if (key === "task") rec.task = v || void 0;
    else if (key === "amount") rec.amount = v === "" ? void 0 : Number(v.replace(/[^\d.\-]/g, ""));
    else if (key === "expenseType") rec.expenseType = v || void 0;
    else if (key === "notes") rec.notes = unescapeField(v) || void 0;
    else if (key === "minutes") {
    } else extra[k] = v;
  }
  return rec;
}
function escapeField(v) {
  return v.replace(/\r?\n/g, " ").replace(/\]/g, "\uFF3D").replace(/\[/g, "\uFF3B").trim();
}
function unescapeField(v) {
  return v.replace(/］/g, "]").replace(/［/g, "[");
}
function serializeRecord(r) {
  const parts = [];
  const startMin = hmToMin(r.start);
  const time = r.minutes > 0 ? `${minToHM(startMin)}\u2013${minToHM(startMin + r.minutes)}` : minToHM(startMin);
  parts.push(`- ${time} ${r.category} \xB7 ${escapeField(r.title || "\u672A\u547D\u540D")}`);
  if (r.minutes > 0) parts.push(`[\u65F6\u957F:: ${fmtDurationField(r.minutes)}]`);
  if (r.amount !== void 0 && !isNaN(r.amount)) parts.push(`[\u91D1\u989D:: ${r.amount}]`);
  if (r.expenseType) parts.push(`[\u7C7B\u522B:: ${escapeField(r.expenseType)}]`);
  if (r.task) parts.push(`[\u4EFB\u52A1:: ${r.task}]`);
  for (const [k, v] of Object.entries(r.extra || {})) if (v) parts.push(`[${k}:: ${escapeField(v)}]`);
  if (r.notes) parts.push(`[\u5907\u6CE8:: ${escapeField(r.notes)}]`);
  return parts.join(" ");
}
var PENDING_KEY = "\u5F85\u786E\u8BA4";
function isPending(r) {
  return !!r.extra?.[PENDING_KEY];
}
function confirmed(r) {
  const extra = { ...r.extra || {} };
  delete extra[PENDING_KEY];
  return { ...r, extra };
}
function sortRecs(items) {
  return items.slice().sort((a, b) => hmToMin(a.rec.start) - hmToMin(b.rec.start));
}
function splitAtMidnight(r) {
  const s = hmToMin(r.start);
  if (s + r.minutes <= 1440) return { today: r, tomorrow: null };
  const todayPart = { ...r, minutes: 1440 - s };
  const tomorrowPart = { ...r, start: "00:00", minutes: s + r.minutes - 1440 };
  return { today: todayPart, tomorrow: tomorrowPart };
}
var CARD_RE = /<div class="journal-card">([^\n]*?)<div class="journal-right">[ \t]*(\d{1,2}:\d{2})[ \t]*<\/div>[ \t]*<\/div>/g;
function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}
function parseLegacyCards(text, date) {
  const out = [];
  for (const m of stripCodeBlocks(text).matchAll(CARD_RE)) {
    const body = m[1];
    const time = m[2];
    const t = /class="journal-title">([\s\S]*?)<span class="journal-hashtag">#([^<]+)<\/span>/.exec(body);
    const rawTitle = (t?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const category = (t?.[2] || "\u65E5\u5E38").trim();
    const title = (rawTitle.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "").trim() || "\u672A\u547D\u540D").slice(0, 200);
    const fields = {};
    for (const f of body.matchAll(/\[([^\[\]:]+)::\s*([^\]]*)\]/g)) fields[f[1].trim()] = f[2].trim();
    const notesM = /class="journal-notes">([\s\S]*?)<\/div>/.exec(body);
    const rec = {
      date,
      start: minToHM(hmToMin(time)),
      minutes: fields["\u65F6\u957F"] ? parseDuration(fields["\u65F6\u957F"]) ?? 0 : 0,
      category,
      title,
      extra: {}
    };
    if (fields["\u4EFB\u52A1"]) rec.task = fields["\u4EFB\u52A1"];
    if (fields["\u91D1\u989D"]) rec.amount = Number(fields["\u91D1\u989D"].replace(/[^\d.\-]/g, ""));
    if (fields["\u7C7B\u522B"]) rec.expenseType = fields["\u7C7B\u522B"];
    if (notesM) rec.notes = notesM[1].replace(/<[^>]+>/g, "").trim().slice(0, 1e3) || void 0;
    out.push(rec);
  }
  return out;
}
function hasLegacyCards(text) {
  return CARD_RE.test(stripCodeBlocks(text)) ? (CARD_RE.lastIndex = 0, true) : (CARD_RE.lastIndex = 0, false);
}

// src/core/journal.ts
var SECTION = "## \u8BB0\u5F55";
var Journal = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  path(date) {
    return (0, import_obsidian.normalizePath)(`${this.settings().journalFolder}/${date}.md`);
  }
  file(date) {
    const f = this.app.vault.getAbstractFileByPath(this.path(date));
    return f instanceof import_obsidian.TFile ? f : null;
  }
  /** 所有日记日期（升序） */
  dates() {
    const folder = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(this.settings().journalFolder));
    if (!(folder instanceof import_obsidian.TFolder)) return [];
    const out = [];
    for (const c of folder.children) {
      if (c instanceof import_obsidian.TFile && c.extension === "md" && isValidDate(c.basename)) out.push(c.basename);
    }
    return out.sort();
  }
  async ensure(date) {
    const existing = this.file(date);
    if (existing) return existing;
    const folder = (0, import_obsidian.normalizePath)(this.settings().journalFolder);
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const content = `---
date: ${date}
---

# ${date}

${SECTION}

`;
    return this.app.vault.create(this.path(date), content);
  }
  async read(date) {
    const f = this.file(date);
    if (!f) return [];
    const text = await this.app.vault.cachedRead(f);
    return parseLines(text, date);
  }
  /** 一次读多天，返回 date -> 记录 */
  async readRange(dates) {
    const out = /* @__PURE__ */ new Map();
    await Promise.all(
      dates.map(async (d) => {
        const rows = await this.read(d);
        if (rows.length) out.set(d, sortRecs(rows).map((r) => r.rec));
      })
    );
    return out;
  }
  /** 新增：自动处理跨夜拆分与 24h 上限 */
  async add(rec) {
    const { today, tomorrow } = splitAtMidnight(rec);
    await this.checkCap(today.date, today, null);
    if (tomorrow) {
      tomorrow.date = shiftDate(rec.date, 1);
      await this.checkCap(tomorrow.date, tomorrow, null);
    }
    await this.mutate(today.date, (recs) => [...recs, today]);
    if (tomorrow) await this.mutate(tomorrow.date, (recs) => [...recs, tomorrow]);
  }
  async update(date, line, rec) {
    const { today, tomorrow } = splitAtMidnight(rec);
    await this.checkCap(date, today, line);
    await this.mutateLines(date, (rows) => {
      const next = rows.map((r) => r.rec);
      const idx = rows.findIndex((r) => r.line === line);
      if (idx >= 0) next[idx] = today;
      else next.push(today);
      return next;
    });
    if (tomorrow) {
      tomorrow.date = shiftDate(date, 1);
      await this.mutate(tomorrow.date, (recs) => [...recs, tomorrow]);
    }
  }
  /** 按内容找到某条记录当前所在行（回写后行号会变，撤销时用） */
  async findLine(date, rec) {
    const rows = await this.read(date);
    const hit = rows.find((r) => r.rec.start === rec.start && r.rec.minutes === rec.minutes && r.rec.title === rec.title && r.rec.category === rec.category);
    return hit ? hit.line : null;
  }
  async remove(date, line) {
    await this.mutateLines(date, (rows) => rows.filter((r) => r.line !== line).map((r) => r.rec));
  }
  /** 所有关联到给定任务的记录（跨全部日记） */
  async linkedTo(ids) {
    const out = [];
    for (const d of this.dates()) {
      for (const r of await this.read(d)) if (r.rec.task && ids.has(r.rec.task)) out.push(r.rec);
    }
    return out;
  }
  /**
   * 任务被删除时处理关联记录：remove=false 只去掉 `[任务:: …]`，remove=true 整条删除。
   * 返回受影响记录的原样副本，供 restoreDetached 撤销。
   */
  async detachTasks(ids, remove) {
    const hit = [];
    for (const d of this.dates()) {
      const rows = await this.read(d);
      if (!rows.some((r) => r.rec.task && ids.has(r.rec.task))) continue;
      await this.mutateLines(d, (cur) => {
        const next = [];
        for (const r of cur) {
          if (r.rec.task && ids.has(r.rec.task)) {
            hit.push({ ...r.rec, date: d, extra: { ...r.rec.extra } });
            if (!remove) next.push({ ...r.rec, task: void 0 });
          } else next.push(r.rec);
        }
        return next;
      });
    }
    return hit;
  }
  /** 撤销 detachTasks：删掉的加回来，解除的重新挂上任务 */
  async restoreDetached(recs, removed) {
    const byDate = /* @__PURE__ */ new Map();
    for (const r of recs) byDate.set(r.date, [...byDate.get(r.date) || [], r]);
    for (const [d, list] of byDate) {
      await this.mutate(d, (cur) => {
        if (removed) return [...cur, ...list.map((r) => ({ ...r, extra: { ...r.extra } }))];
        const next = cur.slice();
        for (const r of list) {
          const i = next.findIndex((x) => !x.task && x.start === r.start && x.minutes === r.minutes && x.title === r.title && x.category === r.category);
          if (i >= 0) next[i] = { ...next[i], task: r.task };
        }
        return next;
      });
    }
  }
  async checkCap(date, rec, replacingLine) {
    if (rec.minutes <= 0) return;
    const rows = await this.read(date);
    const total = rows.filter((r) => r.line !== replacingLine).reduce((s, r) => s + r.rec.minutes, 0);
    if (total + rec.minutes > 1440 + 1) {
      const left = Math.max(0, 1440 - total);
      throw new Error(`${date} \u7684\u8BB0\u5F55\u603B\u65F6\u957F\u5C06\u8D85\u8FC7 24 \u5C0F\u65F6\uFF08\u5269\u4F59\u53EF\u8BB0 ${left} \u5206\u949F\uFF09\u3002`);
    }
  }
  async mutate(date, fn) {
    await this.mutateLines(date, (rows) => fn(rows.map((r) => r.rec)));
  }
  async mutateLines(date, fn) {
    const file = await this.ensure(date);
    await this.app.vault.process(file, (text) => {
      const rows = parseLines(text, date);
      const next = fn(rows).map((r) => ({ ...r, date }));
      return writeSection(text, next);
    });
  }
};
function findSection(lines) {
  const head = lines.findIndex((l) => l.trim() === SECTION);
  if (head < 0) return { head: -1, from: -1, to: -1 };
  let to = lines.length;
  for (let i = head + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,6}\s/.test(l) || l.startsWith("<!--")) {
      to = i;
      break;
    }
  }
  return { head, from: head + 1, to };
}
function parseLines(text, date) {
  const lines = text.split("\n");
  const span = findSection(lines);
  const out = [];
  const [from, to] = span.head >= 0 ? [span.from, span.to] : [0, lines.length];
  for (let i = from; i < to; i++) {
    const rec = parseRecordLine(lines[i], date);
    if (rec) out.push({ rec, line: i });
  }
  return out;
}
function writeSection(text, recs) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sorted = recs.slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  const body = sorted.map(serializeRecord);
  const span = findSection(lines);
  if (span.head >= 0) {
    const keep = lines.slice(span.from, span.to).filter((l) => l.trim() && !parseRecordLine(l, "0000-00-00"));
    const next = [...lines.slice(0, span.from), ...body, ...keep.length ? ["", ...keep] : [], ""];
    const tail = lines.slice(span.to);
    return [...next, ...tail].join("\n").replace(/\n{3,}/g, "\n\n");
  }
  let insertAt = lines.length;
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 >= 0) insertAt = h1 + 1;
  else if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) insertAt = end + 1;
  }
  const block = ["", SECTION, ...body, ""];
  return [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join("\n").replace(/\n{3,}/g, "\n\n");
}

// src/core/tasks.ts
var import_obsidian2 = require("obsidian");
function blankTask(partial = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: uid(),
    title: "",
    category: "",
    parent: null,
    status: "todo",
    blocked: false,
    date: "",
    start: "",
    estimate: 0,
    repeat: { kind: "none", days: [] },
    doneDates: [],
    startDate: "",
    endDate: "",
    notes: "",
    order: Date.now(),
    doneAt: "",
    created: now,
    updated: now,
    ...partial
  };
}
var Tasks = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.store = { version: 14, tasks: [] };
    this.loaded = false;
    this.writing = Promise.resolve();
    /** 迁移发生时记录备份路径，供 UI 提示 */
    this.lastMigrationBackup = null;
    this.onChange = null;
  }
  get all() {
    return this.store.tasks;
  }
  filePath() {
    return (0, import_obsidian2.normalizePath)(this.settings().taskFile);
  }
  async load(force = false) {
    if (this.loaded && !force) return;
    const f = this.app.vault.getAbstractFileByPath(this.filePath());
    if (!(f instanceof import_obsidian2.TFile)) {
      this.store = { version: 14, tasks: [] };
      this.loaded = true;
      return;
    }
    const raw = await this.app.vault.read(f);
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    const obj = data || {};
    if (obj.version === 14 && Array.isArray(obj.tasks)) {
      this.store = { version: 14, tasks: obj.tasks.map((t) => normalize(t)) };
    } else if (Array.isArray(obj.tasks)) {
      const backup = (0, import_obsidian2.normalizePath)(`${this.settings().backupFolder}/\u8FC1\u79FB\u524D-\u4EFB\u52A1\u6570\u636E-v${obj.version ?? 0}-${stamp()}.json`);
      await ensureFolder(this.app, backup.slice(0, backup.lastIndexOf("/")));
      await this.app.vault.adapter.write(backup, raw);
      this.lastMigrationBackup = backup;
      this.store = migrateLegacy(obj);
      await this.persist();
    } else {
      this.store = { version: 14, tasks: [] };
    }
    this.loaded = true;
  }
  async persist() {
    const text = JSON.stringify(this.store, null, 2);
    this.writing = this.writing.then(async () => {
      const p = this.filePath();
      await ensureFolder(this.app, p.slice(0, p.lastIndexOf("/")));
      const f = this.app.vault.getAbstractFileByPath(p);
      if (f instanceof import_obsidian2.TFile) await this.app.vault.modify(f, text);
      else await this.app.vault.create(p, text);
    });
    await this.writing;
  }
  async commit() {
    await this.persist();
    this.onChange?.();
  }
  // ---------- 查询 ----------
  byId(id) {
    return this.store.tasks.find((t) => t.id === id);
  }
  children(id) {
    return this.store.tasks.filter((t) => t.parent === id).sort(byOrder);
  }
  roots() {
    return this.store.tasks.filter((t) => !t.parent || !this.byId(t.parent)).sort(byOrder);
  }
  pathOf(task) {
    const out = [];
    let cur = task;
    const seen = /* @__PURE__ */ new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parent ? this.byId(cur.parent) : void 0;
    }
    return out;
  }
  isDoneOn(t, date) {
    return t.repeat.kind === "none" ? t.status === "done" : t.doneDates.includes(date);
  }
  /** 某天应出现的任务（安排在当天的 + 重复规则命中的） */
  forDate(date) {
    return this.store.tasks.filter((t) => occursOn(t, date)).sort(byTime);
  }
  /** 未安排的叶子任务（没有 date、非重复、未完成、没有子任务） */
  inbox() {
    return this.store.tasks.filter((t) => !t.date && t.repeat.kind === "none" && t.status !== "done" && !this.children(t.id).length).sort(byOrder);
  }
  /** 项目 = 顶层且有子任务，或设置了跨度 */
  projects() {
    return this.roots().filter((t) => this.children(t.id).length > 0 || t.startDate && t.endDate);
  }
  descendants(id) {
    const out = [];
    const walk = (pid) => {
      for (const c of this.children(pid)) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }
  progress(t) {
    const leaves = this.descendants(t.id).filter((d) => !this.children(d.id).length);
    if (!leaves.length) return { done: t.status === "done" ? 1 : 0, total: 1 };
    return { done: leaves.filter((l) => l.status === "done").length, total: leaves.length };
  }
  /** 项目的时间跨度：自身 startDate/endDate，否则由后代 date 推导 */
  span(t) {
    if (t.startDate && t.endDate) return { from: t.startDate, to: t.endDate };
    const dates = [t, ...this.descendants(t.id)].map((d) => d.date).filter(Boolean).sort();
    if (!dates.length) return null;
    return { from: t.startDate || dates[0], to: t.endDate || dates[dates.length - 1] };
  }
  // ---------- 变更 ----------
  async upsert(task) {
    task.updated = (/* @__PURE__ */ new Date()).toISOString();
    const i = this.store.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) this.store.tasks[i] = task;
    else this.store.tasks.push(task);
    await this.commit();
    return task;
  }
  async remove(id, withChildren = true) {
    const ids = /* @__PURE__ */ new Set([id, ...withChildren ? this.descendants(id).map((d) => d.id) : []]);
    this.store.tasks = this.store.tasks.filter((t) => !ids.has(t.id));
    if (!withChildren) {
      for (const t of this.store.tasks) if (t.parent === id) t.parent = null;
    }
    await this.commit();
  }
  async toggleDone(id, date) {
    const t = this.byId(id);
    if (!t) return false;
    let done;
    if (t.repeat.kind === "none") {
      done = t.status !== "done";
      t.status = done ? "done" : "todo";
      t.doneAt = done ? (/* @__PURE__ */ new Date()).toISOString() : "";
      if (done && !t.date) t.date = date;
    } else {
      done = !t.doneDates.includes(date);
      t.doneDates = done ? [...t.doneDates, date] : t.doneDates.filter((d) => d !== date);
    }
    t.updated = (/* @__PURE__ */ new Date()).toISOString();
    if (done && t.parent) this.autoCompleteParent(t.parent);
    await this.commit();
    return done;
  }
  /** 登记 / 清除「勾选完成时记下的记录」 */
  async setDoneLog(id, date, log) {
    const t = this.byId(id);
    if (!t) return;
    const next = { ...t.doneLogs || {} };
    if (log) next[date] = log;
    else if (next[date]) delete next[date];
    else return;
    t.doneLogs = Object.keys(next).length ? next : void 0;
    t.updated = (/* @__PURE__ */ new Date()).toISOString();
    await this.commit();
  }
  autoCompleteParent(pid) {
    const p = this.byId(pid);
    if (!p) return;
    const kids = this.children(pid);
    if (kids.length && kids.every((k) => k.status === "done")) {
      p.status = "done";
      p.doneAt = (/* @__PURE__ */ new Date()).toISOString();
      if (p.parent) this.autoCompleteParent(p.parent);
    }
  }
  async schedule(id, date, start) {
    const t = this.byId(id);
    if (!t) return;
    t.date = date;
    t.start = start;
    t.updated = (/* @__PURE__ */ new Date()).toISOString();
    await this.commit();
  }
  async reorder(ids) {
    ids.forEach((id, i) => {
      const t = this.byId(id);
      if (t) t.order = i + 1;
    });
    await this.commit();
  }
};
function byOrder(a, b) {
  return a.order - b.order || a.created.localeCompare(b.created);
}
function byTime(a, b) {
  if (a.start && b.start) return a.start.localeCompare(b.start) || byOrder(a, b);
  if (a.start) return -1;
  if (b.start) return 1;
  return byOrder(a, b);
}
function occursOn(t, date) {
  if (t.repeat.kind === "none") return t.date === date;
  if (t.startDate && date < t.startDate) return false;
  if (t.endDate && date > t.endDate) return false;
  if (t.created && date < t.created.slice(0, 10) && !t.startDate) return false;
  const d = parseDate(date);
  if (t.repeat.kind === "daily") return true;
  if (t.repeat.kind === "weekly") return t.repeat.days.includes((d.getDay() + 6) % 7 + 1);
  if (t.repeat.kind === "monthly") return t.repeat.days.includes(d.getDate());
  return false;
}
function weekOf(date) {
  const s = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => shiftDate(s, i));
}
async function ensureFolder(app, folder) {
  if (!folder) return;
  const parts = folder.split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!await app.vault.adapter.exists(cur)) await app.vault.createFolder(cur);
  }
}
function normalize(t) {
  const b = blankTask();
  return {
    ...b,
    ...t,
    repeat: { kind: t.repeat?.kind || "none", days: Array.isArray(t.repeat?.days) ? t.repeat.days : [] },
    doneDates: Array.isArray(t.doneDates) ? t.doneDates : [],
    order: typeof t.order === "number" ? t.order : b.order,
    estimate: typeof t.estimate === "number" ? t.estimate : 0,
    doneLogs: cleanDoneLogs(t.doneLogs)
  };
}
function cleanDoneLogs(v) {
  if (!v || typeof v !== "object") return void 0;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (x && typeof x.start === "string" && typeof x.title === "string") out[k] = { date: x.date || k, start: x.start, title: x.title, category: x.category || "" };
  }
  return Object.keys(out).length ? out : void 0;
}
var STATUS_MAP = { pending: "todo", doing: "doing", blocked: "todo", done: "done" };
function migrateLegacy(old) {
  const cats = new Map((old.categories || []).map((c) => [c.id, c.name]));
  const roots = old.tasks || [];
  const rootCat = new Map(roots.map((t) => [t.id, cats.get(t.categoryId || "") || ""]));
  const out = [];
  let order = 1;
  const convert = (n, parent, category) => {
    const sched = n.schedule || {};
    const rk = sched.repeat;
    const kind = rk === "daily" || rk === "weekly" || rk === "monthly" ? rk : "none";
    const est = typeof n.estimate === "number" && n.estimate > 0 ? n.estimate : 0;
    const start = n.startTime || sched.startTime || "";
    let estimate = est;
    if (!estimate && start && (n.endTime || sched.endTime)) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = (n.endTime || sched.endTime || "").split(":").map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) estimate = diff;
    }
    const t = blankTask({
      id: n.id,
      title: n.title || "\u672A\u547D\u540D",
      category,
      parent,
      status: STATUS_MAP[n.status || "pending"] || "todo",
      blocked: n.status === "blocked",
      date: kind === "none" ? n.startDate || "" : "",
      start: kind === "none" ? n.startDate ? start : "" : start,
      estimate,
      repeat: { kind, days: kind === "weekly" ? sched.weekdays || [] : kind === "monthly" ? sched.monthDays || [] : [] },
      startDate: kind !== "none" ? n.startDate || sched.anchor || "" : "",
      endDate: kind !== "none" ? n.endDate || "" : "",
      notes: n.notes || "",
      order: typeof n.sequenceOrder === "number" ? n.sequenceOrder : order++,
      doneAt: n.completedAt || "",
      created: n.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updated: n.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
    });
    return t;
  };
  for (const r of roots) if (!r.retired) out.push(convert(r, null, rootCat.get(r.id) || ""));
  for (const s of old.subtasks || []) {
    if (s.retired) continue;
    const parent = s.parentId || s.taskId || null;
    out.push(convert(s, parent, rootCat.get(s.taskId || "") || ""));
  }
  return { version: 14, tasks: out };
}

// src/core/migrate.ts
var import_obsidian3 = require("obsidian");
async function detectLegacyJournals(app, settings) {
  const out = [];
  const folder = (0, import_obsidian3.normalizePath)(settings.journalFolder);
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(folder + "/")) continue;
    const text = await app.vault.cachedRead(f);
    if (hasLegacyCards(text) || text.includes("<!-- daily-task-log:start -->") || text.includes("```dataviewjs")) out.push(f);
  }
  return out;
}
async function migrateJournals(app, settings) {
  const files = await detectLegacyJournals(app, settings);
  const backupFolder = (0, import_obsidian3.normalizePath)(`${settings.backupFolder}/\u8FC1\u79FB-${stamp()}/\u65E5\u8BB0`);
  const report = { files: 0, records: 0, backupFolder, skipped: [] };
  if (!files.length) return report;
  await mkdirp(app, backupFolder);
  for (const f of files) {
    const text = await app.vault.read(f);
    await app.vault.adapter.write(`${backupFolder}/${f.name}`, text);
    const date = f.basename;
    const legacy = parseLegacyCards(text, date);
    const existing = parseLines(text, date).map((r) => r.rec);
    const next = convertText(text, date, [...existing, ...legacy]);
    if (next === text) {
      report.skipped.push(f.path);
      continue;
    }
    await app.vault.modify(f, next);
    report.files++;
    report.records += legacy.length;
  }
  return report;
}
function convertText(text, date, recs) {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/```dataviewjs[\s\S]*?```/g, "");
  t = t.replace(/^[ \t]*<div class="journal-card">[^\n]*<div class="journal-right">[^\n]*<\/div>[ \t]*<\/div>[ \t]*$/gm, "");
  t = t.replace(/<!-- daily-task-log:start -->[\s\S]*?<!-- daily-task-log:end -->/g, "");
  t = t.replace(/^cssclasses:\s*\[?\s*dash-locked\s*\]?\s*$/m, "");
  if (!t.startsWith("---")) t = `---
date: ${date}
---

${t}`;
  t = t.replace(/^---\n([\s\S]*?)\n?---/, (_all, fm) => {
    const body = fm.split("\n").filter((l) => l.trim());
    if (!body.some((l) => /^date:/.test(l))) body.unshift(`date: ${date}`);
    return `---
${body.join("\n")}
---`;
  });
  if (!/^#\s/m.test(t)) t = t.replace(/^(---[\s\S]*?---\n)/, `$1
# ${date}
`);
  t = t.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return writeSection(t, recs);
}
async function mkdirp(app, folder) {
  const parts = folder.split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!await app.vault.adapter.exists(cur)) await app.vault.createFolder(cur);
  }
}

// src/ui/view.ts
var import_obsidian9 = require("obsidian");

// src/ui/components.ts
var import_obsidian4 = require("obsidian");
var HOUR_PX = 48;
function el(parent, tag, cls, text) {
  const n = parent.createEl(tag, { cls, text });
  return n;
}
function icon(parent, name, cls = "lubi-icon") {
  const s = parent.createSpan({ cls });
  (0, import_obsidian4.setIcon)(s, name);
  return s;
}
function tip(el2, text) {
  el2.setAttribute("aria-label", text);
  el2.removeAttribute("title");
  return el2;
}
function iconButton(parent, name, label, onClick, cls = "") {
  const b = parent.createEl("button", { cls: `lubi-icon-btn ${cls}`.trim(), attr: { "aria-label": label, "data-lubi-focus": `icon:${label}` } });
  (0, import_obsidian4.setIcon)(b, name);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}
function button(parent, label, onClick, opts = {}) {
  const b = parent.createEl("button", { cls: `lubi-btn ${opts.primary ? "mod-cta" : ""} ${opts.cls || ""}`.trim(), attr: { "data-lubi-focus": `button:${label}` } });
  if (opts.icon) icon(b, opts.icon, "lubi-icon lubi-btn-icon");
  b.createSpan({ text: label });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}
function segmented(parent, items, active, onChange) {
  const wrap = parent.createDiv({ cls: "lubi-seg" });
  for (const it of items) {
    const b = wrap.createEl("button", { cls: "lubi-seg-item", attr: { "aria-pressed": String(it.id === active), "data-lubi-focus": `seg:${it.id}` } });
    if (it.icon) icon(b, it.icon, "lubi-icon lubi-seg-icon");
    b.createSpan({ text: it.label });
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-pressed") === "true") return;
      wrap.querySelectorAll(".lubi-seg-item").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      onChange(it.id);
    });
  }
  return wrap;
}
function catDot(parent, cat) {
  const d = parent.createSpan({ cls: "lubi-dot" });
  d.style.setProperty("--dot", cat.color);
  return d;
}
function catChip(parent, cat, text) {
  const c = parent.createSpan({ cls: "lubi-chip" });
  c.style.setProperty("--chip", cat.color);
  icon(c, cat.icon, "lubi-icon lubi-chip-icon");
  c.createSpan({ text: text ?? cat.name });
  return c;
}
function emptyState(parent, iconName, title, hint, action) {
  const box = parent.createDiv({ cls: "lubi-empty" });
  icon(box, iconName, "lubi-icon lubi-empty-icon");
  box.createDiv({ cls: "lubi-empty-title", text: title });
  if (hint) box.createDiv({ cls: "lubi-empty-hint", text: hint });
  if (action) button(box, action.label, action.onClick, { primary: true, icon: "plus" });
  return box;
}
function donut(parent, slices, centerText, centerSub) {
  const size = 120;
  const r = 48;
  const stroke = 14;
  const svg = parent.createSvg("svg", { cls: "lubi-donut", attr: { viewBox: `0 0 ${size} ${size}`, width: String(size), height: String(size) } });
  const total = slices.reduce((s, x) => s + x.value, 0);
  const c = 2 * Math.PI * r;
  svg.createSvg("circle", { attr: { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--background-modifier-border)", "stroke-width": stroke } });
  let offset = 0;
  if (total > 0) {
    for (const s of slices) {
      if (s.value <= 0) continue;
      const len = s.value / total * c;
      const circle = svg.createSvg("circle", {
        attr: {
          cx: size / 2,
          cy: size / 2,
          r,
          fill: "none",
          stroke: s.color,
          "stroke-width": stroke,
          "stroke-dasharray": `${len} ${c - len}`,
          "stroke-dashoffset": String(-offset),
          transform: `rotate(-90 ${size / 2} ${size / 2})`
        }
      });
      circle.createSvg("title").textContent = `${s.label} ${Math.round(s.value / total * 100)}%`;
      offset += len;
    }
  }
  const t = svg.createSvg("text", { cls: "lubi-donut-center", attr: { x: size / 2, y: size / 2 + (centerSub ? -2 : 6), "text-anchor": "middle" } });
  t.textContent = centerText;
  if (centerSub) {
    const s = svg.createSvg("text", { cls: "lubi-donut-sub", attr: { x: size / 2, y: size / 2 + 16, "text-anchor": "middle" } });
    s.textContent = centerSub;
  }
  return svg;
}
function debounce(fn, ms) {
  let t = null;
  return (...a) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}
function stopAll(e) {
  e.preventDefault();
  e.stopPropagation();
}
function undoNotice(text, onUndo, ms = 6e3) {
  const n = new import_obsidian4.Notice("", ms);
  if (!n.noticeEl) return;
  n.noticeEl.empty();
  n.noticeEl.addClass("lubi-notice");
  n.noticeEl.createSpan({ text });
  const b = n.noticeEl.createEl("button", { cls: "lubi-notice-btn", text: "\u64A4\u9500" });
  b.addEventListener("click", (e) => {
    stopAll(e);
    n.hide();
    void onUndo();
  });
}
var tipEl = null;
var tipBound = false;
function hideTip() {
  if (tipEl) {
    tipEl.remove();
    tipEl = null;
  }
}
function showTip(rows) {
  hideTip();
  tipEl = document.body.createDiv({ cls: "lubi-tip" });
  for (const r of rows) {
    if (typeof r === "string") tipEl.createDiv({ text: r });
    else tipEl.appendChild(r);
  }
  if (!tipBound) {
    tipBound = true;
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("blur", hideTip);
    document.addEventListener("pointerdown", hideTip, true);
    document.addEventListener("keydown", hideTip, true);
  }
  return tipEl;
}
function placeTip(x, y) {
  if (!tipEl) return;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  let left = x + 14;
  let top = y + 14;
  if (left + w > window.innerWidth - 8) left = x - w - 10;
  if (top + h > window.innerHeight - 8) top = y - h - 10;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}
function hoverTip(host, selector, content) {
  let current = null;
  host.addEventListener("pointermove", (e) => {
    const t = e.target.closest(selector);
    if (!t || !host.contains(t)) {
      current = null;
      hideTip();
      return;
    }
    if (t !== current || !tipEl || !tipEl.isConnected) {
      current = t;
      const rows = content(t);
      if (!rows) {
        hideTip();
        return;
      }
      showTip(rows);
    }
    placeTip(e.clientX, e.clientY);
  });
  host.addEventListener("pointerleave", () => {
    current = null;
    hideTip();
  });
  host.addEventListener("focusin", (e) => {
    const target = e.target.closest(selector);
    if (!target || !host.contains(target)) return;
    current = target;
    const rows = content(target);
    if (!rows) return;
    showTip(rows);
    const rect = target.getBoundingClientRect();
    placeTip(rect.right, rect.top);
  });
  host.addEventListener("focusout", (e) => {
    if (host.contains(e.relatedTarget)) return;
    current = null;
    hideTip();
  });
}

// src/ui/today.ts
var import_obsidian7 = require("obsidian");

// src/core/metrics.ts
function validClock(value) {
  return /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value);
}
function invalidTimedSpan(span) {
  if (!(span.minutes > 0)) return false;
  if (!validClock(span.start)) return true;
  const start = hmToMin(span.start);
  return !Number.isFinite(span.minutes) || start + span.minutes > 1440;
}
function dayTimeStats(spans) {
  let recordedMinutes = 0;
  let inDayMinutes = 0;
  let invalidCount = 0;
  const intervals = [];
  for (const span of spans) {
    if (!(span.minutes > 0)) continue;
    if (invalidTimedSpan(span)) invalidCount++;
    if (!Number.isFinite(span.minutes)) continue;
    recordedMinutes += span.minutes;
    if (!validClock(span.start)) continue;
    const start = Math.max(0, Math.min(1440, hmToMin(span.start)));
    const end = Math.max(start, Math.min(1440, hmToMin(span.start) + span.minutes));
    if (end > start) {
      inDayMinutes += end - start;
      intervals.push([start, end]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let coveredMinutes = 0;
  let lastEnd = 0;
  for (const [start, end] of intervals) {
    coveredMinutes += Math.max(0, end - Math.max(start, lastEnd));
    lastEnd = Math.max(lastEnd, end);
  }
  return {
    recordedMinutes,
    coveredMinutes,
    overlapMinutes: Math.max(0, inDayMinutes - coveredMinutes),
    emptyMinutes: 1440 - coveredMinutes,
    invalidCount
  };
}

// src/ui/drag.ts
var ALT_SNAP_RANGE = 12;
function startDrag(e, spec) {
  if (e.button !== 0) return;
  const target = e.currentTarget;
  const min = spec.min ?? 0;
  const max = spec.max ?? 1440;
  const minMinutes = spec.minMinutes ?? 5;
  const threshold = spec.threshold ?? 4;
  const startX = e.clientX;
  const startY = e.clientY;
  let moved = false;
  let started = false;
  let last = { start: spec.start, minutes: spec.minutes, col: 0, moved: false };
  const anchor = spec.mode === "create" ? spec.start : 0;
  const snapTo = (v, ev) => {
    if (ev.altKey && spec.edges?.length) {
      let best = v;
      let dist = ALT_SNAP_RANGE + 1;
      for (const edge of spec.edges) {
        const d = Math.abs(edge - v);
        if (d < dist) {
          dist = d;
          best = edge;
        }
      }
      if (dist <= ALT_SNAP_RANGE) return best;
    }
    const g = ev.shiftKey ? 1 : spec.snap ?? 5;
    return Math.round(v / g) * g;
  };
  const compute = (ev) => {
    const dMin = (ev.clientY - startY) / spec.pxPerMin;
    let start = spec.start;
    let minutes = spec.minutes;
    switch (spec.mode) {
      case "move": {
        start = snapTo(spec.start + dMin, ev);
        start = Math.max(min, Math.min(max - minutes, start));
        break;
      }
      case "resize-start": {
        const end = spec.start + spec.minutes;
        start = snapTo(spec.start + dMin, ev);
        start = Math.max(min, Math.min(end - minMinutes, start));
        minutes = end - start;
        break;
      }
      case "resize-end": {
        let end = snapTo(spec.start + spec.minutes + dMin, ev);
        end = Math.max(start + minMinutes, Math.min(max, end));
        minutes = end - start;
        break;
      }
      case "create": {
        const cur = snapTo(anchor + dMin, ev);
        const a = Math.max(min, Math.min(max, Math.min(anchor, cur)));
        const b = Math.max(min, Math.min(max, Math.max(anchor, cur)));
        start = a;
        minutes = Math.max(minMinutes, b - a);
        if (start + minutes > max) start = max - minutes;
        break;
      }
    }
    let col = 0;
    if (spec.horizontal) {
      col = Math.round((ev.clientX - startX) / spec.horizontal.colWidth);
      col = Math.max(spec.horizontal.minCol, Math.min(spec.horizontal.maxCol, col));
    }
    return { start, minutes, col, moved };
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("contextmenu", onCtx, true);
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
    }
    document.body.removeClass("lubi-dragging");
  };
  const onMove = (ev) => {
    if (!moved) {
      if (Math.abs(ev.clientY - startY) < threshold && Math.abs(ev.clientX - startX) < threshold) return;
      moved = true;
    }
    if (!started) {
      started = true;
      document.body.addClass("lubi-dragging");
      spec.onStart?.();
    }
    ev.preventDefault();
    last = compute(ev);
    spec.onMove(last);
  };
  const onUp = (ev) => {
    cleanup();
    if (!moved) {
      spec.onEnd({ start: spec.start, minutes: spec.minutes, col: 0, moved: false });
      return;
    }
    ev.preventDefault();
    spec.onEnd({ ...compute(ev), moved: true });
  };
  const onCancel = () => {
    cleanup();
    spec.onEnd(null);
  };
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      onCancel();
    }
  };
  const onCtx = (ev) => {
    ev.preventDefault();
    onCancel();
  };
  try {
    target.setPointerCapture(e.pointerId);
  } catch {
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("contextmenu", onCtx, true);
}
function minuteAt(clientY, container, pxPerMin, offsetMin = 0) {
  const rect = container.getBoundingClientRect();
  return offsetMin + (clientY - rect.top) / pxPerMin;
}

// src/ui/modals.ts
var import_obsidian6 = require("obsidian");

// src/core/quickparse.ts
var pad2 = (n) => String(n).padStart(2, "0");
var validHM = (h, m) => h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m > 0);
function parseQuick(text, categories = []) {
  let rest = ` ${text} `;
  const out = { title: "" };
  let hit = false;
  const range2 = rest.match(/(^|[\s,，])(\d{1,2})[:：](\d{2})\s*[-–—~～到至]\s*(\d{1,2})[:：](\d{2})(?=$|[\s,，])/);
  if (range2 && validHM(+range2[2], +range2[3]) && validHM(+range2[4], +range2[5])) {
    const s = +range2[2] * 60 + +range2[3];
    let e = +range2[4] * 60 + +range2[5];
    if (e <= s) e += 1440;
    out.start = `${pad2(+range2[2])}:${range2[3]}`;
    out.minutes = e - s;
    rest = rest.replace(range2[0], range2[1]);
    hit = true;
  } else {
    const one = rest.match(/(^|[\s,，])(\d{1,2})[:：](\d{2})(?=$|[\s,，])/);
    if (one && validHM(+one[2], +one[3]) && +one[2] < 24) {
      out.start = `${pad2(+one[2])}:${one[3]}`;
      rest = rest.replace(one[0], one[1]);
      hit = true;
    }
  }
  if (out.minutes === void 0) {
    const dur = rest.match(/(^|[\s,，])(?:(\d+(?:\.\d+)?)\s*(?:hrs|hr|h|个小时|小时)(?:\s*(\d+)\s*(?:mins|min|m|分钟|分))?|(\d+)\s*(?:mins|min|m|分钟|分))(?=$|[\s,，])/i);
    if (dur) {
      const minutes = Math.round((dur[2] ? Number(dur[2]) * 60 : 0) + Number(dur[3] || 0) + Number(dur[4] || 0));
      if (minutes > 0 && minutes <= 1440) {
        out.minutes = minutes;
        rest = rest.replace(dur[0], dur[1]);
        hit = true;
      }
    }
  }
  if (categories.length) {
    const tokens = rest.trim().split(/\s+/);
    const idx = tokens.findIndex((t) => categories.includes(t));
    if (idx >= 0 && tokens.length > 1) {
      out.category = tokens[idx];
      tokens.splice(idx, 1);
      rest = ` ${tokens.join(" ")} `;
      hit = true;
    }
  }
  if (!hit) return null;
  out.title = rest.replace(/\s+/g, " ").replace(/^[\s·,，:：\-–]+|[\s·,，:：\-–]+$/g, "").trim();
  return out;
}
function parseEstimate(text) {
  const t = text.trim();
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Math.round(Number(t)));
  const q = parseQuick(t);
  return q && q.minutes !== void 0 && !q.title && q.start === void 0 ? q.minutes : null;
}

// src/ui/taskList.ts
var import_obsidian5 = require("obsidian");
function dayTasks(plugin, date) {
  return plugin.tasks.forDate(date).filter((t) => !plugin.tasks.children(t.id).length);
}
function groupedRows(plugin, list, items, edit, row) {
  const groups = /* @__PURE__ */ new Map();
  for (const task of items) {
    const parents = plugin.tasks.pathOf(task).slice(0, -1);
    const key = parents.map((p) => p.id).join("/") || "__root__";
    if (!groups.has(key)) groups.set(key, { parent: parents[parents.length - 1], title: parents.map((p) => p.title).join(" / "), tasks: [] });
    groups.get(key).tasks.push(task);
  }
  for (const group of groups.values()) {
    const section = list.createDiv({ cls: "lubi-task-group" });
    if (group.parent) {
      const path = button(section, group.title, () => edit(group.parent), { cls: "lubi-task-group-title" });
      tip(path, `\u7F16\u8F91\u7236\u4EFB\u52A1\uFF1A${group.title}`);
    } else if (groups.size > 1) section.createDiv({ cls: "lubi-task-group-title lubi-muted", text: "\u72EC\u7ACB\u4EFB\u52A1" });
    for (const task of group.tasks) row(section, task);
  }
}
function renderDayTaskList(plugin, list, date, rerender, openNew, edit, decorate) {
  const items = dayTasks(plugin, date);
  groupedRows(plugin, list, items, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    decorate?.(li, t);
  });
  return items;
}
var sameRecord = (r, taskId, log) => r.task === taskId && r.start === log.start && r.title === log.title && r.category === log.category;
var logOf = (r) => ({ date: r.date, start: r.start, title: r.title, category: r.category });
function firstTimeCategory(plugin) {
  return plugin.settings.categories.find((c) => c.kind === "time")?.name || "\u65E5\u5E38";
}
async function hasLinkedRecord(plugin, taskId, date) {
  return (await plugin.journal.read(date)).some((r) => r.rec.task === taskId);
}
async function logDone(plugin, t, date, rerender) {
  const minutes = Math.max(5, t.estimate || 30);
  let start = t.start;
  if (!start) {
    if (date === todayStr()) start = minToHM(Math.max(0, hmToMin(nowHM()) - minutes));
    else start = plugin.lastEndOf(date) || "09:00";
  }
  const category = t.category && categoryOf(plugin.settings, t.category).kind === "time" ? t.category : firstTimeCategory(plugin);
  const rec = { date, start, minutes, category, title: t.title, task: t.id, extra: { [PENDING_KEY]: "\u6309\u8BA1\u5212" } };
  try {
    await plugin.journal.add(rec);
  } catch (e) {
    new import_obsidian5.Notice(`\u300C${t.title}\u300D\u5DF2\u5B8C\u6210\uFF0C\u4F46\u6CA1\u80FD\u81EA\u52A8\u8BB0\u5F55\u65F6\u95F4\uFF1A${e.message}`, 6e3);
    return null;
  }
  const latest = plugin.tasks.byId(t.id);
  if (latest && plugin.tasks.isDoneOn(latest, date)) await plugin.tasks.setDoneLog(t.id, date, logOf(rec));
  undoNotice(`\u5DF2\u6309\u8BA1\u5212\u8BB0\u4E0B\u300C${t.title}\u300D${start}\u2013${minToHM(hmToMin(start) + minutes)}\uFF08\u5F85\u786E\u8BA4\uFF09\uFF1A\u5728\u65F6\u95F4\u8F74\u62D6\u5230\u5B9E\u9645\u65F6\u95F4\uFF0C\u6216\u70B9 \u2713 \u786E\u8BA4`, async () => {
    const line = await plugin.journal.findLine(date, rec);
    if (line !== null) await plugin.journal.remove(date, line);
    const cur = plugin.tasks.byId(t.id);
    if (cur) {
      await plugin.tasks.setDoneLog(t.id, date, null);
      if (plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(t.id, date);
    }
    rerender?.();
  });
  return rec;
}
async function afterDone(plugin, t, date, _openNew, rerender) {
  if (!plugin.settings.promptLogOnComplete) return;
  if (await hasLinkedRecord(plugin, t.id, date)) return;
  await logDone(plugin, t, date, rerender);
}
async function completeFromRecord(plugin, taskId, date, rec) {
  const t = plugin.tasks.byId(taskId);
  if (!t) return;
  if (!plugin.tasks.isDoneOn(t, date)) await plugin.tasks.toggleDone(taskId, date);
  await plugin.tasks.setDoneLog(taskId, date, logOf(rec));
}
async function afterUndone(plugin, id, date, rerender) {
  const t = plugin.tasks.byId(id);
  const log = t?.doneLogs?.[date];
  if (!t || !log) return;
  await plugin.tasks.setDoneLog(id, date, null);
  const rows = await plugin.journal.read(log.date);
  const hit = rows.find((r) => sameRecord(r.rec, id, log));
  if (!hit) {
    new import_obsidian5.Notice("\u52FE\u9009\u65F6\u8BB0\u4E0B\u7684\u90A3\u6761\u8BB0\u5F55\u5DF2\u88AB\u4FEE\u6539\u6216\u5220\u9664\uFF0C\u65F6\u95F4\u7EBF\u672A\u4F5C\u6539\u52A8");
    return;
  }
  await plugin.journal.remove(log.date, hit.line);
  const removed = hit.rec;
  undoNotice(`\u5DF2\u53D6\u6D88\u5B8C\u6210\uFF0C\u5E76\u4ECE\u65F6\u95F4\u7EBF\u79FB\u9664\u300C${removed.title}\u300D`, async () => {
    const cur = plugin.tasks.byId(id);
    if (!cur) {
      new import_obsidian5.Notice("\u4EFB\u52A1\u5DF2\u5220\u9664\uFF0C\u65E0\u6CD5\u64A4\u9500");
      return;
    }
    await plugin.journal.add({ ...removed, extra: { ...removed.extra } });
    if (!plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(id, date);
    await plugin.tasks.setDoneLog(id, date, log);
    rerender();
  });
}
async function addRecordAsDone(plugin, rec) {
  const r = { ...rec, extra: { ...rec.extra } };
  const isTime = categoryOf(plugin.settings, r.category).kind !== "money" && r.minutes > 0;
  if (!isTime || r.task) {
    await plugin.journal.add(r);
    return r;
  }
  const task = blankTask({
    title: r.title,
    category: r.category,
    date: r.date,
    start: r.start,
    estimate: r.minutes,
    status: "done",
    doneAt: (/* @__PURE__ */ new Date()).toISOString(),
    origin: "record",
    doneLogs: { [r.date]: logOf(r) }
  });
  await plugin.tasks.upsert(task);
  r.task = task.id;
  try {
    await plugin.journal.add(r);
  } catch (e) {
    await plugin.tasks.remove(task.id);
    throw e;
  }
  return r;
}
async function syncLinkedTask(plugin, old, next) {
  const id = next.task || old.task;
  if (!id) return;
  const t = plugin.tasks.byId(id);
  if (!t) return;
  const log = t.doneLogs?.[old.date];
  const paired = !!log && sameRecord(old, id, log);
  if (t.origin === "record") {
    await plugin.tasks.upsert({
      ...t,
      title: next.title,
      category: categoryOf(plugin.settings, next.category).kind === "time" ? next.category : t.category,
      start: next.start,
      estimate: next.minutes > 0 ? next.minutes : t.estimate,
      doneLogs: paired || !log ? { ...t.doneLogs || {}, [old.date]: logOf(next) } : t.doneLogs
    });
  } else if (paired) {
    await plugin.tasks.setDoneLog(id, old.date, logOf(next));
  }
}
async function deleteRecord(plugin, date, row, rerender) {
  const r = row.rec;
  await plugin.journal.remove(date, row.line);
  let removedTask = null;
  let unchecked = null;
  const t = r.task ? plugin.tasks.byId(r.task) : void 0;
  if (t) {
    const log = t.doneLogs?.[date];
    const stillLinked = await hasLinkedRecord(plugin, t.id, date);
    if (t.origin === "record" && !stillLinked && !plugin.tasks.children(t.id).length) {
      removedTask = JSON.parse(JSON.stringify(t));
      await plugin.tasks.remove(t.id);
    } else if (log && sameRecord(r, t.id, log)) {
      unchecked = { id: t.id, log };
      await plugin.tasks.setDoneLog(t.id, date, null);
      if (plugin.tasks.isDoneOn(t, date)) await plugin.tasks.toggleDone(t.id, date);
    }
  }
  const what = removedTask ? "\uFF08\u4EFB\u52A1\u9875\u91CC\u5BF9\u5E94\u7684\u5DF2\u5B8C\u6210\u4E8B\u9879\u4E5F\u5DF2\u5220\u9664\uFF09" : unchecked ? "\uFF0C\u5BF9\u5E94\u4EFB\u52A1\u5DF2\u53D6\u6D88\u5B8C\u6210" : "";
  undoNotice(`\u5DF2\u5220\u9664 ${r.title}${what}`, async () => {
    if (removedTask && !plugin.tasks.byId(removedTask.id)) await plugin.tasks.upsert(removedTask);
    await plugin.journal.add({ ...r, extra: { ...r.extra } });
    if (unchecked) {
      const cur = plugin.tasks.byId(unchecked.id);
      if (cur) {
        if (!plugin.tasks.isDoneOn(cur, date)) await plugin.tasks.toggleDone(unchecked.id, date);
        await plugin.tasks.setDoneLog(unchecked.id, date, unchecked.log);
      }
    }
    rerender();
  });
  rerender();
}
function taskRow(plugin, ul, t, date, rerender, openNew, onClick) {
  const done = plugin.tasks.isDoneOn(t, date);
  const li = ul.createDiv({ cls: `lubi-task ${done ? "is-done" : ""} ${t.blocked ? "is-blocked" : ""}`.trim() });
  const cb = li.createEl("input", { type: "checkbox" });
  cb.checked = done;
  cb.setAttribute("aria-label", `${done ? "\u53D6\u6D88\u5B8C\u6210" : "\u5B8C\u6210"} ${t.title}\uFF08${date}\uFF09`);
  cb.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (cb.dataset.busy) {
      e.preventDefault();
      return;
    }
    cb.dataset.busy = "1";
    try {
      const nowDone = await plugin.tasks.toggleDone(t.id, date);
      if (nowDone) await afterDone(plugin, t, date, openNew, rerender);
      else await afterUndone(plugin, t.id, date, rerender);
    } catch (error) {
      new import_obsidian5.Notice(`\u4EFB\u52A1\u66F4\u65B0\u5931\u8D25\uFF1A${error.message}`, 6e3);
    } finally {
      delete cb.dataset.busy;
    }
    rerender();
  });
  const body = li.createDiv({ cls: "lubi-task-body" });
  const line = onClick ? body.createEl("button", { cls: "lubi-task-title lubi-task-title-button", attr: { type: "button", "aria-label": `\u7F16\u8F91 ${t.title}` } }) : body.createDiv({ cls: "lubi-task-title" });
  if (onClick) line.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  if (t.category) catDot(line, categoryOf(plugin.settings, t.category));
  line.createSpan({ cls: "lubi-task-title-text", text: t.title });
  if (t.blocked) tip(icon(line, "octagon-alert", "lubi-icon lubi-blocked-icon"), "\u53D7\u963B");
  const parents = plugin.tasks.pathOf(t).slice(0, -1);
  const meta = [];
  if (parents.length) meta.push(parents.map((p) => p.title).join(" / "));
  if (t.start) meta.push(t.start);
  if (t.estimate) meta.push(fmtDuration(t.estimate));
  if (t.repeat.kind !== "none") meta.push("\u91CD\u590D");
  if (meta.length) {
    const text = meta.join(" \xB7 ");
    tip(body.createDiv({ cls: "lubi-task-meta", text }), text);
  }
  if (done && date <= todayStr() && plugin.settings.promptLogOnComplete) {
    void hasLinkedRecord(plugin, t.id, date).then((has) => {
      if (has || body.querySelector(".lubi-task-unlogged")) return;
      const fix = tip(body.createEl("button", { cls: "lubi-task-unlogged", attr: { type: "button" } }), `\u300C${t.title}\u300D\u5DF2\u5B8C\u6210\uFF0C\u4F46\u65F6\u95F4\u7EBF\u4E0A\u8FD8\u6CA1\u6709\u5BF9\u5E94\u7684\u8BB0\u5F55\u3002\u70B9\u51FB\u6309\u8BA1\u5212\u65F6\u95F4\u8865\u8BB0`);
      icon(fix, "clock", "lubi-icon");
      fix.createSpan({ text: "\u672A\u8BB0\u65F6\u95F4 \xB7 \u8865\u8BB0" });
      fix.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cur = plugin.tasks.byId(t.id) || t;
        await logDone(plugin, cur, date, rerender);
        rerender();
      });
    });
  }
  if (!done) {
    const acts = li.createDiv({ cls: "lubi-task-actions" });
    iconButton(acts, "play", `\u5F00\u59CB\u300C${t.title}\u300D\uFF1A\u9884\u586B\u4E00\u6761\u8BB0\u5F55`, () => openNew({
      title: t.title,
      category: t.category || void 0,
      task: t.id,
      start: date === todayStr() ? nowHM() : t.start || void 0,
      minutes: t.estimate || 30
    }), "lubi-task-start");
  }
  if (onClick) li.addEventListener("click", (e) => {
    if (e.target.closest("button, input")) return;
    onClick();
  });
  return li;
}

// src/ui/modals.ts
var fieldId = 0;
function associate(label, control) {
  const id = `lubi-field-${++fieldId}`;
  label.htmlFor = id;
  control.id = id;
}
function errorHost(control) {
  return control.closest(".lubi-field") || control.closest(".lubi-timebar-dur")?.parentElement || control.parentElement;
}
function fieldError(control, message) {
  if (!control) {
    new import_obsidian6.Notice(message);
    return;
  }
  const host = errorHost(control);
  host?.querySelector(".lubi-field-error")?.remove();
  const id = `lubi-error-${++fieldId}`;
  host?.createDiv({ cls: "lubi-field-error", text: message, attr: { id, role: "alert" } });
  control.setAttribute("aria-invalid", "true");
  control.setAttribute("aria-describedby", id);
  control.focus();
}
function clearFieldError(control) {
  const host = errorHost(control);
  host?.querySelector(".lubi-field-error")?.remove();
  control.removeAttribute("aria-invalid");
  control.removeAttribute("aria-describedby");
}
function formError(host, message) {
  let error = host.querySelector(".lubi-modal-error");
  if (!error) {
    error = host.createDiv({ cls: "lubi-modal-error", attr: { role: "alert", tabindex: "-1" } });
    host.querySelector(".lubi-modal-actions")?.before(error);
  }
  error.setText(message);
  error.focus();
}
var ConfirmModal = class extends import_obsidian6.Modal {
  constructor(app, title, body, onOk, okLabel = "\u786E\u5B9A", danger = true) {
    super(app);
    this.title = title;
    this.body = body;
    this.onOk = onOk;
    this.okLabel = okLabel;
    this.danger = danger;
  }
  onOpen() {
    this.modalEl.addClass("lubi-modal", "lubi-modal-sm");
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.body, cls: "lubi-confirm-body" });
    const row = this.contentEl.createDiv({ cls: "lubi-modal-actions" });
    button(row, "\u53D6\u6D88", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(row, this.okLabel, () => {
      this.close();
      this.onOk();
    }, { primary: !this.danger });
    if (this.danger) ok.addClass("lubi-btn-danger");
  }
};
var DeleteTaskModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, task, onDone) {
    super(app);
    this.plugin = plugin;
    this.task = task;
    this.onDone = onDone;
    this.removeRecords = false;
  }
  async onOpen() {
    this.modalEl.addClass("lubi-modal", "lubi-modal-sm");
    this.titleEl.setText("\u5220\u9664\u4EFB\u52A1\uFF1F");
    const all = [this.task, ...this.plugin.tasks.descendants(this.task.id)];
    const ids = new Set(all.map((t) => t.id));
    const kids = all.length - 1;
    this.contentEl.createEl("p", { cls: "lubi-confirm-body", text: kids ? `\u300C${this.task.title}\u300D\u4F1A\u8FDE\u540C ${kids} \u4E2A\u5B50\u4EFB\u52A1\u4E00\u8D77\u5220\u9664\u3002` : `\u300C${this.task.title}\u300D` });
    const linked = await this.plugin.journal.linkedTo(ids);
    if (linked.length) {
      const box = this.contentEl.createDiv({ cls: "lubi-delete-opts", attr: { role: "radiogroup", "aria-label": "\u5173\u8054\u8BB0\u5F55\u7684\u5904\u7406\u65B9\u5F0F" } });
      box.createDiv({ cls: "lubi-muted", text: `\u65F6\u95F4\u7EBF\u4E0A\u6709 ${linked.length} \u6761\u8BB0\u5F55\u5173\u8054\u4E86${kids ? "\u8FD9\u4E9B\u4EFB\u52A1" : "\u8FD9\u4E2A\u4EFB\u52A1"}\uFF1A` });
      const opt = (value, label, desc) => {
        const row2 = box.createEl("label", { cls: "lubi-delete-opt" });
        const input = row2.createEl("input", { type: "radio", attr: { name: "lubi-delete-records" } });
        input.checked = value === this.removeRecords;
        input.addEventListener("change", () => {
          if (input.checked) this.removeRecords = value;
        });
        const text = row2.createDiv();
        text.createDiv({ text: label });
        text.createDiv({ cls: "lubi-muted", text: desc });
      };
      opt(false, "\u4FDD\u7559\u8BB0\u5F55\uFF0C\u53EA\u89E3\u9664\u5173\u8054", "\u65F6\u95F4\u786E\u5B9E\u82B1\u6389\u4E86\uFF0C\u56DE\u987E\u7EDF\u8BA1\u4E0D\u53D8");
      opt(true, `\u8FDE\u540C\u8FD9 ${linked.length} \u6761\u8BB0\u5F55\u4E00\u8D77\u5220\u9664`, "\u9002\u5408\u5EFA\u9519\u7684\u4EFB\u52A1\u6216\u8BEF\u8BB0\u7684\u65F6\u95F4");
    }
    const row = this.contentEl.createDiv({ cls: "lubi-modal-actions" });
    button(row, "\u53D6\u6D88", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(row, "\u5220\u9664", () => void this.run(all, ids, linked.length > 0));
    ok.addClass("lubi-btn-danger");
  }
  async run(all, ids, hasLinked) {
    this.close();
    const snapshot = JSON.parse(JSON.stringify(all));
    const removed = this.removeRecords;
    const touched = hasLinked ? await this.plugin.journal.detachTasks(ids, removed) : [];
    await this.plugin.tasks.remove(this.task.id);
    this.onDone();
    const what = !touched.length ? "" : removed ? `\uFF0C\u5E76\u5220\u9664 ${touched.length} \u6761\u8BB0\u5F55` : `\uFF0C${touched.length} \u6761\u8BB0\u5F55\u5DF2\u89E3\u9664\u5173\u8054`;
    undoNotice(`\u5DF2\u5220\u9664\u300C${this.task.title}\u300D${what}`, async () => {
      for (const t of snapshot) if (!this.plugin.tasks.byId(t.id)) await this.plugin.tasks.upsert(t);
      if (touched.length) await this.plugin.journal.restoreDetached(touched, removed);
      this.onDone();
    });
  }
};
var SHORTCUTS = [
  ["N", "\u65B0\u5EFA\uFF08\u6BCF\u65E5 / \u56DE\u987E\u9875\uFF1A\u8BB0\u4E00\u6761\uFF1B\u4EFB\u52A1\u9875\uFF1A\u52A0\u4EFB\u52A1\uFF09"],
  ["1 / 2 / 3", "\u5207\u6362 \u6BCF\u65E5 \xB7 \u56DE\u987E \xB7 \u4EFB\u52A1"],
  ["T", "\u56DE\u5230\u4ECA\u5929\uFF08\u6BCF\u65E5 / \u4EFB\u52A1\u9875\uFF09"],
  ["\u2190 / \u2192", "\u524D\u4E00\u5929 / \u540E\u4E00\u5929\uFF08\u6BCF\u65E5 / \u4EFB\u52A1\u9875\uFF09"],
  ["?", "\u6253\u5F00\u672C\u901F\u67E5\u5361"],
  ["\u2191 / \u2193", "\u65F6\u95F4\u8F74\uFF1A\u9009\u4E2D\u5757\u79FB\u52A8 5 \u5206\u949F\uFF08Alt \u4E3A 1 \u5206\u949F\uFF09"],
  ["Shift + \u2191 / \u2193", "\u65F6\u95F4\u8F74\uFF1A\u6539\u65F6\u957F"],
  ["Enter / Delete", "\u65F6\u95F4\u8F74\uFF1A\u7F16\u8F91 / \u5220\u9664\u9009\u4E2D\u5757"],
  ["Alt + 1\u20269", "\u65B0\u5EFA\u8BB0\u5F55\uFF1A\u5207\u6362\u5206\u7C7B"],
  ["Enter", "\u65B0\u5EFA / \u7F16\u8F91\uFF1A\u4FDD\u5B58"],
  ["Esc", "\u53D6\u6D88\u62D6\u52A8 / \u5173\u95ED\u7A97\u53E3"]
];
var ShortcutsModal = class extends import_obsidian6.Modal {
  onOpen() {
    this.modalEl.addClass("lubi-modal", "lubi-modal-sm", "lubi-shortcuts-modal");
    this.titleEl.setText("\u5FEB\u6377\u952E");
    const list = this.contentEl.createDiv({ cls: "lubi-shortcuts" });
    for (const [k, d] of SHORTCUTS) {
      const row = list.createDiv({ cls: "lubi-shortcut-row" });
      const keys = row.createSpan({ cls: "lubi-shortcut-keys" });
      k.split(" ").forEach((part) => {
        if (part === "/" || part === "+" || part === "\u2026") keys.createSpan({ cls: "lubi-muted", text: ` ${part} ` });
        else keys.createEl("kbd", { text: part });
      });
      row.createSpan({ cls: "lubi-shortcut-desc", text: d });
    }
  }
};
function kindSwitch(host, current, onPick) {
  const items = [
    { id: "done", label: "\u8BB0\u5F55", icon: "check" },
    { id: "todo", label: "\u4EFB\u52A1", icon: "list-todo" }
  ];
  const seg = segmented(host, items, current, (kind) => {
    if (kind !== current) onPick(kind);
  });
  seg.addClass("lubi-mode-seg", "lubi-kind-seg");
  seg.setAttribute("aria-label", "\u65B0\u5EFA\u7C7B\u578B");
  seg.querySelectorAll(".lubi-seg-item").forEach((b, i) => tip(b, i === 0 ? "\u8BB0\u5F55\uFF1A\u5DF2\u7ECF\u505A\u4E86\u7684\u4E8B / \u652F\u51FA\uFF0C\u5199\u8FDB\u5F53\u5929\u65E5\u8BB0" : "\u4EFB\u52A1\uFF1A\u8FD8\u6CA1\u505A\u7684\u4E8B\uFF0C\u5199\u8FDB\u4EFB\u52A1\u6E05\u5355"));
}
var RecordModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.opts = opts;
    this.saving = false;
    this.parsed = null;
    this.lastTimeCat = "";
    const s = plugin.settings;
    const firstCat = s.categories.find((c) => c.kind === "time")?.name || "\u65E5\u5E38";
    this.editing = !!opts.rec;
    this.rec = opts.rec ? { ...opts.rec, extra: { ...opts.rec.extra } } : {
      date: opts.date,
      start: opts.defaults?.start || (opts.date === todayStr() ? nowHM() : "09:00"),
      minutes: opts.defaults?.minutes ?? 30,
      category: opts.defaults?.category || firstCat,
      title: opts.defaults?.title || "",
      task: opts.defaults?.task,
      amount: opts.defaults?.amount,
      expenseType: opts.defaults?.expenseType,
      notes: opts.defaults?.notes,
      extra: {}
    };
  }
  onOpen() {
    this.modalEl.addClass("lubi-modal");
    this.render();
  }
  render(focusTitle = true) {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    const s = this.plugin.settings;
    const cat = categoryOf(s, this.rec.category);
    const isMoney = cat.kind === "money";
    this.modalEl.addClass("lubi-record-modal");
    this.modalEl.style.setProperty("--chip", cat.color);
    titleEl.empty();
    titleEl.createSpan({ text: this.editing ? "\u7F16\u8F91\u8BB0\u5F55" : "\u65B0\u5EFA" });
    const ctx = [`${shortDate(this.rec.date)} \u5468${weekdayZh(this.rec.date)}`];
    if (this.editing && this.opts.rec) ctx.push(this.opts.rec.minutes > 0 ? `${this.opts.rec.start}\u2013${minToHM(hmToMin(this.opts.rec.start) + this.opts.rec.minutes)}` : this.opts.rec.start);
    titleEl.createSpan({ cls: "lubi-modal-ctx", text: ctx.join(" \xB7 ") });
    const timeCats = s.categories.filter((c) => c.kind === "time");
    const moneyCats = s.categories.filter((c) => c.kind === "money");
    const modeRow = contentEl.createDiv({ cls: "lubi-mode-row" });
    if (!this.editing) kindSwitch(modeRow, "done", (kind) => {
      if (kind === "todo") this.switchToTask();
    });
    if (timeCats.length && moneyCats.length) {
      segmented(modeRow, [
        { id: "time", label: "\u65F6\u95F4", icon: "clock" },
        { id: "money", label: "\u652F\u51FA", icon: "wallet" }
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
        this.contentEl.querySelector('.lubi-money-seg .lubi-seg-item[aria-pressed="true"]')?.focus();
      }).addClass("lubi-mode-seg", "lubi-money-seg");
    }
    const pool = isMoney ? moneyCats : timeCats;
    const pickCat = (name, focus = true) => {
      const next = categoryOf(s, name);
      if (next.kind !== cat.kind) return;
      this.rec.category = name;
      this.modalEl.style.setProperty("--chip", next.color);
      cats.querySelectorAll(".lubi-cat-option").forEach((b) => {
        const on = b.dataset.cat === name;
        b.setAttribute("aria-pressed", String(on));
        if (on && focus) b.focus();
      });
      const dl2 = contentEl.querySelector("#lubi-title-suggest");
      if (dl2) {
        dl2.empty();
        for (const t of this.plugin.recentTitles(name)) dl2.createEl("option", { value: t });
      }
    };
    const cats = contentEl.createDiv({ cls: "lubi-cat-picker lubi-cat-pills", attr: { role: "group", "aria-label": "\u5206\u7C7B" } });
    const markOverflow = () => cats.toggleClass("is-overflow", cats.scrollWidth - cats.scrollLeft - cats.clientWidth > 4);
    cats.addEventListener("scroll", markOverflow, { passive: true });
    window.requestAnimationFrame(markOverflow);
    cats.toggleClass("is-hidden", pool.length <= 1 && isMoney);
    pool.forEach((c, i) => {
      const b = tip(cats.createEl("button", { cls: "lubi-cat-option", attr: { type: "button", "aria-pressed": String(c.name === this.rec.category), "data-cat": c.name } }), i < 9 ? `${c.name}\uFF08Alt+${i + 1}\uFF09` : c.name);
      b.style.setProperty("--chip", c.color);
      icon(b, c.icon, "lubi-icon");
      b.createSpan({ text: c.name });
      if (i < 9) b.createSpan({ cls: "lubi-cat-key", text: String(i + 1), attr: { "aria-hidden": "true" } });
      b.addEventListener("click", (e) => {
        stopAll(e);
        pickCat(c.name);
      });
    });
    let syncTime = () => void 0;
    const titleRow = contentEl.createDiv({ cls: "lubi-field" });
    const titleLabel = titleRow.createEl("label", { text: isMoney ? "\u4E70\u4E86\u4EC0\u4E48" : "\u505A\u4E86\u4EC0\u4E48" });
    const titleInput = titleRow.createEl("input", { type: "text", value: this.rec.title, attr: { placeholder: isMoney ? "\u5348\u996D / \u5730\u94C1 / \u4E66" : "\u505A\u4E86\u4EC0\u4E48 \xB7 \u4E5F\u53EF\u4E00\u884C\u5199\u5B8C\uFF1A9:00-10:30 \u5B66\u4E60 \u4E09\u660E\u6CBB\u5B9A\u7406", list: "lubi-title-suggest", autocomplete: "off" } });
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
      const bits = [];
      if (q.category) bits.push(q.category);
      if (q.start) bits.push(q.minutes ? `${q.start}\u2013${minToHM(hmToMin(q.start) + q.minutes)}` : `${q.start} \u5F00\u59CB`);
      if (q.minutes) bits.push(fmtDuration(q.minutes));
      parseHint.createSpan({ text: `\u8BC6\u522B\u4E3A ${bits.join(" \xB7 ")} \xB7\u300C${q.title || "\uFF08\u8FD8\u6CA1\u5199\u505A\u4E86\u4EC0\u4E48\uFF09"}\u300D` });
    };
    titleInput.addEventListener("input", () => {
      this.rec.title = titleInput.value;
      clearFieldError(titleInput);
      applyParse();
    });
    const dl = titleRow.createEl("datalist", { attr: { id: "lubi-title-suggest" } });
    for (const t of this.plugin.recentTitles(this.rec.category)) dl.createEl("option", { value: t });
    if (focusTitle) window.setTimeout(() => {
      if (titleInput.isConnected) titleInput.focus();
    }, 20);
    if (!isMoney) {
      const bar = contentEl.createDiv({ cls: "lubi-timebar" });
      const startCell = bar.createDiv({ cls: "lubi-timebar-cell" });
      const startLabel = startCell.createEl("label", { text: "\u5F00\u59CB" });
      const startInput = startCell.createEl("input", { type: "time", value: this.rec.start });
      associate(startLabel, startInput);
      bar.createDiv({ cls: "lubi-timebar-seg" }).createSpan({ cls: "lubi-timebar-line" });
      const durCell = bar.createDiv({ cls: "lubi-timebar-dur" });
      const durLabel = durCell.createEl("label", { cls: "lubi-sr-only", text: "\u65F6\u957F" });
      const durInput = durCell.createEl("input", { type: "number", attr: { min: "0", step: "5" } });
      associate(durLabel, durInput);
      this.durationInput = durInput;
      const unitBtn = durCell.createEl("button", { cls: "lubi-timebar-unit", text: "min" });
      bar.createDiv({ cls: "lubi-timebar-seg" }).createSpan({ cls: "lubi-timebar-line" });
      const endCell = bar.createDiv({ cls: "lubi-timebar-cell" });
      const endLabel = endCell.createEl("label", { text: "\u7ED3\u675F" });
      const endInput = endCell.createEl("input", { type: "time" });
      associate(endLabel, endInput);
      let unit = this.rec.minutes >= 60 && this.rec.minutes % 30 === 0 ? "h" : "min";
      const quick = contentEl.createDiv({ cls: "lubi-quick" });
      const chips = [];
      syncTime = () => {
        startInput.value = this.rec.start;
        endInput.value = minToHM(hmToMin(this.rec.start) + this.rec.minutes);
        durInput.value = unit === "h" ? String(Math.round(this.rec.minutes / 60 * 100) / 100) : String(this.rec.minutes);
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
      const before = this.rec.date === todayStr() ? hmToMin(nowHM()) : void 0;
      const prevEnd = this.plugin.lastEndOf(this.rec.date, before);
      if (prevEnd && !this.editing && prevEnd !== this.rec.start) {
        const b = tip(quick.createEl("button", { cls: "lubi-quick-chip lubi-quick-chip-accent", attr: { type: "button" } }), `\u4ECE\u4E0A\u4E00\u6761\u8BB0\u5F55\u7684\u7ED3\u675F\u65F6\u95F4 ${prevEnd} \u63A5\u7740\u8BB0`);
        icon(b, "corner-down-right", "lubi-icon");
        b.createSpan({ text: `\u4ECE ${prevEnd} \u63A5\u7740\u8BB0` });
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
      const timeLabel = timeF.createEl("label", { text: "\u65F6\u95F4" });
      const startInput = timeF.createEl("input", { type: "time", value: this.rec.start });
      associate(timeLabel, startInput);
      startInput.addEventListener("change", () => this.rec.start = startInput.value || this.rec.start);
      const amtF = row.createDiv({ cls: "lubi-field" });
      const amtLabel = amtF.createEl("label", { text: "\u91D1\u989D" });
      const amtWrap = amtF.createDiv({ cls: "lubi-amount" });
      amtWrap.createSpan({ cls: "lubi-amount-cur", text: "\xA5" });
      const amt = amtWrap.createEl("input", { type: "number", value: this.rec.amount !== void 0 ? String(this.rec.amount) : "", attr: { step: "0.01", placeholder: "0.00" } });
      associate(amtLabel, amt);
      this.amountInput = amt;
      amt.addEventListener("input", () => {
        this.rec.amount = amt.value === "" ? void 0 : Number(amt.value);
        clearFieldError(amt);
      });
      const typeF = row.createDiv({ cls: "lubi-field" });
      const expenseLabel = typeF.createEl("label", { text: "\u7C7B\u522B" });
      const sel = typeF.createEl("select");
      associate(expenseLabel, sel);
      for (const t of s.expenseTypes) sel.createEl("option", { value: t, text: t });
      sel.value = this.rec.expenseType && s.expenseTypes.includes(this.rec.expenseType) ? this.rec.expenseType : s.expenseTypes[0];
      this.rec.expenseType = sel.value;
      sel.addEventListener("change", () => this.rec.expenseType = sel.value);
    }
    const extras = contentEl.createDiv({ cls: "lubi-extras" });
    const toggles = extras.createDiv({ cls: "lubi-extras-toggles" });
    const fields = extras.createDiv({ cls: "lubi-extras-fields" });
    const optional = (key, label, iconName, build, initiallyOpen) => {
      const tg = toggles.createEl("button", { cls: "lubi-ghost-btn" });
      icon(tg, iconName, "lubi-icon");
      tg.createSpan({ text: label });
      let box = null;
      const open = () => {
        if (box) return;
        box = fields.createDiv({ cls: "lubi-field lubi-extra-field" });
        const head = box.createDiv({ cls: "lubi-extra-head" });
        head.createEl("label", { text: label });
        iconButton(head, "x", "\u6536\u8D77", () => {
          box?.remove();
          box = null;
          tg.removeClass("is-open");
          if (key === "task") this.rec.task = void 0;
          else this.rec.notes = void 0;
        }, "lubi-icon-btn-sm lubi-push-right");
        build(box);
        tg.addClass("is-open");
      };
      tg.addEventListener("click", (e) => {
        stopAll(e);
        open();
        box?.querySelector("select, textarea, input")?.focus();
      });
      if (initiallyOpen) open();
    };
    optional("notes", "\u5907\u6CE8", "sticky-note", (host) => {
      const notes = host.createEl("textarea", { attr: { rows: "2", placeholder: "\u8865\u4E00\u53E5\u4E0A\u4E0B\u6587", "aria-label": "\u5907\u6CE8" } });
      notes.value = this.rec.notes || "";
      notes.addEventListener("input", () => this.rec.notes = notes.value.trim() || void 0);
    }, !!this.rec.notes);
    const actions = contentEl.createDiv({ cls: "lubi-modal-actions" });
    if (this.editing && this.opts.line !== void 0) {
      const del = actions.createEl("button", { cls: "lubi-text-btn lubi-text-btn-danger lubi-push-left", text: "\u5220\u9664" });
      del.addEventListener("click", (e) => {
        stopAll(e);
        new ConfirmModal(this.app, "\u5220\u9664\u8FD9\u6761\u8BB0\u5F55\uFF1F", `${this.rec.start} ${this.rec.category} \xB7 ${this.rec.title}`, async () => {
          this.close();
          await deleteRecord(this.plugin, this.opts.date, { rec: this.opts.rec, line: this.opts.line }, () => this.opts.onSaved?.());
        }, "\u5220\u9664").open();
      });
    }
    button(actions, "\u53D6\u6D88", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(actions, this.editing ? "\u4FDD\u5B58" : "\u8BB0\u4E0B", () => void this.save(), { primary: true });
    ok.createSpan({ cls: "lubi-kbd", text: "\u23CE" });
    contentEl.onkeydown = (e) => {
      if (e.key === "Enter" && e.target === titleInput && !e.isComposing) {
        e.preventDefault();
        void this.save();
        return;
      }
      if (e.altKey && /^[1-9]$/.test(e.key) && pool[Number(e.key) - 1]) {
        e.preventDefault();
        pickCat(pool[Number(e.key) - 1].name, false);
      }
    };
    if (this.parsed === null && titleInput.value) applyParse();
  }
  /** 切到「待做」：带着已填的内容换成任务表单 */
  switchToTask() {
    const s = this.plugin.settings;
    const title = (this.parsed ? this.parsed.title : this.rec.title).trim();
    const category = categoryOf(s, this.rec.category).kind === "time" ? this.rec.category : this.lastTimeCat || "";
    const start = this.parsed?.start || this.opts.defaults?.start || "";
    const estimate = this.rec.minutes > 0 ? this.rec.minutes : 0;
    this.close();
    new TaskModal(this.app, this.plugin, { defaults: { title, category, date: this.rec.date, start, estimate }, onSaved: () => this.opts.onSaved?.() }).open();
  }
  async save() {
    if (this.saving) return;
    const r = this.rec;
    if (this.parsed) {
      r.title = this.parsed.title;
      this.parsed = null;
      if (this.titleInput) this.titleInput.value = r.title;
    }
    if (!r.title.trim()) {
      fieldError(this.titleInput, "\u5148\u5199\u4E00\u4E0B\u505A\u4E86\u4EC0\u4E48");
      return;
    }
    const isMoney = categoryOf(this.plugin.settings, r.category).kind === "money";
    if (isMoney && (r.amount === void 0 || isNaN(r.amount))) {
      fieldError(this.amountInput, "\u586B\u4E00\u4E0B\u91D1\u989D");
      return;
    }
    if (!isMoney && r.minutes <= 0) {
      fieldError(this.durationInput, "\u65F6\u957F\u9700\u8981\u5927\u4E8E 0");
      return;
    }
    if (r.extra && r.extra[PENDING_KEY] !== void 0) delete r.extra[PENDING_KEY];
    this.saving = true;
    try {
      let saved = r;
      if (this.editing && this.opts.line !== void 0) {
        await this.plugin.journal.update(this.opts.date, this.opts.line, r);
        if (this.opts.rec) await syncLinkedTask(this.plugin, this.opts.rec, r);
      } else saved = await addRecordAsDone(this.plugin, r);
      this.close();
      this.opts.onSaved?.({ ...saved, extra: { ...saved.extra } });
    } catch (e) {
      formError(this.contentEl, `\u65E0\u6CD5\u4FDD\u5B58\uFF1A${e.message}`);
    } finally {
      this.saving = false;
    }
  }
};
var TaskModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.opts = opts;
    this.saving = false;
    this.estimateInvalid = false;
    this.editing = !!opts.task;
    this.t = opts.task ? { ...opts.task, repeat: { ...opts.task.repeat, days: [...opts.task.repeat.days] }, doneDates: [...opts.task.doneDates] } : blankTask(opts.defaults);
    if (!this.t.category) this.t.category = plugin.settings.categories.find((c) => c.kind === "time")?.name || "";
    this.initial = JSON.stringify(this.t);
  }
  /** 有未保存修改时，标题旁显示「● 未保存」 */
  syncDirty() {
    const dirty = this.editing && JSON.stringify(this.t) !== this.initial;
    this.titleEl.querySelector(".lubi-dirty")?.toggleClass("is-on", dirty);
  }
  onOpen() {
    this.modalEl.addClass("lubi-modal");
    const dirtyCheck = () => window.setTimeout(() => this.syncDirty(), 0);
    for (const ev of ["input", "change", "click"]) this.contentEl.addEventListener(ev, dirtyCheck, true);
    this.render();
  }
  render(focusTitle = true) {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    const parent = this.t.parent ? this.plugin.tasks.byId(this.t.parent) : null;
    this.modalEl.addClass("lubi-record-modal", "lubi-task-modal");
    const s = this.plugin.settings;
    const cat = categoryOf(s, this.t.category);
    this.modalEl.style.setProperty("--chip", cat.color);
    titleEl.empty();
    titleEl.createSpan({ text: this.editing ? "\u7F16\u8F91\u4EFB\u52A1" : parent ? "\u65B0\u5EFA\u5B50\u4EFB\u52A1" : "\u65B0\u5EFA" });
    if (parent) titleEl.createSpan({ cls: "lubi-modal-ctx", text: this.plugin.tasks.pathOf(parent).map((p) => p.title).join(" / ") });
    titleEl.createSpan({ cls: "lubi-dirty", text: "\u25CF \u672A\u4FDD\u5B58", attr: { "aria-live": "polite" } });
    this.syncDirty();
    if (!this.editing && !parent) kindSwitch(contentEl, "todo", (kind) => {
      if (kind === "done") this.switchToRecord("done");
    });
    const cats = contentEl.createDiv({ cls: "lubi-cat-picker" });
    for (const c of s.categories.filter((c2) => c2.kind === "time")) {
      const b = cats.createEl("button", { cls: "lubi-cat-option", attr: { "aria-pressed": String(c.name === this.t.category) } });
      b.style.setProperty("--chip", c.color);
      icon(b, c.icon, "lubi-icon");
      b.createSpan({ text: c.name });
      b.addEventListener("click", (e) => {
        stopAll(e);
        this.t.category = c.name;
        this.render(false);
        Array.from(contentEl.querySelectorAll(".lubi-cat-option")).find((item) => item.textContent === c.name)?.focus();
      });
    }
    const titleF = contentEl.createDiv({ cls: "lubi-field" });
    const titleLabel = titleF.createEl("label", { text: "\u4EFB\u52A1" });
    const titleInput = titleF.createEl("input", { type: "text", value: this.t.title, attr: { placeholder: "\u8981\u505A\u4EC0\u4E48" } });
    associate(titleLabel, titleInput);
    this.titleInput = titleInput;
    titleInput.addEventListener("input", () => {
      this.t.title = titleInput.value;
      clearFieldError(titleInput);
    });
    if (focusTitle) window.setTimeout(() => {
      const target = this.opts.focusDate && this.dateInput?.isConnected ? this.dateInput : titleInput;
      if (target.isConnected) target.focus();
    }, 20);
    const grid = contentEl.createDiv({ cls: "lubi-grid" });
    const repF = grid.createDiv({ cls: "lubi-field" });
    const repLabel = repF.createEl("label", { text: "\u91CD\u590D" });
    const repSel = repF.createEl("select", { cls: "lubi-repeat-select" });
    associate(repLabel, repSel);
    this.repeatSelect = repSel;
    const kinds = [
      ["none", "\u4E0D\u91CD\u590D"],
      ["daily", "\u6BCF\u5929"],
      ["weekly", "\u6BCF\u5468\u51E0"],
      ["monthly", "\u6BCF\u6708\u51E0\u53F7"]
    ];
    for (const [k, l] of kinds) repSel.createEl("option", { value: k, text: l });
    repSel.value = this.t.repeat.kind;
    repSel.addEventListener("change", () => {
      this.t.repeat.kind = repSel.value;
      this.t.repeat.days = [];
      this.render(false);
      this.contentEl.querySelector(".lubi-repeat-select")?.focus();
    });
    if (this.t.repeat.kind === "none") {
      const dateF = grid.createDiv({ cls: "lubi-field" });
      const dateLabel = dateF.createEl("label", { text: "\u5B89\u6392\u65E5\u671F" });
      const date = dateF.createEl("input", { type: "date", value: this.t.date });
      associate(dateLabel, date);
      this.dateInput = date;
      date.addEventListener("change", () => this.t.date = date.value);
    }
    const startF = grid.createDiv({ cls: "lubi-field" });
    const startLabel = startF.createEl("label", { text: "\u5F00\u59CB\u65F6\u95F4" });
    const start = startF.createEl("input", { type: "time", value: this.t.start });
    associate(startLabel, start);
    start.addEventListener("change", () => this.t.start = start.value);
    const estF = grid.createDiv({ cls: "lubi-field" });
    const estLabel = estF.createEl("label", { text: "\u9884\u8BA1" });
    const estWrap = estF.createDiv({ cls: "lubi-timebar-dur lubi-timebar-dur-block" });
    const est = estWrap.createEl("input", { type: "text", value: this.t.estimate ? fmtDuration(this.t.estimate) : "", attr: { inputmode: "decimal", placeholder: "\u5982 45min / 2.5h", autocomplete: "off" } });
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
    est.addEventListener("input", () => {
      clearFieldError(est);
      syncEst();
    });
    est.addEventListener("blur", () => {
      if (!this.estimateInvalid && this.t.estimate) est.value = fmtDuration(this.t.estimate);
    });
    if (this.t.repeat.kind === "weekly") {
      const days = contentEl.createDiv({ cls: "lubi-days" });
      ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].forEach((l, i) => {
        const n = i + 1;
        const b = days.createEl("button", { cls: "lubi-quick-chip", text: `\u5468${l}`, attr: { "aria-pressed": String(this.t.repeat.days.includes(n)) } });
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
          this.t.repeat.days = has ? this.t.repeat.days.filter((d) => d !== n) : [...this.t.repeat.days, n].sort((a, b2) => a - b2);
          b.setAttribute("aria-pressed", String(!has));
        });
      }
    }
    const extras = contentEl.createDiv({ cls: "lubi-extras" });
    const toggles = extras.createDiv({ cls: "lubi-extras-toggles" });
    const fields = extras.createDiv({ cls: "lubi-extras-fields" });
    const optional = (label, iconName, build, onClear, initiallyOpen) => {
      const tg = toggles.createEl("button", { cls: "lubi-ghost-btn" });
      icon(tg, iconName, "lubi-icon");
      tg.createSpan({ text: label });
      let box = null;
      const open = () => {
        if (box) return;
        box = fields.createDiv({ cls: "lubi-field lubi-extra-field" });
        const head = box.createDiv({ cls: "lubi-extra-head" });
        head.createEl("label", { text: label });
        iconButton(head, "x", "\u6536\u8D77", () => {
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
        box?.querySelector("select, textarea, input")?.focus();
      });
      if (initiallyOpen) open();
    };
    optional("\u7236\u4EFB\u52A1", "corner-down-right", (host) => {
      const parentSel = host.createEl("select", { attr: { "aria-label": "\u7236\u4EFB\u52A1" } });
      parentSel.createEl("option", { value: "", text: "\uFF08\u65E0 \xB7 \u9876\u5C42\uFF09" });
      const forbidden = /* @__PURE__ */ new Set([this.t.id, ...this.plugin.tasks.descendants(this.t.id).map((d) => d.id)]);
      for (const cand of this.plugin.tasks.all.filter((x) => !forbidden.has(x.id) && x.status !== "done")) {
        parentSel.createEl("option", { value: cand.id, text: this.plugin.tasks.pathOf(cand).map((p) => p.title).join(" / ") });
      }
      parentSel.value = this.t.parent || "";
      parentSel.addEventListener("change", () => this.t.parent = parentSel.value || null);
    }, () => this.t.parent = null, !!this.t.parent);
    const spanLabel = this.t.repeat.kind === "none" ? "\u9879\u76EE\u8DE8\u5EA6" : "\u751F\u6548\u8303\u56F4";
    optional(spanLabel, "calendar-range", (host) => {
      const row = host.createDiv({ cls: "lubi-grid lubi-grid-2" });
      const sdF = row.createDiv({ cls: "lubi-field" });
      const sdLabel = sdF.createEl("label", { text: this.t.repeat.kind === "none" ? "\u5F00\u59CB" : "\u4ECE" });
      const sd = sdF.createEl("input", { type: "date", value: this.t.startDate });
      associate(sdLabel, sd);
      sd.addEventListener("change", () => this.t.startDate = sd.value);
      const edF = row.createDiv({ cls: "lubi-field" });
      const edLabel = edF.createEl("label", { text: this.t.repeat.kind === "none" ? "\u622A\u6B62" : "\u5230" });
      const ed = edF.createEl("input", { type: "date", value: this.t.endDate });
      associate(edLabel, ed);
      ed.addEventListener("change", () => this.t.endDate = ed.value);
    }, () => {
      this.t.startDate = "";
      this.t.endDate = "";
    }, !!(this.t.startDate || this.t.endDate));
    optional("\u72B6\u6001", "circle-dot", (host) => {
      const row = host.createDiv({ cls: "lubi-inline" });
      const seg = row.createDiv({ cls: "lubi-seg lubi-status-seg", attr: { role: "group", "aria-label": "\u4EFB\u52A1\u72B6\u6001" } });
      for (const [v, l] of [["todo", "\u5F85\u529E"], ["doing", "\u8FDB\u884C\u4E2D"], ["done", "\u5DF2\u5B8C\u6210"]]) {
        const b = seg.createEl("button", { cls: "lubi-seg-item", attr: { type: "button", "data-task-status": v, "aria-pressed": String(this.t.status === v) } });
        b.createSpan({ cls: "lubi-status-check", text: "\u2713", attr: { "aria-hidden": "true" } });
        b.createSpan({ text: l });
        b.addEventListener("click", (e) => {
          stopAll(e);
          this.t.status = v;
          seg.querySelectorAll(".lubi-seg-item").forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
        });
      }
      const blocked = row.createEl("button", { cls: "lubi-quick-chip lubi-quick-chip-warn lubi-switch", attr: { type: "button", "aria-pressed": String(this.t.blocked) } });
      blocked.createSpan({ cls: "lubi-switch-track", attr: { "aria-hidden": "true" } }).createSpan({ cls: "lubi-switch-thumb" });
      blocked.createSpan({ text: "\u53D7\u963B" });
      tip(blocked, "\u53D7\u963B\uFF1A\u88AB\u5916\u90E8\u56E0\u7D20\u5361\u4F4F\uFF0C\u5217\u8868\u91CC\u4F1A\u663E\u793A\u63D0\u793A");
      blocked.addEventListener("click", (e) => {
        stopAll(e);
        this.t.blocked = !this.t.blocked;
        blocked.setAttribute("aria-pressed", String(this.t.blocked));
      });
    }, () => void 0, this.editing || this.t.blocked);
    optional("\u5907\u6CE8", "sticky-note", (host) => {
      const notes = host.createEl("textarea", { attr: { rows: "2", placeholder: "\u8865\u4E00\u53E5\u4E0A\u4E0B\u6587", "aria-label": "\u5907\u6CE8" } });
      notes.value = this.t.notes;
      notes.addEventListener("input", () => this.t.notes = notes.value);
    }, () => this.t.notes = "", !!this.t.notes);
    const actions = contentEl.createDiv({ cls: "lubi-modal-actions" });
    if (this.editing) {
      const del = actions.createEl("button", { cls: "lubi-text-btn lubi-text-btn-danger lubi-push-left", text: "\u5220\u9664" });
      del.addEventListener("click", (e) => {
        stopAll(e);
        const original = this.plugin.tasks.byId(this.t.id) || this.t;
        new DeleteTaskModal(this.app, this.plugin, original, () => {
          this.close();
          this.opts.onSaved?.(this.t);
        }).open();
      });
    }
    button(actions, "\u53D6\u6D88", () => this.close(), { cls: "lubi-btn-ghost" });
    const ok = button(actions, this.editing ? "\u4FDD\u5B58" : "\u521B\u5EFA", () => void this.save(), { primary: true });
    ok.createSpan({ cls: "lubi-kbd", text: "\u23CE" });
    contentEl.onkeydown = (e) => {
      if (e.key === "Enter" && e.target === titleInput && !e.isComposing) {
        e.preventDefault();
        void this.save();
      }
    };
  }
  /** 切到「已完成 / 支出」：带着已填的内容换成记录表单 */
  switchToRecord(kind) {
    const s = this.plugin.settings;
    const money = s.categories.find((c) => c.kind === "money")?.name;
    const date = this.t.date || todayStr();
    const defaults = kind === "money" && money ? { title: this.t.title, category: money, minutes: 0 } : { title: this.t.title, category: this.t.category || void 0, start: this.t.start || void 0, minutes: this.t.estimate || 30 };
    this.close();
    new RecordModal(this.app, this.plugin, { date, defaults, onSaved: () => this.opts.onSaved?.(this.t) }).open();
  }
  async save() {
    if (this.saving) return;
    if (!this.t.title.trim()) {
      fieldError(this.titleInput, "\u4EFB\u52A1\u540D\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (this.estimateInvalid) {
      fieldError(this.estimateInput, "\u9884\u8BA1\u65F6\u957F\u5199\u6210 45min\u30012.5h \u6216 90 \u8FD9\u6837\u7684\u683C\u5F0F");
      return;
    }
    if (this.t.repeat.kind !== "none" && this.t.repeat.kind !== "daily" && !this.t.repeat.days.length) {
      fieldError(this.repeatSelect, "\u9009\u4E00\u4E0B\u91CD\u590D\u7684\u65E5\u5B50");
      return;
    }
    if (this.t.status === "done" && !this.t.doneAt) this.t.doneAt = (/* @__PURE__ */ new Date()).toISOString();
    if (this.t.status !== "done") this.t.doneAt = "";
    const before = this.editing ? this.plugin.tasks.byId(this.t.id) : void 0;
    const wasDone = !!before && before.repeat.kind === "none" && before.status === "done";
    const becomesDone = this.t.repeat.kind === "none" && this.t.status === "done" && !wasDone;
    const becomesUndone = wasDone && !(this.t.repeat.kind === "none" && this.t.status === "done");
    if (becomesDone && !this.t.date) this.t.date = todayStr();
    const undoneDate = before?.date || "";
    this.saving = true;
    try {
      const saved = await this.plugin.tasks.upsert(this.t);
      this.close();
      this.opts.onSaved?.(saved);
      const refresh = () => this.opts.onSaved?.(saved);
      if (becomesDone) {
        const date = saved.date || todayStr();
        await afterDone(this.plugin, saved, date, void 0, refresh);
        refresh();
      } else if (becomesUndone && undoneDate) {
        await afterUndone(this.plugin, saved.id, undoneDate, refresh);
        refresh();
      }
    } catch (e) {
      formError(this.contentEl, `\u65E0\u6CD5\u4FDD\u5B58\uFF1A${e.message}`);
    } finally {
      this.saving = false;
    }
  }
};

// src/ui/today.ts
var PX_PER_MIN = HOUR_PX / 60;
var snap5 = (m) => Math.max(0, Math.min(1440, Math.round(m / 5) * 5));
async function renderToday(plugin, host, date, rerender) {
  host.empty();
  host.addClass("lubi-today");
  const rows = await plugin.journal.read(date);
  const timed = rows.filter((r) => r.rec.minutes > 0).sort((a, b) => hmToMin(a.rec.start) - hmToMin(b.rec.start));
  const money = rows.filter((r) => r.rec.minutes <= 0);
  const stats = dayTimeStats(timed.map((row) => row.rec));
  const invalidRows = timed.filter((row) => invalidTimedSpan(row.rec));
  const openNew = (defaults = {}, onRec) => new RecordModal(plugin.app, plugin, { date, defaults, onSaved: async (rec) => {
    if (rec && onRec) await onRec(rec);
    rerender();
  } }).open();
  const openEdit = (row) => new RecordModal(plugin.app, plugin, { date, rec: row.rec, line: row.line, onSaved: rerender }).open();
  const top = host.createDiv({ cls: "lubi-today-top" });
  if (!plugin.settings.onboardingDone && plugin.journal.dates().length === 0) renderOnboarding(plugin, top, () => openNew());
  const tlHead = top.createDiv({ cls: "lubi-panel-head" });
  el(tlHead, "h3", "lubi-panel-title", "\u65F6\u95F4\u8F74");
  el(tlHead, "span", "lubi-muted lubi-tl-stats", timed.length ? `\u8BB0\u5F55 ${fmtHours(stats.recordedMinutes)} \xB7 \u8986\u76D6 ${fmtHours(stats.coveredMinutes)} \xB7 \u7A7A\u767D ${fmtHours(stats.emptyMinutes)}` : "\u8FD8\u6CA1\u6709\u8BB0\u5F55");
  if (stats.overlapMinutes) {
    const badge = tlHead.createSpan({ cls: "lubi-badge lubi-badge-overlap lubi-data-overlap", attr: { tabindex: "0", role: "note" } });
    icon(badge, "layers", "lubi-icon");
    badge.createSpan({ text: `\u5E76\u884C ${fmtDuration(stats.overlapMinutes)}` });
    tip(badge, `\u5E76\u884C\u8BB0\u5F55 ${fmtDuration(stats.overlapMinutes)}\uFF1A\u8BB0\u5F55\u65F6\u957F\u53EF\u80FD\u5927\u4E8E\u5B9E\u9645\u8986\u76D6\u65F6\u95F4\u3002\u91CD\u53E0\u7684\u5757\u4F1A\u5E76\u6392\u663E\u793A\u5E76\u5E26\u659C\u7EBF\u6807\u8BB0\u3002`);
  }
  const hint = tlHead.createSpan({ cls: "lubi-muted lubi-tl-hint" });
  icon(hint, "move-vertical", "lubi-icon");
  hint.createSpan({ text: "\u62D6\u52A8\u79FB\u52A8 \xB7 \u62C9\u8FB9\u7F18\u6539\u65F6\u957F \xB7 \u7A7A\u767D\u5904\u62D6\u51FA\u65B0\u8BB0\u5F55" });
  if (invalidRows.length) {
    const warning = top.createDiv({ cls: "lubi-data-warning", attr: { role: "status" } });
    warning.createDiv({ text: `${invalidRows.length} \u6761\u8BB0\u5F55\u8DE8\u51FA\u5F53\u5929\u3002\u8986\u76D6\u65F6\u95F4\u53EA\u6309\u5F53\u5929\u8BA1\u7B97\uFF0C\u8BF7\u6838\u5BF9\u539F\u8BB0\u5F55\u3002` });
    const links = warning.createDiv({ cls: "lubi-data-warning-links" });
    for (const row of invalidRows) button(links, `${row.rec.start} \xB7 ${row.rec.title}\uFF08${fmtHours(row.rec.minutes)}\uFF09`, () => openEdit(row), { cls: "lubi-btn-sm" });
  }
  const left = host.createDiv({ cls: "lubi-today-main" });
  const tlWrap = left.createDiv({ cls: "lubi-timeline-wrap" });
  const scroller = tlWrap.createDiv({ cls: "lubi-timeline-scroll" });
  const tl = scroller.createDiv({ cls: `lubi-timeline ${money.length ? "has-rail" : ""}`.trim(), attr: { tabindex: "0" } });
  tl.style.height = `${24 * HOUR_PX}px`;
  const gutter = tl.createDiv({ cls: "lubi-tl-gutter" });
  const hourLabels = [];
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
  const hover = canvas.createDiv({ cls: "lubi-tl-hover" });
  const hoverLabel = hover.createSpan({ cls: "lubi-tl-hover-label" });
  let dragging = false;
  canvas.addEventListener("pointermove", (e) => {
    if (dragging || e.target.closest(".lubi-block, .lubi-plan")) {
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
  const edges = [...new Set(timed.flatMap((r) => [hmToMin(r.rec.start), hmToMin(r.rec.start) + r.rec.minutes]))];
  const commit = async (row, start, minutes) => {
    const old = row.rec;
    if (hmToMin(old.start) === start && old.minutes === minutes) return;
    const next = confirmed({ ...old, start: minToHM(start), minutes, extra: { ...old.extra } });
    try {
      await plugin.journal.update(date, row.line, next);
      await syncLinkedTask(plugin, old, next);
    } catch (e) {
      new import_obsidian7.Notice(e.message, 6e3);
      rerender();
      return;
    }
    undoNotice(`${next.title} \u2192 ${next.start}\u2013${minToHM(start + minutes)}`, async () => {
      const line = await plugin.journal.findLine(date, next);
      if (line === null) return;
      await plugin.journal.update(date, line, old);
      await syncLinkedTask(plugin, next, old);
      rerender();
    });
    rerender();
  };
  let selected = null;
  const select = (row, blockEl) => {
    canvas.querySelectorAll(".lubi-block.is-selected").forEach((b) => b.removeClass("is-selected"));
    blockEl.addClass("is-selected");
    selected = { row, el: blockEl };
  };
  const planned = dayTasks(plugin, date);
  const loggedTasks = new Set(rows.map((r) => r.rec.task).filter((id) => !!id));
  const openPlans = planned.filter((t) => !plugin.tasks.isDoneOn(t, date) && !loggedTasks.has(t.id));
  const timedPlans = openPlans.filter((t) => t.start);
  const untimedPlans = openPlans.filter((t) => !t.start);
  canvas.toggleClass("has-plans", timedPlans.length > 0);
  const logPlan = (t) => openNew({
    title: t.title,
    category: t.category && categoryOf(plugin.settings, t.category).kind === "time" ? t.category : void 0,
    task: t.id,
    start: t.start || (date === todayStr() ? nowHM() : void 0),
    minutes: t.estimate || 30
  }, (rec) => completeFromRecord(plugin, t.id, date, rec));
  if (timedPlans.length) {
    const lane = canvas.createDiv({ cls: "lubi-plan-lane", attr: { "aria-label": "\u5F53\u5929\u8BA1\u5212" } });
    lane.createDiv({ cls: "lubi-plan-lane-title", text: "\u8BA1\u5212" });
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
      pb.createDiv({ cls: "lubi-plan-time", text: `${t.start}\u2013${minToHM(s0 + mins)}` });
      const late = date === todayStr() && s0 + mins < hmToMin(nowHM());
      pb.toggleClass("is-late", late);
      tip(pb, `\u8BA1\u5212 ${t.start}\u2013${minToHM(s0 + mins)} \xB7 ${t.title}${late ? "\uFF08\u5DF2\u8FC7\u8BA1\u5212\u65F6\u95F4\uFF09" : ""}\u3002\u70B9\u51FB\u6309\u5B9E\u9645\u65F6\u95F4\u8BB0\u4E00\u6761\uFF0C\u4FDD\u5B58\u540E\u4EFB\u52A1\u81EA\u52A8\u5B8C\u6210`);
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
    const top2 = startMin * PX_PER_MIN;
    const invalid = invalidTimedSpan(r);
    const height = Math.max(Math.min(r.minutes, 1440 - startMin) * PX_PER_MIN, 18);
    block.style.top = `${top2}px`;
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
    const head = block.createDiv({ cls: "lubi-block-head" });
    icon(head, cat.icon, "lubi-icon lubi-block-icon");
    head.createSpan({ cls: "lubi-block-title", text: r.title });
    if (pending) head.createSpan({ cls: "lubi-pending-badge", text: "\u5F85\u786E\u8BA4" });
    const durEl = head.createSpan({ cls: "lubi-block-dur", text: fmtDuration(r.minutes) });
    const meta = block.createDiv({ cls: "lubi-block-meta" });
    const timeEl = meta.createSpan({ cls: "lubi-block-time", text: invalid ? `${r.start} \xB7 \u9700\u6821\u5BF9` : `${r.start}\u2013${minToHM(startMin + r.minutes)}` });
    const subParts = [r.task && plugin.tasks.byId(r.task) ? "\u5173\u8054\u4EFB\u52A1" : "", r.notes || ""].filter(Boolean);
    if (subParts.length) meta.createSpan({ cls: "lubi-block-sub", text: subParts.join(" \xB7 ") });
    tip(block, `${invalid ? `${r.start} \xB7 \u65F6\u957F\u8DE8\u51FA\u5F53\u5929\uFF0C\u9700\u6821\u5BF9` : `${r.start}\u2013${minToHM(startMin + r.minutes)}`} ${r.category} \xB7 ${r.title}\uFF0C${fmtDuration(r.minutes)}${r.notes ? `\uFF08${r.notes}\uFF09` : ""}\u3002${pending ? "\u6309\u8BA1\u5212\u81EA\u52A8\u8BB0\u4E0B\uFF0C\u5F85\u786E\u8BA4\uFF1A\u62D6\u5230\u5B9E\u9645\u65F6\u95F4\u6216\u70B9 \u2713\u3002" : ""}${invalid ? "\u70B9\u51FB\u6216\u56DE\u8F66\u6821\u5BF9" : "\u62D6\u52A8\u79FB\u52A8 \xB7 \u62C9\u8FB9\u7F18\u6539\u65F6\u957F \xB7 \u56DE\u8F66\u7F16\u8F91"}`);
    const acts = block.createDiv({ cls: "lubi-block-actions" });
    if (pending) iconButton(acts, "check", "\u786E\u8BA4\uFF1A\u65F6\u95F4\u4E0E\u8BA1\u5212\u4E00\u81F4", async () => {
      try {
        await plugin.journal.update(date, row.line, confirmed(r));
      } catch (e) {
        new import_obsidian7.Notice(e.message, 6e3);
      }
      rerender();
    });
    iconButton(acts, "pencil", "\u7F16\u8F91", () => openEdit(row));
    iconButton(acts, "copy", "\u590D\u5236\u5230\u660E\u5929", async () => {
      const copy = { ...r, date: plugin.shiftDate(date, 1), task: void 0, extra: { ...r.extra } };
      try {
        await addRecordAsDone(plugin, copy);
        new import_obsidian7.Notice(`\u5DF2\u590D\u5236\u5230 ${copy.date}`);
      } catch (e) {
        new import_obsidian7.Notice(e.message);
      }
    });
    iconButton(acts, "trash-2", "\u5220\u9664", () => void deleteRecord(plugin, date, row, rerender));
    const live = (s) => {
      block.style.top = `${s.start * PX_PER_MIN}px`;
      block.style.height = `${Math.max(s.minutes * PX_PER_MIN, 18) - 2}px`;
      timeEl.setText(`${minToHM(s.start)}\u2013${minToHM(s.start + s.minutes)}`);
      durEl.setText(fmtDuration(s.minutes));
      hover.style.top = `${s.start * PX_PER_MIN}px`;
      hoverLabel.setText(`${minToHM(s.start)} \u2013 ${minToHM(s.start + s.minutes)}`);
      hover.addClass("is-on");
    };
    const bind = (target, mode) => {
      target.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".lubi-block-actions")) return;
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
          }
        });
      });
    };
    if (invalid) {
      block.addEventListener("click", (e) => {
        if (!e.target.closest(".lubi-block-actions")) openEdit(row);
      });
    } else {
      bind(block, "move");
      bind(block.querySelector(".lubi-block-handle.is-top"), "resize-start");
      bind(block.querySelector(".lubi-block-handle.is-bottom"), "resize-end");
    }
  }
  const gaps = blackHoles(timed.map((row) => row.rec), date);
  for (const g of gaps) {
    const gap = canvas.createDiv({ cls: "lubi-gap" });
    gap.style.top = `${g.start * PX_PER_MIN + 1}px`;
    gap.style.height = `${g.minutes * PX_PER_MIN - 2}px`;
    const fill = gap.createEl("button", { cls: "lubi-gap-btn", attr: { type: "button", "aria-label": `\u8865\u8BB0\u7A7A\u767D ${minToHM(g.start)}\u2013${minToHM(g.start + g.minutes)}\uFF0C${fmtDuration(g.minutes)}` } });
    icon(fill, "plus", "lubi-icon");
    fill.createSpan({ text: `\u8BB0\u8FD9\u6BB5 \xB7 ${minToHM(g.start)}\u2013${minToHM(g.start + g.minutes)} \xB7 ${fmtDuration(g.minutes)}` });
    fill.addEventListener("pointerdown", (e) => e.stopPropagation());
    fill.addEventListener("click", (e) => {
      stopAll(e);
      openNew({ start: minToHM(g.start), minutes: g.minutes });
    });
  }
  const ghost = canvas.createDiv({ cls: "lubi-block lubi-block-ghost" });
  const ghostLabel = ghost.createDiv({ cls: "lubi-block-head" });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".lubi-block, .lubi-gap-btn, .lubi-plan")) return;
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
        ghostLabel.setText(`${minToHM(s.start)} \u2013 ${minToHM(s.start + s.minutes)} \xB7 ${fmtDuration(s.minutes)}`);
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
      }
    });
  });
  canvas.addEventListener("dblclick", (e) => {
    if (e.target.closest(".lubi-block, .lubi-gap-btn, .lubi-plan")) return;
    const m = Math.round(minuteAt(e.clientY, canvas, PX_PER_MIN) / 15) * 15;
    openNew({ start: minToHM(m) });
  });
  tl.addEventListener("keydown", (e) => {
    if (!selected || e.target !== tl && !e.target.classList.contains("lubi-block")) return;
    const r = selected.row.rec;
    if (invalidTimedSpan(r) && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      new import_obsidian7.Notice("\u8BF7\u5148\u5728\u7F16\u8F91\u8868\u5355\u6821\u5BF9\u8FD9\u6761\u8DE8\u65E5\u8BB0\u5F55\u7684\u65F6\u957F");
      return;
    }
    const s = hmToMin(r.start);
    const step2 = e.altKey ? 1 : 5;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const d = e.key === "ArrowUp" ? -step2 : step2;
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
  if (money.length) {
    const rail = tl.createDiv({ cls: "lubi-tl-rail" });
    for (const row of money) {
      const r = row.rec;
      const cat = categoryOf(plugin.settings, r.category);
      const pin = rail.createEl("button", { cls: "lubi-pin", attr: { type: "button", "aria-label": `${r.start} ${r.category} ${r.title}${r.amount !== void 0 ? `\uFF0C\xA5${r.amount}` : ""}\u3002\u70B9\u51FB\u7F16\u8F91\u3002` } });
      pin.style.top = `${hmToMin(r.start) * PX_PER_MIN}px`;
      pin.style.setProperty("--chip", cat.color);
      icon(pin, cat.icon, "lubi-icon");
      pin.createSpan({ cls: "lubi-pin-title", text: r.title });
      if (r.amount !== void 0) pin.createSpan({ cls: "lubi-pin-amt", text: `\xA5${r.amount}` });
      pin.addEventListener("click", (e) => {
        stopAll(e);
        openEdit(row);
      });
    }
  }
  const firstStart = timed.length ? hmToMin(timed[0].rec.start) : null;
  const targetMin = date === todayStr() ? Math.max(firstStart ?? 0, hmToMin(nowHM()) - 120) : firstStart ?? 6 * 60;
  const targetPx = Math.max(0, Math.round(targetMin * PX_PER_MIN - 16));
  scroller.dataset.scrollTarget = String(targetPx);
  const moreUp = tlWrap.createEl("button", { cls: "lubi-tl-more is-up", attr: { type: "button" } });
  const moreDown = tlWrap.createEl("button", { cls: "lubi-tl-more is-down", attr: { type: "button" } });
  const spans = timed.map((row) => ({ start: hmToMin(row.rec.start), end: Math.min(1440, hmToMin(row.rec.start) + row.rec.minutes) }));
  const scrollToMin = (m) => {
    const top2 = Math.max(0, m * PX_PER_MIN - 24);
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top: top2, behavior: "smooth" });
    else scroller.scrollTop = top2;
  };
  const updateMore = () => {
    const h = scroller.clientHeight;
    const topMin = scroller.scrollTop / PX_PER_MIN;
    const bottomMin = (scroller.scrollTop + h) / PX_PER_MIN;
    const above = h ? spans.filter((x) => x.end <= topMin + 1) : [];
    const below = h ? spans.filter((x) => x.start >= bottomMin - 1) : [];
    moreUp.toggleClass("is-on", above.length > 0);
    moreDown.toggleClass("is-on", below.length > 0);
    moreUp.setText(above.length ? `\u2191 \u66F4\u65E9 ${above.length} \u6761 \xB7 ${minToHM(above[0].start)}\u2013${minToHM(above[above.length - 1].end)}` : "");
    moreDown.setText(below.length ? `\u2193 \u66F4\u665A ${below.length} \u6761 \xB7 ${minToHM(below[0].start)} \u8D77` : "");
    moreUp.onclick = () => above.length && scrollToMin(above[above.length - 1].start);
    moreDown.onclick = () => below.length && scrollToMin(below[0].start);
  };
  scroller.addEventListener("scroll", updateMore, { passive: true });
  window.requestAnimationFrame(() => {
    if (!scroller.dataset.restored) scroller.scrollTop = targetPx;
    updateMore();
  });
  const side = host.createDiv({ cls: "lubi-today-side" });
  renderSummary(plugin, side, rows.map((r) => r.rec), date);
  renderPlanCard(plugin, side, date, planned, openPlans.length, untimedPlans, logPlan, rerender);
  renderGapCard(side, gaps, scrollToMin, openNew);
}
function renderPlanCard(plugin, side, date, planned, openCount, untimed, logPlan, rerender) {
  if (!planned.length) return;
  const card = side.createDiv({ cls: "lubi-card lubi-plan-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", date === todayStr() ? "\u4ECA\u65E5\u8BA1\u5212" : "\u5F53\u5929\u8BA1\u5212");
  const done = planned.length - openCount;
  head.createSpan({ cls: "lubi-muted", text: `${done}/${planned.length} \u5DF2\u505A` });
  const bar = card.createDiv({ cls: "lubi-plan-progress", attr: { role: "meter", "aria-valuemin": "0", "aria-valuemax": String(planned.length), "aria-valuenow": String(done), "aria-label": "\u8BA1\u5212\u5B8C\u6210\u5EA6\uFF08\u5DF2\u5B8C\u6210\u6216\u5DF2\u6709\u8BB0\u5F55\uFF09" } });
  bar.createDiv({ cls: "lubi-plan-progress-fill" }).style.width = `${Math.round(done / planned.length * 100)}%`;
  if (!untimed.length) {
    card.createDiv({ cls: "lubi-muted lubi-plan-note", text: done === planned.length ? "\u90FD\u5B8C\u6210\u4E86\u3002" : "\u5B9A\u4E86\u65F6\u95F4\u7684\u8BA1\u5212\u753B\u5728\u65F6\u95F4\u8F74\u53F3\u4FA7\u7684\u865A\u7EBF\u5217\u91CC\uFF0C\u70B9\u4E00\u4E0B\u5373\u53EF\u8BB0\u5F55\u3002" });
    return;
  }
  card.createDiv({ cls: "lubi-muted lubi-plan-note", text: "\u6CA1\u5B9A\u65F6\u95F4\uFF1A" });
  const list = card.createDiv({ cls: "lubi-plan-list" });
  for (const t of untimed) {
    const cat = categoryOf(plugin.settings, t.category);
    const row = list.createDiv({ cls: "lubi-plan-row" });
    const b = row.createEl("button", { cls: "lubi-plan-row-main", attr: { type: "button" } });
    if (t.category) catDot(b, cat);
    b.createSpan({ cls: "lubi-plan-row-title", text: t.title });
    if (t.estimate) b.createSpan({ cls: "lubi-muted lubi-plan-row-est", text: fmtDuration(t.estimate) });
    tip(b, `\u8BB0\u4E00\u6761\u300C${t.title}\u300D\uFF0C\u4FDD\u5B58\u540E\u4EFB\u52A1\u81EA\u52A8\u5B8C\u6210`);
    b.addEventListener("click", () => logPlan(t));
    iconButton(row, "check", `\u6309\u9884\u8BA1\u65F6\u957F\u76F4\u63A5\u5B8C\u6210\u300C${t.title}\u300D\uFF08\u8BB0\u5F55\u6807\u4E3A\u5F85\u786E\u8BA4\uFF09`, async () => {
      try {
        await plugin.tasks.toggleDone(t.id, date);
        await afterDone(plugin, t, date, void 0, rerender);
      } catch (e) {
        new import_obsidian7.Notice(`\u4EFB\u52A1\u66F4\u65B0\u5931\u8D25\uFF1A${e.message}`, 6e3);
      }
      rerender();
    }, "lubi-plan-row-done");
  }
}
function renderGapCard(side, gaps, scrollTo, openNew) {
  if (!gaps.length) return;
  const card = side.createDiv({ cls: "lubi-card lubi-gap-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "\u7A7A\u767D\u65F6\u6BB5");
  const total = gaps.reduce((s, g) => s + g.minutes, 0);
  head.createSpan({ cls: "lubi-muted", text: `${gaps.length} \u6BB5 \xB7 ${fmtHours(total)}` });
  const list = card.createDiv({ cls: "lubi-gap-list" });
  const top = gaps.slice().sort((a, b) => b.minutes - a.minutes).slice(0, 4).sort((a, b) => a.start - b.start);
  for (const g of top) {
    const row = list.createDiv({ cls: "lubi-gap-row" });
    const jump = row.createEl("button", { cls: "lubi-gap-row-main", attr: { type: "button" } });
    jump.createSpan({ cls: "lubi-gap-row-time", text: `${minToHM(g.start)}\u2013${minToHM(g.start + g.minutes)}` });
    jump.createSpan({ cls: "lubi-muted", text: fmtDuration(g.minutes) });
    tip(jump, "\u5728\u65F6\u95F4\u8F74\u4E0A\u5B9A\u4F4D");
    jump.addEventListener("click", () => scrollTo(g.start));
    iconButton(row, "plus", `\u8865\u8BB0 ${minToHM(g.start)}\u2013${minToHM(g.start + g.minutes)}`, () => openNew({ start: minToHM(g.start), minutes: g.minutes }), "lubi-gap-row-add");
  }
  if (gaps.length > top.length) card.createDiv({ cls: "lubi-muted lubi-plan-note", text: `\u53E6\u6709 ${gaps.length - top.length} \u6BB5\u8F83\u77ED\u7684\u7A7A\u767D` });
}
function blackHoles(recs, date, minGap = 30) {
  const today = todayStr();
  const limit = date < today ? 1440 : date === today ? hmToMin(nowHM()) : 0;
  if (limit <= 0) return [];
  const spans = recs.filter((r) => r.minutes > 0 && !invalidTimedSpan(r)).map((r) => [hmToMin(r.start), Math.min(1440, hmToMin(r.start) + r.minutes)]).sort((a, b) => a[0] - b[0]);
  const out = [];
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
function layoutLanes(rows) {
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const placed = [];
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
function renderSummary(plugin, side, recs, date) {
  const card = side.createDiv({ cls: "lubi-card" });
  el(card, "h3", "lubi-panel-title", date === todayStr() ? "\u4ECA\u65E5\u5206\u5E03" : `${shortDate(date)} \u5206\u5E03`);
  const byCat = /* @__PURE__ */ new Map();
  let total = 0;
  for (const r of recs) {
    if (r.minutes <= 0) continue;
    byCat.set(r.category, (byCat.get(r.category) || 0) + r.minutes);
    total += r.minutes;
  }
  if (!total) {
    card.createDiv({ cls: "lubi-muted", text: "\u8BB0\u5F55\u540E\u8FD9\u91CC\u4F1A\u663E\u793A\u65F6\u95F4\u53BB\u5411\u3002" });
  } else {
    const wrap = card.createDiv({ cls: "lubi-donut-wrap" });
    const slices = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ label: name, value: v, color: categoryOf(plugin.settings, name).color }));
    const covered = dayTimeStats(recs).coveredMinutes;
    donut(wrap, slices, fmtHours(total), `\u8986\u76D6 ${Math.round(covered / 1440 * 100)}%`);
    const list = wrap.createDiv({ cls: "lubi-legend" });
    for (const s of slices) {
      const li = list.createDiv({ cls: "lubi-legend-row lubi-legend-bar" });
      li.style.setProperty("--pct", `${Math.round(s.value / total * 100)}%`);
      li.style.setProperty("--dot", s.color);
      catDot(li, categoryOf(plugin.settings, s.label));
      li.createSpan({ cls: "lubi-legend-name", text: s.label });
      li.createSpan({ cls: "lubi-legend-val", text: fmtHours(s.value) });
      li.createSpan({ cls: "lubi-muted lubi-legend-pct", text: `${Math.round(s.value / total * 100)}%` });
    }
  }
  const spend = recs.filter((r) => r.amount !== void 0 && !isNaN(r.amount));
  if (spend.length) {
    const sum2 = spend.reduce((s, r) => s + (r.amount || 0), 0);
    const row = card.createDiv({ cls: "lubi-kv" });
    row.createSpan({ text: date === todayStr() ? "\u4ECA\u65E5\u652F\u51FA" : `${shortDate(date)} \u652F\u51FA` });
    row.createSpan({ cls: "lubi-kv-val", text: `\xA5${sum2.toFixed(2)} \xB7 ${spend.length} \u7B14` });
  }
}
function renderOnboarding(plugin, host, onAdd) {
  const box = host.createDiv({ cls: "lubi-onboard" });
  const head = box.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "\u4E09\u6B65\u4E0A\u624B");
  iconButton(head, "x", "\u4E0D\u518D\u663E\u793A", async () => {
    plugin.settings.onboardingDone = true;
    await plugin.saveSettings();
    box.remove();
  }, "lubi-push-right");
  const steps = box.createDiv({ cls: "lubi-steps" });
  const step2 = (n, t, d) => {
    const s = steps.createDiv({ cls: "lubi-step" });
    s.createSpan({ cls: "lubi-step-n", text: n });
    const b = s.createDiv();
    b.createDiv({ cls: "lubi-step-t", text: t });
    b.createDiv({ cls: "lubi-muted", text: d });
  };
  step2("1", "\u505A\u5B8C\u4E00\u4EF6\u4E8B\u5C31\u8BB0\u4E00\u6761", "\u5199\u505A\u4E86\u4EC0\u4E48\u3001\u4ECE\u51E0\u70B9\u5F00\u59CB\u3001\u7528\u4E86\u591A\u4E45\u3002\u65F6\u95F4\u8F74\u4E0A\u7559\u767D\u7684\u5730\u65B9\uFF0C\u5C31\u662F\u65F6\u95F4\u9ED1\u6D1E\u3002");
  step2("2", "\u56DE\u987E\u9875\u770B\u65F6\u95F4\u53BB\u5411", "\u6309\u5468 / \u6708\u6C47\u603B\u6BCF\u4E2A\u5206\u7C7B\u7684\u5C0F\u65F6\u6570\uFF0C\u8FD9\u662F\u67F3\u6BD4\u6B47\u592B\u6CD5\u7684\u6838\u5FC3\uFF1A\u6708\u672B\u7B97\u8D26\u3002");
  step2("3", "\u4EFB\u52A1\u9875\u5B89\u6392\u660E\u5929", "\u628A\u5F85\u529E\u62D6\u5230\u65E5\u7A0B\u8868\u4E0A\uFF1B\u52FE\u6389\u4E00\u4E2A\u4EFB\u52A1\uFF0C\u65F6\u95F4\u8F74\u4E0A\u5C31\u81EA\u52A8\u8BB0\u4E0B\u8FD9\u6BB5\u65F6\u95F4\u3002");
  button(box, "\u8BB0\u7B2C\u4E00\u6761", onAdd, { primary: true, icon: "plus" });
}

// src/ui/review.ts
async function renderReview(plugin, host, state, setState) {
  host.empty();
  host.addClass("lubi-review");
  const { from, to, label, buckets } = range(state);
  const bar = host.createDiv({ cls: "lubi-toolbar" });
  segmented(bar, [
    { id: "week", label: "\u5468" },
    { id: "month", label: "\u6708" },
    { id: "year", label: "\u5E74" }
  ], state.period, (p) => setState({ period: p }));
  const nav = bar.createDiv({ cls: "lubi-nav" });
  iconButton(nav, "chevron-left", "\u4E0A\u4E00\u4E2A", () => setState({ anchor: step(state, -1) }));
  nav.createSpan({ cls: "lubi-nav-label", text: label });
  iconButton(nav, "chevron-right", "\u4E0B\u4E00\u4E2A", () => setState({ anchor: step(state, 1) }));
  const todayBtn = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm", text: "\u672C\u671F" });
  todayBtn.addEventListener("click", () => setState({ anchor: todayStr() }));
  const existing = new Set(plugin.journal.dates());
  const dates = eachDate(from, to).filter((d) => existing.has(d));
  const data = await plugin.journal.readRange(dates);
  const all = [];
  for (const recs of data.values()) all.push(...recs);
  const timed = all.filter((r) => r.minutes > 0);
  const total = timed.reduce((s, r) => s + r.minutes, 0);
  const dailyStats = new Map([...data].map(([date, recs]) => [date, dayTimeStats(recs)]));
  const invalidDates = [...dailyStats].filter(([, stats]) => stats.invalidCount).map(([date]) => date).sort();
  if (!timed.length && !all.length) {
    emptyState(host, "calendar-search", `${label} \u6CA1\u6709\u8BB0\u5F55`, "\u5207\u6362\u5468\u671F\uFF0C\u6216\u56DE\u5230\u6BCF\u65E5\u9875\u8865\u8BB0\u3002");
    return;
  }
  const previous = range({ period: state.period, anchor: step(state, -1) });
  const oldDates = eachDate(previous.from, previous.to).filter((date) => existing.has(date));
  const oldData = await plugin.journal.readRange(oldDates);
  const oldTimed = [...oldData.values()].flat().filter((rec) => rec.minutes > 0);
  const oldDays = new Set(oldTimed.map((rec) => rec.date)).size;
  const oldInvalid = [...oldData.values()].some((recs) => dayTimeStats(recs).invalidCount);
  const oldTotal = oldTimed.reduce((sum2, rec) => sum2 + rec.minutes, 0);
  const daysLogged = new Set(timed.map((r) => r.date)).size;
  const spend = all.filter((r) => r.amount !== void 0 && !isNaN(r.amount));
  const kpis = host.createDiv({ cls: "lubi-kpis lubi-kpis-v2" });
  const primary = kpi(kpis, "\u8BB0\u5F55\u603B\u65F6\u957F", fmtHours(total), void 0, "is-primary");
  const minDays = state.period === "week" ? 2 : state.period === "month" ? 5 : 14;
  if (!invalidDates.length && !oldInvalid && oldTotal > 0 && daysLogged >= minDays && oldDays >= minDays) {
    const pct = Math.round((total - oldTotal) / oldTotal * 100);
    const delta = primary.createDiv({ cls: `lubi-kpi-delta ${pct >= 0 ? "is-up" : "is-down"}` });
    delta.createSpan({ text: `${pct >= 0 ? "\u2191" : "\u2193"} ${Math.abs(pct)}%` });
    delta.createSpan({ cls: "lubi-muted", text: ` \u8F83\u4E0A\u4E00\u671F ${fmtHours(oldTotal)}` });
  } else {
    primary.createDiv({ cls: "lubi-muted lubi-kpi-sub", text: invalidDates.length ? "\u6709\u5F85\u6821\u5BF9\u7684\u5F02\u5E38\u65E5\uFF0C\u6682\u4E0D\u505A\u73AF\u6BD4" : "\u4E0A\u4E00\u671F\u8BB0\u5F55\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u505A\u73AF\u6BD4" });
  }
  const pendingRecs = timed.filter((r) => isPending(r));
  if (pendingRecs.length) {
    const pm = pendingRecs.reduce((sum2, r) => sum2 + r.minutes, 0);
    const note = primary.createDiv({ cls: "lubi-kpi-pending" });
    note.setText(`\u5176\u4E2D ${fmtHours(pm)} \u6309\u8BA1\u5212\u4F30\u8BA1 \xB7 ${pendingRecs.length} \u6761\u5F85\u786E\u8BA4`);
    tip(note, "\u52FE\u9009\u4EFB\u52A1\u65F6\u6309\u8BA1\u5212\u65F6\u95F4 / \u9884\u8BA1\u65F6\u957F\u81EA\u52A8\u751F\u6210\u7684\u8BB0\u5F55\u3002\u5728\u6BCF\u65E5\u9875\u62D6\u5230\u5B9E\u9645\u65F6\u95F4\u6216\u70B9 \u2713 \u786E\u8BA4\u540E\u8BA1\u5165\u5B9E\u9645\u3002");
  }
  const secondary = kpis.createDiv({ cls: "lubi-kpi-grid" });
  kpi(secondary, "\u6709\u8BB0\u5F55\u7684\u5929\u6570", `${daysLogged} / ${eachDate(from, to).filter((d) => d <= todayStr()).length}`);
  if (invalidDates.length) {
    const validDays = [...dailyStats].filter(([, st]) => !st.invalidCount && st.recordedMinutes > 0);
    const validAvg = validDays.length ? validDays.reduce((sum2, [, st]) => sum2 + st.recordedMinutes, 0) / validDays.length : 0;
    kpi(secondary, "\u6709\u6548\u65E5\u5747", validDays.length ? fmtHours(validAvg) : "\u2014", `\u5254\u9664 ${invalidDates.length} \u4E2A\u5F85\u6821\u5BF9\u5F02\u5E38\u65E5\u540E\u8BA1\u7B97`);
  } else {
    kpi(secondary, "\u65E5\u5747\u8BB0\u5F55", daysLogged ? fmtHours(total / daysLogged) : "\u2014", "\u6709\u8BB0\u5F55\u7684\u5929");
  }
  const coveredTotal = [...dailyStats.values()].reduce((sum2, stats) => sum2 + stats.coveredMinutes, 0);
  kpi(secondary, "\u8986\u76D6\u7387", daysLogged ? `${Math.round(coveredTotal / (daysLogged * 1440) * 100)}%` : "\u2014", "\u6709\u8BB0\u5F55\u65E5\u7684\u533A\u95F4\u5E76\u96C6 / 24h");
  kpi(secondary, "\u652F\u51FA", spend.length ? `\xA5${spend.reduce((s2, r) => s2 + (r.amount || 0), 0).toFixed(0)}` : "\xA50", spend.length ? `${spend.length} \u7B14` : "\u672C\u671F\u6CA1\u6709\u652F\u51FA");
  if (invalidDates.length) {
    const warning = host.createDiv({ cls: "lubi-data-warning is-compact", attr: { role: "status" } });
    icon(warning, "triangle-alert", "lubi-icon lubi-warning-icon");
    warning.createSpan({ cls: "lubi-warning-text", text: `${invalidDates.length} \u5929\u6709\u8DE8\u51FA\u5F53\u65E5\u7684\u8BB0\u5F55\uFF0C\u7EDF\u8BA1\u6309\u65E5\u8FB9\u754C\u622A\u65AD\u3002` });
    let links;
    if (invalidDates.length > 5) {
      const details = warning.createEl("details");
      details.createEl("summary", { text: `\u5C55\u5F00 ${invalidDates.length} \u4E2A\u5F85\u6821\u5BF9\u65E5\u671F` });
      links = details.createDiv({ cls: "lubi-data-warning-links" });
    } else links = warning.createDiv({ cls: "lubi-data-warning-links" });
    for (const date of invalidDates) button(links, `\u6821\u5BF9 ${date}`, () => plugin.openDate(date), { cls: "lubi-btn-sm" });
  } else {
    const insight = host.createDiv({ cls: "lubi-insight", attr: { role: "status" } });
    if (daysLogged >= minDays && oldDays >= minDays && !oldInvalid) {
      const currentAvg = total / daysLogged;
      const oldAvg = oldTotal / oldDays;
      const change = currentAvg - oldAvg;
      insight.createSpan({ text: `\u6709\u8BB0\u5F55\u65E5\u7684\u65E5\u5747 ${fmtHours(currentAvg)}\uFF0C\u8F83\u4E0A\u4E00\u671F${change >= 0 ? "\u591A" : "\u5C11"} ${fmtHours(Math.abs(change))}\u3002\u4EC5\u6BD4\u8F83\u6709\u8BB0\u5F55\u7684\u5929\uFF0C\u4E0D\u4EE3\u8868\u6548\u7387\u597D\u574F\u3002` });
    } else {
      insight.createSpan({ text: `\u672C\u671F\u5DF2\u8BB0\u5F55 ${daysLogged} \u5929\uFF1B\u4E24\u671F\u5404\u6709\u81F3\u5C11 ${minDays} \u5929\u6709\u6548\u8BB0\u5F55\u65F6\uFF0C\u624D\u663E\u793A\u6709\u4F9D\u636E\u7684\u8D8B\u52BF\u5BF9\u6BD4\u3002` });
    }
  }
  const catOrder = plugin.settings.categories.map((c) => c.name);
  const isRest = (c) => !!categoryOf(plugin.settings, c).rest;
  const cats = [...new Set(timed.map((r) => r.category))].sort((a, b) => {
    if (isRest(a) !== isRest(b)) return isRest(a) ? -1 : 1;
    const ia = catOrder.indexOf(a);
    const ib = catOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const chart = host.createDiv({ cls: "lubi-card lubi-chart-card" });
  const chartHead = chart.createDiv({ cls: "lubi-panel-head" });
  el(chartHead, "h3", "lubi-panel-title", state.period === "year" ? "\u6BCF\u6708\u8BB0\u5F55\u65F6\u957F" : "\u6BCF\u65E5\u8BB0\u5F55\u65F6\u957F");
  segmented(chartHead, [{ id: "chart", label: "\u56FE\u8868" }, { id: "table", label: "\u8868\u683C" }], state.display || "chart", (display) => setState({ display })).addClass("lubi-chart-mode");
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
    g.style.bottom = `${t / cap * 100}%`;
    g.createSpan({ cls: "lubi-chart-tick", text: fmtHours(t) });
  }
  const loggedBuckets = bucketTotals.filter((v, i) => v > 0 && !bucketStats[i].invalid).map((v) => Math.min(v, cap));
  if (loggedBuckets.length > 1) {
    const avg = loggedBuckets.reduce((s, v) => s + v, 0) / loggedBuckets.length;
    const a = gridEl.createDiv({ cls: "lubi-chart-avg" });
    a.style.bottom = `${Math.min(100, avg / cap * 100)}%`;
    a.createSpan({ cls: "lubi-chart-avg-label", text: `${invalidDates.length ? "\u6709\u6548\u65E5\u5747" : "\u5747"} ${fmtHours(avg)}` });
  }
  const bars = chartBox.createDiv({ cls: "lubi-bars" });
  const today = todayStr();
  buckets.forEach((b, i) => {
    const recs = b.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0);
    const bt = bucketTotals[i];
    const isFuture = b.dates[0] > today;
    const stats = bucketStats[i];
    const col = bars.createEl("button", { cls: `lubi-bar-col ${b.dates.includes(today) ? "is-today" : ""} ${isFuture ? "is-future" : ""} ${bt ? "" : "is-empty"}`.trim(), attr: { type: "button" } });
    col.createSpan({ cls: "lubi-sr-only", text: `${b.label}\uFF0C\u8BB0\u5F55 ${fmtHours(bt)}\uFF0C\u8986\u76D6 ${fmtHours(stats.covered)}${stats.invalid ? "\uFF0C\u5B58\u5728\u5F85\u6821\u5BF9\u8BB0\u5F55" : stats.overlap ? `\uFF0C\u5E76\u884C ${fmtDuration(stats.overlap)}` : ""}\u3002\u6309\u56DE\u8F66\u67E5\u770B` });
    col.dataset.idx = String(i);
    const stack = col.createDiv({ cls: "lubi-bar-stack" });
    const over = bt > cap + 1;
    stack.style.height = `${Math.min(100, bt / cap * 100)}%`;
    if (bt) {
      for (const c of cats) {
        const v = sum(recs, c);
        if (!v) continue;
        const seg = stack.createDiv({ cls: `lubi-bar-seg ${isRest(c) ? "is-rest" : ""}`.trim() });
        seg.style.flexBasis = `${v / bt * 100}%`;
        seg.style.setProperty("--chip", categoryOf(plugin.settings, c).color);
        seg.style.background = categoryOf(plugin.settings, c).color;
      }
      const val = stack.createDiv({ cls: "lubi-bar-val", text: fmtHours(bt) });
      if (stats.invalid) {
        val.addClass("is-over");
        val.setText(`\u26A0 ${fmtHours(bt)}`);
        stack.addClass("is-over");
      } else if (over) {
        val.addClass("is-parallel");
        val.setText(`\u2225 ${fmtHours(bt)}`);
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
    const head = isYear ? b.label : `\u5468${weekdayZh(b.dates[0])} ${shortDate(b.dates[0])}`;
    if (!bt) return [`${head} \xB7 \u6CA1\u6709\u8BB0\u5F55`];
    const rows = [`${head} \xB7 ${fmtHours(bt)}`];
    const stats = bucketStats[i];
    if (stats.invalid) rows.push("\u26A0 \u6709\u8BB0\u5F55\u8DE8\u51FA\u5F53\u5929\uFF0C\u70B9\u51FB\u540E\u6821\u5BF9");
    else if (bt > cap + 1 && !isYear) rows.push("\u2225 \u6709\u5E76\u884C\u8BB0\u5F55\uFF0C\u67F1\u9AD8\u5DF2\u622A\u65AD");
    rows.push(`\u5B9E\u9645\u8986\u76D6 ${fmtHours(stats.covered)}${stats.overlap ? ` \xB7 \u5E76\u884C ${fmtDuration(stats.overlap)}` : ""}`);
    for (const c of cats) {
      const v = sum(recs, c);
      if (!v) continue;
      const line = document.createElement("div");
      line.className = "lubi-tip-row";
      const d = document.createElement("span");
      d.className = "lubi-dot";
      d.style.setProperty("--dot", categoryOf(plugin.settings, c).color);
      line.append(d, `${c} ${fmtHours(v)}`, ` \xB7 ${Math.round(v / bt * 100)}%`);
      rows.push(line);
    }
    return rows;
  });
  const tableWrap = chart.createDiv({ cls: "lubi-review-table-wrap" });
  tableWrap.hidden = state.display !== "table";
  const table = tableWrap.createEl("table", { cls: "lubi-review-table" });
  table.createEl("caption", { text: `${label} \xB7 \u6309\u65E5\u671F\u4E0E\u5206\u7C7B\u7684\u8BB0\u5F55\u65F6\u957F` });
  const header = table.createEl("thead").createEl("tr");
  for (const title of ["\u65E5\u671F", "\u8BB0\u5F55", "\u8986\u76D6", ...cats, "\u6821\u5BF9"]) header.createEl("th", { text: title, attr: { scope: "col" } });
  const tbody = table.createEl("tbody");
  buckets.forEach((bucket, i) => {
    const row = tbody.createEl("tr");
    const day = row.createEl("th", { attr: { scope: "row" } });
    const open = day.createEl("button", { cls: "lubi-table-link", text: bucket.label, attr: { type: "button" } });
    open.addEventListener("click", () => state.period === "year" ? setState({ period: "month", anchor: bucket.dates[0] }) : plugin.openDate(bucket.dates[0]));
    row.createEl("td", { text: fmtHours(bucketTotals[i]) });
    row.createEl("td", { text: fmtHours(bucketStats[i].covered) });
    const recs = bucket.dates.flatMap((d) => data.get(d) || []).filter((r) => r.minutes > 0);
    for (const cat of cats) row.createEl("td", { text: sum(recs, cat) ? fmtHours(sum(recs, cat)) : "\u2014" });
    const issues = row.createEl("td");
    const flagged = bucket.dates.filter((date) => dailyStats.get(date)?.invalidCount);
    if (!flagged.length) issues.setText("\u2014");
    else for (const date of flagged) {
      const fix = issues.createEl("button", { cls: "lubi-table-link", text: date, attr: { type: "button", "aria-label": `\u6821\u5BF9 ${date} \u7684\u8DE8\u65E5\u8BB0\u5F55` } });
      fix.addEventListener("click", () => plugin.openDate(date));
    }
  });
  if (isYear) renderHeatmap(plugin, host, from, to, dailyStats);
  const grid = host.createDiv({ cls: "lubi-review-grid" });
  const byCat = grid.createDiv({ cls: "lubi-card" });
  el(byCat, "h3", "lubi-panel-title", "\u6309\u5206\u7C7B");
  for (const c of cats) {
    const v = sum(timed, c);
    const row = byCat.createDiv({ cls: "lubi-row-bar" });
    const head = row.createDiv({ cls: "lubi-row-bar-head" });
    catDot(head, categoryOf(plugin.settings, c));
    head.createSpan({ cls: "lubi-legend-name", text: c });
    head.createSpan({ cls: "lubi-legend-val", text: fmtHours(v) });
    head.createSpan({ cls: "lubi-muted lubi-legend-pct", text: `${Math.round(v / total * 100)}%` });
    const track = row.createDiv({ cls: "lubi-track" });
    const fill = track.createDiv({ cls: "lubi-fill" });
    fill.style.width = `${v / total * 100}%`;
    fill.style.background = categoryOf(plugin.settings, c).color;
  }
  const top = grid.createDiv({ cls: "lubi-card" });
  el(top, "h3", "lubi-panel-title", "\u4E8B\u9879 Top 10");
  const byTitle = /* @__PURE__ */ new Map();
  for (const r of timed) {
    const k = `${r.category}\xB7${r.title}`;
    const cur = byTitle.get(k) || { min: 0, n: 0, cat: r.category };
    cur.min += r.minutes;
    cur.n++;
    byTitle.set(k, cur);
  }
  const ranked = [...byTitle.entries()].sort((a, b) => b[1].min - a[1].min).slice(0, 10);
  const topMax = ranked.length ? ranked[0][1].min : 1;
  for (const [k, v] of ranked) {
    const row = top.createDiv({ cls: "lubi-legend-row lubi-legend-bar" });
    row.style.setProperty("--pct", `${Math.round(v.min / topMax * 100)}%`);
    row.style.setProperty("--dot", categoryOf(plugin.settings, v.cat).color);
    catDot(row, categoryOf(plugin.settings, v.cat));
    row.createSpan({ cls: "lubi-legend-name", text: k.split("\xB7").slice(1).join("\xB7") });
    row.createSpan({ cls: "lubi-muted", text: `${v.n} \u6B21` });
    row.createSpan({ cls: "lubi-legend-val", text: fmtHours(v.min) });
  }
  if (spend.length) {
    const sp = grid.createDiv({ cls: "lubi-card" });
    el(sp, "h3", "lubi-panel-title", "\u652F\u51FA");
    const byType = /* @__PURE__ */ new Map();
    for (const r of spend) byType.set(r.expenseType || "\u5176\u4ED6", (byType.get(r.expenseType || "\u5176\u4ED6") || 0) + (r.amount || 0));
    const totalSpend = [...byType.values()].reduce((s, v) => s + v, 0);
    for (const [t, v] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      const row = sp.createDiv({ cls: "lubi-row-bar" });
      const head = row.createDiv({ cls: "lubi-row-bar-head" });
      head.createSpan({ cls: "lubi-legend-name", text: t });
      head.createSpan({ cls: "lubi-legend-val", text: `\xA5${v.toFixed(2)}` });
      head.createSpan({ cls: "lubi-muted lubi-legend-pct", text: totalSpend ? `${Math.round(v / totalSpend * 100)}%` : "\u2014" });
      const track = row.createDiv({ cls: "lubi-track" });
      const fill = track.createDiv({ cls: "lubi-fill" });
      fill.style.width = `${totalSpend ? Math.max(0, Math.min(100, v / totalSpend * 100)) : 0}%`;
    }
    const list = sp.createDiv({ cls: "lubi-spend-list" });
    for (const r of spend.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).reverse().slice(0, 30)) {
      const row = list.createDiv({ cls: "lubi-legend-row" });
      row.createSpan({ cls: "lubi-muted", text: `${shortDate(r.date)} ${r.start}` });
      row.createSpan({ cls: "lubi-legend-name", text: r.title });
      row.createSpan({ cls: "lubi-muted", text: r.expenseType || "" });
      row.createSpan({ cls: "lubi-legend-val", text: `\xA5${(r.amount || 0).toFixed(2)}` });
    }
  }
}
function niceTicks(cap) {
  const hours = cap / 60;
  const step2 = hours <= 40 ? 10 : hours <= 100 ? 25 : hours <= 200 ? 50 : 100;
  const out = [];
  for (let h = step2; h * 60 <= cap; h += step2) out.push(h * 60);
  return out;
}
function kpi(parent, label, value, sub, cls = "") {
  const k = parent.createDiv({ cls: `lubi-kpi ${cls}`.trim() });
  k.createDiv({ cls: "lubi-kpi-label", text: label });
  k.createDiv({ cls: "lubi-kpi-value", text: value });
  if (sub) k.createDiv({ cls: "lubi-muted lubi-kpi-sub", text: sub });
  return k;
}
function renderHeatmap(plugin, host, from, to, dailyStats) {
  const card = host.createDiv({ cls: "lubi-card lubi-heat-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "\u5168\u5E74\u8986\u76D6");
  head.createSpan({ cls: "lubi-muted", text: "\u989C\u8272\u8D8A\u6DF1 = \u5F53\u5929\u8BB0\u5F55\u8986\u76D6\u8D8A\u591A" });
  const legend = head.createDiv({ cls: "lubi-heat-legend lubi-push-right" });
  legend.createSpan({ cls: "lubi-muted", text: "\u5C11" });
  for (let lv = 0; lv <= 4; lv++) legend.createSpan({ cls: `lubi-heat-cell lv-${lv}` });
  legend.createSpan({ cls: "lubi-muted", text: "\u591A" });
  const scroll = card.createDiv({ cls: "lubi-heat-scroll" });
  const grid = scroll.createDiv({ cls: "lubi-heat", attr: { role: "grid", "aria-label": "\u5168\u5E74\u6BCF\u65E5\u8986\u76D6\u7387" } });
  const first = weekStart(from);
  const today = todayStr();
  const allDays = eachDate(first, to);
  const weeks = Math.ceil(allDays.length / 7);
  grid.style.setProperty("--weeks", String(weeks));
  for (let w = 0; w < weeks; w++) {
    const label = grid.createDiv({ cls: "lubi-heat-month" });
    label.style.gridColumn = String(w + 2);
    const week = allDays.slice(w * 7, w * 7 + 7).filter((d) => d >= from && d <= to);
    const first2 = week.find((d) => d.endsWith("-01")) || (w === 0 || week[0] === from ? week[0] : "");
    if (first2) label.setText(`${Number(first2.slice(5, 7))}\u6708`);
  }
  ["\u4E00", "", "\u4E09", "", "\u4E94", "", "\u65E5"].forEach((t, i) => {
    const l = grid.createDiv({ cls: "lubi-heat-dow", text: t });
    l.style.gridRow = String(i + 2);
  });
  allDays.forEach((d, i) => {
    const cell = grid.createDiv({ cls: "lubi-heat-cell" });
    cell.style.gridColumn = String(Math.floor(i / 7) + 2);
    cell.style.gridRow = String(i % 7 + 2);
    if (d < from || d > to) {
      cell.addClass("is-out");
      return;
    }
    const st = dailyStats.get(d);
    const ratio = st ? st.coveredMinutes / 1440 : 0;
    const lv = !st ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4;
    cell.addClass(`lv-${lv}`);
    if (st?.invalidCount) cell.addClass("is-invalid");
    if (d === today) cell.addClass("is-today");
    if (d > today) cell.addClass("is-future");
    cell.dataset.date = d;
    tip(cell, `${d} \u5468${weekdayZh(d)} \xB7 ${st ? `\u8986\u76D6 ${Math.round(ratio * 100)}%` : "\u6CA1\u6709\u8BB0\u5F55"}${st?.invalidCount ? " \xB7 \u5F85\u6821\u5BF9" : ""}`);
  });
  grid.addEventListener("click", (e) => {
    const d = e.target.closest(".lubi-heat-cell")?.dataset.date;
    if (d) plugin.openDate(d);
  });
}
function sum(recs, cat) {
  return recs.reduce((s, r) => s + (r.category === cat ? r.minutes : 0), 0);
}
function range(state) {
  const a = state.anchor;
  if (state.period === "week") {
    const from = weekStart(a);
    const to = shiftDate(from, 6);
    return {
      from,
      to,
      label: `${shortDate(from)} \u2013 ${shortDate(to)}`,
      buckets: eachDate(from, to).map((d) => ({ key: d, label: `${weekdayZh(d)} ${shortDate(d)}`, dates: [d] }))
    };
  }
  if (state.period === "month") {
    const from = monthStart(a);
    const to = monthEnd(a);
    return {
      from,
      to,
      label: `${a.slice(0, 4)} \u5E74 ${Number(a.slice(5, 7))} \u6708`,
      buckets: eachDate(from, to).map((d) => ({ key: d, label: String(Number(d.slice(8, 10))), dates: [d] }))
    };
  }
  const y = a.slice(0, 4);
  const buckets = [];
  for (let m = 1; m <= 12; m++) {
    const ms = `${y}-${String(m).padStart(2, "0")}-01`;
    buckets.push({ key: ms, label: `${m}\u6708`, dates: eachDate(ms, monthEnd(ms)) });
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} \u5E74`, buckets };
}
function step(state, dir) {
  if (state.period === "week") return shiftDate(state.anchor, 7 * dir);
  const d = parseDate(state.anchor);
  if (state.period === "month") d.setMonth(d.getMonth() + dir, 1);
  else d.setFullYear(d.getFullYear() + dir, 0, 1);
  return dateStr(d);
}

// src/ui/tasks.ts
var import_obsidian8 = require("obsidian");
var SNAP = 15;
async function updateScheduleWithUndo(plugin, id, patch, message, rerender) {
  const task = plugin.tasks.byId(id);
  if (!task) {
    new import_obsidian8.Notice("\u4EFB\u52A1\u5DF2\u4E0D\u5B58\u5728\uFF0C\u65E0\u6CD5\u8C03\u6574");
    return;
  }
  const keys = Object.keys(patch);
  const original = { date: task.date, start: task.start, estimate: task.estimate, startDate: task.startDate, endDate: task.endDate };
  const changed = keys.filter((key) => original[key] !== patch[key]);
  if (!changed.length) {
    rerender();
    return;
  }
  const written = { ...original, ...patch };
  try {
    await plugin.tasks.upsert({ ...task, ...patch });
    undoNotice(message, async () => {
      const latest = plugin.tasks.byId(id);
      if (!latest) {
        new import_obsidian8.Notice("\u4EFB\u52A1\u5DF2\u5220\u9664\uFF0C\u65E0\u6CD5\u64A4\u9500");
        return;
      }
      const restored = {};
      let conflicts = 0;
      for (const key of changed) {
        if (latest[key] === written[key]) Object.assign(restored, { [key]: original[key] });
        else conflicts++;
      }
      if (!Object.keys(restored).length) {
        new import_obsidian8.Notice("\u4EFB\u52A1\u7684\u6392\u671F\u5DF2\u518D\u6B21\u4FEE\u6539\uFF0C\u672A\u8986\u76D6\u65B0\u4FEE\u6539");
        return;
      }
      try {
        await plugin.tasks.upsert({ ...latest, ...restored });
        if (conflicts) new import_obsidian8.Notice("\u5DF2\u64A4\u9500\u672A\u518D\u6B21\u4FEE\u6539\u7684\u6392\u671F\u5B57\u6BB5\uFF1B\u5176\u4ED6\u4FEE\u6539\u5DF2\u4FDD\u7559");
        rerender();
      } catch (e) {
        new import_obsidian8.Notice(`\u64A4\u9500\u5931\u8D25\uFF1A${e.message}`, 6e3);
      }
    });
    rerender();
  } catch (e) {
    new import_obsidian8.Notice(`\u8C03\u6574\u5931\u8D25\uFF1A${e.message}`, 6e3);
    rerender();
  }
}
function renderTasks(plugin, host, date, state, rerender) {
  host.empty();
  host.addClass("lubi-tasks");
  const openNew = (d, onRec) => new RecordModal(plugin.app, plugin, { date, defaults: d, onSaved: async (rec) => {
    if (rec && onRec) await onRec(rec);
    rerender();
  } }).open();
  const edit = (t) => new TaskModal(plugin.app, plugin, { task: t, onSaved: rerender }).open();
  const create = (defaults = {}) => new TaskModal(plugin.app, plugin, { defaults, onSaved: rerender }).open();
  const top = host.createDiv({ cls: "lubi-tasks-top" });
  const lists = top.createDiv({ cls: "lubi-tasks-left" });
  renderLists(plugin, lists, date, rerender, openNew, edit, create);
  const agendaHost = lists.createDiv({ cls: "lubi-agenda-host" });
  renderAgenda(plugin, agendaHost, state, rerender, edit);
  const inbox = lists.querySelectorAll(".lubi-list-card")[1];
  if (inbox) lists.insertBefore(agendaHost, inbox);
  renderWeek(plugin, top.createDiv({ cls: "lubi-tasks-week" }), date, state, rerender, edit);
  renderProjects(plugin, host.createDiv({ cls: "lubi-tasks-projects" }), state, rerender, edit, create);
}
function renderLists(plugin, host, date, rerender, openNew, edit, create) {
  const today = dayTasks(plugin, date);
  const card = host.createDiv({ cls: "lubi-card lubi-list-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", date === todayStr() ? "\u4ECA\u5929" : `${shortDate(date)} \u5468${weekdayZh(date)}`);
  const done = today.filter((t) => plugin.tasks.isDoneOn(t, date)).length;
  head.createSpan({ cls: "lubi-muted", text: today.length ? `${done}/${today.length}` : "" });
  iconButton(head, "plus", "\u65B0\u5EFA\u4EFB\u52A1", () => create({ date }), "lubi-push-right");
  const list = card.createDiv({ cls: "lubi-task-list" });
  if (!today.length) list.createDiv({ cls: "lubi-muted lubi-pad", text: "\u8FD9\u5929\u6CA1\u6709\u5B89\u6392\u3002\u53EF\u4ECE\u4E0B\u65B9\u300C\u672A\u5B89\u6392\u300D\u9009\u62E9\u65E5\u671F\uFF0C\u6216\u6DFB\u52A0\u5F85\u529E\u3002" });
  renderDayTaskList(plugin, list, date, rerender, openNew, edit, (li, t) => makeDraggable(li, t));
  const quick = card.createDiv({ cls: "lubi-quick-add" });
  icon(quick, "plus", "lubi-icon");
  const input = quick.createEl("input", { type: "text", attr: { placeholder: "\u6DFB\u52A0\u5F85\u529E\uFF08\u5B89\u6392\u5728\u5F53\u5929\uFF09", "aria-label": `\u6DFB\u52A0 ${date} \u7684\u5F85\u529E`, "data-lubi-focus": "quick-add" } });
  let saving = false;
  const add = async () => {
    const title = input.value.trim();
    if (!title || saving) {
      input.focus();
      return;
    }
    saving = true;
    try {
      const firstCat = plugin.settings.categories.find((c) => c.kind === "time")?.name || "";
      await plugin.tasks.upsert(blankTask({ title, date, category: firstCat }));
      input.value = "";
      rerender();
    } catch (e) {
      new import_obsidian8.Notice(`\u6DFB\u52A0\u5931\u8D25\uFF1A${e.message}`, 6e3);
    } finally {
      saving = false;
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    void add();
  });
  button(quick, "\u6DFB\u52A0", () => void add(), { cls: "lubi-btn-sm" });
  const inbox = plugin.tasks.inbox();
  const ib = host.createDiv({ cls: "lubi-card lubi-list-card" });
  const ih = ib.createDiv({ cls: "lubi-panel-head" });
  el(ih, "h3", "lubi-panel-title", "\u672A\u5B89\u6392");
  ih.createSpan({ cls: "lubi-muted", text: inbox.length ? String(inbox.length) : "" });
  iconButton(ih, "plus", "\u65B0\u5EFA\u672A\u5B89\u6392\u4EFB\u52A1", () => create(), "lubi-push-right");
  const il = ib.createDiv({ cls: "lubi-task-list" });
  if (!inbox.length) il.createDiv({ cls: "lubi-muted lubi-pad", text: "\u7A7A\u3002\u6240\u6709\u4EFB\u52A1\u90FD\u5DF2\u7ECF\u5B89\u6392\u4E86\u65E5\u671F\u3002" });
  groupedRows(plugin, il, inbox, edit, (group, t) => {
    const li = taskRow(plugin, group, t, date, rerender, openNew, () => edit(t));
    makeDraggable(li, t);
    const act = li.querySelector(".lubi-task-actions") ?? li.createDiv({ cls: "lubi-task-actions" });
    iconButton(act, "calendar-plus", `\u5B89\u6392 ${t.title} \u5230 ${date}\uFF08\u53EF\u64A4\u9500\uFF09`, () => void updateScheduleWithUndo(plugin, t.id, { date, start: "" }, `${t.title} \u2192 ${date}`, rerender));
    iconButton(act, "calendar-days", `\u4E3A ${t.title} \u9009\u62E9\u65E5\u671F\u548C\u65F6\u95F4`, () => new TaskModal(plugin.app, plugin, { task: t, focusDate: true, onSaved: rerender }).open());
  });
}
function makeDraggable(elm, t) {
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
function renderAgenda(plugin, host, state, rerender, edit) {
  const card = host.createDiv({ cls: "lubi-card lubi-agenda-card" });
  const span = state.agendaSpan;
  const first = state.agendaDate || state.selectedDate;
  const dates = Array.from({ length: span }, (_, i) => shiftDate(first, i));
  const head = card.createDiv({ cls: "lubi-panel-head lubi-agenda-head" });
  el(head, "h3", "lubi-panel-title", "\u65E5\u7A0B");
  head.createSpan({ cls: "lubi-muted", text: dates.length === 1 ? first : `${shortDate(first)} \u2013 ${shortDate(dates[dates.length - 1])}` });
  const navigate = (target) => {
    state.agendaDate = target;
    state.selectedDate = target;
    state.weekAnchor = target;
    rerender();
  };
  const nav = head.createDiv({ cls: "lubi-nav lubi-push-right" });
  iconButton(nav, "chevron-left", `\u5411\u524D ${span} \u5929`, () => navigate(shiftDate(first, -span)));
  button(nav, "\u4ECA\u5929", () => navigate(todayStr()), { cls: "lubi-btn-sm" });
  iconButton(nav, "chevron-right", `\u5411\u540E ${span} \u5929`, () => navigate(shiftDate(first, span)));
  segmented(card, [{ id: "one", label: "\u5355\u65E5" }, { id: "three", label: "\u4E09\u65E5" }], span === 1 ? "one" : "three", (value) => {
    state.agendaSpan = value === "one" ? 1 : 3;
    state.agendaDate = state.selectedDate;
    rerender();
  }).addClass("lubi-agenda-range");
  for (const d of dates) {
    const section = card.createDiv({ cls: "lubi-agenda-day" });
    const day = section.createEl("button", { cls: `lubi-agenda-day-title ${d === state.selectedDate ? "is-selected" : ""}`, text: `${d === todayStr() ? "\u4ECA\u5929 \xB7 " : ""}${shortDate(d)} \u5468${weekdayZh(d)}`, attr: { type: "button", "aria-current": d === state.selectedDate ? "date" : "false" } });
    day.addEventListener("click", () => navigate(d));
    const list = section.createDiv({ cls: "lubi-task-list" });
    const tasks = plugin.tasks.forDate(d).filter((t) => !plugin.tasks.children(t.id).length);
    if (!tasks.length) list.createDiv({ cls: "lubi-muted lubi-pad-sm", text: "\u6CA1\u6709\u5B89\u6392" });
    else for (const task of tasks) {
      taskRow(plugin, list, task, d, rerender, (defaults, onRec) => new RecordModal(plugin.app, plugin, { date: d, defaults, onSaved: async (rec) => {
        if (rec && onRec) await onRec(rec);
        rerender();
      } }).open(), () => edit(task));
    }
    button(section, `\u5728 ${shortDate(d)} \u65B0\u5EFA\u4EFB\u52A1`, () => new TaskModal(plugin.app, plugin, { defaults: { date: d }, onSaved: rerender }).open(), { cls: "lubi-btn-ghost lubi-btn-sm lubi-agenda-add" });
  }
}
function renderWeek(plugin, host, date, state, rerender, edit) {
  const s = plugin.settings;
  const startH = Math.max(0, Math.min(23, s.scheduleStartHour));
  const endH = Math.max(startH + 1, Math.min(24, s.scheduleEndHour));
  const days = weekOf(state.weekAnchor);
  const card = host.createDiv({ cls: "lubi-card lubi-week-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  el(head, "h3", "lubi-panel-title", "\u5468\u65E5\u7A0B");
  head.createSpan({ cls: "lubi-muted", text: `${shortDate(days[0])} \u2013 ${shortDate(days[6])}` });
  const nav = head.createDiv({ cls: "lubi-nav lubi-push-right" });
  iconButton(nav, "chevron-left", "\u4E0A\u4E00\u5468", () => {
    state.weekAnchor = shiftDate(state.weekAnchor, -7);
    state.selectedDate = shiftDate(state.selectedDate, -7);
    state.agendaDate = state.selectedDate;
    rerender();
  });
  const wk = nav.createEl("button", { cls: "lubi-btn lubi-btn-sm", text: "\u672C\u5468" });
  wk.addEventListener("click", () => {
    state.weekAnchor = todayStr();
    state.selectedDate = todayStr();
    state.agendaDate = state.selectedDate;
    rerender();
  });
  iconButton(nav, "chevron-right", "\u4E0B\u4E00\u5468", () => {
    state.weekAnchor = shiftDate(state.weekAnchor, 7);
    state.selectedDate = shiftDate(state.selectedDate, 7);
    state.agendaDate = state.selectedDate;
    rerender();
  });
  const grid = card.createDiv({ cls: "lubi-week" });
  const corner = grid.createDiv({ cls: "lubi-week-corner" });
  corner.setText("");
  const heads = [];
  for (const d of days) {
    const h = grid.createDiv({ cls: `lubi-week-day ${d === todayStr() ? "is-today" : ""} ${d === date ? "is-selected" : ""}`.trim() });
    heads.push(h);
    const dayButton = h.createEl("button", { cls: "lubi-week-day-button", attr: { type: "button", "aria-label": `\u67E5\u770B ${d} \u5468${weekdayZh(d)} \u7684\u4EFB\u52A1`, "aria-current": d === date ? "date" : "false" } });
    dayButton.createSpan({ cls: "lubi-week-dow", text: `\u5468${weekdayZh(d)}` });
    dayButton.createSpan({ cls: "lubi-week-date", text: String(Number(d.slice(8, 10))) });
    dayButton.addEventListener("click", () => plugin.openDate(d, "tasks"));
    renderLoad(plugin, h, d);
    const allDay = plugin.tasks.forDate(d).filter((t) => !t.start && !plugin.tasks.children(t.id).length);
    const strip = h.createDiv({ cls: "lubi-allday" });
    for (const t of allDay) {
      const doneChip = plugin.tasks.isDoneOn(t, d);
      const chip = tip(strip.createEl("button", { cls: `lubi-allday-chip ${doneChip ? "is-done" : ""}`, attr: { type: "button" } }), `${d} \u5168\u5929\u4EFB\u52A1 ${t.title}${doneChip ? "\uFF08\u5DF2\u5B8C\u6210\uFF09" : ""}\uFF1A\u70B9\u51FB\u7F16\u8F91\uFF0C\u62D6\u5230\u4E0B\u65B9\u65F6\u6BB5\u53EF\u5B9A\u65F6`);
      chip.style.setProperty("--chip", categoryOf(s, t.category).color);
      if (doneChip) chip.createSpan({ cls: "lubi-allday-check", text: "\u2713 ", attr: { "aria-hidden": "true" } });
      chip.createSpan({ text: t.title });
      chip.addEventListener("click", (e) => {
        stopAll(e);
        edit(t);
      });
      makeDraggable(chip, t);
    }
    bindDrop(plugin, h, d, null, rerender);
  }
  const body = grid.createDiv({ cls: "lubi-week-body" });
  const hours = body.createDiv({ cls: "lubi-week-hours" });
  hours.style.height = `${(endH - startH) * HOUR_PX}px`;
  for (let h = startH; h < endH; h++) {
    const l = hours.createDiv({ cls: "lubi-week-hour" });
    l.style.top = `${(h - startH) * HOUR_PX}px`;
    l.setText(`${String(h).padStart(2, "0")}:00`);
  }
  const hoverLabel = hours.createDiv({ cls: "lubi-week-hover-label", attr: { "aria-hidden": "true" } });
  const hovers = [];
  let dragging = false;
  const yOf = (m) => (m - startH * 60) / 60 * HOUR_PX;
  const showHover = (col, m) => {
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
  const cols = [];
  days.forEach((d, dayIdx) => {
    const col = body.createDiv({ cls: `lubi-week-col ${d === todayStr() ? "is-today" : ""}` });
    cols.push(col);
    col.style.height = `${(endH - startH) * HOUR_PX}px`;
    const colHover = col.createDiv({ cls: "lubi-tl-hover lubi-week-hover", attr: { "aria-hidden": "true" } });
    hovers.push(colHover);
    const minuteAtY = (clientY, round = false) => {
      const rect = col.getBoundingClientRect();
      const raw = (clientY - rect.top) / HOUR_PX * 60;
      const m = startH * 60 + (round ? snap(raw) : Math.floor(raw / SNAP) * SNAP);
      return Math.max(startH * 60, Math.min(endH * 60 - SNAP, m));
    };
    col.addEventListener("pointermove", (e) => {
      if (dragging || e.target.closest(".lubi-wblock")) {
        if (!dragging) hideHover();
        return;
      }
      showHover(dayIdx, minuteAtY(e.clientY));
    });
    col.addEventListener("pointerleave", () => {
      if (!dragging) hideHover();
    });
    col.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes("text/lubi-task")) return;
      showHover(dayIdx, minuteAtY(e.clientY, true));
    });
    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) hideHover();
    });
    col.addEventListener("drop", () => hideHover());
    for (let h = startH; h < endH; h++) {
      const line = col.createDiv({ cls: "lubi-week-line" });
      line.style.top = `${(h - startH) * HOUR_PX}px`;
      const half = col.createDiv({ cls: "lubi-week-line is-half" });
      half.style.top = `${(h - startH + 0.5) * HOUR_PX}px`;
    }
    if (d === todayStr()) {
      const now = col.createDiv({ cls: "lubi-now" });
      now.style.top = `${(hmToMin(nowHM()) - startH * 60) / 60 * HOUR_PX}px`;
    }
    const items = plugin.tasks.forDate(d).filter((t) => t.start && !plugin.tasks.children(t.id).length);
    for (const t of items) {
      const startMin = hmToMin(t.start);
      const dur = Math.max(t.estimate || 30, SNAP);
      const block = col.createDiv({ cls: `lubi-wblock ${plugin.tasks.isDoneOn(t, d) ? "is-done" : ""} ${t.blocked ? "is-blocked" : ""}`.trim() });
      const place = (s2, m) => {
        block.style.top = `${(s2 - startH * 60) / 60 * HOUR_PX}px`;
        block.style.height = `${Math.max(m / 60 * HOUR_PX - 2, 18)}px`;
      };
      place(startMin, dur);
      block.style.setProperty("--chip", categoryOf(s, t.category).color);
      block.createDiv({ cls: "lubi-wblock-title", text: t.title });
      const timeEl = block.createDiv({ cls: "lubi-wblock-time", text: `${t.start}\u2013${minToHM(startMin + dur)}${t.estimate ? "" : " \xB7 \u672A\u586B\u9884\u8BA1"}` });
      const handleTop = block.createDiv({ cls: "lubi-block-handle is-top" });
      const handle = block.createDiv({ cls: "lubi-block-handle is-bottom" });
      block.setAttribute("tabindex", "0");
      block.setAttribute("role", "button");
      tip(block, `${d} ${t.title}\uFF0C${t.start}\uFF0C\u9884\u8BA1 ${fmtDuration(dur)}\u3002\u62D6\u52A8\u6539\u65F6\u95F4 / \u6362\u5929\uFF1B\u70B9\u51FB\u6216\u56DE\u8F66\u7F16\u8F91`);
      block.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          edit(t);
        }
      });
      const pxPerMin = HOUR_PX / 60;
      const bindDrag = (target, mode) => {
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
            horizontal: mode === "move" ? { colWidth, minCol: -dayIdx, maxCol: 6 - dayIdx } : void 0,
            onStart: () => {
              dragging = true;
              block.addClass("is-dragging", mode === "move" ? "is-moving" : "is-resizing");
            },
            onMove: (st) => {
              place(st.start, st.minutes);
              block.style.transform = st.col ? `translateX(calc(${st.col * 100}% + ${st.col * 1}px))` : "";
              timeEl.setText(`${minToHM(st.start)}\u2013${minToHM(st.start + st.minutes)}`);
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
                timeEl.setText(`${t.start}\u2013${minToHM(startMin + dur)}`);
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
                    new import_obsidian8.Notice("\u91CD\u590D\u4EFB\u52A1\u4E0D\u80FD\u7528\u62D6\u52A8\u6362\u5929\uFF1B\u8BF7\u5728\u7F16\u8F91\u4E2D\u8C03\u6574\u91CD\u590D\u89C4\u5219");
                    rerender();
                    return;
                  }
                  const patch = cur.repeat.kind === "none" ? { date: nd, start: minToHM(st.start) } : { start: minToHM(st.start) };
                  await updateScheduleWithUndo(plugin, t.id, patch, `${t.title} \u2192 ${nd} ${minToHM(st.start)}`, rerender);
                } else if (mode === "resize-start") {
                  await updateScheduleWithUndo(plugin, t.id, { start: minToHM(st.start), estimate: st.minutes }, `${t.title} \u2192 ${minToHM(st.start)}\u2013${minToHM(st.start + st.minutes)}`, rerender);
                } else {
                  await updateScheduleWithUndo(plugin, t.id, { estimate: st.minutes }, `${t.title} \u9884\u8BA1 ${fmtDuration(st.minutes)}`, rerender);
                }
              })();
            }
          });
        });
      };
      bindDrag(block, "move");
      bindDrag(handleTop, "resize-start");
      bindDrag(handle, "resize-end");
    }
    const ghost = col.createDiv({ cls: "lubi-wghost", attr: { "aria-hidden": "true" } });
    const colPxPerMin = HOUR_PX / 60;
    col.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".lubi-wblock")) return;
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
          ghost.style.top = `${(st.start - startH * 60) / 60 * HOUR_PX}px`;
          ghost.style.height = `${Math.max(st.minutes / 60 * HOUR_PX - 2, 16)}px`;
          ghost.setText(`${minToHM(st.start)}\u2013${minToHM(st.start + st.minutes)} \xB7 ${fmtDuration(st.minutes)}`);
          showHover(dayIdx, st.start + st.minutes);
        },
        onEnd: (st) => {
          dragging = false;
          hideHover();
          ghost.removeClass("is-on");
          if (!st || !st.moved) return;
          new TaskModal(plugin.app, plugin, { defaults: { date: d, start: minToHM(st.start), estimate: st.minutes }, onSaved: rerender }).open();
        }
      });
    });
    col.addEventListener("dblclick", (e) => {
      if (e.target.closest(".lubi-wblock")) return;
      const rect = col.getBoundingClientRect();
      const min = startH * 60 + snap((e.clientY - rect.top) / HOUR_PX * 60);
      new TaskModal(plugin.app, plugin, { defaults: { date: d, start: minToHM(min), estimate: 60 }, onSaved: rerender }).open();
    });
    bindDrop(plugin, col, d, startH, rerender);
  });
  const scrollEl = card.querySelector(".lubi-week-body");
  const earliest = Math.min(...days.flatMap((d) => plugin.tasks.forDate(d).filter((t) => t.start).map((t) => hmToMin(t.start))), Infinity);
  const targetMin = days.includes(todayStr()) ? hmToMin(nowHM()) - 60 : Number.isFinite(earliest) ? earliest - 30 : startH * 60;
  const targetPx = Math.max(0, Math.round((targetMin - startH * 60) / 60 * HOUR_PX));
  if (scrollEl) scrollEl.dataset.scrollTarget = String(targetPx);
  window.requestAnimationFrame(() => {
    if (scrollEl && !scrollEl.dataset.restored) scrollEl.scrollTop = targetPx;
  });
}
function renderLoad(plugin, host, d) {
  const capacity = Math.max(1, plugin.settings.dailyCapacityHours || 8) * 60;
  const planned = plugin.tasks.forDate(d).filter((t) => !plugin.tasks.children(t.id).length && !plugin.tasks.isDoneOn(t, d)).reduce((sum2, t) => sum2 + (t.estimate || 0), 0);
  const ratio = planned / capacity;
  const level = ratio > 1 ? "is-over" : ratio >= 0.9 ? "is-high" : planned ? "is-ok" : "is-empty";
  const load = host.createDiv({ cls: `lubi-load ${level}`, attr: {
    role: "meter",
    "aria-valuemin": "0",
    "aria-valuemax": String(capacity),
    "aria-valuenow": String(Math.min(planned, capacity * 2))
  } });
  tip(load, planned ? `${d} \u8BA1\u5212 ${fmtDuration(planned)} / \u53EF\u7528 ${fmtDuration(capacity)}${ratio > 1 ? " \xB7 \u6392\u592A\u6EE1\u4E86" : ""}` : `${d} \u8FD8\u6CA1\u6709\u8BA1\u5212\u65F6\u957F \xB7 \u53EF\u7528 ${fmtDuration(capacity)}`);
  const track = load.createDiv({ cls: "lubi-load-track" });
  track.createDiv({ cls: "lubi-load-fill" }).style.width = `${Math.min(100, ratio * 100)}%`;
  load.createSpan({ cls: "lubi-load-text", text: planned ? `${fmtHoursShort(planned)}/${fmtHoursShort(capacity)}` : "\u2014" });
}
function fmtHoursShort(min) {
  const h = Math.round(min / 60 * 10) / 10;
  return `${h}h`;
}
function snap(min) {
  return Math.round(min / SNAP) * SNAP;
}
function bindDrop(plugin, target, date, startH, rerender) {
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
      start = minToHM(startH * 60 + snap((e.clientY - rect.top) / HOUR_PX * 60));
    }
    const task = plugin.tasks.byId(id);
    if (!task) return;
    if (task.repeat.kind !== "none") {
      new import_obsidian8.Notice("\u91CD\u590D\u4EFB\u52A1\u8BF7\u5728\u7F16\u8F91\u4E2D\u8C03\u6574\u89C4\u5219\u6216\u65F6\u95F4");
      return;
    }
    await updateScheduleWithUndo(plugin, id, { date, start }, `${task.title} \u2192 ${date}${start ? ` ${start}` : " \u5168\u5929"}`, rerender);
  });
}
function renderProjects(plugin, host, state, rerender, edit, create) {
  const projects = plugin.tasks.projects();
  const card = host.createDiv({ cls: "lubi-card" });
  const head = card.createDiv({ cls: "lubi-panel-head" });
  const toggle = head.createEl("button", { cls: "lubi-project-toggle", attr: { type: "button", "aria-expanded": String(state.projectsOpen) } });
  icon(toggle, state.projectsOpen ? "chevron-down" : "chevron-right", "lubi-icon");
  toggle.createSpan({ cls: "lubi-panel-title", text: "\u9879\u76EE" });
  toggle.createSpan({ cls: "lubi-muted", text: projects.length ? `${projects.length} \u4E2A` : "" });
  toggle.addEventListener("click", () => {
    state.projectsOpen = !state.projectsOpen;
    rerender();
  });
  const addProject = iconButton(head, "plus", "\u65B0\u5EFA\u9879\u76EE", () => create({}), "lubi-push-right");
  if (!state.projectsOpen && projects.length) {
    const peek = createDiv({ cls: "lubi-project-peek" });
    head.insertBefore(peek, addProject);
    for (const p of projects.slice(0, 4)) {
      const { done, total } = plugin.tasks.progress(p);
      const chip = tip(peek.createEl("button", { cls: "lubi-project-chip", attr: { type: "button" } }), `${p.title} \xB7 ${done}/${total}\uFF0C\u70B9\u51FB\u7F16\u8F91`);
      chip.style.setProperty("--chip", categoryOf(plugin.settings, p.category).color);
      chip.createSpan({ cls: "lubi-project-chip-name", text: p.title });
      const bar = chip.createSpan({ cls: "lubi-project-chip-bar" });
      bar.createSpan().style.width = `${total ? Math.round(done / total * 100) : 0}%`;
      chip.createSpan({ cls: "lubi-muted lubi-project-chip-n", text: `${done}/${total}` });
      chip.addEventListener("click", (e) => {
        stopAll(e);
        edit(p);
      });
    }
    if (projects.length > 4) peek.createSpan({ cls: "lubi-muted", text: `+${projects.length - 4}` });
  }
  const projectBody = card.createDiv({ cls: "lubi-project-body" });
  projectBody.hidden = !state.projectsOpen;
  if (!state.projectsOpen) return;
  if (!projects.length) {
    emptyState(projectBody, "layers", "\u8FD8\u6CA1\u6709\u9879\u76EE", "\u6709\u5B50\u4EFB\u52A1\u7684\u9876\u5C42\u4EFB\u52A1\u4F1A\u81EA\u52A8\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u5E76\u663E\u793A\u8FDB\u5EA6\u4E0E\u65F6\u95F4\u8DE8\u5EA6\u3002", { label: "\u65B0\u5EFA\u9879\u76EE", onClick: () => create({}) });
    return;
  }
  const spans = projects.map((p) => plugin.tasks.span(p)).filter((x) => !!x);
  const today = todayStr();
  let from = spans.length ? spans.map((s) => s.from).sort()[0] : weekStart(today);
  let to = spans.length ? spans.map((s) => s.to).sort().reverse()[0] : shiftDate(from, 27);
  from = weekStart(from < today ? from : today);
  if (daysBetween(from, to) < 27) to = shiftDate(from, 27);
  to = shiftDate(to, 6 - daysBetween(from, to) % 7);
  const days = eachDate(from, to);
  const gantt = projectBody.createDiv({ cls: "lubi-gantt" });
  gantt.style.setProperty("--days", String(days.length));
  const hdr = gantt.createDiv({ cls: "lubi-gantt-row lubi-gantt-head" });
  hdr.createDiv({ cls: "lubi-gantt-name" });
  const scale = hdr.createDiv({ cls: "lubi-gantt-scale" });
  for (let i = 0; i < days.length; i += 7) {
    const w = scale.createDiv({ cls: "lubi-gantt-week" });
    w.style.left = `${i / days.length * 100}%`;
    w.style.width = `${7 / days.length * 100}%`;
    w.setText(shortDate(days[i]));
  }
  const todayIdx = days.indexOf(today);
  const row = (t, depth) => {
    const r = gantt.createDiv({ cls: `lubi-gantt-row ${t.status === "done" ? "is-done" : ""}` });
    const name = r.createDiv({ cls: "lubi-gantt-name" });
    name.style.paddingLeft = `${8 + depth * 16}px`;
    const kids = plugin.tasks.children(t.id);
    if (kids.length) {
      const tg = iconButton(name, state.expanded.has(t.id) ? "chevron-down" : "chevron-right", `${state.expanded.has(t.id) ? "\u6536\u8D77" : "\u5C55\u5F00"}${t.title}\u7684\u5B50\u4EFB\u52A1`, () => {
        if (state.expanded.has(t.id)) state.expanded.delete(t.id);
        else state.expanded.add(t.id);
        rerender();
      }, "lubi-icon-btn-sm");
      tg.setAttribute("aria-expanded", String(state.expanded.has(t.id)));
    } else name.createSpan({ cls: "lubi-gantt-spacer" });
    if (t.category) catDot(name, categoryOf(plugin.settings, t.category));
    const label = name.createEl("button", { cls: "lubi-gantt-label", text: t.title, attr: { type: "button", "aria-label": `\u7F16\u8F91 ${t.title}` } });
    label.addEventListener("click", () => edit(t));
    const { done, total } = plugin.tasks.progress(t);
    if (kids.length) name.createSpan({ cls: "lubi-muted lubi-gantt-progress", text: `${done}/${total}` });
    const track = r.createDiv({ cls: "lubi-gantt-track" });
    if (todayIdx >= 0) {
      const tl = track.createDiv({ cls: "lubi-gantt-today" });
      tl.style.left = `${(todayIdx + 0.5) / days.length * 100}%`;
    }
    const span = kids.length ? plugin.tasks.span(t) : t.date ? { from: t.date, to: t.date } : plugin.tasks.span(t);
    if (span) {
      const a = Math.max(0, daysBetween(from, span.from));
      const b = Math.min(days.length - 1, daysBetween(from, span.to));
      if (b >= 0 && a < days.length) {
        const bar = track.createDiv({ cls: `lubi-gantt-bar ${kids.length ? "is-project" : ""}` });
        const placeBar = (x, y) => {
          bar.style.left = `${x / days.length * 100}%`;
          bar.style.width = `${(y - x + 1) / days.length * 100}%`;
        };
        placeBar(a, b);
        bar.style.setProperty("--chip", categoryOf(plugin.settings, t.category).color);
        const fill = bar.createDiv({ cls: "lubi-gantt-fill" });
        fill.style.width = `${total ? done / total * 100 : 0}%`;
        const liveLabel = bar.createDiv({ cls: "lubi-gantt-live" });
        bar.createDiv({ cls: "lubi-gantt-handle is-left" });
        bar.createDiv({ cls: "lubi-gantt-handle is-right" });
        bar.setAttribute("tabindex", "0");
        bar.setAttribute("role", "button");
        tip(bar, `${t.title}\uFF0C${span.from} \u2192 ${span.to}${kids.length ? `\uFF0C\u5B8C\u6210 ${done}/${total}` : ""}\u3002\u70B9\u6309\u6216\u56DE\u8F66\u7F16\u8F91\uFF1B\u62D6\u52A8\u6574\u6761\u79FB\u52A8\uFF0C\u62C9\u4E24\u7AEF\u6539\u8DE8\u5EA6`);
        bar.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            edit(t);
          }
        });
        const spanDays = b - a;
        const bindBar = (target, which) => {
          target.addEventListener("pointerdown", (e) => {
            if (which !== "move") e.stopPropagation();
            const dayW = (track.getBoundingClientRect().width || days.length) / days.length;
            const range2 = which === "move" ? { minCol: -a, maxCol: days.length - 1 - b } : which === "left" ? { minCol: -a, maxCol: spanDays } : { minCol: -spanDays, maxCol: days.length - 1 - b };
            const calc = (col) => which === "move" ? [a + col, b + col] : which === "left" ? [a + col, b] : [a, b + col];
            startDrag(e, {
              mode: "move",
              start: 0,
              minutes: 0,
              pxPerMin: 1e9,
              min: 0,
              max: 1e9,
              minMinutes: 0,
              horizontal: { colWidth: dayW, ...range2 },
              onStart: () => {
                bar.addClass("is-dragging");
                gantt.addClass("is-dragging");
              },
              onMove: (st) => {
                const [x, y] = calc(st.col);
                placeBar(x, y);
                liveLabel.setText(`${shortDate(days[x])} \u2192 ${shortDate(days[y])} \xB7 ${y - x + 1} \u5929`);
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
                const from2 = days[x];
                const to2 = days[y];
                void (async () => {
                  const cur = plugin.tasks.byId(t.id);
                  if (!cur) return;
                  const next = { ...cur };
                  if (which === "move" && !kids.length && cur.date && !(cur.startDate && cur.endDate)) {
                    next.date = shiftDate(cur.date, st.col);
                  } else {
                    next.startDate = from2;
                    next.endDate = to2;
                    if (which === "move" && cur.date) next.date = shiftDate(cur.date, st.col);
                  }
                  await updateScheduleWithUndo(plugin, t.id, {
                    ...next.date !== cur.date ? { date: next.date } : {},
                    ...next.startDate !== cur.startDate ? { startDate: next.startDate } : {},
                    ...next.endDate !== cur.endDate ? { endDate: next.endDate } : {}
                  }, `${t.title} \u2192 ${shortDate(from2)} \u2013 ${shortDate(to2)}`, rerender);
                })();
              }
            });
          });
        };
        bindBar(bar, "move");
        bindBar(bar.querySelector(".lubi-gantt-handle.is-left"), "left");
        bindBar(bar.querySelector(".lubi-gantt-handle.is-right"), "right");
      }
    } else if (!kids.length) {
      track.createDiv({ cls: "lubi-muted lubi-gantt-unset", text: "\u672A\u5B89\u6392" });
    } else {
      track.createDiv({ cls: "lubi-muted lubi-gantt-unset", text: "\u5B50\u4EFB\u52A1\u90FD\u6CA1\u6709\u65E5\u671F \xB7 \u7F16\u8F91\u9879\u76EE\u53EF\u624B\u52A8\u8BBE\u7F6E\u8DE8\u5EA6" });
    }
    if (state.expanded.has(t.id)) for (const k of kids) row(k, depth + 1);
  };
  for (const p of projects) row(p, 0);
  const foot = projectBody.createDiv({ cls: "lubi-muted lubi-pad-sm" });
  foot.setText("\u8DE8\u5EA6 = \u9879\u76EE\u81EA\u8EAB\u7684\u5F00\u59CB/\u622A\u6B62\uFF0C\u6216\u7531\u5B50\u4EFB\u52A1\u65E5\u671F\u63A8\u5BFC\u3002\u70B9\u540D\u79F0\u6216\u6761\u5F62\u6253\u5F00\u65E5\u671F\u8868\u5355\uFF1B\u62D6\u52A8\u6392\u671F\u540E\u53EF\u64A4\u9500\u3002");
}

// src/ui/view.ts
var VIEW_TYPE = "lubi-dashboard";
var DashboardView = class _DashboardView extends import_obsidian9.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.date = todayStr();
    this.tab = "today";
    this.review = { period: "week", anchor: todayStr(), display: "chart" };
    this.tasksState = { weekAnchor: todayStr(), selectedDate: todayStr(), agendaDate: todayStr(), agendaSpan: 1, projectsOpen: false, expanded: /* @__PURE__ */ new Set() };
    this.serial = 0;
    this.lastRenderKey = "";
    this.visitedReview = false;
    this.scrollCache = /* @__PURE__ */ new Map();
    this.refresh = debounce(() => void this.render(), 150);
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Lubi \u8BB0\u5F55";
  }
  getIcon() {
    return "hourglass";
  }
  async onClose() {
    hideTip();
    this.panelObserver?.disconnect();
    if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = void 0;
  }
  async onOpen() {
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
  buildHeader(root) {
    const bar = root.createDiv({ cls: "lubi-topbar" });
    const left = bar.createDiv({ cls: "lubi-topbar-left" });
    const nav = left.createDiv({ cls: "lubi-nav lubi-day-nav" });
    iconButton(nav, "chevron-left", "\u524D\u4E00\u5929\uFF08\u2190\uFF09", () => this.setDate(shiftDate(this.date, -1)));
    this.dateLabel = tip(nav.createEl("button", { cls: "lubi-date-label" }), "\u70B9\u51FB\u9009\u62E9\u65E5\u671F");
    const picker = nav.createEl("input", { type: "date", cls: "lubi-date-picker", attr: { tabindex: "-1", "aria-hidden": "true" } });
    this.dateLabel.addEventListener("click", () => {
      picker.value = this.date;
      const p = picker;
      if (p.showPicker) p.showPicker();
      else picker.click();
    });
    picker.addEventListener("change", () => picker.value && this.setDate(picker.value));
    iconButton(nav, "chevron-right", "\u540E\u4E00\u5929\uFF08\u2192\uFF09", () => this.setDate(shiftDate(this.date, 1)));
    this.todayBtn = tip(nav.createEl("button", { cls: "lubi-btn lubi-btn-sm lubi-today-btn", text: "\u4ECA\u5929" }), "\u56DE\u5230\u4ECA\u5929\uFF08T\uFF09");
    this.todayBtn.addEventListener("click", () => this.setDate(todayStr()));
    this.contextLabel = left.createDiv({ cls: "lubi-context", attr: { "aria-live": "polite" } });
    const tabs = segmented(bar, [
      { id: "today", label: "\u6BCF\u65E5", icon: "hourglass" },
      { id: "review", label: "\u56DE\u987E", icon: "bar-chart-3" },
      { id: "tasks", label: "\u4EFB\u52A1", icon: "list-todo" }
    ], this.tab, (t) => this.setTab(t));
    tabs.addClass("lubi-topbar-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.querySelectorAll(".lubi-seg-item").forEach((b, i) => {
      const label = b.textContent || "";
      tip(b, `${label}\uFF08${i + 1}\uFF09`);
    });
    const right = bar.createDiv({ cls: "lubi-topbar-right" });
    const cta = button(right, this.ctaText(), () => this.openNew(), { primary: true, icon: "plus", cls: "lubi-topbar-cta" });
    this.ctaLabel = cta.querySelector("span:not(.lubi-icon)") || void 0;
    tip(cta, "\u65B0\u5EFA\uFF08N\uFF09\uFF1A\u6BCF\u65E5 / \u56DE\u987E\u9875\u8BB0\u4E00\u6761\uFF0C\u4EFB\u52A1\u9875\u52A0\u4EFB\u52A1\uFF1B\u7A97\u53E3\u9876\u90E8\u53EF\u5728\u300C\u8BB0\u5F55 | \u4EFB\u52A1\u300D\u4E4B\u95F4\u5207\u6362");
    cta.createSpan({ cls: "lubi-kbd lubi-kbd-cta", text: "N" });
    iconButton(right, "more-horizontal", "\u66F4\u591A", () => void 0, "lubi-more-btn").addEventListener("click", (e) => this.openMore(e));
    if (!this.keyHandler) {
      this.keyHandler = (e) => this.onKey(e);
      document.addEventListener("keydown", this.keyHandler);
    }
  }
  /** 唯一的新建入口：任务页默认「待做」，其他页默认「已完成」；窗口顶部可随时切换 */
  openNew() {
    if (this.tab === "tasks") new TaskModal(this.app, this.plugin, { defaults: { date: this.tasksState.selectedDate }, onSaved: () => this.refresh() }).open();
    else new RecordModal(this.app, this.plugin, { date: this.activeDate(), onSaved: () => this.refresh() }).open();
  }
  openMore(e) {
    const menu = new import_obsidian9.Menu();
    menu.addItem((i) => i.setTitle("\u6253\u5F00\u65E5\u8BB0\u6587\u4EF6").setIcon("file-text").onClick(() => void this.plugin.openJournal(this.activeDate())));
    menu.addItem((i) => i.setTitle("\u5FEB\u6377\u952E").setIcon("keyboard").onClick(() => new ShortcutsModal(this.app).open()));
    menu.addItem((i) => i.setTitle("\u8BBE\u7F6E").setIcon("settings").onClick(() => this.plugin.openSettings()));
    menu.showAtMouseEvent(e);
  }
  onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const t = e.target;
    if (t && (t.closest("input, textarea, select, [contenteditable='true'], .modal, .modal-container, .menu") || t.isContentEditable)) return;
    if (document.body.querySelector(".modal-container, .lubi-modal")) return;
    const ws = this.app.workspace;
    const active = t && this.contentEl.contains(t) || ws.getActiveViewOfType?.(_DashboardView) === this;
    if (!active) return;
    const key = e.key;
    if (key === "n" || key === "N") {
      e.preventDefault();
      this.openNew();
    } else if (key === "1" || key === "2" || key === "3") {
      e.preventDefault();
      this.setTab(["today", "review", "tasks"][Number(key) - 1]);
    } else if ((key === "t" || key === "T") && this.tab !== "review") {
      e.preventDefault();
      this.setDate(todayStr());
    } else if (key === "?") {
      e.preventDefault();
      new ShortcutsModal(this.app).open();
    } else if ((key === "ArrowLeft" || key === "ArrowRight") && this.tab !== "review") {
      if (t && t.closest(".lubi-block, .lubi-timeline, .lubi-chart, .lubi-week")) return;
      e.preventDefault();
      this.setDate(shiftDate(this.date, key === "ArrowLeft" ? -1 : 1));
    }
  }
  contextText() {
    if (this.tab === "review") {
      const a = this.review.anchor;
      if (this.review.period === "week") {
        const f2 = weekStart(a);
        return `\u56DE\u987E \xB7 ${shortDate(f2)} \u2013 ${shortDate(shiftDate(f2, 6))}`;
      }
      if (this.review.period === "month") return `\u56DE\u987E \xB7 ${shortDate(monthStart(a))} \u2013 ${shortDate(monthEnd(a))}`;
      return `\u56DE\u987E \xB7 ${a.slice(0, 4)} \u5E74`;
    }
    const f = weekStart(this.tasksState.weekAnchor);
    const thisWeek = weekStart(todayStr()) === f;
    return `\u4EFB\u52A1 \xB7 ${thisWeek ? "\u672C\u5468 " : ""}${shortDate(f)} \u2013 ${shortDate(shiftDate(f, 6))}`;
  }
  activeDate() {
    return this.tab === "today" ? this.date : this.tab === "tasks" ? this.tasksState.selectedDate : todayStr();
  }
  /** 每日页与任务页共用同一个日期：任一页翻天，另一页跟着走 */
  syncTasksDate(d) {
    const s = this.tasksState;
    s.selectedDate = d;
    s.weekAnchor = d;
    s.agendaDate = d;
  }
  setDate(d) {
    this.date = d;
    this.syncTasksDate(d);
    void this.render();
  }
  setTab(t) {
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
  ctaText() {
    return this.tab === "tasks" ? "\u52A0\u4EFB\u52A1" : "\u8BB0\u4E00\u6761";
  }
  syncTabs() {
    this.contentEl.dataset.tab = this.tab;
    this.ctaLabel?.setText(this.ctaText());
    this.contentEl.querySelectorAll(".lubi-topbar-tabs .lubi-seg-item").forEach((b, i) => b.setAttribute("aria-pressed", String(["today", "review", "tasks"][i] === this.tab)));
  }
  /** 外部跳转：可同时指定页与日期，不重建顶栏 */
  show(tab, date) {
    if (date) {
      const target = tab || this.tab;
      if (target === "review") {
        this.review.anchor = date;
        this.visitedReview = true;
      } else {
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
  async render() {
    const serial = ++this.serial;
    const active = document.activeElement;
    const focusKey = active && this.body.contains(active) ? active.getAttribute("data-lubi-focus") : null;
    hideTip();
    if (this.tab === "tasks") this.date = this.tasksState.selectedDate;
    const isToday = this.date === todayStr();
    this.dateLabel.empty();
    this.dateLabel.createSpan({ text: `${this.date} \u5468${weekdayZh(this.date)}` });
    if (isToday) this.dateLabel.createSpan({ cls: "lubi-today-badge", text: "\u4ECA\u5929" });
    this.dateLabel.toggleClass("is-today", isToday);
    this.todayBtn.disabled = isToday;
    this.todayBtn.toggleClass("is-hidden", isToday);
    this.contentEl.dataset.tab = this.tab;
    if (this.tab !== "today") this.contextLabel.setText(this.contextText());
    if (this.lastRenderKey) {
      this.scrollCache.set(this.lastRenderKey, {
        body: this.body.scrollTop,
        timeline: this.body.querySelector(".lubi-timeline-scroll")?.scrollTop,
        week: this.body.querySelector(".lubi-week-body")?.scrollTop
      });
      if (this.scrollCache.size > 50) this.scrollCache.delete(this.scrollCache.keys().next().value);
    }
    const key = this.tab === "today" ? `today:${this.date}` : this.tab === "review" ? `review:${this.review.period}:${this.review.anchor}` : `tasks:${this.tasksState.selectedDate}:${this.tasksState.weekAnchor}`;
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
      err.createEl("strong", { text: "\u9875\u9762\u6E32\u67D3\u51FA\u9519" });
      err.createEl("pre", { text: e.stack || String(e) });
    }
    if (serial !== this.serial) return;
    this.body.empty();
    this.body.appendChild(host);
    this.lastRenderKey = key;
    if (focusKey && (document.activeElement === active || document.activeElement === document.body)) {
      const replacement = Array.from(this.body.querySelectorAll("[data-lubi-focus]")).find((element) => element.getAttribute("data-lubi-focus") === focusKey);
      replacement?.focus({ preventScroll: true });
    }
    const saved = this.scrollCache.get(key);
    if (saved) {
      this.body.scrollTop = saved.body;
      window.requestAnimationFrame(() => {
        if (this.lastRenderKey !== key) return;
        const tl = this.body.querySelector(".lubi-timeline-scroll");
        const week = this.body.querySelector(".lubi-week-body");
        if (tl && saved.timeline !== void 0) {
          tl.dataset.restored = "1";
          tl.scrollTop = saved.timeline;
        }
        if (week && saved.week !== void 0) {
          week.dataset.restored = "1";
          week.scrollTop = saved.week;
        }
      });
    }
  }
};

// src/ui/settingsTab.ts
var import_obsidian10 = require("obsidian");

// src/core/color.ts
var OBSIDIAN_DEFAULT_COLORS = {
  "--color-red": "#e93147",
  "--color-orange": "#ec7500",
  "--color-yellow": "#e0ac00",
  "--color-green": "#08b94e",
  "--color-cyan": "#00bfbc",
  "--color-blue": "#086ddd",
  "--color-purple": "#7852ee",
  "--color-pink": "#d53984",
  "--color-base-50": "#7f7f7f",
  "--color-base-60": "#5c5c5c",
  "--interactive-accent": "#8a5cf5"
};
function parseColor(input) {
  const s = input.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}
function resolveDefault(value) {
  const v = value.trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (v) return parseColor(OBSIDIAN_DEFAULT_COLORS[v[1]] || v[2] || "");
  return parseColor(value);
}
function hsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  return { h, s, l };
}
function hueDistance(a, b) {
  const d = Math.abs(hsl(a).h - hsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}
function looksLikeSameHue(a, b, threshold = 20) {
  if (hsl(a).s < 0.25 || hsl(b).s < 0.25) return false;
  return hueDistance(a, b) < threshold;
}
function accentConflicts(categories, accent, resolve = resolveDefault, threshold = 20) {
  const a = resolve(accent);
  if (!a) return [];
  return categories.filter((c) => {
    const rgb = resolve(c.color);
    return !!rgb && looksLikeSameHue(rgb, a, threshold);
  }).map((c) => c.name);
}

// src/ui/settingsTab.ts
var COLORS = [
  ["\u84DD", "var(--color-blue)"],
  ["\u7EFF", "var(--color-green)"],
  ["\u7D2B", "var(--color-purple)"],
  ["\u6A59", "var(--color-orange)"],
  ["\u9EC4", "var(--color-yellow)"],
  ["\u7EA2", "var(--color-red)"],
  ["\u7C89", "var(--color-pink)"],
  ["\u9752", "var(--color-cyan)"],
  ["\u7070", "var(--color-base-60)"],
  ["\u77F3\u677F", "#6b7a99"],
  ["\u6696\u68D5", "#a0856b"]
];
function resolveLive(value) {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return resolveDefault(value);
  const probe = document.body.createDiv();
  probe.style.color = value;
  probe.style.display = "none";
  const rgb = parseColor(getComputedStyle(probe).color || "") || resolveDefault(value);
  probe.remove();
  return rgb;
}
var LubiSettingTab = class extends import_obsidian10.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lubi-settings");
    const s = this.plugin.settings;
    const save = () => void this.plugin.saveSettings();
    new import_obsidian10.Setting(containerEl).setName("\u65E5\u8BB0\u6587\u4EF6\u5939").setDesc("\u6BCF\u5929\u4E00\u4E2A YYYY-MM-DD.md\uFF0C\u8BB0\u5F55\u5199\u5728 ## \u8BB0\u5F55 \u4E0B").addText((t) => t.setValue(s.journalFolder).onChange((v) => {
      s.journalFolder = v.trim() || "\u65E5\u8BB0";
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u4EFB\u52A1\u6570\u636E\u6587\u4EF6").addText((t) => t.setValue(s.taskFile).onChange((v) => {
      s.taskFile = v.trim() || "\u4EFB\u52A1/\u4EFB\u52A1\u6570\u636E.json";
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u5907\u4EFD\u6587\u4EF6\u5939").setDesc("\u8FC1\u79FB\u65E7\u6570\u636E\u524D\u7684\u6574\u4EFD\u5907\u4EFD\u653E\u5728\u8FD9\u91CC").addText((t) => t.setValue(s.backupFolder).onChange((v) => {
      s.backupFolder = v.trim() || "\u5907\u4EFD";
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u65E5\u7A0B\u663E\u793A\u65F6\u6BB5").setDesc("\u4EFB\u52A1\u9875\u5468\u65E5\u7A0B\u7684\u8D77\u6B62\u5C0F\u65F6").addText((t) => t.setPlaceholder("6").setValue(String(s.scheduleStartHour)).onChange((v) => {
      s.scheduleStartHour = clamp(Number(v), 0, 23, 6);
      save();
    })).addText((t) => t.setPlaceholder("24").setValue(String(s.scheduleEndHour)).onChange((v) => {
      s.scheduleEndHour = clamp(Number(v), 1, 24, 24);
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u52FE\u6389\u4EFB\u52A1\u65F6\u81EA\u52A8\u8BB0\u4E00\u6761").setDesc("\u5B8C\u6210\u4EFB\u52A1\u540E\u76F4\u63A5\u5728\u65F6\u95F4\u8F74\u751F\u6210\u8BB0\u5F55\uFF08\u6309\u8BA1\u5212\u5F00\u59CB\u65F6\u95F4\uFF1B\u6CA1\u6709\u5219\u4ECE\u6B64\u523B\u5F80\u524D\u63A8\u9884\u8BA1\u65F6\u957F\uFF09\uFF0C\u53EF\u64A4\u9500\uFF0C\u53EF\u62D6\u52A8\u8C03\u6574").addToggle((t) => t.setValue(s.promptLogOnComplete).onChange((v) => {
      s.promptLogOnComplete = v;
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u6BCF\u65E5\u53EF\u7528\u5C0F\u65F6").setDesc("\u4EFB\u52A1\u9875\u5468\u65E5\u7A0B\u8868\u5934\u7684\u8D1F\u8F7D\u6761\uFF1A\u8BA1\u5212\u65F6\u957F \xF7 \u53EF\u7528\u5C0F\u65F6\uFF0C\u226590% \u53D8\u6A59\u3001\u8D85\u8FC7\u53D8\u7EA2").addText((t) => t.setPlaceholder("8").setValue(String(s.dailyCapacityHours ?? 8)).onChange((v) => {
      s.dailyCapacityHours = clamp(Number(v), 1, 24, 8);
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u5206\u7C7B").setHeading();
    containerEl.createEl("p", { cls: "lubi-muted", text: "\u300C\u65F6\u95F4\u300D\u7C7B\u8BB0\u65F6\u957F\uFF0C\u300C\u91D1\u94B1\u300D\u7C7B\u8BB0\u91D1\u989D\u3002\u56FE\u6807\u540D\u6765\u81EA lucide.dev\u3002\u52FE\u9009\u300C\u80CC\u666F\u300D\u7684\u5206\u7C7B\uFF08\u5982\u7761\u7720\uFF09\u5728\u65F6\u95F4\u8F74\u4E0E\u56FE\u8868\u4E2D\u4EE5\u659C\u7EB9\u964D\u6743\u663E\u793A\u3002" });
    const warn = containerEl.createDiv({ cls: "lubi-settings-warn" });
    const list = containerEl.createDiv({ cls: "lubi-cat-settings" });
    const checkAccent = () => {
      warn.empty();
      const hits = accentConflicts(s.categories, "var(--interactive-accent)", resolveLive);
      warn.toggleClass("is-on", hits.length > 0);
      if (hits.length) warn.setText(`\u300C${hits.join("\u3001")}\u300D\u4E0E\u4E3B\u9898\u5F3A\u8C03\u8272\u63A5\u8FD1\uFF1A\u6309\u94AE\u3001\u5F53\u524D\u9875\u7B7E\u4E5F\u662F\u8FD9\u4E2A\u989C\u8272\uFF0C\u5BB9\u6613\u628A\u6570\u636E\u548C\u53EF\u70B9\u7684\u63A7\u4EF6\u6DF7\u6DC6\u3002\u5EFA\u8BAE\u6362\u4E00\u4E2A\u989C\u8272\u3002`);
    };
    const draw = () => {
      list.empty();
      checkAccent();
      s.categories.forEach((c, i) => {
        const st = new import_obsidian10.Setting(list);
        st.addText((t) => t.setPlaceholder("\u540D\u79F0").setValue(c.name).onChange((v) => {
          c.name = v.trim() || c.name;
          save();
        }));
        st.addText((t) => t.setPlaceholder("lucide \u56FE\u6807").setValue(c.icon).onChange((v) => {
          c.icon = v.trim() || "tag";
          save();
        }));
        st.addDropdown((d) => {
          for (const [l, v] of COLORS) d.addOption(v, l);
          if (!COLORS.some(([, v]) => v === c.color)) d.addOption(c.color, "\u81EA\u5B9A\u4E49");
          d.setValue(c.color).onChange((v) => {
            c.color = v;
            save();
            checkAccent();
          });
        });
        st.addToggle((t) => {
          t.setValue(!!c.rest).onChange((v) => {
            c.rest = v || void 0;
            save();
          });
          t.toggleEl?.setAttribute("aria-label", "\u80CC\u666F\u65F6\u95F4");
          return t;
        });
        st.addDropdown((d) => d.addOption("time", "\u65F6\u95F4").addOption("money", "\u91D1\u94B1").setValue(c.kind).onChange((v) => {
          c.kind = v;
          save();
        }));
        st.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("\u4E0A\u79FB").setDisabled(i === 0).onClick(() => {
          [s.categories[i - 1], s.categories[i]] = [s.categories[i], s.categories[i - 1]];
          save();
          draw();
        }));
        st.addExtraButton((b) => b.setIcon("trash-2").setTooltip("\u5220\u9664").onClick(() => {
          s.categories.splice(i, 1);
          save();
          draw();
        }));
      });
      const add = new import_obsidian10.Setting(list);
      add.addButton((b) => b.setButtonText("\u6DFB\u52A0\u5206\u7C7B").onClick(() => {
        s.categories.push({ name: "\u65B0\u5206\u7C7B", icon: "tag", color: "var(--color-base-60)", kind: "time" });
        save();
        draw();
      }));
      add.addButton((b) => b.setButtonText("\u6062\u590D\u9ED8\u8BA4").onClick(() => {
        s.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
        save();
        draw();
      }));
    };
    draw();
    new import_obsidian10.Setting(containerEl).setName("\u652F\u51FA\u7C7B\u522B").setDesc("\u9017\u53F7\u5206\u9694").addTextArea((t) => t.setValue(s.expenseTypes.join(", ")).onChange((v) => {
      s.expenseTypes = v.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      if (!s.expenseTypes.length) s.expenseTypes = ["\u5176\u4ED6"];
      save();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u6570\u636E").setHeading();
    new import_obsidian10.Setting(containerEl).setName("\u8FC1\u79FB\u65E7\u7248\u6570\u636E").setDesc("\u628A\u65E7\u7248 HTML \u5361\u7247\u65E5\u8BB0\u548C v13 \u4EFB\u52A1\u6570\u636E\u8F6C\u6362\u4E3A\u65B0\u683C\u5F0F\u3002\u8F6C\u6362\u524D\u4F1A\u6574\u4EFD\u5907\u4EFD\u5230\u5907\u4EFD\u6587\u4EF6\u5939\u3002\u53EF\u91CD\u590D\u6267\u884C\uFF0C\u5DF2\u8F6C\u6362\u7684\u6587\u4EF6\u4F1A\u8DF3\u8FC7\u3002").addButton((b) => b.setButtonText("\u68C0\u67E5\u5E76\u8FC1\u79FB").setCta().onClick(() => {
      new ConfirmModal(this.app, "\u8FC1\u79FB\u65E7\u6570\u636E\uFF1F", "\u4F1A\u5148\u5907\u4EFD\uFF0C\u518D\u6539\u5199\u65E5\u8BB0\u6587\u4EF6\u4E0E\u4EFB\u52A1\u6570\u636E\u3002", () => void this.plugin.runMigration(true), "\u5F00\u59CB\u8FC1\u79FB", false).open();
    }));
    new import_obsidian10.Setting(containerEl).setName("\u91CD\u65B0\u663E\u793A\u4E0A\u624B\u5F15\u5BFC").addButton((b) => b.setButtonText("\u663E\u793A").onClick(() => {
      s.onboardingDone = false;
      save();
      new import_obsidian10.Notice("\u4E0B\u6B21\u6253\u5F00\u6BCF\u65E5\u9875\u4F1A\u663E\u793A\u5F15\u5BFC");
    }));
  }
};
function clamp(n, lo, hi, dflt) {
  if (isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// src/main.ts
var LubiPlugin = class extends import_obsidian11.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    /** 最近记录缓存：用于标题联想与"接着记" */
    this.recent = [];
  }
  async onload() {
    await this.loadSettings();
    this.journal = new Journal(this.app, () => this.settings);
    this.tasks = new Tasks(this.app, () => this.settings);
    this.tasks.onChange = () => this.refreshViews();
    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("hourglass", "Lubi \u8BB0\u5F55", () => void this.activateView());
    this.addSettingTab(new LubiSettingTab(this.app, this));
    this.addCommand({ id: "open", name: "\u6253\u5F00\u9762\u677F", callback: () => void this.activateView() });
    this.addCommand({ id: "log", name: "\u65B0\u5EFA\uFF08\u8BB0\u5F55 / \u4EFB\u52A1\uFF09", callback: () => this.quickLog() });
    this.addCommand({ id: "open-today", name: "\u6253\u5F00\u9762\u677F \xB7 \u6BCF\u65E5\u9875", callback: () => void this.activateView("today") });
    this.addCommand({ id: "open-review", name: "\u6253\u5F00\u9762\u677F \xB7 \u56DE\u987E\u9875", callback: () => void this.activateView("review") });
    this.addCommand({ id: "open-tasks", name: "\u6253\u5F00\u9762\u677F \xB7 \u4EFB\u52A1\u9875", callback: () => void this.activateView("tasks") });
    this.addCommand({ id: "open-journal", name: "\u6253\u5F00\u4ECA\u5929\u7684\u65E5\u8BB0\u6587\u4EF6", callback: () => void this.openJournal(todayStr()) });
    this.addCommand({ id: "migrate", name: "\u8FC1\u79FB\u65E7\u7248\u6570\u636E", callback: () => void this.runMigration(true) });
    this.registerEvent(this.app.vault.on("modify", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("create", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, old) => {
      this.onFileChange(f.path);
      this.onFileChange(old);
    }));
    this.app.workspace.onLayoutReady(() => {
      void this.tasks.load().then(() => {
        if (this.tasks.lastMigrationBackup) new import_obsidian11.Notice(`\u4EFB\u52A1\u6570\u636E\u5DF2\u5347\u7EA7\u5230 v14\uFF0C\u65E7\u6587\u4EF6\u5907\u4EFD\u5728 ${this.tasks.lastMigrationBackup}`, 8e3);
        void this.warmRecent();
        void this.runMigration(false);
      });
    });
  }
  onunload() {
    hideTip();
  }
  // ---------- 设置 ----------
  async loadSettings() {
    const raw = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...raw || {} };
    if (!Array.isArray(this.settings.categories) || !this.settings.categories.length) this.settings.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    if (raw && raw.paletteVersion === void 0) this.settings.paletteVersion = 1;
    if (raw && migratePalette(this.settings)) await this.saveData(this.settings);
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshViews();
  }
  openSettings() {
    const s = this.app.setting;
    s?.open();
    s?.openTabById(this.manifest.id);
  }
  // ---------- 视图 ----------
  views() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v) => v instanceof DashboardView);
  }
  refreshViews() {
    void this.warmRecent();
    for (const v of this.views()) v.refresh();
  }
  async activateView(tab, date) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] || null;
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    void this.app.workspace.revealLeaf(leaf);
    const view = leaf.view instanceof DashboardView ? leaf.view : null;
    if (view && (tab || date)) view.show(tab, date);
    return view;
  }
  openTab(tab) {
    void this.activateView(tab);
  }
  openDate(date, tab = "today") {
    void this.activateView(tab, date);
  }
  async openJournal(date) {
    const f = await this.journal.ensure(date);
    await this.app.workspace.getLeaf("tab").openFile(f);
  }
  /** 新建：有面板时交给面板（任务页默认「待做」，其他页默认「已完成」），否则记今天的一条 */
  quickLog() {
    const v = this.views()[0];
    if (v) {
      v.openNew();
      return;
    }
    new RecordModal(this.app, this, { date: todayStr(), onSaved: () => this.refreshViews() }).open();
  }
  shiftDate(date, days) {
    return shiftDate(date, days);
  }
  onFileChange(path) {
    const p = (0, import_obsidian11.normalizePath)(path);
    const inJournal = p.startsWith((0, import_obsidian11.normalizePath)(this.settings.journalFolder) + "/");
    if (inJournal) this.refreshViews();
    else if (p === (0, import_obsidian11.normalizePath)(this.settings.taskFile)) void this.tasks.load(true).then(() => this.refreshViews());
  }
  // ---------- 联想 / 接着记 ----------
  async warmRecent() {
    const dates = this.journal.dates().slice(-14);
    const map = await this.journal.readRange(dates);
    this.recent = [...map.values()].flat();
  }
  recentTitles(category) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const r of this.recent.slice().reverse()) {
      if (r.category !== category || seen.has(r.title)) continue;
      seen.add(r.title);
      out.push(r.title);
      if (out.length >= 12) break;
    }
    return out;
  }
  /** 某天最后一条记录的结束时间（用于"接着记"） */
  /** 「接着记」的起点：取不晚于 before（分钟）的最近一条记录的结束时间；不传 before 则取当天最晚结束。 */
  lastEndOf(date, before) {
    const ends = this.recent.filter((r) => r.date === date && r.minutes > 0).map((r) => hmToMin(r.start) + r.minutes).filter((end) => end < 1440 && (before === void 0 || end <= before));
    if (!ends.length) return null;
    return minToHM(Math.max(...ends));
  }
  // ---------- 迁移 ----------
  async runMigration(explicit) {
    const legacy = await detectLegacyJournals(this.app, this.settings);
    if (!legacy.length) {
      if (explicit) new import_obsidian11.Notice("\u6CA1\u6709\u9700\u8981\u8FC1\u79FB\u7684\u65E5\u8BB0\u6587\u4EF6\u3002");
      return;
    }
    const go = async () => {
      const r = await migrateJournals(this.app, this.settings);
      new import_obsidian11.Notice(`\u5DF2\u8FC1\u79FB ${r.files} \u4E2A\u65E5\u8BB0\u6587\u4EF6\u3001${r.records} \u6761\u8BB0\u5F55\u3002\u5907\u4EFD\uFF1A${r.backupFolder}`, 1e4);
      this.refreshViews();
    };
    if (explicit) await go();
    else new ConfirmModal(this.app, "\u53D1\u73B0\u65E7\u7248\u65E5\u8BB0\u683C\u5F0F", `${legacy.length} \u4E2A\u65E5\u8BB0\u6587\u4EF6\u4ECD\u662F\u65E7\u7248 HTML \u5361\u7247\u3002\u73B0\u5728\u8F6C\u6362\u4E3A\u65B0\u683C\u5F0F\uFF1F\uFF08\u4F1A\u5148\u6574\u4EFD\u5907\u4EFD\uFF09`, () => void go(), "\u8F6C\u6362", false).open();
  }
  fileFor(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof import_obsidian11.TFile ? f : null;
  }
};
