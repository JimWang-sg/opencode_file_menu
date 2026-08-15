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

  await evalJs(
    "window.__ocErr=[];window.addEventListener('error',e=>window.__ocErr.push('ERR:'+e.message));window.addEventListener('unhandledrejection',e=>window.__ocErr.push('REJ:'+String(e.reason)));'ok'"
  );

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');if(!e)return 'null';var r=e.getBoundingClientRect();return JSON.stringify({path:e.getAttribute('data-path'),x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  console.log("row:", JSON.stringify(rowInfo));
  if (rowInfo === "null") {
    console.log("no v2 row visible");
    ws.close();
    return;
  }
  const cx = rowInfo.x + Math.min(40, rowInfo.w / 2);
  const cy = rowInfo.y + rowInfo.h / 2;

  console.log("\n--- real right-click (CDP Input) at", cx, cy, "---");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(300);
  console.log("menu open:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));
  console.log(
    "menu items:",
    await evalJs("Array.from(document.querySelectorAll('#__oc_ft_menu > div')).map(d=>d.textContent).join(' | ')")
  );
  console.log("errors:", JSON.stringify(await evalJs("window.__ocErr")));

  const menuRect = JSON.parse(
    await evalJs(
      `(function(){var m=document.querySelector('#__oc_ft_menu');if(!m)return 'null';var items=m.querySelectorAll('div');var t=items[0];var r=t.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  console.log("\nfirst item rect:", JSON.stringify(menuRect));
  if (menuRect !== "null") {
    const ix = menuRect.x + menuRect.w / 2;
    const iy = menuRect.y + menuRect.h / 2;
    console.log("--- real left-click on first menu item at", ix, iy, "---");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: ix, y: iy, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ix, y: iy, button: "left", clickCount: 1 });
    await sleep(400);
    console.log("modal input present:", await evalJs("!!document.querySelector('#__oc_ft_menu_root input')"));
    console.log("menu still open:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));
    console.log("errors after click:", JSON.stringify(await evalJs("window.__ocErr")));
    console.log(
      "toast texts:",
      await evalJs("Array.from(document.querySelectorAll('#__oc_ft_menu_root > div:not(#__oc_ft_menu)')).map(d=>d.textContent)")
    );
  }

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
