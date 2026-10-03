<p align="center">
  <img src="docs/images/hero.webp" alt="Lubi — 柳比歇夫时间记录 · Obsidian 插件" width="100%">
</p>

<p align="center">
  <b>Lubi</b> —— 在 Obsidian 里践行柳比歇夫时间记录法：<b>记一条、看一眼、排一下</b>。<br>
  <sub>A Lyubishchev-style time tracker, review dashboard and weekly planner for Obsidian. Data stays in plain Markdown.</sub>
</p>

<p align="center">
  <img alt="Lubi source version" src="https://img.shields.io/badge/Lubi-1.6.0-5b45c9">
  <a href="https://github.com/HP-Patience/obsidian_task_kanban/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/HP-Patience/obsidian_task_kanban?label=release&color=5b45c9"></a>
  <img alt="Obsidian" src="https://img.shields.io/badge/Obsidian-%E2%89%A5%201.4.0-7c3aed?logo=obsidian&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-22a06b"></a>
</p>

---

这个仓库是一个**开箱即用的 Obsidian 仓库（vault）**，核心是自研插件 **Lubi**：

- **每日**：把每天的时间花在哪里，按「开始–结束 · 分类 · 事项」记成日记里的一行 Markdown；当天的计划以虚线列叠在时间轴旁，计划与实际一眼对照；
- **回顾**：按周 / 月 / 年汇总，堆叠柱状图、分类占比、事项 Top 10、支出和全年覆盖热力图；
- **任务**：所有规划都在这里——今日待办、周日程时间网格、每日负载条、项目进度，任务和实际记录可以互相关联。

> [!NOTE]
> 截图全部使用合成演示数据，不含真实个人记录。部分总览图保留 v1.5 示例；预计对比图展示 v1.6 的记录窗口。

**当前仓库及随仓库分发的安装版：v1.6.0。** 任务数据初始化为空，个人日记和 AI 设置不随仓库分发。GitHub Release 独立发布，不会因代码推送自动生成。变化见 [更新日志](CHANGELOG.md)，维护入口见 [文档索引](docs/README.md)。

## 目录

