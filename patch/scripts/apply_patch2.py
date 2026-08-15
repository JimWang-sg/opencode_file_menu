"""Incremental patch for the "preview" feature on an ALREADY-patched extraction.

The extracted tree already carries patches 1a-1e / 2a / 2a2 (filetree menu,
debug port, in-place editor). This script only applies the NEW anchors:
  1f) expose __ocParseMarkdown in the renderer bundle
  2c) register the oc-file:// scheme
  2d) insert the oc-file handler block
  2e) call registerOcFileProtocol()
and copies the updated filetree-menu.js into place.

Run from a clean node:  python patch/scripts/apply_patch2.py
"""

import io, sys, shutil, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EXTRACT = r"D:\新项目\优化opencode\app.asar.extracted"
MENU_SRC = r"D:\新项目\优化opencode\patch\filetree-menu.js"
RENDERER_MAIN = os.path.join(EXTRACT, "out", "renderer", "assets", "main-BMZ7e6bl.js")
MAIN_INDEX = os.path.join(EXTRACT, "out", "main", "index.js")

patches_done = []


def patch_file(path, old, new, expect=1):
    s = open(path, encoding="utf-8", errors="replace").read()
    n = s.count(old)
    if n != expect:
        print(f"[FAIL] {os.path.basename(path)}: expected {expect} match(es), found {n}")
        print(f"       anchor head: {old[:80]!r}")
        sys.exit(1)
    s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)
    patches_done.append(f"{os.path.basename(path)} ({n}x): {old.splitlines()[0].strip()[:60]}")


# 1f) expose markdown pipeline
r = RENDERER_MAIN
old = "function parseMarkdown(text2) {\n"
new = (
    "globalThis.__ocParseMarkdown = (text2) => parseMarkdown(text2).then(sanitizeMarkdown);\n"
    "function parseMarkdown(text2) {\n"
)
patch_file(r, old, new)

# 2c) oc-file scheme
m = MAIN_INDEX
old = (
    "protocol.registerSchemesAsPrivileged([\n"
    "  {\n"
    "    scheme: rendererProtocol,\n"
    "    privileges: {\n"
    "      secure: true,\n"
    "      standard: true,\n"
    "      supportFetchAPI: true,\n"
    "      stream: true\n"
    "    }\n"
    "  }\n"
    "]);\n"
)
new = (
    "protocol.registerSchemesAsPrivileged([\n"
    "  {\n"
    "    scheme: rendererProtocol,\n"
    "    privileges: {\n"
    "      secure: true,\n"
    "      standard: true,\n"
    "      supportFetchAPI: true,\n"
    "      stream: true\n"
    "    }\n"
    "  },\n"
    "  {\n"
    "    scheme: \"oc-file\",\n"
    "    privileges: {\n"
    "      secure: true,\n"
    "      standard: true,\n"
    "      supportFetchAPI: true,\n"
    "      stream: true\n"
    "    }\n"
    "  }\n"
    "]);\n"
)
patch_file(m, old, new)

# 2d) handler block
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
old = "function loadWindow(win, html) {\n"
new = OCFILE_HANDLER + "function loadWindow(win, html) {\n"
patch_file(m, old, new)

# 2e) wire up
old = "  registerRendererProtocol();\n"
new = "  registerRendererProtocol();\n  registerOcFileProtocol();\n"
patch_file(m, old, new)

# menu script
shutil.copyfile(MENU_SRC, os.path.join(EXTRACT, "out", "renderer", "filetree-menu.js"))
patches_done.append("filetree-menu.js -> out/renderer/filetree-menu.js")

print("ALL INCREMENTAL PATCHES OK:")
for p in patches_done:
    print("  -", p)
