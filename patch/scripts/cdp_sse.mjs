const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SERVER = "http://127.0.0.1:55152";

async function main() {
  // 1. connect SSE
  const ac = new AbortController();
  const sseEvents = [];
  const sseTask = (async () => {
    try {
      const resp = await fetch(`${SERVER}/event`, { signal: ac.signal });
      console.log("SSE status:", resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (/watcher|file|tree/i.test(chunk)) {
            sseEvents.push(chunk.split("\n").join(" | ").slice(0, 300));
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") console.log("SSE error:", e.message);
    }
  })();

  await sleep(1500);

  // 2. create a file via CDP IPC
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

  const TEST = "D:/新项目/优化opencode/__sse_probe.txt";
  console.log("create file...");
  await evalJs(`(async function(){try{return JSON.stringify(await window.api.fs.write(${JSON.stringify(TEST)},'q'))}catch(e){return 'EXC:'+e.message}})()`);
  await sleep(3000);
  console.log("remove file...");
  await evalJs(`(async function(){try{return JSON.stringify(await window.api.fs.remove(${JSON.stringify(TEST)}))}catch(e){return 'EXC:'+e.message}})()`);
  await sleep(3000);

  ac.abort();
  await sseTask;
  console.log("SSE watcher/file events captured:", sseEvents.length);
  sseEvents.slice(0, 30).forEach((e) => console.log("  ", e));
  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
