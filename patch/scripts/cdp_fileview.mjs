// Deep dump of the file view: every tabpanel + every [data-component="file"] + code areas
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

  const dump = await evalJs(
    `(function(){
       var out=[];
       // every tabpanel
       document.querySelectorAll('[role="tabpanel"], [data-component="tabs-content"], .tabs-content').forEach(function(panel,pi){
         var comps=[];
         panel.querySelectorAll('[data-component]').forEach(function(c){
           var name=c.getAttribute('data-component');
           if(name==='file'||name==='file-view'||name==='code'||name==='diff'||name.indexOf('file')>=0){
             comps.push(name+'@'+String(c.className).slice(0,50));
           }
         });
         var pre=panel.querySelector('pre');
         out.push({
           panel:pi, cls:String(panel.className).slice(0,70),
           id:panel.id||'', hidden:panel.getAttribute('hidden'),
           hasFile:!!panel.querySelector('[data-component="file"]'),
           fileComps:comps.slice(0,10),
           preLines: pre?pre.textContent.split('\\n').length:0
         });
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== tabpanels ===");
  console.log(dump);

  const files = await evalJs(
    `(function(){
       var out=[];
       document.querySelectorAll('[data-component="file"]').forEach(function(f,i){
         var pre=f.querySelector('pre');
         var inner=f.innerHTML.slice(0,400);
         out.push({i:i, cls:String(f.className), lines:pre?pre.textContent.split('\\n').length:0,
           firstLines:(pre?pre.textContent.slice(0,200):''),
           html:inner});
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== file components ===");
  console.log(files);

  // all visible PRE elements with their text length
  const pres = await evalJs(
    `(function(){
       var out=[];
       document.querySelectorAll('pre').forEach(function(pre,i){
         var vis=pre.offsetParent!==null;
         out.push({i:i, vis:vis, len:pre.textContent.length, cls:String(pre.className).slice(0,50)});
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== all pre ===");
  console.log(pres);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
