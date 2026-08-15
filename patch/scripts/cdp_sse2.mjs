const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SERVER = "http://127.0.0.1:55152";
const AUTH = "Basic " + Buffer.from("opencode:843a5c69-1886-4ee8-82ab-5ce0c32411cb").toString("base64");

async function main() {
  const ac = new AbortController();
  const sseEvents = [];
  const sseTask = (async () => {
    try {
      const resp = await fetch(`${SERVER}/event`, {
        headers: { Authorization: AUTH, Accept: "text/event-stream" },
        signal: ac.signal,
      });
      console.log("SSE status:", resp.status);
      if (!resp.ok || !resp.body) return;
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let count = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          count++;
          if (/watcher|file|tree/i.test(chunk)) {
            sseEvents.push(chunk.split("\n").join(" | ").slice(0, 400));
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") console.log("SSE error:", e.message);
    }
  })();

  await sleep(2000);

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
  console.log("creating file...");
  await evalJs(`(async function(){return JSON.stringify(await window.api.fs.write(${JSON.stringify(TEST)},'q'))})()`);
  await sleep(3000);
  console.log("removing file...");
  await evalJs(`(async function(){return JSON.stringify(await window.api.fs.remove(${JSON.stringify(TEST)}))})()`);
  await sleep(3000);

  ac.abort();
  await sseTask;
  console.log("watcher/file-related SSE events:", sseEvents.length);
  sseEvents.slice(0, 30).forEach((e) => console.log("  ", e));
  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
