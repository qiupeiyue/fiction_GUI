  /* ================= 拖动到页面边缘时自动滚动 ================= */
  let dragAutoScrollBound = false;

  function scrollableAncestorAt(x, y) {
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
    ["dragend", "drop", "mouseup"].forEach((t) => document.addEventListener(t, stopDragAutoScroll, true));
  }

