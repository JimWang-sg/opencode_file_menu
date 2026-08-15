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

  console.log("=== loaded script markers ===");
  const src = await evalJs(
    `(async function(){try{const r=await fetch('./filetree-menu.js');return await r.text();}catch(e){return 'FETCH_FAIL:'+e.message}})()`
  );
  console.log("len:", src.length);
  console.log("has __ocFTDiag:", src.includes("__ocFTDiag"));
  console.log("has window ctx listener:", src.includes('window.addEventListener("contextmenu"'));
  console.log("has ctxHandler:", src.includes("ctxHandler"));

  console.log("\n=== state ===");
  console.log("__ocFileDir:", JSON.stringify(await evalJs("window.__ocFileDir")));
  console.log("__ocFTDiag before click:", JSON.stringify(await evalJs("window.__ocFTDiag")));

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');if(!e)return 'null';var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  console.log("\nrow:", JSON.stringify(rowInfo));
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "right", clickCount: 1 });
  await sleep(300);

  console.log("\n=== after right-click ===");
  console.log("__ocFTDiag after:", JSON.stringify(await evalJs("window.__ocFTDiag")));
  console.log("menu open:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));
  console.log("root html:", await evalJs(`(function(){var r=document.querySelector('#__oc_ft_menu_root');return r?r.outerHTML.slice(0,200):'none'})()`));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
