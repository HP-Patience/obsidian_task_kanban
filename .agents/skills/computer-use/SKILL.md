# Computer Use Skill — 通用原语 v2(原生多模态)

> 定位:与具体应用/游戏**无关**的 Windows Computer Use 原语。截图给**原生多模态模型的眼睛**,模型直接看图做决策;动作脚本只做"窗口内注入"。ShunCode 本体零改动。
>
> 设计决定(2026-09-07):羊了个羊曾用于端到端验收,但其专用件(对局方案 PLAYER.md、盲打读屏 ascii2/scanline/dumpgrid、判色指纹 fpngrid/fpnum/fprint/fpall、找同款模板匹配 match、state/ 对局快照与 auto-solver、通道测试 tests/)已于本版**全部移除**,归档于 `D:\2026\202607\_cu_archive_20260907.zip`。那些是为"无视觉会话"设计的替代品,不是通用 CU 的方向。

## 铁律:感知 = 原生多模态模型直接看图

1. 截图(PNG)必须通过**原生图像通道**交给多模态模型(文件附件 / 直接读图 / URL 拉取),由模型自行识别 UI 元素、游戏局面、按钮文字。
2. **禁止**为"省视觉"把截图转成字符画 / 色直方图 / 色分类百分比 / 逐点 JSON / 模板匹配文本后再决策 —— 本 skill 已不包含任何此类盲打读屏脚本。
3. 视觉模型对像素的判断是唯一权威;OCR(可选原语)只用于文本检索/精确取值,不作为主感知。
4. 因此 skill 只保留"窗口在哪 / 截到图 / 点下去 / 复核画面"四类必要原语,任何游戏/应用的具体玩法由模型从截图即时推理,不进 skill。

## 原语清单(win/ — 均与具体应用无关)

| 脚本 | 做什么 | 输出 |
|---|---|---|
| `snap.ps1 -WindowTitle <子串> -Out <png路径> [-Quality n] [-B64]` | 截目标窗口(标题子串匹配)或全屏到 PNG/JPEG | `META` json:rect(Left,Top,Right,Bottom)、w、h;截图文件(输出目录不存在会自动创建) |
| `info.ps1` | 枚举窗口(标题/句柄/前台)、屏幕几何、光标位置、DPI | JSON(UTF-8) |
| `act-bg.ps1 -WindowTitle <子串> -X <图上x> -Y <图上y>` | **默认点击**:PostMessage(WM_MOUSEMOVE/DOWN/UP)后台注入目标窗口;不 SetCursorPos、不抢前台、窗口无需置顶 | `BGCLICK OK before=x,y after=x,y` |
| `mark.ps1 -Path <png> -Pts "x:y[,x:y…]" [-Size n] [-Out <png>]` | 点击前**画点确认**:在截图副本画白晕红芯准星+编号(1..N),源文件不动;坐标=同一截图像素空间 | JSON `{"in","out","pts","ok"}`;输出默认 `<名>-marked.png` |
| `act.ps1 -WindowTitle <子串> -X <图上x> -Y <图上y>` | 前台点击(SetForegroundWindow+SetCursorPos+mouse_event)—— 会动用户光标、抢焦点 | `CLICK <detail> at x,y win=<title>` |
| `type.ps1 -WindowTitle <子串> -Text <文本> [-Method clip\|fg] [-Mode char]` | 文字输入(见"打字原语与实测"节):clip=后台剪贴板+Ctrl+V(默认);fg=真实 Ctrl+V(需前台);char=后台 WM_CHAR 兜底 | `BGTYPE OK <method> before=x,y after=x,y chars=N` |
| `ocr.ps1 -Path <img>` | (可选)图片 OCR | `TEXT <x> <y> <w> <h> <text>` 每行一条 |

## 坐标协议(全链路一致,零换算)

- `snap.ps1` 截窗口 = `GetWindowRect` 整窗(含边框),截图原点 = 窗口左上角;`META` 给出 rect。
- `act-bg.ps1` 的 `-X -Y` 接受**同一张截图的像素坐标**(脚本内部做 rect 偏移 → ScreenToClient → PostMessage lParam)。
- 所以:模型看图 → 报图上坐标 → 原样传给 act-bg,任何一步都不需要手动换算屏幕坐标。
- 前提校验:每次 snap 的 `META.rect` 必须与上次一致;窗口被移动/缩放则坐标基准变了,先重新 snap 再决策,禁止沿用旧截图坐标直接点击。

## 操作协议(每轮)

