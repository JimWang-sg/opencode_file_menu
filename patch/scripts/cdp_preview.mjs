// Inspect the current preview pane / file view DOM structure
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
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  // 1) all top-level data-component elements
  const comps = await evalJs(
    `(function(){
       var out=[];
       document.querySelectorAll('[data-component]').forEach(function(el){
         out.push(el.getAttribute('data-component') + ' | ' + (el.className&&String(el.className).slice(0,50)));
       });
       return JSON.stringify(out, null, 1);
     })()`
  );
  console.log("=== data-component elements ===");
  console.log(comps);

  // 2) find code/pre elements (shiki)
  const code = await evalJs(
    `(function(){
       var out=[];
       document.querySelectorAll('pre, .shiki, [data-language], [class*="code"], [class*="Code"]').forEach(function(el){
         if(el.tagName==='PRE' || (el.tagName==='DIV' && el.querySelector('pre'))) {
           var lines = el.textContent ? el.textContent.split('\\n').length : 0;
           var pathAttr = el.closest('[data-path]') ? el.closest('[data-path]').getAttribute('data-path') : '';
           out.push({tag:el.tagName, cls:String(el.className).slice(0,60), lines:lines, nearPath:pathAttr.slice(0,80)});
         }
       });
       return JSON.stringify(out, null, 1);
     })()`
  );
  console.log("=== code/pre elements ===");
  console.log(code);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
