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

  // 1. what element is under the click point, and does it resolve to a [data-path] row?
  const probe = await evalJs(
    `(function(){
       var row=document.querySelector('[data-slot="file-tree-v2-row"]');
       if(!row) return {err:'no row'};
       var r=row.getBoundingClientRect();
       var x=r.left+30, y=r.top+14;
       var el=document.elementFromPoint(x,y);
       var res={x:x,y:y, tag:el&&el.tagName, cls:el&&el.className, hasDataPath:!!(el&&el.closest('[data-path]'))};
       if(el&&el.closest('[data-path]')){var n=el.closest('[data-path]'); res.rowPath=n.getAttribute('data-path'); res.rowType=n.getAttribute('data-type');}
       var bg=el;
       for(var d=0;bg&&d<8;d++){ if(bg.dataset&&bg.dataset.component==='file-tree-v2'){res.inV2=true;break;} bg=bg.parentElement; }
       return JSON.stringify(res);
     })()`
  );
  console.log("element probe:", probe);

  // 2. attach a fresh capture listener on window that inspects the contextmenu target
  await evalJs(
    `(function(){
       window.__probeRes=[];
       window.addEventListener('contextmenu',function(ev){
         var el=ev.target;
         var rec={tag:el&&el.tagName, cls:el&&el.className, hasPath:!!(el&&el.closest&&el.closest('[data-path]'))};
         var n=el&&el.closest&&el.closest('[data-path]');
         if(n){rec.path=n.getAttribute('data-path');rec.type=n.getAttribute('data-type');}
         window.__probeRes.push(JSON.stringify(rec));
       },true);
     })()`
  );

  // 3. dispatch real right-click
  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(300);
  console.log("probe results:", JSON.stringify(await evalJs("window.__probeRes")));
  console.log("diag:", JSON.stringify(await evalJs("window.__ocFTDiag")));
  console.log("menu open:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
