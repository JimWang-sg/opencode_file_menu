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
  // open 6.txt at root (small file) via tree row
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p==='6.txt'){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
    if (r) { const row = JSON.parse(r);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
      await sleep(50); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
      break; }
    await sleep(400);
  }
  await sleep(2500);
  const dump = await evalJs(`(function(){
     var file=document.querySelector('[data-component="file"]');
     if(!file) return 'no file';
     var mt3=null; var el=file; for(var d=0;el&&d<10;d++){ if(el.classList&&el.classList.contains('mt-3')){ mt3=el; break; } el=el.parentElement; }
     // tabs
     var tabs=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]')).map(function(t){return {txt:(t.textContent||'').trim().slice(0,30), sel:!!t.querySelector('[data-slot="tab-title"][data-selected]')||t.getAttribute('aria-selected')};});
     // any custom layer inside mt3?
     var layers=mt3.querySelectorAll('#__oc_ft_overlay, [data-oc-layer]');
     // text content preview
     var txt=mt3.textContent.trim().replace(/\s+/g,' ').slice(0,120);
     // innerHTML first chunk
     var html=mt3.innerHTML.slice(0,900);
     // leaf text elements (content-ish)
     var leaves=[]; var all=[].slice.call(mt3.querySelectorAll('*'));
     for(var i=0;i<all.length;i++){ var n=all[i]; if(n.children.length===0 && (n.textContent||'').trim()){ var r=n.getBoundingClientRect(); if(r.width>50&&r.height>10){ leaves.push({tag:n.tagName, cls:(typeof n.className==='string'?n.className:'').slice(0,40), txt:(n.textContent||'').trim().slice(0,25)}); if(leaves.length>12)break; } } }
     // any element containing digit runs (line numbers) at line height
     var nums=[];
     for(var i=0;i<all.length;i++){ var n=all[i]; if(n.children.length===0){ var t=(n.textContent||'').trim(); if(/^\d{1,4}$/.test(t)){ var b=n.getBoundingClientRect(); if(b.height>=14&&b.height<=28) nums.push({tag:n.tagName,cls:(typeof n.className==='string'?n.className:'').slice(0,40),txt:t,h:Math.round(b.height)}); } } }
     return JSON.stringify({ tabs: tabs, hasLayer: layers.length>0, text: txt, html: html, leaves: leaves, lineNums: nums.slice(0,12) }, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
