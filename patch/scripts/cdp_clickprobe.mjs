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
    const v = r.result && r.result.result ? r.result.result : r.result;
    return v && v.value !== undefined ? v.value : undefined;
  };

  await evalJs(
    `(function(){
       window.__clickLog=[];
       ['window','document'].forEach(function(where){
         window.addEventListener('click',function(ev){
           var t=ev.target;
           var inMenu=t&&t.closest&&!!t.closest('#__oc_ft_menu');
           window.__clickLog.push(JSON.stringify({where:'window',inMenu:inMenu,tag:t&&t.tagName,txt:t&&t.textContent&&t.textContent.trim().slice(0,12),def:ev.defaultPrevented}));
         },true);
         document.addEventListener('click',function(ev){
           var t=ev.target;
           var inMenu=t&&t.closest&&!!t.closest('#__oc_ft_menu');
           window.__clickLog.push(JSON.stringify({where:'document',inMenu:inMenu,tag:t&&t.tagName,txt:t&&t.textContent&&t.textContent.trim().slice(0,12),def:ev.defaultPrevented}));
         },true);
       });
     })()`
  );

  async function rightClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", clickCount: 1 });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", clickCount: 1 });
    await sleep(350);
  }
  async function leftClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(50);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
  }

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;

  // open menu
  await rightClick(cx, cy);
  // get item rect via JS (direct DOM query)
  const item = JSON.parse(
    await evalJs(
      `(function(){var m=document.querySelector('#__oc_ft_menu');var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if(ds[i].textContent.trim()==='复制路径'){var r=ds[i].getBoundingClientRect();var e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,hit:e?e.tagName:null,hitCls:e&&e.className,hitIsItem:e===ds[i]});}}return null})()`
    )
  );
  console.log("item probe:", JSON.stringify(item));
  await evalJs("window.__clickLog=[]");
  await leftClick(item.x, item.y);
  console.log("clickLog:", JSON.stringify(await evalJs("window.__clickLog")));
  console.log("menu closed:", await evalJs(`!document.querySelector('#__oc_ft_menu')`));
  console.log("root children:", await evalJs(`document.querySelector('#__oc_ft_menu_root').children.length`));

  // now test JS .click() path on a fresh menu to isolate event pipeline
  await rightClick(cx, cy);
  const jsClickRes = await evalJs(
    `(function(){
       var m=document.querySelector('#__oc_ft_menu');
       var ds=m.querySelectorAll('div');
       for(var i=0;i<ds.length;i++){
         if(ds[i].textContent.trim()==='复制路径'){ds[i].click();return 'clicked-js';}
       }
       return 'item-not-found';
     })()`
  );
  await sleep(400);
  console.log("jsClick:", jsClickRes);
  console.log("root children after js click:", await evalJs(`document.querySelector('#__oc_ft_menu_root').children.length`));
  console.log("root html:", (await evalJs(`document.querySelector('#__oc_ft_menu_root').innerHTML`)).slice(0, 300));

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
