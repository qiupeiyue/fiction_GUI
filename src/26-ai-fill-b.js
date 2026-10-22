  function toggleSegListFold() {
    segListFolded = !segListFolded;
    try {
      localStorage.setItem(SEG_LIST_FOLD_KEY, segListFolded ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
    const list = $("#segment-list");
    if (!segListFolded && list) {
      // 展开＝回到默认长度
      list.style.height = "";
      list.style.maxHeight = "";
      try {
        localStorage.removeItem(SEG_LIST_H_KEY);
      } catch (e) {
        /* ignore */
      }
    }
    applySegFoldState();
  }

  function segListMaxHeight(list) {
    const top = list.getBoundingClientRect().top;
    // 下方要留出「开始分析」那一行按钮和结果区，别把列表顶出屏幕
    return Math.max(SEG_LIST_MIN_H + 60, window.innerHeight - top - 150);
  }

  function applySegmentListHeight(list) {
    if (!list) return;
    let h = 0;
    try {
      h = parseInt(localStorage.getItem(SEG_LIST_H_KEY) || "0", 10) || 0;
    } catch (e) {
      h = 0;
    }
    if (h >= SEG_LIST_MIN_H) {
      const v = Math.min(h, segListMaxHeight(list));
      list.style.height = v + "px";
      list.style.maxHeight = v + "px";
    }
  }

  function setSegmentListHeight(list, h) {
    if (!list) return;
    const v = Math.max(SEG_LIST_MIN_H, Math.min(segListMaxHeight(list), Math.round(h)));
    list.style.height = v + "px";
    list.style.maxHeight = v + "px";
    try {
      localStorage.setItem(SEG_LIST_H_KEY, String(v));
    } catch (e) {
      /* 隐私模式等写不了就算了，只影响这次会话的记性 */
    }
  }

  function bindSegmentListResize() {
    const handle = $("#seg-fold");
    const list = $("#segment-list");
    if (!handle || !list || handle.dataset.bound === "1") return;
    handle.dataset.bound = "1";
    try {
      segListFolded = localStorage.getItem(SEG_LIST_FOLD_KEY) === "1";
    } catch (e) {
      segListFolded = false;
    }
    applySegmentListHeight(list);
    applySegFoldState();
    // 刚拖完高度的那一个 click 不要当成「折叠」；用标志位而不是全局捕获监听．
    // 免得把后面别处的点击也吃掉
    let segDragJustEnded = false;
    handle.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      if (segListFolded) return; // 折起来了：这次单击交给「展开」（跟别的折叠条一样）
      const startY = ev.clientY;
      const startH = list.getBoundingClientRect().height;
      if (!startH) return;
      let moved = false;
      const onMove = (e) => {
        const dy = e.clientY - startY;
        if (!moved) {
          if (Math.abs(dy) < 2) return;
          moved = true;
          document.body.classList.add("seg-resizing");
        }
        setSegmentListHeight(list, startH + dy);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.classList.remove("seg-resizing");
        if (moved) {
          segDragJustEnded = true;
          setTimeout(() => {
            segDragJustEnded = false;
          }, 0);
          showToast("已调整「章节 / 小节」列表高度");
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    handle.addEventListener("click", () => {
      if (segDragJustEnded) return;
      toggleSegListFold();
    });
    window.addEventListener("resize", () => {
      // 窗口变小以后，之前拉的高度可能已经超过能放下的范围
      if (!segListFolded && list.style.height) setSegmentListHeight(list, parseFloat(list.style.height) || SEG_LIST_DEF_H);
    });
  }

  /* ---- 人物边栏内部：「人物」和「线路」两个大框各自的纵向折叠 ---- */
  const SIDE_FOLD_KEY = "fiction_gui_side_folds_v1";
  let sideFolded = { char: false, line: false };

  function loadSideFoldState() {
    try {
      const raw = localStorage.getItem(SIDE_FOLD_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) || {};
      sideFolded = { char: !!o.char, line: !!o.line };
    } catch (e) {
      sideFolded = { char: false, line: false };
    }
  }

  function applySideFoldState() {
    const wrap = document.querySelector(".sidebar-inner");
    const charPane = document.querySelector("#char-pane");
    const linePane = document.querySelector("#line-pane");
    if (charPane) charPane.classList.toggle("folded", !!sideFolded.char);
    if (linePane) linePane.classList.toggle("folded", !!sideFolded.line);
    if (wrap) {
      wrap.classList.toggle("char-folded", !!sideFolded.char);
      wrap.classList.toggle("line-folded", !!sideFolded.line);
    }
    const cb = $("#side-fold-char");
    if (cb) {
      cb.textContent = sideFolded.char ? "▼" : "▲";
      cb.title = sideFolded.char ? "展开「人物」" : "折叠「人物」";
    }
    const lb = $("#side-fold-line");
    if (lb) {
      lb.textContent = sideFolded.line ? "▼" : "▲";
      lb.title = sideFolded.line ? "展开「线路」" : "折叠「线路」";
    }
  }

  function toggleSideFold(which) {
    sideFolded[which] = !sideFolded[which];
    try {
      localStorage.setItem(SIDE_FOLD_KEY, JSON.stringify(sideFolded));
    } catch (e) {
      /* ignore */
    }
    applySideFoldState();
  }

  function bindSideFolds() {
    loadSideFoldState();
    const cb = $("#side-fold-char");
    if (cb) cb.addEventListener("click", () => toggleSideFold("char"));
    const lb = $("#side-fold-line");
    if (lb) lb.addEventListener("click", () => toggleSideFold("line"));
    applySideFoldState();
  }

  const REL_COL_KEY = "fiction_gui_rel_cols_v1";
  let relColsCollapsed = { group: false, faction: false };

  function loadRelColState() {
    try {
      const raw = localStorage.getItem(REL_COL_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) || {};
      relColsCollapsed = { group: !!o.group, faction: !!o.faction };
    } catch (e) {
      /* ignore */
    }
  }

  function applyRelColState() {
    const gCol = $("#rel-picker-col-group");
    const fCol = $("#rel-picker-col-faction");
    if (gCol) gCol.classList.toggle("collapsed", !!relColsCollapsed.group);
    if (fCol) fCol.classList.toggle("collapsed", !!relColsCollapsed.faction);
    const gBtn = $("#rel-toggle-group");
    const gTitle = relColsCollapsed.group ? "展开「按群组」这一栏" : "折叠「按群组」这一栏";
    if (gBtn) {
      gBtn.textContent = relColsCollapsed.group ? "▶" : "◀";
      gBtn.title = gTitle;
    }
    const gHandle = $("#rel-handle-group");
    if (gHandle) gHandle.title = gTitle;
    const fBtn = $("#rel-toggle-faction");
    const fTitle = relColsCollapsed.faction ? "展开「按势力」这一栏" : "折叠「按势力」这一栏";
    if (fBtn) {
      fBtn.textContent = relColsCollapsed.faction ? "▶" : "◀";
      fBtn.title = fTitle;
    }
    const fHandle = $("#rel-handle-faction");
    if (fHandle) fHandle.title = fTitle;
  }

  function toggleRelCol(which) {
    relColsCollapsed[which] = !relColsCollapsed[which];
    try {
      localStorage.setItem(REL_COL_KEY, JSON.stringify(relColsCollapsed));
    } catch (e) {
      /* ignore */
    }
    applyRelColState();
    // 折叠 / 展开边栏后画布变宽变窄：下一帧按新尺寸重铺一遍（不然图只画在旧尺寸那块，边角用不上）
    requestAnimationFrame(() => {
      if (!viewHidden("view-relations")) renderRelations();
    });
  }

  /* ---- 每一组 / 每个势力内部的上下折叠 ---- */
  const REL_FOLD_KEY = "fiction_gui_rel_folds_v1";
  let relFolded = { groups: new Set(), factions: new Set() };

  function loadRelFoldState() {
    try {
      const raw = localStorage.getItem(REL_FOLD_KEY);
      if (!raw) return;
      const o = JSON.parse(raw) || {};
      relFolded = {
        groups: new Set(Array.isArray(o.groups) ? o.groups : []),
        factions: new Set(Array.isArray(o.factions) ? o.factions : []),
      };
    } catch (e) {
      /* ignore */
    }
  }

  function saveRelFoldState() {
    try {
      localStorage.setItem(
        REL_FOLD_KEY,
        JSON.stringify({ groups: Array.from(relFolded.groups), factions: Array.from(relFolded.factions) })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function toggleRelFold(kind, key) {
    const set = relFolded[kind];
    if (!set) return;
    if (set.has(key)) set.delete(key);
    else set.add(key);
    saveRelFoldState();
    renderRelations();
  }

  function bindRelGroupFolds(scope) {
    if (!scope) return;
    scope.querySelectorAll(".rel-group-fold").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const head = btn.closest(".rel-pick-group");
        if (!head) return;
        toggleRelFold(head.dataset.foldKind, head.dataset.foldKey || "");
      });
    });
  }

  function renderRelPicker(cands) {
    const box = $("#rel-pick-list");
    if (!box) return;
    const checked = relCheckedIds || new Set();
    const chainMark = chainMarkSetFrom(checked);
    const cnt = $("#rel-pick-count");
    if (cnt) cnt.textContent = `已选 ${checked.size} / ${cands.length} 人`;
    if (!cands.length) {
      box.innerHTML = `<p class="empty-tip small">还没有人物。先在左侧「人物」栏新建人物，这一栏就会跟着出来。</p>`;
      renderRelFactionPicker(cands);
      return;
    }
    const buckets = new Map();
    cands.forEach((c) => {
      const gid = charBucketIdOf(c);
      if (!buckets.has(gid)) buckets.set(gid, []);
      buckets.get(gid).push(c);
    });
    const order = charGroupBucketsOrder().map((x) => x.id);
    let html = "";
    order.forEach((gid) => {
      const list = buckets.get(gid);
      if (!list || !list.length) return;
      const g = getGroup(gid);
      const items = list
        .map(
          (c) =>
            `<label class="rel-pick-item"><input type="checkbox" data-pick="${esc(c.id)}" ${
              checked.has(c.id) ? "checked" : ""
            } />${avatarHtml(c)}<span class="rel-pick-name" title="${esc(c.name)}">${esc(c.name)}</span>${nameChainClipHtml(
              c.id,
              chainMark
            )}</label>`
        )
        .join("");
      const folded = relFolded.groups.has(gid);
      html += `<div class="rel-pick-block">${relPickGroupHeadHtml(
        g ? g.name : "未分组",
        g ? g.color : "#6b6480",
        list,
        "groups",
        gid
      )}<div class="rel-pick-group-body"${folded ? " hidden" : ""}>${items}</div></div>`;
    });
    // 兜底：分组被删掉 / groupId 失效的人物（bucket 的 key 不在分组列表里）也要列出来，
    // 否则这一栏会整片空着，看着就像「新加的人物没刷出来」。
    Array.from(buckets.keys())
      .filter((gid) => !order.includes(gid))
      .forEach((gid) => {
        const list = buckets.get(gid);
        if (!list || !list.length) return;
        const g = getGroup(gid);
        const items = list
          .map(
            (c) =>
              `<label class="rel-pick-item"><input type="checkbox" data-pick="${esc(c.id)}" ${
                checked.has(c.id) ? "checked" : ""
              } />${avatarHtml(c)}<span class="rel-pick-name" title="${esc(c.name)}">${esc(c.name)}</span>${nameChainClipHtml(
                c.id,
                chainMark
              )}</label>`
          )
          .join("");
        html += `<div class="rel-pick-block">${relPickGroupHeadHtml(
          g ? g.name : "未分组",
          g ? g.color : "#6b6480",
          list,
          "groups",
          gid
        )}<div class="rel-pick-group-body">${items}</div></div>`;
      });
    box.innerHTML = html;
    box.querySelectorAll("input[data-pick]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const id = cb.dataset.pick;
        if (cb.checked) relCheckedIds.add(id);
        else relCheckedIds.delete(id);
        renderRelations();
      })
    );
    bindRelGroupAll(box);
    bindRelGroupFolds(box);
    renderRelFactionPicker(cands);
  }

  // 分组标题：整组方框 + 名字 + 人数 + 折叠三角
  function relPickGroupHeadHtml(name, color, list, foldKind, foldKey, level, allIds) {
    /* allIds＝这一格方框管到的人（势力分组要连子级一起算）；不传就按这一行列的人算 */
    const ids = ((allIds && allIds.length ? allIds : list) || []).map((c) => c.id).join(",");
    const folded = !!(relFolded[foldKind] && relFolded[foldKind].has(foldKey));
    return `<div class="rel-pick-group ${folded ? "folded" : ""}" data-fold-kind="${esc(foldKind)}" data-fold-key="${esc(
      foldKey
    )}">
      <input type="checkbox" class="rel-group-all" data-ids="${esc(ids)}" title="${esc(
        uiTextFor("整组全选；再点一下整组取消")
      )}" />
      ${color === "transparent" ? "" : `<span class="dot" style="background:${esc(color)}"></span>`}
      <span class="rel-pick-group-name" title="${esc(name)}">${(() => {
        /* 「› / ››」这种层级前缀单独一个淡色小块，和名字分开看 */
        const m = String(name).match(/^([›\s]+)(.*)$/);
        return m ? `<span class="rel-lvl">${esc(m[1])}</span>${esc(m[2])}` : esc(name);
      })()}</span>
      <span class="rel-pick-group-note">${((allIds && allIds.length ? allIds : list) || []).length}</span>
      <button type="button" class="rel-group-fold" title="${esc(
        folded ? uiTextFor("展开这一组的人物") : uiTextFor("折叠这一组的人物（只留标题）")
      )}">${
        folded ? "▶" : "▼"
      }</button>
    </div>`;
  }

  // 把「整组」方框的勾选状态接上（半选状态用 indeterminate 表示）
  function bindRelGroupAll(scope) {
    if (!scope) return;
    scope.querySelectorAll(".rel-group-all").forEach((cb) => {
      const ids = String(cb.dataset.ids || "")
        .split(",")
        .filter(Boolean);
      const on = ids.filter((id) => relCheckedIds && relCheckedIds.has(id)).length;
      cb.checked = ids.length > 0 && on === ids.length;
      cb.indeterminate = on > 0 && on < ids.length;
      /* 这一条下面没有直接挂的人（纯分组节点）：方框点了也没用，干脆禁用 */
      cb.disabled = !ids.length;
      cb.addEventListener("click", (ev) => ev.stopPropagation());
      cb.addEventListener("change", (ev) => {
        ev.stopPropagation();
        if (!relCheckedIds) relCheckedIds = new Set();
        if (cb.checked) ids.forEach((id) => relCheckedIds.add(id));
        else ids.forEach((id) => relCheckedIds.delete(id));
        renderRelations();
      });
    });
  }

  // 按「势力」分组的第二个勾选栏（一个人可以同时出现在多个势力里）
  function relFactionGroups(cands) {
    const cat = findCatByKind("faction");
    const entries = cat ? state.settings.entries.filter((en) => en.categoryId === cat.id) : [];
    const groups = [];
    const known = new Set(entries.map((en) => en.id));
    const byId = new Map(entries.map((en) => [en.id, en]));
    const color = (cat && cat.color) || "#8f7bd8";
    /* 多级势力：一级在前，它的子级挂在它下面（深度优先），子级带完整路径；每一级都能折叠 */
    const nodeOf = (en, level) => ({
      id: en.id,
      /* 层级用「›」的个数表示，不把整条路径抄一遍（A1 / › A2 / ›› A3） */
      name: (level > 1 ? "›".repeat(level - 1) + " " : "") + en.name,
      color: level > 1 ? "transparent" : color, // 子级不重复画一级那个色点
      level,
      raw: cands.filter((c) => (c.factionIds || []).includes(en.id)),
      list: [],
      kids: [],
    });
    const build = (node) => {
      node.kids = entries.filter((en) => en.parentId === node.id).map((en) => nodeOf(en, node.level + 1));
      node.kids.forEach(build);
      return node;
    };
    const hasContent = (n) => n.list.length > 0 || n.kids.some(hasContent);
    const prune = (n) => {
      n.kids = n.kids.filter(hasContent).map(prune);
      return n;
    };
    /* 人只放最下层：这条下面「直接」挂的人里，如果同时还挂在它的某个子级势力上，
       就只在子级那一行出现（否则 A1 和 A1›A2 下面会各出现一次）。 */
    const deepestOnly = (node) => {
      node.list = node.raw.filter((c) =>
        !(c.factionIds || []).some((id) => {
          if (id === node.id) return false;
          const other = byId.get(id);
          return !!(other && factionChainOf(other).slice(0, -1).some((x) => x.id === node.id));
        })
      );
      node.kids.forEach(deepestOnly);
      return node;
    };
    /* deep＝自己 + 所有子级的人（去重）：折叠起来时这一行显示的就是它
       （和势力分析表一个规矩：折叠就把子级的放到父级显示） */
    const fillDeep = (n) => {
      const seen = new Set();
      const out = [];
      [...n.list, ...n.kids.flatMap((k) => fillDeep(k))].forEach((c) => {
        if (seen.has(c.id)) return;
        seen.add(c.id);
        out.push(c);
      });
      n.deep = out;
      return out;
    };
    entries
      .filter((en) => !en.parentId || !byId.has(en.parentId))
      .map((en) => prune(deepestOnly(build(nodeOf(en, 1)))))
      .filter(hasContent)
      .forEach((n) => {
        fillDeep(n);
        groups.push(n);
      });
    const none = cands.filter((c) => !(c.factionIds || []).some((id) => known.has(id)));
    if (none.length) groups.push({ id: "", name: "未加入势力", color: "#6b6480", level: 1, list: none, kids: [], deep: none });
    return groups;
  }

  function renderRelFactionPicker(cands) {
    const box = $("#rel-faction-list");
    if (!box) return;
    const chainMark = chainMarkSetFrom(relCheckedIds || new Set());
    const cnt = $("#rel-faction-count");
    if (!cands.length) {
      if (cnt) cnt.textContent = "按势力分组";
      box.innerHTML = `<p class="empty-tip small">还没有可勾选的人物。</p>`;
      return;
    }
    const groups = relFactionGroups(cands);
    if (cnt) cnt.textContent = `按势力分组 · ${groups.filter((g) => g.id).length} 个势力`;
    if (!groups.length) {
      box.innerHTML = `<p class="empty-tip small">还没有势力条目。到「设定档案 → 势力」新建，或把人物直接拖到势力条目上。</p>`;
      return;
    }
    const renderGroup = (g) => {
      const folded = relFolded.factions.has(g.id);
      /* 折叠起来：子级势力的人并到这一行显示（这一行的「全选」也正好是这些人）；
         展开着：这一行只列直接挂在他名下的人，子级各有各的一行 —— 互不影响 */
      const list = folded ? g.deep || g.list : g.list;
      /* 「整组全选」的范围＝这一条下面所有层级的人（选了 A1 就把 A1›A2 的人也带上；
         选了 A2 只动 A2 那一支）。行里显示的还是「这一层直接挂的人」。 */
      const head = relPickGroupHeadHtml(g.name, g.color, list, "factions", g.id, g.level, g.deep || list);
      const items = list
        .map(
          (c) =>
            `<label class="rel-pick-item"><input type="checkbox" data-pick="${esc(c.id)}" ${
              relCheckedIds && relCheckedIds.has(c.id) ? "checked" : ""
            } />${avatarHtml(c)}<span class="rel-pick-name" title="${esc(c.name)}">${esc(c.name)}</span>${nameChainClipHtml(
              c.id,
              chainMark
            )}</label>`
        )
        .join("");
      const kids = (g.kids || []).map(renderGroup).join("");
      /* 折叠＝连子级势力一起收起来（只留这一条的标题） */
      const indent = Math.max(0, (g.level - 1) * 11);
      return `<div class="rel-pick-block" style="margin-left:${indent}px">${head}<div class="rel-pick-group-body"${
        folded ? " hidden" : ""
      }>${items}${kids}</div></div>`;
    };
    box.innerHTML = groups.map(renderGroup).join("");
    box.querySelectorAll("input[data-pick]").forEach((cb) =>
      cb.addEventListener("change", () => {
        if (!relCheckedIds) relCheckedIds = new Set();
        const id = cb.dataset.pick;
        if (cb.checked) relCheckedIds.add(id);
        else relCheckedIds.delete(id);
        renderRelations();
      })
    );
    bindRelGroupAll(box);
    bindRelGroupFolds(box);
  }

  // 力导向布局：有关系的互相吸近、没有的互相推开，拓扑一目了然
  function forceLayout(nodes, edges, W, H) {
    const n = nodes.length;
    const idx = new Map(nodes.map((c, i) => [c.id, i]));
    const pos = nodes.map((c, i) => {
      if (typeof c.netX === "number" && typeof c.netY === "number") {
        return { x: c.netX * W, y: c.netY * H, fixed: true };
      }
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      return { x: W / 2 + Math.cos(a) * W * 0.3, y: H / 2 + Math.sin(a) * H * 0.3, fixed: false };
    });
    if (n < 2) return pos;
    // 全都手动摆过位置：直接按归一化坐标铺开（改尺寸 / 折叠边栏后重排要快，也不该抖）
    if (pos.every((p) => p.fixed)) return pos;
    const links = edges
      .map((e) => [idx.get(e.fromId), idx.get(e.toId)])
      .filter(([a, b]) => a !== undefined && b !== undefined);
    const k = Math.sqrt((W * H) / n) * 0.55;
    for (let iter = 0; iter < 300; iter++) {
      const disp = pos.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = pos[i].x - pos[j].x;
          let dy = pos[i].y - pos[j].y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const d = Math.sqrt(d2);
          const f = (k * k) / d;
          const ux = dx / d;
          const uy = dy / d;
          disp[i].x += ux * f;
          disp[i].y += uy * f;
          disp[j].x -= ux * f;
          disp[j].y -= uy * f;
        }
      }
      links.forEach(([a, b]) => {
        const dx = pos[a].x - pos[b].x;
        const dy = pos[a].y - pos[b].y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const f = (d * d) / k;
        const ux = dx / d;
        const uy = dy / d;
        disp[a].x -= ux * f;
        disp[a].y -= uy * f;
        disp[b].x += ux * f;
        disp[b].y += uy * f;
      });
      const temp = 10 * (1 - iter / 300) + 0.6;
      for (let i = 0; i < n; i++) {
        if (pos[i].fixed) continue;
        const d = Math.max(0.01, Math.sqrt(disp[i].x * disp[i].x + disp[i].y * disp[i].y));
        pos[i].x += (disp[i].x / d) * Math.min(d, temp);
        pos[i].y += (disp[i].y / d) * Math.min(d, temp);
        pos[i].x = Math.max(48, Math.min(W - 48, pos[i].x));
        pos[i].y = Math.max(48, Math.min(H - 48, pos[i].y));
      }
    }
    return pos;
  }

  // 画布随容器尺寸重排：折叠 / 展开边栏、拉窗口、改缩放之后，viewBox 还停在旧尺寸的话，
  // 图上会空出一条点不到、也拖不过去的留白（圈圈到不了界面的边角）。这里盯住画布容器，
  // 尺寸真的变了就按新尺寸重铺一遍（归一化坐标不变，所以手动摆过的位置不会丢）。
  let relGraphWatched = false;
  function watchRelGraphSize() {
    if (relGraphWatched || typeof ResizeObserver !== "function") return;
    const wrap = document.querySelector(".rel-graph-wrap");
    if (!wrap) return;
    relGraphWatched = true;
    let lastW = 0;
    let lastH = 0;
    let timer = null;
    try {
      new ResizeObserver((entries) => {
        entries.forEach((en) => {
          const r = en.contentRect || {};
          const w = Math.round(r.width || 0);
          const h = Math.round(r.height || 0);
          if (!w || !h) return; // 页签隐藏时量到 0，跳过
          if (!lastW) {
            lastW = w;
            lastH = h;
            return;
          }
          if (Math.abs(w - lastW) < 8 && Math.abs(h - lastH) < 8) return;
          lastW = w;
          lastH = h;
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!viewHidden("view-relations")) renderRelations();
          }, 160);
        });
      }).observe(wrap);
    } catch (e) {
      /* 没有 ResizeObserver 就维持原来的行为 */
    }
  }

  // 连线上的关系词只给一个短标签：短关系词原样用；句子 / 原文例子一律概括成关系类型；
  // 细节（含「依据」原文例子）留在右侧列表和悬浮提示里，不铺在连线上。
  function shortRelLabel(r) {
    const kind = String((r && r.kind) || "").trim();
    const src = String((r && r.label) || "").trim();
    const bare = src.replace(/[“”"'‘’「」『』《》]/g, "").trim();
    if (!bare) return kind || "关系";
    // 取第一小段（逗号 / 顿号 / 空格等分隔），跳过纯连接词
    const chunks = bare.split(/[，。；、！？,;:：\/|｜·\s]+/).filter(Boolean);
    const STOP = /^(?:和|与|跟|同|及|是|的|了|被|把|给|对|为|在|他|她|它|他们|她们|两人|二人)$/;
    const first = (chunks.find((c) => !STOP.test(c)) || chunks[0] || bare).trim();
    // 带引号、带句末标点、太长 → 都是原文例子 / 长句，概括成关系类型（亲属 / 恋爱 / 师徒…）
    const isExample =
      /[“”"「」『』《》]/.test(src) || /[。！？…]/.test(src) || first.length > 6 || bare.length > 10;
    if (!isExample) return first;
    return kind || first.slice(0, 6);
  }

  function renderRelations() {
    const svg = $("#rel-graph");
    if (!svg) return;
    const cands = relCandidates();
    ensureRelChecked(cands);
    renderRelPicker(cands);
    updateRelLabelsBtn();
    const legend = $("#rel-legend");
    if (legend) {
      // 每一种关系都是一个过滤器：点一下只看这一类（连线和两端人物），再点取消
      legend.innerHTML =
        relKindList()
          .map((k) => {
            const n = (state.relations || []).filter((r) => (r.kind || "其他") === k.name).length;
            const active = relKindFilters.has(k.name);
            return `<button type="button" class="rel-legend-item ${active ? "active" : ""}" data-rel-kind="${esc(
              k.name
            )}" title="${esc(
              uiSentence("relKindTip", k.name)
            )}"><i style="background:${relKindColor(
              k.name
            )}"></i>${esc(k.name)}<em>${n}</em></button>`;
          })
          .join("") +
        `<button type="button" class="rel-legend-add" title="新建一个自定义关系类型（例如：主仆 / 同学 / 血缘）">＋ 类型</button>`;
      legend.querySelectorAll(".rel-legend-item").forEach((b) =>
        b.addEventListener("click", () => {
          const k = b.dataset.relKind;
          // 多选：点一下加进来 / 再点一下去掉；一个都没选＝显示全部
          if (relKindFilters.has(k)) relKindFilters.delete(k);
          else relKindFilters.add(k);
          relFocusIds = new Set();
          relSelectedCharId = null;
          renderRelations();
          showToast(
            relKindFilters.size
              ? uiSentence("relKindFilterOn", Array.from(relKindFilters).join(" · "))
              : uiTextFor("已取消关系类型过滤，显示全部关系")
          );
        })
      );
      // 自定义类型：右键可以改名 / 删除
      legend.querySelectorAll(".rel-legend-item").forEach((b) =>
        b.addEventListener("contextmenu", (ev) => {
          const k = b.dataset.relKind;
          const hit = relKindList().find((x) => x.name === k);
          if (!hit) return;
          ev.preventDefault();
          ev.stopPropagation();
          renderContextMenu(ev.clientX, ev.clientY, uiSentence("relKindMenuTitle", k), [
            { label: uiTextFor("更改颜色"), act: () => openManageColorPicker("relkind", k, b) },
            { label: uiTextFor("重命名…"), act: () => renameRelKind(k) },
            // 「链接」是人物链专用的：删除项直接灰掉、点不动（也不弹提示）
            isChainKindName(k)
              ? {
                  label: uiTextFor("删除类型"),
                  disabled: true,
                  tip: uiTextFor("「链接」是人物链专用的类型，不能删除（可以改名）"),
                  act: () => {},
                }
              : { label: uiTextFor("删除类型"), act: () => deleteRelKind(k) },
          ]);
          markContextTarget(b);
        })
      );
      const addBtn = legend.querySelector(".rel-legend-add");
      if (addBtn)
        addBtn.addEventListener("click", async () => {
          const name = await addCustomRelKind();
          if (name) renderRelations();
        });
    }
    const rels = (state.relations || []).filter(
      (r) => relCheckedIds.has(r.fromId) && relCheckedIds.has(r.toId) && getChar(r.fromId) && getChar(r.toId)
    ).filter((r) => !relKindFilters.size || relKindFilters.has(r.kind || "其他"));
    let chars = cands.filter((c) => relCheckedIds.has(c.id));
    if (relKindFilters.size) {
      // 过滤时只留下这些连线两头的人物
      const keep = new Set();
      rels.forEach((r) => {
        keep.add(r.fromId);
        keep.add(r.toId);
      });
      chars = chars.filter((c) => keep.has(c.id));
    }

    if (!chars.length) {
      svg.innerHTML = "";
      $("#rel-side-title").textContent = relKindFilters.size
        ? `${Array.from(relKindFilters).join(" · ")}（0）`
        : "全部关系";
      $("#rel-list").innerHTML = `<p class="empty-tip small">${
        relKindFilters.size
          ? uiTextFor("这一类里还没有关系：再点一下图例上的类型可以取消过滤。")
          : uiTextFor("还没有可显示的关系：先在左侧勾选人物，或点「一键生成/更新」。")
      }</p>`;
      relLayout = null;
      return;
    }

    // 画布尺寸按实际显示区域来定：原来固定 1000×720，画布比它窄时整体被等比缩小，
    // 图上的字就跟着缩到很小。改成和显示像素一致后，文字就是它本来的大小。
    const wrapEl = svg.parentElement;
    const availW = Math.round((wrapEl && wrapEl.clientWidth) || 0);
    const availH = Math.round((wrapEl && wrapEl.clientHeight) || 0);
    const W = Math.max(320, availW || 1000);
    const H = Math.max(300, availH || 720);
    watchRelGraphSize();
    const posArr = forceLayout(chars, rels, W, H);
    const pos = new Map();
    chars.forEach((c, i) => pos.set(c.id, posArr[i]));
    // 同一对人只画一条线，标签合并显示（避免多条线/多段文字叠在一起）
    const pairMap = new Map();
    rels.forEach((r) => {
      const key = [r.fromId, r.toId].sort().join("|");
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key).push(r);
    });
    const edgeList = Array.from(pairMap.values()).map((list) => {
      const labels = [];
      list.forEach((r) => {
        const t = String(r.label || "").trim();
        if (t && !labels.includes(t)) labels.push(t);
      });
      return { first: list[0], list, labels };
    });

    const deg = new Map();
    edgeList.forEach((ed) => {
      deg.set(ed.first.fromId, (deg.get(ed.first.fromId) || 0) + 1);
      deg.set(ed.first.toId, (deg.get(ed.first.toId) || 0) + 1);
    });
    const relLabelsOn = relLabelsVisible;
    relLayout = { pos, W, H };

    // 着重展示：与聚焦人物有拓扑连线的节点 / 边保持高亮，其余半透明
    const focus = relFocusIds;
    const keepNodes = new Set();
    if (focus.size) {
      focus.forEach((id) => keepNodes.add(id));
      edgeList.forEach((ed) => {
        const fa = ed.first.fromId;
        const fb = ed.first.toId;
        if (focus.has(fa) || focus.has(fb)) {
          keepNodes.add(fa);
          keepNodes.add(fb);
        }
      });
    }
    const edgeDim = (a, b) => focus.size > 0 && !(focus.has(a) || focus.has(b));

    let edges = "";
    edgeList.forEach((ed) => {
      const r = ed.first;
      const a = pos.get(r.fromId);
      const b = pos.get(r.toId);
      if (!a || !b) return;
      const dim = edgeDim(r.fromId, r.toId);
      const col = relKindColor(r.kind);
      // 「链接」（人物链）的线：比别的连线粗 2.5 倍、50% 透明度的虚线
      const isChainEdge = isChainKindName(r.kind);
      const baseW = focus.size ? 2.6 : 1.7;
      const edgeW = isChainEdge ? baseW * 2.5 : baseW;
      const edgeDash = isChainEdge
        ? ` stroke-dasharray="${(edgeW * 2.2).toFixed(1)} ${(edgeW * 1.4).toFixed(1)}" stroke-opacity="0.5"`
        : "";
      let labelSvg = "";
      if (relLabelsOn && ed.labels.length) {
        // 连线上只放概括后的短关系词（最多两个 + …），原文例子 / 长句不进连线
        const shorts = [];
        ed.list.forEach((r) => {
          const s = shortRelLabel(r);
          if (s && !shorts.includes(s)) shorts.push(s);
        });
        const short = shorts.slice(0, 2).join(" / ") + (shorts.length > 2 ? "…" : "");
        const full = ed.list
          .map((r) => {
            const kind = String(r.kind || "").trim();
            const lb = String(r.label || "").trim();
            return kind && lb && lb !== kind ? `${lb}（${kind}）` : lb || kind || "关系";
          })
          .join(" / ");
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const mx = (a.x + b.x) / 2 - (dy / len) * 11;
        const my = (a.y + b.y) / 2 + (dx / len) * 11;
        labelSvg = `<text class="rel-edge-label" x="${mx}" y="${my}" text-anchor="middle"><title>${esc(full)}</title>${esc(short)}</text>`;
      }
      edges += `<g class="rel-edge ${dim ? "dim" : ""}" data-rel-id="${esc(r.id)}" data-rel-ids="${esc(
        ed.list.map((x) => x.id).join(",")
      )}" title="${ed.list.length > 1 ? esc(`这两条线之间的 ${ed.list.length} 条关系，点一下选择要编辑哪条`) : ""}">
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="${edgeW}"${edgeDash} />
        ${labelSvg}
      </g>`;
    });

    let nodes = "";
    chars.forEach((c) => {
      const p = pos.get(c.id);
      const dim = focus.size > 0 && !keepNodes.has(c.id);
      const rr = 14 + Math.min(7, (deg.get(c.id) || 0) * 1.6);
      // 有人设图的：圆圈里直接用缩略图（裁成圆形），没有的仍然显示首字
      let body;
      if (c.portrait) {
        const clipId = "relclip" + String(c.id).replace(/[^A-Za-z0-9_-]/g, "");
        body = `<defs><clipPath id="${clipId}"><circle r="${rr}" /></clipPath></defs>
        <circle r="${rr}" fill="${esc(c.color)}" />
        <image class="rel-node-photo" href="${esc(c.portrait)}" x="${-rr}" y="${-rr}" width="${rr * 2}" height="${rr * 2}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />
        <circle r="${rr}" fill="none" />`;
      } else {
        // 圈和圈中字沿用人物边栏卡片的美术：人物色 62% 的玻璃圆 + 一层白色高光 + 圆体字
        // （字色按人物色亮度给：普通白字、很亮的用深墨字；字号约为圆直径的一半）
        const ink = charInkColors(c.color).glass;
        body = `<circle r="${rr}" fill="${esc(c.color)}" fill-opacity="0.62" />
        <circle r="${rr}" fill="url(#relGlassGloss)" />
        <text class="rel-node-initial" y="${(rr * 0.38).toFixed(1)}" style="font-size:${rr.toFixed(
          1
        )}px;--rel-ink:${esc(ink)}" text-anchor="middle">${esc(initials(c.name))}</text>`;
      }
      nodes += `<g class="rel-node ${dim ? "dim" : ""}" data-char-id="${esc(c.id)}" transform="translate(${p.x},${p.y})">
        <title>${esc(c.name)}</title>
        ${body}
        <text class="rel-node-name" y="${rr + 15}" text-anchor="middle">${esc(c.name)}</text>
      </g>`;
    });

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML =
      `<defs><linearGradient id="relGlassGloss" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />` +
      `<stop offset="1" stop-color="#ffffff" stop-opacity="0.04" /></linearGradient></defs>` +
      `<g class="rel-edges">${edges}</g><g class="rel-nodes">${nodes}</g>`;

    // 节点：点击选中、拖动改位置
    const svgPointOf = (ev) => {
      const m = svg.getScreenCTM && svg.getScreenCTM();
      if (m && typeof DOMPoint === "function") {
        const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
      }
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { x: ((ev.clientX - rect.left) / rect.width) * W, y: ((ev.clientY - rect.top) / rect.height) * H };
    };
    svg.querySelectorAll(".rel-node").forEach((g) => {
      let dragging = false;
      let moved = false;
      g.addEventListener("pointerdown", (ev) => {
        dragging = true;
        moved = false;
        try {
          g.setPointerCapture(ev.pointerId);
        } catch (e) {
          /* ignore */
        }
        ev.stopPropagation();
      });
      g.addEventListener("pointermove", (ev) => {
        if (!dragging) return;
        // 用 SVG 自己的变换矩阵换算：viewBox 和元素尺寸的长宽比不一致时（画布比图更宽 / 更高），
        // 直接按元素比例线性换算会算歪，圈圈就拖不到边角。
        const pt = svgPointOf(ev);
        if (!pt) return;
        const x = pt.x;
        const y = pt.y;
        const c = getChar(g.dataset.charId);
        if (!c) return;
        moved = true;
        // 贴边时按圈半径留一点边距（圈下还有人名），除此之外整块画布都能放
        const rr = 18 + Math.min(10, (deg.get(c.id) || 0) * 2.2);
        const cx = Math.max(rr + 4, Math.min(W - rr - 4, x));
        const cy = Math.max(rr + 4, Math.min(H - rr - 20, y));
        c.netX = Math.max(0, Math.min(1, cx / W));
        c.netY = Math.max(0, Math.min(1, cy / H));
        relLayout.pos.set(c.id, { x: c.netX * W, y: c.netY * H });
        updateRelSvg();
      });
      g.addEventListener("pointerup", (ev) => {
        if (!dragging) return;
        dragging = false;
        try {
          g.releasePointerCapture(ev.pointerId);
        } catch (e) {
          /* ignore */
        }
        if (moved) saveState();
      });
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (moved) return;
        const id = g.dataset.charId;
        const same = relSelectedCharId === id && relFocusIds.size === 1 && relFocusIds.has(id);
        relSelectedCharId = same ? null : id;
        relFocusIds = same ? new Set() : new Set([id]);
        renderRelations();
      });
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = g.dataset.charId;
        const c = getChar(id);
        if (!c) return;
        renderContextMenu(ev.clientX, ev.clientY, "「" + c.name + "」", [
          { label: "编辑人物", act: () => openCharacterModal(id) },
          { label: "着重展示", act: () => focusRelNodes([id]) },
          { label: "取消着重展示", act: () => clearRelFocus() },
        ]);
      });
    });
    svg.querySelectorAll(".rel-edge").forEach((g) => {
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const ids = String(g.dataset.relIds || g.dataset.relId || "")
          .split(",")
          .filter(Boolean);
        if (ids.length <= 1) {
          openRelationModal(ids[0] || g.dataset.relId);
          return;
        }
        // 同一对人物有多条关系：让用户挑要编辑哪一条
        pickEdgeRelation(ev.clientX, ev.clientY, ids);
      });
      // 双击连线：只着重展示这条边两端人物的关系
      g.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rel = (state.relations || []).find((r) => r.id === g.dataset.relId);
        if (rel) focusRelNodes([rel.fromId, rel.toId]);
      });
      // 右键连线：改这两个人的关系描述
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const ids2 = String(g.dataset.relIds || g.dataset.relId || "")
          .split(",")
          .filter(Boolean);
        if (ids2.length <= 1) showRelEdgeMenu(ev.clientX, ev.clientY, ids2[0] || g.dataset.relId);
        else pickEdgeRelation(ev.clientX, ev.clientY, ids2);
      });
    });
    // 点空白处取消着重展示（只绑一次，避免每次重绘叠加监听）
    if (!svg.dataset.bgBound) {
      svg.dataset.bgBound = "1";
      svg.addEventListener("click", () => {
        if (relFocusIds.size || relSelectedCharId) {
          relSelectedCharId = null;
          relFocusIds = new Set();
          renderRelations();
        }
      });
      // 空白处右键：一键开关关系文字 / 重置布局等
      svg.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        showRelCanvasMenu(ev.clientX, ev.clientY);
      });
    }

    // 右侧列表
    const chainMark = chainMarkSetFrom(relCheckedIds || new Set());
    const list = relSelectedCharId
      ? rels.filter((r) => r.fromId === relSelectedCharId || r.toId === relSelectedCharId)
      : rels;
    const selName = relSelectedCharId ? (getChar(relSelectedCharId) || {}).name : "";
    const kindLabel = relKindFilters.size ? Array.from(relKindFilters).join(" · ") : uiTextFor("全部关系");
    $("#rel-side-title").textContent = relSelectedCharId
      ? `${selName} 的关系（${list.length}）${relKindFilters.size ? ` · ${uiTextFor("只看")}${kindLabel}` : ""}`
      : `${kindLabel}（${list.length}）`;
    $("#rel-list").innerHTML =
      list
        .map((r) => {
          const a = getChar(r.fromId);
          const b = getChar(r.toId);
          if (!a || !b) return "";
          return `<div class="rel-item" data-rel-id="${esc(r.id)}">
            <span class="rel-kind-dot" style="background:${relKindColor(r.kind)}"></span>
            <span class="rel-item-text"><b>${esc(a.name)}</b>${nameChainClipHtml(a.id, chainMark)} ↔ <b>${esc(b.name)}</b>${nameChainClipHtml(b.id, chainMark)}<span class="rel-item-label">${esc(r.label || "")}</span></span>
            <span class="rel-item-kind">${esc(r.kind || "其他")}</span>
          </div>`;
        })
        .join("") || `<p class="empty-tip small">没有关系。</p>`;
    $$("#rel-list .rel-item").forEach((el) => el.addEventListener("click", () => openRelationModal(el.dataset.relId)));
    // 右侧关系列表：右键＝改这条关系的类型颜色（也可直接进编辑）
    $$("#rel-list .rel-item").forEach((el) =>
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const r = (state.relations || []).find((x) => x.id === el.dataset.relId);
        if (!r) return;
        const kind = r.kind || "其他";
        const an = (getChar(r.fromId) || {}).name || "?";
        const bn = (getChar(r.toId) || {}).name || "?";
        renderContextMenu(ev.clientX, ev.clientY, `「${an} ↔ ${bn}」`, [
          { label: "编辑这条关系", act: () => openRelationModal(r.id) },
          { label: "删除", act: () => removeRelationById(r.id) },
        ]);
        markContextTarget(el);
      })
    );
  }

  function updateRelSvg() {
    if (!relLayout) return;
    const svg = $("#rel-graph");
    if (!svg) return;
    const { pos } = relLayout;
    svg.querySelectorAll(".rel-edge").forEach((g) => {
      const rel = (state.relations || []).find((r) => r.id === g.dataset.relId);
      if (!rel) return;
      const a = pos.get(rel.fromId);
      const b = pos.get(rel.toId);
      if (!a || !b) return;
      const line = g.querySelector("line");
      const text = g.querySelector("text");
      if (line) {
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
      }
      if (text) {
        text.setAttribute("x", (a.x + b.x) / 2);
        text.setAttribute("y", (a.y + b.y) / 2 - 5);
      }
    });
    svg.querySelectorAll(".rel-node").forEach((g) => {
      const p = pos.get(g.dataset.charId);
      if (p) g.setAttribute("transform", `translate(${p.x},${p.y})`);
    });
  }

  function resetRelLayout() {
    state.characters.forEach((c) => {
      delete c.netX;
      delete c.netY;
    });
    saveState();
    renderRelations();
  }

  /* ---- 关系网：着重展示与快捷编辑 ---- */
  function focusRelNodes(ids) {
    relFocusIds = new Set((ids || []).filter((id) => getChar(id)));
    relSelectedCharId = null;
    renderRelations();
    if (relFocusIds.size) {
      const names = Array.from(relFocusIds)
        .map((id) => (getChar(id) || {}).name)
        .filter(Boolean);
      showToast("着重展示：" + names.join(" ↔ ") + " 的关系");
    }
  }

  function clearRelFocus() {
    relFocusIds = new Set();
    relSelectedCharId = null;
    renderRelations();
    showToast("已取消着重展示");
  }

  // 一键显示 / 隐藏连线上的关系文字
  function toggleRelLabels() {
    relLabelsVisible = !relLabelsVisible;
    updateRelLabelsBtn();
    renderRelations();
    showToast(relLabelsVisible ? "已显示关系文字" : "已隐藏关系文字");
  }

  function updateRelLabelsBtn() {
    const btn = $("#rel-labels-btn");
    if (!btn) return;
    btn.textContent = relLabelsVisible ? "隐藏关系文字" : "显示关系文字";
    btn.title = relLabelsVisible ? "把连线上的关系文字隐藏起来" : "在连线上显示关系文字";
  }

  function showRelCanvasMenu(x, y) {
    renderContextMenu(x, y, "关系网", [
      { label: relLabelsVisible ? "隐藏关系文字" : "显示关系文字", act: () => toggleRelLabels() },
      { label: "取消着重展示", act: () => clearRelFocus() },
      { label: "重置布局", act: () => resetRelLayout() },
      { label: "一键生成 / 更新", act: () => generateRelations() },
    ]);
  }

  function showRelEdgeMenu(x, y, relId) {
    const r = (state.relations || []).find((it) => it.id === relId);
    if (!r) return;
    const a = getChar(r.fromId);
    const b = getChar(r.toId);
    renderContextMenu(x, y, `${a ? a.name : "?"} ↔ ${b ? b.name : "?"}`, [
      { label: "修改描述…", act: () => quickEditRelationLabel(relId) },
      { label: "着重展示", act: () => focusRelNodes([r.fromId, r.toId]) },
      { label: "编辑关系…", act: () => openRelationModal(relId) },
      { label: "删除…", act: () => deleteRelationById(relId) },
    ]);
  }

  // 同一对人物有多条关系时（既是亲属又是同事…），点连线先让用户挑要改哪一条
  function pickEdgeRelation(x, y, ids) {
    const list = ids.map((id) => (state.relations || []).find((r) => r.id === id)).filter(Boolean);
    if (!list.length) return;
    const a = getChar(list[0].fromId);
    const b = getChar(list[0].toId);
    renderContextMenu(
      x,
      y,
      `${a ? a.name : "?"} ↔ ${b ? b.name : "?"}（${list.length} 条关系）`,
      list.map((r) => ({
        label: `编辑：${r.kind || "其他"}${r.label ? " · " + r.label : ""}`,
        act: () => openRelationModal(r.id),
      })).concat([
        { label: "删除其中一条…", act: () => pickEdgeRelationToDelete(x, y, list) },
        { label: "着重展示这两人", act: () => focusRelNodes([list[0].fromId, list[0].toId]) },
      ])
    );
  }

  function pickEdgeRelationToDelete(x, y, list) {
    renderContextMenu(
      x,
      y,
      `删除哪一条关系？`,
      list.map((r) => ({
        label: `${r.kind || "其他"}${r.label ? " · " + r.label : ""}`,
        act: () => deleteRelationById(r.id),
      }))
    );
  }

  async function quickEditRelationLabel(relId) {
    const r = (state.relations || []).find((it) => it.id === relId);
    if (!r) return;
    const a = getChar(r.fromId);
    const b = getChar(r.toId);
    const v = await uiPrompt(`「${a ? a.name : "?"}」和「${b ? b.name : "?"}」的关系描述：`, r.label || "");
    if (v === null) return;
    const t = v.trim();
    if (t === (r.label || "")) return;
    pendingUndoLabel = `修改关系描述：「${a ? a.name : "?"} ↔ ${b ? b.name : "?"}」`;
    r.label = t;
    saveState();
    renderRelations();
    showToast("已更新关系描述");
  }

  async function deleteRelationById(relId) {
    const r = (state.relations || []).find((it) => it.id === relId);
    if (!r) return;
    // 「链接」关系＝人物链：交给专门的删除流程（会问「移除 A / 移除 B / 解散 / 取消」）
    if (isChainKindName(r.kind)) return await deleteChainLinkRelation(r);
    const a = getChar(r.fromId);
    const b = getChar(r.toId);
    // 关系连线属于设定 / 卡片类：不弹二次确认，删完可以用「撤销」还原
    const before = JSON.parse(JSON.stringify(state.relations || []));
    pendingUndoLabel = `删除关系：「${a ? a.name : "?"} ↔ ${b ? b.name : "?"}」`;
    state.relations = (state.relations || []).filter((it) => it.id !== relId);
    saveState();
    renderRelations();
    showRelDeleteUndoBar(`删除关系：「${a ? a.name : "?"} ↔ ${b ? b.name : "?"}」（可撤销）`, before);
    showToast(uiTextFor("已删除这条关系（可撤销）"));
  }

  /* 删除一条「链接」关系：这条关系是两个人在同一条人物链里的凭证，所以先问怎么处理这条链。
     链里只有 2 个人时「移除任一方」＝「解散」，不用问，直接散。
     3 人以上给四个选项：移除 A / 移除 B / 解散人物链 / 取消（回车＝移除 A，Esc＝取消）。 */
  async function deleteChainLinkRelation(r) {
    const a = getChar(r.fromId);
    const b = getChar(r.toId);
    const aName = (a && a.name) || "?";
    const bName = (b && b.name) || "?";
    const chain = chainOfChar(r.fromId) || chainOfChar(r.toId);
    const members = chain ? chainMembersOf(chain) : [];
    // 人物链的删除会同时动 relations + charChains：留一份完整快照给「撤销」条
    const before = {
      relations: JSON.parse(JSON.stringify(state.relations || [])),
      charChains: JSON.parse(JSON.stringify(state.charChains || [])),
    };
    const finish = (label, toast) => {
      pendingUndoLabel = label;
      saveState();
      renderRelations();
      renderCharacters();
      renderStats();
      renderCharChainSlots(getChar($("#char-id").value));
      showRelDeleteUndoBar(uiTextFor("已删除关系（可撤销）"), before);
      showToast(toast);
    };
    if (!chain || members.length <= 2) {
      // 只有两个人：删掉链接＝解散这条链
      if (chain) unlinkCharsFromChain(members.map((m) => m.id));
      else state.relations = (state.relations || []).filter((x) => x.id !== r.id);
      finish(`解散人物链：「${aName} ↔ ${bName}」`, uiTextFor("已取消链接，人物卡恢复各自独立（可撤销）"));
      return;
    }
    // 名字太长按钮里放不下：截一下，完整名字放悬浮提示
    const shortName = (n) => {
      const t = String(n || "").trim();
      return t.length > 6 ? t.slice(0, 5) + ".." : t;
    };
    const choice = await uiChoose(
      "", // 不写正文：标题 + 四个按钮已经说清楚了
      [
        {
          label: uiTextFor("移除") + " " + shortName(aName),
          value: "removeA",
          primary: true,
          tip: uiTextFor("把这个人从人物链里摘掉，其它人保持不变") + `：${aName}`,
        },
        {
          label: uiTextFor("移除") + " " + shortName(bName),
          value: "removeB",
          tip: uiTextFor("把这个人从人物链里摘掉，其它人保持不变") + `：${bName}`,
        },
        {
          label: uiTextFor("解散链"),
          value: "dissolve",
          danger: true,
          tip: uiTextFor("把这条链上所有人之间的关系都去掉"),
        },
        { label: uiTextFor("取消"), value: "cancel", cancel: true, tip: uiTextFor("什么都不做，保留关系和人物链") },
      ],
      uiTextFor("删除这条链接"),
      { row: true }
    );
    if (!choice || choice === "cancel") return;
    if (choice === "removeA") {
      unlinkCharsFromChain([r.fromId]);
      finish(`人物链：摘掉「${aName}」`, uiTextFor("已把这张卡从人物链里摘掉（可撤销）"));
      return;
    }
    if (choice === "removeB") {
      unlinkCharsFromChain([r.toId]);
      finish(`人物链：摘掉「${bName}」`, uiTextFor("已把这张卡从人物链里摘掉（可撤销）"));
      return;
    }
    unlinkCharsFromChain(members.map((m) => m.id));
    finish(`解散人物链（${members.length} 人）`, uiTextFor("已取消链接，人物卡恢复各自独立（可撤销）"));
  }

  function openRelationModal(id) {
    const r = id ? (state.relations || []).find((x) => x.id === id) : null;
    $("#relation-modal-title").textContent = r ? "编辑关系" : "新建关系";
    $("#rel-id").value = r ? r.id : "";
    // A / B：既能从下拉里选，也能直接输入人名，保存时按名字自动匹配到人物
    bindRelCharCombo($("#rel-from"));
    bindRelCharCombo($("#rel-to"));
    const fromEl = $("#rel-from");
    const toEl = $("#rel-to");
    if (fromEl) fromEl.value = (getChar(r ? r.fromId : relSelectedCharId) || {}).name || "";
    if (toEl) toEl.value = (getChar(r ? r.toId : "") || {}).name || "";
    $("#rel-label").value = r ? r.label || "" : "";
    renderRelKindSelect(r ? r.kind || "其他" : "其他");
    // 「链接」关系跟着人物链走：类型不让在这里换（类型名去「设置 → 关系网」改），名称和备注照填
    const chainRel = !!(r && isChainKindName(r.kind));
    const kindSel = $("#rel-kind");
    if (kindSel) {
      kindSel.disabled = chainRel;
      kindSel.title = chainRel
        ? uiTextFor("「链接」是人物链专用类型：类型名在「设置 → 关系网」改")
        : "";
    }
    $("#rel-note").value = r ? r.note || "" : "";
    $("#rel-delete-btn").hidden = !r;
    openModal("relation-modal");
  }

  // 「新增 / 编辑关系」里 A、B 是「下拉 + 输入」二合一：
  // 候选就是人物边栏里的全部人物名（按边栏里的顺序），打字会筛，选一个就填上；
  // 直接手打名字 / 别名也行，保存时按名字匹配（见 submitRelationForm）。
  function relCharNames() {
    return (state.characters || []).map((c) => String(c.name || "").trim()).filter(Boolean);
  }

  // 候选框里一行：就一个名字（长名字按宽度省略）；clip=true 时名字后挂人物链回形针
  function relCharItemHtml(name, i, active, clip) {
    const c = clip ? (state.characters || []).find((x) => String(x.name || "").trim() === name) : null;
    const clipHtml = c ? nameChainClipHtml(c.id, new Set([c.id])) : "";
    return (
      `<div class="rel-char-item${active ? " active" : ""}" data-i="${i}">` +
      `<span class="rc-name">${esc(name)}</span>${clipHtml}` +
      `</div>`
    );
  }

  const relComboFixedPlaces = new Set();
  uiOnZoomReflow(() => {
    relComboFixedPlaces.forEach((fn) => fn());
  });

  function bindRelCharCombo(input) {
    if (!input || input.dataset.comboBound === "1") return;
    input.dataset.comboBound = "1";
    const onPick = typeof arguments[1] === "function" ? arguments[1] : null;
    const opts = arguments[2] || {};
    const fixedPop = !!opts.fixed; // 输入框在会被裁剪的容器里（比如人物链选项卡条）时用浮层
    let items = [];
    let idx = 0;
    const pop = document.createElement("div");
    pop.className = "rel-char-pop";
    pop.hidden = true;
    // 和事件里的「时间 / 地点」候选框同一套做法：放进输入框自己的定位容器，
    // 贴在输入框正下方（宽度＝输入框宽度）。以前挂在 body 上用 fixed + 手算坐标，
    // 弹窗滚动 / 布局一变就错位，看起来像「挡住了输入框」。
    if (fixedPop) {
      // 选项卡条每次重画都会生成新的输入框：把上一条「没人用」的浮层清掉，别越积越多
      Array.prototype.slice.call(document.querySelectorAll(".rel-char-pop.fixed")).forEach((el) => {
        if (!el.__owner || !el.__owner.isConnected) el.remove();
      });
      pop.__owner = input;
      pop.classList.add("fixed");
      document.body.appendChild(pop);
    } else {
      const wrap = document.createElement("span");
      wrap.className = "rel-combo";
      if (input.parentNode) {
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        wrap.appendChild(pop);
      } else {
        document.body.appendChild(pop);
      }
    }
    // 浮层版：位置跟着输入框走（滚动 / 改窗口大小都不会错位）
    const place = () => {
      if (!fixedPop || pop.hidden) return;
      if (!input.isConnected) {
        relComboFixedPlaces.delete(place);
        return;
      }
      const r = uiVisualRect(input);
      const w = Math.max(Math.round(r.width), 180);
      pop.style.width = uiZoomPx(Math.min(w, window.innerWidth - 16));
      // 视觉坐标 → 元素坐标系（缩放时别被放大第二次）
      pop.style.left = uiZoomPx(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)));
      pop.style.top = uiZoomPx(r.bottom + 3);
    };
    if (fixedPop) {
      relComboFixedPlaces.add(place);
      document.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
    }
    const close = () => {
      pop.hidden = true;
    };
    const pick = (i) => {
      if (items[i] == null) return;
      input.value = items[i];
      close();
      if (onPick) {
        const name = items[i];
        input.value = "";
        input.blur();
        onPick(name);
        return;
      }
      input.focus();
    };
    const render = () => {
      const q = String(input.value || "").trim();
      const ex = opts.excludeNames && opts.excludeNames.length ? new Set(opts.excludeNames) : null;
      const all = ex ? relCharNames().filter((n) => !ex.has(n)) : relCharNames();
      const list = q
        ? all.filter((n) => acScore(q, n) > 0).sort((a, b) => acScore(q, b) - acScore(q, a))
        : all;
      const signed = list.slice(0, 80);
      /* 用户 2026-10-17：**只要匹配到了**（不管匹配了几个字）就把这个人所在人物链上的伙伴
         摆在他**下面**（名字后挂回形针），不是统统堆到列表最后。
         同链的两个人恰好都命中时，匹配得更完整的那个当锚点，另一个也收进它下面，
         不会因为分数高就跑到锚点上面（用户 2026-10-17 再次强调）。 */
      const mateSet = new Set();
      if (q && signed.length) {
        const withMates = [];
        const seen = new Set();
        signed.forEach((n) => {
          if (seen.has(n)) return;
          seen.add(n);
          withMates.push(n);
          const c = (state.characters || []).find((x) => String(x.name || "").trim() === n);
          if (!c) return;
          const ch = chainOfChar(c.id);
          if (!ch) return;
          chainMembersOf(ch).forEach((m) => {
            if (m.id === c.id) return;
            const nm = String(m.name || "").trim();
            if (!nm || seen.has(nm) || mateSet.has(nm) || (ex && ex.has(nm))) return;
            seen.add(nm);
            mateSet.add(nm);
            withMates.push(nm); // 紧跟在命中的这个人下面
          });
        });
        items = withMates;
      } else items = signed;
      items = items.slice(0, 80);
      if (!items.length || (items.length === 1 && items[0] === q)) {
        close();
        return;
      }
      if (idx >= items.length) idx = 0;
      pop.innerHTML = items
        .map((n, i) => relCharItemHtml(n, i, i === idx, mateSet.has(n)))
        .join("");
      pop.hidden = false;
      place();
      const hit = pop.querySelector(".rel-char-item.active");
      if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: "nearest" });
      pop.querySelectorAll(".rel-char-item").forEach((el) =>
        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          pick(Number(el.dataset.i));
        })
      );
    };
    input.addEventListener("input", () => {
      idx = 0;
      render();
    });
    input.addEventListener("focus", () => {
      idx = 0;
      render();
      // 输入框有「展开」过渡：等它撑开以后再对一次位置，浮层才不会偏
      if (fixedPop) setTimeout(place, 180);
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", (ev) => {
      if (pop.hidden) return;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        ev.stopPropagation();
        idx = (idx + (ev.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        render();
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        pick(idx);
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      }
    });
  }

  function submitRelationForm(e) {
    e.preventDefault();
    const id = $("#rel-id").value;
    // A / B 是输入框：输入的可以是全名、简称或别名，这里按名字自动匹配到人物
    const nameA = String(($("#rel-from") || {}).value || "").trim();
    const nameB = String(($("#rel-to") || {}).value || "").trim();
    const ca = nameA ? findCharacterByName(nameA, []) : null;
    const cb = nameB ? findCharacterByName(nameB, []) : null;
    if (!nameA || !nameB) {
      uiAlert("请先创建人物。");
      return;
    }
    if (!ca || !cb) {
      uiAlert(
        `没找到人物「${!ca ? nameA : nameB}」。\n\n下拉列表里可以直接选现有人物；新人物请先在人物栏里建好。`
      );
      return;
    }
    const fromId = ca.id;
    const toId = cb.id;
    if (fromId === toId) {
      uiAlert("请选择两个不同的人物。");
      return;
    }
    const data = {
      fromId,
      toId,
      label: $("#rel-label").value.trim(),
      kind: $("#rel-kind").value,
      note: $("#rel-note").value.trim(),
    };
    const aName = (getChar(fromId) || {}).name || "?";
    const bName = (getChar(toId) || {}).name || "?";
    pendingUndoLabel = (id ? "修改关系：" : "新建关系：") + `「${aName} ↔ ${bName}」`;
    let relId = id;
    if (id) {
      const r = (state.relations || []).find((x) => x.id === id);
      if (r) Object.assign(r, data);
    } else {
      relId = uid();
      state.relations.push(Object.assign({ id: relId }, data));
    }
    // 建「链接」关系＝把这两个人串成一条人物链（取并集，和批量条上的「链接」一样）
    if (isChainKindName(data.kind)) linkRelationPairsIntoChain(fromId, toId);
    saveState();
    renderRelations();
    renderCharacters();
    renderCharChainSlots(getChar($("#char-id").value));
    syncSavedId("relation-modal", relId);
    finishCardSave("relation-modal");
  }

  // 一条「链接」关系 → 把两端人物所在的人物链并成一条（并集）
  function linkRelationPairsIntoChain(aId, bId) {
    if (!aId || !bId || aId === bId) return null;
    const all = new Set([aId, bId]);
    [aId, bId].forEach((id) => {
      const ch = chainOfChar(id);
      if (ch) chainMembersOf(ch).forEach((m) => all.add(m.id));
    });
    const chain = linkCharsIntoChain(Array.from(all));
    syncChainLinkRelations();
    return chain;
  }

  function deleteRelation() {
    const id = $("#rel-id").value;
    if (!id) return;
    closeModal("relation-modal");
    removeRelationById(id); // 「链接」关系会在里面弹「移除 / 解散 / 取消」
  }

  // 删掉一条关系（不弹确认，可撤销）：右键右侧关系列表 / 编辑关系弹窗都用它
  function removeRelationById(id) {
    if (!id) return;
    const r = (state.relations || []).find((x) => x.id === id);
    if (!r) return;
    // 「链接」关系代表人物链：删它要先决定这条链怎么处理（弹窗里 Enter＝移除 A、Esc＝取消）
    if (isChainKindName(r.kind)) {
      void deleteChainLinkRelation(r);
      return;
    }
    const aName = (getChar(r.fromId) || {}).name || "?";
    const bName = (getChar(r.toId) || {}).name || "?";
    const before = JSON.parse(JSON.stringify(state.relations || []));
    pendingUndoLabel = `删除关系：「${aName} ↔ ${bName}」`;
    state.relations = (state.relations || []).filter((x) => x.id !== id);
    saveState();
    renderRelations();
    renderStats();
    showRelDeleteUndoBar(`删除关系：「${aName} ↔ ${bName}」（可撤销）`, before);
    showToast(uiTextFor("已删除关系（可撤销）"));
  }