1. `info.ps1`(可选)确认目标窗口存在并取标题;
2. `snap.ps1 -WindowTitle <t> -Out .../cur.png` → 核对 META.rect 未漂移;
3. 截图经原生图像通道交多模态模型 → 模型输出动作 + 图上坐标;
3b. **点前画点确认(强制轮)**:对每个待点坐标先 `mark.ps1 -Path <帧png> -Pts "x:y,…"` 在副本上画准星+编号,把 marked 预览交视觉核对——标记中心对准目标元素才算通过;未对准则修正坐标重新 mark,严禁跳过此轮直接点击;
4. 点击默认走 `act-bg.ps1`;**必须校验返回 `before=… after=…` 两值相等**(光标零位移)才可继续;
4b. 打字轮(需要输入时):`type.ps1 -Method clip`(后台剪贴板+Ctrl+V,自动保存/恢复用户剪贴板)先试,重截截图用视觉/OCR 确认文字落位;若目标忽略后台键盘(现代 UI 框架 WinUI/CEF/Chromium 常忽略——2026-09-07 实测 Win11 记事本即如此),**上报后经用户当次许可**再改 `-Method fg`(真实 Ctrl+V,要求目标已在前台;焦点不可得时返回 ERR_NOFOCUS,绝不盲发到未知窗口);
5. 再 snap 复核画面确实变化(成功标准 = 图上可验证的变化,不只看返回码);
6. 任何一轮失败 → 停止并上报,不得静默重试或私自降级前台方案。

## 画点确认原语(点击前护栏,2026-09-07)

- 实现:`win/mark.ps1` + `win/mark.cs` —— 在截图**副本**上画确认标记:白晕+红芯的准星(圆环+十字+中心点),多目标自动编号 1..N;坐标与截图/点击同一像素空间(零换算);**源文件永不被修改**。
- 用法:`mark.ps1 -Path <帧png> -Pts "x:y[,x:y…]" [-Size n(默认20)] [-Out <png>]`,输出默认 `<帧名>-marked.png`(与源同目录)。
- 流程:模型给出坐标 → `mark.ps1` 画点 → marked 预览交视觉模型/用户核对(标记中心是否对准目标元素)→ 通过后把**原坐标**传给 `act-bg.ps1` 执行;不符则改坐标重画重核,不得直接点击。
- 多目标按编号顺序核对与执行(一次 mark 一组、逐个点击核验),防止坐标漂移导致误点。

## 安全规则

- 授权范围:仅操作会话内用户指定的窗口(截屏+注入);其他窗口/全屏操作需另行授权。
- 默认不移动物理光标、不抢焦点、不弹前台 —— 保证用户可并行使用电脑。
- `act.ps1`(前台方案)默认禁用,仅当 ①目标窗口确认不响应后台注入 且 ②用户当次明示许可 才可使用。
- 不做密码框/敏感区域的读取。
## 打字原语与实测(2026-09-07)
- 实现:`win/type.ps1` + `win/keys.cs`,三种注入:
  - `-Method clip`(默认):存旧剪贴板 → Set-Clipboard(Text) → **后台** PostMessage Ctrl+V → 恢复剪贴板(`-DelayMs` 控制恢复时机,`-KeepClipboard` 不恢复)。不抢焦点、光标不动;经典 Win32 控件可用。
  - `-Method fg`:存旧剪贴板 → Set-Clipboard(Text) → **真实** Ctrl+V(keybd_event)→ 恢复剪贴板。等同人手粘贴、最可靠;要求目标窗口在前台(自动尝试置前,失败返回 `ERR_NOFOCUS` 且不发送任何键 —— 绝不盲发)。属前台动作,**须用户当次许可**。
  - `-Mode char`:逐字 PostMessage WM_CHAR(UTF-16 单元),不碰剪贴板;仅经典编辑框响应。
- 实测矩阵(目标 = Win11 记事本,WinUI 输入管线;OCR 验证):
  | 方法 | 是否落位 | 结论 |
  |---|---|---|
  | clip 后台 Ctrl+V | ✗ | 现代 UI 框架忽略对无焦点窗口 PostMessage 的键盘消息 |
  | char 后台 WM_CHAR | ✗ | 同上 |
  | fg 真实 Ctrl+V | ✓ ASCII+中文均落位、光标零位移 | 通用可靠路径 |
- 规则:输入后必须重截截图、用视觉/OCR 确认目标文本出现才算成功;`BGTYPE OK` 只表示消息已发。fg 测试给用户带来的多余文字可用 Ctrl+Z 撤销。

## 截图回传通道(实测,2026-09-07)

- 原生图像通道(推荐):截图文件经文件读图/附件/URL 直达多模态模型,无体积上限问题。
- base64 文本通道(不推荐看图):run_command 单响应截断点 ≈ 65,537 字符;256KB 以上分片续读会丢字节 —— 切勿用它回传关键大图。
