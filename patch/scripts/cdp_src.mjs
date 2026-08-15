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

  console.log("=== loaded filetree-menu.js source (isInFileTree + last lines) ===");
  const src = await evalJs(
    `(function(){var s=document.querySelector('script[src$="filetree-menu.js"]');return s?s.textContent:'script tag not found'})()`
  );
  if (typeof src === "string") {
    console.log("len:", src.length);
    const i = src.indexOf("function isInFileTree");
    console.log("isInFileTree block:\n", i >= 0 ? src.slice(i, i + 400) : "NOT FOUND");
    console.log("\nlast 200 chars:\n", src.slice(-200));
    console.log("\nhas guard line:", src.includes("const guard"));
    console.log("has document.addEventListener:", src.includes('document.addEventListener("contextmenu"'));
  } else {
    console.log("source:", JSON.stringify(src).slice(0, 500));
  }

  console.log("\n=== direct synthetic contextmenu on a BDI inside v2 row ===");
  const r = await evalJs(`
    (function(){
      var bdi = document.querySelector('[data-slot="file-tree-v2-row"] bdi') || document.querySelector('[data-slot="file-tree-v2-row"]');
      if(!bdi) return 'no bdi';
      var ev = new MouseEvent('contextmenu', {bubbles:true, cancelable:true, button:2});
      var dispatched = bdi.dispatchEvent(ev);
      return JSON.stringify({target:bdi.tagName, defaultPrevented:ev.defaultPrevented, dispatched:dispatched});
    })()
  `);
  console.log(r);
  await sleep(200);
  console.log("menu open after synthetic:", await evalJs("!!document.querySelector('#__oc_ft_menu')"));

  console.log("\n=== __ocFileTreeMenu value ===");
  console.log(await evalJs("window.__ocFileTreeMenu"));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
