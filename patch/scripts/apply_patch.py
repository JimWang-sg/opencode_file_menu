import io, sys, shutil, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EXTRACT = r"D:\新项目\优化opencode\app.asar.extracted"
MENU_SRC = r"D:\新项目\优化opencode\patch\filetree-menu.js"

RENDERER_MAIN = os.path.join(EXTRACT, "out", "renderer", "assets", "main-BMZ7e6bl.js")
MAIN_INDEX = os.path.join(EXTRACT, "out", "main", "index.js")
PRELOAD = os.path.join(EXTRACT, "out", "preload", "index.js")
INDEX_HTML = os.path.join(EXTRACT, "out", "renderer", "index.html")

patches_done = []

def patch_file(path, old, new, expect=1):
    s = open(path, encoding="utf-8", errors="replace").read()
    if new in s:  # idempotent: skip when already applied (safe re-runs)
        patches_done.append(f"{os.path.basename(path)} (skip, already applied): {old.splitlines()[0].strip()[:60]}")
        return
    n = s.count(old)
    if n != expect:
        print(f"[FAIL] {os.path.basename(path)}: expected {expect} match(es) of anchor, found {n}")
        print(f"       anchor head: {old[:80]!r}")
        sys.exit(1)
    s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)
    patches_done.append(f"{os.path.basename(path)} ({n}x): {old.splitlines()[0].strip()[:60]}")

# ---------------- renderer bundle ----------------
r = RENDERER_MAIN

# 1a) v1 tree node: expose data-path / data-type on the row element
old = (
    '    get component() {\n'
    '      return local.as ?? "div";\n'
    '    },\n'
    '    get classList() {\n'
)
new = (
    '    get component() {\n'
    '      return local.as ?? "div";\n'
    '    },\n'
    '    "data-path": local.node.path,\n'
    '    "data-type": local.node.type,\n'
    '    get classList() {\n'
)
patch_file(r, old, new)

# 1b) v2 tree node: add data-type next to existing data-path getter
old = (
    '    get ["data-path"]() {\n'
    '      return local.node.path;\n'
    '    },\n'
    '    get ["data-selected"]() {\n'
)
new = (
    '    get ["data-path"]() {\n'
    '      return local.node.path;\n'
    '    },\n'
    '    "data-type": local.node.type,\n'
    '    get ["data-selected"]() {\n'
)
patch_file(r, old, new)

# 1c) FileProvider: expose the session directory so the menu script can resolve paths
old = (
    '    return {\n'
    '      ready: () => view().ready(),\n'
    '      normalize: path.normalize,\n'
    '      tab: path.tab,\n'
    '      pathFromTab: path.pathFromTab,\n'
)
new = (
    '    return {\n'
    '      directory: () => scope(),\n'
    '      ready: () => view().ready(),\n'
    '      normalize: path.normalize,\n'
    '      tab: path.tab,\n'
    '      pathFromTab: path.pathFromTab,\n'
)
patch_file(r, old, new)

# 1d) FileTree: publish the current session directory to a global for the menu script
old = (
    'function FileTree(props) {\n'
    '  const file = useFile();\n'
    '  const level = props.level ?? 0;\n'
)
new = (
    'function FileTree(props) {\n'
    '  const file = useFile();\n'
    '  globalThis.__ocFileDir = (file.directory && file.directory()) || globalThis.__ocFileDir || "";\n'
    '  const level = props.level ?? 0;\n'
)
patch_file(r, old, new)

# 1e) FileTreeV2: publish the session directory too (v2 file browser)
old = (
    'function FileTreeV2(props) {\n'
    '  const file = useFile();\n'
    '  const live = () => props.allowed === void 0;\n'
)
new = (
    'function FileTreeV2(props) {\n'
    '  const file = useFile();\n'
    '  globalThis.__ocFileDir = (file.directory && file.directory()) || globalThis.__ocFileDir || "";\n'
    '  const live = () => props.allowed === void 0;\n'
)
patch_file(r, old, new)

# 1f) expose the markdown parse pipeline (marked + shiki via worker, then DOMPurify)
#     to the menu script. Both parseMarkdown & sanitizeMarkdown are hoisted function
#     declarations, so assigning here (before the function body) is safe.
old = 'function parseMarkdown(text2) {\n'
new = (
    'globalThis.__ocParseMarkdown = (text2) => parseMarkdown(text2).then(sanitizeMarkdown);\n'
    'function parseMarkdown(text2) {\n'
)
patch_file(r, old, new)

