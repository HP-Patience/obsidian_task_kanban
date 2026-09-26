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
function endMin(r) {
  return hmToMin(r.start) + r.minutes;
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

// test/stub-obsidian.js
var TFile = class {
};
var TFolder = class {
};
var normalizePath = (p) => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");

// src/core/journal.ts
var SECTION = "## \u8BB0\u5F55";
var Journal = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  path(date) {
    return normalizePath(`${this.settings().journalFolder}/${date}.md`);
  }
  file(date) {
    const f = this.app.vault.getAbstractFileByPath(this.path(date));
    return f instanceof TFile ? f : null;
  }
  /** 所有日记日期（升序） */
  dates() {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.settings().journalFolder));
    if (!(folder instanceof TFolder)) return [];
    const out = [];
    for (const c of folder.children) {
      if (c instanceof TFile && c.extension === "md" && isValidDate(c.basename)) out.push(c.basename);
    }
    return out.sort();
  }
  async ensure(date) {
    const existing = this.file(date);
    if (existing) return existing;
    const folder = normalizePath(this.settings().journalFolder);
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

// src/core/migrate.ts
async function detectLegacyJournals(app, settings) {
  const out = [];
  const folder = normalizePath(settings.journalFolder);
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(folder + "/")) continue;
    const text = await app.vault.cachedRead(f);
    if (hasLegacyCards(text) || text.includes("<!-- daily-task-log:start -->") || text.includes("```dataviewjs")) out.push(f);
  }
  return out;
}
async function migrateJournals(app, settings) {
  const files = await detectLegacyJournals(app, settings);
  const backupFolder = normalizePath(`${settings.backupFolder}/\u8FC1\u79FB-${stamp()}/\u65E5\u8BB0`);
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

// src/core/tasks.ts
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
    return normalizePath(this.settings().taskFile);
  }
  async load(force = false) {
    if (this.loaded && !force) return;
    const f = this.app.vault.getAbstractFileByPath(this.filePath());
    if (!(f instanceof TFile)) {
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
      const backup = normalizePath(`${this.settings().backupFolder}/\u8FC1\u79FB\u524D-\u4EFB\u52A1\u6570\u636E-v${obj.version ?? 0}-${stamp()}.json`);
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
      if (f instanceof TFile) await this.app.vault.modify(f, text);
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

// src/core/quickparse.ts
var pad2 = (n) => String(n).padStart(2, "0");
var validHM = (h, m) => h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m > 0);
function parseQuick(text, categories = []) {
  let rest = ` ${text} `;
  const out = { title: "" };
  let hit = false;
  const range = rest.match(/(^|[\s,，])(\d{1,2})[:：](\d{2})\s*[-–—~～到至]\s*(\d{1,2})[:：](\d{2})(?=$|[\s,，])/);
  if (range && validHM(+range[2], +range[3]) && validHM(+range[4], +range[5])) {
    const s = +range[2] * 60 + +range[3];
    let e = +range[4] * 60 + +range[5];
    if (e <= s) e += 1440;
    out.start = `${pad2(+range[2])}:${range[3]}`;
    out.minutes = e - s;
    rest = rest.replace(range[0], range[1]);
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
export {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  Journal,
  OBSIDIAN_DEFAULT_COLORS,
  SECTION,
  Tasks,
  WEEKDAY_ZH,
  accentConflicts,
  blankTask,
  convertText,
  dateStr,
  dayTimeStats,
  daysBetween,
  detectLegacyJournals,
  eachDate,
  endMin,
  fmtDuration,
  fmtDurationField,
  fmtHours,
  hasLegacyCards,
  hmToMin,
  hsl,
  hueDistance,
  invalidTimedSpan,
  isValidDate,
  looksLikeSameHue,
  migrateJournals,
  migrateLegacy,
  migratePalette,
  minToHM,
  monthEnd,
  monthStart,
  nowHM,
  occursOn,
  pad,
  parseColor,
  parseDate,
  parseDuration,
  parseEstimate,
  parseLegacyCards,
  parseLines,
  parseQuick,
  parseRecordLine,
  resolveDefault,
  serializeRecord,
  shiftDate,
  shortDate,
  sortRecs,
  splitAtMidnight,
  stamp,
  stripCodeBlocks,
  todayStr,
  uid,
  weekOf,
  weekStart,
  weekdayZh,
  writeSection
};
