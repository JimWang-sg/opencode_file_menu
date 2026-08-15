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
  const click = async (x, y, btn = "left") => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: btn, clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: btn, clickCount: 1 });
    await sleep(400);
  };
  for (let i = 0; i < 40; i++) { const r = await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`); if (r) break; await sleep(500); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(3000);
  const DIR = "D:/新项目/优化opencode";
  const content = Array.from({ length: 60 }, (_, i) => "行 " + (i + 1) + " 内容 abc").join("\n");
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_nbar.txt")}, ${JSON.stringify(content)})`);
  const findRow = async (part) => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf(${JSON.stringify(part)})>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
      if (r) return JSON.parse(r); await sleep(400);
    }
    return null;
  };
  const row = await findRow("_nbar.txt");
  if (!row) { console.log("FAIL: row not found"); process.exit(1); }
  // click the file in the tree to open native preview
  await click(row.x + 20, row.y + 12);
  await sleep(2500);

  // check toolbar appeared above native preview
  const barCheck = await evalJs(`(function(){
     var bar=document.getElementById('__oc_native_toolbar');
     if(!bar) return JSON.stringify({hasBar:false});
     var br=bar.getBoundingClientRect();
     var file=document.querySelector('[data-component="file"]');
     var el=file; for(var d=0;el&&d<10;d++){ if(el.classList&&el.classList.contains('mt-3')) break; el=el.parentElement; }
     var er=el.getBoundingClientRect();
     var sv=el.querySelector('.scroll-view.h-full');
     var dc=el.querySelector('diffs-container');
     var svr=sv.getBoundingClientRect();
     var dcr=dc?dc.getBoundingClientRect():null;
     var btns=[].slice.call(bar.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();});
     return JSON.stringify({
       hasBar:true, barTop:Math.round(br.top), barBottom:Math.round(br.bottom),
       title:(bar.querySelector('div')?bar.querySelector('div').textContent:''),
       btns:btns,
       mt3Top:Math.round(er.top), mt3Display:getComputedStyle(el).display, mt3FlexDir:getComputedStyle(el).flexDirection,
       svTop:Math.round(svr.top), svH:Math.round(svr.height),
       dcTop:dcr?Math.round(dcr.top):-1, dcH:dcr?Math.round(dcr.height):-1
     }, null, 1);
   })()`);
  console.log("toolbar:", barCheck);
  const b = JSON.parse(barCheck);
  if (!b.hasBar) { console.log("FAIL: no native toolbar"); process.exit(1); }
  if (!b.btns.includes("编辑")) { console.log("FAIL: no 编辑 button in toolbar"); process.exit(1); }

  // click the 编辑 button
  const editBtn = await evalJs(`(function(){var bar=document.getElementById('__oc_native_toolbar');var bs=bar.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='编辑'){var r=bs[i].getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});}}return null;})()`);
  if (!editBtn) { console.log("FAIL: no 编辑 btn pos"); process.exit(1); }
  const eb = JSON.parse(editBtn);
  await click(eb.x, eb.y);
  await sleep(1500);

  // verify in-place editor opened (textarea present, native bar hidden under layer)
  const editState = await evalJs(`(function(){
     var ta=document.querySelector('textarea');
     if(!ta) return JSON.stringify({noEditor:true});
     var layer=ta.closest('#__oc_ft_overlay')||ta.parentElement.parentElement.parentElement;
     var bar=document.getElementById('__oc_native_toolbar');
     var cs=ta?getComputedStyle(ta):null;
     // find the edit layer root
     var c=ta; for(var d=0;c&&d<12;d++){ if(c.style&&c.style.position==='absolute'&&c.style.zIndex==='40') break; c=c.parentElement; }
     return JSON.stringify({
       noEditor:false, hasBarStill: !!bar,
       taValLen: ta.value.length, firstLine: ta.value.split("\\n")[0],
       z40: !!c, hasGutter: !!(c&&c.querySelector('div')&&c.querySelector('div').children.length>1),
       gutterKids: c?c.querySelector('div').children.length:-1
     }, null, 1);
   })()`);
  console.log("edit state:", editState);

  // Esc close
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(800);
  // after closing, native bar should reappear (under normal preview)
  const afterClose = await evalJs(`(function(){var bar=document.getElementById('__oc_native_toolbar');return JSON.stringify({hasBar:!!bar});})()`);
  console.log("after close:", afterClose);

  await evalJs(`window.api.fs.remove(${JSON.stringify(DIR + "/_nbar.txt")})`);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
