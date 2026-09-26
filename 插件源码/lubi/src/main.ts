import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, LubiSettings, DEFAULT_CATEGORIES, migratePalette } from "./settings";
import { Journal } from "./core/journal";
import { Tasks } from "./core/tasks";
import { detectLegacyJournals, migrateJournals } from "./core/migrate";
import { shiftDate, todayStr, minToHM, hmToMin } from "./core/time";
import { DashboardView, VIEW_TYPE, Tab } from "./ui/view";
import { hideTip } from "./ui/components";
import { RecordModal, ConfirmModal } from "./ui/modals";
import { LubiSettingTab } from "./ui/settingsTab";
import { Rec } from "./core/records";

export default class LubiPlugin extends Plugin {
  settings: LubiSettings = DEFAULT_SETTINGS;
  journal!: Journal;
  tasks!: Tasks;
  /** 最近记录缓存：用于标题联想与"接着记" */
  private recent: Rec[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    this.journal = new Journal(this.app, () => this.settings);
    this.tasks = new Tasks(this.app, () => this.settings);
    this.tasks.onChange = () => this.refreshViews();

    this.registerView(VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("hourglass", "Lubi 记录", () => void this.activateView());
    this.addSettingTab(new LubiSettingTab(this.app, this));

    this.addCommand({ id: "open", name: "打开面板", callback: () => void this.activateView() });
    this.addCommand({ id: "log", name: "新建（已完成 / 支出 / 待做）", callback: () => this.quickLog() });
    this.addCommand({ id: "open-today", name: "打开面板 · 每日页", callback: () => void this.activateView("today") });
    this.addCommand({ id: "open-review", name: "打开面板 · 回顾页", callback: () => void this.activateView("review") });
    this.addCommand({ id: "open-tasks", name: "打开面板 · 任务页", callback: () => void this.activateView("tasks") });
    this.addCommand({ id: "open-journal", name: "打开今天的日记文件", callback: () => void this.openJournal(todayStr()) });
    this.addCommand({ id: "migrate", name: "迁移旧版数据", callback: () => void this.runMigration(true) });

    // 日记或任务文件被外部修改 → 刷新
    this.registerEvent(this.app.vault.on("modify", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("create", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.onFileChange(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, old) => { this.onFileChange(f.path); this.onFileChange(old); }));

    this.app.workspace.onLayoutReady(() => {
      void this.tasks.load().then(() => {
        if (this.tasks.lastMigrationBackup) new Notice(`任务数据已升级到 v14，旧文件备份在 ${this.tasks.lastMigrationBackup}`, 8000);
        void this.warmRecent();
        void this.runMigration(false);
      });
    });
  }

  onunload(): void {
    hideTip();
    // Obsidian 会自行分离视图
  }

  // ---------- 设置 ----------

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as Partial<LubiSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    if (!Array.isArray(this.settings.categories) || !this.settings.categories.length) this.settings.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    // 旧数据没有 paletteVersion：按 v1 处理，把仍是旧默认值的分类色迁移到 v1.4 色板（自定义颜色不动）。
    if (raw && raw.paletteVersion === undefined) this.settings.paletteVersion = 1;
    if (raw && migratePalette(this.settings)) await this.saveData(this.settings);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshViews();
  }

  openSettings(): void {
    const s = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    s?.open();
    s?.openTabById(this.manifest.id);
  }

  // ---------- 视图 ----------

  private views(): DashboardView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v): v is DashboardView => v instanceof DashboardView);
  }

  refreshViews(): void {
    void this.warmRecent();
    for (const v of this.views()) v.refresh();
  }

  async activateView(tab?: Tab, date?: string): Promise<DashboardView | null> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] || null;
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    void this.app.workspace.revealLeaf(leaf);
    const view = leaf.view instanceof DashboardView ? leaf.view : null;
    if (view && (tab || date)) view.show(tab, date);
    return view;
  }

  openTab(tab: Tab): void {
    void this.activateView(tab);
  }

  openDate(date: string, tab: Tab = "today"): void {
    void this.activateView(tab, date);
  }

  async openJournal(date: string): Promise<void> {
    const f = await this.journal.ensure(date);
    await this.app.workspace.getLeaf("tab").openFile(f);
  }

  /** 新建：有面板时交给面板（任务页默认「待做」，其他页默认「已完成」），否则记今天的一条 */
  quickLog(): void {
    const v = this.views()[0];
    if (v) { v.openNew(); return; }
    new RecordModal(this.app, this, { date: todayStr(), onSaved: () => this.refreshViews() }).open();
  }

  shiftDate(date: string, days: number): string {
    return shiftDate(date, days);
  }

  private onFileChange(path: string): void {
    const p = normalizePath(path);
    const inJournal = p.startsWith(normalizePath(this.settings.journalFolder) + "/");
    if (inJournal) this.refreshViews();
    else if (p === normalizePath(this.settings.taskFile)) void this.tasks.load(true).then(() => this.refreshViews());
  }

  // ---------- 联想 / 接着记 ----------

  private async warmRecent(): Promise<void> {
    const dates = this.journal.dates().slice(-14);
    const map = await this.journal.readRange(dates);
    this.recent = [...map.values()].flat();
  }

  recentTitles(category: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
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
  lastEndOf(date: string, before?: number): string | null {
    const ends = this.recent
      .filter((r) => r.date === date && r.minutes > 0)
      .map((r) => hmToMin(r.start) + r.minutes)
      .filter((end) => end < 1440 && (before === undefined || end <= before));
    if (!ends.length) return null;
    return minToHM(Math.max(...ends));
  }

  // ---------- 迁移 ----------

  async runMigration(explicit: boolean): Promise<void> {
    const legacy = await detectLegacyJournals(this.app, this.settings);
    if (!legacy.length) {
      if (explicit) new Notice("没有需要迁移的日记文件。");
      return;
    }
    const go = async () => {
      const r = await migrateJournals(this.app, this.settings);
      new Notice(`已迁移 ${r.files} 个日记文件、${r.records} 条记录。备份：${r.backupFolder}`, 10000);
      this.refreshViews();
    };
    if (explicit) await go();
    else new ConfirmModal(this.app, "发现旧版日记格式", `${legacy.length} 个日记文件仍是旧版 HTML 卡片。现在转换为新格式？（会先整份备份）`, () => void go(), "转换", false).open();
  }

  fileFor(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }
}
