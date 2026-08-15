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

  const res = await evalJs(
    `(function(){
       var out={resources:[], eventSource:false};
       try{
         var entries=performance.getEntriesByType('resource');
         entries.forEach(function(e){
           if(/ws|event|sse|stream|api|server|session/i.test(e.name)) out.resources.push(e.name.slice(0,160));
         });
       }catch(err){out.err=err.message}
       return JSON.stringify(out);
     })()`
  );
  console.log("resources:", res);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
