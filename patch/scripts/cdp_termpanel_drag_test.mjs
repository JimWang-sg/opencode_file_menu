// 验证：原版终端面板拖拽修复 —— 向下拖到底不消失（collapseThreshold 50 → 0）
// v2 布局的真拖拽手柄是面板正上方那个 8px 横条（div.relative.h-2.shrink-0），
// 不在 #terminal-panel 内部（内部那个 handle 容器 class=hidden，恒隐藏）。
// 1. ctrl+` 打开终端 → #terminal-panel 出现
// 2. 向下拖手柄 +700px（模拟"拉到底"）→ 面板高度 clamp 到 min:100，不消失
// 3. 向上拖回 → 高度恢复（可还原）
// 4. 关闭所有会话 → 面板关闭 → ctrl+` 重新调出（自动新建会话）
// 前置：应用以 OPENCODE_DEBUG_PORT=9222 启动
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) { console.error("FAIL: 未找到页面 target"); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
  ws.onmessage = (ev) => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await new Promise((r) => (ws.onopen = r));
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "EXC:" + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const panelInfo = () => ev(`(() => { const p = document.querySelector('#terminal-panel'); if (!p) return null; const r = p.getBoundingClientRect(); return { h: Math.round(r.height), y: Math.round(r.y), tag: p.tagName, inDoc: document.contains(p) }; })()`);
  // v2 真手柄：面板正上方、同宽的可见 resize-handle（8px 横条）
  const realHandle = () => ev(`(() => {
    const p = document.querySelector('#terminal-panel');
    if (!p) return null;
    const pr = p.getBoundingClientRect();
    for (const h of document.querySelectorAll('[data-component=resize-handle]')) {
      const r = h.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (Math.abs(r.bottom - pr.top) <= 6 && r.left >= pr.left - 4 && r.right <= pr.right + 4) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  })()`);
  const drag = async (x, y, dy, steps = 15) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(80);
    for (let i = 1; i <= steps; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + (dy * i) / steps, button: "left" });
      await sleep(20);
    }
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + dy, button: "left", clickCount: 1 });
    await sleep(900);
  };
  const ctrlTick = async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "`", code: "Backquote", modifiers: 2 });
    await sleep(100);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "`", code: "Backquote", modifiers: 2 });
    await sleep(1500);
  };
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

  // ---------- 1. 打开终端 ----------
  for (let i = 0; i < 3; i++) { if (await panelInfo()) break; await ctrlTick(); }
  const p0 = await panelInfo();
  check("1. ctrl+` 打开终端", !!p0, p0 ? `${p0.tag} h=${p0.h}` : "");
  if (!p0) process.exit(1);
  const h0 = await realHandle();
  check("2. 找到面板上方拖拽手柄", !!h0, h0 ? `@(${h0.x},${h0.y})` : "");

  // ---------- 3. 向下拖到底（不消失） ----------
  if (h0) await drag(h0.x, h0.y, 700);
  const p1 = await panelInfo();
  const ok3 = p1 && p1.inDoc && p1.h >= 90;
  check("3. 向下拖到底面板不消失", ok3, p1 ? `h=${p1.h}（min:100）` : "面板消失!");
  if (!ok3) process.exit(1);

  // ---------- 4. 向上拖回（可还原） ----------
  const h1 = await realHandle();
  if (h1) await drag(h1.x, h1.y, -350);
  const p2 = await panelInfo();
  const ok4 = p2 && p2.inDoc && p2.h > 150;
  check("4. 向上拖回可还原", ok4, p2 ? `h=${p2.h}` : "");

  // ---------- 5. 关闭所有会话后 ctrl+` 重新调出 ----------
  // 点"关闭终端"直到面板关闭
  for (let i = 0; i < 6; i++) {
    const btn = await ev(`(() => { const els = [...document.querySelectorAll('button,[role=button]')]; const el = els.find(e => /关闭终端|Close terminal/i.test((e.textContent||'')+' '+(e.getAttribute('aria-label')||''))); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
    if (!btn) break;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: btn.x, y: btn.y, button: "left", clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: btn.x, y: btn.y, button: "left", clickCount: 1 });
    await sleep(800);
  }
  const closed = await panelInfo();
  check("5. 关闭所有会话后面板关闭", !closed, "已关闭");
  if (closed) { console.log("   (面板仍开着，尝试 ctrl+` 关闭再开)"); await ctrlTick(); }
  await ctrlTick();
  const reopened = await panelInfo();
  const tabsAfterReopen = await ev(`(() => { const p = document.querySelector('#terminal-panel'); return p ? (p.textContent.match(/终端\\s*\\d+/g) || []).length : 0; })()`);
  check("6. ctrl+` 重新调出并自动新建会话", !!reopened && tabsAfterReopen >= 1, reopened ? `h=${reopened.h}, tabs=${tabsAfterReopen}` : "");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${failed.length === 0 ? "ALL PASS ✅" : failed.length + " FAILED ❌"} ====`);
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
