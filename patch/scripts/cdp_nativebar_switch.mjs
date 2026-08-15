const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  await new Promise((resolve) => (ws.onopen = resolve));
  const evalJs = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return "EXC:" + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const click = async (x, y, btn = "left") => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: btn, clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: btn, clickCount: 1 });
    await sleep(400);
  };
  for (let i = 0; i < 40; i++) { const r = await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`); if (r) break; await sleep(500); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(3000);
  const DIR = "D:/新项目/优化opencode";
  await evalJs(`Promise.all([
     window.api.fs.write(${JSON.stringify(DIR + "/_na.txt")}, "AAA content line1\\nline2"),
     window.api.fs.write(${JSON.stringify(DIR + "/_nb.txt")}, "BBB content line1\\nline2\\nline3")
   ])`);
  const findRow = async (part) => {
    for (let i = 0; i < 40; i++) {
      const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf(${JSON.stringify(part)})>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left),y:Math.round(b.top)});}}return null;})()`);
      if (r) return JSON.parse(r); await sleep(400);
    }
    return null;
  };
  const barTitle = () => evalJs(`(function(){var bar=document.getElementById('__oc_native_toolbar');if(!bar)return null;var d=bar.querySelector('div');return d?d.textContent:null;})()`);
  const btnLabels = () => evalJs(`(function(){var bar=document.getElementById('__oc_native_toolbar');if(!bar)return null;return [].slice.call(bar.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim();}).join(',');})()`);

  // open _na.txt
  const ra = await findRow("_na.txt");
  await click(ra.x + 20, ra.y + 12);
  await sleep(2500);
  console.log("after open A: title=", await barTitle(), "btns=", await btnLabels());

  // switch to _nb.txt
  const rb = await findRow("_nb.txt");
  await click(rb.x + 20, rb.y + 12);
  await sleep(2500);
  console.log("after switch B: title=", await barTitle(), "btns=", await btnLabels());

  // open an md file to confirm preview button shows for md
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_nc.md")}, "# Title\\n\\nsome **bold** text")`);
  const rc = await findRow("_nc.md");
  await click(rc.x + 20, rc.y + 12);
  await sleep(2500);
  console.log("after open md: title=", await barTitle(), "btns=", await btnLabels());

  // cleanup
  await evalJs(`Promise.all([
     window.api.fs.remove(${JSON.stringify(DIR + "/_na.txt")}),
     window.api.fs.remove(${JSON.stringify(DIR + "/_nb.txt")}),
     window.api.fs.remove(${JSON.stringify(DIR + "/_nc.md")})
   ])`);
  ws.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
