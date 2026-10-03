# Lubi 开发约定

## 结构与数据

- TypeScript 源码、测试、样式和版本文件在 `插件源码/lubi/`；不要手改编译输出。
- 本仓库也是可直接打开的 Vault，已有 `.obsidian/plugins/lubi/{main.js,manifest.json,styles.css}` 分发文件被跟踪；从源码构建后同步，不与源码目录的忽略生成物混淆。
- 日记是 Markdown，任务文件使用 schema v14；只改 `## 记录`，保留其他章节与未知字段。
- 预计用时保存历史快照，不按任务现值回填旧记录，也不把预计重复累加到实际统计。自动按计划生成的记录保留待确认标记。
- 数据清空、迁移、真实 Vault 写入和远程发布须由用户授权；先备份到仓库外。默认在测试 Vault / 隔离副本验证，不使用个人记录作夹具。

## 验证与版本

- 先看 git 状态与现有改动，不覆盖他人的未提交工作。
- 用锁文件安装，执行 build、core、smoke、layout；布局验证设置 `LUBI_REQUIRE_BROWSER=1`，不能将浏览器跳过当作通过。
- 生产包使用 minify + keepNames；可通过 `LUBI_TEST_PLUGIN` 指向实际 bundle 运行完整冒烟测试。
- 同步 manifest、package、package-lock 根版本和 versions.json；核对随 Vault 分发的三个文件哈希。
- 构建或模拟 UI 通过不等于真实 Obsidian / 移动端通过，报告未验证项，不擅自创建 Release / 标签。

## Git 与隐私

- 不使用一揽子 git add；显式选择源码、测试、文档、空的模板任务数据及上述分发文件。
- 不提交个人日记、插件 data.json、工作区布局、助手会话、导出、私有备份、凭据、代理和具体本机路径。新 ignore 规则不自动撤销旧文件的跟踪，仍需检查暂存范围。
- 推送前确认远程 / 分支、git diff --cached --check、版本一致及秘密扫描；不强推。
- 本地 AI 设置仍可能含明文密钥；不要打印或复制到文档。网络功能和仍未修复的安全 / 数据限制必须如实说明。

## 文档

- README 面向安装与快速使用，教学手册解释操作，CHANGELOG 记录版本，docs/mcp-lubi-plugin.md 维护当前架构；历史计划在 docs/README.md 明确分类，不当作当前状态。
- 不把机器路径、单次测试日志或个人记录写进长期文档；截图只能用合成数据。
