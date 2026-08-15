// Verify HTML preview iframe actually runs JS + loads relative CSS/SVG via oc-file://
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const events = [];
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) { events.push(msg); } };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr, ctx) => {
    const p = ctx ? { expression: expr, returnByValue: true, awaitPromise: true, contextId: ctx } : { expression: expr, returnByValue: true, awaitPromise: true };
    const r = await send("Runtime.evaluate", p);
    if (r.result && r.result.exceptionDetails) return "EXC: " + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const DIR = "D:/新项目/优化opencode";

  // switch session
  for (let i = 0; i < 40; i++) {
    const ready = await evalJs(`(function(){ var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]')); for(var j=0;j<tt.length;j++){ if((tt[j].textContent||'').indexOf('文件树功能')>=0) return 'yes'; } return null; })()`);
    if (ready) break; await sleep(500);
  }
  await evalJs(`(function(){
     var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));
     for(var i=0;i<tt.length;i++){ var t=tt[i]; if((t.textContent||'').indexOf('文件树功能')>=0){
       var target=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;
       target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
       target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
       target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); break; } }
   })()`);
  await sleep(3000);

  // create files
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_t.html")}, ${JSON.stringify(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Preview Test</title>
<link rel="stylesheet" href="./_t.css"></head>
<body>
<h1>网页预览测试</h1>
<p id="msg">Hello</p>
<img src="./_t.svg" width="80" height="80" alt="svg">
<script>document.getElementById("msg").textContent = "JS ran: " + (1 + 1);</script>
</body></html>`)})`);
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_t.css")}, ${JSON.stringify(`body { background: #1a1a2e; color: #e0e0e0; font-family: sans-serif; }`)})`);
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_t.svg")}, ${JSON.stringify(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="30" fill="#4f8cff"/></svg>`)})`);

  // find row (poll)
  let row = null;
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){
       var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
       for(var j=0;j<rows.length;j++){ var p=rows[j].getAttribute('data-path')||''; if(p.indexOf('_t.html')>=0){ var b=rows[j].getBoundingClientRect(); if(b.width>0&&b.height>0&&b.top>0) return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)}); } }
       return null;
     })()`);
    if (r) { row = JSON.parse(r); break; } await sleep(400);
  }
  if (!row) { console.log("row not found"); process.exit(1); }

  // right-click -> 预览
  await send("Network.enable"); await send("Runtime.enable"); events.length = 0;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: row.x + 40, y: row.y + 12, button: "right", clickCount: 1 });
  await sleep(80);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x + 40, y: row.y + 12, button: "right", clickCount: 1 });
  await sleep(450);
  const menu = await evalJs(`(function(){
     var m=document.querySelector('#__oc_ft_menu'); if(!m) return null;
     var ds=m.querySelectorAll('div');
     for(var i=0;i<ds.length;i++){ if((ds[i].textContent||'').trim()==='预览'){ var r=ds[i].getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); } }
     return null;
   })()`);
  if (!menu) { console.log("menu item 预览 not found"); process.exit(1); }
  const mi = JSON.parse(menu);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: mi.x, y: mi.y, button: "left", clickCount: 1 });
  await sleep(50);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mi.x, y: mi.y, button: "left", clickCount: 1 });
  await sleep(3500); // let iframe + subresources load

  // all oc-file requests seen
  const urls = events.filter((e) => e.method === "Network.responseReceived")
    .map((e) => ({ url: e.params.response.url, status: e.params.response.status }))
    .filter((r) => r.url.indexOf("oc-file://") === 0);
  console.log("oc-file requests:", JSON.stringify(urls, null, 1));
  const fails = events.filter((e) => e.method === "Network.loadingFailed").map((e) => e.params.errorText);
  console.log("loadingFailed:", fails);

  // find oc-file frame -> isolated world to inspect
  const tree = await send("Page.getFrameTree");
  const ocFrame = (function walk(f) {
    if (f.frame && String(f.frame.url || "").indexOf("oc-file://") === 0) return f.frame;
    if (f.childFrames) for (const c of f.childFrames) { const r = walk(c); if (r) return r; }
    return null;
  })(tree.result.frameTree);
  console.log("oc-file frame:", ocFrame ? ocFrame.url : "NOT FOUND");

  if (ocFrame) {
    const iw = await send("Page.createIsolatedWorld", { frameId: ocFrame.id, worldName: "ocverify", grantUniveralAccess: true });
    const ctxId = iw.result.executionContextId;
    const jsState = await evalJs(`(function(){
       var el=document.getElementById('msg');
       var img=document.querySelector('img');
       var bg=getComputedStyle(document.body).backgroundColor;
       var color=getComputedStyle(document.body).color;
       return JSON.stringify({ msg: el?el.textContent:null, bg: bg, color: color, imgLoaded: img?img.naturalWidth>0:false, imgW: img?img.naturalWidth:null, h1: document.querySelector('h1')?document.querySelector('h1').textContent:null });
     })()`, ctxId);
    console.log("iframe JS/CSS/img check:", jsState);
  }
  // Escape close
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(700);
  for (const n of ["_t.html", "_t.css", "_t.svg"]) await evalJs(`window.api.fs.remove(${JSON.stringify(DIR + "/" + n)})`);
  console.log("cleaned");
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