# 1g) terminal panel: disable drag-to-collapse (collapseThreshold 50 -> 0)
#     The original ResizeHandle sets collapsed=true while the dragged size < threshold,
#     and on mouse-up fires onCollapse -> terminal.close() -> the panel vanishes with
#     no handle left to pull it back. With threshold 0 the collapse branch is never
#     entered, so dragging all the way down keeps the panel at its min height (100px).
old = 'collapseThreshold: 50'
new = 'collapseThreshold: 0'
patch_file(r, old, new, expect=3)

# 1h) expose the original terminal toggle/resize to the menu script so the
#     always-visible drawer button can open/close/restore the terminal panel.
#     useSessionCommands() holds view/terminal2/layout in scope here, so the
#     closures below reuse the exact same instances as the ctrl+` command.
old = 'const viewCmds = () => [viewCommand({\n'
new = (
    'globalThis.__ocToggleTerminal = () => { if (view().terminal.opened()) { terminal2.cancelFocus(); view().terminal.close(); return; } terminal2.requestFocus(terminal2.active()); view().terminal.open(); };\n'
    'globalThis.__ocTerminalResize = (h) => { layout.terminal.resize(h); };\n'
    'const viewCmds = () => [viewCommand({\n'
)
patch_file(r, old, new)

# ---------------- main process ----------------
m = MAIN_INDEX

# 2a) filesystem IPC handlers
old = (
    '  ipcMain.handle("await-initialization", () => deps.awaitInitialization());\n'
    '  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks());\n'
)
new = (
    '  ipcMain.handle("await-initialization", () => deps.awaitInitialization());\n'
    '  ipcMain.handle("fs-write", (_event, absPath, content) => {\n'
    '    try {\n'
    '      writeFileSync(absPath, String(content ?? ""), "utf8");\n'
    '      return { ok: true };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-read", async (_event, absPath) => {\n'
    '    try {\n'
    '      return { ok: true, content: await readFile(absPath, "utf8") };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-mkdir", async (_event, absPath) => {\n'
    '    try {\n'
    '      await mkdir(absPath, { recursive: false });\n'
    '      return { ok: true };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-remove", async (_event, absPath) => {\n'
    '    try {\n'
    '      await rm(absPath, { recursive: true, force: true });\n'
    '      return { ok: true };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-rename", async (_event, from, to) => {\n'
    '    try {\n'
    '      await rename(from, to);\n'
    '      return { ok: true };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-copy", async (_event, from, to, move) => {\n'
    '    try {\n'
    '      const info = await stat(from);\n'
    '      if (info.isDirectory()) {\n'
    '        if (move) await rename(from, to);\n'
    '        else await copyTree(from, to);\n'
    '      } else {\n'
    '        await copyFile(from, to);\n'
    '        if (move) await rm(from, { force: true });\n'
    '      }\n'
    '      return { ok: true };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-exists", async (_event, absPath) => {\n'
    '    try {\n'
    '      return { ok: true, exists: !!(await stat(absPath).catch(() => null)) };\n'
    '    } catch (error) {\n'
    '      return { ok: false, error: (error && error.message) || String(error) };\n'
    '    }\n'
    '  });\n'
    '  ipcMain.handle("fs-clipboard-write", (_event, text) => {\n'
    '    clipboard.writeText(String(text ?? ""));\n'
    '    return { ok: true };\n'
    '  });\n'
    '  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks());\n'
)
patch_file(m, old, new)

# 2a2) allow OPENCODE_DEBUG_PORT env var to enable CDP in packaged builds
old = '  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222");\n'
new = (
    '  const ocDebugPort = process.env.OPENCODE_DEBUG_PORT || (!app.isPackaged ? "9222" : "");\n'
    '  if (ocDebugPort) app.commandLine.appendSwitch("remote-debugging-port", ocDebugPort);\n'
)
patch_file(m, old, new)

# 2b) recursive copy helper (top-level function)
old = 'function checkAppExists(appName) {\n'
new = (
    'async function copyTree(src, dest) {\n'
    '  await mkdir(dest, { recursive: true });\n'
    '  const entries = await readdir(src, { withFileTypes: true });\n'
    '  for (const entry of entries) {\n'
    '    const s = join(src, entry.name);\n'
    '    const d = join(dest, entry.name);\n'
    '    if (entry.isDirectory()) await copyTree(s, d);\n'
    '    else await copyFile(s, d);\n'
    '  }\n'
    '}\n'
    'function checkAppExists(appName) {\n'
)
patch_file(m, old, new)

