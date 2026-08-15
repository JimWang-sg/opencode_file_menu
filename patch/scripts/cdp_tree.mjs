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

  // enable console + runtime to capture errors
  await send("Runtime.enable");
  await send("Log.enable");

  const diag = await evalJs(
    `(function(){
       var out={};
       out.hasV2 = !!document.querySelector('[data-component="file-tree-v2"]');
       out.v2Rows = document.querySelectorAll('[data-slot="file-tree-v2-row"]').length;
       out.v1Panel = !!document.querySelector('#file-tree-panel');
       out.__ocFileDir = window.__ocFileDir;
       out.__ocFTDiag = window.__ocFTDiag || null;
       out.sidebarHTML = (function(){var s=document.querySelector('[data-component="file-tree-v2"]');return s?s.outerHTML.slice(0,500):'none'})();
       return JSON.stringify(out);
     })()`
  );
  console.log("tree diag:", diag);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
