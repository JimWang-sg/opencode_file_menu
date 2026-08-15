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
    await sleep(250);
  }
  async function itemRect(text) {
    const j = await evalJs(
      `(function(){var m=document.querySelector('#__oc_ft_menu');if(!m)return null;var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if(ds[i].textContent.trim()===${JSON.stringify(text)}){var r=ds[i].getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height});}}return null})()`
    );
    return j ? JSON.parse(j) : null;
  }

  const rowInfo = JSON.parse(
    await evalJs(
      `(function(){var e=document.querySelector('[data-slot="file-tree-v2-row"]');var r=e.getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`
    )
  );
  const cx = rowInfo.x + 30;
  const cy = rowInfo.y + 14;

  // 1. open menu
  await rightClick(cx, cy);
  const menuLabels = await evalJs(
    `(function(){var m=document.querySelector('#__oc_ft_menu');if(!m)return null;var out=[];var ds=m.querySelectorAll('div');for(var i=0;i<ds.length;i++){if(ds[i].textContent.trim())out.push(ds[i].textContent.trim());}return JSON.stringify(out)})()`
  );
  console.log("menu open, labels:", menuLabels);

  // 2. click 复制路径
  const copyPath = await itemRect("复制路径");
  if (!copyPath) {
    console.log("FAIL: no 复制路径 item");
    process.exit(1);
  }
  await leftClick(copyPath.x + copyPath.w / 2, copyPath.y + copyPath.h / 2);
  const toastTxt = await evalJs(
    `(function(){var ts=document.querySelectorAll('#__oc_ft_menu_root > div');var o='';for(var i=ts.length-1;i>=0;i--){var c=ts[i];if(c.id!=='__oc_ft_menu'&&c.childElementCount===0){o=c.textContent;break;}}return o})()`
  );
  console.log("after 复制路径, toast:", toastTxt, "| menu closed:", await evalJs(`!document.querySelector('#__oc_ft_menu')`));

  // 3. open again, click 新建文件
  await rightClick(cx, cy);
  const nf = await itemRect("新建文件");
  await leftClick(nf.x + nf.w / 2, nf.y + nf.h / 2);
  await sleep(300);
  const modalVisible = await evalJs(
    `(function(){var root=document.querySelector('#__oc_ft_menu_root');var ins=root&&root.querySelectorAll('input');return ins&&ins.length?{hasInput:true,placeholder:ins[0].placeholder||''}:{hasInput:false}})()`
  );
  console.log("new file modal:", JSON.stringify(modalVisible));

  // 4. type name and confirm
  if (modalVisible && modalVisible.hasInput) {
    await send("Input.insertText", { text: "__ft_test_do_not_keep.txt" });
    await sleep(100);
    const okBtn = await evalJs(
      `(function(){var root=document.querySelector('#__oc_ft_menu_root');var bs=root&&root.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='确定'||bs[i].textContent.trim()==='OK'){var r=bs[i].getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height});}}return null})()`
    );
    const b = JSON.parse(okBtn);
    await leftClick(b.x + b.w / 2, b.y + b.h / 2);
    await sleep(500);
    const created = await evalJs(
      `(function(){var p='D:/新项目/优化opencode/app.asar.extracted/__ft_test_do_not_keep.txt';return null})()`
    );
    console.log("created file check via fs API pending");
  }

  ws.close();
  console.log("DONE");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
