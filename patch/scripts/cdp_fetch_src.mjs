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

  const src = await evalJs(
    `(async function(){try{const r=await fetch('./filetree-menu.js');return await r.text();}catch(e){return 'FETCH_FAIL:'+e.message}})()`
  );
  console.log("len:", src.length);
  const markers = {
    guard: src.includes("const guard"),
    windowListener: src.includes('window.addEventListener("contextmenu"'),
    docListener: src.includes('document.addEventListener("contextmenu"'),
    isInFileTree: src.includes("function isInFileTree"),
    hasV2Row: src.includes('file-tree-v2-row'),
    hasRunSafely: src.includes("runSafely"),
  };
  console.log("markers:", JSON.stringify(markers, null, 2));

  const i = src.indexOf("function isInFileTree");
  console.log("\nisInFileTree:\n", src.slice(i, i + 260));

  const j = src.lastIndexOf("document.addEventListener");
  console.log("\nlast line region:\n", src.slice(j, j + 120));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
