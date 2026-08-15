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
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return "EXC: " + JSON.stringify(r.result.exceptionDetails.exception || {});
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const dump = await evalJs(`(function(){
     var out={ocFileDir: window.__ocFileDir || '', paths: [], tabs: []};
     document.querySelectorAll('[data-slot="file-tree-v2-row"], [data-slot="file-tree-v2-row"] *').forEach(function(){});
     var rows=[].slice.call(document.querySelectorAll('[data-path]')).slice(0, 40);
     rows.forEach(function(r){ out.paths.push(r.getAttribute('data-path')); });
     [].slice.call(document.querySelectorAll('[role="tab"]')).forEach(function(t){
       out.tabs.push((t.getAttribute('data-key')||'').slice(0,50));
     });
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
