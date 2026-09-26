// 日记文件读写：只关心 `## 记录` 这一节，其余内容原样保留。

import { App, TFile, TFolder, normalizePath } from "obsidian";
import { LubiSettings } from "../settings";
import { Rec, ParsedLine, parseRecordLine, serializeRecord, splitAtMidnight, sortRecs } from "./records";
import { hmToMin, isValidDate, shiftDate } from "./time";

export const SECTION = "## 记录";

export class Journal {
  constructor(private app: App, private settings: () => LubiSettings) {}

  path(date: string): string {
    return normalizePath(`${this.settings().journalFolder}/${date}.md`);
  }

  file(date: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.path(date));
    return f instanceof TFile ? f : null;
  }

  /** 所有日记日期（升序） */
  dates(): string[] {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.settings().journalFolder));
    if (!(folder instanceof TFolder)) return [];
    const out: string[] = [];
    for (const c of folder.children) {
      if (c instanceof TFile && c.extension === "md" && isValidDate(c.basename)) out.push(c.basename);
    }
    return out.sort();
  }

  async ensure(date: string): Promise<TFile> {
    const existing = this.file(date);
    if (existing) return existing;
    const folder = normalizePath(this.settings().journalFolder);
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const content = `---\ndate: ${date}\n---\n\n# ${date}\n\n${SECTION}\n\n`;
    return this.app.vault.create(this.path(date), content);
  }

  async read(date: string): Promise<ParsedLine[]> {
    const f = this.file(date);
    if (!f) return [];
    const text = await this.app.vault.cachedRead(f);
    return parseLines(text, date);
  }

  /** 一次读多天，返回 date -> 记录 */
  async readRange(dates: string[]): Promise<Map<string, Rec[]>> {
    const out = new Map<string, Rec[]>();
    await Promise.all(
      dates.map(async (d) => {
        const rows = await this.read(d);
        if (rows.length) out.set(d, sortRecs(rows).map((r) => r.rec));
      }),
    );
    return out;
  }

  /** 新增：自动处理跨夜拆分与 24h 上限 */
  async add(rec: Rec): Promise<void> {
    const { today, tomorrow } = splitAtMidnight(rec);
    await this.checkCap(today.date, today, null);
    if (tomorrow) {
      tomorrow.date = shiftDate(rec.date, 1);
      await this.checkCap(tomorrow.date, tomorrow, null);
    }
    await this.mutate(today.date, (recs) => [...recs, today]);
    if (tomorrow) await this.mutate(tomorrow.date, (recs) => [...recs, tomorrow]);
  }

  async update(date: string, line: number, rec: Rec): Promise<void> {
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
  async findLine(date: string, rec: Rec): Promise<number | null> {
    const rows = await this.read(date);
    const hit = rows.find((r) => r.rec.start === rec.start && r.rec.minutes === rec.minutes && r.rec.title === rec.title && r.rec.category === rec.category);
    return hit ? hit.line : null;
  }

  async remove(date: string, line: number): Promise<void> {
    await this.mutateLines(date, (rows) => rows.filter((r) => r.line !== line).map((r) => r.rec));
  }

  private async checkCap(date: string, rec: Rec, replacingLine: number | null): Promise<void> {
    if (rec.minutes <= 0) return;
    const rows = await this.read(date);
    const total = rows.filter((r) => r.line !== replacingLine).reduce((s, r) => s + r.rec.minutes, 0);
    if (total + rec.minutes > 1440 + 1) {
      const left = Math.max(0, 1440 - total);
      throw new Error(`${date} 的记录总时长将超过 24 小时（剩余可记 ${left} 分钟）。`);
    }
  }

  private async mutate(date: string, fn: (recs: Rec[]) => Rec[]): Promise<void> {
    await this.mutateLines(date, (rows) => fn(rows.map((r) => r.rec)));
  }

  private async mutateLines(date: string, fn: (rows: ParsedLine[]) => Rec[]): Promise<void> {
    const file = await this.ensure(date);
    await this.app.vault.process(file, (text) => {
      const rows = parseLines(text, date);
      const next = fn(rows).map((r) => ({ ...r, date }));
      return writeSection(text, next);
    });
  }
}

// ---------- 纯函数：解析 / 回写 ----------

interface SectionSpan {
  /** `## 记录` 标题所在行；-1 表示不存在 */
  head: number;
  /** 节内容的起止行 [from, to) */
  from: number;
  to: number;
}

function findSection(lines: string[]): SectionSpan {
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

export function parseLines(text: string, date: string): ParsedLine[] {
  const lines = text.split("\n");
  const span = findSection(lines);
  const out: ParsedLine[] = [];
  const [from, to] = span.head >= 0 ? [span.from, span.to] : [0, lines.length];
  for (let i = from; i < to; i++) {
    const rec = parseRecordLine(lines[i], date);
    if (rec) out.push({ rec, line: i });
  }
  return out;
}

export function writeSection(text: string, recs: Rec[]): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sorted = recs.slice().sort((a, b) => hmToMin(a.start) - hmToMin(b.start));
  const body = sorted.map(serializeRecord);
  const span = findSection(lines);
  if (span.head >= 0) {
    // 节内非记录行（用户手写的说明等）保留在记录之后
    const keep = lines.slice(span.from, span.to).filter((l) => l.trim() && !parseRecordLine(l, "0000-00-00"));
    const next = [...lines.slice(0, span.from), ...body, ...(keep.length ? ["", ...keep] : []), ""];
    const tail = lines.slice(span.to);
    return [...next, ...tail].join("\n").replace(/\n{3,}/g, "\n\n");
  }
  // 没有节：放在 H1 之后（或 frontmatter 之后，或文件末尾）
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

