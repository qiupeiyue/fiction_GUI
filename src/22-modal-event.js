  /* ================= 弹窗：事件 ================= */
  /* ---- 时间 / 地点的模糊自动补全：候选来自设定档案的「纪年」「地点」 ---- */
  const AC_KINDS = {
    time: { input: "#e-time", ghost: "#e-time-ghost", menu: "#e-time-menu", cat: "纪年", fieldRe: /年代|年份|时间|时期|纪元|纪年/ },
    place: { input: "#e-place", ghost: "#e-place-ghost", menu: "#e-place-menu", cat: "地点", fieldRe: /位置|所在地|区域|地址|所在|地区/ },
  };
  const acRuntime = { time: { items: [], index: 0 }, place: { items: [], index: 0 } };

  // 归一化：忽略大小写、空格和各种标点，「星历一年 · 开天」等同于「星历一年开天」
  function acNorm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\s\u00a0\u3000]+/g, "")
      .replace(/[·・•‧∙\-—–~～、，,。.！!？?；;：:（）()《》〈〉【】\[\]"'“”‘’/\\|]/g, "");
  }

  // 模糊打分：完全相同 > 前缀 > 包含 > 顺序子序列
  function acScore(q, text) {
    const a = acNorm(q);
    const b = acNorm(text);
    if (!a || !b) return 0;
    if (b === a) return 2000;
    if (b.startsWith(a)) return 1200 - Math.min(300, b.length - a.length);
    const idx = b.indexOf(a);
    if (idx >= 0) return 800 - Math.min(300, idx * 4) - Math.min(200, b.length - a.length);
    let i = 0;
    let first = -1;
    let last = -1;
    for (let j = 0; j < b.length && i < a.length; j++) {
      if (b[j] === a[i]) {
        if (first < 0) first = j;
        last = j;
        i++;
      }
    }
    if (i === a.length) return 500 - Math.min(200, (last - first) * 4) - Math.min(200, b.length - a.length);
    return 0;
  }

  function acCategory(kind) {
    const name = AC_KINDS[kind].cat;
    const byKind = findCatByKind(kind === "time" ? "era" : "place");
    if (byKind) return byKind;
    const cats = (state.settings && state.settings.categories) || [];
    return cats.find((c) => c.name === name) || cats.find((c) => String(c.name || "").includes(name)) || null;
  }

  // 候选：条目名 + 「年代 / 位置…」这类字段的值 + 标签
  // text＝会填进去的字；label＝用于模糊匹配的别名；hint＝候选行右侧的小字说明
  function acCandidates(kind) {
    const cfg = AC_KINDS[kind];
    const cat = acCategory(kind);
    const out = [];
    const seen = new Set();
    const push = (text, label, hint) => {
      const t = String(text || "").trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push({ text: t, label: String(label || "").trim(), hint: String(hint || "").trim() });
    };
    if (cat) {
      state.settings.entries
        .filter((en) => en.categoryId === cat.id)
        .forEach((en) => {
          const name = en.name || "";
          push(en.name, name, name);
          (en.fields || []).forEach((f) => {
            if (!cfg.fieldRe.test(String((f && f.label) || ""))) return;
            push(f.value, name, name);
          });
          (en.tags || []).forEach((t) => push(t, name, name));
        });
    }
    // 时间 / 地点：再把「所有事件卡片里已经填过的」也作为候选，
    // 免得同一个时间 / 地点被写成「1982年 / 1982 年」「王都·白塔 / 王都白塔」这种只差一点点的重复值
    const field = kind === "time" ? "time" : kind === "place" ? "place" : "";
    if (field) {
      const used = new Map();
      (state.events || []).forEach((e) => {
        const t = String(e[field] || "").trim();
        if (!t) return;
        used.set(t, (used.get(t) || 0) + 1);
      });
      used.forEach((n, t) => push(t, "", n > 1 ? `已有事件 ×${n}` : "已有事件"));
    }
    return out;
  }

  function acSuggest(kind, query) {
    const cands = acCandidates(kind);
    const q = String(query || "").trim();
    if (!q) return [];
    const scored = [];
    cands.forEach((c) => {
      // 候选自身的文字优先；只在条目名上命中时给较低的权重，避免「按名字搜到却填了别的字段」
      const s = Math.max(acScore(q, c.text), Math.round(acScore(q, c.label) * 0.45));
      if (s > 0) scored.push(Object.assign({ score: s }, c));
    });
    scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, "zh-Hans-CN"));
    const out = [];
    const used = new Set();
    scored.forEach((x) => {
      if (used.has(x.text)) return;
      used.add(x.text);
      out.push(x);
    });
    return out.slice(0, 8);
  }

  // 已输入部分正好是候选开头时，返回「后半截」用来做半透明补全提示
  function acRestAfterTyped(text, typed) {
    const need = acNorm(typed).length;
    if (!need) return "";
    const t = String(text || "");
    if (!acNorm(t).startsWith(acNorm(typed))) return "";
    let count = 0;
    for (let i = 0; i < t.length; i++) {
      if (acNorm(t[i]).length) count++;
      if (count >= need) {
        const rest = t.slice(i + 1);
        return acNorm(rest) === acNorm(t) ? "" : rest;
      }
    }
    return "";
  }

  function acEls(kind) {
    const cfg = AC_KINDS[kind];
    return { input: $(cfg.input), ghost: $(cfg.ghost), menu: $(cfg.menu) };
  }

  function acReset(kind) {
    const { ghost, menu } = acEls(kind);
    acRuntime[kind].items = [];
    acRuntime[kind].index = 0;
    if (ghost) {
      ghost.hidden = true;
      ghost.innerHTML = "";
    }
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = "";
    }
  }

  function acRender(kind) {
    const { input, ghost, menu } = acEls(kind);
    if (!input || !ghost || !menu) return;
    if (document.activeElement !== input) {
      acReset(kind);
      return;
    }
    const rt = acRuntime[kind];
    const typed = input.value;
    const items = acSuggest(kind, typed);
    rt.items = items;
    if (rt.index >= items.length) rt.index = 0;

    // 半透明补全：把候选里「还没敲的那半截」画在输入文字后面
    const rest = typed.trim() && items.length ? acRestAfterTyped(items[0].text, typed) : "";
    if (rest) {
      ghost.innerHTML = `<span class="ac-typed">${esc(typed)}</span><span class="ac-hint">${esc(rest)}</span>`;
      ghost.hidden = false;
    } else {
      ghost.hidden = true;
      ghost.innerHTML = "";
    }

    if (!typed.trim()) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    if (!items.length) {
      menu.innerHTML = `<span class="ac-empty">没有匹配的条目</span>`;
      menu.hidden = false;
      return;
    }
    menu.innerHTML = items
      .map((it, i) => {
        const from = it.hint && acNorm(it.hint) !== acNorm(it.text) ? `<span class="ac-from">${esc(it.hint)}</span>` : "";
        return `<span class="ac-item ${i === rt.index ? "active" : ""}" data-ac-index="${i}" title="点一下（或双击输入框 / 按回车）就填入「${esc(
          it.text
        )}」"><span class="ac-text">${esc(it.text)}</span>${from}</span>`;
      })
      .join("");
    menu.hidden = false;
    menu.querySelectorAll(".ac-item").forEach((el) => {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault(); // 不让输入框失焦
        acAccept(kind, parseInt(el.dataset.acIndex, 10) || 0);
      });
    });
  }

  function acAccept(kind, idx) {
    const { input } = acEls(kind);
    const item = acRuntime[kind].items[idx || 0];
    if (!input || !item) return false;
    input.value = item.text;
    acReset(kind);
    try {
      input.setSelectionRange(item.text.length, item.text.length);
    } catch (e) {
      /* ignore */
    }
    input.focus();
    return true;
  }

  function bindEventAutoComplete() {
    Object.keys(AC_KINDS).forEach((kind) => {
      const { input } = acEls(kind);
      if (!input) return;
      input.addEventListener("input", () => {
        acRuntime[kind].index = 0;
        acRender(kind);
      });
      input.addEventListener("focus", () => acRender(kind));
      input.addEventListener("blur", () => {
        setTimeout(() => {
          if (document.activeElement !== input) acReset(kind);
        }, 120);
      });
      // 双击输入框 = 采用最靠前的推荐
      input.addEventListener("dblclick", (ev) => {
        if (acRuntime[kind].items.length && acAccept(kind, acRuntime[kind].index)) ev.preventDefault();
      });
      input.addEventListener("keydown", (ev) => {
        const rt = acRuntime[kind];
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          if (!rt.items.length) return;
          ev.preventDefault();
          rt.index = (rt.index + (ev.key === "ArrowDown" ? 1 : rt.items.length - 1)) % rt.items.length;
          acRender(kind);
          return;
        }
        if (ev.key === "Enter") {
          if (!rt.items.length || !input.value.trim()) return; // 没有推荐就让表单照常提交
          ev.preventDefault();
          ev.stopPropagation();
          acAccept(kind, rt.index);
          return;
        }
        if (ev.key === "Escape") {
          // 先关掉推荐列表（半透明补全提示 / 下拉候选），这一下 Esc 不要顺手把弹窗也关了
          if (rt.items.length) ev.stopPropagation();
          acReset(kind);
        }
      });
    });
  }

  function openEventModal(id) {
    const ev = id ? getEvent(id) : null;
    eventFormChapterTouched = false; // 每次打开都从「没动过章 / 节」开始
    // 在空白处右键新建时，把点击的位置（故事时间点 + 线路）带进来
    const place = ev ? null : pendingEventPlace;
    pendingEventPlace = null;
    eventPlaceDraft = place || null;
    $("#event-modal-title").textContent = ev ? "事件信息" : "新建事件";
    // 「#」：显示这个事件所在的行号；新建时预填落点行号（改它＝把事件移动到该行）
    {
      const rowEl = $("#e-row");
      if (rowEl) {
        let n = 0;
        if (ev) n = eventRowNumber(ev.id);
        else if (place && Number.isFinite(Number(place.storyIndex))) {
          const v = Number(place.storyIndex);
          // # 用全量行号（不受线路筛选影响）
          const rows = axisRows();
          const i = rows.findIndex((r) => (r.v || 0) >= v);
          n = (i < 0 ? rows.length : i) + 1;
        }
        rowEl.value = n ? String(n) : "";
      }
    }
    $("#event-id").value = ev ? ev.id : "";
    $("#e-title").value = ev ? ev.title : "";
    $("#e-time").value = ev ? ev.time || "" : "";
    $("#e-place").value = ev ? ev.place || "" : "";
    acReset("time");
    acReset("place");
    $("#e-cause").value = ev ? ev.cause || "" : "";
    $("#e-process").value = ev ? ev.process || "" : "";
    $("#e-result").value = ev ? ev.result || "" : "";
    $("#e-notes").value = ev ? ev.notes || "" : "";
    $("#e-narrative").value = ev ? ev.narrative || "" : "";
    $("#event-delete-btn").hidden = !ev;
    const placeLine = eventPlaceDraft && getLine(eventPlaceDraft.lineId) ? eventPlaceDraft.lineId : "";
    const lineDefault = ev ? linesOf(ev) : placeLine ? [placeLine] : [lineFilterDefaultId()];
    renderLinePool(lineDefault);
    const placeChapter = ev ? ev.chapterId || "" : place && place.chapterId ? place.chapterId : "";
    const placeSection = ev ? ev.sectionId || "" : place && place.sectionId ? place.sectionId : "";
    renderChapterSelect(placeChapter);
    renderSectionSelect(placeChapter, placeSection);
    renderCharPool("event-char-pool", ev ? ev.characterIds || [] : [], true);
    setEventCharPoolFold(true); // 「登场人物」默认折叠，标题上直接显示已选人物
    applyFieldSchemaToEditor("event");
    renderEventFields(ev ? ev.fields || [] : []);
    setFieldsFolded("event", fieldsFolded.event); // 记住上次的折叠状态
    fillGlobalCustomFieldValues("event", ev);
    openModal("event-modal");
    setTimeout(() => $("#e-title").focus(), 50);
  }

  /* ---- 事件自定义字段（和人物一样，内容存在 ev.fields 里） ---- */
  function renderEventFields(fields) {
    const box = $("#e-fields");
    if (!box) return;
    const globalLabels = globalCustomLabels("event");
    const list = (fields || []).filter(
      (f) => f && (f.label || f.value) && !globalLabels.has(String(f.label || "").trim())
    );
    if (!list.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = list
      .map(
        (f, i) => `<div class="entry-field-row" data-idx="${i}">
          <input type="text" class="ef-label" placeholder="字段名" value="${esc(f.label || "")}" />
          <textarea class="ef-value" rows="1" placeholder="内容">${esc(f.value || "")}</textarea>
          <button type="button" class="icon-btn ef-del" title="删除这个字段">×</button>
        </div>`
      )
      .join("");
    bindEventFieldRows(box);
  }

  function bindEventFieldRows(box) {
    box.querySelectorAll(".ef-del").forEach((b) =>
      b.addEventListener("click", () => {
        b.closest(".entry-field-row").remove();
        if (!box.querySelector(".entry-field-row")) renderEventFields([]);
      })
    );
  }

  function addEventFieldRow() {
    const box = $("#e-fields");
    if (!box) return;
    const row = document.createElement("div");
    row.className = "entry-field-row";
    row.innerHTML = `<input type="text" class="ef-label" placeholder="字段名" value="" />
      <textarea class="ef-value" rows="1" placeholder="内容"></textarea>
      <button type="button" class="icon-btn ef-del" title="删除这个字段">×</button>`;
    box.appendChild(row);
    bindEventFieldRows(box);
    const input = row.querySelector(".ef-label");
    if (input) input.focus();
  }

  function collectEventFields() {
    return $$("#e-fields .entry-field-row")
      .map((row) => {
        const l = row.querySelector(".ef-label");
        const v = row.querySelector(".ef-value");
        return { label: l ? l.value.trim() : "", value: v ? v.value.trim() : "" };
      })
      .filter((f) => f.label || f.value);
  }

  // 事件可所属多条线路：用可勾选的标签选择
  function renderChapterSelect(selected) {
    const sel = $("#e-chapter");
    if (!sel) return;
    sel.innerHTML =
      `<option value="">未分章</option>` + state.chapters.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join("");
    sel.value = selected && getChapter(selected) ? selected : "";
  }

  function renderSectionSelect(chapterId, selected) {
    const sel = $("#e-section");
    if (!sel) return;
    const c = getChapter(chapterId);
    const secs = c ? c.sections || [] : [];
    sel.innerHTML = `<option value="">（不分节）</option>` + secs.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("");
    sel.disabled = !c;
    sel.value = selected && secs.some((s) => s.id === selected) ? selected : "";
  }

  /* 事件信息 / 新建事件里「所属章」「所属节」「#」三个字段的联动：
     · 改 # → 所属章 / 所属节跟着变（放到那一行，归到那一行的章 / 节）
     · 改所属章 / 所属节 → 把 # 夹到这一章 / 节的 #N:M 范围内：
         N <= # <= M 不动；# < N 填 N；# > M 填 M+1（放到本章 / 节末尾之后，仍属于它） */
  let eventFormChapterTouched = false;

  function chapterRowRange(chapterId) {
    const seg = (axisBandRanges().chapterSegs || []).find((s) => s.chapterId === chapterId);
    return seg ? { n: seg.startRow + 1, m: seg.endRow + 1 } : null;
  }
  function sectionRowRange(sectionId) {
    const seg = (axisBandRanges().sectionSegs || []).find((s) => s.sectionId === sectionId);
    return seg ? { n: seg.startRow + 1, m: seg.endRow + 1 } : null;
  }
  function eventSelectionRowRange() {
    const sec = $("#e-section").value;
    if (sec) return sectionRowRange(sec);
    const ch = $("#e-chapter").value;
    if (ch) return chapterRowRange(ch);
    return null;
  }
  // 某一行 #（1 起算）属于哪章 / 哪节；行本身没事件时，找最近的上一行（再下一行）补
  function chapterSectionAtRowNo(n) {
    const rows = axisRows();
    const row = rows[n - 1];
    const items = row ? row.items || [] : [];
    if (!items.length) {
      // 空行：向上找最近的有事件的行，再向下找
      const candidates = [];
      for (let i = n - 2; i >= 0; i--) candidates.push(rows[i]);
      for (let i = n; i < rows.length; i++) candidates.push(rows[i]);
      for (const r of candidates) {
        if (r && r.items && r.items.length) {
          return {
            chapterId: dominantField(r.items, "chapterId"),
            sectionId: dominantField(r.items, "sectionId"),
          };
        }
      }
      return { chapterId: "", sectionId: "" };
    }
    return {
      chapterId: dominantField(items, "chapterId"),
      sectionId: dominantField(items, "sectionId"),
    };
  }
  function clampEventRowInput() {
    const rowEl = $("#e-row");
    const range = eventSelectionRowRange();
    if (!rowEl || !range) return;
    let n = Number(rowEl.value);
    if (!Number.isFinite(n)) return;
    n = Math.floor(n);
    if (n < 1) n = 1;
    if (n < range.n) n = range.n;
    else if (n > range.m) n = range.m + 1;
    rowEl.value = String(n);
  }

  // 用户改了「所属章 / 所属节」→ 把 # 夹到这一章 / 节的范围里（Rule 2）
  function syncEventFormRowFromChapterSection() {
    eventFormChapterTouched = true;
    clampEventRowInput();
  }
  // 用户改了 # → 所属章 / 所属节下拉框跟着这一行变（Rule 1 的界面反馈）
  function syncEventFormChapterSectionFromRow() {
    eventFormChapterTouched = false; // # 是最后一次操作，以 # 所在行为准
    const rowEl = $("#e-row");
    const n = Number(rowEl ? rowEl.value : "");
    if (!Number.isFinite(n) || n < 1) return;
    const { chapterId, sectionId } = chapterSectionAtRowNo(Math.floor(n));
    renderChapterSelect(chapterId);
    renderSectionSelect(chapterId, sectionId);
  }

  function renderLinePool(selectedIds) {
    const box = $("#event-line-pool");
    if (!box) return;
    if (!state.lines.length) {
      box.innerHTML = `<span class="pool-empty">还没有线路，先在左侧「线路」创建。</span>`;
      return;
    }
    const sel = new Set((selectedIds || []).filter((id) => getLine(id)));
    const allOn = state.lines.length > 0 && state.lines.every((l) => sel.has(l.id));
    box.innerHTML =
      state.lines
        .map((l) => {
          const active = sel.has(l.id);
          return `<span class="pool-chip ${active ? "active" : ""}" data-pool-line="${esc(l.id)}"><span class="line-dot" style="background:${esc(l.color)}"></span>${esc(l.code || "?")} ${esc(lineDisplayName(l))}</span>`;
        })
        .join("") +
      // 「全局」：一键选中所有线路（已经全选时再点一下＝全部取消）
      `<span class="pool-chip pool-global ${allOn ? "active" : ""}" data-pool-global="1" title="${
        allOn ? "再点一下＝取消全部线路" : "全局：选中所有线路（这个事件属于每一条线）"
      }">全局</span>`;
    box.querySelectorAll(".pool-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (chip.dataset.poolGlobal) {
          renderLinePool(allOn ? [] : state.lines.map((l) => l.id));
          return;
        }
        const id = chip.dataset.poolLine;
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
        renderLinePool(Array.from(sel));
      });
    });
  }

  function nextStoryIndex() {
    if (!state.events.length) return 0;
    return (
      Math.max.apply(
        null,
        state.events.map((e) => (typeof e.storyIndex === "number" ? e.storyIndex : 0))
      ) + 1
    );
  }

  // 新事件落在它所属章节的时间段里，而不是一律追加到全部事件末尾
  // —— 这样逐章增量分析（甚至并发）也不会把故事顺序弄乱
  function insertStoryIndexFor(chapterId) {
    const chapters = state.chapters || [];
    const ci = chapterId ? chapters.findIndex((c) => c.id === chapterId) : -1;
    let v = nextStoryIndex(); // 默认兜底：追加到末尾
    if (ci >= 0) {
      const own = state.events.filter((e) => e.chapterId === chapterId);
      if (own.length) {
        v = Math.max.apply(null, own.map((e) => e.storyIndex || 0)) + 0.001;
      } else {
        // 本章还没有事件：接在前一章最后一个事件之后
        let placed = false;
        for (let k = ci - 1; k >= 0; k--) {
          const prev = state.events.filter((e) => e.chapterId === chapters[k].id);
          if (prev.length) {
            v = Math.max.apply(null, prev.map((e) => e.storyIndex || 0)) + 0.001;
            placed = true;
            break;
          }
        }
        // 前面都没事件：放到后面章节第一个事件之前
        if (!placed) {
          for (let k = ci + 1; k < chapters.length; k++) {
            const nxt = state.events.filter((e) => e.chapterId === chapters[k].id);
            if (nxt.length) {
              v = Math.min.apply(null, nxt.map((e) => e.storyIndex || 0)) - 0.001;
              placed = true;
              break;
            }
          }
        }
      }
    }
    // 防撞：多个章节并发新增时可能算出同一个 storyIndex（挤在同一行）。
    // 找到已有值就往后微调，保证行号唯一。
    const used = new Set(state.events.map((e) => e.storyIndex));
    let guard = 0;
    while (used.has(v) && guard++ < 1000) v += 0.0005;
    return v;
  }

  function submitEventForm(e) {
    e.preventDefault();
    const id = $("#event-id").value;
    const title = $("#e-title").value.trim();
    if (!title) return;
    pendingUndoLabel = (id ? "修改事件：" : "新建事件：") + "「" + title + "」";
    const characterIds = getPoolSelection("event-char-pool");
    // 注意排除「全局」这个快捷标签（它没有 data-pool-line）
    const lineIds = $$("#event-line-pool .pool-chip.active")
      .map((el) => el.dataset.poolLine)
      .filter(Boolean);
    const data = {
      title,
      time: $("#e-time").value.trim(),
      place: $("#e-place").value.trim(),
      lineIds: lineIds.length ? lineIds : [state.lines[0].id],
      chapterId: $("#e-chapter").value,
      sectionId: $("#e-section").value,
      narrative: normNarrative($("#e-narrative").value),
      cause: $("#e-cause").value.trim(),
      process: $("#e-process").value.trim(),
      result: $("#e-result").value.trim(),
      notes: $("#e-notes").value.trim(),
      fields: collectGlobalCustomFieldValues("event").concat(collectEventFields()),
      characterIds,
    };
    let created = null;
    if (id) {
      const ev = getEvent(id);
      // 时间文字在弹窗里被改过：上一次在时间线里改文字留下的排序兜底要作废
      if (ev && String(ev.time || "") !== String(data.time || "")) delete ev.timeSortKey;
      Object.assign(ev, data);
      ev.sourcePinned = true; // 手动在弹窗里选过章 / 节，之后「归位」不再改动它
      eventPlaceDraft = null;
    } else {
      const place = eventPlaceDraft;
      eventPlaceDraft = null;
      const wanted = place ? Number(place.storyIndex) : NaN;
      const storyIndex = Number.isFinite(wanted) ? wanted : nextStoryIndex();
      const ev = Object.assign({ id: uid(), storyIndex }, data);
      ev.sourcePinned = !!data.chapterId; // 手动指定过章 / 节的新事件也视为已定
      state.events.push(ev);
      // 新建后立刻撞一下版本号：getEvent() / currentAxisRows() 这些索引按 stateDataRev 缓存，
      // 不撞的话下面按 # 定位这个刚建的事件会读不到它。
      bumpStateRev();
      // 在展开的事件集内部空隙新建的：直接并入这个集合（否则会在集合行里留一个“不属于集合”的洞）
      if (place && place.setId) assignEventToSetAllLines(ev, place.setId);
      if (!state.order.length) {
        state.order = state.events.map((x) => x.id);
      } else {
        state.order.push(ev.id);
      }
      created = ev;
    }
    // 「#」框：用户改过行号 → 相当于把这个事件移动到该行（行内让位，章节 / 事件集跟着重算）
    {
      const rowEl = $("#e-row");
      const rawRow = rowEl ? String(rowEl.value || "").trim() : "";
      const rowNum = rawRow ? Number(rawRow) : NaN; // 留空 / 乱填＝不改行号
      const targetId = id || (created ? created.id : "");
      if (targetId && Number.isFinite(rowNum)) {
        /* 移动走的是和「右键 → 移动至…（按 # 号）」同一个函数（moveEventToRowNo）：
           撞行时线路不冲突就并到同一行的空白线路，冲突才插到 N-1 / N 之间，两边结果一致。 */
        moveEventToRowNo(targetId, rowNum, { keepChapters: eventFormChapterTouched });
        if (rowEl) rowEl.value = String(eventRowNumber(targetId)); // 回填真实行号（小数 / 越界都已修正）
      }
    }
    // 改线路 / 新建之后：和同一行里别的卡片共用线路会挤在一起 → 挪到下一行（章 / 节保持原样）
    avoidLaneCollision([id || (created ? created.id : "")]);
    // 最后再兜一次：如果这次落点产生了小数行号（插到两行之间 / 挤占下移），归整回连续整数
    normalizeStoryIndexesIfFractional();
    saveState();
    /* 事件改了：线路 / 事件轴 / 二维图 / **时间线** 一起刷新。
       以前这里漏了时间线（renderChrono），改完「时间」得去按一下「恢复自动排序」才看到，
       看起来像是那个按钮在负责更新。refreshLineViews 里本来就包含这几样。 */
    refreshLineViews();
    syncSavedId("event-modal", created ? created.id : "");
    finishCardSave("event-modal");
    if (created) {
      flash(created);
      // 滚动到刚建好的事件，确认它确实落在点击的那一行
      const el = $(`#timeline .event-card[data-event-id="${created.id}"]`);
      if (el && typeof el.scrollIntoView === "function") {
        try {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (err) {
          /* 个别环境不支持带参数调用，忽略 */
        }
      }
    }
  }

  async function deleteEvent() {
    const id = $("#event-id").value;
    if (!id) return;
    const target = getEvent(id);
    if (typeof confirmEventDeletionWithNovel === "function") {
      const ok = await confirmEventDeletionWithNovel(target ? [target] : []);
      if (!ok) return;
    }
    pendingUndoLabel = `删除事件：「${target ? target.title : ""}」`;
    state.events = state.events.filter((e) => e.id !== id);
    state.order = state.order.filter((oid) => oid !== id);
    state.settings.entries.forEach((en) => (en.eventIds = (en.eventIds || []).filter((eid) => eid !== id)));
    saveState();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("delete");
    refreshLineViews(); // 时间线也要跟着少一行
    closeModal("event-modal");
  }

