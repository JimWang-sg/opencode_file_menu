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
  for (let i = 0; i < 40; i++) { const r = await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`); if (r) break; await sleep(500); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(3000);
  // open patch/filetree-menu.js by clicking its tree row (poll for row)
  let row = null;
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf('filetree-menu.js')>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
    if (r) { row = JSON.parse(r); break; } await sleep(400);
  }
  console.log("row:", row);
  if (row) {
    // expand patch dir first? find row may be inside patch subtree — try clicking it directly
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
    await sleep(50);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
    await sleep(2000);
  }
  const dump = await evalJs(`(function(){
     var file=document.querySelector('[data-component="file"]');
     var out={ file: !!file };
     if(!file) return JSON.stringify(out);
     var mt3=null; var el=file; for(var d=0;el&&d<10;d++){ if(el.classList&&el.classList.contains('mt-3')){ mt3=el; break; } el=el.parentElement; }
     out.mt3=!!mt3;
     // walk the container: list classes and first children
     function describeNode(n, depth, max) {
       var arr=[];
       if(!n || depth>max) return arr;
       var r=n.getBoundingClientRect();
       var tag=n.tagName?n.tagName.toLowerCase():'';
       var cls=(n.className&&typeof n.className==='string')?n.className.slice(0,70):(n.getAttribute&&n.getAttribute('class')||'').slice(0,70);
       var txt=(n.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
       arr.push({ tag: tag, cls: cls, txt: txt, w: Math.round(r.width), h: Math.round(r.height) });
       for(var i=0;i<n.children.length && i<8;i++){ arr=arr.concat(describeNode(n.children[i], depth+1, max)); }
       return arr;
     }
     var nodes=describeNode(mt3||file, 0, 3);
     // any line-number-ish elements anywhere?
     var anyNum=[]; var all=[].slice.call(document.querySelectorAll('*'));
     for(var i=0;i<all.length;i++){ var el=all[i]; if(el.children.length===0 && /^\d+$/.test((el.textContent||'').trim())){ anyNum.push({tag:el.tagName, cls:(el.className||'').slice(0,50)}); if(anyNum.length>8) break; } }
     out.nodes=nodes; out.lineNums=anyNum;
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
