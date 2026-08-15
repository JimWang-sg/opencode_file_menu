import io, sys, shutil, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EXTRACT = r"D:\新项目\优化opencode\app.asar.extracted"
r = os.path.join(EXTRACT, "out", "renderer", "assets", "main-BMZ7e6bl.js")

s = open(r, encoding="utf-8", errors="replace").read()

if "globalThis.__ocFileDir" in s and s.count("function FileTreeV2(props)") == 1:
    old = (
        "function FileTreeV2(props) {\n"
        '  const file = useFile();\n'
        '  const live = () => props.allowed === void 0;\n'
    )
    new = (
        "function FileTreeV2(props) {\n"
        '  const file = useFile();\n'
        '  globalThis.__ocFileDir = (file.directory && file.directory()) || globalThis.__ocFileDir || "";\n'
        '  const live = () => props.allowed === void 0;\n'
    )
    n = s.count(old)
    if n != 1:
        print(f"FAIL: anchor count {n}")
        sys.exit(1)
    s = s.replace(old, new)
    open(r, "w", encoding="utf-8").write(s)
    print("FileTreeV2 patch applied")
    print("__ocFileDir occurrences now:", s.count("globalThis.__ocFileDir"))
else:
    print("already applied or structure changed")
    print("__ocFileDir occurrences:", s.count("globalThis.__ocFileDir"))
    print("FileTreeV2 count:", s.count("function FileTreeV2(props)"))
