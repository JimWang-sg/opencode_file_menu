import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RENDER = r"D:\新项目\优化opencode\app.asar.extracted\out\renderer\assets\main-BMZ7e6bl.js"
s = open(RENDER, encoding="utf-8", errors="replace").read()
old = "isLoaded: (path) => Boolean(tree.dir[path]?.loaded), reset: reset2"
new = "isLoaded: (path) => Boolean(tree.dir[path]?.loaded), reset: reset2, dir: tree.dir"
n = s.count(old)
print(f"anchor count: {n}")
if n == 1:
    s = s.replace(old, new)
    open(RENDER, "w", encoding="utf-8").write(s)
    print("OK - tree.dir exposed")
else:
    print("FAIL")
