// Dump diffs-container shadow DOM PRE structure
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
       if(!dc||!dc.shadowRoot) return 'no diffs-container shadow';
       var sr=dc.shadowRoot;
       var pre=sr.querySelector('pre');
       if(!pre) return 'no pre in shadow';
       var out={
         preAttrs: (function(){var o={};for(var i=0;i<pre.attributes.length;i++){o[pre.attributes[i].name]=pre.attributes[i].value;}return o;})(),
         preChildren: pre.children.length,
         firstChildTag: pre.children[0]?pre.children[0].tagName:'',
         firstChildHTML: pre.children[0]?pre.children[0].outerHTML.slice(0,400):'',
         preTextLen: pre.textContent.length,
         preTextStart: pre.textContent.slice(0,300)
       };
       // siblings around pre
       out.preParentCls=pre.parentElement?String(pre.parentElement.className).slice(0,60):'';
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
