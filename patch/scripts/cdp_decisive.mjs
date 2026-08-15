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
    const v = r.result && r.result.result ? r.result.result : r;
    return v.value !== undefined ? v.value : (v.description || JSON.stringify(v));
  };

  console.log("root before:", await evalJs("!!document.querySelector('#__oc_ft_menu_root')"));

  await evalJs(`
    (function(){
      window.__ctxProbe = [];
      window.addEventListener('contextmenu', function(e){
        var t = e.target;
        window.__ctxProbe.push({phase:'win-cap', t: t && t.tagName, dp: e.defaultPrevented});
      }, true);
      document.addEventListener('contextmenu', function(e){
        window.__ctxProbe.push({phase:'doc-cap', t: e.target && e.target.tagName, dp: e.defaultPrevented});
      }, true);
      document.body.addEventListener('contextmenu', function(e){
        window.__ctxProbe.push({phase:'body-bubble', t: e.target && e.target.tagName, dp: e.defaultPrevented});
      });
      return 'ok';
    })()
  `);

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');if(!e)return 'null';var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(250);

  console.log("probe:", JSON.stringify(await evalJs("window.__ctxProbe")));
  console.log("root after:", await evalJs("!!document.querySelector('#__oc_ft_menu_root')"));
  console.log(
    "root html:",
    await evalJs(
      `(function(){var r=document.querySelector('#__oc_ft_menu_root');return r ? r.outerHTML.slice(0,300) : 'none'})()`
    )
  );
  console.log("menu:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
