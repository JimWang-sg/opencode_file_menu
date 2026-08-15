const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "EXC:" + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const dump = await evalJs(`(function(){
     var dc=document.querySelector('diffs-container');
     if(!dc) return 'none';
     var sr=dc.shadowRoot;
     var ln=sr.querySelector('[data-line-numbers]')||sr.querySelector('[line-numbers]');
     var out={ hasLN: !!ln };
     if(ln){
       var b=ln.getBoundingClientRect();
       var cs=getComputedStyle(ln);
       out.ln={ w:Math.round(b.width), h:Math.round(b.height), left:Math.round(b.left), fs:cs.fontSize, lh:cs.lineHeight, padR:cs.paddingRight, padL:cs.paddingLeft };
       var cols=[].slice.call(ln.querySelectorAll('[data-column-number]')).slice(0,6).map(function(c){ var cb=c.getBoundingClientRect(); var ccs=getComputedStyle(c); return {txt:(c.textContent||'').trim(), w:Math.round(cb.width), x:Math.round(cb.left), fs:ccs.fontSize, lh:ccs.lineHeight, ff:ccs.fontFamily.slice(0,30), color:ccs.color}; });
       out.columns=cols;
       // content: the code/pre inside shadow
       var code=sr.querySelector('code')||sr.querySelector('pre');
       if(code){ var cb=code.getBoundingClientRect(); var ccs=getComputedStyle(code); out.code={ left:Math.round(cb.left), w:Math.round(cb.width), h:Math.round(cb.height), fs:ccs.fontSize, lh:ccs.lineHeight, ff:ccs.fontFamily.slice(0,40), tab:ccs.tabSize, pl:ccs.paddingLeft, pt:ccs.paddingTop }; out.firstLine=code.textContent.slice(0,60); }
     }
     return JSON.stringify(out, null, 1);
   })()`);
  console.log(dump);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
