// Click "open in app" split button, then dump the main session UI structure
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
    if (r.result && r.result.exceptionDetails) return "EXC: " + JSON.stringify(r.result.exceptionDetails.exception || {});
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const clicked = await evalJs(
    `(function(){
       var btn=document.querySelector('.session-review-v2-open-in-app [data-component="split-button-v2-action"], .session-review-v2-open-in-app');
       if(!btn) return 'no open-in-app button';
       btn.click();
       return 'clicked open-in-app';
     })()`
  );
  console.log(clicked);
  await sleep(2500);

  const dump = await evalJs(
    `(function(){
       var out={components:{},tabs:[]};
       var seen={};
       document.querySelectorAll('[data-component]').forEach(function(el){
         var n=el.getAttribute('data-component');
         if(!seen[n]){ seen[n]=true; out.components[n]={cls:String(el.className).slice(0,50), vis:el.offsetParent!==null}; }
       });
       document.querySelectorAll('[role="tab"]').forEach(function(t){
         var key=t.getAttribute('data-key')||'';
         out.tabs.push({text:(t.textContent||'').trim().slice(0,25), key:key.slice(0,50),
           sel:t.getAttribute('aria-selected')==='true'||t.hasAttribute('data-selected')});
       });
       var f=document.querySelector('[data-component="file"]');
       out.hasFile=!!f;
       if(f){
         var pre=f.querySelector('pre');
         out.fileCls=String(f.className).slice(0,60);
         out.fileHasShikiPre=!!pre;
         out.filePreLines=pre?pre.textContent.split('\\n').length:0;
       }
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log(dump);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
