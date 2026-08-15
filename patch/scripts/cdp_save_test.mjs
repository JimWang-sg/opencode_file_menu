// After in-place editor is open: modify content, click 保存, verify reload + disk write
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

  const DIR = "D:/新项目/优化opencode";
  const FILE = "_root_test.txt";
  const abs = DIR + "/" + FILE;
  const NEW_CONTENT = "LINE_A\nLINE_B EDITED\nLINE_C\nLINE_D\nLINE_E\nLINE_F_NEW\n";

  // 1) locate the in-place layer + textarea, set new value
  const setRes = await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       if(!c) return 'no container';
       var last=c.lastElementChild;
       var ta=last?last.querySelector('textarea'):null;
       if(!ta) return 'no editor layer';
       ta.value = ${JSON.stringify(NEW_CONTENT)};
       ta.dispatchEvent(new Event('input',{bubbles:true}));
       return 'set value, now lines='+ta.value.split('\\n').length;
     })()`
  );
  console.log("set:", setRes);

  // 2) click 保存 button inside the layer head
  const saveRes = await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       if(!c) return 'no container';
       var last=c.lastElementChild;
       var btns=last?last.querySelectorAll('button'):[];
       for(var i=0;i<btns.length;i++){ if((btns[i].textContent||'').trim()==='保存'){ btns[i].click(); return 'clicked 保存'; } }
       return 'save btn not found';
     })()`
  );
  console.log("save:", saveRes);
  await sleep(2500);

  // 3) verify: layer removed, disk written, preview reloaded
  const after = await evalJs(
    `(function(){
       var file=document.querySelector('[data-component="file"]');
       var c=file;
       for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
       var layerGone = !(c && c.lastElementChild && c.lastElementChild.querySelector('textarea'));
       var dc=document.querySelector('diffs-container');
       var pre=dc&&dc.shadowRoot?dc.shadowRoot.querySelector('pre'):null;
       var code=pre?pre.querySelector('code'):null;
       var txt=code?code.innerText:'';
       var toast=[].slice.call(document.querySelectorAll('#__oc_ft_menu_root div')).filter(function(d){return d.textContent==='已编辑';}).length;
       return JSON.stringify({layerGone:layerGone, previewHasEdited:txt.indexOf('LINE_B EDITED')>=0, previewHasNew:txt.indexOf('LINE_F_NEW')>=0, toastShown:toast>0});
     })()`
  );
  console.log("after save:", after);

  // 4) verify disk content
  const disk = await evalJs(
    `(function(){ return JSON.stringify(window.api.fs.read(${JSON.stringify(abs)})); })()`
  );
  console.log("disk:", disk);

  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
