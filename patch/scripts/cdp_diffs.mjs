// Inspect diffs-container: shadow DOM + line rendering
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
       var dc=document.querySelector('diffs-container');
       if(!dc) return 'no diffs-container';
       var out={shadow:!!dc.shadowRoot, innerHTML: dc.innerHTML.slice(0,600)};
       if(dc.shadowRoot){
         var sr=dc.shadowRoot;
         var rootHtml=sr.innerHTML.slice(0,2000);
         out.shadowHtml=rootHtml;
         out.shadowChildren=[].slice.call(sr.children).map(function(c){return c.tagName+'.'+String(c.className).slice(0,40);});
         out.allSlots=[].slice.call(sr.querySelectorAll('slot')).length;
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
