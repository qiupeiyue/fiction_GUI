  /* ================= 时间线（按事件真正发生的时间） ================= */
  /* 单击时间列改文字时，这一行的「排序依据」要照旧：
     比如把「3月13日」改成「三月十三号」，位置不该跟着跑。
     只有真会变位置的时候才把这笔旧值记在 timeSortKey 上，清掉它就回到按时间文本自动排。 */
  function chronoSortTextOf(e) {
    return e && e.timeSortKey != null ? String(e.timeSortKey) : String((e && e.time) || "");
  }
  /* 排序用的时间值：优先用用户手动排过的 timeOrder；
     其次把「时间」文字交给解析器（中文数字 / 年月日 / 今年·昨天·十年前这些相对说法，
     见 19-chrono-time.js），解析不出数值的就是文字行（返回 null）。 */
  function chronoValueOf(e) {
    if (!e) return null;
    if (typeof e.timeOrder === "number") return e.timeOrder;
    const hit = chronoTimeIndex().get(e.id);
    return hit && typeof hit.value === "number" ? hit.value : null;
  }

  // 时间线的行键：能从时间文本里读出数字（或手动拖过）就按数字成行；
  // 读不出数字的（例如「十年前」「故事开始前三天」）按时间文本各自成行，不会全挤在「时间待定」里
  function chronoRowKeyOf(e) {
    const v = chronoValueOf(e);
    if (v !== null) return { key: "n:" + v, value: v, text: "", numeric: true };
    const t = chronoSortTextOf(e).trim();
    return { key: "t:" + t, value: null, text: t, numeric: false };
  }

  function chronoEvents() {
    const all = storyEventsShown();
    // 读不出数字的时间文本，按它在全文里第一次出现的先后排序
    const textRank = new Map();
    all.forEach((e) => {
      const k = chronoRowKeyOf(e);
      if (k.numeric) return;
      const si = e.storyIndex || 0;
      const cur = textRank.get(k.text);
      if (cur === undefined || si < cur) textRank.set(k.text, si);
    });
    return all.slice().sort((a, b) => {
      const ka = chronoRowKeyOf(a);
      const kb = chronoRowKeyOf(b);
      const sa = a.storyIndex || 0;
      const sb = b.storyIndex || 0;
      if (ka.numeric && kb.numeric) return ka.value - kb.value || sa - sb;
      if (ka.numeric !== kb.numeric) return ka.numeric ? -1 : 1;
      if (ka.text !== kb.text) {
        const ra = textRank.get(ka.text);
        const rb = textRank.get(kb.text);
        const da = ra === undefined ? 0 : ra;
        const db = rb === undefined ? 0 : rb;
        return da - db || String(ka.text).localeCompare(String(kb.text), "zh-Hans-CN");
      }
      return sa - sb;
    });
  }

  let inRenderChrono = false;

  // 时间线：每一列的宽度可以拖（按线路 id 记），单元格里超过 2 个事件时折叠
  const CHRONO_W_DEFAULT = 240;
  const CHRONO_W_MIN = 130;
  const CHRONO_W_MAX = 760;
  let chronoLaneWidths = {};
  let chronoWidthManual = new Set();
  // key = 这一行的时间；事件多于 2 个的行可以折叠（小三角在每行左侧、时间栏的右上角）
  let chronoRowCollapsed = new Set();
  // 这一屏画出来的「行」（一个行＝一个时间，里面是这一行的所有事件）：
  // 单击时间列改文字时要用它拿到整行的事件
  let chronoRowItems = [];

  function chronoTextWidth(s) {
    let w = 0;
    for (const ch of String(s || "")) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 14 : 7.5;
    return w;
  }

  function chronoColWidths(lanes, rows) {
    if (rows && rows.length) {
      lanes.forEach((l) => {
        if (chronoWidthManual.has(l.id)) return;
        let maxText = 0;
        rows.forEach((row) => {
          row.items
            .filter((e) => linesOf(e).includes(l.id))
            .forEach((e) => {
              maxText = Math.max(maxText, chronoTextWidth(e.title), chronoTextWidth(e.place));
            });
        });
        // 不追求一行塞下全文：自动给到能舒服阅读的宽度，剩下的换行显示。
        const w = Math.round(Math.min(420, Math.max(CHRONO_W_MIN, maxText * 0.72 + 48)));
        chronoLaneWidths[l.id] = Math.max(CHRONO_W_MIN, Math.min(CHRONO_W_MAX, w));
      });
    }
    return lanes.map((l) => {
      const w = Number(chronoLaneWidths[l.id]) || CHRONO_W_DEFAULT;
      return Math.max(CHRONO_W_MIN, Math.min(CHRONO_W_MAX, Math.round(w)));
    });
  }

  // 拖动时先就地改列宽（表头 + 所有行一起改，别整块重画）
  function applyChronoWidths(headsEl, ws) {
    const tpl = ws.map((w) => w + "px").join(" ");
    if (headsEl) headsEl.style.gridTemplateColumns = tpl;
    document.querySelectorAll("#chrono-list .chrono-cells").forEach((c) => {
      c.style.gridTemplateColumns = tpl;
    });
  }

  function renderChrono() {
    const list = $("#chrono-list");
    if (!list || inRenderChrono) return;
    if (viewHidden("view-chrono")) return; // 不在这个页签就别白建 DOM（切过去时页签会重画）
    inRenderChrono = true;
    try {
      const empty = $("#chrono-empty");
      const rows = chronoRows();
      const lanes = lineFilterLanes();
      if (empty) empty.hidden = rows.length > 0;
      if (!rows.length || !lanes.length) {
        list.innerHTML = "";
        return;
      }
      // 行号 #N：# 是事件自己的属性，一律按全量行算（不受线路筛选 / 检索条件影响），
      // 和事件轴、二维事件图共用同一套编号。
      const rowNoOf = new Map(axisRows().map((row, i) => [row.v || 0, i + 1]));
      const colWs = chronoColWidths(lanes, rows);
      const cellsTpl = colWs.map((w) => w + "px").join(" ");
      let html = `<div class="chrono-grid">`;
      // 表头：横轴＝线路
      html += `<div class="chrono-head-row"><div class="chrono-corner">时间 ＼ 线路</div><div class="chrono-lane-heads" style="grid-template-columns:${cellsTpl}">`;
      lanes.forEach((l) => {
        const count = rows.reduce((n, r) => n + r.items.filter((e) => linesOf(e).includes(l.id)).length, 0);
        html += `<div class="chrono-lane-head" data-line-id="${esc(l.id)}" title="双击编辑线路 · 右键更多操作 · 拖动排序 · 拖右边界改列宽" style="border-top-color:${esc(l.color)};border-color:${esc(l.color)}4D;background-color:${esc(l.color)}33">
          <span class="line-dot" style="background:${esc(l.color)}"></span>
          <span class="lane-code">${esc(l.code || "?")}</span>
          <span class="lane-name">${esc(lineDisplayName(l))}</span>
          <span class="chrono-lane-count">${count}</span>
          <span class="chrono-resizer" data-line-id="${esc(l.id)}" title="拖动＝调整这一列的宽度（双击＝恢复默认宽度）"></span>
        </div>`;
      });
      html += `</div></div>`;
      // 每一行＝一个实际发生时间
      rows.forEach((row, ri) => {
        const first = row.items[0];
        // 显示一律用事件自己写的「时间」文字（row.text 只在它读不出数字时兜底）
        const label =
          String(first.time || "").trim() || (row.numeric ? String(row.value) : row.text) || uiTextFor("（时间待定）");
        const droppable = row.numeric ? "1" : first.time ? "1" : "0";
        const tip = row.numeric
          ? "把事件卡片拖到这一行，就能把它放到这个时间"
          : first.time
            ? `把事件卡片拖到这一行，它的时间会写成「${first.time}」`
            : "这些事件还没填「时间」";
        // 折叠记的 key 一律走 chronoRowKeyOf（"n:1084" / "t:某年" 这种）——
        // 和「全部展开 / 全部折叠」用同一套，否则两边各写一份格式，折叠状态就对不上（踩过）
        const rowKey = chronoRowKeyOf(first).key;
        const canFold = row.items.length > 2;
        const folded = canFold && chronoRowCollapsed.has(rowKey);
        // 折叠后仍然留一张卡：显示这一行的第一个事件，免得整行空白
        const firstOfRow = row.items[0] || null;
        html += `<div class="chrono-row" data-row="${ri}" data-numeric="${row.numeric ? "1" : "0"}" data-value="${
          row.numeric ? row.value : ""
        }" data-time="${esc(first.time || "")}" data-drop="${droppable}" title="${esc(tip)}">
          <div class="chrono-time-label ${row.numeric ? "" : "unknown"}" title="${esc(label)}"><span class="chrono-time-text">${esc(
            label
          )}</span>${
            canFold
              ? `<button type="button" class="chrono-fold-btn${folded ? " folded" : ""}" data-row-key="${esc(
                  rowKey
                )}" title="${
                  folded
                    ? `展开这一行的事件（共 ${row.items.length} 个，现在只显示第一个）`
                    : `收起这一行的事件（共 ${row.items.length} 个，收起后只留第一个）`
                }">${folded ? "▶" : "▼"}</button>`
              : ""
          }</div>
          <div class="chrono-cells" style="grid-template-columns:${cellsTpl}">`;
        lanes.forEach((l) => {
          // 一个事件属于多条线路时，每条线的列里都出现它
          const items = row.items.filter((e) => linesOf(e).includes(l.id));
          const shownItems = folded ? items.filter((e) => e === firstOfRow) : items;
          html += `<div class="chrono-cell" data-line="${esc(l.id)}">`;
          shownItems.forEach((e) => {
            const ch = e.chapterId ? getChapter(e.chapterId) : null;
            const sr = e.sectionId ? getSection(e.sectionId) : null;
            const rowNo = rowNoOf.get(e.storyIndex || 0) || 0;
            const multi = linesOf(e).length > 1;
            // 登场人物：和事件轴上的卡片一样单独占一行（放在标题下面）；龙套不显示，只给个计数
            const allChars = (e.characterIds || []).map((id) => getChar(id)).filter(Boolean);
            const castChars = allChars.filter((c) => !isExtraChar(c));
            const extraCast = allChars.length - castChars.length;
            const castHtml =
              castChars.length || extraCast
                ? `<div class="event-chars chrono-card-chars">${castChars
                    .map((c) => `<span class="event-char-chip" data-char-id="${esc(c.id)}">${avatarHtml(c)}${esc(c.name)}</span>`)
                    .join("")}${
                    extraCast
                      ? `<span class="event-char-more" title="龙套人物在时间线上不显示">+${extraCast} 龙套</span>`
                      : ""
                  }</div>`
                : "";
            // 卡片右边写「章 节 #」；地点挪到悬浮提示里，不占卡片地方
            html += `<div class="chrono-card" draggable="true" data-event-id="${esc(e.id)}" title="${esc(
              e.place ? `${e.title}（单击编辑 · 拖动可改时间）· 地点：${e.place}` : `${e.title}（单击编辑 · 拖动可改时间）`
            )}">
              <span class="chrono-card-title">${esc(e.title)}</span>
              ${ch ? `<span class="chrono-card-chapter">${esc(ch.title)}</span>` : ""}
              ${sr ? `<span class="chrono-card-section">${esc(sr.section.title)}</span>` : ""}
              ${rowNo ? `<span class="chrono-card-rowno">#${rowNo}</span>` : ""}
              ${
                multi
                  ? `<span class="chrono-card-multi" title="这个事件还属于：${esc(
                      linesOf(e)
                        .map((id) => {
                          const x = getLine(id);
                          return x ? x.code || x.name || "?" : "?";
                        })
                        .join("、")
                    )}">多线</span>`
                  : ""
              }
              ${castHtml}
            </div>`;
          });
          if (folded && shownItems.length && row.items.length > 1) {
            html += `<span class="chrono-fold-more" title="这一行还有 ${
              row.items.length - 1
            } 个事件，点左上角「▶」展开">＋${row.items.length - 1}</span>`;
          }
          html += `</div>`;
        });
        html += `</div>`;
        html += `</div>`;
      });
      html += `</div>`;
      chronoRowItems = rows; // 单击时间列改文字时要拿到这一行的所有事件
      list.innerHTML = html;
      bindChronoDrag();
      // 线路表头：和事件轴的线路一样——双击打开设置、右键快捷菜单、拖动调整顺序
      list.querySelectorAll(".chrono-lane-head[data-line-id]").forEach((head) => {
        const lid = head.dataset.lineId;
        head.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openLineModal(lid);
        });
        head.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          showLineQuickMenu(ev.clientX, ev.clientY, lid);
          markContextTarget(head);
        });
        bindLineDrag(head, (x) => x.dataset.lineId, "x");
      });
      // 每一列的右边界：拖动＝改这一列宽度；双击＝恢复默认宽度
      list.querySelectorAll(".chrono-resizer").forEach((rz) => {
        const lid = rz.dataset.lineId;
        rz.addEventListener("mousedown", (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          const heads = Array.from(list.querySelectorAll(".chrono-lane-head"));
          const idx = heads.findIndex((h) => h.dataset.lineId === lid);
          const headsEl = heads[0] ? heads[0].parentElement : null;
          if (idx < 0 || !headsEl) return;
          // 列宽要记「元素自己坐标系里的 px」：界面缩放时 getBoundingClientRect 是放大过的，
          // 先除回来，否则拖一下列宽就会跳。
          const ws = heads.map((h) => Math.round(h.getBoundingClientRect().width / uiZoomScale(h))); // 不含最右边的「折叠」列
          const startX = ev.clientX;
          const startW = ws[idx];
          let moved = false;
          const onMove = (e) => {
            const dx = (e.clientX - startX) / uiZoomScale(headsEl);
            if (!moved) {
              if (Math.abs(dx) < 2) return;
              moved = true;
              document.body.classList.add("chrono-resizing");
            }
            ws[idx] = Math.max(CHRONO_W_MIN, Math.min(CHRONO_W_MAX, Math.round(startW + dx)));
            chronoLaneWidths[lid] = ws[idx];
            chronoWidthManual.add(lid);
            applyChronoWidths(headsEl, ws);
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.classList.remove("chrono-resizing");
            if (moved) renderChrono();
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
        rz.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          delete chronoLaneWidths[lid];
          chronoWidthManual.delete(lid);
          renderChrono();
          showToast("已恢复这一列的默认宽度");
        });
      });
      // 最右边那一列的折叠按钮：按「行（时间）」折叠 / 展开
      list.querySelectorAll(".chrono-fold-btn").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          const k = b.dataset.rowKey || "";
          if (chronoRowCollapsed.has(k)) chronoRowCollapsed.delete(k);
          else chronoRowCollapsed.add(k);
          renderChrono();
        })
      );
      // 单击时间列的格子＝改这一行的时间文字（这一行的事件一起改，行位置不动）
      list.querySelectorAll(".chrono-time-label").forEach((el) => {
        const textEl = el.querySelector(".chrono-time-text");
        const shown = textEl ? textEl.textContent : "";
        uiSetComposedTitle(el, uiTextFor("单击＝改这一行的时间文字") + (shown ? "\n" + shown : ""));
        el.addEventListener("click", (ev) => {
          const rowEl = el.closest(".chrono-row");
          if (!rowEl) return;
          ev.stopPropagation();
          editChronoRowTime(Number(rowEl.dataset.row), el);
        });
        // 右键＝菜单：编辑（＝单击）/ 全部展开 / 全部折叠（用户 2026-10-16）
        el.addEventListener("contextmenu", (ev) => {
          const rowEl = el.closest(".chrono-row");
          if (!rowEl) return;
          ev.preventDefault();
          ev.stopPropagation();
          showChronoTimeMenu(ev.clientX, ev.clientY, Number(rowEl.dataset.row), shown);
        });
      });
    } finally {
      inRenderChrono = false;
    }
  }

  /* 改这一行的时间文字：只改文字，这一行不换位置。
     位置靠 timeOrder（拖过的）和 chronoSortTextOf 兜着，必要时补记一条 timeSortKey。 */
  /* 这一行显示的时间文字（和 renderChrono 里那个 label 一个算法） */
  function chronoRowLabelOf(row) {
    if (!row || !row.items.length) return "";
    const first = row.items[0];
    return String(first.time || "").trim() || (row.numeric ? String(row.value) : row.text) || uiTextFor("（时间待定）");
  }
  /* 这一行**真正能写到事件上的时间文字**（空行返回空串 —— 别把「（时间待定）」这种显示用的词写进数据） */
  function chronoRowTimeTextOf(row) {
    if (!row || !row.items.length) return "";
    const first = row.items[0];
    const own = String(first.time || "").trim();
    if (own) return own;
    if (row.numeric) return String(row.value);
    return chronoSortTextOf(first).trim();
  }
  /* 把这一行的事件的时间文字改成 text（改文字不动这一行在列表里的位置，和老的单击改时间同一套） */
  function applyChronoRowTime(ri, text, curLabel) {
    const row = chronoRowItems[ri];
    if (!row || !row.items.length) return false;
    const t = String(text == null ? "" : text).trim();
    if (!t) return false;
    const first = row.items[0];
    const cur = curLabel == null ? chronoRowLabelOf(row) : String(curLabel);
    if (t === cur) return false;
    const oldKey = chronoRowKeyOf(first).key;
    const sortText = chronoSortTextOf(first);
    pendingUndoLabel = `修改时间线的时间：「${cur}」→「${t}」`;
    row.items.forEach((e) => {
      e.time = t;
      // 用同一套解析（含相对说法的锚点）算新位置：一样就不记，不一样才把旧值钉住
      if (chronoKeyOfTextFor(e, t) === oldKey) delete e.timeSortKey;
      else e.timeSortKey = sortText;
    });
    saveState();
    renderChrono();
    renderTimeline();
    renderMatrix();
    showToast(uiSentence("chronoTimeEdited", row.items.length, t));
    return true;
  }
  /* 「与上一条 / 下一条合并」：把这一行的事件的时间**改成目标那一行的时间**，并且**并进那一行**。
     和上面那条"只改文字、这一行不换位置"刚好相反 —— 所以排序依据要**照着目标那一行抄**
     （timeOrder / timeSortKey 都跟着目标走），不然只是文字变了、行还留在原地。 */
  function mergeChronoRowInto(ri, targetRi) {
    const rows = chronoRows();
    const row = rows[ri];
    const target = rows[targetRi];
    if (!row || !target || !row.items.length || !target.items.length) return false;
    const text = chronoRowTimeTextOf(target);
    if (!text) return false;
    const cur = chronoRowLabelOf(row);
    if (text === cur) return false;
    const t0 = target.items[0];
    pendingUndoLabel = `修改时间线的时间：「${cur}」→「${text}」`;
    row.items.forEach((e) => {
      e.time = text;
      if (typeof t0.timeOrder === "number") e.timeOrder = t0.timeOrder;
      else delete e.timeOrder;
      if (t0.timeSortKey != null) e.timeSortKey = t0.timeSortKey;
      else delete e.timeSortKey;
    });
    saveState();
    renderChrono();
    renderTimeline();
    renderMatrix();
    showToast(uiSentence("chronoTimeEdited", row.items.length, text));
    return true;
  }
  /* 时间列的右键菜单（用户 2026-10-16）：
     编辑（＝单击，进「改时间」）/ 合并到上一条 / 合并到下一条 / 全部展开 / 全部折叠。
     合并＝把这一行的时间改成**列表里上 / 下那一条**的时间（两行随之并成一行）；
     没有上 / 下一条、或那一条压根没有时间文字时灰掉。
     全部展开 / 折叠只管**能折叠的行**（一行 > 2 个事件才有那个折叠按钮）；没得展开 / 折叠时灰掉。 */
  function chronoFoldableKeys() {
    return chronoRows()
      .filter((r) => r.items.length > 2)
      .map((r) => chronoRowKeyOf(r.items[0]).key);
  }
  function setChronoRowsFolded(folded) {
    chronoFoldableKeys().forEach((k) => {
      if (folded) chronoRowCollapsed.add(k);
      else chronoRowCollapsed.delete(k);
    });
    renderChrono();
  }
  function showChronoTimeMenu(x, y, ri, label) {
    const row = chronoRowItems[ri];
    if (!row || !row.items.length) return;
    const rows = chronoRows();
    const prevText = ri > 0 ? chronoRowTimeTextOf(rows[ri - 1]) : "";
    const nextText = ri < rows.length - 1 ? chronoRowTimeTextOf(rows[ri + 1]) : "";
    const keys = chronoFoldableKeys();
    const foldedN = keys.filter((k) => chronoRowCollapsed.has(k)).length;
    renderContextMenu(x, y, String(label || ""), [
      { label: "编辑", act: () => editChronoRowTime(ri) },
      { label: "合并到上一条", disabled: !prevText, tip: prevText, act: () => mergeChronoRowInto(ri, ri - 1) },
      { label: "合并到下一条", disabled: !nextText, tip: nextText, act: () => mergeChronoRowInto(ri, ri + 1) },
      { label: "全部展开", disabled: foldedN === 0, act: () => setChronoRowsFolded(false) },
      { label: "全部折叠", disabled: !keys.length || foldedN >= keys.length, act: () => setChronoRowsFolded(true) },
    ]);
  }
  async function editChronoRowTime(ri, labelEl) {
    const row = chronoRowItems[ri];
    if (!row || !row.items.length) return;
    const cur = chronoRowLabelOf(row);
    // 弹窗只留「标题 + 输入框」：这行字没必要啰嗦（输入框里就是原来那一行的时间）
    const next = await uiPrompt("", cur, uiTextFor("改时间"));
    if (next == null) return;
    applyChronoRowTime(ri, next, cur);
  }

  // 时间线的行：一个实际发生时间一行（同一时间的事件并排在该行的各线路列里）
  function chronoRows() {
    const rows = [];
    chronoEvents().forEach((e) => {
      const k = chronoRowKeyOf(e);
      const last = rows[rows.length - 1];
      if (last && last.key === k.key) last.items.push(e);
      else rows.push({ key: k.key, value: k.value, text: k.text, numeric: k.numeric, items: [e] });
    });
    return rows;
  }

  function bindChronoDrag(evs) {
    const list = $("#chrono-list");
    if (!list) return;
    let dragId = null;
    list.querySelectorAll(".chrono-card").forEach((el) => {
      el.addEventListener("dragstart", (ev) => {
        dragId = el.dataset.eventId;
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
        try {
          ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "chrono", id: dragId }));
        } catch (e) {
          /* ignore */
        }
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        dragId = null;
        el.classList.remove("dragging");
        list.querySelectorAll(".chrono-row.drop").forEach((x) => x.classList.remove("drop"));
      });
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // 点人物圈圈：先等一拍（可能是「双击打开人物卡」的第一下）
        if (delayCardOpenFromChip(ev.target, () => openEventModal(el.dataset.eventId))) return;
        openEventModal(el.dataset.eventId);
      });
      // 双击人物圈圈 / 人名＝打开这张人物卡
      el.addEventListener("dblclick", (ev) => {
        if (!openCharFromChip(ev.target)) return;
        cancelCardOpenFromChip();
        ev.preventDefault();
        ev.stopPropagation();
      });
      // 右键人物圈圈＝人物卡那套菜单
      el.addEventListener("contextmenu", (ev) => showCharChipMenu(ev));
      // 从人物边栏把人物拖到这张卡上＝加进这个事件的登场人物
      // （和事件轴上把人物拖到事件卡上一样）
      el.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        el.classList.add("drop-target");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
      el.addEventListener("drop", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.remove("drop-target");
        const ids = (data.type === "chars" ? data.ids : [data.id]).filter((id) => getChar(id));
        addCharsToEvent(ids, el.dataset.eventId);
      });
    });
    // 拖到某一行＝把这个事件放到那个实际发生时间
    list.querySelectorAll(".chrono-row").forEach((row) => {
      row.addEventListener("dragover", (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        row.classList.add("drop");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop"));
      row.addEventListener("drop", (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        ev.stopPropagation();
        row.classList.remove("drop");
        const e = getEvent(dragId);
        const raw = row.dataset.value;
        const numeric = row.dataset.numeric === "1";
        const timeText = row.dataset.time || "";
        dragId = null;
        if (!e || row.dataset.drop !== "1") return;
        if (numeric) {
          pendingUndoLabel = `调整时间线位置：「${e.title}」`;
          if (raw === "") delete e.timeOrder;
          else e.timeOrder = parseFloat(raw);
        } else {
    pendingUndoLabel = `设置「${e.title}」的时间`;
          delete e.timeOrder;
          delete e.timeSortKey; // 时间文字改了，别留着上一次改文字时的排序兜底
          e.time = timeText;
        }
        saveState();
        renderChrono();
        renderTimeline();
        renderMatrix();
    showToast(numeric ? `已把「${e.title}」放到这一行` : `已把「${e.title}」的时间设为「${timeText}」`);
      });
    });
  }

  // 从二维事件图双击行头：回到事件轴并定位到这个事件
  // （默认把所有事件压缩成只剩标题，只展开双击的这一条）
  function jumpToEventInTimeline(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    // 1) 折叠其它所有事件，只展开这一个
    collapsedEventCards = new Set((state.events || []).map((x) => x.id).filter((id) => id !== eventId));
    // 2) 它所在的章 / 节如果折叠着，先展开，否则卡片根本不会渲染
    const ch = e.chapterId ? getChapter(e.chapterId) : null;
    if (ch) ch.collapsed = false;
    const sr = e.sectionId ? getSection(e.sectionId) : null;
    if (sr) sr.section.collapsed = false;
    // 3) 如果当前线路筛选把它挡住了，先清掉筛选
    if (lineFilterOn() && !linesOf(e).some((id) => lineFilter.has(id))) {
      lineFilterClear();
      renderLineFilters();
    }
    saveState();
    renderTimeline();
    switchTab("timeline");
    showToast(`已定位到「${e.title}」`);
    setTimeout(() => {
      const el = document.querySelector(`#timeline .event-card[data-event-id="${eventId}"]`);
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) {
        /* ignore */
      }
      flash(e);
    }, 80);
  }

  // 从二维事件图双击事件集：回到事件轴，把事件集折叠并定位到屏幕中央。
  async function jumpToEventSetInTimeline(setId) {
    const set = getEventSet(setId);
    const members = eventSetMembers(setId);
    if (!set || !members.length) return;
    // 折叠事件集
    expandedEventSets.delete(eventSetExpandKey(setId, ""));
    members.forEach((e) => expandedSetMembers.delete(e.id));
    // 它所在的章 / 节如果是折叠的，先展开，否则集合卡不会渲染
    members.forEach((e) => {
      const ch = e.chapterId ? getChapter(e.chapterId) : null;
      if (ch) ch.collapsed = false;
      const sr = e.sectionId ? getSection(e.sectionId) : null;
      if (sr) sr.section.collapsed = false;
    });
    // 当前线路筛选把集合挡住了就先清掉
    const leftLineId = eventSetLeftLineId(setId);
    if (lineFilterOn() && leftLineId && !lineFilter.has(leftLineId)) {
      lineFilterClear();
      renderLineFilters();
    }
    saveState();
    await switchTab("timeline");
    showToast(`已定位到事件集「${set.name}」`);
    setTimeout(() => {
      const el = document.querySelector(`#timeline .event-set-card[data-event-set-id="${setId}"]`);
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) {
        /* ignore */
      }
      el.classList.add("flash");
      el.classList.add("jump-flash");
      setTimeout(() => el.classList.remove("flash"), 900);
      setTimeout(() => el.classList.remove("jump-flash"), 1800);
    }, 100);
  }

  // 从二维事件图双击章 / 节线：回事件轴，折叠所有事件集与事件，并定位到这条线。
  async function jumpToBandInTimeline(chapterId, sectionId) {
    expandedEventSets.clear();
    expandedSetMembers.clear();
    matrixExpandedEventSets.clear();
    collapsedEventCards = new Set((state.events || []).map((e) => e.id));
    const ch = chapterId ? getChapter(chapterId) : null;
    if (ch) ch.collapsed = false;
    const sr = sectionId ? getSection(sectionId) : null;
    if (sr) {
      sr.section.collapsed = false;
      if (sr.chapter) sr.chapter.collapsed = false;
    }
    saveState();
    await switchTab("timeline");
    setTimeout(() => {
      let el = sectionId
        ? document.querySelector(`#timeline .evaxis-band.section[data-section-id="${sectionId}"]`)
        : null;
      if (!el && chapterId) {
        el = document.querySelector(`#timeline .evaxis-band.chapter[data-chapter-id="${chapterId}"]`);
      }
      if (!el) return;
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) {
        /* ignore */
      }
      el.classList.add("flash-band");
      el.classList.add("jump-flash");
      setTimeout(() => el.classList.remove("flash-band"), 1500);
      setTimeout(() => el.classList.remove("jump-flash"), 1800);
    }, 100);
  }

  function resetChronoOrder() {
    pendingUndoLabel = "恢复时间线的自动排序";
    state.events.forEach((e) => {
      delete e.timeOrder;
      delete e.timeSortKey; // 手工改过文字留下的排序兜底也一起清掉
    });
    saveState();
    renderChrono();
    showToast("已恢复按时间文本自动排序");
  }

  function charColumns() {
    const cols = [];
    // 龙套默认不进入二维事件图（可勾选「包含龙套」查看）
    const includeExtra = $("#matrix-include-extra") && $("#matrix-include-extra").checked;
    const chars = state.characters.filter((c) => includeExtra || !isExtraChar(c));
    // 列顺序跟着人物栏走：普通分组 → 未分组 → 龙套
    charGroupBucketsOrder().forEach(({ id }) => {
      chars.filter((c) => charBucketIdOf(c) === id).forEach((c) => cols.push(c));
    });
    // 兜底：归属不存在的群
    chars.forEach((c) => {
      if (!cols.includes(c)) cols.push(c);
    });
    return cols;
  }

  // 二维事件图：事件行 / 分带行的高度是固定的（见 styles.css），
  // 所以可以只画「屏幕里看得见的那一段行」，上下各留一屏缓冲。
  // 这样一部几百章、几千个事件的小说，打开和滚动都只画几十行。
  const M_ROW_H = 22.5; // 事件行高（和 CSS 里的 .m-row-hdr / .m-cell 对齐，行之间不留空）
  const M_BAND_H = 19.5; // 章 / 节分带行高（和 CSS 里的 .m-band 对齐）
  const M_HEAD_H = 60; // 表头两行（19.5 + 40.5）
  const M_BUFFER = 300; // 可视区上下各多画这么多像素（窗口越小，正文合成层越小，高分屏不容易掉瓦片）
  let matrixWin = null; // 当前画出来的行区间
  let matrixScrollRaf = 0;
  /* 二维图的纵向滚动**不走原生滚动条**（用户 2026-10-17 第二次复报"还在闪"）：
     原生滚动要求有一个跟全篇一样高的可滚动区域（几百事件就是几万像素），
     Electron 里那块滚动层会掉帧 / 花屏。这里改成：
       · #matrix-scroll 固定视口高、纵向 overflow:hidden；
       · 自己维护 matrixScrollTop，滚轮 / 自绘滚动条都改它；
       · 只画当前窗口的行，表头固定在最上面。
     横向仍用原生滚动（内容宽度只有几千像素，没问题）。 */
  let matrixScrollTop = 0;
  let matrixTotalH = 0;
  let matrixViewH = 0;
  let matrixPreviewModel = { total: 0, bands: [], rows: [] };
  /* 二维图「兼容渲染」诊断开关（用户 2026-10-20）：
     页面层面立即生效（纵向不再用 transform，取消 will-change），
     安装版同时把开关写给主进程，下次启动时 disable-gpu。 */
  const MATRIX_COMPAT_KEY = "fiction_gui_matrix_compat_v1";
  let matrixCompatOn = false;
  function readMatrixCompatFlag() {
    try {
      return localStorage.getItem(MATRIX_COMPAT_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function applyMatrixCompat(on, persist) {
    matrixCompatOn = !!on;
    const view = $("#view-matrix");
    if (view) view.classList.toggle("matrix-compat", matrixCompatOn);
    const cb = $("#matrix-compat-toggle");
    if (cb) cb.checked = matrixCompatOn;
    if (persist) {
      try {
        localStorage.setItem(MATRIX_COMPAT_KEY, matrixCompatOn ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
      const n = typeof nativeApp === "function" ? nativeApp() : null;
      if (n && typeof n.setMatrixCompat === "function") {
        try {
          n.setMatrixCompat(matrixCompatOn);
        } catch (e) {
          /* ignore */
        }
      }
    }
    if (matrixWin) applyMatrixScrollOffset();
    return matrixCompatOn;
  }
  function initMatrixCompat() {
    let on = readMatrixCompatFlag();
    const n = typeof nativeApp === "function" ? nativeApp() : null;
    if (n && typeof n.getMatrixCompat === "function") {
      try {
        on = !!n.getMatrixCompat(); // 主进程那份才是「重启后到底关不关 GPU」的真值
        localStorage.setItem(MATRIX_COMPAT_KEY, on ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
    }
    applyMatrixCompat(on, false);
    const cb = $("#matrix-compat-toggle");
    if (cb && cb.dataset.compatBound !== "1") {
      cb.dataset.compatBound = "1";
      cb.addEventListener("change", () => {
        applyMatrixCompat(cb.checked, true);
        if (matrixCompatOn) showToast(uiSentence("matrixCompatOn"));
        else showToast(uiSentence("matrixCompatOff"));
      });
    }
  }
  function matrixMaxScroll() {
    return Math.max(0, matrixTotalH - matrixViewH);
  }
  function matrixClampScroll(y) {
    return Math.max(0, Math.min(matrixMaxScroll(), Number(y) || 0));
  }
  function matrixScrollInfo() {
    return { top: matrixScrollTop, total: matrixTotalH, viewH: matrixViewH, max: matrixMaxScroll() };
  }
  function matrixPreviewInfo() {
    return matrixPreviewModel;
  }
  function matrixScrollTo(y) {
    matrixScrollTop = matrixClampScroll(y);
    matrixWin = null; // 强制按新位置重画
    renderMatrix();
    if (typeof showScrollMinimap === "function") showScrollMinimap($("#matrix-scroll"));
    return matrixScrollTop;
  }
  function syncMatrixVbar() {
    const bar = $("#matrix-vbar");
    const thumb = $("#matrix-vthumb");
    if (!bar || !thumb) return;
    const show = matrixTotalH > matrixViewH + 1 && matrixViewH > 0;
    if (bar.hidden === show) bar.hidden = !show;
    if (!show) return;
    const trackH = bar.clientHeight || 0;
    if (trackH <= 0) return;
    const th = Math.max(21, Math.round((matrixViewH / matrixTotalH) * trackH));
    const max = matrixMaxScroll();
    const top = max > 0 ? Math.round((matrixScrollTop / max) * Math.max(0, trackH - th)) : 0;
    thumb.style.height = th + "px";
    thumb.style.top = top + "px";
  }
  function applyMatrixScrollOffset() {
    const body = $("#matrix-body");
    const off = matrixWin ? (matrixWin.topStart || 0) - matrixScrollTop : 0;
    if (body && matrixWin) {
      if (matrixCompatOn) {
        /* 兼容模式：不用合成层平移，退回普通 top（慢一点，但不容易掉瓦片）。 */
        body.style.transform = "none";
        body.style.top = matrixBaseHeadH() + off + "px";
      } else {
        body.style.top = matrixBaseHeadH() + "px";
        body.style.transform = "translateY(" + off + "px)";
      }
    }
    const left = $("#matrix-left-body");
    if (left && matrixWin) {
      if (matrixCompatOn) {
        left.style.transform = "none";
        left.style.top = 60 + off + "px";
      } else {
        left.style.top = "";
        left.style.transform = "translateY(" + off + "px)";
      }
    }
    syncMatrixVbar();
  }
  function matrixBaseHeadH() {
    return M_HEAD_H;
  }
  function scheduleMatrixRender() {
    if (matrixScrollRaf) return;
    matrixScrollRaf = requestAnimationFrame(() => {
      matrixScrollRaf = 0;
      applyMatrixScrollOffset();
      safeRender(() => renderMatrix({ scrollOnly: true }));
    });
  }
  function bindMatrixScroll() {
    const sc = $("#matrix-scroll");
    if (!sc || sc.dataset.matrixScrollBound === "1") return;
    sc.dataset.matrixScrollBound = "1";
    sc.addEventListener(
      "wheel",
      (ev) => {
        if (ev.ctrlKey) return; // Ctrl+滚轮＝整站界面缩放，不抢
        const dx = ev.deltaX || 0;
        const dy = ev.deltaY || 0;
        if (Math.abs(dy) <= Math.abs(dx)) return; // 横向交给原生滚动
        ev.preventDefault();
        const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? Math.max(200, matrixViewH) : 1;
        matrixScrollTop = matrixClampScroll(matrixScrollTop + dy * unit);
        if (typeof showScrollMinimap === "function") showScrollMinimap(sc);
        scheduleMatrixRender();
      },
      { passive: false }
    );
    // 给测试 / 章节定位用的接口（不再有原生 scrollTop）
    sc.matrixScrollTo = (y) => matrixScrollTo(y);
    sc.matrixScrollInfo = () => matrixScrollInfo();
    const bar = $("#matrix-vbar");
    const thumb = $("#matrix-vthumb");
    if (bar && thumb && bar.dataset.bound !== "1") {
      bar.dataset.bound = "1";
      const jump = (clientY) => {
        const r = bar.getBoundingClientRect();
        const track = Math.max(1, r.height - thumb.offsetHeight);
        const y = clientY - r.top - thumb.offsetHeight / 2;
        matrixScrollTo((y / track) * matrixMaxScroll());
      };
      bar.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        if (ev.target !== thumb) return jump(ev.clientY);
        const startY = ev.clientY;
        const startTop = matrixScrollTop;
        const r = bar.getBoundingClientRect();
        const track = Math.max(1, r.height - thumb.offsetHeight);
        const onMove = (e) => {
          matrixScrollTop = matrixClampScroll(startTop + ((e.clientY - startY) / track) * matrixMaxScroll());
          if (typeof showScrollMinimap === "function") showScrollMinimap($("#matrix-scroll"));
          scheduleMatrixRender();
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("matrix-vthumb-drag");
        };
        document.body.classList.add("matrix-vthumb-drag");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
  }

  function renderMatrix(opts) {
    // 二维事件图：分组折叠后只留一个小三角的宽度
    const FOLD_COL_W = 18;
    const FOLD_COL_W_SPAN = 1;
    if (viewHidden("view-matrix")) return; // 不在这个页签就别白建 DOM（切过去时页签会重画）
    const box = $("#matrix");
    const scrollBox = $("#matrix-scroll");
    const headBox = $("#matrix-head");
    const bodyBox = $("#matrix-body");
    const hspacer = $("#matrix-hspacer");
    const leftBox = $("#matrix-left");
    const leftBody = $("#matrix-left-body");
    const empty = $("#matrix-empty");
    const events = storyEventsShown();
    const allCols = charColumns();
    // 按人物分组折叠：折叠那一组只留一个「▶ 组名」，组里的人不再占列
    const cols = allCols.filter((c) => !matrixFoldedGroups.has(charBucketIdOf(c)));
    // 行号 #N：和事件轴一致，按**全量行**算（# 是事件自己的属性，不受线路筛选影响）；
    // 章 / 节分带在名字后显示（#N:M）
    const storyRowNo = new Map(axisRows().map((row, i) => [row.v || 0, i + 1]));
    const bandRanges = axisBandRanges();
    const rangeTextOf = (segs, key, id) => {
      const mine = (segs || []).filter((s) => s[key] === id);
      if (!mine.length) return "";
      const st = Math.min.apply(null, mine.map((s) => s.startRow)) + 1;
      const en = Math.max.apply(null, mine.map((s) => s.endRow)) + 1;
      return `（#${st}:${en}）`;
    };

    if (state.events.length === 0 || allCols.length === 0) {
      if (headBox) headBox.innerHTML = "";
      if (bodyBox) bodyBox.innerHTML = "";
      if (leftBody) leftBody.innerHTML = "";
      if (leftBox) leftBox.hidden = true;
      if (hspacer) hspacer.style.width = "1px";
      const vbar0 = $("#matrix-vbar");
      if (vbar0) vbar0.hidden = true;
      matrixTotalH = 0;
      matrixViewH = 0;
      matrixScrollTop = 0;
      matrixWin = null;
      empty.hidden = false;
      renderChrono();
      return;
    }
    empty.hidden = true;
    bindMatrixScroll();

    const headParts = [];
    const colOf = new Map(); // 人物 id → 它占第几列
    const rowHeaderW = Math.max(160, Math.min(520, Math.round(matrixRowHeaderW)));
    if (leftBox) leftBox.hidden = false;
    box.style.setProperty("--mx-left-w", rowHeaderW + "px");
    const colTpl = []; // 右侧网格只有人物列（左侧事件栏是单独一层）
    /* 每一列长什么样：{ g:网格列号, w:列宽, ch:这一列是谁（折叠组那一列＝""） }。
       ① 让"哪些列空着"能成段合并（见 cellRunsHtml）；
       ② 鼠标按 x 反解"这一列是谁"也用它。
       ⚠️ 用 colSlots 的 g 定位，别再拿 cols 的下标 +2：有分组被折叠时，
       两者的编号会错开一格（原来会把后面的列全画偏 —— 顺手按 colSlots 修正）。 */
    const colSlots = [];
    const foldStrips = []; // 折叠的分组：记录它落在第几列，好让每行都补一条窄色带
    /* 左上角那一格：纵向是「章节 → 事件」、横向是「人物」。
       它**跨两行**（原来下面还单独有一格「事件」，已经并进来，用户 2026-10-16 要求）。 */
    let colCursor = 1;
    charGroupBucketsOrder().forEach(({ id, group: g }) => {
      const members = allCols.filter((c) => charBucketIdOf(c) === id);
      if (!members.length) return;
      const folded = matrixFoldedGroups.has(id);
      const name = g ? groupDisplayName(g) : uiTextFor("未分组");
      const tipName = uiTextFor(name) || name; // 默认分组名跟着界面语言，作者改过的名字原样
      const color = (g && g.color) || "#6b6480"; // 分组没设颜色时也别把颜色丢掉
      const span = folded ? FOLD_COL_W_SPAN : members.length;
      if (folded) {
        // 折叠后只剩一个小三角：鼠标停在上面才知道是哪一组
        const tip = `${tipName}（${members.length} 人，已折叠）· 单击展开这一组` + (id ? " · 双击改分组名" : "");
        colTpl.push(`${FOLD_COL_W}px`);
        colSlots.push({ g: colCursor, w: FOLD_COL_W, ch: "" });
        foldStrips.push({ col: colCursor, color, id, name, count: members.length });
        headParts.push(
          `<div class="m-group-hdr folded"${id ? ` data-group-id="${esc(id)}"` : ""} title="${esc(
            tip
          )}" style="grid-row:1 / span 2;grid-column:${colCursor};background:${esc(color)}1f;color:${esc(
            color
          )}">▶</div>`
        );
      } else {
        const tip = `点一下折叠这一组（${members.length} 人）` + (id ? " · 双击改分组名" : "");
        members.forEach((c, k) => {
          colTpl.push("46px");
          colSlots.push({ g: colCursor + k, w: 46, ch: c.id });
        });
        headParts.push(
          `<div class="m-group-hdr"${id ? ` data-group-id="${esc(id)}"` : ""} title="${esc(
            tip
          )}" style="grid-row:1;grid-column:${colCursor} / span ${span};background:${esc(color)}1f;color:${esc(
            color
          )}">▼ ${esc(uiTextFor(name) || name)}</div>`
        );
      }
      if (!folded) {
        members.forEach((c, k) => {
          colOf.set(c.id, colCursor + k);
          headParts.push(
            `<div class="m-char-hdr" data-char-id="${esc(c.id)}" style="grid-row:2;grid-column:${colCursor + k}" title="${esc(
              c.name
            )}（点击编辑人物 · 右键设置分组）">${avatarHtml(c)}<span class="m-char-name">${esc(c.name)}</span></div>`
          );
        });
      }
      colCursor += span;
    });
    /* （原来这里有一格「事件」，现在并进左上角那一格了） */

    const grid = colTpl.join(" ");
    /* 空着的那些列**成段合并**成一个元素（一格一个 DOM 是网格重画最贵的一环：
       一篇长篇里 95% 的格子都是空的，一个一个建出来的话每次重画要造四千多个节点）。
       段内用 repeating-linear-gradient 补齐竖线，看起来和原来一格一条右边框一模一样。 */
    const cellRunsHtml = (gridRowNo, isLit) => {
      let out = "";
      let i = 0;
      while (i < colSlots.length) {
        const s = colSlots[i];
        if (!s.ch || isLit(s.ch)) {
          i++; // 折叠组那一列有竖色带、亮着的列有 .m-cell：都不是空列
          continue;
        }
        let j = i;
        while (j + 1 < colSlots.length && colSlots[j + 1].ch && !isLit(colSlots[j + 1].ch) && colSlots[j + 1].w === s.w) j++;
        out += `<div class="m-cell-run" style="grid-column:${s.g} / span ${j - i + 1};grid-row:${gridRowNo};--run-w:${
          s.w
        }px"></div>`;
        i = j + 1;
      }
      return out;
    };

    // ① 先把「有哪些行」排出来（章 / 节分带 + 事件行），这一步只是算数据，不碰 DOM
    const items = [];
    const matrixRenderedSets = new Set();
    const expandedSetItems = new Map();
    let prevCh = null;
    let prevSec = null;
    let chCollapsed = false;
    let secCollapsed = false;
    events.forEach((e) => {
      const chId = e.chapterId || "";
      if (chId !== prevCh) {
        const c = getChapter(chId);
        chCollapsed = c ? !!c.collapsed : false;
        items.push({ kind: "chapter", id: chId, v: e.storyIndex });
        prevCh = chId;
        prevSec = null;
      }
      if (chCollapsed) return;
      const secId = chId ? e.sectionId || "" : "";
      if (secId !== prevSec) {
        const sr = getSection(secId);
        secCollapsed = sr ? !!sr.section.collapsed : false;
        if (sr) items.push({ kind: "section", id: secId, v: e.storyIndex });
        prevSec = secId;
      }
      if (secCollapsed) return;
      const setId = eventSetIdForEvent(e);
      if (setId && !matrixExpandedEventSets.has(setId)) {
        // 默认折叠：同一集合只显示一行
        if (matrixRenderedSets.has(setId)) return;
        matrixRenderedSets.add(setId);
        items.push({ kind: "eventSet", setId, e, v: e.storyIndex });
      } else {
        if (setId && matrixExpandedEventSets.has(setId)) {
          let rec = expandedSetItems.get(setId);
          if (!rec) {
            rec = { indices: [] };
            expandedSetItems.set(setId, rec);
          }
          rec.indices.push(items.length);
        }
        items.push({ kind: "event", e, v: e.storyIndex });
      }
    });
    // 还没有事件的章 / 节：按相邻章 / 节的事件位置，在二维图里也插一条分隔带，
    // 位置和事件轴保持一致（之后往里面拖事件，就自然变成有内容的章 / 节）。
    {
      const emptyChapters = [];
      (state.chapters || []).forEach((c) => {
        if (state.events.some((e) => (e.chapterId || "") === c.id)) return;
        emptyChapters.push({ anchor: chapterAnchorStory(c.id), item: { kind: "chapter", id: c.id, empty: true } });
      });
      emptyChapters.forEach((x) => {
        let at = items.length;
        for (let i = 0; i < items.length; i++) {
          const v = items[i].v;
          if (typeof v === "number" && v >= x.anchor) {
            at = i;
            break;
          }
        }
        items.splice(at, 0, x.item);
      });
      // 空节：同样必须排在所属章分界线之后、保持节内顺序。
      (state.chapters || []).forEach((c) => {
        if (c.collapsed) return;
        const sections = c.sections || [];
        if (!sections.length) return;
        let pos = -1;
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "chapter" && items[i].id === c.id) {
            pos = i + 1;
            break;
          }
        }
        if (pos < 0) return;
        const chVals = state.events.filter((e) => (e.chapterId || "") === c.id).map((e) => e.storyIndex || 0);
        const firstStory = chVals.length ? Math.min.apply(null, chVals) : null;
        sections.forEach((s) => {
          const isEmpty = !state.events.some((e) => e.sectionId === s.id);
          if (isEmpty) {
            const anchor = sectionAnchorStoryFor(c, s);
            if (firstStory !== null && anchor > firstStory) {
              let at = items.length;
              for (let i = pos; i < items.length; i++) {
                const v = items[i].v;
                if (typeof v === "number" && v >= anchor) {
                  at = i;
                  break;
                }
              }
              items.splice(at, 0, { kind: "section", id: s.id, empty: true });
            } else {
              items.splice(pos, 0, { kind: "section", id: s.id, empty: true });
              pos++;
            }
            return;
          }
          for (let i = pos; i < items.length; i++) {
            if (items[i].kind === "section" && items[i].id === s.id) {
              pos = i + 1;
              break;
            }
          }
        });
      });
    }
    // 空章 / 空节的分隔带是上面 splice 插进来的：插入点之后的所有 item 下标都会后移，
    // 事件集之前记下的成员下标就整体偏小了（展开的竖卡会往上错一行、还短一截）。
    // 这里按最终的 items 重新数一遍每个事件集成员的下标。
    if (expandedSetItems.size) {
      const idsBySet = new Map();
      expandedSetItems.forEach((rec, setId) => {
        idsBySet.set(setId, new Set(eventSetMembers(setId).map((e) => e.id)));
      });
      expandedSetItems.forEach((rec, setId) => {
        const ids = idsBySet.get(setId) || new Set();
        rec.indices = [];
        items.forEach((it, i) => {
          if (it.kind === "event" && it.e && ids.has(it.e.id)) rec.indices.push(i);
        });
      });
    }
    const itemH = (it) => (it.kind === "event" || it.kind === "eventSet" ? M_ROW_H : M_BAND_H);
    const tops = new Array(items.length);
    let total = 0;
    items.forEach((it, i) => {
      tops[i] = total;
      total += itemH(it);
    });
    matrixPreviewModel = { total, bands: [], rows: [] };
    items.forEach((it, i) => {
      if (it.kind === "chapter" || it.kind === "section") {
        matrixPreviewModel.bands.push({ y: tops[i], h: itemH(it), kind: it.kind });
      } else if (it.kind === "event" || it.kind === "eventSet") {
        matrixPreviewModel.rows.push({ y: tops[i], h: itemH(it), kind: it.kind });
      }
    });

    // ② 按当前**虚拟**滚动位置算出要画的行区间（上下各留一屏缓冲）
    const sc = scrollBox;
    const viewH = Math.max(0, (sc && sc.clientHeight ? sc.clientHeight : 800) - M_HEAD_H);
    matrixTotalH = total;
    matrixViewH = viewH;
    matrixScrollTop = matrixClampScroll(matrixScrollTop);
    const viewTop = matrixScrollTop;
    // 「必须画到」的范围：当前可见区再加一点余量
    const needFrom = viewTop - 150;
    const needTo = viewTop + viewH + 150;
    let needStart = 0;
    while (needStart < items.length && tops[needStart] + itemH(items[needStart]) < needFrom) needStart++;
    let needEnd = needStart;
    while (needEnd < items.length && tops[needEnd] <= needTo) needEnd++;
    // 只是滚动时：只要已经画好的这一段还盖得住可见区，就什么都别做。
    // （之前每滚 30px 就整窗重画一次，所以才那么卡；现在滑出缓冲才换页。）
    if (opts && opts.scrollOnly && matrixWin && matrixWin.total === total) {
      const covered = matrixWin.start <= needStart && matrixWin.end >= needEnd;
      if (covered) {
        applyMatrixScrollOffset();
        return;
      }
    }
    const from = viewTop - M_BUFFER;
    const to = viewTop + viewH + M_BUFFER;
    let start = 0;
    while (start < items.length && tops[start] + itemH(items[start]) < from) start++;
    let end = start;
    while (end < items.length && tops[end] <= to) end++;
    matrixWin = { start, end, total, topStart: tops[start] || 0 };

    /* ③ 画：固定表头 + 可见的那一段行
       行高全部写死（表头 19.5 / 40.5，分带 19.5，事件行 22.5）：和 CSS 一致，行间不留空。
       纵向没有"跟全篇一样高"的盒子，也没有原生纵向滚动层：
       `#matrix-head` 固定在视口顶上，`#matrix-body` 只装当前窗口，靠 `top` 跟着 matrixScrollTop 移动。 */
    const rowsTpl = [];
    for (let idx = start; idx < end; idx++) rowsTpl.push(`${itemH(items[idx])}px`);
    /* ⚠️ 纵向不再有「撑全篇高度的 spacer」：原生滚动层就是闪屏的来源（用户 2026-10-17 确认）。
       现在表头固定在 #matrix-head，正文只把当前窗口画进 #matrix-body，纵向位置写在 top 上。 */
    const contentW = rowHeaderW + colSlots.reduce((n, s) => n + s.w, 0);
    if (hspacer) hspacer.style.width = contentW + "px";
    box.dataset.restCols = colTpl.join(" ");
    if (headBox) {
      headBox.style.gridTemplateColumns = grid;
      headBox.style.gridTemplateRows = "19.5px 40.5px";
      headBox.innerHTML =
        headParts.join("") +
        `<div class="m-col-resizer" style="grid-column:1;grid-row:1 / -1" title="拖动调整左侧事件栏宽度（双击恢复默认）"></div>`;
    }
    if (bodyBox) {
      bodyBox.style.gridTemplateColumns = grid;
      bodyBox.style.gridTemplateRows = rowsTpl.join(" ");
      // 纵向只动 transform：滚轮在缓冲区内移动时是纯合成层平移，不触发整块网格重排
      bodyBox.style.top = M_HEAD_H + "px";
      bodyBox.style.transform = "translateY(" + ((tops[start] || 0) - viewTop) + "px)";
    }
    let html = "";
    let leftHtml = "";
    // 表头（1、2 行）是显式定位的；下面每一行都按 DOM 顺序自动排布——
    // 右侧每一行正好铺满所有人物列（每人一格 + 折叠组的窄格），
    // 所以不需要给每个格子写 grid-row / grid-column（几千个内联样式是滚动时最贵的一环）。
    for (let idx = start; idx < end; idx++) {
      const it = items[idx];
      const gridRowNo = idx - start + 1;
      if (it.kind === "chapter") {
        const c = getChapter(it.id);
        const collapsed = c ? !!c.collapsed : false;
        const range = rangeTextOf(bandRanges.chapterSegs, "chapterId", it.id);
        leftHtml += `<div class="m-band chapter" data-chapter-id="${esc(it.id)}" data-empty="${
          it.empty ? "1" : ""
        }"><span class="band-inner">${
          `<span class="band-caret">${collapsed ? "▶" : "▼"}</span>`
        } ${esc(c ? c.title : "未分章")}${range ? `<span class="band-range">${esc(range)}</span>` : ""}</span></div>`;
        html += `<div class="m-band chapter strip" style="grid-column:1 / -1;grid-row:${gridRowNo}"></div>`;
      } else if (it.kind === "section") {
        const sr = getSection(it.id);
        const collapsed = sr ? !!sr.section.collapsed : false;
        const range = rangeTextOf(bandRanges.sectionSegs, "sectionId", it.id);
        if (sr) {
          leftHtml += `<div class="m-band section" data-section-id="${esc(it.id)}" data-empty="${
            it.empty ? "1" : ""
          }"><span class="band-inner">${
            `<span class="band-caret">${collapsed ? "▶" : "▼"}</span>`
          } ${esc(sr.section.title)}${range ? `<span class="band-range">${esc(range)}</span>` : ""}</span></div>`;
          html += `<div class="m-band section strip" style="grid-column:1 / -1;grid-row:${gridRowNo}"></div>`;
        }
      } else if (it.kind === "eventSet") {
        const set = getEventSet(it.setId);
        const members = eventSetMembers(it.setId);
        const unionChars = new Set(members.flatMap((e) => e.characterIds || []));
        // 二维事件图的集合行也按「当前显示着的成员线路」取色 / 记线路，
        // 免得只筛某条线时，行头还顶着一条看不见的线路的颜色
        const lineId = eventSetShownLineId(it.setId);
        const line = getLine(lineId);
        const lc = line ? line.color : "#888";
        const name = set ? set.name : "未命名事件集";
        const setRowLabel = members.length
          ? (() => {
              const a = storyRowNo.get(members[0].storyIndex);
              const b = storyRowNo.get(members[members.length - 1].storyIndex);
              if (a == null) return "";
              return b != null && b !== a ? `#${a}~${b}` : `#${a}`;
            })()
          : "";
        leftHtml += `<div class="m-row-hdr event-set-row" data-event-set-id="${esc(
          it.setId
        )}" data-line-id="${esc(lineId)}" style="border-left-color:${esc(lc)}" title="事件集：${esc(
          name
        )}（${members.length} 个事件） · 点击三角展开 / 折叠"><button type="button" class="m-set-fold" data-event-set-id="${esc(
          it.setId
        )}" data-line-id="${esc(lineId)}" title="展开事件集">▶</button><span class="m-set-title">📁 ${esc(
          name
        )}（${members.length}）</span><span class="m-row-no">${esc(setRowLabel)}</span></div>`;
        cols.forEach((c) => {
          if (!unionChars.has(c.id)) return; // 空格子不建 DOM，见 cellRunsHtml
          html += `<div class="m-cell on" data-set-cell="1" style="grid-column:${colOf.get(c.id)};grid-row:${gridRowNo};--on-color:${esc(
            c.color
          )}" data-on="1" title="${esc(`${c.name}：集合内至少有一个事件登场`)}"></div>`;
        });
        html += cellRunsHtml(gridRowNo, (id) => unionChars.has(id));
      } else {
        const e = it.e;
        const lineList = linesOf(e).map((id) => getLine(id)).filter(Boolean);
        const line = lineList[0];
        const lc = line ? line.color : "#888";
        const codes = lineList.map((l) => l.code || "?").join("+");
        const memberSetId = eventSetIdForEvent(e);
        const isSetMember = !!(memberSetId && matrixExpandedEventSets.has(memberSetId));
        leftHtml += `<div class="m-row-hdr ${isSetMember ? "set-member-row" : ""} ${mergeSelected.has(e.id) ? "row-sel" : ""}" data-event-id="${esc(
          e.id
        )}" style="border-left-color:${esc(lc)}" title="${esc(
          e.title
        )}（单击编辑事件 · 双击回到事件轴并定位 · Shift/Ctrl+单击＝多选 · 右键更多操作）"><span class="m-line-code" style="color:${esc(
          lc
        )}" title="双击编辑线路 · 右键更多操作">${esc(codes)}</span><span class="m-title">${esc(
          e.title
        )}</span><span class="m-row-no">#${esc(storyRowNo.get(e.storyIndex) || 1)}</span></div>`;
        const charIds = e.characterIds || [];
        cols.forEach((c) => {
          if (!charIds.includes(c.id)) return; // 空格子不建 DOM，见 cellRunsHtml
          html += `<div class="m-cell on" data-event="${esc(e.id)}" data-char="${esc(
            c.id
          )}" style="grid-column:${colOf.get(c.id)};grid-row:${gridRowNo};--on-color:${esc(c.color)}" data-on="1" title="${esc(
            c.name
          )} · ${esc(e.title)}（双击点亮 / 右键或再次双击点灭）"></div>`;
        });
        /* 空列成段合并（见 cellRunsHtml），再铺一层整行的"接活层"：
           悬浮高亮 / 双击点亮 / 右键点灭都靠它按 x 算出是哪一列。 */
        html += cellRunsHtml(gridRowNo, (id) => charIds.includes(id));
        html += `<div class="m-row-hit" data-event="${esc(e.id)}" data-grid-row="${gridRowNo}" data-title="${esc(
          e.title
        )}" style="grid-column:1 / -1;grid-row:${gridRowNo}"></div>`;
        // 折叠的分组：每一行补一条同色的窄色带，让这一列连成一条，不再是黑洞
        foldStrips.forEach((f) => {
          html += `<div class="m-fold-cell" data-fold-gid="${esc(f.id)}" style="grid-column:${f.col};grid-row:${gridRowNo};--fold-color:${esc(
            f.color
          )}16" title="${esc(
            `${f.name}（${f.count} 人，已折叠）· 单击展开这一组`
          )}"></div>`;
        });
      }
    }
    // 展开的事件集：在左侧事件栏画一张跨成员行的竖卡，三角形仍用于折叠。
    expandedSetItems.forEach((rec, setId) => {
      if (!rec.indices.length) return;
      const firstIdx = rec.indices[0];
      const lastIdx = rec.indices[rec.indices.length - 1];
      if (firstIdx < start || lastIdx >= end) return; // 只画完整落在当前窗口内的集合
      const set = getEventSet(setId);
      const members = eventSetMembers(setId);
      const lineId = eventSetShownLineId(setId);
      const name = set ? set.name : "未命名事件集";
      const topPx = (tops[firstIdx] || 0) - (tops[start] || 0);
      // 竖卡的高度按「这一段的真实行高」累加：中间夹着章 / 节分带行（19.5px）时，
      // 直接用 span*行高 会算高，长条就会越往下越歪、和成员行对不上。
      let setH = 0;
      for (let k = firstIdx; k <= lastIdx; k++) setH += itemH(items[k]);
      leftHtml += `<div class="m-set-vertical" data-event-set-id="${esc(
        setId
      )}" data-line-id="${esc(lineId)}" style="top:${topPx}px;height:${setH}px" title="事件集：${esc(
        name
      )}（${members.length} 个事件）"><button type="button" class="m-set-fold" data-event-set-id="${esc(
        setId
      )}" data-line-id="${esc(lineId)}" title="折叠事件集">▶</button><span class="m-set-vertical-name">${esc(
        name
      )}</span></div>`;
    });
    if (bodyBox) bodyBox.innerHTML = html;
    if (leftBody) {
      leftBody.innerHTML = leftHtml;
      leftBody.style.transform = "translateY(" + ((tops[start] || 0) - viewTop) + "px)";
    }
    syncMatrixVbar();

    // ④ 交互：格子用事件委托（几千个格子各挂两个监听太贵），其余元素数量不多，照旧逐个绑
    const matrixEl = box; // #matrix 自己就是那个网格（外面没有第二层 .matrix 了）
    if (matrixEl) {
      /* #matrix 现在是**常驻**元素（不再每次渲染换一个新的内层网格），
         所以下面前三个事件只绑一次；每次渲染只把"当前这一屏"的列信息换掉。 */
      matrixEl.__mx = {
        colSlots,
        colOf,
        rowHeaderW,
        hoverEl: matrixEl.__mx && matrixEl.__mx.hoverEl,
        hoverKey: "",
      };
      const mx = () => matrixEl.__mx || { colSlots: [], colOf: new Map(), rowHeaderW: 220, hoverEl: null };
      /* 这一行列的 x 坐标表：按鼠标 / 点击的横坐标反解"是第几列、这一列是谁"
         （空列没有自己的 DOM 了，只能这么算）。原点和列宽都跟 grid-template-columns 一致。 */
      const colAtX = (clientX) => {
        const st = mx();
        const ref = bodyBox || matrixEl;
        const scale = typeof uiZoomScale === "function" ? uiZoomScale(matrixEl) || 1 : 1;
        const x = (clientX - ref.getBoundingClientRect().left) / scale;
        let acc = 0;
        for (let i = 0; i < st.colSlots.length; i++) {
          const s = st.colSlots[i];
          if (x >= acc && x < acc + s.w) return s.ch ? getChar(s.ch) : null;
          acc += s.w;
        }
        return null;
      };
      /* 悬浮高亮：只有一个小方块跟着鼠标走（原来一格一个 :hover，现在空格子没有 DOM 了） */
      const hideHover = () => {
        const st = mx();
        st.hoverKey = "";
        if (st.hoverEl) st.hoverEl.hidden = true;
      };
      const showHover = (hit, c) => {
        const st = mx();
        let hoverEl = st.hoverEl;
        if (hoverEl && !hoverEl.isConnected) hoverEl = null;
        if (!hoverEl) {
          hoverEl = document.createElement("div");
          hoverEl.className = "m-hover";
          (bodyBox || matrixEl).appendChild(hoverEl);
          st.hoverEl = hoverEl;
        }
        const col = st.colOf.get(c.id);
        const key = hit.dataset.gridRow + "|" + col;
        if (key === st.hoverKey) return;
        st.hoverKey = key;
        hoverEl.hidden = false;
        hoverEl.style.gridColumn = String(col);
        hoverEl.style.gridRow = hit.dataset.gridRow;
        /* 悬浮说明跟着落在这一格上：内容就是要点亮的那个人 + 这一行的事件 */
        const tip = `${c.name} · ${hit.dataset.title}（双击点亮 / 右键或再次双击点灭）`;
        /* 走 uiSetTipText：悬停中改 title 会招来第二个原生气泡（见 05-ui-common 的注释） */
        if (typeof uiSetTipText === "function") {
          uiSetTipText(hoverEl, tip);
          uiSetTipText(hit, tip);
        } else {
          hoverEl.setAttribute("title", tip);
          hit.setAttribute("title", tip);
        }
      };
      const toggleAt = (hit, clientX) => {
        const c = colAtX(clientX);
        if (c) matrixToggle(hit.dataset.event, c.id);
      };
      if (matrixEl.dataset.mxBound !== "1") {
        matrixEl.dataset.mxBound = "1";
        matrixEl.addEventListener("mousemove", (ev) => {
          const t = ev.target;
          const hit = t && t.closest ? t.closest(".m-row-hit") : null;
          if (!hit) return hideHover();
          const c = colAtX(ev.clientX);
          if (!c) return hideHover();
          showHover(hit, c);
        });
        matrixEl.addEventListener("mouseleave", hideHover);
        matrixEl.addEventListener("dblclick", (ev) => {
          const t = ev.target;
          const hit = t && t.closest ? t.closest(".m-row-hit") : null;
          if (hit) {
            ev.preventDefault();
            toggleAt(hit, ev.clientX);
            return;
          }
          const cell = t && t.closest ? t.closest(".m-cell[data-event]") : null; // 兜底：亮着的格子自己带着答案
          if (!cell) return;
          ev.preventDefault();
          matrixToggle(cell.dataset.event, cell.dataset.char);
        });
        matrixEl.addEventListener("contextmenu", (ev) => {
          const t = ev.target;
          const hit = t && t.closest ? t.closest(".m-row-hit") : null;
          if (hit) {
            ev.preventDefault();
            toggleAt(hit, ev.clientX);
            return;
          }
          const cell = t && t.closest ? t.closest(".m-cell[data-event]") : null;
          if (!cell) return;
          ev.preventDefault();
          matrixToggle(cell.dataset.event, cell.dataset.char);
        });
      }
    }
    // 从人物边栏把人物拖到「事件」这一列（行头）上＝把这个人物加进这个事件的登场人物
    box.querySelectorAll(".m-row-hdr[data-event-id]").forEach((row) => {
      row.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        row.classList.remove("drop-target");
        const ids = (data.type === "chars" ? data.ids : [data.id]).filter((id) => getChar(id));
        addCharsToEvent(ids, row.dataset.eventId);
      });
    });
    // 事件集行 / 竖卡：三角形按钮折叠 / 展开
    box.querySelectorAll(".m-set-fold").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const setId = btn.dataset.eventSetId;
        if (!setId) return;
        if (matrixExpandedEventSets.has(setId)) matrixExpandedEventSets.delete(setId);
        else matrixExpandedEventSets.add(setId);
        renderMatrix();
      });
    });
    // 双击事件集（折叠行或展开竖卡）：回到事件轴并定位到集合卡
    box.querySelectorAll(".m-row-hdr.event-set-row, .m-set-vertical").forEach((el) => {
      el.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".m-set-fold")) return;
        const setId = el.dataset.eventSetId;
        if (!setId) return;
        ev.preventDefault();
        ev.stopPropagation();
        jumpToEventSetInTimeline(setId);
      });
    });
    // 双击二维事件图的章 / 节线：回事件轴并定位到这条分割线
    box.querySelectorAll(".m-band.chapter, .m-band.section").forEach((el) => {
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        jumpToBandInTimeline(el.dataset.chapterId || "", el.dataset.sectionId || "");
      });
    });
    // 左侧事件栏宽度：拖动右边界调整，双击恢复默认
    box.querySelectorAll(".m-col-resizer").forEach((rz) => {
      if (rz.dataset.bound === "1") return;
      rz.dataset.bound = "1";
      rz.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const body = $("#matrix-body");
        if (!body) return;
        const startX = ev.clientX;
        const startW = Math.max(160, Math.min(520, Math.round(matrixRowHeaderW)));
        const restPx = (box.dataset.restCols || "").split(/\s+/).reduce((n, x) => n + (parseFloat(x) || 0), 0);
        let moved = false;
        let lastW = startW;
        const onMove = (e) => {
          const dx = (e.clientX - startX) / uiZoomScale(body);
          if (!moved) {
            if (Math.abs(dx) < 2) return;
            moved = true;
            document.body.classList.add("matrix-col-resizing");
          }
          lastW = Math.max(160, Math.min(520, Math.round(startW + dx)));
          box.style.setProperty("--mx-left-w", lastW + "px");
          if (leftBox) leftBox.style.width = lastW + "px";
          if (hspacer) hspacer.style.width = lastW + restPx + "px";
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("matrix-col-resizing");
          if (moved) {
            matrixRowHeaderW = lastW;
            renderMatrix();
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      rz.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        matrixRowHeaderW = 220;
        renderMatrix();
      });
    });
    // 人物表头：左键编辑人物，右键设置分组
    box.querySelectorAll(".m-char-hdr[data-char-id]").forEach((h) => {
      const cid = h.dataset.charId;
      h.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openCharacterModal(cid);
      });
      h.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        exitSelectModesForContextMenu();
        showCharGroupMenu(ev.clientX, ev.clientY, cid);
        markContextTarget(h);
      });
    });
    // 横轴上的分组名：单击＝折叠 / 展开这一组的人物列；双击＝改分组名（未分组不能改）
    // 折叠后的那条窄色带也一样：点一下就展开（鼠标停上去会显示是哪一组）
    box.querySelectorAll(".m-fold-cell").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        matrixFoldedGroups.delete(el.dataset.foldGid || "");
        renderMatrix();
      });
    });
    box.querySelectorAll(".m-group-hdr").forEach((h) => {
      let foldTimer = null;
      h.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const gid = h.dataset.groupId || "";
        clearTimeout(foldTimer);
        foldTimer = setTimeout(() => {
          if (matrixFoldedGroups.has(gid)) matrixFoldedGroups.delete(gid);
          else matrixFoldedGroups.add(gid);
          renderMatrix();
        }, 220);
      });
      h.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(foldTimer);
        // 程序自带的固定分组（未分组 / 龙套）不改名
        const g = h.dataset.groupId ? getGroup(h.dataset.groupId) : null;
        if (g && g.special !== UNGROUPED_SPECIAL && g.special !== "extra") renameGroup(g.id);
      });
    });
    // 事件行头：单击＝编辑事件，双击＝回事件轴并定位到这个事件，右键＝快捷菜单
    box.querySelectorAll(".m-row-hdr[data-event-id]").forEach((h) => {
      const eid = h.dataset.eventId;
      let clickTimer = null;
      h.addEventListener("click", (ev) => {
        // Shift＝连选行、Ctrl/Cmd＝加选行：自动进入多选，不打开编辑弹窗
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          ev.stopPropagation();
          clearTimeout(clickTimer);
          ensureEventSelectMode();
          if (ev.shiftKey)
            shiftClickCard("matrix", eid, visibleEventIdsForShortcut(), mergeSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("matrix", eid, mergeSelected);
          return;
        }
        ev.stopPropagation();
        clearTimeout(clickTimer);
        markShortcutAnchor("matrix", eid);
        clickTimer = setTimeout(() => openEventModal(eid), 240);
      });
      h.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(clickTimer);
        jumpToEventInTimeline(eid);
      });
      h.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        exitSelectModesForContextMenu();
        showEventTitleMenu(ev.clientX, ev.clientY, eid);
      });
      // 二维事件图里的整行纵向拖动已禁用（拖拽改行容易把行号 / 章节带乱），
      // 这里只保留点击 / 双击 / 右键；要改行号请在事件轴上拖动，或在事件卡右键选「移动至…（按 # 号）」。
    });
    // 线路代号：双击打开线路设置，右键快捷菜单
    box.querySelectorAll(".m-row-hdr .m-line-code").forEach((codeEl) => {
      const h = codeEl.closest(".m-row-hdr");
      const ev0 = h ? getEvent(h.dataset.eventId) : null;
      const lid = ev0 ? linesOf(ev0)[0] : "";
      if (!lid) return;
      codeEl.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openLineModal(lid);
      });
      codeEl.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showLineQuickMenu(ev.clientX, ev.clientY, lid);
      });
      bindLineDrag(codeEl, () => lid, "x");
    });
    box.querySelectorAll(".m-band").forEach((band) =>
      band.addEventListener("click", () => {
        if (band.__justDragged) return;
        if (band.dataset.chapterId !== undefined) {
          const c = getChapter(band.dataset.chapterId);
          if (c) c.collapsed = !c.collapsed;
        } else if (band.dataset.sectionId) {
          const sr = getSection(band.dataset.sectionId);
          if (sr) sr.section.collapsed = !sr.section.collapsed;
        }
        saveState();
        renderChapterRail();
        renderTimeline();
        renderMatrix();
      })
    );
    // 二维事件图里章节 / 节分界线不参与拖拽（避免 bug）；改名 / 上下移 / 删除等仍走右键菜单。
    // 章 / 节分界线的右键菜单：和事件轴上分界线的右键菜单完全一致（禁用项置灰）
    box.querySelectorAll(".m-band").forEach((band) => {
      band.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, band.dataset.chapterId || "", band.dataset.sectionId || "");
        markContextTarget(band);
      });
    });
    if (typeof refreshScrollMinimaps === "function") refreshScrollMinimaps();
    renderChrono(); // 二维事件图重画完，时间线也同步
  }

  // 二维事件图里，把鼠标 Y 映射成「章节分界线要落到哪个行号」（和事件轴同一套逻辑：
  // 分界线放到第一张「中点在鼠标下方」的事件行前面；落到折叠的事件集上＝落到整个事件集下方）。
  function matrixChapterTargetRow(clientY) {
    const { rowEvents } = currentAxisRows();
    const storyToRow = new Map();
    rowEvents.forEach((evs, i) => {
      (evs || []).forEach((e) => {
        if (!storyToRow.has(e.storyIndex)) storyToRow.set(e.storyIndex, i);
      });
    });
    // 可见的“行块”：普通事件行 + 折叠的事件集行（事件集行代表它整段成员）
    const blocks = [];
    $$("#matrix .m-row-hdr[data-event-id]").forEach((row) => {
      const e = getEvent(row.dataset.eventId);
      if (!e || !storyToRow.has(e.storyIndex)) return;
      const r = row.getBoundingClientRect();
      blocks.push({ top: r.top, h: r.height, row: storyToRow.get(e.storyIndex), setEndRow: undefined });
    });
    $$("#matrix .m-row-hdr.event-set-row[data-event-set-id]").forEach((row) => {
      const members = eventSetMembers(row.dataset.eventSetId);
      if (!members.length) return;
      const first = storyToRow.get(members[0].storyIndex);
      const last = storyToRow.get(members[members.length - 1].storyIndex);
      if (first === undefined || last === undefined) return;
      const r = row.getBoundingClientRect();
      blocks.push({ top: r.top, h: r.height, row: first, setEndRow: last });
    });
    if (!blocks.length) return -1;
    blocks.sort((a, b) => a.top - b.top);
    for (let i = 0; i < blocks.length; i++) {
      const blk = blocks[i];
      if (clientY < blk.top + blk.h) {
        // 落点在这个块上
        if (blk.setEndRow !== undefined) return blk.setEndRow + 1; // 整个事件集下方
        const upper = clientY < blk.top + blk.h / 2;
        // 同一行（同一 storyIndex、不同线路）的两个事件在二维图里被画成两行：
        // 分界线不能落在它们中间（等于把一行切成两半），落点自动放到这一行整体下方
        if (upper && i > 0 && blocks[i - 1].row === blk.row) return blk.row + 1;
        if (!upper && i + 1 < blocks.length && blocks[i + 1].row === blk.row) return blk.row + 1;
        return upper ? blk.row : blk.row + 1;
      }
    }
    const lastBlk = blocks[blocks.length - 1];
    return lastBlk.setEndRow !== undefined ? lastBlk.setEndRow + 1 : lastBlk.row + 1;
  }

  // 二维事件图的章节分界线拖动：整块章节带都可以按住上下拖，逻辑与事件轴一致。
  // 二维事件图的节分界线拖动：整块节带都可以按住上下拖，逻辑与事件轴一致。
  // 二维事件图的空章 / 空节带拖动：和事件轴一样，改它们的 anchorStory
  // 二维事件图：点亮 / 点灭某个事件的出场人物，点了就直接生效、直接落盘（不用再保存 / 取消）。
  // 想反悔用左上角的「撤销」（Ctrl+Z），和别处的编辑一样。
  function matrixToggle(eventId, charId) {
    const e = getEvent(eventId);
    if (!e) return;
    const c = getChar(charId);
    const ids = e.characterIds || [];
    const had = ids.includes(charId);
    e.characterIds = had ? ids.filter((id) => id !== charId) : ids.concat(charId);
    // 撤销标签按当前界面语言现拼（不然英文界面里「撤销」的悬浮会夹一句中文）
    pendingUndoLabel = uiSentence(had ? "matrixCastOff" : "matrixCastOn", e.title, c ? c.name : "");
    saveState();
    renderMatrix();
    renderTimeline();
    renderChrono(); // 时间线卡片上的登场人物也跟着变
  }

  function hideContextMenu() {
    $$(".context-menu").forEach((m) => m.remove());
    $$(".ctx-point").forEach((d) => d.remove());
    ctxPointLast = null;
    clearContextTarget();
  }

  /* 右键落点：在点的位置画一个小圈，菜单放在它右下角（放不下会自动翻到左下 / 左上），
     这样用户一眼能看出这次右键点的是哪儿，也不会被菜单挡住。 */
  let ctxPointLast = null;
  function showCtxPoint(x, y) {
    $$(".ctx-point").forEach((d) => d.remove());
    ctxPointLast = { x, y };
    const dot = document.createElement("span");
    dot.className = "ctx-point";
    dot.style.left = uiZoomPx(x);
    dot.style.top = uiZoomPx(y);
    document.body.appendChild(dot);
  }
  uiOnZoomReflow(() => {
    if (!ctxPointLast) return;
    const dot = document.querySelector(".ctx-point");
    if (!dot) return;
    dot.style.left = uiZoomPx(ctxPointLast.x);
    dot.style.top = uiZoomPx(ctxPointLast.y);
  });

  // 右键时高亮「你点的是哪个位置」，关闭菜单时自动清除
  function clearContextTarget() {
    $$(".ctx-indicate").forEach((el) => el.classList.remove("ctx-indicate"));
  }

  function markContextTarget(el) {
    clearContextTarget();
    if (el) el.classList.add("ctx-indicate");
  }

  function showEventLineMenu(x, y, eventId) {
    hideContextMenu();
    const ev = getEvent(eventId);
    if (!ev) return;
    const menu = document.createElement("div");
    menu.id = "line-menu";
    menu.className = "context-menu line-menu";
    menu.tabIndex = -1;
    menu.innerHTML =
      `<div class="context-menu-title">更改所属线路（可多选）</div>` +
      state.lines
        .map(
          (l) =>
            `<label class="context-menu-item line-check-item">
              <input type="checkbox" class="line-menu-cb" data-line-id="${esc(l.id)}" ${linesOf(ev).includes(l.id) ? "checked" : ""} />
              <span class="line-dot" style="background:${esc(l.color)}"></span>
              <span class="line-code">${esc(l.code || "?")}</span>
              <span class="line-name">${esc(lineDisplayName(l))}</span>
              <span class="line-kind ${l.kind === "暗线" ? "hidden" : ""}">${esc(l.kind)}</span>
            </label>`
        )
        .join("") +
      `<div class="context-menu-sep"></div>
       <div class="line-menu-actions">
         <button type="button" class="context-menu-item" data-all="1" title="第一次全选；再点一次只保留第一条线路">全选</button>
         <button type="button" class="context-menu-item" data-apply="1">应用</button>
         <button type="button" class="context-menu-item" data-cancel="1">取消</button>
       </div>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);

    const boxes = () => Array.from(menu.querySelectorAll(".line-menu-cb"));
    const cancel = () => hideContextMenu();
    const apply = () => {
      const ids = boxes()
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.lineId);
      const e = getEvent(eventId);
      if (!e) {
        hideContextMenu();
        return;
      }
      if (!ids.length) {
        uiAlert("至少选择一条线路。");
        return;
      }
      pendingUndoLabel = `修改事件「${e.title}」所属线路`;
      setEventLines(e, ids);
      // 换线后和同一行里别的卡片共用线路 → 挪到下一行（章 / 节不变）
      avoidLaneCollision([e.id]);
      saveState();
      hideContextMenu();
      renderTimeline();
      renderMatrix();
      renderLines();
      renderLineFilters();
      renderMergeSelectBar();
    };
    const cycleAll = () => {
      const list = boxes();
      if (!list.length) return;
      const allOn = list.every((cb) => cb.checked);
      list.forEach((cb, i) => {
        cb.checked = allOn ? i === 0 : true;
      });
      showToast(allOn ? "只保留第一条线路" : `已全选 ${list.length} 条线路`);
    };
    menu.addEventListener("click", (ev2) => {
      if (ev2.target.closest("[data-cancel]")) {
        ev2.stopPropagation();
        cancel();
        return;
      }
      if (ev2.target.closest("[data-all]")) {
        ev2.stopPropagation();
        cycleAll();
        return;
      }
      if (!ev2.target.closest("[data-apply]")) return;
      ev2.stopPropagation();
      apply();
    });
    menu.addEventListener("keydown", (ev2) => {
      if (ev2.key === "Enter") {
        ev2.preventDefault();
        ev2.stopPropagation();
        if (ev2.target && ev2.target.closest && ev2.target.closest("[data-cancel]")) cancel();
        else apply();
      } else if (ev2.key === "Escape") {
        ev2.preventDefault();
        ev2.stopPropagation();
        cancel();
      }
    });
    menu.focus({ preventScroll: true });
  }

  function moveCharToGroup(charId, gid) {
    const c = getChar(charId);
    if (!c) return;
    const target = gid && getGroup(gid) ? gid : "";
    if ((c.groupId || "") === target) return;
    c.groupId = target;
    saveState();
    renderCharacters();
    renderMatrix();
  }

  // 批量把多个人物移到同一个分组（整批拖到分组标题 / 分组空白处时用）
  function moveCharsToGroup(ids, gid) {
    const list = (ids || []).map((id) => getChar(id)).filter(Boolean);
    if (!list.length) return;
    const target = gid && getGroup(gid) ? gid : "";
    const dest = target ? groupDisplayName(getGroup(target)) || uiTextFor("分组") : uiTextFor("未分组");
    let n = 0;
    list.forEach((c) => {
      if ((c.groupId || "") !== target) {
        c.groupId = target;
        n++;
      }
    });
    if (!n) {
      showToast(`这 ${list.length} 位人物本来就在「${dest}」里`);
      return;
    }
    pendingUndoLabel = `把 ${n} 位人物移动到「${dest}」`;
    saveState();
    renderCharacters();
    renderMatrix();
    renderBatchBar();
    showToast(`已把 ${n} 位人物移动到「${dest}」`);
  }

  // 右键菜单：新建一个分组，并把这个人物直接放进去
  async function createGroupForChar(charId) {
    const c = getChar(charId);
    if (!c) return;
    const name = await uiPrompt("新分组的名称？");
    if (name === null || !String(name).trim()) return;
    const g = {
      id: uid(),
      name: String(name).trim(),
      color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
      collapsed: false,
    };
    insertGroupBeforeUngrouped(g); // 新分组排在「未分组」上方
    c.groupId = g.id;
    pendingUndoLabel = `新建分组「${g.name}」，并把「${c.name}」移进去`;
    saveState();
    renderCharacters();
    renderMatrix();
    syncGroupSelectWithModal();
    renderFactionAnalysis();
    renderStats();
    showToast(`已新建分组「${g.name}」，并把「${c.name}」移进去`);
  }

  function showCharGroupMenu(x, y, charId) {
    hideContextMenu();
    const c = getChar(charId);
    if (!c) return;
    const cur = charBucketIdOf(c); // 没归组的人物要显示成勾在「未分组」上
    const item = (gid, name, color) =>
      `<div class="context-menu-item ${gid === cur ? "active" : ""}" data-group="${esc(gid)}">
        <span class="line-dot" style="background:${esc(color)}"></span>
        <span class="line-name">${esc(name)}</span>
        ${gid === cur ? `<span class="menu-check">✓</span>` : ""}
      </div>`;
    let html = `<div class="context-menu-title">「${esc(c.name)}」移动到分组</div>`;
    // 顺序和人物栏一致：普通分组 → 未分组 → 龙套
    html += `<div class="context-menu-grid">`;
    charGroupBucketsOrder().forEach(({ id, group: g }) => {
      html += item(id, g ? groupDisplayName(g) : uiTextFor("未分组"), g ? g.color : "#6b6480");
    });
    html += `</div>`;
    html += `<div class="context-menu-sep"></div>`;
    html += `<div class="context-menu-item" data-newgroup="1"><span class="line-name">＋ 新建…</span></div>`;
    html += `<div class="context-menu-sep"></div>`;
    html += `<div class="context-menu-item" data-act="edit"><span class="line-name">编辑</span></div>`;
    html += `<div class="context-menu-item" data-act="copy"><span class="line-name">复制</span></div>`;
    // 人已在人物链里：给一个「摘掉」的入口（「链接」是取并集，取消要在这里点）
    const inChain = chainOfChar(c.id);
    if (inChain) {
      html += `<div class="context-menu-item" data-act="chain-unlink"><span class="line-dot" style="background:${esc(
        inChain.color || CHAR_COLORS[0]
      )}"></span><span class="line-name">📎 从人物链里摘掉</span></div>`;
    }
    html += `<div class="context-menu-item danger" data-act="delete"><span class="line-name">删除</span></div>`;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML = html;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    placeFloatingAtCursor(menu, x, y, 12, 12);

    menu.querySelectorAll(".context-menu-item").forEach((el) =>
      el.addEventListener("click", async () => {
        hideContextMenu();
        if (el.dataset.act === "edit") openCharacterModal(charId);
        else if (el.dataset.act === "copy") {
          const n = copyCharacters([charId]);
          if (n) showToast(`已复制人物：${copyItemName(c.name)}`);
        }
        else if (el.dataset.act === "delete") await deleteCharacterById(charId);
        else if (el.dataset.act === "chain-unlink") {
          pendingUndoLabel = `人物链：摘掉「${c.name}」`;
          unlinkCharsFromChain([charId]);
          saveState();
          renderCharacters();
          renderCharChainSlots(getChar($("#char-id").value));
          renderRelations(); // 「链接」关系跟着变
          showToast(uiTextFor("已把这张卡从人物链里摘掉（可撤销）"));
        }
        else if (el.dataset.newgroup) await createGroupForChar(charId);
        else moveCharToGroup(charId, el.dataset.group || "");
      })
    );
  }

