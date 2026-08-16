// 验证：opencode 原版自带终端（ghostty-web 渲染 + PtyHttpApi 流式 PTY）
// 1. #terminal-panel 面板存在于 DOM（右侧窗口列底部，v1 div / v2 aside 两种变体）
// 2. 点击"新建终端"按钮 → 创建终端标签页（"终端 N"）
// 3. ghostty 渲染出 canvas 且非空（PTY 会话已 spawn，无 error 126）
// 4. 可多开：再点一次"新建终端" → 标签数 +1
//
// 前置：应用以 OPENCODE_DEBUG_PORT=9222 启动；本脚本只读不改，测试后不留垃圾。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) { console.error("FAIL: 未找到页面 target，确认应用以 OPENCODE_DEBUG_PORT=9222 启动"); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "EXC:" + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(600);
  };
  const waitFor = async (expr, timeout = 25000, desc = "条件") => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = await evalJs(expr);
      if (r && r !== "null" && r !== "false") return r;
      await sleep(500);
    }
    console.error(`FAIL: 等待超时（25s）: ${desc}\n   expr: ${expr.slice(0, 120)}`);
    process.exit(1);
  };
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

  // ---------- 1. 面板存在 ----------
  await waitFor("document.querySelector('#terminal-panel') ? true : false", 15000, "#terminal-panel 出现");
  const panelInfo = await evalJs(`(() => { const p = document.querySelector('#terminal-panel'); const r = p.getBoundingClientRect(); return { tag: p.tagName, cls: p.className.slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  check("1. #terminal-panel 面板存在", !!panelInfo, `${panelInfo.tag}# w=${panelInfo.w} h=${panelInfo.h} @(${panelInfo.x},${panelInfo.y}) ${panelInfo.cls}`);

  // ---------- 2. 找"新建终端"按钮并点击 ----------
  // 注意：每开一个新标签，按钮会在 tab 栏内右移（tab 加在按钮左边），故每次点击前重新定位。
  const findBtn = () => evalJs(`(() => {
    const roots = [document.querySelector('#terminal-panel'), document.body].filter(Boolean);
    for (const root of roots) {
      const els = root.querySelectorAll('button, [role=button], [title], [aria-label]');
      for (const el of els) {
        const t = (el.textContent || '').trim() + ' ' + (el.title || '') + ' ' + (el.getAttribute('aria-label') || '');
        if (/新建终端|New terminal/i.test(t)) {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: t.replace(/\\s+/g, ' ').slice(0, 40), tag: el.tagName };
        }
      }
    }
    return null;
  })()`);
  const tabTitles = () => evalJs(`(() => { const el = document.querySelector('#terminal-panel'); return el ? el.textContent.match(/终端\\s*\\d+/g) || [] : []; })()`);
  const btn = await findBtn();
  check("2. 找到「新建终端」按钮", !!btn, btn ? `${btn.tag} @(${Math.round(btn.x)},${Math.round(btn.y)}) text="${btn.text}"` : "");
  if (!btn) process.exit(1);
  const tabBefore = await tabTitles();
  await click(btn.x, btn.y);

  // ---------- 3. 终端标签页出现 ----------
  await waitFor(`(() => { const el = document.querySelector('#terminal-panel'); const m = el ? el.textContent.match(/终端\\s*\\d+/g) || [] : []; return m.length > ${tabBefore.length} ? m : false; })()`, 20000, "新终端标签页出现");
  const tabsAfter = await tabTitles();
  check("3. 终端标签页创建", tabsAfter.length > tabBefore.length, `tabs: [${tabsAfter.join(", ")}]`);

  // ---------- 4. ghostty canvas 渲染且非空（PTY 已 spawn，无 error 126） ----------
  await waitFor(`(() => { const c = document.querySelector('#terminal-panel canvas'); return c && c.width > 0 && c.height > 0 ? true : false; })()`, 20000, "ghostty canvas 出现");
  const canvasInfo = await evalJs(`(() => {
    const c = document.querySelector('#terminal-panel canvas');
    const off = document.createElement('canvas'); off.width = c.width; off.height = c.height;
    const ctx = off.getContext('2d');
    try { ctx.drawImage(c, 0, 0); } catch (e) { return { err: String(e) }; }
    const d = ctx.getImageData(0, 0, off.width, off.height).data;
    let nonEmpty = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonEmpty++;
    return { size: off.width + 'x' + off.height, nonEmpty, total: d.length / 4 };
  })()`);
  check("4. ghostty canvas 非空渲染", canvasInfo && canvasInfo.nonEmpty > 0, canvasInfo ? `${canvasInfo.size} nonEmpty~${canvasInfo.nonEmpty}/${Math.round(canvasInfo.total)}` : String(canvasInfo));

  // ---------- 5. 多开：再点一次 → 标签 +1 ----------
  const tabCount1 = tabsAfter.length;
  const btn2 = await findBtn();
  if (!btn2) { console.error("FAIL: 新建终端按钮消失"); process.exit(1); }
  await click(btn2.x, btn2.y);
  await waitFor(`(() => { const el = document.querySelector('#terminal-panel'); const m = el ? el.textContent.match(/终端\\s*\\d+/g) || [] : []; return m.length > ${tabCount1} ? m : false; })()`, 15000, "第二个终端标签页");
  const tabsFinal = await tabTitles();
  check("5. 多开会话", tabsFinal.length > tabCount1, `tabs: [${tabsFinal.join(", ")}]`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== ${failed.length === 0 ? "ALL PASS ✅" : failed.length + " FAILED ❌"} ====`);
  process.exit(failed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
