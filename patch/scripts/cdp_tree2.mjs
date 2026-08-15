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
    const v = r.result && r.result.result ? r.result.result : r.result;
    return v && v.value !== undefined ? v.value : undefined;
  };

  const info = await evalJs(
    `(function(){
       var trees=[].slice.call(document.querySelectorAll('[data-component="file-tree-v2"]'));
       var out=[];
       trees.forEach(function(t,i){
         var a=[];var p=t;var depth=0;
         while(p&&depth<8){var tag=p.tagName;var d=p.dataset||{};var id=p.id;var key=(d.component||d.slot||'');var cls=p.className&&typeof p.className==='string'?String(p.className).slice(0,40):'';a.push(tag+(key?'.'+key:'')+(id?('#'+id):'')+ (cls?('|'+cls):''));p=p.parentElement;depth++;}
         out.push({i:i,total:t.getAttribute('data-total-rows'),rows:t.querySelectorAll('[data-slot="file-tree-v2-row"]').length,ancestry:a});
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log(info);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
