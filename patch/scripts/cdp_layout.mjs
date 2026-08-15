// Dump overall layout: visible regions, tabs, main content area
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
      return "EXC: " + (r.result.exceptionDetails.text || "") + " " + JSON.stringify(r.result.exceptionDetails.exception || {});
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  // Try activating the tab with robust code first
  console.log(await evalJs(
    `(function(){
       var tabs=[].slice.call(document.querySelectorAll('[role="tab"]'));
       var names=tabs.map(function(t){return (t.textContent||'').trim().slice(0,30);});
       var target=null;
       for(var i=0;i<tabs.length;i++){ if((tabs[i].textContent||'').indexOf('filetree-menu')>=0) target=tabs[i]; }
       if(target){ target.click(); return 'clicked filetree-menu tab'; }
       return 'tabs: '+JSON.stringify(names);
     })()`
  ));
  await sleep(2000);

  const dump = await evalJs(
    `(function(){
       var out={};
       // visible blocks with data-component, top-level-ish
       var seen=[];
       document.querySelectorAll('[data-component]').forEach(function(el){
         var n=el.getAttribute('data-component');
         if(n!=='icon' && n!=='file-icon' && n!=='tooltip-v2-trigger' && n!=='icon-button-v2' && seen.indexOf(n)<0){
           seen.push(n);
           var vis=el.offsetParent!==null;
           var r=el.getBoundingClientRect();
           out[n]={vis:vis, w:Math.round(r.width), h:Math.round(r.height), cls:String(el.className).slice(0,45)};
         }
       });
       // tabs list
       out._tabs=[].slice.call(document.querySelectorAll('[role="tab"]')).map(function(t){return (t.textContent||'').trim().slice(0,30);});
       // pre elements
       out._pre=[].slice.call(document.querySelectorAll('pre')).map(function(p){return {vis:p.offsetParent!==null, len:p.textContent.length};});
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
