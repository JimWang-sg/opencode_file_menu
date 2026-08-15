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
  // open README.md at root
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p==='README.md'){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
    if (r) { const row = JSON.parse(r);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
      await sleep(50); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: row.x + 20, y: row.y + 12, button: "left", clickCount: 1 });
      break; }
    await sleep(400);
  }
  await sleep(2500);
  const dump = await evalJs(`(function(){
     var dc=document.querySelector('diffs-container');
     if(!dc) return 'no diffs-container';
     var out={};
     out.outerHTML = dc.outerHTML.slice(0, 700);
     var sr=dc.shadowRoot;
     out.hasShadow = !!sr;
     if(sr){
       out.shadowHTML = sr.innerHTML.slice(0, 1400);
       // find scrollers and line numbers inside shadow
       var sc=[].slice.call(sr.querySelectorAll('*')).filter(function(n){ var cs=getComputedStyle(n); return cs.overflowY==='auto'||cs.overflowY==='scroll'; }).map(function(n){ var r=n.getBoundingClientRect(); return {tag:n.tagName, cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,50), w:Math.round(r.width), h:Math.round(r.height)}; });
       out.scrollers=sc.slice(0,5);
       // line number elements: look for elements with text matching digits
       var nums=[];
       var all=[].slice.call(sr.querySelectorAll('*'));
       for(var i=0;i<all.length && nums.length<15;i++){ var n=all[i]; if(n.children.length===0){ var t=(n.textContent||'').trim(); if(/^\d{1,4}$/.test(t)){ var b=n.getBoundingClientRect(); var cs=getComputedStyle(n); nums.push({tag:n.tagName, cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,50), txt:t, x:Math.round(b.left), y:Math.round(b.top), w:Math.round(b.width), h:Math.round(b.height), fs:cs.fontSize, lh:cs.lineHeight}); } } }
       out.lineNums=nums;
       // first few line content elements (the actual text)
       var contents=[];
       for(var i=0;i<all.length && contents.length<5;i++){ var n=all[i]; if(n.children.length===0 && (n.textContent||'').trim().length>5){ var b=n.getBoundingClientRect(); if(b.height>=18){ contents.push({tag:n.tagName, cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,50), txt:(n.textContent||'').trim().slice(0,40), h:Math.round(b.height)}); } } }
       out.contentLeaves=contents;
     }
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