- [界面一览](#界面一览)
- [功能](#功能)
- [预计与实际](#预计与实际)
- [AI 与隐私](#ai-与隐私)
- [安装](#安装)
- [快速上手](#快速上手)
- [数据格式](#数据格式)
- [开发](#开发)
- [仓库结构](#仓库结构)
- [致谢与许可](#致谢与许可)

## 界面一览

### 每日页 · 时间轴

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/today-dark.webp">
  <img src="docs/images/today-light.webp" alt="每日页：当天时间轴、计划列、今日分布与空白时段">
</picture>

每日页只管「今天」：左边是当天的时间轴，拖动色块改时间，拉边缘改时长，在空白处拖出新记录；并行的事情（比如学习时接了个电话）会自动分栏。定了开始时间的任务画在时间轴右侧的虚线「计划」列，点一下按实际时间记一条，任务随之完成。右边是今日分布、今日计划完成度（含没定时间的计划）和最长的几段空白时段。

| 补记空白 | 一行快速记录 |
| :---: | :---: |
| <img src="docs/images/gap-fill.webp" alt="悬停空白时段一键补记"> | <img src="docs/images/quick-entry.webp" alt="一行快速记录弹窗，实时解析时间、分类和标题"> |
| 两条记录之间空出 ≥ 30 分钟时，悬停即可「记这段」 | 输入 `9:00-10:30 学习 三明治定理`，实时预览解析结果 |

### 回顾页 · 周 / 月 / 年

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/review-week-dark.webp">
  <img src="docs/images/review-week.webp" alt="回顾页：KPI、每日记录时长堆叠柱状图、按分类、事项 Top 10 与支出">
</picture>

KPI 卡片只在两期都有足够记录时才显示环比，避免「少记一天就像效率暴跌」的误导；柱状图可切换为表格，睡眠用斜纹淡化，不喧宾夺主。

<img src="docs/images/year-heatmap.webp" alt="全年覆盖热力图">

### 任务页 · 周日程

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/tasks-week-dark.webp">
  <img src="docs/images/tasks-week.webp" alt="任务页：今日待办、未安排任务、周日程时间网格、每日负载条与项目进度">
</picture>

周日程显示以今天为中心的连续 7 天（前 3 天 · 今天 · 后 3 天），左右箭头每次翻 7 天、「今天」一键回到中间。把任务拖到时间格里即可排期（15 分钟吸附）；每天顶部的负载条对比「预计时长 / 每日可用时长」，≥ 90% 变橙、超过 100% 变红，提醒你别把一天排爆。

### 窄栏与快捷键

| 窄栏（侧边栏 / 分屏） | 快捷键（面板内按 `?`） |
| :---: | :---: |
| <img src="docs/images/narrow-today.webp" alt="窄栏布局" width="360"> | <img src="docs/images/shortcuts.webp" alt="快捷键面板" width="420"> |

## 功能

**每日**
- 时间轴拖拽：移动、改时长、空白处拖出新记录；并行记录自动分栏
- 一行快速记录：`9:00-10:30 学习 标题`、`30min 跑步`、`1h30m 看书`、`14:00 午饭` 等写法实时解析
- 空白补记、「接上一条」一键填入开始时间、`Alt+1…9` 切换分类
- 支出记录（金额 + 类别），与时间记录同一条时间线
- 关联任务记录保存预计用时快照，记录窗口和时间轴详情显示预计 / 本条实际 / 偏差；旧记录不补算
- 并行时长单独统计；跨过当天 24:00 的异常记录标记为「待校对」，不参与环比，并提供一键校对入口
- 计划列：当天定了时间的任务以虚线块叠在时间轴旁，点击按实际时间记录并完成；过了计划时间仍未记录的计划会标橙
- 在任务页勾选完成时按计划时间自动记一条，标为「待确认」（虚线 + 徽标，日记里是 `[待确认:: 按计划]`）；拖到实际时间、在表单里保存或点 ✓ 后转为实际记录，回顾页会单独提示待确认的时长。取消勾选会把那条记录一起移除（可撤销），反复勾选不会重复记
- 右栏「空白时段」：列出最长的几段空白，点击定位或直接补记

**回顾**
- 周 / 月 / 年切换，KPI：记录总时长、有记录的天数、日均、覆盖率、支出
- 堆叠柱状图 ⇄ 表格，平均线；点击柱子打开当天（年视图下钻到月）
- 按分类、事项 Top 10、支出明细，全年覆盖热力图

**任务**
- 今日待办 / 未安排 / 项目（子任务 + 起止日期 + 进度）
- 周日程时间网格（6:00–24:00）：以今天为中心的连续 7 天，拖拽排期，空白处拖出新任务，15 分钟吸附
- 重复任务：每天 / 每周（选周几）/ 每月（选几号）；可跳过某一次，不改变重复规则
- 绿色 ▶ 预填关联记录，成功保存后同步完成任务；取消或记录写入失败不完成，也不重复记账
- 可选 AI 创建：自然语言生成任务 / 子任务草稿，逐项确认保存后才写入
- 每日负载条（没排计划的日子不显示）；从任务直接「记一条」，记录自动关联任务

**体验**
- 亮色 / 暗色主题自动跟随 Obsidian，文字对比度 ≥ 4.5:1
- 更多菜单 / 命令面板可导出全部记录 CSV（UTF-8 BOM）
- 每日和回顾摘要区分记录投入、实际覆盖和并行重叠
- 键盘优先：`N` 新建（每日页记一条 / 任务页加任务，窗口顶部可在「记录 | 任务」间切换）、`1/2/3` 切页、`←/→` 翻天、`T` 回到今天、`?` 查看全部快捷键
- 窄至 320px 的布局适配；首次打开有引导
- 在每日页删除一条关联了任务的记录，任务页同步：一次性任务（没有别的记录关联它）一起删除；重复任务 / 项目只取消当天完成
- 拖拽改时间、删除记录、任务排期等操作可撤销；迁移旧版数据前自动备份

## 预计与实际

![预计与实际对比（合成示例）](docs/images/estimate-comparison.png)

例如任务预计 45 分钟、实际记录 1 小时，窗口会显示「预计 45min · 实际 1h · 超出 15min」，并在 Markdown 分别保存 `[时长:: 1h]` 与 `[预计用时:: 45min]`。预计值取自当次任务并保存为历史快照，后续调整任务不会改写它。修改实际时长或结束时间，对比实时更新。

- ▶ 不是实时计时器，预填的时长仍需按真实用时核对。
- 对比针对本条记录；同一任务分多条记录时，不要重复累加任务预计。累计任务偏差尚未实现。
- 无预计、无快照的旧记录不强行比较；自动生成的待确认记录核对后再比较。
- 周日程默认显示 06:00–24:00；需要凌晨规划时，在「日程显示时段」将起始小时改为 `0`，结束保持 `24`。

## AI 与隐私

AI 是可选功能，默认接口为本地 Ollama 的兼容聊天地址；正常时间记录和任务管理不依赖 AI。点击「AI 创建」后，解析请求只发送当前描述、分类名和日期上下文，不扫描或上传整个 Vault。模型列表与测试连接也需手动触发。

> [!WARNING]
> 云端接口会收到你主动提交的描述。当前 API Key 随普通设置明文保存在本地 `.obsidian/plugins/lubi/data.json`，不是加密保管；不要提交、共享这个文件，Vault 同步也需自行检查。桌面 curl 网络兜底当前跳过 TLS 证书验证，仍待安全加固；AI 建议先用于可信的本地服务，不作云端生产安全保证。

新增的 Git 忽略规则覆盖个人日记、AI 设置、工作区状态、导出和备份；已被 Git 跟踪的旧配置不会因忽略规则自动停止跟踪。提交时仍应只选择源码、测试、文档及明确的分发文件。

## 安装

**方式一：直接使用本仓库（推荐）**

```bash
git clone https://github.com/HP-Patience/obsidian_task_kanban.git
```

用 Obsidian「打开文件夹作为仓库」选中克隆下来的目录，在 *设置 → 第三方插件* 里关闭安全模式即可。Lubi 和常用插件都已配置好。

**方式二：只装 Lubi 到你自己的仓库**

1. 从 [Releases](https://github.com/HP-Patience/obsidian_task_kanban/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`
   （如需仓库当前版本，直接拷贝本仓库的 `.obsidian/plugins/lubi/` 三个分发文件；Release 的版本以其说明为准）；
2. 放到你的仓库的 `.obsidian/plugins/lubi/` 目录下；
3. 重启 Obsidian，在 *设置 → 第三方插件* 中启用 **Lubi 柳比歇夫记录**。

> 需要 Obsidian ≥ 1.4.0。

## 快速上手

1. 点左侧栏的沙漏图标，或命令面板执行 **Lubi: 打开面板**；
2. 按 `N`（或右上角「记一条」）写下第一条记录，例如 `8:30-10:00 学习 线性代数`；
3. 一周后去「回顾」页看看时间都去哪了。

完整教程见仓库根目录的 **[Lubi 教学手册](Lubi%20教学手册.md)**（在 Obsidian 里打开体验最好）。

## 数据格式

Lubi 不使用数据库，所有数据都是普通文件，可以用任何编辑器查看、用 git 管理，也能被 Dataview 查询。

**日记**：`日记/YYYY-MM-DD.md`，Lubi 只读写其中的 `## 记录` 一节，其余内容原样保留。

```markdown
---
date: 2026-09-26
---

# 2026-09-26

## 记录
- 08:30–11:00 学习 · 线性代数 第 4 章 [时长:: 2.5h] [任务:: demo-la] [备注:: 完成 4.1–4.3]
- 09:30–10:00 日常 · 接电话 [时长:: 30min]
- 12:10 财务 · 午饭 [金额:: 28] [类别:: 餐饮]
```

- 时间记录：`开始–结束 分类 · 事项 [时长:: …]`，可选 `[任务:: id]`、`[备注:: …]`、`[预计用时:: 45min]`
- 预计用时保存任务当次的计划快照；记录窗口和时间轴详情可对比本条实际用时。历史记录不补算，任务后续修改不会改变快照；预计不参与实际时长统计，同一任务的多条记录不要重复累加预计。
- 支出记录：`时刻 财务 · 事项 [金额:: …] [类别:: …]`
- 默认分类：学习 / 运动 / 睡眠 / 饮食 / 日常 / 财务，可在设置里增删改色

**任务**：`任务/任务数据.json`（schema v14：任务、项目、排期、重复规则）。仓库模板的任务数组为空。清空该数组只清除任务 / 项目 / 重复规则，不删除日记中的实际记录或预计快照；操作前先备份，参见教学手册第 7 节。

日记文件夹、任务文件路径、每日可用时长等都可以在插件设置里修改。

## 开发

插件源码在 `插件源码/lubi/`（TypeScript + esbuild，无运行时依赖）。

```bash
cd 插件源码/lubi
npm ci           # 按锁文件安装；Node/npm 版本以依赖 engines 为准
npm run dev      # 监听构建
npm run build    # 类型检查 + 压缩生产构建（保留类名），输出 main.js
npm test         # 核心逻辑 + 冒烟测试 + 布局回归
```

- 优先在独立测试 Vault 验证；不要用个人日记做自动化测试。
- 本仓库是可直接打开的 Vault，已有 `.obsidian/plugins/lubi/` 分发文件随仓库跟踪；源码目录中的生成物仍忽略。发布前同步三个文件并核对哈希，之后在 Obsidian 禁用再启用 Lubi 或重启。
- Windows PowerShell 可设置 `$env:LUBI_OUT` 为测试插件目录后运行 `npm run build`；不提交具体本机路径。
- 生产包验证：构建并运行核心测试后，PowerShell 设置 `$env:LUBI_TEST_PLUGIN="../main.js"`，再执行 `node test/smoke.mjs`。
- 布局回归测试需要 Chrome / Edge，设置环境变量 `LUBI_BROWSER` 指向浏览器可执行文件，否则自动跳过；正式验证同时设置 `LUBI_REQUIRE_BROWSER=1`，避免把跳过当通过；
- README 与教学手册的截图由演示数据生成：`node test/preview-manual.mjs` 渲染静态预览页，再运行 `python scripts/screenshots.py` 截图（依赖 Playwright + Pillow，详见脚本开头）。

## 仓库结构

```text
.
├── AGENTS.md                 # 开发约定与数据 / 发布红线
├── CHANGELOG.md              # 当前版本变更与已知限制
├── Lubi 教学手册.md          # 使用教程（Obsidian 中打开）
├── 日记/                     # 每日记录（Lubi 自动创建）
├── 任务/任务数据.json         # 任务与项目
├── 附件/lubi手册/             # 教学手册配图
├── 插件源码/lubi/             # Lubi 插件源码
│   ├── src/core/             #   纯逻辑：记录解析、统计、任务、迁移
│   ├── src/ui/               #   视图：记录 / 回顾 / 任务 / 弹窗
│   ├── styles.css
│   └── test/                 #   测试、演示数据与预览
├── docs/                     # 设计与维护文档、README 配图
└── .obsidian/                # 仓库配置与已安装插件
    └── plugins/lubi/         #   Lubi 构建产物
```

## 致谢与许可

- 灵感来自苏联生物学家 **亚历山大·柳比歇夫** 坚持 56 年的时间统计法（《奇特的一生》）。
- 交互上借鉴了 Toggl、Timing、Sunsama、Amie 等优秀产品的做法（时间轴补记、负载提醒、自然语言快速添加）。
- `.obsidian/plugins/` 中的第三方插件（Dataview、Templater、QuickAdd、Kanban、Style Settings 等）版权归各自作者所有，遵循其各自的许可证，此处仅作为仓库配置的一部分分发。

Lubi 插件源码与本仓库文档以 [MIT License](LICENSE) 发布。
