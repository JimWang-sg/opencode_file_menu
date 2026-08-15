import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

def main():
    path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "count"
    pattern = sys.argv[3] if len(sys.argv) > 3 else None
    s = open(path, encoding="utf-8", errors="replace").read()
    if mode == "count":
        print("size:", len(s))
        if pattern:
            print("count:", s.count(pattern))
    elif mode == "re":
        rx = re.compile(pattern)
        for i, m in enumerate(rx.finditer(s)):
            print(f"[{i}] @{m.start()} {m.group(0)[:200]}")
    elif mode == "find":
        i = s.find(pattern)
        print("first at:", i)
        if i >= 0:
            print(s[max(0, i-400):i+400])

if __name__ == "__main__":
    main()
