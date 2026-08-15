import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

b = open(r"D:\新项目\优化opencode\app.asar.extracted\out\renderer\assets\main-BMZ7e6bl.js", encoding="utf-8").read()
m = open(r"D:\新项目\优化opencode\app.asar.extracted\out\main\index.js", encoding="utf-8").read()
p = open(r"D:\新项目\优化opencode\app.asar.extracted\out\preload\index.js", encoding="utf-8").read()
h = open(r"D:\新项目\优化opencode\app.asar.extracted\out\renderer\index.html", encoding="utf-8").read()

def show(label, hay, needle, before=140, after=140, occurrences=1):
    print("=" * 20, label, "=" * 20)
    idx = 0
    n = 0
    while True:
        idx = hay.find(needle, idx)
        if idx < 0:
            break
        n += 1
        print(f"[occ {n}] ...{hay[max(0,idx-before):idx+len(needle)+after]}...")
        print()
        idx += len(needle)
    print(f"-> occurrences: {n} (expected {occurrences})")
    print()

show("v1 node data-path/data-type", b, '"data-path": local.node.path')
show("v2 node data-type", b, '"data-type": local.node.type')
show("FileProvider directory", b, "directory: () => scope(),")
show("FileTree __ocFileDir", b, "globalThis.__ocFileDir")
show("main copyTree", m, "async function copyTree(src, dest) {")
show("main fs-clipboard-write", m, '"fs-clipboard-write"')
show("preload fs namespace", p, "fs: {")
show("index.html script tag", h, 'filetree-menu.js')
