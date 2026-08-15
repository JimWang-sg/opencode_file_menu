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
  const dump = await evalJs(`(function(){
     var out={};
     out.tabs=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]')).map(function(t){return (t.textContent||'').trim().slice(0,30);});
     var fc=document.querySelector('[data-component="file"]');
     out.file={ mode: fc?fc.getAttribute('data-mode'):null, tabindex: fc?fc.getAttribute('tabindex'):null, cls: fc?fc.className.slice(0,40):null };
     var dcs=[].slice.call(document.querySelectorAll('diffs-container'));
     out.diffsCount=dcs.length;
     out.diffs=dcs.map(function(dc){
       var sr=dc.shadowRoot;
       if(!sr) return { noShadow:true };
       var all=[].slice.call(sr.querySelectorAll('*'));
       var tags={}; for(var i=0;i<all.length;i++){ var t=all[i].tagName.toLowerCase(); tags[t]=(tags[t]||0)+1; }
       // search html for number patterns
       var html=sr.innerHTML;
       var m=html.match(/(line[-_ ]?number|gutter|lineno|number-column|--diffs-number)[^>]{0,80}/gi)||[];
       return { htmlLen: html.length, tagCounts: tags, hits: m.slice(0,10) };
     });
     // body text visible in file area
     var area=document.querySelector('[data-component="file"]');
     out.visibleText=(area&&area.textContent||'').replace(/\s+/g,' ').trim().slice(0,150);
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
