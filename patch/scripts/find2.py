import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# usage: python find.py <target-file> <needle-file>   (needle file is UTF-8 raw)
def main():
    target = sys.argv[1]
    needle_file = sys.argv[2]
    needle = open(needle_file, encoding="utf-8").read()
    s = open(target, encoding="utf-8", errors="replace").read()
    idx = [m.start() for m in re.finditer(re.escape(needle), s)]
    print("needle repr:", repr(needle))
    print("count:", len(idx))
    for i in idx[:10]:
        print(f"  @{i} ctx={repr(s[max(0,i-70):i+70])}")

if __name__ == "__main__":
    main()
