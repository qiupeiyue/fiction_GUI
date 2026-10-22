  /* ================= 通用渲染：颜色选择、人物池 ================= */
  /* ---- 自定义颜色：色环 + RGB 输入（点色环、输 RGB 双向同步） ---- */
  let colorWheelPop = null;
  let colorWheelPlace = null;

  function closeColorWheelPop() {
    if (colorWheelPop && colorWheelPop.__onKey) {
      document.removeEventListener("keydown", colorWheelPop.__onKey, true);
    }
    if (colorWheelPop) {
      colorWheelPop.remove();
      colorWheelPop = null;
    }
    colorWheelPlace = null;
    document.removeEventListener("mousedown", onDocDownForColorWheel, true);
  }
  uiOnZoomReflow(() => {
    if (colorWheelPlace) colorWheelPlace();
  });

  function onDocDownForColorWheel(e) {
    if (colorWheelPop && !colorWheelPop.contains(e.target)) closeColorWheelPop();
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return { r: 141, g: 160, b: 203 }; // 兜底：#8DA0CB
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const h = (x) =>
      Math.max(0, Math.min(255, Math.round(Number(x) || 0))).toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max ? d / max : 0, v: max };
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return { r: (t[0] + m) * 255, g: (t[1] + m) * 255, b: (t[2] + m) * 255 };
  }

  function drawColorRing(canvas, hue) {
    const ctx = canvas.getContext("2d");
    const c = canvas.width / 2;
    const rOut = c - 3;
    const rIn = rOut - 22;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let a = 0; a < 360; a++) {
      const s0 = (a * Math.PI) / 180;
      const e0 = ((a + 1.6) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(c, c, (rOut + rIn) / 2, s0, e0);
      ctx.strokeStyle = `hsl(${a} 100% 50%)`;
      ctx.lineWidth = rOut - rIn;
      ctx.stroke();
    }
    // 色相指针
    const rad = (hue * Math.PI) / 180;
    const px = c + Math.cos(rad) * ((rIn + rOut) / 2);
    const py = c + Math.sin(rad) * ((rIn + rOut) / 2);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue} 100% 50%)`;
    ctx.fill();
  }

  // anchor：贴着哪个色块弹；current：当前颜色；onPick(hex)：按 Enter / 确定后才调用
  // 色环管色相，环内的方块管饱和度 / 明度 —— 合起来能取到任意 RGB；
  // Enter＝确认并关闭（应用颜色），Esc / 取消＝直接关闭（颜色不变）。
  function openColorWheelPop(anchor, current, onPick) {
    closeColorWheelPop();
    const pop = document.createElement("div");
    pop.className = "color-wheel-pop";
    pop.innerHTML = `
      <div class="cw-ring-wrap">
        <canvas class="cw-ring" width="176" height="176"></canvas>
        <div class="cw-sv"><span class="cw-sv-dot"></span></div>
      </div>
      <div class="cw-side">
        <div class="cw-preview"></div>
        <label class="cw-field">R<input type="number" min="0" max="255" step="1" class="cw-num cw-r"></label>
        <label class="cw-field">G<input type="number" min="0" max="255" step="1" class="cw-num cw-g"></label>
        <label class="cw-field">B<input type="number" min="0" max="255" step="1" class="cw-num cw-b"></label>
        <div class="cw-actions">
          <button type="button" class="btn btn-sm btn-primary cw-ok">确定</button>
          <button type="button" class="btn btn-sm cw-cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    const canvas = pop.querySelector(".cw-ring");
    const sv = pop.querySelector(".cw-sv");
    const dot = pop.querySelector(".cw-sv-dot");
    const prev = pop.querySelector(".cw-preview");
    const rIn = pop.querySelector(".cw-r");
    const gIn = pop.querySelector(".cw-g");
    const bIn = pop.querySelector(".cw-b");
    const start = hexToRgb(current);
    let rgb = { r: start.r, g: start.g, b: start.b };
    const hsv0 = rgbToHsv(rgb.r, rgb.g, rgb.b);
    let hue = hsv0.h;
    let sat = hsv0.s;
    let val = hsv0.v;

    const paint = () => {
      rgb = hsvToRgb(hue, sat, val);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      prev.style.background = hex;
      rIn.value = Math.round(rgb.r);
      gIn.value = Math.round(rgb.g);
      bIn.value = Math.round(rgb.b);
      drawColorRing(canvas, hue);
      sv.style.background =
        "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(" +
        hue +
        " 100% 50%)";
      dot.style.left = sat * 100 + "%";
      dot.style.top = (1 - val) * 100 + "%";
    };

    const commit = () => {
      if (onPick) onPick(rgbToHex(rgb.r, rgb.g, rgb.b));
      closeColorWheelPop();
    };
    const cancel = () => closeColorWheelPop();

    // 色环：点 / 拖都改色相
    const pickRing = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      hue = deg;
      if (sat <= 0.02 && val <= 0.02) {
        sat = 1;
        val = 1;
      }
      paint();
    };
    // 方块：点 / 拖改饱和度（横）与明度（纵）
    const pickSv = (ev) => {
      const rect = sv.getBoundingClientRect();
      sat = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      val = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
      paint();
    };
    const drag = (el, fn) => {
      el.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          el.setPointerCapture(ev.pointerId);
        } catch (e) {
          /* ignore */
        }
        fn(ev);
        const move = (e2) => fn(e2);
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      });
    };
    drag(canvas, pickRing);
    drag(sv, pickSv);

    const readNums = () => {
      const cl = (x) => Math.max(0, Math.min(255, Math.round(Number(x) || 0)));
      rgb = { r: cl(rIn.value), g: cl(gIn.value), b: cl(bIn.value) };
      const h = rgbToHsv(rgb.r, rgb.g, rgb.b);
      if (h.s > 0.02) hue = h.h;
      sat = h.s;
      val = h.v;
      paint();
    };
    [rIn, gIn, bIn].forEach((inp) => {
      inp.addEventListener("input", readNums);
      inp.addEventListener("change", readNums);
    });
    pop.querySelector(".cw-ok").addEventListener("click", commit);
    pop.querySelector(".cw-cancel").addEventListener("click", cancel);

    const onKey = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        cancel();
      }
    };
    pop.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey, true);
    pop.__onKey = onKey;

    const place = () => {
      if (!pop.isConnected || !anchor || !anchor.isConnected) return;
      const r = uiVisualRect(anchor);
      const pr = uiVisualRect(pop);
      const w = pr.width;
      const hgt = pr.height;
      // 视觉坐标 → 元素坐标系（缩放时别被放大第二次）
      pop.style.left = uiZoomPx(Math.max(8, Math.min(r.left - 6, window.innerWidth - w - 8)));
      pop.style.top = uiZoomPx(Math.max(8, Math.min(r.bottom + 6, window.innerHeight - hgt - 8)));
    };
    colorWheelPlace = place;
    place();
    paint();
    colorWheelPop = pop;
    setTimeout(() => document.addEventListener("mousedown", onDocDownForColorWheel, true), 0);
  }

  function makePicker(boxId, colors, get, set) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const cur = get();
    const inPalette = colors.indexOf(cur) >= 0;
    // 自定义颜色选过之后，末位色块直接用这个颜色（不再显示彩虹），点它仍能再改
    const customStyle = inPalette ? "" : `background:${esc(cur)}`;
    box.innerHTML =
      colors
        .map((c) => `<span class="swatch ${c === cur ? "selected" : ""}" data-color="${esc(c)}" style="background:${esc(c)}"></span>`)
        .join("") +
      `<span class="swatch rainbow${inPalette ? "" : " selected"}" data-color="__custom__" style="${customStyle}" title="自定义颜色（色环 / RGB）"></span>`;
    box.querySelectorAll(".swatch").forEach((s) => {
      s.addEventListener("click", (ev) => {
        if (s.dataset.color === "__custom__") {
          ev.stopPropagation();
          openColorWheelPop(s, get(), (hex) => {
            set(hex);
            makePicker(boxId, colors, get, set);
          });
          return;
        }
        set(s.dataset.color);
        makePicker(boxId, colors, get, set);
      });
    });
    renderEntryBatchBar();
  }

  // 展开选人框时的默认折叠状态：所有分组都自动展开
  function defaultPoolFolds() {
    return new Map();
  }

  function poolGroupCollapsed(gid) {
    if (!poolCollapsed) poolCollapsed = defaultPoolFolds();
    return !!poolCollapsed.get(gid || "");
  }

  function getPoolSelection(boxId) {
    const s = charPoolSel.get(boxId);
    return s ? Array.from(s) : [];
  }

  /* ---- 设定条目弹窗：「关联人物」默认折叠，标题后面列出已选人物，
     点标题上的箭头展开 / 收起勾选框 ---- */
  let entryCharPoolFolded = true;

  function setEntryCharPoolFold(folded) {
    entryCharPoolFolded = !!folded;
    if (!entryCharPoolFolded) poolCollapsed = defaultPoolFolds(); // 展开时：所有分组自动展开
    const pool = $("#entry-char-pool");
    if (pool) pool.hidden = entryCharPoolFolded;
    const btn = $("#entry-char-fold");
    if (btn) {
      btn.textContent = entryCharPoolFolded ? "▶" : "▼";
      btn.title = entryCharPoolFolded ? "展开人物勾选框" : "折叠人物勾选框";
      btn.setAttribute("aria-expanded", entryCharPoolFolded ? "false" : "true");
    }
  }

  /* 事件弹窗的「登场人物」：和「关联人物」一样，默认折叠，点标题上的箭头展开 */
  let eventCharPoolFolded = true;

  function setEventCharPoolFold(folded) {
    eventCharPoolFolded = !!folded;
    if (!eventCharPoolFolded) poolCollapsed = defaultPoolFolds(); // 展开时：所有分组自动展开
    const pool = $("#event-char-pool");
    if (pool) pool.hidden = eventCharPoolFolded;
    const btn = $("#event-char-fold");
    if (btn) {
      btn.textContent = eventCharPoolFolded ? "▶" : "▼";
      btn.title = eventCharPoolFolded ? "展开人物勾选框" : "折叠人物勾选框";
      btn.setAttribute("aria-expanded", eventCharPoolFolded ? "false" : "true");
    }
  }

  function updateEntryCharChosen(sel) {
    const el = $("#entry-char-chosen");
    if (!el) return;
    const set = sel || charPoolSel.get("entry-char-pool") || new Set();
    const names = Array.from(set)
      .map((id) => getChar(id))
      .filter(Boolean)
      .map((c) => c.name);
    el.textContent = names.length ? " · " + names.join("、") : "";
    el.title = names.length ? "已选：" + names.join("、") : "";
  }

  // 登场人物一样的「已选」摘要：折着也能一眼看到选了谁
  function updateEventCharChosen(sel) {
    const el = $("#event-char-chosen");
    if (!el) return;
    const set = sel || charPoolSel.get("event-char-pool") || new Set();
    const names = Array.from(set)
      .map((id) => getChar(id))
      .filter(Boolean)
      .map((c) => c.name);
    el.textContent = names.length ? " · " + names.join("、") : "";
    el.title = names.length ? "已选：" + names.join("、") : "";
  }

  // 登场人物 / 关联人物池：按人物分组显示（不显示龙套）；展开后各分组自动展开、只有「未分组」折着
  function renderCharPool(boxId, selectedIds, reset) {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (reset || !charPoolSel.has(boxId)) {
      charPoolSel.set(boxId, new Set((selectedIds || []).filter((id) => getChar(id))));
    }
    if (reset) poolCollapsed = defaultPoolFolds(); // 每次打开卡片：分组折叠状态回到默认
    const sel = charPoolSel.get(boxId);
    if (boxId === "entry-char-pool") updateEntryCharChosen(sel);
    if (boxId === "event-char-pool") updateEventCharChosen(sel);
    if (state.characters.length === 0) {
      box.classList.remove("pool-grouped");
      box.innerHTML = `<span class="pool-empty">还没有人物，先在左侧「人物」创建。</span>`;
      return;
    }
    box.classList.add("pool-grouped");

    const buckets = new Map();
    const extraId = extraGroupIdOf();
    state.characters.forEach((c) => {
      // 用和人物栏同一个归组规则：没归组 / 归到一个已不存在的分组 → 落到「未分组」。
      // 否则 groupId 为空的人物会进一个没人渲染的桶，选人框里整组消失。
      const gid = charBucketIdOf(c);
      if (gid && gid === extraId) return; // 龙套不在这里显示
      if (!buckets.has(gid)) buckets.set(gid, []);
      buckets.get(gid).push(c);
    });
    // 登场人物池：普通分组 → 未分组（龙套不显示）
    const order = charGroupBucketsOrder().map((x) => x.id);
    let html = "";
    order.forEach((gid) => {
      if (gid && gid === extraId) return;
      const list = buckets.get(gid);
      if (!list || !list.length) return;
      const g = getGroup(gid);
      const collapsed = poolGroupCollapsed(gid);
      const picked = list.filter((c) => sel.has(c.id)).length;
      html += `<div class="pool-group-head ${collapsed ? "collapsed" : ""}" data-pool-group="${esc(gid)}">
        <span class="pool-caret">${collapsed ? "▶" : "▼"}</span>
        <span class="pool-group-dot" style="background:${esc(g ? g.color : "#6b6480")}"></span>
        <span class="pool-group-name">${esc(g ? groupDisplayName(g) : uiTextFor("未分组"))}</span>
        <span class="pool-group-count">${list.length}${picked ? ` · 已选 ${picked}` : ""}</span>
        ${collapsed ? `<span class="pool-group-hint">${esc(uiTextFor("展开"))}</span>` : ""}
      </div>`;
      if (!collapsed) {
        html += `<div class="pool-group-body">${list
          .map(
            (c) =>
              `<span class="pool-chip ${sel.has(c.id) ? "active" : ""}" data-pool-char="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}</span>`
          )
          .join("")}</div>`;
      }
    });
    box.innerHTML = html;

    box.querySelectorAll(".pool-group-head").forEach((head) => {
      head.addEventListener("click", () => {
        const gid = head.dataset.poolGroup || "";
        if (!poolCollapsed) poolCollapsed = new Map();
        poolCollapsed.set(gid, !poolGroupCollapsed(gid));
        renderCharPool(boxId);
      });
    });
    box.querySelectorAll(".pool-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.poolChar;
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
        renderCharPool(boxId);
      });
      // 双击圈圈 / 人名＝打开这张人物卡；右键＝人物卡那套菜单
      chip.addEventListener("dblclick", (ev) => {
        if (!openCharFromChip(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();
      });
      chip.addEventListener("contextmenu", (ev) => showCharChipMenu(ev));
    });
  }

/* ---- 人物圈圈（登场人物 / 关联人物的 chip）上的快捷交互 ----
   双击圈圈图标 / 人名＝打开这张人物卡；右键＝和人物卡一样的那套菜单。
   只认圈圈和人名这一块：chip 里的 ×（移除登场 / 删势力）不抢。 */
let charChipClickTimer = 0;

function charChipIdOf(target) {
  if (!target || !target.closest) return "";
  if (target.closest(".chip-x")) return "";
  const chip = target.closest(".event-char-chip[data-char-id], .pool-chip[data-pool-char]");
  if (!chip) return "";
  return chip.dataset.charId || chip.dataset.poolChar || "";
}

function openCharFromChip(target) {
  const id = charChipIdOf(target);
  if (!id) return false;
  openCharacterModal(id);
  return true;
}

function showCharChipMenu(ev) {
  const id = charChipIdOf(ev.target);
  if (!id) return false;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof exitSelectModesForContextMenu === "function") exitSelectModesForContextMenu();
  if (typeof showCharGroupMenu === "function") showCharGroupMenu(ev.clientX, ev.clientY, id);
  return true;
}

/* 点圈圈时别马上开卡片：等一拍，万一是「双击打开人物卡」的第一下 */
function delayCardOpenFromChip(target, fn) {
  if (!charChipIdOf(target)) return false;
  clearTimeout(charChipClickTimer);
  charChipClickTimer = setTimeout(fn, 240);
  return true;
}

function cancelCardOpenFromChip() {
  clearTimeout(charChipClickTimer);
}

/* 人物分析（出场统计 / 势力分析 / 雷达分析）里的「圈圈 + 人名」：
   双击＝打开人物卡，右键＝人物卡那套菜单。
   只认这几处专门的类名——人物边栏的卡片、事件 / 条目卡片都有自己的处理，别抢。 */
function analysisCharIdOf(target) {
  if (!target || !target.closest) return "";
  const hit = target.closest(
    ".faction-chip[data-char-id], .stats-name[data-char-id], .stats-side-head[data-char-id], .co-row[data-char-id]"
  );
  return hit ? hit.dataset.charId || "" : "";
}

function showAnalysisCharMenu(ev) {
  const id = analysisCharIdOf(ev.target);
  if (!id) return false;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof exitSelectModesForContextMenu === "function") exitSelectModesForContextMenu();
  if (typeof showCharGroupMenu === "function") showCharGroupMenu(ev.clientX, ev.clientY, id);
  return true;
}

/* ================= 统一浏览器自带控件的美术 =================
   ① 下拉：系统的弹出列表是操作系统画的（改不了样式），所以点开时自己铺一层面板；
   ② 悬浮：把 [title] 的原生提示（延迟 1 秒、系统样式）换成程序自己的小气泡。
   两者都尽量"少侵入"：原控件还在原位、值和 change 事件照旧，只换外观。 */

/* ---------- ② 悬浮气泡 ---------- */
let uiTipEl = null;
let uiTipTarget = null;
let uiTipHidden = []; // 悬停期间被临时清空的 title（鼠标移开时还原，保证语言切换还能翻）

function uiTipTextOf(el) {
  /* 原生 title 第一次悬停时搬进 data-tip；title 临时清空（原生提示要非空才冒，
     清空就压住了），鼠标移开再还原 —— 不删属性，换语言时界面翻译还能接着翻它。 */
  const raw = el.getAttribute ? el.getAttribute("title") : "";
  if (raw) {
    if (el.dataset) el.dataset.tip = raw;
    el.setAttribute("title", "");
    uiTipHidden.push({ el, text: raw });
  }
  const t = (el.dataset && el.dataset.tip) || "";
  try {
    return typeof uiTrans === "function" ? uiTrans(t) : t;
  } catch (e) {
    return t;
  }
}

function uiHideTip() {
  uiTipTarget = null;
  if (uiTipEl) uiTipEl.hidden = true;
  uiTipHidden.forEach((r) => {
    try {
      /* 还原本来的 title：悬停期间可能有人改过说明（比如 Agent 状态刷新），
         data-tip 里那份才是最新的，r.text 只是第一次搬进去时的旧值。 */
      if (r.el && r.el.getAttribute && r.el.getAttribute("title") === "")
        r.el.setAttribute("title", (r.el.dataset && r.el.dataset.tip) || r.text);
    } catch (e) {
      /* ignore */
    }
  });
  uiTipHidden = [];
}

/* 程序自己动态改悬浮说明（文字跟着鼠标 / 状态变的那种）**一律走这里**：
   一旦程序的气泡已经接管了这颗元素（title 被清空、原文在 data-tip 里），
   就只改 data-tip —— 悬停中把 title 写回去会让浏览器重新计时，
   1 秒后冒出第二个（原生）气泡；没接管过就先写 title，等第一次悬停搬进 data-tip。 */
function uiSetTipText(el, text) {
  if (!el || !el.getAttribute) return;
  const t = String(text == null ? "" : text);
  const taken = !!(el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, "tip"));
  if (taken) {
    if (el.dataset.tip !== t) el.dataset.tip = t;
    if (el.getAttribute("title") !== "") el.setAttribute("title", "");
  } else if (el.getAttribute("title") !== t) {
    el.setAttribute("title", t);
  }
}

function uiShowTip(el, x, y) {
  const text = uiTipTextOf(el);
  if (!text) return uiHideTip();
  /* 缩放后个别路径传进来的鼠标坐标可能已经落在元素外（或者仍是缩放前的坐标）。
     这时不要再拿它定位，直接以当前悬停元素的可见矩形为锚点，视觉上始终贴着元素。 */
  if (el && el.getBoundingClientRect) {
    const er = uiVisualRect(el);
    if (x < er.left - 6 || x > er.right + 6 || y < er.top - 6 || y > er.bottom + 6) {
      x = er.left + er.width / 2;
      y = er.top + er.height / 2;
    }
  }
  if (!uiTipEl) {
    uiTipEl = document.createElement("div");
    uiTipEl.className = "ui-tip";
    document.body.appendChild(uiTipEl);
  }
  if (uiTipEl.textContent !== text) uiTipEl.textContent = text;
  uiTipEl.hidden = false;
  const r = uiVisualRect(uiTipEl);
  // 贴着鼠标的右下角，但留一点缝：光标下方的箭头不要压在气泡上
  let vx = x + 12;
  let vy = y + 18;
  let side = "right";
  if (vx + r.width > window.innerWidth - 8) {
    /* 右边放不下：翻到**鼠标**左上（别去贴元素的右边缘 —— 宽词条会被正好盖住，用户 2026-10-16 报的） */
    vx = Math.max(8, x - 12 - r.width);
    vy = Math.max(8, y - r.height - 12);
    side = "left";
  }
  if (vy + r.height > window.innerHeight - 8) {
    vy = Math.max(8, y - r.height - 18);
  }
  uiTipEl.classList.toggle("left", side === "left");
  uiTipEl.classList.toggle("right", side !== "left");
  uiTipEl.style.left = uiZoomPx(vx);
  uiTipEl.style.top = uiZoomPx(vy);
  uiTipLast = { el: el, x: x, y: y }; // 缩放变了按原鼠标位置重放
}

let uiTipLast = null;
uiOnZoomReflow(() => {
  if (!uiTipEl || uiTipEl.hidden || !uiTipLast || !uiTipLast.el || !uiTipLast.el.isConnected) return;
  // 缩放会重排元素；继续用缩放前的鼠标坐标会把气泡留在旧位置。
  // 以当前悬停元素的视觉矩形重新锚定，鼠标没动也不会跑偏。
  const r = uiVisualRect(uiTipLast.el);
  uiShowTip(uiTipLast.el, r.left + r.width / 2, r.top + r.height / 2);
});

/* 面板里那些「? ＋ 藏在里面的小气泡」：气泡是绝对定位挂在 ? 下面的，
   一旦靠边 / 靠下就会被面板的滚动容器裁掉（右下角那种干脆看不见）。
   统一折成 title，交给程序自己的气泡（贴着鼠标、不会被裁）。 */
function uiFoldInlineHints(root) {
  const scope = root || document;
  scope.querySelectorAll(".field-hint-inline, .inline-help").forEach((el) => {
    const pop = el.querySelector(".hint-pop");
    if (!pop) return;
    const text = String(pop.textContent || "").replace(/\s+/g, " ").trim();
    pop.remove();
    if (text && !el.getAttribute("title")) el.setAttribute("title", text);
  });
}

function uiInitTitleTips() {
  document.addEventListener(
    "mouseover",
    (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest("[title]") : null;
      if (!el) return;
      if (el.closest(".context-menu")) return; // 右键菜单自己有说明
      uiTipTarget = el;
      uiShowTip(el, ev.clientX, ev.clientY);
    },
    true
  );
  document.addEventListener(
    "mousemove",
    (ev) => {
      if (!uiTipTarget) return;
      /* 表格重画会把原来那个节点摘掉：这时不能再跟着鼠标显示旧气泡（会指到别的行上） */
      /* 记录的那个节点可能已经不在鼠标底下了（表格重画 / 换行）：
         一旦指针现在指着的不是同一个元素，就立刻收起，别再跟着鼠标显示旧内容 */
      /* 用 mousemove 的真实目标判断，不用 elementFromPoint：
         CSS zoom 下 elementFromPoint 的坐标解释可能和 clientX/Y 不一致，
         会把「鼠标已经移开」误判成还在旧元素上，气泡就停在旧鼠标位置。 */
      const under = ev.target;
      const owner = under && under.closest ? under.closest("[title]") : null;
      if (!uiTipTarget.isConnected || owner !== uiTipTarget) {
        uiHideTip();
        uiTipTarget = null;
        return;
      }
      uiShowTip(uiTipTarget, ev.clientX, ev.clientY);
    },
    true
  );
  document.addEventListener(
    "mouseout",
    (ev) => {
      if (!uiTipTarget) return;
      const to = ev.relatedTarget;
      if (to && uiTipTarget.contains && uiTipTarget.contains(to)) return;
      uiHideTip();
    },
    true
  );
  document.addEventListener("mousedown", uiHideTip, true);
  window.addEventListener("scroll", uiHideTip, true);
  window.addEventListener("resize", uiHideTip, true);
}

/* ---------- ① 下拉：自己的选项面板 ---------- */
let uiSelPanel = null;
let uiSelTarget = null;

function uiCloseSelectPanel() {
  if (uiSelPanel) {
    uiSelPanel.remove();
    uiSelPanel = null;
  }
  uiSelTarget = null;
}

function uiSelectLabel(sel) {
  const o = sel.options[sel.selectedIndex];
  return o ? String(o.textContent || "") : "";
}

/* 下拉面板贴在选择框下面：界面缩放变了要按新比例重放（left/top 都是「元素坐标系里的 px」） */
function uiPlaceSelectPanel() {
  if (!uiSelPanel || !uiSelTarget) return;
  const sel = uiSelTarget;
  const r = uiVisualRect(sel);
  uiSelPanel.style.left = uiZoomPx(r.left);
  uiSelPanel.style.minWidth = uiZoomPx(r.width);
  const ph = uiVisualRect(uiSelPanel).height;
  const below = r.bottom + 4 + ph < window.innerHeight - 6;
  uiSelPanel.style.top = uiZoomPx(below ? r.bottom + 4 : Math.max(6, r.top - ph - 4));
}
uiOnZoomReflow(() => {
  if (uiSelPanel && uiSelPanel.isConnected && uiSelTarget && uiSelTarget.isConnected) uiPlaceSelectPanel();
});

function uiOpenSelectPanel(sel) {
  if (sel.disabled || sel.multiple) return;
  uiCloseSelectPanel();
  const panel = document.createElement("div");
  panel.className = "ui-select-panel";
  const items = Array.from(sel.options);
  panel.innerHTML = items
    .map(
      (o, i) =>
        `<div class="ui-select-item${i === sel.selectedIndex ? " on" : ""}" data-i="${i}">${esc(String(o.textContent || ""))}</div>`
    )
    .join("");
  document.body.appendChild(panel);
  uiSelPanel = panel;
  uiSelTarget = sel;
  uiPlaceSelectPanel();
  let cur = sel.selectedIndex;
  const paint = () =>
    panel.querySelectorAll(".ui-select-item").forEach((el, i) => el.classList.toggle("current", i === cur));
  paint();
  const pick = (i) => {
    const o = sel.options[i];
    if (!o) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    uiCloseSelectPanel();
  };
  panel.querySelectorAll(".ui-select-item").forEach((el) =>
    el.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      pick(parseInt(el.dataset.i, 10));
    })
  );
  const key = (ev) => {
    /* 面板开着时这几下键就地处理掉：不拦的话回车会继续冒到
       「弹窗里回车＝保存并关闭」，在下拉里选一项就把信息卡一起关掉了。 */
    const swallow = () => ev.stopPropagation();
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      swallow();
      cur = Math.max(0, Math.min(items.length - 1, cur + (ev.key === "ArrowDown" ? 1 : -1)));
      paint();
      const el = panel.querySelectorAll(".ui-select-item")[cur];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      swallow();
      pick(cur);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      swallow();
      uiCloseSelectPanel();
    }
  };
  document.addEventListener("keydown", key, true);
  const stop = () => {
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("mousedown", outside, true);
    window.removeEventListener("scroll", uiCloseSelectPanel, true);
    window.removeEventListener("resize", uiCloseSelectPanel, true);
  };
  const outside = (ev) => {
    if (panel.contains(ev.target) || ev.target === sel) return;
    stop();
    uiCloseSelectPanel();
  };
  const close0 = uiCloseSelectPanel;
  uiCloseSelectPanel = () => {
    stop();
    close0();
    uiCloseSelectPanel = close0;
  };
  document.addEventListener("mousedown", outside, true);
  window.addEventListener("scroll", uiCloseSelectPanel, true);
  window.addEventListener("resize", uiCloseSelectPanel, true);
}

function uiInitCustomSelects() {
  document.addEventListener(
    "mousedown",
    (ev) => {
      const sel = ev.target && ev.target.tagName === "SELECT" ? ev.target : null;
      if (!sel || sel.multiple) return;
      ev.preventDefault(); // 拦住系统弹出列表，换成我们自己的
      uiOpenSelectPanel(sel);
    },
    true
  );
  document.addEventListener(
    "keydown",
    (ev) => {
      const sel = ev.target && ev.target.tagName === "SELECT" ? ev.target : null;
      if (!sel || sel.multiple) return;
      if (ev.key === "Enter" && sel.classList && sel.classList.contains("ui-enter-confirm")) return;
      if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        uiOpenSelectPanel(sel);
      }
    },
    true
  );
}

uiInitTitleTips();
uiInitCustomSelects();

/* 所有输入框：Enter＝确认这一格（去掉光标），Ctrl+Enter＝换行（多行框里生效）。
   例外：① #cat-fields 是「一行一个字段」的列表编辑器，回车照旧换行；
        ② 确定 / 保存类弹窗（prompt / confirm / alert / 地图那三个）里 Enter 有自己的含义，不抢；
        ③ #novel-text（文本编辑的正文框）Enter＝换行，不确认、不失焦。 */
function uiInitInputEnter() {
  const SKIP = { "cat-fields": 1, "novel-text": 1 };
  const KEEP = { "ui-prompt-modal": 1, "ui-confirm-modal": 1, "ui-alert-modal": 1, "map-modal": 1, "map-coord-modal": 1, "map-scale-modal": 1 };
  document.addEventListener(
    "keydown",
    (ev) => {
      const el = ev.target;
      const tag = String((el && el.tagName) || "").toUpperCase();
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      if (el.id && SKIP[el.id]) return;
      if (ev.key !== "Enter") return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        // Ctrl+Enter＝换行：多行框里就不要让别的快捷键（比如"保存并关闭"）抢走
        if (tag === "TEXTAREA") ev.stopPropagation();
        return;
      }
      const modal = el.closest && el.closest(".modal-overlay:not([hidden])");
      if (modal && KEEP[modal.id]) return;
      ev.preventDefault();
      el.blur(); // 收工：确认输入、移除光标（值还在框里，保存按各弹窗自己的按钮）
    },
    true
  );
}
uiInitInputEnter();

/* ---- 「抬头钉住，滚动条从抬头下面开始」 ----
   原生竖向滚动条一定从滚动容器最顶上开始，会压在钉住的表头那一行上。
   做法：滚动容器里把原生竖向滚动条藏起来，旁边放一根「代滚动条」
   （位置从抬头下沿开始），它自己是真滚动容器，拖动 / 点轨道 / 滚轮都照旧，和主体双向同步。
   表格本身还是一整张表：列宽天然对齐，不用抄宽度也不会因为表头文字比资料格宽而越抄越歪。 */
/* ---- 「抬头钉住，滚动条从抬头下面开始」 ----
   原生竖向滚动条一定从滚动容器最顶上开始，会压在钉住的抬头（表头 / 列头）上。
   所以：滚动容器里把原生竖向滚动条藏起来，旁边放一根「代滚动条」——
   它自己是真滚动容器（拖动、点击轨道、滚轮都照旧），顶端从抬头下面开始，和主体双向同步。
   表格本身还是一张整表，列宽天然对齐，不用去抄列宽。 */
function bindScrollProxy(scroller, opts) {
  if (!scroller || !scroller.parentElement) return null;
  const pane = scroller.parentElement;
  const o = opts || {};
  let proxy = pane.querySelector(":scope > .scroll-proxy");
  if (!proxy) {
    proxy = document.createElement("div");
    proxy.className = "scroll-proxy";
    proxy.innerHTML = `<div class="scroll-proxy-inner"></div>`;
    pane.appendChild(proxy);
  }
  const inner = proxy.firstElementChild;
  let syncing = false;
  const headH = () => {
    if (typeof o.headHeight === "function") return Math.max(0, o.headHeight());
    if (o.headSelector) {
      const head = pane.querySelector(o.headSelector) || document.querySelector(o.headSelector);
      return head ? Math.round(head.getBoundingClientRect().height) : 0;
    }
    return 0;
  };
  const layout = () => {
    const head = headH();
    pane.style.setProperty("--scroll-proxy-top", head + "px");
    inner.style.height = Math.max(1, scroller.scrollHeight) + "px";
    const need = scroller.scrollHeight > scroller.clientHeight + 2;
    proxy.hidden = !need;
    /* 表头那一行的底色要铺满整个面板宽度（含滚动条让出来的那条缝），别让右边露出一截。
       底色由 .has-scroll-proxy::before 画，高度就是表头高度。 */
    if (getComputedStyle(pane).position === "static") pane.style.position = "relative";
    pane.classList.toggle("has-scroll-proxy", need);
    /* 代滚动条是浮在内容上的，不占宽度：显示时给内容右侧留出它的位置，
       免得最后一列的字紧贴着滚动条（原生竖条已经被藏起来了，不会自己让位）。 */
    const gap = o.gap == null ? 14 : o.gap;
    if (need) scroller.style.setProperty("padding-right", gap + "px", "important");
    else scroller.style.removeProperty("padding-right");
  };
  const fromScroller = () => {
    if (syncing) return;
    syncing = true;
    layout();
    proxy.scrollTop = scroller.scrollTop;
    syncing = false;
  };
  const fromProxy = () => {
    if (syncing) return;
    syncing = true;
    scroller.scrollTop = proxy.scrollTop;
    syncing = false;
  };
  if (!proxy.__bound) {
    proxy.__bound = 1;
    proxy.addEventListener("scroll", fromProxy);
    scroller.addEventListener("scroll", fromScroller);
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => fromScroller());
      ro.observe(scroller);
    }
    if (typeof MutationObserver === "function") {
      new MutationObserver(() => fromScroller()).observe(scroller, { childList: true, subtree: true, characterData: true });
    }
  }
  fromScroller();
  return proxy;
}

// 表格容器：把里面的滚动容器（.table-scroll）接上代滚动条，顶端对齐到表头下沿
function syncTableScrollProxies(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll(".table-scroll").forEach((scroller) => {
    bindScrollProxy(scroller, {
      headHeight: () => {
        const th = scroller.querySelector("thead th");
        return th ? th.getBoundingClientRect().height : 0;
      },
    });
  });
}
window.addEventListener("resize", () => syncTableScrollProxies());
