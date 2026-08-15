import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
base = r"D:\cache\temp\2\opencode\installed_asar"

p = open(base + r"\out\preload\index.js", encoding="utf-8", errors="replace").read()
print("preload fs present:", "  fs: {" in p)

m = open(base + r"\out\main\index.js", encoding="utf-8", errors="replace").read()
print("main fs-write present:", "fs-write" in m)
print("main copyTree present:", "copyTree" in m)

b = open(base + r"\out\renderer\assets\main-BMZ7e6bl.js", encoding="utf-8", errors="replace").read()
print("bundle __ocFileDir present:", "__ocFileDir" in b)
print('bundle data-path attr count:', b.count('"data-path": local.node.path'))
print("bundle directory scope present:", "directory: () => scope()" in b)

f = open(base + r"\out\renderer\filetree-menu.js", encoding="utf-8", errors="replace").read()
print("menu guard present:", "const guard" in f)
print("menu noApi present:", "noApi" in f)

h = open(base + r"\out\renderer\index.html", encoding="utf-8", errors="replace").read()
print("index.html includes menu:", "filetree-menu.js" in h)
