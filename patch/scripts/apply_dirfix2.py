import io, sys, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RENDER = r"D:\新项目\优化opencode\app.asar.extracted\out\renderer\assets\main-BMZ7e6bl.js"
s = open(RENDER, encoding="utf-8", errors="replace").read()

pat = re.compile(r"isLoaded: \(path\) => Boolean\(tree\.dir\[path\]\?\.loaded\),\s*reset: reset2")
hits = pat.findall(s)
print("regex hits:", len(hits))
if len(hits) == 1:
    orig = hits[0]
    new = orig.rstrip() + ", dir: tree.dir"
    s = pat.sub(lambda m: new, s, count=1)
    open(RENDER, "w", encoding="utf-8").write(s)
    print("OK - tree.dir exposed")
    # verify
    v = open(RENDER, encoding="utf-8").read()
    i = v.find("reset: reset2")
    print("region:", v[i-260:i+40])
else:
    print("FAIL")
