// 验证：永远可见的终端标题栏（底部常驻，仿旧自定义终端控制栏）
// 1. 全局钩子 __ocToggleTerminal / __ocTerminalResize 已注入
// 2. 标题栏 #__oc_term_titlebar 存在且是右列最后一个子项、30px 高（终端关闭时也在）
// 3. 终端关闭 → 点标题栏 → 面板调出（自动新建会话），标题栏仍在底部
// 4. 拖到底(min:100) → 标题栏仍可见 → 点标题栏 → 面板拉回展开
// 5. 正常高度 → 点标题栏按钮 → 面板收起
// 6. 面板收起后标题栏仍在底部
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) { console.error("FAIL: no page"); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((r) => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
  ws.onmessage = (ev) => { const d = JSON.parse(ev.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  await new Promise((r) => (ws.onopen = r));
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "EXC:" + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
  const panelInfo = () => ev(`(() => { const p = document.querySelector('#terminal-panel'); if (!p) return null; const r = p.getBoundingClientRect(); return { h: Math.round(r.height), y: Math.round(r.y), inDoc: document.contains(p) }; })()`);
  const barInfo = () => ev(`(() => {
    const b = document.getElementById('__oc_term_titlebar');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const col = document.querySelector('#review-panel')?.closest('div[class*="flex-col"]');
    const colR = col ? col.getBoundingClientRect() : null;
    const btn = document.getElementById('__oc_term_titlebar_btn');
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), visible: r.width > 0 && r.height > 0, lastChild: col ? col.lastElementChild === b : false, colW: colR ? Math.round(colR.width) : null, colBottom: colR ? Math.round(colR.bottom) : null, barBottom: Math.round(r.bottom), btn: btn ? Math.round(btn.getBoundingClientRect().width) + 'x' + Math.round(btn.getBoundingClientRect().height) : null };
  })()`);
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(1200);
  };
  const clickBar = async () => { const d = await barInfo(); if (!d) return false; await click(d.x + d.w / 2, d.y + d.h / 2); return true; };
  const drag = async (x, y, dy, steps = 15) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(80);
    for (let i = 1; i <= steps; i++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + (dy * i) / steps, button: "left" }); await sleep(20); }
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + dy, button: "left", clickCount: 1 });
    await sleep(900);
  };
  const realHandle = () => ev(`(() => {
    const p = document.querySelector('#terminal-panel');
    if (!p) return null;
    const pr = p.getBoundingClientRect();
    for (const h of document.querySelectorAll('[data-component=resize-handle]')) {
      const r = h.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (Math.abs(r.bottom - pr.top) <= 6 && r.left >= pr.left - 4 && r.right <= pr.right + 4) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
    return null;
  })()`);
  const waitFor = async (fn, timeout = 8000, step = 300) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(step); }
    return null;
  };

  // ---------- 1. 全局钩子 ----------
  const hooks = await ev(`(() => ({ toggle: typeof window.__ocToggleTerminal, resize: typeof window.__ocTerminalResize }))()`);
  check("1. 全局钩子已注入", hooks && hooks.toggle === "function" && hooks.resize === "function", JSON.stringify(hooks));

  // ---------- 2. 标题栏存在（终端关闭时也在），右列最后一个子项、30px 高 ----------
  let panel = await panelInfo();
  if (panel) { // 先确保关闭终端
    await clickBar();
    await sleep(1200);
    panel = await panelInfo();
  }
  await waitFor(async () => { const b = await barInfo(); return b && b.visible ? b : null; });
  let b2 = await barInfo();
  const ok2 = !!b2 && b2.visible && b2.h === 30 && b2.lastChild && Math.abs(b2.barBottom - b2.colBottom) <= 2;
  check("2. 标题栏存在且置底", ok2, b2 ? `${b2.w}x${b2.h}@(${b2.x},${b2.y}) 底部=栏${b2.barBottom}/列${b2.colBottom} 宽${b2.colW} last=${b2.lastChild}` : "未找到");

  // ---------- 3. 点标题栏调出终端 ----------
  const clicked3 = await clickBar();
  const s3 = await waitFor(async () => {
    const p = await panelInfo();
    if (!p) return null;
    const hasCanvas = await ev(`!!document.querySelector('#terminal-panel canvas')`);
    return hasCanvas ? p : null;
  });
  const b3 = await barInfo();
  check("3. 点标题栏调出终端并新建会话", clicked3 && s3 && s3.inDoc && b3 && b3.visible, s3 ? `h=${s3.h}, 栏仍在底部` : "未打开");

  // ---------- 4. 拖到底 → 标题栏可见 → 点击拉回 ----------
  const hd = await realHandle();
  if (hd) await drag(hd.x, hd.y, 700);
  await sleep(600);
  const p4a = await panelInfo();
  check("4a. 已拖到底(不消失)", !!p4a && p4a.h <= 130 && p4a.inDoc, p4a ? `h=${p4a.h}` : "");
  const b4 = await barInfo();
  check("4b. 拖到底时标题栏仍可见", !!b4 && b4.visible, b4 ? `${b4.w}x${b4.h}@(${b4.x},${b4.y})` : "");
  const clicked4 = await clickBar();
  await sleep(1200);
  const p4b = await panelInfo();
  const ok4 = p4b && p4b.h > 300;
  check("4c. 点标题栏拉回展开", clicked4 && ok4, p4b ? `h=${p4b.h}（期望>300）` : "面板消失!");

  // ---------- 5. 点标题栏按钮收起 ----------
  const btn = await ev(`(() => { const b = document.getElementById('__oc_term_titlebar_btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
  if (btn) await click(btn.x, btn.y);
  await sleep(1200);
  const p5 = await panelInfo();
  check("5. 点标题栏按钮收起面板", !!btn && !p5, p5 ? `仍开 h=${p5.h}` : "已收起");

  // ---------- 6. 收起后标题栏仍置底可见 ----------
  const b6 = await barInfo();
  const ok6 = !!b6 && b6.visible && b6.lastChild;
  check("6. 收起后标题栏仍置底可见", ok6, b6 ? `${b6.w}x${b6.h}@(${b6.x},${b6.y}) last=${b6.lastChild}` : "");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${failed.length === 0 ? "ALL PASS ✅" : failed.length + " FAILED ❌"} ====`);
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
