// 连接 Electron 主进程 inspector，捕获启动早期异常堆栈
// 配合 OpenCode.exe 以 --inspect-brk=9333 启动
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 等待 inspector 端口
  let targets = null;
  for (let i = 0; i < 20; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9333/json")).json();
      if (targets && targets.length) break;
    } catch (_) {}
    await sleep(500);
  }
  if (!targets || !targets.length) { console.log("NO INSPECTOR TARGET"); process.exit(1); }
  const url = targets[0].webSocketDebuggerUrl;
  console.log("connecting:", url);
  const ws = new WebSocket(url);
  await new Promise((resolve) => (ws.onopen = resolve));

  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === "Debugger.paused") {
      const frames = msg.params.callFrames || [];
      console.log("=== PAUSED on exception ===");
      frames.slice(0, 12).forEach((f, i) => {
        console.log(`  #${i} ${f.functionName || "(anonymous)"}  ${f.url || ""}:${f.location.lineNumber + 1}`);
      });
      if (msg.params.data) {
        console.log("exception:", JSON.stringify(msg.params.data, null, 2).slice(0, 500));
      }
      // 收集后退出
      console.log("DONE");
      process.exit(0);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      console.log("=== Runtime.exceptionThrown ===");
      console.log("text:", d.text);
      console.log("exception:", JSON.stringify(d.exception || {}).slice(0, 300));
      if (d.stackTrace) {
        (d.stackTrace.callFrames || []).slice(0, 10).forEach((f) => {
          console.log(`  ${f.functionName || "(anonymous)"}  ${f.url}:${f.lineNumber + 1}`);
        });
      }
    }
  };

  await send("Runtime.enable");
  await send("Debugger.enable");
  await send("Debugger.setPauseOnExceptions", { state: "all" });
  await send("Runtime.runIfWaitingForDebugger");
  console.log("resumed, waiting for exception...");
  await sleep(6000);
  console.log("timeout, no exception captured in 6s (or process exited cleanly)");
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
