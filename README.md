# opencode 桌面版增强补丁

对 **opencode 桌面版（1.18.18，Electron）** 的增强：就地编辑器丝滑化 + 网页 / Markdown 预览 + 文件树实时刷新修复 + **原版内置终端修复**。核心是注入 `patch/filetree-menu.js`，给 main 进程打上 `oc-file://` 自定义协议与 fs IPC，修复文件监听不生效的 bug，并修复打包后原版终端 PTY 加载失败的问题（不再需要自写终端）。

主界面为 session-review-v2 布局：左侧文件树 + 右侧文件预览标签页 + 底部对话区。

## ✨ 新增功能

| 功能 | 说明 |
|---|---|
| 📝 就地编辑 | 右键"编辑"或点击预览窗口上方的**编辑按钮**，直接在预览框内编辑文件，全屏编辑已废弃。**编辑时保留预览的语法高亮颜色标注**：底层克隆预览高亮、编辑器透明覆盖，未改行保持彩色标注，新增/修改行以主题色显示 |
| 🔲 预览窗口上方工具栏 | 点击文件（txt/html/md 等）在原生预览窗口上方出现工具栏：文件名 + 预览(md/html) + **编辑按钮**，无需右键即可进入编辑。**任意会话/项目目录均生效**（自动适配对话流与固定预览两种布局） |
| 🔢 行号列 + 布局对齐 | 编辑层带行号列，与预览框内容逐字对齐（`tab-size:2`、13px / 24px、等宽字体），滚动同步不跳动，打开时保持预览位置 |
| 📐 编辑丝滑优化 | 打开不全选、Tab/Shift+Tab 缩进不破坏撤销、保存后滚动恢复、脏状态提示、光标位置记忆、底部状态栏（行列/总行数/路径） |
| 🌐 网页完整预览 | 右键"预览"对 `.html/.htm` 用 iframe 完整渲染，经 `oc-file://` 协议加载，**相对 css/js/图片全部可用**，支持重新加载 |
| 📄 Markdown 预览 | 右键"预览"对 `.md/.markdown` 复用官方 marked + shiki + DOMPurify 管线，代码高亮自动适配深浅主题 |
| 🔄 编辑↔预览互切 | 预览层有"编辑"按钮、编辑层有"预览"按钮，边写边看 |
| 🗂️ 文件树实时刷新（bug 修复） | 移除文件监听器的 VCS（git）要求，**任意目录**（含非 git 目录）增删改文件都实时刷新文件树；轮询兜底 20s → 5s |
| 🖥️ 原版内置终端修复 | 打包版原版终端 PTY 500 错误（conpty `.node` 无法从 asar 内 dlopen，error 126）已修复，**直接用原版** `#terminal-panel`（ghostty-web 渲染 + `http://127.0.0.1:50757/pty` 流式 PTY），"新建终端"多开标签页，无需自写终端 |
| 🔲 终端标题栏（底部常驻，永远可见） | 仿旧自定义终端的"▣ 终端"控制栏：30px 标题栏常驻右列底部，栏上带终端图标按钮，任何时刻可见可点。面板关闭→点击调出（自动新建会话）；拖到底（最小高度）→点击拉回展开到视口 45%；正常高度→点击收起；栏随面板开关高亮、提示翻转"点击展开/收起" |

## 🚀 快速体验

1. 左侧文件树**点击任意文件**（txt/html/md…）→ 预览窗口上方出现工具栏 → 点 **编辑** 就地编辑（带行号、对齐预览框）。
2. 右键任意 `.html` / `.md` 文件 → **预览**（完整网页渲染 / Markdown 渲染）。
3. 点右侧窗口底部的**终端标题栏**（"▣ 终端"，常驻底部、永远可见；或 `Ctrl+\``、菜单"查看 → 终端"）→ 面板在标题栏上方展开 → 点 **新建终端** 开标签页，ghostty 渲染、PTY 流式回显；可多开"终端 1 / 终端 2 / …"。面板向下拖到底不会消失（最小高度 100px），点标题栏即可拉回。
4. 在**非 git 目录**下增删改文件，文件树实时刷新——无需手动刷新。

