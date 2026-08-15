import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

NODE_CHUNK = r"D:\新项目\优化opencode\app.asar.extracted\out\main\chunks\node-4IhTfWZ9.js"
RENDER = r"D:\新项目\优化opencode\app.asar.extracted\out\renderer\assets\main-BMZ7e6bl.js"

def apply(path, old, new, label):
    s = open(path, encoding="utf-8", errors="replace").read()
    n = s.count(old)
    if n != 1:
        print(f"[{label}] FAIL: anchor count={n}")
        return False
    s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)
    print(f"[{label}] OK")
    return True

# 1. server: subscribe watcher for any directory (drop vcs requirement)
apply(
    NODE_CHUNK,
    "if (location2.vcs && (yield* Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER)) {",
    "if (yield* Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER) {",
    "server watcher vcs-requirement removed",
)

# 2. renderer: expose tree.dir so the polling fallback can enumerate loaded dirs
apply(
    RENDER,
    "isLoaded: (path) => Boolean(tree.dir[path]?.loaded), reset: reset2 }",
    "isLoaded: (path) => Boolean(tree.dir[path]?.loaded), reset: reset2, dir: tree.dir }",
    "tree-store exposes dir",
)

# 3. renderer: guard the polling fallback against a missing dir store + faster interval
render = open(RENDER, encoding="utf-8", errors="replace").read()
old_fb = "const dirs2 = Object.keys(tree.dir);"
new_fb = "const dirs2 = tree.dir && typeof tree.dir === \"object\" ? Object.keys(tree.dir) : [];"
n = render.count(old_fb)
if n != 1:
    print(f"[fallback guard] FAIL: anchor count={n}")
else:
    render = render.replace(old_fb, new_fb)
    open(RENDER, "w", encoding="utf-8").write(render)
    print("[fallback guard] OK")

old_int = "fsTreeFallbackTimer = window.setInterval(fsTreeFallbackRun, 20000);"
new_int = "fsTreeFallbackTimer = window.setInterval(fsTreeFallbackRun, 5000);"
n = render.count(old_int)
if n != 1:
    print(f"[fallback interval] FAIL: anchor count={n}")
else:
    render = render.replace(old_int, new_int)
    open(RENDER, "w", encoding="utf-8").write(render)
    print("[fallback interval] OK (20s -> 5s)")

print("DONE")
