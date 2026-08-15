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
    await sleep(250);
  };
  for (let i = 0; i < 40; i++) { const r = await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`); if (r) break; await sleep(500); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(3000);
  const findRow = async (pathPart) => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf(${JSON.stringify(pathPart)})>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
      if (r) return JSON.parse(r); await sleep(400);
    }
    return null;
  };
  // open patch/filetree-menu.js
  const patchRow = await findRow("patch");
  if (patchRow) { await click(patchRow.x + 20, patchRow.y + 12); await sleep(1500); }
  const fRow = await findRow("filetree-menu.js");
  console.log("filetree-menu row:", fRow);
  if (!fRow) { console.log("FAIL: no row"); process.exit(1); }
  await click(fRow.x + 20, fRow.y + 12);
  await sleep(2500);
  // right-click -> 编辑
  await click(fRow.x + 40, fRow.y + 12, "right");
  const menu = await evalJs(`(function(){var m=document.querySelector('#__oc_ft_menu');if(!m)return null;var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if((ds[i].textContent||'').trim()==='编辑'){var r=ds[i].getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});}}return null;})()`);
  if (!menu) { console.log("FAIL: no 编辑 menu"); process.exit(1); }
  const mi = JSON.parse(menu);
  await click(mi.x, mi.y);
  await sleep(1200);

  const state = await evalJs(`(function(){
     var layer=null;
     var file=document.querySelector('[data-component="file"]');
     var c=file; for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
     var kids=c?[].slice.call(c.children):[];
     for(var i=kids.length-1;i>=0;i--){ var k=kids[i]; if(k.querySelector('textarea')){ layer=k; break; } }
     if(!layer) return JSON.stringify({noLayer:true});
     var ta=layer.querySelector('textarea');
     var gutter=layer.querySelector('div');
     var body=null;
     // find the flex body (has gutter + textarea)
     for(var i=0;i<layer.children.length;i++){ var ch=layer.children[i]; if(ch.querySelector && ch.querySelector('textarea')) body=ch; }
     var gut=body?body.children[0]:null;
     var gutInner=gut?gut.children[0]:null;
     var nums=gutInner?[].slice.call(gutInner.children).map(function(d){return d.textContent;}):[];
     var cs=ta?getComputedStyle(ta):null;
     // head buttons
     var head=layer.children[0];
     var btns=head?[].slice.call(head.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}):[];
     var headChildren=head?[].slice.call(head.children).map(function(x){return (x.tagName==='BUTTON'?'<btn>':x.textContent||'').trim().slice(0,20);}):[];
     var pv=document.querySelector('.mt-3.relative.h-full.min-h-0');
     return JSON.stringify({
       noLayer:false, hasGutter:!!gut, lineCount: nums.length, first5: nums.slice(0,5), last3: nums.slice(-3),
       taLines: ta?ta.value.split("\\n").length:0,
       tabSize: cs?cs.tabSize:null, fontSize: cs?cs.fontSize:null, lineHeight: cs?cs.lineHeight:null, font: cs?cs.fontFamily.slice(0,45):null,
       btns: btns, head: headChildren,
       taScrollTop: ta?ta.scrollTop:null, gutterScrollTop: gutInner?gutInner.scrollTop:null,
       pvScrollTop: pv?pv.scrollTop:null
     }, null, 1);
   })()`);
  console.log("edit layer:", state);
  const s = JSON.parse(state);
  if (s.noLayer) process.exit(1);
  // scroll the textarea and verify gutter follows
  const syncTest = await evalJs(`(function(){
     var layer=document.querySelector('textarea').closest('#__oc_ft_overlay, div');
     var ta=document.querySelector('textarea');
     var body=ta.parentElement;
     var gutInner=body.children[0].children[0];
     ta.scrollTop = 240; ta.dispatchEvent(new Event('scroll'));
     return JSON.stringify({ ta: ta.scrollTop, gutter: gutInner.scrollTop });
   })()`);
  console.log("after scroll:", syncTest);
  // Esc close
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(600);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