## 🔧 技术架构

```
┌─ renderer (filetree-menu.js + bundle 打补丁) ──┐
│  右键菜单: 编辑 / 预览                           │
│  就地编辑器: 行号列 + textarea + 状态栏 + 脏标记  │
│  MD 预览:   __ocParseMarkdown (bundle 管线)      │
│  Web 预览:  <iframe src="oc-file://…">           │
│  文件树:    tree.dir 暴露 + 5s 轮询兜底           │
└─────────────────────────────────────────────────┘
              │ fs IPC   │ 加载资源
              ▼          ▼
┌─ main (index.js + node chunk) ──────────────────┐
│  ipcMain.handle("fs-*")  读写/复制/删除          │
│  protocol.handle("oc-file")  serve 任意路径      │
│  文件监听:  watcher 移除 VCS 要求（任意目录）      │
│  OPENCODE_DEBUG_PORT=9222 调试后门(已打)         │
└─────────────────────────────────────────────────┘
```

- **`oc-file://` 协议**：`oc-file://local/<绝对路径按段 encodeURIComponent>`，win32 校验盘符绝对路径，目录自动找 `index.html`，返回带 CORS 头，MIME 覆盖 html/css/js/图片/字体/音视频。
- **原版终端修复**（`app.asar.unpacked` 加载 conpty）：打包后主进程 JS 位于 asar 虚拟文件系统内，内嵌服务端运行时（原生 Node/Bun）的 require 不具 asar 重定向能力，dlopen asar 内部路径的 `.node` 会报 **error 126** → 原版终端 PTY 全 500。补丁在 `@lydell/node-pty-win32-x64/lib/utils.js` 的 `loadNativeModule` 里把 `__dirname.replace(/app\.asar/, "app.asar.unpacked")` 作为首选基路径——`.node` 被 electron-builder 解包到 `app.asar.unpacked`，据此直接 dlopen。打包时须 `--unpack="**/*.node" --unpack="**/prebuilds/**"`，保证 asar 内有记录（Electron 主进程 require `@parcel/watcher-win32-x64` 等懒加载才不会静默失败）而实体在 unpacked。修复后原版 `#terminal-panel`（ghostty-web WASM 渲染 + `POST http://127.0.0.1:50757/pty` 流式 PTY）即恢复可用，"新建终端"可多开标签页。
- **拖到底不消失**（`apply_patch.py` 1g）：原版 ResizeHandle 的 `collapseThreshold` 为 50，面板被拖到小于该值即在松开时触发 `onCollapse → terminal.close()`，整个面板连带手柄一起消失、无法还原。补丁把三处 `collapseThreshold: 50` 改为 `0`，拖到底时面板钳制在最小高度 100px、手柄仍在，可拖回。
- **终端标题栏**（`apply_patch.py` 1h + `filetree-menu.js`）：bundle 在 `useSessionCommands` 内暴露 `globalThis.__ocToggleTerminal`（与 `Ctrl+\`` 命令同闭包：`view().terminal.open()/close()` + `terminal2.requestFocus`）和 `globalThis.__ocTerminalResize`（`layout.terminal.resize(h)`）。`filetree-menu.js` 据此在右列 flex-col 末尾注入 30px 常驻标题栏（`#__oc_term_titlebar`，仿旧自定义终端"▣ 终端"控制栏：左标签+状态提示，右终端图标按钮），面板在栏上方展开、关闭时栏仍常驻底部；MutationObserver 在 Solid 重建右列后重注入并置底。点击逻辑按面板状态分派：未开→调出（原版自动新建会话）；高≤130px（拖到底）→ `__ocTerminalResize(视口45%)` 拉回；正常高度→收起。每 900ms 轮询 `#terminal-panel` 存在性更新栏高亮与提示。
- **Markdown 管线复用**：renderer bundle 暴露 `globalThis.__ocParseMarkdown = (t) => parseMarkdown(t).then(sanitizeMarkdown)`，不新写渲染器；shiki 输出 `var(--syntax-*)` 主题变量，深浅色自适应。
- **iframe 安全**：`sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"`，跨源隔离，脚本无法触碰主界面 DOM。
- **文件树实时刷新**（`apply_livefix.py`）：原版文件监听器仅对 VCS 目录（`location2.vcs && Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER`）订阅，非 git 目录文件树不实时更新。补丁去掉 VCS 条件让任意目录都订阅 watcher，并在 renderer 侧暴露 `tree.dir` 供轮询兜底枚举、加上对缺失 dir store 的防御、把兜底间隔从 20s 收紧到 5s。

