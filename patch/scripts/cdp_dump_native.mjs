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
  // close any open preview layer via Escape
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(600);
  // click patch dir row to expand
  const findRow = async (pathPart) => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf(${JSON.stringify(pathPart)})>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
      if (r) return JSON.parse(r); await sleep(400);
    }
    return null;
  };
  const patchRow = await findRow("patch");
  console.log("patch dir row:", patchRow);
  if (patchRow) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: patchRow.x + 20, y: patchRow.y + 12, button: "left", clickCount: 1 });
    await sleep(50);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: patchRow.x + 20, y: patchRow.y + 12, button: "left", clickCount: 1 });
    await sleep(1500);
    const fRow = await findRow("filetree-menu.js");
    console.log("filetree-menu row:", fRow);
    if (fRow) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: fRow.x + 20, y: fRow.y + 12, button: "left", clickCount: 1 });
      await sleep(50);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: fRow.x + 20, y: fRow.y + 12, button: "left", clickCount: 1 });
      await sleep(2500);
    }
  }
  const dump = await evalJs(`(function(){
     var file=document.querySelector('[data-component="file"]');
     if(!file) return 'no file';
     var mt3=null; var el=file; for(var d=0;el&&d<10;d++){ if(el.classList&&el.classList.contains('mt-3')){ mt3=el; break; } el=el.parentElement; }
     function describeNode(n, depth, max) {
       var arr=[];
       if(!n || depth>max) return arr;
       var r=n.getBoundingClientRect();
       var tag=n.tagName?n.tagName.toLowerCase():'';
       var cls=(typeof n.className==='string')?n.className.slice(0,60):((n.getAttribute&&n.getAttribute('class'))||'').slice(0,60);
       var txt=(n.textContent||'').trim().replace(/\s+/g,' ').slice(0,30);
       var cs=n.nodeType===1?getComputedStyle(n):null;
       arr.push({ tag: tag, cls: cls, txt: txt, w: Math.round(r.width), h: Math.round(r.height),
         font: cs?cs.fontFamily.slice(0,30):'', fs: cs?cs.fontSize:'', lh: cs?cs.lineHeight:'', pad: cs?cs.paddingTop+','+cs.paddingLeft:'' });
       if(depth<max) for(var i=0;i<n.children.length && i<12;i++){ arr=arr.concat(describeNode(n.children[i], depth+1, max)); }
       return arr;
     }
     var nodes=describeNode(mt3, 0, 3);
     // line number elements? elements whose text is pure digits, height ~ lineheight
     var nums=[];
     var all=[].slice.call(mt3.querySelectorAll('*'));
     for(var i=0;i<all.length;i++){ var n=all[i]; if(n.children.length===0){ var t=(n.textContent||'').trim(); if(/^\d+$/.test(t) && t.length<=4){ var b=n.getBoundingClientRect(); nums.push({tag:n.tagName, cls:(typeof n.className==='string'?n.className:'').slice(0,40), txt:t, h:Math.round(b.height)}); } } }
     return JSON.stringify({ nodes: nodes, lineNumCandidates: nums.slice(0,10) }, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
