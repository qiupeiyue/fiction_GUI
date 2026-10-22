  /* ================= 人物分析 ================= */
  // 诊断：为什么某个名字没被识别出来
  async function diagnoseName() {
    const q = (await uiPrompt("要检查的名字？（例如：莉芙）") || "").trim();
    if (!q) return;
    const lines = [];

    // 1) 人物库里有没有
    const inLib = state.characters.filter(
      (c) => c.name.includes(q) || (c.aliases || []).some((a) => String(a).includes(q)) || q.includes(c.name)
    );
    lines.push(
      inLib.length
        ? `① 人物库里有 ${inLib.length} 个匹配：` + inLib.map((c) => `${c.name}${isExtraChar(c) ? "（龙套组，二维事件图默认不显示）" : ""}`).join("、")
        : "① 人物库里没有匹配 —— 说明回填这一步没建出这个人物"
    );

    // 2) 原文里出现多少次
    let textHits = 0;
    const where = [];
    (state.analysis.tasks || []).forEach((t) => {
      (t.segments || []).forEach((s) => {
        const f = (t.files || []).find((x) => x.id === s.fileId);
        if (!f) return;
        const txt = (f.text || "").slice(s.start, s.end);
        const n = txt.split(q).length - 1;
        if (n) {
          textHits += n;
          where.push(`${s.label}（${n}）`);
        }
      });
    });
    lines.push(
      textHits
        ? `② 原文里出现 ${textHits} 次：` + where.slice(0, 12).join("、")
        : "② 在已导入的原文里没找到这个字串 —— 可能是写法不同（比如只写了全名或只写了姓氏）"
    );

    // 3) 分析结果里有没有
    const recs = [];
    (state.analysis.tasks || []).forEach((t) =>
      (t.results || []).forEach((r) => {
        const hay = [r.name, ...(r.fields || []).map((f) => f.value), r.summary].join(" ");
        if (hay.includes(q)) recs.push(r);
      })
    );
    lines.push(
      recs.length
        ? `③ 分析结果里有 ${recs.length} 条相关记录：` + recs.slice(0, 8).map((r) => `${r.type}·${r.name || ""}`).join("、")
        : "③ 分析结果里没有相关记录 —— 是模型漏抽，建议用更完整的模型重跑这一段，或在提示词里点名要求"
    );

    // 4) 事件登场
    const inEvents = state.events.filter((e) =>
      (e.characterIds || [])
        .map((id) => getChar(id))
        .filter(Boolean)
        .some((c) => c.name.includes(q))
    );
    lines.push(inEvents.length ? `④ 有 ${inEvents.length} 个事件记录了她登场` : "④ 事件里也没有她的登场记录");

    lines.push("提示：若①为否而③为是，是回填环节的问题；③为否就是模型没抽到，重跑该章即可。");
    uiAlert(lines.join("\n\n"));
  }

  // 龙套自动纠错：出场足够多、跨章多的角色不该被当成龙套
  function promoteActiveExtras(silent) {
    const gid = extraGroupIdOf();
    if (!gid) return 0;
    let moved = 0;
    state.characters.forEach((c) => {
      if ((c.groupId || "") !== gid) return;
      const evs = state.events.filter((e) => (e.characterIds || []).includes(c.id));
      const chapters = new Set();
      evs.forEach((e) => {
        if (e.chapterId) chapters.add(e.chapterId);
      });
      if (evs.length >= 3 || chapters.size >= 2) {
        c.groupId = "";
        c.notes = [c.notes, "（出场较多，已自动从龙套移出）"].filter(Boolean).join("\n");
        moved++;
      }
    });
    if (moved) {
      saveState();
      renderCharacters();
      renderMatrix();
      renderStats();
      if (!silent) uiAlert(`已把 ${moved} 位出场较多的角色从「龙套」移出。`);
    } else if (!silent) {
      uiAlert("「龙套」里没有需要移出的角色。");
    }
    return moved;
  }

  function computeStats() {
    const includeExtra = $("#stats-include-extra") && $("#stats-include-extra").checked;
    const chars = state.characters.filter((c) => includeExtra || !isExtraChar(c));
    const totalEvents = state.events.length || 1;
    const rows = chars.map((c) => {
      const evs = state.events.filter((e) => (e.characterIds || []).includes(c.id));
      const lines = new Set();
      const chapters = new Set();
      evs.forEach((e) => {
        linesOf(e).forEach((id) => lines.add(id));
        if (e.chapterId) chapters.add(e.chapterId);
      });
      const sorted = evs.slice().sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0));
      const score = evs.length * 1 + lines.size * 1.5 + chapters.size * 1;
      return {
        char: c,
        eventCount: evs.length,
        ratio: evs.length / totalEvents,
        lineCount: lines.size,
        chapterCount: chapters.size,
        first: sorted[0] || null,
        last: sorted[sorted.length - 1] || null,
        score,
      };
    });
    const max = rows.reduce((m, r) => Math.max(m, r.score), 0) || 1;
    rows.forEach((r) => {
      r.pct = Math.round((r.score / max) * 100);
    });
    return rows;
  }

  function renderStats() {
    const wrap = $("#stats-table-wrap");
    if (!wrap) return;
    const allRows = computeStats();
    // 顶部的分组过滤条（按分组多选 + 全选），只影响表格，不影响上面的概览卡片
    const statsBar = $("#stats-group-filter");
    if (statsBar) {
      const groupBox = $("#stats-group-groups");
      if (!allRows.length) {
        statsBar.hidden = true;
        if (groupBox) groupBox.innerHTML = "";
      } else {
        const gf = groupFilterHtml(allRows.map((r) => r.char), statsHiddenGroups);
        if (groupBox) {
          groupBox.innerHTML = gf.html;
          bindGroupFilter(groupBox, gf.groups, statsHiddenGroups, renderStats);
        }
        // 没有分组可筛选时，这一行整条收起来（搜索框已经挪到右上角了）
        statsBar.hidden = !gf.html;
      }
    }
    const rows = allRows.filter((r) => !statsHiddenGroups.has(charBucketIdOf(r.char)));
    // 搜索命中谁，就把和它同一条链的人也带出来（名字后面挂回形针）
    const statsPicked = withChainMates(rows, statsQuery, (r) => r.char);
    const shownRows = statsPicked.rows;

    // 概览卡片
    const extras = state.characters.filter((c) => isExtraChar(c)).length;
    const total = state.characters.length;
    // 概览数字＝整个工作区的口径（不受顶部按分组过滤影响）
    const withEvents = allRows.filter((r) => r.eventCount > 0).length;
    const avg = allRows.length ? (allRows.reduce((s, r) => s + r.eventCount, 0) / allRows.length).toFixed(1) : "0";
    // 概览不再占一整行卡片，改成搜索框左边的一行字（跟着界面语言）
    const summary = $("#stats-summary");
    if (summary) summary.textContent = uiSentence("statsSummary", total, total - extras, avg);

    if (!allRows.length) {
      wrap.innerHTML = `<p class="empty-tip">还没有人物，先创建人物并在事件里安排登场。</p>`;
      $("#stats-side").innerHTML = "";
      return;
    }
    if (!shownRows.length) {
      wrap.innerHTML = String(statsQuery || "").trim()
        ? `<p class="empty-tip">没有名字里含「${esc(statsQuery.trim())}」的人物。</p>`
        : `<p class="empty-tip">顶部的分组一个都没勾，所以表格是空的。勾上至少一个分组就能看到统计。</p>`;
      return;
    }

    const key = statsSort.key;
    const dir = statsSort.dir === "asc" ? 1 : -1;
    const sorted = shownRows.slice().sort((a, b) => {
      if (key === "name") return String(a.char.name).localeCompare(String(b.char.name), "zh") * dir;
      return ((a[key] || 0) - (b[key] || 0)) * dir;
    });

    const th = (k, label, num) =>
      `<th class="${num ? "num " : ""}${statsSort.key === k ? "active" : ""}" data-key="${k}">${label}${
        statsSort.key === k ? (statsSort.dir === "asc" ? " ↑" : " ↓") : ""
      }</th>`;
    // 首次 / 最后出场：显示到「章 · 节」，悬停看是哪件事，双击跳到事件轴
    const loc = (e, which) => {
      if (!e) return `<span class="stats-loc empty">—</span>`;
      const parts = [];
      const c = e.chapterId ? getChapter(e.chapterId) : null;
      if (c) parts.push(c.title);
      const sr = e.sectionId ? getSection(e.sectionId) : null;
      if (sr) parts.push(sr.section.title);
      if (!parts.length) parts.push(e.time || "未分章");
      const label = parts.join(" · ");
      const extra = [e.time ? "时间：" + e.time : "", e.place ? "地点：" + e.place : ""].filter(Boolean).join("　");
      const tip = `${which}：${e.title}\n${extra ? extra + "\n" : ""}双击跳到事件轴上的这个事件`;
      return `<span class="stats-loc" data-event-id="${esc(e.id)}" title="${esc(tip)}">${esc(label)}</span>`;
    };

    const headRow = `<tr>
      ${th("name", "人物")}
      ${th("score", "重要度", true)}
      ${th("eventCount", "出场事件", true)}
      ${th("lineCount", "涉及线路", true)}
      ${th("chapterCount", "涉及章节", true)}
      <th>首次出场</th>
      <th>最后出场</th>
    </tr>`;
    /* 表格按列排序后，也要把同链的人贴回命中的那个人下面（用户 2026-10-17：
       搜到 A 时，被 A 链接的 a 必须紧跟在 A 下面，不能因为分数高就跑到 A 上面）。 */
    const sortedWithMates = glueChainMates(sorted, shownRows, statsPicked.mateOf, (row) => row.char.id);
    let rowsHtml = "";
    sortedWithMates.forEach((r) => {
      rowsHtml += `<tr class="stats-row ${statsSelectedCharId === r.char.id ? "active" : ""}" data-char-id="${esc(r.char.id)}">
        <td><span class="stats-name" data-char-id="${esc(r.char.id)}">${avatarHtml(r.char)}${esc(
          r.char.name
        )}${nameChainClipHtml(r.char.id, statsPicked.mateIds)}</span>${
          isExtraChar(r.char) ? ` <span class="tag">龙套</span>` : ""
        }</td>
        <td class="num"><div class="stat-bar-wrap"><div class="stat-bar" style="width:${r.pct}%"></div><span class="stat-bar-num">${Math.round(r.score)}</span></div></td>
        <td class="num">${r.eventCount}<span class="stat-sub">（${Math.round(r.ratio * 100)}%）</span></td>
        <td class="num">${r.lineCount}</td>
        <td class="num">${r.chapterCount}</td>
        <td>${loc(r.first, "首次出场事件")}</td>
        <td>${loc(r.last, "最后出场事件")}</td>
      </tr>`;
    });
    // 一整张表放在 .table-scroll 里：表头 sticky 钉住，可见的滚动条由「代滚动条」画在表头下面
    wrap.innerHTML = `<div class="table-scroll"><table class="stats-table"><thead>${headRow}</thead><tbody>${rowsHtml}</tbody></table></div>`;
    syncTableScrollProxies(wrap);

    wrap.querySelectorAll("th[data-key]").forEach((h) =>
      h.addEventListener("click", () => {
        const k = h.dataset.key;
        if (statsSort.key === k) statsSort.dir = statsSort.dir === "asc" ? "desc" : "asc";
        else {
          statsSort.key = k;
          statsSort.dir = k === "name" ? "asc" : "desc";
        }
        renderStats();
      })
    );
    wrap.querySelectorAll(".stats-row").forEach((tr) =>
      tr.addEventListener("click", () => {
        statsSelectedCharId = statsSelectedCharId === tr.dataset.charId ? null : tr.dataset.charId;
        renderStats();
      })
    );
    // 首次 / 最后出场：双击跳到事件轴上的那个事件（其它事件折叠、只展开它）
    wrap.querySelectorAll(".stats-loc[data-event-id]").forEach((el) =>
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        jumpToEventInTimeline(el.dataset.eventId);
      })
    );

    renderStatsSide(allRows);
  }

  /* ================= 雷达分析（人物分析的子页面） =================
     行＝人物、列＝雷达图各维度；点列名排序；顶部可按分组勾选过滤。
     雷达图在「设置 → 人物 → 雷达图」里被禁用时，入口按钮变灰不可点。 */
  let radarSort = { key: "", dir: "desc" };
  let radarHiddenGroups = new Set(); // 顶部过滤条里没勾的组（存"没勾的"，新分组默认显示）
  let radarBatchMode = false; // 雷达分析：批量选中（用于叠加对比）
  let radarSelected = new Set(); // 批量选中的人物 id
  let radarQuery = ""; // 雷达分析顶部的搜索框
  let radarOverlayValueIds = new Set(); // 雷达图对比：图例后面勾了谁，谁的数值才标在图上
  // 叠加对比用的配色（冷色系，和整体配色一致）
  const RADAR_SERIES_COLORS = [
    "#5B76B5",
    "#9E9AC8",
    "#66C2A5",
    "#E78AC3",
    "#5FA8C9",
    "#8DA0CB",
    "#B39DDB",
    "#7CC98B",
    "#C08BC0",
    "#8C9EB5",
  ];

  function syncRadarAnalysisButton() {
    const btn = $("#open-radar-btn");
    if (!btn) return;
    const on = radarOn();
    btn.disabled = !on;
    btn.classList.toggle("agent-off", !on);
    btn.title = on
      ? "按维度查看每个人物的雷达评分，点列名可排序"
      : "雷达图已在「设置 → 人物 → 雷达图」里禁用；启用后这里才能用";
  }

  // 雷达分析：表格里显示出来的人物 id（按当前顺序）
  function radarVisibleIds() {
    return $$("#radar-table-wrap tr.stats-row")
      .map((tr) => tr.dataset.charId)
      .filter(Boolean);
  }

  /* ---- 分组过滤条（出场统计 / 雷达分析共用） ----
     hiddenSet 里存的是「没勾上的分组」，这样以后新建分组默认就是显示的。 */
  // 顶部搜索框：按名字 / 别名模糊匹配（大小写不敏感）
  /* 搜索词按「token」算：空白、逗号、顿号、分号、斜杠、竖线分隔，
     另外「数字-数字」里的那个连字符也算分隔符（1-2 就是 1 和 2 两个词）。
     命中规则：每个词都要在这个名字 / 某个别名里出现（都命中才算这条命中）。 */
  function queryTokens(q) {
    const t = String(q == null ? "" : q).trim();
    if (!t) return [];
    return t
      .split(/(?<=\d)-(?=\d)|[\s,，、;；/|｜]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }
  function charMatchesQuery(c, q) {
    const toks = queryTokens(q);
    if (!toks.length) return true;
    if (!c) return false;
    const hay = [c.name].concat(c.aliases || []).map((x) => String(x || "").toLowerCase());
    return toks.every((tok) => hay.some((h) => h.indexOf(tok) >= 0));
  }
  /* 同一条链上有两个人同时命中搜索词时，谁当「锚点」：
     匹配得更完整的那个（完全一样 > 前缀 > 包含 > 模糊）放前面，另一个人挂到它下面。 */
  function charMatchRank(c, q) {
    if (!c || typeof acScore !== "function") return 0;
    const toks = queryTokens(q);
    const hay = [c.name].concat(c.aliases || []).map((x) => String(x || ""));
    let total = 0;
    toks.forEach((tok) => {
      let best = 0;
      hay.forEach((h) => {
        const s = acScore(tok, h);
        if (s > best) best = s;
      });
      total += best;
    });
    return total;
  }

  /* 搜索命中某个人物时，把和它同一条人物链的人也带出来
     （名字后面挂回形针，表示是「顺着链接跟过来」的，方便一起看 / 一起选）。
     返回 { rows, mateIds }：mateIds 就是这些跟过来的人。 */
  function withChainMates(rows, q, charOf, opts) {
    const base = rows || [];
    const t = String(q || "").trim();
    if (!t) return { rows: base, mateIds: new Set(), mateOf: new Map() };
    const byId = new Map(base.map((row) => [charOf(row).id, row]));
    const out = [];
    const seen = new Set();
    const mateIds = new Set();
    const mateOf = new Map(); // 同链人 id → 它跟着的那个"命中的人"
    const o = opts || {};
    const hits = o.hits ? o.hits.slice() : base.filter((row) => charMatchesQuery(charOf(row), t));
    /* 命中的人自己先按匹配度排队：完全命中的 A 永远排在只沾到两个字的同链人前面，
       这样下面的同链人才是「挂在 A 下面」，不会反过来把 A 顶到上面。 */
    hits.sort((a, b) => charMatchRank(charOf(b), t) - charMatchRank(charOf(a), t));
    hits
      .forEach((row) => {
        const c = charOf(row);
        if (!c || seen.has(c.id)) return;
        seen.add(c.id);
        out.push(row);
        /* 用户 2026-10-17：**只要匹配到了**（不管匹配了几个字）就把同链的人摆在这个人下面 ——
           以前还要求"搜索词和名字重合 >2 个字"，输「小绪」时链上的「代偿」不出现，很别扭。 */
        const ch = chainOfChar(c.id);
        if (!ch) return;
        chainMembersOf(ch).forEach((m) => {
          if (seen.has(m.id) || !byId.has(m.id)) return;
          seen.add(m.id);
          mateIds.add(m.id);
          mateOf.set(m.id, c.id);
          out.push(byId.get(m.id));
        });
      });
    return { rows: out, mateIds, mateOf };
  }

  /* 表格另有排序（雷达分析默认按第一个维度从高到低）时，
     把"跟着同链人"的那几行**重新贴回命中的人下面**（用户 2026-10-17：同链的人要在 A 的下方）。 */
  function glueChainMates(sortedRows, showOrder, mateOf, idOf) {
    if (!mateOf || !mateOf.size) return sortedRows;
    const idOfRow = typeof idOf === "function" ? idOf : (x) => (x ? x.id : undefined);
    const ordered = [];
    const placed = new Set();
    const pushMate = (anchorId) => {
      showOrder.forEach((m) => {
        const mid = idOfRow(m);
        if (placed.has(mid) || mateOf.get(mid) !== anchorId) return;
        ordered.push(m);
        placed.add(mid);
      });
    };
    sortedRows.forEach((c) => {
      const cid = idOfRow(c);
      if (mateOf.has(cid)) return; // 同链人跟着锚点走，不单独插
      if (placed.has(cid)) return;
      ordered.push(c);
      placed.add(cid);
      pushMate(cid);
    });
    sortedRows.forEach((c) => {
      const cid = idOfRow(c);
      if (!placed.has(cid)) {
        ordered.push(c);
        placed.add(cid);
      }
    });
    return ordered;
  }

  function groupFilterHtml(baseRows, hiddenSet) {
    const byGroup = new Map();
    (baseRows || []).forEach((c) => {
      const gid = charBucketIdOf(c);
      byGroup.set(gid, (byGroup.get(gid) || 0) + 1);
    });
    const groups = charGroupBucketsOrder()
      .filter(({ id }) => (byGroup.get(id) || 0) > 0)
      .map(({ id, group: g }) => ({
        gid: id || "",
        name: (g && g.name) || "未分组",
        color: (g && g.color) || "",
        n: byGroup.get(id) || 0,
      }));
    // 只有一个分组时过滤没有意义
    if (groups.length < 2) return { groups, html: "" };
    const allOn = groups.every((x) => !hiddenSet.has(x.gid));
    const html =
      `<label class="group-filter-all" title="全选 / 全不选：一次勾上或取消下面所有分组"><input type="checkbox" class="group-all-cb"${
        allOn ? " checked" : ""
      } />全选</label><span class="group-filter-sep"></span>` +
      groups
        .map(
          (x) =>
            `<label class="group-chk" title="只看 / 不看这个分组"><input type="checkbox" class="group-cb" data-group-id="${esc(
              x.gid
            )}"${hiddenSet.has(x.gid) ? "" : " checked"} />${
              x.color ? `<span class="group-dot" style="background:${esc(x.color)}"></span>` : ""
            }<span>${esc(x.name)}</span><em>${x.n}</em></label>`
        )
        .join("");
    return { groups, html };
  }

  function bindGroupFilter(scope, groups, hiddenSet, rerender) {
    if (!scope) return;
    scope.querySelectorAll("input.group-cb").forEach((inp) =>
      inp.addEventListener("change", () => {
        const gid = inp.dataset.groupId || "";
        if (inp.checked) hiddenSet.delete(gid);
        else hiddenSet.add(gid);
        rerender();
      })
    );
    const all = scope.querySelector("input.group-all-cb");
    if (all)
      all.addEventListener("change", () => {
        if (all.checked) hiddenSet.clear();
        else groups.forEach((x) => hiddenSet.add(x.gid));
        rerender();
      });
  }

  // 雷达分析顶部工具条：左边按分组过滤，右边搜索框 +「批量 / 生成雷达图」。
  // 搜索框写在 HTML 里（固定不动），这里只重画分组勾选框，免得打字时焦点被冲掉。
  function renderRadarToolbar(baseRows) {
    const bar = $("#radar-group-filter");
    if (!bar) return;
    const rows = baseRows || [];
    if (!rows.length) {
      bar.hidden = true;
      return;
    }
    const gf = groupFilterHtml(rows, radarHiddenGroups);
    const groupBox = $("#radar-group-groups");
    if (groupBox) {
      groupBox.innerHTML = gf.html;
      bindGroupFilter(groupBox, gf.groups, radarHiddenGroups, renderRadarAnalysis);
    }
    const selN = radarSelected.size;
    const count = $("#radar-sel-count");
    if (count)
      count.textContent = radarBatchMode || selN ? (selN ? `已选 ${selN} 个` : "点人物行勾选 · Shift 连选") : "";
    const batchBtn = $("#radar-batch-btn");
    if (batchBtn) {
      // 只保留「批量」入口；退出批量靠点空白 / Esc（原来那个「退出批量」按钮没用）
      if (batchBtn.textContent !== "批量") batchBtn.textContent = "批量";
      if (batchBtn.classList.contains("btn-primary")) batchBtn.classList.remove("btn-primary");
    }
    const chartBtn = $("#radar-chart-btn");
    if (chartBtn && chartBtn.disabled !== !selN) chartBtn.disabled = !selN;
    // 没有分组可筛选时，这一行整条收起来（搜索框和控制按钮已经挪到顶部页签行右侧）
    bar.hidden = !gf.html;
  }

  // 把选中人物的雷达图叠加画在一起
  function showRadarOverlay() {
    const panel = $("#radar-chart-panel");
    const body = $("#radar-chart-body");
    const title = $("#radar-chart-title");
    if (!panel || !body) return;
    const axes = radarAxes().filter((a) => String(a.label || "").trim());
    const ids = radarVisibleIds().filter((id) => radarSelected.has(id));
    const series = ids
      .map((id, i) => {
        const c = getChar(id);
        if (!c) return null;
        return {
          id,
          name: c.name || "（未命名）",
          color: RADAR_SERIES_COLORS[i % RADAR_SERIES_COLORS.length],
          values: c.radar || {},
        };
      })
      .filter(Boolean);
    if (!axes.length || !series.length) {
      showToast("先在表格里点选要比较的人物，再生成雷达图。");
      return;
    }
    panel.hidden = false;
    if (title) {
      title.textContent =
        series.length === 1 ? `雷达图：${series[0].name}` : `雷达图对比（${series.length} 人叠加）`;
    }
    body.innerHTML = "";
    const box = document.createElement("div");
    body.appendChild(box);
    radarOverlayValueIds = new Set(); // 默认全不勾选：图例后面那排勾选决定谁把数值标出来
    // 面板拖高拖矮：图按新的可用高度重画（字体大小不变，只改作图尺寸）
    const panelH = panel.clientHeight ? Math.max(200, Math.min(560, panel.clientHeight - 72)) : 315;
    drawRadarOverlay(box, axes, series, radarOverlayValueIds, panelH);
    const legend = document.createElement("div");
    legend.className = "radar-legend";
    legend.innerHTML = series
      .map(
        (s) =>
          `<label class="radar-legend-item" title="${esc(uiTextFor("勾上就把这一组的数值标在图上"))}"><i style="background:${esc(
            s.color
          )}"></i><span>${esc(s.name)}</span>${
            axes.every((a) => {
              const v = s.values[a.key];
              return v === undefined || v === null || v === "";
            })
              ? "<em>（还没填数值）</em>"
              : ""
          }<input type="checkbox" class="radar-legend-pick" data-radar-val="${esc(s.id)}" /></label>`
      )
      .join("");
    legend.querySelectorAll("input[data-radar-val]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const id = cb.dataset.radarVal;
        if (cb.checked) radarOverlayValueIds.add(id);
        else radarOverlayValueIds.delete(id);
        // 面板拖高拖矮：图按新的可用高度重画（字体大小不变，只改作图尺寸）
    const panelH = panel.clientHeight ? Math.max(200, Math.min(560, panel.clientHeight - 72)) : 315;
    drawRadarOverlay(box, axes, series, radarOverlayValueIds, panelH);
      })
    );
    body.appendChild(legend);
    panel.scrollIntoView({ block: "nearest" });
  }

  function hideRadarOverlay() {
    const panel = $("#radar-chart-panel");
    if (panel) {
      panel.hidden = true;
      const body = $("#radar-chart-body");
      if (body) body.innerHTML = "";
    }
  }

  // 多个人物叠加：一张网格 + 每人一个多边形，颜色对应下面的图例。
  // valueIds 里勾上的人，把数值标在轴名下面（各用自己的颜色，「/」用轴名的字色）
  function drawRadarOverlay(box, axes, series, valueIds, hOverride) {
    if (!box || !axes || axes.length < 2) return;
    const picked = (series || []).filter((s) => valueIds && valueIds.has(s.id));
    const n = axes.length;
    // 画布比雷达本身宽一圈：左右留出写数值的余地（勾了很多人时一行也能放下）
    const W = 440;
    const H = 315;
    const cx = W / 2;
    const cy = H / 2 + 4.5;
    const R = 99;
    // 数值的字号：组数多了就收一点，争取一行放得下
    const vFont = picked.length > 4 ? Math.max(7, 11 - (picked.length - 4) * 0.5) : 11;
    const pt = (i, ratio) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + Math.cos(ang) * R * ratio, cy + Math.sin(ang) * R * ratio];
    };
    const ratioOf = (values, a) => {
      const v = values ? values[a.key] : null;
      const num = typeof v === "number" && isFinite(v) ? v : parseRadarNumber(v);
      return Math.max(0, Math.min(10, num === null || num === undefined ? 0 : num)) / 10;
    };
    let grid = "";
    for (let ring = 1; ring <= 5; ring++) {
      const pts = axes
        .map((_, i) =>
          pt(i, ring / 5)
            .map((x) => x.toFixed(1))
            .join(",")
        )
        .join(" ");
      grid += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />`;
    }
    axes.forEach((_, i) => {
      const [x, y] = pt(i, 1);
      grid += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.14)" />`;
    });
    const shapes = series
      .map((s) => {
        const pts = axes
          .map((a, i) =>
            pt(i, ratioOf(s.values, a))
              .map((x) => x.toFixed(1))
              .join(",")
          )
          .join(" ");
        const dots = axes
          .map((a, i) => {
            const [x, y] = pt(i, ratioOf(s.values, a));
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${esc(s.color)}" />`;
          })
          .join("");
        return (
          `<polygon points="${pts}" fill="${esc(s.color)}" fill-opacity="0.13" stroke="${esc(
            s.color
          )}" stroke-width="2" stroke-linejoin="round" />` + dots
        );
      })
      .join("");
    const labels = axes
      .map((a, i) => {
        const [x, y] = pt(i, 1.16);
        const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        const name = a.label || "";
        const nameX = radarLabelX(x, anchor, radarTextWidth(name, 11), W);
        const desc = a.desc ? `<title>${esc(a.label || "")}：${esc(a.desc)}</title>` : `<title>${esc(a.label || "")}</title>`;
        const nameText = `<text x="${nameX.toFixed(
          1
        )}" y="${(y + 2).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#a79ec0">${desc}${esc(name)}</text>`;
        const valStrs = picked.map((s) =>
          typeof s.values[a.key] === "number" && isFinite(s.values[a.key])
            ? String(Math.round(s.values[a.key] * 100) / 100)
            : "—"
        );
        const valX = radarLabelX(x, anchor, radarTextWidth(valStrs.join("/"), vFont), W);
        const valText = picked.length
          ? `<text x="${valX.toFixed(1)}" y="${(y + 15).toFixed(1)}" text-anchor="${anchor}" font-size="${vFont}">${valStrs
              .map(
                (v, k) =>
                  (k ? `<tspan fill="#a79ec0" font-weight="400">/</tspan>` : "") +
                  `<tspan fill="${esc(picked[k].color)}" font-weight="700">${esc(v)}</tspan>`
              )
              .join("")}</text>`
          : "";
        return nameText + valText;
      })
      .join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${grid}${shapes}${labels}</svg>`;
  }

  function renderRadarAnalysis() {
    const wrap = $("#radar-table-wrap");
    if (!wrap) return;
    if (!radarOn()) {
      renderRadarToolbar([]);
      wrap.innerHTML = `<p class="empty-tip">雷达图现在被禁用了。到「设置 → 人物 → 雷达图」点「启用」之后，就能在这里按维度比较每个人。</p>`;
      return;
    }
    const axes = radarAxes().filter((a) => String(a.label || "").trim());
    if (!axes.length) {
      renderRadarToolbar([]);
      wrap.innerHTML = `<p class="empty-tip">还没有雷达图的顶点。到「设置 → 人物 → 雷达图」里加上顶点（2 ~ 7 个），再来这里比较。</p>`;
      return;
    }
    const includeExtra = !!($("#radar-include-extra") || {}).checked;
    const baseRows = state.characters.filter((c) => includeExtra || !isExtraChar(c));
    renderRadarToolbar(baseRows);
    if (!baseRows.length) {
      wrap.innerHTML = `<p class="empty-tip">还没有人物，先创建人物并填写雷达图数值。</p>`;
      return;
    }
    // 顶部勾选的分组过滤（没勾的组不显示）＋ 搜索框按名字过滤
    const rows = baseRows
      .filter((c) => !radarHiddenGroups.has(charBucketIdOf(c)));
    // 搜索命中谁，就把和它同一条链的人也带出来（名字后面挂回形针）
    const radarPicked = withChainMates(rows, radarQuery, (c) => c);
    const shownRows = radarPicked.rows;
    if (!shownRows.length) {
      wrap.innerHTML = String(radarQuery || "").trim()
        ? `<p class="empty-tip">没有名字里含「${esc(radarQuery.trim())}」的人物。</p>`
        : `<p class="empty-tip">顶部的分组一个都没勾，所以表格是空的。勾上至少一个分组就能看到评分。</p>`;
      return;
    }
    const valOf = (c, key) => {
      const v = (c.radar || {})[key];
      const n = typeof v === "number" ? v : parseRadarNumber(v);
      return n === null || n === undefined ? null : n;
    };
    // 默认按第一个维度从高到低排
    if (!radarSort.key || !axes.some((a) => a.key === radarSort.key)) {
      radarSort = { key: axes[0].key, dir: "desc" };
    }
    const dir = radarSort.dir === "asc" ? 1 : -1;
    // 全表一起排序（不分组），升 / 降序才看得出整条曲线
    const sorted = shownRows.slice().sort((a, b) => {
      const va = valOf(a, radarSort.key);
      const vb = valOf(b, radarSort.key);
      if (va === null && vb === null) return String(a.name).localeCompare(String(b.name), "zh");
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir || String(a.name).localeCompare(String(b.name), "zh");
    });
    /* 搜索带过来的同链人：排序之后仍然贴在"命中的那个人"下面（用户 2026-10-17） */
    const sortedWithMates = glueChainMates(sorted, shownRows, radarPicked.mateOf);
    const th = (a) =>
      `<th class="${radarSort.key === a.key ? "active" : ""}" data-axis="${esc(a.key)}" title="${esc(
        (a.desc ? a.label + "：\n" + a.desc + "\n" : "") + "点一下＝按「" + a.label + "」排序，再点一下换升 / 降序"
      )}">${esc(a.label)}${radarSort.key === a.key ? (radarSort.dir === "asc" ? " ↑" : " ↓") : ""}</th>`;
    const chainMark = chainMarkSetFrom(radarSelected);
    radarPicked.mateIds.forEach((id) => chainMark.add(id)); // 搜索带过来的人也挂回形针
    const tableCls = `stats-table radar-table${radarBatchMode ? " batch-mode" : ""}`;
    const headRow = `<tr><th>人物</th>${axes.map(th).join("")}</tr>`;
    let rowsHtml = "";
    sortedWithMates.forEach((c) => {
      const picked = radarSelected.has(c.id);
      rowsHtml += `<tr class="stats-row${picked ? " selected" : ""}" data-char-id="${esc(c.id)}">
        <td><span class="stats-name" data-char-id="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}${nameChainClipHtml(
          c.id,
          chainMark
        )}</span>${
        isExtraChar(c) ? ` <span class="tag">龙套</span>` : ""
      }</td>`;
      axes.forEach((a) => {
        const v = valOf(c, a.key);
        rowsHtml +=
          v === null
            ? `<td class="num radar-cell empty" title="这个人物还没填「${esc(a.label)}」">—</td>`
            : `<td class="num radar-cell" title="${esc(a.label)}：${v}"><div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.max(
                0,
                Math.min(100, v * 10)
              )}%"></div><span class="stat-bar-num">${v}</span></div></td>`;
      });
      rowsHtml += `</tr>`;
    });
    wrap.innerHTML = `<div class="table-scroll"><table class="${tableCls}"><thead>${headRow}</thead><tbody>${rowsHtml}</tbody></table></div>`;
    syncTableScrollProxies(wrap);
    wrap.querySelectorAll("th[data-axis]").forEach((h) =>
      h.addEventListener("click", () => {
        const k = h.dataset.axis;
        if (radarSort.key === k) radarSort.dir = radarSort.dir === "asc" ? "desc" : "asc";
        else radarSort = { key: k, dir: "desc" };
        renderRadarAnalysis();
      })
    );
    wrap.querySelectorAll(".stats-row").forEach((tr) => {
      const id = tr.dataset.charId;
      if (radarBatchMode) {
        // 批量：普通单击 / Ctrl＝单独勾选 / 取消，Shift＝连选一段
        tr.addEventListener("click", (ev) => {
          if (ev.shiftKey)
            shiftClickCard("radar", id, radarVisibleIds(), radarSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("radar", id, radarSelected);
        });
        return;
      }
      tr.addEventListener("click", (ev) => {
        // 不在批量模式时，Shift / Ctrl 点也会自动进批量并选中
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          radarBatchMode = true;
          // 保留之前单击选中的那几行，在此基础上 Ctrl 加 / 减、Shift 连选
          if (ev.shiftKey) shiftClickCard("radar", id, radarVisibleIds(), radarSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("radar", id, radarSelected);
          return;
        }
        // 普通单击＝只选这一个；再点一次同一个＝取消选中
        markShortcutAnchor("radar", id);
        const onlyThis = radarSelected.size === 1 && radarSelected.has(id);
        applyPaneSelection("radar", onlyThis ? [] : [id]);
      });
      tr.addEventListener("dblclick", (ev) => {
        // 行上双击已经开了人物卡；别再冒泡到最外层那套（免得又开一次）
        ev.stopPropagation();
        openCharacterModal(id);
      });
    });
  }

  function renderStatsSide(rows) {
    const side = $("#stats-side");
    if (!side) return;
    const row = rows.find((r) => r.char.id === statsSelectedCharId);
    if (!row) {
      side.innerHTML = "";
      return;
    }
    const c = row.char;
    const evs = state.events.filter((e) => (e.characterIds || []).includes(c.id));
    const tally = new Map();
    evs.forEach((e) =>
      (e.characterIds || []).forEach((id) => {
        if (id !== c.id) tally.set(id, (tally.get(id) || 0) + 1);
      })
    );
    const list = Array.from(tally.entries())
      .map(([id, n]) => ({ char: getChar(id), n }))
      .filter((x) => x.char)
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    side.innerHTML = `
      <div class="stats-side-head" data-char-id="${esc(c.id)}">${avatarHtml(c)}<div><div class="stats-side-name">${esc(
        c.name
      )}</div><div class="stats-side-role">${esc(c.role || "未设定身份")}</div></div></div>
      <div class="stats-side-meta">出场 ${row.eventCount} 个事件 · ${row.lineCount} 条线路 · ${row.chapterCount} 章 · 重要度 ${Math.round(row.score)}</div>
      <div class="stats-side-title">共现最多的人物（同场次数）</div>
      ${
        list.length
          ? list
              .map(
                (x) =>
                  `<div class="co-row" data-char-id="${esc(x.char.id)}"><span>${avatarHtml(x.char)}${esc(
                    x.char.name
                  )}</span><span class="co-num">${x.n} 次</span></div>`
              )
              .join("")
          : `<p class="empty-tip small">还没有共现记录。</p>`
      }`;
  }

