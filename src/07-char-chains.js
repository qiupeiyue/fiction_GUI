  /* ---- 人物链 ↔ 「链接」关系 ----
     链是源头：一条链里的成员彼此之间都应该有一条「链接」类型的关系（用户可以在上面填关系名称和备注）。
     关系的增删由这里统一维护，所以任何改动之后调一次 syncChainLinkRelations() 就一致了。 */
  function isChainKindName(name) {
    const n = String(name == null ? "" : name);
    if (!n) return false;
    const list = relKindList();
    const hit = list.find((k) => k && (k.name === n || k.canon === n));
    if (hit) return hit.canon === "链接" || hit.name === "链接";
    return n === "链接";
  }
  function chainKindName() {
    return relKindNameOf("链接");
  }
  // 类型被用户在「关系网」里删掉时自动补回来（人物链要靠它记录）
  function ensureChainKind() {
    const list = ensureRelKinds();
    const has = list.some((k) => k && (k.canon === "链接" || k.name === "链接"));
    if (!has) list.push({ name: uiTextFor("链接"), canon: "链接", color: REL_KINDS["链接"], builtin: true });
    return chainKindName();
  }
  function chainPairKey(a, b) {
    const x = String(a || "");
    const y = String(b || "");
    return x <= y ? x + "\u0001" + y : y + "\u0001" + x;
  }
  // 把「链接」关系对齐到人物链（少了补、多了删）。返回改动条数。
  function syncChainLinkRelations() {
    if (!Array.isArray(state.relations) || !Array.isArray(state.charChains)) return 0;
    const kindName = ensureChainKind();
    let changed = 0;
    const want = new Map(); // pairKey → chainId
    charChains().forEach((ch) => {
      const ids = (ch.memberIds || []).filter((id) => getChar(id));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) want.set(chainPairKey(ids[i], ids[j]), ch.id);
      }
    });
    // ① 不再同链的「链接」关系删掉
    const before = state.relations.length;
    state.relations = state.relations.filter((r) => {
      if (!r || !isChainKindName(r.kind)) return true;
      return want.has(chainPairKey(r.fromId, r.toId));
    });
    changed += before - state.relations.length;
    // ② 缺的补上（关系名称 / 备注留空，用户自己填）
    const have = new Set();
    state.relations.forEach((r) => {
      if (r && isChainKindName(r.kind)) have.add(chainPairKey(r.fromId, r.toId));
    });
    want.forEach((chainId, key) => {
      if (have.has(key)) return;
      const parts = key.split("\u0001");
      state.relations.push({ id: uid(), fromId: parts[0], toId: parts[1], label: "", kind: kindName, note: "" });
      changed++;
    });
    return changed;
  }
  function sameChainOf(a, b) {
    const ca = chainOfChar(a);
    if (!ca) return false;
    return !!ca.memberIds.includes(b);
  }
  // 每条链尽量拿一个没被别条链用掉的颜色（多选时一眼能看出哪几张同链）
  function nextChainColor() {
    const used = new Set(charChains().map((ch) => ch && ch.color).filter(Boolean));
    const free = CHAR_COLORS.find((c) => !used.has(c));
    return free || CHAR_COLORS[charChains().length % CHAR_COLORS.length];
  }
  // 成员不足 2 个（被删 / 被合并掉了）的链自动解散
  function pruneCharChains() {
    if (!Array.isArray(state.charChains)) {
      state.charChains = [];
      return;
    }
    const alive = new Set((state.characters || []).map((c) => c.id));
    const out = [];
    const seen = new Set();
    state.charChains.forEach((ch) => {
      if (!ch || !Array.isArray(ch.memberIds)) return;
      const ids = [];
      ch.memberIds.forEach((id) => {
        if (!alive.has(id) || seen.has(id) || ids.includes(id)) return;
        ids.push(id);
        seen.add(id);
      });
      ch.memberIds = ids; // 原地改成员，保持对象引用（别的地方可能正拿着这条链）
      if (ids.length >= 2) out.push(ch);
    });
    if (out.length !== state.charChains.length) state.charChains = out;
    // 链变了 → 「链接」关系跟着对齐（链是源头，关系是它派生出来的）
    syncChainLinkRelations();
  }
  function linkCharsIntoChain(ids) {
    const list = [];
    (ids || []).forEach((id) => {
      if (!id || list.includes(id) || !getChar(id)) return;
      list.push(id);
    });
    if (list.length < 2) return null;
    // 先把这些人从原来的链里摘出来（原链不足两人自然散掉），再串成一条新的
    charChains().forEach((ch) => {
      if (!ch || !Array.isArray(ch.memberIds)) return;
      ch.memberIds = ch.memberIds.filter((id) => !list.includes(id));
    });
    const chain = { id: uid(), color: nextChainColor(), memberIds: list };
    // 先把新链挂上去再整理：否则「整理」会把刚手建的、带关系名称的「链接」关系当成
    // 「已经不在任何链里」删掉，再补一条空白的回来（用户填的名称 / 备注就丢了）
    charChains().push(chain);
    pruneCharChains();
    syncChainLinkRelations(); // 立刻把「链接」关系补上，界面不用等下一次保存
    return chain;
  }
  function unlinkCharsFromChain(ids) {
    let changed = 0;
    charChains().forEach((ch) => {
      if (!ch || !Array.isArray(ch.memberIds)) return;
      const before = ch.memberIds.length;
      ch.memberIds = ch.memberIds.filter((id) => !ids.includes(id));
      if (ch.memberIds.length !== before) changed += before - ch.memberIds.length;
    });
    pruneCharChains();
    syncChainLinkRelations();
    return changed;
  }
  /* 把一张卡并进这条链：
     · 新成员接在末尾 → 新选项卡排在老选项卡右边
     · 这张卡要是在别的链上，那条链整条并过来（取并集），原来那条链就空了、自动散掉
     · 已经在这条链里：什么都不做 */
  function addCharIntoChain(chainId, charId) {
    const target = charChains().find((c) => c && c.id === chainId);
    if (!target || !getChar(charId)) return { ok: false, count: 0 };
    if ((target.memberIds || []).includes(charId)) return { ok: false, count: 0 };
    const other = chainOfChar(charId);
    const moveIds = other && other.id !== target.id ? (other.memberIds || []).slice() : [charId];
    const add = moveIds.filter((id) => id && getChar(id) && !(target.memberIds || []).includes(id));
    charChains().forEach((c) => {
      if (!c || c === target || !Array.isArray(c.memberIds)) return;
      c.memberIds = c.memberIds.filter((id) => !moveIds.includes(id));
    });
    target.memberIds = (target.memberIds || []).concat(add);
    pruneCharChains(); // 空掉的那条链自动散掉
    syncChainLinkRelations();
    return { ok: add.length > 0, count: (target.memberIds || []).length, movedId: charId };
  }
  /* 从某张卡上点回形针并人：不管这张卡本来有没有链都能用
     · 它有链 → 并进它那条链（对方在别的链上就把那条链整条并过来）
     · 它没链、对方有链 → 并进对方那条链
     · 两边都没链 → 新建一条（当前这张卡排在前面） */
  function chainAddFromCard(curId, pickedId) {
    if (!curId || !pickedId || curId === pickedId) return { ok: false, count: 0 };
    const curChain = chainOfChar(curId);
    if (curChain) return addCharIntoChain(curChain.id, pickedId);
    const other = chainOfChar(pickedId);
    if (other) {
      const r = addCharIntoChain(other.id, curId);
      return { ok: r.ok, count: r.count || 0, movedId: r.ok ? curId : "" };
    }
    linkCharsIntoChain([curId, pickedId]);
    const made = chainOfChar(curId);
    return { ok: !!made, count: made ? (made.memberIds || []).length : 0, movedId: made ? curId : "" };
  }

  // 人物链的回形针图标（SVG，不是 emoji 文字）：颜色＝这条链的颜色
  function chainClipSvg(px) {
    const s = Number(px) || 15;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" focusable="false"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function chainClipHtml(chain) {
    // 人物卡右上角的回形针：不管这张卡在不在人物链里，提示都写「新建链接」
    const color = (chain && chain.color) || CHAR_COLORS[0];
    return `<span class="chain-clip" style="--chain-color:${esc(color)}" title="${esc(
      uiTextFor("新建链接")
    )}">${chainClipSvg(15)}</span>`;
  }
  /* 列表里的名字后面挂的小回形针：
     只要「勾选 / 选中」的人里有谁在人物链上，这条链上的所有人（含没勾的）都挂一个。 */
  function chainMarkSetFrom(ids) {
    const out = new Set();
    Array.from(ids || []).forEach((id) => {
      const ch = chainOfChar(id);
      if (!ch) return;
      chainMembersOf(ch).forEach((m) => out.add(m.id));
    });
    return out;
  }
  function nameChainClipHtml(charId, markSet) {
    if (!markSet || !markSet.has(charId)) return "";
    const ch = chainOfChar(charId);
    const color = (ch && ch.color) || CHAR_COLORS[0];
    const names = ch
      ? chainMembersOf(ch)
          .map((m) => m.name)
          .filter(Boolean)
          .join(" · ")
      : "";
    return `<span class="name-chain-clip" style="--chain-color:${esc(color)}" title="${esc(
      uiTextFor("这条卡属于一条人物链") + (names ? "：" + names : "")
    )}">${chainClipSvg(9)}</span>`;
  }

  function charCardHtml(c, searchMateIds) {
    const tags = [c.gender, c.age, c.role].filter(Boolean).slice(0, 3);
    const alias = (c.aliases || [])[0];
    const selected = batchSelected.has(c.id);
    const orderNo = batchMode && selected ? Array.from(batchSelected).indexOf(c.id) + 1 : 0;
    const cb = batchMode
      ? `<span class="batch-no ${selected ? "on" : ""}">${orderNo || ""}</span><input type="checkbox" class="batch-cb" data-char-id="${esc(c.id)}" ${selected ? "checked" : ""} />`
      : "";
    /* 多选时：只要这一组里选中了某条链上的任意一张卡，那条链上的**所有**卡片（含没选中的）
       右上角都挂一个回形针记号，颜色＝这条链的颜色（不同的链颜色不同）。 */
    /* 普通列表是用 chars.map(charCardHtml) 调用的，第二个参数会变成数组下标；
       只有真的是 Set（搜索带过来的同链人）才当回形针名单。 */
    const mateSet = searchMateIds instanceof Set ? searchMateIds : null;
    const searchMate = !!(mateSet && mateSet.has(c.id));
    const chain = batchMode || searchMate ? chainOfChar(c.id) : null;
    const clipOn = !!(searchMate || (chain && batchChainMark.has(chain.id)));
    const lit = batchMode && clipOn && !selected; // 同链但没选中的卡片：不要变灰
    const clip = clipOn ? chainClipHtml(chain) : "";
    return `<div class="char-card ${batchMode ? "batch" : ""} ${selected ? "selected" : ""} ${
      lit ? "chain-lit" : ""
    }" draggable="true" data-char-id="${esc(c.id)}" data-tip-id="${esc(c.id)}">
      ${clip}
      <div class="char-card-top">${cb}${avatarHtml(c)}<div style="min-width:0"><div class="char-name">${esc(c.name)}</div><div class="char-role">${esc(
        c.role || uiTextFor("未设定身份")
      )}${
        alias ? " · " + esc(uiTextFor("又名")) + " " + esc(alias) : ""
      }</div></div></div>
      ${tags.length ? `<div class="char-tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  function bindGroupHeads() {
    // 分组折叠三角：点一下收起 / 展开这一组的人物（未分组那个用 ungroupedCollapsed）
    $$("#char-list .grp-toggle").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const head = b.closest(".group-head");
        if (!head) return;
        const gid = head.dataset.groupId || "";
        if (gid) {
          const g = getGroup(gid);
          if (!g) return;
          g.collapsed = !g.collapsed;
        } else {
          state.ungroupedCollapsed = !state.ungroupedCollapsed;
        }
        saveState();
        renderCharacters();
      })
    );
    $$("#char-list .grp-rename").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        renameGroup(b.dataset.groupId);
      })
    );
    $$("#char-list .grp-del").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteGroup(b.dataset.groupId);
      })
    );
    $$("#char-list .grp-promote").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        promoteActiveExtras(false);
      })
    );
    // 批量模式：整组勾选 / 取消
    $$("#char-list .grp-pick").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBatchGroup(b.dataset.groupId || "");
      })
    );
    // 双击组名快速重命名（程序自带的固定分组不改名）
    $$("#char-list .group-name").forEach((el) =>
      el.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        const head = el.closest(".group-head");
        const gid = head ? head.dataset.groupId : "";
        const g = gid ? getGroup(gid) : null;
        if (g && g.special !== UNGROUPED_SPECIAL && g.special !== "extra") renameGroup(gid);
      })
    );
    // 把人物拖到分组头 = 归入该分组
    $$("#char-list .group-head").forEach((head) => {
      head.addEventListener("dragover", (ev) => {
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        head.classList.add("group-drop");
        if (data.type === "chars") return; // 整批移动：只高亮分组，不预示具体落点
        // 占位块放到这一组的最后一个位置，预示「会成为这组的最后一位」
        placeCharPlaceholderAtGroupEnd(head);
      });
      head.addEventListener("dragleave", () => head.classList.remove("group-drop"));
      head.addEventListener("drop", (ev) => {
        head.classList.remove("group-drop");
        const data = dragDataOf(ev);
        if (!data || (data.type !== "char" && data.type !== "chars")) return;
        ev.preventDefault();
        ev.stopPropagation();
        dragState = null;
        if (data.type === "chars") moveCharsToGroup(data.ids, head.dataset.groupId || "");
        else {
          moveCharToGroupEnd(data.id, head.dataset.groupId || "");
        }
      });
    });
  }

  // 把人物拖到分组标题＝放到该组的最后一位（折叠组也一样：它本来就在组里时仍挪到末尾）
  function moveCharToGroupEnd(charId, gid) {
    const c = getChar(charId);
    if (!c) return;
    const target = gid && getGroup(gid) ? gid : "";
    const dest = target ? groupDisplayName(getGroup(target)) || uiTextFor("分组") : uiTextFor("未分组");
    const idx = state.characters.indexOf(c);
    if (idx >= 0) state.characters.splice(idx, 1);
    c.groupId = target;
    state.characters.push(c);
    pendingUndoLabel = `把「${c.name}」移动到「${dest}」末尾`;
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    showToast(`已把「${c.name}」放到「${dest}」最后`);
  }

  // 把拖拽占位块放到某个分组的末尾（折叠组没有卡片时＝标题正下方、下一个分组标题之前）
  function placeCharPlaceholderAtGroupEnd(head) {
    if (!head || !head.parentElement) return;
    if (!dragPlaceholder) ensureDragPlaceholder();
    if (!dragPlaceholder) return;
    const body = head.parentElement;
    let lastCard = null;
    let cur = head.nextElementSibling;
    while (cur && !cur.classList.contains("group-head")) {
      if (cur.classList.contains("char-card")) lastCard = cur;
      cur = cur.nextElementSibling;
    }
    body.insertBefore(dragPlaceholder, lastCard ? lastCard.nextElementSibling : head.nextElementSibling);
  }

