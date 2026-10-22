  /* ================= 设定条目的「树型拓扑」追加功能（技能树等） =================
     数据一律**存在类别上**：cat.tree = { feature, nodes: { [entryId]: { row, parent } } }
       · row    = 0 起，界面上显示成 F0 / F1 / F2…
       · parent = 树节点自己这个对象里的父节点 entryId；"" ＝ 悬空（没有父级）
     卡片上**不加任何拓扑字段**（en.parentId 是「势力」在用的字段，这里绝对不碰）：
     两套层级各走各的，谁也别读对方的数据。
     规则（用户 2026-10-15 确认）：
       · 复制卡片 → 副本没有节点（数据在类别上，天然不继承）
       · 合并卡片 → 只保留主体卡的节点，被并掉那些卡的节点删掉
       · 换类别   → 把这张卡的节点连同它下方子树的节点一起删掉（卡片都留着） */
  const TREE_PICK_LIMIT = 60; // 候选面板最多列这么多张卡
  const TREE_WALK_MAX = 400; // 链 / 子树遍历的保险丝（数据坏了也不会卡死）

  function ensureCatTree(cat) {
    if (!cat) return null;
    if (!cat.tree || typeof cat.tree !== "object" || Array.isArray(cat.tree)) cat.tree = {};
    const t = cat.tree;
    if (typeof t.feature !== "boolean") t.feature = catKind(cat) === "skill"; // 技能树默认带着
    if (!t.nodes || typeof t.nodes !== "object" || Array.isArray(t.nodes)) t.nodes = {};
    if (!t.tones || typeof t.tones !== "object" || Array.isArray(t.tones)) t.tones = {}; // 每棵树的自定义配色
    if (!Array.isArray(t.order)) t.order = []; // 树的左右显示顺序（右键「左移 / 右移」改的就是它）
    return t;
  }
  /* 哪些类别可以加「树型拓扑」：纪年（按时间读）、地点（要和地图栏抢位置）、势力（自己已有三级层级）不给 */
  function catSupportsTree(cat) {
    const k = catKind(cat);
    return !!cat && k !== "era" && k !== "place" && k !== "faction";
  }
  function catTreeFeatureOn(cat) {
    const t = ensureCatTree(cat);
    return !!(t && t.feature && catSupportsTree(cat));
  }
  /* 这个类别的拓扑现在开着吗（＝追加功能勾了） */
  function catTreeOn(cat) {
    return catTreeFeatureOn(cat);
  }
  function treeOf(cat) {
    return catTreeFeatureOn(cat) ? ensureCatTree(cat) : null;
  }
  function treeEntriesOfCat(cat) {
    return !cat ? [] : (state.settings.entries || []).filter((en) => en && en.categoryId === cat.id);
  }
  function treeNodeOf(cat, id) {
    const t = treeOf(cat);
    return t && id ? t.nodes[id] || null : null;
  }
  function treeInTree(cat, id) {
    return !!treeNodeOf(cat, id);
  }
  function treeRowOf(cat, id) {
    const n = treeNodeOf(cat, id);
    return n ? Math.max(0, Math.floor(Number(n.row) || 0)) : 0;
  }
  /* 从自己往上数父级：[根, …, 自己]；数据坏了 / 成环返回 [] */
  function treeChainOf(cat, id) {
    const t = treeOf(cat);
    if (!t || !t.nodes[id]) return [];
    const out = [];
    const seen = new Set();
    let cur = id;
    while (cur && t.nodes[cur] && !seen.has(cur) && out.length < TREE_WALK_MAX) {
      seen.add(cur);
      out.unshift(cur);
      cur = t.nodes[cur].parent || "";
    }
    if (cur && seen.has(cur)) return []; // 成环
    return out;
  }
  function treeDirectChildren(cat, id) {
    const t = treeOf(cat);
    if (!t || !id) return [];
    return Object.keys(t.nodes).filter((x) => t.nodes[x].parent === id);
  }
  /* 整棵子树（含自己），按行号从浅到深、同层按卡片顺序 */
  function treeSubtreeIds(cat, id) {
    const t = treeOf(cat);
    if (!t || !t.nodes[id]) return [];
    const out = [];
    const seen = new Set();
    const walk = (cur) => {
      if (!cur || seen.has(cur) || out.length >= TREE_WALK_MAX) return;
      seen.add(cur);
      out.push(cur);
      treeDirectChildren(cat, cur)
        .sort((a, b) => treeRowOf(cat, a) - treeRowOf(cat, b))
        .forEach(walk);
    };
    walk(id);
    return out;
  }
  function treeIsDescendant(cat, maybeChildId, id) {
    if (!maybeChildId || maybeChildId === id) return false;
    return treeSubtreeIds(cat, id).indexOf(maybeChildId) > 0;
  }
  function treeMaxRow(cat) {
    const t = treeOf(cat);
    if (!t) return 0;
    return Object.keys(t.nodes).reduce((m, id) => Math.max(m, Math.max(0, Math.floor(Number(t.nodes[id].row) || 0))), 0);
  }
  function treeShiftSubtree(cat, id, delta) {
    treeSubtreeIds(cat, id).forEach((x) => {
      const n = cat.tree.nodes[x];
      if (n) n.row = Math.max(0, Math.floor(Number(n.row) || 0) + delta);
    });
  }
  /* 只挪子树（不含自己）：自己已经落好行号时用这个，别整棵再挪一遍 */
  function treeShiftDescendants(cat, id, delta) {
    treeSubtreeIds(cat, id)
      .filter((x) => x !== id)
      .forEach((x) => {
        const n = cat.tree.nodes[x];
        if (n) n.row = Math.max(0, Math.floor(Number(n.row) || 0) + delta);
      });
  }
  /* 子级行号必须 > 父级行号：不够就把整棵子树往下挪（跨行连线＝行号差，允许差很多） */
  function treeFixRows(cat) {
    const t = treeOf(cat);
    if (!t) return false;
    let changed = false;
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      Object.keys(t.nodes).forEach((id) => {
        const n = t.nodes[id];
        const p = n.parent ? t.nodes[n.parent] : null;
        if (!p) return;
        if (!treeChainOf(cat, id).length) return; // 成环的坏数据交给 treeNormalize 断开，这里别跟着往下推
        const need = Math.max(0, Math.floor(Number(p.row) || 0)) + 1;
        if (Math.floor(Number(n.row) || 0) < need) {
          treeShiftSubtree(cat, id, need - Math.floor(Number(n.row) || 0));
          moved = true;
        }
      });
      if (!moved) break;
      changed = true;
    }
    return changed;
  }
  /* 收尾：卡片没了 / 换类别的节点丢掉、父级指向不在树里的清成悬空、成环的断开、行号补齐 */
  function treeNormalize(cat) {
    const t = treeOf(cat);
    if (!t) return false;
    let changed = false;
    const mine = new Set(treeEntriesOfCat(cat).map((en) => en.id));
    Object.keys(t.nodes).forEach((id) => {
      if (!mine.has(id)) {
        delete t.nodes[id];
        changed = true;
      }
    });
    Object.keys(t.nodes).forEach((id) => {
      const n = t.nodes[id];
      n.row = Math.max(0, Math.floor(Number(n.row) || 0));
      n.parent = String(n.parent || "");
      if (!n.parent || !t.nodes[n.parent] || n.parent === id) {
        if (n.parent) changed = true;
        n.parent = "";
        return;
      }
      if (!treeChainOf(cat, id).length) {
        n.parent = "";
        changed = true;
      }
    });
    /* 「左移 / 右移」记下的显示顺序：只留还站在树顶的那些（卡片删了 / 换类别了自然掉出去） */
    if (Array.isArray(t.order)) {
      const keep = [];
      t.order.forEach((id) => {
        if (t.nodes[id] && !t.nodes[id].parent && keep.indexOf(id) < 0) keep.push(id);
      });
      if (keep.length !== t.order.length) {
        t.order = keep;
        changed = true;
      }
    }
    if (treeFixRows(cat)) changed = true;
    return changed;
  }
  function treeAddNode(cat, id, row, parent) {
    const t = treeOf(cat);
    const en = id ? getEntry(id) : null;
    if (!t || !en || en.categoryId !== cat.id) return null;
    const p = parent && t.nodes[parent] && parent !== id && !treeIsDescendant(cat, parent, id) ? parent : "";
    const r = Math.max(0, Math.floor(Number(row) || 0));
    t.nodes[id] = { row: p ? Math.max(r, treeRowOf(cat, p) + 1) : r, parent: p };
    return t.nodes[id];
  }
  /* 删节点：这个节点 + 它下方整棵子树的节点（卡片一张都不删） */
  function treeRemoveSubtree(cat, id) {
    const t = treeOf(cat);
    if (!t || !t.nodes[id]) return [];
    const ids = treeSubtreeIds(cat, id);
    ids.forEach((x) => delete t.nodes[x]);
    return ids;
  }
  function treePrintName(id) {
    const en = id ? getEntry(id) : null;
    return en ? String(en.name || "") : "";
  }
  /* 一棵树一个配色：按「根节点」在类别里的顺序分颜色（悬空的节点自己就是一棵树）。
     节点边框 / 名字和它那几条连线都用这个颜色，一眼分得出不同的树。 */
  /* 一棵树一个**鲜艳**色系：左侧色条 / 边框 / 连线同色（用户 2026-10-16） */
  const TREE_TONES = ["#4E8CE8", "#31C48D", "#E8579B", "#A46BE0", "#7C8CF8", "#3FA9F5", "#F5A623", "#E8563F"];
  /* F0 → FN 的层级渐变：同一棵树一个色相，越深越暗（往面板底色上混，最多压到 45%）。
     这样「哪一层」也能从颜色上看出来，深层的节点又不会亮得刺眼。 */
  function treeMixHex(hex, to, k) {
    const parse = (h) => {
      const raw = String(h == null ? "" : h).trim();
      /* 既能吃 #rrggbb / #rgb，也能吃自己上一步算出来的 rgb(r, g, b) */
      const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(raw);
      if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
      const s = raw.replace("#", "");
      const n = parseInt(s.length === 3 ? s.replace(/(.)/g, "$1$1") : s, 16);
      return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [141, 160, 203];
    };
    const a = parse(hex);
    const b = parse(to);
    const t = Math.max(0, Math.min(1, k));
    /* 一律回十六进制：不透明，也不怕别处把它当成带 alpha 的颜色（用户 2026-10-16：节点别透明） */
    return (
      "#" +
      a
        .map((v, i) => Math.round(v + (b[i] - v) * t))
        .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  const TREE_TONE_MAX = 0.8; // 最深那一层固定往底色里压 80%（用户 2026-10-15）
  const TREE_TONE_LIGHT = 0.22; // 最浅那一层往白里混这么多，F0 更浅一点
  function treeMixTone(base, k) {
    return k > 0 ? treeMixHex(base, "#12141a", k) : base;
  }
  /* 一棵树的「最浅 / 最深」两层：根那一层最浅，**这棵树里行号最大的那层（FN）最深**，
     中间逐层均分 —— 树深树浅都会铺满 0 → 45% 这段，不会早早压到上限就平了。 */
  let treeToneMemo = new Map();
  function treeToneSpanOf(cat, rootId) {
    const key = cat.id + "|" + rootId;
    const hit = treeToneMemo.get(key);
    if (hit) return hit;
    const rows = treeSubtreeIds(cat, rootId).map((x) => treeRowOf(cat, x));
    const span = {
      min: Math.min.apply(null, rows.concat([0])),
      max: Math.max.apply(null, rows.concat([0])),
    };
    treeToneMemo.set(key, span);
    return span;
  }
  function treeRootOrder(cat) {
    const t = treeOf(cat);
    if (!t) return [];
    return treeEntriesOfCat(cat)
      .map((en) => en.id)
      .filter((id) => t.nodes[id] && !t.nodes[id].parent);
  }
  /* 树的左右显示顺序＝布局用的横向次序。默认按卡片顺序，右键「左移 / 右移」换的是这一串；
     它**只影响横向摆位**：层级、父子关系、树内的拓扑、卡片自己的次序都不动。
     还没记进 order 的树（比如刚拖进栏的那张卡）按卡片顺序接在右边。 */
  function treeDisplayOrder(cat) {
    const roots = treeRootOrder(cat);
    const t = treeOf(cat);
    const seq = [];
    (t && Array.isArray(t.order) ? t.order : []).forEach((id) => {
      if (roots.indexOf(id) >= 0 && seq.indexOf(id) < 0) seq.push(id);
    });
    roots.forEach((id) => {
      if (seq.indexOf(id) < 0) seq.push(id);
    });
    return seq;
  }
  function treeRootOf(cat, id) {
    const chain = treeChainOf(cat, id);
    return chain.length ? chain[0] : id;
  }
  function treeToneOf(cat, id) {
    const roots = treeRootOrder(cat);
    const root = treeRootOf(cat, id);
    const i = roots.indexOf(root);
    /* 用户给这棵树指定过颜色就用它（右键「更改颜色」），否则按根节点顺序取色板 */
    const custom = ensureCatTree(cat).tones && ensureCatTree(cat).tones[root];
    const base = custom || TREE_TONES[(i < 0 ? 0 : i) % TREE_TONES.length];
    const span = treeToneSpanOf(cat, root);
    const range = Math.max(1, span.max - span.min);
    const t = Math.min(1, Math.max(0, (treeRowOf(cat, id) - span.min) / range));
    /* 两头都留了余量：最浅＝原色掺一点白，最深＝往面板底色压 80%，中间线性过渡 */
    const light = treeMixHex(base, "#ffffff", TREE_TONE_LIGHT * (1 - t));
    return treeMixTone(light, TREE_TONE_MAX * t);
  }
    /* 节点**底色**的层级渐变：F0 是一块明显带色的浅底（压暗 25%），越往下压得越狠，
     最下面那一层（FN）固定压到 72%（比纯黑亮一点，用户 2026-10-16）。 */
  function treePlateOf(cat, id) {
    const root = treeRootOf(cat, id);
    const span = treeToneSpanOf(cat, root);
    const range = Math.max(1, span.max - span.min);
    const t = Math.min(1, Math.max(0, (treeRowOf(cat, id) - span.min) / range));
    /* 底色整体比界面背景**更深一档**：顶层压 45%、越往下越深（FN 70%），全程不透明 */
    return treeMixHex(treeToneOf(cat, id), "#000000", 0.45 + 0.25 * t);
  }
  /* 连线的颜色**不做层级渐变**：一棵树就一个固定色（用户 2026-10-15） */
  function treeEdgeToneOf(cat, id) {
    const roots = treeRootOrder(cat);
    const root = treeRootOf(cat, id);
    const i = roots.indexOf(root);
    const custom = ensureCatTree(cat).tones && ensureCatTree(cat).tones[root];
    return custom || TREE_TONES[(i < 0 ? 0 : i) % TREE_TONES.length];
  }
  /* 横向布局＝经典「无交叉树」：每一棵子树占一段**连续且互不重叠**的横向区间，
     子节点按顺序从左往右铺在自己那段里，父节点坐在子节点区间的正中间。
     这样任何两条父子连线都不会交叉，也不会穿过别人家的节点（用户 2026-10-16：auto-tidy 要避免交叉）。 */
  const TREE_NODE_W = 96; // 兜底宽度（真实宽度按内容量出来，见 treeMeasureWidths）
  const TREE_NODE_GAP = 10;
  /* 布局：每棵子树占一段**连续、互不重叠**的横向区间（子节点依次铺满、父节点居中压在上面），
     宽度按**实际量出来的**节点宽度算 —— 所以节点是宽是窄都不会互相压到（用户 2026-10-16）。 */
  function treeLayout(cat, widthOf) {
    const t = treeOf(cat);
    const out = { x: new Map(), band: new Map(), width: TREE_NODE_W };
    if (!t) return out;
    const wOf = (id) => Math.max(40, Math.round((widthOf && widthOf(id)) || TREE_NODE_W));
    const order = treeEntriesOfCat(cat).map((en) => en.id);
    const orderIdx = new Map(order.map((id, i) => [id, i]));
    const byCard = (a, b) => (orderIdx.get(a) || 0) - (orderIdx.get(b) || 0);
    /* 树与树的横向次序走 treeDisplayOrder（右键「左移 / 右移」换的就是它）；
       树内的子节点次序还是按卡片顺序，两回事。 */
    const roots = treeDisplayOrder(cat);
    /* ① 量每棵子树占多少 px（叶子＝自己的宽度；父节点＝子节点之和 + 缝，至少自己那么宽） */
    const span = new Map();
    const measure = (id) => {
      if (span.has(id)) return span.get(id);
      const kids = treeDirectChildren(cat, id).sort(byCard);
      const w = kids.length
        ? Math.max(wOf(id), kids.reduce((s, k) => s + measure(k), 0) + TREE_NODE_GAP * (kids.length - 1))
        : wOf(id);
      span.set(id, w);
      return w;
    };
    roots.forEach(measure);
    /* ② 摆位置：区间连续，子节点依次铺满，父节点居中压在子区间上 */
    const place = (id, bi, left) => {
      const w = span.get(id) || wOf(id);
      const kids = treeDirectChildren(cat, id).sort(byCard);
      let x;
      if (!kids.length) {
        x = left + (w - wOf(id)) / 2;
      } else {
        let cur = left;
        kids.forEach((kid) => {
          place(kid, bi, cur);
          cur += (span.get(kid) || wOf(kid)) + TREE_NODE_GAP;
        });
        const first = out.x.get(kids[0]) + wOf(kids[0]) / 2;
        const lastKid = kids[kids.length - 1];
        const last = out.x.get(lastKid) + wOf(lastKid) / 2;
        x = (first + last) / 2 - wOf(id) / 2;
      }
      out.x.set(id, Math.max(left, x));
      out.band.set(id, bi);
      return w;
    };
    let cursor = 0;
    roots.forEach((rootId, bi) => {
      const w = span.get(rootId) || wOf(rootId);
      place(rootId, bi, cursor);
      cursor += w + TREE_NODE_GAP * 2.5; // 树与树之间空一点，免得看着像同一棵
    });
    let right = TREE_NODE_W;
    out.x.forEach((x) => {
      right = Math.max(right, x + TREE_NODE_W);
    });
    out.width = Math.ceil(Math.max(cursor, right) + 2);
    return out;
  }
  function treeStackNames(cat, id) {
    return treeChainOf(cat, id).map(treePrintName).filter(Boolean).join(" › ");
  }
  function treeRowLabel(row) {
    return "F" + Math.max(0, Math.floor(Number(row) || 0));
  }

  /* ---------- 悬浮气泡里的「详细卡面信息」：名字 + 有值的字段 + 关联人物 ---------- */
  function treeNodeTipText(cat, id) {
    const en = getEntry(id);
    if (!en) return "";
    const cut = (s, n) => {
      const v = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      return v.length > n ? v.slice(0, n) + "…" : v;
    };
    const lines = [String(en.name || "")];
    (en.fields || [])
      .filter((f) => f && String(f.value || "").trim())
      .slice(0, 5)
      .forEach((f) => lines.push(cut(f.label || "", 14) + "：" + cut(f.value, 40)));
    if (String(en.summary || "").trim()) lines.push(cut(en.summary, 60));
    /* 关联人物已经不写在气泡里了：节点上就有「圈圈 + 名字」（用户 2026-10-16） */
    return lines.join("\n");
  }

  /* ---------- 设置里的草稿（和「追加功能 → 雷达图」同一套：点保存才作数） ---------- */
  const treeDraft = {};
  function treeDraftOf(cat) {
    if (!cat) return null;
    if (!treeDraft[cat.id]) treeDraft[cat.id] = { feature: catTreeFeatureOn(cat) };
    return treeDraft[cat.id];
  }
  function treeDraftApply() {
    Object.keys(treeDraft).forEach((catId) => {
      const cat = getCat(catId);
      if (!cat) return;
      const t = ensureCatTree(cat);
      t.feature = !!treeDraft[catId].feature && catSupportsTree(cat);
    });
  }
  function treeDraftClear() {
    Object.keys(treeDraft).forEach((k) => delete treeDraft[k]);
  }

  /* ---------- 面板：一行一个层级，节点只写名字，父子之间画细引线 ---------- */
  /* linkPick＝单节点「关联到…」的监听状态（存那张卡 id）；batchPick＝批量「关联到…」的监听状态。
     两个状态都靠「点树上的节点＝完成关联、Esc＝退出」这一套，见 pickTreeLink / pickTreeBatchLink。 */
  const treePaneState = { sel: new Set(), linkPick: null, batchPick: false, hoverTarget: "", batch: false };
  function treePane() {
    return $("#tree-pane");
  }
  function treeSelectedIds() {
    return Array.from(treePaneState.sel).filter((id) => treeInTree(treeCat(), id));
  }
  function treeCat() {
    return getCat(selectedCategoryId);
  }
  function treeRowOrder(cat) {
    return treeEntriesOfCat(cat).map((en) => en.id);
  }
  function treeNodeHtml(cat, id) {
    const en = getEntry(id);
    if (!en) return "";
    const sel = treePaneState.sel.has(id);
    /* 「关联到…」监听状态：能当父级的节点亮起来（can-link），其余的灰掉禁用（no-link） */
    const pickTarget = treePickAllowed ? (treePickAllowed.has(id) ? " can-link" : " no-link") : "";
    /* 上传过图片的卡片：节点底色就用那张图（和条目卡面同一套处理：铺满 + 压暗 + 轻微模糊） */
    const bg = en.image
      ? `<span class="entry-bg tree-node-bg" style="background-image:url(&quot;${esc(en.image)}&quot;)"></span>`
      : "";
    /* 标签（和卡面同款）＋ 关联人物（圈圈 + 名字），都写进节点里（用户 2026-10-16） */
    const tags = (en.tags || []).filter(Boolean).slice(0, 3);
    const chars = (en.characterIds || [])
      .map((id) => getChar(id))
      .filter(Boolean)
      .slice(0, 4);
    /* 标签跟名字同一行；关联人物单独一行（用户 2026-10-16） */
    const meta = chars.length
      ? `<span class="tree-node-meta">${chars
          .map(
            (c) => `<span class="event-char-chip" data-char-id="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}</span>`
          )
          .join("")}</span>`
      : "";
    const tagHtml = tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    return `<div class="tree-node${sel ? " sel" : ""}${pickTarget}${en.image ? " has-bg" : ""}" data-node-id="${esc(id)}" draggable="true" style="--tree-tone:${esc(
      treeToneOf(cat, id)
    )};--tree-bg:${esc(treePlateOf(cat, id))};background:${esc(treePlateOf(cat, id))};left:0px">${bg}<span class="tree-node-title-row"><span class="tree-node-name">${esc(
      en.name || ""
    )}</span>${tagHtml}</span>${meta}</div>`;
  }
  function renderTreePanel() {
    const pane = treePane();
    if (!pane) return;
    const cat = treeCat();
    const show = !!(cat && catTreeOn(cat));
    pane.hidden = !show;
    const handle = $("#pane-handle-tree");
    if (handle) handle.hidden = !show;
    if (!show) {
      treePaneState.sel.clear();
      treePaneState.linkPick = null;
      treePaneState.batchPick = false;
      treePaneState.batch = false; // 换类别 / 藏起来＝退出批量
      return;
    }
    if (typeof applyPaneState === "function") applyPaneState();
    treeNormalize(cat);
    /* 选中的卡片已经被删 / 换类别：自动退出多选 */
    Array.from(treePaneState.sel).forEach((id) => {
      if (!treeInTree(cat, id)) treePaneState.sel.delete(id);
    });
    renderTreeRows();
  }
  function renderTreeRows() {
    const cat = treeCat();
    const box = $("#tree-rows");
    if (!box || !cat || !catTreeOn(cat)) return;
    const t = ensureCatTree(cat);
    treeToneMemo = new Map(); // 行号可能变了：这棵树的「最深处」重算一次
    /* 「关联到…」监听状态：先把这次能点的节点算出来（其余的在节点上灰掉） */
    treePickAllowed = null;
    if (treePickActive()) {
      const pickIds = treePickIds();
      treePickAllowed = new Set(treeParentCandidates(cat, pickIds).map((en) => en.id));
    }
    const rows = treeMaxRow(cat) + 1; // 末尾再留一行：往这一行拖＝在更深的层级放一个节点
    const order = treeRowOrder(cat);
    const byRow = new Map();
    order.forEach((id) => {
      if (!t.nodes[id]) return;
      const r = Math.max(0, Math.floor(Number(t.nodes[id].row) || 0));
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(id);
    });
    let html = "";
    for (let r = 0; r <= rows; r++) {
      const list = byRow.get(r) || [];
      const isTail = r === rows;
      html += `<div class="tree-row${isTail ? " tree-row-tail" : ""}" data-row="${r}">
        <span class="tree-row-label">${treeRowLabel(r)}</span>
        <button type="button" class="tree-add" data-add-row="${r}" title="${esc(uiTextFor("新建节点"))}">＋</button>
        <div class="tree-row-nodes"><div class="tree-grid">${list
        .map((id) => treeNodeHtml(cat, id))
        .join("")}</div></div>
      </div>`;
    }
    box.innerHTML = html;
    bindTreeNodes();
    treeFitRowHeights();
    treeApplyLayout(); // 量出每张节点的实际宽度，再按宽度排版（节点宽度自适应）
    applyTreeRowGap();
    drawTreeEdges();
    /* 刚插进 DOM 时量到的位置可能还差一点点（字体 / 滚动条刚生效）：
       下一帧再画一次，线就不会看着「没对准 / 断了」。 */
    requestAnimationFrame(() => drawTreeEdges());
    setTimeout(() => drawTreeEdges(), 120);
    renderTreeBar();
    if (treePaneState.linkPick) paintTreeLinkPick();
  }
  /* 边：父节点底边中点 → 竖 → 横 → 子节点顶边中点（和势力分析那套折线一个意思） */
  function drawTreeEdges() {
    const cat = treeCat();
    const box = $("#tree-rows");
    if (!box || !cat) return;
    /* 引线画在一张铺满 rows 的 SVG 上（行是每次重画的，这里顺手把它补上） */
    let svg = box.querySelector(".tree-edges");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "tree-edges");
      svg.setAttribute("aria-hidden", "true");
      box.insertBefore(svg, box.firstChild);
    }
    svg.setAttribute("width", String(Math.max(1, box.scrollWidth)));
    svg.setAttribute("height", String(Math.max(1, box.scrollHeight)));
    /* 用**排版坐标**（offsetLeft / offsetTop 一路加到 #tree-rows）而不是 getBoundingClientRect：
       界面缩放（html zoom）下 rect 是放大过的、SVG 的宽高是没放大的，两边一混线就会错位 / 断开（用户 2026-10-16）。 */
    const relOf = (el) => {
      let x = 0;
      let y = 0;
      let n = el;
      let guard = 0;
      while (n && n !== box && guard++ < 12) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent;
      }
      return { l: x, t: y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2 };
    };
    /* 直接画「父节点 ↔ 子节点」的直线：折线在多列多行的树里会和别的线重合，
       看着像连错了人（用户 2026-10-15 要求）。
       一条线归它那棵树的颜色：按树分组，每棵树一条 path。 */
    const byTone = new Map();
    const rectOf = relOf;
    /* 同一个父节点的线从它底边**不同的点**出发（按子节点的左右顺序摊开），
       这样几根线不会先叠在一起再分开 —— 叠着的那一小段最容易看着像连错人。 */
    box.querySelectorAll(".tree-node").forEach((el) => {
      const id = el.dataset.nodeId;
      const n = treeNodeOf(cat, id);
      if (!n || !n.parent) return;
      const pEl = box.querySelector(`.tree-node[data-node-id="${n.parent}"]`);
      if (!pEl) return;
      const kids = treeDirectChildren(cat, n.parent)
        .map((kid) => box.querySelector(`.tree-node[data-node-id="${kid}"]`))
        .filter(Boolean)
        .sort((a, b) => rectOf(a).l - rectOf(b).l);
      const idx = kids.indexOf(el);
      const a = rectOf(pEl);
      const b = rectOf(el);
      const n2 = Math.max(1, kids.length);
      const x1 = kids.length > 1 ? a.l + (a.w * (idx + 1)) / (n2 + 1) : a.cx;
      const y1 = a.t + a.h;
      const x2 = b.cx;
      const y2 = b.t;
      const tone = treeEdgeToneOf(cat, id); // 连线固定色，不跟层级渐变
      if (!byTone.has(tone)) byTone.set(tone, "");
      byTone.set(tone, byTone.get(tone) + `M ${x1} ${y1} L ${x2} ${y2} `);
    });
    svg.innerHTML = Array.from(byTone.entries())
      .map(([tone, d]) => `<path d="${d}" style="stroke:${esc(tone)}" />`)
      .join("");
  }
  /* 行距自适应：竖向有空就松一点（最多 26px），挤了就收到最小 10px */
  /* 节点高矮不一（标签 / 人物行数不同）：量一遍，把每行的网格撑到最高的那张卡那么高 */
  /* 量出每张节点的实际宽度 → 按宽度重新排版 → 写回 left / 每行宽度（节点宽度自适应） */
  function treeApplyLayout() {
    const cat = treeCat();
    const box = $("#tree-rows");
    if (!cat || !box) return;
    const widthOf = (id) => {
      const el = box.querySelector(`.tree-node[data-node-id="${id}"]`);
      return el ? el.offsetWidth : TREE_NODE_W;
    };
    const layout = treeLayout(cat, widthOf);
    Object.keys(ensureCatTree(cat).nodes).forEach((id) => {
      const el = box.querySelector(`.tree-node[data-node-id="${id}"]`);
      if (el && layout.x.has(id)) el.style.left = Math.round(layout.x.get(id)) + "px";
    });
    const w = Math.ceil(Math.max(40, layout.width || 0));
    box.querySelectorAll(".tree-grid").forEach((g) => {
      g.style.width = w + "px";
    });
  }
  function treeFitRowHeights() {
    $$("#tree-rows .tree-grid").forEach((grid) => {
      let h = 28;
      Array.from(grid.children).forEach((el) => {
        h = Math.max(h, el.offsetHeight || 0);
      });
      grid.style.height = Math.round(h) + "px";
      grid.dataset.nodeH = String(Math.round(h));
    });
  }
  function applyTreeRowGap() {
    const rows = $("#tree-rows");
    if (!rows) return;
    const n = rows.querySelectorAll(".tree-row").length || 1;
    const stage = rows.closest(".tree-stage");
    const avail = stage ? stage.clientHeight - 26 : 0;
    const nodeH = 28;
    let gap = 10;
    if (n > 1 && avail > 0) gap = Math.max(10, Math.min(26, (avail - n * nodeH) / (n - 1)));
    rows.style.setProperty("--tree-row-gap", Math.round(gap) + "px");
  }
  function renderTreeBar() {
    const cat = treeCat();
    const bar = $("#tree-bar");
    const host = $("#tree-pane");
    if (!bar || !host) return;
    const ids = treeSelectedIds();
    /* 「关联」「删除节点」这些只在批量模式下露出来（用户 2026-10-16）：
       右上角先点「批量」，进入批量才看到它们；再点一下「批量」退出、顺手清空选中。 */
    const picking = treePickActive();
    /* 监听状态里不再露出别的按钮（用户 2026-10-16）：要干别的先结束「关联到…」。
       单节点那条流程本来就不在批量里，这里顺手把批量条一并收起来。 */
    bar.hidden = !treePaneState.batch || !!treePaneState.linkPick;
    const batchBtn = $("#tree-batch-btn");
    if (batchBtn) {
      /* 批量模式下这颗按钮变成「退出」（Esc 也能退出，见下面的键盘处理） */
      batchBtn.hidden = picking;
      batchBtn.classList.toggle("btn-primary", !!treePaneState.batch);
      batchBtn.textContent = treePaneState.batch ? uiTextFor("退出") : uiTextFor("批量");
      batchBtn.title = treePaneState.batch ? uiTextFor("退出批量（也可以按 Esc）") : uiTextFor("批量：勾选多个节点后一起关联 / 删除节点（再点一下退出）");
    }
    const tidyBtn = $("#tree-tidy-btn");
    if (tidyBtn) {
      /* 监听中不露出来（和「批量」「删除节点」一个规矩：要干别的先结束「关联到…」） */
      tidyBtn.hidden = picking;
      tidyBtn.textContent = uiTextFor("整理重排");
      tidyBtn.title = uiTextFor("树根回到 F0、子级紧贴父级、压掉空行（不动上下级关系）");
      /* 一个节点都没进树时没东西可排：灰掉（和系谱那颗「整理重排」一个规矩） */
      tidyBtn.disabled = !cat || !Object.keys((treeOf(cat) || { nodes: {} }).nodes || {}).length;
    }
    const count = $("#tree-sel-count");
    if (count) count.textContent = uiTextFor("已选") + " " + ids.length;
    const unlinkBtn = $("#tree-unlink-btn");
    if (unlinkBtn) {
      /* 勾的这些节点一个上级都没有时，没东西可摘：直接灰掉（用户 2026-10-16） */
      unlinkBtn.textContent = uiTextFor("悬空");
      unlinkBtn.disabled = !ids.some((id) => {
        const n = treeNodeOf(cat, id);
        return !!(n && n.parent);
      });
      unlinkBtn.title = uiTextFor("把选中的节点从上级摘下来（不删节点）");
    }
    const cands = ids.length ? treeParentCandidates(cat, ids) : [];
    const linkBtn = $("#tree-link-btn");
    if (linkBtn) {
      linkBtn.textContent = uiTextFor("关联到") + "…";
      linkBtn.disabled = !ids.length || !cands.length;
      linkBtn.title = uiTextFor("点一个节点当上级（不能挂的会灰掉）· Esc 退出");
      /* 正在监听时这颗按钮保持「按下」的样子，一眼知道现在在等点节点 */
      linkBtn.classList.toggle("btn-primary", !!treePaneState.batchPick);
    }
    const delBtn = $("#tree-del-btn");
    if (delBtn) {
      delBtn.hidden = picking; // 监听中不许「干别的」
      delBtn.disabled = !ids.length;
    }
    const hint = $("#tree-link-hint");
    if (hint) hint.hidden = !picking;
    const noneBtn = $("#tree-link-none");
    if (noneBtn) noneBtn.hidden = !treePaneState.linkPick; // 单节点那条流程才用得上「悬空」
  }
  /* 「关联到…」的候选＝**树上的节点**里、能当这些卡片父级的那些：
     排除卡片自己，也排除「已经是其中任何一张的下级」的节点（挂上去就成环了）。
     用户 2026-10-16：关联改成「点树上的节点」完成，所以没进树的卡自然不在候选里。 */
  function treeParentCandidates(cat, ids) {
    const sel = new Set(ids);
    const blocked = new Set();
    (ids || []).forEach((id) => {
      if (treeInTree(cat, id)) treeSubtreeIds(cat, id).forEach((x) => blocked.add(x));
    });
    return treeEntriesOfCat(cat).filter((en) => treeInTree(cat, en.id) && !sel.has(en.id) && !blocked.has(en.id));
  }
  /* 正在「关联到…」的监听状态里吗（单节点 / 批量共用一套） */
  function treePickActive() {
    return !!treePaneState.linkPick || !!treePaneState.batchPick;
  }
  /* 这次要挂上去的是哪几张卡 */
  function treePickIds() {
    if (treePaneState.linkPick) return [treePaneState.linkPick];
    if (treePaneState.batchPick) return treeSelectedIds();
    return [];
  }
  /* 监听状态下的可点集合（＝会亮起来的节点；其余灰掉禁用）。每次重排时算一遍，见 renderTreeRows */
  let treePickAllowed = null;

  /* ---------- 交互：拖卡片进栏 / 拖节点 / 右键菜单 / 批量 / 点亮关联 ---------- */
  let treeDragId = "";
  let treeDropEl = null;
  function clearTreeDrop() {
    if (treeDropEl) treeDropEl.classList.remove("drop-on");
    $$("#tree-pane .tree-row").forEach((el) => el.classList.remove("drop-on"));
    treeDropEl = null;
  }
  function bindTreeNodes() {
    $$("#tree-pane .tree-node").forEach((el) => {
      const id = el.dataset.nodeId;
      /* 监听状态里被灰掉的那些：气泡就说清「为什么点不了」（自己那张卡照旧显示卡面信息） */
      const blocked =
        treePickAllowed && !treePickAllowed.has(id) && treePickIds().indexOf(id) < 0
          ? uiTextFor("不能挂到自己的下级节点里")
          : "";
      uiSetComposedTitle(el, blocked || treeNodeTipText(treeCat(), id));
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (treePickActive()) {
          if (treePaneState.batchPick) pickTreeBatchLink(id);
          else pickTreeLink(id);
          return;
        }
        /* 批量模式下点一下＝勾选 / 取消勾选；不在批量模式＝单选（给右键菜单 / 关联用） */
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey) treePaneState.batch = true; // 快捷键多选＝直接进批量模式（用户 2026-10-16）
        if (treePaneState.batch) {
          if (treePaneState.sel.has(id)) treePaneState.sel.delete(id);
          else treePaneState.sel.add(id);
        } else {
          treePaneState.sel.clear();
          treePaneState.sel.add(id);
        }
        renderTreeRows();
      });
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openEntryModal(id);
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        /* 右键＝另一套操作，先退出「关联到…」的监听状态 */
        treePaneState.linkPick = null;
        treePaneState.batchPick = false;
        treePaneState.sel.clear();
        treePaneState.sel.add(id);
        renderTreeRows();
        showTreeNodeMenu(ev.clientX, ev.clientY, id);
      });
      el.addEventListener("dragstart", (ev) => {
        treeDragId = id;
        el.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", "tree:" + id);
          } catch (e) {
            /* ignore */
          }
        }
      });
      el.addEventListener("dragend", () => {
        treeDragId = "";
        el.classList.remove("dragging");
        clearTreeDrop();
      });
    });
    $$("#tree-pane .tree-add").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openTreeAddPanel(Number(b.dataset.addRow) || 0, b);
      })
    );
  }
  function treeDraggingCard() {
    return typeof entryDragging !== "undefined" && entryDragging;
  }
  function bindTreePanel() {
    const pane = treePane();
    if (!pane || pane.dataset.treeBound === "1") return;
    pane.dataset.treeBound = "1";
    pane.addEventListener("click", (ev) => {
      if (ev.target.closest && ev.target.closest(".tree-node, .tree-add, .tree-bar")) return;
      if (treePickActive()) return; // 监听状态里点空白不做事（Esc 才退出）
      if (treePaneState.sel.size) {
        treePaneState.sel.clear();
        renderTreeRows();
      }
    });
    pane.addEventListener("dragover", (ev) => {
      const nodeEl = ev.target.closest ? ev.target.closest(".tree-node") : null;
      const rowEl = ev.target.closest ? ev.target.closest(".tree-row") : null;
      if (!nodeEl && !rowEl) return;
      if (!treeDraggingCard() && !treeDragId) return;
      ev.preventDefault();
      /* dropEffect 必须落在源元素给的 effectAllowed 里，否则浏览器会**取消这次 drop**
         （卡片拖动给的是 "move"，这里就别写 "copy"）。 */
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      const next = nodeEl || rowEl;
      if (treeDropEl && treeDropEl !== next) treeDropEl.classList.remove("drop-on");
      treeDropEl = next;
      treeDropEl.classList.add("drop-on");
    });
    pane.addEventListener("dragleave", (ev) => {
      if (!ev.relatedTarget || !pane.contains(ev.relatedTarget)) clearTreeDrop();
    });
    pane.addEventListener("drop", (ev) => {
      const nodeEl = ev.target.closest ? ev.target.closest(".tree-node") : null;
      const rowEl = ev.target.closest ? ev.target.closest(".tree-row") : null;
      if (!nodeEl && !rowEl) return;
      ev.preventDefault();
      ev.stopPropagation();
      const row = rowEl ? Number(rowEl.dataset.row) || 0 : 0;
      const overId = nodeEl ? nodeEl.dataset.nodeId : "";
      const movingId = treeDragId || "";
      clearTreeDrop();
      if (movingId) {
        treeDropNode(movingId, overId, row);
        return;
      }
      if (!treeDraggingCard()) return;
      const ids = entryDragIds && entryDragIds.length > 1 ? entryDragIds.slice() : [];
      if (!ids.length && typeof entryDragId !== "undefined" && entryDragId) ids.push(entryDragId);
      if (!ids.length) {
        try {
          const raw = ev.dataTransfer.getData("text/plain") || "";
          if (raw && raw.indexOf("tree:") !== 0) ids.push(raw);
        } catch (e) {
          /* ignore */
        }
      }
      treeAddCards(ids, overId, row);
    });
    /* 用**捕获**阶段：这样在处理 Ctrl+A 时能先拦住事件，别让「设定档案」那套全局快捷键
       顺手把左侧的条目卡片也全选上（用户 2026-10-16 报的：两处都被全选）。 */
    document.addEventListener("keydown", (ev) => {
      const pane = treePane();
      if (!pane || pane.hidden) return;
      /* Ctrl/Cmd+A＝全选树上的节点（再按一下＝取消），和别的界面一个规矩（用户 2026-10-16） */
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "a" || ev.key === "A")) {
        const ae = document.activeElement;
        if (ae && ae.closest && ae.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (document.querySelector(".modal-overlay:not([hidden]), .context-menu")) return;
        const cat = treeCat();
        if (!cat || !catTreeOn(cat)) return;
        const ids = Object.keys(ensureCatTree(cat).nodes);
        if (!ids.length) return;
        /* **只看指针 / 焦点在哪儿**：在拓扑栏上就全选节点，在左侧卡片列表上就让给那套全局全选
           （用户 2026-10-16：要分清楚监听，两边各管各的，不能一边把另一边吃掉）。 */
        const el2 =
          typeof shortcutPointer !== "undefined" && shortcutPointer
            ? document.elementFromPoint(shortcutPointer.x, shortcutPointer.y)
            : null;
        const inTree = (el2 && el2.closest && el2.closest("#tree-pane")) || pane.contains(ae);
        if (!inTree) return;
        ev.preventDefault();
        treePaneState.batch = true; // 全选自然也进批量模式
        ev.stopPropagation(); // 别再让全局 Ctrl+A 去选条目卡片
        const allOn = ids.every((id) => treePaneState.sel.has(id));
        if (allOn) treePaneState.sel.clear();
        else ids.forEach((id) => treePaneState.sel.add(id));
        renderTreeRows();
        showToast(allOn ? uiSentence("treeSelectNoneToast") : uiSentence("treeSelectAllToast", ids.length));
        return;
      }
      /* Enter 在监听状态里什么都不做（用户 2026-10-16：原来 Enter＝悬空很怪，取消） */
      if (ev.key !== "Escape") return;
      /* 有弹窗 / 右键菜单开着时，Esc 归它们管 */
      if (document.querySelector(".modal-overlay:not([hidden]), .context-menu")) return;
      /* 「关联到…」监听状态：Esc＝退出，不动任何数据 */
      if (treePickActive()) {
        ev.preventDefault();
        treePaneState.linkPick = null;
        treePaneState.batchPick = false;
        renderTreeRows();
        return;
      }
      /* 批量模式下 Esc＝退出批量（用户 2026-10-16） */
      if (treePaneState.batch) {
        ev.preventDefault();
        treePaneState.batch = false;
        treePaneState.sel.clear();
        renderTreeRows();
      }
    }, true);
    const noneBtn = $("#tree-link-none");
    if (noneBtn) noneBtn.addEventListener("click", () => pickTreeLink(""));
    /* 批量「悬空」：和上级的拓扑关系去掉（只动选中的这些，下级照旧挂着；卡片一张都不删） */
    const unlinkBtn = $("#tree-unlink-btn");
    if (unlinkBtn)
      unlinkBtn.addEventListener("click", () => {
        treePaneState.batchPick = false; // 要的是悬空，就别继续等点节点了
        const picked = treeSelectedIds();
        if (!treeDetachNodes(picked)) renderTreeRows();
      });
    const linkBtn = $("#tree-link-btn");
    /* 批量「关联到…」＝进入监听状态（不再弹候选面板）：接着点树上的哪个节点，
       选中的这批就挂到它下面；不能挂的节点会灰掉，Esc 退出（用户 2026-10-16）。 */
    if (linkBtn)
      linkBtn.addEventListener("click", () => {
        const ids = treeSelectedIds();
        if (!ids.length || !treeParentCandidates(treeCat(), ids).length) return;
        treePaneState.batchPick = true;
        renderTreeRows();
      });
    const delBtn = $("#tree-del-btn");
    if (delBtn) delBtn.addEventListener("click", applyTreeBatchDelete);
    const batchBtn = $("#tree-batch-btn");
    if (batchBtn)
      batchBtn.addEventListener("click", () => {
        treePaneState.batch = !treePaneState.batch;
        if (!treePaneState.batch) {
          treePaneState.sel.clear();
          treePaneState.batchPick = false; // 退出批量＝也别继续等点节点
        }
        renderTreeRows();
      });
    const tidyBtn = $("#tree-tidy-btn");
    if (tidyBtn) tidyBtn.addEventListener("click", () => treeTidyNow());
    /* 边栏改宽 / 界面缩放之后，节点位置会变 —— 跟着重画一次连线，别让线错位或者断开 */
    if (typeof ResizeObserver === "function") {
      const stage = $("#tree-rows");
      if (stage && !stage.__treeRO) {
        stage.__treeRO = new ResizeObserver(() => {
          applyTreeRowGap(); // 边栏变高变矮＝行距跟着自适应
          drawTreeEdges();
        });
        stage.__treeRO.observe(stage);
      }
    }
  }
  /* 把若干张卡片放到树上：落节点上＝成为它的子级；落某一行＝在这一行悬空 */
  function treeAddCards(ids, overId, row) {
    const cat = treeCat();
    if (!cat || !catTreeOn(cat)) return;
    const list = (ids || []).filter((id) => {
      const en = getEntry(id);
      return en && en.categoryId === cat.id;
    });
    if (!list.length) return;
    const parent = overId && treeInTree(cat, overId) ? overId : "";
    let n = 0;
    list.forEach((id) => {
      const had = treeInTree(cat, id);
      const node = treeAddNode(cat, id, parent ? treeRowOf(cat, parent) + 1 : row, parent);
      if (node) n++;
      if (had && id === parent) return;
    });
    if (!n) return;
    treeNormalize(cat);
    pendingUndoLabel =
      n === 1
        ? uiSentence("treeAddNodeUndo", treePrintName(list[0]))
        : uiSentence("treeAddNodeUndoN", n);
    saveState();
    renderTreeRows();
    showToast(parent ? uiSentence("treeAddNodeChild", n, treePrintName(parent)) : uiSentence("treeAddNodeRow", n, treeRowLabel(row)));
  }
  /* 拖树上已有的节点：落节点上＝改父级；落某一行＝改行号（父子关系保留） */
  function treeDropNode(id, overId, row) {
    const cat = treeCat();
    if (!cat || !treeInTree(cat, id)) return;
    const t = ensureCatTree(cat);
    if (overId && overId !== id) {
      if (treeIsDescendant(cat, overId, id)) {
        showToast(uiTextFor("不能挂到自己的下级节点里"));
        return;
      }
      if (t.nodes[id].parent === overId) return;
      t.nodes[id].parent = overId;
      treeFixRows(cat);
      pendingUndoLabel = uiSentence("treeLinkUndo", treePrintName(id), treePrintName(overId));
      saveState();
      renderTreeRows();
      return;
    }
    const cur = treeRowOf(cat, id);
    const p = t.nodes[id].parent ? t.nodes[t.nodes[id].parent] : null;
    let want = Math.max(0, Math.floor(Number(row) || 0));
    if (p) want = Math.max(want, Math.max(0, Math.floor(Number(p.row) || 0)) + 1);
    if (want === cur) return;
    treeShiftSubtree(cat, id, want - cur);
    treeNormalize(cat);
    pendingUndoLabel = uiSentence("treeMoveRowUndo", treePrintName(id), treeRowLabel(want));
    saveState();
    renderTreeRows();
  }
  /* 右键「左移 / 右移」：把这一整棵树和它左 / 右相邻的那棵树换个**显示位置**。
     只换横向次序：层级、父子关系、树里的拓扑、卡片自己的次序一律不动。
     最左 / 最右那棵树对应的那一项在菜单里灰掉。可撤销。 */
  function treeMoveTreeSide(cat, id, dir) {
    const t = treeOf(cat);
    if (!t || !t.nodes[id]) return false;
    const seq = treeDisplayOrder(cat);
    const root = treeRootOf(cat, id);
    const i = seq.indexOf(root);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= seq.length) return false;
    const arr = seq.slice();
    arr[i] = seq[j];
    arr[j] = root;
    t.order = arr;
    treeNormalize(cat); // AUTO-TIDY：规整完再重排（下面 renderTreeRows 会重算横排与连线）
    pendingUndoLabel = uiSentence(dir < 0 ? "treeMoveLeftUndo" : "treeMoveRightUndo", treePrintName(root));
    saveState();
    renderTreeRows();
    return true;
  }
  /* 「整理重排」（用户 2026-10-17）：和系谱界面那颗「整理重排」一个意思，
     但只管**当前类别**这一栏 —— 只重算「行号」，一个父子关系都不动：
     ① 每棵树的根顶到 F0（原来挂在半空的树不再从上往下空几行）；
     ② 子级紧贴父级（父级 + 1）：跨了好几层的大跳收掉，连线不再是拉得很长的斜线；
     ③ 再把没人站的行号压掉（空层级），从 0 起算连续排。
     父子关系 / 横向次序（t.order 与 AUTO-TIDY 的横排）/ 颜色 / 卡片全都不动。
     返回有没有真的动过（没动就不写存档，省一条没用的撤销记录）。 */
  function treeRelayout(cat) {
    const t = cat ? treeOf(cat) : null;
    if (!t) return false;
    const ids = Object.keys(t.nodes);
    if (!ids.length) return false;
    /* ① 每个节点算它到自己那棵树根的深度：根＝0，子级＝父级 + 1 */
    const depth = new Map();
    const depthOf = (id, seen) => {
      if (depth.has(id)) return depth.get(id);
      const n = t.nodes[id];
      if (!n || seen.has(id)) {
        // 坏数据（自成一环）按 0 兜底；真正的断开交给 treeNormalize
        depth.set(id, 0);
        return 0;
      }
      seen.add(id);
      const d = n.parent && t.nodes[n.parent] ? depthOf(n.parent, seen) + 1 : 0;
      depth.set(id, d);
      return d;
    };
    ids.forEach((id) => depthOf(id, new Set()));
    /* ②③ 用到的深度从小到大排成 0..n-1 连续的行号：根自然落在 F0，空层级自然被压掉 */
    const used = Array.from(new Set(ids.map((id) => depth.get(id)))).sort((a, b) => a - b);
    const remap = new Map(used.map((d, i) => [d, i]));
    let changed = false;
    ids.forEach((id) => {
      const want = Math.max(0, Math.floor(remap.get(depth.get(id)) || 0));
      if (Math.floor(Number(t.nodes[id].row) || 0) !== want) {
        t.nodes[id].row = want;
        changed = true;
      }
    });
    if (!changed) return false;
    treeNormalize(cat); // 收尾：行号补齐 / 成环与越界的数据修正（AUTO-TIDY 的那一段）
    return true;
  }
  function treeTidyNow() {
    const cat = treeCat();
    if (!cat || !catTreeOn(cat)) return;
    if (!treeRelayout(cat)) {
      renderTreeRows(); // 本来就已经整整齐齐：也要收尾画一次
      return;
    }
    pendingUndoLabel = uiSentence("treeTidyUndo", cat.name || uiTextFor("未命名"));
    saveState();
    renderTreeRows();
  }
  /* 「悬空」：把选中的节点和上级之间的拓扑关系去掉 —— **只动它们自己**：
     下级照旧挂在它们下面、卡片一张都不删。单节点右键的「悬空」和批量条的「悬空」共用这里，
     做完照例跑一次 AUTO-TIDY（规整 + 重新横排 + 重画连线）。 */
  function treeDetachNodes(ids) {
    const cat = treeCat();
    const t = cat ? treeOf(cat) : null;
    if (!t) return false;
    const list = (ids || []).filter((id) => t.nodes[id] && t.nodes[id].parent);
    if (!list.length) return false;
    list.forEach((id) => {
      t.nodes[id].parent = "";
    });
    treeNormalize(cat);
    pendingUndoLabel =
      list.length === 1 ? uiSentence("treeUnlinkUndo", treePrintName(list[0])) : uiSentence("treeUnlinkManyUndo", list.length);
    saveState();
    renderTreeRows();
    return true;
  }
  /* ---------- 右键菜单：编辑 / 替换… / 关联到… / 删除节点 ---------- */
  /* 更改颜色＝改**这一整棵树**的配色（颜色本来就是按树根分的，用户 2026-10-16）：
     色板选一支，或者走「自定义颜色」的色环。可撤销。 */
  let treeColorPop = null;
  function closeTreeColorPop() {
    if (treeColorPop) {
      treeColorPop.remove();
      treeColorPop = null;
    }
    document.removeEventListener("mousedown", onTreeColorDocDown, true);
    document.removeEventListener("keydown", onTreeColorKey, true);
  }
  function onTreeColorDocDown(e) {
    if (treeColorPop && !treeColorPop.contains(e.target)) closeTreeColorPop();
  }
  /* Esc / Enter 都关掉色板（用户 2026-10-16） */
  function onTreeColorKey(e) {
    if (!treeColorPop) return;
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      closeTreeColorPop();
    }
  }
  function openTreeNodeColor(at, id) {
    const cat = treeCat();
    const t = cat ? ensureCatTree(cat) : null;
    if (!t || !t.nodes[id]) return;
    const rootId = treeRootOf(cat, id);
    if (!t.tones || typeof t.tones !== "object") t.tones = {};
    closeTreeColorPop();
    const pop = document.createElement("div");
    pop.className = "manage-color-pop";
    const cur = t.tones[rootId] || "";
    pop.innerHTML =
      TREE_TONES.map(
        (c) => `<span class="swatch${c === cur ? " selected" : ""}" data-color="${esc(c)}" style="background:${esc(c)}"></span>`
      ).join("") +
      `<span class="swatch rainbow${cur && TREE_TONES.indexOf(cur) < 0 ? " selected" : ""}" data-color="__custom__" title="${esc(
        uiTextFor("自定义颜色（色环 / RGB）")
      )}"${cur && TREE_TONES.indexOf(cur) < 0 ? ` style="box-shadow:0 0 0 2px ${esc(cur)}"` : ""}></span>`;
    document.body.appendChild(pop);
    treeColorPop = pop;
    /* 跟着鼠标走：放右下角，右下角放不下自动翻到左下（和右键菜单、气泡一个规矩） */
    placeFloatingAtCursor(pop, (at && at.x) || 0, (at && at.y) || 0, 12, 12);
    document.addEventListener("mousedown", onTreeColorDocDown, true);
    document.addEventListener("keydown", onTreeColorKey, true);
    const apply = (hex) => {
      t.tones[rootId] = hex;
      pendingUndoLabel = uiSentence("treeColorUndo", treePrintName(rootId));
      saveState();
      renderTreeRows();
      showToast(uiSentence("treeColorToast", treePrintName(rootId)));
    };
    pop.querySelectorAll(".swatch").forEach((s) =>
      s.addEventListener("click", () => {
        const v = s.dataset.color;
        if (v === "__custom__") {
          closeTreeColorPop();
          if (typeof openColorWheelPop === "function") openColorWheelPop(s, cur || TREE_TONES[0], (hex) => apply(hex));
          return;
        }
        closeTreeColorPop();
        apply(v);
      })
    );
  }
  function showTreeNodeMenu(x, y, id) {
    const cat = treeCat();
    const t = cat ? ensureCatTree(cat) : null;
    if (!cat || !t || !t.nodes[id]) return;
    hideContextMenu();
    const hasParent = !!t.nodes[id].parent;
    /* 「左移 / 右移」＝和相邻的那棵树换显示位置；哪一边没有相邻的树，哪一项就灰掉 */
    const seq = treeDisplayOrder(cat);
    const ti = seq.indexOf(treeRootOf(cat, id));
    const canLeft = ti > 0;
    const canRight = ti >= 0 && ti < seq.length - 1;
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      `<div class="context-menu-title">${esc(uiSentence("treeNodeMenuTitle", treePrintName(id)))}</div>` +
      `<div class="context-menu-item" data-act="edit"><span class="line-name">${esc(uiTextFor("编辑"))}</span></div>` +
      `<div class="context-menu-item" data-act="color"><span class="line-name">${esc(uiTextFor("更改颜色"))}…</span></div>` +
      `<div class="context-menu-item" data-act="replace"><span class="line-name">${esc(uiTextFor("替换"))}…</span></div>` +
      `<div class="context-menu-item" data-act="link"><span class="line-name">${esc(uiTextFor("关联到"))}…</span></div>` +
      `<div class="context-menu-item${canLeft ? "" : " disabled"}" data-act="move-left"><span class="line-name">${esc(
        uiTextFor("左移")
      )}</span></div>` +
      `<div class="context-menu-item${canRight ? "" : " disabled"}" data-act="move-right"><span class="line-name">${esc(
        uiTextFor("右移")
      )}</span></div>` +
      (hasParent
        ? `<div class="context-menu-item" data-act="unlink"><span class="line-name">${esc(uiTextFor("悬空"))}</span></div>`
        : "") +
      `<div class="context-menu-sep"></div>` +
      `<div class="context-menu-item danger" data-act="del"><span class="line-name">${esc(uiTextFor("删除节点"))}</span></div>`;
    document.body.appendChild(menu);
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", async (ev) => {
        /* 灰掉的项不响应（菜单也不收） */
        if (el.classList.contains("disabled")) return;
        hideContextMenu();
        const act = el.dataset.act;
        if (act === "edit") {
          openEntryModal(id);
        } else if (act === "color") {
          /* 用**鼠标位置**定位色板（菜单这时已经被收掉了，拿菜单项量位置会量到 0,0） */
          openTreeNodeColor({ x: ev.clientX, y: ev.clientY }, id);
        } else if (act === "replace") {
          await treeReplaceNode(id);
        } else if (act === "link") {
          treePaneState.linkPick = id;
          treePaneState.batchPick = false;
          renderTreeRows();
          /* 跟着抬头那行小字走：点节点就完成，没有 Enter 这一步了（用户 2026-10-16） */
          showToast(uiTextFor("点一个节点完成关联 · Esc 退出"));
        } else if (act === "unlink") {
          treeDetachNodes([id]);
        } else if (act === "move-left") {
          treeMoveTreeSide(cat, id, -1);
        } else if (act === "move-right") {
          treeMoveTreeSide(cat, id, 1);
        } else if (act === "del") {
          treeDeleteNodes([id]);
        }
      })
    );
  }
  /* 替换：输入框 + 匹配候选（程序自己的候选面板）；b 在树里且不是 A 的祖先 → 连子树移植到 A 的位置 */
  async function treeReplaceNode(id) {
    const cat = treeCat();
    if (!cat || !treeInTree(cat, id)) return;
    const t = ensureCatTree(cat);
    const cur = treePrintName(id);
    const val = await uiPrompt(
      uiTextFor("用哪张卡替换这个节点？"),
      cur,
      uiTextFor("替换节点"),
      {
        options: (v) => {
          const q = String(v || "").trim().toLowerCase();
          const upChain = new Set(treeChainOf(cat, id)); // 自己和自己的上级不能拿来替换（会成环）
          return treeEntriesOfCat(cat)
            .filter((en) => !upChain.has(en.id))
            .filter((en) => !q || String(en.name || "").toLowerCase().indexOf(q) >= 0 || !en.name)
            .slice(0, TREE_PICK_LIMIT)
            .map((en) => ({
              value: String(en.name || ""),
              label: treeInTree(cat, en.id)
                ? String(en.name || "") + " · " + treeRowLabel(treeRowOf(cat, en.id))
                : String(en.name || ""),
              id: en.id,
            }));
        },
      }
    );
    if (val == null) return;
    const want = String(val).trim();
    if (!want) return;
    const list = treeEntriesOfCat(cat).filter((en) => String(en.name || "").trim() === want);
    const other = list.find((en) => en.id !== id);
    if (!other) {
      showToast(uiTextFor("没找到这张卡"));
      return;
    }
    if (other.id === id) return;
    const otherNode = t.nodes[other.id];
    if (otherNode && treeChainOf(cat, id).indexOf(other.id) >= 0) {
      showToast(uiTextFor("不能挂到自己的下级节点里"));
      return;
    }
    const node = t.nodes[id];
    const parent = node.parent || "";
    const row = node.row;
    if (otherNode) {
      /* b 已经在树上：连它的子树一起挪到 A 的位置；
         A 原来的子节点改挂到 b 下面（和合并那条规则一致，别让它们断成孤儿）。 */
      if (treeSubtreeIds(cat, id).indexOf(other.id) >= 0) {
        showToast(uiTextFor("不能挂到自己的下级节点里"));
        return;
      }
      const myKids = treeDirectChildren(cat, id).filter((k) => k !== other.id);
      const delta = row - Math.max(0, Number(otherNode.row) || 0);
      delete t.nodes[id];
      t.nodes[other.id] = { row, parent };
      if (delta) treeShiftDescendants(cat, other.id, delta); // 自己已经落在 row 上，只带子级一起走
      myKids.forEach((k) => {
        const n = t.nodes[k];
        if (n && k !== other.id) n.parent = other.id;
      });
    } else {
      delete t.nodes[id];
      t.nodes[other.id] = { row, parent };
    }
    treeNormalize(cat);
    treePaneState.sel.clear();
    treePaneState.sel.add(other.id);
    pendingUndoLabel = uiSentence("treeReplaceUndo", cur, treePrintName(other.id));
    saveState();
    renderTreeRows();
  }
  function pickTreeLink(overId) {
    const cat = treeCat();
    const id = treePaneState.linkPick;
    if (!cat || !id || !treeInTree(cat, id)) {
      treePaneState.linkPick = null;
      renderTreeRows();
      return;
    }
    /* 头顶那颗「悬空」＝取消父级（Enter 不再兼这个活儿了） */
    if (!overId) {
      treePaneState.linkPick = null;
      treeDetachNodes([id]);
      return;
    }
    /* 灰掉的那些点不动，也**不退出**监听状态（继续等用户点一个能挂的） */
    if (!treePickAllowed || !treePickAllowed.has(overId)) return;
    treePaneState.linkPick = null;
    ensureCatTree(cat).nodes[id].parent = overId;
    treeFixRows(cat);
    treeNormalize(cat); // AUTO-TIDY
    pendingUndoLabel = uiSentence("treeLinkUndo", treePrintName(id), treePrintName(overId));
    saveState();
    renderTreeRows();
  }
  /* 批量「关联到…」的监听状态：点一个候选节点＝把勾选的这批复挂到它下面 */
  function pickTreeBatchLink(overId) {
    const cat = treeCat();
    const ids = treeSelectedIds();
    if (!cat || !ids.length || !overId) {
      treePaneState.batchPick = false;
      renderTreeRows();
      return;
    }
    if (!treePickAllowed || !treePickAllowed.has(overId)) return; // 灰掉的点不动
    treePaneState.batchPick = false;
    applyTreeLinkTo(overId);
  }
  function paintTreeLinkPick() {
    const pane = treePane();
    if (!pane) return;
    pane.classList.toggle("link-picking", treePickActive());
  }
  /* 把勾选的卡片挂到 parentId 下面（parentId 一定是树上的节点：候选就是树上的节点，见 treeParentCandidates） */
  function applyTreeLinkTo(parentId) {
    const cat = treeCat();
    const t = cat ? ensureCatTree(cat) : null;
    const ids = treeSelectedIds();
    if (!t || !parentId || !getEntry(parentId) || !ids.length) return;
    if (ids.indexOf(parentId) >= 0) return;
    if (!t.nodes[parentId]) return; // 兜底：父级必须已经在树上（以前会把没进树的卡顺手放进树，2026-10-16 删掉）
    const prow = treeRowOf(cat, parentId);
    let n = 0;
    ids.forEach((id) => {
      if (treeIsDescendant(cat, parentId, id)) return; // 兜底：不许成环
      if (!t.nodes[id]) t.nodes[id] = { row: prow + 1, parent: parentId };
      else t.nodes[id].parent = parentId;
      n++;
    });
    if (!n) return;
    treeFixRows(cat);
    treeNormalize(cat);
    treePaneState.sel.clear();
    pendingUndoLabel = uiSentence("treeLinkManyUndo", n, treePrintName(parentId));
    saveState();
    renderTreeRows();
    showToast(uiSentence("treeLinkManyToast", n, treePrintName(parentId)));
  }
  function treeDeleteNodes(ids) {
    const cat = treeCat();
    if (!cat) return;
    let n = 0;
    (ids || []).forEach((id) => {
      n += treeRemoveSubtree(cat, id).length;
    });
    if (!n) return;
    treePaneState.sel.clear();
    pendingUndoLabel = uiSentence("treeDeleteUndo", n);
    saveState();
    renderTreeRows();
    showToast(uiSentence("treeDeleteToast", n));
  }
  function applyTreeBatchDelete() {
    const ids = treeSelectedIds();
    if (!ids.length) return;
    /* 选中的里面有别人的子节点时，先删掉上面那个就不会重复删（外层删了内层跟着走） */
    const cat = treeCat();
    const top = ids.filter((id) => !ids.some((o) => o !== id && treeIsDescendant(cat, id, o)));
    treeDeleteNodes(top);
  }
  /* 「＋」：列出本类别里还没进树的卡片（带搜索）+ 新建卡片 */
  function openTreeAddPanel(row, anchor) {
    const cat = treeCat();
    if (!cat || !catTreeOn(cat)) return;
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu tree-add-menu";
    const free = treeEntriesOfCat(cat).filter((en) => !treeInTree(cat, en.id));
    menu.innerHTML =
      `<div class="context-menu-title">${esc(uiTextFor("放入") + " " + treeRowLabel(row))}</div>` +
      `<input type="text" class="tree-add-search" placeholder="${esc(uiTextFor("搜索卡片…"))}" />` +
      `<div class="tree-add-list">` +
      (free.length
        ? free.map((en) => `<div class="context-menu-item" data-pick="${esc(en.id)}"><span class="line-name">${esc(en.name || "")}</span></div>`).join("")
        : "") +
      `</div><div class="context-menu-sep"></div>` +
      `<div class="context-menu-item" data-new="1"><span class="line-name">${esc(uiTextFor("新建卡片"))}…</span></div>`;
    document.body.appendChild(menu);
    const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    placeFloatingAtCursor(menu, rect ? rect.left + rect.width : 200, rect ? rect.top + rect.height : 200, 6, 6);
    const input = menu.querySelector(".tree-add-search");
    if (input) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        menu.querySelectorAll("[data-pick]").forEach((el) => {
          const en = getEntry(el.dataset.pick);
          const hit = !q || String((en && en.name) || "").toLowerCase().indexOf(q) >= 0;
          el.hidden = !hit;
        });
      });
      setTimeout(() => input.focus(), 20);
    }
    menu.querySelectorAll("[data-pick]").forEach((el) =>
      el.addEventListener("click", () => {
        hideContextMenu();
        treeAddCards([el.dataset.pick], "", row);
      })
    );
    const newBtn = menu.querySelector("[data-new]");
    if (newBtn)
      newBtn.addEventListener("click", () => {
        hideContextMenu();
        treeNewCard(row);
      });
  }
  /* 从拓扑栏「＋ → 新建卡片」建卡：建完直接放进这一行 */
  function treeNewCard(row) {
    const before = new Set(treeEntriesOfCat(treeCat()).map((en) => en.id));
    openEntryModal(null);
    const done = () => {
      const cat = treeCat();
      if (!cat || !catTreeOn(cat)) return;
      const fresh = treeEntriesOfCat(cat).filter((en) => !before.has(en.id));
      if (!fresh.length) return;
      const t = ensureCatTree(cat);
      fresh.forEach((en) => {
        if (!t.nodes[en.id]) t.nodes[en.id] = { row: Math.max(0, Math.floor(row) || 0), parent: "" };
      });
      pendingUndoLabel = uiSentence("treeAddNodeUndo", fresh.map((en) => en.name).join("、"));
      saveState();
      renderTreeRows();
    };
    /* 新建条目的弹窗是异步关掉的：等它保存上再认这张新卡 */
    const modal = document.getElementById("entry-modal");
    if (!modal) return;
    const mo = new MutationObserver(() => {
      if (!modal.hidden) return;
      window.setTimeout(() => {
        mo.disconnect();
        done();
      }, 40);
    });
    mo.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* 边栏注册（可折叠 / 可拖宽）：和地图栏同一套，挂在右边、flip */
  /* ---------- 新建 / 编辑类别弹窗里的「追加功能」（和设置里那一栏一模一样，默认都不勾） ----------
     勾了「雷达图」＝下面出现雷达图设置栏（顶点名称 + 说明，可增删），保存时写进 cat.radar；
     勾了「树型拓扑」＝写进 cat.tree.feature。 */
  let catModalRadarAxes = null;
  function catModalRadarRowsHtml(axes) {
    return (axes || [])
      .map(
        (a, i) =>
          `<div class="radar-axis-row"><span class="radar-axis-no">${i + 1}</span><input type="text" class="radar-axis-label" data-catradar-name="${i}" value="${esc(
            a.label || ""
          )}" placeholder="${esc(uiTextFor("顶点名称"))}" /><input type="text" class="radar-axis-desc" data-catradar-desc="${i}" value="${esc(
            a.desc || ""
          )}" placeholder="${esc(uiTextFor("说明（可选）"))}" /><button type="button" class="icon-btn radar-axis-del" data-catradar-del="${i}" title="删除这个顶点（最少 1 个）">×</button></div>`
      )
      .join("");
  }
  function paintCatModalRadar() {
    const sub = $("#cat-radar-sub");
    const rows = $("#cat-radar-rows");
    const cb = $("#cat-addon-radar");
    if (!sub || !rows || !cb) return;
    sub.hidden = !cb.checked;
    if (!cb.checked) return;
    if (!Array.isArray(catModalRadarAxes) || !catModalRadarAxes.length)
      catModalRadarAxes = defaultRadarAxesFor(getCat($("#cat-id").value) || null).map((a) => Object.assign({}, a));
    const sig = catModalRadarAxes.length;
    if (rows.dataset.n !== String(sig)) {
      rows.dataset.n = String(sig);
      rows.innerHTML = catModalRadarRowsHtml(catModalRadarAxes);
    }
  }
  /* 打开弹窗时按类别把这一栏同步过来（新建＝两个都不勾、顶点用默认模板） */
  function syncCatModalAddons(cat) {
    const rCb = $("#cat-addon-radar");
    const tCb = $("#cat-addon-tree");
    if (!rCb || !tCb) return;
    const rOk = !cat || catSupportsRadar(cat);
    const tOk = !cat || catSupportsTree(cat);
    const rItem = $("#cat-addon-radar-item");
    if (rItem) rItem.hidden = !rOk;
    const treeItem = $("#cat-addon-tree-item");
    if (treeItem) treeItem.hidden = !tOk;
    $("#cat-addon-sub").hidden = !rOk && !tOk;
    const r = cat ? ensureCatRadar(cat) : null;
    rCb.checked = !!(cat && r.feature);
    tCb.checked = !!(cat && catTreeFeatureOn(cat));
    catModalRadarAxes = cat && Array.isArray(r.axes) ? r.axes.map((a) => Object.assign({}, a)) : null;
    $("#cat-radar-rows").dataset.n = "";
    paintCatModalRadar();
  }
  /* 保存时把这一栏写回类别（新建 / 编辑都走这里） */
  function applyCatModalAddons(cat) {
    if (!cat) return;
    const rCb = $("#cat-addon-radar");
    const tCb = $("#cat-addon-tree");
    const rItem2 = $("#cat-addon-radar-item");
    if (rCb && rItem2 && !rItem2.hidden) {
      const r = ensureCatRadar(cat);
      r.feature = !!rCb.checked;
      if (r.feature && Array.isArray(catModalRadarAxes) && catModalRadarAxes.length) {
        const kept = catModalRadarAxes
          .map((a, i) => ({
            key: a.key || "ax" + i,
            label: String(a.label || "").trim(),
            desc: String(a.desc || "").trim(),
          }))
          .filter((a) => a.label || a.desc);
        r.axes = kept.length ? kept : defaultRadarAxesFor(cat);
      }
    }
    if (tCb && !(($("#cat-addon-tree-item") || {}).hidden))
      ensureCatTree(cat).feature = !!tCb.checked && catSupportsTree(cat);
  }
  function bindCatModalAddons() {
    const rCb = $("#cat-addon-radar");
    if (!rCb || rCb.dataset.bound === "1") return;
    rCb.dataset.bound = "1";
    rCb.addEventListener("change", () => {
      if (rCb.checked && !catModalRadarAxes) {
        const cat = getCat($("#cat-id").value);
        catModalRadarAxes = defaultRadarAxesFor(cat).map((a) => Object.assign({}, a));
      }
      paintCatModalRadar();
    });
    const rows = $("#cat-radar-rows");
    if (rows)
      rows.addEventListener("input", (ev) => {
        const t = ev.target;
        if (!t.dataset) return;
        if (t.dataset.catradarName != null) {
          const a = catModalRadarAxes[parseInt(t.dataset.catradarName, 10)];
          if (a) a.label = t.value;
        } else if (t.dataset.catradarDesc != null) {
          const a = catModalRadarAxes[parseInt(t.dataset.catradarDesc, 10)];
          if (a) a.desc = t.value;
        }
      });
    if (rows)
      rows.addEventListener("click", (ev) => {
        const del = ev.target.closest ? ev.target.closest("[data-catradar-del]") : null;
        if (!del) return;
        catModalRadarAxes.splice(parseInt(del.dataset.catradarDel, 10), 1);
        if (!catModalRadarAxes.length) catModalRadarAxes.push({ key: uid(), label: "", desc: "" });
        rows.dataset.n = "";
        paintCatModalRadar();
      });
    const add = $("#cat-radar-add");
    if (add)
      add.addEventListener("click", () => {
        if (!Array.isArray(catModalRadarAxes)) catModalRadarAxes = [];
        catModalRadarAxes.push({ key: uid(), label: "", desc: "" });
        rows.dataset.n = "";
        paintCatModalRadar();
      });
  }
  if (typeof PANE_DEFS !== "undefined" && Array.isArray(PANE_DEFS))
    PANE_DEFS.push({ key: "tree", target: "#tree-pane", handle: "#pane-handle-tree", btn: "#pane-toggle-tree", label: "树型拓扑栏", flip: true });
  if (typeof PANE_RESIZE !== "undefined" && PANE_RESIZE)
    PANE_RESIZE.tree = { sel: "#tree-pane", min: 190, max: 900, flip: true };

  /* ---------- 卡片信息界面里只读地显示「上级 / 下级」（不给改，改层级去拓扑栏） ---------- */
  function syncEntryTreeRel(entryId) {
    const form = document.getElementById("entry-form");
    if (!form) return;
    const old = form.querySelector(".entry-tree-rel");
    if (old) old.remove();
    const cat = getCat(($("#entry-cat") || {}).value || "");
    const en = entryId ? getEntry(entryId) : null;
    if (!cat || !en || !catTreeOn(cat) || !treeInTree(cat, en.id)) return;
    const chip = (id) =>
      `<span class="tree-rel-chip" data-tree-open="${esc(id)}" title="${esc(uiTextFor("双击打开这个词条"))}">${esc(
        treePrintName(id) || ""
      )}</span>`;
    const up = treeNodeOf(cat, en.id).parent;
    const kids = treeDirectChildren(cat, en.id);
    const box = document.createElement("div");
    box.className = "field entry-tree-rel";
    box.innerHTML =
      `<span class="field-label">${esc(uiTextFor("拓扑"))}</span>` +
      /* 「上级」和「下级」放在同一行（用户 2026-10-16）；下级多的时候自己那一组里换行 */
      `<div class="tree-rel-row">` +
      `<span class="tree-rel-group"><span class="tree-rel-key">${esc(uiTextFor("上级"))}</span><span class="tree-rel-val">${
        up ? chip(up) : `<span class="tree-rel-none">${esc(uiTextFor("悬空"))}</span>`
      }</span></span>` +
      `<span class="tree-rel-group"><span class="tree-rel-key">${esc(uiTextFor("下级"))}</span><span class="tree-rel-val">${
        kids.length ? kids.map(chip).join("") : `<span class="tree-rel-none">${esc(uiTextFor("没有下级节点"))}</span>`
      }</span></span>` +
      `</div>`;
    const radar = form.querySelector(".gear-radar-card");
    const foot = form.querySelector(".modal-foot");
    if (radar) form.insertBefore(box, radar);
    else if (foot) form.insertBefore(box, foot);
    else form.appendChild(box);
    box.querySelectorAll("[data-tree-open]").forEach((el) => {
      /* 只有**双击**才打开那张卡（单击在卡片信息界面里容易误触，用户 2026-10-16） */
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openEntryModal(el.dataset.treeOpen);
      });
    });
  }