## 📁 目录结构

```
patch/
├─ filetree-menu.js        # 主补丁（右键菜单 + 编辑/预览 + 文件树 + 终端抽屉按钮，1641 行）
├─ needles/                # 各 patch 段的定位锚点
├─ scripts/
│  ├─ apply_patch.py       # 完整补丁脚本（bundle/main/preload/index.html）
│  ├─ apply_patch2.py      # 增量补丁（在已打补丁的 extracted 上重跑）
│  ├─ apply_livefix.py     # 文件树实时刷新修复（移除 watcher VCS 要求 + 轮询兜底）
│  ├─ install_patch.ps1    # 部署辅助
│  └─ cdp_*.mjs            # CDP 端到端验证脚本
└─ tools/                  # @electron/asar 打包工具
```

## 📦 部署到安装版

```bash
# 1. 解压当前 app.asar（asar extract）
# 2. 打补丁
python patch/scripts/apply_patch.py        # 全新解压目录
python patch/scripts/apply_patch2.py       # 已带旧补丁的目录
python patch/scripts/apply_livefix.py      # 文件树实时刷新修复
# 3. 重新打包
npx asar pack app.asar.extracted app.asar.new
# 4. 替换安装目录 resources/app.asar
```

## 🧪 验证

CDP 端到端脚本需要应用以调试端口启动（`OPENCODE_DEBUG_PORT=9222`）：

```bash
node patch/scripts/cdp_preview_test.mjs      # 编辑丝滑 / MD 预览 / HTML 预览 / 互切
node patch/scripts/cdp_preview_verify.mjs    # 网页 iframe 内 JS/CSS/图片 专项验证
node patch/scripts/cdp_nativebar_test.mjs    # 工具栏出现 → 编辑 → 就地编辑 → Esc 恢复
node patch/scripts/cdp_nativebar_allsessions.mjs  # 跨会话/跨项目：每个 tab 点击文件均有工具栏
node patch/scripts/cdp_hlkeep_test.mjs       # 编辑保留预览语法高亮（底层克隆 + 透明编辑器）
node patch/scripts/cdp_terminal_test.mjs     # 原版终端：#terminal-panel 存在 → 新建终端 → ghostty canvas 非空 → 多开
node patch/scripts/cdp_termpanel_drag_test.mjs  # 终端面板拖拽：#terminal-panel 打开 → 拖到底不消失(min:100) → 拖回 → 关全会话重开
node patch/scripts/cdp_drawer_test.mjs       # 终端标题栏：钩子注入 → 关闭时置底可见 → 点击调出 → 拖到底点击拉回 → 点击收起 → 仍置底
```

> 注意：custom scheme 的 iframe 是 **OOPIF**（独立渲染进程），主 target 的 CDP 看不到它，必须 `Target.attachToTarget` 进 iframe 内部验证——这是 `cdp_preview_verify.mjs` 的做法。

## 📄 文档

- [功能说明网页](docs/index.html) — 完整的图文功能说明

## ⚠️ 说明

- 仅测试/个人使用，补丁基于 1.18.18 的产物文件编写，升级 opencode 后需重新适配锚点。
- 调试后门 `OPENCODE_DEBUG_PORT` 只在显式设置环境变量时开启，不影响正常启动。

## License

MIT
