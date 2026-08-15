const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const frames = [];
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
    if (msg.method === "Network.webSocketCreated") {
      frames.push("WS-CREATED: " + (msg.params.requestId || "") + " " + (msg.params.url || ""));
    }
    if (msg.method === "Network.webSocketFrameReceived") {
      const payload = (msg.params.response && msg.params.response.payloadData) || "";
      let nice = payload;
      if (payload.length > 400) nice = payload.slice(0, 400) + "...";
      frames.push("WS-RECV: " + nice);
    }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  await send("Network.enable");

  // trigger a file create via our fs IPC
  const TEST = "D:/新项目/优化opencode/__ws_probe.txt";
  await send("Runtime.evaluate", {
    expression: `(async function(){try{await window.api.fs.write(${JSON.stringify(TEST)},'z')}catch(e){}})()`,
    returnByValue: true,
  });
  await sleep(3000);
  await send("Runtime.evaluate", {
    expression: `(async function(){try{await window.api.fs.remove(${JSON.stringify(TEST)})}catch(e){}})()`,
    returnByValue: true,
  });
  await sleep(2000);

  console.log("frames captured:", frames.length);
  frames.forEach((f) => console.log(f));
  const watcherFrames = frames.filter((f) => /watcher|file|update/i.test(f));
  console.log("watcher-related frames:", watcherFrames.length);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
