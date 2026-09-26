# Lubi 仓库门面：README / About / Topics / 截图 / Release

2026-09-26 通过 MCP 完成。

## 一、改动

- 新增 `README.md`（中文 + 一行英文简介）：界面一览、功能、安装、快速上手、数据格式、开发、仓库结构、致谢与许可。
- 新增 `LICENSE`（MIT，Copyright (c) 2026 wjx），末尾注明第三方插件保留各自许可证。
- 新增 `docs/images/`：README 配图（2x WebP）与 `social-preview.png`（1280×640）。
- 重新生成 `附件/lubi手册/*.webp`：改用演示数据，去掉了旧截图里残留的真实记录。
- `插件源码/lubi/test/demo-data.mjs`：固定种子的合成演示数据（约 120 天日记 + 任务 / 项目），`test/preview.mjs` 改用它；原预览数据中的真实记录行已移除。
- `插件源码/lubi/test/preview-manual.mjs` + `scripts/screenshots.py`：一键重新生成全部截图。
- GitHub：设置 About 描述与 Topics，发布 Release `v1.4.0`（附 main.js / manifest.json / styles.css）。

## 二、重新生成截图

```bash
cd 插件源码/lubi
npm install && npm run test:smoke              # 生成 test/plugin.cjs
TZ=Asia/Shanghai node test/preview-manual.mjs  # 输出 preview/manual/（已被 .gitignore 忽略）
pip install playwright pillow && python -m playwright install chromium
TZ=Asia/Shanghai python scripts/screenshots.py # 写入 docs/images/ 与 附件/lubi手册/
```

演示数据以「今天」为基准生成，今天的记录只截取到当前时刻为止，所以不同时间截图内容略有差异。

## 三、需要手动完成的一步

GitHub API 不支持设置社交预览图：打开仓库 *Settings → General → Social preview*，上传 `docs/images/social-preview.png`。

## 四、验证

- `npm test` 全部通过；布局回归（`LUBI_BROWSER` 指向 headless Chromium）亮 / 暗 × 1400 / 1000 / 720px 全部通过。
- README 中的功能描述逐条对照源码核实（快速记录写法、撤销范围、异常校对、负载阈值等）。
