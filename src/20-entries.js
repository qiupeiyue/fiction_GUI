  /* ================= 设定档案 ================= */
  function renderCategories() {
    const list = $("#cat-list");
    if (!list) return;
    const cats = state.settings.categories;
    const addBtn = $("#new-cat-btn");
    // 只重画类别页签；末尾那个「＋」页签的监听挂在启动时，不能被重画冲掉
    $$("#cat-list .cat-tab").forEach((n) => n.remove());
    const html = cats
      .map((cat) => {
        const count = state.settings.entries.filter((en) => en.categoryId === cat.id).length;
        const active = selectedCategoryId === cat.id;
        const locked = catIsLocked(cat);
        const tip = locked
          ? count + " 个条目 · " + catLockTip(cat) + "；点击查看这一类"
          : count +
            " 个条目 · 点击查看这一类 · 双击＝编辑 · 左右拖动＝调整类别顺序（可撤销）· 右键＝更多操作";
        return `<div class="view-tab cat-tab${active ? " current" : ""}${locked ? " locked" : ""}" role="tab" draggable="${
          locked ? "false" : "true"
        }" title="${esc(tip)}" data-cat-id="${esc(cat.id)}">
          <span class="cat-icon">${esc(cat.icon || "▫")}</span>
          <span class="cat-name">${esc(catDisplayName(cat))}</span>
          ${
            locked
              ? ""
              : `<button class="icon-btn cat-del" data-cat-id="${esc(cat.id)}" title="删除类别（类别下的条目也会一并删除）">×</button>`
          }
        </div>`;
      })
      .join("");
    if (addBtn) addBtn.insertAdjacentHTML("beforebegin", html);
    else list.insertAdjacentHTML("beforeend", html);

    $$("#cat-list .cat-tab").forEach((el) => {
      const cat = getCat(el.dataset.catId);
      const locked = catIsLocked(cat);
      el.addEventListener("click", (e) => {
        if (e.target.closest(".cat-del")) return;
        if (selectedCategoryId === el.dataset.catId) return;
        selectedCategoryId = el.dataset.catId;
        entrySortDir = "asc"; // 换一个类别，排序方向从 A→Z 重新开始
        // 这里只改选中态，不重画列表：重画会把节点换掉，双击（＝编辑）就接不上了
        $$("#cat-list .cat-tab").forEach((n) =>
          n.classList.toggle("current", n.dataset.catId === selectedCategoryId)
        );
        renderEntries();
      });
      // 双击页签＝编辑这个类别（和右键菜单里的「编辑」同一件事）
      el.addEventListener("dblclick", (e) => {
        if (e.target.closest(".cat-del")) return;
        if (locked) {
          showToast(catLockTip(cat));
          return;
        }
        openCatModal(el.dataset.catId);
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showCatMenu(ev.clientX, ev.clientY, el.dataset.catId);
      });
    });
    $$("#cat-list .cat-del").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteCat(b.dataset.catId);
      })
    );
    bindCategoryDragSort();
  }

  /* ---- 设定类别：左右拖动调整顺序（页签本来就是横排的） ---- */
  let catDragId = null;

  // 按页签当前的 DOM 顺序，把类别顺序写回数据
  function applyCatOrderFromDom() {
    const el = $("#cat-list");
    if (!el) return false;
    const ids = $$("#cat-list .cat-tab").map((n) => n.dataset.catId);
    if (!ids.length) return false;
    const map = new Map(state.settings.categories.map((c) => [c.id, c]));
    const next = ids.map((id) => map.get(id)).filter(Boolean);
    state.settings.categories.forEach((c) => {
      if (!next.includes(c)) next.push(c);
    });
    state.settings.categories = next;
    return true;
  }

  function bindCategoryDragSort() {
    $$("#cat-list .cat-tab").forEach((el) => {
      if (catIsLocked(getCat(el.dataset.catId))) return; // 固定类别不参与拖动 / 落点
      el.addEventListener("dragstart", (ev) => {
        catDragId = el.dataset.catId;
        el.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", catDragId);
          } catch (e) {
            /* ignore */
          }
        }
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        const moved = catDragId;
        catDragId = null;
        if (!moved) return;
        const before = state.settings.categories.map((c) => c.id).join(",");
        applyCatOrderFromDom();
        if (state.settings.categories.map((c) => c.id).join(",") === before) return;
        pendingUndoLabel = "调整设定类别顺序";
        saveState();
        renderCategories();
        showToast("已调整设定类别顺序");
      });
      // 拖动到别的类别上 → 直接把这个类别挪到它的前 / 后面（实时预览落点）
      el.addEventListener("dragover", (ev) => {
        if (!catDragId || el.dataset.catId === catDragId) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const dragging = $(`#cat-list .cat-tab[data-cat-id="${catDragId}"]`);
        if (!dragging) return;
        const rect = el.getBoundingClientRect();
        // 页签是横排（可能折行）的：按鼠标落在被压住那个页签的左半 / 右半来定前 / 后
        const before = ev.clientX < rect.left + rect.width / 2;
        el.parentElement.insertBefore(dragging, before ? el : el.nextSibling);
      });
      el.addEventListener("drop", (ev) => {
        if (!catDragId || el.dataset.catId === catDragId) return;
        ev.preventDefault();
      });
    });
  }

  function renderEntries() {
    // 设定档案里的势力条目一变（改名 / 复制 / 合并 / 删除），正开着的「势力分析」也要跟着变
    scheduleCharAnalysisRefresh();
    const cat = getCat(selectedCategoryId);
    const list = $("#entry-list");
    const empty = $("#entry-empty");
    updateEntrySortBtn();
    const sub = $("#entry-pane-sub");
    if (sub) {
      const fields =
        cat && cat.fieldTemplate && cat.fieldTemplate.length
          ? cat.fieldTemplate.map(uiDefaultLabel).join(" · ")
          : "";
      sub.innerHTML = cat
        ? (fields ? `<b>本类字段</b>：${esc(fields)}<br />` : "") +
          `<b>拖动卡片</b>＝调整条目顺序<br />` +
          (isChronoCategory(cat) ? "" : `<b>拖到分组标题上</b>＝归入该分组<br />`) +
          `<b>右键条目</b>＝${isChronoCategory(cat) ? "" : "换组 / "}移到别的类别 / 合并到别的条目 / 删除<br />` +
          `<b>自动合并</b>＝在这一类里找名字重复或疑似同一条的卡片，勾选后合并（可撤销）<br />` +
          `<b>批量</b>＝一次${isChronoCategory(cat) ? "" : "移入分组、"}合并、删除，或按阈值清理「只提了一句」的条目`
        : "";
    }

    const q = ($("#entry-search").value || "").trim().toLowerCase();
    const entries = state.settings.entries.filter((en) => en.categoryId === selectedCategoryId);
    empty.hidden = entries.length > 0;
    if (!cat) {
      list.innerHTML = "";
      renderEntryBatchBar();
      return;
    }
    // 纪年这类按时间顺序阅读的类别用单列布局，其余类别用多栏卡片
    const single = cat.layout === "list";
    list.classList.toggle("entry-list-single", single);
    renderMapPanel();
    renderTreePanel(); // 「树型拓扑」栏（勾了这个追加功能的类别才有）
    // 纪年不分组建，「＋ 分组」按钮直接收起来
    const newGroupBtn = $("#entry-new-group-btn");
    if (newGroupBtn) newGroupBtn.hidden = single;
    list.style.setProperty("--cat-accent", cat.color || "var(--accent-2)");
    updateEntrySortBtn();
    const filtered = entries.filter((en) => {
      if (!q) return true;
      // 名字之外，也按「关联人物」的名字搜：输人物名能找到挂了这个人的条目
      const names = [String(en.name || "")].concat(
        (en.characterIds || []).map((id) => {
          const c = getChar(id);
          return c ? String(c.name || "") : "";
        })
      );
      return names.some((s) => foldVariant(s).toLowerCase().includes(foldVariant(q)));
    });
    const groups = isChronoCategory(cat) ? [] : categorySettingGroups(cat.id);
    if (filtered.length === 0 && !groups.length) {
      list.innerHTML = `<p class="empty-tip">没有匹配的条目。</p>`;
      renderEntryBatchBar();
      return;
    }
    // 还没有分组时：平铺多栏（用瀑布式容器，卡片各自高度独立，折叠后下面的卡片会上顶）
    if (!groups.length) {
      list.innerHTML = `<div class="entry-flow">${filtered.map(entryCardHtml).join("")}</div>`;
      bindEntryCards();
      renderEntryBatchBar();
      return;
    }
    let blocks = groups.map((g) => ({
      id: g.id,
      group: g,
      name: g.name,
      collapsed: !!g.collapsed,
      items: filtered.filter((en) => (en.groupId || "") === g.id),
    }));
    const ungrouped = filtered.filter((en) => !en.groupId || !getSettingGroup(en.groupId));
    if (q) {
      blocks = blocks.filter((b) => b.items.length);
      if (ungrouped.length) blocks.push({ id: "", group: null, name: uiTextFor("未分组"), collapsed: false, items: ungrouped });
      if (!blocks.length) {
        list.innerHTML = `<p class="empty-tip">没有匹配的条目。</p>`;
        return;
      }
    } else {
      blocks.push({ id: "", group: null, name: uiTextFor("未分组"), collapsed: false, items: ungrouped });
    }
    // 勾选条目会重画整个列表：同样把滚动位置保留住
    const keepScroll = list.scrollTop;
    list.innerHTML = blocks.map((b) => entryGroupBlockHtml(b, single)).join("");
    bindEntryGroups();
    bindEntryCards();
    renderEntryBatchBar();
    if (keepScroll && list.scrollTop !== keepScroll) list.scrollTop = keepScroll;
  }

  function categorySettingGroups(catId) {
    return (state.settings.groups || []).filter((g) => g.categoryId === catId);
  }

  // 「纪年」是按时间顺序读的类别：不要分组，卡片平铺成一列，所有卡片都能上下拖动排序
  function isChronoCategory(cat) {
    return !!cat && cat.layout === "list";
  }

  /* ---- 设定条目：按名字首字母排序（纪年除外，它按时间顺序读） ---- */
  function updateEntrySortBtn() {
    const btn = $("#entry-sort-btn");
    const cat = getCat(selectedCategoryId);
    // 纪年 / 未选中类别时不出现这个按钮
    if (btn) {
      btn.hidden = !cat || cat.layout === "list";
      if (cat) {
        btn.textContent = entrySortDir === "asc" ? "A→Z" : "Z→A";
        btn.title = `「${catDisplayName(cat)}」按名字首字母排序：现在是 ${
          entrySortDir === "asc" ? "A → Z（升序）" : "Z → A（降序）"
        }；点一下切换成 ${entrySortDir === "asc" ? "Z → A（降序）" : "A → Z（升序）"}，可撤销。`;
      }
    }
    // 「层级排序」只在势力类别出现（别的类别没有层级）
    const hier = $("#entry-hier-sort-btn");
    if (hier) hier.hidden = !cat || catKind(cat) !== "faction";
  }

  /* 按层级排序（势力专用）：同一分组内，一级在前，紧跟着它的二级、三级（深度优先），
     同一层里保持用户原来的相对顺序。例：A1 A2 A3 A3' a2 a3 … */
  function sortEntriesByFactionTree() {
    const cat = getCat(selectedCategoryId);
    if (!cat || catKind(cat) !== "faction") return;
    const mine = state.settings.entries.filter((en) => en.categoryId === cat.id);
    if (mine.length < 2) {
      showToast(`「${catDisplayName(cat)}」还不到两条，不用排序`);
      return;
    }
    const byId = new Map(mine.map((en) => [en.id, en]));
    // 卡片实际显示在哪个分组：子级跟着所属那一级势力（plan.md 第 22 条）
    const groupOf = (en) => {
      const root = en.parentId && byId.has(en.parentId) ? factionRootOf(en) : null;
      return (root ? root.groupId : en.groupId) || "";
    };
    const childrenOf = (en) => mine.filter((x) => x.parentId === en.id);
    const out = [];
    const seen = new Set();
    const walk = (en) => {
      if (seen.has(en.id)) return;
      seen.add(en.id);
      out.push(en);
      childrenOf(en).forEach(walk);
    };
    // 分组顺序照旧（分组抬头里的顺序），每个分组内部按「一级 → 它的子级」走
    const groupKeys = [];
    mine.forEach((en) => {
      const g = groupOf(en);
      if (groupKeys.indexOf(g) < 0) groupKeys.push(g);
    });
    groupKeys.forEach((g) => {
      mine
        .filter((en) => groupOf(en) === g && !seen.has(en.id))
        .filter((en) => !en.parentId || !byId.has(en.parentId)) // 先走一级（含孤儿）
        .forEach(walk);
      // 兜底：链上出问题的（父级不在这一类里）也别漏
      mine.filter((en) => groupOf(en) === g && !seen.has(en.id)).forEach(walk);
    });
    if (out.length !== mine.length) mine.forEach(walk);
    pendingUndoLabel = `按层级排序：「${catDisplayName(cat)}」`;
    let i = 0;
    state.settings.entries = state.settings.entries.map((en) => (en.categoryId === cat.id ? out[i++] : en));
    saveState();
    renderEntries();
    renderEntryBatchBar();
    showToast(`已把「${catDisplayName(cat)}」按层级排好（可撤销）`);
  }

  function sortEntriesByInitial() {
    const cat = getCat(selectedCategoryId);
    if (!cat) return;
    if (cat.layout === "list") {
      showToast(`「${catDisplayName(cat)}」按时间顺序排列，不做首字母排序`);
      return;
    }
    const mine = state.settings.entries.filter((en) => en.categoryId === cat.id);
    if (mine.length < 2) {
      showToast(`「${catDisplayName(cat)}」还不到两条，不用排序`);
      return;
    }
    // entrySortDir 记的是「这一次点击要用的方向」，点完就翻面，正好是「再点一下反过来」
    const dir = entrySortDir;
    const sorted = mine
      .slice()
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN", {
          numeric: true,
          sensitivity: "base",
        })
      );
    if (dir === "desc") sorted.reverse();
    // 只重排这一类别的条目：把结果填回它们在总表里占的位置，别的类别不受影响
    pendingUndoLabel = `按首字母排序（${dir === "asc" ? "A→Z" : "Z→A"}）：「${catDisplayName(cat)}」`;
    let i = 0;
    state.settings.entries = state.settings.entries.map((en) => (en.categoryId === cat.id ? sorted[i++] : en));
    entrySortDir = dir === "asc" ? "desc" : "asc";
    saveState();
    renderEntries();
    showToast(`已按首字母排序「${catDisplayName(cat)}」：${dir === "asc" ? "A → Z" : "Z → A"}`);
  }

  function getSettingGroup(id) {
    return (state.settings.groups || []).find((g) => g.id === id) || null;
  }

  /* ---- 拖动分组标题（那一行分界线）＝调整分组的显示顺序 ----
     「未分组」没有 id、位置固定，只能当落点；只有这一个类别的分组顺序会变，
     其它类别的分组在 state.settings.groups 里的相对位置保持原样。 */
  let entryGroupDragId = null;

  // 按当前 DOM 顺序把「这一类」的分组顺序写回数据
  function applyEntryGroupOrderFromDom(catId) {
    const all = state.settings.groups || [];
    const ids = $$("#entry-list .entry-group-block")
      .map((b) => b.dataset.groupId)
      .filter(Boolean);
    if (ids.length < 2) return false;
    const map = new Map(all.map((g) => [g.id, g]));
    const mine = ids.map((id) => map.get(id)).filter(Boolean);
    if (mine.length < 2) return false;
    let i = 0;
    const next = all.map((g) => (g.categoryId === catId ? mine[i++] : g));
    if (next.map((g) => g.id).join(",") === all.map((g) => g.id).join(",")) return false;
    state.settings.groups = next;
    return true;
  }

  function entryGroupBlockHtml(b, single) {
    const head = `<div class="entry-group-head" data-group-id="${esc(b.id)}">
      <button class="icon-btn entry-group-toggle" title="${b.collapsed ? "展开分组" : "折叠分组"}">${b.collapsed ? "▶" : "▼"}</button>
      <span class="entry-group-name">${esc(b.name)}</span>
      <span class="entry-group-count">${b.items.length}</span>
      <span class="spacer"></span>
      ${b.group ? `<button class="icon-btn entry-group-rename" title="重命名分组">✎</button><button class="icon-btn entry-group-del" title="删除这个分组（组内条目不删除，会回到未分组）">×</button>` : ""}
    </div>`;
    const body = b.collapsed
      ? ""
      : `<div class="entry-group-body ${single ? "entry-layout-single" : ""}" data-group-id="${esc(b.id)}">${
          b.items.length ? b.items.map(entryCardHtml).join("") : `<p class="entry-group-empty">把卡片拖到这里可归入这一组</p>`
        }</div>`;
    return `<div class="entry-group-block" data-group-id="${esc(b.id)}">${head}${body}</div>`;
  }

  function bindEntryGroups() {
    // 分组标题可以拖动换序（未分组除外）；整块（标题 + 组内卡片）跟着一起走
    $$("#entry-list .entry-group-head").forEach((head) => {
      const block = head.closest(".entry-group-block");
      const gid = block ? block.dataset.groupId || "" : "";
      const canDrag = !!gid && !!getSettingGroup(gid);
      if (canDrag) {
        head.draggable = true;
        head.classList.add("can-drag");
        head.addEventListener("dragstart", (ev) => {
          entryGroupDragId = gid;
          if (block) block.classList.add("dragging");
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            try {
              ev.dataTransfer.setData("text/plain", "");
            } catch (e) {
              /* ignore */
            }
          }
          ev.stopPropagation();
        });
        head.addEventListener("dragend", () => {
          if (block) block.classList.remove("dragging");
          $$("#entry-list .entry-group-head").forEach((h) => h.classList.remove("drag-before", "drag-after"));
          const moved = entryGroupDragId;
          entryGroupDragId = null;
          if (!moved) return;
          if (!applyEntryGroupOrderFromDom(selectedCategoryId || "")) {
            renderEntries();
            return;
          }
          const g = getSettingGroup(moved);
          pendingUndoLabel = `调整分组顺序：「${(g && g.name) || ""}」换了位置`;
          saveState();
          renderEntries();
          showToast("已调整分组顺序（可用「撤销」还原）");
        });
      }
      // 落点：整块插到这一行前面 / 后面
      head.addEventListener("dragover", (ev) => {
        if (!entryGroupDragId || entryGroupDragId === gid) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const dragging = $(`#entry-list .entry-group-block[data-group-id="${entryGroupDragId}"]`);
        if (!dragging || !block) return;
        const rect = head.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        head.classList.toggle("drag-before", before);
        head.classList.toggle("drag-after", !before);
        const anchor = before ? block : block.nextElementSibling;
        if (!anchor || anchor === dragging) return;
        block.parentElement.insertBefore(dragging, anchor);
      });
      head.addEventListener("dragleave", () => head.classList.remove("drag-before", "drag-after"));
      head.addEventListener("drop", (ev) => {
        if (!entryGroupDragId) return;
        ev.preventDefault();
        ev.stopPropagation();
        head.classList.remove("drag-before", "drag-after");
      });
    });
    $$("#entry-list .entry-group-toggle").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const g = getSettingGroup(b.closest(".entry-group-block").dataset.groupId);
        if (!g) return;
        g.collapsed = !g.collapsed;
        saveState();
        renderEntries();
      })
    );
    $$("#entry-list .entry-group-rename").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        renameSettingGroup(b.closest(".entry-group-block").dataset.groupId);
      })
    );
    $$("#entry-list .entry-group-del").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteSettingGroup(b.closest(".entry-group-block").dataset.groupId);
      })
    );
    // 拖到分组标题或分组空白处 = 移入这一组
    $$("#entry-list .entry-group-head, #entry-list .entry-group-body").forEach((el) => {
      el.addEventListener("dragover", (ev) => {
        if (!entryDragging) return;
          // 指针在具体卡片上时，由那张卡片负责显示落点
        if (ev.target.closest(".entry-card")) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        el.classList.add("drop-hot");
          clearEntryDropFeedback();
          el.classList.add("drop-hot");
          /* 拖到分组空白处＝排到这一组最后（不再插占位块：一插多栏就重排） */
          entryDropMode = "after";
          entryDropTargetId = "";
          const body = el.closest(".entry-group-block")?.querySelector(".entry-group-body");
          const lastCard = body ? Array.from(body.querySelectorAll(".entry-card")).pop() : null;
          if (lastCard) entryDropTargetId = lastCard.dataset.entryId;
      });
      el.addEventListener("dragleave", () => el.classList.remove("drop-hot"));
      el.addEventListener("drop", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.remove("drop-hot");
        const gid0 = el.closest(".entry-group-block").dataset.groupId || "";
          const ids = entryDragIds && entryDragIds.length > 1 ? entryDragIds.slice() : null;
          const one = entryDragId || ev.dataTransfer.getData("text/plain");
          entryDragIds = null;
          clearEntryDropFeedback();
          // 拖到分组空白处＝排到这一组最后（moveEntryToGroup 的 beforeId 传 null 就是这个意思）
          if (ids) moveEntriesToGroup(ids, gid0);
          else if (one) moveEntryToGroup(one, gid0, null);
      });
    });
  }

  // 拖到某一组卡片下方的空白处＝并到这个分组（分组标题 / 分组内部已经各自处理过了）
  function bindEntryListDropZone() {
    const list = $("#entry-list");
    if (!list) return;
    if (list.dataset.entryDropZone === "1") return;
    list.dataset.entryDropZone = "1";
    list.addEventListener("dragover", (ev) => {
      if (!entryDragging) return;
      const onCard = ev.target.closest && ev.target.closest(".entry-card");
      if (!onCard && ev.target.closest && ev.target.closest(".entry-group-head, .entry-group-body")) return;
        // 卡片自己会处理落点（排序 / 变成子级），这里只管卡与卡之间的空白处
        if (onCard) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      list.classList.add("list-drop");
        /* 空白处：找离指针最近的那张卡，按「在它上方 / 下方」画落点线 ——
           同样不插占位块，布局不动。 */
        const near = nearestEntryCardForPoint(ev.clientX, ev.clientY);
        if (near) {
          markEntryDropTarget(near, ev); // 空白处按最近那张卡的上下半区落点
        } else {
          clearEntryDropFeedback();
          list.classList.add("list-drop");
      }
    });
    list.addEventListener("dragleave", (ev) => {
      // 指到列表外面（relatedTarget 不在列表里）就撤掉高亮，别让那圈虚线留在界面上
      const to = ev.relatedTarget;
      if (ev.target === list || !to || !list.contains(to)) list.classList.remove("list-drop");
    });
    list.addEventListener("drop", (ev) => {
      if (!entryDragging) return;
      const onCard = ev.target.closest && ev.target.closest(".entry-card");
      const chrono = isChronoCategory(getCat(selectedCategoryId));
      if (!onCard && ev.target.closest && ev.target.closest(".entry-group-head, .entry-group-body")) return;
        if (onCard) return; // 卡片自己的 drop 处理
      ev.preventDefault();
      ev.stopPropagation();
      const ids = entryDragIds && entryDragIds.length > 1 ? entryDragIds.slice() : null;
      const one = entryDragId;
        const mode = entryDropMode;
        const beforeId = entryDropBeforeId();
        const targetEntry = getEntry(entryDropTargetId);
        const gid = targetEntry ? targetEntry.groupId || "" : "";
      entryDragIds = null;
        clearEntryDropFeedback();
        if (!beforeId && !gid) {
          // 没算出落点：退回按 Y 落到某个分组
          const gid0 = groupIdAtY($$("#entry-list .entry-group-head"), ev.clientY);
          if (ids) moveEntriesToGroup(ids, gid0);
          else if (one) moveEntriesToGroup([one], gid0);
          return;
        }
        if (ids) moveEntriesToGroup(ids, gid || (chrono ? "" : gid));
        else if (one) moveEntryToGroup(one, chrono ? "" : gid, beforeId);
    });
  }

  // 设定卡片的拖动：批量模式下勾选过的整批一起带走（拖到分组标题 / 卡片上＝换组）
  function bindEntryCardDrag(el) {
    if (!el || el.dataset.entryDragBound === "1") return;
    el.dataset.entryDragBound = "1";
    el.addEventListener("dragstart", (ev) => {
      entryDragging = true;
      // 批量模式下，勾选过的卡片拖动时整批一起带上
      entryDragIds =
        entryBatchMode && entryBatchSel.has(el.dataset.entryId) && entryBatchSel.size > 1
          ? (pruneSelectionToVisible("entry"), Array.from(entryBatchSel))
          : null;
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      try {
        ev.dataTransfer.setData("text/plain", el.dataset.entryId);
      } catch (e) {
        /* ignore */
      }
      el.classList.add("dragging");
      // 注意：dragstart 里不要动 DOM（插占位块会让浏览器取消整次拖拽），
      // 占位块在第一次 dragover 时才创建并插入
      entryDragId = el.dataset.entryId;
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      entryDragIds = null;
      clearDragPlaceholder();
      clearEntryDropTargets();
      setTimeout(() => {
        entryDragging = false;
      }, 60);
    });
  }

  /* ---- 设定卡拖动落点：排序（在卡片边上画一条线）/ 势力变成子级（整张卡点亮）----
     注意：**不能**再往多栏排版里插「占位块」了 —— 一插整列就会重新均衡，鼠标底下的卡片
     当场跑走，松手时命中的往往已经不是原来那张卡（拖动排序失败就是这么来的）。
     现在改成只在卡片上加类名画落点，布局一动不动。 */
  let entryDropMode = ""; // "before" | "after" | "child"
  let entryDropTargetId = "";

  function clearEntryDropFeedback() {
    $$("#entry-list .entry-card").forEach((el) => {
      el.classList.remove("drop-target", "drop-before", "drop-after");
    });
    const list = $("#entry-list");
    if (list) list.classList.remove("list-drop");
    try {
      uiHideTip();
    } catch (e) {
      /* ignore */
    }
    entryDropMode = "";
    entryDropTargetId = "";
  }

  /* 按指针在卡片里的位置标落点：上半 ＝ 插到这张卡前面，下半 ＝ 插到后面。
     和别的类别完全一样。（拖到卡片上「变成子级势力」那套 2026-10-15 按用户要求停用：
     它会占掉卡片中间的落点，导致正常排序经常点不中。改所属请用卡片上的「所属…」或信息卡。） */
  function markEntryDropTarget(card, ev) {
    if (!card || !card.dataset || !card.dataset.entryId) return;
    const id = card.dataset.entryId;
    const dragging = (entryDragIds && entryDragIds.length ? entryDragIds : [entryDragId]).filter(Boolean);
    const others = dragging.filter((x) => x !== id);
    if (!others.length) return; // 只有自己在拖：不给落点
    const rect = card.getBoundingClientRect();
    const rel = rect.height ? (ev.clientY - rect.top) / rect.height : 0.5;
    $$("#entry-list .entry-card").forEach((el) => {
      if (el === card) return;
      el.classList.remove("drop-target", "drop-before", "drop-after");
    });
    const before = rel < 0.5;
    card.classList.add("drop-target", before ? "drop-before" : "drop-after");
    try {
      uiHideTip();
    } catch (e) {
      /* ignore */
    }
    entryDropMode = before ? "before" : "after";
    entryDropTargetId = id;
  }

  // 「插到目标后面」＝插到目标之后第一条不在被拖集合里的条目前面
  function entryDropBeforeId() {
    const target = getEntry(entryDropTargetId);
    if (!target) return null;
    if (entryDropMode === "before") return target.id;
    const list = state.settings.entries.filter((e) => e.categoryId === target.categoryId);
    const idx = list.findIndex((e) => e.id === target.id);
    const dragging = new Set((entryDragIds && entryDragIds.length ? entryDragIds : [entryDragId]).filter(Boolean));
    for (let i = idx + 1; i < list.length; i++) if (!dragging.has(list[i].id)) return list[i].id;
    return null; // 后面没有了 → 落到这一类末尾
  }

  // 找离指针最近的那张卡（空白处落点用；被拖的卡本身不算）
  function nearestEntryCardForPoint(x, y) {
    const dragging = new Set((entryDragIds && entryDragIds.length ? entryDragIds : [entryDragId]).filter(Boolean));
    let best = null;
    let bestD = Infinity;
    $$("#entry-list .entry-card").forEach((el) => {
      if (dragging.has(el.dataset.entryId)) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    });
    return best;
  }

  function bindEntryCards() {
    bindEntryListDropZone();
    $$("#entry-list .entry-card").forEach((el) => {
      if (entryBatchMode) {
        el.addEventListener("click", (ev) => {
          const id = el.dataset.entryId;
          if (ev.shiftKey)
            shiftClickCard("entry", id, visibleEntryIdsForShortcut(), entryBatchSel, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("entry", id, entryBatchSel);
        });
        // 批量模式下也要能拖动：勾选过的整批一起拖到别的分组
        bindEntryCardDrag(el);
        return;
      }
      // 卡片右上角的快捷编辑 / 删除
      el.querySelectorAll(".entry-edit").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openEntryModal(b.dataset.entryId);
        })
      );
      el.querySelectorAll(".entry-del").forEach((b) =>
        b.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          await deleteEntryById(b.dataset.entryId);
        })
      );
      el.querySelectorAll(".entry-fold").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          toggleEntryFold(b.dataset.entryId);
        })
      );
      el.addEventListener("click", (ev) => {
        const id = el.dataset.entryId;
          /* 卡面上的「所属」现在只显示、不给点（改所属去信息卡的「所属」输入框 / 右键菜单） */
        // Shift＝连选、Ctrl/Cmd＝加选：自动进入批量模式，不打开编辑弹窗
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          ev.stopPropagation();
          ensureEntryBatchMode();
          if (ev.shiftKey)
            shiftClickCard("entry", id, visibleEntryIdsForShortcut(), entryBatchSel, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("entry", id, entryBatchSel);
          return;
        }
        if (entryDragging) return;
        markShortcutAnchor("entry", id);
        // 点人物圈圈：先等一拍（可能是「双击打开人物卡」的第一下）
        if (delayCardOpenFromChip(ev.target, () => openEntryModal(id))) return;
        openEntryModal(id);
      });
      // 双击人物圈圈 / 人名＝打开这张人物卡
      el.addEventListener("dblclick", (ev) => {
        if (!openCharFromChip(ev.target)) return;
        cancelCardOpenFromChip();
        ev.preventDefault();
        ev.stopPropagation();
      });
      el.addEventListener("contextmenu", (ev) => {
        // 右键人物圈圈＝人物卡那套菜单
        if (showCharChipMenu(ev)) return;
        ev.preventDefault();
        exitSelectModesForContextMenu();
        showEntryGroupMenu(ev.clientX, ev.clientY, el.dataset.entryId);
      });
      bindEntryCardDrag(el);
      el.addEventListener("dragover", (ev) => {
        // 拖人物进来：加入这个条目（势力条目会同步到人物的「所属势力」）
        const data = dragDataOf(ev);
        if (data && (data.type === "char" || data.type === "chars")) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "copy";
          el.classList.add("char-drop");
          return;
        }
        if (!entryDragging) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        markEntryDropTarget(el, ev); // 上半＝插到前面、下半＝插到后面（和别的类别一样）
      });
      /* dragleave 只收「拖人物进来」那个提示。落点高亮**不在这里清** ——
         浏览器在卡片与子元素之间来回时会连发 dragleave，一清就闪（看着像落点没生效）；
         改落点时会由 markEntryDropTarget 清掉别的卡，拖完由 clearEntryDropTargets 统一清。 */
      el.addEventListener("dragleave", () => el.classList.remove("char-drop"));
      el.addEventListener("drop", (ev) => {
        const data = dragDataOf(ev);
        if (data && (data.type === "char" || data.type === "chars")) {
          ev.preventDefault();
          ev.stopPropagation();
          el.classList.remove("char-drop");
          addCharsToEntry(data.type === "chars" ? data.ids : [data.id], el.dataset.entryId);
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        const mode = entryDropMode;
        const targetId = entryDropTargetId || el.dataset.entryId;
        const beforeId = entryDropBeforeId();
        const targetEntry = getEntry(targetId);
        const gid = targetEntry ? targetEntry.groupId || "" : el.closest(".entry-group-block")?.dataset.groupId || "";
        const draggingIds = (entryDragIds && entryDragIds.length > 1 ? entryDragIds.slice() : null) || [entryDragId || ev.dataTransfer.getData("text/plain")].filter(Boolean);
        entryDragIds = null;
        clearEntryDropFeedback();
        if (draggingIds.length > 1) {
          // 整批：换到目标卡所在的分组（纪年那类本来就不分组，落到 "" 即可）
          const targetCat = targetEntry ? getCat(targetEntry.categoryId) : null;
          if (targetCat && isChronoCategory(targetCat)) moveEntriesBefore(draggingIds, beforeId);
          else moveEntriesToGroup(draggingIds, gid);
          return;
        }
        const one = draggingIds[0];
        if (!one || one === targetId) return;
        const gid0 = (targetEntry && isChronoCategory(getCat(targetEntry.categoryId))) ? "" : gid;
        moveEntryToGroup(one, gid0, beforeId);
      });
    });
  }

  function clearEntryDropTargets() {
    clearEntryDropFeedback();
  }

  /* ---- 设定档案：批量删除 ---- */
  function renderEntryBatchBar() {
    const bar = $("#entry-batch-bar");
    if (!bar) return;
    bar.hidden = !entryBatchMode;
    const curCat = getCat(selectedCategoryId);
    // 纪年不分组建：工具条上的「移入分组」也一并收起
    const moveWrap = bar.querySelector(".batch-group-move");
    if (moveWrap) moveWrap.hidden = isChronoCategory(curCat);
    const btn = $("#entry-batch-btn");
    if (btn) {
      btn.classList.toggle("btn-primary", entryBatchMode);
      btn.textContent = entryBatchMode ? "退出批量" : "批量";
    }
    if (!entryBatchMode) {
      const mergeBtn0 = $("#entry-batch-merge");
      if (mergeBtn0) mergeBtn0.disabled = false;
      const delBtn0 = $("#entry-batch-delete");
      if (delBtn0) delBtn0.disabled = false;
      const copyBtn0 = $("#entry-batch-copy");
      if (copyBtn0) copyBtn0.disabled = false;
      return;
    }
    const visEntrySet = new Set(shownEntryIds());
    const visEntrySel = Array.from(entryBatchSel).filter((id) => visEntrySet.has(id)).length;
    const hidEntrySel = entryBatchSel.size - visEntrySel;
    // 同样：这句别写太长，免得工具条换行、把下面的卡片列表挤矮
    $("#entry-batch-count").textContent = `已选 ${visEntrySel} 条${hidEntrySel ? `（另有 ${hidEntrySel} 个被藏起来）` : ""}`;
    const entryCountEl = $("#entry-batch-count");
    if (entryCountEl)
      entryCountEl.title = "被搜索或折叠藏起来的条目不在批量范围内；勾选后可以移动分组 / 合并 / 删除。";
    const mergeBtn = $("#entry-batch-merge");
    if (mergeBtn) {
      mergeBtn.disabled = entryBatchSel.size < 2;
      mergeBtn.title =
        entryBatchSel.size < 2
          ? "至少勾选两个条目才能合并：先勾的那一条作为主条目"
          : `把勾选的 ${entryBatchSel.size} 个条目合并成一个（先勾的「${
              (getEntry(Array.from(entryBatchSel)[0]) || {}).name || ""
            }」为主）`;
    }
    const delBtn = $("#entry-batch-delete");
    if (delBtn) delBtn.disabled = entryBatchSel.size === 0;
    const copyBtn = $("#entry-batch-copy");
    if (copyBtn) copyBtn.disabled = entryBatchSel.size === 0;
    const sel = $("#entry-batch-group");
    if (sel) {
      const cat = getCat(selectedCategoryId);
      const groups = cat ? categorySettingGroups(cat.id) : [];
      const cur = sel.value;
      sel.innerHTML =
        `<option value="">未分组</option>` +
        groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("") +
        `<option value="__new__">＋ 新建…</option>`;
      sel.value = cur === "__new__" || cur === "" || groups.some((g) => g.id === cur) ? cur : "";
    }
    /* 「移动到…（换类别）」：列出别的选项卡，选好再点按钮。
       只有一个类别时整组收起来（没地方可移）。 */
    const catSel = $("#entry-batch-cat");
    if (catSel) {
      const others = state.settings.categories.filter((c) => c.id !== selectedCategoryId);
      const curV = catSel.value;
      catSel.innerHTML =
        `<option value="">移动到…</option>` +
        others.map((c) => `<option value="${esc(c.id)}">${esc(catDisplayName(c))}</option>`).join("");
      catSel.value = others.some((c) => c.id === curV) ? curV : "";
      const wrap = catSel.closest(".batch-cat-move");
      if (wrap) wrap.hidden = others.length === 0;
      const mvBtn = $("#entry-batch-cat-move");
      if (mvBtn) mvBtn.disabled = others.length === 0;
    }
  }

  /* 批量把勾选的条目移到别的类别（＝换选项卡）：字段 / 关联人物保留；
     目标类别没有雷达图（非装备）时，雷达图与数值一起清掉。可撤销。 */
  function entryBatchMoveCat() {
    const dropped = pruneSelectionToVisible("entry");
    const ids = Array.from(entryBatchSel).filter((id) => getEntry(id));
    if (!ids.length) {
      uiAlert(dropped ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来" : "请先勾选要移动的条目。");
      return;
    }
    const sel = $("#entry-batch-cat");
    const to = getCat(sel ? sel.value : "");
    if (!to) {
      uiAlert("先选一个要移到的类别。");
      return;
    }
    const n = applyEntryCategoryMove(ids, to.id, to);
    if (n) {
      ids.forEach((id) => entryBatchSel.delete(id));
      renderEntryBatchBar();
    }
  }

  // 批量把勾选的条目移到某个分组
  async function entryBatchMove() {
    const dropped = pruneSelectionToVisible("entry");
    const ids = Array.from(entryBatchSel).filter((id) => getEntry(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先勾选要调整的条目。"
      );
      return;
    }
    const sel = $("#entry-batch-group");
    let gid = sel ? sel.value : "";
    if (gid === "__new__") {
      const cat = getCat(selectedCategoryId);
      const name = await uiPrompt("新分组的名称？");
      if (name === null || !String(name).trim()) return;
      const g = { id: uid(), categoryId: cat ? cat.id : "", name: String(name).trim(), collapsed: false };
      state.settings.groups.push(g);
      gid = g.id;
    }
    ids.forEach((id) => {
      const en = getEntry(id);
      if (en) en.groupId = gid;
    });
    if (gid) {
      const g = getSettingGroup(gid);
      if (g) g.collapsed = false;
    }
    saveState();
    renderEntries();
    renderEntryBatchBar();
  }

  function toggleEntryBatch() {
    entryBatchMode = !entryBatchMode;
    entryBatchSel.clear();
    renderEntries();
    renderEntryBatchBar();
  }

  function entryBatchSelectAll() {
    // 只作用于当前显示出来的条目（搜索 / 分组折叠之后剩下的那些）
    const ids = shownEntryIds();
    if (!ids.length) {
      showToast("当前没有显示出来的条目");
      return;
    }
    const all = ids.every((id) => entryBatchSel.has(id));
    ids.forEach((id) => {
      if (all) entryBatchSel.delete(id);
      else entryBatchSel.add(id);
    });
    renderEntries();
    renderEntryBatchBar();
    showToast(all ? `已取消全选（当前显示的 ${ids.length} 条）` : `已全选当前显示的 ${ids.length} 条`);
  }

  // 把若干条目并进 keep：先勾的那条为主，其余当作补充填进去（同名词条、重复条目都用它）
  function mergeEntriesInto(keep, drops, opts) {
    // 自动合并时由调用方统一写「自动合并 N 组」的撤回标签，这里就不要覆盖它
    if (!(opts && opts.keepLabel)) {
      pendingUndoLabel = `合并设定条目：${drops.map((d) => "「" + d.name + "」").join("、")} → 「${keep.name}」`;
    }
    keep.fields = keep.fields || [];
    const aliasNames = [];
    // 合并后的词条名：弹窗里算好的结果名（主体名 / 最完整名 / 双击改过的名字）
    const wantName = String((opts && opts.finalName) || "").trim();
    if (wantName && wantName !== String(keep.name || "").trim()) {
      if (String(keep.name || "").trim()) aliasNames.push(String(keep.name).trim());
      keep.name = wantName;
    }
    drops.forEach((d) => {
      (d.fields || []).forEach((f) => {
        const label = String(f.label || "").trim();
        const value = String(f.value || "").trim();
        if (!label && !value) return;
        const own = keep.fields.find((x) => String(x.label || "").trim() === label);
        if (!own) keep.fields.push({ label: f.label || "", value: f.value || "" });
        // 主体的字段值排在前面，被合并进来的接着写，不丢内容
        else own.value = mergeFieldText(own.value, f.value, label);
      });
      if (String(d.summary || "").trim()) keep.summary = mergeFieldText(keep.summary, d.summary, "summary");
      if (!String(keep.image || "").trim() && String(d.image || "").trim()) keep.image = d.image;
      keep.characterIds = Array.from(new Set((keep.characterIds || []).concat(d.characterIds || [])));
      keep.eventIds = Array.from(new Set((keep.eventIds || []).concat(d.eventIds || [])));
      keep.tags = Array.from(new Set((keep.tags || []).concat(d.tags || [])));
      // 主条目没有分组就跟着被合并的条目走，避免合并后掉出分组
      if (!keep.groupId && d.groupId) keep.groupId = d.groupId;
      /* 雷达图：主体还没有自己的顶点表时，先把被合并的抄过来（名字 / 说明 / 维度都跟着来），
         数值只补主体没填的顶点（不覆盖主体自己的分数）。 */
      if ((!Array.isArray(keep.radarAxes) || !keep.radarAxes.length) && Array.isArray(d.radarAxes) && d.radarAxes.length)
        keep.radarAxes = d.radarAxes.map((a) => ({ key: a.key, label: a.label, desc: a.desc }));
      if (d.radar && typeof d.radar === "object" && !Array.isArray(d.radar)) {
        if (!keep.radar || typeof keep.radar !== "object") keep.radar = {};
        Object.keys(d.radar).forEach((k) => {
          if (keep.radar[k] == null && d.radar[k] != null) keep.radar[k] = d.radar[k];
        });
        if (d.radarOn === true && keep.radarOn !== true) keep.radarOn = true;
      }
      /* 树型拓扑：被并掉那些卡的节点删掉，只留主体的节点；
         它们原来的子节点改挂到主体下（主体没有节点就变悬空），别让树上断出孤儿。 */
      {
        const cat = getCat(d.categoryId);
        if (cat && catTreeFeatureOn(cat)) {
          const t = ensureCatTree(cat);
          const kids = treeDirectChildren(cat, d.id);
          const keepNode = t.nodes[keep.id];
          delete t.nodes[d.id];
          kids.forEach((k) => {
            const n = t.nodes[k];
            if (!n) return;
            n.parent = keepNode ? keep.id : "";
          });
        }
      }
      if (d.name && d.name !== keep.name) aliasNames.push(d.name);
    });
    // 被合并进来的名字记进「别名」，卡片上也用标签显示，方便以后认出同一个东西
    if (aliasNames.length) {
      let aliasField = keep.fields.find((x) => /别名|别称|又称|其他写法/.test(String(x.label || "")));
      if (!aliasField) {
        aliasField = { label: "别名", value: "" };
        keep.fields.push(aliasField);
      }
      const cur = String(aliasField.value || "")
        .split(/[、,，;；]/)
        .map((s) => s.trim())
        .filter(Boolean);
      aliasNames.forEach((n) => {
        if (!cur.includes(n)) cur.push(n);
      });
      aliasField.value = cur.join("、");
      keep.tags = Array.from(new Set((keep.tags || []).concat(aliasNames)));
    }
    // 人物「所属势力」里指向被合并条目的，改成指向主条目
    const dropIds = new Set(drops.map((d) => d.id));
      /* 势力：被并掉那几条的子级改挂到保留的这条下面，别让它们变成孤儿；
         主体的分级不动（plan.md：合并按主体卡片的分级来）。
         如果主体已经是三级、挂它下面会超三级，就把这些子级挂到主体的上级那儿
         （等于和主体同级），层级不降，也不会出现第四级。 */
      const keepLvl = catKind(getCat(keep.categoryId)) === "faction" ? factionLevelOf(keep) : 0;
      let childTarget = keep.id;
      if (keepLvl && keepLvl + 1 > FACTION_MAX_LEVEL) {
        /* 主体已经是三级：子级挂到主体的上级去（同级）。
           万一那个上级正好也是这次被并掉的条目，就继续往上找，别挂到一条马上要被删的条目上。 */
        let up = keep.parentId || "";
        const seen = new Set();
        while (up && dropIds.has(up) && !seen.has(up)) {
          seen.add(up);
          const upEn = getEntry(up);
          up = upEn ? upEn.parentId || "" : "";
        }
        childTarget = up;
      }
      state.settings.entries.forEach((en) => {
        if (en.parentId && dropIds.has(en.parentId) && en.id !== keep.id) en.parentId = childTarget;
      });
    (state.characters || []).forEach((c) => {
      const list = c.factionIds || [];
      if (!list.some((id) => dropIds.has(id))) return;
      const next = list.filter((id) => !dropIds.has(id));
      if (!next.includes(keep.id)) next.push(keep.id);
      c.factionIds = next;
    });
    state.settings.entries = state.settings.entries.filter((en) => en.id === keep.id || !dropIds.has(en.id));
      sanitizeFactionParents(); // 合并可能让 parentId 指向被删掉的条目
    // 出处：和人物一样，取所有被合并条目里最靠前的那一条
    applyEarliestSource(
      keep,
      [keep].concat(drops).map((en) => (en && en.notes) || "")
    );
    // 「势力」条目：合并后把成员重新写回人物的「所属势力」
    const cat = getCat(keep.categoryId);
    if (cat && catKind(cat) === "faction") linkCharsToFactionEntry(keep);
  }

  /* ---- 设定条目：自动合并（仿照人物卡片的「自动合并」） ---- */
  // 一条设定记录有多适合当「主体」：字段更全、带概述和关联的更合适
  function entryMainScore(en) {
    if (!en) return -999;
    let s = 0;
    s += (en.fields || []).filter((f) => String((f && f.value) || "").trim()).length * 2;
    if (String(en.summary || "").trim()) s += 2;
    if (String(en.image || "").trim()) s += 1;
    s += Math.min(4, (en.characterIds || []).length) * 0.5;
    s += Math.min(4, (en.eventIds || []).length) * 0.5;
    if (String(en.groupId || "").trim()) s += 1;
    if (String(en.notes || "").trim()) s += 0.5;
    return s;
  }

  // 条目名 + 「别名」字段里的写法，都算这个名字的候选写法
  function entryNameKeys(en) {
    const out = [];
    const add = (s) => {
      const t = normName(s);
      if (t) out.push(t);
    };
    add(en && en.name);
    entryNamesFor(en || {}).forEach(add);
    return Array.from(new Set(out));
  }

  // 两条设定是不是同一个东西：名字相同 / 别名 / 带括号的简称 / 只差一点修饰词 / 字面高度重合
  function entrySimilarName(a, b) {
    const ka = entryNameKeys(a);
    const kb = entryNameKeys(b);
    for (let i = 0; i < ka.length; i++) {
      for (let j = 0; j < kb.length; j++) {
        const x = ka[i];
        const y = kb[j];
        if (!x || !y) continue;
        if (x === y) return true;
        if (samePerson(x, y)) return true;
        // 疑似错别字（同音 / 形近 / 两字颠倒 / 几乎只差一两个字）也算同一条，交给用户确认
        if (typoSameName(x, y)) return true;
        const short = x.length <= y.length ? x : y;
        const long = x.length <= y.length ? y : x;
        // 「白塔」/「王都白塔」：一个名字整个包含了另一个，而且只多出一点点修饰词
        if (short.length >= 2 && long.indexOf(short) >= 0 && long.length - short.length <= 4) return true;
        // 「圣光教团」/「圣光教会」：前几个字完全一样，只有结尾一点点不同
        let cp = 0;
        while (cp < x.length && cp < y.length && x.charAt(cp) === y.charAt(cp)) cp++;
        if (cp >= 3 && x.length - cp <= 2 && y.length - cp <= 2) return true;
        // 「星辉学院」/「星辉学园」这类音译 / 译名变体：字面高度重合
        if (short.length >= 3) {
          const A = bigrams(x);
          const B = bigrams(y);
          const setB = new Set(B);
          let inter = 0;
          A.forEach((g) => {
            if (setB.has(g)) inter++;
          });
          if (A.length && B.length && (2 * inter) / (A.length + B.length) >= 0.7) return true;
        }
      }
    }
    return false;
  }

  // 这一组设定条目为什么被凑到一起：给合并弹窗里显示的「理由」
  function entryClusterWhy(members) {
    const hits = [];
    for (let i = 0; i < members.length; i++) {
      const ka = entryNameKeys(members[i]);
      for (let j = i + 1; j < members.length; j++) {
        const kb = entryNameKeys(members[j]);
        ka.forEach((x) =>
          kb.forEach((y) => {
            const r = typoNameReason(x, y);
            if (r && !hits.some((t) => t.a === x && t.b === y)) hits.push({ a: x, b: y, r });
          })
        );
      }
    }
    if (!hits.length) return uiTextFor("名字相同 / 别名 / 简称 / 只差一点修饰词");
    return `疑似错别字「${hits[0].a}」≈「${hits[0].b}」`;
  }

  // 把互为「同一条设定」的条目聚成组（每个组里只要有两条及以上就值得合并）
  function findDuplicateEntryClusters(catId) {
    const list = state.settings.entries.filter((en) => !catId || en.categoryId === catId);
    const used = new Set();
    const clusters = [];
    list.forEach((en) => {
      if (used.has(en.id)) return;
      used.add(en.id);
      const cluster = [en.id];
      // 反复扫：A≈B、B≈C 时也要把 C 收进同一组
      let changed = true;
      while (changed) {
        changed = false;
        list.forEach((o) => {
          if (used.has(o.id)) return;
          if (cluster.some((id) => entrySimilarName(getEntry(id), o))) {
            cluster.push(o.id);
            used.add(o.id);
            changed = true;
          }
        });
      }
      if (cluster.length > 1) clusters.push(cluster);
    });
    return clusters;
  }

  // 合并项的悬浮说明：这条出自哪里、会导入哪些信息、谁会成为主体
  function entryMergeTip(keep, drops, extra, finalNameOverride) {
    const list = Array.isArray(drops) ? drops.filter(Boolean) : [drops].filter(Boolean);
    const srcOf = (en) => {
      const bits = [];
      const cat = en ? getCat(en.categoryId) : null;
      if (cat) bits.push("类别：" + catDisplayName(cat));
      const g = en && en.groupId ? getSettingGroup(en.groupId) : null;
      if (g) bits.push("分组：" + g.name);
      const m = String((en && en.notes) || "").match(/出处：([^\n]+)/);
      if (m) bits.push("出处：" + sourceWithRow(m[1].trim()));
      return bits.join("　");
    };
    const fieldsOf = (en) =>
      (en && en.fields ? en.fields : [])
        .filter((f) => String((f && f.value) || "").trim())
        .map((f) => String(f.label || "字段") + "＝" + String(f.value).replace(/\s+/g, " ").slice(0, 40));
    const summaryOf = (en) => (String((en && en.summary) || "").trim() ? String(en.summary).replace(/\s+/g, " ").slice(0, 80) : "");
    const lines = [];
    if (keep) {
      lines.push(`【已有】${keep.name}${srcOf(keep) ? "（" + srcOf(keep) + "）" : ""}`);
      const kf = fieldsOf(keep);
      lines.push(kf.length ? "现有信息：" + kf.join("；") : "现在还没有其它信息");
      if (String((keep && keep.image) || "").trim()) lines.push("有设定图片");
      if (summaryOf(keep)) lines.push("概述：" + summaryOf(keep));
    }
    let best = keep;
    list.forEach((en) => {
      lines.push("");
      lines.push(`【新识别】${en.name}${srcOf(en) ? "（" + srcOf(en) + "）" : ""}`);
      const df = fieldsOf(en);
      lines.push(df.length ? "会导入这些信息：" + df.join("；") : "这条记录没有额外字段");
      if ((en.characterIds || []).length) lines.push(`关联人物：${(en.characterIds || []).length} 位`);
      if ((en.eventIds || []).length) lines.push(`关联事件：${(en.eventIds || []).length} 个`);
      if (String(en.image || "").trim() && !String((keep && keep.image) || "").trim()) lines.push("会带过来它的设定图片");
      if (summaryOf(en)) lines.push("概述：" + summaryOf(en));
      if (entryMainScore(en) > entryMainScore(best)) best = en;
    });
    lines.push("");
    const shownName =
      String(finalNameOverride || "").trim() ||
      (keep ? String(keep.name || "").trim() : "") ||
      fullestNameOf([keep].concat(list));
    const manualName = !!String(finalNameOverride || "").trim() && shownName !== (keep ? String(keep.name || "").trim() : "");
    lines.push(uiSentence("mergeName", shownName, uiTextFor(manualName ? "你手动指定的名字" : "用主体的名字")));
    lines.push(
      uiSentence("mergeKey", best ? best.name : uiTextFor("（未知）"), "", uiSentence("mergeKeyEntryTail"))
    );
    if (extra) lines.push(extra);
    return lines.join("\n");
  }

  // 设定档案里的「自动合并」：在同一个类别里找重复 / 疑似同一条的卡片，勾选后合并
  function mergeDuplicateEntries(catId) {
    const cat = getCat(catId || selectedCategoryId);
    const scope = cat ? cat.id : "";
    // 「设置 → 设定档案 → 自定义规则」里标了「静默合并」的先按规则并掉，其余命中项进弹窗
    const silentN = applySilentEntryRuleMerges(scope);
    const ruleClusters = entryRuleClusters(scope);
    const ruleWhyOf = new Map();
    ruleClusters.forEach((cl) => ruleWhyOf.set(cl.ids.slice().sort().join("\u0001"), cl.why));
    const clusters = ruleClusters.map((cl) => cl.ids).concat(findDuplicateEntryClusters(scope));
      /* 势力：同一根链条上的条目（父子 / 祖孙）不放进同一组自动合并 ——
         合并按主体卡的分级来，链上互并会把层级搞乱。 */
      const isFactionScope = catKind(cat) === "faction";
      const mergeClusters = isFactionScope
        ? clusters
            .map((ids) => {
              const kept = [];
              ids.forEach((id) => {
                const en = getEntry(id);
                const chain = new Set(en ? factionChainOf(en).map((x) => x.id) : []);
                const clash = kept.some((kid) => {
                  const k = getEntry(kid);
                  const kChain = new Set(k ? factionChainOf(k).map((x) => x.id) : []);
                  return chain.has(kid) || kChain.has(id);
                });
                if (!clash) kept.push(id);
              });
              return kept;
            })
            .filter((ids) => ids.length > 1)
        : clusters;
      if (!mergeClusters.length) {
      uiAlert(
        silentN
          ? `已按自定义规则静默合并 ${silentN} 组，没有别的可合并项了。`
          : cat
            ? `「${catDisplayName(cat)}」里没有发现可以合并的重复条目。`
            : "没有发现可以合并的重复条目。"
      );
      return;
    }
    openMergeDialog(
      `确认合并「${cat ? catDisplayName(cat) : "设定"}」里重复的条目`,
        mergeClusters.map((idList) => {
        const members = idList.map((id) => getEntry(id)).filter(Boolean);
        members.sort((a, b) => entryMainScore(b) - entryMainScore(a));
        const why = ruleWhyOf.get(idList.slice().sort().join("\u0001")) || entryClusterWhy(members);
        return makeSwapItem(members, 0, (k, ds, i, ctx) => {
          const picks = ctx.picks(ctx.ordered, null, (m) =>
            entryRecordTip(m, m.id === k.id ? "主体（字段以它为先）" : "参与合并")
          );
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason: `${why} · ${uiMergeTail(ds.length, { onlyOne: true })}`,
            tip: entryMergeTip(k, ds, "默认挑信息最完整的那条当主体（排最前）。"),
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              const names = { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(inc)) };
              return {
                tip: entryMergeTip(
                  k,
                  inc,
                  uiMergeTail(inc.length, { kept: ds.length > inc.length, onlyOne: true }),
                  pickMergeName(it, names)
                ),
                reason:
                  inc.length === 0
                    ? `${why} · ${uiMergeTail(0, { onlyOne: true })}`
                    : `${why} · ${uiMergeTail(inc.length, { kept: ds.length > inc.length })}`,
                names,
              };
            },
            apply: (finalName) => {
              const real = ds.filter(ctx.included);
              if (!real.length) return;
              mergeEntriesInto(k, real, { keepLabel: true, finalName });
            },
          };
        });
      }),
      "设定条目"
    );
  }

  // 设定条目的「别名」：名字 + 字段里写的别名
  function entryNamesFor(en) {
    const names = [en && en.name];
    (en && en.fields ? en.fields : []).forEach((f) => {
      if (!/别名|别称|又称|其他写法|同义词|曾用名/.test(String((f && f.label) || ""))) return;
      String((f && f.value) || "")
        .split(/[、,，;；/]/)
        .forEach((v) => {
          const t = v.trim();
          if (t) names.push(t);
        });
    });
    return names;
  }

  // 批量合并：≥2 条才合并，第一条（先勾的）为主
  async function entryBatchMerge() {
    const dropped = pruneSelectionToVisible("entry");
    const ids = Array.from(entryBatchSel).filter((id) => getEntry(id)); // Set 保持勾选顺序
    if (ids.length < 2) {
      uiAlert(
        dropped && entryBatchSel.size < 2
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "至少要勾选两条才能合并：先勾的那条当主体，其余合并进去。"
      );
      return;
    }
    const keep = getEntry(ids[0]);
    const drops = ids.slice(1).map((id) => getEntry(id)).filter(Boolean);
    if (
      !(await uiConfirm(
        `把「${drops.map((d) => d.name).join("、")}」合并进「${keep.name}」？\n\n以先勾的「${keep.name}」为主，其余条目的字段、关联人物和事件补充进来，可撤销。`
      ))
    )
      return;
    mergeEntriesInto(keep, drops);
    saveState();
    entryBatchSel.clear();
    renderCategories();
    renderEntries();
    renderCharacters();
    renderEntryBatchBar();
    showToast(`已把 ${drops.length} 个条目合并进「${keep.name}」`);
  }

  function copyEntries(ids) {
    const set = new Set(ids || []);
    if (!set.size) return 0;
    const next = [];
    const copies = [];
    state.settings.entries.forEach((en) => {
      next.push(en);
      if (!set.has(en.id)) return;
      const cp = Object.assign({}, en, { id: uid(), name: copyItemName(en.name) });
      cp.fields = (en.fields || []).map((f) => Object.assign({}, f));
      cp.tags = (en.tags || []).slice();
      cp.characterIds = (en.characterIds || []).slice();
      /* 势力卡上的「关联人物」本来就是「自己 + 所有子级的人」聚合显示的，
         而子级不会跟着复制 —— 把这一整份抄给副本，复制出来的卡和原卡看起来才一致
         （势力分析里右键复制走的是同一个函数，两边规矩统一）。 */
      if (catKind(getCat(en.categoryId)) === "faction") cp.characterIds = factionMemberIdsOf(en, true);
      cp.eventIds = (en.eventIds || []).slice();
      next.push(cp);
      copies.push(cp);
    });
    if (!copies.length) return 0;
    state.settings.entries = next;
    pendingUndoLabel = `复制 ${copies.length} 个设定条目`;
    saveState();
    renderEntries();
    renderCharacters();
    renderFactionAnalysis();
    renderStats();
    return copies.length;
  }

  function batchCopyEntries() {
    const dropped = pruneSelectionToVisible("entry");
    const ids = Array.from(entryBatchSel).filter((id) => getEntry(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先勾选要复制的条目。"
      );
      return;
    }
    const n = copyEntries(ids);
    if (n) showToast(`已复制 ${n} 个设定条目，放在原卡片下方`);
  }

  async function entryBatchDelete() {
    const dropped = pruneSelectionToVisible("entry");
    const ids = Array.from(entryBatchSel).filter((id) => getEntry(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先勾选要删除的条目。"
      );
      return;
    }
    // 设定条目不弹二次确认（随时可以「撤销」还原）
    pendingUndoLabel = `批量删除 ${ids.length} 个设定条目`;
    // 势力：子级一起删（plan.md 第 9 条）
    const expanded = expandEntryIdsWithFactionDescendants(ids);
    const set = new Set(expanded);
    state.settings.entries = state.settings.entries.filter((en) => !set.has(en.id));
    // 清理人物「所属势力」里指向这些条目的引用
    state.characters.forEach((c) => {
      c.factionIds = (c.factionIds || []).filter((id) => !set.has(id));
    });
    saveState();
    entryBatchMode = false;
    entryBatchSel.clear();
    renderEntries();
    renderCategories();
    renderCharacters();
    renderEntryBatchBar();
    showToast(`已删除 ${expanded.length} 个设定条目，可用「撤销」还原`);
  }

  function entryCardHtml(en) {
    /* 卡面上只显示**有值**的字段：空的（只有字段名没内容）不占位置（用户 2026-10-15 要求）。
       值两端空白也算空。 */
    const fields = (en.fields || [])
      .filter((f) => String((f && f.value) || "").trim())
      .slice(0, 3);
    const tags = en.tags || [];
    const cb = entryBatchMode
      ? `<input type="checkbox" class="entry-batch-cb" data-entry-id="${esc(en.id)}" ${entryBatchSel.has(en.id) ? "checked" : ""} />`
      : "";
    const quick = entryBatchMode
      ? ""
      : `<span class="entry-card-actions">
          <button class="icon-btn entry-edit" data-entry-id="${esc(en.id)}" title="编辑这个条目">✎</button>
          <button class="icon-btn entry-del" data-entry-id="${esc(en.id)}" title="删除这个条目（可撤销）">×</button>
        </span>`;
    // 每个卡片都能折叠：折起来只剩名字，展开才显示字段与关联
    const folded = en.collapsed === true;
    const fold = entryBatchMode
      ? ""
      : `<button class="icon-btn entry-fold" data-entry-id="${esc(en.id)}" title="${
          folded ? "展开：显示字段与关联" : "折叠：只显示名字"
        }">${folded ? "▶" : "▼"}</button>`;
    // 有图片的条目：图片铺满整张卡片做背景（30% 透明 + 毛玻璃），不再在左上角放迷你图
    const bg = en.image
      ? `<span class="entry-bg" style="background-image:url(&quot;${esc(en.image)}&quot;)"></span>`
      : "";
      /* 关联人物：和事件卡上的「登场人物」一样，显示头像圈圈 + 名字。
         势力卡按树聚合（含所有子级的人，去重）—— plan.md 第 28 条；
         其它类别照旧只看直接关联。 */
      const factionCard = catKind(getCat(en.categoryId)) === "faction";
      /* 势力层级在卡片上要一眼分得出来（plan.md 第 14 条）：
         一级沿用原样；二级、三级用同一个类别色的不同明度画在卡片左侧。 */
      const factionLevel = factionCard ? factionLevelOf(en) : 0;
      const factionColor = factionCard ? (getCat(en.categoryId) || {}).color || "#7cc98b" : "";
      /* 二级、三级用**同一个蓝色系**（程序自带的蓝 #8DA0CB），一级不画色条：
         靠透明度分档 —— 二级半透明、三级更透明，一眼看出上下级，
         又不会像派生色那样跑成橙色 / 粉色。 */
      const FACTION_BLUE = "141, 160, 203"; // #8DA0CB
      const factionTone = (() => {
        if (factionLevel <= 1) return factionColor;
        const a = factionLevel === 2 ? 0.85 : 0.5; // 二级实一点、三级更淡
        return `rgba(${FACTION_BLUE}, ${a})`;
      })();
      /* 卡片底色跟着层级往里收暗，但保留一点同一个蓝色系的偏冷感（不是纯灰压暗）：
         二级比一级暗一档、三级再暗一档，层次一眼分得出又不会跳色。 */
      const factionTint = (() => {
        if (factionLevel <= 1) return "";
        // 基准 #1a1f29：二级 ≈ #121620、三级 ≈ #0f121c（蓝通道多留一点，保持冷色）
        return factionLevel === 2 ? "#121620" : "#0f121c";
      })();
      const linkedChars = (factionCard ? factionMemberIdsOf(en, true) : en.characterIds || [])
        .map((id) => getChar(id))
        .filter(Boolean);
      /* 二级 / 三级势力：卡面和一级卡完全同款（同底色、同边框、不缩进），
         只在左上角画一块斜纹角（三级更密更亮）＋ 名称后的 Ⅱ / Ⅲ 小章来分档。 */
      const hatch =
        factionCard && factionLevel > 1 ? `<span class="entry-flv-hatch" aria-hidden="true"></span>` : "";
    const charChips = linkedChars.length
      ? linkedChars
          .slice(0, 8)
          .map((c) => `<span class="event-char-chip" data-char-id="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}</span>`)
          .join("") +
        (linkedChars.length > 8 ? `<span class="event-char-chip entry-char-more">+${linkedChars.length - 8}</span>` : "")
      : "";
    return `<div class="entry-card${en.image ? " has-bg" : ""} ${folded ? "collapsed" : ""} ${entryBatchMode ? "batch" : ""} ${
      entryBatchMode && entryBatchSel.has(en.id) ? "selected" : ""
      }" draggable="${entryBatchMode ? "false" : "true"}" data-entry-id="${esc(
      en.id
      )}"${factionCard ? ` data-flv="${factionLevel}"` : ""}${
        factionLevel > 1 ? ` style="--flv-c:${esc(factionTone)};--flv-bg:${esc(factionTint)}"` : ""
      } title="${
      entryBatchMode
        ? "点击勾选 / 取消 · Delete＝删除选中"
        : "点击编辑 · 拖动可排序 / 归组 · 右键可换组 / 合并 / 删除 · 左上角三角可折叠 · Shift+点＝连选（同一端点再 Shift 点＝取消这一段）、Ctrl+点＝加减选"
    }">
      ${bg}${hatch}<div class="entry-card-head">${cb}${fold}<span class="entry-grip" title="拖动排序">⋮⋮</span><span class="entry-name">${esc(
      en.name
      )}</span>${
        factionCard && factionLevel > 1
          ? `<span class="entry-level-chip" title="${esc(uiTextFor(factionLevel === 2 ? "二级势力" : "三级势力"))}">${
              factionLevel === 2 ? "Ⅱ" : "Ⅲ"
            }</span>`
          : ""
      }${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${quick}</div>
      ${
        /* 势力卡的「所属」：只显示、不给点（点卡面太容易误点）。
           一级＝不写；二级＝A1>；三级＝A1>A2>（祖先链 + 一个箭头）；卡面折叠时也显示 */
        (() => {
          if (!factionCard || !en.parentId) return "";
          const parent = factionEntryById(en.parentId);
          if (!parent) return "";
          /* 面包屑：↳ 上级 › 上级 ›（末尾那个 › 表示「下面这张卡」）。
             用细的 › 而不是 ASCII 的 >，和程序里其它路径写法一致，看着不突兀。 */
          const chain = factionChainOf(parent).map((x) => x.name);
          return `<div class="entry-faction-path" title="${esc(chain.join(" › "))}"><span class="entry-faction-path-icon">↳</span>${esc(
            chain.join(" › ")
          )}<span class="entry-faction-path-sep">›</span></div>`;
        })()
      }
      ${
        folded
          ? ""
          : fields
              .map((f) => `<div class="entry-field-line"><span>${esc(uiDefaultLabel(f.label))}</span>${esc(f.value)}</div>`)
              .join("") +
              // 没有关联人物就整行不显示（不要灰字占位）
              (charChips ? `<div class="entry-meta entry-chars">${charChips}</div>` : "")
      }
    </div>`;
  }

  // 折叠 / 展开一个设定卡片（折起来只剩名字）
  function toggleEntryFold(id) {
    const en = getEntry(id);
    if (!en) return;
    en.collapsed = !(en.collapsed === true);
    pendingUndoLabel = `${en.collapsed ? "折叠" : "展开"}设定条目：「${en.name}」`;
    saveState();
    renderEntries();
  }

  // 一键折叠 / 展开当前类别下的所有设定卡片
  function foldAllEntries(folded) {
    const cat = getCat(selectedCategoryId);
    const list = state.settings.entries.filter((en) => !cat || en.categoryId === cat.id);
    if (!list.length) {
      showToast(cat ? `「${catDisplayName(cat)}」下面还没有条目` : "还没有设定条目");
      return;
    }
    pendingUndoLabel = `${folded ? "折叠" : "展开"}全部设定条目`;
    list.forEach((en) => {
      en.collapsed = !!folded;
    });
    saveState();
    renderEntries();
    showToast(`已${folded ? "折叠" : "展开"} ${list.length} 个条目`);
  }

  // 把条目移到某个分组（groupId 为空 = 未分组）；beforeId 用来插到某个卡片前面
  // 「纪年」不分组：整批卡片按落点重排（保持批内相对顺序）
  function moveEntriesBefore(ids, beforeId) {
    const moved = (ids || []).map((id) => getEntry(id)).filter(Boolean);
    if (!moved.length) return;
    const catId = moved[0].categoryId;
    if (moved.some((en) => en.categoryId !== catId)) return;
    const idSet = new Set(moved.map((en) => en.id));
    const arr = state.settings.entries.filter((e) => e.categoryId === catId && !idSet.has(e.id));
    let at = beforeId ? arr.findIndex((e) => e.id === beforeId) : arr.length;
    if (at < 0) at = arr.length;
    moved.forEach((en) => {
      if (en.groupId) en.groupId = "";
    });
    arr.splice(at, 0, ...moved);
    let k = 0;
    state.settings.entries = state.settings.entries.map((e) => (e.categoryId === catId ? arr[k++] : e));
    pendingUndoLabel = `调整条目顺序：${moved.length} 条`;
    saveState();
    renderEntries();
    renderEntryBatchBar();
    showToast(`已把 ${moved.length} 条设定按落点重排`);
  }

  // 批量把多条设定移到同一个分组（整批拖到分组标题 / 分组空白处时用）
  function moveEntriesToGroup(ids, gid) {
    const list = (ids || []).map((id) => getEntry(id)).filter(Boolean);
    if (!list.length) return;
    const target = !isChronoCategory(getCat(list[0].categoryId)) && gid && getSettingGroup(gid) ? gid : "";
    const dest = target ? (getSettingGroup(target) || {}).name || uiTextFor("分组") : uiTextFor("未分组");
    let n = 0;
    list.forEach((en) => {
      if ((en.groupId || "") !== target) {
        en.groupId = target;
        n++;
      }
    });
    if (target) {
      const g = getSettingGroup(target);
      if (g) g.collapsed = false;
    }
    if (!n) {
      showToast(`这 ${list.length} 条本来就在「${dest}」里`);
      return;
    }
    pendingUndoLabel = `把 ${n} 条设定移动到「${dest}」`;
    saveState();
    renderEntries();
    renderEntryBatchBar();
    showToast(`已把 ${n} 条设定移动到「${dest}」`);
  }

  function moveEntryToGroup(dragId, groupId, beforeId) {
    const drag = getEntry(dragId);
    if (!drag) return;
    // 「纪年」不分组：无论拖到哪里，都只是调整上下顺序
    const chrono = isChronoCategory(getCat(drag.categoryId));
    const gid = chrono ? "" : groupId || "";
    pendingUndoLabel =
      chrono || (drag.groupId || "") === gid
        ? `调整条目顺序：「${drag.name}」`
        : `移动条目「${drag.name}」到分组「${gid ? groupDisplayName(getSettingGroup(gid)) : uiTextFor("未分组")}」`;
    if (gid && !getSettingGroup(gid)) return;
    const catId = drag.categoryId;
    const list = state.settings.entries.filter((e) => e.categoryId === catId);
    const from = list.findIndex((e) => e.id === dragId);
    if (from < 0) return;
    list.splice(from, 1);
    drag.groupId = gid;
    if (beforeId) {
      const to = list.findIndex((e) => e.id === beforeId);
      if (to >= 0) list.splice(to, 0, drag);
      else list.push(drag);
    } else if (chrono) {
      // 「纪年」不分组：拖到最下方就放到这一类的最末尾
      list.push(drag);
    } else {
      let idx = -1;
      list.forEach((e, i) => {
        if ((e.groupId || "") === gid) idx = i;
      });
      if (idx >= 0) list.splice(idx + 1, 0, drag);
      else list.push(drag);
    }
    let k = 0;
    state.settings.entries = state.settings.entries.map((e) => (e.categoryId === catId ? list[k++] : e));
    if (gid) {
      const g = getSettingGroup(gid);
      if (g) g.collapsed = false;
    }
    saveState();
    renderEntries();
  }

  async function createSettingGroup() {
    const cat = getCat(selectedCategoryId);
    if (!cat) return;
    if (isChronoCategory(cat)) {
      showToast(`「${catDisplayName(cat)}」不用分组：卡片直接上下拖动就能排序`);
      return;
    }
    const name = await uiPrompt(`在「${catDisplayName(cat)}」里新建分组，名称？`);
    if (name === null || !String(name).trim()) return;
    const g = { id: uid(), categoryId: cat.id, name: String(name).trim(), collapsed: false };
    pendingUndoLabel = `新建设定分组：「${g.name}」（${catDisplayName(cat)}）`;
    state.settings.groups.push(g);
    saveState();
    renderEntries();
    renderEntryBatchBar();
  }

  async function renameSettingGroup(id) {
    const g = getSettingGroup(id);
    if (!g) return;
    const name = await uiPrompt("新的分组名称？", g.name);
    if (name === null || !String(name).trim()) return;
    pendingUndoLabel = `重命名设定分组：「${g.name}」→「${String(name).trim()}」`;
    g.name = String(name).trim();
    saveState();
    renderEntries();
    renderEntryBatchBar();
  }

  async function deleteSettingGroup(id) {
    const g = getSettingGroup(id);
    if (!g) return;
    // 设定相关不弹二次确认
    pendingUndoLabel = `删除设定分组：「${g.name}」`;
    state.settings.entries.forEach((en) => {
      if (en.groupId === id) en.groupId = "";
    });
    state.settings.groups = (state.settings.groups || []).filter((x) => x.id !== id);
    saveState();
    renderEntries();
    renderEntryBatchBar();
  }

  /* 换类别之后的收尾（右键「移动到…」、批量「移动到…」、编辑界面里改类别，三处共用）：
     · 字段、关联人物、名字都原样带过去，不动；
     · 分组属于旧类别：目标类别里没有这个分组 → 落到「未分组」；
     · 雷达图（勾选 / 顶点名 / 顶点说明 / 数值）跟着卡片走，一条都不丢（用户 2026-10-15 要求）：
       目标类别没有「雷达图」这个追加功能时，只是**不显示**那一栏（数据留着），
       移回有雷达图的类别，顶点与数值原样回来。 */
  /* 卡片还没有自己的顶点表时（老卡 / 只填过数值的卡），把出发类别的顶点表抄一份到卡上：
     不然换了类别之后，顶点名会被换成新类别的默认名（用户要的是「维度的名字也跟着走」）。 */
  function adoptRadarAxesBeforeMove(en, fromCatId) {
    if (!en || !fromCatId) return;
    const hasRadar = en.radarOn === true || !!(en.radar && Object.keys(en.radar).length);
    if (!hasRadar) return;
    if (Array.isArray(en.radarAxes) && en.radarAxes.length) return;
    const axes = catRadarAxes(getCat(fromCatId));
    if (!axes.length) return;
    /* 逐条抄（不能直接把模板数组挂上去）：key 和这张卡的数值对得上，
       以后改类别的模板、或者再移一次，这张卡都不受影响。 */
    en.radarAxes = axes.map((a) => ({ key: a.key, label: a.label, desc: a.desc }));
  }

  function entryCategorySideEffects(en, fromCatId) {
    if (!en || !fromCatId || en.categoryId === fromCatId) return;
    if (en.groupId && !(state.settings.groups || []).some((g) => g.id === en.groupId && g.categoryId === en.categoryId))
      en.groupId = "";
    const to = getCat(en.categoryId);
    /* 雷达图这一块这里**什么都不做**：勾选 / 顶点名 / 顶点说明 / 维度 / 数值都留在条目上、
       跟着卡片走。目标类别没有「雷达图」这个追加功能时，信息卡里那一栏本来就不画
       （见 43-bindings.js 的 catRadarFeatureOn），移回有雷达图的类别原样回来。 */
    adoptRadarAxesBeforeMove(en, fromCatId);
    /* 树型拓扑：换类别＝把这张卡的节点连同它下方子树的节点一起删掉（卡片一张都不删，用户 2026-10-15 确认） */
    {
      const from = getCat(fromCatId);
      if (from && catTreeFeatureOn(from) && treeInTree(from, en.id)) treeRemoveSubtree(from, en.id);
    }
    /* 进出「势力」这一类：人物卡上的「所属势力」跟着同步
       （和条目信息界面保存时用的同一套规则，免得人物那边挂着一个已经不是势力的条目）。
       移回势力时会按条目自己的关联人物名单重新挂上。 */
    const from = getCat(fromCatId);
    const fromFaction = String((from && from.kind) || "") === "faction";
    const toFaction = String((to && to.kind) || "") === "faction";
    if (fromFaction !== toFaction) {
      const linked = new Set(en.characterIds || []);
      state.characters.forEach((c) => {
        const list = new Set(c.factionIds || []);
        if (toFaction && linked.has(c.id)) list.add(en.id);
        else list.delete(en.id);
        c.factionIds = Array.from(list);
      });
    }
  }

  /* 把条目挪到另一个类别（＝换选项卡） */
  function moveEntriesToCategory(ids, toCatId) {
    const to = getCat(toCatId);
    if (!to || !Array.isArray(ids) || !ids.length) return [];
    const moved = [];
    ids.forEach((id) => {
      const en = getEntry(id);
      if (!en || en.categoryId === toCatId) return;
      const from = en.categoryId;
      en.categoryId = toCatId;
      entryCategorySideEffects(en, from);
      moved.push(en);
    });
    return moved;
  }

  /* 挪完之后统一的收尾：写回 + 重画 + 一句话（可撤销） */
  function applyEntryCategoryMove(ids, toCatId, toCat) {
    const to = toCat || getCat(toCatId);
    // 势力：整棵子树一起走（plan.md 第 23 条），到了没有层级的类别再压平
    const expanded = expandEntryIdsWithFactionDescendants(ids);
    const moved = moveEntriesToCategory(expanded, toCatId);
    if (!moved.length) {
      showToast("已经在「" + (to ? catDisplayName(to) : "") + "」里了");
      return 0;
    }
    flattenFactionSubtree(moved);
    pruneCharacterFactionIds();
    const toName = to ? catDisplayName(to) : "";
    pendingUndoLabel =
      moved.length === 1
        ? `移动设定条目：「${moved[0].name}」→「${toName}」`
        : `把 ${moved.length} 个设定条目移到类别「${toName}」`;
    saveState();
    renderCategories();
    renderEntries();
    renderEntryBatchBar();
    showToast(
      moved.length === 1
        ? `已把「${moved[0].name}」移到类别「${toName}」`
        : `已把 ${moved.length} 个条目移到类别「${toName}」`
    );
    return moved.length;
  }

  /* 势力卡右键「所属…」/ 点卡面「所属」：开级联选择面板（和势力信息卡里那个一样），
     最多列到二级 —— 挂到三级势力下面就是四级，不存在。 */
  function openFactionParentPrompt(entryId, at) {
    const en = factionEntryById(entryId);
    if (!en) return;
    if (factionPickPanelOpen()) {
      closeFactionPickPanel(); // 再点一下＝收起
      return;
    }
    openFactionPickPanel({
      x: at && at.x != null ? at.x : 0,
      y: at && at.y != null ? at.y : 0,
      maxLevel: 2,
      excludeId: entryId, // 自己 / 自己的子级不能当自己的上级
      pickedId: en.parentId || "",
      onPick: (id) => {
        const res = setFactionParent(entryId, id);
        if (!res.ok) {
          showToast(res.reason === "skipDown" ? "降级不能跨级：一级只能先降到二级" : "这个所属不行（会超过三级或成环）");
          return;
        }
        pendingUndoLabel = res.label;
        saveState();
        renderCategories();
        renderEntries();
        renderCharacters();
        renderFactionAnalysis();
        showToast(
          `已把「${en.name}」移到「${res.path}」` +
            (res.flattened.length ? `，${res.flattened.length} 个超出三级的势力被压平成三级` : "") +
            "（可撤销）"
        );
      },
    });
  }

  // 右键条目：快速移动到某个分组
  async function showEntryGroupMenu(x, y, entryId) {
    hideContextMenu();
    const en = getEntry(entryId);
    if (!en) return;
    // 「纪年」这一类不分组：右键菜单里就不出现分组那一段
    const chrono = isChronoCategory(getCat(en.categoryId));
    const groups = chrono ? [] : categorySettingGroups(en.categoryId);
    const cur = en.groupId || "";
    const item = (gid, name) =>
      `<div class="context-menu-item ${gid === cur ? "active" : ""}" data-group="${esc(gid)}">
        <span class="line-name">${esc(name)}</span>
        ${gid === cur ? `<span class="menu-check">✓</span>` : ""}
      </div>`;
    let html = chrono
      ? `<div class="context-menu-title">「${esc(en.name)}」</div>`
      : `<div class="context-menu-title">「${esc(en.name)}」移动到分组</div>`;
    if (!chrono) {
      html += item("", "未分组");
      groups.forEach((g) => {
        html += item(g.id, g.name);
      });
      html += `<div class="context-menu-sep"></div>`;
      html += `<div class="context-menu-item" data-new-group="1"><span class="line-name">＋ 新建…</span></div>`;
      html += `<div class="context-menu-sep"></div>`;
    }
    html += `<div class="context-menu-item" data-act="edit"><span class="line-name">编辑</span></div>`;
    html += `<div class="context-menu-item" data-act="copy"><span class="line-name">复制</span></div>`;
      if (catKind(getCat(en.categoryId)) === "faction" && factionEntries().length > 1)
        html += `<div class="context-menu-item" data-act="set-parent"><span class="line-name">所属…</span></div>`;
    if (state.settings.categories.length > 1)
      html += `<div class="context-menu-item" data-act="move-cat"><span class="line-name">移动到…</span></div>`;
    html += `<div class="context-menu-item" data-act="merge"><span class="line-name">合并到…</span></div>`;
    html += `<div class="context-menu-item danger" data-act="delete"><span class="line-name">删除</span></div>`;
    html += `<div class="context-menu-sep"></div>`;
    html += `<div class="context-menu-item" data-act="fold-all"><span class="line-name">全部折叠（只显示名字）</span></div>`;
    html += `<div class="context-menu-item" data-act="unfold-all"><span class="line-name">全部展开（显示字段与关联）</span></div>`;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML = html;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);

    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", async () => {
        hideContextMenu();
        if (el.dataset.act === "edit") {
          openEntryModal(entryId);
          return;
        }
        if (el.dataset.act === "copy") {
          const n = copyEntries([entryId]);
          if (n) showToast(`已复制设定条目：${copyItemName(en.name)}`);
          return;
        }
        if (el.dataset.act === "fold-all") {
          foldAllEntries(true);
          return;
        }
        if (el.dataset.act === "unfold-all") {
          foldAllEntries(false);
          return;
        }
        if (el.dataset.act === "merge") {
          // 等这一下点击冒泡完再开新菜单，否则会被「点空白关闭菜单」顺手关掉
          setTimeout(() => showEntryMergeMenu(x, y, entryId), 0);
          return;
        }
          if (el.dataset.act === "move-cat") {
            // 同上：等冒泡结束再换一张菜单
            setTimeout(() => showEntryMoveCatMenu(x, y, entryId), 0);
            return;
          }
          if (el.dataset.act === "set-parent") {
            setTimeout(() => openFactionParentPrompt(entryId, { x, y }), 0);
            return;
          }
        if (el.dataset.act === "delete") {
          await deleteEntryById(entryId);
          return;
        }
        if (el.dataset.newGroup) {
          const name = await uiPrompt("新分组的名称？");
          if (name === null || !String(name).trim()) return;
          const g = { id: uid(), categoryId: en.categoryId, name: String(name).trim(), collapsed: false };
          state.settings.groups.push(g);
          moveEntryToGroup(entryId, g.id, null);
          renderEntryBatchBar();
        } else {
          moveEntryToGroup(entryId, el.dataset.group || "", null);
        }
      })
    );
  }

  // 右键「移动到…」：列出别的类别（选项卡），点一个就把这条挪过去
  function showEntryMoveCatMenu(x, y, entryId) {
    hideContextMenu();
    const en = getEntry(entryId);
    if (!en) return;
    const others = state.settings.categories.filter((c) => c.id !== en.categoryId);
    if (!others.length) {
      showToast("只有一个类别，没地方可移。");
      return;
    }
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      `<div class="context-menu-title">「${esc(en.name)}」移动到类别</div>` +
      others
        .map(
          (c, i) =>
            `<div class="context-menu-item ${i === 0 ? "active" : ""}" data-i="${i}"><span class="line-name">${esc(
              catDisplayName(c)
            )}</span><span class="menu-count">${state.settings.entries.filter((x2) => x2.categoryId === c.id).length}</span></div>`
        )
        .join("");
    document.body.appendChild(menu);
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", () => {
        const c = others[parseInt(el.dataset.i, 10)];
        hideContextMenu();
        if (!c) return;
        applyEntryCategoryMove([entryId], c.id, c);
      })
    );
  }

  // 右键「合并到另一个条目…」：列同类目下的其它条目，选中就把它并进目标
  function showEntryMergeMenu(x, y, entryId, opts) {
    const en = getEntry(entryId);
    if (!en) return;
    /* 势力：同一根链条上的条目（自己的上级 / 自己的子级）不能拿来合并 ——
       合并按主体卡的分级来，链上互并必然把层级搞乱，干脆不列出来。 */
    const isFaction = catKind(getCat(en.categoryId)) === "faction";
    const chainIds = new Set(isFaction ? factionChainOf(en).map((x) => x.id) : []);
    if (isFaction) factionDescendantsOf(en).forEach((x) => chainIds.add(x.id));
    const others = state.settings.entries.filter(
      (x2) => x2.categoryId === en.categoryId && x2.id !== entryId && !chainIds.has(x2.id)
    );
    if (!others.length) {
      uiAlert("这一类里还没有别的条目可以合并。");
      return;
    }
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      `<div class="context-menu-title">把「${esc(en.name)}」合并进…</div>` +
      others
        .map(
          (o, i) =>
            `<div class="context-menu-item ${i === 0 ? "active" : ""}" data-i="${i}"><span class="line-name">${esc(
              o.name
            )}</span></div>`
        )
        .join("") +
      `<div class="context-menu-sep"></div>` +
      `<div class="context-menu-item" data-batch="1"><span class="line-name">改用「批量」自己挑要合并的…</span></div>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", async () => {
        hideContextMenu();
        if (el.dataset.batch) {
          if (!entryBatchMode) toggleEntryBatch();
          entryBatchSel.clear();
          entryBatchSel.add(entryId);
          renderEntries();
          renderEntryBatchBar();
          setAnalyzeStatus("");
          showToast("已选中这一条，再点其它条目就能一起合并");
          return;
        }
        const target = others[parseInt(el.dataset.i, 10)];
        if (!target) return;
        /* opts.noConfirm：势力分析那边的右键菜单不要弹确认（可撤销） */
        if (!(opts && opts.noConfirm) && !(await uiConfirm(`把「${en.name}」合并进「${target.name}」？合并后可以用「撤销」还原。`))) return;
        mergeEntriesInto(target, [en]);
        saveState();
        renderCategories();
        renderEntries();
        renderCharacters();
        renderEntryBatchBar();
        showToast(`已把「${en.name}」合并进「${target.name}」`);
      })
    );
  }

  // 类别的右键菜单：编辑 / 合并到其它类别 / 删除
  function showCatMenu(x, y, catId) {
    const cat = getCat(catId);
    if (!cat) return;
    const locked = catIsLocked(cat);
    const others = state.settings.categories.filter((c) => c.id !== catId);
    const items = locked ? [] : [{ label: "编辑", act: () => openCatModal(catId) }];
    const n = state.settings.entries.filter((e) => e.categoryId === catId).length;
    if (n > 1) items.push({ label: `自动合并重复条目…（${n} 条）`, act: () => mergeDuplicateEntries(catId) });
    if (n) items.push({ label: `清理超短条目…（${n} 条）`, act: () => pruneThinEntriesInCategory(catId) });
    if (!locked) {
      others.forEach((o) => {
        const m = state.settings.entries.filter((e) => e.categoryId === o.id).length;
        items.push({ label: `合并到「${o.name}」（${m} 条）`, act: () => mergeCatInto(catId, o.id) });
      });
      items.push({ label: "删除类别", act: () => deleteCat(catId) });
    }
    if (!items.length) return;
    renderContextMenu(x, y, locked ? `${catDisplayName(cat)}（固定类别）` : `「${catDisplayName(cat)}」`, items);
  }

  async function mergeCatInto(fromId, toId) {
    const from = getCat(fromId);
    const to = getCat(toId);
    if (!from || !to || fromId === toId) return;
    if (catIsLocked(from)) {
      showToast(catLockTip(from));
      return;
    }
    const n = state.settings.entries.filter((e) => e.categoryId === fromId).length;
    const g = (state.settings.groups || []).filter((x) => x.categoryId === fromId).length;
    if (
      !(await uiConfirm(
        `把类别「${from.name}」合并进「${to.name}」？\n\n「${from.name}」下的 ${n} 个条目${g ? `和 ${g} 个分组` : ""}会搬到「${to.name}」，空的「${from.name}」会删掉。可撤销。`
      ))
    )
      return;
    pendingUndoLabel = `合并设定类别：「${from.name}」→「${to.name}」`;
    state.settings.entries.forEach((e) => {
      if (e.categoryId === fromId) e.categoryId = toId;
    });
    (state.settings.groups || []).forEach((x) => {
      if (x.categoryId === fromId) x.categoryId = toId;
    });
    state.settings.categories = state.settings.categories.filter((c) => c.id !== fromId);
    if (selectedCategoryId === fromId) selectedCategoryId = toId;
    saveState();
    renderCategories();
    renderEntries();
    renderEntryBatchBar();
    showToast(`已把「${from.name}」合并进「${to.name}」`);
  }

  function deleteCat(id) {
    const cat = getCat(id);
    if (!cat) return;
    if (catIsLocked(cat)) {
      showToast(catLockTip(cat));
      return;
    }
    pendingUndoLabel = `删除设定类别：「${catDisplayName(cat)}」`;
    state.settings.entries = state.settings.entries.filter((en) => en.categoryId !== id);
    if (Array.isArray(state.settings.groups)) {
      state.settings.groups = state.settings.groups.filter((g) => g.categoryId !== id);
    }
    state.settings.categories = state.settings.categories.filter((c) => c.id !== id);
    selectedCategoryId = state.settings.categories.length ? state.settings.categories[0].id : null;
    saveState();
    renderCategories();
    renderEntries();
  }

