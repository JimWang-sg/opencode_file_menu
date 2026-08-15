// E2E: MD preview, HTML preview via oc-file:// iframe navigation
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
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
    } else if (msg.method) {
      events.push(msg);
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
    await sleep(450);
  }
  async function leftClick(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(50);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
  }

  const DIR = "D:/新项目/优化opencode";

  // wait for UI to be ready, then switch to the session whose project dir is D:\新项目\优化opencode
  for (let i = 0; i < 40; i++) {
    const ready = await evalJs(`(function(){
       var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));
       for(var j=0;j<tt.length;j++){ if((tt[j].textContent||'').indexOf('文件树功能')>=0) return 'yes'; }
       return null;
     })()`);
    if (ready) break;
    await sleep(500);
  }
  // el.click() is insufficient for React here: dispatch full mouse sequence on the inner node.
  const switched = await evalJs(`(function(){
     var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));
     for(var i=0;i<tt.length;i++){ var t=tt[i]; if((t.textContent||'').indexOf('文件树功能')>=0){
       var target=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;
       target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));
       target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));
       target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
       return 'clicked';
     } }
     return 'tab not found';
   })()`);
  console.log("switch session:", switched);
  await sleep(3000);
  const dirNow = await evalJs(`String(window.__ocFileDir || '')`);
  console.log("__ocFileDir after switch:", dirNow);
  await sleep(1500);

  const md = `# 预览测试

段落 **粗体** 与 *斜体* 以及 \`行内代码\`。

\`\`\`js
const hello = "world";
console.log(hello);
\`\`\`

## 列表

- 项目一
- 项目二

## 表格

| 名称 | 值 |
| ---- | --- |
| 苹果 | 5 |
| 香蕉 | 3 |

> 引用文本

[链接](https://example.com)
`;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Preview Test</title>
<link rel="stylesheet" href="./_t.css"></head>
<body>
<h1>网页预览测试</h1>
<p id="msg">Hello</p>
<img src="./_t.svg" width="80" height="80" alt="svg">
<script>document.getElementById("msg").textContent = "JS ran: " + (1 + 1);</script>
</body></html>`;
  const css = `body { background: #1a1a2e; color: #e0e0e0; font-family: sans-serif; }`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="30" fill="#4f8cff"/></svg>`;

  // 1) create test files
  const files = { "_t.md": md, "_t.html": html, "_t.css": css, "_t.svg": svg };
  for (const [name, content] of Object.entries(files)) {
    await evalJs(`(function(){ return window.api.fs.write(${JSON.stringify(DIR + "/" + name)}, ${JSON.stringify(content)}); })()`);
  }
  // filetree refresh ~1s; give it 3s
  await sleep(3000);

  // File tree is a virtual list refreshed ~1s after fs.write; poll up to 15s,
  // and if the row is rendered off-viewport (rect 0), scroll the tree container.
  const findRow = async (file, timeoutMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const rrow = await evalJs(
        `(function(){
           var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));
           for(var i=0;i<rows.length;i++){ var p=rows[i].getAttribute('data-path')||''; if(p.indexOf(${JSON.stringify(file)})>=0){
             var r=rows[i].getBoundingClientRect();
             if(r.width>0 && r.height>0 && r.top>0) return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top)});
             return JSON.stringify({exists:true});
           } }
           return null;
         })()`
      );
      if (!rrow) { await sleep(400); continue; }
      const rr = JSON.parse(rrow);
      if (rr.exists) {
        // rendered but off-viewport -> scroll the tree container down
        await evalJs(`(function(){
           var c=document.querySelector('[data-scope="filetree"]');
           if(!c) c=document.querySelector('[data-component="filetree"]')||document.querySelector('[class*="tree"]');
           if(c){ var v=c.querySelector('*'); c.scrollTop=c.scrollHeight; var sc=c.closest('[class*="scroll"]'); if(sc) sc.scrollTop=sc.scrollHeight; }
           return 1;
         })()`);
        await sleep(300);
        continue;
      }
      return rr;
    }
    return null;
  };
  const clickMenu = async (label) => {
    const m = await evalJs(
      `(function(){
         var m=document.querySelector('#__oc_ft_menu');
         if(!m) return null;
         var ds=m.querySelectorAll('div');
         for(var i=0;i<ds.length;i++){ if((ds[i].textContent||'').trim()===${JSON.stringify(label)}){ var r=ds[i].getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2}); } }
         return null;
       })()`
    );
    if (!m) return false;
    const mi = JSON.parse(m);
    await leftClick(mi.x, mi.y);
    return true;
  };
  const getLayer = `(function(){
     var file=document.querySelector('[data-component="file"]');
     var c=file;
     for(var d=0;c&&d<10;d++){ if(c.classList&&c.classList.contains('mt-3')) break; c=c.parentElement; }
     if(!c) return null;
     var kids=[].slice.call(c.children);
     for(var i=kids.length-1;i>=0;i--){
       var k=kids[i];
       if(k.querySelector('iframe')||k.querySelector('.oc-md')||k.querySelector('textarea')) return k;
     }
     return null;
   })()`;

  // ===== TEST B: HTML preview =====
  console.log("\n== TEST B: HTML preview ==");
  await send("Network.enable");
  await send("Runtime.enable");
  events.length = 0;
  const row = await findRow("_t.html");
  console.log("row found:", row);
  if (row) {
    await rightClick(row.x + 40, row.y + 12);
    const ok = await clickMenu("预览");
    console.log("clicked 预览:", ok);
    await sleep(2000);
    const state = await evalJs(`(function(){
       var layer=${getLayer};
       var fr=layer?layer.querySelector('iframe'):null;
       var bs=layer?[].slice.call(layer.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}):[];
       return JSON.stringify({ hasLayer: !!layer, hasIframe: !!fr, src: fr?fr.getAttribute('src'):null, btns: bs });
     })()`);
    console.log("preview layer:", state);
    const ocResp = events
      .filter((e) => e.method === "Network.responseReceived")
      .map((e) => ({ url: (e.params.response.url || "").slice(0, 60), status: e.params.response.status }))
      .filter((r) => r.url.indexOf("oc-file://") === 0);
    console.log("oc-file responses:", JSON.stringify(ocResp, null, 1));
    const ocFail = events
      .filter((e) => e.method === "Network.loadingFailed")
      .filter((e) => { const url = e.params.requestId; return url; }).length;
    console.log("loadingFailed count:", ocFail);
    // find oc-file frame context to verify JS ran
    await send("Runtime.enable");
    const frames = await send("Page.getFrameTree");
    const ctxs = events.filter((e) => e.method === "Runtime.executionContextCreated");
    const ocCtx = ctxs.filter((c) => String(c.params.context.origin || "").indexOf("oc-file://") === 0);
    console.log("oc-file execution contexts:", ocCtx.map((c) => c.params.context.origin + " " + c.params.context.id));
    if (ocCtx.length) {
      const jsState = await send("Runtime.evaluate", {
        expression: "document.getElementById('msg').textContent + ' | body-bg=' + getComputedStyle(document.body).backgroundColor",
        returnByValue: true,
        contextId: ocCtx[ocCtx.length - 1].params.context.id,
      });
      console.log("iframe JS/CSS check:", jsState.result && jsState.result.result ? jsState.result.result.value : JSON.stringify(jsState.result));
    }
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(700);
  } else {
    console.log("_t.html row not in tree");
  }

  // ===== TEST C: MD preview =====
  console.log("\n== TEST C: MD preview ==");
  const mrow = await findRow("_t.md");
  console.log("md row found:", mrow);
  if (mrow) {
    await rightClick(mrow.x + 40, mrow.y + 12);
    const ok = await clickMenu("预览");
    console.log("clicked 预览:", ok);
    await sleep(3000); // markdown worker first load
    const mdState = await evalJs(`(function(){
       var layer=${getLayer};
       var view=layer?layer.querySelector('.oc-md'):null;
       if(!view) return JSON.stringify({noView:true});
       return JSON.stringify({
         html: view.innerHTML.slice(0, 700),
         hasH1: !!view.querySelector('h1'),
         hasCode: !!view.querySelector('pre code'),
         hasTable: !!view.querySelector('table'),
         hasQuote: !!view.querySelector('blockquote'),
         hasStrong: !!view.querySelector('strong'),
         codeText: (view.querySelector('pre code')||{}).textContent
       });
     })()`);
    console.log("md rendered:", mdState);
    // switch to edit via toolbar
    const editClicked = await evalJs(`(function(){
       var layer=${getLayer};
       var bs=layer?[].slice.call(layer.querySelectorAll('button')):[];
       for(var i=0;i<bs.length;i++){ if((bs[i].textContent||'').trim()==='编辑'){ bs[i].click(); return 'clicked'; } }
       return 'not found';
     })()`);
    console.log("switch to edit:", editClicked);
    await sleep(1500);
    const editState = await evalJs(`(function(){
       var layer=${getLayer};
       var ta=layer?layer.querySelector('textarea'):null;
       var statusDiv=null;
       if(layer){ var ds=layer.querySelectorAll(':scope > div'); statusDiv=ds.length?ds[ds.length-1]:null; }
       var btns=layer?[].slice.call(layer.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}):[];
       var cs = ta ? getComputedStyle(ta) : null;
       return JSON.stringify({
         hasTextarea: !!ta, taLen: ta?ta.value.length:0,
         status: statusDiv?statusDiv.textContent.slice(0,90):'',
         btns: btns,
         lineHeight: cs?cs.lineHeight:null, fontFamily: cs?cs.fontFamily.slice(0,40):null
       });
     })()`);
    console.log("edit layer:", editState);
    // selection not full (should be at end): check selectionStart==value.length
    const selState = await evalJs(`(function(){
       var layer=${getLayer};
       var ta=layer?layer.querySelector('textarea'):null;
       return ta ? JSON.stringify({ start: ta.selectionStart, len: ta.value.length, notFullSelect: !(ta.selectionStart===0 && ta.selectionEnd===ta.value.length) }) : 'no ta';
     })()`);
    console.log("cursor:", selState);
    // close with Esc
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(700);
  } else {
    console.log("_t.md row not in tree");
  }

  // cleanup
  for (const name of Object.keys(files)) {
    await evalJs(`(function(){ return window.api.fs.remove(${JSON.stringify(DIR + "/" + name)}); })()`);
  }
  await evalJs(`(function(){ var f=document.getElementById('__probe_iframe'); if(f) f.remove(); })()`);
  console.log("\ncleaned test files");
  ws.close();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
