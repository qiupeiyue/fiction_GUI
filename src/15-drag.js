  /* ================= 拖拽 ================= */
  /* ---- 拖动时的「透明占位块」：预示松手后会落在哪里（人物卡片 / 设定卡片共用） ---- */
  let dragPlaceholder = null;

  function ensureDragPlaceholder(el) {
    if (!dragPlaceholder) {
      dragPlaceholder = document.createElement("div");
      dragPlaceholder.className = "drag-placeholder";
    }
    // 拖动中的源卡片（也可以显式传入）：占位块按它的大小来
    const src = el || document.querySelector(".char-card.dragging, .entry-card.dragging");
    if (src && src.getBoundingClientRect) {
      const rect = src.getBoundingClientRect();
      if (rect.width) dragPlaceholder.style.width = rect.width + "px";
      if (rect.height) dragPlaceholder.style.height = rect.height + "px";
    }
      /* 势力卡的占位块把层级配色也带上：二级 / 三级的那条色条和底色跟着显示，
         一眼看得出「这里将落下一张几级势力卡」。其它卡片没有这两个变量，就清掉。 */
      const flvC = src && src.style ? src.style.getPropertyValue("--flv-c") : "";
      const flvBg = src && src.style ? src.style.getPropertyValue("--flv-bg") : "";
      dragPlaceholder.style.setProperty("--flv-c", flvC || "");
      dragPlaceholder.style.setProperty("--flv-bg", flvBg || "");
      dragPlaceholder.classList.toggle("flv-preview", !!flvC);
    return dragPlaceholder;
  }

  // 把占位块放到某个卡片的前面 / 后面（按鼠标在卡片的上半还是下半决定）
  function placeDragPlaceholder(nearEl, clientY) {
    if (!nearEl || !nearEl.parentElement) return;
    ensureDragPlaceholder();
    const rect = nearEl.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    nearEl.parentElement.insertBefore(dragPlaceholder, before ? nearEl : nearEl.nextSibling);
  }

  function clearDragPlaceholder() {
    if (dragPlaceholder && dragPlaceholder.parentElement) dragPlaceholder.parentElement.removeChild(dragPlaceholder);
    dragPlaceholder = null;
  }

  // 占位块后面紧挨着的那张卡片（就是「要插到它前面」的那个）
  function nextCardAfterPlaceholder(sel, draggedId) {
    if (!dragPlaceholder) return null;
    let n = dragPlaceholder.nextElementSibling;
    while (n && !n.matches(sel)) n = n.nextElementSibling;
    if (n && n.dataset && (n.dataset.charId === draggedId || n.dataset.entryId === draggedId)) {
      let m = n.nextElementSibling;
      while (m && !m.matches(sel)) m = m.nextElementSibling;
      return m || null;
    }
    return n || null;
  }

  function onCharDragStart(e) {
    const id = e.currentTarget.dataset.charId;
    // 批量模式下，勾选过的卡片拖动时整批一起带上
    if (batchMode && batchSelected.has(id) && batchSelected.size > 1) {
      // 整批拖动也只带当前显示出来的那些
      pruneSelectionToVisible("char");
      dragState = { type: "chars", ids: Array.from(batchSelected), id };
    } else {
      dragState = { type: "char", id };
    }
    e.dataTransfer.setData("text/plain", JSON.stringify(dragState));
    // copyMove：拖到事件 / 条目上是「复制关联」，拖到卡片之间是「移动排序」，两种都要允许
    e.dataTransfer.effectAllowed = "copyMove";
    e.currentTarget.classList.add("dragging");
    // 注意：dragstart 里不要动 DOM（插占位块会让浏览器取消整次拖拽），
    // 占位块在第一次 dragover 时才创建并插入
    const c = getChar(id) || {};
    /* 跟着鼠标的气泡：**按当前界面语言拼**（拼好的成品翻译层查不到词条，直接拼中文会漏——用户 2026-10-16 抓到过） */
    showGhost(dragState.type === "chars" ? uiSentence("dragGhostChars", dragState.ids.length) : uiSentence("dragGhostChar", c.name));
  }
  function onCharDragEnd(e) {
    e.currentTarget.classList.remove("dragging");
    dragState = null;
    clearDragPlaceholder();
    hideGhost();
    clearDropTargets();
  }
  function onEventDragStart(e, cardEl) {
    const el = cardEl || e.currentTarget;
    const id = el.dataset.eventId;
    dragState = { type: "event", id };
    // 整体移动模式：拖动选中集合里的任意一张，即整组一起移动
    if (mergeSelectMode && mergeSelected.has(id) && mergeSelected.size > 1) {
      const anchor = getEvent(id);
      pruneSelectionToVisible("event");
      dragGroupIds = { anchorStory: anchor ? anchor.storyIndex || 0 : 0, ids: Array.from(mergeSelected) };
    } else {
      dragGroupIds = null;
    }
    e.dataTransfer.setData("text/plain", JSON.stringify(dragState));
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
    if (dragGroupIds) {
      $$("#timeline .event-card.merge-sel").forEach((x) => x.classList.add("dragging-group"));
      showGhost(uiSentence("dragGhostEventGroup", dragGroupIds.ids.length));
    } else {
      showGhost(uiSentence("dragGhostEvent", (getEvent(id) || {}).title || ""));
    }
  }
  function onEventDragEnd(e, cardEl) {
    const el = cardEl || e.currentTarget;
    el.classList.remove("dragging");
    $$("#timeline .event-card.dragging-group").forEach((el) => el.classList.remove("dragging-group"));
    dragState = null;
    dragGroupIds = null;
    hideGhost();
    clearDropTargets();
  }

  function onEventSetDragStart(e, cardEl) {
    const el = cardEl || e.currentTarget;
    const setId = el.dataset.eventSetId;
    if (!setId) return;
    dragSetId = setId;
    dragState = null;
    dragGroupIds = null;
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "eventSet", id: setId }));
    e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
    const set = getEventSet(setId);
    showGhost(uiSentence("dragGhostEventSet", set ? set.name : ""));
  }

  function onEventSetDragEnd(e, cardEl) {
    const el = cardEl || e.currentTarget;
    if (el) el.classList.remove("dragging");
    dragSetId = null;
    hideGhost();
    clearDropTargets();
  }

  // 上下拖动整张事件集卡：集合内所有事件按同一个位移移动，并允许跨章节。
  function moveEventSetToStory(setId, targetStory, targetChapterId, targetSectionId) {
    const members = eventSetMembers(setId);
    if (!members.length) return false;
    const target = Number(targetStory);
    if (!Number.isFinite(target)) return false;
    const set = getEventSet(setId);
    pendingUndoLabel = uiSentence("moveEventSetUndo", set ? set.name : "");
    // 整集作为不可切开的块「抽出再插入」：成员保持内部顺序，其它事件自动让位，
    // 最后统一重排成整数行，绝不会出现成员被压到同一行、或和别的行纠缠。
    const memberIds = new Set(members.map((e) => e.id));
    const all = orderedByStory();
    const rest = all.filter((e) => !memberIds.has(e.id));
    // 落点位置直接在「抽掉成员之后」的列表里找：否则落点紧挨着集合自己时，
    // 会被自身的旧行号挡住、算成原地不动（章节变了但行没动 → 显示错乱）。
    let insertPos = rest.findIndex((e) => (e.storyIndex || 0) >= target);
    if (insertPos < 0) insertPos = rest.length;
    const next = rest.slice(0, insertPos).concat(members, rest.slice(insertPos));
    next.forEach((e, i) => {
      e.storyIndex = i;
    });
    state.order = next.map((e) => e.id);
    // 拖到明确的章 / 节线上：整集并进这个章 / 节；拖到普通行间则按落点最近的章节归章。
    if (targetChapterId) {
      members.forEach((e) => {
        e.chapterId = targetChapterId;
        e.sectionId = targetSectionId || "";
      });
    } else {
      // 落到「线之间的普通缝」时，优先归到落点上方那一行所在的章 / 节：
      // 这样才能把整集放到某条线的上方（而不是总被吸到线下方那一节）。
      const targetCh = chapterInfoAboveStory(target);
      if (targetCh) {
        members.forEach((e) => {
          e.chapterId = targetCh.chapterId;
          if (targetCh.sectionId !== undefined) e.sectionId = targetCh.sectionId;
        });
      }
    }
    saveState();
    scheduleDropRender();
    showToast(uiSentence("moveEventSetToast", set ? set.name : ""));
    return true;
  }

  // 判断落点属于哪一章 / 哪一节，规则是「优先看落点上方那一行」：
  // 拖整集到一条线的上方时，要落进上面那一节，而不是被吸到线的下方。
  function chapterInfoAboveStory(storyIndex) {
    const rows = axisRows();
    if (!rows.length) return null;
    let idx = rows.findIndex((r) => (r.items && r.items.length && (r.items[0].storyIndex || 0)) >= storyIndex);
    if (idx < 0) idx = rows.length;
    const above = idx > 0 ? rows[idx - 1] : null;
    const at = idx < rows.length ? rows[idx] : null;
    let chapterId = above ? dominantField(above.items, "chapterId") : "";
    let sectionId = above ? dominantField(above.items, "sectionId") : "";
    if (!chapterId && at) {
      chapterId = dominantField(at.items, "chapterId");
      sectionId = dominantField(at.items, "sectionId");
    }
    if (!chapterId && idx > 1) chapterId = dominantField(rows[idx - 2].items, "chapterId");
    return { chapterId, sectionId };
  }

  function onEventDragOver(e, cardEl) {
    const el = cardEl || e.currentTarget;
    const data = dragDataOf(e);
    if (!data) return;
    if (data.type === "char" || data.type === "chars") {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      el.classList.add("drop-target");
    }
    // 展开的事件集：事件可以拖到集合内某张成员卡的上 / 下半，插到它前 / 后面。
    if (data.type === "event" && el.dataset.memberSetId) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      el.classList.remove("set-insert-before", "set-insert-after");
      el.classList.add(before ? "set-insert-before" : "set-insert-after");
    }
  }

  function onEventDrop(e, cardEl) {
    const card = cardEl || e.currentTarget;
    const data = dragDataOf(e);
    dragState = null;
    clearDropTargets();
    if (!data) return;
    if (data.type === "char") {
      e.preventDefault();
      e.stopPropagation();
      addCharToEvent(data.id, card.dataset.eventId);
    } else if (data.type === "chars") {
      e.preventDefault();
      e.stopPropagation();
      addCharsToEvent(data.ids, card.dataset.eventId);
    } else if (data.type === "event" && card.dataset.memberSetId) {
      e.preventDefault();
      e.stopPropagation();
      const setId = card.dataset.memberSetId;
      const dragged = getEvent(data.id);
      const alreadyMember = dragged && eventSetIdForEvent(dragged) === setId;
      const lane = alreadyMember ? null : laneIdFromX(card.closest(".evaxis-grid") || card, e.clientX);
      dropEventIntoSetBetween(data.id, card, e, { setId }, lane, e.shiftKey);
    }
  }

  function parseDragData(e) {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch (err) {
      return null;
    }
  }

  // dragover 阶段浏览器不允许读 dataTransfer，只能用内部状态判断
  function dragDataOf(ev) {
    if (dragState && dragState.id) return dragState;
    return parseDragData(ev);
  }

  function addCharToEvent(charId, eventId) {
    const e = getEvent(eventId);
    const c = getChar(charId);
    if (!e || !c) return;
    const ids = e.characterIds || [];
    if (!ids.includes(charId)) {
      e.characterIds = ids.concat(charId);
      saveState();
      renderTimeline();
      renderMatrix();
      renderChrono(); // 时间线卡片上的登场人物也要跟着变
      flash(e);
    }
  }

  // 批量把多个人物加入某个事件的登场人物
  function addCharsToEvent(charIds, eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    const set = new Set(e.characterIds || []);
    let added = 0;
    (charIds || []).forEach((id) => {
      if (getChar(id) && !set.has(id)) {
        set.add(id);
        added++;
      }
    });
    if (!added) {
      flash(e);
      return;
    }
    e.characterIds = Array.from(set);
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono(); // 时间线卡片上的登场人物也要跟着变
    flash(e);
  }

  function clearDropTargets() {
    $$("#timeline .drop-target").forEach((el) => el.classList.remove("drop-target"));
    $$("#chrono-list .drop-target").forEach((el) => el.classList.remove("drop-target"));
    $$("#timeline .set-insert-before, #timeline .set-insert-after").forEach((el) =>
      el.classList.remove("set-insert-before", "set-insert-after")
    );
  }

