  /* ================= 拖动到页面边缘时自动滚动 ================= */
  let dragAutoScrollBound = false;
  let dragAutoScrollTickHook = null;

  function scrollableAncestorAt(x, y) {
    // 事件轴 / 章节线的拖拽都发生在 .timeline-wrap 里。直接点名这个滚动容器，
    // 不依赖 elementFromPoint（HTML5 拖拽 / pointer capture 时它可能拿到别的层）。
    const timelineWrap = document.querySelector("#view-timeline:not([hidden]) .timeline-wrap");
    if (timelineWrap) {
      const tr = timelineWrap.getBoundingClientRect();
      if (x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom) return timelineWrap;
    }
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function dragAutoScrollTick() {
    dragAutoScrollRaf = 0;
    if (!dragAutoScrollPoint) return;
    const { x, y } = dragAutoScrollPoint;
    const scroller = scrollableAncestorAt(x, y);
    if (!scroller) return;
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
    const rect = isDoc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    const edge = 90;
    let dy = 0;
    if (y < rect.top + edge) dy = -Math.ceil(((rect.top + edge - y) / edge) * 18);
    else if (y > rect.bottom - edge) dy = Math.ceil(((y - (rect.bottom - edge)) / edge) * 18);
    if (!dy) return;
    if (isDoc) window.scrollBy(0, dy);
    else scroller.scrollTop += dy;
    if (dragAutoScrollTickHook) {
      try {
        dragAutoScrollTickHook(x, y);
      } catch (e) {
        /* ignore */
      }
    }
    const mini = scrollMinimaps.get(scroller);
    if (mini) {
      updateScrollMinimap(scroller, mini, true);
      scheduleScrollMinimapHide(mini);
    }
    dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
  }

  function updateDragAutoScroll(x, y) {
    dragAutoScrollPoint = { x, y };
    if (!dragAutoScrollRaf) dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
  }

  function stopDragAutoScroll() {
    dragAutoScrollPoint = null;
    if (dragAutoScrollRaf) cancelAnimationFrame(dragAutoScrollRaf);
    dragAutoScrollRaf = 0;
    dragAutoScrollTickHook = null;
  }

  function setDragAutoScrollTickHook(fn) {
    dragAutoScrollTickHook = typeof fn === "function" ? fn : null;
  }

  function bindDragAutoScroll() {
    if (dragAutoScrollBound) return;
    dragAutoScrollBound = true;
    document.addEventListener(
      "dragover",
      (ev) => {
        if (typeof ev.clientX === "number" && typeof ev.clientY === "number") updateDragAutoScroll(ev.clientX, ev.clientY);
      },
      true
    );
    document.addEventListener(
      "drag",
      (ev) => {
        if (typeof ev.clientX === "number" && typeof ev.clientY === "number") updateDragAutoScroll(ev.clientX, ev.clientY);
      },
      true
    );
    ["dragend", "drop", "mouseup"].forEach((t) => document.addEventListener(t, stopDragAutoScroll, true));
  }

