# opencode 桌面版增强补丁

对 **opencode 桌面版（1.18.18，Electron）** 的右键菜单增强：就地编辑器丝滑化 + 网页/ Markdown 预览。核心是注入 `patch/filetree-menu.js`，并给 main 进程打上 `oc-file://` 自定义协议。

主界面为 session-review-v2 布局：左侧文件树 + 右侧文件预览标签页 + 底部对话区。

## ✨ 新增功能

| 功能 | 说明 |
|---|---|
| 📝 就地编辑 | 右键"编辑"直接在预览框内编辑文件，全屏编辑已废弃 |
| 📐 编辑丝滑优化 | 打开不全选、Tab/Shift+Tab 缩进不破坏撤销、保存后滚动恢复、脏状态提示、光标位置记忆、底部状态栏（行列/总行数/路径） |
| 🌐 网页完整预览 | 右键"预览"对 `.html/.htm` 用 iframe 完整渲染，经 `oc-file://` 协议加载，**相对 css/js/图片全部可用**，支持重新加载 |
| 📄 Markdown 预览 | 右键"预览"对 `.md/.markdown` 复用官方 marked + shiki + DOMPurify 管线，代码高亮自动适配深浅主题 |
| 🔄 编辑↔预览互切 | 预览层有"编辑"按钮、编辑层有"预览"按钮，边写边看 |

## 🚀 快速体验

在文件树上右键任意 `.html` / `.md` 文件 → **编辑** 或 **预览**。

## 🔧 技术架构

```
┌─ renderer (filetree-menu.js) ─────────────┐
│  右键菜单: 编辑 / 预览                      │
│  就地编辑器: textarea + 状态栏 + 脏标记      │
│  MD 预览:   __ocParseMarkdown (bundle 管线) │
│  Web 预览:  <iframe src="oc-file://…">      │
└────────────────────────────────────────────┘
              │ fs IPC             │ 加载资源
              ▼                    ▼
┌─ main (index.js) ──────────────────────────┐
│  ipcMain.handle("fs-*")  读写/复制/删除     │
│  protocol.handle("oc-file")  serve 任意路径 │
│  OPENCODE_DEBUG_PORT=9222 调试后门(已打)    │
└────────────────────────────────────────────┘
```

- **`oc-file://` 协议**：`oc-file://local/<绝对路径按段 encodeURIComponent>`，win32 校验盘符绝对路径，目录自动找 `index.html`，返回带 CORS 头，MIME 覆盖 html/css/js/图片/字体/音视频。
- **Markdown 管线复用**：renderer bundle 暴露 `globalThis.__ocParseMarkdown = (t) => parseMarkdown(t).then(sanitizeMarkdown)`，不新写渲染器；shiki 输出 `var(--syntax-*)` 主题变量，深浅色自适应。
- **iframe 安全**：`sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"`，跨源隔离，脚本无法触碰主界面 DOM。

## 📁 目录结构

```
patch/
├─ filetree-menu.js        # 主补丁（右键菜单 + 编辑/预览逻辑，~1100 行）
├─ needles/                # 各 patch 段的定位锚点
├─ scripts/
│  ├─ apply_patch.py       # 完整补丁脚本（bundle/main/preload/index.html）
│  ├─ apply_patch2.py      # 增量补丁（在已打补丁的 extracted 上重跑）
│  ├─ install_patch.ps1    # 部署辅助
│  └─ cdp_preview_test.mjs / cdp_preview_verify.mjs   # CDP 端到端验证
└─ tools/                  # @electron/asar 打包工具
```

## 📦 部署到安装版

```bash
# 1. 解压当前 app.asar（asar extract）
# 2. 打补丁
python patch/scripts/apply_patch.py        # 全新解压目录
python patch/scripts/apply_patch2.py       # 已带旧补丁的目录
# 3. 重新打包
npx asar pack app.asar.extracted app.asar.new
# 4. 替换安装目录 resources/app.asar
```

## 🧪 验证

CDP 端到端脚本需要应用以调试端口启动（`OPENCODE_DEBUG_PORT=9222`）：

```bash
node patch/scripts/cdp_preview_test.mjs      # 编辑丝滑 / MD 预览 / HTML 预览 / 互切
node patch/scripts/cdp_preview_verify.mjs    # 网页 iframe 内 JS/CSS/图片 专项验证
```

> 注意：custom scheme 的 iframe 是 **OOPIF**（独立渲染进程），主 target 的 CDP 看不到它，必须 `Target.attachToTarget` 进 iframe 内部验证——这是 `cdp_preview_verify.mjs` 的做法。

## 📄 文档

- [功能说明网页](docs/index.html) — 完整的图文功能说明

## ⚠️ 说明

- 仅测试/个人使用，补丁基于 1.18.18 的产物文件编写，升级 opencode 后需重新适配锚点。
- 调试后门 `OPENCODE_DEBUG_PORT` 只在显式设置环境变量时开启，不影响正常启动。

## License

MIT
