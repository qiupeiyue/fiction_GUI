  /* ================= 线路 ================= */
  let lineDragId = null;

  // 把一条线路移到目标线路的前面（after=false）或后面
  function moveLineTo(dragId, targetId, after) {
    if (!dragId || !targetId || dragId === targetId) return;
    const lines = state.lines;
    const from = lines.findIndex((l) => l.id === dragId);
    const to = lines.findIndex((l) => l.id === targetId);
    if (from < 0 || to < 0) return;
    const moved = lines.splice(from, 1)[0];
    let idx = lines.findIndex((l) => l.id === targetId);
    if (idx < 0) idx = lines.length - 1;
    lines.splice(after ? idx + 1 : idx, 0, moved);
    saveState();
    refreshLineViews();
    renderStats();
  }

  // 让某个元素可以拖动来调整线路顺序（事件轴表头 / 二维事件图行头 / 时间线表头共用）
  // axis：判断「插到目标前面还是后面」用哪个方向——竖排列表（人物边栏的线路）用 "y"，
  // 横排的线路表头（事件轴 / 二维事件图 / 时间线）用 "x"
  function bindLineDrag(el, lineIdOf, axis) {
    if (!el) return;
    const dir = axis === "x" ? "x" : "y";
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (ev) => {
      const id = lineIdOf(el);
      if (!id) return;
      lineDragId = id;
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      try {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "line", id }));
      } catch (e) {
        /* ignore */
      }
      el.classList.add("line-dragging");
    });
    el.addEventListener("dragend", () => {
      lineDragId = null;
      el.classList.remove("line-dragging");
      $$(".line-drop-target").forEach((x) => x.classList.remove("line-drop-target"));
    });
    el.addEventListener("dragover", (ev) => {
      if (!lineDragId) return;
      const id = lineIdOf(el);
      if (!id || id === lineDragId) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      el.classList.add("line-drop-target");
    });
    el.addEventListener("dragleave", () => el.classList.remove("line-drop-target"));
    el.addEventListener("drop", (ev) => {
      if (!lineDragId) return;
      const id = lineIdOf(el);
      if (!id || id === lineDragId) return;
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.remove("line-drop-target");
      const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
      const after = dir === "x"
        ? !!(rect && rect.width > 0 && ev.clientX > rect.left + rect.width / 2)
        : !!(rect && rect.height > 0 && ev.clientY > rect.top + rect.height / 2);
      moveLineTo(lineDragId, id, after);
      lineDragId = null;
    });
  }

  function renderLines() {
    const list = $("#line-list");
    if (!list) return; // 左侧「线路」栏已经去掉：新建 / 改名 / 排序都改在事件轴横轴的线路表头上做
    const empty = $("#line-empty");
    if (empty) empty.hidden = state.lines.length > 0;
    const tree = lineTree();
    list.innerHTML = tree
      .map(({ line, depth }) => {
        const count = state.events.filter((e) => linesOf(e).includes(line.id)).length;
        const active = lineFilter.has(line.id);
        return `<div class="line-item ${active ? "active" : ""}" data-line-id="${esc(line.id)}" draggable="true" title="单击＝编辑 · 拖动＝排序 · 右键＝改名 / 代号 / 颜色 / 删除" style="padding-left:${8 + depth * 16}px">
          <span class="line-dot" style="background:${esc(line.color)}"></span>
          <span class="line-code">${esc(line.code || "?")}</span>
          <span class="line-name">${esc(lineDisplayName(line))}</span>
          <span class="line-kind ${line.kind === "暗线" ? "hidden" : ""}">${esc(line.kind)}</span>
          <span class="line-count">${count}</span>
        </div>`;
      })
      .join("");

    $$("#line-list .line-item").forEach((el) => {
      // 单击整个条目 = 打开线路编辑（筛选改用事件轴上方的线路筛选条）
      el.addEventListener("click", () => openLineModal(el.dataset.lineId));
      // 右键 = 和事件轴 / 时间线上的线路同样的快捷菜单（改名 / 改代号 / 改颜色 / 删除）
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showLineQuickMenu(ev.clientX, ev.clientY, el.dataset.lineId);
        markContextTarget(el);
      });
    });
    // 拖动线路列表项调整顺序
    $$("#line-list .line-item").forEach((el) => bindLineDrag(el, (x) => x.dataset.lineId));
  }

  // 线路有改动（新建 / 改名 / 改色 / 改顺序 / 删除）时，所有以「线路」为横轴的地方一起刷新
  // 单个界面出错也不能挡住其它界面刷新，否则就会出现「新建了线路但横轴没变」
  function refreshLineViews() {
    // 顺便刷新一下多选提示条：筛选后「有几个被藏起来、不参与批量」要跟着更新
    /* 时间线（renderChrono）不用单列：renderTimeline 两个分支都会顺带同步它，
       列在这儿会连着画两遍。 */
    [renderLines, renderLineFilters, renderTimeline, renderMatrix, renderChapterRail, renderMergeSelectBar].forEach(safeRender);
  }

  // 拖动落点后的重绘：松手那一刻不要同步重建整条事件轴（几十~几百张卡，会「卡一下」）。
  // 改成下一帧再画，且连续多次落点只画一次，松手手感就顺了。
  let dropRenderPending = false;
  function scheduleDropRender() {
    if (dropRenderPending) return;
    dropRenderPending = true;
    requestAnimationFrame(() => {
      dropRenderPending = false;
      refreshLineViews();
    });
  }

  function safeRender(fn) {
    try {
      fn();
    } catch (err) {
      console.warn("界面刷新出错：", err);
    }
  }

  // 只在对应页签显示时才真的重建 DOM：隐藏的视图重建出来谁也看不见，
  // 但长篇里它就是几百个节点，白白拖慢每一次操作。
  function viewHidden(id) {
    const el = document.getElementById(id);
    return !!(el && el.hidden);
  }

  // 搜索 / 筛选框：每按一个键就整套重画，长篇里会明显卡手。
  // 合并成「停下来一小会儿再画一次」，输入过程就顺了。
  const debouncedFilters = {};
  function scheduleFilterRender(key, fn, wait) {
    if (debouncedFilters[key]) clearTimeout(debouncedFilters[key]);
    debouncedFilters[key] = setTimeout(() => {
      debouncedFilters[key] = null;
      safeRender(fn);
    }, wait || 120);
  }

  // 重画面的重绘排到下一帧：页签先切过去、界面先响应，别让点击卡在那里
  const heavyRenderTimers = {};
  function renderHeavySoon(fn) {
    const key = String(fn.name || "render");
    if (heavyRenderTimers[key]) return;
    const run = () => {
      heavyRenderTimers[key] = null;
      safeRender(fn);
    };
    heavyRenderTimers[key] = 1;
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  // 让某条线路在事件轴 / 时间线里「自己介绍自己」：滚动到那一列并闪一下
  function flashLane(lineId) {
    if (!lineId) return;
    ["#timeline .lane-head", "#chrono-list .chrono-lane-head"].forEach((sel) => {
      const el = document.querySelector(`${sel}[data-line-id="${lineId}"]`);
      if (!el) return;
      try {
        el.scrollIntoView({ block: "nearest", inline: "center" });
      } catch (e) {
        /* ignore */
      }
      el.classList.add("flash-lane");
      setTimeout(() => el.classList.remove("flash-lane"), 1500);
    });
  }

  function renderLineFilters() {
    const html =
      `<button class="filter-chip ${
        lineFilterOn() ? "" : "active"
      }" data-line="" title="显示全部线路（清空筛选）"><span class="chip-label">全部</span></button>` +
      state.lines
        .map(
          (l) =>
            `<button class="filter-chip ${lineFilter.has(l.id) ? "active" : ""}" data-line="${esc(
              l.id
            )}" title="${esc(l.code || "?")} ${esc(lineDisplayName(l))}（${esc(l.kind)}）· 单击＝加入 / 取消筛选（可多选）· 右键＝线路快捷菜单（改名 / 改代号 / 改颜色 / 删除）"><span class="dot" style="background:${esc(
              l.color
            )}"></span><span class="chip-label">${esc(l.code || "?")} ${esc(lineDisplayName(l))} <em>${esc(
              l.kind
            )}</em></span></button>`
        )
        .join("");
    // 线路筛选按钮现在放在「事件轴 / 二维事件图 / 时间线」三个界面里，一起渲染
    $$(".line-filters").forEach((box) => {
      box.innerHTML = html;
      box.querySelectorAll(".filter-chip").forEach((b) => {
        b.addEventListener("click", () => {
          // 不按 Ctrl / Shift：逐条点就是多选。「全部」＝清空筛选。
          const id = b.dataset.line || "";
          if (!id) lineFilterClear();
          else if (lineFilter.has(id)) lineFilter.delete(id);
          else lineFilter.add(id);
          refreshLineViews();
        });
        // 线路按钮上右键＝和事件轴横轴的线路表头一样的快捷菜单（改名 / 改代号 / 改颜色 / 线路设置 / 删除）
        if (b.dataset.line) {
          b.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            showLineQuickMenu(ev.clientX, ev.clientY, b.dataset.line);
            markContextTarget(b);
          });
        }
      });
    });
  }

