// Dump the inner structure of the active [data-component="file"] element
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
       var f=document.querySelector('[data-component="file"]');
       if(!f) return 'no file';
       var out={cls:String(f.className), html:f.innerHTML.slice(0,1500)};
       // children pattern
       var kids=[].slice.call(f.children).map(function(c){
         return {tag:c.tagName, cls:String(c.className).slice(0,40), role:c.getAttribute('role')||'', n:c.children.length};
       });
       out.children=kids.slice(0,8);
       out.childrenTotal=f.children.length;
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log(dump);

  // parents of file component
  const parents = await evalJs(
    `(function(){
       var f=document.querySelector('[data-component="file"]');
       var a=[];var p=f;var d=0;
       while(p&&d<12){a.push(p.tagName+(p.id?('#'+p.id):'')+(p.className&&typeof p.className==='string'?'.'+p.className.slice(0,35):''));p=p.parentElement;d++;}
       return JSON.stringify(a,null,1);
     })()`
  );
  console.log("=== file ancestry ===");
  console.log(parents);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
