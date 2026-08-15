// E2E: right-click a file in the tree -> 编辑 -> in-place editor -> save -> preview reloads
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
  async function rightClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", clickCount: 1 });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", clickCount: 1 });
    await sleep(400);
  }
  async function leftClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(50);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
  }

  const DIR = "D:/新项目/优化opencode";
  const FILE = "_root_test.txt";
  const abs = DIR + "/" + FILE;
  const INIT = "LINE_A\nLINE_B\nLINE_C\nLINE_D\nLINE_E\n";

  // 0) ensure patch is loaded
  console.log("menu script loaded:", await evalJs("!!window.__ocFileTreeMenu"));

  // 1) create the test file
  console.log("create file:", await evalJs(
    `(function(){ return window.api && window.api.fs ? JSON.stringify(window.api.fs.write(${JSON.stringify(abs)}, ${JSON.stringify(INIT)})) : 'no api'; })()`
  ));
  await sleep(1200);

  // 2) find the row in the file tree (may need to be visible already at root level)
  const row = await evalJs(
    `(function(){
       var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
       var r=null;
       for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf(${JSON.stringify(FILE)})>=0){ r=rows[i]; break; } }
       if(!r) return {found:false, paths:rows.map(function(x){return x.getAttribute('data-path');}).slice(0,20)};
       var rect=r.getBoundingClientRect();
       return {found:true, x:Math.round(rect.left), y:Math.round(rect.top), w:Math.round(rect.width), h:Math.round(rect.height),
         type:r.getAttribute('data-type')};
     })()`
  );
  console.log("row:", JSON.stringify(row));
  if (!row.found) {
    console.log("FILE NOT IN TREE — will open by clicking a known file instead (oc_out.txt)");
  }

  // 2b) click the row to open preview (or fallback file)
  let openTarget = row.found ? FILE : "oc_out.txt";
  if (row.found) {
    await leftClick(row.x + 30, row.y + 12);
  } else {
    const fr = await evalJs(
      `(function(){
         var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
         for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf('oc_out.txt')>=0){ var r=rows[i].getBoundingClientRect(); return {x:r.left+30,y:r.top+12}; } }
         return null;
       })()`
    );
    if (!fr) { console.log("no fallback file row"); ws.close(); process.exit(1); }
    await leftClick(fr.x, fr.y);
  }
  await sleep(1800);

  // 3) verify active tab now = the opened file
  const tabState = await evalJs(
    `(function(){
       var out={tabs:[]};
       document.querySelectorAll('[role="tab"]').forEach(function(t){
         var key=t.getAttribute('data-key')||'';
         if(key.indexOf('file://')!==0) return;
         var sel=t.getAttribute('aria-selected')==='true'||t.hasAttribute('data-selected');
         out.tabs.push({key:key.replace('file://',''), sel:sel});
       });
       return JSON.stringify(out);
     })()`
  );
  console.log("tabs:", tabState);

  // 4) right-click the row -> menu -> 编辑
  const rrow = row.found ? row : await evalJs(
    `(function(){
       var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
       for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf(${JSON.stringify(openTarget)})>=0){ var r=rows[i].getBoundingClientRect(); return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}; } }
       return null;
     })()`
  );
  if (!rrow) { console.log("no row to right-click"); ws.close(); process.exit(1); }
  await rightClick(rrow.x + 40, rrow.y + 12);
  const menuItems = await evalJs(
    `(function(){
       var m=document.querySelector('#__oc_ft_menu');
       if(!m) return 'no menu';
       return JSON.stringify([].slice.call(m.querySelectorAll('div')).map(function(d){return (d.textContent||'').trim();}).filter(function(t){return t;}));
     })()`
  );
  console.log("menu items:", menuItems);

  // find and click 编辑
  const editItem = await evalJs(
    `(function(){
       var m=document.querySelector('#__oc_ft_menu');
       if(!m) return null;
       var ds=m.querySelectorAll('div');
       for(var i=0;i<ds.length;i++){ if((ds[i].textContent||'').trim()==='编辑'){ var r=ds[i].getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2}); } }
       return null;
     })()`
  );
  console.log("edit item:", editItem);
  if (!editItem) { ws.close(); process.exit(1); }
  const ei = JSON.parse(editItem);
  await leftClick(ei.x, ei.y);
  await sleep(1200);

  // 5) verify in-place editor layer present
  const layer = await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       if(!file) return 'no file comp';
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       if(!c) return 'no container';
       var last=c.lastElementChild;
       if(!last) return 'no layer';
       var ta=last.querySelector('textarea');
       return JSON.stringify({layerTag:last.tagName, layerPos:getComputedStyle(last).position, hasTa:!!ta,
         taValue:ta?ta.value.slice(0,60):'', taLines:ta?ta.value.split('\\n').length:0,
         headText:(last.querySelector('div')||{}).textContent});
     })()`
  );
  console.log("in-place layer:", layer);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
