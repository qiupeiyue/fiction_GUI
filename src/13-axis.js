  /* ================= 时间轴 ================= */
  /* ---------- 事件检索 ---------- */
  function eventMatchesFilter(e) {
    const f = eventFilter;
    if (f.keyword) {
      const hay = foldVariant(String(e.title || "")).toLowerCase();
      if (!hay.includes(foldVariant(f.keyword))) return false;
    }
    if (f.charId && !(e.characterIds || []).includes(f.charId)) return false;
    if (f.lineId && !linesOf(e).includes(f.lineId)) return false;
    if (f.chapterId) {
      if (f.chapterId === "__none__") {
        if (e.chapterId) return false;
      } else if (e.chapterId !== f.chapterId) {
        return false;
      }
    }
    if (f.narrative === "顺叙") {
      if (e.narrative && e.narrative !== "顺叙") return false;
    } else if (f.narrative && e.narrative !== f.narrative) {
      return false;
    }
    return true;
  }

  function eventFilterActive() {
    const f = eventFilter;
    return !!(f.keyword || f.charId || f.lineId || f.chapterId || f.narrative);
  }

  // 事件轴 / 划分线计算都用这个（已应用检索条件）
  function axisEvents() {
    return orderedByStory().filter(eventMatchesFilter);
  }

  function renderEventFilters() {
    const cs = $("#ef-char");
    if (cs) {
      const cur = eventFilter.charId;
      cs.innerHTML =
        `<option value="">全部人物</option>` +
        state.characters.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
      cs.value = cur && getChar(cur) ? cur : "";
      eventFilter.charId = cs.value;
    }
    const ls = $("#ef-line");
    if (ls) {
      const cur = eventFilter.lineId;
      ls.innerHTML =
        `<option value="">全部线路</option>` +
        state.lines.map((l) => `<option value="${esc(l.id)}">${esc(lineLabel(l))}</option>`).join("");
      ls.value = cur && getLine(cur) ? cur : "";
      eventFilter.lineId = ls.value;
    }
    const chs = $("#ef-chapter");
    if (chs) {
      const cur = eventFilter.chapterId;
      chs.innerHTML =
        `<option value="">全部章节</option><option value="__none__">未分章</option>` +
        (state.chapters || []).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
      chs.value = cur && (cur === "__none__" || getChapter(cur)) ? cur : "";
      eventFilter.chapterId = chs.value;
    }
  }

  // 列宽自适应：按可用宽度除以线路数，取一个既看得清又不空荡的宽度
  // 注意：读 clientWidth 会让浏览器「立刻」把整个页面重新排版一遍（几百张卡片时非常贵）。
  // 所以这里用 ResizeObserver 白拿宽度——回调触发时浏览器本来就排好版了，
  // 取尺寸不会再引发重排；重画时直接用缓存值。
  let axisWrapWCache = 0;
  let axisWrapWatched = false;
  function watchAxisWidth() {
    if (axisWrapWatched) return;
    const wrap = document.querySelector(".timeline-wrap");
    if (!wrap || typeof ResizeObserver !== "function") return;
    axisWrapWatched = true;
    try {
      new ResizeObserver((entries) => {
        entries.forEach((en) => {
          const w = Math.round((en.contentRect && en.contentRect.width) || 0);
          if (w > 0) axisWrapWCache = w; // 页签隐藏时宽度是 0：保留上一次的值
        });
      }).observe(wrap);
    } catch (err) {
      /* 没有 ResizeObserver 就退回下面那次实时读取 */
    }
  }
  function invalidateAxisWidth() {
    watchAxisWidth(); // 交给 ResizeObserver 自己更新，不再当场量宽度
  }

  function laneWidthFor(cols) {
    watchAxisWidth();
    if (!axisWrapWCache) {
      const wrap = document.querySelector(".timeline-wrap");
      axisWrapWCache = wrap ? wrap.clientWidth || 0 : 0;
    }
    const avail = axisWrapWCache ? axisWrapWCache - ROW_LABEL_W - LANE_PLUS_W - 6 : 0;
    if (!avail || !cols) return 280; // 布局信息拿不到时（例如刚打开）用中间值
    return Math.max(LANE_MIN_W, Math.min(LANE_MAX_W, Math.floor(avail / cols)));
  }

  function renderTimeline() {
    const tl = $("#timeline");
    if (typeof refreshNovelOutlineIfVisible === "function") refreshNovelOutlineIfVisible();
    if (viewHidden("view-timeline")) {
      // 不在事件轴页签时不必重建 DOM；只刷新「每一行对应哪个时间值」这个缓存，
      // 供章 / 节操作和「上移 / 下移一格」使用（切回事件轴时页签会重画一次）。
      evaxisValues = Array.from(new Set(axisEvents().map((e) => e.storyIndex || 0))).sort((a, b) => a - b);
      /* 事件轴和时间线是同一组页签（不会同时可见）：这时开着的是时间线的话，
         它也得跟着数据更新。以前这里直接 return，于是「在时间线页签里改了事件卡的时间」
         时间线纹丝不动，得去点一下「恢复自动排序」才刷新 —— 看起来像那个按钮在负责更新。 */
      renderChrono();
      return;
    }
    const empty = $("#timeline-empty");
    const meta = $("#timeline-meta");
    normalizeAllEventSets();
    const all = axisEvents();

    empty.hidden = state.events.length > 0;
    meta.textContent = `${state.characters.length} 位人物 · ${state.events.length} 个事件 · ${state.lines.length} 条线路`;
    const cnt = $("#ef-count");
    if (cnt) cnt.textContent = eventFilterActive() ? `匹配 ${all.length} / 共 ${state.events.length} 个事件` : "";
    if (empty) {
      empty.textContent =
        eventFilterActive() && all.length === 0
          ? "没有符合筛选条件的事件。"
          : "从「＋ 新建」开始搭建你的故事线。";
    }

    const lanes = lineFilterLanes();
    if (lanes.length === 0) {
      tl.innerHTML = "";
      tl.classList.remove("no-rows");
      renderChrono(); // 事件轴变了，时间线也跟着保持同步
      return;
    }

    // 只统计落在可见线路上的事件
    const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
    const visible = all.filter((e) => linesOf(e).some((id) => laneIdx.has(id)));
    // 纵轴：按「故事时间值」聚成行（同一行的多个事件并排、各自独立）。
    // 某个值上没有事件时这一行就不存在，所以不会留下空行。
    const values = Array.from(new Set(visible.map((e) => e.storyIndex || 0))).sort((a, b) => a - b);
    evaxisValues = values;
    // #N 一律按「全量行」显示（和线路筛选无关）：这一行只是按 # 标出来而已，
    // 被筛掉的行不画，但剩下的行仍然保留它们本来的 #。
    const rowNoAll = new Map(axisRows().map((row, i) => [row.v || 0, i + 1]));
    const rowNoOfValue = (v) => rowNoAll.get(v) || 0;
    // 章 / 节显示用的（#N:M）也走全量行：和章节栏、二维事件图共用同一个来源
    const rangeOfBand = (segs, key, id) => {
      const mine = (segs || []).filter((s) => s[key] === id);
      if (!mine.length) return null;
      return {
        start: Math.min.apply(null, mine.map((s) => s.startRow)) + 1,
        end: Math.max.apply(null, mine.map((s) => s.endRow)) + 1,
      };
    };
    const allBandRanges = axisBandRanges();
    const chapterBandRanges = new Map(
      (allBandRanges.chapterSegs || [])
        .map((s) => [s.chapterId, rangeOfBand(allBandRanges.chapterSegs, "chapterId", s.chapterId)])
        .filter((x) => x[1])
    );
    const sectionBandRanges = new Map(
      (allBandRanges.sectionSegs || [])
        .map((s) => [s.sectionId, rangeOfBand(allBandRanges.sectionSegs, "sectionId", s.sectionId)])
        .filter((x) => x[1])
    );
    // 一行事件都没有时收起来，避免线路区和提示条之间空出一大块
    tl.classList.toggle("no-rows", values.length === 0);
    const rowEvents = values.map((v) => visible.filter((e) => (e.storyIndex || 0) === v));
    const layout = [];
    let prevCh = null;
    let prevSec = null;
    let chCollapsed = false;
    let secCollapsed = false;
    // 章节分段（基于全部行，不受折叠影响），用于拖动划分线
    const rowChIds = rowDominants(rowEvents, "chapterId");
    const rowSecIds = rowDominants(rowEvents, "sectionId");
    const chapterSegs = segsFromRowIds(rowEvents, rowChIds, "chapterId");
    const sectionSegs = segsFromRowIds(rowEvents, rowSecIds, "sectionId");
    const rowIndexByEventId = new Map();
    rowEvents.forEach((evs, r) => evs.forEach((e) => rowIndexByEventId.set(e.id, r)));
    const gridRowByStoryRow = new Map();
    const setInsideGapRows = new Map(); // setId -> {first, last}：集合框内上 / 下缝隙的 grid 行
    // 折叠的事件集：把连续的成员行压成一行显示，行号写成「起始~结束」。
    const hiddenSetRows = new Set();
    const collapsedSetAnchorRow = new Map();
    const collapsedSetLastRow = new Map();
    const rowLabelMap = new Map();
    const setLaneSpan = new Map();
    {
      const info = new Map();
      rowEvents.forEach((evs, r) => {
        (evs || []).forEach((e) => {
          const setId = eventSetIdForEvent(e);
          if (!setId) return;
          const leftLineId = eventSetLeftLineId(setId);
          if (eventSetIsExpanded(setId, leftLineId)) return;
          let rec = info.get(setId);
          if (!rec) {
            rec = { rows: new Set(), minLane: Infinity, maxLane: -Infinity };
            info.set(setId, rec);
          }
          rec.rows.add(r);
          linesOf(e).forEach((lid) => {
            const li = laneIdx.get(lid);
            if (li === undefined) return;
            rec.minLane = Math.min(rec.minLane, li);
            rec.maxLane = Math.max(rec.maxLane, li);
          });
        });
      });
      info.forEach((rec, setId) => {
        if (Number.isFinite(rec.minLane) && Number.isFinite(rec.maxLane)) {
          setLaneSpan.set(setId, { min: rec.minLane, max: rec.maxLane });
        }
        const rows = Array.from(rec.rows).sort((a, b) => a - b);
        if (!rows.length) return;
        const anchor = rows[0];
        collapsedSetAnchorRow.set(setId, anchor);
        if (rows.length < 2) return;
        let last = anchor;
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const evs = rowEvents[r] || [];
          const allSameSet = evs.length > 0 && evs.every((e) => eventSetIdForEvent(e) === setId);
          if (!allSameSet || hiddenSetRows.has(r)) continue;
          hiddenSetRows.add(r);
          if (r === last + 1) last = r;
        }
        if (last > anchor) {
          collapsedSetLastRow.set(anchor, last);
          rowLabelMap.set(anchor, `${rowNoOfValue(values[anchor])}~${rowNoOfValue(values[last])}`);
        }
      });
    }
    rowEvents.forEach((evs, r) => {
      if (hiddenSetRows.has(r)) return;
      const chId = rowChIds[r];
      /* 章 / 节分界线上下的两条缝隙各归谁：
         · 线**上面**那条缝 = 上一行的行尾缝（它本来就是上一行那一章 / 那一节的），上下移动只影响上一行；
         · 线**下面**那条缝 = 这一章 / 这一节自己的头缝（章头＝本章 · 未分节，节头＝本节）。
         以前两条缝都挂「上一行」的章 / 节，于是「在线下面新建节」会跑到上一章去，
         往下拖事件也会被算成上一章、把上一章的章线画出两条。 */
      if (chId !== prevCh) {
        layout.push({ kind: "chapter", id: chId, row: r });
        layout.push({ kind: "insert-before", r, secId: "", chapterId: chId });
        prevCh = chId;
        prevSec = null;
        const c = getChapter(chId);
        chCollapsed = c ? !!c.collapsed : false;
      }
      if (chCollapsed) return;
      const secId = rowSecIds[r];
      if (secId !== prevSec) {
        if (secId) {
          layout.push({ kind: "section", id: secId, row: r });
          layout.push({ kind: "insert-before", r, secId, chapterId: chId });
        }
        prevSec = secId;
        const sr = getSection(secId);
        secCollapsed = sr ? !!sr.section.collapsed : false;
      }
      if (secCollapsed) return;
      layout.push({ kind: "cells", r, v: values[r] });
      layout.push({ kind: "insert", r });
    });

    // 事件集展开后：在集合的上 / 下边缘各留两条缝——
    // 「框外缝」拖进去不并入集合（只是把卡片放到那里）；「框内缝」拖进去并入集合，
    // 成为集合的第一个 / 最后一个成员。
    {
      const expandedMemberSetOfRow = (r) => {
        const evs = rowEvents[r] || [];
        for (const e of evs) {
          const sid = eventSetIdForEvent(e);
          if (sid && eventSetIsExpanded(sid, eventSetLeftLineId(sid))) return sid;
        }
        return "";
      };
      // ① 框外缝：集合上边缘上面 / 下边缘下面的那条原有缝隙，加宽显示。
      layout.forEach((it, i) => {
        if (it.kind !== "insert" && it.kind !== "insert-before") return;
        const prev = layout[i - 1];
        const next = layout[i + 1];
        const prevSet = prev && prev.kind === "cells" ? expandedMemberSetOfRow(prev.r) : "";
        const nextSet = next && next.kind === "cells" ? expandedMemberSetOfRow(next.r) : "";
        if (nextSet !== prevSet) it.setEdgeGap = true;
      });
      // ② 框内缝：紧贴集合第一个 / 最后一个成员插一条缝隙，拖到这里＝并入集合。
      for (let i = layout.length - 1; i >= 0; i--) {
        const it = layout[i];
        if (it.kind !== "cells") continue;
        const mySet = expandedMemberSetOfRow(it.r);
        if (!mySet) continue;
        // 找相邻的「事件行」（跳过插入条），判断这一行是不是集合的第一 / 最后一行
        let prevCells = null;
        for (let j = i - 1; j >= 0; j--) {
          if (layout[j].kind === "cells") {
            prevCells = layout[j];
            break;
          }
        }
        let nextCells = null;
        for (let j = i + 1; j < layout.length; j++) {
          if (layout[j].kind === "cells") {
            nextCells = layout[j];
            break;
          }
        }
        const prevSet = prevCells ? expandedMemberSetOfRow(prevCells.r) : "";
        const nextSet = nextCells ? expandedMemberSetOfRow(nextCells.r) : "";
        if (mySet !== nextSet) layout.splice(i + 1, 0, { kind: "set-inside-gap", setId: mySet, pos: "last", r: it.r });
        if (mySet !== prevSet) layout.splice(i, 0, { kind: "set-inside-gap", setId: mySet, pos: "first", r: it.r });
      }
    }

    // 空章 / 空节的分界线不能落在事件集内部：锚点如果掉进某个集合的行区间，
    // 就吸到该集合的上 / 下「外部缝」（否则展开事件集后，分界线会卡在集合框里）。
    // 空章 / 空节的分界线不能落在别的章 / 节的事件中间（否则会出现「线在这节里、
    // 事件却属于上一节」的错乱显示）：把它夹回「上一节末尾 ~ 下一节开头」之间。
    function clampEmptyAnchor(anchor, list, idx, valOf) {
      if (!Number.isFinite(anchor) || !list || idx < 0) return anchor;
      const mid = (a, b) => (a + b) / 2;
      let prevLast = null;
      for (let i = idx - 1; i >= 0; i--) {
        const v = valOf(list[i]);
        if (v.length) {
          prevLast = Math.max.apply(null, v);
          break;
        }
      }
      let nextFirst = null;
      for (let i = idx + 1; i < list.length; i++) {
        const v = valOf(list[i]);
        if (v.length) {
          nextFirst = Math.min.apply(null, v);
          break;
        }
      }
      if (prevLast !== null && anchor <= prevLast) {
        return nextFirst !== null && nextFirst > prevLast ? mid(prevLast, nextFirst) : prevLast + 0.5;
      }
      if (nextFirst !== null && anchor >= nextFirst) {
        return prevLast !== null && nextFirst > prevLast ? mid(prevLast, nextFirst) : nextFirst - 0.5;
      }
      return anchor;
    }

    function snapAnchorOutsideSets(anchor, chapter, section) {
      if (!Number.isFinite(anchor)) return anchor;
      const rows = axisRows();
      for (const row of rows) {
        const setId = (row.items && row.items.length) ? eventSetIdForEvent(row.items[0]) : "";
        if (!setId) continue;
        const members = eventSetMembers(setId);
        if (!members.length) continue;
        const first = Math.min.apply(null, members.map((e) => e.storyIndex || 0));
        const last = Math.max.apply(null, members.map((e) => e.storyIndex || 0));
        if (anchor <= first || anchor >= last) continue; // 在集合外面，不用动
        // 在集合内部：按这条空章 / 空节在结构里的顺序决定吸到上方还是下方。
        const anchorMember = members[0];
        let above;
        if (section) {
          const secIdx = (chapter.sections || []).findIndex((x) => x.id === section.id);
          const memberSecIdx = (chapter.sections || []).findIndex((x) => x.id === anchorMember.sectionId);
          above = memberSecIdx < 0 ? secIdx <= 0 : secIdx < memberSecIdx;
        } else {
          const chIdx = (state.chapters || []).findIndex((x) => x.id === chapter.id);
          const memberChIdx = (state.chapters || []).findIndex((x) => x.id === anchorMember.chapterId);
          above = chIdx < memberChIdx;
        }
        if (above) return first;
        const after = state.events
          .map((e) => e.storyIndex || 0)
          .filter((v) => v > last)
          .sort((a, b) => a - b)[0];
        return after != null ? (last + after) / 2 : last + 0.5;
      }
      return anchor;
    }

    // 用户新建但还没有事件的章 / 节：按相邻章 / 节的事件位置，在事件轴里插一条分隔带，
    // 让它们的位置也能被看见；之后往里面拖事件，就自然变成有内容的章 / 节。
    {
      // 空章 / 空节不能插进展开事件集的框内（那样会被集合框罩住、文字被挤扁）：
      // 落点如果落在集合框里，就往前挪到集合框外的上缝之前。
      const outsideSetFrame = (idx) => {
        let i = idx;
        const rowSetId = (r) => {
          const evs = rowEvents[r] || [];
          return evs.length ? eventSetIdForEvent(evs[0]) : "";
        };
        for (let guard = 0; guard < layout.length && i > 0; guard++) {
          const it = layout[i];
          if (it && it.kind === "set-inside-gap") {
            i--;
            continue;
          }
          if (it && it.kind === "cells") {
            const sid = rowSetId(it.r);
            if (sid && eventSetIsExpanded(sid, eventSetLeftLineId(sid))) {
              i--;
              continue;
            }
          }
          break;
        }
        while (i > 0 && layout[i - 1] && layout[i - 1].setEdgeGap) i--;
        return i;
      };
      // 空章：按 anchor（storyIndex 值）插到第一个 storyIndex >= anchor 的事件行 / 分带之前。
      const emptyChapters = [];
      (state.chapters || []).forEach((c, ci) => {
        if (state.events.some((e) => (e.chapterId || "") === c.id)) return;
        const anchor = clampEmptyAnchor(
          snapAnchorOutsideSets(chapterAnchorStory(c.id), c, null),
          state.chapters || [],
          ci,
          (ch) => state.events.filter((e) => (e.chapterId || "") === ch.id).map((e) => e.storyIndex || 0)
        );
        emptyChapters.push({ anchor, item: { kind: "chapter", id: c.id, empty: true, anchor } });
      });
      emptyChapters.forEach((x) => {
        let at = layout.length;
        for (let i = 0; i < layout.length; i++) {
          const it = layout[i];
          let v = null;
          if (it.kind === "cells" && typeof it.v === "number") v = it.v;
          else if ((it.kind === "chapter" || it.kind === "section") && typeof it.row === "number") v = values[it.row];
          if (v !== null && v !== undefined && v >= x.anchor) {
            at = i;
            break;
          }
        }
        at = outsideSetFrame(at);
        layout.splice(at, 0, x.item);
        // 空章带后面也留一条缝隙，作为拖拽落点 / 插入点。
        layout.splice(at + 1, 0, {
          kind: "insert-before",
          r: virtualInsertIndexFor(x.anchor) + 1,
          secId: "",
          chapterId: x.item.id,
        });
      });
      // 空节：节是章内的二级标题，必须排在所属章分界线之后、并保持节内顺序。
      // 这里按章逐个处理：空节插到该章分界线之后，非空节的带在 layout 里，按顺序推进游标。
      (state.chapters || []).forEach((c) => {
        if (c.collapsed) return;
        const sections = c.sections || [];
        if (!sections.length) return;
        // 定位章分界线
        let pos = -1;
        for (let i = 0; i < layout.length; i++) {
          if (layout[i].kind === "chapter" && layout[i].id === c.id) {
            pos = i + 1;
            break;
          }
        }
        if (pos < 0) return;
        // 跳过章分界线后紧跟的那条缝隙，避免和空节自己的缝隙重复。
        while (pos < layout.length && layout[pos].kind === "insert-before") pos++;
        const chVals = state.events.filter((e) => (e.chapterId || "") === c.id).map((e) => e.storyIndex || 0);
        const firstStory = chVals.length ? Math.min.apply(null, chVals) : null;
        sections.forEach((s) => {
          const isEmpty = !state.events.some((e) => e.sectionId === s.id);
          if (isEmpty) {
            const secIdx = (c.sections || []).findIndex((x) => x.id === s.id);
            const anchor = clampEmptyAnchor(
              snapAnchorOutsideSets(sectionAnchorStoryFor(c, s), c, s),
              c.sections || [],
              secIdx,
              (sec) => state.events.filter((e) => (e.sectionId || "") === sec.id).map((e) => e.storyIndex || 0)
            );
            if (firstStory !== null && anchor > firstStory) {
              // 在章中间 / 末尾：尊重用户设置的锚点，插到对应位置。
              let at = layout.length;
              for (let i = pos; i < layout.length; i++) {
                const it = layout[i];
                let v = null;
                if (it.kind === "cells" && typeof it.v === "number") v = it.v;
                else if ((it.kind === "chapter" || it.kind === "section") && typeof it.row === "number") v = values[it.row];
                if (v !== null && v !== undefined && v >= anchor) {
                  at = i;
                  break;
                }
              }
              at = outsideSetFrame(at);
              layout.splice(at, 0, { kind: "section", id: s.id, empty: true, anchor });
              layout.splice(at + 1, 0, {
                kind: "insert-before",
                r: virtualInsertIndexFor(anchor) + 1,
                secId: s.id,
                chapterId: c.id,
              });
            } else {
              // 在章开头：排在章分界线之后。
              layout.splice(pos, 0, { kind: "section", id: s.id, empty: true, anchor });
              layout.splice(pos + 1, 0, {
                kind: "insert-before",
                r: virtualInsertIndexFor(anchor) + 1,
                secId: s.id,
                chapterId: c.id,
              });
              pos += 2;
            }
            return;
          }
          // 非空节：游标推进到它的带之后
          for (let i = pos; i < layout.length; i++) {
            if (layout[i].kind === "section" && layout[i].id === s.id) {
              pos = i + 1;
              break;
            }
          }
        });
      });
    }

    const COLS = lanes.length;
    let gridRow = 1;
    const LANE_W = laneWidthFor(COLS);
    lastLaneWidth = LANE_W;
    // 每条线路的列宽：拖过的用拖出来的宽度，没拖过的用自动宽度
    const colWs = lanes.map((l) => {
      const w = Number(laneWidths[l.id]) || LANE_W;
      return Math.max(LANE_W_MIN, Math.min(LANE_W_MAX, Math.round(w)));
    });
    const setGutterByLaneId = new Map(
      lanes.map((l, i) => [l.id, Math.max(56, Math.min(80, Math.round(colWs[i] * 0.18)))])
    );
    const colsTpl = `${ROW_LABEL_W}px ${colWs.map((w) => w + "px").join(" ")} ${LANE_PLUS_W}px`;
    // 列分隔线渐变整张图只用一份：不要每画一行都重新拼一遍字符串。
    const laneGradient = laneLineGradient(colWs);
    let html = `<div class="evaxis"><div class="evaxis-grid" data-cols="${COLS}" data-lane-widths="${colWs.join(",")}" style="--lane-w:${LANE_W}px;grid-template-columns:${colsTpl}">`;
    // 顶部插入条：它上面没有别的行，归属就跟着第一行
    html += `<div class="evaxis-insert" data-insert="-1" data-chapter-id="${esc(
      rowChIds[0] || ""
    )}" data-section-id="${esc(rowSecIds[0] || "")}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"></div>`;
    gridRow++;
    // 左上角（行标列的表头）
    html += `<div class="lane-head rownum-head stick" title="事件轴的序号（# = 第几个事件）" style="grid-column:1;grid-row:${gridRow}">#</div>`;
    // 线路表头
    lanes.forEach((line, i) => {
      const count = all.filter((e) => linesOf(e).includes(line.id)).length;
        html += `<div class="lane-head stick" data-line-id="${esc(line.id)}" title="双击编辑线路 · 右键更多操作 · 拖动排序" style="grid-column:${i + 2};grid-row:${gridRow};border-top-color:${esc(line.color)};border-color:${esc(line.color)}4D;background-color:${esc(line.color)}33">
        <span class="lane-dot" style="background:${esc(line.color)}"></span>
        <span class="lane-code">${esc(line.code || "?")}</span>
        <span class="lane-name">${esc(lineDisplayName(line))}</span>
        <span class="lane-kind ${line.kind === "暗线" ? "hidden" : ""}">${esc(line.kind)}</span>
        <span class="lane-count">${count}</span>
      </div>`;
    });
    // 横轴最右边：＋ 新建线路
    html += `<button type="button" class="lane-head lane-add stick" id="lane-add-btn" title="新建一条线路（主线 / 暗线）" style="grid-column:${COLS + 2};grid-row:${gridRow}">＋</button>`;
    gridRow++;
    // 章 / 节分隔带 + 时间行
    layout.forEach((item) => {
      if (item.kind === "chapter") {
        const c = getChapter(item.id);
        const collapsed = c ? c.collapsed : false;
        const isUnassigned = !item.id;
        const chCount = isUnassigned
          ? state.events.filter((e) => !e.chapterId).length
          : state.events.filter((e) => e.chapterId === item.id).length;
        const label = c ? c.title : "未分章";
        const segIndex = chapterSegs.findIndex((s) => s.chapterId === item.id);
        const seg = segIndex >= 0 ? chapterSegs[segIndex] : null;
        // 显示用的（#N:M）走全量行（axisBandRanges），和章节栏 / 二维图那两处完全一致；
        // seg 只用于拖拽（data-seg），那是「画出来的行」的索引。
        const chRange = chapterBandRanges.get(item.id);
        const rangeText = chRange && !isUnassigned ? `（#${chRange.start}:${chRange.end}）` : "";
        const tip = isUnassigned
          ? "「未分章」＝ 还没有归入任何章节的事件。右键这里选「选中本组全部事件」，再到顶部选择要归入的章；也可以把事件卡片直接拖到某个章的分隔带上。"
          : `${label}（${chCount} 个事件）　${rangeText ? rangeText.replace(/[（）]/g, "") : ""}　· 右键可以设置起始位置`;
        html += `<div class="evaxis-band chapter" data-chapter-id="${esc(item.id)}" data-empty="${
          item.empty ? "1" : ""
        }" data-seg="${
          segIndex >= 0 ? segIndex : ""
        }" data-row="${
          item.row !== undefined ? item.row : ""
        }" data-anchor="${item.anchor !== undefined ? item.anchor : ""}" data-value="${item.row !== undefined ? values[item.row] : ""}" title="${esc(tip)}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"><span class="band-inner">${
          `<span class="band-caret">${collapsed ? "▶" : "▼"}</span>`
        } ${esc(label)} ${rangeText ? `<span class="band-range">${esc(rangeText)}</span>` : ""}</span></div>`;
        gridRow++;
      } else if (item.kind === "section") {
        const sr = getSection(item.id);
        const collapsed = sr ? sr.section.collapsed : false;
        const secSeg = sectionSegs.find((s) => s.sectionId === item.id);
        const secRangeRec = sectionBandRanges.get(item.id);
        const secRange = secRangeRec ? `（#${secRangeRec.start}:${secRangeRec.end}）` : "";
        html += `<div class="evaxis-band section" data-section-id="${esc(item.id)}" data-empty="${
          item.empty ? "1" : ""
        }" data-row="${
          item.row !== undefined ? item.row : ""
        }" data-anchor="${item.anchor !== undefined ? item.anchor : ""}" data-value="${item.row !== undefined ? values[item.row] : ""}" title="${esc(
          sr ? sr.section.title : ""
        )}${secRange ? "　" + secRange.replace(/[（）]/g, "") : ""}　· 右键可以设置本节起始位置" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"><span class="band-inner">${
          `<span class="band-caret">${collapsed ? "▶" : "▼"}</span>`
        } ${esc(sr ? sr.section.title : "")} ${secRange ? `<span class="band-range">${esc(secRange)}</span>` : ""}</span></div>`;
        gridRow++;
      } else if (item.kind === "cells") {
        gridRowByStoryRow.set(item.r, gridRow);
        const evs = rowEvents[item.r] || [];
        // 同一事件跨多条线路时，用一个框横跨这些线路列
        const placed = evs
          .map((e) => {
            const cols = linesOf(e)
              .map((id) => laneIdx.get(id))
              .filter((x) => x !== undefined);
            if (!cols.length) return null;
            return { e, min: Math.min.apply(null, cols), max: Math.max.apply(null, cols) };
          })
          .filter(Boolean)
          .sort((a, b) => a.min - b.min || a.max - b.max);
        const laneMax = [];
        placed.forEach((it) => {
          let ri = -1;
          for (let k = 0; k < laneMax.length; k++) {
            if (it.min > laneMax[k]) {
              ri = k;
              break;
            }
          }
          if (ri < 0) {
            laneMax.push(it.max);
            ri = laneMax.length - 1;
          } else {
            laneMax[ri] = it.max;
          }
          it.row = ri;
        });
        const innerRows = Math.max(1, laneMax.length);
        html += `<div class="evaxis-row" data-row="${item.r}" data-value="${item.v}" data-cols="${COLS}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}">`;
        // 列对齐线从行标列之后开始画，否则会和线路列错位
        html += `<div class="evaxis-row-grid" style="--lane-w:${LANE_W}px;grid-template-columns:${colsTpl};grid-template-rows:repeat(${innerRows}, auto);background-image:${laneGradient};background-repeat:no-repeat">`;
        // 行标 = 这一行的 #（全量行号）：被线路筛选藏掉的行不画，但剩下的行保留本来的 #
        const rowLabel = rowLabelMap.get(item.r) || `${rowNoOfValue(values[item.r])}`;
        html += `<div class="evaxis-rownum" style="grid-column:1;grid-row:1 / span ${innerRows}" title="#${rowLabel}">${rowLabel}</div>`;
        const renderedCollapsedBlocks = new Set();
        placed.forEach((it) => {
          const firstLineId = linesOf(it.e)[0];
          const setId = eventSetIdForEvent(it.e);
          const setLineId = setId ? eventSetShownLineId(setId) : "";
          const expanded = !!(setId && eventSetIsExpanded(setId, setLineId));
          let spanMin = it.min;
          let spanMax = it.max;
          let renderCollapsedBlock = false;
          if (setId && !expanded && collapsedSetAnchorRow.get(setId) === item.r) {
            // 同一行里属于同一集合的多个事件只画一张集合卡，避免重复占位。
            if (renderedCollapsedBlocks.has(setId)) return;
            const sp = setLaneSpan.get(setId);
            if (sp) {
              spanMin = Math.min(spanMin, sp.min);
              spanMax = Math.max(spanMax, sp.max);
            }
            renderCollapsedBlock = true;
            renderedCollapsedBlocks.add(setId);
          }
          html += `<div class="evaxis-span" style="grid-column:${spanMin + 2} / span ${
            spanMax - spanMin + 1
          };grid-row:${it.row + 1}">`;
          if (setId && !expanded) {
            if (renderCollapsedBlock) {
              html += eventSetRowBlockHtml(getEventSet(setId), getLine(setLineId), eventSetMembers(setId));
            } else {
              html += `<div class="event-set-row-placeholder"></div>`;
            }
          } else {
            if (expanded && it.min === laneIdx.get(setLineId)) {
              const gutter = setGutterByLaneId.get(setLineId) || 62;
              html += `<div class="event-set-gutter" aria-hidden="true" style="flex:0 0 ${gutter}px"></div>`;
            }
            html += laneEventCardHtml(it.e, getLine(firstLineId));
          }
          html += `</div>`;
        });
        html += `</div></div>`;
        gridRow++;
      } else if (item.kind === "insert-before") {
        html += `<div class="evaxis-insert${item.setEdgeGap ? " set-edge-gap" : ""}" data-insert="${item.r - 1}" data-insert-before="1" data-chapter-id="${esc(
          item.chapterId !== undefined ? item.chapterId : rowChIds[item.r] || ""
        )}" data-section-id="${esc(item.secId || "")}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"></div>`;
        gridRow++;
      } else if (item.kind === "insert") {
        const insertIdx = collapsedSetLastRow.has(item.r) ? collapsedSetLastRow.get(item.r) : item.r;
        // 行尾那条缝：它属于**这一行**（线在它下面时，新事件就该待在这一章里）
        html += `<div class="evaxis-insert${item.setEdgeGap ? " set-edge-gap" : ""}" data-insert="${insertIdx}" data-chapter-id="${esc(
          rowChIds[item.r] || ""
        )}" data-section-id="${esc(rowSecIds[item.r] || "")}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"></div>`;
        gridRow++;
      } else if (item.kind === "set-inside-gap") {
        const rec = setInsideGapRows.get(item.setId) || {};
        rec[item.pos === "first" ? "first" : "last"] = gridRow;
        setInsideGapRows.set(item.setId, rec);
        const insideInsertIdx = item.pos === "first" ? item.r - 1 : item.r;
        html += `<div class="evaxis-insert set-inside-gap" data-insert="${insideInsertIdx}" data-set-inside-id="${esc(
          item.setId
        )}" data-set-inside-pos="${esc(
          item.pos
        )}" data-chapter-id="${esc(
          // 事件集内部的上 / 下缝：都用**下面那张成员卡**（集合成员这一行）的章 / 节
          rowChIds[item.r] || ""
        )}" data-section-id="${esc(
          rowSecIds[item.r] || ""
        )}" style="grid-column:1 / span ${COLS + 2};grid-row:${gridRow}"></div>`;
        gridRow++;
      }
    });
    // 事件集卡：跨所有成员行画一张红色 主色的竖卡，和集合内的事件卡并排。
    // 折叠时成员行只留占位高度；展开时成员卡显示在集合卡右侧，默认折叠。
    {
      const setIds = new Set();
      rowEvents.forEach((evs) => {
        (evs || []).forEach((e) => {
          const setId = eventSetIdForEvent(e);
          if (setId) setIds.add(setId);
        });
      });
      setIds.forEach((setId) => {
        const lineId = eventSetShownLineId(setId);
        if (!lineId || !laneIdx.has(lineId)) return;
        if (!eventSetIsExpanded(setId, lineId)) return;
        const members = eventSetMembers(setId).filter((e) => rowIndexByEventId.has(e.id));
        const gridRows = members
          .map((e) => gridRowByStoryRow.get(rowIndexByEventId.get(e.id)))
          .filter(Boolean);
        if (!gridRows.length) return;
        // 把集合框内的上 / 下缝隙也算进集合框（框内的缝隙属于集合，框外的不属于）。
        const gapRec = setInsideGapRows.get(setId) || {};
        if (gapRec.first !== undefined) gridRows.push(gapRec.first);
        if (gapRec.last !== undefined) gridRows.push(gapRec.last);
        const startRow = Math.min.apply(null, gridRows);
        const endRow = Math.max.apply(null, gridRows);
        const line = getLine(lineId);
        const usedLanes = [];
        members.forEach((e) => {
          linesOf(e).forEach((lid) => {
            const li = laneIdx.get(lid);
            if (li !== undefined && !usedLanes.includes(li)) usedLanes.push(li);
          });
        });
        if (usedLanes.length) {
          const minLane = Math.min.apply(null, usedLanes);
          const maxLane = Math.max.apply(null, usedLanes);
          // 整体外框：明确圈出这些行属于同一个事件集
          html += `<div class="event-set-frame" style="grid-column:${minLane + 2} / span ${
            maxLane - minLane + 1
          };grid-row:${startRow} / span ${endRow - startRow + 1}"></div>`;
        }
        html += eventSetOverlayHtml(
          getEventSet(setId),
          line,
          members,
          laneIdx.get(lineId),
          startRow,
          endRow - startRow + 1,
          setGutterByLaneId.get(lineId) || 62
        );
      });
    }
    // 线路分界线：鼠标放上去是左右拉伸箭头，拖它改这一列的宽度
    {
      let accX = ROW_LABEL_W;
      lanes.forEach((l, i) => {
        accX += colWs[i];
        html += `<div class="lane-resizer" data-lane-id="${esc(l.id)}" style="left:${accX}px" title="拖动＝调整这条线路的列宽（双击＝恢复自动宽度）"></div>`;
      });
    }
    html += `</div></div>`;
    tl.innerHTML = html;
    // 章节划分线（可上下拖动）
    const axisEl = tl.querySelector(".evaxis");
    if (axisEl) {
      // 章 / 节分界线不再额外叠细虚线：章节带 / 节带本身就是拖拽体。
      tl.querySelectorAll(".evaxis-band.chapter[data-chapter-id]").forEach((band) => {
        if (band.dataset.empty === "1") {
          bindEmptyChapterBandDrag(band, band.dataset.chapterId);
          return;
        }
        const segIndex = parseInt(band.dataset.seg, 10);
        if (Number.isFinite(segIndex)) bindChapterBandDrag(band, segIndex);
      });
      // 节分界线：整块节带都可以按住拖动。
      tl.querySelectorAll(".evaxis-band.section[data-section-id]").forEach((band) => {
        if (band.dataset.empty === "1") bindEmptySectionBandDrag(band, band.dataset.sectionId);
        else bindSectionBandDrag(band, band.dataset.sectionId);
      });
    }
    bindTimeline();
    renderChrono(); // 事件轴重画完，时间线也同步刷新（两者都以「线路」为一条轴）
  }

  // 节的分界线：可上下拖动调整这一节的起始行，右键可设置起始位置
  // 某一节当前的起始行（1 起算）
  function sectionStartRow(sectionId) {
    const { rowEvents } = currentAxisRows();
    const secIds = rowDominants(rowEvents, "sectionId");
    const i = secIds.findIndex((sid) => sid === sectionId);
    return i < 0 ? 0 : i + 1;
  }

  // 把某一节的起始行移到第 targetRow 行（targetRow＝全量 1 起算的 #）
  function moveSectionStart(sectionId, targetRow) {
    const sr = getSection(sectionId);
    if (!sr) return;
    const chapter = sr.chapter;
    const secs = chapter.sections || [];
    const si = secs.findIndex((s) => s.id === sectionId);
    const prev = si > 0 ? secs[si - 1] : null;
    // 归属一律按全量行算：线路筛选只影响“画不画”，不能把隐藏线路上的事件漏掉
    const all = axisRows();
    const chapRows = [];
    all.forEach((row, r) => {
      if ((row.items || []).some((e) => (e.chapterId || "") === chapter.id)) chapRows.push(r);
    });
    if (!chapRows.length) {
      renderTimeline();
      return;
    }
    const own = chapRows.filter((r) => (all[r].items || []).some((e) => (e.sectionId || "") === sectionId));
    const start = own.length ? own[0] + 1 : chapRows[0] + 1;
    const end = own.length ? own[own.length - 1] + 1 : chapRows[0] + 1;
    // 本章第一节：它的起点就是章首，不能单独挪（和第一章的分界线一样）
    if (si === 0) {
      renderTimeline();
      return;
    }
    // 允许范围：不能越过上一节（有事件的话）的起点，也不能越过自己的最后一行
    // 上一节的起点是 prevRows[0]（0 基），本节的起点至少要在它的下一行（1 基＝prevRows[0]+2）
    const lo = chapRows[0] + 1;
    const t = Math.max(lo, Math.min(end + 1, targetRow));
    if (t === start) {
      renderTimeline();
      return;
    }
    const loRow = Math.min(start, t);
    const hiRow = Math.max(start, t);
    pendingUndoLabel = `移动「${sr.section.title}」的起始 # 到 #${t}`;
    all.forEach((row, r) => {
      const line = r + 1;
      if (line < loRow || line > hiRow - 1) return;
      (row.items || []).forEach((e) => {
        if ((e.chapterId || "") !== chapter.id) return;
        if (t < start) e.sectionId = sectionId;
        else e.sectionId = prev ? prev.id : "";
      });
    });
    repairSectionContinuity(chapter.id);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
  }

  // 右键菜单：按行号移动节的起始行
  // 设置某一节的起始位置：N 与章一致，分界线落在第 N-1 行和第 N 行之间。
  // 第 N 行（1 起算）对应的「界线值」：就是拖动分界线时算的那个 storyIndex
  // （第 1 行＝最前面那条之前；超过末行＝最后一条之后）
  function storyValueAtRow(rows, n) {
    const vals = (rows || [])
      .map((r) => {
        const e = (r.items || [])[0];
        return e && typeof e.storyIndex === "number" ? e.storyIndex : null;
      })
      .filter((v) => v !== null);
    if (!vals.length) return 0;
    if (n <= 1) return vals[0] - 1;
    if (n > vals.length) return vals[vals.length - 1] + 1;
    return (vals[n - 2] + vals[n - 1]) / 2;
  }

  // 某一节「起始 #」能填的范围（1 起算的行号），以及它是不是「空节 / 空章」。
  // 空节没有事件、靠分界线（anchorStory）定位：填 K 表示 #K 起到下一节开头之前都归这一节。
  function sectionStartBounds(sr) {
    const chapter = sr.chapter;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === sr.section.id);
    const rows = axisRows();
    const chapRows = [];
    rows.forEach((row, i) => {
      if ((row.items || []).some((e) => (e.chapterId || "") === chapter.id)) chapRows.push(i);
    });
    const ownsRow = (i, secId) =>
      (rows[i].items || []).some((e) => (e.chapterId || "") === chapter.id && (e.sectionId || "") === secId);
    if (!chapRows.length) {
      return { empty: true, chapterEmpty: true, lo: 1, hi: rows.length + 2, next: null, nextFirst: undefined };
    }
    const own = chapRows.filter((i) => ownsRow(i, sr.section.id));
    if (own.length) {
      return { empty: false, chapterEmpty: false, lo: 1, hi: rows.length + 2, next: null, nextFirst: undefined };
    }
    // 往后找第一个「有事件的节」：这一节最多放到它的开头之前
    let next = null;
    let nextFirst;
    for (let j = si + 1; j < sections.length && nextFirst === undefined; j++) {
      const f = chapRows.find((i) => ownsRow(i, sections[j].id));
      if (f !== undefined) {
        next = sections[j];
        nextFirst = f;
      }
    }
    const lastRow = chapRows[chapRows.length - 1];
    return {
      empty: true,
      chapterEmpty: false,
      lo: 1,
      hi: nextFirst === undefined ? lastRow + 2 : nextFirst + 1,
      next,
      nextFirst,
    };
  }

  // 设置某一节的起始位置：N 表示分界线落在第 N-1 行和第 N 行之间（N=1 放到最前面）。
  // 返回 { ok, changed, start, empty }；ok=false 时 msg 是要给用户看的原因。
  function setSectionStartPosition(sectionId, rawN) {
    const sr = getSection(sectionId);
    if (!sr) return { ok: false, msg: "这一节找不到了。" };
    const chapter = sr.chapter;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === sectionId);
    if (si < 0) return { ok: false, msg: "这一节找不到了。" };
    const rows = axisRows();
    const M = rows.length;
    if (!M) return { ok: false, msg: "事件轴上还没有事件。" };
    const N = parseInt(String(rawN).trim(), 10);
    if (!Number.isFinite(N) || N < 1) return { ok: false, msg: "请输入一个不小于 1 的 # 号。" };
    const bounds = sectionStartBounds(sr);
    if (bounds.empty) {
      // 这一节（整章）还没有事件：改的是分界线，不是事件归属。
      // 顺势把 #N 起到下一节开头之前的行收进来（漏识别的内容手工归位）。
      if (N > bounds.hi) {
        return {
          ok: false,
          msg: bounds.next
            ? `下一节「${bounds.next.title}」从 #${bounds.nextFirst + 1} 开始，最多只能填 #${bounds.hi}。`
            : `本章最后一行是 #${M}，最多只能填 #${bounds.hi}。`,
        };
      }
      let changed = 0;
      if (!bounds.chapterEmpty) {
        const stop = bounds.nextFirst === undefined ? M : bounds.nextFirst;
        for (let r = N - 1; r < stop; r++) {
          (rows[r].items || []).forEach((e) => {
            if ((e.chapterId || "") !== chapter.id) return;
            if ((e.sectionId || "") !== sectionId) {
              e.sectionId = sectionId;
              changed++;
            }
          });
        }
        if (changed) repairSectionContinuity(chapter.id);
      }
      sr.section.anchorStory = storyValueAtRow(rows, N);
      // 空章里的第一节：它的分界线就是这一章的分界线，把章一起挪，免得两条带子分开
      if (si === 0 && bounds.chapterEmpty) chapter.anchorStory = sr.section.anchorStory;
      // 手填 # 号把节线挪进事件集里 → 归属变掉的那半拆出集合（整块一起换节的不动）
      splitSetsCutByBoundaries();
      return { ok: true, changed: changed + 1, start: N, empty: true };
    }
    const chapterRows = [];
    rows.forEach((row, i) => {
      if (row.items && row.items.some((e) => (e.chapterId || "") === chapter.id)) chapterRows.push(i);
    });
    const chStart = chapterRows[0];
    const chEnd = chapterRows[chapterRows.length - 1];
    let useN = N;
    if (useN > M + 2) useN = chEnd + 2;
    // 用户填 K：这一节从 K 开始，一直管到下一节开始之前（K ~ N-1）。
    // 只调整这一节和相邻两节的边界，不整章重排。
    let startIdx = Math.max(chStart, Math.min(chEnd + 1, useN - 1));
    const nextSection = si < sections.length - 1 ? sections[si + 1] : null;
    const nextFirst = nextSection
      ? chapterRows.find((i) => (rows[i].items || []).some((e) => e.sectionId === nextSection.id))
      : undefined;
    const nextStart = nextFirst === undefined ? chEnd + 1 : nextFirst;
    if (si === 0) startIdx = chStart;
    startIdx = Math.min(startIdx, nextStart);
    const prevSection = si > 0 ? sections[si - 1] : null;
    let changed = 0;
    // K 到下一节开始之前，全部归这一节
    for (let r = startIdx; r < nextStart; r++) {
      (rows[r].items || []).forEach((e) => {
        if ((e.chapterId || "") !== chapter.id) return;
        if ((e.sectionId || "") !== sectionId) {
          e.sectionId = sectionId;
          changed++;
        }
      });
    }
    // 这一节原本在 K 之前的行，交给上一节
    for (let r = chStart; r < startIdx; r++) {
      (rows[r].items || []).forEach((e) => {
        if ((e.chapterId || "") !== chapter.id) return;
        if ((e.sectionId || "") !== sectionId) return;
        e.sectionId = prevSection ? prevSection.id : "";
        changed++;
      });
    }
    // 手填 # 号把节线挪进事件集里 → 归属变掉的那半拆出集合（整块一起换节的不动）
    splitSetsCutByBoundaries();
    repairSectionContinuity(chapter.id);
    return { ok: true, changed, start: startIdx + 1, empty: false };
  }

  async function promptSetSectionStart(sectionId) {
    const sr = getSection(sectionId);
    if (!sr) return;
    const chapter = sr.chapter;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === sectionId);
    const M = axisRows().length;
    if (!M) {
      uiAlert("事件轴上还没有事件。");
      return;
    }
    const bounds = sectionStartBounds(sr);
    // 有事件的章里，第一节的界线就是章分界线，不能单独挪（挪了前面会露出「未分节」的缝）
    if (si === 0 && !bounds.chapterEmpty) {
      uiAlert(
        `「${sr.section.title}」是本章第一节，起点固定在本章最前面。\n\n` +
          `想调整它到哪结束，请设置下一节的起始位置。`
      );
      return;
    }
    const cur = sectionStartRow(sectionId) || 1;
    const hint = bounds.empty
      ? `设置「${sr.section.title}」的起始 #（#K 到下一节开头之前都归这一节，可填 1 ~ ${bounds.hi}）：`
      : `设置「${sr.section.title}」的起始 #（分界线在第 N-1 和第 N 行之间；N=1 放到最前面，填大于 ${M + 2} 放到最后）：`;
    const v = await uiPrompt(
      hint,
      String(cur)
    );
    if (v === null) return;
    const N = parseInt(String(v).trim(), 10);
    if (!Number.isFinite(N) || N < 1) {
      uiAlert("请输入一个不小于 1 的 # 号。");
      return;
    }
    const res = setSectionStartPosition(sectionId, N);
    if (!res || !res.ok) {
      uiAlert((res && res.msg) || "这个位置放不了，换个 # 再试。");
      return;
    }
    const at = res.start || N;
    if (res.changed) {
      pendingUndoLabel = `设置「${sr.section.title}」的起始位置`;
      saveState();
      renderChapterRail();
      renderTimeline();
      renderMatrix();
      renderStats();
      renderChrono();
      const posText = at <= 1 ? "最前面" : at > M + 1 ? "最后面" : `#${at - 1} 和 #${at} 之间`;
      showToast(`「${sr.section.title}」的分界线已放到 ${posText}`);
    } else {
      showToast(`「${sr.section.title}」本来就从 #${at} 开始，位置没变`);
    }
  }

  // 设置某一节的起止行
  // 分界线落点高亮：targetRow 正好是某章 / 某节的起始行时，高亮那条分带；
  // 否则高亮那一行事件（分界线落在它的上沿），避免「显示在章节线下方」的错觉。
  function evaxisGuideForRow(axis, targetRow) {
    if (!axis || !Number.isFinite(targetRow)) return null;
    return (
      axis.querySelector(`.evaxis-band.chapter[data-row="${targetRow}"]`) ||
      axis.querySelector(`.evaxis-band.section[data-row="${targetRow}"]`) ||
      axis.querySelector(`.evaxis-row[data-row="${targetRow}"]`) ||
      null
    );
  }

  // 拖章节线时的落点示意：如果紧挨着事件集的框外缝，就高亮那条缝（而不是行 / 带本身）。
  function evaxisGuideForBoundary(axis, targetRow) {
    // 折叠的事件集没有单独的「框外缝」：落点就在集合卡上一行那条普通缝上。
    const row = axis.querySelector(`.evaxis-row[data-row="${targetRow}"]`);
    if (row && row.querySelector(".event-set-card")) {
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains("evaxis-insert")) return prev;
    }
    const base = evaxisGuideForRow(axis, targetRow);
    if (!base) return null;
    const br = base.getBoundingClientRect();
    let best = null;
    let bestD = 26;
    axis.querySelectorAll(".evaxis-insert.set-edge-gap").forEach((s) => {
      const sr = s.getBoundingClientRect();
      const d = Math.abs(sr.top - br.top);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    });
    return best || base;
  }

  /* 事件轴上排在这条章带上面的那条章带的章 id（空章也算，返回 "" ＝ 上面那条是「未分章」，
     null ＝ 上面没有章带）。节带跳过、继续往上找——「上一章」就是用户看到的那一条。 */
  function chapterBandAbove(bandEl) {
    if (!bandEl) return null;
    let n = bandEl.previousElementSibling;
    while (n) {
      if (n.classList && n.classList.contains("evaxis-band")) {
        if (n.dataset.sectionId) {
          n = n.previousElementSibling;
          continue;
        }
        if (n.dataset.chapterId !== undefined) return n.dataset.chapterId || "";
      }
      n = n.previousElementSibling;
    }
    return null;
  }

  // 章节带整块拖动：向下拖到某一行的上半，就把章节分界线放到这一行前面。
  function bindChapterBandDrag(el, segIndex) {
    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const updateTarget = (x, y) => {
      const axis = el.parentElement;
      if (!axis) return;
      const rect = axis.getBoundingClientRect();
      const rows = Array.from(axis.querySelectorAll(".evaxis-row"));
      let targetRow = null;
      rows.forEach((row) => {
        if (targetRow !== null) return;
        const rr = row.getBoundingClientRect();
        const top = rr.top - rect.top;
        if (y - rect.top < top + rr.height / 2) {
          targetRow = parseInt(row.dataset.row, 10);
        }
      });
      if (targetRow === null && rows.length) {
        const lastRow = rows[rows.length - 1];
        targetRow = parseInt(lastRow.dataset.row, 10) + 1;
      }
      el.dataset.targetRow = targetRow === null ? "" : String(targetRow);
      axis.querySelectorAll(".evaxis-row.drop-guide, .evaxis-band.drop-guide, .evaxis-insert.drop-guide").forEach((x) => x.classList.remove("drop-guide"));
      const guide = evaxisGuideForBoundary(axis, targetRow);
      if (guide) guide.classList.add("drop-guide");
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest("button")) return;
      pointerId = ev.pointerId;
      startY = ev.clientY;
      try {
        el.setPointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
    });
    el.addEventListener("pointermove", (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 5) return;
        dragging = true;
        el.classList.add("band-dragging");
      }
      ev.preventDefault();
      lastX = ev.clientX;
      lastY = ev.clientY;
      updateDragAutoScroll(lastX, lastY);
      setDragAutoScrollTickHook(() => updateTarget(lastX, lastY));
      updateTarget(lastX, lastY);
    });
    const finish = (ev) => {
      if (pointerId === null) return;
      try {
        el.releasePointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
      pointerId = null;
      setDragAutoScrollTickHook(null);
      stopDragAutoScroll();
      if (!dragging) return;
      dragging = false;
      el.classList.remove("band-dragging");
      el.__justDragged = true;
      const tr = parseInt(el.dataset.targetRow || "", 10);
      if (segIndex <= 0) {
        // 段索引 0 ＝ 第一个「有事件的段」，但它前面可能还站着一个空章：那这条线照样能拖
        const segCh = ((currentAxisRows().segs || [])[segIndex] || {}).chapterId || "";
        const chapters0 = state.chapters || [];
        const ci0 = chapters0.findIndex((x) => x.id === segCh);
        if (ci0 <= 0) {
          showToast("第一章的起始位置固定在最前面，不能上移");
          renderTimeline();
          setTimeout(() => {
            el.__justDragged = false;
          }, 0);
          return;
        }
      }
      if (!isNaN(tr)) moveChapterBoundary(segIndex, tr, chapterBandAbove(el));
      else renderTimeline();
      setTimeout(() => {
        el.__justDragged = false;
      }, 0);
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
  }

  // 节分界线：整块节带都可以按住拖动，而不是只能拖上沿那条细虚线。
  // 章节线拖动时，算「这条线要落在哪个故事行（0 起）之前」。
  // 展开的事件集被当成一个整体块：集合内部的缝不能作为落点，
  // 指针在块的上半 → 吸到集合上方（外部缝），在块的下半 → 吸到集合下方（外部缝）。
  function bandDragTargetRow(axis, relY) {
    const rows = Array.from(axis.querySelectorAll(".evaxis-row"));
    if (!rows.length) return 0;
    const setIdOf = (row) => {
      const c = row.querySelector(".event-card[data-member-set-id]");
      if (c) return c.dataset.memberSetId;
      const sc = row.querySelector(".event-set-card[data-event-set-id]");
      return sc ? sc.dataset.eventSetId : "";
    };
    for (let i = 0; i < rows.length; i++) {
      const rr = rows[i].getBoundingClientRect();
      const top = rr.top - axis.getBoundingClientRect().top;
      const bottom = rr.bottom - axis.getBoundingClientRect().top;
      if (relY < top) return parseInt(rows[i].dataset.row, 10);
      const sid = setIdOf(rows[i]);
      if (sid) {
        let first = i;
        let last = i;
        while (first > 0 && setIdOf(rows[first - 1]) === sid) first--;
        while (last + 1 < rows.length && setIdOf(rows[last + 1]) === sid) last++;
        const blockTop = rows[first].getBoundingClientRect().top - axis.getBoundingClientRect().top;
        const blockBottom = rows[last].getBoundingClientRect().bottom - axis.getBoundingClientRect().top;
        if (relY < blockBottom) {
          // 集合覆盖的故事行区间：折叠 / 展开都要按「成员的真实行区间」算，而不是只看可见格子行。
          const members = eventSetMembers(sid);
          let rFirst = parseInt(rows[first].dataset.row, 10);
          let rLast = parseInt(rows[last].dataset.row, 10);
          if (members.length) {
            const vFirst = Math.min.apply(null, members.map((e) => e.storyIndex || 0));
            const vLast = Math.max.apply(null, members.map((e) => e.storyIndex || 0));
            const iFirst = evaxisValues.indexOf(vFirst);
            const iLast = evaxisValues.indexOf(vLast);
            if (iFirst >= 0) rFirst = iFirst;
            if (iLast >= 0) rLast = iLast;
          }
          // 集合是不可切开的整体块：指针在块的上半 → 落到集合上方的外缝，
          // 在块的下半 → 落到集合下方的外缝。
          return relY < (blockTop + blockBottom) / 2 ? rFirst : rLast + 1;
        }
        i = last;
        continue;
      }
      if (relY < top + rr.height / 2) return parseInt(rows[i].dataset.row, 10);
    }
    return parseInt(rows[rows.length - 1].dataset.row, 10) + 1;
  }

  function bindSectionBandDrag(el, sectionId) {
    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const updateTarget = (x, y) => {
      const axis = el.parentElement;
      if (!axis) return;
      const rect = axis.getBoundingClientRect();
      const targetRow = bandDragTargetRow(axis, y - rect.top);
      el.dataset.targetRow = String(targetRow);
      axis.querySelectorAll(".evaxis-row.drop-guide, .evaxis-band.drop-guide, .evaxis-insert.drop-guide").forEach((x) => x.classList.remove("drop-guide"));
      const guide = evaxisGuideForBoundary(axis, targetRow);
      if (guide) guide.classList.add("drop-guide");
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest("button")) return;
      pointerId = ev.pointerId;
      startY = ev.clientY;
      try {
        el.setPointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
    });
    el.addEventListener("pointermove", (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 5) return;
        dragging = true;
        el.classList.add("band-dragging");
      }
      ev.preventDefault();
      lastX = ev.clientX;
      lastY = ev.clientY;
      updateDragAutoScroll(lastX, lastY);
      setDragAutoScrollTickHook(() => updateTarget(lastX, lastY));
      updateTarget(lastX, lastY);
    });
    const finish = (ev) => {
      if (pointerId === null) return;
      try {
        el.releasePointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
      pointerId = null;
      setDragAutoScrollTickHook(null);
      stopDragAutoScroll();
      if (!dragging) return;
      dragging = false;
      el.classList.remove("band-dragging");
      el.__justDragged = true;
      const sr = getSection(sectionId);
      const secs = sr ? sr.chapter.sections || [] : [];
      const si = secs.findIndex((s) => s.id === sectionId);
      if (si === 0) {
        showToast("这是本章第一节，起点固定在本章最前面，不能上移");
        renderTimeline();
        setTimeout(() => {
          el.__justDragged = false;
        }, 0);
        return;
      }
      const tr = parseInt(el.dataset.targetRow || "", 10);
      // tr 是“画出来的”边界行号（0 基）→ 换算成全量 1 起算的 # 再交给 moveSectionStart
      if (!isNaN(tr)) moveSectionStart(sectionId, canonicalBoundaryRowOf(tr) + 1);
      else renderTimeline();
      setTimeout(() => {
        el.__justDragged = false;
      }, 0);
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
  }

  // 空章 / 空节没有事件可改归属，拖动时改它们的 anchorStory：
  // 这样没有事件纳入的分界线也能上下拖动。
  function bindEmptyBandDrag(el, onDrop) {
    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const updateTarget = (x, y) => {
      const axis = el.parentElement;
      if (!axis) return;
      const rect = axis.getBoundingClientRect();
      const rows = Array.from(axis.querySelectorAll(".evaxis-row"));
      const targetRow = bandDragTargetRow(axis, y - rect.top);
      el.dataset.targetRow = String(targetRow);
      axis.querySelectorAll(".evaxis-row.drop-guide, .evaxis-band.drop-guide, .evaxis-insert.drop-guide").forEach((x) => x.classList.remove("drop-guide"));
      // 落点显示：如果这一行正好是某章/节的起始行，高亮那条分带（而不是它下面的行）
      const guide = targetRow <= parseInt(rows[rows.length - 1].dataset.row, 10) ? evaxisGuideForBoundary(axis, targetRow) : null;
      if (guide) guide.classList.add("drop-guide");
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest("button")) return;
      pointerId = ev.pointerId;
      startY = ev.clientY;
      try {
        el.setPointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
    });
    el.addEventListener("pointermove", (ev) => {
      if (pointerId === null || ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 5) return;
        dragging = true;
        el.classList.add("band-dragging");
      }
      ev.preventDefault();
      lastX = ev.clientX;
      lastY = ev.clientY;
      updateDragAutoScroll(lastX, lastY);
      setDragAutoScrollTickHook(() => updateTarget(lastX, lastY));
      updateTarget(lastX, lastY);
    });
    const finish = (ev) => {
      if (pointerId === null) return;
      try {
        el.releasePointerCapture(pointerId);
      } catch (e) {
        /* ignore */
      }
      pointerId = null;
      setDragAutoScrollTickHook(null);
      stopDragAutoScroll();
      if (!dragging) return;
      dragging = false;
      el.classList.remove("band-dragging");
      el.__justDragged = true;
      const axis = el.parentElement;
      const rows = axis ? Array.from(axis.querySelectorAll(".evaxis-row")) : [];
      const values = rows.map((r) => parseFloat(r.dataset.value)).filter((v) => Number.isFinite(v));
      const idx = parseInt(el.dataset.targetRow || "", 10);
      let value = null;
      if (Number.isFinite(idx)) {
        if (!values.length) value = 0;
        else if (idx <= 0) value = values[0] - 1;
        else if (idx >= values.length) value = values[values.length - 1] + 1;
        else value = (values[idx - 1] + values[idx]) / 2;
      }
      if (value !== null) onDrop(value, idx);
      else renderTimeline();
      setTimeout(() => {
        el.__justDragged = false;
      }, 0);
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
  }

  function bindEmptyChapterBandDrag(el, chapterId) {
    bindEmptyBandDrag(el, (value, targetRow) => {
      dropEmptyChapterAt(chapterId, value, targetRow);
    });
  }

  function bindEmptySectionBandDrag(el, sectionId) {
    bindEmptyBandDrag(el, (value) => {
      dropEmptySectionAt(sectionId, value);
    });
  }

  // 把 bindEmptyBandDrag 算出的 storyIndex 落点转成 1 起算的行号 N：
  // 找到第一个 storyIndex >= value 的行；没有（拖到最后）则返回 M+1。
  function emptyBandValueToRowN(value) {
    const rows = axisRows();
    if (!rows.length) return 1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].v || 0) >= value) return i + 1;
    }
    return rows.length + 1;
  }

  // 空章 / 空节的分界线不允许把事件集切开：如果落点落在某个集合内部，
  // 就自动吸到整个集合之后（和普通章节线拖拽一致）。
  function emptyBandSnapRowN(N) {
    const rows = axisRows();
    if (!rows.length) return N;
    const setRange = new Map();
    rows.forEach((row, r) => {
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
    let target = N - 1; // 0 起算：分界线放在这一行之前
    setRange.forEach((rng) => {
      if (target > rng.s0 && target <= rng.s1) target = rng.s1 + 1;
    });
    return target + 1;
  }

  // 拖动空章的分界线：改它的 anchorStory，并把「分界线之后、直到下一个有事件的章之前」
  // 的事件自动归入这个章（这样漏掉的事件能被这条空章分界线收进来）。
  function dropEmptyChapterAt(chapterId, value, targetRow) {
    const c = getChapter(chapterId);
    if (!c) return;
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((x) => x.id === chapterId);
    if (ci < 0) return;
    const rows = axisRows();
    pendingUndoLabel = `移动空章「${c.title}」`;
    if (!rows.length) {
      c.anchorStory = value;
      saveState();
      renderChapterRail();
      renderTimeline();
      renderMatrix();
      renderStats();
      renderChrono();
      return;
    }
    if (ci === 0) {
      // 第一章（可能是空章）的起点固定在整篇最前面：拖它就等于拖「它和下一个有事件的章」之间那条线。
      const segsNow = currentAxisRows().segs || [];
      const si = segsNow.findIndex((s) => s.chapterId && s.chapterId !== chapterId);
      if (si >= 0 && Number.isFinite(Number(targetRow))) {
        // 这条线就是「这个空章」和下一个有事件的章之间的那条：被打下来的行归这个空章
        moveChapterBoundary(si, Number(targetRow), chapterId);
        return;
      }
      showToast("第一章的起始位置固定在最前面，不能移动");
      renderTimeline();
      return;
    }
    // 空章夹在「上一个有事件的章」和「下一个有事件的章」之间：它的分界线
    // 只能在这两章起点之间移动，先夹到合法范围，再吸过事件集，最后再夹一次。
    let prevFirst = 0;
    for (let j = ci - 1; j >= 0; j--) {
      const f = rows.findIndex((row) => (row.items || []).some((e) => (e.chapterId || "") === chapters[j].id));
      if (f >= 0) {
        prevFirst = f;
        break;
      }
    }
    let nextFirst = rows.length;
    for (let j = ci + 1; j < chapters.length; j++) {
      const f = rows.findIndex((row) => (row.items || []).some((e) => (e.chapterId || "") === chapters[j].id));
      if (f >= 0) {
        nextFirst = f;
        break;
      }
    }
    let N = emptyBandValueToRowN(value);
    N = Math.max(prevFirst + 1, Math.min(nextFirst + 1, N));
    N = emptyBandSnapRowN(N);
    N = Math.max(prevFirst + 1, Math.min(nextFirst + 1, N));
    // 只在「本空章分界线之后、下一个有事件的章之前」的范围内改归属：
    // 往上拖收进上一章的事件；绝不碰下一章的事件。
    // （空章拖拽时它本身没有事件，往下拖自然就停在原地，不会把下一章吸过来。）
    for (let r = N - 1; r < nextFirst; r++) {
      (rows[r].items || []).forEach((e) => {
        if ((e.chapterId || "") === chapterId) return;
        e.chapterId = chapterId;
        e.sectionId = "";
        if (e.eventSetAssign && Object.keys(e.eventSetAssign).length) e.eventSetAssign = {};
      });
    }
    c.anchorStory = storyValueAtRow(rows, N);
    repairChapterContinuity();
    repairSectionContinuity(chapterId);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
  }

  // 拖动空节的分界线：把「分界线之后、直到本章下一节之前」的事件自动归入这一节。
  function dropEmptySectionAt(sectionId, value) {
    const sr = getSection(sectionId);
    if (!sr) return;
    const rows = axisRows();
    pendingUndoLabel = `移动空节「${sr.section.title}」`;
    if (!rows.length) {
      sr.section.anchorStory = value;
      saveState();
      renderChapterRail();
      renderTimeline();
      renderMatrix();
      renderStats();
      renderChrono();
      return;
    }
    const bounds = sectionStartBounds(sr);
    if (!bounds.empty) {
      // 这一节已经有事件了（正常不会走到这里），退回普通节拖拽逻辑。
      moveSectionStart(sectionId, emptyBandValueToRowN(value));
      return;
    }
    let N = emptyBandValueToRowN(value);
    N = emptyBandSnapRowN(N);
    N = Math.max(1, Math.min(bounds.hi, N));
    const res = setSectionStartPosition(sectionId, N);
    if (!res || !res.ok) {
      renderTimeline();
      return;
    }
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
  }

  // 把第 segIndex 个章节的起始行移动到 targetRow
  function currentAxisRows() {
    const all = axisEvents();
    const lanes = lineFilterLanes();
    const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
    const visible = all.filter((e) => linesOf(e).some((id) => laneIdx.has(id)));
    const values = Array.from(new Set(visible.map((e) => (e.storyIndex || 0)))).sort((a, b) => a - b);
    const rowEvents = values.map((v) => visible.filter((e) => (e.storyIndex || 0) === v));
    const segs = [];
    const chIds = rowDominants(rowEvents, "chapterId");
    rowEvents.forEach((evs, r) => {
      const chId = chIds[r];
      const last = segs[segs.length - 1];
      if (!last || last.chapterId !== chId) segs.push({ chapterId: chId, startRow: r, endRow: r });
      else last.endRow = r;
    });
    return { rowEvents, segs };
  }

  /* 把「画出来的那一行」换算成全量行（线路筛选只影响画不画，# 和章节归属一律按全量算）：
     · canonicalIndexOfVisibleRow(visIdx)：画出来的第 visIdx 行（0 基）在全量行里的行号（0 基）
     · canonicalBoundaryRowOf(R)：画出来的“边界行号”（0 基，边界在第 R 行之前）→ 全量边界行号 */
  function canonicalIndexOfVisibleRow(visIdx) {
    if (!evaxisValues.length || visIdx < 0 || visIdx >= evaxisValues.length) return -1;
    const v = evaxisValues[visIdx];
    const all = axisRows();
    for (let i = 0; i < all.length; i++) {
      if ((all[i].v || 0) === v) return i;
    }
    return -1;
  }
  function canonicalBoundaryRowOf(R) {
    if (R <= 0) return 0;
    const m = evaxisValues.length;
    if (!m || R >= m) return axisRows().length;
    /* 「跟着上一条可见行」：这条边界在画面上就落在「第 R-1 条可见行」的正下方，
       所以全量边界 = 那条可见行的全量行号 + 1。
       夹在两条可见行之间、被线路筛选藏起来的行，算分界线**下面**那一章 / 那一节
       （否则「落点显示在 #2/3，线却落到 #4 后面」）。 */
    const c = canonicalIndexOfVisibleRow(R - 1);
    return c < 0 ? 0 : c + 1;
  }

  function showBandMenu(x, y, chapterId, sectionId) {
    hideContextMenu();
    const items = [];
    const hasSection = !!sectionId;
    const hasChapter = !!chapterId && !hasSection;
    items.push({
      label: hasSection ? "选中本节事件" : hasChapter ? "选中本章事件" : "选中未分章事件",
      act: () => selectBandEvents(chapterId, sectionId),
    });
    if (hasSection) {
      const sr0 = getSection(sectionId);
      const secs0 = sr0 ? sr0.chapter.sections || [] : [];
      const si0 = secs0.findIndex((s) => s.id === sectionId);
      const firstLocked = si0 === 0 && (state.events || []).some((e) => (e.chapterId || "") === sr0.chapter.id);
      items.push({ label: "重命名本节", act: () => renameSection(sectionId) });
      items.push({ label: "上移一节", disabled: si0 === 0, act: () => moveSectionRelative(sectionId, -1) });
      items.push({ label: "下移一节", act: () => moveSectionRelative(sectionId, 1) });
      items.push({ label: "在上方插入节…", act: () => insertSectionAbove(sectionId) });
      items.push({ label: "在下方插入节…", act: () => insertSectionBelow(sectionId) });
      items.push({ label: "设置本节起始位置…", disabled: firstLocked, act: () => promptSetSectionStart(sectionId) });
      items.push({ label: "删除节", act: () => deleteSection(sectionId) });
      items.push({ label: "删除节全部事件", act: () => deleteSectionWithEvents(sectionId) });
    } else if (hasChapter) {
      const chapters = state.chapters || [];
      const ci = chapters.findIndex((c) => c.id === chapterId);
      items.push({ label: "重命名本章", act: () => renameChapter(chapterId) });
      items.push({ label: "在下方插入节", act: () => addSectionBelowChapter(chapterId) });
      items.push({ label: "上移一章", disabled: ci === 0, act: () => moveChapterRelative(chapterId, -1) });
      items.push({ label: "下移一章", disabled: ci === chapters.length - 1, act: () => moveChapterRelative(chapterId, 1) });
      items.push({ label: "设置本章起始位置…", disabled: ci === 0, act: () => promptSetChapterStart(chapterId) });
      items.push({ label: "删除章", act: () => deleteChapter(chapterId) });
      items.push({ label: "删除章全部事件", act: () => deleteChapterWithEvents(chapterId) });
    }
    const ch = chapterId ? getChapter(chapterId) : null;
    const sr = sectionId ? getSection(sectionId) : null;
    const menuTitle = sr
      ? `「${sr.section.title}」 · ${sr.chapter.title || ""}`
      : ch
        ? `「${ch.title}」`
        : "未分章";
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      `<div class="context-menu-title">${esc(menuTitle)}</div>` +
      items
        .map(
          (it, i) =>
            `<div class="context-menu-item ${it.disabled ? "disabled" : ""}" data-i="${i}"><span class="line-name">${esc(
              it.label
            )}</span></div>`
        )
        .join("");
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", () => {
        if (el.classList.contains("disabled")) return;
        hideContextMenu();
        const it = items[parseInt(el.dataset.i, 10)];
        if (it) it.act();
      })
    );
  }

  function selectBandEvents(chapterId, sectionId) {
    // 章节边栏现在在二维事件图 / 时间线里也有：这里点「选中本章 / 本节事件」，
    // 结果（高亮 + 批量条）都在事件轴上，先把页面切回事件轴再选。
    if (currentTab !== "timeline") switchTab("timeline");
    mergeSelectMode = true;
    selectPurpose = "select";
    mergeSelected = new Set();
    const vis = new Set(shownEventIds()); // 「全选本组」也只选显示出来的那些
    state.events.forEach((e) => {
      if (!vis.has(e.id)) return;
      if (sectionId) {
        if (e.sectionId === sectionId) mergeSelected.add(e.id);
      } else if ((e.chapterId || "") === (chapterId || "")) {
        mergeSelected.add(e.id);
      }
    });
    renderTimeline();
    renderMergeSelectBar();
  }

  // 「全选本章 / 全选本节」：以最后点的那个事件为基准，把它所在的整章 / 整节一起选中
  // （同一组已经全选中时再点一下＝把这组取消）
  function pickWholeBand(kind) {
    const ids = Array.from(mergeSelected).filter((id) => getEvent(id));
    if (!ids.length) {
      showToast("先点一个事件，再点「全选本章 / 全选本节」");
      return;
    }
    const anchor = getEvent(ids[ids.length - 1]);
    const inBand = (e) =>
      kind === "section"
        ? !!anchor.sectionId && e.sectionId === anchor.sectionId
        : (e.chapterId || "") === (anchor.chapterId || "");
    const visIds = new Set(shownEventIds()); // 「全选本章 / 本节」也只选显示出来的那些
    const band = state.events.filter((e) => inBand(e) && visIds.has(e.id));
    if (!band.length) {
      showToast(kind === "section" ? "这个事件没有归到某个节" : "这个事件没有归到某一章");
      return;
    }
    const allOn = band.every((e) => mergeSelected.has(e.id));
    band.forEach((e) => {
      if (allOn) mergeSelected.delete(e.id);
      else mergeSelected.add(e.id);
    });
    const chapter = anchor.chapterId ? getChapter(anchor.chapterId) : null;
    const sr = anchor.sectionId ? getSection(anchor.sectionId) : null;
    const label =
      kind === "section"
        ? sr
          ? sr.section.title
          : "本节"
        : chapter
          ? chapter.title
          : "未分章";
    renderTimeline();
    renderMergeSelectBar();
    showToast(allOn ? `已取消「${label}」的 ${band.length} 个事件` : `已全选「${label}」的 ${band.length} 个事件`);
  }

  // 统一的右键菜单渲染
  function renderContextMenu(x, y, title, items) {
    hideContextMenu();
    showCtxPoint(x, y); // 让用户看到「右键点的是哪儿」
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      (title ? `<div class="context-menu-title">${esc(title)}</div>` : "") +
      items
        .map(
          (it, i) =>
            `<div class="context-menu-item ${it.active ? "active" : ""} ${it.disabled ? "disabled" : ""}${
              it.danger ? " danger" : ""
            }"${
              it.tip ? ` title="${esc(it.tip)}"` : ""
            } data-i="${i}"><span class="line-name">${esc(it.label)}</span></div>`
        )
        .join("");
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", () => {
        if (el.classList.contains("disabled")) return;
        hideContextMenu();
        const it = items[parseInt(el.dataset.i, 10)];
        // 延后一拍执行：有些菜单项会再开一个子菜单，否则会被「点空白关菜单」的全局监听顺手关掉
        if (it && it.act) setTimeout(() => it.act(), 0);
      })
    );
  }

  // 记住「要放在哪里」，再打开新建事件弹窗
  // 根据点击位点（storyIndex）自动判断新建事件的默认章 / 节。
  function defaultChapterSectionForStory(storyIndex) {
    const rows = axisRows();
    const si = Number(storyIndex);
    if (!rows.length || !Number.isFinite(si)) return { chapterId: "", sectionId: "" };
    let at = rows.findIndex((r) => (r.v || 0) >= si);
    if (at < 0) at = rows.length - 1;
    const cntC = new Map();
    const cntS = new Map();
    (rows[at].items || []).forEach((e) => {
      const c = e.chapterId || "";
      cntC.set(c, (cntC.get(c) || 0) + 1);
      const s = e.sectionId || "";
      cntS.set(s, (cntS.get(s) || 0) + 1);
    });
    let ch = "";
    let chN = 0;
    cntC.forEach((n, c) => {
      if (n > chN) {
        chN = n;
        ch = c;
      }
    });
    let sec = "";
    let secN = 0;
    cntS.forEach((n, s) => {
      if (n > secN) {
        secN = n;
        sec = s;
      }
    });
    return { chapterId: ch, sectionId: sec };
  }

  // 通过顶部「新建事件」按钮新建时：自动放到屏幕正中间那一行，并沿用该行的章 / 节。
  function centerPlaceForNewEvent() {
    const wrap = document.querySelector(".timeline-wrap");
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const row = nearestAxisRow(rect.top + rect.height / 2, Infinity);
    if (!row) return null;
    const storyIndex = parseFloat(row.dataset.value);
    const rowIdx = parseInt(row.dataset.row, 10);
    const { rowEvents, segs } = currentAxisRows();
    const seg = segs.find((s) => rowIdx >= s.startRow && rowIdx <= s.endRow);
    const chapterId = seg ? seg.chapterId : "";
    const sectionId = rowDominants(rowEvents, "sectionId")[rowIdx] || "";
    return {
      storyIndex: Number.isFinite(storyIndex) ? storyIndex : null,
      chapterId,
      sectionId,
      lineId: lineFilterDefaultId(),
    };
  }

  function startNewEventAt(storyIndex, lineId, chapterId, sectionId, setId) {
    const si = storyIndex === null || storyIndex === undefined ? NaN : Number(storyIndex);
    let ch = chapterId || "";
    let sec = sectionId || "";
    if (!ch) {
      const d = defaultChapterSectionForStory(si);
      ch = d.chapterId;
      sec = d.sectionId;
    }
    pendingEventPlace = {
      storyIndex: Number.isFinite(si) ? si : null,
      lineId: lineId || "",
      chapterId: ch,
      sectionId: sec,
      setId: setId || "",
    };
    openEventModal(null);
  }

  /* 位置标签统一格式：「#N・[A]」（某一行）/「#N/M・[A]」（两行之间）——
     只写行号 + 线路代码，不写事件名 / 线路名。行号一律按全量行算，不受线路筛选影响。 */
  function placeLabel(storyIndex, laneId) {
    const lane = getLine(laneId);
    const v = axisRows().map((row) => row.v || 0);
    const target = Number(storyIndex);
    const i = v.findIndex((x) => Math.abs(x - target) < 1e-9);
    let pos;
    if (i >= 0) {
      pos = `#${i + 1}`;
    } else {
      let k = -1;
      for (let j = 0; j < v.length; j++) {
        if (v[j] < target) k = j;
        else break;
      }
      if (!v.length || k < 0) pos = "#1 之前";
      else if (k >= v.length - 1) pos = `#${v.length} 之后`;
      else pos = `#${k + 1}/${k + 2}`;
    }
    const code = lane ? String(lane.code || lane.name || "").trim() : "";
    return code ? `${pos}・[${code}]` : pos;
  }

  /* ---- 事件轴上的「鼠标所指位置」小标签：悬停 / 拖拽时跟着指针显示 #N・[线路代码] ---- */
  function axisPosTagEl() {
    let el = $("#axis-pos-tag");
    if (!el) {
      el = document.createElement("div");
      el.id = "axis-pos-tag";
      el.className = "axis-pos-tag";
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }
  function showAxisPosTag(label, x, y) {
    const el = axisPosTagEl();
    if (!label) {
      el.hidden = true;
      return;
    }
    if (el.textContent !== label) el.textContent = label;
    el.hidden = false;
    // 摆在鼠标右下角；右边 / 下边放不开就自动翻到左上（并换算 html zoom）
    placeFloatingAtCursor(el, x, y, 14, 14);
  }
  function hideAxisPosTag() {
    const el = $("#axis-pos-tag");
    if (el) el.hidden = true;
  }
  let axisPosTagDocBound = false;
  // 拖到事件轴以外、松手、滚轮滚动这些情况下，位置提示会过期：一次性挂几个全局兜底收起
  function bindAxisPosTagDocHide() {
    if (axisPosTagDocBound) return;
    axisPosTagDocBound = true;
    document.addEventListener(
      "dragover",
      (ev) => {
        const t = ev.target;
        if (!t || !t.closest || !t.closest("#timeline .evaxis")) hideAxisPosTag();
      },
      true
    );
    document.addEventListener("dragend", hideAxisPosTag, true);
    document.addEventListener("drop", hideAxisPosTag, true);
    document.addEventListener("scroll", hideAxisPosTag, true);
  }
  // 鼠标下的元素 → 位置标签；落在章节 / 节分界带上就没有位置可说，返回空（隐藏）
  function axisLabelAt(target, clientX) {
    if (!target || !target.closest) return "";
    const strip = target.closest(".evaxis-insert");
    if (strip) {
      const k = parseInt(strip.dataset.insert, 10);
      const laneId = laneIdFromX(strip.closest(".evaxis-grid") || strip, clientX);
      return placeLabel(insertValueAt(Number.isFinite(k) ? k : -1), laneId);
    }
    const card = target.closest(".event-card[data-event-id]");
    if (card) {
      const e = getEvent(card.dataset.eventId);
      if (!e) return "";
      const laneId = laneIdFromX(card.closest(".evaxis-grid") || card, clientX);
      return placeLabel(e.storyIndex || 0, laneId);
    }
    const row = target.closest(".evaxis-row");
    if (row) {
      const v = Number(row.dataset.value);
      const laneId = laneIdFromX(row, clientX);
      return placeLabel(Number.isFinite(v) ? v : 0, laneId);
    }
    return "";
  }

  /* 落点用的新行值：一定**新开一行**，绝不复用某条已有行的 storyIndex。
     复用＝和那一行挤在同一行（同一行同线路＝两张卡叠一起的挤占），所以只能往上新开。
     位置＝紧跟在 x 之下、且不越过 x 之上最近的那个已存在行值：
     这样即使两条可见行之间夹着被线路筛选藏起来的行，也不会落进那条看不见的行里。 */
  function nextStoryValueAfter(x) {
    let next = null;
    state.events.forEach((e) => {
      const s = Number(e.storyIndex) || 0;
      if (s > x && (next === null || s < next)) next = s;
    });
    return next === null ? x + 1 : (x + next) / 2;
  }
  function prevStoryValueBefore(x) {
    let prev = null;
    state.events.forEach((e) => {
      const s = Number(e.storyIndex) || 0;
      if (s < x && (prev === null || s > prev)) prev = s;
    });
    return prev === null ? x - 1 : (prev + x) / 2;
  }

  // 行值落点：r 是「可见行下标」，新行落在第 r 条可见行的下面（即 #r 与 #r+1 之间）。
  function insertValueAt(r) {
    const v = evaxisValues;
    if (!v.length) return 0;
    if (r < 0) return prevStoryValueBefore(v[0]);
    if (r >= v.length - 1) return nextStoryValueAfter(v[v.length - 1]);
    return nextStoryValueAfter(v[r]);
  }

  // 空章 / 空节带后面那条「插入 / 拖拽落点」缝隙对应的虚拟行号（data-insert 用）。
  function virtualInsertIndexFor(anchor) {
    const v = evaxisValues;
    if (!v.length) return 0;
    if (anchor <= v[0]) return -1;
    if (anchor >= v[v.length - 1]) return v.length - 1;
    for (let i = 0; i < v.length - 1; i++) {
      if (anchor >= v[i] && anchor <= v[i + 1]) return i;
    }
    return v.length - 1;
  }

  // 在事件轴右侧 / 行间这类「不属于任何一行」的空白处右键时，
  // 用鼠标的纵向位置反推最近的时间行，避免只能放到最后一行
  function nearestAxisRow(clientY, maxDist) {
    let best = null;
    let bestDist = Infinity;
    $$("#timeline .evaxis-row").forEach((row) => {
      const rect = typeof row.getBoundingClientRect === "function" ? row.getBoundingClientRect() : null;
      if (!rect || !rect.height) return;
      // 鼠标落在这一行的纵向范围内就算命中（距离 0），否则按到边缘的距离远近取最近
      let d;
      if (clientY < rect.top) d = rect.top - clientY;
      else if (clientY > rect.bottom) d = clientY - rect.bottom;
      else d = 0;
      if (d < bestDist) {
        bestDist = d;
        best = row;
      }
    });
    const limit = typeof maxDist === "number" ? maxDist : 80;
    if (best && bestDist <= limit) return best;
    return null;
  }

  // 在时间行的空白处右键：可以在这里直接加事件，也可以从这里开始分章
  function showRowMenu(x, y, rowIndex, storyValue, laneId) {
    const lane = getLine(laneId);
    /* 这一行已经有事件（别的线路上有卡片）时，新建的如果也塞进这一行就会和它挤在一起。
       规则：改放到**下一行**（这一行与下一行之间新开一行），章 / 节沿用点中的这一行，
       免得顺手掉进下一章去。 */
    const occupied = !!(axisRows()[rowIndex] && (axisRows()[rowIndex].items || []).length);
    const story = occupied ? insertValueAt(rowIndex) : storyValue;
    const rv = occupied ? currentAxisRows() : null;
    const chId = occupied ? rowDominants(rv.rowEvents, "chapterId")[rowIndex] || "" : "";
    const secId = occupied ? rowDominants(rv.rowEvents, "sectionId")[rowIndex] || "" : "";
    renderContextMenu(x, y, placeLabel(storyValue, laneId), [
      { label: lane ? `新建事件（${lineLabel(lane)}）` : "新建事件", act: () => startNewEventAt(story, laneId, chId, secId) },
      { label: "插入章", act: () => insertChapterAtRow(rowIndex) },
      { label: "插入节", act: () => insertSectionAtRow(rowIndex) },
      ...foldMenuItems(),
    ]);
  }

  // 两个时间点之间的空隙
  // setId：在展开的事件集内部空隙右键新建时，新事件要直接并入这个集合
  function showInsertMenu(x, y, insertAfter, laneId, chapterId, sectionId, setId, stripEl) {
    const lane = getLine(laneId);
    const storyValue = insertValueAt(insertAfter);
    /* 「插入章 / 插入节」要看这条缝是不是紧贴在某个章 / 节分带的下面：
       是的话 ＝ 插到这一章 / 这一节内容的开头——这一段自己变成空章 / 空节，
       新章 / 新节吸收它下面的事件（不这样的话，新章会被插到它前面变成「空章在上面」）。 */
    const bandAbove =
      stripEl && stripEl.previousElementSibling && stripEl.previousElementSibling.classList &&
      stripEl.previousElementSibling.classList.contains("evaxis-band")
        ? stripEl.previousElementSibling
        : null;
    const topChapterId = bandAbove && bandAbove.dataset.chapterId ? bandAbove.dataset.chapterId : "";
    const topSectionId = bandAbove && bandAbove.dataset.sectionId ? bandAbove.dataset.sectionId : "";
    renderContextMenu(x, y, placeLabel(storyValue, laneId), [
      { label: "新建事件", act: () => startNewEventAt(storyValue, laneId, chapterId, sectionId, setId) },
      // 事件集内部也允许插章 / 节：插进去会把事件集拆开（下半部分脱离集合），和插入章一致
      { label: "插入章", act: () => insertChapterAtRow(insertAfter + 1, topChapterId) },
      { label: "插入节", act: () => insertSectionAtRow(insertAfter + 1, chapterId, topSectionId) },
      ...foldMenuItems(),
    ]);
  }

  // 右键事件卡片：编辑它，或紧挨着它再加一个
  function copyItemName(name) {
    const base = String(name || "").trim() || "未命名";
    const m = base.match(/^(.*)_(\d+)$/);
    if (m) return `${m[1]}_${parseInt(m[2], 10) + 1}`;
    return `${base}_1`;
  }

  function eventSetIdForLine(e, lineId) {
    if (!e || !lineId) return "";
    return (e.eventSetAssign && e.eventSetAssign[lineId]) || "";
  }

  // 事件集现在是跨线路的：一个事件只认一个 setId，但会写到自己所属的每条线路上，
  // 这样渲染 / 删除 / 全选都可以按「同一个集合」处理，不再按线路拆分。
  function eventSetIdForEvent(e) {
    if (!e || !e.eventSetAssign || typeof e.eventSetAssign !== "object") return "";
    for (const v of Object.values(e.eventSetAssign)) {
      if (v) return v;
    }
    return "";
  }

  function eventSetMembers(setId) {
    if (!setId) return [];
    return orderedByStory().filter((e) => eventSetIdForEvent(e) === setId);
  }

  // 跨线路事件集固定画在参与线路里最靠左的那一条，避免同一集合在每条线上重复出现。
  function eventSetLeftLineId(setId) {
    if (!setId) return "";
    const lineOrder = (state.lines || []).map((l) => l.id);
    let best = "";
    let bestIdx = Infinity;
    eventSetMembers(setId).forEach((e) => {
      linesOf(e).forEach((lid) => {
        const i = lineOrder.indexOf(lid);
        if (i >= 0 && i < bestIdx) {
          bestIdx = i;
          best = lid;
        }
      });
    });
    return best;
  }

  /* 只给显示用（集合本身的归属 / 拖拽 / 展开状态一律还是走 eventSetLeftLineId）：
     跨线路事件集画在参与线路里最靠左的那一条；那条线正好被「按线路筛选」藏起来时，
     改画在「当前显示着的成员线路」里最靠左的一条——否则集合卡整个画不出来，
     这条线上剩下的成员看着就像散落的普通事件，看不出它还在事件集里。 */
  function eventSetShownLineId(setId) {
    const left = eventSetLeftLineId(setId);
    if (!left || !lineFilter.size || lineFilter.has(left)) return left;
    const lineOrder = (state.lines || []).map((l) => l.id);
    let best = "";
    let bestIdx = Infinity;
    eventSetMembers(setId).forEach((e) => {
      linesOf(e).forEach((lid) => {
        if (!lineFilter.has(lid)) return;
        const i = lineOrder.indexOf(lid);
        if (i >= 0 && i < bestIdx) {
          bestIdx = i;
          best = lid;
        }
      });
    });
    return best || left;
  }

  // 同一纵轴行（同一 storyIndex）的事件必须同属一个集合，或都不属于任何集合。
  function eventsInSameRow(e) {
    if (!e) return [];
    const v = e.storyIndex || 0;
    return state.events.filter((x) => (x.storyIndex || 0) === v);
  }

  function applyEventSetToEvent(e, setId) {
    if (!e) return;
    const oldSetId = eventSetIdForEvent(e);
    e.eventSetAssign = e.eventSetAssign || {};
    const lineIds = linesOf(e);
    Object.keys(e.eventSetAssign).forEach((lid) => {
      if (!lineIds.includes(lid)) delete e.eventSetAssign[lid];
    });
    lineIds.forEach((lid) => {
      e.eventSetAssign[lid] = setId;
    });
    if (oldSetId && oldSetId !== setId) pruneEventSetIfEmpty(oldSetId);
  }

  function assignEventToSetAllLines(e, setId) {
    if (!e) return;
    // 同行事件自动跟着入集，保证同一行不会一个在集合内、一个在集合外。
    eventsInSameRow(e).forEach((x) => applyEventSetToEvent(x, setId));
  }

  // onlySelf=true 时只动这一个事件；否则连带同一行的其它事件一起移出
  // （拖拽移出集合时用 onlySelf，避免把同行的其它线路成员误伤）。
  function removeEventFromSet(e, setId, onlySelf) {
    if (!e) return;
    (onlySelf ? [e] : eventsInSameRow(e)).forEach((x) => {
      if (!x.eventSetAssign) return;
      Object.keys(x.eventSetAssign).forEach((lid) => {
        if (x.eventSetAssign[lid] === setId) delete x.eventSetAssign[lid];
      });
    });
  }

  // 拖动事件时：如果它本来在事件集里，而落点在整个事件集的上方或下方，
  // 就把它从事件集移除（事件本身保留，落在新位置）。
  function detachEventFromSetIfOutside(e, targetStoryIndex) {
    const setId = eventSetIdForEvent(e);
    if (!setId) return false;
    const t = Number(targetStoryIndex);
    if (!Number.isFinite(t)) return false;
    // 判断“拖出集合”要连它自己当前所在的行一起算：否则把第一个成员拖回自己这一行时，
    // 会误判成落在集合上方而把它移出集合。
    const members = eventSetMembers(setId);
    if (!members.length) return false;
    const vals = members.map((m) => m.storyIndex || 0);
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    if (t < min || t > max) {
      expandedSetMembers.delete(e.id);
      // 事件要挪到集合外面去了：只把它自己移出，同行的其它线路成员留在集合里。
      removeEventFromSet(e, setId, true);
      expandedEventSets.delete(eventSetExpandKey(setId, eventSetLeftLineId(setId)));
      pruneEventSetIfEmpty(setId);
      return true;
    }
    return false;
  }

  // 事件集真正的成员列表：不套用当前事件检索，避免拖动加入时因搜索隐藏成员而误判。
  function eventSetExpandKey(setId, lineId) {
    // 事件集现在是跨线路的全局集合，展开状态只认 setId，线路变化时也保持展开 / 折叠。
    return setId;
  }

  function eventSetIsExpanded(setId, lineId) {
    return expandedEventSets.has(eventSetExpandKey(setId, lineId));
  }

  // 找出这个事件当前挂在哪个「已展开」的事件集里（兼容事件属于多条线路的情况）。
