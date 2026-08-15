// Inspect review tab element structure and preview container geometry
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      return "EXC: " + JSON.stringify(r.result.exceptionDetails.exception || {});
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const dump = await evalJs(
    `(function(){
       var out={tabs:[],containers:[]};
       document.querySelectorAll('[role="tab"]').forEach(function(t,i){
         var attrs={};
         for(var k=0;k<t.attributes.length;k++){var a=t.attributes[k];attrs[a.name]=a.value.slice(0,60);}
         var r=t.getBoundingClientRect();
         out.tabs.push({i:i, text:(t.textContent||'').trim().slice(0,30), attrs:attrs,
           active:t.getAttribute('data-state')||t.getAttribute('aria-selected')||'', vis:t.offsetParent!==null,
           x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height)});
       });
       var f=document.querySelector('[data-component="file"]');
       if(f){
         var fr=f.getBoundingClientRect();
         out.file={x:Math.round(fr.left), y:Math.round(fr.top), w:Math.round(fr.width), h:Math.round(fr.height)};
         // walk up to find the bounded preview container
         var p=f;
         for(var d=0;p&&d<8;d++){
           var st=getComputedStyle(p);
           var pr=p.getBoundingClientRect();
           out.containers.push({d:d, tag:p.tagName, pos:st.position,
             cls:(p.className&&typeof p.className==='string'?String(p.className).slice(0,45):''),
             x:Math.round(pr.left), y:Math.round(pr.top), w:Math.round(pr.width), h:Math.round(pr.height)});
           p=p.parentElement;
         }
       }
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log(dump);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
