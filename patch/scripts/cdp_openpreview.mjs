// List file-tree rows, click the first file row, then dump the file view DOM
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

  // list rows with path/type
  const rows = await evalJs(
    `(function(){
       var out=[];
       var tree=document.querySelector('[data-component="file-tree-v2"]');
       if(!tree) return 'no tree';
       tree.querySelectorAll('[data-slot="file-tree-v2-row"]').forEach(function(row,i){
         out.push({i:i, path:(row.getAttribute('data-path')||'').slice(-70), type:row.getAttribute('data-type'), sel:row.getAttribute('data-selected')});
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== rows ===");
  console.log(rows);

  // click first FILE row
  const clickResult = await evalJs(
    `(function(){
       var tree=document.querySelector('[data-component="file-tree-v2"]');
       if(!tree) return 'no tree';
       var rows=[].slice.call(tree.querySelectorAll('[data-slot="file-tree-v2-row"]'));
       var target=null;
       for(var i=0;i<rows.length;i++){ var t=rows[i].getAttribute('data-type'); if(t==='file'){target=rows[i];break;} }
       if(!target) return 'no file row; types='+rows.map(function(r){return r.getAttribute('data-type')}).join(',');
       var rect=target.getBoundingClientRect();
       var x=rect.left+Math.min(30,rect.width/2);
       var y=rect.top+Math.min(12,rect.height/2);
       var e=new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,button:0});
       target.dispatchEvent(e);
       return 'clicked row path='+target.getAttribute('data-path').slice(-70);
     })()`
  );
  console.log("=== click ===");
  console.log(clickResult);

  await sleep(1500);

  // dump file view area
  const fileView = await evalJs(
    `(function(){
       var out={tabs:[],files:[]};
       document.querySelectorAll('[data-component="tabs"]').forEach(function(tabs,i){
         var items=[];
         tabs.querySelectorAll('[role="tab"]').forEach(function(tab){ items.push((tab.textContent||'').slice(0,40)); });
         out.tabs.push({i:i, items:items});
       });
       document.querySelectorAll('[data-component="file"]').forEach(function(f,i){
         var pre=f.querySelector('pre');
         var codeEl=f.querySelector('code');
         var lines=pre?pre.textContent.split('\\n').length:0;
         out.files.push({i:i, cls:String(f.className).slice(0,80), hasPre:!!pre, lines:lines,
           codeCls:codeEl?String(codeEl.className).slice(0,60):'', pathAttr:(f.getAttribute('data-path')||'')});
         // ancestry
         var a=[];var p=f;var d=0;
         while(p&&d<6){a.push(p.tagName+(p.className?'.'+String(p.className).slice(0,30):''));p=p.parentElement;d++;}
         out.files[i].ancestry=a;
       });
       return JSON.stringify(out,null,1);
     })()`
  );
  console.log("=== file view ===");
  console.log(fileView);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
