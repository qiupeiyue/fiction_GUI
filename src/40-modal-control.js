  /* ================= 弹窗控制 ================= */
  function openModal(id) {
    const el = $("#" + id);
    if (!el) return;
    el.hidden = false;
    /* 后开的弹窗要压在上面：所有 .modal-overlay 是同一个 z-index，
       图层顺序＝DOM 顺序，所以把它挪到父节点最后。
       顺带让「Enter 作用在最上面那个弹窗」这类按数组取末位的逻辑跟图层一致。 */
    if (el.parentElement && el.parentElement.lastElementChild !== el) el.parentElement.appendChild(el);
    modalOpenedAt = Date.now(); // 刚打开的弹窗 300ms 内不响应遮罩点击
    // 把键盘焦点收进弹窗（晚一拍，弹窗自己的 autofocus 先说话）：
    // 不这么做的话，焦点还停在「刚才点开的那个按钮」上，回车会去再点它一次，
    // 弹窗自己的回车（确定 / 保存并关闭）就永远轮不到。
    setTimeout(() => focusIntoModal(el), 0);
  }

  // 弹窗里优先给「第一个能打字的输入框」，没有就给主按钮（确定 / 保存），最后退回右上角的 ×
  function focusIntoModal(el) {
    if (!el || el.hidden || el.contains(document.activeElement)) return;
    const shown = (n) => !!(n && !n.disabled && n.offsetParent !== null);
    const firstText = Array.prototype.find.call(
      el.querySelectorAll('input[type="text"],input[type="number"],input[type="search"],textarea'),
      (n) => shown(n) && !n.readOnly
    );
    const primary =
      el.querySelector(".modal-foot .btn-primary:not([disabled])") ||
      el.querySelector(".modal-head .btn-primary:not([disabled])") ||
      el.querySelector(".modal-foot .btn:not([disabled])");
    const target = firstText || (shown(primary) ? primary : null) || el.querySelector(".modal-head .modal-close");
    if (!shown(target)) return;
    try {
      target.focus({ preventScroll: true });
    } catch (e) {
      try {
        target.focus();
      } catch (e2) {
        /* ignore */
      }
    }
  }

  function closeModal(id) {
    const el = $("#" + id);
    if (el) el.hidden = true;
    // 输入框候选面板挂在 body 上：弹窗一关就收起来，别让它留在界面上
    if (id === "ui-prompt-modal") {
      const sug = $("#ui-prompt-suggest");
      if (sug) {
        sug.hidden = true;
        sug.innerHTML = "";
      }
    }
    // 设置界面走「不保存关闭」：把这次打开期间的改动全部退回
    if (id === "settings-modal") discardSettingsChanges();
    hideNameTip(true);
    // 关掉合并 / 清单弹窗时，把清单模式的放大样式与待办清掉，避免影响下一次打开
    if (id === "merge-modal") {
      const listEl = $("#merge-list");
      if (listEl && listEl.__mergeCancelPending) listEl.__mergeCancelPending();
      pendingListDialog = null;
      resetChecklistChrome();
    }
  }

  /* 视图内的选项卡高亮：事件轴 / 二维事件图 / 时间线 是一组，人物分析 / 出场统计 / 势力分析 / 雷达分析 是一组。
     美术同「人物信息」界面的人物链选项卡，所以这里只管 current 这个 class。 */
  function syncViewTabs(tab) {
    const TIMELINE_GROUP = ["timeline", "matrix", "chrono", "novel"];
    const REL_GROUP = ["relations", "stats", "faction", "radar", "pedigree"];
    const group = TIMELINE_GROUP.includes(tab) ? TIMELINE_GROUP : REL_GROUP.includes(tab) ? REL_GROUP : null;
    $$("[data-view-tab]").forEach((b) => {
      const id = b.dataset.viewTab;
      const on = !!group && group.includes(id) && id === tab;
      b.classList.toggle("current", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /* 章节边栏在 事件轴 / 二维事件图 / 时间线 三个界面是同一列：
     只有一份 DOM（#chapter-rail + 它右边的 #pane-handle-chapter），切视图时整列搬过去，
     这样折叠 / 展开 / 拖宽的手感与状态（宽度、是否收起）在三个界面里完全一致。*/
  const CHAPTER_RAIL_HOSTS = {
    timeline: { host: "#view-timeline .timeline-body", before: "#view-timeline .timeline-main" },
    matrix: { host: "#matrix-rail-body", before: "#matrix-rail-body > .matrix-wrap" },
    chrono: { host: "#chrono-rail-body", before: "#chrono-rail-body > .chrono-body" },
    novel: { host: "#novel-rail-body", before: "#novel-left" },
  };

  function mountChapterRail(tab) {
    const conf = CHAPTER_RAIL_HOSTS[tab];
    if (!conf) return;
    const rail = $("#chapter-rail");
    const handle = $("#pane-handle-chapter");
    const host = $(conf.host);
    const before = $(conf.before);
    if (!rail || !host || !before) return;
    // 已经在这个界面的左列了（边栏后面紧跟着拖拽条）就不动，免得白重排一次 DOM
    if (rail.parentElement === host && rail.nextElementSibling === handle) return;
    const list = $("#chapter-list");
    const keepTop = list ? list.scrollTop : 0;
    const hadContent = !!(list && list.children.length);
    host.insertBefore(rail, before);
    if (handle) host.insertBefore(handle, before);
    // 切页签时旧的悬浮预览还按老位置挂着，先收起来；下次滚动再按新位置出现。
    if (typeof hideOtherScrollMinimaps === "function") hideOtherScrollMinimaps(null);
    // 切页签不重画章节列表：内容和状态都是同一份，重画会把滚动位置打回顶部。
    if (!hadContent) renderChapterRail();
    const nextList = $("#chapter-list");
    if (nextList) {
      nextList.scrollTop = keepTop;
      // 刚插进还在 hidden 的宿主时，scrollHeight 可能还是 0，先设会被夹回 0；
      // 等这一帧把页签显示出来后再还原一次。宿主变了（又切走了）就不要再写。
      requestAnimationFrame(() => {
        if (!nextList.isConnected || rail.parentElement !== host) return;
        nextList.scrollTop = keepTop;
      });
    }
  }

  async function switchTab(tab) {
    /* 离开文本编辑时先把正文落盘（用户 2026-10-20：Esc / 切事件都自动保存）。 */
    if (tab !== currentTab && typeof novelBeforeLeave === "function") await novelBeforeLeave();
    /* 换界面 / 换选项卡＝先退出所有多选（用户 2026-10-17 要求）。
       不然会出现「人物栏还亮着『已选 12 个』，人已经在系谱里」这种鬼状态：
       批量条还在、Ctrl+A / Delete / 批量按钮作用到的却是看不见的那些卡片。
       点的是当前这个页签就不动（免得手抖点一下把选好的清空）。 */
    if (tab !== currentTab && typeof exitAllSelectModes === "function") exitAllSelectModes(true, null);
    currentTab = tab;
    /* 换页签＝换"当前界面"：Ctrl+A / 方向键 / Enter 的目标也跟着换成这个页签的主列表，
       别让上一个页签里点过的东西（比如人物边栏）继续接管快捷键。 */
    lastPaneTag = defaultShortcutPaneForView(tab);
    mountChapterRail(tab); // 章节边栏跟着页签走（事件轴 / 二维事件图 / 时间线 共用同一列）
    ["timeline", "matrix", "chrono", "novel", "settings", "stats", "faction", "radar", "pedigree", "relations", "analysis"].forEach((t) => {
      $("#view-" + t).hidden = t !== tab;
      const btn = $(`.tab[data-tab="${t}"]`);
      // 出场统计 / 势力分析是人物分析的子页面；二维事件图、时间线是事件轴的子页面
      const activeTab =
        tab === "stats" || tab === "faction" || tab === "radar" || tab === "pedigree"
          ? "relations"
          : tab === "matrix" || tab === "chrono" || tab === "novel"
          ? "timeline"
          : tab;
      if (btn) btn.classList.toggle("active", t === activeTab);
    });
    if (tab === "timeline") {
      invalidateAxisWidth(); // 从别的页签切回来时容器宽度可能刚变过
      renderTimeline();
    }
    // 二维事件图 / 时间线要建的格子最多（人物 × 事件），先让页签切过去、界面立刻响应，
    // 下一帧再画内容，避免点一下卡住半秒。
    if (tab === "matrix") renderHeavySoon(renderMatrix);
    if (tab === "chrono") renderHeavySoon(renderChrono);
    if (tab === "novel") renderNovelView();
    if (tab === "settings") {
      renderCategories();
      renderEntries();
    }
    if (tab === "stats") renderStats();
    if (tab === "faction") renderFactionAnalysis();
    if (tab === "radar") renderRadarAnalysis();
    if (tab === "pedigree") renderPedigree();
    if (tab === "relations") renderRelations();
    if (tab === "analysis") {
      renderTaskList();
      renderTaskDetail();
    }
    syncViewTabs(tab);
    // 快捷键的默认作用栏目跟着页签走
    if (tab === "settings") lastPaneTag = "entry";
    else if (tab === "analysis") lastPaneTag = "result";
    else if (tab === "matrix") lastPaneTag = "matrix";
    else if (tab === "novel") lastPaneTag = "novel";
    else if (tab === "timeline") lastPaneTag = "event";
  }

