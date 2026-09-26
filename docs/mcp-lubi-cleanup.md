# Lubi 旧版遗留清理记录

日期：2026-09-26 ｜ 目标：工作区只保留新版 Lubi（源码 + 安装版 + 个人数据），删除旧版脚本堆、迁移期备份与旧安装备份。
执行期间 Windows 侧 Obsidian 进程数为 0（`tasklist` 核验），未改动日记、任务数据与第三方插件。

## 一、删除清单

| 路径 | 内容 | 规模 |
|---|---|---|
| `旧版归档/` | 旧版 `每日分析面板.md`、`模板/`（日记模板与 `.restored`、6 个插入模板、5 个 dataviewjs 脚本、scratch）、`snippets/`（2 个旧 CSS） | 31 个文件 / 993 KB |
| `备份/` | 迁移期产物：迁移前日记 22 份、任务数据快照 7 份、v13 任务数据整份备份 1 份 | 30 个文件 / 588 KB |
| `.obsidian/lubi-release-backups/` | 部署前安装备份 pre-v1.3.0 / pre-v1.3.1 / pre-v1.3.2（各含 main.js、styles.css、manifest.json；v1.3.0 另含当时的 workspace.json） | 10 个文件 / 619 KB |

合计删除 **71 个文件、约 2.2 MB**。

## 二、随之清理的引用

- `.obsidian/app.json`：`userIgnoreFilters` 移除已不存在的 `旧版归档/`、`备份/`，保留 `插件源码/lubi/node_modules/`。
- `.obsidian/workspace.json`：`lastOpenFiles` 移除 8 条失效路径（`旧版归档/每日分析面板.md`、4 条 `备份/` 日记、3 个已删除的历史文档）。
- `.obsidian/plugins/lubi/data.json` 的 `backupFolder: "备份"` 保留：这是新版插件自身的备份目录设置，需要时会自动重建该文件夹。
- `docs/` 只保留新版内容：本文件与重写后的 `docs/mcp-lubi-plugin.md`；历史文档 `mcp-lubi-ux-review.md`、`mcp-lubi-ux-implementation.md`、`mcp-ui-polish-plan.md`、`mcp-optimization-plan.md` 删除。

## 三、清理后校验

- `.obsidian/plugins/lubi/` 三件套齐全：`main.js`（166 489 B）、`styles.css`、`manifest.json`（v1.3.2）；`styles.css`、`manifest.json` 与 `插件源码/lubi/` 逐字节相同（SHA-256 `f6ce06c2d6775893…`、`850d06432c630365…`）。
- 数据未受影响：`日记/` 14 个文件；`任务/任务数据.json` 为 schema v14，16 个任务（13 待办 / 3 完成）。
- 全库检索 `旧版归档`、`每日分析`、`备份`：仅剩插件设置里的 `backupFolder`，无其他悬空引用。
- 保留未动的目录：`插件源码/lubi/`、`.obsidian/plugins/lubi/`、`日记/`、`任务/`、`docs/`、`.obsidian/`、`.agents/`、`.snapshots/`。

## 四、说明

- 保险库根目录是 git 仓库（`origin/main`，唯一提交 `first v1`）。本次删除在工作区记录为删除状态但**未提交**，因此这批文件仍可从 git 历史取回；若希望彻底不可恢复，需要确认后再做历史清理，或告知是否提交这次删除。
- 删除范围不含第三方插件（Dataview / Templater / QuickAdd / Kanban / Style Settings / CEvent）及其配置。

## 五、Git 历史改写（2026-09-26，已完成）

- 本地：`git rm -r --cached` 移除 71 个旧文件路径，`git commit --amend` 把全部清理折叠进唯一提交（现为 `0fde973`，仍名 `first v1`）；随后 `reflog expire --expire=now --expire-unreachable=now --all`、删除 `.git/logs` 与 `refs/original`、`git gc --prune=now --aggressive`。
- 本地复核：对象数 214 → 138；旧提交 `57a14eb` 已不可解析（`fatal: Not a valid object name`）；全历史检索 `旧版归档`、`备份/`、`lubi-release-backups` 路径 **0 命中**；`git fsck --unreachable --dangling` 无输出；跟踪文件 177 → 103。
- 远端：`git push --force origin main`，GitHub `HP-Patience/obsidian_task_kanban` 的 `main` 现为 `0fde973`（`git ls-remote` 复核一致）。远端无 tag、release、issue、fork、star，强推没有外部影响。
- 残留（用户决定暂不处理）：该仓库为 public，GitHub 侧旧提交对象 `57a14ebb…` 仍可按 SHA 通过 API / raw / codeload 下载（实测 HTTP 200）。如需彻底清除，只能删除并重建仓库，或向 GitHub Support 申请清除游离对象；`gh` 当前令牌缺 `delete_repo` 权限，需要重新授权。
- 其他位置核查：磁盘上（`C:\Users\crwnb`、`E:`）未再发现 `每日分析面板.md`、`任务管理.js`、`插入-*.md` 等旧文件副本；回收站无对应项；Obsidian 应用级缓存中未检索到旧文件痕迹。

## 六、数据初始化与历史重写（2026-09-26，v1.4.0 之后）

按用户要求「清空以前记录的信息，初始化」，用户选择：全部重来、不备份、重写 git 历史。

- 执行前核验 Obsidian 进程数为 0（避免插件把内存里的旧任务 / 设置写回）。
- 删除 `日记/` 下全部 14 篇日记（含随笔）；`任务/任务数据.json` 重置为 `{"version": 14, "tasks": []}`；删除 `.obsidian/plugins/lubi/data.json`（插件设置恢复默认，下次打开显示「三步上手」）。
- `.obsidian/workspace.json` 的 `lastOpenFiles` 去掉已删除的日记路径。
- `docs/mcp-lubi-plugin.md` 去掉引用具体个人记录的内容。
- 新增保险库根目录 `Lubi 教学手册.md` 与配图 `附件/lubi手册/`（截图均为合成示例数据）。
- Git：以孤儿分支重建为唯一提交后 `git push --force origin main`，旧提交不再出现在分支历史中。
- 残留风险：仓库为 public，GitHub 会继续按 SHA 提供被替换的旧提交（含本次清空前的日记与任务），直到被垃圾回收；彻底清除只能删除并重建仓库，或联系 GitHub Support 清理缓存视图。
