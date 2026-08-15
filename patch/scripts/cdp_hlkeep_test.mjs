// 验证：切换到编辑时保留预览的颜色标注样式（底层克隆语法高亮 + textarea 透明覆盖）
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
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(500);
  };
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const r = await evalJs(expr);
      if (r && r !== "null") return r;
      await sleep(400);
    }
    return null;
  };

  // 切到 文件树功能 tab（项目文件多）
  if (!(await waitFor(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var j=0;j<tt.length;j++){if((tt[j].textContent||'').indexOf('文件树功能')>=0)return 'yes';}return null;})()`))) { console.log("FAIL: no tab"); process.exit(1); }
  await evalJs(`(function(){var tt=[].slice.call(document.querySelectorAll('[data-slot="titlebar-tab-item"]'));for(var i=0;i<tt.length;i++){var t=tt[i];if((t.textContent||'').indexOf('文件树功能')>=0){var tg=t.querySelector('[data-slot="tab-title"]')||t.querySelector('button')||t;tg.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:window}));tg.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));break;}}})()`);
  await sleep(2500);

  // 写入测试 JSON（键/字符串高亮明显），在文件树点击打开
  const DIR = "D:/新项目/优化opencode";
  await evalJs(`window.api.fs.write(${JSON.stringify(DIR + "/_hlkeep.json")}, "{\\n  \\"name\\": \\"hlkeep\\",\\n  \\"enabled\\": true,\\n  \\"count\\": 42\\n}")`);
  let row = null;
  for (let i = 0; i < 40; i++) {
    const r = await evalJs(`(function(){var rows=[].slice.call(document.querySelectorAll('[data-slot="file-tree-v2-row"]'));for(var j=0;j<rows.length;j++){var p=rows[j].getAttribute('data-path')||'';if(p.indexOf('_hlkeep.json')>=0){var b=rows[j].getBoundingClientRect();if(b.width>0&&b.height>0&&b.top>0)return JSON.stringify({x:Math.round(b.left+20),y:Math.round(b.top+12)});}}return null;})()`);
    if (r) { row = JSON.parse(r); break; }
    await sleep(400);
  }
  if (!row) { console.log("FAIL: _hlkeep.json not found in tree"); process.exit(1); }
  await click(row.x, row.y);
  await sleep(2500);

  // 点 编辑 按钮
  const btn = await evalJs(`(function(){var bar=document.getElementById('__oc_native_toolbar');if(!bar)return null;var bs=bar.querySelectorAll('button');for(var i=0;i<bs.length;i++){if((bs[i].textContent||'').trim()==='编辑'){var r=bs[i].getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});}}return null;})()`);
  if (!btn) { console.log("FAIL: no edit btn"); process.exit(1); }
  const eb = JSON.parse(btn);
  await click(eb.x, eb.y);
  await sleep(2000);

  // 验证高亮保留
  const state = await evalJs(`(function(){
    var layer=document.querySelector('#__oc_ft_overlay');
    var hl=document.getElementById('__oc_hlpre');
    var ta=document.querySelector('textarea');
    if(!hl||!ta) return JSON.stringify({err:'no hlPre/ta', hasHl:!!hl, hasTa:!!ta});
    var cs=getComputedStyle(ta);
    var syntaxSpans=hl.querySelectorAll('span[style*="syntax"]');
    var colorSpans=hl.querySelectorAll('span[style*="color"]');
    var hlRows=hl.children.length;
    var taLines=ta.value.split("\\n").length;
    return JSON.stringify({
      hasHl:true,
      hlRows:hlRows, taLines:taLines, linesMatch:hlRows===taLines,
      syntaxSpanCount:syntaxSpans.length,
      colorSpanCount:colorSpans.length,
      sampleColor:colorSpans.length?colorSpans[0].style.color:'',
      taColor:cs.color, taFill:cs.webkitTextFillColor, caret:cs.caretColor,
      hlTransform:hl.style.transform
    }, null, 1);
  })()`);
  console.log("highlight-keep state:", state);
  const s = JSON.parse(state);
  let ok = true;
  if (s.err) { ok = false; }
  if (!s.linesMatch) { console.log("  FAIL: hl rows != textarea lines"); ok = false; }
  if (!s.syntaxSpanCount && !s.colorSpanCount) { console.log("  FAIL: no colored spans in hlPre"); ok = false; }
  if (s.taColor !== "rgba(0, 0, 0, 0)" && s.taColor !== "transparent") { console.log("  FAIL: textarea not transparent:", s.taColor); ok = false; }
  if (ok) console.log("  PASS: preview color markup preserved in editor");

  // 输入测试：插入新行 → hlPre 更新
  await evalJs(`(function(){var ta=document.querySelector('textarea');ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);})()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.insertText", { text: "  \"__hlkeep_new\": 42," });
  await sleep(500);
  const after = await evalJs(`(function(){
    var hl=document.getElementById('__oc_hlpre');
    var ta=document.querySelector('textarea');
    var lines=ta.value.split("\\n");
    var lastLine=lines[lines.length-1];
    var lastHl=hl.children[hl.children.length-1];
    return JSON.stringify({taLines:lines.length, hlRows:hl.children.length, lastLine:lastLine, lastHlText:lastHl?lastHl.textContent:'', lastHlColor:lastHl?lastHl.querySelector('span').style.color:'', hasNewLineInHl:(hl.textContent.indexOf('__hlkeep_new')>=0)});
  })()`);
  console.log("after typing new line:", after);
  const a = JSON.parse(after);
  if (!a.hasNewLineInHl) { console.log("  FAIL: typed text not reflected in hl layer"); ok = false; }
  else if (a.lastHlColor === "") { console.log("  FAIL: new line has no color style"); ok = false; }
  else { console.log("  PASS: new line appears in hl layer with color"); }

  // Esc 关闭
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(800);
  const closed = await evalJs(`JSON.stringify({hlGone:!document.getElementById('__oc_hlpre'), barBack:!!document.getElementById('__oc_native_toolbar')})`);
  console.log("after esc:", closed);
  const cl = JSON.parse(closed);
  if (!cl.hlGone || !cl.barBack) { console.log("  FAIL: editor cleanup"); ok = false; }

  await evalJs(`window.api.fs.remove(${JSON.stringify(DIR + "/_hlkeep.json")})`);
  ws.close();
  console.log(ok ? "ALL PASS" : "FAILED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
