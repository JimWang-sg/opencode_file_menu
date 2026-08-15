const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : ("EXC " + JSON.stringify(r.result.exceptionDetails||{})); };
  const DIR = "D:/新项目/优化opencode";
  await evalJs(`window.api.fs.write("${DIR}/_t.md", "# hi");`);
  await sleep(2500);
  const dump = await evalJs(`(function(){
     var out={slots:{}, paths_t:[]};
     [].slice.call(document.querySelectorAll('[data-slot]')).forEach(function(el){ var s=el.getAttribute('data-slot'); out.slots[s]=(out.slots[s]||0)+1; });
     [].slice.call(document.querySelectorAll('[data-path]')).forEach(function(el){ var p=el.getAttribute('data-path')||''; if(p.indexOf('_t')>=0||p.indexOf('4.txt')>=0||p.indexOf('patch')>=0) out.paths_t.push(p); });
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
