  /* ================= 长页面滚动位置小地图 ================= */
  let scrollMinimapBound = false;
  const scrollMinimaps = new Map(); // scroller -> minimap element

  function updateScrollMinimap(scroller, mini, show) {
    if (!scroller || !mini) return;
    if (typeof show === "boolean") mini._show = show;
    if (mini._raf) return;
    mini._raf = requestAnimationFrame(() => {
      mini._raf = 0;
      updateScrollMinimapNow(scroller, mini);
    });
  }

  function updateScrollMinimapNow(scroller, mini) {
    if (!scroller || !mini) return;
    const rect = uiVisualRect(scroller);
    const visible =
      rect.width > 40 &&
      rect.height > 80 &&
      rect.bottom > 40 &&
      rect.top < window.innerHeight - 40 &&
      needsScrollMinimap(scroller);
    if (!visible) {
      mini.hidden = true;
      return;
    }
    if (!mini._show) {
      mini.hidden = true;
      return;
    }
    mini.hidden = false;
    // 悬浮预览图的尺寸：比原来的小条更大，但仍保持半透明、不挡操作。
    const pw = Math.max(100, Math.min(150, Math.round(rect.width * 0.34)));
    const ph = Math.max(130, Math.min(200, Math.round(rect.height * 0.5)));
    // 外框有 1px 边框 + 3px 内边距：真正「看得见」的是里面的 canvas，
    // 贴边要对齐 canvas 的边缘，所以把这段内缩量先算出来（宽度也要加上它，canvas 才是 pw × ph）。
    const mcs = getComputedStyle(mini);
    const pxScale = uiAppZoom();
    const padL = ((parseFloat(mcs.paddingLeft) || 0) + (parseFloat(mcs.borderLeftWidth) || 0)) * pxScale;
    const padR = ((parseFloat(mcs.paddingRight) || 0) + (parseFloat(mcs.borderRightWidth) || 0)) * pxScale;
    const padT = ((parseFloat(mcs.paddingTop) || 0) + (parseFloat(mcs.borderTopWidth) || 0)) * pxScale;
    const padB2 = ((parseFloat(mcs.paddingBottom) || 0) + (parseFloat(mcs.borderBottomWidth) || 0)) * pxScale;
    const boxW = pw + padL + padR;
    const boxH = ph + padT + padB2;
    mini.style.width = uiZoomPx(boxW);
    mini.style.height = uiZoomPx(boxH);
    const placement = scrollMinimapPlacement(scroller);
    // 缩略图要贴着「边栏」：把紧挨着的拖宽手柄也算进这一栏的宽度，
    // 否则会差出一条手柄的宽度，看着像没贴住边栏。
    const panel = minimapPanelRect(scroller, rect);
    if (placement === "outside-right") {
      // 左侧边栏：整块（含边框）紧贴边栏外侧的右下角，一点不压住边栏
      mini.style.left = uiZoomPx(Math.max(0, Math.min(window.innerWidth - boxW, panel.right)));
      mini.style.right = "auto";
    } else if (placement === "outside-left") {
      // 右侧边栏 / 中间表格：紧贴它外侧的左下角
      mini.style.left = uiZoomPx(Math.max(0, panel.left - boxW));
      mini.style.right = "auto";
    } else {
      // 主界面：贴在面板内的右下角
      mini.style.right = uiZoomPx(Math.max(0, window.innerWidth - panel.right));
      mini.style.left = "auto";
    }
    mini.style.bottom = uiZoomPx(Math.max(0, window.innerHeight - panel.bottom));
    const canvas = mini.querySelector("canvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(pw * dpr);
    canvas.height = Math.round(ph * dpr);
    canvas.style.width = uiZoomPx(pw);
    canvas.style.height = uiZoomPx(ph);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScrollPreview(ctx, scroller, pw, ph);
  }

  function scrollPreviewBlocks(scroller) {
    if (scroller.children.length >= 2) return Array.from(scroller.children);
    const only = scroller.firstElementChild;
    if (only && only.children.length) return Array.from(only.children);
    return Array.from(scroller.children);
  }

  // 边栏 / 长列表 / 大画布在大屏幕上常常「滚得动、但不到 2 屏高」，
  // 用统一的 2 屏阈值会让它们什么都不显示，所以这些容器单独放宽到 1.25 屏。
  const MINIMAP_EAGER_SEL =
    ".char-list, .chapter-rail, .chapter-list, " +
    ".rel-pick-list, .rel-picker-col, .rel-side, .rel-list, " +
    ".stats-side, .stats-table-wrap, .table-scroll, #timeline, .timeline-wrap, #chrono-list, .chrono-body, " +
    "#pedigree-list-body, #novel-outline-scroll";
  const MINIMAP_EAGER_RATIO = 1.25;

  /* 明确**不要**悬浮预览的地方（用户点名的）：文本分析的「章节 / 小节（自动识别）」列表 ——
     它贴在行右侧、正压着「已分析 / 字数 / ×」那一串，非常挡。要恢复预览就把这个选择器清掉。 */
  const MINIMAP_SKIP_SEL = ".segment-list, #novel-editor, #novel-text, .novel-text";

  function needsScrollMinimap(el) {
    if (!el || el.nodeType !== 1) return false;
    // 弹窗里不要悬浮全局预览：弹窗本身就是一屏内容，浮层只会挡住正在填的字段
    if (el.closest && el.closest(".modal-overlay")) return false;
    // 这几处**明确不要**悬浮预览（挡着要看的行）：
    //   · 文本分析的「章节 / 小节（自动识别）」列表（用户 2026-10-16：浮层压在行右侧，非常挡）
    if (el.matches && MINIMAP_SKIP_SEL && (el.matches(MINIMAP_SKIP_SEL) || (el.closest && el.closest(MINIMAP_SKIP_SEL)))) return false;
    // 二维事件图：纵向滚动是程序自己维护的（没有原生 scrollTop / scrollHeight）
    if (el.id === "matrix-scroll" && typeof matrixScrollInfo === "function") {
      const info = matrixScrollInfo();
      return !!(info && info.total > info.viewH + 8 && info.viewH > 0);
    }
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    if (!ch || sh <= ch + 8) return false;
    // 文本编辑的左栏：只要滚得动就出预览（用户 2026-10-20 点名要这一栏自带预览）
    if (el.matches && el.matches("#novel-outline-scroll")) return true;
    if (sh > ch * 2) return true; // 其它区域：超过 2 屏才显示，避免太吵
    return !!(el.matches && el.matches(MINIMAP_EAGER_SEL) && sh > ch * MINIMAP_EAGER_RATIO);
  }

  // 抬头钉住的边栏（章节 / 设定类别 / 分析任务 / 全部关系）：滚动条挪到了内层列表上，
  // 悬浮预览要贴的是「整个边栏」的外沿，所以这些内层列表都映射回它所属的那一栏。
  const MINIMAP_PANE_OF = {
    ".chapter-list": ".chapter-rail",
    "#novel-outline-scroll": "#novel-left",
    ".rel-list": ".rel-side",
    // 系谱图列表：滚动在列表体上，悬浮预览要贴「整条系谱图边栏」的外沿（含右边的拖宽手柄）
    "#pedigree-list-body": "#pedigree-list",
    // 出场统计等表格：滚动条挪到了内层（.table-scroll），悬浮预览还是贴整张表的外沿
    ".table-scroll": ".stats-table-wrap",
  };
  function minimapPaneOf(el) {
    if (!el || !el.matches) return null;
    const keys = Object.keys(MINIMAP_PANE_OF);
    for (let i = 0; i < keys.length; i++) {
      if (!el.matches(keys[i])) continue;
      const pane = el.closest(MINIMAP_PANE_OF[keys[i]]);
      if (pane) return pane;
    }
    return null;
  }

  function scrollMinimapPlacement(el0) {
    if (!el0 || !el0.matches) return "inside-right";
    const el = minimapPaneOf(el0) || el0;
    // 人物出场统计：贴在表格外侧的右下角（外侧右边贴边）
    if (el.matches(".stats-table-wrap")) return "outside-right";
    if (el.matches(".rel-side, .stats-side")) return "outside-left";
    if (el.matches(".char-list, .chapter-rail, .rel-pick-list, .rel-picker-col, #pedigree-list")) {
      return "outside-right";
    }
    if (el.matches("#novel-left")) return "outside-right";
    return "inside-right";
  }

  // 这一栏实际占的矩形＝滚动容器 + 紧挨着它的「拖宽手柄」那条窄条。
  // 缩略图贴着这个外沿才算贴住边栏（不然总是差一条手柄的宽度）。
  function minimapPanelRect(el, rect) {
    // 滚的是内层列表时，按整栏的外沿算（不然预览会缩在列表里、贴不住边栏）
    const outer = minimapPaneOf(el);
    const base = outer ? uiVisualRect(outer) : rect;
    const out = { left: base.left, right: base.right, bottom: base.bottom };
    // 关系网左边那两栏是并排的：贴到「整块选择区」的外沿，不要卡在两栏中间
    if (el.matches && el.matches(".rel-pick-list, .rel-picker-col")) {
      const picker = el.closest(".rel-picker");
      if (picker) {
        const pr = picker.getBoundingClientRect();
        if (pr.width) {
          out.right = Math.max(out.right, pr.right);
          out.left = Math.min(out.left, pr.left);
        }
      }
    }
    let node = outer || el;
    for (let i = 0; i < 4 && node; i++) {
      [node.nextElementSibling, node.previousElementSibling].forEach((n) => {
        if (!n || !n.matches) return;
        if (!n.matches(".pane-handle, [id^='pane-handle'], .rel-col-handle")) return;
        const r = uiVisualRect(n);
        if (!r.width) return;
        // 手柄和这一栏之间可能隔着一个布局 gap（系谱图栏就是 10.5px），所以容差给到 14px ——
        // 只认 pane-handle 这几类元素，放宽不会误伤别人
        if (Math.abs(r.left - base.right) < 14) out.right = Math.max(out.right, r.right);
        if (Math.abs(r.right - base.left) < 14) out.left = Math.min(out.left, r.left);
        out.bottom = Math.max(out.bottom, r.bottom);
      });
      node = node.parentElement;
    }
    return out;
  }

  function drawScrollPreview(ctx, scroller, w, h) {
    if (scroller.id === "matrix-scroll" && drawMatrixScrollPreview(ctx, scroller, w, h)) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(26, 33, 52, 0.46)";
    ctx.fillRect(0, 0, w, h);
    const sw = Math.max(1, scroller.scrollWidth);
    const sh = Math.max(1, scroller.scrollHeight);
    const scRect = scroller.getBoundingClientRect();
    if (!drawGridSkeleton(ctx, scroller, w, h, sw, sh, scRect)) {
      if (scroller.matches && scroller.matches("#timeline, .timeline-wrap")) {
        drawEventAxisBlocks(ctx, scroller, w, h, sw, sh, scRect);
      } else {
      const limit = scroller.matches && scroller.matches("#novel-outline-scroll") ? 2000 : 260;
      const blocks = scrollPreviewBlocks(scroller).slice(0, limit);
      blocks.forEach((el) => {
        if (!el || el.hidden) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const x = ((r.left - scRect.left + scroller.scrollLeft) / sw) * w;
        const y = ((r.top - scRect.top + scroller.scrollTop) / sh) * h;
        const bw = Math.max(2, (r.width / sw) * w);
        const bh = Math.max(2, (r.height / sh) * h);
        ctx.fillStyle = "rgba(70, 88, 127, 0.20)";
        ctx.fillRect(Math.max(0, x), Math.max(0, y), Math.min(w - x, bw), Math.min(h - y, bh));
      });
      }
    }
    // 当前屏幕显示范围：透明浅色底 + 浅灰边，和深色背景保持一致
    const vx = (scroller.scrollLeft / sw) * w;
    const vy = (scroller.scrollTop / sh) * h;
    const vw = Math.max(10, (scroller.clientWidth / sw) * w);
    const vh = Math.max(12, (scroller.clientHeight / sh) * h);
    ctx.fillStyle = "rgba(236, 231, 245, 0.07)";
    ctx.fillRect(vx, vy, Math.min(vw, w - vx), Math.min(vh, h - vy));
    ctx.strokeStyle = "rgba(236, 231, 245, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx + 0.75, vy + 0.75, Math.min(vw, w - vx) - 1.5, Math.min(vh, h - vy) - 1.5);
  }

  /* 二维事件图的全局概览：纵向用 matrixPreviewModel（全量行 / 章节点）画骨架，
     不再依赖当前虚拟窗口里那几个 DOM 行。 */
  function drawMatrixScrollPreview(ctx, scroller, w, h) {
    const info = typeof matrixPreviewInfo === "function" ? matrixPreviewInfo() : null;
    const scroll = typeof matrixScrollInfo === "function" ? matrixScrollInfo() : null;
    if (!info || !scroll || !scroll.total || !scroll.viewH) return false;
    const total = Math.max(1, scroll.total);
    const sw = Math.max(1, scroller.scrollWidth);
    const scRect = scroller.getBoundingClientRect();
    const sl = scroller.scrollLeft || 0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(26, 33, 52, 0.46)";
    ctx.fillRect(0, 0, w, h);
    const leftEl = scroller.querySelector(".matrix-left");
    const leftW = leftEl ? leftEl.getBoundingClientRect().width : 0;
    const leftFrac = Math.max(0.04, Math.min(1, leftW / sw));
    const gridX = Math.max(2, leftFrac * w);
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(0, 0, gridX, h);
    // 人物列竖线（表头里的 char headers 是全量，不受虚拟行影响）
    ctx.fillStyle = "rgba(70, 88, 127, 0.42)";
    scroller.querySelectorAll(".m-char-hdr[data-char-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const x = ((r.left - scRect.left + sl) / sw) * w;
      if (x >= 0 && x <= w) ctx.fillRect(x, 0, 1, h);
    });
    // 章 / 节分带
    (info.bands || []).forEach((b) => {
      const y = (b.y / total) * h;
      ctx.fillStyle = b.kind === "chapter" ? "rgba(70, 88, 127, 0.62)" : "rgba(150, 162, 194, 0.34)";
      ctx.fillRect(0, Math.max(0, Math.min(h - 1, y)), w, 1);
    });
    // 事件行（太长时采样，保证小地图不卡）
    const rows = info.rows || [];
    const step = Math.max(1, Math.floor(rows.length / 800));
    ctx.fillStyle = "rgba(91, 118, 181, 0.28)";
    for (let i = 0; i < rows.length; i += step) {
      const r = rows[i];
      const y = (r.y / total) * h;
      const bh = Math.max(1, (r.h / total) * h);
      ctx.fillRect(gridX, Math.max(0, y), Math.max(1, w - gridX), bh);
    }
    // 当前视口
    const vx = (sl / sw) * w;
    const vy = (scroll.top / total) * h;
    const vw = Math.max(10, (scroller.clientWidth / sw) * w);
    const vh = Math.max(12, (scroll.viewH / total) * h);
    ctx.fillStyle = "rgba(236, 231, 245, 0.07)";
    ctx.fillRect(vx, vy, Math.min(vw, w - vx), Math.min(vh, h - vy));
    ctx.strokeStyle = "rgba(236, 231, 245, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx + 0.75, vy + 0.75, Math.min(vw, w - vx) - 1.5, Math.min(vh, h - vy) - 1.5);
    return true;
  }

  // 事件轴的预览不再按整行画大色块，而是按事件卡 / 事件集卡逐块画，
  // 这样小地图的拓扑和事件轴本身的分块结构一致。
  function drawEventAxisBlocks(ctx, scroller, w, h, sw, sh, scRect) {
    const cards = scroller.querySelectorAll(".event-card[data-event-id], .event-set-card[data-event-set-id]");
    ctx.save();
    let n = 0;
    cards.forEach((el) => {
      if (n++ > 1200 || el.hidden) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = ((r.left - scRect.left + scroller.scrollLeft) / sw) * w;
      const y = ((r.top - scRect.top + scroller.scrollTop) / sh) * h;
      const bw = Math.max(1.5, (r.width / sw) * w);
      const bh = Math.max(1.5, (r.height / sh) * h);
      const setCard = el.classList.contains("event-set-card");
      ctx.fillStyle = setCard
        ? "rgba(143, 123, 216, 0.42)"
        : el.style.borderLeftColor || "rgba(91, 118, 181, 0.34)";
      ctx.globalAlpha = setCard ? 0.62 : 0.5;
      ctx.fillRect(Math.max(0, x), Math.max(0, y), Math.min(w - x, bw), Math.min(h - y, bh));
    });
    ctx.globalAlpha = 1;
    // 章分界线也画成一条横线，方便看章节在整篇里的位置
    scroller.querySelectorAll(".evaxis-band.chapter").forEach((band) => {
      const r = band.getBoundingClientRect();
      const y = ((r.top - scRect.top + scroller.scrollTop) / sh) * h;
      ctx.fillStyle = "rgba(143, 123, 216, 0.55)";
      ctx.fillRect(0, Math.max(0, Math.min(h - 1, y)), w, 1);
    });
    ctx.restore();
  }

  // 又宽又高的二维网格（二维事件图）：整幅内容上万像素高．
  // 章 / 节带、人物表头按真实尺寸算只有零点几像素，直接画等于什么都看不见。
  // 所以这里改成画「骨架」——章 / 节＝横线，分组＝竖线，左侧事件栏＝一条竖带。
  // 这样一眼能看出：小地图覆盖的是整幅内容（横向＝所有人物列，纵向＝所有事件行），
  // 蓝框则是当前屏幕里真正看得到的那一小块。
  function drawGridSkeleton(ctx, scroller, w, h, sw, sh, scRect) {
    if (!scroller.querySelectorAll) return false;
    const rows = scroller.querySelectorAll(".m-row-hdr[data-event-id]");
    const cols = scroller.querySelectorAll(".m-char-hdr[data-char-id]");
    if (rows.length < 3 || cols.length < 3) return false;
    const mx = (x) => ((x - scRect.left + scroller.scrollLeft) / sw) * w;
    const my = (y) => ((y - scRect.top + scroller.scrollTop) / sh) * h;
    // 左侧「事件」栏
    const rowHdrRect = rows[0].getBoundingClientRect();
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(0, 0, Math.max(2, (rowHdrRect.width / sw) * w), h);
    // 人物分组的分界线（竖线）
    const groups = scroller.querySelectorAll(".m-group-hdr");
    ctx.fillStyle = "rgba(70, 88, 127, 0.45)";
    groups.forEach((g) => {
      const x = Math.max(0, Math.min(w - 1, mx(g.getBoundingClientRect().left)));
      ctx.fillRect(x, 0, 1, h);
    });
    // 章 / 节分带（横线）
    scroller.querySelectorAll(".m-band").forEach((b) => {
      const y = Math.max(0, Math.min(h - 1.2, my(b.getBoundingClientRect().top)));
      ctx.fillStyle = b.classList.contains("chapter") ? "rgba(70, 88, 127, 0.62)" : "rgba(150, 162, 194, 0.34)";
      ctx.fillRect(0, y, w, 1.2);
    });
    return true;
  }

  function registerScrollMinimap(scroller) {
    if (!scroller || scroller.nodeType !== 1) return null;
    let mini = scrollMinimaps.get(scroller);
    if (!mini) {
      mini = document.createElement("div");
      mini.className = "scroll-minimap";
      mini.hidden = true;
      mini.innerHTML = `<canvas></canvas>`;
      document.body.appendChild(mini);
      scrollMinimaps.set(scroller, mini);
    }
    return mini;
  }

  function refreshScrollMinimaps() {
    scrollMinimaps.forEach((mini, scroller) => {
      if (!scroller.isConnected) {
        mini.remove();
        scrollMinimaps.delete(scroller);
        return;
      }
      // 弹窗里不再用悬浮全局预览：已经建过的也顺手清掉
      if (scroller.closest && scroller.closest(".modal-overlay")) {
        mini.remove();
        scrollMinimaps.delete(scroller);
        return;
      }
      if (mini._show) updateScrollMinimap(scroller, mini, true);
    });
  }

  function scheduleScrollMinimapHide(mini) {
    if (!mini) return;
    if (mini._hideTimer) clearTimeout(mini._hideTimer);
    mini._hideTimer = setTimeout(() => {
      mini._hideTimer = 0;
      mini._show = false;
      mini.hidden = true;
    }, 500);
  }

  function hideOtherScrollMinimaps(exceptMini) {
    scrollMinimaps.forEach((mini) => {
      if (mini === exceptMini) return;
      if (mini._hideTimer) {
        clearTimeout(mini._hideTimer);
        mini._hideTimer = 0;
      }
      mini._show = false;
      mini.hidden = true;
    });
  }

  function showScrollMinimap(scroller) {
    if (!scroller || !needsScrollMinimap(scroller)) return;
    const mini = registerScrollMinimap(scroller);
    hideOtherScrollMinimaps(mini);
    updateScrollMinimap(scroller, mini, true);
    scheduleScrollMinimapHide(mini);
  }

  /* 界面缩放一变：还开着的悬浮预览按新的排版矩形立刻重算位置。
     不要只藏起来等下一次滚动——用户放大后不滚，就会停在旧坐标看起来“没贴边”。 */
  uiOnZoomReflow(() => {
    scrollMinimaps.forEach((mini, scroller) => {
      if (!mini.isConnected || !scroller.isConnected) return;
      if (mini._show && !mini.hidden) updateScrollMinimap(scroller, mini, true);
    });
  });

  function bindScrollMinimaps() {
    if (scrollMinimapBound) return;
    scrollMinimapBound = true;
    const selectors = [
      "#timeline",
      "#chrono-list",
      "#matrix-scroll",
      ".char-list",
      ".entry-list",
      ".chapter-rail",
      ".chapter-list",
      "#novel-outline-scroll",
      "#pedigree-list-body",
      ".task-detail",
      ".modal-body",
      ".rel-pick-list",
      ".rel-picker-col",
      ".rel-side",
      ".rel-list",
      ".stats-table-wrap",
      ".table-scroll",
      ".stats-side",
      ".faction-body",
      ".faction-analysis",
      ".history-list",
      ".merge-list",
      ".sel-lines-list",
      "#result-review",
    ];
    const scan = () => {
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          if (needsScrollMinimap(el)) registerScrollMinimap(el);
        });
      });
      refreshScrollMinimaps();
    };
    document.addEventListener(
      "scroll",
      (ev) => {
        const el = ev.target;
        if (needsScrollMinimap(el)) {
          showScrollMinimap(el);
        } else {
          hideOtherScrollMinimaps(null);
        }
      },
      true
    );
    window.addEventListener("resize", refreshScrollMinimaps);
    setInterval(scan, 1200);
    scan();
  }

  function flash(e) {
    const el = $(`#timeline .event-card[data-event-id="${e.id}"]`);
    if (!el) return;
    if (typeof el.animate !== "function") return; // 老环境不支持动画时静默跳过
    el.animate(
      [
        { boxShadow: "0 0 0 3px rgba(76,196,182,0.7)" },
        { boxShadow: "0 0 0 0 rgba(76,196,182,0)" },
      ],
      { duration: 900, easing: "ease-out" }
    );
    el.classList.add("jump-flash");
    setTimeout(() => el.classList.remove("jump-flash"), 1800);
  }

  function showGhost(text) {
    const g = $("#drag-ghost");
    g.textContent = text;
    g.hidden = false;
    document.addEventListener("dragover", moveGhost);
  }
  function moveGhost(e) {
    const g = $("#drag-ghost");
    // 事件轴上的位置提示占着「鼠标右下」那一格：拖拽时把 ghost 让到它下面，两个都看得见。
    // 位置提示用视觉像素量高度，ghost 的 left/top 交给统一的换算（html zoom 下也不会跑偏）。
    const tag = document.getElementById("axis-pos-tag");
    const tagH = tag && !tag.hidden ? tag.getBoundingClientRect().height : 0;
    placeFloatingAtCursor(g, e.clientX, e.clientY, 14, 14 + tagH + 6);
  }
  function hideGhost() {
    const g = $("#drag-ghost");
    g.hidden = true;
    document.removeEventListener("dragover", moveGhost);
    if (typeof hideAxisPosTag === "function") hideAxisPosTag();
  }

  /* ================= 二维事件图（矩阵） ================= */

