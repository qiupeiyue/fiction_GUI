  function toggleEventSetExpanded(setId, lineId) {
    const key = eventSetExpandKey(setId, lineId);
    if (expandedEventSets.has(key)) {
      expandedEventSets.delete(key);
      eventSetMembers(setId).forEach((e) => expandedSetMembers.delete(e.id));
    } else {
      expandedEventSets.add(key);
    }
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
  }

  function pruneEventSetIfEmpty(setId) {
    const stillUsed = state.events.some(
      (e) => e.eventSetAssign && Object.values(e.eventSetAssign).includes(setId)
    );
    if (!stillUsed) {
      state.eventSets = (state.eventSets || []).filter((s) => s.id !== setId);
      expandedEventSets.delete(eventSetExpandKey(setId, ""));
    }
  }

  /* 改完章 / 节归属之后统一收尾：如果某个事件集的成员被界线切到了不同的章 / 节，
     就把「和集合第一行不同归属」的那部分拆出集合（脱离集合、事件本身留在原地），
     这样「事件集不跨章 / 节」的约束不会被破坏。
     · 整块一起换章 / 换节（归属仍然一致）→ 不动，集合保留；
     · 拆完只剩 1 个成员的集合 → 保留成集合，不散成普通事件。 */
  function splitSetsCutByBoundaries() {
    let moved = 0;
    (state.eventSets || []).slice().forEach((set) => {
      const members = eventSetMembers(set.id);
      if (members.length < 2) return;
      const keyOf = (e) => (e.chapterId || "") + "\u0000" + (e.sectionId || "");
      const base = keyOf(members[0]);
      if (members.every((m) => keyOf(m) === base)) return;
      members.forEach((m) => {
        if (m.id === members[0].id) return;
        if (keyOf(m) === base) return;
        if (m.eventSetAssign && Object.keys(m.eventSetAssign).length) {
          m.eventSetAssign = {};
          moved++;
        }
      });
      pruneEventSetIfEmpty(set.id);
    });
    return moved;
  }

  // 事件集成员必须始终在纵轴上相邻；渲染前把出现空洞的集合压回连续行。
  function normalizeEventSetAdjacency(setId) {
    const members = eventSetMembers(setId);
    if (members.length < 2) return false;
    // 集合内成员统一跟第一个成员同章 / 同节，避免章节 / 节分割线插在集合中间。
    const anchor = members[0];
    members.forEach((e) => {
      e.chapterId = anchor.chapterId || "";
      e.sectionId = anchor.sectionId || "";
    });
    const rows = axisRows();
    const idxOf = (e) => rows.findIndex((row) => (row.items || []).some((x) => x.id === e.id));
    const idxs = members.map(idxOf);
    if (idxs.some((i) => i < 0)) return false;
    if (idxs.length !== members.length) return false;
    const uniqueRows = Array.from(new Set(idxs)).sort((a, b) => a - b);
    const min = uniqueRows[0];
    const max = uniqueRows[uniqueRows.length - 1];
    // 同一行可以有多个不同线路的成员，连续判断要按「行」而不是按「事件数」。
    if (max - min + 1 === uniqueRows.length) return false;
    const groups = uniqueRows.map((rowIdx) => ({
      rowIdx,
      events: members.filter((e) => idxOf(e) === rowIdx),
    }));
    /* 落点值必须「先全部算完再统一写回」。
       值取自 rows[targetIdx].items[0].storyIndex，而那个事件很可能正是前面几组刚改过
       的成员；边算边写就会读到刚写进去的新值，一路串下去把后面几组全压到同一行
       （表现＝事件集里好几张卡挤在一行）。 */
    const targets = groups.map((g, i) => {
      const targetIdx = min + i;
      const targetRow = rows[targetIdx];
      if (targetRow) return (targetRow.items[0] && Number(targetRow.items[0].storyIndex)) || 0;
      const prev = rows[targetIdx - 1];
      const next = rows[targetIdx];
      if (prev && next) return (prev.v + next.v) / 2;
      if (prev) return prev.v + 1;
      if (next) return next.v - 1;
      return 0;
    });
    groups.forEach((g, i) => {
      const value = targets[i];
      g.events.forEach((e) => {
        e.storyIndex = value;
      });
    });
    return true;
  }

  function normalizeAllEventSets() {
    // 先保证同一行事件同属一个集合（或都不属于集合），再处理集合成员的行相邻。
    axisRows().forEach((row) => {
      const setIds = new Set((row.items || []).map((e) => eventSetIdForEvent(e)).filter(Boolean));
      if (!setIds.size) return;
      const setId = setIds.values().next().value;
      (row.items || []).forEach((e) => {
        if (eventSetIdForEvent(e) !== setId) applyEventSetToEvent(e, setId);
      });
    });
    let changed = false;
    (state.eventSets || []).forEach((set) => {
      if (normalizeEventSetAdjacency(set.id)) changed = true;
    });
    if (changed) {
      // 上面把事件集的 storyIndex 重新排成相邻了：按 storyIndex 排序 / 分行的缓存
      // 必须失效，否则本次重画会继续用旧顺序（和「撤销不刷新」是同一类缓存问题）。
      orderedByStoryCache.rev = -1;
      axisRowsCache.rev = -1;
    }
  }

  function eventSetOverlayHtml(set, line, members, laneIndex, startRow, span, gutter) {
    const name = set ? set.name : "未命名事件集";
    const expanded = set && eventSetIsExpanded(set.id, line ? line.id : "");
    return `<div class="event-card event-set-card event-set-overlay" draggable="true" data-event-set-id="${esc(
      set ? set.id : ""
    )}" data-line-id="${esc(line ? line.id : "")}" style="grid-column:${laneIndex + 2};grid-row:${startRow} / span ${span};width:${gutter}px;--set-gutter:${gutter}px" title="事件集：${esc(
      name
    )}（${members.length} 个事件） · 双击改事件集名，右键菜单可展开、全选、改名、删除集事件或拆分集">
      <button type="button" class="event-set-fold" data-event-set-id="${esc(set ? set.id : "")}" data-line-id="${esc(
        line ? line.id : ""
      )}" title="${expanded ? "折叠事件集" : "展开事件集"}">${expanded ? "▶" : "▶"}</button>
      <span class="event-set-icon">📁</span>
      <span class="event-set-name">${esc(name)}</span>
      <span class="event-set-count">${members.length} 个事件</span>
    </div>`;
  }

  // 折叠状态沿用原来的单行「事件集块」；只有展开时才画跨行竖卡。
  function eventSetRowBlockHtml(set, line, members) {
    const name = set ? set.name : "未命名事件集";
    return `<div class="event-card event-set-card" draggable="true" data-event-set-id="${esc(
      set ? set.id : ""
    )}" data-line-id="${esc(line ? line.id : "")}" title="事件集：${esc(name)}（${members.length} 个事件） · 双击改事件集名，右键菜单可展开、全选、改名、删除集事件或拆分集">
      <button type="button" class="event-set-fold" data-event-set-id="${esc(set ? set.id : "")}" data-line-id="${esc(
        line ? line.id : ""
      )}" title="展开事件集">▶</button>
      <span class="event-set-icon">📁</span>
      <span class="event-set-name">${esc(name)}</span>
      <span class="event-set-count">${members.length} 个事件</span>
    </div>`;
  }

  function eventSetDefaultName(events) {
    const title = String((events && events[0] && events[0].title) || "").trim();
    if (!title) return "未命名_assemble";
    const wordish = /[A-Za-z0-9]/.test(title) && /[\s\-_]+/.test(title);
    if (wordish) {
      const words = title.split(/[\s\-_]+/).filter(Boolean).slice(0, 3).join(" ");
      return words + "_assemble";
    }
    return Array.from(title).slice(0, 5).join("") + "_assemble";
  }

  function canAddSelectedToEventSet() {
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (ids.length < 2) return false;
    const events = ids.map((id) => getEvent(id));
    const nonSet = events.filter((e) => !eventSetIdForEvent(e));
    const alreadySet = events.filter((e) => eventSetIdForEvent(e));
    // 已经在事件集里的事件不能单独再并入；但和未入集事件同行的，会按同行规则一起移动。
    if (!nonSet.length) return false;
    if (alreadySet.length) {
      const allowRows = new Set(nonSet.map((e) => e.storyIndex || 0));
      if (!alreadySet.every((e) => allowRows.has(e.storyIndex || 0))) return false;
    }
    const chapterId = events[0].chapterId || "";
    if (!events.every((e) => (e.chapterId || "") === chapterId)) return false;
    const sectionId = events[0].sectionId || "";
    if (!events.every((e) => (e.sectionId || "") === sectionId)) return false;
    // 只要求「事件相邻」：允许不同线路，只要选中的事件落在连续的事件轴行里即可。
    const rows = axisRows();
    const rowIdxs = [];
    rows.forEach((row, i) => {
      if ((row.items || []).some((e) => ids.includes(e.id))) rowIdxs.push(i);
    });
    if (!rowIdxs.length) return false;
    const min = Math.min.apply(null, rowIdxs);
    const max = Math.max.apply(null, rowIdxs);
    if (max - min + 1 !== rowIdxs.length) return false;
    return events.every((e) => {
      const i = rows.findIndex((row) => (row.items || []).some((x) => x.id === e.id));
      return i >= min && i <= max;
    });
  }

  async function addSelectedToEventSet() {
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!canAddSelectedToEventSet()) {
      uiAlert("事件集：至少两个同章同节、位置相邻的事件（可跨线路）；已在事件集里的不能再并入。");
      return;
    }
    const ordered = orderedEvents().filter((e) => ids.includes(e.id));
    const defaultName = eventSetDefaultName(ordered);
    const existing = state.eventSets && state.eventSets.length ? state.eventSets[0].name : "";
    const selectedChapter = ordered.length ? ordered[0].chapterId || "" : "";
    const name = await uiPrompt(
      "事件集名称（默认按第一个事件生成；输入已有名称会并入，新名称会自动新建）：",
      defaultName || existing
    );
    if (name === null || !String(name).trim()) return;
    const title = String(name).trim();
    let set = (state.eventSets || []).find((s) => s.name === title);
    if (!set) {
      set = { id: uid(), name: title };
      state.eventSets.push(set);
    }
    // 并入已有事件集时，也必须和该集合现有成员同章节 / 同节（可以跨线路）。
    const existingMembers = eventSetMembers(set.id);
    const targetChapter = existingMembers.length ? existingMembers[0].chapterId || "" : null;
    const targetSection = existingMembers.length ? existingMembers[0].sectionId || "" : null;
    const selectedSection = ordered.length ? ordered[0].sectionId || "" : "";
    if (
      targetChapter !== null &&
      (selectedChapter !== targetChapter || (targetSection !== null && selectedSection !== targetSection))
    ) {
      uiAlert(
        `「${set.name}」已经属于「${targetChapter ? chapterNameOf({ chapterId: targetChapter }) || targetChapter : "未分章"}」，不能再并进别处的事件。`
      );
      return;
    }
    // 并入已有事件集后，集合内所有事件必须在纵轴上连续相邻，中间不能被别的行隔开。
    if (existingMembers.length) {
      const rows = axisRows();
      const rowIdxOf = (e) => rows.findIndex((row) => (row.items || []).some((x) => x.id === e.id));
      const rowSet = new Set();
      existingMembers.concat(ordered).forEach((e) => {
        const i = rowIdxOf(e);
        if (i >= 0) rowSet.add(i);
      });
      const rowArr = Array.from(rowSet).sort((a, b) => a - b);
      if (rowArr.length && rowArr[rowArr.length - 1] - rowArr[0] + 1 !== rowArr.length) {
        uiAlert("并入后集合内事件必须在纵轴上连续相邻，中间不能隔着别的行。");
        return;
      }
    }
    ids.forEach((id) => {
      const e = getEvent(id);
      if (!e) return;
      assignEventToSetAllLines(e, set.id);
    });
    pendingUndoLabel = `并入事件集「${set.name}」：${ids.length} 个事件`;
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    showToast(`已把 ${ids.length} 个事件并入「${set.name}」`);
  }

  // 复制事件：单条放在原事件下方；批量复制整体放在最后一条被复制事件的下方。
  // 不再按原章节各自插行；所有副本都归入最后一条被复制事件所属的章节。
  function copyEvents(ids) {
    const idSet = new Set(ids || []);
    const selected = orderedEvents().filter((e) => idSet.has(e.id));
    if (!selected.length) return 0;
    const values = evaxisValues.slice();
    const anchorEvent = selected.reduce((a, b) => {
      const av = a.storyIndex || 0;
      const bv = b.storyIndex || 0;
      if (bv !== av) return bv > av ? b : a;
      return state.order.indexOf(b.id) > state.order.indexOf(a.id) ? b : a;
    });
    const lastVal = anchorEvent.storyIndex || 0;
    const lastIdx = values.indexOf(lastVal);
    const nextVal = lastIdx >= 0 && lastIdx < values.length - 1 ? values[lastIdx + 1] : null;
    const gap = nextVal != null && nextVal > lastVal ? nextVal - lastVal : 1;
    const rowKeys = Array.from(new Set(selected.map((e) => e.storyIndex || 0))).sort((a, b) => a - b);
    const step = gap / (rowKeys.length + 1);
    const rowNew = new Map(rowKeys.map((v, i) => [v, lastVal + step * (i + 1)]));
    const copies = [];
    selected.forEach((e) => {
      const cp = JSON.parse(JSON.stringify(e));
      cp.id = uid();
      cp.title = copyItemName(e.title);
      cp.storyIndex = rowNew.get(e.storyIndex || 0);
      cp.chapterId = anchorEvent.chapterId || "";
      cp.sectionId = anchorEvent.sectionId || "";
      cp.lineIds = linesOf(e).slice();
      cp.characterIds = (e.characterIds || []).slice();
      // 正文文件跟事件卡一一对应：副本不能继承原卡的 .md 映射，否则两张卡会写同一个文件。
      delete cp.novelFile;
      // 复制事件不要继承原事件的事件集归属，否则跨章节复制后会出现“同一事件集里跨章节”的成员。
      cp.eventSetAssign = {};
      copies.push(cp);
    });
    if (!copies.length) return 0;
    state.events.push(...copies);
    const nextOrder = [];
    state.order.forEach((id) => {
      nextOrder.push(id);
      if (id === anchorEvent.id) copies.forEach((c) => nextOrder.push(c.id));
    });
    state.order = nextOrder;
    pendingUndoLabel = `复制 ${copies.length} 个事件`;
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    return copies.length;
  }

  function showEventCardMenu(x, y, eventId, cardEl) {
    const e = getEvent(eventId);
    if (!e) return;
    const items = [
      { label: "修改标题…", act: () => quickRenameEvent(eventId) },
      { label: "编辑", act: () => openEventModal(eventId) },
      { label: "复制", act: () => { const n = copyEvents([eventId]); if (n) showToast(`已复制事件：${copyItemName(e.title)}`); } },
      { label: "更改线路…", act: () => showEventLineMenu(x, y, eventId) },
      { label: "移动至…（按 # 号）", act: () => promptMoveEventToRow(eventId) },
    ];
    if (!eventSetIdForEvent(e)) {
      items.push({ label: "新建事件集", act: () => addSingleEventToNewSet(eventId) });
    }
    items.push({ label: "删除", act: () => deleteEventById(eventId) }, ...foldMenuItems());
    // 标题只写「#N・[线路代码]」：N 是这个事件的 #（全量行号，不受线路筛选影响），
    // 线路代码取指针所在的那一列（多线事件会跟着鼠标显示不同的列）
    const rowNo = eventRowNumber(eventId);
    const grid = cardEl && cardEl.closest ? cardEl.closest(".evaxis-grid") : null;
    const laneId = grid ? laneIdFromX(grid, x) : linesOf(e)[0] || null;
    const lane = getLine(laneId);
    const code = String((lane && (lane.code || lane.name)) || "").trim();
    renderContextMenu(x, y, `#${rowNo || "?"}${code ? "・[" + code + "]" : ""}`, items);
  }

  async function addSingleEventToNewSet(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    if (eventSetIdForEvent(e)) {
      uiAlert("这个事件已经属于一个事件集了。");
      return;
    }
    const defaultName = eventSetDefaultName([e]);
    const name = await uiPrompt("事件集名称：", defaultName);
    if (name === null) return;
    let title = String(name).trim() || defaultName;
    if ((state.eventSets || []).some((s) => s.name === title)) {
      let n = 2;
      while ((state.eventSets || []).some((s) => s.name === `${title} ${n}`)) n++;
      title = `${title} ${n}`;
    }
    const set = { id: uid(), name: title };
    state.eventSets.push(set);
    assignEventToSetAllLines(e, set.id);
    pendingUndoLabel = `新建事件集并把「${e.title}」放入「${set.name}」`;
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    showToast(`已把「${e.title}」放入事件集「${set.name}」`);
  }

  function showEventSetMenu(x, y, setId, lineId) {
    const set = getEventSet(setId);
    if (!set) return;
    const members = eventSetMembers(setId);
    const leftLineId = eventSetLeftLineId(setId) || lineId || "";
    const expanded = eventSetIsExpanded(setId, leftLineId);
    renderContextMenu(x, y, `事件集「${set.name}」`, [
      {
        label: expanded ? "收起" : "展开",
        act: () => toggleEventSetExpanded(setId, leftLineId),
      },
      {
        label: `全选集事件（${members.length}）`,
        act: () => {
          mergeSelectMode = true;
          selectPurpose = "select";
          mergeSelected = new Set(members.map((e) => e.id));
          renderTimeline();
          renderMergeSelectBar();
        },
      },
      {
        label: "修改名称",
        act: () => renameEventSet(setId),
      },
      {
        label: "删除集事件",
        act: () => deleteEventSetEvents(setId, lineId),
      },
      {
        label: "拆分集",
        act: () => splitEventSet(setId, lineId),
      },
    ]);
  }

  async function renameEventSet(setId) {
    const set = getEventSet(setId);
    if (!set) return;
    const name = await uiPrompt("修改事件集名称：", set.name);
    if (name === null) return;
    const t = String(name).trim();
    if (!t || t === set.name) return;
    pendingUndoLabel = `重命名事件集：「${set.name}」→「${t}」`;
    set.name = t;
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    showToast(`事件集已改名为「${t}」`);
  }

  async function deleteEventSetEvents(setId, lineId) {
    const set = getEventSet(setId);
    if (!set) return;
    const members = eventSetMembers(setId);
    if (!members.length) {
      showToast("这个事件集里没有可删除的事件。");
      return;
    }
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel(members);
      if (!ok) return;
    }
    const ids = new Set(members.map((e) => e.id));
    pendingUndoLabel = `删除事件集「${set.name}」的 ${members.length} 个事件`;
    state.events = state.events.filter((e) => !ids.has(e.id));
    state.order = (state.order || []).filter((id) => !ids.has(id));
    state.settings.entries.forEach((en) => {
      en.eventIds = (en.eventIds || []).filter((id) => !ids.has(id));
    });
    ids.forEach((id) => mergeSelected.delete(id));
    members.forEach((e) => expandedSetMembers.delete(e.id));
    expandedEventSets.delete(eventSetExpandKey(setId, eventSetLeftLineId(setId) || lineId));
    pruneEventSetIfEmpty(setId);
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    refreshLineViews();
    renderChapterRail();
    renderEntries();
    renderStats();
    renderMergeSelectBar();
    showToast(`已删除「${set.name}」中的 ${members.length} 个事件，可用「撤销」还原`);
  }

  function splitEventSet(setId, lineId) {
    const set = getEventSet(setId);
    if (!set) return;
    const members = eventSetMembers(setId);
    if (!members.length) {
      showToast("这个事件集里没有可拆分的事件。");
      return;
    }
    pendingUndoLabel = `拆分事件集「${set.name}」：${members.length} 个事件回归原位`;
    members.forEach((e) => {
      expandedSetMembers.delete(e.id);
      removeEventFromSet(e, setId);
      if (e.eventSetAssign && !Object.keys(e.eventSetAssign).length) delete e.eventSetAssign;
    });
    expandedEventSets.delete(eventSetExpandKey(setId, eventSetLeftLineId(setId) || lineId));
    pruneEventSetIfEmpty(setId);
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    showToast(`已拆分「${set.name}」：${members.length} 个事件回归原位`);
  }

  // 把事件拖到展开后的事件集成员卡之间：并入事件集，并插到目标卡前 / 后。
  function dropEventIntoSetBetween(draggedId, cardEl, ev, memberSet, laneId, appendLines) {
    let dragged = getEvent(draggedId);
    const target = getEvent(cardEl.dataset.eventId);
    const setId = (memberSet && memberSet.setId) || cardEl.dataset.memberSetId || "";
    if (!dragged || !target || !setId || dragged.id === target.id) return false;
    const set = getEventSet(setId);
    if (!set) return false;
    const currentSetId = eventSetIdForEvent(dragged);
    if (currentSetId && currentSetId !== setId) {
      uiAlert("事件只能属于一个事件集。请先把它从原事件集里拖出去，再并入新事件集。");
      return true;
    }
    const setMembers = eventSetMembers(setId);
    const anchorMember = setMembers[0];
    const chapter = anchorMember ? anchorMember.chapterId || "" : null;
    const section = anchorMember ? anchorMember.sectionId || "" : null;
    if (chapter !== null && (dragged.chapterId || "") !== chapter) {
      uiAlert("只能把和这个事件集属于同一章节、同一节的事件拖进去。");
      return true;
    }
    if (section !== null && (dragged.sectionId || "") !== section) {
      uiAlert("只能把和这个事件集属于同一章节、同一节的事件拖进去。");
      return true;
    }
    // 并入事件集只调整顺序与集合归属，线路保持不变。
    const keepLineIds = linesOf(dragged).slice();
    const rect = cardEl.getBoundingClientRect();
    const before = ev.clientY < rect.top + rect.height / 2;
    // 以「集合内成员顺序」为基准插入：拖到某张卡上半＝插到它前面．
    // 下半＝插到它后面。这样 A、B 已属于集合时，把 C 拖到 B 上半会得到 A → C → B。
    const members = setMembers;
    const targetIdx = members.findIndex((m) => m.id === target.id);
    const prevAnchor = before ? members[targetIdx - 1] : target;
    const nextAnchor = before ? target : members[targetIdx + 1];
    const low = prevAnchor ? prevAnchor.storyIndex || 0 : null;
    const high = nextAnchor ? nextAnchor.storyIndex || 0 : null;
    let newVal = target.storyIndex || 0;
    if (low !== null && high !== null) newVal = low === high ? low : (low + high) / 2;
    else if (high !== null) {
      // 成为集合第一个：落在「它上面的那个事件」和 first 之间，别和上面的行撞值
      const above = orderedByStory()
        .filter((e) => e.id !== dragged.id && (e.storyIndex || 0) < high)
        .sort((a, b) => (b.storyIndex || 0) - (a.storyIndex || 0))[0];
      newVal = above ? (high + (above.storyIndex || 0)) / 2 : high - 1;
    } else if (low !== null) {
      // 成为集合最后一个：落在 last 和「它下面的那个事件」之间，别和下面的行撞值
      const below = orderedByStory()
        .filter((e) => e.id !== dragged.id && (e.storyIndex || 0) > low)
        .sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0))[0];
      newVal = below ? (low + (below.storyIndex || 0)) / 2 : low + 1;
    }
    pendingUndoLabel = `把事件「${dragged.title}」插入事件集「${set.name}」`;
    dragged.storyIndex = newVal;
    assignEventToSetAllLines(dragged, setId);
    if (laneId) applyLaneChange(dragged, laneId, appendLines);
    else setEventLines(dragged, keepLineIds);
    // 同时更新叙事顺序数组，保证后续按 state.order 取顺序的逻辑一致。
    const order = (state.order || []).filter((id) => id !== dragged.id);
    if (nextAnchor) {
      const ti = order.indexOf(nextAnchor.id);
      if (ti >= 0) order.splice(ti, 0, dragged.id);
      else order.push(dragged.id);
    } else if (prevAnchor) {
      const pi = order.indexOf(prevAnchor.id);
      if (pi >= 0) order.splice(pi + 1, 0, dragged.id);
      else order.push(dragged.id);
    } else {
      order.push(dragged.id);
    }
    state.order = order;
    saveState();
    scheduleDropRender();
    showToast(`已把「${dragged.title}」${before ? "插入到" : "放到"}「${target.title}」${before ? "前面" : "后面"}，并并入「${set.name}」`);
    return true;
  }

  // 在事件轴两行之间的插入条上找：是不是夹在同一个展开事件集的两个成员行中间。
  // 是的话返回下一行的成员卡，拖到这条缝里就等于插到这张成员卡前面。
  function findNextSetMemberCardAcrossInsert(strip) {
    const grid = strip.closest(".evaxis-grid");
    if (!grid) return null;
    const rows = Array.from(grid.querySelectorAll(".evaxis-row"));
    let prevRow = null;
    let nextRow = null;
    rows.forEach((row) => {
      if (row.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING) prevRow = row;
      else if (!nextRow) nextRow = row;
    });
    if (!prevRow || !nextRow) return null;
    // 章节 / 节分割线不能算作事件集内部的“中间缝”，否则会把跨章节的位置误判成集合内插入。
    let between = prevRow.nextElementSibling;
    while (between && between !== nextRow) {
      if (between.classList && between.classList.contains("evaxis-band")) return null;
      between = between.nextElementSibling;
    }
    const setIdsOfRow = (row) => {
      const ids = new Set();
      row.querySelectorAll(".event-card[data-event-id]").forEach((card) => {
        const sid = eventSetIdForEvent(getEvent(card.dataset.eventId));
        if (sid) ids.add(sid);
      });
      return ids;
    };
    const prevIds = setIdsOfRow(prevRow);
    const nextIds = setIdsOfRow(nextRow);
    for (const sid of prevIds) {
      if (!nextIds.has(sid)) continue;
      const leftLineId = eventSetLeftLineId(sid);
      if (!eventSetIsExpanded(sid, leftLineId)) continue;
      const card = Array.from(nextRow.querySelectorAll(".event-card[data-event-id]")).find(
        (c) => eventSetIdForEvent(getEvent(c.dataset.eventId)) === sid
      );
      if (card) return card;
    }
    return null;
  }

  // 拖到折叠事件集整体上 / 下时的默认落点：
  // 在集合上方 → 成为集合第一个事件；在集合下方 → 成为最后一个事件。
  function joinEventSetByPosition(dragged, setId, lineId) {
    const members = eventSetMembers(setId).filter((e) => e.id !== dragged.id);
    let position = "inside";
    if (members.length) {
      const first = members[0];
      const last = members[members.length - 1];
      const cur = dragged.storyIndex || 0;
      const firstVal = first.storyIndex || 0;
      const lastVal = last.storyIndex || 0;
      if (cur < firstVal) {
        const r = evaxisValues.indexOf(firstVal);
        dragged.storyIndex = r >= 0 ? insertValueAt(r - 1) : firstVal - 1;
        position = "first";
      } else if (cur > lastVal) {
        const r = evaxisValues.indexOf(lastVal);
        dragged.storyIndex = r >= 0 ? insertValueAt(r) : lastVal + 1;
        position = "last";
      }
    }
    assignEventToSetAllLines(dragged, setId);
    const order = (state.order || []).filter((id) => id !== dragged.id);
    if (position === "first" && members.length) {
      const i = order.indexOf(members[0].id);
      if (i >= 0) order.splice(i, 0, dragged.id);
      else order.unshift(dragged.id);
    } else if (position === "last" && members.length) {
      const i = order.indexOf(members[members.length - 1].id);
      if (i >= 0) order.splice(i + 1, 0, dragged.id);
      else order.push(dragged.id);
    } else if (!order.includes(dragged.id)) {
      order.push(dragged.id);
    }
    state.order = order;
    return position;
  }

  // 把事件拖进事件集的统一入口：只改故事时间行和事件集归属，绝不动它所属的线路。
  function joinDraggedIntoSet(dragged, setId, laneId, appendLines) {
    if (!dragged || !setId) return false;
    const set = getEventSet(setId);
    if (!set) return false;
    const currentSetId = eventSetIdForEvent(dragged);
    if (currentSetId && currentSetId !== setId) {
      uiAlert("事件只能属于一个事件集。请先把它从原事件集里拖出去，再并入新事件集。");
      return true;
    }
    const setMembers = eventSetMembers(set.id);
    const anchor = setMembers.length ? setMembers[0] : null;
    const chapter = anchor ? anchor.chapterId || "" : null;
    const section = anchor ? anchor.sectionId || "" : null;
    if (chapter !== null && (dragged.chapterId || "") !== chapter) {
      uiAlert("只能把和这个事件集属于同一章节、同一节的事件拖进去。");
      return true;
    }
    if (section !== null && (dragged.sectionId || "") !== section) {
      uiAlert("只能把和这个事件集属于同一章节、同一节的事件拖进去。");
      return true;
    }
    // 记住原线路：并入事件集只调整时间行与集合归属，线路必须保持不变。
    const keepLineIds = linesOf(dragged).slice();
    const position = joinEventSetByPosition(dragged, setId, eventSetLeftLineId(setId));
    if (laneId) applyLaneChange(dragged, laneId, appendLines);
    else setEventLines(dragged, keepLineIds);
    pendingUndoLabel = `把事件「${dragged.title}」加入事件集「${set.name}」`;
    saveState();
    scheduleDropRender();
    renderMergeSelectBar();
    showToast(
      position === "first"
        ? `已把「${dragged.title}」并入「${set.name}」，并放到集合最前`
        : position === "last"
          ? `已把「${dragged.title}」并入「${set.name}」，并放到集合最后`
          : `已把「${dragged.title}」加入「${set.name}」`
    );
    return true;
  }

  // 事件在第几行（1 起算）。# 是事件自己的属性，走全量行（不受线路筛选影响）。
  function eventRowNumber(eventId) {
    return rowNoOfEvent(getEvent(eventId));
  }

  // 右键菜单：按行号把事件移动到指定行（只改行，线路不变）
  async function promptMoveEventToRow(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    const rows = axisRows().map((row) => row.items || []);
    const total = rows.length;
    if (!total) return;
    const cur = eventRowNumber(eventId);
    const v = await uiPrompt(`把「${e.title}」移动到哪个 #？（1 - ${total}，保持当前线路不变）`, String(cur || 1));
    if (v === null) return;
    const n = parseInt(String(v).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > total) {
      uiAlert(`请输入 1 到 ${total} 之间的 # 号。`);
      return;
    }
    const before = eventRowNumber(eventId);
    pendingUndoLabel = `移动事件「${e.title}」到 #${n}`;
    const actual = moveEventToRowNo(eventId, n);
    if (!actual || actual === before) {
      showToast("事件已经在这个 # 上");
      return;
    }
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderChapterRail();
    showToast(
      actual === n
        ? `已把「${e.title}」移动到 #${n}`
        : `已把「${e.title}」移动到 #${actual}`
    );
  }

  /* 把事件移动到第 N 行（# 按全量行算，不看线路筛选）——事件信息卡里改 # 也走这里，
     所以两条路的结果一定一致：
       落点行已经有事件时，线路不冲突就直接放进这一行的空白线路（不挤占）；
       线路冲突才插到 N-1 和 N 之间，把原来那一行整体往下推一格。
     并入落点行的事件集、章节归属也一并处理。opts.keepChapters＝
     用户刚在弹窗里明确改过所属章 / 节，就不要再按落点覆盖回去。
     返回实际落到的 #（没动就返回原来的 #）。 */
  function moveEventToRowNo(eventId, wantRow, opts) {
    const moved = getEvent(eventId);
    if (!moved || !Number.isFinite(Number(wantRow))) return 0;
    const o = opts || {};
    // 落点要先把「被移动的这个事件」自己那一行摘掉再算：不摘的话从上面往下移时
    // 它原来占的行会被抽走、整体上移一位，填 #N 反而落到 #N-1。
    const baseRows = axisRows()
      .map((row) => row.items || [])
      .filter((evs) => !evs.some((x) => x.id === eventId));
    const total = baseRows.length + 1;
    const n = Math.max(1, Math.min(total, Math.floor(Number(wantRow))));
    const before = eventRowNumber(eventId);
    if (n === before) return before;
    const above = baseRows[n - 2];
    const below = baseRows[n - 1];
    const valAbove = above ? Number(above[0].storyIndex) || 0 : null;
    const valBelow = below ? Number(below[0].storyIndex) || 0 : null;
    const myLines = (moved.lineIds || []).filter((x) => getLine(x));
    const clashHere = (below || []).some((other) => other.id !== moved.id && linesOf(other).some((x) => myLines.includes(x)));
    const shareRow = !!(below && below.length) && !clashHere;
    const target = shareRow
      ? valBelow
      : valAbove === null && valBelow === null
        ? 0
        : valAbove === null
          ? valBelow - 1
          : valBelow === null
            ? valAbove + 1
            : (valAbove + valBelow) / 2;
    detachEventFromSetIfOutside(moved, target);
    moved.storyIndex = target;
    // 行号刚变过：让 axisRows() / eventRowNumber() 这些按 stateDataRev 缓存的重算，
    // 否则下面「并入落点行的集合」还在用移动前的旧行，会归错集合。
    bumpStateRev();
    pendingUndoLabel = `把事件移到 #${n}`;
    // 章节归属按落点重算（和拖动一致）；弹窗里刚明确改过章 / 节时以用户选的为准
    if (!o.keepChapters) syncChaptersForMoved([moved]);
    /* 先并入落点行所属的集合，再规整：顺序反了的话，集合的相邻性修整会把
       原本在集合里的成员挤到和这个事件同一行。 */
    const rowsNow = axisRows().map((row) => row.items || []);
    const myIdx = eventRowNumber(eventId) - 1;
    const setOfRow = (i) => ((rowsNow[i] || []).map((x) => eventSetIdForEvent(x)).find(Boolean) || "");
    const rowSetId = setOfRow(myIdx - 1) || setOfRow(myIdx + 1) || setOfRow(myIdx);
    if (rowSetId && eventSetIdForEvent(moved) !== rowSetId) assignEventToSetAllLines(moved, rowSetId);
    normalizeAllEventSets();
    // 插到两行之间会取中点：落点定下来后把行号归整回连续整数
    normalizeStoryIndexesIfFractional();
    return eventRowNumber(eventId);
  }

  // 同一个线路里、相邻两行之间能不能合并
  function sameLaneRowNeighbor(eventId, dir) {
    const rows = axisRows();
    const idx = rows.findIndex((r) => r.items.some((e) => e.id === eventId));
    if (idx < 0) return null;
    const me = getEvent(eventId);
    const row = rows[dir < 0 ? idx - 1 : idx + 1];
    if (!me || !row) return null;
    const other = row.items.find((x) => x.id !== eventId && linesOf(x).some((id) => linesOf(me).includes(id)));
    return other ? { me, other, dir } : null;
  }

  // 与相邻的同一线路事件合并（和事件轴的手动合并一样：分数高的留下当主事件）
  async function mergeEventWithNeighbor(eventId, dir) {
    const rows = axisRows();
    const idx = rows.findIndex((r) => r.items.some((e) => e.id === eventId));
    const me = getEvent(eventId);
    if (!me || idx < 0) return;
    const row = rows[dir < 0 ? idx - 1 : idx + 1];
    if (!row) {
      showToast(dir < 0 ? "这已经是第一个 # 了" : "这已经是最后一个 # 了");
      return;
    }
    const hit = sameLaneRowNeighbor(eventId, dir);
    if (!hit) {
      uiAlert("相邻的 # 上、同一条线路里没有事件，不能合并。");
      return;
    }
    const members = [hit.me, hit.other].sort((a, b) => eventScore(b) - eventScore(a));
    const keep = members[0];
    const drop = members[1];
    if (!(await uiConfirm(`把「${drop.title}」合并进「${keep.title}」？\n\n人物、线路、起因 / 经过 / 结果会一并合并，可撤销。`))) return;
    pendingUndoLabel = `合并事件：「${drop.title}」→「${keep.title}」`;
    mergeUndoSnapshot = snapshotCharData();
    try {
      await mergeEventsIntoWithNovel(keep.id, [drop.id]);
    } catch (e) {
      mergeUndoSnapshot = null;
      showToast(String((e && e.message) || e));
      return;
    }
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    renderEntries();
    renderLineFilters();
    renderMergeSelectBar();
    showMergeUndoBar("已合并 1 组事件");
  }

  // 事件轴上「展开 / 折叠所有事件」的菜单项
  function foldMenuItems() {
    return [
      { label: "全部展开", act: () => expandAllEventCards() },
      { label: "全部折叠", act: () => collapseAllEventCards() },
    ];
  }

  function expandAllEventCards() {
    collapsedEventCards = new Set();
    // 展开着的事件集：里面的成员卡也一起展开（默认是折叠的）
    (state.eventSets || []).forEach((s) => {
      if (eventSetIsExpanded(s.id, eventSetLeftLineId(s.id))) {
        eventSetMembers(s.id).forEach((e) => expandedSetMembers.add(e.id));
      }
    });
    renderTimeline();
    showToast("已展开所有事件");
  }

  function collapseAllEventCards() {
    collapsedEventCards = new Set((state.events || []).map((e) => e.id));
    // 展开着的事件集：里面的成员卡也一起折叠
    expandedSetMembers.clear();
    renderTimeline();
    showToast("已折叠所有事件（只显示标题）");
  }

  // 右键菜单里的删除事件（可撤销）
  async function deleteEventById(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel([e]);
      if (!ok) return;
    }
    pendingUndoLabel = `删除事件：「${e.title}」`;
    state.events = state.events.filter((x) => x.id !== eventId);
    state.order = (state.order || []).filter((id) => id !== eventId);
    state.settings.entries.forEach((en) => {
      en.eventIds = (en.eventIds || []).filter((id) => id !== eventId);
    });
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    renderTimeline();
    renderMatrix();
    renderStats();
    renderEntries();
    showToast(`已删除事件「${e.title}」`);
  }

  // 快捷修改事件标题
  async function quickRenameEvent(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    const title = await uiPrompt("修改标题：", e.title || "");
    if (title === null) return;
    const t = title.trim();
    if (!t || t === e.title) return;
    pendingUndoLabel = `重命名事件：「${e.title}」→「${t}」`;
    e.title = t;
    saveState();
    renderTimeline();
    renderMatrix();
    renderStats();
  }

  // 快捷修改线路的名字 / 代号
  async function quickRenameLine(lineId, field) {
    const l = getLine(lineId);
    if (!l) return;
    const isCode = field === "code";
    const v = await uiPrompt(isCode ? "修改线路代号（例如 A、foe）：" : "修改线路名字：", (isCode ? l.code : l.name) || "");
    if (v === null) return;
    const t = v.trim();
    if (isCode) {
      if (!t || t === l.code) return;
      pendingUndoLabel = `修改线路代号：「${l.code}」→「${t}」`;
      l.code = t;
    } else {
      if (t === (l.name || "")) return;
      pendingUndoLabel = `重命名线路：「${l.name || ""}」→「${t}」`;
      l.name = t;
    }
    saveState();
    refreshLineViews();
  }

  // 快捷修改线路颜色（系统取色器）
  function quickPickLineColor(lineId) {
    const l = getLine(lineId);
    if (!l) return;
    const input = document.createElement("input");
    input.type = "color";
    input.value = /^#[0-9a-fA-F]{6}$/.test(l.color || "") ? l.color : "#3fb3a6";
    input.style.position = "fixed";
    input.style.left = "-200px";
    input.style.top = "0";
    document.body.appendChild(input);
    const done = () => input.remove();
    input.addEventListener("change", () => {
      pendingUndoLabel = `修改线路颜色：「${l.name || l.code || ""}」`;
      l.color = input.value;
      saveState();
      refreshLineViews();
      done();
    });
    input.addEventListener("blur", done);
    input.click();
  }

  // 线路文字上的右键快捷菜单：名字 / 代号 / 颜色 / 完整设置
  // opts.short＝事件轴上的线路卡：只留「编辑 / 删除 / 新建线路」三条
  function showLineQuickMenu(x, y, lineId, opts) {
    const l = getLine(lineId);
    if (!l) return;
    const onlyOne = (state.lines || []).length <= 1;
    const items =
      opts && opts.short
        ? [
            { label: "编辑", act: () => openLineModal(lineId) },
            { label: "删除", disabled: onlyOne, act: () => deleteLineById(lineId) },
            { label: "新建线路", act: () => openLineModal(null, { afterId: lineId }) },
          ]
        : [
            { label: "改名…", act: () => quickRenameLine(lineId, "name") },
            { label: "改代号…", act: () => quickRenameLine(lineId, "code") },
            { label: "改颜色…", act: () => quickPickLineColor(lineId) },
            { label: "线路设置…", act: () => openLineModal(lineId) },
            { label: "删除线路", act: () => deleteLineById(lineId) },
            { label: "＋ 新建…", act: () => openLineModal(null) },
          ];
    renderContextMenu(x, y, "线路「" + lineLabel(l) + "」", items);
  }

  // 矩阵里事件标题的右键菜单
  function showEventTitleMenu(x, y, eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    const items = [
      { label: "修改标题…", act: () => quickRenameEvent(eventId) },
      { label: "编辑", act: () => openEventModal(eventId) },
      { label: "复制", act: () => { const n = copyEvents([eventId]); if (n) showToast(`已复制事件：${copyItemName(e.title)}`); } },
      { label: "更改线路…", act: () => showEventLineMenu(x, y, eventId) },
    ];
    // 与相邻的同一线路事件合并（二维事件图里最常用）
    [-1, 1].forEach((dir) => {
      const hit = sameLaneRowNeighbor(eventId, dir);
      if (hit) {
        items.push({ label: `与${dir < 0 ? "上" : "下"}一个 # 合并「${hit.other.title}」`, act: () => mergeEventWithNeighbor(eventId, dir) });
      } else {
        items.push({ label: `${dir < 0 ? "上" : "下"}一个 # 不同线路，无法合并`, disabled: true });
      }
    });
    const trNo = eventRowNumber(eventId);
    renderContextMenu(x, y, `#${trNo || "?"}: ${e.title}`, items);
  }

  // 整行上下移动一格（与紧邻的那一行交换；同样只在同一条线路里进行）
  // 事件轴空白位置插入章分界线。
  // R：新章起始的可见行号（0 起）。正常情况下把下方卡片归入新章；
  // 边界情况（下方没有事件 / 下方就是章分界线）建成空章。
  async function insertChapterAtRow(R, topChapterId) {
    // 归属一律按全量行算：R 是“画出来的”边界行号，先换算成全量边界行号
    const all = axisRows();
    const M = all.length;
    const rowEvents = all.map((row) => row.items || []);
    const RAll = canonicalBoundaryRowOf(R);
    // 用“画出来的”seg 只是为了确定点到了哪一章；下面所有的行区间都在全量行上做
    const visSeg = currentAxisRows().segs.find((x) => R >= x.startRow && R <= x.endRow);
    const chIds = rowDominants(rowEvents, "chapterId");
    const segsAll = [];
    chIds.forEach((chId, r) => {
      const last = segsAll[segsAll.length - 1];
      if (!last || last.chapterId !== chId) segsAll.push({ chapterId: chId, startRow: r, endRow: r });
      else last.endRow = r;
    });
    const seg = segsAll.find((x) => RAll >= x.startRow && RAll <= x.endRow);
    // 紧贴在「这一章自己的章带」下面插章 ＝ 插在它内容的开头：这一章变空章，新章吸收它下面的事件。
    const atOwnChapterTop = !!(topChapterId && seg && seg.chapterId === topChapterId && RAll === seg.startRow);

    const title = await uiPrompt("新章节的标题？", chapterDefaultTitle((state.chapters || []).length + 1));
    if (title === null) return;
    const c = { id: uid(), title: title.trim() || "新章节", collapsed: false, sections: [] };

    const vals = rowEvents.map((evs) => (evs && evs[0] ? evs[0].storyIndex : null)).filter((v) => v !== null);
    const anchor = vals.length
      ? RAll <= 0
        ? vals[0] - 1
        : RAll >= vals.length
          ? vals[vals.length - 1] + 1
          : (vals[RAll - 1] + vals[RAll]) / 2
      : 0;

    let absorbed = false;
    if (seg && (RAll > seg.startRow || !seg.chapterId || atOwnChapterTop)) {
      // 在某一章内部：切这一章，吸收 [RAll, 章末]
      const anchorIdx = state.chapters.findIndex((x) => x.id === seg.chapterId);
      if (anchorIdx >= 0) state.chapters.splice(anchorIdx + 1, 0, c);
      else state.chapters.push(c);
      // 节的处理：整段都在新章里的节跟着搬过去；跨边界的节，切到新章的事件变「未分节」。
      const splitChapter = getChapter(seg.chapterId);
      if (splitChapter) {
        const rowSecIds = rowDominants(rowEvents, "sectionId");
        const secRange = new Map();
        rowSecIds.forEach((sid, r) => {
          if (!sid) return;
          if (!secRange.has(sid)) secRange.set(sid, { first: r, last: r });
          else secRange.get(sid).last = r;
        });
        const moveSecs = [];
        const spanSecs = new Set();
        (splitChapter.sections || []).forEach((sec) => {
          const rng = secRange.get(sec.id);
          if (!rng) return; // 空节留在原章
          if (rng.first >= RAll) moveSecs.push(sec);
          else if (rng.last >= RAll) spanSecs.add(sec.id);
        });
        if (moveSecs.length) {
          c.sections = (c.sections || []).concat(moveSecs);
          splitChapter.sections = (splitChapter.sections || []).filter((s) => !moveSecs.includes(s));
        }
        for (let r = RAll; r <= seg.endRow; r++) {
          (rowEvents[r] || []).forEach((e) => {
            e.chapterId = c.id;
            if (spanSecs.has(e.sectionId)) e.sectionId = "";
          });
        }
      } else {
        for (let r = RAll; r <= seg.endRow; r++) {
          (rowEvents[r] || []).forEach((e) => {
            e.chapterId = c.id;
            e.sectionId = "";
          });
        }
      }
      // 界线切过事件集 → 把归属变掉的那半拆出集合（整块一起换章的不动）
      splitSetsCutByBoundaries();
      absorbed = true;
    } else {
      // 边界情况：下方没有事件，或下方就是一条章分界线 → 空章
      c.anchorStory = anchor;
      const belowCh = seg ? seg.chapterId : "";
      let idx = belowCh ? state.chapters.findIndex((x) => x.id === belowCh) : -1;
      if (idx < 0) idx = state.chapters.length;
      /* 落点这个缝里可能已经站着别的空章分界线（锚点相同）：锚点相同时分界线按章节列表顺序画，
         新插的这条要排在它们**上面** —— 插到「第一条锚点不小于我们、且自己也是空的」章之前。
         必须整份列表都找：那个空章可能排在「有事件那一章」后面（老数据、之前的插入留下的），
         只往前找就会漏掉它，新线就掉到它下面去了。 */
      const emptyIdx = (state.chapters || []).findIndex(
        (x) =>
          x &&
          x.id !== c.id &&
          !state.events.some((e) => (e.chapterId || "") === x.id) &&
          typeof x.anchorStory === "number" &&
          x.anchorStory >= anchor - 1e-9
      );
      if (emptyIdx >= 0) idx = emptyIdx;
      state.chapters.splice(idx, 0, c);
    }

    pendingUndoLabel = `插入章：「${c.title}」`;
    repairChapterContinuity();
    repairSectionContinuity();
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(absorbed ? `已插入章「${c.title}」，下方事件已归入` : `已插入空章「${c.title}」`);
  }

  // 事件轴空白位置插入节分界线。规则同插入章，但作用在某一章内部。
  async function insertSectionAtRow(R, forcedChapterId, topSectionId) {
    // 归属一律按全量行算：R 是“画出来的”边界行号，先换算成全量边界行号
    const all = axisRows();
    const rowEvents = all.map((row) => row.items || []);
    const M = rowEvents.length;
    const RAll = canonicalBoundaryRowOf(R);
    const rowSecIds = rowDominants(rowEvents, "sectionId");
    const chIds = rowDominants(rowEvents, "chapterId");
    const segsAll = [];
    chIds.forEach((chId, r) => {
      const last = segsAll[segsAll.length - 1];
      if (!last || last.chapterId !== chId) segsAll.push({ chapterId: chId, startRow: r, endRow: r });
      else last.endRow = r;
    });

    // 所属章：优先上一行，其次下一行（空白在章末时归上一章）。
    const chIdAbove = RAll > 0 ? (segsAll.find((x) => RAll - 1 >= x.startRow && RAll - 1 <= x.endRow) || {}).chapterId : "";
    const chIdBelow = RAll < M ? (segsAll.find((x) => RAll >= x.startRow && RAll <= x.endRow) || {}).chapterId : "";
    const forced = forcedChapterId && getChapter(forcedChapterId) ? forcedChapterId : "";
    const chapterId = forced || chIdAbove || chIdBelow || (state.chapters[0] || {}).id || "";
    const chapter = getChapter(chapterId);
    if (!chapter) {
      uiAlert("请先建立章节，再插入节。");
      return;
    }
    const sections = chapter.sections || [];

    const title = await uiPrompt("新小节的标题？", sectionDefaultTitle(sections.length + 1));
    if (title === null) return;
    const s = { id: uid(), title: title.trim() || uiTextFor("新小节"), collapsed: false };

    const vals = rowEvents.map((evs) => (evs && evs[0] ? evs[0].storyIndex : null)).filter((v) => v !== null);
    const anchor = vals.length
      ? RAll <= 0
        ? vals[0] - 1
        : RAll >= vals.length
          ? vals[vals.length - 1] + 1
          : (vals[RAll - 1] + vals[RAll]) / 2
      : 0;

    const inChapterRow = (r) => r >= 0 && r < M && (rowEvents[r] || []).some((e) => (e.chapterId || "") === chapter.id);
    const inChapter = inChapterRow(RAll);

    // 找 R 所在的「节区域」[segStart, segEnd]：同一章内 sectionId 相同的最大连续区间（含「未分节」""）。
    let segStart = RAll;
    let segEnd = RAll;
    if (inChapter) {
      const secIdAtR = rowSecIds[RAll] || "";
      let i = RAll;
      while (i - 1 >= 0 && inChapterRow(i - 1) && (rowSecIds[i - 1] || "") === secIdAtR) {
        i--;
        segStart = i;
      }
      i = RAll;
      while (i + 1 < M && inChapterRow(i + 1) && (rowSecIds[i + 1] || "") === secIdAtR) {
        i++;
        segEnd = i;
      }
    }

    let absorbed = false;
    // 紧贴在「这一节自己的节带」下面插节 ＝ 插在它内容的开头：这一节变空节，新节吸收它下面的事件。
    const atOwnSectionTop = !!(
      topSectionId &&
      inChapter &&
      segStart === RAll &&
      (rowSecIds[RAll] || "") === topSectionId
    );
    if (inChapter && (segStart < RAll || (rowSecIds[RAll] || "") === "" || atOwnSectionTop)) {
      // 在某一段内部：切这一段，吸收 [R, 该段末]
      const prevSecId = RAll > 0 && inChapterRow(RAll - 1) ? rowSecIds[RAll - 1] || "" : "";
      // 从节带下面插进来时，新节就排在被切开的那一节后面（那一节留成空节、仍在最前）
      const hintIdx = topSectionId ? sections.findIndex((x) => x.id === topSectionId) : -1;
      const anchorIdx = hintIdx >= 0 ? hintIdx : prevSecId ? sections.findIndex((x) => x.id === prevSecId) : -1;
      if (anchorIdx >= 0) sections.splice(anchorIdx + 1, 0, s);
      else sections.unshift(s);
      for (let r = RAll; r <= segEnd; r++) {
        (rowEvents[r] || []).forEach((e) => {
          if ((e.chapterId || "") !== chapter.id) return;
          e.sectionId = s.id;
        });
      }
      // 和「插入章」一样的规则：界线切过事件集 → 下半部分脱离集合（事件集被拆开），
      // 整块一起进新节的不动；拆完只剩 1 个成员的集合保留，不散。
      splitSetsCutByBoundaries();
      absorbed = true;
    } else {
      // 边界情况：下方没有事件，或下方就是一条节分界线 → 空节
      s.anchorStory = anchor;
      const belowSec = inChapter && RAll < M ? rowSecIds[RAll] : "";
      let idx = belowSec ? sections.findIndex((x) => x.id === belowSec) : -1;
      if (idx < 0) idx = sections.length;
      // 同「插入章」：这个缝里已有空节分界线（锚点相同）时，新节要排在它们**上面**（整份列表找）
      const emptyIdx = sections.findIndex(
        (x) =>
          x &&
          x.id !== s.id &&
          !rowSecIds.some((sid) => sid === x.id) &&
          typeof x.anchorStory === "number" &&
          x.anchorStory >= anchor - 1e-9
      );
      if (emptyIdx >= 0) idx = emptyIdx;
      sections.splice(idx, 0, s);
    }

    pendingUndoLabel = `插入节：「${s.title}」`;
    repairSectionContinuity(chapter.id);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(absorbed ? `已插入节「${s.title}」，下方事件已归入` : `已插入空节「${s.title}」`);
  }

  // prevChIdHint：事件轴上排在这条章带上面的那条章带所属的章（"" ＝ 未分章，null/undefined ＝ 不知道）
  function moveChapterBoundary(segIndex, targetRow, prevChIdHint) {
    const { segs } = currentAxisRows();
    const seg = segs[segIndex];
    if (!seg) {
      renderTimeline();
      return;
    }
    // 归属一律按全量行算（线路筛选不影响 # / 章节归属）：
    // 先把“画出来的”边界行号换算成全量边界行号，再在全量行上做吸附 / 重排。
    const all = axisRows();
    const chapterRangeOf = (chId) => {
      let s = -1;
      let e = -1;
      all.forEach((row, r) => {
        if ((row.items || []).some((ev) => (ev.chapterId || "") === chId)) {
          if (s < 0) s = r;
          e = r;
        }
      });
      return { s, e };
    };
    const segRange = chapterRangeOf(seg.chapterId);
    if (segRange.s < 0) {
      renderTimeline();
      return;
    }
    /* 上一章：优先取「上一个有事件的段」；如果它是本章前面的第一个段
       （比如它前面只有一个空章），就退回章节列表里的上一章——空章也能靠这条分界线变出内容。
       列表里都没有上一章（真的是第一章）时才什么都不做。 */
    /* 上一章：优先用「事件轴上排在这条章带上面的那条章带」（用户看到的就是它，空章也算）；
       不知道时才退回「上一个有事件的段」，再退回章节列表里的上一章。都没有＝真的是第一章。 */
    let prevChId = "";
    let havePrev = false;
    if (typeof prevChIdHint === "string") {
      prevChId = prevChIdHint; // "" 也合法：上面那条是「未分章」
      havePrev = true;
    }
    if (!havePrev) {
      const prevSeg = segs[segIndex - 1];
      if (prevSeg && (prevSeg.chapterId || "") !== (seg.chapterId || "")) {
        prevChId = prevSeg.chapterId || "";
        havePrev = true;
      }
    }
    if (!havePrev) {
      const chapters = state.chapters || [];
      const ci = chapters.findIndex((x) => x.id === seg.chapterId);
      if (ci > 0) {
        prevChId = chapters[ci - 1].id;
        havePrev = true;
      }
    }
    if (!havePrev) {
      renderTimeline();
      return;
    }
    const prevRange = chapterRangeOf(prevChId);
    const prevHasRows = prevRange.s >= 0;
    const segStart = segRange.s;
    const segEnd = segRange.e + 1;
    // 上一章是空章：它没有事件行，用它的锚点换算成「边界行号」（= 上面有几行）
    const prevStart = prevHasRows ? prevRange.s : Math.max(0, virtualInsertIndexFor(chapterAnchorStory(prevChId)) + 1);
    // 上一章有内容时至少给它留一行；上一章本来就是空的，允许边界就停在它锚点处（＝拖上去没变化）
    const minTarget = prevHasRows ? prevStart + 1 : Math.max(0, prevStart);
    let target = Math.max(minTarget, Math.min(segEnd, canonicalBoundaryRowOf(targetRow)));
    // 章节分界线不允许落在事件集内部：落点如果正好把某个事件集切成两半，
    // 就自动放到整个事件集之后（集合整体留在上一章里）。
    const setRange = new Map();
    all.forEach((row, r) => {
      (row.items || []).forEach((e) => {
        const sid = eventSetIdForEvent(e);
        if (!sid) return;
        const cur = setRange.get(sid);
        if (!cur) setRange.set(sid, { s0: r, s1: r });
        else {
          cur.s0 = Math.min(cur.s0, r);
          cur.s1 = Math.max(cur.s1, r);
        }
      });
    });
    setRange.forEach((rng) => {
      if (target > rng.s0 && target <= rng.s1) target = rng.s1 + 1;
    });
    target = Math.max(minTarget, Math.min(segEnd, target));
    // 吸附之后，分界线不会再切开任何事件集；只有真的被切开的事件集才需要脱离
    const splitSets = new Set();
    setRange.forEach((rng, sid) => {
      if (target > rng.s0 && target <= rng.s1) splitSets.add(sid);
    });
    if (target === segStart) {
      renderTimeline();
      return;
    }
    const lo = Math.min(segStart, target);
    const hi = Math.max(segStart, target);
    pendingUndoLabel = "移动章节分割线";
    for (let r = lo; r < hi; r++) {
      const chId = r < target ? prevChId : seg.chapterId;
      (all[r].items || []).forEach((e) => {
        const oldChapter = e.chapterId || "";
        const sid = eventSetIdForEvent(e);
        e.chapterId = chId;
        e.sectionId = "";
        if (sid && splitSets.has(sid) && (e.chapterId || "") !== oldChapter) {
          e.eventSetAssign = {};
        }
      });
    }
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
  }

  // 右键菜单：按行号把章节分割线移动到指定行
  // 设置某一章的起始位置：用户填 N，则分界线落在第 N-1 行和第 N 行之间。
  // N=1 表示从最前面开始；N 超过总行数 M+2 时放在最后一行事件之后。
  function setChapterStartPosition(chapterId, rawN) {
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((c) => c.id === chapterId);
    if (ci < 0) return false;
    const rows = axisRows();
    const M = rows.length;
    if (!M) {
      uiAlert("事件轴上还没有事件。");
      return false;
    }
    let N = parseInt(String(rawN).trim(), 10);
    if (!Number.isFinite(N) || N < 1) {
      uiAlert("请输入一个不小于 1 的 # 号。");
      return false;
    }
    if (N > M + 2) N = M + 1;
    const startOf = new Map(chapters.map((c) => [c.id, M]));
    rows.forEach((row, i) => {
      const cid = row.items && row.items[0] ? row.items[0].chapterId : "";
      if (cid && startOf.has(cid) && i < startOf.get(cid)) startOf.set(cid, i);
    });
    startOf.set(chapters[0].id, 0);
    setStartBoundary(startOf, chapters, ci, Math.max(0, Math.min(M, N - 1)));
    let changed = 0;
    rows.forEach((row, i) => {
      let target = "";
      for (let j = chapters.length - 1; j >= 0; j--) {
        if (i >= startOf.get(chapters[j].id)) {
          target = chapters[j].id;
          break;
        }
      }
      (row.items || []).forEach((e) => {
        if ((e.chapterId || "") !== target) {
          e.chapterId = target;
          e.sectionId = "";
          changed++;
        }
      });
    });
    // 手填 # 号把章线挪进事件集里 → 同样把归属变掉的那半拆出集合；整块一起换章的不动
    splitSetsCutByBoundaries();
    repairSectionContinuity();
    return changed;
  }

  // 在有序数组里把第 idx 项的起点设为 boundary，并保持前后顺序不倒退。
  function setStartBoundary(startOf, list, idx, boundary) {
    const ids = list.map((x) => x.id);
    startOf.set(ids[idx], boundary);
    for (let j = 0; j < idx; j++) {
      if (startOf.get(ids[j]) > boundary) startOf.set(ids[j], boundary);
    }
    for (let j = idx + 1; j < ids.length; j++) {
      if (startOf.get(ids[j]) < boundary) startOf.set(ids[j], boundary);
    }
    for (let j = 1; j < ids.length; j++) {
      if (startOf.get(ids[j]) < startOf.get(ids[j - 1])) startOf.set(ids[j], startOf.get(ids[j - 1]));
    }
  }

  async function promptSetChapterStart(chapterId) {
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((c) => c.id === chapterId);
    const ch = ci >= 0 ? chapters[ci] : null;
    if (!ch) return;
    if (ci === 0) {
      uiAlert("这是第一章，它的起始位置固定在最前面。");
      return;
    }
    const M = axisRows().length;
    if (!M) {
      uiAlert("事件轴上还没有事件。");
      return;
    }
    const v = await uiPrompt(
      `设置「${ch.title}」的起始 #（分界线在第 N-1 和第 N 行之间；N=1 放到最前面，填大于 ${M + 2} 放到最后）：`,
      String(Math.min(M + 1, Math.max(1, (axisRows().findIndex((row) => (row.items[0] || {}).chapterId === chapterId) + 1) || 1)))
    );
    if (v === null) return;
    const N = parseInt(String(v).trim(), 10);
    if (!Number.isFinite(N) || N < 1) {
      uiAlert("请输入一个不小于 1 的 # 号。");
      return;
    }
    pendingUndoLabel = `设置「${ch.title}」的起始位置`;
    if (setChapterStartPosition(chapterId, N)) {
      saveState();
      renderChapterRail();
      renderTimeline();
      renderMatrix();
      renderStats();
      showToast(`「${ch.title}」的分界线已放到 #${Math.max(1, N - 1)} 和 #${N} 之间`);
    }
  }

  // 设置某个章节的起止行（范围内的行归入该章，范围外原本属于它的事件交给相邻章节）
  // 右键菜单：输入起止行号
  function laneEventCardHtml(e, line) {
    const border = line ? line.color : "#888";
    const nl = isNonlinear(e);
    const lineList = linesOf(e);
    const lineId = line ? line.id : "";
    const setId = eventSetIdForEvent(e);
    const setLineId = setId ? eventSetShownLineId(setId) : "";
    const memberOfExpandedSet = !!(setId && eventSetIsExpanded(setId, setLineId));
    // 跨线路事件集：折叠时只在最左侧线路、第一个成员的位置画一张单行集合块．
    // 展开时才画跨行竖卡，并显示集合内的事件卡（默认折叠）。
    if (setId && !memberOfExpandedSet) {
      const first = eventSetMembers(setId)[0];
      if (first && first.id === e.id && linesOf(e).includes(setLineId)) {
        return eventSetRowBlockHtml(getEventSet(setId), getLine(setLineId), eventSetMembers(setId));
      }
      return "";
    }
    const multiBadge =
      lineList.length > 1
        ? `<span class="ev-multi-badge">多线 ${lineList.map((id) => (getLine(id) || {}).code || "?").join("+")}</span>`
        : "";
    const allChars = (e.characterIds || []).map((id) => getChar(id)).filter(Boolean);
    // 事件轴上不显示龙套，只留一个计数提示
    const chars = allChars.filter((c) => !isExtraChar(c));
    const extraCount = allChars.length - chars.length;
    const chips =
      chars
      .map(
        (c) =>
          `<span class="event-char-chip" data-char-id="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}<button class="chip-x" data-event="${esc(
            e.id
          )}" data-char="${esc(c.id)}" title="移除登场">×</button></span>`
      )
      .join("") + (extraCount ? `<span class="event-char-more" title="龙套人物已在事件轴上隐藏">+${extraCount} 龙套</span>` : "");
    const field = (label, value, cls) =>
      value
        ? `<div class="lane-field ${cls}"><span class="lf-label">${label}</span><span class="lf-text">${esc(
            value
          )}</span></div>`
        : "";
    const sel = mergeSelectMode && mergeSelected.has(e.id);
    const canDrag = true;
    // 普通卡片默认展开；事件集展开后的成员卡默认折叠，点右上角小三角再展开。
    const collapsed = memberOfExpandedSet ? !expandedSetMembers.has(e.id) : collapsedEventCards.has(e.id);
    const foldTip = collapsed ? "展开：显示起因 / 经过 / 结果 / 人物" : "折叠：只显示标题";
    const details = `<div class="lane-fields" ${collapsed ? "hidden" : ""}>
        ${field("起因", e.cause, "cause")}
        ${field("经过", e.process, "process")}
        ${field("结果", e.result, "result")}
      </div>
      ${chips ? `<div class="event-chars" ${collapsed ? "hidden" : ""}>${chips}</div>` : ""}`;
    // 地点 / 插叙 / 多线 这些小字收成一行，放在标题下面
    const metaBits = [];
    if (e.place) metaBits.push(`<span class="event-place" title="地点：${esc(e.place)}">${esc(e.place)}</span>`);
    if (nl) metaBits.push(`<span class="ev-nonlinear-badge" title="这条是${esc(e.narrative)}">${esc(e.narrative)}</span>`);
    if (multiBadge) metaBits.push(multiBadge);
    const metaLine = metaBits.length
      ? `<div class="event-meta">${metaBits.join('<span class="ev-sep">·</span>')}</div>`
      : "";
    // 事件卡不再挂「操作说明」悬停：位置提示统一交给鼠标跟随的 position tag（#N・[线路代码]）
    return `<div class="event-card lane-card ${memberOfExpandedSet ? "set-member-card" : ""} ${nl ? "nonlinear" : ""} ${sel ? "merge-sel" : ""} ${mergeSelectMode ? "merge-sel-mode" : ""}" draggable="${canDrag ? "true" : "false"}" data-event-id="${esc(e.id)}" data-member-set-id="${esc(
      memberOfExpandedSet ? setId : ""
    )}" data-member-line-id="${esc(memberOfExpandedSet ? setLineId : "")}" style="border-left:4px solid ${esc(border)}">
      <button type="button" class="event-fold" data-fold-id="${esc(e.id)}" data-member-set-id="${esc(
        memberOfExpandedSet ? setId : ""
      )}" data-member-line-id="${esc(memberOfExpandedSet ? setLineId : "")}" title="${esc(foldTip)}">${
        collapsed ? "▶" : "▼"
      }</button>
      <div class="event-head">
        <span class="event-title">${esc(e.title)}</span>
        ${e.time ? `<span class="event-time" title="时间：${esc(e.time)}">${esc(e.time)}</span>` : ""}
      </div>
      ${metaLine}
      ${details}
    </div>`;
  }

  // 行与行之间的竖向分隔线：按每条线路的实际列宽画出来
  function laneLineGradient(ws) {
    const parts = ["transparent 0px", `transparent ${ROW_LABEL_W}px`];
    let acc = ROW_LABEL_W;
    ws.forEach((w) => {
      acc += w;
      // 关键：透明与线条色必须用「同一个位置」的成对停靠点，
      // 否则浏览器会在整格宽度里做一次透明→线条色的柔和插值，
      // 结果每一列都变成「从左到右的渐变」。这里只画 1px 硬边竖线。
      const edge = Math.max(ROW_LABEL_W, acc - 1);
      parts.push(
        `transparent ${edge}px`,
        `var(--line) ${edge}px`,
        `var(--line) ${acc}px`,
        `transparent ${acc}px`
      );
    });
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }

  // 拖动线路分界线时先就地改列宽（不整块重画，拖起来才跟手）
  function applyLaneWidths(grid, ws) {
    if (!grid) return;
    const tpl = `${ROW_LABEL_W}px ${ws.map((w) => w + "px").join(" ")} ${LANE_PLUS_W}px`;
    grid.dataset.laneWidths = ws.join(",");
    grid.style.gridTemplateColumns = tpl;
    grid.querySelectorAll(".evaxis-row-grid").forEach((g) => {
      g.style.gridTemplateColumns = tpl;
      g.style.backgroundImage = laneLineGradient(ws);
    });
    let acc = ROW_LABEL_W;
    grid.querySelectorAll(".lane-resizer").forEach((r, i) => {
      acc += ws[i] || 0;
      r.style.left = acc + "px";
    });
  }

  function bindTimeline() {
    bindDragAutoScroll();
    bindScrollMinimaps();
    // 横轴最右边的「＋」：新建线路（原来的左侧线路栏已经去掉）
    const laneAddBtn = $("#lane-add-btn");
    if (laneAddBtn) laneAddBtn.addEventListener("click", () => openLineModal(null));
    // 线路分界线：鼠标放上是左右拉伸箭头；拖动＝改这一列的宽度；双击＝恢复自动宽度
    const axisGridEl = $("#timeline .evaxis-grid");
    if (axisGridEl)
      axisGridEl.querySelectorAll(".lane-resizer").forEach((rz) => {
        const lid = rz.dataset.laneId;
        rz.addEventListener("mousedown", (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          const startX = ev.clientX;
          const ws = String(axisGridEl.dataset.laneWidths || "")
            .split(",")
            .map((v) => Number(v));
          const lanesNow = lineFilterLanes();
          const idx = lanesNow.findIndex((l) => l.id === lid);
          if (idx < 0 || !ws[idx]) return;
          const startW = ws[idx];
          let moved = false;
          const onMove = (e) => {
            const dx = (e.clientX - startX) / uiZoomScale(axisGridEl); // 缩放后的鼠标位移换算回列宽 px
            if (!moved) {
              if (Math.abs(dx) < 2) return;
              moved = true;
              document.body.classList.add("lane-resizing");
            }
            const w = Math.max(LANE_W_MIN, Math.min(LANE_W_MAX, Math.round(startW + dx)));
            ws[idx] = w;
            laneWidths[lid] = w;
            applyLaneWidths(axisGridEl, ws);
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.classList.remove("lane-resizing");
            if (moved) renderTimeline(); // 彻底重排一次：卡片换行、落点换算都跟着更新
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
        rz.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          delete laneWidths[lid];
          renderTimeline();
          showToast("已恢复这条线路的自动列宽");
        });
      });
    // ================= 交互统一用「事件委托」挂在整块事件轴上 =================
    // 以前每张卡片挂 6 个监听、每一行挂 4 个、每个插入条挂 4 个，
    // 长篇里几百个事件时光是"挂监听"就要几十毫秒；现在整块只挂一份，
    // 具体点到了谁用 closest() 现算。
    const axisEl2 = $("#timeline .evaxis");
    if (axisEl2) {
      const cardAt = (t) => (t && t.closest ? t.closest(".event-card") : null);
      const setBlockAt = (t) => (t && t.closest ? t.closest(".event-set-card") : null);
      const rowAt = (t) => (t && t.closest ? t.closest(".evaxis-row") : null);
      const stripAt = (t) => (t && t.closest ? t.closest(".evaxis-insert") : null);
      const bandAt = (t) => (t && t.closest ? t.closest(".evaxis-band") : null);

      // 悬停位置提示：跟着鼠标显示所指位置的「#N・[线路代码]」/「#N/M・[线路代码]」
      axisEl2.addEventListener("mousemove", (ev) => {
        if (dragState || dragSetId) return; // 拖拽中交给 dragover 更新
        showAxisPosTag(axisLabelAt(ev.target, ev.clientX), ev.clientX, ev.clientY);
      });
      axisEl2.addEventListener("mouseleave", hideAxisPosTag);
      axisEl2.addEventListener("contextmenu", hideAxisPosTag);
      bindAxisPosTagDocHide();

      // 单击：折叠三角 / 移除登场人物 / 选中卡片 / 打开编辑弹窗
      axisEl2.addEventListener("click", (ev) => {
        const t = ev.target;
        const setFold = t.closest(".event-set-fold");
        if (setFold) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleEventSetExpanded(setFold.dataset.eventSetId, setFold.dataset.lineId || "");
          return;
        }
        const fold = t.closest(".event-fold");
        if (fold) {
          ev.preventDefault();
          ev.stopPropagation();
          const id = fold.dataset.foldId;
          if (!id) return;
          const memberSetId = fold.dataset.memberSetId || "";
          if (memberSetId) {
            if (expandedSetMembers.has(id)) expandedSetMembers.delete(id);
            else expandedSetMembers.add(id);
            renderTimeline();
            return;
          }
          if (collapsedEventCards.has(id)) collapsedEventCards.delete(id);
          else collapsedEventCards.add(id);
          renderTimeline();
          return;
        }
        const chip = t.closest(".chip-x");
        if (chip) {
          ev.stopPropagation();
          removeCharFromEvent(chip.dataset.event, chip.dataset.char);
          return;
        }
        const card = cardAt(t);
        if (!card) return;
        if (card.dataset.eventSetId) {
          ev.stopPropagation();
          return;
        }
        const id = card.dataset.eventId;
        if (mergeSelectMode) {
          ev.stopPropagation();
          if (ev.shiftKey)
            shiftClickCard("event", id, visibleEventIdsForShortcut(), mergeSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("event", id, mergeSelected);
          return;
        }
        // Shift＝连选、Ctrl/Cmd＝加选：自动进入多选模式，不打开编辑弹窗
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          ev.stopPropagation();
          clearTimeout(evtClickTimer);
          ensureEventSelectMode();
          if (ev.shiftKey)
            shiftClickCard("event", id, visibleEventIdsForShortcut(), mergeSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("event", id, mergeSelected);
          return;
        }
        markShortcutAnchor("event", id);
        // 点人物圈圈：先等一拍（可能是「双击打开人物卡」的第一下）
        if (delayCardOpenFromChip(t, () => openEventModal(id))) return;
        // 点标题：可能是双击改名的第一下，稍等一下再决定是否打开编辑弹窗
        if (t.closest(".event-title")) {
          clearTimeout(evtClickTimer);
          evtClickTimer = setTimeout(() => openEventModal(id), 240);
          return;
        }
        openEventModal(id);
      });

      // 双击标题＝快捷改名
      axisEl2.addEventListener("dblclick", (ev) => {
        // 双击人物圈圈＝打开这张人物卡
        if (openCharFromChip(ev.target)) {
          cancelCardOpenFromChip();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const card = cardAt(ev.target);
        if (!card) return;
        if (ev.target.closest(".event-set-fold")) return;
        if (card.dataset.eventSetId) {
          ev.preventDefault();
          ev.stopPropagation();
          clearTimeout(evtClickTimer);
          renameEventSet(card.dataset.eventSetId);
          return;
        }
        if (!ev.target.closest(".event-title")) return;
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(evtClickTimer);
        quickRenameEvent(card.dataset.eventId);
      });

      // 右键：卡片 / 插入条 / 行（章节带、线路表头自己有监听，这里让开）
      axisEl2.addEventListener("contextmenu", (ev) => {
        // 右键人物圈圈＝人物卡那套菜单
        if (showCharChipMenu(ev)) return;
        const t = ev.target;
        const card = cardAt(t);
        if (card) {
          ev.preventDefault();
          exitSelectModesForContextMenu(); // 右键菜单只对这张卡生效：先退出多选
          if (card.dataset.eventSetId) {
            showEventSetMenu(ev.clientX, ev.clientY, card.dataset.eventSetId, card.dataset.lineId || "");
            markContextTarget(card);
            return;
          }
          showEventCardMenu(ev.clientX, ev.clientY, card.dataset.eventId, card);
          markContextTarget(card);
          return;
        }
        if (bandAt(t) || t.closest(".lane-head")) return;
        const strip = stripAt(t);
        if (strip) {
          ev.preventDefault();
          ev.stopPropagation();
          // 集合内部空隙（框内缝 / 两个成员行之间的缝）：新事件落在对应位置，并并入这个集合
          const insideSetId = (() => {
            if (strip.dataset.setInsideId) return strip.dataset.setInsideId;
            const sidOf = (el) => {
              if (!el || !el.querySelector) return "";
              const mc = el.querySelector(".event-card[data-member-set-id]");
              if (mc) return mc.dataset.memberSetId;
              const sc = el.querySelector(".event-set-card[data-event-set-id]");
              return sc ? sc.dataset.eventSetId : "";
            };
            const a = sidOf(strip.previousElementSibling);
            const b = sidOf(strip.nextElementSibling);
            return a && a === b ? a : "";
          })();
          showInsertMenu(
            ev.clientX,
            ev.clientY,
            parseInt(strip.dataset.insert, 10),
            laneIdFromX(strip.closest(".evaxis-grid"), ev.clientX),
            strip.dataset.chapterId || "",
            strip.dataset.sectionId || "",
            insideSetId,
            strip
          );
          markContextTarget(strip);
          return;
        }
        const row = rowAt(t);
        if (!row) return;
        ev.preventDefault();
        showRowMenu(ev.clientX, ev.clientY, parseInt(row.dataset.row, 10), parseFloat(row.dataset.value), laneIdFromX(row, ev.clientX));
        markContextTarget(row);
      });

      axisEl2.addEventListener("dragstart", (ev) => {
        if (ev.target.closest && ev.target.closest(".event-set-fold")) return;
        const card = cardAt(ev.target);
        if (!card) return;
        if (card.dataset.eventSetId) onEventSetDragStart(ev, card);
        else onEventDragStart(ev, card);
      });
      axisEl2.addEventListener("dragend", (ev) => {
        const card = cardAt(ev.target);
        if (!card) return;
        if (card.dataset.eventSetId) onEventSetDragEnd(ev, card);
        else onEventDragEnd(ev, card);
      });
      axisEl2.addEventListener("dragover", (ev) => {
        const t = ev.target;
        // 拖拽时的位置提示：和悬停一样显示落点「#N・[线路代码]」
        if (dragDataOf(ev)) showAxisPosTag(axisLabelAt(t, ev.clientX), ev.clientX, ev.clientY);
        if (dragSetId) {
          ev.preventDefault();
          const strip = stripAt(t);
          if (strip) {
            strip.classList.add("drop-target");
            return;
          }
          const row = rowAt(t);
          if (row) {
            row.classList.add("drop-target");
            return;
          }
          const band = bandAt(t);
          if (band) band.classList.add("drop-target");
          return;
        }
        if (bandAt(t)) return; // 章节带自己有监听
        const setBlock = setBlockAt(t);
        if (setBlock) {
          const data = dragDataOf(ev);
          if (data && data.type === "event") {
            ev.preventDefault();
            setBlock.classList.add("drop-target");
          }
          return;
        }
        const card = cardAt(t);
        if (card) {
          if (!mergeSelectMode) onEventDragOver(ev, card);
          return;
        }
        const data = dragDataOf(ev);
        if (!data || data.type !== "event") return;
        ev.preventDefault();
        const strip = stripAt(t);
        if (strip) {
          strip.classList.add("drop-target");
          return;
        }
        const row = rowAt(t);
        if (row) {
          row.classList.add("drop-target");
          updateGroupGhost(row, ev.clientX, ev.shiftKey);
        }
      });
      axisEl2.addEventListener("dragleave", (ev) => {
        const t = ev.target;
        const card = cardAt(t);
        if (card) card.classList.remove("drop-target", "set-insert-before", "set-insert-after");
        const setBlock = setBlockAt(t);
        if (setBlock) setBlock.classList.remove("drop-target");
        if (bandAt(t)) return;
        const strip = stripAt(t);
        if (strip) strip.classList.remove("drop-target");
        const row = rowAt(t);
        if (row) row.classList.remove("drop-target");
      });
      // 落到卡片 / 插入条 / 时间行
      axisEl2.addEventListener("drop", (ev) => {
        const t = ev.target;
        if (dragSetId) {
          ev.preventDefault();
          ev.stopPropagation();
          const setId = dragSetId;
          dragSetId = null;
          clearDropTargets();
          let targetStory = null;
          let targetChapterId = null;
          let targetSectionId = null;
          const strip = stripAt(t);
          if (strip) {
            targetStory = insertValueAt(parseInt(strip.dataset.insert, 10));
            // 拖到章 / 节线那一摞「表头」缝里：整集并进这条线所属的章 / 节
            if (strip.dataset.insertBefore && (strip.dataset.chapterId || strip.dataset.sectionId)) {
              targetChapterId = strip.dataset.chapterId || "";
              targetSectionId = strip.dataset.sectionId || "";
            }
          } else {
            const band = bandAt(t);
            if (band) {
              const sr = band.dataset.sectionId ? getSection(band.dataset.sectionId) : null;
              targetChapterId = sr ? sr.chapter.id : band.dataset.chapterId || "";
              targetSectionId = sr ? sr.section.id : "";
              if (band.dataset.row !== "" && band.dataset.row != null) {
                targetStory = insertValueAt(parseInt(band.dataset.row, 10) - 1);
              } else if (band.dataset.anchor !== "" && band.dataset.anchor != null) {
                // 空章 / 空节在轴上就是一条线，不分上下：整集落到这条线下面、
                // 并进这个空章 / 空节（线会自动移到集合上方）。
                const anchor = Number(band.dataset.anchor);
                let idx = evaxisValues.findIndex((v) => v >= anchor);
                if (idx < 0) idx = evaxisValues.length;
                targetStory = insertValueAt(idx - 1);
              }
            } else {
              const row = rowAt(t);
              if (row) targetStory = insertValueAt(parseInt(row.dataset.row, 10) - 1);
              else {
                const card = cardAt(t);
                if (card && !card.dataset.eventSetId && card.dataset.eventId) {
                  const targetEv = getEvent(card.dataset.eventId);
                  if (targetEv) {
                    const r = evaxisValues.indexOf(targetEv.storyIndex || 0);
                    targetStory = insertValueAt(r - 1);
                  }
                }
              }
            }
          }
          if (Number.isFinite(targetStory)) moveEventSetToStory(setId, targetStory, targetChapterId, targetSectionId);
          return;
        }
        if (bandAt(t)) return; // 章节带自己有监听
        const setBlock = setBlockAt(t);
        if (setBlock) {
          setBlock.classList.remove("drop-target");
          const data = dragDataOf(ev);
          const dragged = data && data.type === "event" ? getEvent(data.id) : null;
          const set = getEventSet(setBlock.dataset.eventSetId);
          if (!dragged || !set) return;
          // 已经在这个事件集里：横向/纵向拖动继续走普通行 / 线路落点，不要把「并入集合」当成落点逻辑。
          if (eventSetIdForEvent(dragged) !== set.id) {
            ev.preventDefault();
            ev.stopPropagation();
            dragState = null;
            joinDraggedIntoSet(dragged, set.id, laneIdFromX(setBlock.closest(".evaxis-grid"), ev.clientX), ev.shiftKey);
            return;
          }
        }
        const card = cardAt(t);
        if (card) {
          onEventDrop(ev, card);
          return;
        }
        const data = dragDataOf(ev);
        if (!data || data.type !== "event") return;
        const strip = stripAt(t);
        if (strip) {
          strip.classList.remove("drop-target");
          ev.preventDefault();
          ev.stopPropagation();
          dragState = null;
          const targetStory = insertValueAt(parseInt(strip.dataset.insert, 10));
          const laneId = laneIdFromX(strip.closest(".evaxis-grid"), ev.clientX);
          const groupIds = dragGroupIds ? dragGroupIds.ids.slice() : [];
          if (applyGroupMove(targetStory, laneId, ev.shiftKey)) {
            avoidLaneCollision(groupIds);
            saveState();
            scheduleDropRender();
            renderMergeSelectBar();
            return;
          }
          const e = getEvent(data.id);
          if (!e) return;
          // 拖到集合框内的上 / 下缝隙：并入该集合，成为第一个 / 最后一个成员。
          // （框外的缝隙走普通落点逻辑，不并入集合。）
          if (strip.dataset.setInsideId) {
            const sid = strip.dataset.setInsideId;
            const set = getEventSet(sid);
            const curSetId = eventSetIdForEvent(e);
            if (set && eventSetMembers(sid).length) {
              if (curSetId === sid) {
                // 本来就在这个集合里：只挪位置（成为第一个 / 最后一个）。
                e.storyIndex = targetStory;
                joinEventSetByPosition(e, sid, eventSetLeftLineId(sid));
                pendingUndoLabel = `调整事件「${e.title}」在集合里的位置`;
                saveState();
                scheduleDropRender();
                return;
              }
              if (!curSetId) {
                e.storyIndex = targetStory;
                if (joinDraggedIntoSet(e, sid, laneId, ev.shiftKey)) return;
              }
            }
          }
          // 拖到同一事件集两个成员行之间的缝隙：直接并入事件集，并插到下一行成员前面。
          const targetSetCard = findNextSetMemberCardAcrossInsert(strip);
          if (targetSetCard) {
            const setId = eventSetIdForEvent(getEvent(targetSetCard.dataset.eventId));
            const rect = targetSetCard.getBoundingClientRect();
            if (
              setId &&
              dropEventIntoSetBetween(data.id, targetSetCard, { clientY: rect.top + 1 }, {
                setId,
                lineId: eventSetLeftLineId(setId),
              }, laneId, ev.shiftKey)
            )
              return;
          }
          if (strip.dataset.insertBefore) {
            // 章 / 节线下面那一摞「表头缝」：拖到这里＝在这条线下面插一条新行，
            // 并把归属钉在这条线所属的章 / 节上（见下面那段说明）。
            const secId = strip.dataset.sectionId || "";
            const chId = strip.dataset.chapterId || "";
            /* 拖到「章 / 节线下面那条缝」：在线上方那条缝和线下面那条缝之间，
               下面这条缝属于这一章 / 这一节（章头＝未分节）。所以这里**插一条新行**，
               并把归属钉在这条线所属的章 / 节上——这样事件才会真的落在两条线之间，
               而不是被算成上一章、把上一章的章线画出两条。
               （想把事件并进某一章 / 节而不动行号，拖到那条分界线上即可。） */
            const detached = detachEventFromSetIfOutside(e, targetStory);
            pendingUndoLabel = detached ? `移出事件集并移动：「${e.title}」` : `插入事件：「${e.title}」`;
            e.storyIndex = targetStory;
            applyLaneChange(e, laneId, ev.shiftKey);
            if (chId || secId) {
              // 章 / 节线缝（含紧挨集合的那条）：插到这里就归这条线下的章 / 节，
              // 不要让「按最近行归章」把它再弹回线上去。
              const wasSec = e.sectionId || "";
              if (chId) e.chapterId = chId;
              e.sectionId = secId;
              e.sourcePinned = true;
              // 事件集不能跨节：换了节就自动脱离原来的集合（事件本身留在原地）
              const inSet2 = eventSetIdForEvent(e);
              if (inSet2 && wasSec !== secId) removeEventFromSet(e, inSet2, true);
              showToast(`「${e.title}」已跟着落到「${chapterNameOf(e) || "未分章"}」`);
            } else if (syncChaptersForMoved([e])) {
              showToast(`「${e.title}」已跟着落到「${chapterNameOf(e) || "未分章"}」`);
            }
            // 插到两行之间（取中点）：落点定下来后归整回连续整数
            normalizeStoryIndexesIfFractional();
            saveState();
            scheduleDropRender();
            return;
          }
          const detached = detachEventFromSetIfOutside(e, targetStory);
          pendingUndoLabel = detached ? `移出事件集并移动：「${e.title}」` : `插入事件：「${e.title}」`;
          e.storyIndex = targetStory;
          applyLaneChange(e, laneId, ev.shiftKey);
          // 跟“上一个可见行”同 storyIndex 后，若和同行同线路的事件撞在一起，就挪到下一行
          avoidLaneCollision([e.id]);
          if (strip.dataset.chapterId) {
            // 落在「两行之间的缝」里：归属跟上面那一行 —— 章线在缝下面时，
            // 别让它被「按最近行归章」弹到下一章去（和这里新建事件的规则保持一致）
            e.chapterId = strip.dataset.chapterId;
            e.sectionId = strip.dataset.sectionId || "";
            e.sourcePinned = true;
            showToast(`「${e.title}」已跟着落到「${chapterNameOf(e) || "未分章"}」`);
          } else if (syncChaptersForMoved([e])) {
            showToast(`「${e.title}」已跟着落到「${chapterNameOf(e) || "未分章"}」`);
          }
          // 插到两行之间（取中点）：落点定下来后归整回连续整数
          normalizeStoryIndexesIfFractional();
          saveState();
          scheduleDropRender();
          return;
        }
        const row = rowAt(t);
        if (!row) return;
        row.classList.remove("drop-target");
        ev.preventDefault();
        ev.stopPropagation();
        dragState = null;
        const targetStory = parseFloat(row.dataset.value);
        const laneId = laneIdFromX(row, ev.clientX);
        // 整组移动：上下改时间点，左右跨线路
        const groupIds = dragGroupIds ? dragGroupIds.ids.slice() : [];
        if (applyGroupMove(targetStory, laneId, ev.shiftKey)) {
          avoidLaneCollision(groupIds);
          saveState();
          scheduleDropRender();
          renderMergeSelectBar();
          return;
        }
        const e = getEvent(data.id);
        if (!e) return;
        // 拖到折叠事件集所占的这一行（不一定是卡片本身）：也按并入事件集处理。
        const rowSetCard = row.querySelector(".event-set-card[data-event-set-id]");
        if (rowSetCard) {
          const setId = rowSetCard.dataset.eventSetId;
          const set = getEventSet(setId);
          if (set && eventSetIdForEvent(e) !== set.id) {
            joinDraggedIntoSet(e, set.id, laneId, ev.shiftKey);
            return;
          }
        }
        // 展开后的事件集：成员卡占一行，落在这一行的空白处也应按并入事件集处理，且保持原线路不变。
        const rowEventCard = row.querySelector(".event-card[data-event-id]");
        if (rowEventCard) {
          const rowEvent = getEvent(rowEventCard.dataset.eventId);
          const rowSetId = rowEvent && eventSetIdForEvent(rowEvent);
          if (
            rowSetId &&
            eventSetIdForEvent(e) !== rowSetId &&
            eventSetIsExpanded(rowSetId, eventSetLeftLineId(rowSetId))
          ) {
            joinDraggedIntoSet(e, rowSetId, laneId, ev.shiftKey);
            return;
          }
        }
        // 只改它自己的时间行与线路：其它块的位置完全不动
        // （原位置如果整行空出来，渲染时会自动消失，下面的行同步上移）
        const detached = detachEventFromSetIfOutside(e, targetStory);
        pendingUndoLabel = detached
          ? `移出事件集并移动：「${e.title}」`
          : laneId && !linesOf(e).includes(laneId)
            ? `移动并换线：「${e.title}」`
            : `移动事件：「${e.title}」`;
        const movedRow = (e.storyIndex || 0) !== targetStory;
        e.storyIndex = targetStory;
        applyLaneChange(e, laneId, ev.shiftKey);
        // 落点这一格如果已经有别的卡片（线路重叠），把这张挪到下一行，别两张挤在一起
        avoidLaneCollision([e.id]);
        // 只是横向换线（时间行没变）时，绝对不能重新归章，否则会改掉它和章节线的相对位置。
        if (movedRow && syncChaptersForMoved([e])) {
          showToast(`「${e.title}」已跟着落到「${chapterNameOf(e) || "未分章"}」`);
        }
        saveState();
        scheduleDropRender();
      });
    }
    // 线路表头：双击打开线路设置（名字 / 颜色 / 类型…），右键快捷菜单
    $$("#timeline .lane-head[data-line-id]").forEach((head) => {
      const lid = head.dataset.lineId;
      head.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openLineModal(lid);
      });
      head.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showLineQuickMenu(ev.clientX, ev.clientY, lid, { short: true });
        markContextTarget(head);
      });
      bindLineDrag(head, (x) => x.dataset.lineId, "x");
    });
    // 章 / 节分隔带：点击折叠；把事件拖到带上 = 改归属
    $$("#timeline .evaxis-band").forEach((band) => {
      band.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, band.dataset.chapterId, band.dataset.sectionId);
        markContextTarget(band);
      });
      band.addEventListener("click", () => {
        if (band.__justDragged) return;
        // 拖完章/节带后紧接着的那一下 click（尤其松手时指针还在带上）不折叠
        if (Date.now() - matrixBandDragStamp < 350) return;
        if (band.dataset.chapterId !== undefined) {
          const c = getChapter(band.dataset.chapterId);
          if (c) c.collapsed = !c.collapsed;
        } else if (band.dataset.sectionId) {
          const sr = getSection(band.dataset.sectionId);
          if (sr) sr.section.collapsed = !sr.section.collapsed;
        }
        saveState();
        renderChapterRail();
        renderTimeline();
        renderMatrix();
      });
      /* 把事件拖到章 / 节分界线本身上（含空章 / 空节）：
         按事件原本在线的哪一侧，算落进那一侧的缝里——
         · 原本在线**上面** → 相当于拖到「线上方那条缝」：成为上一章 / 上一节的最后一行；
         · 原本在线**下面** → 相当于拖到「线下方那条缝」：成为这一章 / 这一节的第一行（章头＝未分节）。
         这样线本身就是一个「贴着线放」的落点，不会把事件挪到线对面去。 */
      band.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || data.type !== "event") return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        band.classList.add("drop-target");
      });
      band.addEventListener("dragleave", () => band.classList.remove("drop-target"));
      band.addEventListener("drop", (ev) => {
        band.classList.remove("drop-target");
        const data = dragDataOf(ev);
        if (!data || data.type !== "event") return;
        ev.preventDefault();
        ev.stopPropagation();
        dragState = null;
        const e = getEvent(data.id);
        if (!e) return;
        const sr = band.dataset.sectionId ? getSection(band.dataset.sectionId) : null;
        let chapterId = sr ? sr.chapter.id : band.dataset.chapterId || "";
        let sectionId = sr ? sr.section.id : "";
        if (!chapterId && !sectionId) return;
        // 这条线在事件轴上的边界行号（画出来的）：非空章 / 节看 data-row，空章 / 空节看锚点
        const rowAttr = band.dataset.row;
        const boundaryIdx =
          rowAttr !== "" && rowAttr != null
            ? parseInt(rowAttr, 10)
            : band.dataset.anchor !== "" && band.dataset.anchor != null
              ? virtualInsertIndexFor(Number(band.dataset.anchor)) + 1
              : NaN;
        const cardEl = $(`#timeline .event-card[data-event-id="${e.id}"]`);
        const rowEl = cardEl ? cardEl.closest(".evaxis-row") : null;
        const evRowIdx = rowEl ? parseInt(rowEl.dataset.row, 10) : NaN;
        const fromAbove = Number.isFinite(boundaryIdx) && Number.isFinite(evRowIdx) && evRowIdx < boundaryIdx;
        if (fromAbove) {
          // 线上方那条缝属于上一行那一章 / 那一节（它就是线上方那条缝本身）
          const upStrip = band.previousElementSibling;
          if (upStrip && upStrip.classList && upStrip.classList.contains("evaxis-insert")) {
            const upCh = upStrip.dataset.chapterId || "";
            const upSec = upStrip.dataset.sectionId || "";
            if (upCh || upSec) {
              chapterId = upCh;
              sectionId = upSec;
            }
          }
        }
        const targetName = sectionId
          ? ((getSection(sectionId) || {}).section || {}).title || ""
          : (getChapter(chapterId) || {}).title || "";
        // 先把行挪到这条线旁边（线上面 / 下面那一侧的缝），再钉归属
        if (Number.isFinite(boundaryIdx)) {
          // boundaryIdx 是「线下方那条缝」的边界行号（0 基，等于这条线上面那几行）
          // insertValueAt(-1) 会自动落到最开头，所以这里不要再钳到 0（否则最上面那条线会往下一行）
          const targetStory = insertValueAt(boundaryIdx - 1);
          detachEventFromSetIfOutside(e, targetStory);
          e.storyIndex = targetStory;
        }
        const inSet = eventSetIdForEvent(e);
        const secChanged = (e.sectionId || "") !== sectionId;
        if (chapterId) e.chapterId = chapterId;
        e.sectionId = sectionId;
        e.sourcePinned = true;
        if (inSet && secChanged) removeEventFromSet(e, inSet, true);
        pendingUndoLabel = `把事件「${e.title}」并入「${targetName}」`;
        // 落到线旁边那条缝＝插到两行之间（取中点）：顺手归整回连续整数
        normalizeStoryIndexesIfFractional();
        saveState();
        renderChapterRail();
        renderTimeline();
        renderMatrix();
        showToast(`已把「${e.title}」并入「${targetName}」`);
      });
    });
  }

  function laneIdFromX(grid, x) {
    if (!grid) return null;
    // 调用方可能传的是整行（.evaxis-row）：列宽记在它所属的 .evaxis-grid 上
    const host = grid.classList && grid.classList.contains("evaxis-grid") ? grid : grid.closest(".evaxis-grid") || grid;
    const rect = grid.getBoundingClientRect();
    const lanes = lineFilterLanes();
    const ws = String(host.dataset.laneWidths || "")
      .split(",")
      .map((v) => Number(v))
      .filter((v) => v > 0);
    if (!ws.length || !lanes.length) return lanes[0] ? lanes[0].id : null;
    const px = (x - rect.left) / uiZoomScale(grid) - ROW_LABEL_W;
    let acc = 0;
    for (let i = 0; i < ws.length; i++) {
      acc += ws[i];
      if (px < acc) return lanes[i] ? lanes[i].id : null;
    }
    return lanes[lanes.length - 1].id; // 落在最右边的「＋」列里＝算最后一条线路
  }

  // 整组拖动时，实时在跟随鼠标的提示里显示会落到哪条线路
  function updateGroupGhost(row, x, shift) {
    if (!dragGroupIds || dragGroupIds.ids.length < 2) return;
    const g = $("#drag-ghost");
    if (!g || g.hidden) return;
    const lane = getLine(laneIdFromX(row, x));
    g.textContent = `整组 ${dragGroupIds.ids.length} 个事件 → ${lane ? lineLabel(lane) : "原线路"}${shift ? "（追加线路）" : ""}`;
  }

  function removeCharFromEvent(eventId, charId) {
    const e = getEvent(eventId);
    if (!e) return;
    e.characterIds = (e.characterIds || []).filter((id) => id !== charId);
    saveState();
    renderTimeline();
    renderMatrix();
  }

