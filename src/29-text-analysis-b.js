  function fieldsetDefaultList(kind, catId) {
    if (kind === "entry") {
      const cat = getCat(catId);
      const tpl =
        (cat && Array.isArray(cat.fieldTemplate) && cat.fieldTemplate.length && cat.fieldTemplate) ||
        FIELDSET_ENTRY_CUSTOM[catZhName(cat)] ||
        FIELDSET_ENTRY_CUSTOM_BY_KIND[catKind(cat)] ||
        [];
      return tpl.map((label, i) => ({ key: "t" + i, label, custom: true }));
    }
    return (FIELDSET_DEFS[kind] || []).map((d) => Object.assign({}, d));
  }

  // 已保存的字段清单；没保存过就用默认的（设定档案直接沿用类别的 fieldTemplate）
  function fieldsetSchemaOf(kind, catId) {
    if (kind === "entry") return fieldsetDefaultList("entry", catId);
    const saved = (state.fieldSchemas || {})[kind];
    if (Array.isArray(saved) && saved.length) {
      // 只保留「可以填字的字段」：内置的按白名单过滤（下拉 / 勾选 / 关联人物这类不算字段）
      const allowed = new Set((FIELDSET_DEFS[kind] || []).map((d) => d.key));
      const list = saved
        .filter((d) => d && (d.custom || allowed.has(d.key)))
        .map((d) => Object.assign({}, d));
      if (list.length) return list;
    }
    return fieldsetDefaultList(kind, catId);
  }

  // 面板上编辑的是「草稿」，点两个生效按钮才写回 state
  const fieldsetDraft = { char: null, event: null, entry: {} };
  let fieldsetEntryScope = "";

  /* 「追加功能 → 雷达图」也是草稿：勾选、顶点都只是暂存，
     点「保存」才写回类别的 radar；× / Esc 关掉设置就丢掉（用户要求：不保存不作数）。 */
  const radarDraft = {};
  function radarDraftOf(cat) {
    if (!cat) return null;
    if (!radarDraft[cat.id]) {
      const r = ensureCatRadar(cat);
      radarDraft[cat.id] = { feature: r.feature, axes: JSON.parse(JSON.stringify(r.axes)) };
    }
    return radarDraft[cat.id];
  }
  /* 保存设置时调用：把草稿写回类别 */
  function radarDraftApply() {
    Object.keys(radarDraft).forEach((catId) => {
      const cat = getCat(catId);
      if (!cat) return;
      const d = radarDraft[catId];
      const r = ensureCatRadar(cat);
      r.feature = !!d.feature;
      r.axes = JSON.parse(JSON.stringify(d.axes || []));
      if (!r.axes.length) r.axes = defaultRadarAxesFor(cat);
    });
  }
  function radarDraftClear() {
    Object.keys(radarDraft).forEach((k) => delete radarDraft[k]);
  }

  function fieldsetDraftOf(kind, catId) {
    if (kind === "entry") {
      const key = catId || "";
      if (!fieldsetDraft.entry[key]) fieldsetDraft.entry[key] = fieldsetSchemaOf("entry", key);
      fieldsetDraft.entry[key] = normalizeFieldsetOrder(fieldsetDraft.entry[key], "entry");
      return fieldsetDraft.entry[key];
    }
    if (!fieldsetDraft[kind]) fieldsetDraft[kind] = fieldsetSchemaOf(kind);
    fieldsetDraft[kind] = normalizeFieldsetOrder(fieldsetDraft[kind], kind);
    return fieldsetDraft[kind];
  }

  // 锁定字段（姓名 / 别名、事件标题 / 时间 / 地点）永远排在最前，其余保持原顺序
  function normalizeFieldsetOrder(list, kind) {
    const arr = list || [];
    const isLocked = (f) => !!(f && (f.locked || f.required));
    // 锁定字段永远在最上面，而且固定按内置顺序排（标题 → 时间 → 地点），不受历史保存顺序影响
    const defs = FIELDSET_DEFS[kind] || [];
    const defIdx = (f) => {
      const i = defs.findIndex((d) => d.key === f.key);
      return i < 0 ? 999 : i;
    };
    const locked = arr.filter(isLocked).slice().sort((a, b) => defIdx(a) - defIdx(b));
    const rest = arr.filter((f) => !isLocked(f));
    if (locked.length === 0) return arr;
    const same = arr.length === locked.length + rest.length && locked.every((f, i) => arr[i] === f);
    if (same) return arr;
    return locked.concat(rest);
  }

  function setFieldsetDraft(kind, catId, list) {
    if (kind === "entry") fieldsetDraft.entry[catId || ""] = list;
    else fieldsetDraft[kind] = list;
  }

  function renderFieldsetPanel(kind) {
    const box = $("#fieldset-" + kind);
    if (!box) return;
    const catId = kind === "entry" ? fieldsetEntryScope : "";
    const list = fieldsetDraftOf(kind, catId);
    const lockedCount = list.filter((f) => f.locked || f.required).length;
    let seq = 0;
    const rowHtml = (f, i) => {
      const locked = !!(f.locked || f.required);
      if (!locked) seq++;
      // 「默认」＝程序自带的字段（人物 / 事件的内置字段，设定类别的字段模板）；其余算「自定义」
      const isBuiltin = kind === "entry" ? true : !f.custom;
      const tagText = f.off ? "已隐藏" : isBuiltin ? "默认" : "自定义";
      const tagCls = f.off ? " off" : isBuiltin ? " builtin" : " custom";
      return `<div class="fieldset-row${f.off ? " off" : ""}${locked ? " locked" : ""}">
          ${
            locked
              ? `<span class="fs-grip locked"></span>`
              : `<span class="fs-grip" draggable="true" title="按住拖动＝调整顺序">⠿</span>`
          }
          <span class="fs-idx" title="顺序（和卡片编辑界面里未锁定字段的排列一致）">${locked ? "" : seq}</span>
          <input type="text" class="fs-label" data-idx="${i}" value="${esc(
              uiDefaultLabel(f.label || "") || ""
            )}" placeholder="字段名"${
              locked ? ` readonly title="这个字段和文本分析绑定，不能改名、删除或移动"` : ""
            } />
          ${
            locked
              ? `<span class="fs-lock" title="这个字段和文本分析绑定，不能改名、删除或移动">🔒</span>`
              : `<span class="fs-tag${tagCls}">${tagText}</span><button type="button" class="icon-btn fs-del" data-idx="${i}" title="${
                  f.off ? "恢复显示这个字段" : "从清单里删掉这个字段"
                }">${f.off ? "↺" : "×"}</button>`
          }
        </div>`
    };
    // 锁定字段（姓名 / 别名、标题 / 时间 / 地点）不在设置里显示，
    // 但文本分析照旧一定要分析它们 —— 它们只是不占这里的版面而已
    const otherRows = [];
    list.forEach((f, i) => {
      if (f.locked || f.required) return;
      otherRows.push(rowHtml(f, i));
    });
    box.innerHTML = `<div class="fs-group">${otherRows.join("")}</div>`;
    box.querySelectorAll(".fs-label").forEach((inp) => {
      const i = Number(inp.dataset.idx);
      const f = list[i];
      // 锁定字段（姓名 / 别名、事件标题 / 时间 / 地点）：禁止改名
      if (f && (f.locked || f.required)) {
        inp.readOnly = true;
        inp.setAttribute("aria-readonly", "true");
        return;
      }
      let renameBefore = null; // 这次聚焦开始时这份清单的样子
      inp.addEventListener("input", () => {
        if (list[i]) list[i].label = inp.value;
        // 输入保护里那一条的名字也跟着改（设定档案的保护 key 是按字段名算的，
        // 改完这个名字它才真正存在）。打字期间延后再重画，别一个字一个字地重建。
        scheduleFillProtectReload();
        // 一次「改字段名」只记一步：第一次改动时把改之前的清单存下来
        if (renameBefore) {
          const before = renameBefore;
          renameBefore = null;
          const draftOverride = settingsDraftCopy();
          if (kind === "entry") draftOverride.entry[catId || ""] = before;
          else draftOverride[kind] = before;
    pushSettingsUndo(`修改字段名：「${uiDefaultLabel((before[i] && before[i].label) || "")}」`, draftOverride);
        }
      });
      inp.addEventListener("focus", () => {
        renameBefore = list.map((f) => Object.assign({}, f));
      });
    });
    box.querySelectorAll(".fs-del").forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.idx);
        const f = list[i];
        if (!f || f.required) return;
        pushSettingsUndo(
          f.off ? `恢复字段显示：「${f.label || ""}」` : `删除字段：「${f.label || f.key || ""}」`
        );
        if (f.off) f.off = false; // 旧数据里「已隐藏」的字段：点一下恢复显示
        else list.splice(i, 1); // × ＝ 从清单里删掉（内置字段也一样；想恢复点「恢复默认」）
        renderFieldsetPanel(kind);
      });
    });
    bindFieldsetDragSort(kind, box, list);
    // 「输入保护」的清单跟着这张清单走：加 / 删 / 改名 / 恢复默认都当场反映过去
    renderFillProtect();
  }

  // 全局字段：拖动每一行前面的小把手来调整顺序（三列网格，拖到哪一格就排到哪一格）
  function bindFieldsetDragSort(kind, box, list) {
    let dragIdx = -1;
    const idxOf = (row) => Number((row.querySelector(".fs-label") || {}).dataset ? row.querySelector(".fs-label").dataset.idx : -1);
    box.querySelectorAll(".fieldset-row").forEach((row) => {
      const grip = row.querySelector(".fs-grip");
      if (grip)
        grip.addEventListener("dragstart", (ev) => {
          dragIdx = idxOf(row);
          row.classList.add("dragging");
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            try {
              ev.dataTransfer.setData("text/plain", "fieldset:" + dragIdx);
            } catch (e) {
              /* ignore */
            }
            try {
              ev.dataTransfer.setDragImage(row, 12, 12);
            } catch (e) {
              /* ignore */
            }
          }
        });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        box.querySelectorAll(".fieldset-row").forEach((r) => r.classList.remove("drop-target"));
        dragIdx = -1;
      });
      row.addEventListener("dragover", (ev) => {
        if (dragIdx < 0) return;
        if (row.classList.contains("locked")) return; // 锁定字段不接受拖动
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        box.querySelectorAll(".fieldset-row").forEach((r) => r.classList.remove("drop-target"));
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (ev) => {
        if (dragIdx < 0) return;
        if (row.classList.contains("locked")) {
          dragIdx = -1;
          return;
        }
        ev.preventDefault();
        const target = idxOf(row);
        if (target < 0 || target === dragIdx) {
          dragIdx = -1;
          return;
        }
    pushSettingsUndo(`调整字段顺序：「${uiDefaultLabel((list[dragIdx] && list[dragIdx].label) || "")}」`);
        const moved = list.splice(dragIdx, 1)[0];
        let to = target;
        if (dragIdx < target) to -= 1;
        const lockedCount = list.filter((f) => f.locked || f.required).length;
        if (to < lockedCount) to = lockedCount;
        list.splice(to, 0, moved);
        dragIdx = -1;
        renderFieldsetPanel(kind);
      });
    });
  }

  function addFieldsetRow(kind) {
    const catId = kind === "entry" ? fieldsetEntryScope : "";
    const list = fieldsetDraftOf(kind, catId);
    pushSettingsUndo("新建字段");
    list.push({ key: "u" + uid(), label: "", custom: true });
    renderFieldsetPanel(kind);
    const box = $("#fieldset-" + kind);
    const inputs = box ? box.querySelectorAll(".fs-label") : [];
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function saveFieldsetSchema(kind, catId, list) {
    if (kind === "entry") {
      // 设定档案沿用类别上的「字段模板」：改这里＝改「设定类别」里的字段清单
      const labels = (list || []).map((f) => String(f.label || "").trim()).filter(Boolean);
      const cat = getCat(catId);
      if (cat) cat.fieldTemplate = labels;
      return labels.map((label, i) => ({ key: "t" + i, label, custom: true }));
    }
    if (!state.fieldSchemas || typeof state.fieldSchemas !== "object") state.fieldSchemas = {};
    const clean = normalizeFieldsetOrder(list || [], kind)
      .map((f) => {
        const def = (FIELDSET_DEFS[kind] || []).find((d) => d.key === f.key);
        const locked = !!(def && (def.locked || def.required));
        return {
          key: f.key || "u" + uid(),
          // 锁定字段（姓名 / 别名）永远保持内置的名字，也不允许隐藏
          label: locked ? def.label : String(f.label || "").trim() || "未命名字段",
          custom: !!f.custom,
          off: locked ? false : !!f.off,
          required: !!(def && def.required),
          locked,
        };
      });
    state.fieldSchemas[kind] = clean;
    return clean;
  }

  // 「对所有目标生效」：把新清单里的自定义字段同步到每张卡片
  // （缺的补空行、顺序按清单；清单里没有、但卡片上还写着内容的旧字段保留，避免误删内容）
  function syncFieldsetToCards(kind, list, catId) {
    const customs = list.filter((f) => f.custom);
    let changed = 0;
    const apply = (obj) => {
      if (!obj) return;
      const cur = Array.isArray(obj.fields) ? obj.fields : [];
      const next = customs.map((d) => {
        const hit = cur.find((f) => String((f && f.label) || "").trim() === d.label);
        return { label: d.label, value: hit ? hit.value || "" : "" };
      });
      cur.forEach((f) => {
        const lb = String((f && f.label) || "").trim();
        const val = String((f && f.value) || "").trim();
        if (!val) return;
        if (lb && customs.some((d) => d.label === lb)) return;
        next.push({ label: lb, value: val });
      });
      if (JSON.stringify(next) !== JSON.stringify(cur)) {
        obj.fields = next;
        changed++;
      }
    };
    if (kind === "char") state.characters.forEach(apply);
    else if (kind === "event") state.events.forEach(apply);
    else state.settings.entries.filter((en) => en.categoryId === catId).forEach(apply);
    return changed;
  }

  function applyFieldset(kind, scope) {
    const catId = kind === "entry" ? fieldsetEntryScope : "";
    const list = fieldsetDraftOf(kind, catId);
    pushSettingsUndo(uiSentence(scope === "all" ? "fieldsetUndoAll" : "fieldsetUndoSaved", kind));
    settingsUndoGuard = true; // 这一步已经记过了，别在 saveState 里再记一遍
    try {
      const clean = saveFieldsetSchema(kind, catId, list);
      setFieldsetDraft(kind, catId, clean);
      let changed = 0;
      if (scope === "all") changed = syncFieldsetToCards(kind, clean, catId);
      saveState();
      // 「生效」按钮是立刻生效的：把当前状态记成新的基线，关掉设置也不会被退回
      if (settingsSnapshot) settingsSnapshot.state = deepCopyData(state);
      renderFieldsetPanel(kind);
      showToast(
        scope === "all" ? uiSentence("fieldsetAppliedAll", kind, changed) : uiSentence("fieldsetSavedDefault", kind)
      );
    } finally {
      settingsUndoGuard = false;
    }
  }

  function resetFieldset(kind) {
    const catId = kind === "entry" ? fieldsetEntryScope : "";
    pushSettingsUndo("恢复默认字段");
    setFieldsetDraft(kind, catId, fieldsetDefaultList(kind, catId));
    renderFieldsetPanel(kind);
    showToast("已恢复默认字段；点「对所有目标生效」或「对新建目标生效」应用");
  }

  // 把标签文字包一层，方便改名（不动后面的 ? / 按钮等）
  function setFieldsetLabel(block, label) {
    if (!block || !label) return;
    let holder = block.querySelector(".fkey-name");
    if (!holder) {
      const span = block.querySelector(":scope > span") || block.querySelector(".field-label") || block.querySelector(":scope > .field-head-row .field-label");
      if (!span) return;
      const textNode = Array.prototype.slice
        .call(span.childNodes)
        .find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!textNode) return;
      holder = document.createElement("span");
      holder.className = "fkey-name";
      // 原来的文字末尾如果有空格（「标题 *」这种），改名后也留一个，别把间距吃掉
      holder.textContent = textNode.textContent.replace(/\s+$/, "") + (/\s+$/.test(textNode.textContent) ? " " : "");
      span.insertBefore(holder, textNode);
      span.removeChild(textNode);
    }
    if (holder.textContent !== label) holder.textContent = label;
  }

  /* ---- 在「设置 → 全局字段」里加的字段＝正式字段 ----
     它和内置字段一样按设置的顺序排在字段区里（不再塞进卡片底部的「自定义字段」）；
     内容仍然按字段名存在卡片的 fields 里，文本分析、合并、导出照旧认得。
     只有在卡片里点「＋ 添加字段」加的，才留在「自定义字段」下面。 */
  function globalCustomFields(kind) {
    return fieldsetSchemaOf(kind).filter((f) => f.custom && String(f.label || "").trim());
  }

  function globalCustomLabels(kind) {
    return new Set(globalCustomFields(kind).map((f) => String(f.label || "").trim()));
  }

  function schemaFieldFormOf(kind) {
    return kind === "char" ? $("#char-form") : kind === "event" ? $("#event-form") : null;
  }

  function renderGlobalCustomFieldBlocks(kind) {
    const form = schemaFieldFormOf(kind);
    if (!form) return;
    // 重建前先把已经填的字留着（折叠 / 展开也会走到这里，别把用户打的字抹掉）
    const typed = {};
    form.querySelectorAll(".field[data-gfield]").forEach((el) => {
      const input = el.querySelector(".gfield-input");
      typed[String(el.dataset.gfieldLabel || "").trim()] = input ? input.value : "";
    });
    form.querySelectorAll(".field[data-gfield]").forEach((el) => el.remove());
    const foot = form.querySelector(".modal-foot");
    globalCustomFields(kind).forEach((f) => {
      const block = document.createElement("label");
      block.className = "field";
      block.dataset.gfield = "1";
      block.dataset.schemaKey = f.key;
      block.dataset.gfieldLabel = f.label;
      const name = document.createElement("span");
      name.textContent = f.label;
      const input = document.createElement("textarea");
      input.className = "gfield-input";
      input.rows = 2;
      if (typed[f.label] != null) input.value = typed[f.label];
      block.appendChild(name);
      block.appendChild(input);
      if (foot) form.insertBefore(block, foot);
      else form.appendChild(block);
    });
  }

  function fillGlobalCustomFieldValues(kind, card) {
    const form = schemaFieldFormOf(kind);
    if (!form) return;
    const fields = card && Array.isArray(card.fields) ? card.fields : [];
    form.querySelectorAll(".field[data-gfield]").forEach((el) => {
      const label = String(el.dataset.gfieldLabel || "").trim();
      const hit = fields.find((f) => f && String(f.label || "").trim() === label);
      const input = el.querySelector(".gfield-input");
      if (input) input.value = hit && hit.value ? hit.value : "";
    });
  }

  function collectGlobalCustomFieldValues(kind) {
    const form = schemaFieldFormOf(kind);
    if (!form) return [];
    return Array.from(form.querySelectorAll(".field[data-gfield]"))
      .map((el) => {
        const input = el.querySelector(".gfield-input");
        return { label: String(el.dataset.gfieldLabel || "").trim(), value: input ? input.value.trim() : "" };
      })
      .filter((f) => f.label);
  }

  // 打开编辑器时按全局字段设置改名 / 隐藏内置字段
  function applyFieldSchemaToEditor(kind, catId) {
    renderGlobalCustomFieldBlocks(kind);
    const list = fieldsetSchemaOf(kind, catId);
    const sels = FIELDSET_SELECTORS[kind] || {};
    const byKey = new Map(list.filter((f) => !f.custom).map((f) => [f.key, f]));
    // 作者在「设置 → 全局字段」里点 × 删掉的字段：清单里没有它，编辑器里也别再显示
    const saved = (state.fieldSchemas || {})[kind];
    const hasSaved = Array.isArray(saved) && saved.length > 0;
    Object.keys(sels).forEach((key) => {
      const els = sels[key].map((s) => $(s)).filter(Boolean);
      if (!els.length) return;
      const def = byKey.get(key);
      const builtin = (FIELDSET_DEFS[kind] || []).find((d) => d.key === key);
      const locked = !!(builtin && (builtin.locked || builtin.required));
      const off = def ? !!def.off : hasSaved && !locked;
      els.forEach((el) => {
        const block = el.closest(".field") || el;
        block.hidden = off;
      });
      // 字段名只影响显示：程序自带的默认名跟着界面语言，作者改过的名字原样（数据不动）
      if (def && !off) setFieldsetLabel(els[0].closest(".field") || els[0], uiDefaultLabel(def.label));
    });
    applyFieldOrderInEditor(kind, catId);
  }

  // 编辑器里的字段顺序 = 「设置 → 全局字段」里的顺序（左右、上下读下来）
  function applyFieldOrderInEditor(kind, catId) {
    const sels = FIELDSET_SELECTORS[kind] || {};
    const modal = kind === "char" ? $("#char-modal") : $("#event-modal");
    if (!modal) return;
    const body = modal.querySelector(".modal-body");
    if (!body) return;
    const orderByKey = new Map();
    fieldsetSchemaOf(kind, catId).forEach((f, i) => {
      // 自定义字段（设置里加的）也参与排序，它对应字段区里带 data-schema-key 的块
      if (f.custom) orderByKey.set(f.key, i);
      else if (sels[f.key]) orderByKey.set(f.key, i);
    });
    const orderBlocks = (container) => {
      if (!container) return;
      const kids = Array.from(container.children).filter((el) => !(el.tagName === "INPUT" && el.type === "hidden"));
      let lastKey = -1;
      const info = kids.map((el, i) => {
        let key = null;
        let best = Infinity;
        if (el.dataset && el.dataset.schemaKey && orderByKey.has(el.dataset.schemaKey) && orderByKey.get(el.dataset.schemaKey) < best) {
          best = orderByKey.get(el.dataset.schemaKey);
          key = el.dataset.schemaKey;
        }
        Object.keys(sels).forEach((k) => {
          if (!orderByKey.has(k)) return;
          const hit = sels[k].some((s) => {
            const t = el.querySelector(s);
            return t && el.contains(t);
          });
          if (hit && orderByKey.get(k) < best) {
            best = orderByKey.get(k);
            key = k;
          }
        });
        // 「自定义字段 / 雷达图 / 登场人物 / 底部按钮」这些结构块永远压在字段后面，
        // 这样设置里新加的全局字段不会被它们插到中间去
        // 顺序固定为：字段（含全局字段）→ 自定义字段 → 雷达图 → 底部按钮
        const isFoot = el.classList.contains("modal-foot");
        const isRadar = el.matches("#c-radar-field");
        const isTail =
          isRadar || el.matches("#event-char-pool") || !!el.querySelector("#c-fields, #e-fields, #event-char-pool");
        const target = key ? best : isFoot ? 2000000 : isRadar ? 1500000 : isTail ? 1000000 : lastKey; // 其余结构块（线路 / 势力 / 图片…）跟着它上面那个可配置字段
        if (key) lastKey = best;
        return { el, target, i };
      });
      info
        .slice()
        .sort((a, b) => a.target - b.target || a.i - b.i)
        .forEach((x, idx) => {
          x.el.style.order = String(idx);
        });
    };
    orderBlocks(body);
    body.querySelectorAll(".field-row, .char-top-main, .char-top").forEach(orderBlocks);
  }

  /* 识别的「题材 / 语言常识」（用户 2026-10-16 列的单子）：文本分析、信息回填、
     AI 自动更新共用这一份，免得每个提示词各写一遍、还写得不一样。 */
  function genreSenseHint() {
    return [
      "【题材与语言常识】",
      "分析文本的题材和语言都不固定：现代、科幻、魔幻、玄幻、历史、神话、传说、宗教、克苏鲁、ACG、手游、穿越、校园、军旅、战争、犯罪、悬疑、军火、经济、商战、宫斗、宅斗……都算；简体、繁体、英文、日文也都算。按那个题材的常识去理解，别用「这不像设定」的标准漏掉东西：",
      "· 神话 / 传说 / 宗教：神祇、神器、仪式、教派、祭司、禁忌、祭祀",
      "· 克苏鲁系：旧神 / 外神、禁忌典籍、异界、理智与疯狂、调查员",
      "· 军旅 / 战争：番号、军衔、编制、装备型号、战役、命令",
      "· 犯罪 / 悬疑：案件、手法、物证、组织、代号",
      "· 经济 / 商战：公司、机构、职位、合同、收购、行业术语",
      "· 宫斗 / 宅斗：位份、封号、宫殿、家族、派系、倾轧",
      "· ACG / 手游 / 穿越：职业、技能、属性、等级、Buff、道具、系统提示",
      "· 校园 / 都市：班级、社团、职位、常去的场所",
    ].join("\n");
  }

  // 文本分析时按「设置 → 全局字段」里的字段来识别
  function fieldSchemaPromptForAnalysis() {
    const labelsOf = (kind, catId) =>
      fieldsetSchemaOf(kind, catId)
        .filter((f) => !f.off)
        .map((f) => f.label)
        .filter(Boolean);
    const chars = labelsOf("char");
    const events = labelsOf("event");
    const out = [];
    /* 人物雷达的顶点先算出来：**哪怕作者把人物 / 事件字段全关了**，雷达图这个追加功能开着就照样要识别 */
    const charAxes = radarOn()
      ? radarAxes()
          .filter((a) => String(a.label || "").trim())
          .map((a) => String(a.label || "").trim() + (String(a.desc || "").trim() ? "（" + String(a.desc).trim() + "）" : ""))
      : [];
    if (chars.length || events.length || charAxes.length) {
      out.push("");
      out.push(
        "【按作者设置的字段识别】作者在「设置」里规定了每种卡片要识别哪些字段。fields 的 label 请严格用下面这些（不要自造别的字段名；文本里没有依据的字段就省略不写）："
      );
      if (chars.length) out.push("· 人物 character 的 fields：" + chars.join("、"));
      if (events.length) out.push("· 事件 event 的 fields：" + events.join("、"));
      const axes = charAxes;
      if (axes.length) {
        out.push(
          "· 人物 character 还要额外出一个 radar 对象：键名严格用这些顶点名（括号里是作者对每个顶点的说明，打分要按这个说明来判断），值是 0~10 的数字（可以小数）。" +
            "**有描写就要给分**：一次具体行为、他人评价、身份 / 职位、成绩或战绩、外貌与气质的旁白，都算依据，不必等到面板数值或极端描写；" +
            "只有文本明确写了「为零 / 完全没有 / 毫无」这类意思时才填 0；确实一点线索都没有的顶点就不要出现在 radar 里（少一个键＝这一维没有结果），千万不要用 0 顶替：" +
            axes.join("、") +
            "。**每个给了分的顶点都要在 radarWhy 里写清依据**（radarWhy：键名和 radar 完全对应的对象，值＝**「」里原样摘一句原文（不超过 40 字，一字不改）** + 一句为什么给这个分；别复述顶点名、别写空话。" +
            "摘的必须是本段里真实出现的句子 / 短句，后面综合评分时会拿它回头找上下文）" +
            "。给数值时参考现代轻小说常见的「数值化」写法：很多作品会把战斗力、智力、体力、敏捷、魔力、魅力或性格特质做成面板 / 状态栏 / 属性表，文本若出现这类数值或明显的强弱对比就据此估分；只有文字描写时按相对水平给分（明显强=8~10，普通=4~6，明显弱=1~3），不要拍脑袋给中间值；确实一点线索都没有的顶点才省略不写。评分要放在全局里看：任何顶点（战斗力、智力、魔力、魅力、性格特质等）都可比较，文本若有 A 强于 B、B 强于 C 这类相对关系，给分尽量保持 A>B>C；同一维度下所有人物按相对水平统一定标（仅作参考，无直接依据不强行排序）。顶点名如果对应到下面这些含义，要会从「侧写」换算过去：考试成绩 / 测验名次好 → 智力 / 智商高；打架比武占上风、体格强健 → 战斗力 / 体力高；被很多人追求、常被夸好看 → 魅力高；法术威力 / 魔力总量被强调 → 魔力高；指挥得当、射箭准、跑得快 → 对应的统率 / 敏捷等顶点高。"
        );
      }
    }
    const cats = (state.settings && state.settings.categories) || [];
    const catLines = cats
      .map((c) => {
        const ls = labelsOf("entry", c.id);
        return ls.length ? `　- ${c.name}：${ls.join("、")}` : "";
      })
      .filter(Boolean);
    if (catLines.length) {
      out.push("· 设定条目 setting 的 fields 按 category 用下面这些 label：");
      out.push(...catLines);
    }
    if (cats.length) {
      out.push("· setting 的 category 只能填作者在用的这几个类别名：" + cats.map((c) => c.name).join("、"));
    }
    /* 「技能树」这一类：正文里的技能 / 魔法 / 超能力 / 异能都往这里收（用户 2026-10-15 要求）。
       只让模型把 category 填对、字段写全；挂不挂到拓扑树上由用户在拓扑栏自己拖。 */
    const skillCat = cats.find((c) => catKind(c) === "skill");
    if (skillCat) {
      out.push(
        "· 「" +
          skillCat.name +
          "」这一类专收**技能 / 魔法 / 超能力 / 异能 / 招式 / 天赋 / 被动**：现代、科幻、魔幻、玄幻、历史都算，" +
          "上面说的那些题材和语言里都一样，RPG / DNF / 手游那类游戏文本里的技能表、状态栏、面板数值同样算。" +
          "只要出现技能、必杀技、大招、被动、天赋、buff / debuff、法术、咒文、" +
          "Skill / Ability / Spell / Perk / Ultimate / Passive、スキル / 必殺技 / 魔法 / 能力 这类表述，就归到这一类（字段名仍按这一类的中文 label 写）。" +
          "正文出现这类能力时，category 一律填「" +
          skillCat.name +
          "」，不要塞进物品或名词。" +
          "字段按这一类的 label 写：类型（主动 / 被动 / 被动加成 / 蓄力 等）、对象（自己 / 单体 / 群体 / 区域 等）、效果（做什么，有数值或强弱就写进去）、前置条件（学习或施展需要什么）、简介。" +
          "同一门技能的不同等级 / 变体不要各建一条，写进同一条的「效果」或「简介」里；只是提到名字、没有任何技能含义的词不要当技能。"
      );
    }
    /* 「追加功能 → 雷达图」勾了（且启用着）的类别：setting 额外出一个 radar 对象，
       顶点按那个类别自己的模板来。装备默认就带这个功能。 */
    cats
      .filter((c) => catRadarOn(c))
      .forEach((c) => {
        const axes = catRadarAxes(c)
          .filter((a) => String(a.label || "").trim())
          .map((a) => String(a.label || "").trim() + (String(a.desc || "").trim() ? "（" + String(a.desc).trim() + "）" : ""));
        if (!axes.length) return;
        out.push(
          "· " +
            c.name +
            "类（category＝" +
            c.name +
            "）的 setting 还要额外出一个 radar 对象：键名严格用这些顶点名（括号里是作者对每个顶点的说明，打分按说明判断），值是 0~10 的数字（可以小数）：" +
            axes.join("、") +
            "。**有依据就给分**（外形 / 用途 / 来历 / 实战表现 / 他人评价都算），不必等到数值面板；明显强＝8~10，普通＝4~6，明显弱＝1~3；确实没依据的顶点不要出现在 radar 里（少一个键＝这一维没有结果），千万不要用 0 顶替。" +
            "**每个给了分的顶点都要在 radarWhy 里写清依据**（键名和 radar 对应，值＝「」里原样摘一句原文 + 一句为什么给这个分）。别的类别的 setting 不要出 radar。"
        );
      });
    if (out.length) {
      out.push(
        "· 这些字段与程序功能绑定，必须照常输出：人物要有「重要度」（主要 / 龙套）、「别名」、「所属势力」；事件要有「时间」「地点」「叙事」「登场人物」；设定条目要有它的 category。"
      );
    }
    if (!out.length) return "";
    /* 题材 / 语言常识放最前面：人物、事件、设定三类都先按这份常识读一遍文本 */
    return "\n" + genreSenseHint() + "\n" + out.join("\n");
  }

  // 识别结果里的字段 → 卡片槽位：先按作者改过的字段名找，再退回内置默认名
  function schemaFieldValue(r, kind, key) {
    const labels = [];
    const cur = fieldsetSchemaOf(kind).find((f) => f.key === key);
    if (cur && cur.label) labels.push(cur.label);
    const def = (FIELDSET_DEFS[kind] || []).find((d) => d.key === key);
    if (def && def.label && labels.indexOf(def.label) < 0) labels.push(def.label);
    for (const lb of labels) {
      const v = fieldValue(r, lb);
      if (v) return v;
    }
    return "";
  }

  /* 「字段种类」选项卡（用户 2026-10-17：原来是一个下拉框，改成选项卡）。
     名字保留 `fillFieldsetScopeSelect`（几十处调用点不用动），现在它负责画这一排选项卡。
     选定哪个种类，下面三栏（全局字段 / 输入保护 / 自定义规则）就都只看这一个种类。 */
  function fillFieldsetScopeSelect() {
    const box = $("#set-kind-tabs");
    const cats = (state.settings && state.settings.categories) || [];
    if (!fieldsetEntryScope || !cats.some((c) => c.id === fieldsetEntryScope)) {
      fieldsetEntryScope = cats.length ? cats[0].id : "";
    }
    if (!box) return;
    box.innerHTML = cats
      .map(
        (c) =>
          /* 和主界面的「设定类别」选项卡同一套美术：一条细线、上面坐着选项卡；
             为了省空间**不带图标**，也不加 × / 拖拽（删改在上面的类别列表里做）。 */
          `<div class="view-tab cat-tab${c.id === fieldsetEntryScope ? " current" : ""}" role="tab" data-kind-id="${esc(
            c.id
          )}" title="${esc(catDisplayName(c))}" aria-selected="${c.id === fieldsetEntryScope ? "true" : "false"}"><span class="cat-name">${esc(
            catDisplayName(c)
          )}</span></div>`
      )
      .join("");
  }

  /* 切「字段种类」：三栏一起跟着换（字段模板 / 输入保护 / 自定义规则），雷达图与拓扑栏也读同一个 scope */
  function selectFieldsetKind(id) {
    if (!id || id === fieldsetEntryScope) return;
    fieldsetEntryScope = id;
    ruleEntryScopeId = id;
    fillFieldsetScopeSelect();
    renderFieldsetPanel("entry");
    renderRuleList("entry");
    renderFillProtect();
  }

  function bindFieldsetPanels() {
    $$("[data-fieldset-add]").forEach((b) =>
      b.addEventListener("click", () => addFieldsetRow(b.dataset.fieldsetAdd))
    );
    $$("[data-fieldset-apply]").forEach((b) =>
      b.addEventListener("click", () => applyFieldset(b.dataset.fieldsetApply, b.dataset.scope || "new"))
    );
    $$("[data-fieldset-reset]").forEach((b) =>
      b.addEventListener("click", () => resetFieldset(b.dataset.fieldsetReset))
    );
    /* 「字段种类」选项卡：点一下就换（三栏 + 雷达图 / 拓扑栏那两栏都跟着换） */
    const kindTabs = $("#set-kind-tabs");
    if (kindTabs && kindTabs.dataset.bound !== "1") {
      kindTabs.dataset.bound = "1";
      kindTabs.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-kind-id]") : null;
        if (!btn) return;
        selectFieldsetKind(btn.dataset.kindId);
      });
    }
  }

  /* ================= 全局设置（人物 / 事件 / 设定 / 文本分析 / Agent）
=================
     这一步只搭壳：左侧按钮切子界面，每个子界面的具体设置项后面一步步往里加。
     加新设置项时，直接往对应 <section class="set-pane" data-set-pane="…"> 里放内容即可。
*/
  /* ---- 设置 → 分组 / 线路 / 设定类别：就地新建 / 改名 / 改颜色 / 拖动排序 / 删除 ---- */
  /* ================= 雷达图 =================
     顶点（轴）定义在 state.radar.axes，数值存在每个人物的 c.radar（键＝轴 key）。
     默认禁用；禁用时设置栏灰掉、人物编辑界面灰掉，文本分析也不再要求这一项。 */
  const RADAR_MIN = 2;
  const RADAR_MAX = 7;

  function defaultRadarAxes() {
    return [1, 2, 3].map((n) => ({ key: "r" + n, label: uiTextFor("维度") + n, desc: "" }));
  }

  function ensureRadar() {
    if (!state.radar || typeof state.radar !== "object" || Array.isArray(state.radar)) {
      state.radar = { enabled: false, axes: defaultRadarAxes() };
    }
    const r = state.radar;
    if (typeof r.enabled !== "boolean") r.enabled = false;
    if (!Array.isArray(r.axes) || !r.axes.length) r.axes = defaultRadarAxes();
    r.axes = r.axes
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        key: a.key || "r" + uid(),
        label: String(a.label == null ? "" : a.label),
        desc: String(a.desc == null ? "" : a.desc),
      }))
      .slice(0, RADAR_MAX);
    while (r.axes.length < RADAR_MIN) r.axes.push({ key: "r" + uid(), label: uiTextFor("维度") + (r.axes.length + 1), desc: "" });
    return r;
  }

  // 读的时候兜底一次：老任务没有这一项也能直接用
  function radarState() {
    const r = state.radar;
    if (r && typeof r === "object" && !Array.isArray(r) && Array.isArray(r.axes) && r.axes.length) return r;
    return ensureRadar();
  }
  function radarOn() {
    return !!radarState().enabled;
  }
  function radarAxes() {
    return radarState().axes;
  }
  /* 这张卡要不要展示雷达图：勾选状态存在 c.radarOn；
     老数据没有这个字段时，看它有没有填过数值（填过就照旧显示，不用一个个去勾）。 */
  function radarOnOf(c) {
    if (!c) return false;
    if (typeof c.radarOn === "boolean") return c.radarOn;
    return !!(c.radar && Object.keys(c.radar).length);
  }

  // 0~10 的数字，可小数；从任意字符串里挑第一个数字出来
  function parseRadarNumber(v) {
    const m = String(v == null ? "" : v).match(/\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(10, n));
  }

  // 从一条分析记录里取出雷达图数值：radar 对象（键＝顶点名）或同名字段都认
  function radarValuesByAxes(axes, r) {
    if (!axes || !axes.length) return {};
    const byLabel = new Map();
    axes.forEach((a) => {
      const k = String(a.label || "").trim();
      if (k) byLabel.set(k, a.key);
    });
    const out = {};
    const put = (label, value) => {
      const key = byLabel.get(String(label || "").trim());
      if (!key) return;
      const n = parseRadarNumber(value);
      if (n === null) return;
      out[key] = n;
    };
    const obj = r && r.radar;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) Object.keys(obj).forEach((k) => put(k, obj[k]));
    (r && Array.isArray(r.fields) ? r.fields : []).forEach((f) => put(f && f.label, f && f.value));
    // 0 是一个有效结果（「确实为零」），和「没有依据 / 空着」不是一回事：
    // 别把整组 0 当成「没有结果」丢掉，写进卡片、照常显示。
    return out;
  }
  // 人物雷达图（顶点＝设置里那份人物雷达图模板）
  function radarValuesFromRecord(r) {
    return radarValuesByAxes(radarAxes(), r);
  }
  /* 类别的雷达图（顶点＝「设置 → 全局字段 → 追加功能 → 雷达图」那一栏）走
     04-dialogs.js 里的 catRadarAxes / catRadarOn / catRadarFeatureOn，
     这里不再单独维护装备那份模板。 */

  /* ---- 设置 → 人物 → 雷达图 ---- */
  function renderRadarSettings() {
    const box = $("#radar-axes");
    if (!box) return;
    const r = radarState();
    const btn = $("#radar-toggle");
    if (btn) {
      btn.textContent = r.enabled ? "禁用" : "启用";
      btn.title = r.enabled
        ? "点一下＝禁用雷达图（设置栏与人物编辑界面都会变灰，文本分析也不再填雷达图；已填的数值保留）"
        : "点一下＝启用雷达图";
      btn.classList.toggle("btn-primary", !r.enabled);
    }
    const wrap = $("#radar-set");
    if (wrap) wrap.classList.toggle("radar-off", !r.enabled);
    const addBtn = $("#radar-add");
    if (addBtn) {
      addBtn.disabled = !r.enabled || r.axes.length >= RADAR_MAX;
      addBtn.title = !r.enabled
        ? uiTextFor("雷达图已禁用")
        : r.axes.length >= RADAR_MAX
        ? uiSentence("radarAxisLimit", RADAR_MAX)
        : uiTextFor("再加一个顶点");
    }
    box.innerHTML = r.axes
      .map(
        (a, i) => `<div class="radar-axis-row" data-axis-idx="${i}">
          <span class="manage-grip" draggable="true" title="按住拖动＝调整顶点顺序">⠿</span>
          <span class="radar-axis-no">${i + 1}</span>
          <input type="text" class="radar-axis-label" data-axis-idx="${i}" value="${esc(a.label || "")}" placeholder="顶点名称" />
          <input type="text" class="radar-axis-desc" data-axis-idx="${i}" value="${esc(a.desc || "")}" placeholder="说明（可选）" title="维度的含义 / 打分参考；会显示在雷达相关界面的悬停提示里" />
          <button type="button" class="icon-btn radar-axis-del" data-axis-idx="${i}" title="删除这个顶点（最少 ${RADAR_MIN} 个）"${
            r.axes.length <= RADAR_MIN ? " disabled" : ""
          }>×</button>
        </div>`
      )
      .join("");
    bindRadarAxisDrag(box);
    // 雷达图启用 / 禁用会让「输入保护」里多出 / 去掉「雷达图」那一行
    renderFillProtect();
  }

  let radarDrag = null;
  function bindRadarAxisDrag(box) {
    box.querySelectorAll(".radar-axis-row").forEach((row, idx) => {
      const grip = row.querySelector(".manage-grip");
      if (!grip) return;
      grip.addEventListener("dragstart", (ev) => {
        radarDrag = { from: idx };
        row.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", "radar:" + idx);
          } catch (e) {
            /* ignore */
          }
        }
      });
      grip.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        box.querySelectorAll(".radar-axis-row").forEach((r2) => r2.classList.remove("drop-target"));
        radarDrag = null;
      });
      row.addEventListener("dragover", (ev) => {
        if (!radarDrag || radarDrag.from === idx) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        box.querySelectorAll(".radar-axis-row").forEach((r2) => r2.classList.remove("drop-target"));
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (ev) => {
        if (!radarDrag) return;
        ev.preventDefault();
        const from = radarDrag.from;
        radarDrag = null;
        const r = radarState();
        if (from === idx || from < 0 || idx < 0 || from >= r.axes.length || idx >= r.axes.length) {
          renderRadarSettings();
          return;
        }
        const it = r.axes.splice(from, 1)[0];
        r.axes.splice(idx, 0, it);
        pendingUndoLabel = `调整雷达图顶点顺序：「${it.label || ""}」`;
        saveState();
        renderRadarSettings();
      });
    });
  }

  function bindRadarSettings() {
    const toggle = $("#radar-toggle");
    if (toggle)
      toggle.addEventListener("click", () => {
        const r = radarState();
        r.enabled = !r.enabled;
        pendingUndoLabel = (r.enabled ? "启用" : "禁用") + "雷达图";
        saveState();
        renderRadarSettings();
        syncRadarAnalysisButton();
        if (r.enabled === false && currentTab === "radar") switchTab("relations");
        showToast(r.enabled ? "已启用雷达图：人物编辑界面可以填数值、生成雷达图" : "已禁用雷达图（数值保留，设置与分析都停用）");
      });
    const add = $("#radar-add");
    if (add)
      add.addEventListener("click", () => {
        const r = radarState();
        if (!r.enabled || r.axes.length >= RADAR_MAX) return;
        r.axes.push({ key: "r" + uid(), label: "维度" + (r.axes.length + 1), desc: "" });
        pendingUndoLabel = "新建雷达图顶点";
        saveState();
        renderRadarSettings();
      });
    const box = $("#radar-axes");
    if (!box) return;
    /* 和「设置 → 全局字段 → 追加功能 → 雷达图」那一栏一样的两颗按钮：
       · 对所有目标生效＝把这套顶点对**已有的所有人物卡**生效（有对应数值的卡把雷达图打开）
       · 对新建目标生效＝人物卡本来就是跟着这份模板走的，所以不需要改数据，只回一句说明
       人物卡不像设定条目那样各存一份顶点（条目存 en.radarAxes），
       所以这里没有「把副本盖到每张卡上」这一步。 */
    const applyAllBtn = $("#radar-apply-all");
    if (applyAllBtn)
      applyAllBtn.addEventListener("click", () => {
        const r = radarState();
        if (!r.enabled) {
          showToast(uiTextFor("雷达图已禁用"));
          return;
        }
        const keys = new Set(r.axes.map((a) => a.key));
        let n = 0;
        (state.characters || []).forEach((c) => {
          if (!c || !c.radar || typeof c.radar !== "object") return;
          if (!Object.keys(c.radar).some((k) => keys.has(k))) return; // 这套顶点上没数的不动它
          if (c.radarOn === true) return;
          c.radarOn = true;
          n++;
        });
        if (n) {
          pendingUndoLabel = "把雷达图顶点应用到所有人物";
          saveState();
        }
        showToast(uiTextFor("已应用到所有人物"));
      });
    const applyNewBtn = $("#radar-apply-new");
    if (applyNewBtn)
      applyNewBtn.addEventListener("click", () => showToast(uiTextFor("新人物会直接用这套顶点")));
    box.addEventListener("click", (e) => {
      const del = e.target.closest(".radar-axis-del");
      if (!del) return;
      const r = radarState();
      const i = Number(del.dataset.axisIdx);
      if (!(i >= 0) || r.axes.length <= RADAR_MIN) return;
      const ax = r.axes[i];
      r.axes.splice(i, 1);
      // 顺带把这个顶点的旧数值清掉，免得留一堆没有名字的脏数据
      state.characters.forEach((c) => {
        if (c && c.radar && ax) delete c.radar[ax.key];
      });
      pendingUndoLabel = `删除雷达图顶点：「${ax ? ax.label : ""}」`;
      saveState();
      renderRadarSettings();
    });
    box.addEventListener("input", (e) => {
      const inp = e.target.closest(".radar-axis-label, .radar-axis-desc");
      if (!inp) return;
      const r = radarState();
      const a = r.axes[Number(inp.dataset.axisIdx)];
      if (!a) return;
      if (inp.classList.contains("radar-axis-desc")) a.desc = inp.value;
      else a.label = inp.value;
    });
    box.addEventListener("change", (e) => {
      const inp = e.target.closest(".radar-axis-label, .radar-axis-desc");
      if (!inp) return;
      const r = radarState();
      const a = r.axes[Number(inp.dataset.axisIdx)];
      if (!a) return;
      if (inp.classList.contains("radar-axis-desc")) {
        a.desc = String(a.desc || "").trim();
        pendingUndoLabel = `设置雷达图顶点说明：「${a.label}」`;
      } else {
        a.label = String(a.label || "").trim();
        pendingUndoLabel = `设置雷达图顶点名称：「${a.label}」`;
      }
      saveState();
    });
  }

  /* ---- 人物编辑界面里的雷达图 ----
     和装备卡一个套路：勾上「雷达图」才展开，数值边填边画（0 ~ 10，可小数）。
     不勾的人卡片上不会出现雷达图，数值照样留着，勾回来就还在。 */
  function renderRadarInputs(c, onOverride) {
    const box = $("#c-radar-inputs");
    if (!box) return;
    const r = radarState();
    const field = $("#c-radar-field");
    // 全局禁用时整栏都不显示（数值仍然留在数据里，重新启用就回来）
    if (field) field.hidden = !r.enabled;
    // onOverride＝界面上刚点的勾选（还没保存，先照它展开 / 收起）
    const on = typeof onOverride === "boolean" ? onOverride : radarOnOf(c);
    const cb = $("#c-radar-on");
    if (cb) cb.checked = on;
    const chart = $("#c-radar-chart");
    if (chart) {
      chart.innerHTML = "";
      chart.hidden = true;
    }
    if (!r.enabled || !on) {
      box.innerHTML = "";
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const vals = (c && c.radar) || {};
    box.innerHTML = r.axes
      .map(
        (a) => `<div class="radar-in">
          <span class="radar-in-name" title="${esc(a.desc ? a.label + "：\n" + a.desc : a.label || "")}">${esc(a.label || "（未命名）")}</span>
          <span class="radar-in-box">
            <input type="number" class="radar-in-val" data-axis-key="${esc(a.key)}" min="0" max="10" step="0.1" value="${
              vals[a.key] == null ? "" : esc(String(vals[a.key]))
            }" placeholder="0~10" title="范围 0 ~ 10，可以填小数" />
            <span class="radar-in-steps">
              <button type="button" class="radar-step radar-step-up" data-axis-key="${esc(a.key)}" tabindex="-1" title="加 0.1">▲</button>
              <button type="button" class="radar-step radar-step-down" data-axis-key="${esc(a.key)}" tabindex="-1" title="减 0.1">▼</button>
            </span>
          </span>
        </div>`
      )
      .join("");
    // 一展开就画上（数值、叠画的人同步）
    if (r.axes.length >= 2) drawRadarForCurrent();
  }

  /* 人物链：雷达图叠画比较。
     底图永远是「当前这张卡」的那张雷达图（225px，顶点名 + 数值都写着）；
     勾上链上的其他人，就直接把他们的多边形叠画在同一张图上——
     不换图、不改尺寸，所以不会闪一下。
     当前这张卡用输入框里正在填的数，其它人用卡片上存的数。 */
  let radarCompareIds = new Set();
  const RADAR_BASE_COLOR = "#49bfb1"; // 底图（当前这张卡）的颜色

  // 复用 box 里已有的同名字节点：反复勾选只换内容，不重建 DOM
  function radarPart(box, cls) {
    let el = null;
    Array.prototype.forEach.call(box.children, (k) => {
      if (k.classList && k.classList.contains(cls)) el = k;
    });
    if (!el) {
      el = document.createElement("div");
      el.className = cls;
      box.appendChild(el);
    }
    return el;
  }

  // 这张卡 + 同一人物链上其他人的列队顺序：当前打开的这张卡永远排第一个
  function radarPickMembers(c) {
    if (!c) return [];
    const chain = chainOfChar(c.id);
    const rest = chain ? chainMembersOf(chain).filter((m) => m.id !== c.id) : [];
    return [c].concat(rest);
  }
  // 每个人的颜色按这个顺序定死：勾选 / 取消别人时谁的颜色都不会变
  // （名字的颜色＝图上那条线的颜色）
  function radarMemberColor(c, id) {
    if (!c || id === c.id) return RADAR_BASE_COLOR;
    const rest = radarPickMembers(c).slice(1);
    const i = rest.findIndex((m) => m.id === id);
    return RADAR_SERIES_COLORS[(i < 0 ? 0 : i) % RADAR_SERIES_COLORS.length];
  }

  // 可勾选项画在雷达图自己的右下角（先出图，再出现这排勾选）
  function renderRadarChainPick(c, box) {
    if (!box) return;
    const r = radarState();
    const members = c && r.enabled ? radarPickMembers(c) : [];
    let wrap = null;
    Array.prototype.forEach.call(box.children, (k) => {
      if (k.classList && k.classList.contains("radar-chain-pick")) wrap = k;
    });
    if (members.length < 2) {
      if (wrap) wrap.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "radar-chain-pick";
      wrap.title = uiTextFor("勾选人物链上的几张卡，把雷达图叠画在一起比较数值");
      // 事件挂在整条上：勾选只改内容、不重建节点 → 勾选框不丢焦点，也不会闪
      wrap.addEventListener("change", (e) => {
        const cb = e.target && e.target.closest ? e.target.closest("input[data-radar-chain]") : null;
        if (!cb) return;
        const id = cb.dataset.radarChain;
        if (cb.checked) radarCompareIds.add(id);
        else radarCompareIds.delete(id);
        drawRadarForCurrent();
      });
      box.appendChild(wrap);
    }
    const key = members.map((m) => m.id).join(",");
    if (wrap.__members !== key) {
      wrap.__members = key;
      wrap.innerHTML = members
        .map((m) => {
          const isSelf = m.id === c.id;
          return `<label class="radar-chain-item" style="--series-color:${esc(
            radarMemberColor(c, m.id)
          )}" title="${esc(
            uiTextFor(isSelf ? "当前打开的这张卡片" : "和当前这张卡叠画比较")
          )}"><input type="checkbox" data-radar-chain="${esc(m.id)}" /><span class="radar-chain-name">${esc(
            m.name || uiTextFor("未命名")
          )}</span></label>`;
        })
        .join("");
    }
    wrap.querySelectorAll("input[data-radar-chain]").forEach((cb) => {
      const on = radarCompareIds.has(cb.dataset.radarChain);
      if (cb.checked !== on) cb.checked = on;
    });
    if (box.lastElementChild !== wrap) box.appendChild(wrap); // 始终落在图的右下角
  }

  // 画雷达图：一张底图（当前这张卡）+ 勾上的其他人的叠画多边形 + 图例
  function drawRadarForCurrent() {
    const r = radarState();
    if (!r.enabled) return;
    const box = $("#c-radar-chart");
    if (!box) return;
    const self = getChar($("#char-id").value);
    if (!self) return;
    // 勾上的里面，排在最前面的那张当底图（它才带顶点数值）；当前这张卡没勾就让位给下一个。
    // 一张都没勾 → 只留网格和轴名，图空着。
    const checked = radarPickMembers(self).filter((m) => radarCompareIds.has(m.id));
    const base = checked[0] || null;
    const extras = base ? checked.filter((m) => m.id !== base.id) : [];
    const valuesOf = (m) => (m.id === self.id ? radarValuesFromInputs() : m.radar || {});
    radarPart(box, "radar-chart-canvas").innerHTML = base
      ? radarChartSvg(
          r.axes,
          valuesOf(base),
          extras.map((m) => ({
            id: m.id,
            name: m.name || uiTextFor("未命名"),
            color: radarMemberColor(self, m.id),
            values: valuesOf(m),
          })),
          radarMemberColor(self, base.id)
        )
      : radarChartSvg(r.axes, null, [], null);
    box.hidden = false;
    // 不再画图例：右下角那排勾选本身就是图例（名字的颜色＝图上那条线的颜色）
    renderRadarChainPick(self, box);
  }

  function radarValuesFromInputs() {
    const out = {};
    $$("#c-radar-inputs .radar-in-val").forEach((inp) => {
      const v = parseRadarNumber(inp.value);
      if (v !== null) out[inp.dataset.axisKey] = v;
    });
    return out;
  }

  // 一张雷达图：底图（values，顶点名 + 数值都写着）+ 叠画的其他人（extraSeries）
  // values 传 null → 只画网格和轴名，图上空着（一个人都没勾的时候）
  // 粗算一段文字有多宽（「/」「.」窄一点）：字号调大 / 组数变多时用来把标签往里挪，别被视口裁掉
  function radarTextWidth(str, size) {
    let em = 0;
    Array.from(String(str == null ? "" : str)).forEach((ch) => {
      if (/[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) em += 1;
      else if (ch === "/") em += 0.4;
      else if (ch === ".") em += 0.3;
      else em += 0.6;
    });
    return em * size * 1.08; // 留一点余量：估宽略偏大，就不会被视口裁到
  }
  // 按 anchor 把标签的 x 夹进 [1, view-1]：宁可往图里挪一点，也不要被裁掉
  function radarLabelX(x, anchor, w, view) {
    if (anchor === "start") return x + w > view - 1 ? Math.max(1, view - 1 - w) : x;
    if (anchor === "end") return x - w < 1 ? Math.min(view - 1, 1 + w) : x;
    let nx = x;
    if (nx - w / 2 < 1) nx = 1 + w / 2;
    if (nx + w / 2 > view - 1) nx = Math.max(1 + w / 2, view - 1 - w / 2);
    return nx;
  }
  function radarChartSvg(axes, values, extraSeries, baseColor) {
    if (!axes || axes.length < 2) return "";
    const empty = !values;
    const color = baseColor || RADAR_BASE_COLOR;
    const n = axes.length;
    const size = 225;
    const cx = size / 2;
    const cy = size / 2 + 3;
    const R = 74;
    const pt = (i, ratio) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + Math.cos(ang) * R * ratio, cy + Math.sin(ang) * R * ratio];
    };
    const ratioOf = (vals, a) => {
      const v = vals ? vals[a.key] : null;
      const num = typeof v === "number" && isFinite(v) ? v : parseRadarNumber(v);
      return Math.max(0, Math.min(10, num === null || num === undefined ? 0 : num)) / 10;
    };
    const ptsOf = (vals) =>
      axes.map((a, i) => pt(i, ratioOf(vals, a)).map((x) => x.toFixed(1)).join(",")).join(" ");
    let grid = "";
    for (let ring = 1; ring <= 5; ring++) {
      const pts = axes.map((_, i) => pt(i, ring / 5).map((x) => x.toFixed(1)).join(",")).join(" ");
      grid += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.11)" stroke-width="1" />`;
    }
    axes.forEach((_, i) => {
      const [x, y] = pt(i, 1);
      grid += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.14)" />`;
    });
    // 叠画的其他人画在底图下面，底图（当前这张卡）始终压在最上层
    const overlays = (extraSeries || [])
      .map((s) => {
        const dots = axes
          .map((a, i) => {
            const [x, y] = pt(i, ratioOf(s.values, a));
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="${esc(s.color)}" />`;
          })
          .join("");
        return (
          `<polygon class="radar-extra-poly" points="${ptsOf(s.values)}" fill="${esc(
            s.color
          )}" fill-opacity="0.13" stroke="${esc(s.color)}" stroke-width="1.5" stroke-linejoin="round" />` + dots
        );
      })
      .join("");
    const baseDots = empty
      ? ""
      : axes
          .map((a, i) => {
            const [x, y] = pt(i, ratioOf(values, a));
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${color}" />`;
          })
          .join("");
    // 数值行：每一组的数各用自己的颜色，中间用「/」隔开（「/」用轴名的字号 / 字色）
    const valueSeries = [{ values, color }].concat(
      (extraSeries || []).map((s) => ({ values: s.values, color: s.color }))
    );
    const shownVal = (vals, a) => {
      const v = vals ? vals[a.key] : undefined;
      return typeof v === "number" && isFinite(v) ? String(Math.round(v * 100) / 100) : "—";
    };
    // 叠的人多的时候数值字号收一点，一行尽量放得下
    const vFont = valueSeries.length > 3 ? Math.max(7, 9.5 - (valueSeries.length - 3) * 0.6) : 9.5;
    const labels = axes
      .map((a, i) => {
        const [x, y] = pt(i, 1.2);
        const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        const name = a.label || "";
        const nameX = radarLabelX(x, anchor, radarTextWidth(name, 9.5), size);
        // 顶点名 + 各组数值，都写在顶点边上
        const desc = a.desc ? `<title>${esc(a.label || "")}：${esc(a.desc)}</title>` : `<title>${esc(a.label || "")}</title>`;
        const nameText = `<text x="${nameX.toFixed(
          1
        )}" y="${(y + 1.5).toFixed(1)}" text-anchor="${anchor}" font-size="9.5" fill="#a79ec0">${desc}${esc(name)}</text>`;
        // 空图就不写数值行了，只留轴名
        const vals = empty ? [] : valueSeries.map((s) => shownVal(s.values, a));
        const valStr = vals.join("/");
        const valX = radarLabelX(x, anchor, radarTextWidth(valStr, vFont), size);
        const valText = empty
          ? ""
          : `<text x="${valX.toFixed(1)}" y="${(y + 12.5).toFixed(
              1
            )}" text-anchor="${anchor}" font-size="${vFont}">${vals
              .map(
                (v, k) =>
                  (k ? `<tspan fill="#a79ec0" font-weight="400">/</tspan>` : "") +
                  `<tspan fill="${esc(valueSeries[k].color)}" font-weight="700">${esc(v)}</tspan>`
              )
              .join("")}</text>`;
        return nameText + valText;
      })
      .join("");
    return (
      `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
      grid +
      overlays +
      (empty
        ? ""
        : `<polygon class="radar-base-poly" points="${ptsOf(values)}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.5" />`) +
      baseDots +
      labels +
      `</svg>`
    );
  }

  function bindRadarChart() {
    // 勾上才展开（数值留在卡片里，勾回来还在）；勾选本身跟卡片一起保存
    const onBox = $("#c-radar-on");
    if (onBox && !onBox.__bound) {
      onBox.__bound = true;
      onBox.addEventListener("change", () => renderRadarInputs(getChar($("#char-id").value), onBox.checked === true));
    }
    const inputs = $("#c-radar-inputs");
    if (inputs && !inputs.__stepsBound) {
      inputs.__stepsBound = true;
      const bump = (wrap, dir, step) => {
        const inp = wrap && wrap.querySelector(".radar-in-val");
        if (!inp) return;
        const cur = parseFloat(inp.value);
        const base = Number.isFinite(cur) ? cur : 0;
        const next = Math.max(0, Math.min(10, Math.round((base + dir * step) * 10) / 10));
        inp.value = String(next);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const stopHold = (btn) => {
        if (!btn || !btn.__holdTimer) return;
        clearInterval(btn.__holdTimer);
        btn.__holdTimer = 0;
      };
      inputs.addEventListener("pointerdown", (ev) => {
        const btn = ev.target.closest(".radar-step");
        if (!btn) return;
        ev.preventDefault();
        const wrap = btn.closest(".radar-in-box");
        const dir = btn.classList.contains("radar-step-up") ? 1 : -1;
        btn.__suppressClick = true;
        bump(wrap, dir, 0.1);
        const started = performance.now();
        stopHold(btn);
        btn.__holdTimer = setInterval(() => {
          const t = performance.now() - started;
          bump(wrap, dir, t < 600 ? 0.1 : t < 1500 ? 0.2 : 0.5);
        }, 80);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
        inputs.addEventListener(type, (ev) => {
          const btn = ev.target.closest(".radar-step");
          if (btn) stopHold(btn);
        })
      );
      inputs.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".radar-step");
        if (!btn) return;
        ev.preventDefault();
        if (btn.__suppressClick) {
          btn.__suppressClick = false;
          return;
        }
        // 键盘触发的 click（没有 pointerdown）只走一次普通步进
        const wrap = btn.closest(".radar-in-box");
        bump(wrap, btn.classList.contains("radar-step-up") ? 1 : -1, 0.1);
      });
      inputs.addEventListener(
        "wheel",
        (ev) => {
          const inp = ev.target.closest(".radar-in-val");
          if (!inp) return;
          ev.preventDefault();
          const wrap = inp.closest(".radar-in-box");
          const dir = ev.deltaY < 0 ? 1 : -1;
          bump(wrap, dir, ev.shiftKey ? 1 : 0.1);
        },
        { passive: false }
      );
      // 边填边画（没勾上 / 图上还没出来就不画）
      inputs.addEventListener("input", (ev) => {
        const inp = ev.target.closest ? ev.target.closest(".radar-in-val") : null;
        if (!inp) return;
        const chart = $("#c-radar-chart");
        if (!chart || chart.hidden) return;
        drawRadarForCurrent();
      });
    }
  }

  function managePalette(kind) {
    return kind === "relkind" ? REL_KIND_PALETTE : kind === "group" ? GROUP_COLORS : kind === "line" ? LINE_COLORS : CAT_COLORS;
  }

  function manageArrayOf(kind) {
    if (kind === "group") return state.groups;
    if (kind === "line") return state.lines;
    if (kind === "cat") return (state.settings && state.settings.categories) || [];
    if (kind === "relkind") return relKindList();
    return null;
  }

  function manageFindById(kind, id) {
    const arr = manageArrayOf(kind) || [];
    if (kind === "relkind") return arr.find((x) => x.name === id);
    return arr.find((x) => x.id === id);
  }

  function manageItemName(kind, it) {
    if (!it) return "";
    if (kind === "line") return `${it.code || ""} ${it.name || ""}`.trim();
    return it.name || "";
  }

  // 列表顺序就是各界面上的显示顺序，所以改完顺序要把相关界面一起刷新
  function refreshManageViews(kind) {
    if (kind === "relkind") {
      renderManageRelKinds();
      renderRelations();
      return;
    }
    if (kind === "group") {
      renderCharacters();
      renderMatrix();
      syncGroupSelectWithModal();
      renderFactionAnalysis();
      renderStats();
      return;
    }
    if (kind === "line") {
      refreshLineViews();
      return;
    }
    renderCategories();
    renderEntries();
    fillFieldsetScopeSelect();
    renderFieldsetPanel("entry");
  }

  function manageRowHtml(kind, id, color, delTitle, inner, idx, lock, opts) {
    const o = opts || {};
    return `<div class="manage-row${lock ? " locked" : ""}${o.grey ? " grey-locked" : ""}" data-manage-row="${kind}" data-id="${esc(id)}" data-manage-idx="${Number(idx)}">
          ${
            lock
              ? `<span class="manage-grip locked" title="${esc(
                  o.lockTip || "固定分组：文本分析靠它把龙套分出来，不能改名、也不能移动"
                )}"></span>`
              : `<span class="manage-grip" draggable="true" title="按住拖动＝调整顺序（就是各界面上的显示顺序）">⠿</span>`
          }
          <span class="manage-no">${Number(idx) + 1}</span>
          ${
            o.hideColor
              ? ""
              : `<button type="button" class="manage-dot" data-manage-color="${kind}" style="background:${esc(color)}" title="点击改颜色"></button>`
          }
          ${inner}
          ${
            o.hideDel
              ? ""
              : `<button type="button" class="icon-btn manage-del"${o.delDisabled ? " disabled" : ""} data-manage-del="${kind}" title="${esc(
                  delTitle
                )}">×</button>`
          }
        </div>`;
  }

  /* ---- 设置 → 自定义识别合并规则（人物 / 设定档案共用一套界面） ---- */
  let ruleEntryScopeId = "";
  // 悬浮说明：先讲清「严格 / 近似」，再逐个说三种模式
  const RULE_MODE_TIP =
    "严格命中＝名字和词条写法完全一致（繁简、大小写、空格、标点的差别自动忽略）；" +
    "近似命中＝差一两个字，或一个名字包含另一个。\n" +
    "静默合并：严格命中直接合并，近似命中列出来等你确认。\n" +
    "严格识别：只在严格命中时列出来。\n" +
    "匹配识别：近似命中也会列出来。";
  // 词条间隔符的说明（按钮和输入框都用它）
  const RULE_TERMS_TIP =
    "词条之间用空格、逗号、顿号、分号、冒号、斜杠等隔开，连续多个只算一个；点号、引号、括号不拆词条（O'Brien、J.R.R. 这种写法会整段保留）";

  function ruleRowHtml(kind, r) {
    const opts = RULE_MODE_IDS.map(
      (id) => `<option value="${id}"${r.mode === id ? " selected" : ""}>${esc(RULE_MODE_LABELS[id])}</option>`
    ).join("");
    return `<div class="manage-row rule-row" data-rule-row="${kind}" data-id="${esc(r.id)}">
          <select class="manage-rule-mode" data-rule-mode="${kind}" title="${esc(RULE_MODE_TIP)}">${opts}</select>
          <input type="text" class="manage-name rule-words" data-rule-words="${kind}" value="${esc(r.words || "")}" placeholder="词条（空格 / 逗号分隔）" title="${esc(RULE_TERMS_TIP)}" />
          <button type="button" class="icon-btn manage-del" data-rule-del="${kind}" title="删除这条规则">×</button>
        </div>`;
  }

  function fillRuleScopeSelect() {
    /* 规则也按「字段种类」选项卡来分（用户 2026-10-17：原来单独一个下拉框，现在并入选项卡） */
    const cats = (state.settings && state.settings.categories) || [];
    if (!fieldsetEntryScope || !cats.some((c) => c.id === fieldsetEntryScope)) {
      fieldsetEntryScope = cats.length ? cats[0].id : "";
    }
    ruleEntryScopeId = fieldsetEntryScope;
  }

  function renderRuleList(kind) {
    const box = $("#manage-rule-" + kind);
    if (!box) return;
    const rules = kind === "entry" ? mergeRules().entries : mergeRules().chars;
    const list = kind === "entry" ? rules.filter((r) => r.categoryId === fieldsetEntryScope) : rules;
    box.innerHTML = list.length
      ? list.map((r) => ruleRowHtml(kind, r)).join("")
      : `<div class="manage-empty">还没有规则，点右上角「＋ 新建」。</div>`;
  }

  function renderRulePanes() {
    fillRuleScopeSelect();
    renderRuleList("char");
    renderRuleList("entry");
  }

  function bindRulePanes() {
    /* 作用范围跟着「字段种类」选项卡走，这里不再有自己的下拉框 */
  }

  function addRule(kind) {
    const r = ensureMergeRules();
    let id = "";
    if (kind === "entry") {
      const cat = getCat(fieldsetEntryScope);
      if (!cat) {
        showToast("先在上面选一个字段种类（设定类别）");
        return;
      }
      id = uid();
      r.entries.push({ id, mode: "silent", words: "", categoryId: cat.id });
      pendingUndoLabel = `新建识别规则（${cat.name}）`;
      renderRuleList("entry");
    } else {
      id = uid();
      r.chars.push({ id, mode: "silent", words: "" });
      pendingUndoLabel = "新建识别规则（人物）";
      renderRuleList("char");
    }
    saveState();
    const inp = document.querySelector(`#manage-rule-${kind} [data-id="${id}"] [data-rule-words]`);
    if (inp) inp.focus();
  }

  function deleteRule(kind, id) {
    const list = kind === "entry" ? mergeRules().entries : mergeRules().chars;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    pendingUndoLabel = "删除识别规则";
    saveState();
    renderRuleList(kind);
  }

  function patchRule(kind, id, field, value) {
    const list = kind === "entry" ? mergeRules().entries : mergeRules().chars;
    const r = list.find((x) => x.id === id);
    if (!r) return;
    if (field === "mode") {
      if (RULE_MODE_IDS.indexOf(value) < 0 || r.mode === value) return;
      r.mode = value;
      pendingUndoLabel = `识别规则改成「${RULE_MODE_LABELS[value]}」`;
    } else {
      const v = String(value == null ? "" : value);
      if (r.words === v) return;
      r.words = v;
      pendingUndoLabel = "修改识别规则词条";
    }
    saveState();
  }

  function renderManageGroups() {
    const box = $("#manage-group");
    if (!box) return;
    const extraId = extraGroupIdOf();
    box.innerHTML =
      state.groups
        .map((g, i) => {
          /* 程序自带的固定分组：龙套（文本分析专用，固定在最后）与「未分组」
             （人物没地方放时的兜底桶）—— 都不许改名 / 删除 / 拖动。 */
          const locked = g.id === extraId || g.special === UNGROUPED_SPECIAL;
          const tip =
            g.id === extraId
              ? "「龙套」是文本分析专用的固定分组：不能改名，也固定在最后"
              : "「未分组」是程序自带的固定分组：不能改名、也不能删除";
          return manageRowHtml(
            "group",
            g.id,
            g.color || "#6b6480",
            "删除分组（组内人物会回到「未分组」）",
            `<input type="text" class="manage-name" data-manage-name="group" value="${esc(g.name || "")}" placeholder="分组名"${
              // 固定分组：输入框直接禁用（会灰掉），× 不画
              locked ? ` disabled title="${esc(tip)}"` : ""
            } />`,
            i,
            locked,
            { lockTip: locked ? tip : "", hideDel: locked, grey: locked }
          );
        })
        .join("") || `<div class="manage-empty">还没有分组，点「＋ 新建」。</div>`;
    bindManageDrag("group", box);
  }

  function renderManageLines() {
    const box = $("#manage-line");
    if (!box) return;
    box.innerHTML =
      state.lines
        .map((l, i) =>
          manageRowHtml(
            "line",
            l.id,
            l.color || "#49bfb1",
            "删除线路（只属于它的事件会转到第一条线路）",
            `<input type="text" class="manage-code" data-manage-code="line" value="${esc(l.code || "")}" placeholder="代号" title="线路代号（事件轴上显示的那个字母）" />
          <input type="text" class="manage-name" data-manage-name="line" value="${esc(lineDisplayName(l))}" placeholder="线路名" />`,
            i
          )
        )
        .join("") || `<div class="manage-empty">还没有线路。</div>`;
    bindManageDrag("line", box);
  }

  function renderManageCats() {
    const box = $("#manage-cat");
    if (!box) return;
    const cats = (state.settings && state.settings.categories) || [];
    box.innerHTML =
      cats
        .map((c, i) => {
          const locked = catIsLocked(c);
          return manageRowHtml(
            "cat",
            c.id,
            c.color || "#8f7bd8",
            "删除类别（类别下的条目也会一并删除）",
            `<input type="text" class="manage-icon" data-manage-icon="cat" value="${esc(c.icon || "")}" placeholder="图标"${
              locked ? ` readonly title="${esc(catLockTip(c))}"` : ` title="类别图标（一个字，可留空）"`
            } />
          <input type="text" class="manage-name" data-manage-name="cat" value="${esc(catDisplayName(c))}" placeholder="类别名"${
            locked ? ` readonly title="${esc(catLockTip(c))}"` : ""
          } />`,
            i,
            locked,
            { hideColor: true, hideDel: locked, grey: locked }
          );
        })
        .join("") || `<div class="manage-empty">还没有设定类别。</div>`;
    bindManageDrag("cat", box);
    // 设定类别加了 / 删了 / 改名，输入保护里对应的那几行也要跟着增减
    renderFillProtect();
  }

  /* ---- 上下拖动排序 ---- */
  let manageDrag = null;
  function bindManageDrag(kind, box) {
    box.querySelectorAll(".manage-row").forEach((row) => {
      if (row.dataset.manageVirtual) return; // 「未分组」这类固定行不参与排序
      const idx = Number(row.dataset.manageIdx);
      if (!(idx >= 0)) return;
      // 固定的设定类别（纪年 / 地点 / 势力）：别的东西也不能拖到它头上，免得挤动它的位置
      const lockedRow = kind === "cat" && catIsLocked(getCat(row.dataset.id));
      const grip = row.querySelector(".manage-grip");
      if (!grip) return;
      grip.addEventListener("dragstart", (ev) => {
        manageDrag = { kind, from: idx };
        row.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", "manage:" + kind + ":" + idx);
          } catch (e) {
            /* ignore */
          }
        }
      });
      grip.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        box.querySelectorAll(".manage-row").forEach((r) => r.classList.remove("drop-target"));
        manageDrag = null;
      });
      row.addEventListener("dragover", (ev) => {
        if (!manageDrag || manageDrag.kind !== kind || manageDrag.from === idx) return;
        if (lockedRow) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        box.querySelectorAll(".manage-row").forEach((r) => r.classList.remove("drop-target"));
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (ev) => {
        if (!manageDrag || manageDrag.kind !== kind) return;
        if (lockedRow) return;
        ev.preventDefault();
        const from = manageDrag.from;
        manageDrag = null;
        moveManageItem(kind, from, idx);
      });
    });
  }

  function moveManageItem(kind, from, to) {
    const arr = manageArrayOf(kind);
    if (!arr || from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
      renderManageLists();
      return;
    }
    const it = arr.splice(from, 1)[0];
    arr.splice(to, 0, it);
    if (kind === "group") normalizeGroupOrder(); // 拖到哪儿都不影响「龙套」待在最后
    const what = uiTextFor(kind === "group" ? "分组" : kind === "line" ? "线路" : kind === "relkind" ? "关系类型" : "设定类别");
    pendingUndoLabel = `调整${what}顺序：「${manageItemName(kind, it)}」`;
    saveState();
    refreshManageViews(kind);
    renderManageLists();
    showToast(`已调整${what}顺序（可撤销）`);
  }

  /* ---- 点色块改颜色 ---- */
  let manageColorPop = null;
  let manageColorPopPlace = null;
  function closeManageColorPop() {
    if (manageColorPop) {
      manageColorPop.remove();
      manageColorPop = null;
    }
    manageColorPopPlace = null;
    document.removeEventListener("mousedown", onDocDownForColorPop, true);
  }
  uiOnZoomReflow(() => {
    if (manageColorPopPlace) manageColorPopPlace();
  });
  function onDocDownForColorPop(e) {
    if (manageColorPop && !manageColorPop.contains(e.target)) closeManageColorPop();
  }
  function openManageColorPicker(kind, id, anchor) {
    closeManageColorPop();
    const colors = managePalette(kind) || [];
    const it = manageFindById(kind, id);
    if (!it) return;
    const pop = document.createElement("div");
    pop.className = "manage-color-pop";
    pop.innerHTML = colors
      .map((c) => `<span class="swatch${c === it.color ? " selected" : ""}" data-color="${esc(c)}" style="background:${esc(c)}"></span>`)
      .join("") +
      // 自定义颜色：始终保留彩虹填充（一眼能看出这是「自己调」的入口）；
      // 当前用的就是自定义色时，外面套一圈它的颜色
      `<span class="swatch rainbow${
        colors.indexOf(it.color) >= 0 ? "" : " selected"
      }" data-color="__custom__" title="自定义颜色（色环 / RGB）"${
        colors.indexOf(it.color) >= 0 ? "" : ` style="box-shadow:0 0 0 2px ${esc(it.color)}"`
      }></span>`;
    document.body.appendChild(pop);
    const place = () => {
      if (!pop.isConnected || !anchor || !anchor.isConnected) return;
      const r = uiVisualRect(anchor);
      const pr = uiVisualRect(pop);
      const w = pr.width;
      const h = pr.height;
      // 视觉坐标 → 元素坐标系（缩放时别被放大第二次）
      pop.style.left = uiZoomPx(Math.max(8, Math.min(r.left - 6, window.innerWidth - w - 8)));
      pop.style.top = uiZoomPx(Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8)));
    };
    manageColorPopPlace = place;
    place();
    pop.querySelectorAll(".swatch").forEach((s) =>
      s.addEventListener("click", () => {
        const v = s.dataset.color;
        if (v === "__custom__") {
          openColorWheelPop(s, it.color, (hex) => {
            it.color = hex;
            const what = uiTextFor(
              kind === "group" ? "分组" : kind === "line" ? "线路" : kind === "relkind" ? "关系类型" : "设定类别"
            );
            pendingUndoLabel = `修改${what}颜色：「${manageItemName(kind, it)}」`;
            saveState();
            refreshManageViews(kind);
            renderManageLists();
          });
          return;
        }
        it.color = v;
        const what = uiTextFor(
          kind === "group" ? "分组" : kind === "line" ? "线路" : kind === "relkind" ? "关系类型" : "设定类别"
        );
        pendingUndoLabel = `修改${what}颜色：「${manageItemName(kind, it)}」`;
        saveState();
        refreshManageViews(kind);
        renderManageLists();
        closeManageColorPop();
      })
    );
    manageColorPop = pop;
    setTimeout(() => document.addEventListener("mousedown", onDocDownForColorPop, true), 0);
  }

  function renderManageLists() {
    renderManageGroups();
    renderManageLines();
    renderManageCats();
  }

  // 新建线路时自动挑一个没被占用的代号
  function nextLineCode() {
    const used = new Set(state.lines.map((l) => String(l.code || "").toUpperCase()));
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i);
      if (!used.has(c)) return c;
    }
    let n = state.lines.length + 1;
    while (used.has("L" + n)) n++;
    return "L" + n;
  }

  async function addManageItem(kind) {
    if (kind === "group") {
      const name = await uiPrompt("新分组的名称？");
      if (name === null || !String(name).trim()) return;
      const g = {
        id: uid(),
        name: String(name).trim(),
        color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
        collapsed: false,
      };
      insertGroupBeforeUngrouped(g); // 新分组排在「未分组」前面、「龙套」之前
      normalizeGroupOrder();
      pendingUndoLabel = `新建分组：「${g.name}」`;
      saveState();
      renderCharacters();
      renderMatrix();
      syncGroupSelectWithModal();
      renderFactionAnalysis();
      renderStats();
      renderManageGroups();
      showToast(`已新建分组「${g.name}」`);
      return;
    }
    if (kind === "line") {
      const name = await uiPrompt("新线路的名称？（代号自动分配，之后可改）");
      if (name === null || !String(name).trim()) return;
      const code = nextLineCode();
      const created = {
        id: uid(),
        code,
        name: String(name).trim(),
        kind: "明线",
        parentId: null,
        color: LINE_COLORS[state.lines.length % LINE_COLORS.length],
        note: "",
      };
      state.lines.push(created);
      pendingUndoLabel = `新建线路：「${code} ${created.name}」`;
      saveState();
      refreshLineViews();
      renderManageLines();
      showToast(`已新建线路「${code} ${created.name}」，事件轴和时间线都多了一列`);
      return;
    }
    if (kind === "cat") {
      const name = await uiPrompt("新设定类别的名称？");
      if (name === null || !String(name).trim()) return;
      const cats = state.settings.categories;
      const cat = {
        id: uid(),
        name: String(name).trim(),
        icon: "",
        color: CAT_COLORS[cats.length % CAT_COLORS.length],
        fieldTemplate: [],
      };
      cats.push(cat);
      normalizeCatOrder();
      pendingUndoLabel = `新建设定类别：「${cat.name}」`;
      saveState();
      renderCategories();
      renderEntries();
      fillFieldsetScopeSelect();
      renderFieldsetPanel("entry");
      renderManageCats();
      showToast(`已新建设定类别「${cat.name}」`);
      return;
    }
  }

  function patchManageItem(kind, id, field, value) {
    const v = String(value == null ? "" : value).trim();
    if (kind === "relkind") {
      renameRelKind(id, v).then(() => renderManageRelKinds());
      return;
    }
    if (kind === "group") {
      const g = getGroup(id);
      if (!g || g.name === v) {
        renderManageGroups();
        return;
      }
      // 程序自带的固定分组（龙套 / 未分组）：不许改名
      if (g.id === extraGroupIdOf() || g.special === UNGROUPED_SPECIAL) {
        renderManageGroups();
        showToast(
          g.id === extraGroupIdOf()
            ? "「龙套」是文本分析专用的固定分组，不能改名"
            : uiTextFor("「未分组」是程序自带的固定分组：不能改名、也不能删除")
        );
        return;
      }
      if (!v) {
        renderManageGroups();
        return;
      }
      const old = g.name;
      g.name = v;
      pendingUndoLabel = `重命名分组：「${old}」→「${v}」`;
      saveState();
      renderCharacters();
      renderMatrix();
      syncGroupSelectWithModal();
      renderFactionAnalysis();
      renderStats();
      renderManageGroups();
      return;
    }
    if (kind === "line") {
      const l = getLine(id);
      if (!l) return;
      if (field === "code") {
        if (!v || l.code === v) {
          renderManageLines();
          return;
        }
        const old = l.code;
        l.code = v;
        pendingUndoLabel = `修改线路代号：「${old}」→「${v}」`;
      } else {
          /* 输入框里显示的是「当前语言下的默认名」（主线 / 暗线 / 明线）；
             名字没被改过就原样返回，别把翻译后的显示名写回数据。 */
          if (l.name === v || lineDisplayName(l) === v) {
          renderManageLines();
          return;
        }
        const old = l.name || "（无名）";
        l.name = v;
        pendingUndoLabel = `重命名线路：「${l.code} ${old}」→「${l.code} ${v}」`;
      }
      saveState();
      refreshLineViews();
      renderManageLines();
      return;
    }
    if (kind === "cat") {
      const c = getCat(id);
      if (!c) return;
      if (field === "icon") {
        if ((c.icon || "") === v) return;
        c.icon = v;
        pendingUndoLabel = `修改设定类别图标：「${c.name}」`;
      } else {
        /* 输入框里显示的是「当前语言下的默认名」（程序自带的那几个类别）。
           名字没被改过就原样返回，别把翻译后的显示名写回数据。 */
        if (!v || c.name === v || catDisplayName(c) === v) {
          renderManageCats();
          return;
        }
        const old = c.name;
        c.name = v;
        pendingUndoLabel = `重命名设定类别：「${old}」→「${v}」`;
      }
      saveState();
      renderCategories();
      renderEntries();
      fillFieldsetScopeSelect();
      renderFieldsetPanel("entry");
      renderManageCats();
      return;
    }
  }

  function removeManageItem(kind, id) {
    if (kind === "relkind") {
      deleteRelKind(id).then(() => renderManageRelKinds());
      return;
    }
    if (kind === "group") {
      const g = getGroup(id);
      if (!g) return;
      // 程序自带的固定分组（龙套 / 未分组）不能删：龙套被删掉，靠它分龙套的那些功能就乱了
      if (g.special === UNGROUPED_SPECIAL || g.special === "extra") {
        showToast(
          uiTextFor(
            g.special === "extra"
              ? "「龙套」是文本分析专用的固定分组，不能删除"
              : "「未分组」是程序自带的固定分组：不能改名、也不能删除"
          )
        );
        return;
      }
      state.characters.forEach((c) => {
        if (c.groupId === id) c.groupId = "";
      });
      state.groups = state.groups.filter((x) => x.id !== id);
      pendingUndoLabel = `删除分组：「${g.name}」（组内人物回到「未分组」）`;
      saveState();
      renderCharacters();
      renderMatrix();
      const sel = $("#c-group");
      syncGroupSelectWithModal(sel && sel.value === id ? "" : undefined);
      renderFactionAnalysis();
      renderStats();
      renderManageGroups();
      showToast(`已删除分组「${g.name}」（组内人物已移到「未分组」，可撤销）`);
      return;
    }
    if (kind === "line") {
      const l = getLine(id);
      if (!l) return;
      deleteLineById(id);
      renderManageLines();
      return;
    }
    if (kind === "cat") {
      const c = getCat(id);
      if (!c) return;
      deleteCat(id);
      fillFieldsetScopeSelect();
      renderFieldsetPanel("entry");
      renderManageCats();
      showToast(`已删除设定类别「${c.name}」（类别下的条目也一并删除，可撤销）`);
      return;
    }
  }

  function bindManageLists() {
    const modal = $("#settings-modal");
    if (!modal || modal.__manageBound) return;
    modal.__manageBound = true;
    modal.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const add = t.closest("[data-manage-add]");
      if (add) {
        addManageItem(add.dataset.manageAdd);
        return;
      }
      const del = t.closest("[data-manage-del]");
      if (del) {
        const row = del.closest("[data-manage-row]");
        if (row) removeManageItem(del.dataset.manageDel, row.dataset.id);
        return;
      }
      const ruleAdd = t.closest("[data-rule-add]");
      if (ruleAdd) {
        addRule(ruleAdd.dataset.ruleAdd);
        return;
      }
      const ruleDel = t.closest("[data-rule-del]");
      if (ruleDel) {
        const row = ruleDel.closest("[data-rule-row]");
        if (row) deleteRule(ruleDel.dataset.ruleDel, row.dataset.id);
        return;
      }
      const col = t.closest("[data-manage-color]");
      if (col) {
        const row = col.closest("[data-manage-row]");
        if (row) openManageColorPicker(col.dataset.manageColor, row.dataset.id, col);
      }
    });
    // 输入框里回车＝提交这一格（不要触发「回车关闭设置」）
    modal.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!t || !t.dataset || !t.closest) return;
      if (!t.closest("[data-manage-row]") && !t.closest("[data-rule-row]")) return;
      e.preventDefault();
      e.stopPropagation();
      t.blur();
    });
    modal.addEventListener("change", (e) => {
      const t = e.target;
      if (!t || !t.dataset || !t.closest) return;
      const ruleRow = t.closest("[data-rule-row]");
      if (ruleRow) {
        if (t.dataset.ruleWords) patchRule(t.dataset.ruleWords, ruleRow.dataset.id, "words", t.value);
        else if (t.dataset.ruleMode) patchRule(t.dataset.ruleMode, ruleRow.dataset.id, "mode", t.value);
        return;
      }
      const row = t.closest("[data-manage-row]");
      if (!row) return;
      const id = row.dataset.id;
      if (t.dataset.manageName) patchManageItem(t.dataset.manageName, id, "name", t.value);
      else if (t.dataset.manageCode) patchManageItem("line", id, "code", t.value);
      else if (t.dataset.manageIcon) patchManageItem("cat", id, "icon", t.value);
    });
  }

  const SET_PANE_KEY = "fiction_gui_settings_pane_v1";
  /* 输入保护拆进了「人物 / 事件 / 设定档案」三个子界面（各自跟在自定义规则前或末尾），
     不再是独立的一栏。 */
  const SET_PANES = ["chars", "events", "entries", "history", "privacy", "paths", "lang", "agent", "update"];
  let settingsPane = "chars";

  function selectSettingsPane(pane) {
    const target = SET_PANES.includes(pane) ? pane : "chars";
    settingsPane = target;
    closeManageColorPop();
    try {
      localStorage.setItem(SET_PANE_KEY, target);
    } catch (e) {
      /* ignore */
    }
    $$("#set-nav .set-nav-btn").forEach((b) => {
      const on = b.dataset.setPane === target;
      if (b.classList.contains("active") !== on) b.classList.toggle("active", on);
    });
    $$("#settings-modal .set-pane").forEach((p) => {
      const on = p.dataset.setPane === target;
      if (p.classList.contains("active") !== on) p.classList.toggle("active", on);
    });
    // 动态内容：历史版本每次切过去刷新；Agent 每次切过去载入已保存配置
    if (target === "history") {
      renderHistory();
      syncAutoSaveUi();
    }
    if (target === "privacy") {
      bindPrivacyPane();
      renderPrivacyPane(true);
    }
    if (target === "agent") {
      renderAgentForm();
      syncAgentUi();
    }
    if (target === "chars") {
      renderManageGroups();
      renderManageRelKinds();
      renderRadarSettings();
      renderFieldsetPanel("char");
      renderRulePanes();
      renderFillProtect();
    }
    if (target === "events") {
      renderManageLines();
      renderFieldsetPanel("event");
      renderFillProtect();
    }
    if (target === "entries") {
      fillFieldsetScopeSelect();
      renderManageCats();
      renderFieldsetPanel("entry");
      renderRulePanes();
      renderFillProtect();
    }
    if (target === "paths") {
      renderPathsPane();
    }
  }

  function openSettingsModal(pane) {
    selectSettingsPane(pane || settingsPane);
    renderPathsPane();
    renderAutoUpdatePane();
    renderLangPane();
    takeSettingsSnapshot();
    // 每次打开都是一条新的设置历史
    settingsModalOpen = true;
    settingsUndoStack = [];
    settingsRedoStack = [];
    updateSettingsUndoButtons();
    openModal("settings-modal");
    const btn = $("#settings-btn");
    if (btn) btn.blur();
  }

  /* ---- 设置界面是事务式的：点「保存」才留下改动，× / Esc 关掉＝丢弃 ---- */
  let settingsSnapshot = null;
  let agentSaveKeepOpen = false; // Agent 子界面点「保存」时：保存但不关设置
  // 统一的保存语义：Ctrl+S / 点「保存」按钮＝只保存不关；Enter（不在输入框）＝保存并关闭；Esc / × ＝不保存关闭
  let saveKeepOpen = false;
  function finishCardSave(id) {
    const keep = saveKeepOpen;
    saveKeepOpen = false;
    if (keep) showToast("已保存");
    else closeModal(id);
  }
  // 保存不关时：把新建出来的 id 记回弹窗，下一次再保存就是「修改」而不是再新建一个
  const MODAL_ID_INPUT = {
    "char-modal": "#char-id",
    "event-modal": "#event-id",
    "line-modal": "#l-id",
    "cat-modal": "#cat-id",
    "entry-modal": "#entry-id",
    "relation-modal": "#rel-id",
  };
  function syncSavedId(modalId, newId) {
    if (!saveKeepOpen || !newId) return;
    const sel = MODAL_ID_INPUT[modalId];
    if (sel) {
      const el = $(sel);
      if (el) el.value = newId;
    }
  }
  // 注意：AGENT_STATUS_KEY 不在这里 —— 「连接检测结果」不是设置项，
  // 关掉设置界面不应该把刚测出来的「连接正常」一起退回。
  // 关掉设置界面（Esc / ×）＝退回这次打开期间的改动，隐私设置里工作区那把锁也算
  const SETTINGS_LS_KEYS = [AGENT_KEY, AUTOSAVE_KEY, AGENT_DISABLED_KEY, FILL_OPTS_KEY, PATHS_KEY, WS_PRIVACY_KEY];

  function takeSettingsSnapshot() {
    const ls = {};
    SETTINGS_LS_KEYS.forEach((k) => {
      try {
        ls[k] = localStorage.getItem(k);
      } catch (e) {
        ls[k] = null;
      }
    });
    settingsSnapshot = {
      state: deepCopyData(state),
      ls,
      autoSave: Object.assign({}, autoSaveOpts),
      agentStatus: JSON.parse(JSON.stringify(agentStatus || {})),
      agentDisabled: !!agentDisabled,
      fillOpts: Object.assign({}, fillOpts),
      undoLen: undoStack.length,
    };
  }

  // 关掉设置界面（× / Esc / 点遮罩）＝把这次打开期间的改动全部退回
  function discardSettingsChanges() {
    const snap = settingsSnapshot;
    settingsSnapshot = null;
    settingsModalOpen = false;
    settingsUndoStack = [];
    settingsRedoStack = [];
    updateSettingsUndoButtons();
    // 全局字段的草稿：设置界面一关就丢掉。
    // 放在前面（也管「保存后关闭」）：不留旧草稿，下次打开时面板与「输入保护」
    // 都从已保存的清单重新起，不会出现「面板显示的和程序实际用的不是一套」。
    fieldsetDraft.char = null;
    fieldsetDraft.event = null;
    fieldsetDraft.entry = {};
    radarDraftClear(); // 没保存就关掉：追加功能 / 顶点这些草稿一起丢
    treeDraftClear(); // 「追加功能 → 树型拓扑」的勾选同样是草稿
    if (!snap) return;
    applySnapshot(snap.state);
    SETTINGS_LS_KEYS.forEach((k) => {
      try {
        if (snap.ls[k] == null) localStorage.removeItem(k);
        else localStorage.setItem(k, snap.ls[k]);
      } catch (e) {
        /* ignore */
      }
    });
    autoSaveOpts = snap.autoSave;
    loadPathPrefs();
    agentDisabled = snap.agentDisabled;
    fillOpts = snap.fillOpts;
    // 这次打开期间产生的撤销步骤一起去掉，免得「撤销」跳回被丢弃的中间状态
    if (undoStack.length > snap.undoLen) undoStack.length = snap.undoLen;
    redoStack = [];
    persistOnly();
    renderAll();
    updateUndoButtons();
    syncAutoSaveUi();
    syncAgentUi();
  }

  function finishSettingsSave(msg) {
    settingsSnapshot = null;
    settingsModalOpen = false;
    settingsUndoStack = [];
    settingsRedoStack = [];
    updateSettingsUndoButtons();
    persistOnly();
    showToast(msg || "设置已保存");
    closeModal("settings-modal");
  }

  // 保存但不关界面：落盘 + 把当前状态立成新的基线（之后 Esc 只丢后面改的）
  function finishSettingsKeepOpen() {
    persistOnly();
    takeSettingsSnapshot();
    renderActiveSettingsPane();
    syncRadarAnalysisButton();
    updateSettingsUndoButtons();
    showToast("设置已保存");
  }

  // 「保存」按钮 / Ctrl+L：保存不关界面；Enter / Ctrl+S：保存并关闭
  function saveSettingsModal(opt) {
    const keepOpen = !!(opt && opt.keepOpen);
    collectPathInputs();
    radarDraftApply(); // 「追加功能 → 雷达图」是草稿：点保存才作数
    treeDraftApply(); // 「追加功能 → 树型拓扑」同理
    applyAutoUpdateFromUi(); // 自动更新开关也跟「保存」一起生效（× / Esc 关掉就丢弃）
    applyLangFromUi(); // 语言选择同样点保存才生效
    if (settingsPane === "agent") {
      const form = $("#agent-form");
      if (form && typeof form.requestSubmit === "function") {
        agentSaveKeepOpen = keepOpen; // 让 submitAgentForm 知道要不要关窗
        form.requestSubmit();
        return;
      }
      if (keepOpen) finishSettingsKeepOpen();
      else finishSettingsSave();
      return;
    }
    if (settingsPane === "history") {
      const inp = $("#history-label");
      const label = inp ? String(inp.value || "").trim() : "";
      if (label) {
        doSaveVersion().then(() => (keepOpen ? finishSettingsKeepOpen() : finishSettingsSave()));
        return;
      }
    }
    if (keepOpen) finishSettingsKeepOpen();
    else finishSettingsSave();
  }

  /* ================= 文本分析的「输入保护」 =================
     每个字段在「填入设定档案」时怎么处理：
       全部锁定＝完全不动；非空锁定＝只有空着才填；追加＝加在原有内容后面；
       兼并＝整合成通顺的一段（可能删掉重复的，也可能用更完整的新内容覆盖旧的）。
     雷达图这类非填入内容只有 全部锁定 / 非空锁定 / 兼并（＝直接覆盖）三种。 */
  const PROTECT_MODE_LABELS = {
    lock: "全部锁定",
    lockEmpty: "非空锁定",
    append: "追加",
    merge: "兼并",
  };
  const PROTECT_MODES_TEXT = ["lock", "lockEmpty", "append", "merge"];
  const PROTECT_MODES_RADAR = ["lock", "lockEmpty", "merge"];
  /* 雷达图那一行（人物雷达 / 各类别的「追加功能 → 雷达图」）只有三档，默认「非空锁定」 */
  const isRadarProtectKey = (key) => key === "char:radar" || /:radar$/.test(String(key || ""));
  const PROTECT_DEFAULT_MODE = {};

  function initFillProtect() {
    if (!state.fillProtect || typeof state.fillProtect !== "object" || Array.isArray(state.fillProtect)) state.fillProtect = {};
  }

  function protectModesFor(key) {
    return isRadarProtectKey(key) ? PROTECT_MODES_RADAR : PROTECT_MODES_TEXT;
  }

  function protectModeOf(key) {
    initFillProtect();
    let saved = state.fillProtect[key];
    /* 老存档：装备雷达图那一行的 key 是 gear:radar，现在按类别记 → 读一次老值 */
    if (!saved && /:radar$/.test(String(key || ""))) {
      const catId = String(key).slice("entry:".length, -":radar".length);
      const c = catId ? getCat(catId) : null;
      if (c && catKind(c) === "gear") saved = state.fillProtect["gear:radar"];
    }
    if (saved === "replace") saved = "merge"; // 旧数据：去掉「替换」后并进「兼并」
    if (saved && PROTECT_MODE_LABELS[saved]) return saved;
    if (isRadarProtectKey(key)) return "lockEmpty"; // 雷达图默认「非空锁定」
    return PROTECT_DEFAULT_MODE[key] || "merge";
  }

  function setProtectMode(key, mode) {
    initFillProtect();
    if (!PROTECT_MODE_LABELS[mode]) return;
    state.fillProtect[key] = mode;
  }

  /* 输入保护要保护哪些字段＝「设置 → 全局字段」里那份清单：
     - 面板正在编辑时用草稿（删掉 / 新增 / 改名当场反映），没有草稿就用已保存的清单
     - 「已隐藏」的字段（off）文本分析本来就不填，不再列出来
     - 雷达图被禁用时，雷达图那一行也跟着去掉（数值保留，重新启用就回来） */
  function protectFieldList(kind) {
    const draft = fieldsetDraft[kind];
    const list = Array.isArray(draft) ? draft : fieldsetSchemaOf(kind);
    return (list || []).filter((f) => f && f.key && !(f.locked || f.required) && !f.off);
  }

  // 列出「要保护哪些东西」：跟着「设置 → 全局字段」的清单走（含自定义字段）
  // includeDisabled＝连被禁用 / 已隐藏的那些也列出来（「恢复默认」要能把它们一起清掉）
  function fillProtectGroups(includeDisabled) {
    const groups = [];
    const push = (title, rows) => {
      if (rows.length) groups.push({ title, rows });
    };
    // 数据还没加载好（启动那一瞬间）就先别算：这时候 state 还是空
    if (!state || !state.settings) return groups;
    const fieldRows = (kind) =>
      // 只影响显示：默认字段名按界面语言取，作者改过的名字原样
      protectFieldList(kind).map((f) => ({
        key: kind + ":" + f.key,
        name: uiDefaultLabel(f.label) || uiTextFor("未命名字段"),
      }));
    const charRows = fieldRows("char");
    charRows.push({ key: "char:faction", name: uiTextFor("所属势力") });
    if (includeDisabled || radarOn()) charRows.push({ key: "char:radar", name: uiTextFor("雷达图") });
    charRows.push({ key: "relation:desc", name: uiTextFor("关系网") });
    push("人物", charRows);
    const eventRows = fieldRows("event");
    eventRows.push({ key: "event:characters", name: uiTextFor("登场人物") });
    push("事件", eventRows);
    // 设定档案：按「每个类别的每个字段」细分；类别名那一行可以折叠、也可以一键批量设
    const cats = (state.settings.categories || []).map((c) => {
      // 字段清单＝类别的「字段模板」；面板正在编辑这一类时用草稿（加 / 删立刻反映）
      const draft = fieldsetDraft.entry[c.id];
      const raw = Array.isArray(draft) ? draft : Array.isArray(c.fieldTemplate) ? c.fieldTemplate : [];
      const labels = raw
        .filter((x) => !(x && typeof x === "object" && x.off))
        .map((x) => String((x && typeof x === "object" ? x.label : x) || "").trim())
        .filter(Boolean);
      const rows = labels.length
        ? labels
            .map((lb) => ({ key: protectEntryFieldKey(c.id, lb), name: uiDefaultLabel(lb) }))
            .concat([{ key: protectEntryFieldKey(c.id, "概述"), name: uiTextFor("概述") }])
        : [{ key: "entry:" + c.id, name: uiTextFor("整个类别") }];
      // 装备这一类的雷达图（文本分析会填数值，所以单独一行）
      /* 「追加功能 → 雷达图」勾了的类别，输入保护里才多一行「雷达图」。
         勾选是草稿（点保存才写回类别），但这一行按草稿实时出现 / 消失 ——
         用户刚勾上就该看见它（用户 2026-10-15 明确要求）。 */
      const draftR = radarDraft[c.id];
      const featNow = draftR ? !!draftR.feature : catRadarFeatureOn(c);
      const axesNow = draftR ? draftR.axes.length : catRadarAxes(c).length;
      if (catSupportsRadar(c) && featNow && (includeDisabled || axesNow > 0))
        rows.push({ key: catRadarProtectKey(c.id), name: uiTextFor("雷达图") });
      return { id: c.id, name: c.name, rows };
    });
    if (cats.length) groups.push({ title: "设定档案", cats });
    return groups;
  }

  // 设定条目的字段保护 key（按类别 + 字段名）
  function protectEntryFieldKey(catId, label) {
    const lb = String(label || "").trim();
    return lb ? "entry:" + catId + ":" + lb : "entry:" + catId;
  }


  function protectTargetName(key) {
    const all = [];
    fillProtectGroups().forEach((g) => {
      if (g.rows) all.push(...g.rows);
      if (g.cats) g.cats.forEach((c) => all.push(...c.rows));
    });
    const hit = all.find((r) => r && r.key === key);
    return hit ? hit.name : key;
  }

  /* 输入保护：拆成「人物 / 事件 / 设定档案」三块，分别渲染到对应子界面的
     [data-protect-list="…"] 里（人物 / 设定档案在「自定义规则」上方，事件在最后）。 */
  // 打字时先记账，停手后再重画一次：改字段名时保护清单跟着改，但别一个键重画一遍
  let fillProtectReloadTimer = 0;
  function scheduleFillProtectReload() {
    if (fillProtectReloadTimer) clearTimeout(fillProtectReloadTimer);
    fillProtectReloadTimer = setTimeout(() => {
      fillProtectReloadTimer = 0;
      renderFillProtect();
    }, 180);
  }

  function renderFillProtect() {
    const hosts = $$("[data-protect-list]");
    if (!hosts.length) return;
    const rowHtml = (r) => {
      const cur = protectModeOf(r.key);
      const opts = protectModesFor(r.key)
        .map((m) => `<option value="${m}"${m === cur ? " selected" : ""}>${esc(PROTECT_MODE_LABELS[m])}</option>`)
        .join("");
      return `<label class="protect-row" title="${esc(r.name)}"><span class="protect-name">${esc(r.name)}</span><select class="protect-select" data-protect-key="${esc(r.key)}">${opts}</select></label>`;
    };
    /* 一个设定类别就是一块：**不再有折叠三角，也没有"整类全选 / 批量设成某个方式"那一行**
       （用户 2026-10-17：设定档案那一栏只显示当前种类的字段，这两样都多余了，看着还乱）。
       现在只剩字段名 + 各自的保护方式下拉框。 */
    const catHtml = (cat) => `<div class="protect-cat" data-protect-cat="${esc(cat.id)}"><div class="protect-grid">${cat.rows
      .map(rowHtml)
      .join("")}</div></div>`;
    const groups = fillProtectGroups();
    hosts.forEach((box) => {
      const key = box.dataset.protectList || "";
      const grp = groups.find((g) => g.title === key);
      if (!grp) {
        box.innerHTML = "";
        return;
      }
      /* 设定档案这一栏：只画**当前字段种类**的那一块，而且不折叠（用户 2026-10-17） */
      const onlyKind = key === "设定档案" && grp.cats;
      const body = onlyKind
        ? (() => {
            const cat = grp.cats.find((c) => c.id === fieldsetEntryScope) || grp.cats[0];
            return cat ? catHtml(cat) : "";
          })()
        : grp.cats
        ? grp.cats.map((cat) => catHtml(cat)).join("")
        : `<div class="protect-grid">${grp.rows
            .map((r) => (r.sub ? `<div class="protect-sub">${esc(r.sub)}</div>` : rowHtml(r)))
            .join("")}</div>`;
      // 这一栏已经在自己的子界面里了，不再重复画「人物 / 事件 / 设定档案」那行标题
      box.innerHTML = `<div class="protect-group" data-protect-group="${esc(grp.title)}">${body}</div>`;
      bindFillProtectHost(box);
    });
  }

  /* 一个子界面里的输入保护：只剩"单字段改保护方式"。
     折叠三角和"整类批量"那一行都去掉了（用户 2026-10-17：设定档案只显示当前种类，那两样多余）。 */
  function bindFillProtectHost(box) {
    box.querySelectorAll(".protect-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.protectKey;
        const mode = sel.value;
        setProtectMode(key, mode);
        pendingUndoLabel = `修改输入保护：「${protectTargetName(key)}」→ ${PROTECT_MODE_LABELS[mode]}`;
        saveState();
        showToast(`输入保护：${protectTargetName(key)} = ${PROTECT_MODE_LABELS[mode]}`);
      });
    });
  }

  /* 恢复默认：把这一栏（人物 / 事件 / 设定档案）的保护方式清掉、重新按默认值走（可撤销）。
     传空＝全部恢复（老调用兜底）。 */
  function resetFillProtect(groupKey) {
    // 连「雷达图已禁用 / 字段已隐藏」那些没列出来的条目一起算上，免得以后启用回来还留着旧设置
    const groups = fillProtectGroups(true);
    const grp = groupKey ? groups.find((g) => g.title === groupKey) : null;
    const keys = [];
    if (grp) {
      if (grp.cats) grp.cats.forEach((cat) => (cat.rows || []).forEach((r) => keys.push(r.key)));
      else (grp.rows || []).forEach((r) => {
        if (!r.sub) keys.push(r.key);
      });
    }
    pushSettingsUndo(grp ? `输入保护恢复默认（${grp.title}）` : "输入保护恢复默认");
    initFillProtect();
    if (grp && keys.length) keys.forEach((k) => delete state.fillProtect[k]);
    else state.fillProtect = {};
    pendingUndoLabel = "输入保护恢复默认";
    settingsUndoGuard = true; // 这一步已经记过了，别让 saveState 再记一遍
    try {
      saveState();
    } finally {
      settingsUndoGuard = false;
    }
    renderFillProtect();
    showToast("输入保护已恢复默认（可撤销）");
  }

  /* ---- 按保护方式合并内容（任何会覆盖工作区文字的地方都走这里） ---- */
  // 追加：原有内容后面接上新内容；完全重复的不重复添加，新内容更完整时直接用新的
  function appendTextBlock(cur, add) {
    const a = String(cur == null ? "" : cur).trim();
    const b = String(add == null ? "" : add).trim();
    if (!b) return a;
    if (!a) return b;
    if (normTitle(a) === normTitle(b)) return a;
    if (a.indexOf(b) >= 0) return a;
    if (b.indexOf(a) >= 0) return b;
    return a.replace(/\s+$/, "") + "\n\n" + b;
  }

  // 兼并：按行去重（重复的只留一份，顺序照旧）；新内容更完整时整体用它
  function mergeTextBlock(cur, add) {
    const a = String(cur == null ? "" : cur).trim();
    const b = String(add == null ? "" : add).trim();
    if (!b) return a;
    if (!a) return b;
    if (normTitle(a) === normTitle(b)) return a;
    if (b.indexOf(a) >= 0) return b;
    if (a.indexOf(b) >= 0) return a;
    const seen = new Set();
    const parts = [];
    [a, b].forEach((t) => {
      t.split(/\n+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((line) => {
          const k = normTitle(line);
          if (!k || seen.has(k)) return;
          seen.add(k);
          parts.push(line);
        });
    });
    return parts.join("\n");
  }

  // 文本字段：按保护方式算出「合并之后应该是什麼」；lock 时原样返回
  function protectTextValue(key, existing, incoming) {
    const mode = protectModeOf(key);
    const cur = String(existing == null ? "" : existing);
    const add = String(incoming == null ? "" : incoming).trim();
    if (mode === "lock") return cur;
    if (mode === "lockEmpty") return cur.trim() ? cur : add;
    if (mode === "append") return appendTextBlock(cur, add);
    return mergeTextBlock(cur, add);
  }

  // 清单类（所属势力 / 登场人物）：lock 不动；非空锁定只在空的时候填；追加＝只增不减；兼并＝以新名单为准
  function protectListValue(key, existingArr, incomingArr) {
    const mode = protectModeOf(key);
    const cur = Array.from(existingArr || []);
    const incoming = Array.from(incomingArr || []).filter(Boolean);
    if (mode === "lock") return cur;
    if (mode === "lockEmpty") return cur.length ? cur : incoming;
    if (mode === "append") {
      const set = new Set(cur);
      incoming.forEach((x) => set.add(x));
      return Array.from(set);
    }
    return incoming.length ? incoming : cur; // 兼并＝以新名单为准（可能删掉旧的）
  }

  // 雷达图数值：0 不算空；lock 不动，非空锁定只补空着的顶点，兼并＝直接用新数值覆盖
  function protectRadarValues(existing, incoming) {
    return protectRadarValuesWith(existing, incoming, "char:radar");
  }
  function protectRadarValuesWith(existing, incoming, key) {
    const mode = protectModeOf(key);
    const cur = Object.assign({}, existing || {});
    const add = Object.assign({}, incoming || {});
    if (mode === "lock") return cur;
    if (mode === "lockEmpty") {
      Object.keys(add).forEach((k) => {
        if (cur[k] == null || cur[k] === "") cur[k] = add[k];
      });
      return cur;
    }
    return Object.assign(cur, add);
  }

  /* ================= 设置界面自己的撤销 / 恢复 =================
     记的是「设置面板里的改动」：全局字段草稿（增 / 删 / 改名 / 排序 / 恢复默认 / 生效），
     以及设置期间对 state 的改动（分组、线路、设定类别、雷达图……）。
     每一步存的是「改动之前」的样子，最多 10 步。 */
  function settingsDraftCopy() {
    return {
      char: fieldsetDraft.char ? deepCopyData(fieldsetDraft.char) : null,
      event: fieldsetDraft.event ? deepCopyData(fieldsetDraft.event) : null,
      entry: deepCopyData(fieldsetDraft.entry || {}),
    };
  }

  function makeSettingsUndoSnap(label, beforeState, draftOverride, undoLen) {
    return {
      label: label || "修改设置",
      state: beforeState || deepCopyData(state),
      draft: draftOverride || settingsDraftCopy(),
      entryScope: fieldsetEntryScope,
      undoLen: typeof undoLen === "number" ? undoLen : undoStack.length,
      // 事务基线（点「生效」会把它往前挪，撤销时一起退回去）
      baseline: settingsSnapshot ? settingsSnapshot.state : null,
      autoSave: Object.assign({}, autoSaveOpts),
      fillOpts: Object.assign({}, fillOpts),
    };
  }

  // 记一步「改动之前」的现场；必须在真正改数据之前调用
  function pushSettingsUndo(label, draftOverride, beforeState, undoLen) {
    if (!settingsModalOpen) return;
    const snap = makeSettingsUndoSnap(label, beforeState, draftOverride, undoLen);
    settingsUndoStack.push({ label: snap.label, snap });
    if (settingsUndoStack.length > SETTINGS_UNDO_LIMIT) settingsUndoStack.shift();
    settingsRedoStack = [];
    updateSettingsUndoButtons();
  }

  function restoreSettingsSnap(snap) {
    if (!snap) return;
    applySnapshot(snap.state);
    fieldsetDraft.char = snap.draft.char ? deepCopyData(snap.draft.char) : null;
    fieldsetDraft.event = snap.draft.event ? deepCopyData(snap.draft.event) : null;
    fieldsetDraft.entry = deepCopyData(snap.draft.entry || {});
    fieldsetEntryScope = snap.entryScope;
    autoSaveOpts = Object.assign({}, snap.autoSave);
    fillOpts = Object.assign({}, snap.fillOpts);
    if (settingsSnapshot) settingsSnapshot.state = snap.baseline;
    // 这次打开设置期间，比它更晚的全局撤销步骤已经没意义了
    if (undoStack.length > snap.undoLen) undoStack.length = snap.undoLen;
    redoStack = [];
    lastSnapObj = deepCopyData(state);
    lastFingerprint = dataFingerprint();
    persistOnly();
    renderAll();
    renderActiveSettingsPane();
    updateUndoButtons();
    updateSettingsUndoButtons();
  }

  function settingsUndoStep() {
    if (!settingsUndoStack.length) return false;
    const entry = settingsUndoStack.pop();
    // 先把「当前」存进恢复栈，再退回去
    settingsRedoStack.push({ label: entry.label, snap: makeSettingsUndoSnap(entry.label, null, null, undoStack.length) });
    restoreSettingsSnap(entry.snap);
    showToast("已撤销：" + uiTrans(entry.label));
    return true;
  }

  function settingsRedoStep() {
    if (!settingsRedoStack.length) return false;
    const entry = settingsRedoStack.pop();
    settingsUndoStack.push({ label: entry.label, snap: makeSettingsUndoSnap(entry.label, null, null, undoStack.length) });
    if (settingsUndoStack.length > SETTINGS_UNDO_LIMIT) settingsUndoStack.shift();
    restoreSettingsSnap(entry.snap);
    showToast("已恢复：" + uiTrans(entry.label));
    return true;
  }

  function updateSettingsUndoButtons() {
    const can = settingsUndoStack.length > 0;
    const last = can ? settingsUndoStack[settingsUndoStack.length - 1].label : "";
    $$(".js-set-undo").forEach((b) => {
      b.disabled = !can;
      b.title = can ? `撤销：${uiTrans(last)}（Ctrl+Z）` : "没有可撤销的设置改动（Ctrl+Z）";
    });
  }

