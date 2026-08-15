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
  // expand patch, open out-ipc-region.txt
  const findRow = async (pathPart) => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf(${JSON.stringify(pathPart)})>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
      if (r) return JSON.parse(r); await sleep(400);
    }
    return null;
  };
  const patchRow = await findRow("patch");
  if (patchRow) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: patchRow.x + 20, y: patchRow.y + 12, button: "left", clickCount: 1 });
    await sleep(50); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: patchRow.x + 20, y: patchRow.y + 12, button: "left", clickCount: 1 });
    await sleep(1500);
    const fRow = await findRow("out-ipc-region.txt");
    if (fRow) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: fRow.x + 20, y: fRow.y + 12, button: "left", clickCount: 1 });
      await sleep(50); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: fRow.x + 20, y: fRow.y + 12, button: "left", clickCount: 1 });
      await sleep(2500);
    }
  }
  const dump = await evalJs(`(function(){
     var dc=document.querySelector('diffs-container');
     if(!dc) return 'no diffs-container';
     var sr=dc.shadowRoot;
     // css variables resolved
     var cs=getComputedStyle(dc);
     var vars={ mono: cs.getPropertyValue('--font-family-mono').trim().slice(0,80), fsmall: cs.getPropertyValue('--font-size-small').trim(), fbase: cs.getPropertyValue('--font-size-base').trim(), lh: cs.getPropertyValue('--diffs-line-height').trim(), tabsize: cs.getPropertyValue('--diffs-tab-size').trim() };
     if(!sr) return JSON.stringify({ vars: vars, noShadow: true });
     // walk shadow DOM and collect: scrollers, line numbers, code content
     var all=[].slice.call(sr.querySelectorAll('*'));
     var scrollers=[];
     for(var i=0;i<all.length;i++){ var n=all[i]; var o=getComputedStyle(n); if((o.overflowY==='auto'||o.overflowY==='scroll')&&o.position!=='absolute'){ var b=n.getBoundingClientRect(); scrollers.push({tag:n.tagName, cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,60), w:Math.round(b.width), h:Math.round(b.height)}); } }
     var lineNums=[]; var codeLines=[];
     for(var i=0;i<all.length;i++){ var n=all[i]; if(n.children.length===0){ var t=(n.textContent||'').trim(); if(/^\d{1,5}$/.test(t)){ var b=n.getBoundingClientRect(); if(b.height>=14&&b.height<=30&&b.width>0){ var cs2=getComputedStyle(n); lineNums.push({tag:n.tagName,cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,60),txt:t,x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),fs:cs2.fontSize,lh:cs2.lineHeight}); } } } }
     var seen=0;
     for(var i=0;i<all.length&&codeLines.length<6;i++){ var n=all[i]; if(n.children.length===0&&(n.textContent||'').trim().length>3){ var b=n.getBoundingClientRect(); if(b.height>=16){ var cs2=getComputedStyle(n); codeLines.push({tag:n.tagName,cls:(n.getAttribute&&n.getAttribute('class')||'').slice(0,60),txt:(n.textContent||'').trim().slice(0,45),h:Math.round(b.height),fs:cs2.fontSize,lh:cs2.lineHeight,ff:cs2.fontFamily.slice(0,40)}); } } }
     // last portion of shadow html around line numbers (find 'line' or number container)
     var idx=sr.innerHTML.indexOf('1');
     var slice1 = idx>=0 ? sr.innerHTML.slice(idx-300, idx+400) : '';
     return JSON.stringify({ vars: vars, scrollers: scrollers, lineNums: lineNums.slice(0,12), codeLines: codeLines, around: slice1 }, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
