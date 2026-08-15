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
    if (msg.method === "Runtime.consoleAPICalled" || msg.method === "Runtime.exceptionThrown" || msg.method === "Log.entryAdded") {
      let text = "";
      if (msg.method === "Runtime.exceptionThrown") {
        text = "EXC: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "");
      } else if (msg.method === "Runtime.consoleAPICalled") {
        text = "CONSOLE[" + msg.params.type + "]: " + (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
      } else {
        text = "LOG: " + (msg.params.entry?.text || "");
      }
      if (/file|tree|watch|error|except|fail/i.test(text)) {
        console.log(text.slice(0, 300));
      }
    }
  };
  await new Promise((resolve) => (ws.onopen = resolve));
  await send("Runtime.enable");
  await send("Log.enable");

  // capture for 5 seconds while doing a file change
  const TEST = "D:/新项目/优化opencode/__live_probe.txt";
  await send("Runtime.evaluate", { expression: `(async function(){try{await window.api.fs.write(${JSON.stringify(TEST)},'y')}catch(e){}})()`, returnByValue: true });
  await sleep(4000);
  await send("Runtime.evaluate", { expression: `(async function(){try{await window.api.fs.remove(${JSON.stringify(TEST)})}catch(e){}})()`, returnByValue: true });
  await sleep(2000);
  console.log("--- capture done ---");

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
