  /* ================= 人物分析「系谱」（1.2.2） =================
     规格见 plan.md：**一个画布放多个家族**，不动人物信息卡。
       · 对象＝人物（同一个人只有一个对象），值里只存 row（第几代）
       · 结合线 union：父对象1 — 父对象2（一个人可以有多条＝多段婚姻；自己连自己无效禁用）
       · 世系线 descent：上端锚点＝结合线中点（父1≠父2）或单亲底边中点（父1=父2），下端＝子对象
     横向位置每次操作后 auto-tidy 自动排（**只排横向、不动行号**）；画布不缩放，超出用原生滚动条。
     本文件按 plan.md 第 9 节的顺序往上加：① 数据层 + 骨架（当前）② 画布与对象 ③ 排版与连线 ④ 结合线 ⑤ 世系线。 */
  /* ---------- 「系谱图」词条：一张图 = 一个 id + 名字 + 这一摊数据 ----------
     `state.pedigree = { charts: [{ id, name, nodes, unions, descents, order }] }`（当前是哪张存在界面状态里，
     和选项卡 id 一样，不进数据、不参与撤销）
     左边栏里可以新建 / 改名 / 删除；**下游代码全都只认 `ensurePedigree()`＝当前这张图**，
     所以画布那套（对象 / 结合线 / 世系线 / 排版）一行都不用改。 */
  let pedActiveChartId = ""; // 当前打开的那张（界面状态，跟着 state.ui 走）
  function pedCharts() {
    if (!state.pedigree || typeof state.pedigree !== "object" || Array.isArray(state.pedigree)) state.pedigree = {};
    const root = state.pedigree;
    /* 老存档（1.2.2 早期）：顶层直接是 nodes/unions/descents —— 搬成第一张图 */
    if (!Array.isArray(root.charts)) {
      const legacy = root.nodes || root.unions || root.descents || root.order ? root : null;
      const chart = legacy ? { id: uid(), name: "", nodes: legacy.nodes, unions: legacy.unions, descents: legacy.descents, order: legacy.order } : null;
      root.charts = chart ? [pedNormalizeChart(chart, 0)] : [];
      ["nodes", "unions", "descents", "order"].forEach((k) => delete root[k]);
      if (root.activeId) pedActiveChartId = root.activeId; // 更早那版把「当前哪张」存在数据里，搬到界面状态去
      delete root.activeId;
    }
    root.charts = root.charts.filter((c) => c && typeof c === "object");
    if (!root.charts.length) root.charts.push(pedNormalizeChart({ id: uid(), name: "" }, 0));
    root.charts.forEach((c, i) => pedNormalizeChart(c, i));
    return root.charts;
  }
  /* 把一张图补全：id / 名字（按新建时的语言给默认名）/ 四张表 */
  function pedNormalizeChart(c, idx) {
    if (!c.id) c.id = uid();
    if (typeof c.name !== "string" || !c.name) c.name = uiTextFor("系谱图") + " " + (Number(idx) + 1);
    if (!c.nodes || typeof c.nodes !== "object" || Array.isArray(c.nodes)) c.nodes = {};
    if (!Array.isArray(c.unions)) c.unions = [];
    if (!Array.isArray(c.descents)) c.descents = [];
    if (!Array.isArray(c.order)) c.order = [];
    return c;
  }
  function ensurePedigree() {
    const charts = pedCharts();
    /* 「当前是哪张图」是**界面状态**（跟选项卡一样），不进数据、不参与撤销 */
    let p = pedActiveChartId ? charts.find((c) => c.id === pedActiveChartId) : null;
    if (!p) p = charts[0];
    pedActiveChartId = p.id;
    if (!p.nodes || typeof p.nodes !== "object" || Array.isArray(p.nodes)) p.nodes = {};
    if (!Array.isArray(p.unions)) p.unions = [];
    if (!Array.isArray(p.descents)) p.descents = [];
    if (!Array.isArray(p.order)) p.order = [];
    return p;
  }
  function pedigree() {
    return ensurePedigree();
  }
  function pedNodeOf(id) {
    const p = ensurePedigree();
    return id && p.nodes[id] ? p.nodes[id] : null;
  }
  function pedInPedigree(id) {
    return !!pedNodeOf(id);
  }
  function pedRowOf(id) {
    const n = pedNodeOf(id);
    return n ? Math.max(0, Math.floor(Number(n.row) || 0)) : 0;
  }
  function pedMaxRow() {
    const p = ensurePedigree();
    let max = 0;
    Object.keys(p.nodes).forEach((id) => {
      max = Math.max(max, pedRowOf(id));
    });
    return max;
  }
  /* 收尾：人物库里没有的人（被删掉 / 合并掉）→ 对象清掉；**它的结合线一起清掉**；
     挂在那些结合线下面的**子对象保留、变成悬空**（世系线断掉）——照 plan.md 第 6 节。
     结合线的两端、世系线的两端都要在人物库里，坏数据一并清掉。 */
  function prunePedigree() {
    /* 每张系谱图都要清（别让「已经删掉的人物」留在其它图里） */
    let changed = false;
    pedCharts().forEach((c) => {
      if (prunePedigreeChart(c)) changed = true;
    });
    return changed;
  }
  function prunePedigreeChart(p) {
    const alive = new Set((state.characters || []).map((c) => c.id));
    let changed = false;
    Object.keys(p.nodes).forEach((id) => {
      if (!alive.has(id)) {
        delete p.nodes[id];
        changed = true;
      }
    });
    const droppedUnions = p.unions.filter((u) => !(u && u.id && alive.has(u.a) && alive.has(u.b) && u.a !== u.b));
    if (droppedUnions.length) changed = true;
    p.unions = p.unions.filter((u) => droppedUnions.indexOf(u) < 0);
    const seenUnion = new Set();
    p.unions = p.unions.filter((u) => {
      if (seenUnion.has(u.id)) {
        changed = true;
        return false;
      }
      seenUnion.add(u.id);
      return true;
    });
    const unionIds = new Set(p.unions.map((u) => u.id));
    const descents = [];
    const seenChild = new Set();
    p.descents.forEach((d) => {
      if (!d || !d.id || !alive.has(d.child) || !p.nodes[d.child]) {
        changed = true;
        return;
      }
      if (seenChild.has(d.child)) {
        changed = true; // 一个子对象只留一条世系线（坏数据里多出来的丢掉）
        return;
      }
      if (d.union) {
        if (!unionIds.has(d.union)) {
          /* 结合线没了（多半是端上的人被删了）：**还剩一个父 → 子卡变单亲**；两个都没了 → 子卡悬空 */
          const u = droppedUnions.find((x) => x && x.id === d.union);
          const aOk = u ? alive.has(u.a) && !!p.nodes[u.a] : false;
          const bOk = u ? alive.has(u.b) && !!p.nodes[u.b] : false;
          const survivor = aOk && bOk ? "" : aOk ? u.a : bOk ? u.b : "";
          changed = true;
          if (!survivor) return;
          d.union = "";
          d.parent = survivor;
          if (d.parent === d.child) return; // 兜底：重挂成自己了（坏数据）就当没这条线
        } else {
          d.parent = "";
        }
      } else {
        if (!d.parent || !alive.has(d.parent) || !p.nodes[d.parent] || d.parent === d.child) {
          changed = true;
          return;
        }
        d.union = "";
      }
      seenChild.add(d.child);
      descents.push(d);
    });
    p.descents = descents;
    return changed;
  }

  /* ---------- 尺寸 / 布局（auto-tidy：只排横向，行号＝代，绝不动） ---------- */
  const PED_R = 18; // 圈的半径（关系网那套的底径）
  const PED_ROW_H = 114; // 一代一行多高（圈下面还要写名字，留够）
  const PED_PAD_TOP = 46; // 第一代往下留一点（上面要给结合线的锚点腾地方）
  const PED_PAD_LEFT = 46; // 左边留给 F0 / F1 代小标
  const PED_PAD_RIGHT = 56;
  const PED_GAP = 30; // 同一代里两个圈之间的最小空隙
  const PED_STEM = 26; // 世系线那段竖线 / 结合线中点往下走的高度
  const SVG_NS = "http://www.w3.org/2000/svg";
  let pedSel = new Set(); // 选中的对象 / 线（对象存 charId，线存 "u:xxx" / "d:xxx"）
  let pedPick = null; // 监听状态：{ kind: "union" | "descent" | "unionEnd" | "descentChild" | "descentTop", ... }
  let pedDragRow = null; // 正在拖对象改代：{ id, y }
  let pedDragWire = null; // 正在拉线：{ kind, from, x, y }
  let pedHover = null; // 拉线时鼠标底下的目标

  /* ---------- 自适应缩放（用户 2026-10-16）----------
     边栏拖宽 / 窗口变化 / 换系谱图之后，整张图**等比缩**到能塞进画布：
     列宽、行高、圈、名字、线、手柄一起缩（缩放打在 SVG 上，内部排版坐标一点不用改）。
     最多缩到 PED_FIT_MIN；还塞不下就交给 .pedigree-stage 自己的滚动条（上下 / 左右都有）。 */
  const PED_FIT_MIN = 0.64; // 缩到极限 64%
  const PED_FIT_MARGIN = 8; // 留一点余量，免得卡在"刚好放下"上、来回出进滚动条
  const PED_FIT_PAD = 24; // .pedigree-canvas 的 padding 不跟着缩放（左右各 12）
  let pedFit = 1; // 当前这一屏的缩放
  let pedContent = { w: 0, h: 0 }; // 上一次排版出来的尺寸（重算缩放时不用重新排版）
  let pedFitRO = null;
  function pedFitFor(w, h) {
    const stage = $("#pedigree-stage");
    if (!stage || !w || !h) return 1;
    const availW = stage.clientWidth - PED_FIT_PAD - PED_FIT_MARGIN;
    const availH = stage.clientHeight - PED_FIT_PAD - PED_FIT_MARGIN;
    if (availW < 60 || availH < 60) return pedFit; // 还没量出来 / 界面收着：保持原样
    return Math.max(PED_FIT_MIN, Math.min(1, availW / w, availH / h));
  }
  function applyPedFit() {
    const stage = $("#pedigree-stage");
    if (!stage) return;
    /* 缩放打在舞台上，CSS 里 #pedigree-svg{zoom:var(--ped-fit,1)}：
       SVG 里的东西（含里面的文字）一起等比缩，滚动范围也跟着缩后的尺寸走 ——
       缩到极限还放不下，滚动条自己就出来了。 */
    const next = String(pedFit);
    if (stage.style.getPropertyValue("--ped-fit") !== next) stage.style.setProperty("--ped-fit", next);
  }
  function pedRefit(w, h) {
    if (w || h) pedContent = { w: w || pedContent.w, h: h || pedContent.h };
    const k = pedFitFor(pedContent.w, pedContent.h);
    if (Math.abs(k - pedFit) < 0.004) return false; // 没变就别碰 DOM，免得 ResizeObserver 自己转圈
    pedFit = k;
    applyPedFit();
    return true;
  }
  function bindPedigreeFit() {
    const stage = $("#pedigree-stage");
    if (!stage || stage.dataset.pedFitBound === "1") return;
    stage.dataset.pedFitBound = "1";
    /* 拖边栏改宽＝舞台自己变尺寸 → ResizeObserver 最稳；窗口 resize 也顺手接一下 */
    if (typeof ResizeObserver === "function" && !pedFitRO) {
      try {
        pedFitRO = new ResizeObserver(() => pedRefit());
        pedFitRO.observe(stage);
      } catch (e) {
        /* 老环境就走 window resize */
      }
    }
    window.addEventListener("resize", () => pedRefit());
  }
  /* 指针 → SVG 排版坐标：一律走 getScreenCTM（界面缩放、上面那套自适应缩放之后都对得上）。
     老环境没有 CTM 时退回 rect —— 那种环境本来也没有缩放。 */
  function pedSvgPoint(ev) {
    const svg = $("#pedigree-svg");
    if (!svg) return null;
    const m = svg.getScreenCTM && svg.getScreenCTM();
    if (m && typeof DOMPoint === "function") {
      try {
        const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
      } catch (e) {
        /* 走下面那套 */
      }
    }
    const r = svg.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function pedUnionById(id) {
    return ensurePedigree().unions.find((u) => u && u.id === id) || null;
  }
  function pedDescentOfChild(id) {
    return ensurePedigree().descents.find((d) => d && d.child === id) || null;
  }
  function pedUnionsOf(id) {
    return ensurePedigree().unions.filter((u) => u && (u.a === id || u.b === id));
  }
  /* 一个对象的上端锚点（它作为子时的世系线）：结合线中点 / 单亲 */
  function pedAnchorRowOf(d) {
    const p = ensurePedigree();
    if (!d) return -1;
    if (d.union) {
      const u = pedUnionById(d.union);
      if (!u) return -1;
      return Math.max(pedRowOf(u.a), pedRowOf(u.b));
    }
    return d.parent ? pedRowOf(d.parent) : -1;
  }
  /* 后代（顺着世系线往下走）：整棵子树 */
  function pedDescendantsOf(id, out) {
    const acc = out || [];
    const p = ensurePedigree();
    p.descents.forEach((d) => {
      if (!d || d.child === id || acc.indexOf(d.child) >= 0) return;
      const top = d.union ? null : d.parent;
      const inUnion = d.union ? pedUnionById(d.union) : null;
      const hit = inUnion ? inUnion.a === id || inUnion.b === id : top === id;
      if (hit) {
        acc.push(d.child);
        pedDescendantsOf(d.child, acc);
      }
    });
    return acc;
  }
  /* 往上数：这个对象的父母 / 双方祖先（用来拦「把祖先挂成子」这种成环） */
  function pedAncestorIds(id, out) {
    const acc = out || new Set();
    const d = pedDescentOfChild(id);
    if (!d) return acc;
    let ids = [];
    if (d.union) {
      const u = pedUnionById(d.union);
      ids = u ? [u.a, u.b] : [];
    } else if (d.parent) {
      ids = [d.parent];
    }
    ids.forEach((x) => {
      if (!x || acc.has(x)) return;
      acc.add(x);
      pedAncestorIds(x, acc);
    });
    return acc;
  }
  /* 能不能把 childId 挂到这些锚点下面：不能是锚点自己，也不能是锚点的祖先（成环） */
  function pedCanBeChild(anchors, childId) {
    const p = ensurePedigree();
    if (!childId || !p.nodes[childId]) return false;
    if ((anchors || []).indexOf(childId) >= 0) return false;
    return !(anchors || []).some((a) => a && pedAncestorIds(a).has(childId));
  }
  function pedShiftSubtree(id, delta) {
    const p = ensurePedigree();
    [id].concat(pedDescendantsOf(id)).forEach((x) => {
      const n = p.nodes[x];
      if (n) n.row = Math.max(0, Math.floor(Number(n.row) || 0) + delta);
    });
  }
  /* 子对象的代必须 > 上端锚点的代：不合法就把**这一棵子树**往下推（auto-tidy 不动别的行） */
  function pedFixRows() {
    let changed = false;
    for (let pass = 0; pass < 50; pass++) {
      let moved = false;
      ensurePedigree().descents.forEach((d) => {
        const anchor = pedAnchorRowOf(d);
        if (anchor < 0) return;
        const need = anchor + 1;
        const cur = pedRowOf(d.child);
        if (cur < need) {
          pedShiftSubtree(d.child, need - cur);
          moved = true;
          changed = true;
        }
      });
      if (!moved) break;
    }
    return changed;
  }
  /* 双亲相同的兄弟姐妹必须在**同一代**（用户 2026-10-16）：
     同一个锚点（结合线 / 单亲）下面的几个孩子统一到它们当中**最深**的那一代，再按 pedFixRows 收紧。 */
  function pedSyncSiblingRows() {
    const p = ensurePedigree();
    const groups = new Map();
    p.descents.forEach((d) => {
      const key = d.union ? "u:" + d.union : "c:" + d.parent;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    let changed = false;
    groups.forEach((list) => {
      if (list.length < 2) return;
      const want = Math.max.apply(
        null,
        list.map((d) => pedRowOf(d.child))
      );
      list.forEach((d) => {
        const cur = pedRowOf(d.child);
        if (cur !== want) {
          pedShiftSubtree(d.child, want - cur);
          changed = true;
        }
      });
    });
    return changed;
  }
  /* 把「兄弟姐妹同一代」和「子代必须在父母之下」反复捋顺（一次改完可能又碰出另一条规则） */
  function pedTidyRows() {
    let changed = false;
    for (let pass = 0; pass < 6; pass++) {
      const a = pedSyncSiblingRows();
      const b = pedFixRows();
      const c = pedCompactRows();
      if (a || b || c) changed = true;
      if (!a && !b && !c) break;
    }
    return changed;
  }
  /* 空的 F 压缩掉（用户 2026-10-16）：把有人站的行号重排成 0..n-1 连续，
     这样「父母 F0、孩子被拖到 F3」只会显示 F0/F1，中间不会空出两条没用的带子。 */
  function pedCompactRows() {
    const p = ensurePedigree();
    const rows = new Set();
    Object.keys(p.nodes).forEach((id) => {
      if (getChar(id)) rows.add(pedRowOf(id));
    });
    const sorted = Array.from(rows).sort((a, b) => a - b);
    const map = new Map(sorted.map((r, i) => [r, i]));
    let changed = false;
    Object.keys(p.nodes).forEach((id) => {
      const n = p.nodes[id];
      if (!n) return;
      const r = Math.max(0, Math.floor(Number(n.row) || 0));
      const nr = map.has(r) ? map.get(r) : r;
      if (nr !== r) {
        n.row = nr;
        changed = true;
      }
    });
    return changed;
  }
  /* 家族（结合线 / 世系线连在一起的一坨人）＋它们从左到右的顺序：
     先用用户「左移 / 右移」定过的顺序（`state.pedigree.order` 里存的是每个家族的代表 id），
     没定过的按「人物库顺序」接在后面。代表 id ＝ 这一族里在人物库里排最前的那个人。 */
  function pedFamilySeq() {
    const p = ensurePedigree();
    const ids = Object.keys(p.nodes).filter((id) => !!getChar(id));
    const order = new Map((state.characters || []).map((c, i) => [c.id, i]));
    const all = [];
    if (ids.length) {
      const up = new Map(ids.map((id) => [id, id]));
      const find = (x) => {
        let r = x;
        while (up.get(r) !== r) r = up.get(r);
        while (up.get(x) !== r) {
          const n = up.get(x);
          up.set(x, r);
          x = n;
        }
        return r;
      };
      const join = (x, y) => {
        if (!up.has(x) || !up.has(y)) return;
        const a = find(x);
        const b = find(y);
        if (a !== b) up.set(a, b);
      };
      p.unions.forEach((u) => join(u.a, u.b));
      p.descents.forEach((d) => {
        if (d.union) {
          const u = pedUnionById(d.union);
          if (u) join(u.a, d.child);
        } else if (d.parent) {
          join(d.parent, d.child);
        }
      });
      const famMap = new Map();
      ids.forEach((id) => {
        const r = find(id);
        if (!famMap.has(r)) famMap.set(r, []);
        famMap.get(r).push(id);
      });
      famMap.forEach((m) => all.push(m));
    }
    const leader = (m) => m.reduce((best, x) => ((order.get(x) || 0) < (order.get(best) || 0) ? x : best), m[0]);
    const out = [];
    (Array.isArray(p.order) ? p.order : []).forEach((key) => {
      const hit = all.find((m) => m.indexOf(key) >= 0);
      if (hit && out.indexOf(hit) < 0) out.push(hit);
    });
    all
      .filter((m) => out.indexOf(m) < 0)
      .sort((A, B) => (order.get(leader(A)) || 0) - (order.get(leader(B)) || 0))
      .forEach((m) => out.push(m));
    return { fams: out, leader };
  }
  /* 布局：一代一行。
     ① 先按「家族」（结合线 / 世系线连在一起的一坨人）分成几段**横向区间**——家族之间留空隙，
        这样别人家的圈和横杠绝不会落在你家竖线下面（竖线穿过别人的家具＝看不清）；
     ② 家族内部：结合线的两个人贴在一起，孩子排在父母（锚点）中点下方，同代从左到右铺开；
     ③ 世系线的横线：同一个锚点下的兄弟姐妹共用一条；**不同锚点的横线横向压在一起时往上错开**，
        免得两条线叠在一起（用户 2026-10-16：线不能互相重合）。
     只算横向，行号一律不动。 */
  function pedLayout() {
    const p = ensurePedigree();
    const ids = Object.keys(p.nodes).filter((id) => !!getChar(id));
    const order = new Map((state.characters || []).map((c, i) => [c.id, i]));
    const rowsShown = Math.max(1, pedMaxRow() + 2); // 末尾多留一代：往下拖＝放进更深的代
    const pos = new Map();
    const rowOf = new Map(ids.map((id) => [id, pedRowOf(id)]));
    /* ① 家族分组 + 从左到右的顺序（右键「左移 / 右移」改的就是这一串，见 pedFamilySeq） */
    const fams = pedFamilySeq().fams;
    /* ② 一个家族在自己的局部坐标里排（算法和以前一样），最后整体平移到它那一段区间 */
    let famStart = PED_PAD_LEFT;
    let maxRight = PED_PAD_LEFT;
    fams.forEach((members) => {
      const local = new Map();
      const byRow = new Map();
      members.forEach((id) => {
        const r = rowOf.get(id);
        if (!byRow.has(r)) byRow.set(r, []);
        byRow.get(r).push(id);
      });
      const rows = Array.from(byRow.keys()).sort((a, b) => a - b);
      rows.forEach((r) => byRow.get(r).sort((x, y) => (order.get(x) || 0) - (order.get(y) || 0)));
      const lx = (id) => (local.get(id) ? local.get(id).x : null);
      const anchorXOf = (d) => {
        if (d.union) {
          const u = pedUnionById(d.union);
          if (!u) return null;
          const a = lx(u.a);
          const b = lx(u.b);
          if (a == null) return b;
          if (b == null) return a;
          return (a + b) / 2;
        }
        return lx(d.parent);
      };
      let localRight = 0;
      rows.forEach((r) => {
        const list = byRow.get(r);
        list.sort((x, y) => {
          const dx = pedDescentOfChild(x);
          const dy = pedDescentOfChild(y);
          const ax = dx ? anchorXOf(dx) : null;
          const ay = dy ? anchorXOf(dy) : null;
          if (ax != null && ay != null && ax !== ay) return ax - ay;
          if (ax != null && ay == null) return -1;
          if (ax == null && ay != null) return 1;
          return (order.get(x) || 0) - (order.get(y) || 0);
        });
        /* 结合线连起来的两个人贴在一起。
           **谁有锚点（＝上面有世系线）谁排左边**：它得正对着自己的锚点，被配偶挤到旁边就会凭空多两个折点
           （用户 2026-10-16「尽量少折线」）。两位都没锚点时按 a → b 的老顺序贴。 */
        p.unions.forEach((u) => {
          if (rowOf.get(u.a) !== r || rowOf.get(u.b) !== r) return;
          const swap = !!pedDescentOfChild(u.b) && !pedDescentOfChild(u.a);
          const left = swap ? u.b : u.a;
          const right = swap ? u.a : u.b;
          const iL = list.indexOf(left);
          const iR = list.indexOf(right);
          if (iL < 0 || iR < 0 || Math.abs(iL - iR) === 1) return; // 已经挨着了
          const partnerOf = (x) => p.unions.some((o) => o !== u && ((o.a === x && o.b === left) || (o.b === x && o.a === left)));
          list.splice(iR, 1);
          const hi = list.indexOf(left);
          const rightTaken = hi + 1 < list.length && partnerOf(list[hi + 1]); // 右边已经是另一段婚姻 → 插左边
          list.splice(rightTaken ? hi : hi + 1, 0, right);
        });
        /* 从左到右铺，尽量贴着父母中点，但绝不重叠 */
        let cursor = 0;
        list.forEach((id) => {
          const d = pedDescentOfChild(id);
          const want = d ? anchorXOf(d) : null;
          const x = want != null && want > cursor ? want : cursor;
          local.set(id, { x, y: PED_PAD_TOP + r * PED_ROW_H });
          cursor = x + 2 * PED_R + PED_GAP;
          localRight = Math.max(localRight, x + 2 * PED_R);
        });
      });
      /* 平移进这一族的区间 */
      members.forEach((id) => {
        const q = local.get(id);
        if (q) pos.set(id, { x: q.x + famStart, y: q.y });
      });
      famStart += localRight + PED_GAP * 3; // 家族之间空出来
      maxRight = Math.max(maxRight, famStart - PED_GAP * 3);
    });
    /* ③ 结合线的中点（世系线锚点）：同一行＝两个圈中间；不同行＝两条线中间那条竖线的下端 */
    const anchors = new Map();
    p.unions.forEach((u) => {
      const a = pos.get(u.a);
      const b = pos.get(u.b);
      if (!a || !b) return;
      const mid = (Math.min(a.x, b.x) + Math.max(a.x, b.x)) / 2;
      /* 中点＝**这条线的中点**（按长度算，不是水平段的中点）：
         同一行＝横线中间；跨行＝那条竖线的正中间 —— 这样不会被两端的圈盖住（用户 2026-10-16）。 */
      let ax = (a.x + b.x) / 2;
      let ay = a.y;
      if (Math.abs(a.y - b.y) > 1) {
        const l1 = Math.abs(mid - a.x);
        const l2 = Math.abs(b.y - a.y);
        const l3 = Math.abs(b.x - mid);
        const half = (l1 + l2 + l3) / 2;
        if (half <= l1) {
          ax = a.x + Math.sign(mid - a.x) * half;
          ay = a.y;
        } else if (half <= l1 + l2) {
          ax = mid;
          ay = a.y + Math.sign(b.y - a.y) * (half - l1);
        } else {
          ax = mid + Math.sign(b.x - mid) * (half - l1 - l2);
          ay = b.y;
        }
      }
      anchors.set(u.id, { x: ax, y: ay, mid });
    });
    /* ④ 世系线的横线高度：同一锚点共用一条；同代里横向压在一起的往上错开，不让两条线叠着 */
    const axOf = (d) => {
      if (d.union) {
        const a = anchors.get(d.union);
        return a ? a.x : null;
      }
      const q = pos.get(d.parent);
      return q ? q.x : null;
    };
    const ayOf = (d) => {
      if (d.union) {
        const a = anchors.get(d.union);
        return a ? a.y : null;
      }
      const q = pos.get(d.parent);
      return q ? q.y + PED_R : null;
    };
    const keyOf = (d) => (d.union ? "u:" + d.union : "c:" + d.parent);
    const barY = new Map();
    const byRowBars = new Map();
    p.descents.forEach((d) => {
      const kid = pos.get(d.child);
      const ax = axOf(d);
      if (!kid || ax == null) return;
      const key = keyOf(d);
      const row = pedRowOf(d.child);
      if (!byRowBars.has(row)) byRowBars.set(row, []);
      const rec = byRowBars.get(row);
      let hit = rec.find((o) => o.key === key);
      if (!hit) {
        hit = { key, x1: Math.min(ax, kid.x), x2: Math.max(ax, kid.x), base: kid.y - PED_R - PED_STEM, ay: ayOf(d) };
        rec.push(hit);
      }
      hit.x1 = Math.min(hit.x1, kid.x, ax);
      hit.x2 = Math.max(hit.x2, kid.x, ax);
      hit.base = Math.min(hit.base, kid.y - PED_R - PED_STEM);
    });
    byRowBars.forEach((rec) => {
      rec.sort((a, b) => a.x1 - b.x1);
      let lastX2 = -1e9;
      let lastY = null;
      rec.forEach((b) => {
        let y = b.base;
        if (b.x1 < lastX2 - 0.5) y = Math.min(y, (lastY == null ? b.base : lastY) - 12); // 横向压着了 → 往上错开
        if (b.ay != null) y = Math.max(y, b.ay + 14); // 别爬到父母那一行上去
        barY.set(b.key, y);
        lastX2 = Math.max(lastX2, b.x2);
        lastY = y;
      });
    });
    const w = Math.max(maxRight + PED_PAD_RIGHT, 320);
    const h = PED_PAD_TOP + rowsShown * PED_ROW_H;
    return { pos, anchors, barY, w, h, rowsShown };
  }
  function pedAnchorXOfLayout(lay, d) {
    if (!d) return null;
    if (d.union) {
      const a = lay.anchors.get(d.union);
      return a ? a.x : null;
    }
    const q = lay.pos.get(d.parent);
    return q ? q.x : null;
  }
  /* 世系线的横线高度：同一个锚点下的兄弟姐妹共用一条（族谱那种横线），布局时已经算好 */
  function pedBarYOf(lay, d) {
    if (!lay || !lay.barY) return null;
    const key = d.union ? "u:" + d.union : "c:" + d.parent;
    const hit = lay.barY.get(key);
    if (hit != null) return hit;
    const kid = lay.pos.get(d.child);
    return kid ? kid.y - PED_R - PED_STEM : null;
  }

  /* ---------- 渲染 ---------- */
  /* 左边栏：系谱图列表（单击＝打开、双击名字＝改名、拖动＝排序、×＝删除；不要右键菜单了） */
  /* 系谱图的图标（内联 SVG，跟文字色走）：一个「父级 → 两个孩子」的小谱系图形 */
  function pedChartIconSvg() {
    return (
      `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">` +
      `<path d="M8 5.4 V8 M4 8 H12 M4 8 V10.2 M12 8 V10.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />` +
      `<circle cx="8" cy="3.4" r="2" fill="currentColor" />` +
      `<circle cx="4" cy="12" r="1.9" fill="currentColor" />` +
      `<circle cx="12" cy="12" r="1.9" fill="currentColor" />` +
      `</svg>`
    );
  }
  /* 小铅笔（点了＝改名，和双击名字一个效果） */
  function pedPencilSvg() {
    return (
      `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">` +
      `<path d="M11.1 2.4l2.5 2.5M12.3 1.2l2.5 2.5-8.6 8.6-3.2.7.7-3.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />` +
      `</svg>`
    );
  }
  function renderPedigreeList() {
    const box = $("#pedigree-list-body");
    if (!box) return;
    const charts = pedCharts();
    const active = ensurePedigree().id;
    box.innerHTML = charts
      .map((c) => {
        return (
          `<div class="pedigree-item${c.id === active ? " current" : ""}" data-pid="${esc(c.id)}" draggable="true">` +
          `<span class="pedigree-item-icon">${pedChartIconSvg()}</span>` +
          `<span class="pedigree-item-name">${esc(c.name || "")}</span>` +
          `<button type="button" class="icon-btn pedigree-item-edit" data-edit-pid="${esc(c.id)}" title="${esc(
            uiTextFor("重命名系谱图")
          )}">${pedPencilSvg()}</button>` +
          `<button type="button" class="icon-btn pedigree-item-del" data-del-pid="${esc(c.id)}" title="${esc(uiTextFor("删除系谱图"))}">×</button>` +
          `</div>`
        );
      })
      .join("");
    box.querySelectorAll(".pedigree-item").forEach((el) => {
      const pid = el.dataset.pid;
      el.addEventListener("click", () => {
        pedActiveChartId = pid;
        pedSel = new Set();
        pedPick = null;
        pedDragRow = null;
        pedDragWire = null;
        renderPedigree();
      });
      const del = el.querySelector(".pedigree-item-del");
      if (del)
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          pedDeleteChart(pid);
        });
      const edit = el.querySelector(".pedigree-item-edit");
      if (edit)
        edit.addEventListener("click", (ev) => {
          ev.stopPropagation();
          pedRenameChart(pid);
        });
      el.addEventListener("dblclick", (ev) => {
        if (ev.target.closest && ev.target.closest(".pedigree-item-del, .pedigree-item-edit")) return;
        pedRenameChart(pid);
      });
    });
  }
  function pedChartById(id) {
    return pedCharts().find((c) => c.id === id) || null;
  }
  /* 当前这张图里还剩几个对象（人物卡已经删掉的对象不算） */
  function pedObjectCount(chart) {
    const c = chart || ensurePedigree();
    return Object.keys((c && c.nodes) || {}).filter((id) => !!getChar(id)).length;
  }
  /* 抬头右上角那行小字：包含 N 个对象（原来挂在左边栏列表项上的 (n) 挪到这儿）。
     只写**简体原文**、由界面翻译层按 UI_PATTERNS 翻；数字没变就不动 DOM，免得每次都触发一轮翻译。 */
  let pedHeadCountN = -1;
  function renderPedigreeHeadCount() {
    const el = $("#ped-object-count");
    if (!el) return;
    const n = pedObjectCount();
    if (pedHeadCountN === n) return;
    pedHeadCountN = n;
    el.textContent = `包含 ${n} 个对象`;
  }
  /* 「重排」按钮：这一张图里一个对象都没有就灰掉（没东西可排） */
  function renderPedigreeTidyBtn() {
    const btn = $("#ped-tidy-btn");
    if (!btn) return;
    const off = pedObjectCount() === 0;
    if (btn.disabled !== off) btn.disabled = off;
  }
  /* ---------- 系谱 → 关系网 / 自动识别（用户 2026-10-16 定的方向）----------
     系谱是「更新关系网（亲属、恋爱）」「自动识别」「信息回填」的**提供方**，
     但**不是**自动回填的**接受方**：自动写回一律不许往系谱里写对象 / 结合线 / 世系线。
     下面这段是给分析提示词用的「已知关系」小抄（识别出来的 relation 记录要跟它对得上）。 */
  function pedigreeRelationHint() {
    const lines = [];
    try {
      const nameOf = (id) => {
        const c = getChar(id);
        return c ? String(c.name || "").trim() : "";
      };
      pedCharts().forEach((c) => {
        const unions = (c && c.unions) || [];
        unions.forEach((u) => {
          const a = nameOf(u && u.a);
          const b = nameOf(u && u.b);
          if (a && b) lines.push(`· ${a} — ${b}：配偶（系谱里的结合线）`);
        });
        ((c && c.descents) || []).forEach((d) => {
          const kid = nameOf(d && d.child);
          if (!kid) return;
          if (d.union) {
            const u = unions.find((o) => o && o.id === d.union);
            if (!u) return;
            [nameOf(u.a), nameOf(u.b)]
              .filter(Boolean)
              .forEach((p) => lines.push(`· ${p} → ${kid}：血亲（系谱里的世系线，父母 → 子女）`));
          } else if (d.parent && nameOf(d.parent)) {
            lines.push(`· ${nameOf(d.parent)} → ${kid}：血亲（系谱里的世系线，父母 → 子女）`);
          }
        });
      });
    } catch (e) {
      return "";
    }
    if (!lines.length) return "";
    return (
      `\n\n【已知关系：来自「人物分析 → 系谱」】\n` +
      `下面这些是用户已经在系谱里连好的关系，视为事实，辈分方向不要推翻；` +
      `输出 relation 记录时按它们来（配偶＝恋爱，父母 → 子女＝亲属），原文另有依据的再另加记录：\n` +
      lines.slice(0, 160).join("\n")
    );
  }
  /* 重排（用户 2026-10-16）：只管**当前这一张图**，只重算「代」，一个关系都不动 ——
     ① 所有对象先归 F0（树根自然落在最上面一代，不会再挂在半空）；
     ② 结合线两端拉到**同一代**：夫妻站同一行 ⇒ 结合线是一根直的横线，不会拐成 Z；
     ③ 子级＝上端锚点 + 1：世系线只跨一代，最短；
     ④ 再压掉空行（pedTidyRows），横向照旧 auto-tidy：孩子尽量落在锚点正下方、兄弟姐妹共用一条横线。
     ②③ 只会把人往下推、从"全 0"起算 ⇒ 收敛到行号最小的那个解（最短最简洁、折线最少）。
     返回有没有真的动过（没动就不写存档，省一条没用的撤销记录）。 */
  function pedRelayoutChart() {
    const p = ensurePedigree();
    const row = new Map();
    Object.keys(p.nodes).forEach((id) => row.set(id, 0));
    const raise = (id, r) => {
      if (!row.has(id) || row.get(id) >= r) return false;
      row.set(id, r);
      return true;
    };
    for (let pass = 0; pass < 500; pass++) {
      let moved = false;
      p.unions.forEach((u) => {
        if (!row.has(u.a) || !row.has(u.b)) return;
        const top = Math.max(row.get(u.a), row.get(u.b));
        if (raise(u.a, top)) moved = true;
        if (raise(u.b, top)) moved = true;
      });
      p.descents.forEach((d) => {
        if (!row.has(d.child)) return;
        let anchor = -1;
        if (d.union) {
          const u = pedUnionById(d.union);
          if (u && row.has(u.a) && row.has(u.b)) anchor = Math.max(row.get(u.a), row.get(u.b));
        } else if (d.parent && row.has(d.parent)) {
          anchor = row.get(d.parent);
        }
        if (anchor < 0) return;
        if (raise(d.child, anchor + 1)) moved = true;
      });
      if (!moved) break;
    }
    let changed = false;
    Object.keys(p.nodes).forEach((id) => {
      const want = Math.max(0, Math.floor(row.get(id) || 0));
      if (pedRowOf(id) !== want) {
        p.nodes[id].row = want;
        changed = true;
      }
    });
    if (pedTidyRows()) changed = true; // 压掉空行（顺手把两条行规则再捋一遍）
    return changed;
  }
  function pedTidyNow() {
    if (!pedRelayoutChart()) {
      renderPedigree(); // 本来就已经整整齐齐：也得收尾一次（拖拽预览 / 画布状态）
      return;
    }
    pendingUndoLabel = uiSentence("pedRelayoutUndo", ensurePedigree().name || "");
    saveState();
    renderPedigree();
  }
  function pedNewChart() {
    const charts = pedCharts();
    const c = pedNormalizeChart({ id: uid(), name: "" }, charts.length);
    charts.push(c);
    pedActiveChartId = c.id;
    pedSel = new Set();
    pendingUndoLabel = uiSentence("pedChartNewUndo", c.name);
    saveState();
    renderPedigree();
    return c;
  }
  async function pedRenameChart(id) {
    const c = pedChartById(id);
    if (!c) return;
    const next = await uiPrompt(uiTextFor("重命名系谱图"), c.name || "", uiTextFor("重命名系谱图"));
    if (next == null) return;
    const name = String(next).trim();
    if (!name || name === c.name) return;
    c.name = name;
    pendingUndoLabel = uiSentence("pedChartRenameUndo", name);
    saveState();
    renderPedigree();
  }
  function pedDeleteChart(id) {
    const charts = pedCharts();
    const c = pedChartById(id);
    if (!c) return;
    /* 不弹二次确认（用户 2026-10-16）：直接删，撤销（Ctrl+Z）能找回来 */
    if (charts.length <= 1) {
      /* 只剩这一张：不当成"删光"，把它清空成一张新的空图（界面上永远有一张图可画） */
      c.nodes = {};
      c.unions = [];
      c.descents = [];
      c.order = [];
      c.name = uiTextFor("系谱图") + " 1";
      pedSel = new Set();
      pendingUndoLabel = uiSentence("pedChartClearUndo", c.name);
      saveState();
      renderPedigree();
      return;
    }
    const idx = charts.indexOf(c);
    state.pedigree.charts = charts.filter((x) => x !== c);
    if (pedActiveChartId === c.id) pedActiveChartId = state.pedigree.charts[Math.max(0, idx - 1)].id;
    pedSel = new Set();
    pendingUndoLabel = uiSentence("pedChartDelUndo", c.name || "");
    saveState();
    renderPedigree();
  }
  /* 拖动列表项换顺序（2026-10-16 用户要求：不要右键菜单了，直接拖） */
  let pedChartDragId = "";
  function pedReorderChart(dragId, overId, after) {
    const charts = pedCharts();
    const from = charts.findIndex((c) => c.id === dragId);
    if (from < 0 || dragId === overId) return false;
    const moved = charts.splice(from, 1)[0];
    let to = charts.findIndex((c) => c.id === overId);
    if (to < 0) to = charts.length - (after ? 0 : 1);
    charts.splice(Math.max(0, Math.min(charts.length, after ? to + 1 : to)), 0, moved);
    pendingUndoLabel = uiSentence("pedChartOrderUndo");
    saveState();
    renderPedigree();
    return true;
  }
  function pedNodeSvg(id) {
    const c = getChar(id);
    if (!c) return "";
    const sel = pedSel.has(id);
    const on = pedPick ? pedPickValid(id) : false;
    const off = !!pedPick && !on;
    const rr = PED_R;
    let body;
    if (c.portrait) {
      const clipId = "pedclip" + String(id).replace(/[^A-Za-z0-9_-]/g, "");
      body =
        `<defs><clipPath id="${clipId}"><circle r="${rr}" /></clipPath></defs>` +
        `<circle r="${rr}" fill="${esc(c.color || "#8DA0CB")}" />` +
        `<image class="rel-node-photo" href="${esc(c.portrait)}" x="${-rr}" y="${-rr}" width="${rr * 2}" height="${rr * 2}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />` +
        `<circle r="${rr}" fill="none" />`;
    } else {
      const ink = charInkColors(c.color).glass;
      body =
        `<circle r="${rr}" fill="${esc(c.color || "#8DA0CB")}" fill-opacity="0.62" />` +
        `<circle r="${rr}" fill="url(#pedGlassGloss)" />` +
        `<text class="rel-node-initial" y="${(rr * 0.38).toFixed(1)}" style="font-size:${rr.toFixed(1)}px;--rel-ink:${esc(
          ink
        )}" text-anchor="middle">${esc(initials(c.name))}</text>`;
    }
    /* 悬浮提示走**程序自己的气泡**：查的是元素上的 title 属性（05-ui-common 的 uiInitTitleTips），
       不能用 SVG 的 <title> 子元素——那是浏览器原生气泡（用户 2026-10-16 抓到的）。 */
    const tip = String(c.name || "") + (c.role ? " · " + c.role : "");
    /* 在人物链里的话，圈右上角挂一个回形针（颜色＝这条链的颜色，用户 2026-10-16）：
       点它＝弹出链里的成员列表，点其中一个＝把这个对象换成那个人。 */
    const ch = typeof chainOfChar === "function" ? chainOfChar(id) : null;
    const clip = ch
      ? `<g class="ped-chain-clip" data-char-id="${esc(id)}" data-chain-id="${esc(ch.id)}" style="color:${esc(
          ch.color || "#8DA0CB"
        )}" title="${esc(
          uiTextFor("人物链") +
            "：" +
            (typeof chainMembersOf === "function"
              ? chainMembersOf(ch)
                  .map((m) => m.name)
                  .filter(Boolean)
                  .join(" · ")
              : "")
        )}" transform="translate(${(rr * 0.72).toFixed(1)},${(-rr * 0.72).toFixed(1)})">
        <circle class="ped-chain-clip-bg" r="8" />
        <g transform="translate(-5.5,-5.5) scale(0.458)">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </g>`
      : "";
    return `<g class="rel-node pedigree-node${sel ? " sel" : ""}${on ? " can-link" : ""}${off ? " no-link" : ""}" data-char-id="${esc(
      id
    )}" title="${esc(tip)}"><rect class="ped-node-hit" x="${-rr - 5}" y="${-rr - 5}" width="${rr * 2 + 10}" height="${
      rr * 2 + 34
    }" rx="7" />${body}<text class="rel-node-name" y="${rr + 19}" text-anchor="middle">${esc(
      c.name || ""
    )}</text>${
      sel ? `<circle class="ped-sel-ring" r="${rr + 4.5}" fill="none" />` : ""
    }${clip}</g>`;
  }
  /* 结合线：同一行＝横线；不同行＝「横—竖—横」的 Z 形（都连到圆心，圈不透明盖在上面） */
  function pedUnionPath(a, b) {
    if (Math.abs(a.y - b.y) < 2) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const mid = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${mid} ${a.y} L ${mid} ${b.y} L ${b.x} ${b.y}`;
  }
  function pedEdgeSvg(lay) {
    const p = ensurePedigree();
    /* 世系线先画、结合线（含中点那颗圆点）后画：不然世系线的粗命中条会盖住中点，拉不动 */
    let out = "";
    let unionOut = "";
    p.unions.forEach((u) => {
      const a = lay.pos.get(u.a);
      const b = lay.pos.get(u.b);
      if (!a || !b) return;
      const sel = pedSel.has("u:" + u.id);
      const d = pedUnionPath(a, b);
      const anchor = lay.anchors.get(u.id);
      /* 监听状态（向上关联到 / 编辑上端）下：这个中点能不能当落点 —— 能就长亮 + 加大，不能就灰掉 */
      let pick = null;
      if (anchor && pedPick && (pedPick.kind === "descentUp" || pedPick.kind === "descentTop")) {
        const child =
          pedPick.kind === "descentUp"
            ? pedPick.host
            : ((ensurePedigree().descents.find((o) => o && o.id === pedPick.descent) || {}).child || "");
        pick = !!child && pedCanBeChild([u.a, u.b], child);
      }
      unionOut +=
        `<g class="ped-edge ped-edge-union${sel ? " sel" : ""}${pick === true ? " can-link" : pick === false ? " no-link" : ""}" data-union-id="${esc(
          u.id
        )}">` +
        `<path class="ped-edge-hit" d="${d}" />` +
        `<path class="ped-edge-line" d="${d}" />` +
        (anchor ? `<circle class="ped-anchor-hit" cx="${anchor.x}" cy="${anchor.y}" r="9" />` : "") +
        (anchor ? `<circle class="ped-anchor" cx="${anchor.x}" cy="${anchor.y}" r="${pick === true ? 5.5 : 4}" />` : "") +
        `</g>`;
    });
    /* 同一个锚点下的几条世系线共用一条横线 */
    const bars = new Map();
    p.descents.forEach((d) => {
      const ax = pedAnchorXOfLayout(lay, d);
      const kid = lay.pos.get(d.child);
      if (ax == null || !kid) return;
      const anchorY =
        d.union && lay.anchors.get(d.union) ? lay.anchors.get(d.union).y : (lay.pos.get(d.parent) ? lay.pos.get(d.parent).y + PED_R : null);
      if (anchorY == null) return;
      const barY = pedBarYOf(lay, d);
      const key = ax + "|" + anchorY;
      const prev = bars.get(key);
      const dd = `M ${ax} ${anchorY} L ${ax} ${barY} L ${kid.x} ${barY} L ${kid.x} ${kid.y - PED_R}`;
      const sel = pedSel.has("d:" + d.id);
      if (prev) {
        prev.list.push({ d: dd, id: d.id, sel });
      } else {
        bars.set(key, { list: [{ d: dd, id: d.id, sel }] });
      }
    });
    bars.forEach((b) => {
      b.list.forEach((it) => {
        out +=
          `<g class="ped-edge ped-edge-descent${it.sel ? " sel" : ""}" data-descent-id="${esc(it.id)}">` +
          `<path class="ped-edge-hit" d="${it.d}" />` +
          `<path class="ped-edge-line" d="${it.d}" />` +
          `</g>`;
      });
    });
    /* 单亲世系线的「线头」就是那个父对象自己（不需要另外画圆点）——它的拖 / 右键 / 向上关联都走对象那套 */
    return out + unionOut + (pedDragWire ? `<path class="ped-rubber" d="M ${pedDragWire.fx} ${pedDragWire.fy} L ${pedDragWire.x} ${pedDragWire.y}" />` : "");
  }
  /* 手柄：结合手柄（圈右下）、世系手柄（圈底，单亲）、结合线中点（上面已经画了） */
  function pedHandleSvg(id, pos, lay) {
    const rr = PED_R;
    const ux = pos.x + rr * 0.78;
    const uy = pos.y + rr * 0.78;
    /* 世系手柄放左下角（和右下角的结合手柄对称）——放正下方会压到圈下面的名字 */
    const dx = pos.x - rr * 0.78;
    const dy = pos.y + rr * 0.78;
    return (
      `<g class="ped-handles${pedSel.has(id) || (pedPick && pedPick.host === id) ? " on" : ""}" data-handle-host="${esc(id)}">` +
      `<circle class="ped-handle ped-handle-union" data-handle="union" data-char-id="${esc(id)}" cx="${ux}" cy="${uy}" r="5.5" title="${esc(
        uiTextFor("结合…")
      )}"></circle>` +
      `<circle class="ped-handle ped-handle-descent" data-handle="descent" data-char-id="${esc(id)}" cx="${dx}" cy="${dy}" r="5.5" title="${esc(
        uiTextFor("关联到…上方")
      )}"></circle>` +
      `</g>`
    );
  }
  function renderPedigree() {
    const body = $("#pedigree-body");
    if (!body) return;
    prunePedigree();
    pedTidyRows(); // 载入老数据 / 外部改动之后也把钱两条规则捋顺
    pedSel = new Set(Array.from(pedSel).filter((k) => pedTargetExists(k)));
    renderPedigreeList();
    renderPedigreeHeadCount();
    renderPedigreeTidyBtn();
    renderPedigreeCanvas();
  }
  /* 渲染画布：一代一行 + 圈圈对象 + 连线 + 手柄 */
  function renderPedigreeCanvas() {
    const canvas = $("#pedigree-canvas");
    const empty = $("#pedigree-empty");
    if (!canvas) return;
    let svg = $("#pedigree-svg");
    if (!svg) {
      svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("id", "pedigree-svg");
      svg.setAttribute("class", "pedigree-svg");
      svg.innerHTML =
        `<defs><linearGradient id="pedGlassGloss" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />` +
        `<stop offset="1" stop-color="#ffffff" stop-opacity="0.04" /></linearGradient></defs>` +
        `<g class="pedigree-edges" id="pedigree-edges"></g>` +
        `<g class="pedigree-labels" id="pedigree-labels"></g>` +
        `<g class="pedigree-nodes" id="pedigree-nodes"></g>`;
      canvas.appendChild(svg);
    }
    const lay = pedLayout();
    const ids = Array.from(lay.pos.keys());
    if (empty) empty.hidden = ids.length > 0;
    svg.setAttribute("width", String(Math.ceil(lay.w)));
    svg.setAttribute("height", String(Math.ceil(lay.h)));
    svg.setAttribute("viewBox", `0 0 ${Math.ceil(lay.w)} ${Math.ceil(lay.h)}`);
    /* 排完就知道这张图多大：按画布现在的可用空间重算一次缩放（边栏拖宽时 ResizeObserver 也会叫它） */
    pedRefit(lay.w, lay.h);
    const labels = [];
    for (let r = 0; r < lay.rowsShown; r++) {
      labels.push(`<text class="pedigree-row-label" x="10" y="${PED_PAD_TOP + r * PED_ROW_H + 4}">F${r}</text>`);
    }
    $("#pedigree-labels").innerHTML = labels.join("");
    $("#pedigree-edges").innerHTML = pedEdgeSvg(lay) + (pedDragRow ? pedRowGuide(lay) : "");
    const nodes = ids
      .slice()
      .sort((a, b) => lay.pos.get(a).y - lay.pos.get(b).y || lay.pos.get(a).x - lay.pos.get(b).x)
      .map((id) => {
        const pos = lay.pos.get(id);
        const cur = pedDragRow && pedDragRow.id === id ? { x: pos.x, y: pedDragRow.y } : pos;
        return `<g class="ped-node-wrap" data-node-id="${esc(id)}" transform="translate(${cur.x},${cur.y})">${pedNodeSvg(id)}${pedHandleSvg(
          id,
          { x: 0, y: 0 },
          lay
        )}</g>`;
      })
      .join("");
    $("#pedigree-nodes").innerHTML = nodes;
    bindPedigreeNodes(lay);
    renderPedigreeHint();
  }
  /* 拖拽过程中的「轻量重画」：**不重建节点元素**（重建会把正在拖的那个元素换掉，
     鼠标一动一重建 → 卡在半路；用户 2026-10-16 报的）。
     只做两件事：把被拖的那个节点的 transform 挪过去 + 重画线层（含拖行参考线 / 橡皮筋）。 */
  function pedPaintLight(lay) {
    const box = $("#pedigree-nodes");
    if (!box) return;
    if (pedDragRow && pedDragRow.id) {
      const el = box.querySelector(`.ped-node-wrap[data-node-id="${pedDragRow.id}"]`);
      const pos = lay && lay.pos ? lay.pos.get(pedDragRow.id) : null;
      if (el && pos) el.setAttribute("transform", `translate(${pos.x},${Math.round(pedDragRow.y)})`);
    }
    const edges = $("#pedigree-edges");
    if (edges && lay) edges.innerHTML = pedEdgeSvg(lay) + (pedDragRow ? pedRowGuide(lay) : "");
    applyPedHover(); // 拉线时鼠标底下那个目标高亮（直接改 class，不重建）
  }
  /* 拖对象改代时的那条横向参考线 */
  function pedRowGuide(lay) {
    return `<line class="ped-row-guide" x1="0" y1="${pedDragRow.y}" x2="${Math.ceil(lay.w)}" y2="${pedDragRow.y}" />`;
  }
  /* 头顶那行小字说明（监听 / 拖动状态） */
  function renderPedigreeHint() {
    const hint = $("#pedigree-hint");
    if (!hint) return;
    let txt = "";
    if (pedPick) txt = uiTextFor(pedPickHintKey(pedPick.kind));
    hint.textContent = txt;
    hint.hidden = !txt;
  }
  /* 监听状态的小字说明：按「在连什么」挑一句（和进监听时弹的小气泡共用一份，别再各写各的） */
  function pedPickHintKey(kind) {
    if (kind === "union") return "点选对象＝连接成结合线 · Esc 取消";
    if (kind === "unionEnd") return "点选对象＝替换此端 · Esc 取消";
    if (kind === "descentUp" || kind === "descentTop") return "点选对象＝设为父级，点结合线中点＝设为双亲 · Esc 取消";
    return "点选对象＝设为子级 · Esc 取消";
  }
  function pedTargetExists(key) {
    if (key.indexOf("u:") === 0) return !!pedUnionById(key.slice(2));
    if (key.indexOf("d:") === 0) return !!ensurePedigree().descents.find((d) => d && d.id === key.slice(2));
    return pedInPedigree(key);
  }

  /* ---------- 增删改（每次改完都 saveState + 重排重画） ---------- */
  function pedRowFromY(y) {
    return Math.max(0, Math.round((y - PED_PAD_TOP) / PED_ROW_H));
  }
  function pedAddObjects(ids, row) {
    const p = ensurePedigree();
    const fresh = [];
    let dup = 0;
    (ids || []).forEach((id) => {
      if (!getChar(id)) return;
      if (p.nodes[id]) {
        dup++;
        return;
      }
      p.nodes[id] = { row: Math.max(0, Math.floor(Number(row) || 0)) };
      fresh.push(id);
    });
    if (!fresh.length) {
      if (dup) showToast(uiTextFor("这个人已经在系谱里了"));
      return;
    }
    pendingUndoLabel =
      fresh.length === 1 ? uiSentence("pedAddUndo", (getChar(fresh[0]) || {}).name || "") : uiSentence("pedAddUndoN", fresh.length);
    saveState();
    renderPedigree();
    if (dup) showToast(uiTextFor("这个人已经在系谱里了"));
  }
  function pedRemoveObjects(ids) {
    const p = ensurePedigree();
    const gone = new Set((ids || []).filter((id) => p.nodes[id]));
    if (!gone.size) return;
    const list = Array.from(gone);
    let wires = 0;
    gone.forEach((id) => {
      delete p.nodes[id];
    });
    /* 删对象：
       · 它的结合线 / 世系线断掉，**另一端的对象都保留**；
       · 挂在结合线下面的世系线按**还剩几个父**处理（用户 2026-10-16 澄清）：
         还剩一个父 → 改成单亲锚点（子卡变单亲）；两个父都没了 → 断掉（子卡悬空）。 */
    const deadUnions = p.unions.filter((u) => gone.has(u.a) || gone.has(u.b));
    const deadIds = deadUnions.map((u) => u.id);
    p.unions = p.unions.filter((u) => deadIds.indexOf(u.id) < 0);
    const keep = [];
    p.descents.forEach((d) => {
      if (gone.has(d.child)) {
        wires++;
        return;
      }
      if (d.union && deadIds.indexOf(d.union) >= 0) {
        const u = deadUnions.find((x) => x.id === d.union);
        const aGone = u ? gone.has(u.a) : true;
        const bGone = u ? gone.has(u.b) : true;
        const survivor = aGone && bGone ? "" : aGone ? u.b : u.a;
        wires++;
        if (!survivor) return; // 两个父都没了 → 子卡悬空
        d.union = "";
        d.parent = survivor; // 还剩一个父 → 子卡变单亲（锚在那个父的底边中点）
        if (d.parent === d.child) {
          wires--; // 兜底：挂成自己了（坏数据）就当没这条线
          return;
        }
        keep.push(d);
        return;
      }
      if (!d.union && d.parent && gone.has(d.parent)) {
        wires++;
        return;
      }
      keep.push(d);
    });
    p.descents = keep;
    pedSel = new Set();
    pendingUndoLabel =
      list.length === 1
        ? uiSentence(wires ? "pedDelUndoWires" : "pedDelUndo", (getChar(list[0]) || {}).name || "", wires)
        : uiSentence(wires ? "pedDelUndoNWires" : "pedDelUndoN", list.length, wires);
    saveState();
    renderPedigree();
  }
  function pedSetRow(id, row) {
    const p = ensurePedigree();
    if (!p.nodes[id]) return false;
    const r = Math.max(0, Math.floor(Number(row) || 0));
    if (p.nodes[id].row === r) return false; // 行号没变：调用方要自己收尾（拖拽预览得收回去）
    p.nodes[id].row = r;
    pedTidyRows(); // 兄弟姐妹同一代 + 子代在父母之下
    pendingUndoLabel = uiSentence("pedRowUndo", (getChar(id) || {}).name || "", "F" + r);
    saveState();
    renderPedigree();
    return true;
  }
  /* 右键「左移 / 右移」：把这个对象所在的**整个连通拓扑（家族）**和左右相邻的那一块换位。
     只改横向次序（存进 state.pedigree.order），层级 / 父子关系一律不动；换完照例 auto-tidy。
     已经是最左 / 最右时对应那一项在菜单里灰掉。 */
  function pedFamilySlot(id) {
    const { fams } = pedFamilySeq();
    const i = fams.findIndex((m) => m.indexOf(id) >= 0);
    return { i, n: fams.length };
  }
  function pedMoveFamily(id, dir) {
    const p = ensurePedigree();
    if (!p.nodes[id]) return false;
    const { fams, leader } = pedFamilySeq();
    const me = fams.findIndex((m) => m.indexOf(id) >= 0);
    const j = me + dir;
    if (me < 0 || j < 0 || j >= fams.length) return false;
    const seq = fams.map((m) => leader(m));
    const tmp = seq[me];
    seq[me] = seq[j];
    seq[j] = tmp;
    p.order = seq;
    pendingUndoLabel = uiSentence(dir < 0 ? "pedMoveLeftUndo" : "pedMoveRightUndo", (getChar(id) || {}).name || "");
    saveState();
    renderPedigree(); // AUTO-TIDY（横向重排 + 连线重画）
    return true;
  }
  function pedAddUnion(a, b) {
    const p = ensurePedigree();
    if (!a || !b || a === b || !p.nodes[a] || !p.nodes[b]) return;
    if (p.unions.some((u) => (u.a === a && u.b === b) || (u.a === b && u.b === a))) return;
    p.unions.push({ id: uid(), a, b });
    pendingUndoLabel = uiSentence("pedUnionUndo", (getChar(a) || {}).name || "", (getChar(b) || {}).name || "");
    saveState();
    renderPedigree();
  }
  function pedAddDescent(anchor, child) {
    const p = ensurePedigree();
    if (!child || !p.nodes[child]) return;
    const anchors = anchor && anchor.union ? (() => {
      const u = pedUnionById(anchor.union);
      return u ? [u.a, u.b] : [];
    })() : [anchor ? anchor.parent : ""];
    if (!pedCanBeChild(anchors, child)) return; // 兜底：不许成环
    const old = pedDescentOfChild(child);
    if (old) p.descents = p.descents.filter((d) => d !== old); // 一个子只留一条世系线：直接替换
    const d = { id: uid(), union: "", parent: "", child };
    if (anchor.union) d.union = anchor.union;
    else d.parent = anchor.parent;
    if (!d.union && !d.parent) return;
    p.descents.push(d);
    pedTidyRows(); // 兄弟姐妹同一代 + 子代在父母之下
    const who = d.union
      ? (() => {
          const u = pedUnionById(d.union);
          return u ? `${(getChar(u.a) || {}).name || ""} — ${(getChar(u.b) || {}).name || ""}` : "";
        })()
      : (getChar(d.parent) || {}).name || "";
    pendingUndoLabel = uiSentence(old ? "pedDescentReplaceUndo" : "pedDescentUndo", (getChar(child) || {}).name || "", who);
    saveState();
    renderPedigree();
  }
  function pedRemoveUnion(id) {
    const p = ensurePedigree();
    const u = pedUnionById(id);
    if (!u) return;
    const n = p.descents.filter((d) => d.union === id).length;
    p.unions = p.unions.filter((x) => x.id !== id);
    p.descents = p.descents.filter((d) => d.union !== id); // 挂它的世系线断掉（子对象保留＝悬空）
    pedSel = new Set();
    pendingUndoLabel = uiSentence(n ? "pedUnionDelUndoWires" : "pedUnionDelUndo", (getChar(u.a) || {}).name || "", (getChar(u.b) || {}).name || "", n);
    saveState();
    renderPedigree();
  }
  function pedRemoveDescent(id) {
    const p = ensurePedigree();
    const d = p.descents.find((x) => x && x.id === id);
    if (!d) return;
    p.descents = p.descents.filter((x) => x.id !== id);
    pedSel = new Set();
    pendingUndoLabel = uiSentence("pedDescentDelUndo", (getChar(d.child) || {}).name || "");
    saveState();
    renderPedigree();
  }
  /* 回形针面板：列出这条人物链里的成员，点一个＝把这个对象换成那个人（连线都跟着走） */
  function openPedChainPanel(at, charId) {
    const ch = typeof chainOfChar === "function" ? chainOfChar(charId) : null;
    if (!ch) return;
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu tree-add-menu";
    menu.innerHTML =
      `<div class="context-menu-title">${esc(uiTextFor("人物链"))}</div>` +
      (typeof chainMembersOf === "function" ? chainMembersOf(ch) : [])
        .map((m) => {
          const cur = m.id === charId;
          return `<div class="context-menu-item${cur ? " disabled" : ""}" data-char-id="${esc(m.id)}"><span class="line-name">${esc(
            m.name || ""
          )}</span>${cur ? `<span class="menu-count">${esc(uiTextFor("当前"))}</span>` : ""}</div>`;
        })
        .join("");
    document.body.appendChild(menu);
    placeFloatingAtCursor(menu, (at && at.x) || 0, (at && at.y) || 0, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", () => {
        if (el.classList.contains("disabled")) return; // 当前这个人自己：不响应
        const id2 = el.dataset.charId;
        hideContextMenu();
        pedSwapPerson(charId, id2);
      })
    );
  }
  /* 把这个对象的人换成另一个人（人物链里的另一张卡）：位置、结合线、世系线全都跟着换过去 */
  function pedSwapPerson(oldId, newId) {
    const p = ensurePedigree();
    if (!oldId || !newId || oldId === newId || !p.nodes[oldId] || !getChar(newId)) return;
    if (p.nodes[newId]) {
      showToast(uiTextFor("这个人已经在系谱里了"));
      return;
    }
    const oldName = (getChar(oldId) || {}).name || "";
    const newName = (getChar(newId) || {}).name || "";
    p.nodes[newId] = p.nodes[oldId];
    delete p.nodes[oldId];
    p.unions.forEach((u) => {
      if (u.a === oldId) u.a = newId;
      if (u.b === oldId) u.b = newId;
    });
    p.descents.forEach((d) => {
      if (d.child === oldId) d.child = newId;
      if (d.parent === oldId) d.parent = newId;
    });
    if (pedSel.has(oldId)) {
      pedSel.delete(oldId);
      pedSel.add(newId);
    }
    if (pedPick && pedPick.host === oldId) pedPick.host = newId;
    pedTidyRows();
    pendingUndoLabel = uiSentence("pedSwapUndo", oldName, newName);
    saveState();
    renderPedigree();
    showToast(uiSentence("pedSwapToast", newName));
  }
  /* 替换结合线的一端 */
  function pedReplaceUnionEnd(unionId, which, newId) {
    const p = ensurePedigree();
    const u = pedUnionById(unionId);
    if (!u || !newId || !p.nodes[newId]) return;
    const other = which === "a" ? u.b : u.a;
    if (newId === other) return;
    if (p.unions.some((x) => x.id !== unionId && ((x.a === newId && x.b === other) || (x.a === other && x.b === newId)))) return;
    const oldName = (getChar(which === "a" ? u.a : u.b) || {}).name || "";
    if (which === "a") u.a = newId;
    else u.b = newId;
    pendingUndoLabel = uiSentence("pedUnionEditUndo", oldName, (getChar(newId) || {}).name || "");
    saveState();
    renderPedigree();
  }
  function pedSetDescentChild(id, newChild) {
    const p = ensurePedigree();
    const d = p.descents.find((x) => x && x.id === id);
    if (!d || !newChild || !p.nodes[newChild] || newChild === d.child) return;
    const anchors = d.union
      ? (() => {
          const u = pedUnionById(d.union);
          return u ? [u.a, u.b] : [];
        })()
      : [d.parent];
    if (!pedCanBeChild(anchors, newChild)) return; // 不许成环
    d.child = newChild;
    pedTidyRows(); // 兄弟姐妹同一代 + 子代在父母之下
    pendingUndoLabel = uiSentence("pedDescentChildUndo", (getChar(newChild) || {}).name || "");
    saveState();
    renderPedigree();
  }
  function pedSetDescentTop(id, anchor) {
    const p = ensurePedigree();
    const d = p.descents.find((x) => x && x.id === id);
    if (!d) return;
    const anchors = anchor.union
      ? (() => {
          const u = pedUnionById(anchor.union);
          return u ? [u.a, u.b] : [];
        })()
      : [anchor.parent];
    if (!pedCanBeChild(anchors, d.child)) return; // 兜底：不许成环
    if (anchor.union) {
      d.union = anchor.union;
      d.parent = "";
    } else {
      d.union = "";
      d.parent = anchor.parent;
    }
    pedTidyRows(); // 兄弟姐妹同一代 + 子代在父母之下
    pendingUndoLabel = uiSentence("pedDescentTopUndo", (getChar(d.child) || {}).name || "");
    saveState();
    renderPedigree();
  }

  /* ---------- 监听状态（点目标完成 / Esc 退出），和技能树「关联到…」同一套手感 ---------- */
  function pedPickValid(id) {
    if (!pedPick || !getChar(id)) return false;
    if (pedPick.kind === "union") {
      return id !== pedPick.host && !!ensurePedigree().nodes[id] && !ensurePedigree().unions.some((u) => (u.a === id && u.b === pedPick.host) || (u.b === id && u.a === pedPick.host));
    }
    if (pedPick.kind === "descent" || pedPick.kind === "descentChild") {
      /* 挂成子：不能是锚点自己，也不能是锚点的祖先（成环） */
      const anchors = pedPick.anchors || [pedPick.host];
      return pedCanBeChild(anchors, id);
    }
    if (pedPick.kind === "unionEnd") {
      const u = pedUnionById(pedPick.union);
      if (!u) return false;
      const other = pedPick.which === "a" ? u.b : u.a;
      return id !== other && !!ensurePedigree().nodes[id];
    }
    if (pedPick.kind === "descentTop") {
      /* 换成单亲上端：不能是这个子自己，也不能成环 */
      const d = ensurePedigree().descents.find((o) => o && o.id === pedPick.descent);
      return !!d && pedCanBeChild([id], d.child);
    }
    if (pedPick.kind === "descentUp") {
      /* 向上关联：点到的这个对象当「我」的父（单亲）——不能是自己、不能是自己的后代（成环） */
      const me = pedPick.host;
      if (id === me || !ensurePedigree().nodes[id]) return false;
      return pedDescendantsOf(me).indexOf(id) < 0;
    }
    return false;
  }
  /* 监听状态里「点一个结合线中点」＝把世系线挂到这条结合线上 */
  function pedPickTargetAnchor(ev) {
    const g = ev.target && ev.target.closest ? ev.target.closest(".ped-edge-union") : null;
    if (!g) return null;
    return { union: g.dataset.unionId };
  }
  function pedPickClick(id) {
    if (!pedPick) return;
    const mode = pedPick.kind;
    if (!pedPickValid(id)) return; // 灰掉的点不动，也不退出监听
    if (mode === "union") {
      const host = pedPick.host;
      pedPick = null;
      pedAddUnion(host, id);
    } else if (mode === "descent") {
      const anchor = pedPick.anchor;
      pedPick = null;
      pedAddDescent(anchor, id);
    } else if (mode === "descentChild") {
      const din = pedPick.descent;
      pedPick = null;
      pedSetDescentChild(din, id);
    } else if (mode === "unionEnd") {
      const { union, which } = pedPick;
      pedPick = null;
      pedReplaceUnionEnd(union, which, id);
    } else if (mode === "descentTop") {
      const d = pedPick.descent;
      pedPick = null;
      pedSetDescentTop(d, { parent: id });
    } else if (mode === "descentUp") {
      const me = pedPick.host;
      pedPick = null;
      pedAddDescent({ parent: id }, me); // 点到的对象当父，我是子
    }
  }
  function pedStartPick(pick) {
    pedPick = pick;
    renderPedigree();
    const hint =
      pick.kind === "descentTop"
        ? "点选对象或结合线中点＝替换上端锚点 · Esc 取消"
        : pedPickHintKey(pick.kind);
    showToast(uiTextFor(hint));
  }
  function pedCancelPick() {
    if (!pedPick) return false;
    pedPick = null;
    renderPedigree();
    return true;
  }

  /* ---------- 画布交互：选中 / 拖对象改代 / 拉线 / 右键菜单 ---------- */
  let pedLastSelIdx = -1;
  function pedOrderedIds() {
    const lay = pedLayout();
    return Array.from(lay.pos.keys()).sort((a, b) => lay.pos.get(a).y - lay.pos.get(b).y || lay.pos.get(a).x - lay.pos.get(b).x);
  }
  function pedSelectOne(key, ev) {
    const ctrl = !!(ev && (ev.ctrlKey || ev.metaKey));
    const shift = !!(ev && ev.shiftKey);
    if (ctrl) {
      if (pedSel.has(key)) pedSel.delete(key);
      else pedSel.add(key);
      return;
    }
    if (shift && key.indexOf(":") < 0) {
      const list = pedOrderedIds();
      const idx = list.indexOf(key);
      if (idx >= 0 && pedLastSelIdx >= 0) {
        const a = Math.min(idx, pedLastSelIdx);
        const b = Math.max(idx, pedLastSelIdx);
        for (let i = a; i <= b; i++) pedSel.add(list[i]);
        return;
      }
    }
    pedSel = new Set([key]);
    const list = pedOrderedIds();
    pedLastSelIdx = list.indexOf(key);
  }
  function pedSelectedNodeIds() {
    return Array.from(pedSel).filter((k) => k.indexOf(":") < 0);
  }
  function pedDeleteSelection() {
    const nodes = pedSelectedNodeIds();
    if (nodes.length) {
      pedRemoveObjects(nodes);
      return true;
    }
    const keys = Array.from(pedSel);
    if (!keys.length) return false;
    let done = false;
    keys.forEach((k) => {
      if (k.indexOf("u:") === 0) {
        pedRemoveUnion(k.slice(2));
        done = true;
      } else if (k.indexOf("d:") === 0) {
        pedRemoveDescent(k.slice(2));
        done = true;
      }
    });
    return done;
  }
  function bindPedigreeNodes(lay) {
    const stage = $("#pedigree-stage");
    if (!stage) return;
    const svg = $("#pedigree-svg");
    const pointOf = (ev) => pedSvgPoint(ev) || { x: 0, y: 0 }; // 排版坐标（缩放后也对得上）
    /* ① 对象：按住拖＝改代；点＝选中；右键＝菜单 */
    $$("#pedigree-nodes .pedigree-node").forEach((g) => {
      const id = g.dataset.charId;
      g.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        if (pedPick) {
          pedPickClick(id);
          return;
        }
        ev.stopPropagation();
        /* 拖拽监听挂在 document 上：画布每动一下都会重画（元素会被换掉），
           挂在元素自己身上会在重画之后断线 */
        const y0 = pointOf(ev).y;
        let dragging = false;
        const onMove = (e2) => {
          const pt = pointOf(e2);
          if (!dragging && Math.abs(pt.y - y0) < 5) return;
          dragging = true;
          pedDragRow = { id, y: Math.max(24, pt.y) };
          pedPaintLight(lay); // 只挪这一个节点 + 重画线层（不重建节点元素，免得鼠标一动就卡）
        };
        const onUp = (e2) => {
          document.removeEventListener("pointermove", onMove, true);
          document.removeEventListener("pointerup", onUp, true);
          const dy = pedDragRow && pedDragRow.id === id ? pedDragRow.y : null;
          pedDragRow = null;
          /* 松手：落到哪一行就写哪一行；**行号没变也要重画一次**，把拖拽途中的预览位置收回去
             （不然那半路的位置会一直留在那儿，看着像卡住——用户 2026-10-16 报的）。 */
          if (dragging && dy != null) {
            if (!pedSetRow(id, pedRowFromY(dy))) renderPedigree();
          }
          else {
            /* 选中没变就别重画：重画会把元素换掉，浏览器就不认这次「双击」了 */
            const before = Array.from(pedSel).join(",");
            pedSelectOne(id, e2 && e2.shiftKey ? e2 : ev);
            if (Array.from(pedSel).join(",") !== before) renderPedigree();
          }
        };
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
      });
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pedPick) return;
        pedSel = new Set([id]); // 右键＝只对一张生效
        renderPedigree();
        showPedNodeMenu(ev.clientX, ev.clientY, id);
      });
      /* 双击对象＝打开这张人物卡的信息界面（系谱这边不改卡片，只是打开看 / 编辑） */
      g.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pedPick) return;
        openCharacterModal(id);
      });
    });
    /* ①.5 回形针（在人物链里的人才有）：点一下＝弹出这条链的成员，选一个＝把这个对象换过去 */
    $$("#pedigree-nodes .ped-chain-clip").forEach((g) => {
      g.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation(); // 别让它被当成「拖节点」
      });
      g.addEventListener("dblclick", (ev) => {
        ev.stopPropagation(); // 双击回形针不该弹人物卡
      });
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (pedPick) return; // 监听状态里不打断
        openPedChainPanel({ x: ev.clientX, y: ev.clientY }, g.dataset.charId);
      });
    });
    /* ② 手柄：拖出线（结合 / 世系） */
    $$("#pedigree-nodes .ped-handle").forEach((h) => {
      h.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0 || pedPick) return;
        ev.preventDefault();
        ev.stopPropagation();
        const id = h.dataset.charId;
        const pos = lay.pos.get(id);
        if (!pos) return;
        const kind = h.dataset.handle === "union" ? "union" : "descent";
        const from =
          kind === "union" ? { x: pos.x + PED_R * 0.78, y: pos.y + PED_R * 0.78 } : { x: pos.x - PED_R * 0.78, y: pos.y + PED_R * 0.78 };
        pedDragWire = { kind, host: id, fx: from.x, fy: from.y, x: from.x, y: from.y };
        const onMove = (e2) => {
          if (!pedDragWire) return;
          const pt = pointOf(e2);
          pedDragWire.x = pt.x;
          pedDragWire.y = pt.y;
          const el = document.elementFromPoint(e2.clientX, e2.clientY);
          const node = el && el.closest ? el.closest(".pedigree-node") : null;
          pedHover = node ? node.dataset.charId : null;
          pedPaintLight(lay); // 拉线时也只重画线层
        };
        const onUp = (e2) => {
          document.removeEventListener("pointermove", onMove, true);
          document.removeEventListener("pointerup", onUp, true);
          const wire = pedDragWire;
          const el = document.elementFromPoint(e2.clientX, e2.clientY);
          const node = el && el.closest ? el.closest(".pedigree-node") : null;
          const over = node ? node.dataset.charId : "";
          pedDragWire = null;
          pedHover = null;
          if (!wire) return renderPedigree();
          if (!over || over === id) {
            renderPedigree();
            return;
          }
          pedPick = { kind: wire.kind === "union" ? "union" : "descent", host: id, anchor: wire.kind === "descent" ? { parent: id } : null };
          const valid = pedPickValid(over);
          pedPick = null;
          if (!valid) {
            showToast(uiTextFor("不能连到它（会成环或重复）"));
            renderPedigree();
            return;
          }
          if (wire.kind === "union") pedAddUnion(id, over);
          else pedAddDescent({ parent: id }, over);
        };
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
        pedPaintLight(lay); // 拉线开始：先把橡皮筋画出来（不重建节点）
      });
    });
    /* ③ 结合线：点＝选中；右键＝编辑 / 删除；中点＝世系线的起拖点 */
    $$("#pedigree-edges .ped-edge-union").forEach((g) => {
      const uid2 = g.dataset.unionId;
      const anchorEl = g.querySelector(".ped-anchor-hit") || g.querySelector(".ped-anchor");
      if (anchorEl) {
        anchorEl.addEventListener("pointerdown", (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (pedPick && pedPick.kind === "descentTop") {
            const d = pedPick.descent;
            pedPick = null;
            pedSetDescentTop(d, { union: uid2 });
            return;
          }
          if (pedPick && pedPick.kind === "descentUp") {
            /* 向上关联：点结合线中点＝认这两个当父母（双亲） */
            const u2 = pedUnionById(uid2);
            const me = pedPick.host;
            if (!u2 || !pedCanBeChild([u2.a, u2.b], me)) {
              showToast(uiTextFor("不能连到它（会成环或重复）"));
              return;
            }
            pedPick = null;
            pedAddDescent({ union: uid2 }, me);
            return;
          }
          if (pedPick) return;
          const u = pedUnionById(uid2);
          const a = lay.anchors.get(uid2);
          if (!u || !a) return;
          pedDragWire = { kind: "descentTop", host: uid2, fx: a.x, fy: a.y, x: a.x, y: a.y };
          const onMove = (e2) => {
            if (!pedDragWire) return;
            const pt = pointOf(e2);
            pedDragWire.x = pt.x;
            pedDragWire.y = pt.y;
            const el = document.elementFromPoint(e2.clientX, e2.clientY);
            const node = el && el.closest ? el.closest(".pedigree-node") : null;
            pedHover = node ? node.dataset.charId : null;
            pedPaintLight(lay); // 拉线时只重画线层
          };
          const onUp = (e2) => {
            document.removeEventListener("pointermove", onMove, true);
            document.removeEventListener("pointerup", onUp, true);
            const el = document.elementFromPoint(e2.clientX, e2.clientY);
            const node = el && el.closest ? el.closest(".pedigree-node") : null;
            const over = node ? node.dataset.charId : "";
            pedDragWire = null;
            pedHover = null;
            if (!over) return renderPedigree();
            if (!pedCanBeChild([u.a, u.b], over)) {
              showToast(uiTextFor("不能连到它（会成环或重复）"));
              return renderPedigree();
            }
            pedAddDescent({ union: uid2 }, over);
          };
          document.addEventListener("pointermove", onMove, true);
          document.addEventListener("pointerup", onUp, true);
        });
        /* 中点：点一下＝选中这条结合线；右键＝这条结合线的菜单（换一端 / 删除） */
        anchorEl.addEventListener("click", (ev) => {
          if (pedPick) return;
          ev.stopPropagation();
          pedSelectOne("u:" + uid2, ev);
          renderPedigree();
        });
        anchorEl.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (pedPick) return;
          pedSel = new Set(["u:" + uid2]);
          renderPedigree();
          showPedUnionMenu(ev.clientX, ev.clientY, uid2);
        });
      }
      g.addEventListener("click", (ev) => {
        if (pedPick) return;
        ev.stopPropagation();
        pedSelectOne("u:" + uid2, ev);
        renderPedigree();
      });
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pedPick) return;
        pedSel = new Set(["u:" + uid2]);
        renderPedigree();
        showPedUnionMenu(ev.clientX, ev.clientY, uid2);
      });
    });
    /* ④ 世系线：点＝选中；右键＝编辑 / 删除 */
    $$("#pedigree-edges .ped-edge-descent").forEach((g) => {
      const did = g.dataset.descentId;
      g.addEventListener("click", (ev) => {
        if (pedPick) return;
        ev.stopPropagation();
        pedSelectOne("d:" + did, ev);
        renderPedigree();
      });
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (pedPick) return;
        pedSel = new Set(["d:" + did]);
        renderPedigree();
        showPedDescentMenu(ev.clientX, ev.clientY, did);
      });
    });
    applyPedHover();
  }
  /* 拉线时把鼠标底下的目标点亮 / 其余灰掉（和技能树同一套） */
  function applyPedHover() {
    if (!pedDragWire) return;
    $$("#pedigree-nodes .pedigree-node").forEach((g) => {
      const id = g.dataset.charId;
      if (!pedHover) return;
      const on = id === pedHover;
      g.classList.toggle("can-link", on);
      g.classList.toggle("no-link", !on);
    });
  }

  /* ---------- 右键菜单 ---------- */
  function pedMenuItem(act, label, extra) {
    return `<div class="context-menu-item${extra || ""}" data-act="${esc(act)}"><span class="line-name">${esc(label)}</span></div>`;
  }
  /* 「左移 / 右移」两项：整个家族和左右相邻的那块换位（到边了就灰掉）。id ＝ 家族里随便一个对象。
     对象菜单、结合线菜单、世系线菜单都用这同一套。 */
  function pedMoveItems(id) {
    const { i, n } = pedFamilySlot(id);
    return [
      { act: "move-left", label: uiTextFor("左移"), disabled: !(i > 0), run: () => pedMoveFamily(id, -1) },
      { act: "move-right", label: uiTextFor("右移"), disabled: !(i >= 0 && i < n - 1), run: () => pedMoveFamily(id, 1) },
    ];
  }
  function pedShowMenu(x, y, title, items) {
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML =
      `<div class="context-menu-title">${esc(title)}</div>` +
      items
        .map((it) =>
          it.sep
            ? `<div class="context-menu-sep"></div>`
            : pedMenuItem(it.act, it.label, `${it.disabled ? " disabled" : ""}${it.danger ? " danger" : ""}`)
        )
        .join("");
    document.body.appendChild(menu);
    placeFloatingAtCursor(menu, x, y, 12, 12);
    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", () => {
        if (el.classList.contains("disabled")) return; // 灰掉的不响应
        const it = items.find((o) => o && o.act === el.dataset.act);
        if (!it) return;
        if (it.disabled) return;
        hideContextMenu();
        it.run();
      })
    );
  }
  function showPedNodeMenu(x, y, id) {
    const name = (getChar(id) || {}).name || "";
    pedShowMenu(x, y, uiSentence("pedNodeMenuTitle", name), [
      { act: "edit", label: uiTextFor("编辑"), run: () => openCharacterModal(id) },
      {
        act: "union",
        label: uiTextFor("结合…"),
        run: () => pedStartPick({ kind: "union", host: id }),
      },
      {
        act: "descent",
        label: uiTextFor("关联到…上方"),
        run: () => pedStartPick({ kind: "descent", host: id, anchors: [id], anchor: { parent: id } }),
      },
      {
        /* 向上关联：点一个对象＝认它当父（单亲）；点结合线中点＝认那两个当父母 */
        act: "descentUp",
        label: uiTextFor("关联到…下方"),
        run: () => pedStartPick({ kind: "descentUp", host: id }),
      },
      { sep: true },
      ...pedMoveItems(id),
      { sep: true },
      { act: "del", label: uiTextFor("删除"), danger: true, run: () => pedRemoveObjects([id]) },
    ]);
  }
  function showPedUnionMenu(x, y, id) {
    const u = pedUnionById(id);
    if (!u) return;
    const an = (getChar(u.a) || {}).name || "";
    const bn = (getChar(u.b) || {}).name || "";
    pedShowMenu(x, y, uiTextFor("结合线"), [
      { act: "ea", label: uiSentence("pedReplaceEnd", an), run: () => pedStartPick({ kind: "unionEnd", union: id, which: "a" }) },
      { act: "eb", label: uiSentence("pedReplaceEnd", bn), run: () => pedStartPick({ kind: "unionEnd", union: id, which: "b" }) },
      { sep: true },
      ...pedMoveItems(u.a),
      { sep: true },
      { act: "del", label: uiTextFor("删除结合线"), danger: true, run: () => pedRemoveUnion(id) },
    ]);
  }
  function showPedDescentMenu(x, y, id) {
    const d = ensurePedigree().descents.find((o) => o && o.id === id);
    if (!d) return;
    const kid = (getChar(d.child) || {}).name || "";
    pedShowMenu(x, y, uiTextFor("世系线"), [
      {
        act: "child",
        label: uiTextFor("替换下端点"),
        run: () => {
          const anchors = d.union
            ? (() => {
                const u = pedUnionById(d.union);
                return u ? [u.a, u.b] : [];
              })()
            : [d.parent];
          pedStartPick({ kind: "descentChild", descent: id, anchors, host: d.child });
        },
      },
      {
        act: "top",
        label: uiTextFor("替换上端点"),
        run: () => {
          pedPick = { kind: "descentTop", descent: id, host: "" };
          renderPedigree();
          showToast(uiTextFor("点选对象或结合线中点＝替换上端锚点 · Esc 取消"));
        },
      },
      { sep: true },
      ...pedMoveItems(d.child),
      { sep: true },
      { act: "del", label: uiTextFor("删除世系线"), danger: true, run: () => pedRemoveDescent(id) },
    ]);
  }

  /* ---------- 面板级绑定：拖人物卡进来 / 点空白 / 键盘 ---------- */
  function bindPedigree() {
    const stage = $("#pedigree-stage");
    if (!stage || stage.dataset.pedBound === "1") return;
    stage.dataset.pedBound = "1";
    const newBtn = $("#new-pedigree-btn");
    if (newBtn) newBtn.addEventListener("click", () => pedNewChart());
    const tidyBtn = $("#ped-tidy-btn");
    if (tidyBtn) tidyBtn.addEventListener("click", () => pedTidyNow());
    /* 左边栏列表项：拖动换顺序（事件委托——列表每次都重画，不用重新绑） */
    const listBody = $("#pedigree-list-body");
    if (listBody && listBody.dataset.pedDragBound !== "1") {
      listBody.dataset.pedDragBound = "1";
      const clearMarks = () =>
        $$("#pedigree-list-body .pedigree-item").forEach((el) => el.classList.remove("drag-before", "drag-after"));
      const itemOf = (ev) => (ev.target && ev.target.closest ? ev.target.closest(".pedigree-item") : null);
      const beforeOf = (ev, item) => {
        const r = item.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      };
      listBody.addEventListener("dragstart", (ev) => {
        const item = itemOf(ev);
        if (!item) return;
        if (ev.target.closest && ev.target.closest(".pedigree-item-del")) {
          ev.preventDefault();
          return;
        }
        pedChartDragId = item.dataset.pid;
        item.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", "pedchart:" + pedChartDragId);
          } catch (e) {
            /* ignore */
          }
        }
      });
      listBody.addEventListener("dragover", (ev) => {
        if (!pedChartDragId) return;
        const item = itemOf(ev);
        if (!item) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        clearMarks();
        if (item.dataset.pid !== pedChartDragId) item.classList.add(beforeOf(ev, item) ? "drag-before" : "drag-after");
      });
      listBody.addEventListener("dragleave", () => clearMarks());
      listBody.addEventListener("drop", (ev) => {
        if (!pedChartDragId) return;
        ev.preventDefault();
        const dragId = pedChartDragId;
        pedChartDragId = "";
        const item = itemOf(ev);
        let overId = "";
        let after = true;
        if (item) {
          overId = item.dataset.pid;
          after = !beforeOf(ev, item);
        } else {
          const last = Array.from($$("#pedigree-list-body .pedigree-item")).pop();
          overId = last ? last.dataset.pid : "";
          after = true;
        }
        clearMarks();
        pedReorderChart(dragId, overId, after);
      });
      listBody.addEventListener("dragend", () => {
        pedChartDragId = "";
        clearMarks();
        $$("#pedigree-list-body .pedigree-item").forEach((el) => el.classList.remove("dragging"));
      });
    }
    /* 从全站左侧的人物边栏把卡片拖进来＝加对象（落点决定它先待在第几代） */
    stage.addEventListener("dragover", (ev) => {
      const ds = typeof dragState !== "undefined" ? dragState : null;
      if (!ds || (ds.type !== "char" && ds.type !== "chars")) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      stage.classList.add("ped-drop");
    });
    stage.addEventListener("dragleave", () => stage.classList.remove("ped-drop"));
    stage.addEventListener("drop", (ev) => {
      stage.classList.remove("ped-drop");
      const ds = typeof dragState !== "undefined" ? dragState : null;
      if (!ds || (ds.type !== "char" && ds.type !== "chars")) return;
      ev.preventDefault();
      let y = PED_PAD_TOP;
      /* 落点要用**排版坐标**（pedRowFromY 按排版 px 算行号）：走 CTM 才不会被界面缩放 /
         画布自适应缩放带偏（原来拿 rect 减，缩放之后落点会偏到别的代） */
      const pt = pedSvgPoint(ev);
      if (pt) y = pt.y;
      const ids = ds.type === "chars" ? ds.ids || [] : [ds.id];
      pedAddObjects(ids, pedRowFromY(y));
    });
    /* 点空白＝清空选中 / 退出监听 */
    stage.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest(".pedigree-node, .ped-edge, .ped-anchor, .ped-handle")) return;
      let again = false;
      if (pedPick) {
        pedPick = null;
        again = true;
      }
      if (pedSel.size) {
        pedSel = new Set();
        again = true;
      }
      if (again) renderPedigree();
    });
    /* 键盘：Delete＝删选中；Esc＝退出监听（没监听就不管） */
    document.addEventListener(
      "keydown",
      (ev) => {
        const view = $("#view-pedigree");
        if (!view || view.hidden) return;
        if (document.querySelector(".modal-overlay:not([hidden]), .context-menu")) return;
        if (isTypingTarget && isTypingTarget(ev.target)) return;
        if (ev.key === "Escape") {
          if (pedCancelPick()) {
            ev.preventDefault();
            ev.stopPropagation();
          }
          return;
        }
        if (ev.key === "Delete" || ev.key === "Backspace") {
          if (!pedSel.size) return;
          ev.preventDefault();
          pedDeleteSelection();
        }
      },
      true
    );
  }
  /* 左边栏「系谱图」也挂进统一的「边栏可折叠 / 可拖宽」那套（25-ai-fill.js 的 PANE_DEFS / PANE_RESIZE）：
     拖边界条＝改宽窄、原地单击＝折叠 / 展开，状态跟着其它边栏一起记在 localStorage 里。 */
  if (typeof PANE_DEFS !== "undefined" && Array.isArray(PANE_DEFS))
    PANE_DEFS.push({
      key: "pedlist",
      target: "#pedigree-list",
      handle: "#pane-handle-pedlist",
      btn: "#pane-toggle-pedlist",
      label: "系谱图栏",
    });
  if (typeof PANE_RESIZE !== "undefined" && PANE_RESIZE) PANE_RESIZE.pedlist = { sel: "#pedigree-list", min: 120, max: 420 };
