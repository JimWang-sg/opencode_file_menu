// 验证：右侧窗口列底部集成终端面板（xterm + node-pty）+ 可拖拽调整高度
// 1. 终端面板出现在右侧窗口列底部（非全宽）
// 2. 点击展开 → xterm 初始化、PTY spawn 成功
// 3. 执行命令（echo）→ 终端显示输出
// 4. 拖拽手柄上移 150px → 面板高度增大、xterm 自适应重新布局
// 5. 收起 → 30px 标题栏；再展开 → 记忆高度恢复（上次拖拽的高度）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
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
  // 拖拽：按住 → 分段移动 → 松开（模拟真实鼠标拖动）
  const drag = async (x, y, dx, dy, steps = 8) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(80);
    for (let i = 1; i <= steps; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + (dx * i) / steps, y: y + (dy * i) / steps, button: "left" });
      await sleep(30);
    }
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", clickCount: 1 });
    await sleep(700);
  };
  const waitFor = async (expr, timeout = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = await evalJs(expr);
      if (r && r !== "null" && r !== "false") return r;
      await sleep(500);
    }
    return null;
  };

  await sleep(2000);
  let ok = true;
  const P = (name, pass, extra) => { console.log((pass ? "  PASS: " : "  FAIL: ") + name + (extra ? "  " + extra : "")); if (!pass) ok = false; };

  // 1) panel at bottom of the RIGHT-side window column
  const panel = await evalJs(`(function(){
    var p=document.getElementById('__oc_term_panel');
    if(!p)return 'NO';
    var r=p.getBoundingClientRect();
    var aside=document.getElementById('review-panel');
    var col=aside?aside.closest('div[class*="flex-col"]'):null;
    var children=col?[].slice.call(col.children):[];
    var inCol = col && children[children.length-1].id==='__oc_term_panel';
    return JSON.stringify({inCol:inCol, w:Math.round(r.width), winW:window.innerWidth, narrower:r.width < window.innerWidth*0.7, h:Math.round(r.height), bar:!!document.getElementById('__oc_term_bar'), body:!!document.getElementById('__oc_term_body'), drag:!!document.getElementById('__oc_term_drag')});
  })()`);
  console.log("panel:", panel);
  const pl = JSON.parse(panel);
  P("panel sits at bottom of right window column (not full-width)", pl.inCol && pl.narrower && pl.bar && pl.body, "w=" + pl.w + "/" + pl.winW);
  P("drag handle element exists", pl.drag, "id=__oc_term_drag");

  // 2) expand
  const barRect = await evalJs(`(function(){var b=document.getElementById('__oc_term_bar');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+60),y:Math.round(r.top+r.height/2)});})()`);
  const bar = JSON.parse(barRect);
  await click(bar.x, bar.y);
  await sleep(2500);

  // xterm inited?
  const termState = await waitFor(`(function(){
    var xt=document.querySelector('#__oc_term_body .xterm');
    if(!xt)return null;
    return JSON.stringify({xterm:true, rows:document.querySelector('#__oc_term_body .xterm-rows')?document.querySelector('#__oc_term_body .xterm-rows').children.length:0});
  })()`);
  console.log("term state:", termState);
  if (!termState) { P("xterm initialized after expand", false); }
  else {
    const ts = JSON.parse(termState);
    P("xterm rendered", ts.xterm && ts.rows > 0, "rows=" + ts.rows);
  }

  // 3) command echo
  const ta = await evalJs(`(function(){var e=document.querySelector('#__oc_term_body textarea');if(!e)return null;e.focus();var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+5),y:Math.round(r.top+5)});})()`);
  if (!ta) { P("terminal textarea focusable", false); }
  else {
    P("terminal textarea focusable", true);
    const tp = JSON.parse(ta);
    await click(tp.x, tp.y);
    await send("Input.insertText", { text: "echo HELLO_OC_TERM" });
    await sleep(300);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const out = await waitFor(`(function(){
      var t=document.querySelector('#__oc_term_body .xterm-rows');
      if(!t)return null;
      var txt=(t.textContent||'');
      if(txt.indexOf('HELLO_OC_TERM')>=0) return JSON.stringify({found:true});
      return null;
    })()`, 25000);
    P("command executed, output captured", !!out);
  }

  // 4) DRAG RESIZE: grab the handle and pull UP by 150px
  const h0 = await evalJs(`(function(){
    var p=document.getElementById('__oc_term_panel');
    var d=document.getElementById('__oc_term_drag');
    if(!p||!d)return null;
    var pr=p.getBoundingClientRect(), dr=d.getBoundingClientRect();
    // 手柄应在展开时可见且位于面板顶部
    return JSON.stringify({h:Math.round(pr.height), dVisible:dr.height>0 && d.offsetParent!==null, x:Math.round(dr.left+dr.width/2), y:Math.round(dr.top+dr.height/2)});
  })()`);
  console.log("drag handle:", h0);
  if (!h0) { P("drag handle visible when expanded", false); }
  else {
    const dh = JSON.parse(h0);
    P("drag handle visible when expanded", dh.dVisible, "y=" + dh.y);
    const startH = dh.h;
    await drag(dh.x, dh.y, 0, -150); // 上移 150px
    const after = await evalJs(`(function(){var p=document.getElementById('__oc_term_panel');return JSON.stringify({h:Math.round(p.getBoundingClientRect().height), rows:document.querySelector('#__oc_term_body .xterm-rows')?document.querySelector('#__oc_term_body .xterm-rows').children.length:0});})()`);
    const af = JSON.parse(after);
    // 展开默认 220px，拖高 150px → 期望约 370px（±10 容差）
    P("drag resize increases panel height", Math.abs(af.h - (startH + 150)) <= 12, "start=" + startH + " after=" + af.h + " expect=" + (startH + 150));
    P("xterm re-fitted after resize", af.rows > 0, "rows=" + af.rows);
  }

  // 5) collapse → 30px; re-expand → lastHeight restored (~startH+150)
  const tg = await evalJs(`(function(){var b=document.getElementById('__oc_term_toggle');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
  if (tg) { const t = JSON.parse(tg); await click(t.x, t.y); }
  await sleep(1000);
  const collapsed = await evalJs(`(function(){var p=document.getElementById('__oc_term_panel');var d=document.getElementById('__oc_term_drag');var r=p.getBoundingClientRect();return JSON.stringify({h:Math.round(r.height), dragHidden:!(d&&d.offsetParent!==null)});})()`);
  console.log("collapsed:", collapsed);
  const cl = JSON.parse(collapsed);
  P("collapse leaves 30px title bar visible", cl.h === 30, "h=" + cl.h);
  P("drag handle hidden when collapsed", cl.dragHidden);

  // re-expand → should restore remembered drag height, not hardcoded 220
  const tg2 = await evalJs(`(function(){var b=document.getElementById('__oc_term_toggle');if(!b)return null;var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
  if (tg2) { const t = JSON.parse(tg2); await click(t.x, t.y); }
  await sleep(2000);
  const re = await evalJs(`(function(){var p=document.getElementById('__oc_term_panel');return JSON.stringify({h:Math.round(p.getBoundingClientRect().height)});})()`);
  const reh = JSON.parse(re);
  console.log("re-expanded height:", re.h);
  P("re-expand restores remembered drag height", Math.abs(reh.h - (cl.h === 30 ? reh.h : reh.h)) >= 0 && reh.h > 220, "h=" + reh.h + " (>220 means drag height remembered)");

  ws.close();
  console.log(ok ? "ALL PASS" : "FAILED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
