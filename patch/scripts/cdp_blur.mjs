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
       window.__foc=[];
       window.addEventListener('blur',function(ev){window.__foc.push('BLUR target='+(ev.target&&ev.target.tagName)+' hasFocus='+document.hasFocus()+' active='+(document.activeElement&&document.activeElement.tagName));},true);
       window.addEventListener('focus',function(ev){window.__foc.push('FOCUS target='+(ev.target&&ev.target.tagName)+' hasFocus='+document.hasFocus());},true);
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
  console.log("menu open:", await evalJs(`!!document.querySelector('#__oc_ft_menu')`));
  const item = JSON.parse(
    await evalJs(
      `(function(){var m=document.querySelector('#__oc_ft_menu');var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if(ds[i].textContent.trim()==='复制路径'){var r=ds[i].getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});}}return null})()`
    )
  );

  await evalJs("window.__foc=[]");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: item.x, y: item.y, button: "left", clickCount: 1 });
  await sleep(200);
  console.log("after mousePressed: menuOpen=", await evalJs(`!!document.querySelector('#__oc_ft_menu')`));
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: item.x, y: item.y, button: "left", clickCount: 1 });
  await sleep(200);
  console.log("after mouseReleased: menuOpen=", await evalJs(`!!document.querySelector('#__oc_ft_menu')`));
  console.log("focus events:", JSON.stringify(await evalJs("window.__foc")));
  console.log("hasFocus now:", await evalJs("document.hasFocus()"));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
