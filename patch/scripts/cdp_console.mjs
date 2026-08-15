const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
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
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
      logs.push("[console:" + msg.params.type + "] " + text.slice(0, 400));
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push("[exception] " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "").slice(0, 500));
    }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  await send("Runtime.enable");

  // trigger file create
  const TEST = "D:/新项目/优化opencode/__cfg_probe.txt";
  await send("Runtime.evaluate", {
    expression: `(async function(){try{await window.api.fs.write(${JSON.stringify(TEST)},'a')}catch(e){}})()`,
    returnByValue: true,
  });
  await sleep(4000);
  await send("Runtime.evaluate", {
    expression: `(async function(){try{await window.api.fs.remove(${JSON.stringify(TEST)})}catch(e){}})()`,
    returnByValue: true,
  });
  await sleep(2000);

  console.log("console entries:", logs.length);
  logs.forEach((l) => console.log(l));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
