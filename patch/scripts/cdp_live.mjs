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

  const TEST = "D:/新项目/优化opencode/__live_test.txt";
  const before = await evalJs(
    `(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));return JSON.stringify(rows.map(function(r){return r.getAttribute('data-path')}))})()`
  );
  console.log("rows BEFORE:", before);

  const writeRes = await evalJs(
    `(async function(){try{var r=await window.api.fs.write(${JSON.stringify(TEST)},'x');return JSON.stringify(r);}catch(e){return 'EXC:'+e.message}})()`
  );
  console.log("write result:", writeRes);

  for (let i = 1; i <= 6; i++) {
    await sleep(1000);
    const now = await evalJs(
      `(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));var hit=rows.filter(function(r){return r.getAttribute('data-path')==='__live_test.txt'});return JSON.stringify({n:rows.length,found:hit.length})})()`
    );
    console.log(`t+${i}s:`, now);
    if (now.includes('"found":1')) break;
  }

  const del = await evalJs(
    `(async function(){try{var r=await window.api.fs.remove(${JSON.stringify(TEST)});return JSON.stringify(r);}catch(e){return 'EXC:'+e.message}})()`
  );
  console.log("cleanup remove:", del);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
