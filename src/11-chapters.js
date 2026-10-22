  /* ================= 章 / 节 ================= */
  function renderChapterRail() {
    const list = $("#chapter-list");
    const empty = $("#chapter-empty");
    if (!list) return;
    const chapters = state.chapters || [];
    // 章 / 节各自占的行区间（跟事件轴上的分段带完全一致）
    const bandRanges = axisBandRanges();
    const rangeOf = (segs, id, field) => {
      // 同一章如果被拆成多段（比如并行分析把章节顺序打乱了）．
      // 不能只取第一段；这里取整章覆盖的最早～最晚行号。
      const mine = segs.filter((s) => s[field] === id);
      if (!mine.length) return "";
      const start = Math.min(...mine.map((s) => s.startRow)) + 1;
      const end = Math.max(...mine.map((s) => s.endRow)) + 1;
      return `（#${start}:${end}）`;
    };
    empty.hidden = chapters.length > 0;
    // 没有章的时候也留一个插入点：删掉顶栏的「＋ 章」按钮后，这里是手动建章的唯一入口
    const insertTop = `<div class="chapter-insert" data-after="" title="在最前面插入一章">
          <button class="icon-btn chapter-insert-btn" data-after="">＋</button>
          <span class="chapter-insert-tip">在最前面插入一章</span>
        </div>`;
    list.innerHTML =
      insertTop +
      chapters
      .map((c) => {
        const count = state.events.filter((e) => e.chapterId === c.id).length;
        let html = `<div class="chapter-item" data-chapter-id="${esc(c.id)}">
          <div class="chapter-row" title="双击＝定位到事件轴里这一章的分界线">
            <button class="icon-btn ch-toggle" data-chapter-id="${esc(c.id)}" title="${c.collapsed ? "展开" : "折叠"}">${c.collapsed ? "▶" : "▼"}</button>
            <span class="chapter-title">${esc(c.title)}</span>
            <span class="chapter-range">${esc(rangeOf(bandRanges.chapterSegs, c.id, "chapterId"))}</span>
            <span class="chapter-actions">
              <button class="icon-btn ch-add-sec" data-chapter-id="${esc(c.id)}" title="在这一章下新建小节">＋</button>
              <button class="icon-btn ch-edit" data-chapter-id="${esc(c.id)}" title="重命名本章">✎</button>
              <button class="icon-btn ch-del" data-chapter-id="${esc(c.id)}" title="删除章（只删分章线，事件并入上一章）">×</button>
            </span>
          </div>`;
        if (!c.collapsed) {
          html += (c.sections || [])
            .map((s) => {
              const scount = state.events.filter((e) => e.sectionId === s.id).length;
              return `<div class="section-row" data-section-id="${esc(s.id)}" title="双击＝定位到事件轴里这一节的分界线">
                <button class="icon-btn sec-toggle" data-section-id="${esc(s.id)}" title="${s.collapsed ? "展开" : "折叠"}">${s.collapsed ? "▶" : "▼"}</button>
                <span class="chapter-title">${esc(s.title)}</span>
                <span class="chapter-range">${esc(rangeOf(bandRanges.sectionSegs, s.id, "sectionId"))}</span>
                <span class="chapter-actions">
                  <button class="icon-btn sec-edit" data-section-id="${esc(s.id)}" title="重命名本节">✎</button>
                  <button class="icon-btn sec-del" data-section-id="${esc(s.id)}" title="删除节（只删分节线，事件并入上一节）">×</button>
                </span>
              </div>`;
            })
            .join("");
          html += `<div class="section-add" data-chapter-id="${esc(c.id)}" title="给「${esc(c.title)}」新建一个小节"><span>＋ 新建</span></div>`;
        }
        html += `</div>`;
        // 章节之间的插入点：在这里新建一章（不会打乱前面各章的相对顺序）
        html += `<div class="chapter-insert" data-after="${esc(c.id)}" title="在「${esc(c.title)}」后面插入一章">
          <button class="icon-btn chapter-insert-btn" data-after="${esc(c.id)}">＋</button>
          <span class="chapter-insert-tip">在这里插入一章</span>
        </div>`;
        return html;
      })
      .join("");
    bindChapterRail();
    if (typeof refreshNovelOutlineIfVisible === "function") refreshNovelOutlineIfVisible();
  }

  // 把元素滚到滚动容器的正中间（默认只上下居中；要横向也居中就传 { h: true }）
  function centerInScroller(scroller, el, opts) {
    if (!scroller || !el) return false;
    const sr = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const dy = r.top - sr.top - (sr.height - r.height) / 2;
    if (dy) scroller.scrollTop += Math.round(dy);
    if (opts && opts.h) {
      const dx = r.left - sr.left - (sr.width - r.width) / 2;
      if (dx) scroller.scrollLeft += Math.round(dx);
    }
    return true;
  }

  function flashLocatedEl(el) {
    if (!el) return;
    el.classList.add("flash-band");
    el.classList.add("jump-flash");
    setTimeout(() => el.classList.remove("flash-band"), 1500);
    setTimeout(() => el.classList.remove("jump-flash"), 1800);
  }

  // 这条章 / 节分界线大致落在哪个 storyIndex 上（有事件就取它第一个事件，空章 / 空节用锚点）
  function matrixBandAnchorValue(chapterId, sectionId) {
    if (sectionId) {
      const sr = getSection(sectionId);
      if (!sr) return null;
      const vals = state.events.filter((e) => e.sectionId === sectionId).map((e) => e.storyIndex || 0);
      return vals.length ? Math.min.apply(null, vals) : sectionAnchorStoryFor(sr.chapter, sr.section);
    }
    const vals = state.events.filter((e) => (e.chapterId || "") === (chapterId || "")).map((e) => e.storyIndex || 0);
    if (vals.length) return Math.min.apply(null, vals);
    return chapterAnchorStory(chapterId);
  }

  // 二维事件图里每一行事件（按 storyIndex 排序）
  function matrixRowValues() {
    return Array.from(new Set(storyEventsShown().map((e) => e.storyIndex || 0))).sort((a, b) => a - b);
  }

  // 当前画出来的第一行事件（虚拟滚动时只有一段在 DOM 里）
  function matrixFirstRenderedRowValue(grid) {
    const first = grid.querySelector(".m-row-hdr[data-event-id]");
    if (!first) return null;
    const e = getEvent(first.dataset.eventId);
    return e ? e.storyIndex || 0 : null;
  }

  // 二维事件图：把这一章 / 节的线滚到屏幕中间（空章 / 空节在二维图里也有线，所以照样能定位）
  // 二维图是虚拟滚动的：只画当前可见的那一段，所以不能直接按 DOM 找元素，
  // 要先按它在整篇里的位置估一个滚动点，再用「当前画出来的第一行」修正，反复逼近。
  function locateBandInMatrix(chapterId, sectionId) {
    const box = $("#matrix-scroll");
    const grid = $("#matrix");
    if (!box || !grid) return;
    const sel = sectionId
      ? `.m-band.section[data-section-id="${sectionId}"]`
      : `.m-band.chapter[data-chapter-id="${chapterId || ""}"]`;
    const rows = matrixRowValues();
    const anchor = matrixBandAnchorValue(chapterId, sectionId);
    if (anchor === null || !rows.length) {
      showToast("二维事件图里还没有这条分界线");
      return;
    }
    const at = rows.findIndex((v) => v >= anchor);
    const rank = at < 0 ? rows.length : at; // 这条线前面有多少行事件
    const maxScroll = matrixScrollInfo().max;
    let target = Math.round((rank / rows.length) * maxScroll);
    const ROW_H = 22.5; // 事件行高（分带行更矮，欠冲一点没关系：渲染窗口上下各留了 600px 缓冲）
    for (let k = 0; k < 5; k++) {
      matrixScrollTo(Math.max(0, Math.min(maxScroll, target))); // 自绘滚动：没有原生 scrollTop
      let el = grid.querySelector(sel);
      if (el) {
        /* 表头固定占 60px：把这条线居中在「表头以下」的可视区（不再用原生 scrollTop） */
        const sr = box.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const dy = r.top - (sr.top + 60) - (sr.height - 60 - r.height) / 2;
        if (Math.abs(dy) >= 1) matrixScrollTo(matrixScrollInfo().top + dy);
        el = grid.querySelector(sel);
        flashLocatedEl(el);
        return;
      }
      const refV = matrixFirstRenderedRowValue(grid);
      if (refV === null) break;
      const refRank = rows.indexOf(refV);
      if (refRank < 0) break;
      const next = target + (rank - refRank) * ROW_H;
      if (Math.abs(next - target) < 20) break;
      target = next;
    }
    showToast("二维事件图里还没有这条分界线");
  }

  // 时间线：把这一章 / 节的第一个事件滚到屏幕中间；空章 / 空节不滚
  function locateBandInChrono(chapterId, sectionId) {
    const scroller = $(".chrono-body");
    if (!scroller) return;
    const inBand = (e) =>
      sectionId ? e.sectionId === sectionId : (e.chapterId || "") === (chapterId || "");
    const hit = (state.events || [])
      .slice()
      .sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0))
      .filter(inBand)[0];
    if (!hit) return; // 空章 / 空节：按约定不滚动
    const card = scroller.querySelector(`.chrono-card[data-event-id="${esc(hit.id)}"]`);
    if (!card) return;
    centerInScroller(scroller, card, { h: true });
    flashLocatedEl(card);
  }

  // 双击章节栏里的章 / 节：在哪个界面就按哪个界面的方式定位
  //   事件轴：滚到它那条分界线并闪一下；二维事件图：滚到对应的章 / 节线；时间线：滚到这一章 / 节的第一个事件
  function locateBandInAxis(chapterId, sectionId) {
    if (currentTab === "matrix") return locateBandInMatrix(chapterId, sectionId);
    if (currentTab === "chrono") return locateBandInChrono(chapterId, sectionId);
    const tl = $("#timeline");
    if (!tl) return;
    const sel = sectionId
      ? `.evaxis-band.section[data-section-id="${sectionId}"]`
      : `.evaxis-band.chapter[data-chapter-id="${chapterId || ""}"]`;
    let el = tl.querySelector(sel);
    let name = "";
    let fallbackTo = "";
    if (sectionId) {
      const sr = getSection(sectionId);
      name = sr ? sr.section.title : "";
      if (!el) fallbackTo = sr ? sr.chapter.id : "";
    } else {
      const c = getChapter(chapterId);
      name = c ? c.title : "未分章";
    }
    // 这一段还没有事件时，往后找最近一个有分界线的章
    if (!el && !sectionId) {
      const list = state.chapters || [];
      const idx = list.findIndex((c) => c.id === (chapterId || ""));
      for (let k = idx + 1; k < list.length; k++) {
        const cand = tl.querySelector(`.evaxis-band.chapter[data-chapter-id="${list[k].id}"]`);
        if (cand) {
          el = cand;
          fallbackTo = list[k].title;
          break;
        }
      }
    }
    if (!el && fallbackTo) el = tl.querySelector(`.evaxis-band.chapter[data-chapter-id="${fallbackTo}"]`);
    if (!el) {
      showToast(`「${name || "这一段"}」还没有事件，事件轴上没有它的分界线`);
      return;
    }
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (e) {
      /* 忽略：滚动不可用时至少还能看到闪烁提示 */
    }
    flashLocatedEl(el);
    showToast(fallbackTo ? `「${name || "这一段"}」还没有事件，已定位到它后面最近的分界线` : `已定位到「${name || ""}」的分界线`);
  }

  function bindChapterRail() {
    $$("#chapter-list .ch-toggle").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const c = getChapter(b.dataset.chapterId);
        if (!c) return;
        c.collapsed = !c.collapsed;
        saveState();
        renderChapterRail();
        renderTimeline();
        renderMatrix();
      })
    );
    $$("#chapter-list .sec-toggle").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const r = getSection(b.dataset.sectionId);
        if (!r) return;
        r.section.collapsed = !r.section.collapsed;
        saveState();
        renderChapterRail();
        renderTimeline();
        renderMatrix();
      })
    );
    $$("#chapter-list .ch-edit").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        renameChapter(b.dataset.chapterId);
      })
    );
    $$("#chapter-list .sec-edit").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        renameSection(b.dataset.sectionId);
      })
    );
    $$("#chapter-list .ch-del").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteChapter(b.dataset.chapterId);
      })
    );
    $$("#chapter-list .sec-del").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteSection(b.dataset.sectionId);
      })
    );
    $$("#chapter-list .ch-add-sec").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        addSection(b.dataset.chapterId);
      })
    );
    $$("#chapter-list .section-add").forEach((el) =>
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        addSection(el.dataset.chapterId);
      })
    );
    $$("#chapter-list .chapter-insert-btn").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        addChapterAt(b.dataset.after || "");
      })
    );
    // 双击章 / 节 → 跳到事件轴里对应的分界线
    $$("#chapter-list .chapter-row").forEach((el) =>
      el.addEventListener("dblclick", (ev) => {
        if (ev.target.closest("button")) return;
        const item = el.closest(".chapter-item");
        if (typeof novelIsCurrent === "function" && novelIsCurrent()) {
          novelScrollToChapter(item ? item.dataset.chapterId : "", "");
          return;
        }
        locateBandInAxis(item ? item.dataset.chapterId : "", "");
      })
    );
    $$("#chapter-list .section-row").forEach((el) =>
      el.addEventListener("dblclick", (ev) => {
        if (ev.target.closest("button")) return;
        const sr = el.dataset.sectionId ? getSection(el.dataset.sectionId) : null;
        if (typeof novelIsCurrent === "function" && novelIsCurrent()) {
          novelScrollToChapter(sr ? sr.chapter.id : "", el.dataset.sectionId || "");
          return;
        }
        locateBandInAxis(sr ? sr.chapter.id : "", el.dataset.sectionId || "");
      })
    );
    // 右键章节栏里的章节：弹出和右键章节线一样的菜单
    $$("#chapter-list .chapter-item").forEach((el) => {
      el.addEventListener("contextmenu", (ev) => {
        const id = el.dataset.chapterId;
        if (!id) return;
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, id, "");
        markContextTarget(el.querySelector(".chapter-row") || el);
      });
    });
    // 右键章节栏里的小节：对应的节菜单
    $$("#chapter-list .section-row").forEach((el) => {
      el.addEventListener("contextmenu", (ev) => {
        const sid = el.dataset.sectionId;
        const sr = sid ? getSection(sid) : null;
        if (!sr) return;
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, sr.chapter.id, sid);
        markContextTarget(el);
      });
    });
  }

  function newChapter(title) {
    const c = { id: uid(), title: title || "新章节", collapsed: false, sections: [] };
    state.chapters.push(c);
    return c;
  }

  // 新建 / 插入的章：把该章分界线之后、下一个有事件的章之前的事件并进来，
  // 和事件轴里「插入章」的规则对齐，避免建出一个空章。
  function absorbEventsIntoChapter(chapterId) {
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((c) => c.id === chapterId);
    if (ci < 0) return 0;
    const rows = axisRows();
    if (!rows.length) return 0;
    const anchor = chapterAnchorStory(chapterId);
    let R = rows.length;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].v || 0) >= anchor) {
        R = i;
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
    let changed = 0;
    for (let r = R; r < nextFirst && r < rows.length; r++) {
      (rows[r].items || []).forEach((e) => {
        if ((e.chapterId || "") === chapterId) return;
        e.chapterId = chapterId;
        e.sectionId = "";
        if (e.eventSetAssign && Object.keys(e.eventSetAssign).length) e.eventSetAssign = {};
        changed++;
      });
    }
    if (changed) {
      repairChapterContinuity();
      repairSectionContinuity(chapterId);
    }
    return changed;
  }

  // 在某一章后面插入一章（afterId 为空 = 插到最前面）；不会重排已有章节
  async function addChapterAt(afterId) {
    const list = state.chapters || [];
    const idx = afterId ? list.findIndex((c) => c.id === afterId) : -1;
    const at = idx >= 0 ? idx + 1 : 0;
    const after = idx >= 0 ? list[idx] : null;
    const t = await uiPrompt(
      after ? `在「${after.title}」后面插入一章，标题是？` : "在最前面插入一章，标题是？",
      chapterDefaultTitle(list.length + 1)
    );
    if (t === null) return;
    const c = { id: uid(), title: t.trim() || "新章节", collapsed: false, sections: [] };
    list.splice(at, 0, c);
    pendingUndoLabel = `新建章节：「${c.title}」（插在第 ${at + 1} 位）`;
    const absorbed = absorbEventsIntoChapter(c.id);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    showToast(
      absorbed
        ? `已插入「${c.title}」，并吸收 ${absorbed} 个事件`
        : after
          ? `已在「${after.title}」后面插入「${c.title}」`
          : `已把「${c.title}」插到最前面`
    );
  }

  async function renameChapter(id) {
    const c = getChapter(id);
    if (!c) return;
    const t = await uiPrompt("重命名章节？", c.title);
    if (t === null || !t.trim()) return;
    pendingUndoLabel = "重命名章节：「" + c.title + "」→「" + t.trim() + "」";
    c.title = t.trim();
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
  }

  function deleteChapter(id) {
    const c = getChapter(id);
    if (!c) return;
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((x) => x.id === id);
    if (ci < 0) return;
    // 只删分章线：内容并入上一个章；第一章没有「上一个」，就并入下一个章。
    const targetId = ci > 0 ? chapters[ci - 1].id : chapters[ci + 1] ? chapters[ci + 1].id : "";
    pendingUndoLabel = `删除「${c.title}」分章线（事件并入${targetId ? "相邻章" : "未分章"}）`;
    state.events.forEach((e) => {
      if (e.chapterId === id) {
        e.chapterId = targetId;
        e.sectionId = "";
      }
    });
    state.chapters = state.chapters.filter((x) => x.id !== id);
    repairChapterContinuity();
    repairSectionContinuity(targetId);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(
      targetId
        ? ci === 0
          ? `已删除「${c.title}」分章线，事件并入下一章`
          : `已删除「${c.title}」分章线，事件并入上一章`
        : `已删除「${c.title}」分章线，事件归入未分章`
    );
  }

  // 删除某一章，并把它下面的事件一起删掉（原来的「删除本章」整删行为）。
  async function deleteChapterWithEvents(id) {
    const c = getChapter(id);
    if (!c) return;
    const targets = state.events.filter((e) => e.chapterId === id);
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel(targets);
      if (!ok) return;
    }
    const ids = new Set(targets.map((e) => e.id));
    const setIds = new Set();
    state.events.forEach((e) => {
      if (!ids.has(e.id)) return;
      Object.values(e.eventSetAssign || {}).forEach((sid) => sid && setIds.add(sid));
    });
    pendingUndoLabel = `删除「${c.title}」及其 ${ids.size} 个事件`;
    state.events = state.events.filter((e) => !ids.has(e.id));
    state.order = (state.order || []).filter((oid) => !ids.has(oid));
    state.settings.entries.forEach((en) => {
      en.eventIds = (en.eventIds || []).filter((eid) => !ids.has(eid));
    });
    ids.forEach((eid) => {
      mergeSelected.delete(eid);
      expandedSetMembers.delete(eid);
    });
    setIds.forEach((sid) => pruneEventSetIfEmpty(sid));
    state.chapters = state.chapters.filter((x) => x.id !== id);
    repairChapterContinuity();
    repairSectionContinuity();
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    refreshLineViews();
    renderChapterRail();
    renderEntries();
    renderStats();
    showToast(`已删除「${c.title}」及其 ${ids.size} 个事件`);
  }

  // 整章上移 / 下移：这一章全体事件和分界线一起，放到上一章之前 / 下一章之后。
  // 章内事件相对顺序、各小节的划分都不动；只整体换位，并把行号重新排一遍。
  function moveChapterRelative(chapterId, dir) {
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((c) => c.id === chapterId);
    if (ci < 0) return;
    const ni = ci + dir;
    if (ni < 0 || ni >= chapters.length) {
      showToast(dir < 0 ? "这已经是第一章了" : "这已经是最后一章了");
      return;
    }
    const moving = chapters[ci];
    const neighbor = chapters[ni];
    // 1) 换章节数组里的顺序（章节边栏按它显示）
    const nextChapters = chapters.slice();
    const t = nextChapters[ci];
    nextChapters[ci] = nextChapters[ni];
    nextChapters[ni] = t;
    state.chapters = nextChapters;
    // 2) 按新的章节顺序重排事件：每章内部保持原来的先后；未分章的事件留在最后
    const idSet = new Set(nextChapters.map((c) => c.id));
    const buckets = new Map();
    const unassigned = [];
    orderedByStory().forEach((e) => {
      const cid = e.chapterId && idSet.has(e.chapterId) ? e.chapterId : "";
      if (!cid) {
        unassigned.push(e);
        return;
      }
      if (!buckets.has(cid)) buckets.set(cid, []);
      buckets.get(cid).push(e);
    });
    const seq = [];
    nextChapters.forEach((c) => {
      const list = buckets.get(c.id);
      if (list && list.length) seq.push(...list);
    });
    seq.push(...unassigned);
    seq.forEach((e, i) => {
      e.storyIndex = i;
    });
    state.order = seq.map((e) => e.id);
    // 3) 空章 / 空节没有事件、靠「分界线位置」显示：换位后它们的锚点要按新邻居重新算
    const evChapters = new Set();
    const evSections = new Set();
    state.events.forEach((e) => {
      if (e.chapterId) evChapters.add(e.chapterId);
      if (e.sectionId) evSections.add(e.sectionId);
    });
    [moving, neighbor].forEach((c) => {
      if (!c) return;
      if (!evChapters.has(c.id) && typeof c.anchorStory === "number") delete c.anchorStory;
      (c.sections || []).forEach((s) => {
        if (!evSections.has(s.id) && typeof s.anchorStory === "number") delete s.anchorStory;
      });
    });
    pendingUndoLabel = `${dir < 0 ? "上移" : "下移"}一章：「${moving.title}」`;
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(`${dir < 0 ? "上移" : "下移"}「${moving.title}」完成，行号已重新编号`);
  }

  // 小节上移 / 下移：这一节的事件一起放到上一节之前 / 下一节之后（只在本章内换位）。
  // 章内其它节、以及其它章的事件顺序都不动；空节靠分界线定位，换位后锚点按新邻居重新算。
  function moveSectionRelative(sectionId, dir) {
    const sr = getSection(sectionId);
    if (!sr) return;
    const chapter = sr.chapter;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === sectionId);
    if (si < 0) return;
    const ni = si + dir;
    if (ni < 0 || ni >= sections.length) {
      showToast(dir < 0 ? "这已经是本章第一节了" : "这已经是本章最后一节了");
      return;
    }
    const moving = sections[si];
    const neighbor = sections[ni];
    // 1) 换节数组里的顺序
    const nextSections = sections.slice();
    const t = nextSections[si];
    nextSections[si] = nextSections[ni];
    nextSections[ni] = t;
    chapter.sections = nextSections;
    // 2) 重排这一章的事件：按新节顺序，每节内部保持原来的先后；本章内未分节的事件留在本章末尾
    const secIds = new Set(nextSections.map((s) => s.id));
    const buckets = new Map();
    const rest = [];
    orderedByStory().forEach((e) => {
      if ((e.chapterId || "") !== chapter.id) return;
      if (e.sectionId && secIds.has(e.sectionId)) {
        if (!buckets.has(e.sectionId)) buckets.set(e.sectionId, []);
        buckets.get(e.sectionId).push(e);
      } else {
        rest.push(e);
      }
    });
    const block = [];
    nextSections.forEach((s) => {
      const list = buckets.get(s.id);
      if (list && list.length) block.push(...list);
    });
    block.push(...rest);
    // 3) 把新块放回原位置：本章事件原来第一次出现的位置
    const old = orderedByStory();
    const chapterEvIds = new Set(state.events.filter((e) => (e.chapterId || "") === chapter.id).map((e) => e.id));
    let insertAt = old.length;
    for (let i = 0; i < old.length; i++) {
      if (chapterEvIds.has(old[i].id)) {
        insertAt = i;
        break;
      }
    }
    const restSeq = old.filter((e) => !chapterEvIds.has(e.id));
    const seq = restSeq.slice(0, insertAt).concat(block, restSeq.slice(insertAt));
    seq.forEach((e, i) => {
      e.storyIndex = i;
    });
    state.order = seq.map((e) => e.id);
    // 4) 空节换位后，其分界线锚点按新邻居重新算
    const evSections = new Set();
    state.events.forEach((e) => {
      if (e.sectionId) evSections.add(e.sectionId);
    });
    [moving, neighbor].forEach((s) => {
      if (!evSections.has(s.id) && typeof s.anchorStory === "number") delete s.anchorStory;
    });
    pendingUndoLabel = `${dir < 0 ? "上移" : "下移"}一节：「${moving.title}」`;
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(`${dir < 0 ? "上移" : "下移"}「${moving.title}」完成，行号已重新编号`);
  }

  async function addSection(chapterId) {
    const c = getChapter(chapterId);
    if (!c) return;
    const t = await uiPrompt("新小节的标题？", sectionDefaultTitle((c.sections || []).length + 1));
    if (t === null) return;
        const title = t.trim() || uiTextFor("新小节");
    const chapterVals = state.events.filter((e) => (e.chapterId || "") === chapterId).map((e) => e.storyIndex || 0);
    const anchorStory = chapterVals.length ? Math.max.apply(null, chapterVals) : chapterAnchorStory(chapterId);
    const sec = { id: uid(), title, collapsed: false, anchorStory };
    c.sections = c.sections || [];
    c.sections.push(sec);
    // 自动识别：把该章里还没分节的事件并入这个新节（和事件轴「插入节」对齐）。
    let absorbed = 0;
    state.events.forEach((e) => {
      if ((e.chapterId || "") === chapterId && !(e.sectionId || "")) {
        e.sectionId = sec.id;
        absorbed++;
      }
    });
    pendingUndoLabel = `在「${c.title}」下新增节：「${title}」`;
    repairSectionContinuity(chapterId);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    if (absorbed) showToast(`已新增「${title}」，并入 ${absorbed} 个事件`);
  }

  // 在某一章下方新增一个节分界线：新节排在章分界线正下方（本章第一个节）。
  async function addSectionBelowChapter(chapterId) {
    const c = getChapter(chapterId);
    if (!c) return;
    const t = await uiPrompt("新小节的标题？", sectionDefaultTitle(1));
    if (t === null) return;
    const title = t.trim() || uiTextFor("新小节");
    const chapterVals = state.events
      .filter((e) => (e.chapterId || "") === chapterId)
      .map((e) => e.storyIndex || 0);
    const anchorStory = chapterVals.length ? Math.min.apply(null, chapterVals) : chapterAnchorStory(chapterId);
    const sec = { id: uid(), title, collapsed: false, anchorStory };
    c.sections = c.sections || [];
    c.sections.unshift(sec);
    // 自动识别：把该章里还没分节的事件并入这个新节，尽量避免出现空节。
    let absorbed = 0;
    state.events.forEach((e) => {
      if ((e.chapterId || "") === chapterId && !(e.sectionId || "")) {
        e.sectionId = sec.id;
        absorbed++;
      }
    });
    pendingUndoLabel = `在「${c.title}」下方新增节：「${title}」`;
    repairSectionContinuity(chapterId);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    showToast(absorbed ? `已在「${c.title}」下方新增「${title}」，并入 ${absorbed} 个事件` : `已在「${c.title}」下方新增「${title}」`);
  }

  // 在某一节下方插入一个新节：新节在事件轴里落在「上一节最后一个事件」和「下一节第一个事件」之间。
  function sectionAnchorBetween(prevSection, nextSection, chapter) {
    const prevEvents = prevSection ? state.events.filter((e) => e.sectionId === prevSection.id) : [];
    const nextEvents = nextSection ? state.events.filter((e) => e.sectionId === nextSection.id) : [];
    const prevVals = prevEvents.map((e) => e.storyIndex || 0);
    const nextVals = nextEvents.map((e) => e.storyIndex || 0);
    const lastPrev = prevVals.length ? Math.max.apply(null, prevVals) : null;
    const firstNext = nextVals.length ? Math.min.apply(null, nextVals) : null;
    if (lastPrev !== null && firstNext !== null) {
      return lastPrev === firstNext ? lastPrev + 0.5 : (lastPrev + firstNext) / 2;
    }
    if (lastPrev !== null) return lastPrev + 1;
    if (firstNext !== null) return firstNext - 1;
    const chapterVals = state.events.filter((e) => e.chapterId === chapter.id).map((e) => e.storyIndex || 0);
    return chapterVals.length ? Math.min.apply(null, chapterVals) - 1 : 0;
  }

  // 没有事件的章也要能在事件轴上显示分界线。
  // 位置取「上一章最后一个事件」和「下一章第一个事件」之间；前后都没有事件时用 0。
  function chapterAnchorStory(chapterId) {
    const chapters = state.chapters || [];
    const ci = chapters.findIndex((c) => c.id === chapterId);
    if (ci < 0) return 0;
    if (typeof chapters[ci].anchorStory === "number") return chapters[ci].anchorStory;
    let lastPrev = null;
    for (let j = ci - 1; j >= 0 && lastPrev === null; j--) {
      const vals = state.events.filter((e) => (e.chapterId || "") === chapters[j].id).map((e) => e.storyIndex || 0);
      if (vals.length) lastPrev = Math.max.apply(null, vals);
    }
    let firstNext = null;
    for (let j = ci + 1; j < chapters.length && firstNext === null; j++) {
      const vals = state.events.filter((e) => (e.chapterId || "") === chapters[j].id).map((e) => e.storyIndex || 0);
      if (vals.length) firstNext = Math.min.apply(null, vals);
    }
    if (lastPrev !== null && firstNext !== null) {
      return lastPrev === firstNext ? lastPrev + 0.5 : (lastPrev + firstNext) / 2;
    }
    if (lastPrev !== null) return lastPrev + 1;
    if (firstNext !== null) return firstNext - 1;
    return typeof chapters[ci].anchorStory === "number" ? chapters[ci].anchorStory : 0;
  }

  // 空节的默认位置：在「上一节最后一个事件」和「下一节第一个事件」之间；
  // 用户手动拖过 / 设过起始位置时，优先用用户指定的 anchorStory。
  function sectionAnchorStoryFor(chapter, section) {
    if (!chapter || !section) return 0;
    if (typeof section.anchorStory === "number") return section.anchorStory;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === section.id);
    if (si < 0) return 0;
    let lastPrev = null;
    for (let j = si - 1; j >= 0 && lastPrev === null; j--) {
      const vals = state.events
        .filter((e) => (e.sectionId || "") === sections[j].id)
        .map((e) => e.storyIndex || 0);
      if (vals.length) lastPrev = Math.max.apply(null, vals);
    }
    let firstNext = null;
    for (let j = si + 1; j < sections.length && firstNext === null; j++) {
      const vals = state.events
        .filter((e) => (e.sectionId || "") === sections[j].id)
        .map((e) => e.storyIndex || 0);
      if (vals.length) firstNext = Math.min.apply(null, vals);
    }
    if (lastPrev !== null && firstNext !== null) {
      return lastPrev === firstNext ? lastPrev + 0.5 : (lastPrev + firstNext) / 2;
    }
    if (lastPrev !== null) return lastPrev + 1;
    if (firstNext !== null) return firstNext - 1;
    const chapterVals = state.events
      .filter((e) => (e.chapterId || "") === chapter.id)
      .map((e) => e.storyIndex || 0);
    return chapterVals.length ? Math.min.apply(null, chapterVals) - 1 : chapterAnchorStory(chapter.id);
  }

  // 在某一节下方插入一个新节：新节在事件轴里落在「上一节最后一个事件」和「下一节第一个事件」之间。
  async function insertSectionBelow(sectionId) {
    const r = getSection(sectionId);
    if (!r) return;
    const chapter = r.chapter;
    const sections = chapter.sections || [];
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const next = sections[idx + 1] || null;
    const t = await uiPrompt("在下方插入节的名称？", uiTextFor("新小节"));
    if (t === null) return;
    const title = String(t).trim() || uiTextFor("新小节");
    const anchorStory = sectionAnchorBetween(r.section, next, chapter);
    const sec = { id: uid(), title, collapsed: false, anchorStory };
    sections.splice(idx + 1, 0, sec);
    pendingUndoLabel = `在「${r.section.title}」下方插入节：「${title}」`;
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    showToast(`已在「${r.section.title}」下方插入「${title}」`);
  }

  // 在某一节上方插入一个新节：分界线放在「上一节最后一个事件」和「选中这一节分界线」之间。
  async function insertSectionAbove(sectionId) {
    const r = getSection(sectionId);
    if (!r) return;
    const chapter = r.chapter;
    const sections = chapter.sections || [];
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const prev = sections[idx - 1] || null;
    const t = await uiPrompt("在上方插入节的名称？", uiTextFor("新小节"));
    if (t === null) return;
    const title = String(t).trim() || uiTextFor("新小节");
    const anchorStory = sectionAnchorBetween(prev, r.section, chapter);
    const sec = { id: uid(), title, collapsed: false, anchorStory };
    sections.splice(idx, 0, sec);
    pendingUndoLabel = `在「${r.section.title}」上方插入节：「${title}」`;
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    showToast(`已在「${r.section.title}」上方插入「${title}」`);
  }

  async function renameSection(id) {
    const r = getSection(id);
    if (!r) return;
    const t = await uiPrompt("重命名小节？", r.section.title);
    if (t === null || !t.trim()) return;
    pendingUndoLabel = "重命名小节：「" + r.section.title + "」→「" + t.trim() + "」";
    r.section.title = t.trim();
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
  }

  function deleteSection(id) {
    const r = getSection(id);
    if (!r) return;
    const chapter = r.chapter;
    const sections = chapter.sections || [];
    const si = sections.findIndex((s) => s.id === id);
    if (si < 0) return;
    // 只删分节线：内容并入上一个节；本章第一节没有「上一个」，就并入下一个节。
    const targetId = si > 0 ? sections[si - 1].id : sections[si + 1] ? sections[si + 1].id : "";
    pendingUndoLabel = `删除「${r.section.title}」分节线（事件并入${targetId ? "相邻节" : "未分节"}）`;
    state.events.forEach((e) => {
      if (e.sectionId === id) e.sectionId = targetId;
    });
    chapter.sections = sections.filter((s) => s.id !== id);
    repairSectionContinuity(chapter.id);
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderStats();
    renderChrono();
    showToast(
      targetId
        ? si === 0
          ? `已删除「${r.section.title}」分节线，事件并入下一节`
          : `已删除「${r.section.title}」分节线，事件并入上一节`
        : `已删除「${r.section.title}」分节线，事件归入未分节`
    );
  }

  // 删除某一节，并把它下面的事件一起删掉。
  async function deleteSectionWithEvents(id) {
    const r = getSection(id);
    if (!r) return;
    const chapter = r.chapter;
    const targets = state.events.filter((e) => e.sectionId === id);
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel(targets);
      if (!ok) return;
    }
    const ids = new Set(targets.map((e) => e.id));
    const setIds = new Set();
    state.events.forEach((e) => {
      if (!ids.has(e.id)) return;
      Object.values(e.eventSetAssign || {}).forEach((sid) => sid && setIds.add(sid));
    });
    pendingUndoLabel = `删除「${r.section.title}」及其 ${ids.size} 个事件`;
    state.events = state.events.filter((e) => !ids.has(e.id));
    state.order = (state.order || []).filter((oid) => !ids.has(oid));
    state.settings.entries.forEach((en) => {
      en.eventIds = (en.eventIds || []).filter((eid) => !ids.has(eid));
    });
    ids.forEach((eid) => {
      mergeSelected.delete(eid);
      expandedSetMembers.delete(eid);
    });
    setIds.forEach((sid) => pruneEventSetIfEmpty(sid));
    chapter.sections = chapter.sections.filter((s) => s.id !== id);
    repairSectionContinuity(chapter.id);
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    refreshLineViews();
    renderChapterRail();
    renderEntries();
    renderStats();
    showToast(`已删除「${r.section.title}」及其 ${ids.size} 个事件`);
  }

  // 从文本分析里已识别的分段自动建立章 / 节
  // 节标题：简中「第X节」＋ 繁中「第X節」；日文的「第X話」按章处理（在 HEADING_RE 里）
  let lastPlacedCount = 0; // 上一次建章 / 归位时落位了多少个事件
  let lastAlignedSegments = 0; // 上一次把多少个分析分段对齐到了用户编辑后的章节结构
  // 全文里提到这个名字的句子加起来不到这个字数 → 只算「顺带提了一句」，不建人物 / 设定条目
  const MIN_EVIDENCE_CHARS = 100;
  const FILL_OPTS_KEY = "fiction_gui_fill_opts";
  let fillOpts = { filterThin: true }; // 文本分析里那个勾选框：是否过滤「只提一句」的人物 / 名词

  function loadFillOpts() {
    try {
      fillOpts = Object.assign({ filterThin: true }, JSON.parse(localStorage.getItem(FILL_OPTS_KEY) || "{}"));
    } catch (e) {
      fillOpts = { filterThin: true };
    }
    return fillOpts;
  }

  function setFillOpts(patch) {
    fillOpts = Object.assign({ filterThin: true }, fillOpts, patch || {});
    try {
      localStorage.setItem(FILL_OPTS_KEY, JSON.stringify(fillOpts));
    } catch (e) {
      /* 存不上也不影响这次使用 */
    }
  }

  // 当前生效的过滤阈值（用户可以在「文本分析」里改）
  function thinThreshold() {
    const v = Number(fillOpts && fillOpts.threshold);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : MIN_EVIDENCE_CHARS;
  }

  // 清理过滤：涉及事件数少于这个值就算「戏份太少」（默认 3 个事件）
  function pruneEventThreshold() {
    const v = Number(fillOpts && fillOpts.pruneEventThreshold);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 3;
  }

  // 清理过滤：正文里提到它的文字少于这个值就算「只提了一句」（默认 100 字）
  function pruneTextThreshold() {
    const v = Number(fillOpts && fillOpts.pruneTextThreshold);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 100;
  }

  // 「事件归位」：把分析出的事件按来源重新归到对应的章 / 节
  // 「自动识别」：先按文本分析的识别结果建立 / 对齐章节，再把事件按出处归位。
  // 把原来的「识别」和「事件归位」两个按钮合成一个（功能上是它们的并集）。
  async function autoDetectAndAssign() {
    const task = getSelectedTask();
    const tasks = task ? [task] : state.analysis.tasks || [];
    const segs = [];
    tasks.forEach((t) => (t.segments || []).forEach((s) => segs.push(s)));
    const hasSegs = segs.some((s) => (s.label || "").trim() && !/未分章/.test(s.label));
    const hasSource = (state.events || []).some((e) => String(e.source || "").trim());
    if (!hasSegs && !hasSource) {
      uiAlert("没有可识别的章节信息：先在「文本分析」里识别章节，或让事件带上出处。");
      return;
    }
    pendingUndoLabel = "自动识别章节并把事件归位";
    let added = 0;
    let placed = 0;
    if (hasSegs) {
      added = buildChaptersFromSegments(); // 里面已经按出处归过一次位
      placed = lastPlacedCount;
    } else {
      placed = assignChaptersBySource();
    }
    if (!added && !placed && !lastAlignedSegments) {
      uiAlert("章节和事件都已经对齐了，没有需要调整的。");
      return;
    }
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    const sum = chapterStructureSummary();
    showToast(`章节已对齐：共 ${sum.chapters} 章 ${sum.sections} 节${placed ? `，${placed} 个事件归位` : ""}`);
  }

  // 章内：按「节线」在事件轴上的位置，把每一行事件收进它上方最近的那一节。
  // 节里有事件的取首个事件行；空节用它的位置（锚点）收自己下方的行。
  // 第一条节线之前的行保持「未分节」，不硬塞进第一节。
  function absorbSectionsBySectionLines() {
    let n = 0;
    (state.chapters || []).forEach((c) => {
      const sections = c.sections || [];
      if (!sections.length) return;
      const rows = axisRows().filter((row) => (row.items || []).some((e) => (e.chapterId || "") === c.id));
      if (!rows.length) return;
      const bArr = sections.map((s) => {
        const f = rows.findIndex((row) => (row.items || []).some((e) => (e.sectionId || "") === s.id));
        if (f >= 0) return f;
        const anchor = sectionAnchorStoryFor(c, s);
        for (let i = 0; i < rows.length; i++) {
          if ((rows[i].v || 0) >= anchor) return i;
        }
        return rows.length;
      });
      for (let i = 1; i < bArr.length; i++) if (bArr[i] < bArr[i - 1]) bArr[i] = bArr[i - 1];
      rows.forEach((row, i) => {
        let target = "";
        for (let j = bArr.length - 1; j >= 0; j--) {
          if (i >= bArr[j]) {
            target = sections[j].id;
            break;
          }
        }
        if (!target) return;
        (row.items || []).forEach((e) => {
          if ((e.chapterId || "") !== c.id) return;
          if ((e.sectionId || "") === target) return;
          e.sectionId = target;
          n++;
        });
      });
    });
    return n;
  }

  // 「整理」：先按当前章节线在事件轴上的位置，把每一行事件收进它上方最近的那一章；
  // 吸收完仍然一个事件都没有的章、节，再一起清掉。顺序必须是先吸收后清理。
  function tidyChaptersAndSections() {
    const chapters = state.chapters || [];
    if (!chapters.length) {
      uiAlert("还没有章节：先「自动识别」，或在章节栏 / 事件轴的空白处插入一章。");
      return;
    }
    const rows = axisRows();
    if (!rows.length) {
      uiAlert("事件轴上还没有事件：先把事件排到轴上，再来整理章节。");
      return;
    }
    pendingUndoLabel = "整理章节（吸收事件 / 清理空章节）";
    const order = chapters.map((c) => c.id);
    // 每章分界线对应的行（0 起）：有事件的取首个事件行；空章取锚点位置
    const bArr = chapters.map((c) => {
      const f = rows.findIndex((row) => (row.items || []).some((e) => (e.chapterId || "") === c.id));
      if (f >= 0) return f;
      const anchor = chapterAnchorStory(c.id);
      for (let i = 0; i < rows.length; i++) {
        if ((rows[i].v || 0) >= anchor) return i;
      }
      return rows.length;
    });
    if (bArr.length) bArr[0] = 0;
    for (let i = 1; i < bArr.length; i++) if (bArr[i] < bArr[i - 1]) bArr[i] = bArr[i - 1];

    let changed = 0;
    rows.forEach((row, i) => {
      let target = "";
      for (let j = bArr.length - 1; j >= 0; j--) {
        if (i >= bArr[j]) {
          target = order[j];
          break;
        }
      }
      (row.items || []).forEach((e) => {
        if ((e.chapterId || "") === target) return;
        const oldChapter = e.chapterId || "";
        e.chapterId = target;
        // 节属于章：原来挂在这一章下面的节保留，跨了章的节清掉（后面按出处 / 章节线再对齐）
        const sec = e.sectionId ? getSection(e.sectionId) : null;
        if (!sec || sec.chapter.id !== target) e.sectionId = "";
        // 事件集不能跨章：章变了就必须离开原来的集合
        if (oldChapter !== target && e.eventSetAssign && Object.keys(e.eventSetAssign).length) e.eventSetAssign = {};
        changed++;
      });
    });
    // 再按「节线」把章内事件收进对应的节（空节按自己的位置收下方的行）——
    // 必须在清理空章 / 空节之前做，否则空节会被当成「没事件」直接删掉。
    changed += absorbSectionsBySectionLines();
    // ① 空章：吸收完还是一个事件都没有的章，连它下面的节一起清掉
    const emptyChapters = (state.chapters || []).filter(
      (c) => !state.events.some((e) => (e.chapterId || "") === c.id)
    );
    // 都空等于把章节结构整个删掉——这种情况只吸收，不动结构
    const wipeAll = emptyChapters.length === (state.chapters || []).length;
    const doomedChapters = wipeAll ? [] : emptyChapters;
    if (doomedChapters.length) {
      const gone = new Set(doomedChapters.map((c) => c.id));
      state.chapters = (state.chapters || []).filter((c) => !gone.has(c.id));
    }
    // ② 空节：章留下了，但节里一个事件都没有 → 删掉这条分节线
    const doomedSections = [];
    if (!wipeAll) {
      (state.chapters || []).forEach((c) => {
        const secs = c.sections || [];
        if (!secs.length) return;
        const dead = secs.filter((s) => !state.events.some((e) => (e.sectionId || "") === s.id));
        if (!dead.length) return;
        c.sections = secs.filter((s) => !dead.includes(s));
        dead.forEach((s) => doomedSections.push(s));
      });
    }
    if (!changed && !doomedChapters.length && !doomedSections.length) {
      showToast("事件都已经在对应的章节里了，也没有空章、空节");
      return;
    }
    repairChapterContinuity();
    repairSectionContinuity();
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    renderStats();
    const bits = [];
    if (changed) bits.push(`吸收 ${changed} 个事件`);
    const brief = (list) => list.slice(0, 3).join("、") + (list.length > 3 ? ` 等 ${list.length} 个` : "");
    if (doomedChapters.length) bits.push(`清理空章（${brief(doomedChapters.map((c) => c.title))}）`);
    if (doomedSections.length) bits.push(`清理空节（${brief(doomedSections.map((s) => s.title))}）`);
    showToast("已" + bits.join("；"));
  }

  // 把「文本分析」里各文件 / 分段的标题变成章节（同名的不重复建）。返回新增的章+节数量。
  // 用户手动改过章节后，优先把分析分段对齐到「现在的章节结构」上：
  // 标题还能对上的直接对上；对不上的（改过名 / 插入 / 删除）按分段顺序和前后锚点插进现有章 / 节之间。
  function alignSegmentsToExistingChapters(segs) {
    const chapters = state.chapters || [];
    if (!chapters.length) return 0;
    const chapterIdx = new Map(chapters.map((c, i) => [c.id, i]));
    const manualClaim = new Map();
    // 优先跟随「工作区里已有的、同来源事件」：用户手动改过章节边界 / 拖过事件后，
    // 同一出处的新事件也落到用户现在指定的章 / 节，而不是按标题猜。
    const placeByExistingEvents = (label, fileId) => {
      const t = String(label || "").trim();
      if (!t) return null;
      const cands = state.events.filter(
        (e) =>
          String(e.source || "").trim() === t &&
          e.chapterId &&
          getChapter(e.chapterId) &&
          (!e.sectionId || getSection(e.sectionId))
      );
      const ev =
        (fileId && cands.find((e) => String(e.sourceFileId || "") === String(fileId))) ||
        cands.find((e) => !e.sourceFileId) ||
        (!fileId ? cands[0] : null);
      if (!ev) return null;
      // 旧事件可能被塞在另一份文件的手动章里：同一份手动章只能归一份文件，
      // 否则第二份文件的事件会把它的分段也拖进第一份文件的章。
      const c = getChapter(ev.chapterId);
      if (c && !c.sourceFileId) {
        const owner = manualClaim.get(c.id);
        if (owner && String(owner) !== String(fileId)) return null;
        if (fileId) manualClaim.set(c.id, fileId);
      }
      return { chapterId: ev.chapterId, sectionId: ev.sectionId || "", chapterIdx: chapterIdx.get(ev.chapterId) };
    };
    const placeByTitle = (label, fileId) => {
      const t = String(label || "").trim();
      if (!t) return null;
      const cands = [];
      for (let ci = 0; ci < chapters.length; ci++) {
        const c = chapters[ci];
        if (String(c.title || "").trim() === t) cands.push({ chapterId: c.id, sectionId: "", chapterIdx: ci });
        for (const sec of c.sections || []) {
          if (String(sec.title || "").trim() === t) cands.push({ chapterId: c.id, sectionId: sec.id, chapterIdx: ci });
        }
      }
      if (!cands.length) return null;
      if (fileId) {
        const exact = cands.find((p) => {
          const c = getChapter(p.chapterId);
          return c && String(c.sourceFileId || "") === String(fileId);
        });
        if (exact) return exact;
      }
      const manual = cands.find((p) => {
        const c = getChapter(p.chapterId);
        if (!c || c.sourceFileId) return false;
        const owner = manualClaim.get(c.id);
        return !owner || String(owner) === String(fileId);
      });
      if (manual) {
        const c = getChapter(manual.chapterId);
        if (c && fileId) manualClaim.set(c.id, fileId);
        return manual;
      }
      // 同名章分属不同文件、又没有来源标记：不能瞎挑一个，交给后面新建
      return !fileId && cands.length === 1 ? cands[0] : null;
    };
    const resolved = segs.map((s) => placeByExistingEvents(s.label, s.fileId) || placeByTitle(s.label, s.fileId));
    // 只有「这个文件里至少有一段能按标题 / 同来源事件对上」时才做位置摊派。
    // 否则（例如刚导入的另一个文件）整批会被硬塞进现有章节，划分时就认为「已经对齐过了」，
    // 结果第二个文件永远建不出自己的章节。
    const fileHasHit = new Set();
    segs.forEach((s, i) => {
      if (resolved[i]) fileHasHit.add(s.fileId || "");
    });
    const pickSectionForChapter = (chapterId, a, b) => {
      if (a && a.chapterId === chapterId) return a.sectionId || "";
      if (b && b.chapterId === chapterId) return b.sectionId || "";
      return "";
    };
    let n = 0;
    segs.forEach((s, i) => {
      if (segLevelOf(s) === "merge") return;
      let place = resolved[i];
      if (!place) {
        let p = -1;
        let q = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (resolved[j]) {
            p = j;
            break;
          }
        }
        for (let j = i + 1; j < segs.length; j++) {
          if (resolved[j]) {
            q = j;
            break;
          }
        }
        if (p >= 0 && q >= 0) {
          const a = resolved[p];
          const b = resolved[q];
          const ai = chapterIdx.get(a.chapterId);
          const bi = chapterIdx.get(b.chapterId);
          if (ai !== undefined && bi !== undefined) {
            const ratio = (i - p) / Math.max(1, q - p);
            const ti = Math.max(0, Math.min(chapters.length - 1, Math.round(ai + ratio * (bi - ai))));
            const target = chapters[ti];
            place = { chapterId: target.id, sectionId: pickSectionForChapter(target.id, a, b), chapterIdx: ti };
          }
        } else if (p >= 0) {
          const a = resolved[p];
          place = { chapterId: a.chapterId, sectionId: a.sectionId || "", chapterIdx: chapterIdx.get(a.chapterId) };
        } else if (q >= 0) {
          const b = resolved[q];
          place = { chapterId: b.chapterId, sectionId: b.sectionId || "", chapterIdx: chapterIdx.get(b.chapterId) };
        } else {
          if (!fileHasHit.has(s.fileId || "")) place = null; // 这个文件整批都没对上：交给划分流程新建
          else {
            const ti = segs.length > 1 ? Math.round((i / (segs.length - 1)) * (chapters.length - 1)) : 0;
            const target = chapters[ti];
            place = { chapterId: target.id, sectionId: "", chapterIdx: ti };
          }
        }
      }
      if (place && getChapter(place.chapterId) && (!place.sectionId || getSection(place.sectionId))) {
        s.chapterId = place.chapterId;
        s.sectionId = place.sectionId || "";
        n++;
      }
    });
    // 「并入上一段」的分段跟着上一段走
    let prev = null;
    segs.forEach((s) => {
      if (segLevelOf(s) === "merge") {
        if (prev) {
          s.chapterId = prev.chapterId;
          s.sectionId = prev.sectionId || "";
        }
      } else {
        prev = s;
      }
    });
    return n;
  }

  // 当前章节结构的规模：几章几节（用来给用户一个明确的结果反馈）
  function chapterStructureSummary() {
    let sections = 0;
    (state.chapters || []).forEach((c) => {
      sections += (c.sections || []).length;
    });
    return { chapters: (state.chapters || []).length, sections };
  }

  function buildChaptersFromSegments() {
    const segs = [];
    const task = getSelectedTask();
    const tasks = task ? [task] : state.analysis.tasks || [];
    tasks.forEach((t) => (t.segments || []).forEach((s) => segs.push(s)));
    /* 旧版本的坑：同一任务里两个文件都叫「第一章」时，它们被并进了同一个章（章上没有来源文件）。
       这里按分段反推：一章只属于一个文件；如果它混了两个文件，保留任务里靠前的那个文件，
       另一份文件的分段清掉归属，交给下面的建章流程重新建——这样旧存档也能修回来。 */
    const fileOrder = new Map();
    let fileOrderNo = 0;
    tasks.forEach((t) => {
      (t.files || []).forEach((f) => {
        if (f && f.id && !fileOrder.has(f.id)) fileOrder.set(f.id, fileOrderNo);
        fileOrderNo++;
      });
    });
    const segsByChapter = new Map();
    segs.forEach((s) => {
      if (!s.chapterId) return;
      if (!segsByChapter.has(s.chapterId)) segsByChapter.set(s.chapterId, []);
      segsByChapter.get(s.chapterId).push(s);
    });
    (state.chapters || []).forEach((c) => {
      if (!c || c.sourceFileId) return;
      const list = (segsByChapter.get(c.id) || []).filter((s) => s.fileId);
      if (!list.length) return;
      const files = Array.from(new Set(list.map((s) => s.fileId)));
      if (files.length === 1) {
        c.sourceFileId = files[0];
        return;
      }
      files.sort((a, b) => (fileOrder.has(a) ? fileOrder.get(a) : 1e9) - (fileOrder.has(b) ? fileOrder.get(b) : 1e9));
      const keep = files[0];
      c.sourceFileId = keep;
      list.forEach((s) => {
        if (s.fileId === keep) return;
        s.chapterId = "";
        s.sectionId = "";
      });
    });
    // 用户手动编辑过章节时，先把分段对齐到当前章节结构；对齐不了的再走下面的新建逻辑。
    lastAlignedSegments = alignSegmentsToExistingChapters(segs);
    // 对齐结果里，手动章已经被某个文件的分段认领：把来源记下来，
    // 后面的第二份文件就不能再复用同一个手动章（两卷同名章会在这里分开）。
    segs.forEach((s) => {
      if (!s.chapterId || !s.fileId) return;
      const c = getChapter(s.chapterId);
      if (c && !c.sourceFileId) c.sourceFileId = s.fileId;
    });
    /* 章名可以在不同文件里重复（每份文本都从「第一章」开始很常见）。
       所以查找键是「标题 → 章列表」，优先用 sourceFileId 精确到那一份文件，
       找不到再退回没有来源的手动章；绝不把第二份文件的第一章并进第一份文件。 */
    const found = new Map();
    const manualClaim = new Map(); // 手动章（没有 sourceFileId）这次已经被哪份文件用了
    const rememberChapter = (c) => {
      if (!c) return;
      const key = String(c.title || "").trim();
      if (!found.has(key)) found.set(key, []);
      const list = found.get(key);
      if (list.indexOf(c) < 0) list.push(c);
    };
    (state.chapters || []).forEach(rememberChapter);
    const findChapter = (title, fileId) => {
      const list = found.get(String(title || "").trim()) || [];
      if (!list.length) return null;
      if (fileId) {
        const exact = list.find((c) => String(c.sourceFileId || "") === String(fileId));
        if (exact) return exact;
      }
      const manual = list.find((c) => {
        if (c.sourceFileId) return false;
        const owner = manualClaim.get(c.id);
        return !owner || String(owner) === String(fileId);
      });
      if (manual) {
        if (fileId) manualClaim.set(manual.id, fileId);
        return manual;
      }
      return !fileId ? list[0] || null : null;
    };
    // 只有「节」没有「章」时，会建一个占位章当容器：优先用文件名 / 任务名，
    // 别一律叫「未命名章」（用户会以为没分成功）
    const oneFileName =
      task && (task.files || []).length === 1 ? cleanFileBase((task.files || [])[0].name) : "";
    const hostTitle = oneFileName || (task && String(task.name || "").trim()) || "未命名章";
    // 一段只有「节」、需要一个占位章时，用这一段所在文件的名字当章名
    const hostTitleForFile = (fileId) => {
      const f = task && (task.files || []).find((x) => x.id === fileId);
      const base = f ? cleanFileBase(f.name) : "";
      return base || hostTitle;
    };
    let current = null;
    let currentSectionId = "";
    let added = 0;
    let currentFileId = "";
    // 这个文件里有没有「标题能对上现有章 / 节」的段落：有＝这个文件是同一个来源，
    // 它已有的归属（用户可能手动调过）就保留；没有＝整批按新文件重建。
    const fileKeyHits = new Set();
    {
      const nameOf = (id) => String(id || "");
      const titledByFile = new Set();
      const manualTitles = new Set();
      (state.chapters || []).forEach((c) => {
        const title = String(c.title || "").trim();
        if (c.sourceFileId) titledByFile.add(nameOf(c.sourceFileId) + "\u0000" + title);
        else manualTitles.add(title);
        (c.sections || []).forEach((sec) => {
          const st = String(sec.title || "").trim();
          if (c.sourceFileId) titledByFile.add(nameOf(c.sourceFileId) + "\u0000" + st);
          else manualTitles.add(st);
        });
      });
      segs.forEach((s) => {
        const lb = String(s.label || "").trim();
        const fid = nameOf(s.fileId);
        if (!lb) return;
        if (titledByFile.has(fid + "\u0000" + lb) || manualTitles.has(lb)) fileKeyHits.add(fid);
      });
    }
    segs.forEach((s) => {
      const label = (s.label || "").trim();
      if (!label || /未分章/.test(label)) return;
      // 换文件了：上一节所属的章不能再当「当前章」，否则新文件的节会被挂到别的文件的章下面
      if ((s.fileId || "") !== currentFileId) {
        currentFileId = s.fileId || "";
        current = null;
        currentSectionId = "";
      }
      if (segLevelOf(s) === "merge") {
        // 「并入上一段」的分段不新开章 / 节，跟着上一段走
        if (current) {
          s.chapterId = current.id;
          s.sectionId = currentSectionId || "";
        }
        return;
      }
      // 已经对齐到现有章 / 节的，不再新建，也不改名。
      if (s.chapterId && getChapter(s.chapterId) && (!s.sectionId || getSection(s.sectionId))) {
        const ch = getChapter(s.chapterId);
        // 这个文件整体就是「同来源」时，保留原有归属（用户可能手动调过章节边界）；
        // 否则多半是以前「按位置摊派」留下的错误归属（新文件被塞进别人的章节），清掉重建。
        if (fileKeyHits.has(String(s.fileId || ""))) {
          current = ch;
          currentSectionId = s.sectionId || "";
          return;
        }
        s.chapterId = "";
        s.sectionId = "";
      }
      if (segLevelOf(s) === "section" || looksLikeSectionTitle(label)) {
        if (!current) {
          const want = hostTitleForFile(s.fileId);
            let host = findChapter(want, s.fileId) || findChapter(hostTitle, s.fileId) || findChapter("未命名章", s.fileId);
          if (!host) {
            host = newChapter(want);
              if (s.fileId) host.sourceFileId = s.fileId;
              rememberChapter(host);
            added++;
          }
          current = host;
        }
        current.sections = current.sections || [];
        let sec = current.sections.find((x) => String(x.title || "").trim() === label);
        if (!sec) {
          sec = { id: uid(), title: label, collapsed: false };
          current.sections.push(sec);
          added++;
        }
        // 记下「这一段属于哪一章哪一节」，之后分析出的事件就能直接落到这里
        s.chapterId = current.id;
        s.sectionId = sec.id;
        currentSectionId = sec.id;
      } else {
        let c = findChapter(label, s.fileId);
        if (!c) {
          c = newChapter(label);
          if (s.fileId) c.sourceFileId = s.fileId;
          rememberChapter(c);
          added++;
        }
        current = c;
        currentSectionId = "";
        s.chapterId = c.id;
        s.sectionId = "";
      }
    });
    sortChaptersNaturally();
    // 刚刚 newChapter() / 新建小节只改了数组，索引缓存还停在旧版本；
    // 下面按出处归位要用 getChapter / getSection，必须先把缓存撞掉。
    bumpStateRev();
    lastPlacedCount = assignChaptersBySource();
    const pruned = pruneArtifactChapters();
    if (pruned) {
      bumpStateRev();
      sortChaptersNaturally();
    }
    return added;
  }

  /* 旧版把「第九章·八音盒 · Part.1 …」这种「章 · 节」拼出来的出处直接建成了一个章；
     这种假章没有小节、没有分段，事件按出处重新归位后就会空掉。只清理这种空壳，
     有事件 / 有节 / 有分段指向的章一律不动。 */
  function pruneArtifactChapters() {
    const chapters = state.chapters || [];
    if (!chapters.length) return 0;
    const segChapters = new Set();
    allSegments().forEach((s) => {
      if (s.chapterId) segChapters.add(s.chapterId);
    });
    const eventChapters = new Set();
    (state.events || []).forEach((e) => {
      if (e.chapterId) eventChapters.add(e.chapterId);
    });
    const titleSet = new Set(chapters.map((c) => String(c.title || "").trim()));
    const keep = chapters.filter((c) => {
      if (c.sections && c.sections.length) return true;
      if (eventChapters.has(c.id) || segChapters.has(c.id)) return true;
      const title = String(c.title || "").trim();
      const at = title.indexOf(" · ");
      if (at <= 0) return true;
      const base = title.slice(0, at).trim();
      return !base || !titleSet.has(base);
    });
    if (keep.length === chapters.length) return 0;
    state.chapters = keep;
    return chapters.length - keep.length;
  }

  // 把事件按分析来源的段落标签归到对应章 / 节
  // 同名小节横跨多章时（Part.1…Part.5），按事件先后顺序依次往后匹配，不会全堆到第一章
  function assignChaptersBySource() {
    let n = 0;
    let cursor = 0;
    (state.events || [])
      .slice()
      .sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0))
      .forEach((e) => {
        if (!e.source || e.sourcePinned) return; // 手动调整过的（或没有来源的）不动
        const cand = placesForSource(e.source);
        let pick = null;
        /* 同一份文本里章名重复、或同一标题分属不同文件时，先按「分段上登记的归属」精确找一次；
           不能只看这个文件的第一章，否则第二个文件的事件会落到第一个文件里。 */
        const exact = placeForSource(e.source, e.sourceFileId, { noCreate: true });
        if (exact.chapterId) {
          pick = cand.find(
            (c) => c.chapterId === exact.chapterId && (c.sectionId || "") === (exact.sectionId || "")
          );
          /* 旧存档里可能已经有一个「章 · 节」拼成的假章（事件被塞在里面）。
             真实章 / 节不在候选里时，直接按出处精确落到真实章，别被假章吸住。 */
          if (!pick) {
            const ci = (state.chapters || []).findIndex((c) => c.id === exact.chapterId);
            if (ci >= 0) pick = { chapterId: exact.chapterId, sectionId: exact.sectionId || "", chapterIdx: ci };
          }
        }
        // 出处是「章 · 节」合写时，cand 可能为空；但 exact 已经按分段找到了真实章 / 节。
        if (!pick && !cand.length) return;
        if (!pick && e.sourceFileId) {
          const want = chapterIdOfFile(e.sourceFileId);
          pick = want ? cand.find((c) => c.chapterId === want) : null;
          if (!pick) {
            pick =
              cand.find((c) => {
                const ch = getChapter(c.chapterId);
                return ch && String(ch.sourceFileId || "") === String(e.sourceFileId);
              }) || null;
          }
        }
        if (!pick) {
          // 同名章分属不同文件、又找不到精确出处：宁可不动，也不要把事件塞进别人的章
          const safe = e.sourceFileId
            ? cand.filter((c) => {
                const ch = getChapter(c.chapterId);
                return !ch || !ch.sourceFileId || String(ch.sourceFileId) === String(e.sourceFileId);
              })
            : cand;
          pick = safe.find((c) => c.chapterIdx >= cursor) || safe[0] || null;
        }
        if (!pick) return;
        cursor = pick.chapterIdx;
        if (e.chapterId === pick.chapterId && (e.sectionId || "") === pick.sectionId) return;
        const oldChapter = e.chapterId || "";
        e.chapterId = pick.chapterId;
        e.sectionId = pick.sectionId;
        if ((e.chapterId || "") !== oldChapter && e.eventSetAssign && Object.keys(e.eventSetAssign).length) {
          e.eventSetAssign = {};
        }
        n++;
      });
    return n;
  }

  // 「第三章」→ 3：让章节按自然顺序排列，不受导入先后影响
  function cnToNum(s) {
    const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
    let total = 0;
    let section = 0;
    let num = 0;
    for (const ch of String(s || "")) {
      if (digits[ch] !== undefined) num = digits[ch];
      else if (units[ch]) {
        const u = units[ch];
        if (u === 10000) {
          section = (section + num) * u;
          total += section;
          section = 0;
        } else {
          section += (num || 1) * u;
        }
        num = 0;
      }
    }
    return total + section + num;
  }

  function halfWidthDigits(s) {
    return String(s || "").replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)));
  }

  // 罗马数字（Vol.II 之类）→ 阿拉伯数字
  const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  function romanToNum(s) {
    const str = String(s || "").toLowerCase();
    let total = 0;
    for (let i = 0; i < str.length; i++) {
      const v = ROMAN_VALUES[str[i]] || 0;
      const next = ROMAN_VALUES[str[i + 1]] || 0;
      total += v < next ? -v : v;
    }
    return total;
  }

  function chapterOrderKey(title) {
    const t = String(title || "").trim();
    if (/^(楔子|序章|序言|引子|前言|开头)/.test(t)) return { has: true, num: -100 };
    if (/^(尾声|终章|后记|番外)/.test(t)) return { has: true, num: 999999 };
    // 第12章 / 12章 / 12.节
    let m = t.match(/(?:第\s*)?([0-9０-９]{1,4})\s*[章节回卷部篇]/);
    if (m) return { has: true, num: parseInt(halfWidthDigits(m[1]), 10) };
    m = t.match(/第\s*([零一二三四五六七八九十百千万两〇]+)\s*[章节回卷部篇]/);
    if (m) return { has: true, num: cnToNum(m[1]) };
    // Chapter 12 / Chpt2 / Episode 5 / Ep1 / Part 2 / P3 / Vol.1
    m = t.match(/(?:chapter|episode|epilogue|interlude|prologue|section|sec|part|pt|volume|vol|book|chap|chpt|chp|ep|p)[\s.\-:：]*([0-9]{1,4})/i);
    if (m) return { has: true, num: parseInt(m[1], 10) };
    m = t.match(/(?:chapter|episode|section|part|volume|vol|book|chap|chpt|chp|ep|p)[\s.\-:：]*([ivxlcdm]{1,7})\b/i);
    if (m) return { has: true, num: romanToNum(m[1]) };
    m = t.match(/(?:chapter|episode|section|part|volume|book|chap|chpt|chp|ep|p)[\s.\-:：]*([零一二三四五六七八九十百〇]{1,6})/i);
    if (m) return { has: true, num: cnToNum(m[1]) };
    return { has: false, num: 0 };
  }

  function sortChaptersNaturally() {
    const list = state.chapters || [];
    if (list.length < 2) return;
    /* 多个文件的章可能同名、章号也各自从 1 开始。先按文件在任务里的顺序排，
       同一个文件里再按章号排；否则「第二份文件的第一章」会插到第一份文件的第二章前面。 */
    const fileRank = new Map();
    let fileOrder = 0;
    ((state.analysis && state.analysis.tasks) || []).forEach((t) => {
      (t.files || []).forEach((f) => {
        if (f && f.id && !fileRank.has(f.id)) fileRank.set(f.id, fileOrder);
        fileOrder++;
      });
    });
    const withKey = list.map((c, i) => {
      const k = chapterOrderKey(c.title);
      const rank = c && c.sourceFileId && fileRank.has(c.sourceFileId) ? fileRank.get(c.sourceFileId) : null;
      return { c, i, has: k.has, num: k.num, rank };
    });
    withKey.sort((a, b) => {
      if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
      if (a.has && b.has) return a.num - b.num || a.i - b.i;
      if (a.has !== b.has) return a.has ? -1 : 1;
      return a.i - b.i;
    });
    state.chapters = withKey.map((x) => x.c);
  }

