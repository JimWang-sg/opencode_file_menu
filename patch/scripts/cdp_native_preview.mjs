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
  // wait for 文件树功能 tab
  for (let i = 0; i < 40; i++) { const r = await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`); if (r) break; await sleep(500); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(3000);
  // create a test txt file at root
  const DIR = "D:/新项目/优化opencode";
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_nativepreview.txt")}, ${JSON.stringify("line one\nline two\nline three\nline four")})`);
  // find its row and click it
  let row = null;
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf('_nativepreview.txt')>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
    if (r) { row = JSON.parse(r); break; } await sleep(400);
  }
  if (!row) { console.log("FAIL: row not found"); process.exit(1); }
  await click(row.x + 20, row.y + 12);
  await sleep(3000);

  const dump = await evalJs(`(function(){
     var file=document.querySelector('[data-component="file"]');
     if(!file) return JSON.stringify({noFile:true});
     var mt3=null; var el=file; for(var d=0;el&&d<10;d++){ if(el.classList&&el.classList.contains('mt-3')){ mt3=el; break; } el=el.parentElement; }
     if(!mt3) return JSON.stringify({noMt3:true});
     var out={ mt3Tag: mt3.tagName, mt3Cls: (mt3.getAttribute&&mt3.getAttribute('class'))||'',
        mt3Pos: getComputedStyle(mt3).position, mt3Display: getComputedStyle(mt3).display,
        mt3FlexDir: getComputedStyle(mt3).flexDirection, mt3Overflow: getComputedStyle(mt3).overflow,
        kids: [] };
     var r=mt3.getBoundingClientRect();
     out.mt3Rect={ top:Math.round(r.top), left:Math.round(r.left), w:Math.round(r.width), h:Math.round(r.height) };
     for(var i=0;i<mt3.children.length;i++){
       var k=mt3.children[i]; var kr=k.getBoundingClientRect();
       var cs=getComputedStyle(k);
       out.kids.push({ tag:k.tagName.toLowerCase(), cls:(k.getAttribute&&k.getAttribute('class'))||'',
         id:k.id||'', pos:cs.position, display:cs.display, flex:cs.flex, flexDir:cs.flexDirection,
         w:Math.round(kr.width), h:Math.round(kr.height), top:Math.round(kr.top),
         txt:(k.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40) });
     }
     var dc=mt3.querySelector('diffs-container');
     out.hasDiffs=!!dc;
     if(dc){ var dr=dc.getBoundingClientRect(); var dcs=getComputedStyle(dc);
       out.diffs={ w:Math.round(dr.width), h:Math.round(dr.height), top:Math.round(dr.top),
         display:dcs.display, position:dcs.position, overflow:dcs.overflow,
         srChildren: dc.shadowRoot?dc.shadowRoot.children.length:0,
         firstLine: (dc.textContent||'').trim().split("\\n")[0] };
     }
     // what does the preview container ancestor look like? file component -> who is parent of mt3
     var chain=[];
     var ce=mt3; for(var d=0;ce&&d<6;d++){ var ccs=getComputedStyle(ce); var cr=ce.getBoundingClientRect();
       chain.push({ tag:ce.tagName.toLowerCase(), cls:(ce.getAttribute&&ce.getAttribute('class')||'').slice(0,50), display:ccs.display, flexDir:ccs.flexDirection, w:Math.round(cr.width), h:Math.round(cr.height) });
       ce=ce.parentElement; }
     out.chain=chain;
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  await evalJs(`window.api.fs.remove(${JSON.stringify(DIR + "/_nativepreview.txt")})`);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
