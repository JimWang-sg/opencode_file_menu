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

  console.log("=== listeners on document for contextmenu ===");
  let r = await send("DOMDebugger.getEventListeners", { objectId: null, depth: 1 });
  if (r.error) {
    // need objectId; get it via Runtime.evaluate with returnByValue? No - need object reference.
    console.log("getEventListeners needs objectId:", r.error.message);
  }

  const objId = (
    await send("Runtime.evaluate", { expression: "document", returnByValue: false })
  ).result.result.objectId;
  console.log("document objectId:", objId);
  r = await send("DOMDebugger.getEventListeners", { objectId: objId });
  if (r.error) {
    console.log("error:", r.error.message);
  } else {
    const ls = (r.result.listeners || []).filter((l) => l.type === "contextmenu");
    console.log("contextmenu listeners on document:", ls.length);
    ls.forEach((l, i) => {
      console.log(
        `  [${i}] type=${l.type} useCapture=${l.useCapture} once=${l.once} scriptId=${l.scriptId}`
      );
    });
  }

  console.log("\n=== listeners on window for contextmenu ===");
  const wobj = (await send("Runtime.evaluate", { expression: "window", returnByValue: false })).result.result
    .objectId;
  const wr = await send("DOMDebugger.getEventListeners", { objectId: wobj });
  const wls = (wr.result.listeners || []).filter((l) => l.type === "contextmenu");
  console.log("contextmenu listeners on window:", wls.length);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
