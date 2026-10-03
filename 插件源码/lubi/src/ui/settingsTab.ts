import { App, DropdownComponent, Notice, PluginSettingTab, requestUrl, Setting, TextComponent } from "obsidian";
import type LubiPlugin from "../main";
import { CategoryDef, DEFAULT_CATEGORIES } from "../settings";
import { accentConflicts, parseColor, resolveDefault, RGB } from "../core/color";
import { ConfirmModal } from "./modals";
import { curlJson } from "../core/curl";

const COLORS = [
  ["蓝", "var(--color-blue)"],
  ["绿", "var(--color-green)"],
  ["紫", "var(--color-purple)"],
  ["橙", "var(--color-orange)"],
  ["黄", "var(--color-yellow)"],
  ["红", "var(--color-red)"],
  ["粉", "var(--color-pink)"],
  ["青", "var(--color-cyan)"],
  ["灰", "var(--color-base-60)"],
  ["石板", "#6b7a99"],
  ["暖棕", "#a0856b"],
];

/** 在真实主题下解析颜色（变量 → rgb）；无 DOM 时退回默认表 */
function resolveLive(value: string): RGB | null {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return resolveDefault(value);
  const probe = document.body.createDiv();
  probe.style.color = value;
  probe.style.display = "none";
  const rgb = parseColor(getComputedStyle(probe).color || "") || resolveDefault(value);
  probe.remove();
  return rgb;
}

