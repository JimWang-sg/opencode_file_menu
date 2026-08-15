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

  await evalJs(
    `(function(){
       window.__moLog=[];
       var mo=new MutationObserver(function(muts){
         muts.forEach(function(m){
           m.addedNodes.forEach(function(n){
             if(n.id==='__oc_ft_menu') window.__moLog.push('ADD '+Date.now());
           });
           m.removedNodes.forEach(function(n){
             if(n.id==='__oc_ft_menu') window.__moLog.push('REMOVE '+Date.now());
           });
         });
       });
       mo.observe(document.documentElement,{childList:true,subtree:true});
     })()`
  );

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(400);
  console.log("moLog:", JSON.stringify(await evalJs("window.__moLog")));
  console.log("diag:", JSON.stringify(await evalJs("window.__ocFTDiag")));
  console.log("root children:", await evalJs(`(function(){var r=document.querySelector('#__oc_ft_menu_root');return r?r.children.length:'none'})()`));
  console.log("menu now:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
