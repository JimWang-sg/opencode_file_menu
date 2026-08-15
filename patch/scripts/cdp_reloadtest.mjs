// Test whether clicking an active review tab reloads file content
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
    if (r.result && r.result.exceptionDetails) {
      return "EXC: " + JSON.stringify(r.result.exceptionDetails.exception || {});
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const dir = "D:/新项目/优化opencode";
  const target = "oc_out.txt";
  const abs = dir + "/" + target;

  // 1) write test content via fs bridge
  console.log("write:", await evalJs(
    `(function(){ return window.api && window.api.fs ? JSON.stringify(window.api.fs.write(${JSON.stringify(abs)}, "LINE_A_RELOAD_TEST\\nLINE_B\\n")) : 'no api'; })()`
  ));
  await sleep(800);

  // 2) read current visible preview text
  const before = await evalJs(
    `(function(){
       var dc=document.querySelector('diffs-container');
       var pre=dc&&dc.shadowRoot?dc.shadowRoot.querySelector('pre'):null;
       if(!pre) return 'no pre';
       var code=pre.querySelector('code');
       var txt=code?code.innerText:'';
       return txt.slice(0,120);
     })()`
  );
  console.log("preview BEFORE click:", JSON.stringify(before));

  // 3) click the target tab
  console.log("click:", await evalJs(
    `(function(){
       var tab=null;
       document.querySelectorAll('[role="tab"]').forEach(function(t){ if((t.textContent||'').indexOf(${JSON.stringify(target)})>=0) tab=t; });
       if(!tab) return 'no tab';
       tab.click();
       return 'clicked';
     })()`
  ));
  await sleep(1500);

  // 4) read visible preview text again
  const after = await evalJs(
    `(function(){
       var dc=document.querySelector('diffs-container');
       var pre=dc&&dc.shadowRoot?dc.shadowRoot.querySelector('pre'):null;
       if(!pre) return 'no pre';
       var code=pre.querySelector('code');
       var txt=code?code.innerText:'';
       return txt.slice(0,120);
     })()`
  );
  console.log("preview AFTER click:", JSON.stringify(after));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
