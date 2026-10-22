  /* ================= 弹窗：人物 ================= */
  /* ---- 人物自定义字段：想加什么加什么（武器 / 口头禅 / 生日…） ---- */
  function renderCharFields(fields) {
    const box = $("#c-fields");
    if (!box) return;
    // 设置里加的全局字段不在这里显示（它们已经排进字段区了）
    const globalLabels = globalCustomLabels("char");
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
    bindCharFieldRows(box);
  }

  function bindCharFieldRows(box) {
    box.querySelectorAll(".ef-del").forEach((b) =>
      b.addEventListener("click", () => {
        b.closest(".entry-field-row").remove();
        if (!box.querySelector(".entry-field-row")) renderCharFields([]);
      })
    );
  }

  function addCharFieldRow() {
    const box = $("#c-fields");
    if (!box) return;
    const tip = box.querySelector(".empty-tip");
    if (tip) tip.remove();
    const row = document.createElement("div");
    row.className = "entry-field-row";
    row.innerHTML = `<input type="text" class="ef-label" placeholder="字段名" value="" />
      <textarea class="ef-value" rows="1" placeholder="内容"></textarea>
      <button type="button" class="icon-btn ef-del" title="删除这个字段">×</button>`;
    box.appendChild(row);
    bindCharFieldRows(box);
    const input = row.querySelector(".ef-label");
    if (input) input.focus();
  }

  function collectCharFields() {
    return $$("#c-fields .entry-field-row")
      .map((row) => {
        const l = row.querySelector(".ef-label");
        const v = row.querySelector(".ef-value");
        return { label: l ? l.value.trim() : "", value: v ? v.value.trim() : "" };
      })
      .filter((f) => f.label || f.value);
  }

  function openCharacterModal(id) {
    const c = id ? getChar(id) : null;
    const fromChainJump = pendingChainScroll != null;
    // 不是从选项卡切过来的，就按这次点开的卡重排选项卡（切卡时保持原样）
    if (!fromChainJump) chainTabAnchorId = c ? c.id : "";
    applyFieldSchemaToEditor("char");
    $("#char-modal-title").textContent = c ? "人物信息" : "新建人物";
    $("#char-id").value = c ? c.id : "";
    $("#c-name").value = c ? c.name : "";
    $("#c-aliases").value = c && c.aliases && c.aliases.length ? c.aliases.join(", ") : "";
    $("#c-gender").value = c ? c.gender || "" : "";
    $("#c-age").value = c ? c.age || "" : "";
    $("#c-role").value = c ? c.role || "" : "";
    $("#c-appearance").value = c ? c.appearance || "" : "";
    portraitDraft = c ? c.portrait || "" : "";
    renderPortraitField();
    setCharImageFolded(!portraitDraft); // 有图才默认展开
    setPortraitPanel(false);
    $("#c-personality").value = c ? c.personality || "" : "";
    $("#c-background").value = c ? c.background || "" : "";
    $("#c-goal").value = c ? c.goal || "" : "";
    $("#c-relationships").value = c ? c.relationships || "" : "";
    $("#c-notes").value = c ? c.notes || "" : "";
    $("#char-delete-btn").hidden = !c;
    charColor = c ? c.color || CHAR_COLORS[0] : CHAR_COLORS[0];
    renderGroupSelect(c ? c.groupId || "" : "");
    renderCharFactionPool(c ? c.factionIds || [] : [], { reset: true }); // 换人＝展开状态重新铺
    setFactionPoolFold(true); // 「所属势力」默认折叠，标题上直接显示已选势力
    renderCharFields(c ? c.fields || [] : []);
    radarCompareIds = new Set(c ? [c.id] : []); // 每次打开：默认只勾选自己
    renderRadarInputs(c);
    setFieldsFolded("char", fieldsFolded.char); // 记住上次的折叠状态
    fillGlobalCustomFieldValues("char", c); // 展开时会重建字段块，所以放在折叠状态处理之后
    makePicker("c-color", CHAR_COLORS, () => charColor, (v) => (charColor = v));
    renderCharChainSlots(c);
    openModal("char-modal");
    // 从人物链的选项卡切过来的：把滚动位置带过去（不然会跳回顶部）
    if (pendingChainScroll != null) {
      const body = document.querySelector("#char-modal .modal-body");
      const keep = pendingChainScroll;
      pendingChainScroll = null;
      if (body) {
        body.scrollTop = keep;
        requestAnimationFrame(() => {
          body.scrollTop = keep;
        });
      }
    }
    // 从链上切过来的不抢焦点（抢焦点会把表单滚回顶部，看着像跳一下）
    if (!fromChainJump) setTimeout(() => $("#c-name").focus(), 50);
  }

  /* 人物链的「插卡」条：打开链上任一张卡都会出现，点别的卡就切过去。
     每张卡右上角的小 × 是「从链里摘掉」，末尾的 ＋ 可以把另一个已有人物加进来。 */
  let pendingChainJump = "";
  let pendingChainScroll = null; // 切卡时把表单的滚动位置带过去，避免「跳一下」
  // 打开人物信息时点开的是哪张卡：它的选项卡排最左边，在弹窗里切卡也不改顺序
  let chainTabAnchorId = "";
  function renderCharChainSlots(c) {
    const box = $("#c-chain-slots");
    if (!box) return;
    const chain = c ? chainOfChar(c.id) : null;
    const members = chainMembersOf(chain);
    if (!c || !chain || members.length < 2) {
      // 还没进任何人物链：也放同一个回形针，点它就能把这张卡并进一条链
      if (c) {
        box.hidden = false;
        box.style.removeProperty("--chain-color");
        box.innerHTML = `<button type="button" class="chain-tabs-label" id="c-chain-add" title="${esc(
          uiTextFor("点一下把这张卡并进一条人物链")
        )}">${chainClipSvg(12)}</button>`;
        const soloBtn = box.querySelector("#c-chain-add");
        if (soloBtn)
          soloBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openChainAddPop(soloBtn, null, c);
          });
        return;
      }
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const color = chain.color || CHAR_COLORS[0];
    // 排最左边的是「打开人物信息时点开的那张卡」；在这个弹窗里切来切去都不改顺序
    const anchor = members.some((m) => m.id === chainTabAnchorId) ? chainTabAnchorId : c && c.id;
    const order = members.filter((m) => m.id === anchor).concat(members.filter((m) => m.id !== anchor));
    box.hidden = false;
    box.style.setProperty("--chain-color", color);
    box.innerHTML =
      order
        .map((m) => {
          const isCur = c && m.id === c.id;
          return `<span class="chain-tab${isCur ? " current" : ""}" data-chain-jump="${esc(m.id)}" title="${esc(
            isCur ? uiTextFor("就是当前这张卡") : uiTextFor("点一下切到这张卡")
          )}"><span class="chain-tab-name">${esc(m.name || uiTextFor("未命名"))}</span>${
            isCur
              ? // 当前这张不给「摘掉自己」的入口（× 是绝对定位的，少一个也不影响别的卡宽度）
                ""
              : `<button type="button" class="chain-tab-x" data-chain-unlink="${esc(
                  m.id
                )}" title="${esc(uiTextFor("把这张卡从人物链里摘掉"))}">×</button>`
          }</span>`;
        })
        .join("") +
      // 回形针放在最右边：既是这条人物链的记号，也是「把人并进来」的入口
      `<button type="button" class="chain-tabs-label" id="c-chain-add" title="${esc(
        uiTextFor("点一下把人并进这条人物链")
      )}">${chainClipSvg(12)}</button>`;
    box.querySelectorAll("[data-chain-jump]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest("[data-chain-unlink]") : null;
        if (btn) return; // × 由下面单独处理
        const id = el.dataset.chainJump;
        if (!id || id === ($("#char-id").value || "")) return;
        jumpToChainCard(id);
      });
    });
    box.querySelectorAll("[data-chain-unlink]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.chainUnlink;
        const m = getChar(id);
        if (!m) return;
        pendingUndoLabel = `人物链：摘掉「${m.name}」`;
        unlinkCharsFromChain([id]);
        saveState();
        renderCharacters();
        renderCharChainSlots(getChar($("#char-id").value));
        renderRelations(); // 「链接」关系跟着变
        showToast(uiTextFor("已把这张卡从人物链里摘掉（可撤销）"));
      });
    });
    const addBtn = box.querySelector("#c-chain-add");
    if (addBtn)
      addBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openChainAddPop(addBtn, chain, c);
      });
  }

  /* 点回形针：在它右下角展开「输入框 + 人名候选」。
     输入即匹配搜索（候选里不列已经在这条链里的人），回车并进这条链，Esc 收起。 */
  let chainAddPopEl = null;
  let chainAddPlace = null;
  let chainAddCurId = ""; // 这个弹层是给哪张卡开的（并人的时候以它为准）
  function chainAddOutside(ev) {
    if (!chainAddPopEl) return;
    const t = ev.target;
    if (chainAddPopEl.contains(t)) return;
    // 人名候选框挂在 body 上（不是弹层里），点它不算「点外面」：
    // 否则按下鼠标就会先收掉弹层、把「当前这张卡」清空，接着的选中就会报「已在这条链中」
    if (t && t.closest && t.closest(".rel-char-pop")) return;
    const btn = document.getElementById("c-chain-add");
    if (btn && btn.contains(t)) return;
    closeChainAddPop();
  }
  function chainAddKey(ev) {
    if (ev.key === "Escape" && chainAddPopEl) {
      ev.preventDefault();
      ev.stopPropagation();
      closeChainAddPop();
    }
  }
  function closeChainAddPop() {
    if (!chainAddPopEl) return;
    chainAddPopEl.remove();
    chainAddPopEl = null;
    chainAddPlace = null;
    chainAddCurId = "";
    document.removeEventListener("mousedown", chainAddOutside, true);
    document.removeEventListener("keydown", chainAddKey, true);
  }
  uiOnZoomReflow(() => {
    if (chainAddPlace) chainAddPlace();
  });
  function openChainAddPop(btn, chain, curChar) {
    if (!btn || !curChar) return;
    if (chainAddPopEl && chainAddCurId === curChar.id) {
      closeChainAddPop(); // 再点一下＝收起
      return;
    }
    closeChainAddPop();
    const pop = document.createElement("div");
    pop.className = "chain-add-pop";
    pop.innerHTML = `<input type="text" class="chain-add-input" placeholder="${esc(
      uiTextFor("输入人名，回车并进这条链")
    )}" />`;
    document.body.appendChild(pop);
    chainAddPopEl = pop;
    // 闭包里用局部变量：模块级的 chainAddCurId 可能被「点外面」之类收弹层时清掉
    const curId = curChar.id;
    chainAddCurId = curId;
    // 贴在回形针的右下角
    const place = () => {
      const r = uiVisualRect(btn);
      const w = Math.round(uiVisualRect(pop).width) || 210;
      // 视觉坐标 → 元素坐标系（缩放时别被放大第二次）
      pop.style.left = uiZoomPx(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)));
      pop.style.top = uiZoomPx(r.bottom + 5);
    };
    chainAddPlace = place;
    place();
    document.addEventListener("mousedown", chainAddOutside, true);
    document.addEventListener("keydown", chainAddKey, true);
    const input = pop.querySelector(".chain-add-input");
    const submit = (name) => {
      const txt = String(name == null ? "" : name).trim();
      // 候选是从全部人名里挑的，所以先按「名字一字不差」找（「路人」这类宽泛名也不会被过滤掉），
      // 找不到再退回按简称 / 别名模糊匹配
      const who = txt
        ? (state.characters || []).find((c) => String(c.name || "").trim() === txt) || findCharacterByName(txt, [])
        : null;
      if (!who) {
        showToast(uiTextFor("没找到这个人"));
        return;
      }
      const res = chainAddFromCard(curId, who.id);
      if (!res.ok) {
        showToast(uiTextFor("这个人已经在这条人物链里了"));
        return;
      }
      const moved = getChar(res.movedId) || who;
      closeChainAddPop();
      pendingUndoLabel = `人物链：并入「${moved.name || who.name}」`;
      saveState();
      renderCharacters();
      renderMatrix();
      renderStats();
      renderRelations(); // 链变了 → 「链接」关系跟着变
      renderCharChainSlots(getChar($("#char-id").value));
      showToast(uiSentence("chainAdded", moved.name || who.name || "", res.count));
    };
    // 候选里不列已经和这张卡同链的人（他们没什么可加的了）
    const exclude = chainMembersOf(chainOfChar(curChar.id))
      .map((m) => m.name)
      .filter(Boolean);
    exclude.push(String(curChar.name || "").trim()); // 自己也不用列
    bindRelCharCombo(input, (name) => {
      input.__picked = true; // 免得下面那个 Enter 又提交一次
      submit(name);
    }, { fixed: true, excludeNames: exclude });
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      ev.stopPropagation();
      if (input.__picked) {
        input.__picked = false;
        return;
      }
      submit(input.value); // 候选框没开（名字已经打全）时也认回车
    });
    input.focus();
  }
  // 切到链上另一张卡：当前这张先按正常保存逻辑存下来（不关窗），再切过去
  function jumpToChainCard(id) {
    if (!getChar(id)) return;
    const name = ($("#c-name").value || "").trim();
    if (!name) {
      uiAlert(uiTextFor("当前这张卡的姓名是空的，先填上再切换。"));
      return;
    }
    pendingChainJump = id;
    saveKeepOpen = false;
    // 记住当前表单滚到哪了：切过去以后恢复，不然内容会跳回顶部
    const body = document.querySelector("#char-modal .modal-body");
    pendingChainScroll = body ? body.scrollTop : null;
    const form = $("#char-form");
    if (form && typeof form.requestSubmit === "function") form.requestSubmit();
    else openCharacterModal(id);
  }
  function renderGroupSelect(selected) {
    const sel = $("#c-group");
    sel.innerHTML = charGroupOptionsHtml();
    sel.value = selected || "";
  }

  // 人物弹窗里的「人设图片」区域
  function renderPortraitField() {
    const img = $("#c-portrait-img");
    const uploadBtn = $("#c-portrait-upload");
    const del = $("#c-portrait-remove");
    const tip = $("#c-portrait-tip");
    const has = !!portraitDraft;
    if (img) {
      img.src = has ? portraitDraft : "";
      img.hidden = !has;
    }
    if (uploadBtn) uploadBtn.hidden = has;
    if (del) del.hidden = !has;
    if (tip) {
      tip.textContent = has ? "已设置人设图，可以更新或删除" : "还没有人设图，点下面的按钮上传一张";
      tip.hidden = has;
    }
    // 顶部那一栏里的小方框：直接显示缩略图（图片本身就是「更新图片」按钮）
    const thumb = $("#c-image-thumb");
    const plus = $("#c-image-plus");
    const box = $("#c-image-box");
    const delSmall = $("#c-image-del");
    if (thumb) {
      thumb.src = has ? portraitDraft : "";
      thumb.hidden = !has;
    }
    if (plus) plus.hidden = has;
    if (box) {
      box.title = has ? "点击更换这张人设图" : "点击上传一张人设图";
      box.classList.toggle("has-image", has);
    }
    if (delSmall) delSmall.hidden = !has;
  }

  // 人设图这一栏的横向折叠：没图时默认折起来，有图才默认展开
  let charImageFolded = true;

  /* ---- 人物 / 事件编辑界面：一键折叠全部字段（含设置里的全局字段、卡片级自定义字段） ---- */
  const FIELDS_FOLD_KEYS = {
    char: "fiction_gui_char_fields_fold_v1",
    event: "fiction_gui_event_fields_fold_v1",
  };
  const fieldsFolded = { char: false, event: false };
  try {
    fieldsFolded.char = localStorage.getItem(FIELDS_FOLD_KEYS.char) === "1";
    fieldsFolded.event = localStorage.getItem(FIELDS_FOLD_KEYS.event) === "1";
  } catch (e) {}

  const FIELDS_FOLD_SPEC = {
    char: {
      form: "#char-form",
      head: "#c-fields-head",
      // 从第一条未锁定字段往后，整块收起来
      blocks: ["#c-appearance", "#c-personality", "#c-background", "#c-goal", "#c-relationships", "#c-notes", "#c-fields"],
      inputs: [
        "#c-gender",
        "#c-age",
        "#c-role",
        "#c-appearance",
        "#c-personality",
        "#c-background",
        "#c-goal",
        "#c-relationships",
        "#c-notes",
      ],
      bar: "#c-fields-collapsed",
      foldBtn: "#c-fields-fold",
      keep: "#c-radar-field", // 雷达图不跟着折
    },
    event: {
      form: "#event-form",
      head: "#e-fields-head",
      blocks: ["#e-cause", "#e-process", "#e-result", "#e-notes", "#e-fields"],
      inputs: ["#e-cause", "#e-process", "#e-result", "#e-notes"],
      bar: "#e-fields-collapsed",
      foldBtn: "#e-fields-fold",
      keep: "",
    },
  };

  function fieldsFoldBlocks(kind) {
    const spec = FIELDS_FOLD_SPEC[kind];
    if (!spec) return [];
    const out = [];
    const head = $(spec.head);
    if (head) out.push(head);
    spec.blocks.forEach((sel) => {
      const el = $(sel);
      const block = el && el.closest ? el.closest(".field") : null;
      if (block) out.push(block);
    });
    // 设置里加的全局字段也跟内置字段一起收起来
    const form = $(spec.form);
    if (form) form.querySelectorAll(".field[data-gfield]").forEach((el) => out.push(el));
    return out;
  }

  // 三角默认挂在第一条未锁定字段前面；这条字段被作者删掉的话，
  // 就挪到下一个还看得见的未锁定字段（保证总有地方可以折叠）
  function placeFieldsFoldHandle(kind) {
    const spec = FIELDS_FOLD_SPEC[kind];
    if (!spec) return;
    const btn = $(spec.foldBtn);
    if (!btn) return;
    let host = null;
    for (const sel of spec.inputs) {
      const inp = $(sel);
      if (!inp) continue;
      const block = inp.closest(".field");
      if (!block || block.hidden) continue;
      host = block;
      break;
    }
    if (!host) {
      const g = Array.from(document.querySelectorAll(spec.form + " .field[data-gfield]")).find((el) => !el.hidden);
      if (g) host = g;
    }
    if (!host) return;
    const span = host.querySelector(":scope > span") || host.querySelector(":scope > .field-head-row .field-label");
    if (span && btn.parentElement !== span) span.insertBefore(btn, span.firstChild);
  }

  function setFieldsFolded(kind, folded) {
    const spec = FIELDS_FOLD_SPEC[kind];
    if (!spec) return;
    const hide = !!folded;
    fieldsFolded[kind] = hide;
    try {
      localStorage.setItem(FIELDS_FOLD_KEYS[kind], hide ? "1" : "0");
    } catch (e) {}
    fieldsFoldBlocks(kind).forEach((b) => {
      b.hidden = hide;
    });
    // 折叠后只留一行「展开全部字段」
    const bar = $(spec.bar);
    if (bar) bar.hidden = !hide;
    if (spec.keep) {
      const keep = $(spec.keep);
      // 雷达图不跟着字段一起折：设置里开着就照常显示，关着就整块不出现
      if (keep) keep.hidden = kind === "char" ? !radarOn() : false;
    }
    const btn = $(spec.foldBtn);
    if (btn) {
      btn.textContent = hide ? "▶" : "▼";
      btn.title = hide ? "展开全部字段" : "折叠全部字段";
      btn.setAttribute("aria-expanded", hide ? "false" : "true");
    }
    // 展开时按「设置 → 全局字段」重新决定每个字段显示不显示（被删掉的字段继续隐藏）
    if (!hide) {
      applyFieldSchemaToEditor(kind);
      placeFieldsFoldHandle(kind);
    }
  }

  function setCharImageFolded(folded) {
    charImageFolded = !!folded;
    const slot = $("#c-image-field");
    if (slot) slot.classList.toggle("collapsed", charImageFolded);
    const btn = $("#c-image-toggle");
    const title = charImageFolded ? "展开图片" : "折叠图片";
    if (btn) {
      btn.textContent = charImageFolded ? "◀" : "▶";
      btn.title = title;
      btn.setAttribute("aria-expanded", charImageFolded ? "false" : "true");
    }
    const handle = $("#c-image-handle");
    if (handle) {
      handle.title = title;
      handle.classList.toggle("has-text", charImageFolded);
    }
    const text = $("#c-image-handle-text");
    if (text) text.hidden = !charImageFolded;
  }

  // 右侧的人设图片抽屉
  function setPortraitPanel(open) {
    const panel = $("#c-portrait-panel");
    if (panel) panel.hidden = !open;
  }

  /* ---- 上传图片后先裁剪：拖 / 缩放一个固定比例的方形虚线框 ---- */
  let cropState = null;
  /* 刚拖完裁剪框的时间戳：拖的时候指针可能松手在「遮罩」上，
     浏览器会补一个 click 到遮罩 —— 那不是「点空白取消」，别把它当成取消（用户报过）。 */
  let cropDragAt = 0;

  function renderCropBox() {
    if (!cropState) return;
    const box = $("#crop-box");
    if (!box) return;
    const b = cropState.box;
    box.style.left = b.x + "px";
    box.style.top = b.y + "px";
    box.style.width = b.size + "px";
    box.style.height = b.size + "px";
  }

  function cancelCrop() {
    const st = cropState;
    cropState = null;
    closeModal("crop-modal");
    if (st) st.resolve(null);
  }

  function applyCrop() {
    const st = cropState;
    if (!st) return;
    const imgEl = $("#crop-img");
    const boxEl = $("#crop-box");
    if (!imgEl || !boxEl) return;
    // 直接用「裁剪框当前实际位置」和「图片当前实际位置」做换算，
    // 不依赖打开时缓存下来的尺寸，避免缩放 / 布局变化后截错位置。
    const ir = imgEl.getBoundingClientRect();
    const br = boxEl.getBoundingClientRect();
    const scaleX = (imgEl.naturalWidth || 1) / (ir.width || 1);
    const scaleY = (imgEl.naturalHeight || 1) / (ir.height || 1);
    const sx = Math.max(0, Math.round((br.left - ir.left) * scaleX));
    const sy = Math.max(0, Math.round((br.top - ir.top) * scaleY));
    const sw = Math.max(1, Math.round(br.width * scaleX));
    const sh = Math.max(1, Math.round(br.height * scaleY));
    const out = Math.max(1, Math.min(st.limit || 512, Math.min(sw, sh)));
    let url = "";
    try {
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, out, out);
      url = canvas.toDataURL("image/jpeg", 0.85);
    } catch (e) {
      uiAlert("裁剪失败：" + (e && e.message ? e.message : e));
    }
    cropState = null;
    closeModal("crop-modal");
    st.resolve(url || null);
  }

  // 打开裁剪窗口，返回裁剪后的 data URL（取消则返回 null）
  function openCropper(file, limit) {
    return new Promise((resolve) => {
      const imgEl = $("#crop-img");
      if (!imgEl) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        imgEl.onload = () => {
          openModal("crop-modal");
          // 等布局稳定后再量图片尺寸、摆好虚线框
          requestAnimationFrame(() => {
            const r = imgEl.getBoundingClientRect();
            if (!r.width || !r.height) {
              cropState = null;
              closeModal("crop-modal");
              resolve(null);
              return;
            }
            const size = Math.max(24, Math.round(Math.min(r.width, r.height) * 0.8));
            cropState = {
              resolve,
              limit: limit || 512,
              imgRect: { w: r.width, h: r.height },
              box: { x: Math.round((r.width - size) / 2), y: Math.round((r.height - size) / 2), size },
            };
            renderCropBox();
          });
        };
        imgEl.onerror = () => resolve(null);
        imgEl.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // 裁剪框拖动 / 缩放（拖角时始终是正方形）
  function onCropPointerDown(ev) {
    if (!cropState) return;
    const handle = ev.target.closest ? ev.target.closest(".crop-handle") : null;
    const inBox = ev.target.closest ? ev.target.closest("#crop-box") : null;
    if (!inBox) return;
    const mode = handle ? handle.dataset.h : "move";
    const stage = $("#crop-stage");
    const sr = stage.getBoundingClientRect();
    const start = { x: ev.clientX, y: ev.clientY, box: Object.assign({}, cropState.box) };
    const r = cropState.imgRect;
    const move = (e) => {
      const b = start.box;
      if (mode === "move") {
        const nx = Math.max(0, Math.min(r.w - b.size, b.x + (e.clientX - start.x)));
        const ny = Math.max(0, Math.min(r.h - b.size, b.y + (e.clientY - start.y)));
        cropState.box = { x: Math.round(nx), y: Math.round(ny), size: b.size };
      } else {
        const east = mode.indexOf("e") >= 0;
        const south = mode.indexOf("s") >= 0;
        const ax = east ? b.x : b.x + b.size; // 不动的那个角
        const ay = south ? b.y : b.y + b.size;
        const px = e.clientX - sr.left;
        const py = e.clientY - sr.top;
        let size = Math.max(24, Math.abs(px - ax), Math.abs(py - ay));
        size = Math.min(size, east ? r.w - ax : ax, south ? r.h - ay : ay);
        cropState.box = {
          x: Math.round(east ? ax : ax - size),
          y: Math.round(south ? ay : ay - size),
          size: Math.round(size),
        };
      }
      renderCropBox();
      e.preventDefault();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      cropDragAt = Date.now();
      /* 拖的中途如果弹窗被别的路径关掉了（遮罩 mousedown / Esc 之类）：
         这里收个尾，把 promise 结掉，别让它一直悬着。 */
      const m = $("#crop-modal");
      if (cropState && m && m.hidden) cancelCrop();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    ev.preventDefault();
    ev.stopPropagation();
  }

  // 把用户选的图片压到指定尺寸内，避免撑爆本地存储
  function submitCharacterForm(e) {
    e.preventDefault();
    const id = $("#char-id").value;
    const name = $("#c-name").value.trim();
    if (!name) return;
    pendingUndoLabel = (id ? "修改人物：" : "新建人物：") + "「" + name + "」";
    const data = {
      name,
      color: charColor,
      aliases: parseTags($("#c-aliases").value).filter((a) => normTitle(a) !== normTitle(name)),
      gender: $("#c-gender").value.trim(),
      age: $("#c-age").value.trim(),
      role: $("#c-role").value.trim(),
      groupId: $("#c-group").value,
      appearance: $("#c-appearance").value.trim(),
      personality: $("#c-personality").value.trim(),
      background: $("#c-background").value.trim(),
      goal: $("#c-goal").value.trim(),
      relationships: $("#c-relationships").value.trim(),
      notes: $("#c-notes").value.trim(),
      fields: collectGlobalCustomFieldValues("char").concat(collectCharFields()),
      portrait: portraitDraft || "",
      factionIds: Array.from(charFactionSel),
    };
    /* 雷达图：勾上了才写回数值；没勾（或全局禁用）就保留原有数值不动，
       只把勾选状态记下来 —— 勾回来数值还在。 */
    if (radarOn()) {
      const radarCb = $("#c-radar-on");
      const radarShown = !!(radarCb && radarCb.checked);
      data.radarOn = radarShown;
      if (radarShown) data.radar = radarValuesFromInputs();
    }
    let charId = id;
    if (id) {
      Object.assign(getChar(id), data);
    } else {
      const created = Object.assign({ id: uid() }, data);
      state.characters.push(created);
      charId = created.id;
    }
    // 双向同步：把这些势力条目的「关联人物」也更新上
    factionEntries().forEach((en) => {
      const ids = new Set(en.characterIds || []);
      if (data.factionIds.includes(en.id)) ids.add(charId);
      else ids.delete(charId);
      en.characterIds = Array.from(ids);
    });
    saveState();
    // 势力归属在这一步同步过：卡片（关联人物圈圈）、边栏、势力分析表、出场统计一起重画
    refreshFactionViews();
    renderTimeline();
    renderMatrix();
    // 人物分析那一栏的候选列表也要跟着刷新（否则新加的人 / 改过的分组在那边看不到）
    if (!viewHidden("view-relations")) renderRelations();
    /* 系谱里那个对象的名字 / 颜色 / 人设图也要跟着变 */
    if (!viewHidden("view-pedigree")) renderPedigree();
    syncSavedId("char-modal", charId);
    // 从人物链的插卡条切过来的：存完这张卡就切到目标卡（弹窗不关）
    const jumpId = pendingChainJump;
    pendingChainJump = "";
    if (jumpId && jumpId !== charId && getChar(jumpId)) {
      openCharacterModal(jumpId);
      return;
    }
    finishCardSave("char-modal");
  }

  async function deleteCharacter() {
    const id = $("#char-id").value;
    if (!id) return;
    const delChar = getChar(id);
    // 人物卡片不弹二次确认
    pendingUndoLabel = `删除人物：「${delChar ? delChar.name : ""}」`;
    state.characters = state.characters.filter((c) => c.id !== id);
    state.relations = (state.relations || []).filter((r) => r.fromId !== id && r.toId !== id);
    state.events.forEach((ev) => (ev.characterIds = (ev.characterIds || []).filter((cid) => cid !== id)));
    state.settings.entries.forEach((en) => (en.characterIds = (en.characterIds || []).filter((cid) => cid !== id)));
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    if (!viewHidden("view-relations")) renderRelations(); // 人物分析那栏里的候选要去掉这个人
    if (!viewHidden("view-pedigree")) renderPedigree(); // 系谱：对象清掉、结合线清掉、子卡按规则处理
    closeModal("char-modal");
  }