export class LubiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LubiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lubi-settings");
    const s = this.plugin.settings;
    const save = () => void this.plugin.saveSettings();

    new Setting(containerEl).setName("日记文件夹").setDesc("每天一个 YYYY-MM-DD.md，记录写在 ## 记录 下").addText((t) => t.setValue(s.journalFolder).onChange((v) => { s.journalFolder = v.trim() || "日记"; save(); }));
    new Setting(containerEl).setName("任务数据文件").addText((t) => t.setValue(s.taskFile).onChange((v) => { s.taskFile = v.trim() || "任务/任务数据.json"; save(); }));
    new Setting(containerEl).setName("备份文件夹").setDesc("迁移旧数据前的整份备份放在这里").addText((t) => t.setValue(s.backupFolder).onChange((v) => { s.backupFolder = v.trim() || "备份"; save(); }));

    new Setting(containerEl).setName("日程显示时段").setDesc("任务页周日程的起止小时").addText((t) => t.setPlaceholder("6").setValue(String(s.scheduleStartHour)).onChange((v) => { s.scheduleStartHour = clamp(Number(v), 0, 23, 6); save(); })).addText((t) => t.setPlaceholder("24").setValue(String(s.scheduleEndHour)).onChange((v) => { s.scheduleEndHour = clamp(Number(v), 1, 24, 24); save(); }));
    new Setting(containerEl).setName("勾掉任务时自动记一条").setDesc("完成任务后直接在时间轴生成记录（按计划开始时间；没有则从此刻往前推预计时长），可撤销，可拖动调整").addToggle((t) => t.setValue(s.promptLogOnComplete).onChange((v) => { s.promptLogOnComplete = v; save(); }));
    new Setting(containerEl).setName("每日可用小时").setDesc("任务页周日程表头的负载条：计划时长 ÷ 可用小时，≥90% 变橙、超过变红").addText((t) => t.setPlaceholder("8").setValue(String(s.dailyCapacityHours ?? 8)).onChange((v) => { s.dailyCapacityHours = clamp(Number(v), 1, 24, 8); save(); }));

    new Setting(containerEl).setName("AI 任务创建").setHeading();
    containerEl.createEl("p", { cls: "lubi-muted", text: "AI 只解析当前输入，确认后才会创建任务。支持 Ollama 及其他 OpenAI 兼容接口。" });
    new Setting(containerEl).setName("AI 接口地址").setDesc("例如 Ollama：http://127.0.0.1:11434/v1/chat/completions").addText((t) => t.setValue(s.aiEndpoint).onChange((v) => { s.aiEndpoint = v.trim(); save(); }));
    let modelDropdown: DropdownComponent | undefined;
    let modelText: TextComponent | undefined;
    const modelSetting = new Setting(containerEl).setName("AI 模型").setDesc("可手动填写，也可以从接口获取模型列表");
    modelSetting.addText((t) => { modelText = t; return t.setValue(s.aiModel).setPlaceholder("qwen2.5:7b").onChange((v) => { s.aiModel = v.trim(); if (s.aiModel && modelDropdown?.selectEl.querySelector(`option[value="${CSS.escape(s.aiModel)}"]`)) modelDropdown.setValue(s.aiModel); save(); }); });
    modelSetting.addDropdown((d) => { modelDropdown = d; d.addOption(s.aiModel || "", s.aiModel || "手动输入的模型").setValue(s.aiModel || "").onChange((v) => { s.aiModel = v; modelText?.setValue(v); save(); }); return d; });
    modelSetting.addButton((b) => b.setButtonText("获取模型列表").onClick(() => void loadAiModels(s, modelDropdown, modelText, save)));
    modelSetting.addButton((b) => b.setButtonText("测试连接").onClick(() => void testAiConnection(s)));
    new Setting(containerEl).setName("AI API Key").setDesc("本地 Ollama 可留空；云端接口按服务商要求填写").addText((t) => { t.inputEl.type = "password"; return t.setValue(s.aiApiKey).onChange((v) => { s.aiApiKey = v.trim(); save(); }); });

    // 分类
    new Setting(containerEl).setName("分类").setHeading();
    containerEl.createEl("p", { cls: "lubi-muted", text: "「时间」类记时长，「金钱」类记金额。图标名来自 lucide.dev。勾选「背景」的分类（如睡眠）在时间轴与图表中以斜纹降权显示。" });
    const warn = containerEl.createDiv({ cls: "lubi-settings-warn" });
    const list = containerEl.createDiv({ cls: "lubi-cat-settings" });
    const checkAccent = () => {
      warn.empty();
      const hits = accentConflicts(s.categories, "var(--interactive-accent)", resolveLive);
      warn.toggleClass("is-on", hits.length > 0);
      if (hits.length) warn.setText(`「${hits.join("、")}」与主题强调色接近：按钮、当前页签也是这个颜色，容易把数据和可点的控件混淆。建议换一个颜色。`);
    };
    const draw = () => {
      list.empty();
      checkAccent();
      s.categories.forEach((c, i) => {
        const st = new Setting(list);
        st.addText((t) => t.setPlaceholder("名称").setValue(c.name).onChange((v) => { c.name = v.trim() || c.name; save(); }));
        st.addText((t) => t.setPlaceholder("lucide 图标").setValue(c.icon).onChange((v) => { c.icon = v.trim() || "tag"; save(); }));
        st.addDropdown((d) => {
          for (const [l, v] of COLORS) d.addOption(v, l);
          if (!COLORS.some(([, v]) => v === c.color)) d.addOption(c.color, "自定义");
          d.setValue(c.color).onChange((v) => { c.color = v; save(); checkAccent(); });
        });
        st.addToggle((t) => { t.setValue(!!c.rest).onChange((v) => { c.rest = v || undefined; save(); }); (t as unknown as { toggleEl?: HTMLElement }).toggleEl?.setAttribute("aria-label", "背景时间"); return t; });
        st.addDropdown((d) => d.addOption("time", "时间").addOption("money", "金钱").setValue(c.kind).onChange((v) => { c.kind = v as CategoryDef["kind"]; save(); }));
        st.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("上移").setDisabled(i === 0).onClick(() => { [s.categories[i - 1], s.categories[i]] = [s.categories[i], s.categories[i - 1]]; save(); draw(); }));
        st.addExtraButton((b) => b.setIcon("trash-2").setTooltip("删除").onClick(() => { s.categories.splice(i, 1); save(); draw(); }));
      });
      const add = new Setting(list);
      add.addButton((b) => b.setButtonText("添加分类").onClick(() => { s.categories.push({ name: "新分类", icon: "tag", color: "var(--color-base-60)", kind: "time" }); save(); draw(); }));
      add.addButton((b) => b.setButtonText("恢复默认").onClick(() => { s.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c })); save(); draw(); }));
    };
    draw();

    new Setting(containerEl).setName("支出类别").setDesc("逗号分隔").addTextArea((t) => t.setValue(s.expenseTypes.join(", ")).onChange((v) => { s.expenseTypes = v.split(/[,，]/).map((x) => x.trim()).filter(Boolean); if (!s.expenseTypes.length) s.expenseTypes = ["其他"]; save(); }));

    // 数据
    new Setting(containerEl).setName("数据").setHeading();
    new Setting(containerEl)
      .setName("迁移旧版数据")
      .setDesc("把旧版 HTML 卡片日记和 v13 任务数据转换为新格式。转换前会整份备份到备份文件夹。可重复执行，已转换的文件会跳过。")
      .addButton((b) => b.setButtonText("检查并迁移").setCta().onClick(() => {
        new ConfirmModal(this.app, "迁移旧数据？", "会先备份，再改写日记文件与任务数据。", () => void this.plugin.runMigration(true), "开始迁移", false).open();
      }));
    new Setting(containerEl).setName("重新显示上手引导").addButton((b) => b.setButtonText("显示").onClick(() => { s.onboardingDone = false; save(); new Notice("下次打开每日页会显示引导"); }));
  }
}

function modelsEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(value)) return value.replace(/\/chat\/completions$/i, "/models");
  if (/\/generate$|\/api\/chat$/i.test(value)) return value.replace(/\/(?:generate|api\/chat)$/i, "/api/tags");
  return `${value}/models`;
}

async function fetchAiModels(settings: { aiEndpoint: string; aiApiKey: string }): Promise<string[]> {
  let response: { status: number; json: unknown };
  try {
    response = await curlJson(modelsEndpoint(settings.aiEndpoint), { maxTime: 15, headers: { Accept: "application/json", ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}) } });
  } catch {
    const native = await requestUrl({ url: modelsEndpoint(settings.aiEndpoint), headers: { Accept: "application/json", ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}) }, throw: false });
    response = { status: native.status, json: native.json };
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`请求失败（${response.status}）`);
  const data = response.json as { data?: { id?: string }[]; models?: { name?: string; model?: string }[] };
  const ids = data.data?.map((x) => x.id).filter((x): x is string => !!x) || data.models?.map((x) => x.name || x.model).filter((x): x is string => !!x) || [];
  return [...new Set(ids)];
}

async function loadAiModels(settings: { aiEndpoint: string; aiApiKey: string; aiModel: string }, dropdown: DropdownComponent | undefined, text: TextComponent | undefined, save: () => void): Promise<void> {
  try {
    const models = await fetchAiModels(settings);
    if (!models.length) throw new Error("接口没有返回模型");
    dropdown?.selectEl.empty();
    for (const model of models) dropdown?.addOption(model, model);
    dropdown?.setValue(settings.aiModel && models.includes(settings.aiModel) ? settings.aiModel : models[0]);
    settings.aiModel = dropdown?.getValue() || models[0];
    text?.setValue(settings.aiModel);
    save();
    new Notice(`已获取 ${models.length} 个模型，请确认当前模型：${settings.aiModel}`);
  } catch (e) { new Notice(`获取模型列表失败：${(e as Error).message}`, 6000); }
}

async function testAiConnection(settings: { aiEndpoint: string; aiApiKey: string; aiModel: string }): Promise<void> {
  try {
    const models = await fetchAiModels(settings);
    new Notice(`AI 连接成功${models.length ? `，可用模型 ${models.length} 个` : ""}`);
  } catch (e) {
    // 一些 OpenAI 兼容网关禁用了 GET /models，但聊天接口本身可用；用当前模型做一次极短请求兜底测试。
    try {
      const endpoint = settings.aiEndpoint.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/i, "") + "/chat/completions";
      let response: { status: number };
      try {
        response = await curlJson(endpoint, { maxTime: 15, method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}) }, body: JSON.stringify({ model: settings.aiModel, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }) });
      } catch {
        const native = await requestUrl({ url: endpoint, method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}) }, body: JSON.stringify({ model: settings.aiModel, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }), throw: false });
        response = { status: native.status };
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`聊天接口请求失败（${response.status}）`);
      new Notice("AI 连接成功；该接口不提供模型列表，请手动填写模型名称", 6000);
    } catch (fallbackError) {
      new Notice(`AI 连接失败：模型接口 ${(e as Error).message}；聊天接口 ${(fallbackError as Error).message}`, 8000);
    }
  }
}

function clamp(n: number, lo: number, hi: number, dflt: number): number {
  if (isNaN(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
