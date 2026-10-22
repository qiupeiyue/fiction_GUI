  /* ---- 批量改所属线路（勾选线路 → 应用到选中的全部事件） ---- */
  let selLinesOpen = false;

  function hideSelLinesPop() {
    selLinesOpen = false;
    const pop = $("#sel-lines-pop");
    if (pop) pop.hidden = true;
    const btn = $("#sel-lines-btn");
    if (btn) btn.classList.remove("btn-primary");
  }

  function showSelLinesPop() {
    const pop = $("#sel-lines-pop");
    if (!pop) return;
    renderSelLinesPop();
    pop.hidden = false;
    selLinesOpen = true;
    pop.tabIndex = -1;
    try {
      pop.focus({ preventScroll: true });
    } catch (err) {
      /* 忽略个别环境不支持 focus 参数 */
    }
    const btn = $("#sel-lines-btn");
    if (btn) btn.classList.add("btn-primary");
  }

  // 勾选状态＝「这批事件是不是都在这条线路上」
  function renderSelLinesPop() {
    const list = $("#sel-lines-list");
    if (!list) return;
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    const allHave = (lid) => ids.length > 0 && ids.every((id) => linesOf(getEvent(id)).includes(lid));
    const lines = state.lines || [];
    list.innerHTML = lines.length
      ? lines
          .map(
            (l) =>
              `<label class="sel-line-item" title="勾上＝把选中的事件都放到这条线路上"><input type="checkbox" data-line="${esc(
                l.id
              )}"${allHave(l.id) ? " checked" : ""} /><span class="dot" style="background:${esc(
                l.color
              )}"></span><span class="sel-line-name">${esc(l.code || "?")} ${esc(lineDisplayName(l))}</span><em>${esc(
                l.kind || ""
              )}</em></label>`
          )
          .join("")
      : `<span class="empty-tip small">还没有线路，先到左侧「线路」里新建一条。</span>`;
    const title = $("#sel-lines-title");
    if (title)
      title.textContent = ids.length
        ? `这 ${ids.length} 个事件的所属线路改为（勾几条就是几条）`
        : "先选中事件，再勾线路";
  }

  // 「全选」：第一次全部勾上；再点一次只保留第一条线路
  function toggleSelLinesAll() {
    const boxes = $$("#sel-lines-list input[type=checkbox]");
    if (!boxes.length) {
      showToast("这里还没有线路可以勾");
      return;
    }
    const allOn = boxes.every((b) => b.checked);
    boxes.forEach((b, i) => {
      b.checked = allOn ? i === 0 : true;
    });
    showToast(allOn ? "只保留第一条线路" : `已全选 ${boxes.length} 条线路`);
  }

  function applySelLines() {
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      uiAlert("请先选中要改线路的事件。");
      return;
    }
    const picked = $$("#sel-lines-list input[type=checkbox]:checked")
      .map((cb) => cb.dataset.line)
      .filter(Boolean);
    if (!picked.length) {
      uiAlert("至少要勾一条线路，否则这些事件就会不属于任何线路。");
      return;
    }
    const label = picked
      .map((id) => {
        const l = getLine(id);
        return l ? (l.code || "?") + " " + lineDisplayName(l) : id;
      })
      .join("、");
    pendingUndoLabel = `批量改所属线路：${ids.length} 个事件 → ${label}`;
    ids.forEach((id) => {
      const e = getEvent(id);
      if (!e) return;
      e.lineIds = picked.slice();
      delete e.lineId;
    });
    // 换线后和同一行里别的卡片共用线路 → 挪到下一行（章 / 节不变，别掉进下一章）
    avoidLaneCollision(ids);
    saveState();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderMergeSelectBar();
    hideSelLinesPop();
    showToast(`已把 ${ids.length} 个事件的所属线路设为：${label}`);
  }

  let mergeBarDeferTimer = null;

  // 事件轴多选：只切换卡片的选中样式 + 更新计数，不整屏重画。
  // 昂贵的按钮状态（并入事件集 / 上下移 / 章节下拉）等用户停一下再算，避免连点时卡顿。
  function syncTimelineSelection() {
    $$("#timeline .event-card[data-event-id]").forEach((card) => {
      const on = mergeSelectMode && mergeSelected.has(card.dataset.eventId);
      card.classList.toggle("merge-sel", on);
      card.classList.toggle("merge-sel-mode", mergeSelectMode);
    });
    const bar = $("#merge-select-bar");
    if (bar) bar.hidden = !mergeSelectMode;
    const opsBtn = $("#batch-ops-btn");
    if (opsBtn) {
      opsBtn.classList.toggle("btn-primary", mergeSelectMode && selectPurpose === "select");
      opsBtn.textContent = mergeSelectMode && selectPurpose === "select" ? "批量中…" : "批量";
    }
    updateMergeSelectCount();
    if (mergeBarDeferTimer) clearTimeout(mergeBarDeferTimer);
    mergeBarDeferTimer = setTimeout(() => {
      mergeBarDeferTimer = null;
      renderMergeSelectBar();
    }, 160);
  }

  function updateMergeSelectCount() {
    const bar = $("#merge-select-bar");
    const count = $("#merge-select-count");
    if (!bar || !count || !mergeSelectMode) return;
    const vis = new Set($$("#timeline .event-card[data-event-id]").map((c) => c.dataset.eventId));
    let visSel = 0;
    mergeSelected.forEach((id) => {
      if (vis.has(id)) visSel++;
    });
    const hidSel = mergeSelected.size - visSel;
    count.textContent = `已选 ${visSel} 个事件${
      hidSel ? `（另有 ${hidSel} 个被筛选藏起来，不参与批量）` : ""
    }`;
  }

  // 二维事件图多选：只切换行头的选中样式，不整张网格重画
  function syncMatrixSelection() {
    $$("#matrix .m-row-hdr[data-event-id]").forEach((h) => {
      h.classList.toggle("row-sel", mergeSelected.has(h.dataset.eventId));
    });
  }

  function renderMergeSelectBar() {
    const bar = $("#merge-select-bar");
    if (!bar) return;
    bar.hidden = !mergeSelectMode;
    // 「所属线路」小面板：随选择实时刷新；退出多选时收起
    if (!mergeSelectMode) hideSelLinesPop();
    else if (selLinesOpen) renderSelLinesPop();
    // 「批量」按钮的按下状态（手动合并 / 批量移动 / 批量删除三合一）
    const opsBtn = $("#batch-ops-btn");
    if (opsBtn) {
      opsBtn.classList.toggle("btn-primary", mergeSelectMode && selectPurpose === "select");
      opsBtn.textContent = mergeSelectMode && selectPurpose === "select" ? "批量中…" : "批量";
    }
    if (!mergeSelectMode) return;
    const visEvSet = new Set(shownEventIds());
    const visEvSel = Array.from(mergeSelected).filter((id) => visEvSet.has(id)).length;
    const hidEvSel = mergeSelected.size - visEvSel;
    const evHead = `已选 ${visEvSel} 个事件${
      hidEvSel ? `（另有 ${hidEvSel} 个被筛选藏起来，不参与批量）` : ""
    }`;
    // 提示条只留计数；快捷键、拖动用法等都放进整条的悬浮说明里
    $("#merge-select-count").textContent = evHead;
    bar.title =
      uiTextFor("Shift+点＝连选（同一端点再 Shift 点＝取消这一段）｜Ctrl+Shift+点＝追加连选｜Ctrl+点＝加减选｜Ctrl+A＝全选（再按＝取消）｜Delete＝删除｜Esc＝退出。") +
      "\n" +
      uiTextFor("按住任意选中卡片拖动＝整组移动（上下改时间行、左右换线路）。") +
      "\n" +
      uiTextFor("批量只对当前显示出来的事件生效。");
    const gMerge = $("#sel-actions-merge");
    const gChapter = $("#sel-actions-chapter");
    const gMove = $("#sel-actions-move");
    const gDelete = $("#sel-actions-delete");
    // 四个操作组一直都在：选好事件后想合并就合并、想移动就移动，不用先切到某个「模式」
    [gMerge, gChapter, gMove, gDelete].forEach((g) => {
      if (g) g.hidden = false;
    });
    const addSetBtn = $("#sel-add-event-set");
    if (addSetBtn) {
      const canAddSet = canAddSelectedToEventSet();
      addSetBtn.disabled = !canAddSet;
      addSetBtn.classList.toggle("is-disabled", !canAddSet);
      addSetBtn.setAttribute("aria-disabled", String(!canAddSet));
      addSetBtn.title = canAddSet
        ? "把选中的同章同节、位置相邻的事件并入事件集（可跨线路）"
        : "事件集：至少两个同章同节、位置相邻的事件（可跨线路）";
    }
    {
      const up = $("#sel-move-up");
      const down = $("#sel-move-down");
      if (up) up.disabled = !canMoveSelected(-1);
      if (down) down.disabled = !canMoveSelected(1);
    }
    const sel = $("#merge-select-chapter");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML =
        `<option value="">选择要归入的章…</option>` +
        (state.chapters || []).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("") +
        `<option value="__new__">＋ 新建…</option>`;
      if (cur && (cur === "__new__" || getChapter(cur))) sel.value = cur;
    }
    renderSectionAssignOptions();
  }

  // 「归入章节」的节下拉：跟在章后面联动；该章没有节时只有「未分节」。
  function renderSectionAssignOptions() {
    const sel = $("#merge-select-chapter");
    const secSel = $("#merge-select-section");
    if (!secSel) return;
    const cid = sel ? sel.value : "";
    const c = cid && cid !== "__new__" ? getChapter(cid) : null;
    const sections = c ? c.sections || [] : [];
    const cur = secSel.value;
    secSel.innerHTML =
      `<option value="">未分节</option>` +
      sections.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("");
    if (cur === "" || (cur && sections.some((s) => s.id === cur))) secSel.value = cur;
    else secSel.value = "";
  }

  // 把选中的事件批量归入某一章（分章最省事的做法）
  async function assignSelectedToChapter() {
    const droppedEv = pruneSelectionToVisible("event");
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      uiAlert(
        droppedEv
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先点选要归入章节的事件。"
      );
      return;
    }
    let cid = $("#merge-select-chapter").value;
    if (!cid) {
      uiAlert("请先在右边选择要归入的章（或选「＋ 新建…」）。");
      return;
    }
    if (cid === "__new__") {
      const t = await uiPrompt("新章节的标题？", chapterDefaultTitle((state.chapters || []).length + 1));
      if (t === null) return;
      cid = newChapter(t.trim() || "新章节").id;
    }
    const secSel = $("#merge-select-section");
    const rawSid = secSel ? secSel.value : "";
    const sid = rawSid && getSection(rawSid) ? rawSid : "";
    let n = 0;
    ids.forEach((id) => {
      const e = getEvent(id);
      if (!e) return;
      e.chapterId = cid;
      e.sectionId = sid;
      n++;
    });
    saveState();
    mergeSelectMode = false;
    mergeSelected.clear();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderMergeSelectBar();
  }

  function toggleMergeSelect() {
    // 「批量」：和用 Shift / Ctrl 点多选进入的状态完全一样（下面那条工具条里
    // 合并 / 归入章节 / 移动 / 所属线路 / 删除 全都在），再点一下退出。
    if (mergeSelectMode && selectPurpose === "select") {
      mergeSelectMode = false;
      mergeSelected.clear();
    } else {
      mergeSelectMode = true;
      selectPurpose = "select";
      mergeSelected.clear();
    }
    renderTimeline();
    renderMergeSelectBar();
  }

  // 章节栏入口：批量选择事件并归入章节
  function exitSelectMode() {
    mergeSelectMode = false;
    mergeSelected.clear();
    renderTimeline();
    renderMergeSelectBar();
  }

  // 右键菜单里的操作都是「只对这一个人物 / 事件 / 条目」生效的，
  // 所以多选状态下右键先退出多选：否则「已选 N 个」和菜单里的单项操作会互相打架。
  function exitSelectModesForContextMenu() {
    if (mergeSelectMode) exitSelectMode();
    if (batchMode) toggleBatchMode();
    if (entryBatchMode) toggleEntryBatch();
  }

  // 事件轴入口：选中多个事件后整体移动
  // 整组拖动：把选中集合按同一个位移搬到目标时间点
  function applyGroupMove(targetStory, laneId, appendLines) {
    if (!dragGroupIds || dragGroupIds.ids.length < 2) return false;
    const delta = targetStory - dragGroupIds.anchorStory;
    pendingUndoLabel = `整组移动 ${dragGroupIds.ids.length} 个事件`;
    dragGroupIds.ids.forEach((id) => {
      const e = getEvent(id);
      if (!e) return;
      const targetVal = (e.storyIndex || 0) + delta;
      if (delta) {
        detachEventFromSetIfOutside(e, targetVal);
        e.storyIndex = targetVal;
      }
      // 跨列拖动 = 整组换到另一条线路；同一列内只上下移动时不动原有线路
      applyLaneChange(e, laneId, appendLines);
    });
    dragGroupIds = null;
    // 整组按同一个位移搬 → 也可能落到小数行号上：归整回连续整数（相对间距/顺序不变）
    normalizeStoryIndexesIfFractional();
    return true;
  }

  // 事件轴入口：选中多个事件后一次删掉（可撤销）
  function batchCopyEvents() {
    const dropped = pruneSelectionToVisible("event");
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先选中要复制的事件。"
      );
      return;
    }
    const n = copyEvents(ids);
    if (n) showToast(`已复制 ${n} 个事件，放在原事件下方`);
  }

  async function deleteSelectedEvents() {
    const droppedEv = pruneSelectionToVisible("event");
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      uiAlert(
        droppedEv
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先点选要删除的事件。"
      );
      return;
    }
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel(ids.map((id) => getEvent(id)).filter(Boolean));
      if (!ok) return;
    }
    const set = new Set(ids);
    pendingUndoLabel = `批量删除 ${ids.length} 个事件`;
    state.events = state.events.filter((e) => !set.has(e.id));
    state.order = (state.order || []).filter((id) => !set.has(id));
    state.settings.entries.forEach((en) => {
      en.eventIds = (en.eventIds || []).filter((id) => !set.has(id));
    });
    mergeSelectMode = false;
    mergeSelected.clear();
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    refreshLineViews();
    renderChapterRail();
    renderEntries();
    renderStats();
    renderMergeSelectBar();
    showToast(`已删除 ${ids.length} 个事件，可用「撤销」还原`);
  }

  // 事件轴上的「行」：同一个 storyIndex 值算一行
  // 事件被拖到某一行之后，让它跟着「这一行属于哪一章 / 哪一节」走。
  // 否则会出现：事件落进了 Part.4 的行里，可它自己还挂在 Part.3 上——同一个章被拆成两段，看着就是章节交错。
  // excludeIds 是这次一起移动的事件（它们不参与「这一行属于哪一章」的投票）。
  function syncEventChapterToRow(e, excludeIds) {
    if (!e) return false;
    const ex = new Set(excludeIds || []);
    ex.add(e.id);
    const rows = axisRows();
    const cur = Number(e.storyIndex) || 0;
    const at = rows.findIndex((r) => (r.v || 0) === cur);
    const majority = (items, key) => {
      const cnt = new Map();
      items.forEach((x) => {
        if (ex.has(x.id)) return;
        const v = String(x[key] || '');
        if (!v) return;
        cnt.set(v, (cnt.get(v) || 0) + 1);
      });
      let best = '';
      let bestN = 0;
      cnt.forEach((num, v) => {
        if (num > bestN) { best = v; bestN = num; }
      });
      return best;
    };
    const order = [];
    if (at >= 0) order.push(rows[at]);
    for (let i = (at < 0 ? rows.length - 1 : at - 1); i >= 0; i--) order.push(rows[i]);
    for (let i = (at < 0 ? 0 : at + 1); i < rows.length; i++) order.push(rows[i]);
    let chId = '';
    let secId = '';
    for (const r of order) {
      const c = majority(r.items, 'chapterId');
      if (!c) continue;
      chId = c;
      secId = majority(r.items.filter((x) => String(x.chapterId || '') === c), 'sectionId');
      break;
    }
    if (!chId) return false;
    if (String(e.chapterId || '') === chId && String(e.sectionId || '') === secId) return false;
    e.chapterId = chId;
    e.sectionId = secId;
    return true;
  }

  // 移动之后：把这次动过的事件按新位置重新归章；返回改到的条数
  function syncChaptersForMoved(events, opts) {
    const list = (events || []).filter(Boolean);
    const keepEventSets = !!(opts && opts.keepEventSets);
    const ids = list.map((e) => e.id);
    // 移动事件时是先直接改 storyIndex、再到这里归章，此时还没有 saveState()，
    // orderedByStory / axisRows 的缓存仍是改动前的旧排序。不失效的话会把新插到
    // 行间的事件判到最末尾一章（章节交错）。这里按「当前内存状态」重新算一次。
    orderedByStoryCache.rev = -1;
    axisRowsCache.rev = -1;
    let changed = 0;
    list.forEach((e) => {
      const oldChapter = e.chapterId || "";
      if (syncEventChapterToRow(e, ids)) {
        changed++;
        // 事件一旦换到另一个章节，就不能继续留在原事件集里；否则会形成跨章节的事件集。
        if (!keepEventSets && (e.chapterId || "") !== oldChapter && e.eventSetAssign && Object.keys(e.eventSetAssign).length) {
          e.eventSetAssign = {};
        }
      }
    });
    return changed;
  }

  function chapterNameOf(e) {
    const c = e && e.chapterId ? getChapter(e.chapterId) : null;
    return c ? c.title : '';
  }

  // 用户手动改过章 / 节起始位置后，N:M 可能留下空洞或冲突。
  // 这里按「行」统一修补：同一行只能属于一个章 / 节，中间不能夹未分章 / 未分节，
  // 章 / 节的顺序也必须按章节栏里的顺序连续向前。
  function repairChapterContinuity() {
    const chapters = state.chapters || [];
    if (!chapters.length) return 0;
    const rows = axisRows();
    if (!rows.length) return 0;
    const chIdx = new Map(chapters.map((c, i) => [c.id, i]));
    const rowChapter = rows.map((row) => {
      const counts = new Map();
      (row.items || []).forEach((e) => {
        const id = e.chapterId && chIdx.has(e.chapterId) ? e.chapterId : "";
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      });
      let best = "";
      let bestN = 0;
      counts.forEach((n, id) => {
        if (n > bestN) {
          bestN = n;
          best = id;
        }
      });
      return best;
    });
    // 空洞：先用上一行补，再补开头连续的空行
    for (let i = 0; i < rowChapter.length; i++) if (!rowChapter[i] && i > 0) rowChapter[i] = rowChapter[i - 1];
    for (let i = rowChapter.length - 1; i >= 0; i--) {
      if (!rowChapter[i] && i < rowChapter.length - 1) rowChapter[i] = rowChapter[i + 1];
    }
    // 顺序修补：出现回退（A→B→A）时，把回退的行并回上一章，保证 N:M 连续。
    let cur = -1;
    for (let i = 0; i < rowChapter.length; i++) {
      let idx = rowChapter[i] && chIdx.has(rowChapter[i]) ? chIdx.get(rowChapter[i]) : -1;
      if (idx < 0) {
        if (cur >= 0) rowChapter[i] = chapters[cur].id;
        continue;
      }
      if (idx < cur) {
        rowChapter[i] = chapters[cur].id;
        idx = cur;
      }
      cur = idx;
    }
    let changed = 0;
    rows.forEach((row, i) => {
      const target = rowChapter[i] || "";
      (row.items || []).forEach((e) => {
        if ((e.chapterId || "") !== target) {
          e.chapterId = target;
          e.sectionId = "";
          if (e.eventSetAssign && Object.keys(e.eventSetAssign).length) e.eventSetAssign = {};
          changed++;
        }
      });
    });
    return changed;
  }

  function repairSectionContinuity(chapterId) {
    const chapter = chapterId ? getChapter(chapterId) : null;
    const chapters = chapter ? [chapter] : state.chapters || [];
    let changed = 0;
    chapters.forEach((c) => {
      const sections = c.sections || [];
      if (!sections.length) return;
      const secIdx = new Map(sections.map((s, i) => [s.id, i]));
      const rows = axisRows().filter((row) => (row.items || []).some((e) => (e.chapterId || "") === c.id));
      if (!rows.length) return;
      const rowSection = rows.map((row) => {
        const counts = new Map();
        (row.items || []).forEach((e) => {
          if ((e.chapterId || "") !== c.id) return;
          const id = e.sectionId && secIdx.has(e.sectionId) ? e.sectionId : "";
          if (id) counts.set(id, (counts.get(id) || 0) + 1);
        });
        let best = "";
        let bestN = 0;
        counts.forEach((n, id) => {
          if (n > bestN) {
            bestN = n;
            best = id;
          }
        });
        return best;
      });
      // 只在「第一个有节的区间」到「最后一个有节的区间」之间补洞：
      // 章首（第一节之前）和章尾（最后一节之后）的未分节保留，允许它们存在。
      let firstSec = -1;
      let lastSec = -1;
      for (let i = 0; i < rowSection.length; i++) {
        if (rowSection[i]) {
          if (firstSec < 0) firstSec = i;
          lastSec = i;
        }
      }
      if (firstSec >= 0) {
        for (let i = firstSec + 1; i < lastSec; i++) {
          if (!rowSection[i]) rowSection[i] = rowSection[i - 1] || "";
        }
      }
      let cur = -1;
      for (let i = 0; i < rowSection.length; i++) {
        let idx = rowSection[i] && secIdx.has(rowSection[i]) ? secIdx.get(rowSection[i]) : -1;
        if (idx < 0) {
          if (cur >= 0) rowSection[i] = sections[cur].id;
          continue;
        }
        if (idx < cur) {
          rowSection[i] = sections[cur].id;
          idx = cur;
        }
        cur = idx;
      }
      rows.forEach((row, i) => {
        const target = rowSection[i] || "";
        (row.items || []).forEach((e) => {
          if ((e.chapterId || "") !== c.id) return;
          if ((e.sectionId || "") !== target) {
            e.sectionId = target;
            changed++;
          }
        });
      });
    });
    return changed;
  }

  let axisRowsCache = { rev: -1, val: null };
  function axisRows() {
    if (axisRowsCache.rev === stateDataRev && axisRowsCache.val) return axisRowsCache.val;
    const rows = [];
    orderedByStory().forEach((e) => {
      const v = e.storyIndex || 0;
      const last = rows[rows.length - 1];
      if (last && last.v === v) last.items.push(e);
      else rows.push({ v, items: [e] });
    });
    axisRowsCache = { rev: stateDataRev, val: rows };
    return rows;
  }

  /* 事件行号 #N 的唯一来源：**全部事件**按故事顺序分出来的行（axisRows 本来就是全量的，
     不受线路筛选、检索条件、折叠影响）。# 是事件自己的属性，
     页面上显示的 #、右键菜单标题里的 #、事件信息里填 / 显示的那个 #、设置起始位置填的 #，
     一律走这里 —— 线上筛选只决定「画不画」，不改 #。 */
  function rowNoOfEvent(e) {
    if (!e) return 0;
    const rows = axisRows();
    for (let i = 0; i < rows.length; i++) {
      const items = rows[i].items || [];
      for (let k = 0; k < items.length; k++) {
        if (items[k].id === e.id) return i + 1;
      }
    }
    return 0;
  }
  // 第 n 行（#n）上的全部事件；n 越界返回 null
  function rowItemsAtRowNo(n) {
    const rows = axisRows();
    const row = rows[n - 1];
    return row ? row.items || [] : null;
  }

  // 选中集合覆盖到的行区间
  function selectedRowRange() {
    const rows = axisRows();
    const idxs = rows.map((r, i) => (r.items.some((e) => mergeSelected.has(e.id)) ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return null;
    return { gi: idxs[0], gj: idxs[idxs.length - 1], total: rows.length };
  }

  function canMoveSelected(dir) {
    const range = selectedRowRange();
    if (!range) return false;
    return dir < 0 ? range.gi > 0 : range.gj < range.total - 1;
  }

  // 选中的事件整体上移 / 下移一格（批量条上的「↑ 上移 / ↓ 下移」按钮走这里；快捷键已取消）。
  // 做法和「把卡片拖到相邻那一行的位置」是同一套：只改这些事件的故事时间值，
  // 值从相邻行「换过来」，别的行的值一个都不动（不整体重排成整数），
  // 这样章节线、事件集的相对位置不会被顺手挪走；同一行的多个事件始终待在一起。
  function moveSelectedEvents(dir) {
    // 只移动当前显示出来的事件，范围也按显示出来的那些算
    const droppedEv = pruneSelectionToVisible("event");
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      uiAlert(
        droppedEv
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先点选要移动的事件。"
      );
      return;
    }
    const rows = axisRows();
    const range = selectedRowRange();
    if (!range) return;
    const { gi, gj } = range;
    if (dir < 0 && gi === 0) {
      showToast("选中的事件已经在最上面了");
      return;
    }
    if (dir > 0 && gj >= rows.length - 1) {
      showToast("选中的事件已经在最下面了");
      return;
    }
    const rowVal = (k) => {
      const it = rows[k] && rows[k].items && rows[k].items[0];
      return it ? Number(it.storyIndex) || 0 : 0;
    };
    // 这次要挪动的「整块」＝这几行里的全部事件（不只是勾选的那几个）
    const blockEvents = [];
    for (let k = gi; k <= gj; k++) (rows[k].items || []).forEach((e) => blockEvents.push(e));
    // 值换位：被让位的那一行挪到块的另一头，块内每一行落到相邻那一行的位置上
    const moves = [];
    if (dir < 0) {
      for (let k = gi; k <= gj; k++) (rows[k].items || []).forEach((e) => moves.push([e, rowVal(k - 1)]));
      (rows[gi - 1].items || []).forEach((e) => moves.push([e, rowVal(gj)]));
    } else {
      for (let k = gi; k <= gj; k++) (rows[k].items || []).forEach((e) => moves.push([e, rowVal(k + 1)]));
      (rows[gj + 1].items || []).forEach((e) => moves.push([e, rowVal(gi)]));
    }
    pendingUndoLabel = `整体${dir < 0 ? "上移" : "下移"} ${ids.length} 个事件`;
    const touched = [];
    moves.forEach(([e, v]) => {
      if ((Number(e.storyIndex) || 0) === v) return;
      // 和拖拽一样：先判断要不要脱离事件集，再改故事时间值
      detachEventFromSetIfOutside(e, v);
      e.storyIndex = v;
      touched.push(e);
    });
    if (!touched.length) return;
    // 整块上移 / 下移之后：整块跟着落点所在的章节走（和拖拽一样，只看周围那些
    // 没被移动的事件），这样同一个章不会被拆成上下两段（否则就是章节交错）
    syncChaptersForMoved(blockEvents);
    state.order = orderedByStory().map((e) => e.id);
    saveState();
    renderTimeline();
    renderChapterRail();
    renderMatrix();
    renderMergeSelectBar();
  }

  function selectAllVisibleEvents() {
    // 只作用于当前显示出来的事件（线路 / 章节 / 人物 / 叙事 / 关键词筛选之后）
    const ids = shownEventIds();
    if (!ids.length) {
      showToast("当前没有显示出来的事件");
      return;
    }
    const allSelected = ids.every((id) => mergeSelected.has(id));
    ids.forEach((id) => {
      if (allSelected) mergeSelected.delete(id);
      else mergeSelected.add(id);
    });
    renderTimeline();
    renderMergeSelectBar();
    showToast(allSelected ? `已取消全选（当前显示的 ${ids.length} 个）` : `已全选当前显示的 ${ids.length} 个事件`);
  }

  async function applyManualEventMerge() {
    const droppedEv = pruneSelectionToVisible("event");
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (ids.length < 2) {
      uiAlert(
        droppedEv && mergeSelected.size < 2
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请至少点选两个事件再合并。"
      );
      return;
    }
    const members = ids.map((id) => getEvent(id)).filter(Boolean);
    members.sort((a, b) => eventScore(b) - eventScore(a));
    const keep = members[0];
    const drops = members.slice(1);
    if (!(await uiConfirm(`把「${drops.map((m) => m.title).join("」、「")}」合并进「${keep.title}」？\n\n人物、线路、起因 / 经过 / 结果会一并合并，可撤销。`))) return;
    pendingUndoLabel = `合并事件：${drops.map((m) => "「" + m.title + "」").join("、")} → 「${keep.title}」`;
    mergeUndoSnapshot = snapshotCharData();
    try {
      await mergeEventsIntoWithNovel(
        keep.id,
        drops.map((m) => m.id)
      );
    } catch (e) {
      mergeUndoSnapshot = null;
      showToast(String((e && e.message) || e));
      return;
    }
    saveState();
    mergeSelectMode = false;
    mergeSelected.clear();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    renderEntries();
    renderLineFilters();
    renderMergeSelectBar();
    showMergeUndoBar("已合并 1 组事件");
  }

  function mergeDuplicateEvents() {
    const clusters = findDuplicateEventClusters();
    if (!clusters.length) {
      uiAlert("没有找到标题相似的重复事件。");
      return;
    }
    openMergeDialog(
      "确认合并事件",
      clusters.map((idList) => {
        const members = idList.map((id) => getEvent(id)).filter(Boolean);
        members.sort((a, b) => eventScore(b) - eventScore(a));
        return makeSwapItem(members, 0, (k, ds, i, ctx) => {
          const picks = ctx.picks(ctx.ordered, (m) => m.title, (m) => (m.id === k.id ? "主体（字段以它为先）" : "参与合并"));
          return {
            label: "",
            picks,
            reason: `${uiTextFor("同一线路里相邻、标题相近")} · ${uiMergeTail(ds.length, { onlyOne: true })}`,
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              return {
                reason:
                  inc.length === 0
                    ? uiTextFor("只剩一条，这次不合并")
                    : `${uiTextFor("同一线路里相邻、标题相近")} · ${uiMergeTail(inc.length, { kept: ds.length > inc.length })}`
              };
            },
            apply: () => mergeEventsIntoWithNovel(k.id, ds.filter(ctx.included).map((m) => m.id)),
          };
        });
      }),
      "事件"
    );
  }

  // 合并表的委托交互：整张表只挂一次监听，重画时不再给每个词条重新绑事件。
  function bindMergeListEvents(root) {
    if (!root || root.__mergeBound) return;
    root.__mergeBound = true;
    const closest = (t, sel) => (t && t.closest ? t.closest(sel) : null);
    const ctxOf = () => root.__mergeCtx;
    let pickClickTimer = null;
    let pickClickPayload = null;
    const cancelPendingPick = () => {
      if (pickClickTimer) clearTimeout(pickClickTimer);
      pickClickTimer = null;
      pickClickPayload = null;
    };
    root.__mergeCancelPending = cancelPendingPick;
    // 只换被点的那一栏，别因为一个勾选把整张表（可能上千个词条）全部重画。
    const refreshItem = (idx) => {
      const ctx = ctxOf();
      if (!ctx || !ctx.valid || !ctx.valid[idx]) return;
      const old = root.querySelector(`.merge-item[data-idx="${idx}"]`);
      const keepScroll = root.scrollTop;
      if (!old) {
        ctx.renderList();
        root.scrollTop = keepScroll;
        return;
      }
      const wrap = document.createElement("div");
      wrap.innerHTML = mergeItemHtml(ctx.valid[idx], idx);
      const next = wrap.firstElementChild;
      if (next) old.replaceWith(next);
      else ctx.renderList();
      root.scrollTop = keepScroll;
    };
    const applyPickToggle = (idx, key) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const it = ctx.valid[idx];
      if (!it || !it.members) return;
      ctx.stashChecks();
      const keepScroll = root.scrollTop;
      const subjectBefore = it.members[it.variantIndex || 0];
      const wasOff = it.excluded.has(key);
      if (wasOff) it.excluded.delete(key);
      else it.excluded.add(key);
      const litIdx = it.members
        .map((m, i) => (!m || it.excluded.has(m.id) ? -1 : i))
        .filter((i) => i >= 0);
      if (!litIdx.length) {
        // 全部划掉：这一组不合并
        it.checked = false;
        const clickedIdx = it.members.findIndex((m) => m.id === key);
        if (clickedIdx >= 0) it.variantIndex = clickedIdx;
      } else {
        it.checked = true;
        const subjIdx = it.variantIndex || 0;
        const subjLit = it.members[subjIdx] && !it.excluded.has(it.members[subjIdx].id);
        if (wasOff) {
          // 第一个点亮的词条默认成为主体
          if (!subjLit) it.variantIndex = it.members.findIndex((m) => m.id === key);
        } else if (subjectBefore && subjectBefore.id === key) {
          // 关掉的正好是主体：换成第一个还亮着的
          it.variantIndex = litIdx[0];
        }
      }
      refreshItem(idx);
      root.scrollTop = keepScroll;
    };
    const setGroupChecked = (idx, checked) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const it = ctx.valid[idx];
      if (!it || !it.members || !it.members.length) return;
      ctx.stashChecks();
      const keepScroll = root.scrollTop;
      if (checked) {
        const wasAllOff = it.members.every((m) => !m || it.excluded.has(m.id));
        it.excluded.clear();
        // 全部清空后一键全选：第一个词条当主体；
        // 如果只是部分点亮后恢复全选，则保留当前主体。
        if (wasAllOff || !it.members[it.variantIndex || 0]) it.variantIndex = 0;
      } else {
        // 「全不选」＝这一组所有词条（包括主体）一起划掉，表示这一组这次不合并
        it.members.forEach((m) => {
          if (m && m.id) it.excluded.add(m.id);
        });
      }
      it.checked = checked;
      refreshItem(idx);
      root.scrollTop = keepScroll;
    };
    // 单击和双击都从同一个词条上开始。不要在第一下 click 时立刻重画，
    // 否则第二下 click / dblclick 会落到已经被替换掉的旧节点上，导致“双击非主体没反应”。
    const schedulePickToggle = (idx, key) => {
      cancelPendingPick();
      pickClickPayload = { idx, key };
      pickClickTimer = setTimeout(() => {
        const p = pickClickPayload;
        cancelPendingPick();
        if (p) applyPickToggle(p.idx, p.key);
      }, 230);
    };

    root.addEventListener("click", (ev) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const pick = closest(ev.target, ".merge-pick");
      if (pick && root.contains(pick)) {
        ev.preventDefault();
        ev.stopPropagation();
        // 双击的第二下不再切换“参与 / 不参与”，把这一下留给 dblclick 设主体
        if (ev.detail > 1) {
          cancelPendingPick();
          return;
        }
        const idx = parseInt(pick.dataset.idx, 10);
        const key = pick.dataset.key;
        const it = ctx.valid[idx];
        if (!it || !it.members) return;
        schedulePickToggle(idx, key);
        return;
      }
      // 点整行 = 勾选 / 取消这一条（点里面的词条方块、名字、复选框本身不算）
      if (closest(ev.target, "input, select, button, .name-tip")) return;
      const item = closest(ev.target, ".merge-item");
      if (!item || !root.contains(item)) return;
      const idx = parseInt(item.dataset.idx, 10);
      const it = ctx.valid[idx];
      if (it) setGroupChecked(idx, !it.checked);
    });

    // 双击词条 = 把它设为主体（字段以它为先，词条名下拉框里排第一的也跟着换）
    root.addEventListener("dblclick", (ev) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const pick = closest(ev.target, ".merge-pick");
      if (!pick || !root.contains(pick)) return;
      cancelPendingPick(); // 双击时取消单击本来要做的“参与 / 不参与”切换
      ev.preventDefault();
      ev.stopPropagation();
      const it = ctx.valid[parseInt(pick.dataset.idx, 10)];
      if (!it || !it.members || typeof it.__buildVariant !== "function") return;
      const key = pick.dataset.key;
      const idx = it.members.findIndex((m) => m.id === key);
      if (idx < 0) return;
      const clickedLit = !it.excluded.has(key);
      // 双击一个被划掉的词条：先把它点亮；只要加上它以后至少有两个词条点亮，
      // 就允许双击换主体。只点亮一个时，它本来就应该是主体。
      if (!clickedLit) it.excluded.delete(key);
      const lit = it.members.filter((m) => m && !it.excluded.has(m.id));
      if (lit.length <= 1) {
        it.checked = lit.length > 0;
        it.variantIndex = lit.length ? it.members.findIndex((m) => m.id === lit[0].id) : idx;
        refreshItem(parseInt(pick.dataset.idx, 10));
        return;
      }
      if (idx === (it.variantIndex || 0) && clickedLit) return; // 已经是主体了
      ctx.stashChecks();
      const keepScroll = root.scrollTop;
      it.variantIndex = idx;
      it.excluded.delete(key); // 主体一定是参与合并的
      it.checked = true;
      refreshItem(parseInt(pick.dataset.idx, 10));
      root.scrollTop = keepScroll;
      showToast(`已把「${pick.textContent.replace(/^[☑☐]\s*/, "")}」设为主体`);
    });

    // 词条名下拉框：选主体名 / 其它写法，或选「自定义…」自己输入
    root.addEventListener("change", (ev) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const cb = closest(ev.target, ".merge-item-cb");
      if (cb && root.contains(cb)) {
        setGroupChecked(parseInt(cb.dataset.idx, 10), cb.checked);
        updateChecklistCount();
        return;
      }
      const sel = closest(ev.target, ".merge-name-sel");
      if (!sel || !root.contains(sel)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const idx = parseInt(sel.dataset.idx, 10);
      const it = ctx.valid[idx];
      if (!it) return;
      ctx.stashChecks();
      const keepScroll = root.scrollTop;
      if (sel.value === "__custom__") {
        it.nameMode = "custom";
        // 先把这个名字填进输入框（用户可以直接在上面改），这样显示的和实际用的不会对不上
        if (!String(it.nameOverride || "").trim()) {
          it.nameOverride = mergeItemFinalName(it) || mergeKeepName(it);
        }
      } else {
        it.nameMode = "name";
        it.nameOverride = sel.value === mergeKeepName(it) ? "" : sel.value;
      }
      refreshItem(idx);
      root.scrollTop = keepScroll;
      if (sel.value === "__custom__") {
        const inp = root.querySelector(`.merge-name-input[data-idx="${idx}"]`);
        if (inp) {
          inp.focus();
          if (typeof inp.select === "function") inp.select();
        }
      }
    });

    // 自定义词条名：边打边记（不重画，免得把输入打断），合并时就用这个值
    root.addEventListener("input", (ev) => {
      const ctx = ctxOf();
      if (!ctx) return;
      const inp = closest(ev.target, ".merge-name-input");
      if (!inp || !root.contains(inp)) return;
      const it = ctx.valid[parseInt(inp.dataset.idx, 10)];
      if (!it) return;
      it.nameMode = "custom";
      it.nameOverride = inp.value;
    });

    // 自定义输入框上按回车＝收起输入框（名字已经记下了）
    root.addEventListener("keydown", (ev) => {
      const inp = closest(ev.target, ".merge-name-input");
      if (!inp || !root.contains(inp) || ev.key !== "Enter") return;
      ev.preventDefault();
      ev.stopPropagation();
      inp.blur();
    });
  }

  // 同一组人物 / 条目可能在「身份合并记录」和「疑似重复」两条路径里各生成一次。
  // 合并弹窗入口按成员 ID 集合去重，避免同一组重复出现几栏。
  function mergeItemMemberKey(it) {
    const ids = Array.from(
      new Set(
        ((it && it.members) || [])
          .map((m) => (m && m.id) || "")
          .filter(Boolean)
      )
    ).sort();
    return ids.length ? ids.join("\u0001") : "";
  }

  // 合并栏之间只要有人物重叠，就是同一串“疑似同一人”的线索：
  // [艾米莉, 艾米莉·普利西法, 伊芙·普洛林] 与 [艾米莉, 艾米莉·普利西法]
  // 应该只留一栏。这里把有交集的组合并成成员并集，并保留成员最多的那一栏作为主体。
  function mergeItemInfosOverlap(ia, ib, membersA, membersB, appearancePossible) {
    for (let i = 0; i < ia.length; i++) {
      const x = ia[i];
      for (let j = 0; j < ib.length; j++) {
        const y = ib[j];
        if (!x.key || !y.key) continue;
        if (x.generic || y.generic || x.collective || y.collective) continue;
        if (x.key === y.key) return true;
        // 简称 / 全称 / 带称号：用和单人比较同一套严格规则，避免「诺莉」⊂「可诺莉芙」这种中间截取误判。
        if (samePersonRaw(x.key, y.key)) return true;
        // 中间多了一截的写法：卡芙瑞尔公主 ↔ 卡芙瑞尔·安德鲁奥公主
        let pre = 0;
        while (pre < x.key.length && pre < y.key.length && x.key.charAt(pre) === y.key.charAt(pre)) pre++;
        let suf = 0;
        while (
          suf < x.key.length - pre &&
          suf < y.key.length - pre &&
          x.key.charAt(x.key.length - 1 - suf) === y.key.charAt(y.key.length - 1 - suf)
        ) {
          suf++;
        }
        if (pre >= 2 && suf >= 2 && pre + suf >= Math.min(x.key.length, y.key.length) - 1) return true;
        // 错别字：名字长度相同、只差一两个同音 / 形近字
        if (x.pure && y.pure && x.clean.length === y.clean.length && typoSameName(x.clean, y.clean)) return true;
      }
    }
    if (appearancePossible) {
      for (const ma of membersA || []) {
        for (const mb of membersB || []) {
          if (charAppearanceMatch(ma, mb)) return true;
        }
      }
    }
    return false;
  }

  function combineOverlappingMergeItems(items) {
    const raw = (items || []).filter(Boolean);
    const indexed = [];
    raw.forEach((it, i) => {
      const key = mergeItemMemberKey(it);
      if (!key || !Array.isArray(it.members) || !it.members.length) {
        return;
      }
      const info = it.members.flatMap((m) => charCallInfo(m));
      indexed.push({
        it,
        i,
        ids: Array.from(new Set(it.members.map((m) => m && m.id).filter(Boolean))),
        info,
        appearancePossible: info.some(
          (x) => charLookGroups(x.raw).length > 0 || charFeatureWords(x.raw, CHAR_AGE_WORDS).length > 0
        ),
      });
    });
    if (indexed.length < 2) return raw;
    const parent = indexed.map((_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (x, y) => {
      const rx = find(x);
      const ry = find(y);
      if (rx !== ry) parent[ry] = rx;
    };
    for (let i = 0; i < indexed.length; i++) {
      const a = new Set(indexed[i].ids);
      for (let j = i + 1; j < indexed.length; j++) {
        const b = indexed[j].ids;
        if (
          b.some((id) => a.has(id)) ||
          mergeItemInfosOverlap(
            indexed[i].info,
            indexed[j].info,
            indexed[i].it.members,
            indexed[j].it.members,
            indexed[i].appearancePossible || indexed[j].appearancePossible
          )
        ) {
          union(i, j);
        }
      }
    }
    const groups = new Map();
    indexed.forEach((x, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    });
    const chosen = new Map(); // indexed 下标 → 合并后的 item
    const dropped = new Set();
    groups.forEach((idxs) => {
      if (idxs.length === 1) return;
      // 成员最多的那一栏当底稿；数量相同就按输入顺序（身份合并记录排在前面）
      const baseIdx = idxs
        .slice()
        .sort((a, b) => indexed[b].ids.length - indexed[a].ids.length || indexed[a].i - indexed[b].i)[0];
      const base = indexed[baseIdx];
      const memberMap = new Map();
      const unionMembers = [];
      idxs
        .slice()
        .sort((a, b) => indexed[b].ids.length - indexed[a].ids.length || indexed[a].i - indexed[b].i)
        .forEach((idx) => {
          indexed[idx].it.members.forEach((m) => {
            if (!m || !m.id || memberMap.has(m.id)) return;
            memberMap.set(m.id, m);
            unionMembers.push(m);
          });
        });
      const oldSubject = base.it.members[base.it.variantIndex || 0];
      const ordered = oldSubject ? [oldSubject].concat(unionMembers.filter((m) => m.id !== oldSubject.id)) : unionMembers;
      base.it.members = ordered;
      base.it.variantIndex = 0;
      base.it.initialIndex = 0;
      if (base.it.__ctx) {
        base.it.__ctx.all = ordered;
        base.it.__ctx.ordered = ordered;
      }
      if (base.it.excluded) {
        const keepIds = new Set(ordered.map((m) => m.id));
        // 合并前各栏「已经划掉」的成员并集，一起带过来（例如「只在别名里对得上」的那张卡）
        idxs.forEach((idx) => {
          const ex = indexed[idx].it.excluded;
          if (!ex) return;
          Array.from(ex).forEach((id) => {
            if (keepIds.has(id)) base.it.excluded.add(id);
          });
        });
        Array.from(base.it.excluded).forEach((id) => {
          if (!keepIds.has(id)) base.it.excluded.delete(id);
        });
      }
      // 只要有一栏默认「不勾」，合并后的这一栏也跟着不勾
      if (idxs.some((idx) => indexed[idx].it.checked === false)) base.it.checked = false;
      // 「弱线索」的成员与「有强线索」的标记也跟着并进来
      const weakUnion = new Set();
      let hasStrong = false;
      idxs.forEach((idx) => {
        const o = indexed[idx].it;
        (o.weakPairIds || []).forEach((id) => weakUnion.add(id));
        if (o.strongEvidence !== false) hasStrong = true;
      });
      if (weakUnion.size) {
        base.it.weakPairIds = Array.from(weakUnion);
        base.it.strongEvidence = hasStrong;
      }
      base.it.__variantCache = new Map();
      chosen.set(baseIdx, base.it);
      idxs.forEach((idx) => {
        if (idx !== baseIdx) dropped.add(idx);
      });
    });
    const out = [];
    let ptr = 0;
    raw.forEach((it) => {
      const key = mergeItemMemberKey(it);
      if (!key || !Array.isArray(it.members) || !it.members.length) {
        out.push(it);
        return;
      }
      const idx = ptr++;
      if (dropped.has(idx)) return;
      out.push(chosen.has(idx) ? chosen.get(idx) : indexed[idx].it);
    });
    return out;
  }

  function openMergeDialog(title, items, kind) {
    const raw = (items || []).filter(Boolean);
    const valid = combineOverlappingMergeItems(raw);
    if (!valid.length) {
      uiAlert("没有找到可以合并的重复项。");
      return;
    }
    // 「证据很弱」的那几栏（只在别名里对得上、名字又一点不像）的默认处理：
    // 组里还有别的强线索 → 把弱的那张卡先划掉，其余照常勾着；
    // 整栏都是弱线索 → 这一栏默认不勾，要用户自己点亮。
    valid.forEach((x) => {
      const weak = x && x.weakPairIds;
      if (weak && weak.length) {
        const lit = x.members.filter((m) => m && m.id && !x.excluded.has(m.id));
        const rest = lit.filter((m) => weak.indexOf(m.id) < 0);
        if (rest.length >= 2) weak.forEach((id) => x.excluded.add(id));
        else if (!x.strongEvidence) x.checked = false;
        ensureKeepPicked(x);
      }
    });
    pendingListDialog = null;
    resetChecklistChrome();
    pendingMergeItems = valid;
    pendingMergeKind = kind || "人物";
    $("#merge-modal-title").textContent = title;
    const MSG = MERGE_DIALOG_TEXT[pendingMergeKind] || MERGE_DIALOG_TEXT["人物"];
    const hint = $("#merge-modal-hint");
    if (hint) hint.textContent = MSG.short;
    hideNameTip(true);
    // 刚填入大量识别结果时，关联数量索引按当前数据重算一次即可，代价很小。
    charAssocIndex.rev = -1;
    const listEl = $("#merge-list");
    // 合并表交互很多：以前每重画一次都会给每个词条重新挂一堆监听器。
    // 改成整张表只挂一次委托监听，重画时只换 HTML，明显更顺滑。
    const ctx = { valid, renderList: null, stashChecks: null };
    if (listEl.__mergeCancelPending) listEl.__mergeCancelPending();
    listEl.__mergeCtx = ctx;
    bindMergeListEvents(listEl);
    const renderList = () => {
      listEl.innerHTML = valid.map((it, i) => mergeItemHtml(it, i)).join("");
      bindMergeItemTips(listEl);
    };
    // 重新渲染前先把勾选状态存回数据里，免得被冲掉
    function stashChecks() {
      const boxes = $$("#merge-list .merge-item-cb");
      valid.forEach((x, k) => {
        if (boxes[k]) x.checked = boxes[k].checked;
      });
    }
    ctx.renderList = renderList;
    ctx.stashChecks = stashChecks;
    renderList();
    openModal("merge-modal");
  }

  // 主体如果被排除掉了，就换成下一个还参与合并的
  function ensureKeepPicked(it) {
    if (!it || !it.members || !it.members.length) return;
    const cur = it.members[it.variantIndex || 0];
    if (cur && !it.excluded.has(cur.id)) return;
    const next = it.members.findIndex((m) => !it.excluded.has(m.id));
    it.variantIndex = next < 0 ? 0 : next;
  }

  // 合并清单里的一条：人物 / 事件 / 设定条目双击词条方块就能换主体
  function mergeItemHtml(it, i) {
    const v = mergeItemVariant(it);
    // live：让悬浮说明、副标题跟着当前勾选实时变（只讲这次真正会合并的那几条）
    const live = typeof v.live === "function" ? v.live(it) || {} : {};
    const tip = live.tip !== undefined ? live.tip : v.tip;
    const reason = live.reason !== undefined ? live.reason : v.reason;
    const excluded = it.excluded || new Set();
    const subjectMember = it.members && it.members[it.variantIndex || 0] ? it.members[it.variantIndex || 0] : null;
    // 被划掉的词条即使是原来的主体，也不再套主体金框；全划掉时整栏都是“不合并”样式。
    const subjectLit = !!(subjectMember && !excluded.has(subjectMember.id));
    const subjectId = subjectLit ? subjectMember.id : "";
    const picksHtml =
      Array.isArray(v.picks) && v.picks.length
        ? `<span class="merge-picks">${v.picks
            .map((p) => {
              const on = !excluded.has(p.key);
              const isSubject = p.key === subjectId;
              const inner = p.tip
                ? `<span class="name-tip" data-tip="${esc(p.tip)}">${esc(p.text)}</span>`
                : esc(p.text);
              // 不再在词条前面画 ☑ / ☐：参与与否由这个方块自身的样式表示（实底＝参与，灰掉划掉＝不参与）
              // 悬停只保留词条信息框（inner 里的 .name-tip），不再挂操作说明
              return `<span class="merge-pick ${on ? "" : "off"}${isSubject ? " subject" : ""}" data-idx="${i}" data-key="${esc(
                p.key
              )}">${inner}</span>`;
            })
            .join("")}</span>`
        : "";
    // 合并后的词条名：用下拉框选（主体的名字排第一，其后是这一组里其它名字），末尾一条「自定义…」可自己输入
    const nameList = mergeNameOptions(it);
    const keepName = subjectLit ? mergeKeepName(it) : "";
    const curName = mergeItemFinalName(it);
    const customMode = it.nameMode === "custom" || (!!curName && !nameList.includes(curName));
    const finalLine = nameList.length
      ? `<span class="merge-final-wrap">
          <span class="merge-final-label">词条名</span>
          <select class="merge-name-sel" data-idx="${i}">
            ${nameList
              .map(
                (n) =>
                  `<option value="${esc(n)}"${
                    !customMode && n === curName ? " selected" : ""
                  }>${esc(n)}${n === keepName ? "（主体）" : ""}</option>`
              )
              .join("")}
            <option value="__custom__"${customMode ? " selected" : ""}>自定义…</option>
          </select>
          ${
            customMode
              ? `<input class="merge-name-input" data-idx="${i}" value="${esc(
                  String(it.nameOverride || "").trim()
                )}" placeholder="输入合并后的词条名" />`
              : ""
          }
        </span>`
      : "";
    return `<div class="merge-item" data-idx="${i}">
      <input type="checkbox" class="merge-item-cb" data-idx="${i}" ${it.checked === false ? "" : "checked"} />
      <span class="merge-body">
        ${v.labelHtml || v.label ? `<span class="merge-keep">${v.labelHtml || esc(v.label)}${picksHtml}</span>` : picksHtml}
        ${reason ? `<span class="merge-drop">${esc(reason)}</span>` : ""}
      </span>
      ${finalLine}
    </div>`;
  }

  // 把「一组候选」做成可换主体的合并项：默认第 initialIndex 个当主体（推荐的），
  // 弹窗里所有词条并列显示——单击＝参与 / 不参与合并，双击＝把它设为主体。
  // build(keep, drops, index, ctx) 需要返回 { label, labelHtml, reason, tip, apply }
  // ctx.included(member) 用来只合并「这次勾上的」成员；ctx.picks(成员列表, textOf, tipOf) 生成并列的词条方块
  function makeSwapItem(members, initialIndex, build) {
    const list = (members || []).filter(Boolean).filter((m, i, arr) => {
      if (!m.id) return true;
      return arr.findIndex((x) => x && x.id === m.id) === i;
    });
    if (!list.length) return null;
    const excluded = new Set();
    const ctx = {
      all: list,
      included: (m) => !!m && !excluded.has(m.id),
      picks: (others, textOf, tipOf) =>
        (others || []).map((m) => ({ key: m.id, text: textOf ? textOf(m) : m.name, tip: tipOf ? tipOf(m) : "" })),
    };
    // 词条的显示顺序：推荐的主体排第一，其余按原顺序；换主体后顺序不跳
    const first = Math.max(0, Math.min(list.length - 1, Number(initialIndex) || 0));
    ctx.ordered = [list[first]].concat(list.filter((_, i) => i !== first));
    const idx = first;
    // 只保存“怎么生成当前主体这一版”的方法。之前这里会把组内每个成员都当主体预生成一遍，
    // 一栏 18 个词条就要算 18 份完整说明（其中每份又包含 18 个悬停说明），大项目里非常卡。
    // 现在双击换主体时只按需生成那一版，并缓存起来。
    return {
      variantIndex: idx,
      initialIndex: idx,
      members: list,
      excluded,
      nameOverride: "",
      __ctx: ctx,
      __buildVariant: build,
      __variantCache: new Map(),
    };
  }

  // 合并后的词条名优先级：双击改过的名字 → 主体的名字 → （主体没名字时）最完整的写法
  function pickMergeName(it, names) {
    const override = String((it && it.nameOverride) || "").trim();
    if (override) return override;
    const keepName = String((names && names.keep) || "").trim();
    const fullName = String((names && names.full) || "").trim();
    return keepName || fullName;
  }

  function mergeItemVariant(it) {
    if (!it) return it;
    if (typeof it.__buildVariant !== "function" || !it.members) return it;
    const idx = Math.max(0, Math.min(it.members.length - 1, Number(it.variantIndex) || 0));
    if (!it.__variantCache) it.__variantCache = new Map();
    if (it.__variantCache.has(idx)) return it.__variantCache.get(idx);
    const keep = it.members[idx];
    const drops = it.members.filter((_, k) => k !== idx);
    const v = it.__buildVariant(keep, drops, idx, it.__ctx) || {};
    it.__variantCache.set(idx, v);
    return v;
  }

  function mergeItemNames(it) {
    const v = mergeItemVariant(it);
    if (!v) return {};
    const live = typeof v.live === "function" ? v.live(it) || {} : {};
    return (live.names !== undefined ? live.names : v.names) || {};
  }

  // 合并项成员在弹窗里显示的名字（人物 / 设定条目用 name，事件用 title）
  function mergeMemberName(m) {
    return String((m && (m.name || m.title)) || "").trim();
  }

  // 「自动」情况下会用的词条名＝主体的名字（主体没名字时退回最完整的写法）
  function mergeKeepName(it) {
    const n = mergeItemNames(it) || {};
    return String(n.keep || n.full || "").trim();
  }

  // 词条名的候选列表：主体的名字排第一，后面是这一组里其它成员的名字，同名的只留一个
  function mergeNameOptions(it) {
    const v = mergeItemVariant(it);
    if (!v || !v.names) return []; // 事件合并没有「词条名」这一步
    const names = mergeItemNames(it) || {};
    const out = [];
    const keys = [];
    const add = (n) => {
      const t = String(n || "").trim();
      if (!t) return;
      // 「同名只列一次」：间隔号 / 全半角 / 零宽字符这些看不见的差别也算同名
      const k = normNameKey(t);
      if (keys.indexOf(k) >= 0) return;
      keys.push(k);
      out.push(t);
    };
    add(names.keep);
    (it.members || []).forEach((m) => add(mergeMemberName(m)));
    add(names.full);
    return out;
  }

  function mergeItemFinalName(it) {
    return it ? pickMergeName(it, mergeItemNames(it)) : "";
  }

  // 一组人物里，谁更适合当主体（信息更全 / 正常时间线的那条）
  function charMainIndex(members) {
    let bi = 0;
    (members || []).forEach((c, i) => {
      if (charMainScore(c) > charMainScore(members[bi])) bi = i;
    });
    return bi;
  }

  async function confirmMergeDialog() {
    // 清单式弹窗（例如清理「只提了一句」的人物 / 条目）：只处理勾上的
    const dlg = pendingListDialog;
    if (dlg && dlg.kind === "checklist") {
      pendingListDialog = null;
      const boxes = checklistBoxes();
      const chosen = dlg.items.filter((it, i) => boxes[i] && boxes[i].checked);
      closeModal("merge-modal");
      resetChecklistChrome();
      if (chosen.length && dlg.onConfirm) dlg.onConfirm(chosen);
      return;
    }
    const items = pendingMergeItems || [];
    pendingMergeItems = null;
    closeModal("merge-modal");
    if (!items.length) return;
    const checks = $$("#merge-list .merge-item-cb");
    const chosen = items.filter((it, i) => checks[i] && checks[i].checked);
    if (!chosen.length) return;
    pendingUndoLabel = `自动合并 ${chosen.length} 组${pendingMergeKind}`;
    mergeUndoSnapshot = snapshotCharData();
    const results = await Promise.all(
      chosen.map(async (it) => {
        try {
          const v = mergeItemVariant(it);
          await (v.apply || it.apply)(mergeItemFinalName(it));
          return true;
        } catch (e) {
          console.warn(e);
          return false;
        }
      })
    );
    if (results.some((ok) => !ok)) showToast(uiTextFor("合并正文失败"));
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    renderEntries();
    renderCategories();
    showMergeUndoBar(`已合并 ${chosen.length} 组${pendingMergeKind}`);
    pendingMergeKind = "人物";
  }

  /* ---- 清单式弹窗：默认全勾，用户可以自己反勾选（清理超短人物 / 条目用） ---- */
  let pendingListDialog = null; // { kind:"checklist", items, onConfirm }

  function checklistBoxes() {
    // 清单项的主复选框（合并弹窗与清理清单都用它；用两个选择器兜底，免得哪个模板漏了 class）
    return $$("#merge-list .merge-item-cb, #merge-list .merge-item > input[type=checkbox]");
  }

  function updateChecklistCount() {
    const el = $("#merge-list-count");
    if (!el) return;
    const boxes = checklistBoxes();
    el.textContent = boxes.length ? `已勾选 ${boxes.filter((b) => b.checked).length} / ${boxes.length}` : "";
  }

  function resetChecklistChrome() {
    const acts = $("#merge-list-actions");
    if (acts) acts.hidden = true;
    const btn = $("#merge-confirm-btn");
    if (btn) btn.textContent = "确认合并";
    const modalBox = $("#merge-modal .modal");
    if (modalBox) modalBox.classList.remove("checklist-mode");
    const listEl = $("#merge-list");
    if (listEl) listEl.classList.remove("checklist");
  }

  // 打开一个可勾选的确认清单（默认全勾）
  function openChecklistDialog(opts) {
    const o = opts || {};
    let items = o.items || [];
    if (!items.length && !o.threshold) return;
    pendingMergeItems = null;
    pendingListDialog = { kind: "checklist", items, onConfirm: o.onConfirm };
    $("#merge-modal-title").textContent = o.title || "确认";
    $("#merge-modal-hint").innerHTML = o.hint || "";
    const listEl = $("#merge-list");
    // 清单模式不要再走上一轮「自动合并」的委托上下文，否则点一行会重画成旧的合并表。
    if (listEl) listEl.__mergeCtx = null;
    const renderItems = (list) => {
      items = list;
      if (pendingListDialog) pendingListDialog.items = list;
      listEl.innerHTML = list.length
        ? list
            .map(
              (it, i) => `<label class="merge-item"${it.tip ? ` title="${esc(it.tip)}"` : ""}>
          <input type="checkbox" class="merge-item-cb" data-idx="${i}" ${it.checked === false ? "" : "checked"} />
          <span class="merge-body">
            <span class="merge-keep">${it.labelHtml || esc(it.label)}</span>
            ${it.reason ? `<span class="merge-drop">${esc(it.reason)}</span>` : ""}
          </span>
        </label>`
            )
            .join("")
        : `<p class="empty-tip">没有符合条件的条目了。</p>`;
      updateChecklistCount();
      bindMergeItemTips(listEl);
    };
    renderItems(items);
    const acts = $("#merge-list-actions");
    if (acts) acts.hidden = false;
    const btn = $("#merge-confirm-btn");
    if (btn) btn.textContent = o.confirmText || "确定";
    // 清单模式：弹窗放大，选项用四列并排展示
    const modalBox = $("#merge-modal .modal");
    if (modalBox) modalBox.classList.add("checklist-mode");
    if (listEl) listEl.classList.add("checklist");
    // 可选：清单上方带一个 / 两个可改阈值，改完立刻重新筛一遍
    const bindTh = (wrapSel, labelSel, inputSel, unitSel, spec) => {
      const wrap = $(wrapSel);
      const input = $(inputSel);
      if (!wrap || !input) return;
      if (!spec) {
        wrap.hidden = true;
        return;
      }
      wrap.hidden = false;
      const lab = $(labelSel);
      const unit = $(unitSel);
      if (lab) lab.textContent = spec.label || "识别阈值";
      if (unit) unit.textContent = spec.unit || "";
      input.min = String(spec.min == null ? 0 : spec.min);
      input.max = String(spec.max == null ? 5000 : spec.max);
      input.step = String(spec.step == null ? 1 : spec.step);
      input.value = String(spec.value == null ? 0 : spec.value);
      input.onchange = () => {
        const v = Math.max(
          spec.min == null ? 0 : spec.min,
          Math.min(spec.max == null ? 5000 : spec.max, parseInt(input.value, 10) || 0)
        );
        input.value = String(v);
        const res = spec.onChange ? spec.onChange(v) : null;
        const next = Array.isArray(res) ? res : (res && res.items) || [];
        renderItems(next);
        const title = (res && res.title) || String(o.title || "").replace(/（\d+）/, `（${next.length}）`);
        $("#merge-modal-title").textContent = title;
        if (res && res.hint) $("#merge-modal-hint").innerHTML = res.hint;
      };
    };
    bindTh("#merge-list-threshold", "#merge-list-threshold-label", "#merge-list-threshold-input", "#merge-list-threshold-unit", o.threshold);
    bindTh("#merge-list-threshold2", "#merge-list-threshold2-label", "#merge-list-threshold2-input", "#merge-list-threshold2-unit", o.threshold2);
    openModal("merge-modal");
  }

  // 同一条提示不要一直挂着：10 秒后自己收（想撤销还有 Ctrl+Z / 顶栏撤销）
  let mergeUndoHideTimer = 0;
  function showMergeUndoBar(text) {
    const bar = $("#merge-undo-bar");
    if (!bar) return;
    $("#merge-undo-text").textContent = typeof text === "string" ? text : `已合并 ${text} 组`;
    bar.hidden = false;
    if (mergeUndoHideTimer) {
      clearTimeout(mergeUndoHideTimer);
      mergeUndoHideTimer = 0;
    }
    if (typeof setTimeout === "function") {
      mergeUndoHideTimer = setTimeout(() => {
        mergeUndoHideTimer = 0;
        hideMergeUndoBar();
      }, 2000); // 最多显示 2 秒（想撤销还有 Ctrl+Z / 顶栏撤销）
    }
  }

  function hideMergeUndoBar() {
    if (mergeUndoHideTimer) {
      clearTimeout(mergeUndoHideTimer);
      mergeUndoHideTimer = 0;
    }
    const bar = $("#merge-undo-bar");
    if (bar) bar.hidden = true;
    mergeUndoSnapshot = null;
  }

  function undoMerge() {
    if (!mergeUndoSnapshot) return;
    state.characters = mergeUndoSnapshot.characters;
    state.events = mergeUndoSnapshot.events;
    state.settings.entries = mergeUndoSnapshot.entries;
    if (Array.isArray(mergeUndoSnapshot.order)) state.order = mergeUndoSnapshot.order;
    mergeUndoSnapshot = null;
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    renderEntries();
    renderCategories();
    hideMergeUndoBar();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("undo-merge");
  }

