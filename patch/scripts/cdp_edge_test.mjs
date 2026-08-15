// Edge tests: (1) Esc cancels in-place edit without writing; (2) editing a file whose preview is NOT open falls back to fullscreen editor
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
  const backup = "LINE_A\nLINE_B EDITED\nLINE_C\nLINE_D\nLINE_E\nLINE_F_NEW\n";

  const openEdit = async () => {
    const rrow = await evalJs(
      `(function(){
         var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
         for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf(${JSON.stringify(FILE)})>=0){ var r=rows[i].getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)}); } }
         return null;
       })()`
    );
    if (!rrow) return "no row";
    const r = JSON.parse(rrow);
    await rightClick(r.x + 40, r.y + 12);
    const editItem = await evalJs(
      `(function(){
         var m=document.querySelector('#__oc_ft_menu');
         if(!m) return null;
         var ds=m.querySelectorAll('div');
         for(var i=0;i<ds.length;i++){ if((ds[i].textContent||'').trim()==='编辑'){ var r=ds[i].getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); } }
         return null;
       })()`
    );
    if (!editItem) return "no edit item";
    const ei = JSON.parse(editItem);
    await leftClick(ei.x, ei.y);
    await sleep(1200);
    return "opened";
  };

  // ---- TEST 1: Esc cancels ----
  console.log("== TEST 1: Esc cancel ==");
  console.log("open:", await openEdit());
  // modify textarea
  await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       var ta=c.lastElementChild.querySelector('textarea');
       ta.value='SHOULD_NOT_BE_SAVED';
       return 'set';
     })()`
  );
  // dispatch Escape via CDP
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(1200);
  const escLayerGone = await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       return !(c && c.lastElementChild && c.lastElementChild.querySelector('textarea'));
     })()`
  );
  console.log("layer gone after Esc:", escLayerGone);
  const diskAfterEsc = await evalJs(`(function(){ return JSON.stringify(window.api.fs.read(${JSON.stringify(abs)})); })()`);
  console.log("disk unchanged check (value has SHOULD_NOT_BE_SAVED?):", diskAfterEsc.indexOf("SHOULD_NOT_BE_SAVED") >= 0 ? "FAIL-was-saved" : "ok-unchanged");

  // ---- TEST 2: edit a file whose preview is NOT open -> fullscreen fallback ----
  console.log("== TEST 2: fullscreen fallback ==");
  // current preview = _root_test.txt; right-click oc_out.txt (closed) -> edit
  const otherRow = await evalJs(
    `(function(){
       var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
       for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf('oc_out.txt')>=0){ var r=rows[i].getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)}); } }
       return null;
     })()`
  );
  if (otherRow) {
    const or = JSON.parse(otherRow);
    await rightClick(or.x + 40, or.y + 12);
    const editItem2 = await evalJs(
      `(function(){
         var m=document.querySelector('#__oc_ft_menu');
         if(!m) return null;
         var ds=m.querySelectorAll('div');
         for(var i=0;i<ds.length;i++){ if((ds[i].textContent||'').trim()==='编辑'){ var r=ds[i].getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); } }
         return null;
       })()`
    );
    if (editItem2) {
      const ei2 = JSON.parse(editItem2);
      await leftClick(ei2.x, ei2.y);
      await sleep(1200);
      const fsState = await evalJs(
        `(function(){
           var fixed=[].slice.call(document.querySelectorAll('div')).filter(function(d){
             return d.style&&d.style.position==='fixed'&&d.style.inset==='0px'&&d.querySelector('textarea');
           });
           return JSON.stringify({fullscreenLayers:fixed.length, firstHead:fixed.length?fixed[0].textContent.slice(0,60):''});
         })()`
      );
      console.log("fullscreen fallback state:", fsState);
      // close it with Esc
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await sleep(800);
    } else {
      console.log("no edit item for oc_out.txt");
    }
  } else {
    console.log("no oc_out.txt row");
  }

  // restore file content
  await evalJs(`(function(){ return JSON.stringify(window.api.fs.write(${JSON.stringify(abs)}, ${JSON.stringify(backup)})); })()`);
  console.log("restored test file");

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
