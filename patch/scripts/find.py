import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

def main():
    path = sys.argv[1]
    needle = sys.argv[2]
    s = open(path, encoding="utf-8", errors="replace").read()
    import re
    idx = [m.start() for m in re.finditer(re.escape(needle), s)]
    print("needle:", repr(needle))
    print("count:", len(idx))
    for i in idx[:10]:
        print(f"  @{i} ctx={repr(s[max(0,i-60):i+60])}")

if __name__ == "__main__":
    main()
