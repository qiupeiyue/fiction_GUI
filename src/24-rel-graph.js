  /* ================= 人物分析（关系网） ================= */

  let factionAnalysisFolded = new Set(); // 势力分析表里被折叠的势力行

  /* 势力归属改过之后要一起重画的那几处：设定档案的势力卡（关联人物那排圈圈）、
     人物边栏、势力分析表、出场统计 —— 它们是同一份数据的不同视图，
     少画一处就会出现「卡片上的图标更新不及时」。 */
  function refreshFactionViews() {
    renderEntries();
    renderCharacters();
    renderFactionAnalysis();
    renderStats();
    if (factionVennOpen()) drawFactionVenn(); // 归属图开着的时候，成员变了要跟着重画
  }

  /* ================= 韦恩图（势力分析） =================
     和雷达分析一个套路：在下面的表里点势力行多选（Shift 连选 / Ctrl 加选 / 「批量」按钮），
     再点「韦恩图」把选中的 2~3 个画出来 —— 圈里是人数，右边按区域列名字（文字用大白话，不用数学符号）。
     圈子按势力聚合算人（含子级势力的人，和卡片 / 表格一个规矩）。 */
  let factionSel = new Set(); // 势力分析表里选中的行
  let factionBatchMode = false;
  let factionVennKey = ""; // 当前画的是哪几个势力（换了一批就把「谁不出现」重置掉）
  /* 交叠时那份"液体"形变的幅度：不交叠＝0（干净的椭圆），交叠＝大胆一点（用户 2026-10-16） */
  const TREE_VENN_AMP = 0.18;
  let factionVennHidden = new Set(); // 在右下角清单里被取消勾选、不画进图里的人
  // 「包含龙套」：默认不勾（和出场统计 / 雷达分析那三个选框一个规矩）
  function factionIncludesExtra() {
    const cb = $("#faction-include-extra");
    return !!(cb && cb.checked);
  }
  function factionAnalysisChars() {
    const on = factionIncludesExtra();
    return (state.characters || []).filter((c) => on || !isExtraChar(c));
  }
  /* 图里 / 清单上的势力名用短写法：层级用「›」的个数表示，不把整条路径抄一遍
     （一级＝A1；二级＝› A2；三级＝›› A3） */
  function factionVennLabel(en, inDiagram) {
    /* 「›」的个数＝图里连着往上的那几级（只有 A1 也在图里，A2 才写成「› A2」；
       A1 不在图里就只写「A2」；A3 同理：›› / › / 空 看 A1、A2 在不在图里） */
    let n = 0;
    let cur = en.parentId ? factionEntryById(en.parentId) : null;
    let guard = 0;
    while (cur && inDiagram && inDiagram.has(cur.id) && guard++ < 8) {
      n++;
      cur = cur.parentId ? factionEntryById(cur.parentId) : null;
    }
    return (n ? "›".repeat(n) + " " : "") + (en.name || "");
  }
  const VENN_COLORS = ["#8DA0CB", "#66C2A5", "#E78AC3"];

  function factionVennOpen() {
    const p = $("#faction-venn-panel");
    return !!(p && !p.hidden);
  }
  function hideFactionVenn() {
    const p = $("#faction-venn-panel");
    if (p) p.hidden = true;
    const body = $("#faction-venn-body");
    if (body) body.innerHTML = "";
    renderFactionAnalysis(); // 关掉之后表里的人恢复成普通圈圈
  }
  function showFactionVenn() {
    const p = $("#faction-venn-panel");
    if (!p) return;
    p.hidden = false;
    renderFactionAnalysis(); // 表里的人这会儿变成可点 / 有全选框
    renderFactionVenn();
    p.scrollIntoView({ block: "nearest" });
  }
  function factionVennList() {
    const cat = findCatByKind("faction");
    return cat ? state.settings.entries.filter((en) => en.categoryId === cat.id) : [];
  }
  function renderFactionVenn() {
    const body = $("#faction-venn-body");
    const title = $("#faction-venn-title");
    if (!body) return;
    if (title) title.textContent = uiTextFor("韦恩图");
    const list = factionVennList();
    if (!list.length) {
      body.innerHTML = `<p class="empty-tip small">${esc(
        uiTextFor("还没有势力。先到「设定档案 → 势力」新建势力，或者把人物直接拖到势力条目上。")
      )}</p>`;
      return;
    }
    /* 势力是在下面那张表里勾的（和雷达分析一个套路），这里只负责画 */
    /* 选了几个就画几个（同级可以左右并排，深层自动套在父级里面） */
    const picked = list.filter((en) => factionSel.has(en.id));
    const key = picked.map((en) => en.id).join(",");
    if (key !== factionVennKey) {
      factionVennKey = key;
      factionVennHidden = new Set(); // 换了一批势力：之前「不出现」的勾选不再沿用
    }
    body.innerHTML =
      (picked.length < 2
        ? `<div class="venn-actions"><span class="venn-hint">${esc(uiTextFor("先在下面的表里勾 2~3 个势力"))}</span></div>`
        : "") +
      `<div class="venn-canvas" id="faction-venn-canvas"></div>`;
    drawFactionVenn();
  }
  function drawFactionVenn() {
    const canvas = $("#faction-venn-canvas");
    if (!canvas) return;
    const list = factionVennList();
    const picked = list.filter((en) => factionSel.has(en.id));
    if (picked.length < 2) {
      canvas.innerHTML = `<p class="empty-tip small">${esc(uiTextFor("先在下面的表里勾 2~3 个势力"))}</p>`;
      return;
    }
    const inDiagram = new Set(picked.map((en) => en.id));
    const sets = picked.map((en) => ({
      name: factionVennLabel(en, inDiagram),
      ids: new Set(factionMemberIdsOf(en, true)),
    }));
    const showExtra = factionIncludesExtra();
    /* 父子势力用「包含」表示：A2 在 A1 里面，A3 又在 A2 里面 —— 一圈套一圈（不是对称交叠）。
       每个圈里只摆「自己这一层直接带进来的人」：子级的人不重复画到父级里。 */
    const nodeOf = (s, i) => {
      s.i = i;
      s.r = 30;
      s.kids = [];
      s.parentNode = null;
      s.people = [];
      return s;
    };
    sets.forEach((s, i) => nodeOf(s, i));
    const byEnId = new Map(picked.map((en, i) => [en.id, sets[i]]));
    /* 找「最近的、也被选中的祖先」当自己的容器 */
    sets.forEach((s) => {
      let en = picked[s.i];
      let cur = en.parentId ? factionEntryById(en.parentId) : null;
      let guard = 0;
      while (cur && guard++ < FACTION_MAX_LEVEL + 2) {
        if (byEnId.has(cur.id) && byEnId.get(cur.id) !== s) {
          s.parentNode = byEnId.get(cur.id);
          byEnId.get(cur.id).kids.push(s);
          break;
        }
        cur = cur.parentId ? factionEntryById(cur.parentId) : null;
      }
    });
    const charOk = (id) => {
      if (factionVennHidden.has(id)) return false;
      const c = getChar(id);
      if (!c) return false;
      if (!showExtra && isExtraChar(c)) return false;
      return true;
    };
    const sortByName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
    sets.forEach((s) => {
      const kidIds = new Set();
      s.kids.forEach((k) => k.ids.forEach((id) => kidIds.add(id)));
      s.people = Array.from(s.ids)
        .filter((id) => !kidIds.has(id) && charOk(id))
        .map((id) => getChar(id))
        .sort(sortByName);
    });
    /* 自下而上量尺寸：块要装得下「自己的名字 + 自己的人 + 里面那些子块」 */
    const ROW_H = 16;
    const CHIP_W = 104;
    const KID_GAP = 12;
    const PAD = 15;
    const CORNER = 0.8; // 超椭圆在角落会比外框收一点，量的时候补回来
    const measure = (n) => {
      n.kids.forEach(measure);
      const kidsW = n.kids.length ? n.kids.reduce((sum, k) => sum + 2 * k.hw, 0) + KID_GAP * (n.kids.length - 1) : 0;
      const kidsH = n.kids.reduce((m, k) => Math.max(m, 2 * k.hh), 0);
      const ownH = n.people.length * ROW_H;
      n.ownH = ownH;
      n.kidsW = kidsW;
      n.kidsH = kidsH;
      const innerW = Math.max(CHIP_W, kidsW);
      const innerH = 18 + ownH + (n.kids.length ? kidsH + 12 : 0);
      // 一个人都没有的势力也要画出来：给个最小尺寸，名字放得下
      n.hw = Math.max(56, innerW / 2 / CORNER + PAD);
      n.hh = Math.max(32, innerH / 2 / CORNER + PAD);
      return n;
    };
    /* 摆位置：父级定中心，子级排在它中间偏下的那条带里，同级左右并排不相叠 */
    const place = (n, cx, cy) => {
      n.cx = cx;
      n.cy = cy;
      const top = cy - n.hh + PAD * 0.6;
      n.nameY = top + 9; // 名字写在块里面最上面那条，下面留给人
      n.ownY = top + 24 + n.ownH / 2; // 自己人那一块的竖直中心
      if (!n.kids.length) return;
      const kidsTop = top + 24 + n.ownH + 10;
      let x = cx - n.kidsW / 2;
      n.kids.forEach((k) => {
        place(k, x + k.hw, kidsTop + n.kidsH / 2);
        x += 2 * k.hw + KID_GAP;
      });
    };
    sets.filter((s) => !s.parentNode).forEach(measure);
    let xAcc = 0;
    const roots = sets.filter((s) => !s.parentNode);
    roots.forEach((s) => {
      place(s, xAcc + s.hw, 0);
      xAcc += 2 * s.hw + 30;
    });
    /* ---- 交集（用户 2026-10-16）：两个**互不包含**的势力都有同一个人时，
       把这个人的胶囊画在它们交叠的那块区域里（不重复画两遍）。
       先量一下谁和谁有交集，再从各自的清单里摘掉，最后把两块往一起挪出交叠区。 ---- */
    const isNestedTeam = (a, b2) => {
      const isAnc = (x2, y2) => {
        let cur = y2.parentNode;
        let guard = 0;
        while (cur && guard++ < 12) {
          if (cur === x2) return true;
          cur = cur.parentNode;
        }
        return false;
      };
      return isAnc(a, b2) || isAnc(b2, a);
    };
    const overlapPairs = [];
    for (let i2 = 0; i2 < sets.length; i2++)
      for (let j2 = i2 + 1; j2 < sets.length; j2++) {
        const A = sets[i2];
        const B2 = sets[j2];
        if (isNestedTeam(A, B2)) continue;
        const shared = A.people.filter((c) => B2.people.some((d) => d.id === c.id));
        if (!shared.length) continue;
        const sharedIds = new Set(shared.map((c) => c.id));
        A.people = A.people.filter((c) => !sharedIds.has(c.id));
        B2.people = B2.people.filter((c) => !sharedIds.has(c.id));
        overlapPairs.push({ A, B: B2, shared });
      }
    const shiftSubtree = (n, dx) => {
      n.cx += dx;
      n.kids.forEach((k) => shiftSubtree(k, dx));
    };
    overlapPairs.forEach((o) => {
      const need = Math.max(84, o.shared.length * 17 + 26); // 交叠区要留多宽
      const gap = o.B.cx - o.B.hw - (o.A.cx + o.A.hw); // 两块之间的空隙
      if (gap + need > 0) shiftSubtree(o.B, -(gap + need));
    });
    /* 按内容缩放到画布（等比，留一点边） */
    /* 画布跟着内容走：选得少就小一点、选得多就摊开；
       面板被拖高 / 拖矮过（有固定高度）时，图按新的可用高度等比放大 / 缩小，字体不跟着变。 */
    const margin = 16;
    const panelEl = $("#faction-venn-panel");
    const headEl = panelEl ? panelEl.querySelector(".venn-head") : null;
    const dragged = !!(panelEl && panelEl.style.height); // 拖过底边才按面板高度撑
    const availW = dragged ? Math.max(240, panelEl.clientWidth - 20) : 760;
    const availH = dragged
      ? Math.max(120, panelEl.clientHeight - (headEl ? headEl.offsetHeight : 0) - 26)
      : 470;
    const minX = Math.min(...roots.map((s) => s.cx - s.hw));
    const maxX = Math.max(...roots.map((s) => s.cx + s.hw));
    const minY = Math.min(...roots.map((s) => s.cy - s.hh));
    const maxY = Math.max(...roots.map((s) => s.cy + s.hh));
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const scale = Math.max(
      0.35,
      Math.min(dragged ? 2.4 : 1, (availW - margin * 2) / contentW, (availH - margin * 2) / contentH)
    );
    const RW = Math.max(300, Math.round(contentW * scale + margin * 2));
    const RH = Math.max(190, Math.round(contentH * scale + margin * 2));
    const ox = (RW - contentW * scale) / 2 - minX * scale;
    const oy = (RH - contentH * scale) / 2 - minY * scale;
    const px = (v) => ox + v * scale;
    const py = (v) => oy + v * scale;
    /* 一块势力的形状：**不规则闭口曲线**（超椭圆 + 几层谐波起伏）——
       每块势力的相位按序号错开，看着像液体 / 拼图块，而不是一个规规矩矩的椭圆（用户 2026-10-16）。
       起伏幅度压在 10% 以内，保证里面的人和名字照样装得下。 */
    /* amp＝形变幅度：**0＝规规矩矩的超椭圆**（只有必要时才形变，用户 2026-10-16：
       势力成员交叠时才需要"液体"感，平时保持干净好看）。 */
    const blobPath = (cx, cy, hw, hh, seed, amp) => {
      const p = 3.2;
      const steps = 120;
      const amt = amp || 0;
      const ph = (seed || 0) * 1.7;
      let d = "";
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        const k =
          1 +
          amt *
            (0.5 * Math.sin(3 * t + ph) + 0.3 * Math.sin(5 * t + ph * 2.1) + 0.2 * Math.sin(2 * t + ph * 0.7));
        const x = cx + hw * k * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p);
        const y = cy + hh * k * Math.sign(st) * Math.pow(Math.abs(st), 2 / p);
        d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      }
      return d + "Z";
    };
    const allNodes = [];
    const collectNodes = (n) => {
      allNodes.push(n);
      n.kids.forEach(collectNodes);
    };
    roots.forEach(collectNodes);
    /* 交叠的两块：各自在**对方内部**的那段描边要藏起来，看着才像两滴水黏在一起（用户 2026-10-16）。
       做法＝给每块配一张遮罩（白底 + 对方稍微缩小的黑块），描边时套上它。 */
    const overlapPartner = new Map(); // 节点 -> 和它交叠的另一块
    overlapPairs.forEach((o) => {
      if (!overlapPartner.has(o.A)) overlapPartner.set(o.A, o.B);
      if (!overlapPartner.has(o.B)) overlapPartner.set(o.B, o.A);
    });
    const maskHtml = Array.from(overlapPartner.entries())
      .map(([n, other]) => {
        const shrink = 0.985;
        const d2 = blobPath(
          px(other.cx),
          py(other.cy),
          other.hw * scale * shrink,
          other.hh * scale * shrink,
          other.i + 1,
          TREE_VENN_AMP
        );
        return `<mask id="vennMask${allNodes.indexOf(n)}" maskUnits="userSpaceOnUse" x="0" y="0" width="${RW}" height="${RH}"><rect x="0" y="0" width="${RW}" height="${RH}" fill="#fff" /><path d="${d2}" fill="#000" /></mask>`;
      })
      .join("");
    const circleHtml = allNodes
      .slice()
      .sort((a, b) => b.hw * b.hh - a.hw * a.hh) // 大的先画，小的压在上面
      .map(
        (n) =>
          `<path d="${blobPath(px(n.cx), py(n.cy), n.hw * scale, n.hh * scale, n.i + 1, overlapPartner.has(n) ? TREE_VENN_AMP : 0)}"${
            overlapPartner.has(n) ? ` mask="url(#vennMask${allNodes.indexOf(n)})"` : ""
          } fill="${
            VENN_COLORS[n.i % VENN_COLORS.length]
          }" fill-opacity="0.1" stroke="${VENN_COLORS[n.i % VENN_COLORS.length]}" stroke-opacity="0.85" stroke-width="1.4" />`
      )
      .join("");
    const nameHtml = allNodes
      .map(
        (n) =>
          `<text x="${px(n.cx).toFixed(1)}" y="${py(n.nameY).toFixed(1)}" text-anchor="middle" style="fill:${
            VENN_COLORS[n.i % VENN_COLORS.length]
          };font-size:${Math.max(9, 11 * scale).toFixed(1)}px;font-weight:600">${esc(n.name)}</text>`
      )
      .join("");
    const chipHtml = allNodes
      .filter((n) => n.people.length)
      .map((n) => {
        const rows = n.people.map(
          (c) =>
            `<div class="venn-chip">${avatarHtml(c)}<span class="venn-chip-name" title="${esc(c.name || "")}">${esc(
              c.name || ""
            )}</span></div>`
        );
        const w = Math.max(60, CHIP_W * scale);
        const h = (n.people.length * ROW_H + 4) * scale;
        return `<foreignObject x="${(px(n.cx) - w / 2).toFixed(1)}" y="${(py(n.ownY) - h / 2).toFixed(
          1
        )}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"><div xmlns="http://www.w3.org/1999/xhtml" class="venn-region" style="font-size:${Math.max(
          7.5,
          9 * scale
        ).toFixed(1)}px">${rows.join("")}</div></foreignObject>`;
      })
      .join("");
    /* 交叠区里那份名单：画在两块之上，位置取两块交叠的中间 */
    const overlapHtml = overlapPairs
      .filter((o) => o.shared.length)
      .map((o) => {
        const cx = (o.A.cx + o.A.hw + (o.B.cx - o.B.hw)) / 2;
        const cy = (o.A.cy + o.B.cy) / 2;
        const rows = o.shared.map(
          (c) =>
            `<div class="venn-chip">${avatarHtml(c)}<span class="venn-chip-name" title="${esc(c.name || "")}">${esc(
              c.name || ""
            )}</span></div>`
        );
        const w = Math.max(60, CHIP_W * scale);
        const h = (o.shared.length * ROW_H + 4) * scale;
        return `<foreignObject x="${(px(cx) - w / 2).toFixed(1)}" y="${(py(cy) - h / 2).toFixed(
          1
        )}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"><div xmlns="http://www.w3.org/1999/xhtml" class="venn-region venn-overlap" style="font-size:${Math.max(
          7.5,
          9 * scale
        ).toFixed(1)}px">${rows.join("")}</div></foreignObject>`;
      })
      .join("");
    canvas.innerHTML = `<svg width="${RW}" height="${RH}" viewBox="0 0 ${RW} ${RH}" role="img"><defs>${maskHtml}</defs>${circleHtml}${nameHtml}${chipHtml}${overlapHtml}</svg>`;

    return Array.from(document.querySelectorAll("#faction-analysis tr[data-faction-row]")).map((tr) => tr.dataset.factionRow);
  }
  // Delete：删掉选中的势力（子级一起删，不弹确认、可撤销 —— 和设定档案一致）
  function deleteSelectedFactions() {
    const ids = expandEntryIdsWithFactionDescendants(Array.from(factionSel));
    const list = state.settings.entries.filter((en) => ids.indexOf(en.id) >= 0);
    if (!list.length) return 0;
    pendingUndoLabel = `删除 ${list.length} 个势力`;
    state.settings.entries = state.settings.entries.filter((en) => ids.indexOf(en.id) < 0);
    (state.characters || []).forEach((c) => {
      if ((c.factionIds || []).some((f) => ids.indexOf(f) >= 0))
        c.factionIds = (c.factionIds || []).filter((f) => ids.indexOf(f) < 0);
    });
    factionSel = new Set();
    factionBatchMode = false;
    saveState();
    renderCategories();
    refreshFactionViews();
    renderEntryBatchBar();
    showToast(`已删除 ${list.length} 个势力（子级一起删，可撤销）`);
    return list.length;
  }

  /* A-Z：**按层级**排 —— 一级之间按名字排，每个一级下面再按名字排它的子级，逐级递归，
     最后吐出「A(a(…)b(…))B(…)C(…)」这样的顺序。
     和设定档案那个「所有卡一起按名字排、不分级」的 A-Z 不是一个东西。可撤销。 */
  function sortFactionsByTreeAZ() {
    const cat = findCatByKind("faction");
    if (!cat) return;
    const mine = state.settings.entries.filter((en) => en.categoryId === cat.id);
    if (mine.length < 2) {
      showToast(`「${catDisplayName(cat)}」还不到两条，不用排序`);
      return;
    }
    const byId = new Map(mine.map((en) => [en.id, en]));
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const cmp = (a, b) => collator.compare(String(a.name || ""), String(b.name || "")) || (a.id < b.id ? -1 : 1);
    const out = [];
    const seen = new Set();
    const walk = (en) => {
      if (!en || seen.has(en.id)) return;
      seen.add(en.id);
      out.push(en);
      mine
        .filter((x) => x.parentId === en.id)
        .sort(cmp)
        .forEach(walk);
    };
    mine
      .filter((en) => !en.parentId || !byId.has(en.parentId))
      .sort(cmp)
      .forEach(walk);
    mine.forEach(walk); // 兜底：父级不在这一类里的也别漏
    pendingUndoLabel = `按 A-Z 分级排序：「${catDisplayName(cat)}」`;
    let i = 0;
    state.settings.entries = state.settings.entries.map((en) => (en.categoryId === cat.id ? out[i++] : en));
    saveState();
    refreshFactionViews();
    renderEntryBatchBar();
    showToast(`已把「${catDisplayName(cat)}」按 A-Z 分级排好（可撤销）`);
  }
  /* 势力分析表「势力」那一列的列宽：用户可以直接拖表头右边缘调；
     没拖过＝0＝按内容自适应。存本机（和界面缩放那样是看表格的偏好，不进存档）。 */
  const FACTION_COL_W_KEY = "fiction_gui_faction_col_w_v1";
  let factionColW = 0;
  let factionColWLoaded = false;
  function factionColWidth() {
    if (!factionColWLoaded) {
      factionColWLoaded = true;
      const v = parseFloat(localStorage.getItem(FACTION_COL_W_KEY));
      if (v >= 82 && v <= 2000) factionColW = Math.round(v);
    }
    return factionColW;
  }
  function bindFactionColResize(box) {
    const table = box.querySelector("table.faction-table");
    const head = box.querySelector("thead th.faction-corner");
    if (!table || !head) return;
    /* 整条列边（表头 + 每一行的右边缘）都能拖：事件代理到表上，
       点在哪个把手都算，不用一行一行绑。 */
    table.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      const hit = ev.target && ev.target.closest ? ev.target.closest("[data-col-resizer]") : null;
      if (!hit || !table.contains(hit)) return;
      ev.preventDefault(); // 别顺手触发「双击群组名改名」那一套
      ev.stopPropagation();
      const zoom = uiZoomScale(table) || 1;
      const startW = Math.round(head.getBoundingClientRect().width / zoom);
      const startX = ev.clientX;
      /* 上限跟着表格当前宽度走：别让分组那几列被挤到没有地方（也不硬顶在 460 上，
         不然一拖就「啪」地缩到 460，和用户看到的位置对不上） */
      const others = Math.max(1, table.querySelectorAll("thead th").length - 1);
      const maxW = Math.max(200, Math.round(table.getBoundingClientRect().width / zoom) - 110 * others);
      /* 不拖就不加 colgroup —— 保持原来的自适应排版；第一次拖才补上，之后按这一列走 */
      let col = table.querySelector("colgroup > col");
      if (!col) {
        const cg = document.createElement("colgroup");
        const n = table.querySelectorAll("thead th").length;
        for (let i = 0; i < n; i++) cg.appendChild(document.createElement("col"));
        table.insertBefore(cg, table.firstChild);
        col = cg.firstChild;
      }
      document.body.classList.add("col-resizing");
      const onMove = (e) => {
        const dx = (e.clientX - startX) / zoom;
        col.style.width = Math.max(82, Math.min(maxW, Math.round(startW + dx))) + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.classList.remove("col-resizing");
        const w = parseFloat(col.style.width);
        if (!w) return;
        factionColW = Math.round(w);
        factionColWLoaded = true;
        try {
          localStorage.setItem(FACTION_COL_W_KEY, String(factionColW));
        } catch (e) {
          /* ignore */
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  // 人物势力分析：行 = 势力，列 = 人物分组，交叉展示谁属于哪个阵营
  /* 某一列（分组）里「这次示意图涉及的」人：选中的那几个势力的成员 ∩ 这个分组 */
  function factionVennColumnIds(groupId) {
    const cat = findCatByKind("faction");
    const sel = cat ? state.settings.entries.filter((en) => en.categoryId === cat.id && factionSel.has(en.id)) : [];
    const out = new Set();
    const on = factionIncludesExtra();
    sel.forEach((en) =>
      factionMemberIdsOf(en, true).forEach((id) => {
        const c = getChar(id);
        if (!c) return;
        if (!on && isExtraChar(c)) return;
        if (charBucketIdOf(c) === groupId) out.add(id);
      })
    );
    return Array.from(out);
  }
  function renderFactionAnalysis() {
    const box = $("#faction-analysis");
    if (!box) return;
    const cat = findCatByKind("faction");
    const factions = cat ? state.settings.entries.filter((e) => e.categoryId === cat.id) : [];
    // 选中的势力被删掉 / 换类别之后，选择里别留着幽灵
    if (factionSel.size) factionSel = new Set(Array.from(factionSel).filter((id) => factions.some((f) => f.id === id)));
    // 用和人物边栏同一套「这个人属于哪个分组桶」的判断：人物挂在一个已经不存在 / 被删掉的
    // 分组上时，那边会把它显示在「未分组」里，这里也必须算进「未分组」，
    // 否则每一列都数出 0 个人 → 整张表的列会全空（只剩最左边「势力 ＼ 分组」那一列）。
    const inGroup = (c, gid) => charBucketIdOf(c) === gid;
    const charsAll = factionAnalysisChars(); // 「包含龙套」没勾时，龙套不进这张表
    if (!charsAll.length) {
      box.innerHTML = `<p class="empty-tip">还没有任何人物。</p>`;
      return;
    }
    if (!factions.length) {
      box.innerHTML = `<p class="empty-tip">还没有势力。先到「设定档案 → 势力」新建势力，或者把人物直接拖到势力条目上。</p>`;
      return;
    }
    // 列 = 有人的人物分组（按人物栏的顺序）+ 未分组
    const cols = charGroupBucketsOrder()
      .map(({ id, group: g }) => ({
        id,
        name: g ? g.name : "未分组",
        count: charsAll.filter((c) => inGroup(c, id)).length,
      }))
      .filter((col) => col.count > 0);

    const factionIds = new Set(factions.map((f) => f.id));
    /* 每个人「实际挂在哪条势力下」的完整路径：并上来的胶囊靠它标出来，
       悬浮能看到这个人本来在哪一条（路径本身与语言无关，就不用翻译） */
    const ownerPathOfChar = new Map();
    factions.forEach((f) =>
      (f.characterIds || []).forEach((id) => {
        const p = factionPathOf(f);
        const prev = ownerPathOfChar.get(id);
        if (!prev || p.length > prev.length) ownerPathOfChar.set(id, p);
      })
    );
    const chipHtml = (list, rowPath, rowId, rowEntry) =>
      list.length
        ? list
            .map((c) => {
              const own = ownerPathOfChar.get(c.id) || "";
              /* 只有「这一行自己没挂他、是折叠时从子级并上来的人」才淡一点 + 悬浮说明出处。
                 他本来就挂在这条势力下（同时又属于别的势力）时，不给悬浮 —— 那会看着莫名其妙。 */
              const direct = !!(rowEntry && (rowEntry.characterIds || []).includes(c.id));
              const fromBelow = !!(rowPath && own && own !== rowPath && rowEntry && !direct);
              const canPick = factionVennOpen() && rowId && factionSel.has(rowId);
              /* 韦恩图开着的时候：表里这些人的圈圈可以直接点 —— 点一下＝从图里拿掉 / 放回去 */
              return `<span class="faction-chip${fromBelow ? " from-below" : ""}${
                canPick && factionVennHidden.has(c.id) ? " venn-off" : ""
              }" data-char-id="${esc(c.id)}"${
                fromBelow ? ` title="${esc(own)}"` : ""
              }${canPick ? ` data-venn-char="${esc(c.id)}"` : ""}>${avatarHtml(c)}${esc(c.name)}</span>`;
            })
            .join("")
        : `<span class="faction-empty">—</span>`;

    /* 「势力」这一列的列宽可以拖：把手就是这一列右边缘那一条细线（表头 + 每一行都有） */
    const colResizer = `<span class="col-resizer" data-col-resizer="1" title="${esc(uiTextFor("拖动调整列宽"))}"></span>`;
    let headHtml = `<tr><th class="faction-corner">势力 ＼ 分组${colResizer}</th>`;
    cols.forEach((col) => {
      const tip = col.id ? `${col.name}（双击改群名）` : col.name;
      const colIds = factionVennOpen() ? factionVennColumnIds(col.id) : [];
      const colOff = colIds.filter((id) => factionVennHidden.has(id)).length;
      headHtml += `<th ${col.id ? `class="faction-col-name" data-group-id="${esc(col.id)}"` : ""} title="${esc(tip)}">${
        factionVennOpen()
          ? `<input type="checkbox" class="venn-col-all" data-venn-group-id="${esc(col.id)}" title="${esc(
              uiTextFor("这一列的人全画 / 全不画")
            )}" ${colIds.length && !colOff ? "checked" : colOff && colOff < colIds.length ? "data-half=1" : ""} />`
          : ""
      }${esc(
        col.name
      )} <span class="faction-count">${col.count}</span></th>`;
    });
    headHtml += `</tr>`;
    /* 按层级缩进显示（plan.md 第 13 条）：一级在前，紧跟着它的子级（深度优先），
       有子级的行前面给一个折角，点一下收起 / 展开它下面的行。 */
    const byId = new Map(factions.map((f) => [f.id, f]));
    const ordered = [];
    const walk = (f) => {
      ordered.push(f);
      factions.filter((x) => x.parentId === f.id).forEach(walk);
    };
    factions.filter((f) => !f.parentId || !byId.has(f.parentId)).forEach(walk);
    factions.forEach((f) => {
      if (!ordered.includes(f)) ordered.push(f);
    });
    const hiddenBy = new Map(); // 每个被折叠的行 → 它藏起来的后代 id
    ordered.forEach((f) => {
      const kids = [];
      const collect = (x) => factions.filter((y) => y.parentId === x.id).forEach((y) => { kids.push(y.id); collect(y); });
      collect(f);
      hiddenBy.set(f.id, kids);
    });
    let html = "";
    // 这一行是不是被上面某个折叠行藏起来了（藏起来的行不画）
    const hiddenRows = new Set();
    ordered.forEach((f) => {
      if (ordered.some((p) => p.id !== f.id && factionAnalysisFolded.has(p.id) && (hiddenBy.get(p.id) || []).indexOf(f.id) >= 0))
        hiddenRows.add(f.id);
    });
    /* 每一行实际画谁：谁的人画在哪一行 —— 规则只有一条：
       这一行自己「看得见、没折叠」就画在自己这一行；否则往上并到「上面第一条看得见的行」。
       于是：二级被折叠时，三级的人并进二级那一行；一级被折叠时，二级三级的人全并进一级那一行；
       而二级自己被折叠时，它的人也会并到一级（甲在 A1›A2 里，折叠 A2 后甲出现在 A1）。 */
    const visibleRow = (x) => !hiddenRows.has(x.id);
    const memberHomeOf = (f) => {
      if (visibleRow(f) && !factionAnalysisFolded.has(f.id)) return f;
      let cur = f.parentId ? byId.get(f.parentId) : null;
      let guard = 0;
      while (cur && guard++ < FACTION_MAX_LEVEL + 2) {
        if (visibleRow(cur)) return cur;
        cur = cur.parentId ? byId.get(cur.parentId) : null;
      }
      return f; // 上面一条都没有：留在自己这一行
    };
    const shownMembers = new Map();
    ordered.forEach((f) => shownMembers.set(f.id, new Set(f.characterIds || [])));
    ordered.forEach((f) => {
      const home = memberHomeOf(f);
      if (home && home.id !== f.id) (f.characterIds || []).forEach((id) => shownMembers.get(home.id).add(id));
    });
    ordered.forEach((f) => {
      const foldedIds = factionAnalysisFolded;
      if (hiddenRows.has(f.id)) return;
      const members = shownMembers.get(f.id) || new Set(f.characterIds || []);
      const deepSet = new Set(factionMemberIdsOf(f, true)); // 整支的人（判「—」用）
      const level = factionLevelOf(f);
      const kids = hiddenBy.get(f.id) || [];
      const caret = kids.length
        ? `<span class="fx-fold" data-fold="${esc(f.id)}">${foldedIds.has(f.id) ? "▸" : "▾"}</span>`
        : `<span class="fx-fold" style="visibility:hidden">▾</span>`;
      const rowPath = factionPathOf(f);
      const indent = (level - 1) * 12 + 6;
      /* 层级感：缩进 + 一条折线（父级在左上、子级往右下）+ 和势力卡同一套的 Ⅱ / Ⅲ 小标签 */
      const tone = level > 1 ? `rgba(141, 160, 203, ${level === 2 ? 1 : 0.55})` : "";
      const tree = level > 1 ? `<span class="fx-tree" aria-hidden="true" style="left:${indent - 8}px"></span>` : "";
      const lvChip =
        level > 1
          ? `<span class="entry-level-chip" title="${esc(uiTextFor(level === 2 ? "二级势力" : "三级势力"))}">${
              level === 2 ? "Ⅱ" : "Ⅲ"
            }</span>`
          : "";
      html += `<tr data-faction-row="${esc(f.id)}" class="flv-${level}"><th class="faction-name" data-faction-id="${esc(
        f.id
      )}" title="${esc(rowPath)}（双击编辑 / 右键更多操作）" style="padding-left:${indent}px${
        tone ? `;--flv-c:${tone}` : ""
      }">${tree}${caret}${esc(f.name)}${lvChip} <span class="faction-count">${members.size}</span>${colResizer}</th>`;
      cols.forEach((col) => {
        /* 「—」只代表整支都没人：自己这层空、但子级有人时，给个「▾ 见下级（N）」 */
        const own = charsAll.filter((c) => members.has(c.id) && inGroup(c, col.id));
        const sub = own.length ? [] : charsAll.filter((c) => deepSet.has(c.id) && inGroup(c, col.id));
        html += own.length
          ? `<td>${chipHtml(own, rowPath, f.id, f)}</td>`
          : sub.length
          ? `<td><span class="faction-sub-hint">▾ ${esc(uiTextFor("见下级"))}（${sub.length}）</span></td>`
          : `<td>${chipHtml([], rowPath, f.id)}</td>`;
      });
      html += `</tr>`;
    });
    // 末尾补一行：还没有归属的人物
    html += `<tr class="faction-none"><th class="faction-name">（未加入任何势力）${colResizer}</th>`;
    cols.forEach((col) => {
      html += `<td>${chipHtml(
        charsAll.filter(
          (c) => !(c.factionIds || []).some((id) => factionIds.has(id)) && inGroup(c, col.id)
        )
      )}</td>`;
    });
    html += `</tr>`;
    /* 一整张表放在 .table-scroll 里：表头 sticky 钉住，可见的滚动条由「代滚动条」画在表头下面。
       拖过列宽就带上 colgroup（没拖过不加，保持自适应）。 */
    const colW = factionColWidth();
    box.innerHTML = `<div class="table-scroll"><table class="faction-table${factionBatchMode ? " batch-mode" : ""}">${
      colW ? `<colgroup><col style="width:${colW}px">${cols.map(() => "<col>").join("")}</colgroup>` : ""
    }<thead>${headHtml}</thead><tbody>${html}</tbody></table></div>`;
    syncTableScrollProxies(box);
    bindFactionColResize(box);
    /* 选中状态 + 点行选中：和雷达分析那一套完全一样
       （普通单击＝只选这一行；Shift＝连选、Ctrl＝加选，都会自动进批量；「批量」按钮手动切） */
    const visibleIds = ordered.map((f) => f.id);
    box.querySelectorAll("tr[data-faction-row]").forEach((tr) => {
      const id = tr.dataset.factionRow;
      if (factionSel.has(id)) tr.classList.add("selected");
      tr.querySelectorAll("[data-venn-char]").forEach((chip) =>
        chip.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const cid = chip.dataset.vennChar;
          if (factionVennHidden.has(cid)) factionVennHidden.delete(cid);
          else factionVennHidden.add(cid);
          renderFactionAnalysis();
          drawFactionVenn();
        })
      );

      tr.addEventListener("click", (ev) => {
        if (ev.target.closest(".fx-fold")) return; // 折角是收 / 展开，不算选行
        if (ev.shiftKey) {
          shiftClickCard("faction", id, visibleIds, factionSel, ev.ctrlKey || ev.metaKey);
          return;
        }
        if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          factionBatchMode = true;
          toggleClickCard("faction", id, factionSel);
          return;
        }
        if (factionBatchMode) {
          toggleClickCard("faction", id, factionSel);
          return;
        }
        // 不在批量模式时：普通单击＝只选这一个；再点同一个＝取消
        markShortcutAnchor("faction", id);
        const onlyThis = factionSel.size === 1 && factionSel.has(id);
        applyPaneSelection("faction", onlyThis ? [] : [id]);
      });
    });
    /* 分组列名上的全选框：整列的人全画 / 全不画 */
    box.querySelectorAll("[data-venn-group-id]").forEach((cb) => {
      const ids = factionVennColumnIds(cb.dataset.vennGroupId);
      if (ids.some((id) => factionVennHidden.has(id))) cb.indeterminate = ids.some((id) => !factionVennHidden.has(id));
      cb.addEventListener("click", (ev) => ev.stopPropagation());
      cb.addEventListener("change", () => {
        ids.forEach((id) => (cb.checked ? factionVennHidden.delete(id) : factionVennHidden.add(id)));
        renderFactionAnalysis();
        if (factionVennOpen()) drawFactionVenn();
      });
    });
    const selN = factionSel.size;
    const cnt = $("#faction-sel-count");
    if (cnt)
      cnt.textContent = factionBatchMode || selN ? (selN ? `已选 ${selN} 个` : uiTextFor("点势力行勾选 · Shift 连选")) : "";
    const vennBtn = $("#faction-venn-btn");
    if (vennBtn) vennBtn.disabled = selN < 2;
    // 双击最左边的势力名＝打开这条势力的完整信息界面（改名 / 字段 / 关联人物 / 删除都在里面）
    // 折角：收起 / 展开它下面的子级行
    box.querySelectorAll(".fx-fold[data-fold]").forEach((el) =>
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = el.dataset.fold;
        if (factionAnalysisFolded.has(id)) factionAnalysisFolded.delete(id);
        else factionAnalysisFolded.add(id);
        renderFactionAnalysis();
      })
    );
    box.querySelectorAll("th.faction-name[data-faction-id]").forEach((th) =>
      th.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openEntryModal(th.dataset.factionId);
      })
    );
    // 横轴的群组名：双击也能改名（程序自带的固定分组：未分组 / 龙套，不能改）
    box.querySelectorAll("th.faction-col-name[data-group-id]").forEach((th) =>
      th.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const g = getGroup(th.dataset.groupId);
        if (g && g.special !== UNGROUPED_SPECIAL && g.special !== "extra") renameGroup(g.id);
      })
    );
    // 右键势力名：和「设定档案 → 势力」里势力卡片的右键菜单同一套功能
    box.querySelectorAll("th.faction-name[data-faction-id]").forEach((th) =>
      th.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showFactionAnalysisMenu(ev.clientX, ev.clientY, th.dataset.factionId);
        markContextTarget(th);
      })
    );
    // 从人物边栏把人物拖到某个势力这一行＝把这个人物加进该势力
    // （和「设定档案」里把人物拖到势力卡片上完全一样，双向同步）
    box.querySelectorAll("tr[data-faction-row]").forEach((tr) => {
      tr.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        tr.classList.add("char-drop");
      });
      tr.addEventListener("dragleave", () => tr.classList.remove("char-drop"));
      tr.addEventListener("drop", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        tr.classList.remove("char-drop");
        const fid = tr.dataset.factionRow;
        const en = getEntry(fid);
        const ids = (data.type === "chars" ? data.ids : [data.id]).filter((id) => getChar(id));
        const before = new Set((en && en.characterIds) || []);
        const fresh = ids.filter((id) => !before.has(id));
        addCharsToEntry(ids, fid);
        if (en && fresh.length) showToast(`已把 ${fresh.length} 位人物加入「${en.name}」`);
      });
    });
  }

  // 势力分析里右键某个势力：编辑 / 复制 / 合并到… / 删除（和设定档案里的势力卡片功能一致）
  function showFactionAnalysisMenu(x, y, entryId) {
    const en = getEntry(entryId);
    if (!en) return;
    renderContextMenu(x, y, `「${en.name}」`, [
      { label: "编辑", act: () => openEntryModal(entryId) },
      {
        label: "复制",
        act: () => {
          const n = copyEntries([entryId]);
          if (n) showToast(`已复制设定条目：${copyItemName(en.name)}`);
        },
      },
      { label: "所属…", act: () => openFactionParentPrompt(entryId, { x, y }) },
      { label: "合并到…", act: () => showEntryMergeMenu(x, y, entryId, { noConfirm: true }) },
      { label: "删除", danger: true, act: () => deleteEntryById(entryId) },
    ]);
  }

