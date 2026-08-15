// Click a tab by label, then dump visible file view
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
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const label = process.argv[2] || "filetree-menu.js";
  const res = await evalJs(
    `(function(){
       var tab=null;
       document.querySelectorAll('[role="tab"]').forEach(function(t){
         if((t.textContent||'').indexOf(${JSON.stringify(label)})>=0){tab=t;}
       });
       if(!tab) return 'no tab '+${JSON.stringify(label)};
       var rect=tab.getBoundingClientRect();
       tab.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:rect.left+10,clientY:rect.top+10,button:0}));
       return 'clicked tab '${JSON.stringify(label)}'+ at '+Math.round(rect.left)+','+Math.round(rect.top);
     })()`
  );
  console.log(res);
  await sleep(1800);

  // dump file component + visible code areas now
  const dump = await evalJs(
    `(function(){
       var out=[];
       document.querySelectorAll('[data-component="file"]').forEach(function(f,i){
         var pre=f.querySelector('pre');
         var vis=f.offsetParent!==null;
         out.push({i:i, vis:vis, cls:String(f.className).slice(0,60), lines:pre?pre.textContent.split('\\n').length:0,
           path:(f.getAttribute('data-path')||'')});
         var a=[];var p=f;var d=0;
         while(p&&d<8){a.push(p.tagName+(p.id?('#'+p.id):'')+(p.className?'.'+String(p.className).slice(0,25):''));p=p.parentElement;d++;}
         out[i].ancestry=a;
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== file components ===");
  console.log(dump);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
