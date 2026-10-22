  /* ================= 弹窗：线路 ================= */
  // opts.afterId：新建时把这条线路插到指定线路的右邻（事件轴线路卡右键「新建线路」用）
  function openLineModal(id, opts) {
    lineInsertAfterId = !id && opts && opts.afterId ? opts.afterId : "";
    const l = id ? getLine(id) : null;
    $("#line-modal-title").textContent = l ? "编辑线路" : "新建线路";
    $("#l-id").value = l ? l.id : "";
    // 新建时先填一个没被占用的代号（和「设置 → 新建线路」一致），并选中它：
    // 这样直接按 Enter / 点保存就能建，想改代号直接打字替换
    $("#l-code").value = l ? l.code || "" : nextLineCode();
    $("#l-name").value = l ? l.name || "" : "";
    $("#l-kind").value = l ? l.kind : "明线";
    $("#l-note").value = l ? l.note || "" : "";
    $("#line-delete-btn").hidden = !l;
    lineColor = l ? l.color || LINE_COLORS[0] : LINE_COLORS[0];
    makePicker("l-color", LINE_COLORS, () => lineColor, (v) => (lineColor = v));
    renderParentSelect(l ? l.id : null, l ? l.parentId : null);
    toggleParentVisibility();
    openModal("line-modal");
    setTimeout(() => {
      const codeInp = $("#l-code");
      if (!codeInp) return;
      codeInp.focus();
      if (!l) {
        try {
          codeInp.select();
        } catch (e) {
          /* ignore */
        }
      }
    }, 50);
  }

  function renderParentSelect(excludeId, selected) {
    const sel = $("#l-parent");
    const mains = state.lines.filter((l) => l.kind === "明线" && l.id !== excludeId);
    if (!mains.length) {
      sel.innerHTML = `<option value="">（暂时没有可挂靠的明线，会作为独立暗线）</option>`;
      sel.value = "";
      return;
    }
    sel.innerHTML = mains.map((l) => `<option value="${esc(l.id)}">${esc(lineLabel(l))}</option>`).join("");
    if (selected && mains.some((l) => l.id === selected)) sel.value = selected;
    else sel.value = mains[0].id;
  }

  function toggleParentVisibility() {
    // 只有「暗线」才需要选挂在哪条明线下；明线是顶层线路，不挂靠
    const isHidden = $("#l-kind").value !== "暗线";
    $("#l-parent-wrap").hidden = isHidden;
  }

  function submitLineForm(e) {
    e.preventDefault();
    const id = $("#l-id").value;
    const code = $("#l-code").value.trim();
    if (!code) return;
    pendingUndoLabel = (id ? "修改线路：" : "新建线路：") + "「" + code + " " + $("#l-name").value.trim() + "」";
    const kind = $("#l-kind").value;
    const data = {
      code,
      name: $("#l-name").value.trim(),
      kind,
      parentId: kind === "暗线" ? $("#l-parent").value || null : null,
      color: lineColor,
      note: $("#l-note").value.trim(),
    };
    let targetId = id;
    if (id) Object.assign(getLine(id), data);
    else {
      const created = Object.assign({ id: uid() }, data);
      // 从事件轴某条线路卡的右键菜单新建时，插到那条线路的右邻，而不是一律加到最右边
      const at = lineInsertAfterId ? state.lines.findIndex((l) => l.id === lineInsertAfterId) : -1;
      if (at >= 0) state.lines.splice(at + 1, 0, created);
      else state.lines.push(created);
      lineInsertAfterId = "";
      targetId = created.id;
    }
    saveState();
    refreshLineViews();
    syncSavedId("line-modal", targetId);
    finishCardSave("line-modal");
    // 让人一眼看到新线路：滚动到那一列并闪一下（事件轴 + 时间线）
    flashLane(targetId);
    showToast(id ? `已更新线路「${code}」` : `已新建线路「${code} ${data.name}」，事件轴和时间线都多了一列`);
  }

  async function deleteLine() {
    const id = $("#l-id").value;
    if (!id) return;
    deleteLineById(id);
    closeModal("line-modal");
  }

  // 真正删线路的动作（弹窗里的「删除线路」和右键菜单的「删除」都走这里）
  function deleteLineById(id) {
    if (!id) return false;
    const line = state.lines.find((l) => l.id === id);
    if (!line) return false;
    // 线路属于设定类的东西：不弹二次确认，删完可以用「撤销」还原
    pendingUndoLabel = `删除线路：「${line ? lineLabel(line) : ""}」`;
    state.events.forEach((e) => {
      e.lineIds = linesOf(e).filter((x) => x !== id);
      delete e.lineId;
    });
    state.lines.forEach((l) => {
      if (l.parentId === id) l.parentId = null;
    });
    state.lines = state.lines.filter((l) => l.id !== id);
    ensureData();
    lineFilterDropMissing(); // 筛选里如果正选着这条线路，删完要一起清掉，别让界面变成空白
    saveState();
    refreshLineViews();
    showToast(`已删除线路「${line ? lineLabel(line) : ""}」（只属于它的事件已转到第一条线路，可撤销）`);
    return true;
  }

  /* ================= 弹窗：类别 ================= */
  function openCatModal(id) {
    const cat = id ? getCat(id) : null;
    if (catIsLocked(cat)) {
      showToast(catLockTip(cat));
      return;
    }
    $("#cat-modal-title").textContent = cat ? "编辑类别" : "新建类别";
    $("#cat-id").value = cat ? cat.id : "";
    $("#cat-icon").value = cat ? cat.icon || "" : "";
    // 显示用：程序自带的类别名（物品 / 装备…）跟着界面语言；用户改过的名字原样
    $("#cat-name").value = cat ? catDisplayName(cat) : "";
    $("#cat-fields").value = cat && cat.fieldTemplate ? cat.fieldTemplate.join("\n") : "";
    $("#cat-delete-btn").hidden = !cat;
    // 类别不再让用户挑颜色（没用），新类别按下标轮一个默认色
    catColor = cat ? cat.color || CAT_COLORS[0] : CAT_COLORS[(state.settings.categories || []).length % CAT_COLORS.length];
    makePicker("cat-color", CAT_COLORS, () => catColor, (v) => (catColor = v));
    bindCatModalAddons(); // 弹窗里的「追加功能：雷达图 / 树型拓扑」（和设置里同一套）
    syncCatModalAddons(cat);
    openModal("cat-modal");
    setTimeout(() => $("#cat-name").focus(), 50);
  }

  function submitCatForm(e) {
    e.preventDefault();
    const id = $("#cat-id").value;
    if (id && catIsLocked(getCat(id))) {
      showToast(catLockTip(getCat(id)));
      closeModal("cat-modal");
      return;
    }
    let name = $("#cat-name").value.trim();
    if (!name) return;
    /* 没改过名字就保持存档里那一个（别把「当前语言下的显示名」写回数据：
       那样一来英文界面下点开类别再保存，这个名字就被永久改成英文了）。 */
    const curCat = id ? getCat(id) : null;
    if (curCat && name === catDisplayName(curCat)) name = String(curCat.name || "");
    pendingUndoLabel = (id ? "修改设定类别：" : "新建设定类别：") + "「" + name + "」";
    const fieldTemplate = $("#cat-fields").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const data = { name, icon: $("#cat-icon").value.trim(), color: catColor, fieldTemplate };
    let catId = id;
    if (id) Object.assign(getCat(id), data);
    else {
      catId = uid();
      state.settings.categories.push(Object.assign({ id: catId }, data));
    }
    normalizeCatOrder();
    saveState();
    applyCatModalAddons(getCat(catId)); // 追加功能（雷达图 / 树型拓扑）写回这一类
    saveState();
    renderCategories();
    renderEntries();
    // 类别（含字段模板）改了：设置里的「输入保护」也当场跟着增减
    renderFillProtect();
    syncSavedId("cat-modal", catId);
    finishCardSave("cat-modal");
  }

  /* ================= 弹窗：条目 ================= */
  function openEntryModal(id) {
    const en = id ? getEntry(id) : null;
    // 编辑时按「这条自己的类别」取（从地图 / 势力分析跳进来时，当前选中的类别可能不是它）
    const cat = getCat(en ? en.categoryId : selectedCategoryId);
    const catName = cat ? catDisplayName(cat) : "";
    // 抬头：新建＝「新建：纪年」，编辑＝「纪年信息」（按类别叫）
    $("#entry-modal-title").textContent = en
      ? catName
        ? uiSentence("entryInfo", catName)
        : uiTextFor("编辑条目")
      : catName
        ? `新建：${catName}`
        : uiTextFor("新建");
    $("#entry-id").value = en ? en.id : "";
    $("#entry-cat").value = en ? en.categoryId : selectedCategoryId || "";
    $("#en-name").value = en ? en.name : "";
    $("#en-summary").value = en ? en.summary || "" : "";
    $("#en-tags").value = en ? (en.tags || []).join(", ") : "";
    $("#entry-delete-btn").hidden = !en;
    const toCharBtn = $("#entry-to-char-btn");
    if (toCharBtn) toCharBtn.hidden = !(en && (en.tags || []).includes("由人物转入"));

    let fields = en ? en.fields || [] : [];
    if (!en && cat && cat.fieldTemplate && cat.fieldTemplate.length) {
      fields = cat.fieldTemplate.map((label) => ({ label, value: "" }));
    }
    renderEntryFields(fields);
      /* 势力层级：「所属」（只对势力类别显示）—— 空 = 一级 */
      const isFactionCat = !!cat && catKind(cat) === "faction";
      const parentField = $("#entry-parent-field");
      if (parentField) parentField.hidden = !isFactionCat;
      const parentInput = $("#en-parent");
      if (parentInput) {
        parentInput.value =
          isFactionCat && en && en.parentId ? factionPathOf(factionEntryById(en.parentId)) : "";
        /* 候选每次现算（打开另一条时要跟着换）：分级显示 —— 先列一级，输入/选中哪条就把它的
           子级缩进着接着列；再带上「无（一级势力）」这一项。 */
        uiAttachSuggest(parentInput, () => {
          const list = factionParentPickerOptions($("#entry-id").value || "", parentInput.value);
          return [{ value: "", label: uiTextFor("无") }].concat(
            list.map((o) => ({ value: o.value, label: o.label }))
          );
        });
        /* 「▾」＝级联选择面板（省 / 市 / 区那种）：点哪条就把「所属」设成哪条 */
        const pickBtn = $("#en-parent-pick");
        if (pickBtn && pickBtn.dataset.bound !== "1") {
          pickBtn.dataset.bound = "1";
          pickBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (factionPickPanelOpen()) {
              closeFactionPickPanel(); // 再点一下＝收起
              return;
            }
            const cur = $("#entry-id").value ? factionEntryById($("#entry-id").value) : null;
            openFactionPickPanel({
              anchor: pickBtn,
              maxLevel: 2, // 势力卡的上级最多到二级（挂三级就是四级）
              excludeId: $("#entry-id").value || "", // 不能把自己（或自己的子级）列成上级
              pickedId: cur && cur.parentId ? cur.parentId : "",
              onPick: (id) => {
                const en2 = id ? factionEntryById(id) : null;
                parentInput.value = en2 ? factionPathOf(en2) : "";
              },
            });
          });
        }
      }
    // 图片：「纪年」这类按时间顺序读的类别不提供图片
    const noImage = !!(cat && cat.layout === "list");
    const imgHandle = $("#entry-image-handle");
    if (imgHandle) imgHandle.hidden = noImage;
    entryImageDraft = !noImage && en ? en.image || "" : "";
    renderEntryImageField();
    setEntryImagePanel(false);
    setEntryImageFolded(noImage || !entryImageDraft); // 有图才默认展开
    /* 势力卡：池子里列的是「直接 + 子级」的聚合名单（和卡片显示一致，plan.md 第 28 条）；
       保存时再反推（见 submitEntryForm）。其它类别照旧只看直接关联。 */
    renderCharPool(
      "entry-char-pool",
      isFactionCat && en ? factionMemberIdsOf(en, true) : en ? en.characterIds || [] : [],
      true
    );
    setEntryCharPoolFold(true); // 「关联人物」默认折叠，标题上直接显示已选人物
    renderEventSelect(en ? en.eventIds || [] : []);
    syncEntryTreeRel(en ? en.id : ""); // 树型拓扑：只读地列出上级 / 直接下级（双击打开）
    openModal("entry-modal");
    setTimeout(() => $("#en-name").focus(), 50);
  }

  /* ---- 设定条目的图片（仿照人物的人设图；「纪年」不提供） ---- */
  let entryImageDraft = "";

  function renderEntryImageField() {
    const img = $("#en-image-img");
	    const thumb = $("#en-image-thumb");
	    const plus = $("#en-image-plus");
	    const box = $("#en-image-box");
	    const delSmall = $("#en-image-del");
    const uploadBtn = $("#en-image-upload");
    const del = $("#en-image-remove");
    const tip = $("#en-image-tip");
    const has = !!entryImageDraft;
    if (img) {
      img.src = has ? entryImageDraft : "";
      img.hidden = !has;
    }
	    if (thumb) {
	      thumb.src = has ? entryImageDraft : "";
	      thumb.hidden = !has;
	    }
	    if (plus) plus.hidden = has;
	    if (box) {
	      box.title = has ? "点击更换这张设定图" : "点击上传一张设定图";
	      box.classList.toggle("has-image", has);
	    }
	    if (delSmall) delSmall.hidden = !has;
    if (uploadBtn) uploadBtn.hidden = has;
    if (del) del.hidden = !has;
    if (tip) {
      tip.textContent = has ? "已设置图片，可以更新或删除" : "还没有图片，点下面的按钮上传一张";
      tip.hidden = has;
    }
  }

  function setEntryImagePanel(open) {
    const panel = $("#en-image-panel");
    if (panel) panel.hidden = !open;
  }

  // 图片这一栏的横向折叠：没图时默认折起来，有图才默认展开
  let entryImageFolded = true;

  function setEntryImageFolded(folded) {
    entryImageFolded = !!folded;
    const slot = $("#entry-image-field");
    if (slot) slot.classList.toggle("collapsed", entryImageFolded);
    const btn = $("#en-image-toggle");
    const title = entryImageFolded ? "展开图片" : "折叠图片";
    if (btn) {
      btn.textContent = entryImageFolded ? "◀" : "▶";
      btn.title = title;
      btn.setAttribute("aria-expanded", entryImageFolded ? "false" : "true");
    }
    const handle = $("#entry-image-handle");
    if (handle) {
      handle.title = title;
      handle.classList.toggle("has-text", entryImageFolded); // 只有折起来时才占那点宽度
    }
    // 「展开图片」这几个字只在折叠状态显示
    const text = $("#entry-image-handle-text");
    if (text) text.hidden = !entryImageFolded;
  }

  function renderEntryFields(fields) {
    const box = $("#entry-fields");
    if (!fields.length) fields = [{ label: "", value: "" }];
    box.innerHTML = fields
      .map(
        (f, i) => `<div class="entry-field-row" data-idx="${i}">
          <input type="text" class="ef-label" placeholder="字段名" value="${esc(uiDefaultLabel(f.label))}" />
          <textarea class="ef-value" rows="1" placeholder="内容">${esc(f.value)}</textarea>
          <button type="button" class="icon-btn ef-del" title="删除字段">×</button>
        </div>`
      )
      .join("");
    box.querySelectorAll(".ef-del").forEach((b) =>
      b.addEventListener("click", () => {
        b.closest(".entry-field-row").remove();
        if (!box.querySelector(".entry-field-row")) renderEntryFields([{ label: "", value: "" }]);
      })
    );
  }

  function renderEventSelect(selectedIds) {
    const sel = $("#en-events");
    if (!sel) return; // 条目弹窗里已经不显示「关联事件」了
    const orderIdx = new Map(state.order.map((id, i) => [id, i]));
    const byLine = new Map();
    state.events.forEach((e) => {
      const lid = linesOf(e)[0];
      if (!byLine.has(lid)) byLine.set(lid, []);
      byLine.get(lid).push(e);
    });
    sel.innerHTML = "";
    lineTree().forEach(({ line }) => {
      const evs = byLine.get(line.id) || [];
      if (!evs.length) return;
      evs.sort((a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0));
      const og = document.createElement("optgroup");
      og.label = lineLabel(line);
      evs.forEach((e) => {
        const o = document.createElement("option");
        o.value = e.id;
        o.textContent = e.title;
        o.selected = selectedIds.includes(e.id);
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function submitEntryForm(e) {
    e.preventDefault();
    const id = $("#entry-id").value;
    const name = $("#en-name").value.trim();
    if (!name) return;
    pendingUndoLabel = (id ? "修改设定：" : "新建设定：") + "「" + name + "」";
    const fields = $$("#entry-fields .entry-field-row")
      .map((row) => ({
        label: row.querySelector(".ef-label").value.trim(),
        value: row.querySelector(".ef-value").value.trim(),
      }))
      .filter((f) => f.label || f.value);
      /* 势力卡：池子里显示的是「直接 + 子级」的聚合名单，保存时反推（plan.md 第 28 条）：
         · 新勾上的 → 直接挂到这张卡（进 en.characterIds）；
         · 取消勾选的 → 原来是子级带过来的，就从那些子级势力里移出（人物那边的引用一起清）；
         其它类别照旧：池子里的就是直接关联。 */
      const poolSel = getPoolSelection("entry-char-pool");
      let characterIds = poolSel;
        // 注意：catNow 在下面才声明，这里自己取一下类别，别踩 TDZ
        const editingFaction = !!id && catKind(getCat($("#entry-cat").value)) === "faction";
      if (editingFaction) {
        const self = getEntry(id);
        const beforeAgg = factionMemberIdsOf(self, true);
        const beforeDirect = (self.characterIds || []).slice();
        const selSet = new Set(poolSel);
        const added = poolSel.filter((cid) => beforeAgg.indexOf(cid) < 0);
        const removed = beforeAgg.filter((cid) => !selSet.has(cid));
        characterIds = beforeDirect.filter((cid) => removed.indexOf(cid) < 0);
        added.forEach((cid) => {
          if (characterIds.indexOf(cid) < 0) characterIds.push(cid);
        });
        if (removed.length) {
          factionDescendantsOf(self).forEach((sub) => {
            const list = sub.characterIds || [];
            const next = list.filter((cid) => removed.indexOf(cid) < 0);
            if (next.length === list.length) return;
            sub.characterIds = next;
            (state.characters || []).forEach((c) => {
              if (removed.indexOf(c.id) >= 0 && (c.factionIds || []).indexOf(sub.id) >= 0)
                c.factionIds = (c.factionIds || []).filter((x) => x !== sub.id);
            });
          });
        }
      }
    // 弹窗里已经不显示「关联事件」：保留条目原有的关联，不要因为保存而清空
    const evSel = $("#en-events");
    const eventIds = evSel
      ? $$("#en-events option:checked").map((o) => o.value)
      : id && getEntry(id)
        ? getEntry(id).eventIds || []
        : [];
    const catNow = getCat($("#entry-cat").value);
    const isChronoCat = !!(catNow && catNow.layout === "list");
    const data = {
      categoryId: $("#entry-cat").value,
      name,
      fields,
      summary: $("#en-summary").value.trim(),
      tags: parseTags($("#en-tags").value),
      characterIds,
      eventIds,
      // 「纪年」不存图片
      image: isChronoCat ? "" : entryImageDraft || "",
    };
      const parentInputEl = $("#en-parent");
      const parentText = parentInputEl ? String(parentInputEl.value || "").trim() : "";
      const factionNow = !!catNow && catKind(catNow) === "faction";
      let entryId = id;
      if (id) {
        const beforeEntry = getEntry(id);
        const beforeCat = getCat(beforeEntry.categoryId);
        const wasFaction = catKind(beforeCat) === "faction";
        /* 「势力」换成别的类别：整棵子树跟着走，并把层级压平（plan.md 第 23 条）。
           反过来（别的类别 → 势力）没有层级，parentId 保持空。 */
        if (wasFaction && !factionNow) {
          const subtreeIds = [beforeEntry.id].concat(factionDescendantsOf(beforeEntry).map((x) => x.id));
          const moved = moveEntriesToCategory(subtreeIds, data.categoryId);
          flattenFactionSubtree(moved);
        }
        // 在编辑界面里改了类别，副作用和右键「移动到…」一致（分组 / 雷达图，见 entryCategorySideEffects）
        const before = beforeEntry.categoryId;
        Object.assign(getEntry(id), data);
        entryCategorySideEffects(getEntry(id), before);
      } else {
      entryId = uid();
      state.settings.entries.push(Object.assign({ id: entryId, groupId: "" }, data));
        bumpStateRev(); // 新建后要立刻按 id 取这条（getEntry 走缓存索引，不刷新会取不到）
    }
      /* 「所属」有改动就套上级联（平级移动 / 升级 / 降级；降级超三级的那一代直接删掉，可撤销）。
         输入认不出来的（既不是路径也不是唯一名字）：保留原来的层级，只提示一句。 */
      if (factionNow && parentInputEl) {
        const cur = state.settings.entries.find((x) => x.id === entryId) || null;
        const curPath = cur && cur.parentId ? factionPathOf(factionEntryById(cur.parentId)) : "";
        if (cur && parentText !== curPath) {
          const pick = resolveFactionParentInput(entryId, parentText);
          if (pick.error) {
            showToast(pick.error === "ambiguous" ? "「所属」有好几条同名的势力，请从列表里选完整路径" : "没找到这条势力，「所属」没有改动");
          } else {
            const res = setFactionParent(entryId, pick.id);
            if (res.ok) {
              pendingUndoLabel = res.label;
              if (res.flattened.length)
                showToast(`「${cur.name}」降级后，${res.flattened.length} 个超出三级的势力被压平成三级（可撤销）`);
            }
          }
        }
      }
    // 「势力」条目改关联人物时，反向同步到人物的「所属势力」
    const cat = getCat(data.categoryId);
    if (cat && catKind(cat) === "faction") {
      const enId = entryId;
      const linked = new Set(data.characterIds || []);
      state.characters.forEach((c) => {
        const list = new Set(c.factionIds || []);
        if (linked.has(c.id)) list.add(enId);
        else list.delete(enId);
        c.factionIds = Array.from(list);
      });
    }
    saveState();
    renderCategories();
    refreshFactionViews(); // 改了势力卡的「关联人物」：卡片 / 人物边栏 / 势力分析表一起跟上
    syncSavedId("entry-modal", entryId);
    finishCardSave("entry-modal");
  }

  async function deleteEntry() {
    const id = $("#entry-id").value;
    if (!id) return;
    const en = getEntry(id);
    // 设定条目不弹二次确认
    pendingUndoLabel = `删除设定条目：「${en ? en.name : ""}」`;
    // 势力：子级一起删（plan.md 第 9 条）
    const ids = expandEntryIdsWithFactionDescendants([id]);
    state.settings.entries = state.settings.entries.filter((x) => ids.indexOf(x.id) < 0);
    (state.characters || []).forEach((c) => {
      if ((c.factionIds || []).some((f) => ids.indexOf(f) >= 0))
        c.factionIds = (c.factionIds || []).filter((f) => ids.indexOf(f) < 0);
    });
    saveState();
    renderCategories();
    refreshFactionViews();
    closeModal("entry-modal");
  }

  // 不打开弹窗直接删除某个条目（卡片上的 × / 右键菜单用）
  async function deleteEntryById(id) {
    const en = getEntry(id);
    if (!en) return;
    // 设定条目不弹二次确认
    pendingUndoLabel = `删除设定条目：「${en.name}」`;
    // 势力：子级一起删（plan.md 第 9 条）
    const ids = expandEntryIdsWithFactionDescendants([id]);
    state.settings.entries = state.settings.entries.filter((x) => ids.indexOf(x.id) < 0);
    (state.characters || []).forEach((c) => {
      if ((c.factionIds || []).some((f) => ids.indexOf(f) >= 0))
        c.factionIds = (c.factionIds || []).filter((f) => ids.indexOf(f) < 0);
    });
    saveState();
    renderCategories();
    refreshFactionViews();
    renderEntryBatchBar();
    showToast(`已删除条目「${en.name}」`);
  }

