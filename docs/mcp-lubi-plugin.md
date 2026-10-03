# Lubi 插件：维护与构建

当前仓库版本 **1.6.0**，最低 Obsidian 版本在 manifest 中声明为 **1.4.0**。源码在 `插件源码/lubi/`，随 Vault 分发的安装文件在 `.obsidian/plugins/lubi/`。使用方法以根目录 README 与教学手册为准，版本变更以 CHANGELOG 为准。

## 模块与职责

| 模块 | 职责 |
|---|---|
| src/main.ts | 生命周期、命令、文件事件防抖、CSV 导出与设置加载 |
| src/core/records.ts | Markdown 字段解析、预计快照、待确认、午夜拆分 |
| src/core/journal.ts | 日记读取与原子更新、记录增删改、关联记录查询 |
| src/core/tasks.ts | schema v14、任务层级 / 重复 / 排期 / 完成、写队列和迁移 |
| src/core/time.ts / metrics.ts | 日期与分钟工具、统计辅助 |
| src/ui/taskList.ts | 记录与任务配对；▶ 和计划块保存后完成、完成登记及撤销 |
| src/ui/modals.ts / aiTask.ts | 记录与任务表单、预计对比、AI 草稿确认 |
| src/ui/today.ts / tasks.ts / review.ts / view.ts | 每日、计划、回顾与顶栏 |
| styles.css | Obsidian 变量驱动的样式与响应式布局 |

## 数据约定

- 日记只更新 `## 记录`，其他章节和手写非记录行保留。
- 实际分钟为 `[时长:: …]`；任务预计快照为 `[预计用时:: …]`，不参与实际总时长统计。历史无快照记录不取当前任务预计补算。
- `[待确认:: 按计划]` 不等于测得的实际用时；拖动、确认或表单保存后核对。
- 任务 JSON 仍为 `{ "version": 14, "tasks": [] }`；清空任务不删除日记。操作前备份到仓库外。
- 周日程默认 6–24 点，设置可扩为 0–24；无需修改源码。

## 开发与验证

1. 在独立测试 Vault 或隔离副本操作，用 `npm ci` 按锁文件安装。
2. `npm run build` 执行类型检查与压缩生产构建；`npm test` 运行核心、模拟 UI 和浏览器布局。
3. 布局验证设置 `LUBI_REQUIRE_BROWSER=1`，必要时设置本机 `LUBI_BROWSER`，禁止将跳过当通过。
4. 构建产物可通过 `LUBI_OUT` 写到测试目录。验证真实生产包时设置 `LUBI_TEST_PLUGIN=../main.js` 后执行 `node test/smoke.mjs`；路径相对 test 文件。
5. 本仓库已有分发目录被 Git 跟踪，应同步 main.js、styles.css、manifest.json 并核对哈希；源码目录生成物不提交。
6. 在真实 Obsidian 中重启或禁用再启用插件，人工检查关键路径、空状态、错误输入与移动端。模拟测试不能替代这一步。

## 发布与隐私

- manifest、package、package-lock 根版本一致；源码 versions.json 映射兼容版本。当前 1.6.0 不代表已经创建 GitHub Release。
- 不提交日记、接口密钥、工作区状态、助手会话、导出与私有备份；只显式暂存确认过的文件，推送前核对远程、分支和暂存差异。
- AI 为可选功能，只在用户动作下请求接口；当前 Key 明文保存在普通设置，curl 兜底跳过证书校验，仍待安全加固。
- 跨午夜重编辑关联和合法 JSON 的结构校验仍有已知限制，见 CHANGELOG；不要把局部保护描述成完整的数据损坏恢复。
