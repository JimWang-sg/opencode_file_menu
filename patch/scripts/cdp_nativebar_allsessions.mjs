// 跨会话/跨项目验证：每个会话 tab 的文件树点击文件 → 预览窗口上方工具栏（文件名 + 编辑按钮）
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
    await sleep(500);
  };
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = await evalJs(expr);
      if (r && r !== "null") return r;
      await sleep(400);
    }
    return null;
  };

  const getTabs = () => evalJs(`[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]')).map(function(t){return (t.textContent||'').trim();})`);

  const switchTab = async (name) => {
    await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf(${JSON.stringify(name)})>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
    await sleep(2000);
  };

  const findFileRow = async () => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0&&/\\.(txt|md|markdown|html?|json|css|js)$/i.test(p)&&p.indexOf('/.')<0){return JSON.stringify({path:p,x:Math.round(b.left+20),y:Math.round(b.top+12)});}}return null;})()`);
      if (r) return JSON.parse(r);
      await sleep(400);
    }
    return null;
  };

  const checkBar = async (expectName) => {
    const raw = await evalJs(`(function(){
      var bar=document.getElementById('__oc_native_toolbar');
      if(!bar) return JSON.stringify({hasBar:false});
      var r=bar.getBoundingClientRect();
      var btns=[].slice.call(bar.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();});
      var titleEl=bar.firstElementChild;var title=titleEl?titleEl.textContent:'';
      var fk='';var mt3Found=false;
      var file=bar.closest('[data-component="file"]');
      if(file){var el=file;for(var d=0;el&&d<10;d++){if(el.classList&&el.classList.contains('mt-3')){mt3Found=true;fk=getComputedStyle(el).flexDirection;break;}el=el.parentElement;}}
      return JSON.stringify({hasBar:true,top:Math.round(r.top),title:title,btns:btns,mt3Found:mt3Found,flexDir:fk});
    })()`);
    const b = JSON.parse(raw);
    const ok = b.hasBar && b.btns.includes("编辑") && (!expectName || b.title === expectName);
    console.log("  toolbar:", JSON.stringify(b), ok ? "OK" : "FAIL");
    return ok;
  };

  // first wait UI ready
  if (!(await waitFor(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));return tt.length>0?'yes':null;})()`))) { console.log("FATAL: no tabs"); process.exit(1); }
  const tabs = await getTabs();
  console.log("tabs:", JSON.stringify(tabs));

  let allPass = true;
  for (const tab of tabs) {
    if (tab.indexOf("新建会话") >= 0) continue; // 跳过空会话
    console.log("=== tab:", tab, "===");
    await switchTab(tab);
    await sleep(500);
    const row = await findFileRow();
    if (!row) { console.log("  SKIP: no file row visible"); continue; }
    console.log("  click:", row.path);
    await click(row.x, row.y);
    await sleep(2500);
    const name = row.path.split("/").pop();
    const ok = await checkBar(name);
    if (!ok) allPass = false;
  }

  ws.close();
  console.log(allPass ? "ALL PASS" : "SOME FAILED");
  process.exit(allPass ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
