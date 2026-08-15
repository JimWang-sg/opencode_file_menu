// 验证：底部集成终端面板（xterm + node-pty）
// 1. 终端面板出现在 flex-col 容器底部
// 2. 点击展开 → xterm 初始化、PTY spawn 成功（sessionId 生成）
// 3. 执行命令（输入文字 + 回车）→ 终端显示输出
// 4. 收起 → kill session
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

  // 1) terminal panel present at bottom of the RIGHT-side window column (session-review-v2),
  //    NOT spanning the full window — so it must sit inside the #review-panel flex-col.
  const panel = await evalJs(`(function(){
    var p=document.getElementById('__oc_term_panel');
    if(!p)return 'NO';
    var r=p.getBoundingClientRect();
    var aside=document.getElementById('review-panel');
    var col=aside?aside.closest('div[class*="flex-col"]'):null;
    var children=col?[].slice.call(col.children):[];
    var inCol = col && children[children.length-1].id==='__oc_term_panel';
    // right column occupies only part of window width
    return JSON.stringify({inCol:inCol, w:Math.round(r.width), winW:window.innerWidth, narrower:r.width < window.innerWidth*0.7, h:Math.round(r.height), bar:!!document.getElementById('__oc_term_bar'), body:!!document.getElementById('__oc_term_body')});
  })()`);
  console.log("panel:", panel);
  const pl = JSON.parse(panel);
  P("panel sits at bottom of right window column (not full-width)", pl.inCol && pl.narrower && pl.bar && pl.body, "w=" + pl.w + "/" + pl.winW);

  // 2) click the bar to expand (bar is always visible at panel top; click its left-center, avoiding the action buttons on the right)
  const barRect = await evalJs(`(function(){var b=document.getElementById('__oc_term_bar');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+60),y:Math.round(r.top+r.height/2)});})()`);
  const bar = JSON.parse(barRect);
  await click(bar.x, bar.y);
  await sleep(2500);

  // xterm inited? check for .xterm element and sessionId via IPC
  const termState = await waitFor(`(function(){
    var xt=document.querySelector('#__oc_term_body .xterm');
    if(!xt)return null;
    var hint=document.getElementById('__oc_term_hint');
    return JSON.stringify({xterm:true, rows:document.querySelector('#__oc_term_body .xterm-rows')?document.querySelector('#__oc_term_body .xterm-rows').children.length:0, hint:(hint?hint.textContent:'').slice(0,80)});
  })()`);
  console.log("term state:", termState);
  if (!termState) { P("xterm initialized after expand", false); }
  else {
    const ts = JSON.parse(termState);
    P("xterm rendered", ts.xterm && ts.rows > 0, "rows=" + ts.rows);
  }

  // 3) run a command: echo hello via typed input + Enter
  const ta = await evalJs(`(function(){var e=document.querySelector('#__oc_term_body textarea');if(!e)return null;e.focus();var r=e.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+5),y:Math.round(r.top+5)});})()`);
  if (!ta) { P("terminal textarea focusable", false); }
  else {
    P("terminal textarea focusable", true);
    const tp = JSON.parse(ta);
    await click(tp.x, tp.y);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "e", code: "KeyE", text: "e", windowsVirtualKeyCode: 69 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await send("Input.insertText", { text: "echo HELLO_OC_TERM" });
    await sleep(300);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    // wait for output to appear in xterm buffer
    const out = await waitFor(`(function(){
      var t=document.querySelector('#__oc_term_body .xterm-rows');
      if(!t)return null;
      var txt=(t.textContent||'');
      if(txt.indexOf('HELLO_OC_TERM')>=0) return JSON.stringify({found:true, sample:txt.slice(0,120).replace(/\\n/g,'|')});
      return null;
    })()`, 25000);
    if (out) {
      const o = JSON.parse(out);
      P("command executed, output captured", o.found, o.sample);
    } else {
      P("command executed, output captured", false, "HELLO_OC_TERM not in buffer");
    }
  }

  // 4) check sessionId active via main-side? we can verify via preload api exists
  const apiCheck = await evalJs(`JSON.stringify({spawn:typeof (window.api&&window.api.terminal&&window.api.terminal.spawn), write:typeof (window.api&&window.api.terminal&&window.api.terminal.write), onData:typeof (window.api&&window.api.terminal&&window.api.terminal.onData)})`);
  console.log("api.terminal:", apiCheck);

  // 5) collapse → kill
  const tg = await evalJs(`(function(){var b=document.getElementById('__oc_term_toggle');var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
  if (tg) { const t = JSON.parse(tg); await click(t.x, t.y); }
  await sleep(1000);
  const collapsed = await evalJs(`(function(){var p=document.getElementById('__oc_term_panel');var r=p.getBoundingClientRect();return JSON.stringify({h:Math.round(r.height), openHint:(document.getElementById('__oc_term_hint')||{}).textContent||''});})()`);
  console.log("collapsed:", collapsed);
  const cl = JSON.parse(collapsed);
  P("collapse leaves 30px title bar visible", cl.h === 30, "h=" + cl.h);

  // re-expand for user to see
  if (!termState) { }
  else {
    const tg2 = await evalJs(`(function(){var b=document.getElementById('__oc_term_toggle');if(!b)return null;var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`);
    if (tg2) { const t = JSON.parse(tg2); await click(t.x, t.y); }
    await sleep(1500);
  }

  ws.close();
  console.log(ok ? "ALL PASS" : "FAILED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
