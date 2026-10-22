  /* ================= 工具 ================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function uid() {
    return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    const s = String(name || "?").trim();
    return s ? s.slice(0, 1) : "?";
  }

  // 人物圈里那个字的颜色：正常用白字，但人物色本身很亮时（玻璃底叠出来也发亮）
  // 白字会糊，这时换成深墨色字。两个返回值分别对应「实色圈」和「人物卡上的玻璃圈」。
  function charInkColors(hex) {
    const s = String(hex || "").trim().replace(/^#/, "");
    let r, g, b;
    if (/^[0-9a-f]{3}$/i.test(s)) {
      r = parseInt(s[0] + s[0], 16);
      g = parseInt(s[1] + s[1], 16);
      b = parseInt(s[2] + s[2], 16);
    } else if (/^[0-9a-f]{6}$/i.test(s)) {
      r = parseInt(s.slice(0, 2), 16);
      g = parseInt(s.slice(2, 4), 16);
      b = parseInt(s.slice(4, 6), 16);
    } else {
      return { solid: "#141922", glass: "#ffffff" };
    }
    const lin = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lumOf = (rr, gg, bb) => 0.2126 * lin(rr) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
    // 实色圈：按白 / 深墨哪个对比度高来选（交叉点在 0.179 附近）
    const solid = lumOf(r, g, b) > 0.179 ? "#141922" : "#ffffff";
    // 玻璃圈：底色＝62% 人物色叠在卡片底色上，再叠一层白色高光，按叠加后的实际颜色判断。
    // 门槛放得比较高：只有真的很浅的人物色才换深墨字，普通人物色仍保持白字。
    const mix = (c, bgc) => c * 0.62 + bgc * 0.38;
    const lift = (c) => c + (255 - c) * 0.1;
    const glassLum = lumOf(lift(mix(r, 27)), lift(mix(g, 33)), lift(mix(b, 43)));
    const glass = glassLum > 0.33 ? "#141922" : "#ffffff";
    return { solid, glass };
  }

  function avatarHtml(char) {
    if (char && char.portrait) {
      return `<span class="avatar avatar-img"><img src="${esc(char.portrait)}" alt="" /></span>`;
    }
    // 人物色写进 --char-color：圆圈底色统一在 CSS 里取 var(--char-color)，
    // 这样人物卡那边可以换成半透明玻璃底色，其它地方仍是实色。
    const ink = charInkColors(char.color);
    return `<span class="avatar" style="--char-color:${esc(char.color)};--char-ink:${ink.glass};--char-ink-solid:${ink.solid}">${esc(
      initials(char.name)
    )}</span>`;
  }

  function lineLabel(l) {
    return "[" + (l.code || "?") + "] " + lineDisplayName(l);
  }

  /* 把 position:fixed 的浮动层摆到鼠标右下角（右边 / 下边放不开就翻到左上）。
     注意：html 上的 zoom 会让「固定定位的 left/top」按布局像素算，而鼠标事件的 clientX/Y、
     innerWidth/innerHeight 是视觉像素——不换算的话，缩放后弹层会明显跑偏
     （缩放 0.75 时跑到鼠标左上、1.5 时跑到很远的右下）。 */
  let uiLastContextTarget = null;
  let uiLastContextAt = 0;
  let uiLastPointer = { x: 0, y: 0, at: 0 };
  const rememberPointer = (ev) => {
    if (!ev || typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return;
    uiLastPointer = { x: ev.clientX, y: ev.clientY, at: Date.now() };
  };
  document.addEventListener("mousemove", rememberPointer, true);
  document.addEventListener("mousedown", rememberPointer, true);
  window.addEventListener("wheel", rememberPointer, { capture: true, passive: true });
  document.addEventListener(
    "contextmenu",
    (ev) => {
      uiLastContextTarget = ev.target;
      uiLastContextAt = Date.now();
    },
    true
  );

  function placeFloatingAtCursor(el, x, y, offX, offY, anchorArg) {
    if (!el) return;
    /* 右键菜单浮在最上层：别的「持续悬停」浮层（人物卡悬停说明、全局预览、位置提示…）
       都排在菜单下面，免得一直挡着菜单项。 */
    if (el.classList && el.classList.contains("context-menu")) {
      if (typeof hideNameTip === "function") hideNameTip(true);
      if (typeof hideAxisPosTag === "function") hideAxisPosTag();
    }
    const r = uiVisualRect(el);
    const w = r.width || 0;
    const h = r.height || 0;
    const ox = typeof offX === "number" ? offX : 12;
    const oy = typeof offY === "number" ? offY : 12;
    let anchor = anchorArg || null;
    if (!anchor && el.classList && el.classList.contains("context-menu")) {
      if (uiLastContextTarget && Date.now() - uiLastContextAt < 900) anchor = uiLastContextTarget;
      else if (document.elementFromPoint) anchor = document.elementFromPoint(x, y);
      if (anchor && (el === anchor || el.contains(anchor))) anchor = null;
      uiLastContextTarget = null;
      uiLastContextAt = 0;
    }
    let vx = x + ox;
    let vy = y + oy;
    if (w && vx + w > window.innerWidth - 6) vx = Math.max(6, x - ox - w);
    if (h && vy + h > window.innerHeight - 6) vy = Math.max(6, y - oy - h);
    el.style.left = uiZoomPx(vx);
    el.style.top = uiZoomPx(vy);
    /* 记下这次的落点：界面缩放一变要按同一套参数重放（见 00-prelude 的 uiOnZoomReflow） */
    uiCursorFloats.add(el);
    let relX = 0.5;
    let relY = 0.5;
    if (anchor && anchor.getBoundingClientRect) {
      const ar = uiVisualRect(anchor);
      if (ar.width > 0 && ar.height > 0) {
        relX = Math.max(0, Math.min(1, (x - ar.left) / ar.width));
        relY = Math.max(0, Math.min(1, (y - ar.top) / ar.height));
      }
    }
    el._uiFloatArgs = {
      x: x,
      y: y,
      ox: typeof offX === "number" ? offX : 12,
      oy: typeof offY === "number" ? offY : 12,
      anchor: anchor && anchor.isConnected ? anchor : null,
      relX,
      relY,
    };
  }

  /* 鼠标锚定的浮层（右键菜单 / 拖拽幽灵 / 位置提示 / 各种小面板）：缩放后按原参数重放 */
  const uiCursorFloats = new Set();
  uiOnZoomReflow(() => {
    Array.from(uiCursorFloats).forEach((el) => {
      if (!el.isConnected || el.hidden) {
        uiCursorFloats.delete(el);
        return;
      }
      const a = el._uiFloatArgs;
      if (a) {
        let ax = a.x;
        let ay = a.y;
        const isMenu = !!(el.classList && el.classList.contains("context-menu"));
        if (isMenu && Date.now() - uiLastPointer.at < 5000) {
          /* 右键菜单是“贴着鼠标”的，Ctrl+滚轮 / Ctrl+0 缩放时鼠标没动，
             直接用最后指针位置重放；比拿旧元素矩形更稳。 */
          ax = uiLastPointer.x;
          ay = uiLastPointer.y;
        } else if (a.anchor && a.anchor.isConnected) {
          const ar = uiVisualRect(a.anchor);
          if (ar.width > 0 && ar.height > 0) {
            ax = ar.left + a.relX * ar.width;
            ay = ar.top + a.relY * ar.height;
          }
        }
        placeFloatingAtCursor(el, ax, ay, a.ox, a.oy, a.anchor || null);
      }
    });
  });

  function parseTags(s) {
    return String(s || "")
      .split(/[,，、;；\/|｜\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i);
  }

