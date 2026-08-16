(() => {
  "use strict";
  if (window.__ocFileTreeMenu) return;
  window.__ocFileTreeMenu = true;

  const L = (navigator.language || "en").toLowerCase().startsWith("zh")
    ? {
        newFile: "新建文件",
        newFolder: "新建文件夹",
        copy: "复制",
        paste: "粘贴",
        rename: "重命名",
        del: "删除",
        copyPath: "复制路径",
        reveal: "在资源管理器中显示",
        cancel: "取消",
        confirm: "确定",
        save: "保存",
        newFileTitle: "新建文件",
        newFolderTitle: "新建文件夹",
        renameTitle: "重命名",
        edit: "编辑",
        editTitle: "编辑文件",
        editHint: "Ctrl+S 保存 · Esc 取消",
        preview: "预览",
        previewTitle: "预览",
        reload: "重新加载",
        unsaved: "未保存",
        openFirst: "请先在预览中打开该文件",
        namePlaceholder: "输入名称",
        delTitle: "确认删除",
        delMessage: (n) => `确定要删除“${n}”吗？此操作不可撤销。`,
        emptyName: "名称不能为空",
        exists: "已存在同名文件或文件夹",
        noDir: "无法解析项目目录",
        done: {
          created: "已创建",
          edited: "已编辑",
          renamed: "已重命名",
          deleted: "已删除",
          copied: "已复制到剪贴板",
          pasted: "已粘贴",
          pathCopied: "路径已复制",
        },
        cannotIntoSelf: "不能将文件夹复制到自身内部",
        noClip: "剪贴板为空，请先复制",
        opError: "操作失败",
        noApi: "文件操作接口不可用",
      }
    : {
        newFile: "New File",
        newFolder: "New Folder",
        copy: "Copy",
        paste: "Paste",
        rename: "Rename",
        del: "Delete",
        copyPath: "Copy Path",
        reveal: "Reveal in Explorer",
        cancel: "Cancel",
        confirm: "OK",
        save: "Save",
        newFileTitle: "New File",
        newFolderTitle: "New Folder",
        renameTitle: "Rename",
        edit: "Edit",
        editTitle: "Edit File",
        editHint: "Ctrl+S to save · Esc to cancel",
        preview: "Preview",
        previewTitle: "Preview",
        reload: "Reload",
        unsaved: "Unsaved",
        openFirst: "Open the file in the preview first",
        namePlaceholder: "Enter a name",
        delTitle: "Confirm Delete",
        delMessage: (n) => `Delete "${n}"? This cannot be undone.`,
        emptyName: "Name cannot be empty",
        exists: "A file or folder with this name already exists",
        noDir: "Could not resolve the project directory",
        done: {
          created: "Created",
          edited: "Edited",
          renamed: "Renamed",
          deleted: "Deleted",
          copied: "Copied to clipboard",
          pasted: "Pasted",
          pathCopied: "Path copied",
        },
        cannotIntoSelf: "Cannot copy a folder into itself",
        noClip: "Clipboard is empty. Copy something first.",
        opError: "Operation failed",
        noApi: "File API is unavailable",
      };

  const clip = { path: null };
  const editCursor = new Map();

  const waitFor = (cond, maxMs, step = 50) =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const poll = () => {
        let v;
        try {
          v = cond();
        } catch (_) {
          v = false;
        }
        if (v) return resolve(true);
        if (Date.now() - t0 > maxMs) return resolve(false);
        setTimeout(poll, step);
      };
      poll();
    });

  const previewType = (p) => {
    const n = nameOf(p);
    const dot = n.lastIndexOf(".");
    if (dot < 0) return null;
    const ext = n.slice(dot + 1).toLowerCase();
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "md" || ext === "markdown") return "md";
    return null;
  };

  const ocFileUrl = (absPath) =>
    "oc-file://local/" +
    String(absPath || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");

  const recordScroll = (container) => {
    const vp = container && container.querySelector(".scroll-view__viewport");
    if (!vp) return null;
    return {
      top: vp.scrollTop,
      atBottom: vp.scrollHeight - vp.scrollTop - vp.clientHeight < 8,
    };
  };

  const restoreScroll = (container, saved, maxMs) => {
    if (!saved) return;
    const t0 = Date.now();
    let lastH = -1;
    let stable = 0;
    const tick = () => {
      const c = container && container.isConnected ? container : previewContainer();
      const vp = c && c.querySelector(".scroll-view__viewport");
      const h = vp ? vp.scrollHeight : 0;
      if (vp && vp.clientHeight > 0 && h === lastH) {
        if (++stable >= 2) {
          vp.scrollTop = saved.atBottom ? h : Math.min(saved.top, Math.max(0, h - vp.clientHeight));
          return;
        }
      } else {
        stable = 0;
        lastH = h;
      }
      if (Date.now() - t0 > (maxMs || 2500)) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const findFileTab = (relPath) => {
    const tabs = [].slice.call(document.querySelectorAll('[role="tab"][data-key^="file://"]'));
    for (const t of tabs) {
      const k = cleanRel(t.getAttribute("data-key").replace(/^file:\/\/+/, "").replace(/\\/g, "/"));
      if (k === relPath || k.endsWith("/" + relPath)) return t;
    }
    return null;
  };

  const activeTabRel = () => {
    const tab = activeFileTab();
    if (!tab) return null;
    const key = tab.getAttribute("data-key") || "";
    return cleanRel(key.replace(/^file:\/\/+/, "").replace(/\\/g, "/"));
  };

  const findTreeRow = (relPath) => {
    const rows = [].slice.call(
      document.querySelectorAll('[data-slot="file-tree-v2-row"][data-path], [data-path]')
    );
    for (const r of rows) {
      const p = cleanRel(r.getAttribute("data-path") || "");
      if (p === relPath || p.endsWith("/" + relPath)) return r;
    }
    return null;
  };

  // React UIs here swallow plain .click(); dispatch the full mouse sequence on the inner node.
  const fireClick = (el) => {
    const target = el.querySelector('[data-slot="tab-title"]') || el.querySelector("button") || el;
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const rel = (p) => String(p || "").replace(/\\/g, "/");
  const cleanRel = (p) => rel(p).replace(/^\/+/, "");
  const dirOf = (p) => {
    const s = cleanRel(p).replace(/\/+$/, "");
    const i = s.lastIndexOf("/");
    return i === -1 ? "" : s.slice(0, i);
  };
  const nameOf = (p) => {
    const s = cleanRel(p).replace(/\/+$/, "");
    const i = s.lastIndexOf("/");
    return i === -1 ? s : s.slice(i + 1);
  };
  const joinRel = (...parts) =>
    parts
      .map(cleanRel)
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");

  const projectDir = () => String(window.__ocFileDir || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const toAbs = (p) => {
    const root = projectDir();
    if (!root) return null;
    return root + "/" + cleanRel(p);
  };

  const fs = () => (window.api && window.api.fs) || null;

  let overlay = null;

  function ensureRoot() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "__oc_ft_menu_root";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:visible;";
    (document.body || document.documentElement).appendChild(overlay);
    try {
      if (!document.getElementById("__oc_md_style")) {
        const st = document.createElement("style");
        st.id = "__oc_md_style";
        st.textContent = [
          ".oc-md{word-wrap:break-word;overflow-wrap:break-word;}",
          ".oc-md h1,.oc-md h2,.oc-md h3{font-weight:600;line-height:1.4;margin:1em 0 .5em;}",
          ".oc-md h1{font-size:1.5em;border-bottom:1px solid var(--border-base,#333);padding-bottom:.3em;}",
          ".oc-md h2{font-size:1.25em;}",
          ".oc-md h3{font-size:1.1em;}",
          ".oc-md h4,.oc-md h5,.oc-md h6{font-size:1em;font-weight:600;margin:1em 0 .4em;}",
          ".oc-md p{margin:.5em 0;}",
          ".oc-md ul,.oc-md ol{padding-left:1.6em;margin:.5em 0;}",
          ".oc-md li{margin:.15em 0;}",
          ".oc-md a{color:var(--text-link,#6ea8fe);text-decoration:none;}",
          ".oc-md a:hover{text-decoration:underline;}",
          ".oc-md blockquote{border-left:3px solid var(--border-base,#444);margin:.6em 0;padding:.1em 1em;color:var(--text-weak,#aaa);}",
          ".oc-md code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:.92em;background:var(--surface-raised-base,#222);border-radius:4px;padding:.1em .35em;}",
          ".oc-md pre{background:var(--surface-raised-base,#1e1e1e);border:1px solid var(--border-base,#333);border-radius:8px;padding:12px 14px;overflow:auto;margin:.7em 0;}",
          ".oc-md pre code{background:transparent;border:none;padding:0;font-size:13px;line-height:22px;display:block;overflow:visible;}",
          ".oc-md table{border-collapse:collapse;margin:.7em 0;display:block;overflow-x:auto;max-width:100%;}",
          ".oc-md th,.oc-md td{border:1px solid var(--border-base,#444);padding:4px 10px;}",
          ".oc-md th{background:var(--surface-raised-base,#222);font-weight:600;}",
          ".oc-md hr{border:none;border-top:1px solid var(--border-base,#444);margin:1em 0;}",
          ".oc-md img{max-width:100%;}",
          ".oc-md del{color:var(--text-weak,#888);}",
          ".oc-md input[type=checkbox]{margin-right:.35em;}",
        ].join("");
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (_) {}
    return overlay;
  }

  function toast(msg) {
    try {
      const t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;" +
        "background:var(--surface-raised-base,#333);color:var(--text-strong,#fff);" +
        "padding:8px 14px;border-radius:8px;font-size:12px;" +
        "border:1px solid var(--border-base,#444);" +
        "box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:420px;word-break:break-all;";
      ensureRoot().appendChild(t);
      setTimeout(() => t.remove(), 2600);
    } catch (e) {}
  }

  function makeBtn(label, primary, danger) {
    const b = document.createElement("button");
    b.textContent = label;
    b.type = "button";
    b.style.cssText =
      "border:1px solid " +
      (danger
        ? "var(--border-accent-strong,#f25c5c)"
        : primary
          ? "var(--border-accent-strong,#4f8cff)"
          : "var(--border-base,#444)") +
      ";background:" +
      (danger
        ? "var(--surface-accent-base,#c93a3a)"
        : primary
          ? "var(--surface-accent-base,#3b6ff0)"
          : "transparent") +
      ";color:" +
      (danger ? "#fff" : primary ? "var(--text-on-accent,#fff)" : "var(--text-strong,#fff)") +
      ";border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;";
    return b;
  }

  function ask({ title, initial, placeholder, confirmText, multiline }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", onKey, true);
        dim.remove();
        resolve(value);
      };
      const root = ensureRoot();
      const dim = document.createElement("div");
      dim.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;pointer-events:auto;";
      const card = document.createElement("div");
      card.style.cssText =
        "width:360px;max-width:calc(100vw - 48px);background:var(--background-stronger,#1c1c1c);" +
        "border:1px solid var(--border-base,#444);border-radius:10px;padding:16px;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.4);";
      const titleEl = document.createElement("div");
      titleEl.textContent = title;
      titleEl.style.cssText =
        "font-size:14px;font-weight:600;color:var(--text-strong,#fff);margin-bottom:12px;";
      const input = multiline
        ? (() => {
            const ta = document.createElement("textarea");
            ta.value = initial || "";
            ta.placeholder = placeholder || "";
            ta.rows = 14;
            ta.style.cssText =
              "width:100%;box-sizing:border-box;resize:vertical;background:var(--background-base,#111);color:var(--text-strong,#fff);" +
              "border:1px solid var(--border-base,#444);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;" +
              "font-family:ui-monospace,Consolas,monospace;line-height:1.5;";
            ta.addEventListener("focus", () => ta.select());
            return ta;
          })()
        : (() => {
            const inp = document.createElement("input");
            inp.type = "text";
            inp.value = initial || "";
            inp.placeholder = placeholder || "";
            inp.style.cssText =
              "width:100%;box-sizing:border-box;background:var(--background-base,#111);color:var(--text-strong,#fff);" +
              "border:1px solid var(--border-base,#444);border-radius:6px;padding:8px 10px;font-size:13px;outline:none;";
            inp.addEventListener("focus", () => inp.select());
            return inp;
          })();
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;";
      const cancelBtn = makeBtn(L.cancel, false);
      const okBtn = makeBtn(confirmText || L.confirm, true);
      row.appendChild(cancelBtn);
      row.appendChild(okBtn);
      card.appendChild(titleEl);
      card.appendChild(input);
      card.appendChild(row);
      dim.appendChild(card);
      root.appendChild(dim);
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(null);
        } else if (e.key === "Enter") {
          if (multiline && !e.ctrlKey) return;
          e.stopPropagation();
          finish(input.value);
        }
      };
      window.addEventListener("keydown", onKey, true);
      cancelBtn.addEventListener("click", () => finish(null));
      okBtn.addEventListener("click", () => finish(input.value));
      dim.addEventListener("mousedown", (e) => {
        if (e.target === dim) finish(null);
      });
      setTimeout(() => input.focus(), 10);
    });
  }

  function confirmDialog({ title, message, okText }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", onKey, true);
        dim.remove();
        resolve(value);
      };
      const root = ensureRoot();
      const dim = document.createElement("div");
      dim.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;pointer-events:auto;";
      const card = document.createElement("div");
      card.style.cssText =
        "width:360px;max-width:calc(100vw - 48px);background:var(--background-stronger,#1c1c1c);" +
        "border:1px solid var(--border-base,#444);border-radius:10px;padding:16px;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.4);";
      const t = document.createElement("div");
      t.textContent = title;
      t.style.cssText = "font-size:14px;font-weight:600;color:var(--text-strong,#fff);margin-bottom:10px;";
      const msg = document.createElement("div");
      msg.textContent = message;
      msg.style.cssText =
        "font-size:13px;color:var(--text-weak,#999);word-break:break-all;max-height:160px;overflow:auto;";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;";
      const cancelBtn = makeBtn(L.cancel, false);
      const okBtn = makeBtn(okText || L.confirm, true, true);
      row.appendChild(cancelBtn);
      row.appendChild(okBtn);
      card.appendChild(t);
      card.appendChild(msg);
      card.appendChild(row);
      dim.appendChild(card);
      root.appendChild(dim);
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
      };
      window.addEventListener("keydown", onKey, true);
      cancelBtn.addEventListener("click", () => finish(false));
      okBtn.addEventListener("click", () => finish(true));
      dim.addEventListener("mousedown", (e) => {
        if (e.target === dim) finish(false);
      });
    });
  }

  function editFile(absPath, displayName) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", onKey, true);
        dim.remove();
        resolve(value);
      };
      const root = ensureRoot();
      const dim = document.createElement("div");
      dim.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:var(--background-stronger,#161616);" +
        "display:flex;flex-direction:column;pointer-events:auto;";
      const head = document.createElement("div");
      head.style.cssText =
        "display:flex;align-items:center;gap:12px;padding:10px 14px;" +
        "border-bottom:1px solid var(--border-base,#333);";
      const title = document.createElement("div");
      title.textContent = displayName;
      title.title = absPath;
      title.style.cssText =
        "flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text-strong,#fff);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const hint = document.createElement("div");
      hint.textContent = L.editHint;
      hint.style.cssText = "font-size:12px;color:var(--text-weak,#888);white-space:nowrap;";
      const cancelBtn = makeBtn(L.cancel, false);
      const saveBtn = makeBtn(L.save, true);
      head.appendChild(title);
      head.appendChild(hint);
      head.appendChild(cancelBtn);
      head.appendChild(saveBtn);
      const ta = document.createElement("textarea");
      ta.spellcheck = false;
      ta.style.cssText =
        "flex:1;width:100%;box-sizing:border-box;resize:none;border:none;outline:none;background:transparent;" +
        "color:var(--text-strong,#e8e8e8);padding:14px 16px;font-size:13px;line-height:1.6;" +
        "font-family:ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;tab-size:4;" +
        "white-space:pre;overflow:auto;";
      dim.appendChild(head);
      dim.appendChild(ta);
      root.appendChild(dim);
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          finish(ta.value);
        } else if (e.key === "Escape") {
          e.stopPropagation();
          finish(null);
        }
      };
      window.addEventListener("keydown", onKey, true);
      cancelBtn.addEventListener("click", () => finish(null));
      saveBtn.addEventListener("click", () => finish(ta.value));
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const s = ta.selectionStart;
          const en = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 1;
        }
      });
      setTimeout(() => {
        ta.focus();
        ta.select();
      }, 10);
    });
  }

  function activeFileTab() {
    const tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
    let active = null;
    for (const t of tabs) {
      const key = t.getAttribute("data-key") || "";
      if (key.indexOf("file://") !== 0) continue;
      if (t.getAttribute("aria-selected") === "true" || t.hasAttribute("data-selected")) {
        active = t;
        break;
      }
    }
    if (!active) {
      for (const t of tabs) {
        if ((t.getAttribute("data-key") || "").indexOf("file://") !== 0) continue;
        if (t.offsetParent !== null) {
          active = t;
          break;
        }
      }
    }
    return active;
  }

  function previewContainer() {
    const files = [].slice.call(document.querySelectorAll('[data-component="file"]'));
    // 同一页面可能存在多个 file 容器（聊天历史引用 + 当前激活预览），必须遍历。
    // 优先找 .mt-3 固定预览容器（session-review-v2），且其中确有 diffs-container 原生预览。
    for (const file of files) {
      let el = file;
      for (let d = 0; el && d < 10; d++) {
        if (el.classList && el.classList.contains("mt-3") && el.querySelector("diffs-container")) return el;
        el = el.parentElement;
      }
    }
    // fallback：可见的、含 diffs 的 file 容器（优先 select-text 主预览，其次高度最大）
    const vis = files.filter((f) => {
      const r = f.getBoundingClientRect();
      return r.top > -100 && r.top < window.innerHeight && f.querySelector("diffs-container");
    });
    if (vis.length) {
      vis.sort((a, b) => {
        const as = a.classList.contains("select-text") ? 1 : 0;
        const bs = b.classList.contains("select-text") ? 1 : 0;
        if (as !== bs) return bs - as;
        return b.getBoundingClientRect().height - a.getBoundingClientRect().height;
      });
      return vis[0];
    }
    const any = files.find((f) => f.querySelector("diffs-container"));
    return any || null;
  }

  function editInPlace(absPath, relPath, content) {
    return new Promise((resolve) => {
      let done = false;
      const displayName = nameOf(relPath) || relPath;
      const cleanup = () => {
        window.removeEventListener("keydown", onKey, true);
        layer.remove();
        try {
          hlStyle.remove();
        } catch (_) {}
      };
      const finish = (value) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(value);
      };
      const container = previewContainer();
      if (!container) {
        resolve(false);
        return;
      }
      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }
      // 打开前记录预览容器滚动位置，编辑层按同样像素初始化，避免内容跳动
      const pvScroll = container.scrollTop || 0;
      const layer = document.createElement("div");
      layer.style.cssText =
        "position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;" +
        "background:var(--background-stronger,#161616);pointer-events:auto;";
      const head = document.createElement("div");
      head.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:6px 12px;flex:0 0 auto;" +
        "border-bottom:1px solid var(--border-base,#333);";
      const title = document.createElement("div");
      title.textContent = displayName;
      title.title = absPath;
      title.style.cssText =
        "flex:0 0 auto;max-width:36%;font-size:13px;font-weight:600;color:var(--text-strong,#fff);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const dirtyMark = document.createElement("div");
      dirtyMark.textContent = L.unsaved;
      dirtyMark.style.cssText =
        "flex:0 0 auto;font-size:11px;color:#e0a13a;font-weight:600;display:none;";
      const hint = document.createElement("div");
      hint.textContent = L.editHint;
      hint.style.cssText =
        "flex:1;min-width:0;font-size:12px;color:var(--text-weak,#888);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;";
      const cancelBtn = makeBtn(L.cancel, false);
      const saveBtn = makeBtn(L.save, true);
      head.appendChild(title);
      head.appendChild(dirtyMark);
      head.appendChild(hint);
      const type = previewType(relPath);
      const previewBtn = type ? makeBtn(L.preview, false) : null;
      if (previewBtn) head.appendChild(previewBtn);
      head.appendChild(cancelBtn);
      head.appendChild(saveBtn);
      const ta = document.createElement("textarea");
      ta.spellcheck = false;
      ta.value = content;
      ta.style.cssText =
        "position:absolute;inset:0;box-sizing:border-box;resize:none;border:none;outline:none;background:transparent;" +
        "color:transparent;caret-color:var(--text-strong,#e8e8e8);-webkit-text-fill-color:transparent;z-index:2;" +
        "padding:0 14px;line-height:24px;font-size:13px;tab-size:2;" +
        "font-family:var(--font-family-mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace);" +
        "white-space:pre;overflow:auto;";
      const status = document.createElement("div");
      status.style.cssText =
        "flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:4px 12px;" +
        "border-top:1px solid var(--border-base,#333);font-size:11px;color:var(--text-weak,#888);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      // 编辑主体：左侧行号列 + 右侧 textarea，行号随文本滚动同步
      const body = document.createElement("div");
      body.style.cssText =
        "flex:1;min-height:0;display:flex;position:relative;";
      const gutter = document.createElement("div");
      gutter.style.cssText =
        "flex:0 0 auto;overflow:hidden;position:relative;min-width:44px;max-width:64px;" +
        "box-sizing:border-box;border-right:1px solid var(--border-base,#333);";
      const gutterInner = document.createElement("div");
      gutterInner.style.cssText =
        "position:absolute;inset:0;overflow:hidden;";
      gutter.appendChild(gutterInner);
      // 编辑主体：左侧行号列 + 右侧内容区。内容区底层放预览克隆的语法高亮，
      // textarea 透明文字覆盖其上——编辑时完整保留预览的颜色标注样式。
      const contentWrap = document.createElement("div");
      contentWrap.style.cssText = "flex:1;min-width:0;position:relative;";
      const hlPre = document.createElement("div");
      hlPre.style.cssText =
        "position:absolute;inset:0;overflow:hidden;padding:0 14px;line-height:24px;font-size:13px;tab-size:2;" +
        "white-space:pre;z-index:1;pointer-events:none;" +
        "font-family:var(--font-family-mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace);";
      contentWrap.appendChild(hlPre);
      contentWrap.appendChild(ta);
      body.appendChild(gutter);
      body.appendChild(contentWrap);
      layer.appendChild(head);
      layer.appendChild(body);
      layer.appendChild(status);
      container.appendChild(layer);

      // 从原生预览克隆语法高亮（颜色标注），逐字对齐 textarea（同为 13px/24px/tab-size 2）。
      // 编辑中未变行保留高亮，修改/新增行以主题文字色显示。
      const hlStyle = document.createElement("style");
      hlStyle.textContent =
        "#__oc_hlpre > div{height:24px;line-height:24px;white-space:pre;overflow:hidden;}" +
        "#__oc_hlpre{color:var(--text-base);}";
      hlPre.id = "__oc_hlpre";
      document.head.appendChild(hlStyle);
      const hlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      let hlOrig = [];
      try {
        const dc = container.querySelector("diffs-container");
        const c = dc && dc.shadowRoot && dc.shadowRoot.querySelector("code [data-content]");
        if (c && c.children.length) {
          hlOrig = [].slice.call(c.children).map((r) => ({ text: r.textContent || "", html: r.outerHTML }));
        }
      } catch (_) {}
      if (!hlOrig.length) {
        hlOrig = content.split("\n").map((t) => ({ text: t, html: "" }));
      }
      let hlT = 0;
      const syncHl = () => {
        const lines = ta.value.split("\n");
        const html = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let h = null;
          if (hlOrig[i] && hlOrig[i].text === line) h = hlOrig[i].html;
          else {
            for (let j = 0; j < hlOrig.length; j++) {
              if (hlOrig[j].text === line) {
                h = hlOrig[j].html;
                break;
              }
            }
          }
          html.push(h || '<div data-line-type="context"><span style="color:var(--text-base)">' + hlEsc(line) + "</span></div>");
        }
        hlPre.innerHTML = html.join("");
      };
      syncHl();
      const scheduleHl = () => {
        clearTimeout(hlT);
        hlT = setTimeout(syncHl, 120);
      };
      const syncHlScroll = () => {
        hlPre.style.transform = "translateY(" + -ta.scrollTop + "px)";
      };

      // 行号渲染：每行一个 24px 高的等宽行号，与 textarea 行高严格对齐
      const renderGutter = () => {
        const n = ta.value.split("\n").length;
        if (n === gutterInner._n) return;
        gutterInner._n = n;
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= n; i++) {
          const d = document.createElement("div");
          d.style.cssText =
            "line-height:24px;font-size:13px;text-align:right;padding-right:10px;" +
            "color:var(--text-weak,#888);" +
            "font-family:var(--font-family-mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace);" +
            "user-select:none;";
          d.textContent = String(i);
          frag.appendChild(d);
        }
        gutterInner.textContent = "";
        gutterInner.appendChild(frag);
      };
      const syncGutter = () => {
        gutterInner.scrollTop = ta.scrollTop;
      };
      ta.addEventListener("scroll", syncGutter);
      ta.addEventListener("scroll", syncHlScroll);

      const refreshStatus = () => {
        const v = ta.value;
        const selStart = ta.selectionStart;
        let line = 1;
        let col = 1;
        for (let i = 0; i < selStart && i < v.length; i++) {
          if (v.charCodeAt(i) === 10) {
            line += 1;
            col = 1;
          } else col += 1;
        }
        status.textContent =
          "行 " + line + ", 列 " + col + " · 共 " + v.split("\n").length + " 行 · " + absPath;
      };
      const updateDirty = () => {
        const dirty = ta.value !== content;
        dirtyMark.style.display = dirty ? "" : "none";
        saveBtn.disabled = !dirty;
      };

      const persist = async (v) => {
        editCursor.set(absPath, { char: ta.selectionStart });
        const r = await fs().write(absPath, v);
        if (r.ok) {
          const tr = activeTabRel();
          if (tr && (tr === relPath || tr.endsWith("/" + relPath))) {
            try {
              const tab = activeFileTab();
              if (tab) tab.click();
            } catch (_) {}
          }
          toast(L.done.edited);
          return true;
        }
        toast(L.opError + ": " + (r.error || ""));
        return false;
      };

      const doSave = async () => {
        if (done) return;
        done = true;
        cleanup();
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        resolve(await persist(ta.value));
      };

      const finishCancel = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      };

      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          doSave();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          finishCancel();
        }
      };
      window.addEventListener("keydown", onKey, true);
      cancelBtn.addEventListener("click", finishCancel);
      saveBtn.addEventListener("click", doSave);
      if (previewBtn) {
        previewBtn.addEventListener("click", async () => {
          if (done) return;
          done = true;
          cleanup();
          await persist(ta.value);
          openPreviewLayer(absPath, relPath, type);
          resolve(true);
        });
      }
      ta.addEventListener("input", () => {
        updateDirty();
        renderGutter();
        syncGutter();
        scheduleHl();
      });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const s = ta.selectionStart;
          const en = ta.selectionEnd;
          const sel = ta.value.slice(s, en);
          const lines = sel.split("\n");
          const multiline = lines.length > 1;
          if (e.shiftKey) {
            const out = lines
              .map((ln) => (ln.charAt(0) === "\t" ? ln.slice(1) : ln.slice(0, 4) === "    " ? ln.slice(4) : ln))
              .join("\n");
            let removed = 0;
            for (const ln of lines) {
              if (ln.charAt(0) === "\t") removed += 1;
              else if (ln.slice(0, 4) === "    ") removed += 4;
            }
            ta.value = ta.value.slice(0, s) + out + ta.value.slice(en);
            ta.selectionStart = s;
            ta.selectionEnd = Math.max(s, en - removed);
          } else if (multiline) {
            const out = lines.map((ln) => (ln.length ? "\t" + ln : ln)).join("\n");
            const added = lines.filter((ln) => ln.length).length;
            ta.value = ta.value.slice(0, s) + out + ta.value.slice(en);
            ta.selectionStart = s + 1;
            ta.selectionEnd = en + added;
          } else {
            document.execCommand("insertText", false, "\t");
          }
          updateDirty();
          refreshStatus();
          renderGutter();
          syncGutter();
          scheduleHl();
        } else if (
          e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" ||
          e.key === "ArrowDown" || e.key === "Home" || e.key === "End" ||
          e.key === "PageUp" || e.key === "PageDown"
        ) {
          requestAnimationFrame(refreshStatus);
        }
      });
      ta.addEventListener("click", refreshStatus);
      ta.addEventListener("keyup", refreshStatus);
      ta.addEventListener("select", refreshStatus);
      setTimeout(() => {
        refreshStatus();
        updateDirty();
        renderGutter();
        ta.focus();
        const cur = editCursor.get(absPath);
        if (cur && cur.char >= 0 && cur.char <= ta.value.length) {
          ta.setSelectionRange(cur.char, cur.char);
        } else {
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        // 保持预览滚动位置，覆盖浏览器聚焦时的自动滚动，避免内容跳动；
        // 顺带让行号列与内容严格同步
        requestAnimationFrame(() => {
          ta.scrollTop = pvScroll;
          syncGutter();
          refreshStatus();
          syncHlScroll();
        });
      }, 10);
    });
  }

  const md = {
    parse(src) {
      const fn = globalThis.__ocParseMarkdown;
      if (fn) {
        return Promise.resolve()
          .then(() => fn(src))
          .then((h) => String(h || ""));
      }
      return new Promise((resolve, reject) => {
        let tries = 0;
        const poll = () => {
          const f = globalThis.__ocParseMarkdown;
          if (f) {
            resolve(f(src).then((h) => String(h || "")));
            return;
          }
          if (++tries > 40) {
            reject(new Error("markdown engine not ready"));
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      });
    },
  };

  const mdParse = async (absPath) => {
    const f = fs();
    const read = await f.read(absPath);
    if (!read.ok) throw new Error(read.error || "read failed");
    return md.parse(read.content || "");
  };

  function openPreviewLayer(absPath, relPath, type) {
    const displayName = nameOf(relPath) || relPath;
    const container = previewContainer();
    if (!container) {
      toast(L.noDir);
      return;
    }
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    const layer = document.createElement("div");
    layer.style.cssText =
      "position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;" +
      "background:var(--background-stronger,#161616);pointer-events:auto;";
    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:6px 12px;flex:0 0 auto;" +
      "border-bottom:1px solid var(--border-base,#333);";
    const title = document.createElement("div");
    title.textContent = displayName;
    title.title = absPath;
    title.style.cssText =
      "flex:0 0 auto;max-width:36%;font-size:13px;font-weight:600;color:var(--text-strong,#fff);" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const hint = document.createElement("div");
    hint.textContent = type === "html" ? "HTML" : "Markdown";
    hint.style.cssText =
      "flex:1;min-width:0;font-size:12px;color:var(--text-weak,#888);" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;";
    const reloadBtn = makeBtn(L.reload, false);
    const editBtn = makeBtn(L.edit, false);
    const closeBtn = makeBtn(L.cancel, false);
    head.appendChild(title);
    head.appendChild(hint);
    head.appendChild(reloadBtn);
    head.appendChild(editBtn);
    head.appendChild(closeBtn);
    const body = document.createElement("div");
    body.style.cssText = "flex:1;min-height:0;position:relative;overflow:auto;";
    layer.appendChild(head);
    layer.appendChild(body);
    container.appendChild(layer);
    const close = () => {
      window.removeEventListener("keydown", onKey, true);
      layer.remove();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    closeBtn.addEventListener("click", close);

    if (type === "html") {
      let seq = 0;
      const render = () => {
        seq += 1;
        body.textContent = "";
        const fr = document.createElement("iframe");
        fr.src = ocFileUrl(absPath) + (seq > 1 ? "?r=" + seq : "");
        fr.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;";
        fr.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
        );
        body.appendChild(fr);
      };
      render();
      reloadBtn.addEventListener("click", render);
    } else {
      const view = document.createElement("div");
      view.style.cssText =
        "padding:16px 20px 48px;font-size:13px;line-height:24px;tab-size:4;" +
        "color:var(--text-strong,#e8e8e8);";
      view.className = "oc-md";
      body.appendChild(view);
      const render = () => {
        view.textContent = "…";
        mdParse(absPath)
          .then((html) => {
            if (!layer.isConnected) return;
            view.innerHTML = html;
          })
          .catch((err) => {
            if (!layer.isConnected) return;
            view.textContent = String((err && err.message) || err);
          });
      };
      render();
      reloadBtn.addEventListener("click", render);
    }

    editBtn.addEventListener("click", async () => {
      close();
      const f = fs();
      const read = await f.read(absPath);
      if (read.ok) editInPlace(absPath, relPath, read.content || "");
    });
  }

  function closeMenu() {
    if (!overlay) return;
    const menu = $("#__oc_ft_menu");
    if (menu) menu.remove();
  }

  function showMenu(items, x, y) {
    closeMenu();
    const root = ensureRoot();
    const menu = document.createElement("div");
    menu.id = "__oc_ft_menu";
    menu.style.cssText =
      "position:fixed;z-index:2147483646;min-width:200px;background:var(--surface-raised-base,#222);" +
      "border:1px solid var(--border-base,#444);border-radius:8px;padding:4px;" +
      "box-shadow:0 10px 32px rgba(0,0,0,.4);pointer-events:auto;";
    const item = (label, enabled, onClick, danger) => {
      const d = document.createElement("div");
      d.textContent = label;
      d.style.cssText =
        "padding:6px 10px;border-radius:5px;font-size:13px;cursor:" +
        (enabled ? "pointer" : "default") +
        ";color:" +
        (enabled ? (danger ? "#ff6b6b" : "var(--text-strong,#fff)") : "var(--text-weak,#777)") +
        ";";
      if (enabled) {
        d.addEventListener("mouseenter", () => {
          d.style.background = "var(--surface-raised-base-hover,#2b2b2b)";
        });
        d.addEventListener("mouseleave", () => {
          d.style.background = "transparent";
        });
        d.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            window.__ocFTDiag = window.__ocFTDiag || { ctx: 0, click: 0, err: 0 };
            window.__ocFTDiag.click += 1;
          } catch (_) {}
          closeMenu();
          setTimeout(() => onClick(), 0);
        });
      }
      menu.appendChild(d);
    };
    const sep = () => {
      const s = document.createElement("div");
      s.style.cssText = "height:1px;background:var(--border-base,#3a3a3a);margin:4px 6px;";
      menu.appendChild(s);
    };
    items.forEach((it) => {
      if (it.type === "sep") sep();
      else item(it.label, it.enabled, it.onClick, it.danger);
    });
    root.appendChild(menu);
    const mh = menu.offsetHeight || items.length * 30 + 10;
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - 220)) + "px";
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 8)) + "px";
    const dismiss = (e) => {
      if (!menu.isConnected) return;
      if (e.type === "blur" && document.hasFocus()) return;
      if (e.target && menu.contains(e.target)) return;
      closeMenu();
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("blur", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
        window.removeEventListener("mousedown", dismiss, true);
        window.removeEventListener("blur", dismiss, true);
        document.removeEventListener("scroll", dismiss, true);
        window.removeEventListener("keydown", onKey, true);
      }
    };
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("blur", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", onKey, true);
  }

  async function ensureUniquePath(targetDir, name) {
    const f = fs();
    let candidate = name;
    let i = 1;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    while (true) {
      const r = await f.exists(toAbs(joinRel(targetDir, candidate)));
      if (!r.ok || !r.exists) return candidate;
      i += 1;
      candidate = base + " (副本" + (i > 2 ? " " + i : "") + ")" + ext;
    }
  }

  const actions = {
    async newFile(targetDir) {
      const name = await ask({ title: L.newFileTitle, placeholder: L.namePlaceholder });
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        toast(L.emptyName);
        return;
      }
      const path = joinRel(targetDir, trimmed);
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const f = fs();
      const ex = await f.exists(abs);
      if (ex.ok && ex.exists) {
        toast(L.exists);
        return;
      }
      const r = await f.write(abs, "");
      toast(r.ok ? L.done.created : L.opError + ": " + (r.error || ""));
    },
    async newFolder(targetDir) {
      const name = await ask({ title: L.newFolderTitle, placeholder: L.namePlaceholder });
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        toast(L.emptyName);
        return;
      }
      const path = joinRel(targetDir, trimmed);
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const f = fs();
      const ex = await f.exists(abs);
      if (ex.ok && ex.exists) {
        toast(L.exists);
        return;
      }
      const r = await f.mkdir(abs);
      toast(r.ok ? L.done.created : L.opError + ": " + (r.error || ""));
    },
    async edit(path) {
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const f = fs();
      const read = await f.read(abs);
      if (!read.ok) {
        toast(L.opError + ": " + (read.error || ""));
        return;
      }
      const relPath = cleanRel(path);
      const tabRel = activeTabRel();
      const inPlace =
        tabRel && (tabRel === relPath || tabRel.endsWith("/" + relPath)) && !!previewContainer();
      if (inPlace) {
        const saved = recordScroll(previewContainer());
        await editInPlace(abs, relPath, read.content || "");
        if (saved) restoreScroll(null, saved);
      } else {
        const content = await editFile(abs, relPath);
        if (content === null) return;
        const r = await f.write(abs, content);
        toast(r.ok ? L.done.edited : L.opError + ": " + (r.error || ""));
      }
    },
    async preview(path) {
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const relPath = cleanRel(path);
      const type = previewType(relPath);
      if (!type) return;
      const tabRel = activeTabRel();
      const isCurrent = tabRel && (tabRel === relPath || tabRel.endsWith("/" + relPath));
      if (isCurrent && previewContainer()) {
        openPreviewLayer(abs, relPath, type);
        return;
      }
      const targetTab = findFileTab(relPath);
      if (targetTab) {
        fireClick(targetTab);
      } else {
        const row = findTreeRow(relPath);
        if (row) fireClick(row);
        else {
          toast(L.openFirst);
          return;
        }
      }
      const ok = await waitFor(
        () => {
          const tr = activeTabRel();
          return !!previewContainer() && tr && (tr === relPath || tr.endsWith("/" + relPath));
        },
        3500
      );
      if (ok) openPreviewLayer(abs, relPath, type);
      else toast(L.openFirst);
    },
    async copyNode(path) {
      clip.path = cleanRel(path);
      toast(L.done.copied);
    },
    async paste(targetDir) {
      if (!clip.path) {
        toast(L.noClip);
        return;
      }
      const f = fs();
      const srcAbs = toAbs(clip.path);
      if (!srcAbs) {
        toast(L.noDir);
        return;
      }
      const srcInfo = await f.exists(srcAbs);
      if (!srcInfo.ok || !srcInfo.exists) {
        toast(L.opError + ": " + L.noClip);
        clip.path = null;
        return;
      }
      if (cleanRel(targetDir) === clip.path) return;
      if (cleanRel(targetDir).startsWith(clip.path + "/")) {
        toast(L.cannotIntoSelf);
        return;
      }
      const unique = await ensureUniquePath(targetDir, nameOf(clip.path));
      const dest = joinRel(targetDir, unique);
      const r = await f.copy(srcAbs, toAbs(dest), false);
      toast(r.ok ? L.done.pasted : L.opError + ": " + (r.error || ""));
    },
    async renameNode(path) {
      const current = nameOf(path);
      const name = await ask({ title: L.renameTitle, initial: current });
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) {
        toast(L.emptyName);
        return;
      }
      if (trimmed === current) return;
      const dest = joinRel(dirOf(path), trimmed);
      const absFrom = toAbs(path);
      const absTo = toAbs(dest);
      if (!absFrom || !absTo) {
        toast(L.noDir);
        return;
      }
      const f = fs();
      const ex = await f.exists(absTo);
      if (ex.ok && ex.exists) {
        toast(L.exists);
        return;
      }
      const r = await f.rename(absFrom, absTo);
      toast(r.ok ? L.done.renamed : L.opError + ": " + (r.error || ""));
    },
    async deleteNode(path) {
      const name = nameOf(path) || path;
      const ok = await confirmDialog({ title: L.delTitle, message: L.delMessage(name), okText: L.del });
      if (!ok) return;
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const r = await fs().remove(abs);
      toast(r.ok ? L.done.deleted : L.opError + ": " + (r.error || ""));
    },
    async copyPath(path) {
      const abs = toAbs(path);
      if (!abs) {
        toast(L.noDir);
        return;
      }
      const r = await fs().clipboardWrite(abs);
      if (r.ok) toast(L.done.pathCopied);
    },
    async reveal(path) {
      const abs = toAbs(path);
      if (!abs) return;
      if (window.api && window.api.revealPath) window.api.revealPath(abs);
    },
  };

  function runSafely(fn) {
    return async (...args) => {
      try {
        if (!window.api || !window.api.fs) {
          toast(L.noApi);
          return;
        }
        await fn(...args);
      } catch (err) {
        console.error("[filetree-menu]", err);
        toast(L.opError + ": " + (err && err.message ? err.message : String(err)));
      }
    };
  }

  const guard = (fn, ...args) => () => runSafely(fn)(...args);

  function rowTarget(el) {
    const row = el && el.closest ? el.closest("[data-path]") : null;
    if (!row) return null;
    return {
      path: row.getAttribute("data-path") || "",
      type: row.getAttribute("data-type") || "",
    };
  }

  function backgroundDir(el) {
    const col = el.closest('[data-scope="filetree"]');
    if (!col) return "";
    const row = col.querySelector("[data-path]");
    return row ? row.getAttribute("data-path") || "" : "";
  }

  function isInFileTree(el) {
    return !!el.closest(
      '#file-tree-panel, [data-component="filetree"], [data-slot="file-tree-v2-row"], [data-slot="file-tree-browser-v2"]'
    );
  }

  function onContextMenu(e) {
    try {
      window.__ocFTDiag = window.__ocFTDiag || { ctx: 0, click: 0, err: 0 };
      window.__ocFTDiag.ctx += 1;
    } catch (_) {}
    const el = e.target;
    if (!el || !el.closest) return;
    if (!isInFileTree(el)) return;
    e.preventDefault();
    e.stopPropagation();

    let nodePath = "";
    let nodeType = "";
    let targetDir = "";
    const target = rowTarget(el);
    if (target) {
      nodePath = cleanRel(target.path);
      nodeType = target.type === "file" ? "file" : "directory";
      targetDir = nodeType === "file" ? dirOf(nodePath) : nodePath;
    } else {
      targetDir = backgroundDir(el);
      if (targetDir) nodePath = cleanRel(targetDir);
    }

    const items = [];
    const canPaste = !!clip.path;
    items.push({ label: L.newFile, enabled: true, onClick: guard(actions.newFile, targetDir) });
    items.push({ label: L.newFolder, enabled: true, onClick: guard(actions.newFolder, targetDir) });
    items.push({ type: "sep" });
    items.push({ label: L.paste, enabled: canPaste, onClick: guard(actions.paste, targetDir) });
    if (nodePath) {
      items.push({ label: L.copy, enabled: true, onClick: guard(actions.copyNode, nodePath) });
      items.push({ label: L.rename, enabled: true, onClick: guard(actions.renameNode, nodePath) });
      items.push({ type: "sep" });
      items.push({
        label: L.del,
        enabled: true,
        danger: true,
        onClick: guard(actions.deleteNode, nodePath),
      });
      items.push({ type: "sep" });
      items.push({
        label: L.copyPath,
        enabled: true,
        onClick: guard(actions.copyPath, nodePath),
      });
      items.push({
        label: L.reveal,
        enabled: true,
        onClick: guard(actions.reveal, nodePath),
      });
      if (nodeType === "file") {
        if (previewType(nodePath)) {
          items.push({
            label: L.preview,
            enabled: true,
            onClick: guard(actions.preview, nodePath),
          });
        }
        items.push({ label: L.edit, enabled: true, onClick: guard(actions.edit, nodePath) });
      }
    }

    if (!items.length) return;
    showMenu(items, e.clientX, e.clientY);
  }

  const ctxHandler = (e) => {
    try {
      onContextMenu(e);
    } catch (err) {
      console.error("[filetree-menu]", err);
      try {
        window.__ocFTDiag = window.__ocFTDiag || { ctx: 0, click: 0, err: 0 };
        window.__ocFTDiag.err += 1;
        toast(L.opError + ": " + ((err && err.message) || String(err)));
      } catch (_) {}
    }
  };
  window.addEventListener("contextmenu", ctxHandler, true);
  document.addEventListener("contextmenu", ctxHandler, true);

  // ── 原生预览顶部工具栏（"编辑"按钮）────────────────────────
  // 点击文件（txt 等）在原生预览窗口上方显示一个工具栏：文件名 + 预览(html/md) + 编辑。
  // 点击"编辑"直接进入就地编辑（复用 actions.edit）。
  // Solid 切换文件会重建 mt3 子树，因此用 MutationObserver 监视，每次重建后重新注入。
  let nativeSyncT = 0;
  const scheduleNativeToolbar = () => {
    if (nativeSyncT) return;
    nativeSyncT = setTimeout(() => {
      nativeSyncT = 0;
      try {
        ensureNativeToolbar();
      } catch (_) {}
    }, 120);
  };

  function removeNativeToolbar() {
    const bar = document.getElementById("__oc_native_toolbar");
    if (bar) bar.remove();
    const container = previewContainer();
    if (container && container.__ocNativeFlex) {
      const sv = container.querySelector(".scroll-view.h-full");
      container.style.display = "";
      container.style.flexDirection = "";
      if (sv) {
        sv.style.flex = "";
        sv.style.minHeight = "";
      }
      container.__ocNativeFlex = false;
    }
  }

  function ensureNativeToolbar() {
    const container = previewContainer();
    if (!container) {
      removeNativeToolbar();
      return;
    }
    const tab = activeFileTab();
    const relPath = activeTabRel();
    if (!tab || !relPath) {
      removeNativeToolbar();
      return;
    }
    // 仅原生文本预览（diffs-container）显示；网页/MD 预览层、就地编辑层不显示
    if (!container.querySelector("diffs-container")) {
      removeNativeToolbar();
      return;
    }
    const exist = document.getElementById("__oc_native_toolbar");
    if (exist && exist.getAttribute("data-path") === relPath) return;
    removeNativeToolbar();
    const sv = container.querySelector(".scroll-view.h-full");
    if (!sv) return;
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.__ocNativeFlex = true;
    sv.style.flex = "1";
    sv.style.minHeight = "0";

    const bar = document.createElement("div");
    bar.id = "__oc_native_toolbar";
    bar.setAttribute("data-path", relPath);
    bar.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:6px 12px;flex:0 0 auto;" +
      "border-bottom:1px solid var(--border-base,#333);" +
      "background:var(--background-stronger,#161616);";
    const title = document.createElement("div");
    title.textContent = nameOf(relPath);
    title.title = relPath;
    title.style.cssText =
      "flex:0 0 auto;max-width:36%;font-size:13px;font-weight:600;color:var(--text-strong,#fff);" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const hint = document.createElement("div");
    hint.style.cssText =
      "flex:1;min-width:0;font-size:12px;color:var(--text-weak,#888);" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;";
    const type = previewType(relPath);
    if (type) hint.textContent = type === "html" ? "HTML" : "Markdown";
    const editBtn = makeBtn(L.edit, true);
    editBtn.addEventListener("click", () => {
      try {
        runSafely(actions.edit)(relPath);
      } catch (_) {}
    });
    bar.appendChild(title);
    bar.appendChild(hint);
    if (type) {
      const previewBtn = makeBtn(L.preview, false);
      previewBtn.addEventListener("click", () => {
        try {
          runSafely(actions.preview)(relPath);
        } catch (_) {}
      });
      bar.appendChild(previewBtn);
    }
    bar.appendChild(editBtn);
    container.insertBefore(bar, container.firstChild);
  }

  // ---- 终端标题栏（永远可见，仿旧自定义终端"▣ 终端"控制栏设计）----
  // 追加为右列 flex-col 的最后一个子项：终端面板在其上方展开，面板关闭时栏仍常驻底部；
  // 点击栏或按钮：关闭→调出（自动新建会话）、拖到底→拉回、正常高度→收起。
  function setupTerminalTitleBar() {
    const ID = "__oc_term_titlebar";
    const ICON =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
    const rightColumn = () => {
      const rv = document.querySelector("#review-panel");
      if (rv) {
        const col = rv.closest('div[class*="flex-col"]');
        if (col) return col;
      }
      // 兜底：终端面板的祖父级 flex 列
      const p = document.querySelector("#terminal-panel");
      return p && p.parentElement && p.parentElement.parentElement ? p.parentElement.parentElement : null;
    };
    const create = () => {
      const col = rightColumn();
      if (!col) return null;
      let bar = document.getElementById(ID);
      if (bar && bar.isConnected && bar.parentElement === col && col.lastElementChild === bar) return bar;
      if (bar && bar.isConnected && bar.parentElement === col) {
        col.appendChild(bar); // 已被 Solid 重排，重新置底
        return bar;
      }
      bar = document.createElement("div");
      bar.id = ID;
      bar.style.cssText =
        "flex:0 0 auto;height:30px;display:flex;align-items:center;gap:10px;padding:0 12px;" +
        "font-size:12px;color:var(--text-strong,#dbe4f0);background:var(--surface-raised-base,#161b22);" +
        "border-top:1px solid var(--border-base,#30363d);cursor:pointer;user-select:none;";
      const label = document.createElement("span");
      label.style.cssText = "font-weight:600;letter-spacing:.3px;";
      label.textContent = "▣ 终端";
      const hint = document.createElement("span");
      hint.id = ID + "_hint";
      hint.style.cssText = "color:var(--text-weak,#8b949e);";
      hint.textContent = "点击展开";
      const spacer = document.createElement("span");
      spacer.style.cssText = "flex:1;";
      const toggle = document.createElement("button");
      toggle.id = ID + "_btn";
      toggle.type = "button";
      toggle.title = "展开 / 收起终端";
      toggle.setAttribute("aria-label", "终端");
      toggle.innerHTML = ICON;
      toggle.style.cssText =
        "cursor:pointer;border:1px solid var(--border-base,#30363d);border-radius:5px;background:transparent;" +
        "color:var(--text-strong,#dbe4f0);font-size:11px;line-height:1;padding:4px 8px;display:flex;align-items:center;";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        try { toggleTerminal(); } catch (_) {}
      });
      bar.addEventListener("click", () => { try { toggleTerminal(); } catch (_) {} });
      bar.appendChild(label);
      bar.appendChild(hint);
      bar.appendChild(spacer);
      bar.appendChild(toggle);
      col.appendChild(bar);
      return bar;
    };
    // Solid 切换文件会重建右列子树 → MutationObserver 重注入并置底
    let t = 0;
    const sync = () => {
      if (t) return;
      t = setTimeout(() => {
        t = 0;
        try { create(); } catch (_) {}
      }, 80);
    };
    try {
      const mo = new MutationObserver(sync);
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
    create();
    // 轻量状态同步：面板开着时标题栏高亮 + 提示翻转（每 900ms 轮询）
    setInterval(() => {
      const bar = document.getElementById(ID);
      const hint = document.getElementById(ID + "_hint");
      const btn = document.getElementById(ID + "_btn");
      if (!bar || !bar.isConnected) { create(); return; }
      const open = !!document.querySelector("#terminal-panel");
      if (open) {
        bar.style.background = "var(--surface-accent-base,#2d4a8c)";
        if (hint) hint.textContent = "点击收起";
        if (btn) btn.style.color = "#fff";
      } else {
        bar.style.background = "var(--surface-raised-base,#161b22)";
        if (hint) hint.textContent = "点击展开";
        if (btn) btn.style.color = "var(--text-strong,#dbe4f0)";
      }
    }, 900);
  }
  function toggleTerminal() {
    const w = window;
    if (typeof w.__ocToggleTerminal !== "function") {
      toast("终端加载中…");
      return;
    }
    const panel = document.querySelector("#terminal-panel");
    if (!panel) {
      w.__ocToggleTerminal(); // 面板未开 → 调出（原版会自动新建会话）
      return;
    }
    const h = panel.getBoundingClientRect().height;
    if (h <= 130) {
      // 面板被拖到最底 → 拉回展开到视口 45%
      if (typeof w.__ocTerminalResize === "function") {
        w.__ocTerminalResize(Math.max(200, Math.round(window.innerHeight * 0.45)));
      } else {
        w.__ocToggleTerminal();
      }
    } else {
      w.__ocToggleTerminal(); // 正常高度 → 收起
    }
  }
  setupTerminalTitleBar();

  try {
    const mo = new MutationObserver(scheduleNativeToolbar);
    mo.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected", "data-selected"],
    });
  } catch (_) {}
  document.addEventListener(
    "click",
    (e) => {
      try {
        if (e.target && e.target.closest && isInFileTree(e.target)) scheduleNativeToolbar();
      } catch (_) {}
    },
    true
  );
  setTimeout(scheduleNativeToolbar, 600);

})();
