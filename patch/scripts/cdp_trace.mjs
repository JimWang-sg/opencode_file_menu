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

  await evalJs(
    `(function(){
       window.__trace=[];
       // register at window capture LAST (after app + our script)
       window.addEventListener('mousedown',function(ev){
         var t=ev.target;
         window.__trace.push('W-capture menuExists='+!!document.querySelector('#__oc_ft_menu')+' inMenu='+!!(t&&t.closest('#__oc_ft_menu'))+' tag='+(t&&t.tagName));
         // try to find who removes it: schedule microtask check
         setTimeout(function(){ window.__trace.push('after-100ms menuExists='+!!document.querySelector('#__oc_ft_menu')); },100);
       },true);
       document.addEventListener('mousedown',function(ev){
         var t=ev.target;
         window.__trace.push('D-capture menuExists='+!!document.querySelector('#__oc_ft_menu')+' inMenu='+!!(t&&t.closest('#__oc_ft_menu'))+' tag='+(t&&t.tagName));
       },true);
       document.addEventListener('mousedown',function(ev){
         var t=ev.target;
         window.__trace.push('D-bubble menuExists='+!!document.querySelector('#__oc_ft_menu')+' inMenu='+!!(t&&t.closest('#__oc_ft_menu'))+' tag='+(t&&t.tagName));
       },false);
     })()`
  );

  async function rightClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", clickCount: 1 });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", clickCount: 1 });
    await sleep(300);
  }

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;
  await rightClick(cx, cy);
  const item = JSON.parse(
    await evalJs(
      `(function(){var m=document.querySelector('#__oc_ft_menu');var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if(ds[i].textContent.trim()==='复制路径'){var r=ds[i].getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});}}return null})()`
    )
  );

  await evalJs("window.__trace=[]");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: item.x, y: item.y, button: "left", clickCount: 1 });
  await sleep(300);
  console.log("trace:", JSON.stringify(await evalJs("window.__trace"), null, 1));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