# 2c) oc-file:// custom protocol: register the scheme (app must be pre-ready)
old = (
    'protocol.registerSchemesAsPrivileged([\n'
    '  {\n'
    '    scheme: rendererProtocol,\n'
    '    privileges: {\n'
    '      secure: true,\n'
    '      standard: true,\n'
    '      supportFetchAPI: true,\n'
    '      stream: true\n'
    '    }\n'
    '  }\n'
    ']);\n'
)
new = (
    'protocol.registerSchemesAsPrivileged([\n'
    '  {\n'
    '    scheme: rendererProtocol,\n'
    '    privileges: {\n'
    '      secure: true,\n'
    '      standard: true,\n'
    '      supportFetchAPI: true,\n'
    '      stream: true\n'
    '    }\n'
    '  },\n'
    '  {\n'
    '    scheme: "oc-file",\n'
    '    privileges: {\n'
    '      secure: true,\n'
    '      standard: true,\n'
    '      supportFetchAPI: true,\n'
    '      stream: true\n'
    '    }\n'
    '  }\n'
    ']);\n'
)
patch_file(m, old, new)

# 2d) oc-file handler: serve any absolute local path (driven by oc-file://local/<abs>)
OCFILE_HANDLER = r'''const ocFileProtocol = "oc-file";
const ocFileHost = "local";
const ocMime = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  webm: "video/webm"
};
function ocFileToPath(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "oc-file:" || url.host !== ocFileHost) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (process.platform === "win32") {
    pathname = pathname.replace(/^\/+/, "");
    if (!/^[A-Za-z]:[\\/]/.test(pathname)) return null;
    return pathname.replace(/\//g, "\\");
  }
  if (!pathname.startsWith("/")) return null;
  return pathname;
}
async function registerOcFileProtocol() {
  if (protocol.isProtocolHandled(ocFileProtocol)) return;
  protocol.handle(ocFileProtocol, async (request) => {
    let file = ocFileToPath(request.url);
    if (!file) {
      write("oc-file", "rejected url", { url: request.url }, "warn");
      return new Response("Not found", { status: 404 });
    }
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, "index.html");
        const idx = await stat(file).catch(() => null);
        if (!idx || !idx.isFile()) {
          write("oc-file", "no index.html", { dir: file }, "warn");
          return new Response("Not found", { status: 404 });
        }
      }
    } catch {
      write("oc-file", "rejected file", { url: request.url, file }, "warn");
      return new Response("Not found", { status: 404 });
    }
    try {
      const range = request.headers.get("range");
      const response = await net.fetch(pathToFileURL(file).toString(), {
        headers: range ? { range } : void 0
      });
      if (response.status >= 400) return response;
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Headers", "*");
      const mime = ocMime[extname(file).slice(1).toLowerCase()];
      if (mime) headers.set("Content-Type", mime);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      write("oc-file", "fetch error", { url: request.url, file, error }, "error");
      return new Response("Not found", { status: 404 });
    }
  });
}
'''
old = 'function loadWindow(win, html) {\n'
new = OCFILE_HANDLER + 'function loadWindow(win, html) {\n'
patch_file(m, old, new)

# 2e) wire up oc-file protocol registration
old = '  registerRendererProtocol();\n'
new = '  registerRendererProtocol();\n  registerOcFileProtocol();\n'
patch_file(m, old, new)

# ---------------- index.html ----------------
h = INDEX_HTML
old = '    <script type="module" crossorigin src="./assets/main-BMZ7e6bl.js"></script>\n'
new = (
    '    <script type="module" crossorigin src="./assets/main-BMZ7e6bl.js"></script>\n'
    '    <script src="./filetree-menu.js" defer></script>\n'
)
patch_file(h, old, new)

# ---------------- menu script ----------------
shutil.copyfile(MENU_SRC, os.path.join(EXTRACT, "out", "renderer", "filetree-menu.js"))
patches_done.append("filetree-menu.js -> out/renderer/filetree-menu.js")

print("ALL PATCHES OK:")
for p in patches_done:
    print("  -", p)
