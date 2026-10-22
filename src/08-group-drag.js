  /* ---- 拖动分组标题（那一行分界线）＝整体调整分组的显示顺序 ---- */
  // 「未分组」和「龙套」位置固定（未分组跟在普通分组后面、龙套永远最下），它们只能当落点。
  let charGroupDragId = null;

  // 一个分组标题 + 它下面的人物卡片（直到下一个分组标题为止）
  function charGroupBlockEls(head) {
    const out = [head];
    let el = head.nextElementSibling;
    while (el && !el.classList.contains("group-head")) {
      out.push(el);
      el = el.nextElementSibling;
    }
    return out;
  }

  // 按当前的 DOM 顺序把分组顺序写回数据（未分组没有 id，不参与）
  function applyCharGroupOrderFromDom() {
    const ids = $$("#char-list .group-head")
      .map((h) => h.dataset.groupId)
      .filter(Boolean);
    if (!ids.length) return false;
    const map = new Map(state.groups.map((g) => [g.id, g]));
    const next = ids.map((id) => map.get(id)).filter(Boolean);
    state.groups.forEach((g) => {
      if (!next.includes(g)) next.push(g);
    });
    if (next.map((g) => g.id).join(",") === state.groups.map((g) => g.id).join(",")) return false;
    state.groups = next;
    return true;
  }

  function bindGroupDragSort() {
    $$("#char-list .group-head").forEach((head) => {
      const gid = head.dataset.groupId || "";
      const g = gid ? getGroup(gid) : null;
      const canDrag = !!g && g.special !== "extra";
      if (canDrag) {
        head.addEventListener("dragstart", (ev) => {
          charGroupDragId = gid;
          head.classList.add("dragging");
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            try {
              ev.dataTransfer.setData("text/plain", "");
            } catch (e) {
              /* ignore */
            }
          }
          ev.stopPropagation();
        });
        head.addEventListener("dragend", () => {
          head.classList.remove("dragging");
          $$("#char-list .group-head").forEach((h) => h.classList.remove("drag-before", "drag-after"));
          const moved = charGroupDragId;
          charGroupDragId = null;
          if (!moved) return;
          if (!applyCharGroupOrderFromDom()) {
            renderCharacters();
            return;
          }
          pendingUndoLabel = `调整分组顺序：「${(getGroup(moved) || {}).name || ""}」换了位置`;
          saveState();
          renderCharacters();
          showToast("已调整分组顺序（可用「撤销」还原）");
        });
      }
      // 落点：把拖动中的整个分组（标题 + 组内人物）插到这一行前面 / 后面
      head.addEventListener("dragover", (ev) => {
        if (!charGroupDragId || charGroupDragId === gid) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const dragging = $(`#char-list .group-head[data-group-id="${charGroupDragId}"]`);
        if (!dragging) return;
        const rect = head.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        head.classList.toggle("drag-before", before);
        head.classList.toggle("drag-after", !before);
        const block = charGroupBlockEls(dragging);
        const target = charGroupBlockEls(head);
        const anchor = before ? head : target[target.length - 1].nextElementSibling;
        block.forEach((el) => head.parentElement.insertBefore(el, anchor));
      });
      head.addEventListener("dragleave", () => head.classList.remove("drag-before", "drag-after"));
      head.addEventListener("drop", (ev) => {
        if (!charGroupDragId) return;
        ev.preventDefault();
        ev.stopPropagation();
        head.classList.remove("drag-before", "drag-after");
      });
    });
  }

  function bindCharacterCards() {
    $$("#char-list .char-card").forEach((el) => {
      if (batchMode) {
        el.addEventListener("click", (ev) => {
          const id = el.dataset.charId;
          if (ev.shiftKey)
            shiftClickCard("char", id, visibleCharIdsForShortcut(), batchSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("char", id, batchSelected);
        });
        el.addEventListener("dragstart", onCharDragStart);
        el.addEventListener("dragend", onCharDragEnd);
        // 批量模式下也要能拖着整批落到别的卡片上（＝并进那张卡所在的分组）
        bindCharCardDropTarget(el);
        return;
      }
      el.addEventListener("dragstart", onCharDragStart);
      el.addEventListener("dragend", onCharDragEnd);
      el.addEventListener("click", (ev) => {
        const id = el.dataset.charId;
        // Shift＝连选、Ctrl/Cmd＝加选：自动进入批量模式，不打开编辑弹窗
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          ev.stopPropagation();
          ensureCharBatchMode();
          if (ev.shiftKey)
            shiftClickCard("char", id, visibleCharIdsForShortcut(), batchSelected, ev.ctrlKey || ev.metaKey);
          else toggleClickCard("char", id, batchSelected);
          return;
        }
        markShortcutAnchor("char", id);
        openCharacterModal(id);
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        exitSelectModesForContextMenu(); // 右键菜单只对一个卡片生效，先退出多选，免得和「已选 N 个」打架
        showCharGroupMenu(ev.clientX, ev.clientY, el.dataset.charId);
      });
      bindCharCardDropTarget(el);
    });
  }

  // 拖到别的卡片上：单张＝占位块预示插到它的前 / 后面；整批＝并进那张卡片所在的分组
  function bindCharCardDropTarget(el) {
    if (!el || el.dataset.charDropBound === "1") return;
    el.dataset.charDropBound = "1";
    el.addEventListener("dragover", (ev) => {
      const data = dragDataOf(ev);
      if (!data || (data.type !== "char" && data.type !== "chars")) return;
      if (data.type === "char" && data.id === el.dataset.charId) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      // 整批拖动：只高亮，不预示单张插哪儿
      if (data.type === "chars") {
        el.classList.add("group-drop");
        return;
      }
      placeDragPlaceholder(el, ev.clientY);
    });
    el.addEventListener("dragleave", () => el.classList.remove("group-drop"));
    el.addEventListener("drop", (ev) => {
      const data = dragDataOf(ev);
      if (!data || (data.type !== "char" && data.type !== "chars")) return;
      if (data.type === "char" && data.id === el.dataset.charId) return;
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.remove("group-drop");
      // 整批拖到某张卡片上＝整批搬到那张卡片所在的分组
      if (data.type === "chars") {
        dragState = null;
        moveCharsToGroup(data.ids, charGroupIdOfEl(el));
        return;
      }
      commitCharDrop(data.id);
    });
  }

  // 这张人物卡片现在属于哪个分组（往上找最近的分组标题）
  function charGroupIdOfEl(el) {
    let cur = el ? el.previousElementSibling : null;
    while (cur) {
      if (cur.classList && cur.classList.contains("group-head")) return cur.dataset.groupId || "";
      cur = cur.previousElementSibling;
    }
    return "";
  }

  // 鼠标停在某个纵坐标时，算它落在哪一组（用分组标题的位置判断）
  function groupIdAtY(heads, y) {
    let gid = "";
    (heads || []).forEach((h) => {
      const r = h.getBoundingClientRect();
      if (r.top <= y) gid = h.dataset.groupId || "";
    });
    return gid;
  }

  // 「纪年」这种不分组的列表：松手时按指针 Y 算出要插到哪张卡片前面
  // （第一张「中点在 Y 下方」的卡片就是插入位置；全都在上方则插到最末尾）
  function cardBeforeAtY(sel, y) {
    let target = null;
    $$(sel).forEach((el) => {
      if (target) return;
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 >= y) target = el;
    });
    return target || null;
  }


  // 按侧栏里当前的 DOM 顺序把人物写回数据（分组归属 + 排序）
  function applyCharListOrderFromDom() {
    const list = $("#char-list");
    if (!list) return false;
    let gid = "";
    const order = [];
    const groupOf = new Map();
    Array.from(list.children).forEach((el) => {
      if (el.classList && el.classList.contains("group-head")) {
        gid = el.dataset.groupId || "";
        return;
      }
      if (el.classList && el.classList.contains("char-card")) {
        const id = el.dataset.charId;
        if (!id || !getChar(id)) return;
        order.push(id);
        groupOf.set(id, gid);
      }
    });
    if (!order.length) return false;
    order.forEach((id) => {
      const c = getChar(id);
      if (c) c.groupId = groupOf.get(id) || "";
    });
    const map = new Map(state.characters.map((c) => [c.id, c]));
    const next = order.map((id) => map.get(id)).filter(Boolean);
    state.characters.forEach((c) => {
      if (!order.includes(c.id)) next.push(c);
    });
    state.characters = next;
    return true;
  }

  // 松手：把被拖的人物插到占位块的位置上，然后写回顺序
  function commitCharDrop(dragId) {
    const list = $("#char-list");
    if (!list || !dragPlaceholder || !dragPlaceholder.parentElement) return false;
    const card = list.querySelector(`.char-card[data-char-id="${dragId}"]`);
    if (!card) return false;
    pendingUndoLabel = `调整人物位置：「${(getChar(dragId) || {}).name || ""}」`;
    dragPlaceholder.parentElement.insertBefore(card, dragPlaceholder);
    clearDragPlaceholder();
    applyCharListOrderFromDom();
    saveState();
    renderCharacters();
    renderTimeline();
    renderMatrix();
    showToast(`已调整「${(getChar(dragId) || {}).name || ""}」的位置`);
    return true;
  }

  // 人物弹窗正开着时，同步刷新其中的「所属群」下拉，避免新建/改名/删除群后界面不更新
  function syncGroupSelectWithModal(fallbackId) {
    const modal = $("#char-modal");
    if (!modal || modal.hidden) return;
    const sel = $("#c-group");
    const keep = fallbackId === undefined ? (sel ? sel.value : "") : fallbackId;
    renderGroupSelect(keep);
  }

  async function createGroup(fromCharModal) {
    const name = await uiPrompt("新分组的名称？");
    if (!name || !name.trim()) return;
    const color = GROUP_COLORS[state.groups.length % GROUP_COLORS.length];
    const group = { id: uid(), name: name.trim(), color };
    pendingUndoLabel = `新建分组：「${group.name}」`;
    insertGroupBeforeUngrouped(group); // 新分组排在「未分组」上方
    saveState();
    renderCharacters();
    renderMatrix();
    // 在人物弹窗里新建时，下拉立即出现并选中这个新群；侧栏新建时保留当前选择
    syncGroupSelectWithModal(fromCharModal === true ? group.id : undefined);
  }

  async function renameGroup(id) {
    const g = getGroup(id);
    if (!g) return;
    if (g.special === UNGROUPED_SPECIAL || g.special === "extra") {
      showToast(
        uiTextFor(
          g.special === "extra"
            ? "「龙套」是文本分析专用的固定分组，不能改名"
            : "「未分组」是程序自带的固定分组：不能改名、也不能删除"
        )
      );
      return;
    }
    const name = await uiPrompt("新的分组名称？", g.name);
    if (name === null || !name.trim()) return;
    const oldName = g.name;
    g.name = name.trim();
    pendingUndoLabel = `重命名分组：「${oldName}」→「${g.name}」`;
    saveState();
    renderCharacters();
    renderMatrix();
    syncGroupSelectWithModal();
    renderFactionAnalysis(); // 人物势力分析的横轴也是群名
    renderStats();
  }

  function deleteGroup(id) {
    const g = getGroup(id);
    if (!g) return;
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
    // 被删掉的群若正是弹窗里选中的项，回落到「未分组」
    const sel = $("#c-group");
    const wasSelected = sel && sel.value === id;
    syncGroupSelectWithModal(wasSelected ? "" : undefined);
  }

  // 一个人物的所有叫法：正式名 + 别名（别名里一次写了好几个的话再拆一遍）
  function charCallNames(c) {
    if (!c) return [];
    // 同一个人物的「叫法表」会被反复用到（两两比较几万次），按 名字+别名 缓存一份
    const sig = String(c.name || "") + "\u0001" + (c.aliases || []).join("\u0002");
    if (c.__callNamesSig === sig && c.__callNames) return c.__callNames;
    const out = [];
    const keys = [];
    const add = (s) => {
      const t = String(s || "").trim();
      // 「无 / 未知 / 不详」这类占位写法不算叫法，免得一堆人因为这个被凑成一组
      if (/^(无|未知|不详|未提及|待定|暂无|没有|none|null|n\/a|-|—|待补充)$/i.test(t)) return;
      if (!t) return;
      // 「凯尔」和「凯尔\u200b」这种看不见的差别算同一个叫法
      const k = normNameKey(t);
      if (!k || keys.indexOf(k) >= 0) return;
      keys.push(k);
      out.push(t);
    };
    add(c.name);
    (c.aliases || []).forEach((a) => {
      const raw = String(a || "");
      add(raw);
      raw
        .split(/[、,，\/|｜;；\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach(add);
      // 「艾达 小艾」这种用空格把两个中文名字写在一起的，也拆开认
      if (/\s/.test(raw)) {
        raw
          .split(/\s+/)
          .filter((s) => /^[\u4e00-\u9fa5·]{2,}$/.test(s))
          .forEach(add);
      }
    });
    c.__callNamesSig = sig;
    c.__callNames = out;
    return out;
  }

  // 「白发少女」「红发少年」这类拿外貌 / 年龄当称呼的词，命中这些特征
  // 每组是同义写法：名字里出现其中任何一个，去对方外貌描述里找同组任意一个都算命中
  const CHAR_LOOK_GROUPS = [
    ["白发", "银发", "银白", "雪白头发", "白发苍苍"],
    ["金发", "金黄色", "金色头发"],
    ["黑发", "乌发", "乌黑"],
    ["红发", "赤发", "火红"],
    ["棕发", "褐发", "栗色"],
    ["灰发", "花白"],
    ["紫发", "蓝发", "绿发", "粉发", "橙发"],
    ["长发"],
    ["短发"],
    ["卷发", "卷毛"],
    ["光头", "秃头"],
    ["独眼", "单眼"],
    ["瞎眼", "盲眼", "失明"],
    ["面具", "蒙面"],
    ["伤疤", "疤痕"],
    ["黑衣", "黑袍", "黑斗篷", "黑色长袍"],
    ["白衣", "白袍", "白裙", "白色长袍"],
    ["红衣", "红袍", "红色长袍"],
    ["斗篷", "披风"],
    ["盔甲", "铠甲"],
    ["眼镜"],
    ["拐杖"],
    ["跛脚", "瘸"],
    ["肥胖", "胖"],
    ["瘦高", "高瘦"],
    ["矮小", "矮个"],
    ["巨汉", "壮汉"],
    ["漂亮", "美貌", "可爱"],
    ["英俊", "俊美", "帅气"],
  ];
  const CHAR_AGE_WORDS = ["小孩","少年","少女","青年","女子","男子","男人","女人","老人","老者","老太","女孩","男孩","老翁","老汉","妇人","少妇","大爷","大娘"];

  // 年龄词分档：名字里是「白发少女」时，对方资料里写「老人」才算冲突，
  // 写「青年 / 26 岁 / 没写」都不冲突。
  const CHAR_AGE_TIERS = [
    ["小孩", "女孩", "男孩", "孩童", "孩子", "婴儿", "幼儿", "幼年", "儿时", "幼"],
    ["少年", "少女", "青年", "男子", "女子", "姑娘", "小伙", "男生", "女生", "少爷", "小姐", "年轻"],
    ["中年", "男人", "女人", "妇人", "少妇", "大叔", "阿姨", "父亲", "母亲"],
    ["老人", "老者", "老太", "老翁", "老汉", "大娘", "大爷", "祖母", "祖父", "奶奶", "爷爷", "白发苍苍"],
  ];
  function charAgeTier(word) {
    for (let i = 0; i < CHAR_AGE_TIERS.length; i++) if (CHAR_AGE_TIERS[i].indexOf(word) >= 0) return i;
    return -1;
  }

  function charFeatureWords(text, list) {
    const s = String(text || "");
    const key = list === CHAR_AGE_WORDS ? "age\u0001" + s : list.join("|") + "\u0001" + s;
    const hit = featureWordCache.get(key);
    if (hit) return hit;
    const out = list.filter((w) => s.indexOf(w) >= 0);
    if (featureWordCache.size > 5000) featureWordCache.clear();
    featureWordCache.set(key, out);
    return out;
  }
  const featureWordCache = new Map();

  // 名字里命中的「外貌特征组」（返回组下标）
  function charLookGroups(text) {
    const s = String(text || "");
    const hit = lookGroupCache.get(s);
    if (hit) return hit;
    const out = [];
    CHAR_LOOK_GROUPS.forEach((g, i) => {
      if (g.some((w) => s.indexOf(w) >= 0)) out.push(i);
    });
    if (lookGroupCache.size > 5000) lookGroupCache.clear();
    lookGroupCache.set(s, out);
    return out;
  }
  const lookGroupCache = new Map();

  // 「白发少女」这类外貌型称呼的唯一性检查：一次算好人选，别让每一对候选都重新扫全表。
  let charLookHitsCache = { rev: -1, map: new Map() };
  function charAppearanceHits(namer, look) {
    if (charLookHitsCache.rev !== stateDataRev) {
      charLookHitsCache = { rev: stateDataRev, map: new Map() };
    }
    const key = String((namer && namer.id) || "");
    const hit = charLookHitsCache.map.get(key);
    if (hit) return hit;
    const out = (state.characters || []).filter((c) => c && c.id !== namer.id && look(namer, c));
    charLookHitsCache.map.set(key, out);
    return out;
  }

  // 名字是「外貌 / 年龄」型称呼时，去对方的外貌、身份、备注里找同样的特征
  function charAppearanceMatch(a, b) {
    const look = (nameChar, other) => {
      if (!nameChar || !other) return false;
      if (!isBridgeNameAllowed(nameChar.name) || !isBridgeNameAllowed(other.name)) return false;
      const looks = charLookGroups(nameChar.name);
      const ages = charFeatureWords(nameChar.name, CHAR_AGE_WORDS);
      if (!looks.length && !ages.length) return false;
      const pool = [
        other.appearance,
        other.gender,
        other.age,
        other.role,
        other.personality,
        other.background,
        other.notes,
      ]
        .filter(Boolean)
        .join(" ");
      if (!pool.trim()) return false;
      // 名字里的性别倾向（少女 / 少年 / 老汉…）和对方性别栏写反了，就直接排除
      const nameGender = charGenderHint(nameChar.name);
      const otherGender = /男/.test(String(other.gender || "")) ? "m" : /女/.test(String(other.gender || "")) ? "f" : "";
      if (nameGender && otherGender && nameGender !== otherGender) return false;
      const lookHit = looks.filter((i) => CHAR_LOOK_GROUPS[i].some((w) => pool.indexOf(w) >= 0));
      const ageHit = ages.filter((w) => pool.indexOf(w) >= 0);
      // 名字里同时有外貌和年龄词时（「白发少女」）：外貌必须对上，
      // 年龄只要「不冲突」就行——对方资料里常写「26 岁」或干脆没写年龄，
      // 以前要求年龄词也一字不差对得上，结果永远匹配不到。
      if (looks.length && ages.length) {
        if (!lookHit.length) return false;
        return charAgeCompatible(ages, pool);
      }
      if (looks.length) return lookHit.length >= Math.max(1, Math.ceil(looks.length / 2));
      // 只剩年龄 / 性别词：对方描述里的年龄档不冲突才算
      return ageHit.length >= 1 || charAgeCompatible(ages, pool);
    };
    const ab = look(a, b);
    const ba = look(b, a);
    if (!ab && !ba) return false;
    // 「白发少女」这类外貌型称呼：只有全文里恰好只有一个人符合这个外貌时才自动配对，
    // 免得两个白发角色都被并进同一组（拿不准的就留给用户手动合并）。
    const namer = ab ? a : b;
    const hits = charAppearanceHits(namer, look);
    return hits.length === 1;
  }

  // 名字里的年龄词和对方资料里的年龄描述是否兼容（对方没写年龄就算兼容）
  function charAgeCompatible(ageWords, pool) {
    const nameTiers = new Set(ageWords.map(charAgeTier).filter((t) => t >= 0));
    if (!nameTiers.size) return true;
    const poolTiers = new Set();
    CHAR_AGE_TIERS.forEach((list, i) => {
      if (list.some((w) => pool.indexOf(w) >= 0)) poolTiers.add(i);
    });
    // 「26 岁 / 六十多岁」这类具体年龄也算一档
    const numTier = charAgeTierFromNumber(pool);
    if (numTier >= 0) poolTiers.add(numTier);
    if (!poolTiers.size) return true; // 对方没写年龄档，不构成冲突
    for (const t of poolTiers) if (nameTiers.has(t)) return true;
    return false;
  }

  // 从「26 岁」「六十多岁」「二十出头」里读出一个年龄档；读不出返回 -1
  function charAgeTierFromNumber(text) {
    const s = String(text || "");
    const m = s.match(/([0-9]{1,3}|[零一二三四五六七八九十百]{1,4})\s*(?:多\s*)?岁/);
    if (!m) return -1;
    const n = cnNumberValue(m[1]);
    if (!Number.isFinite(n)) return -1;
    if (n <= 12) return 0;
    if (n <= 29) return 1;
    if (n <= 45) return 2;
    return 3;
  }

  // 称呼里自带的性别倾向：少女 / 白发少年 / 老妇人…（判断不出来返回 ""）
  function charGenderHint(text) {
    const s = String(text || "");
    if (/少女|女孩|姑娘|女子|女人|妇人|少妇|大娘|老太|母亲|妈妈|奶奶|姐姐|妹妹|女仆|女王|公主/.test(s)) return "f";
    if (/少年|男孩|男子|男人|老汉|老翁|大爷|父亲|爸爸|爷爷|哥哥|弟弟|男仆|国王|王子/.test(s)) return "m";
    return "";
  }

  // 亲属称谓的同义写法（「妈妈」＝「母亲」、「爸爸」＝「父亲」…）。
  // 把称谓归一化后再比，就能认成同一个人：「小绪的妈妈」↔「小绪的母亲」。
  // 只在称谓出现在结尾（可带一个「的」）时替换，避免把「姑娘」里的「娘」之类误伤。
  // 归一化结果带一个不可见标记前缀，保证只跟同样归一化过的名字相等，不会撞上真名。
  const KIN_CANON_MARK = "\u0001";
  const KIN_SYNONYM_GROUPS = [
    // 中 / 英 / 日三套叫法都收进来：同一个人的「妈妈 / mother / お母さん」要能认成一样。
    // 只影响「疑似同一个人」的提示，不会静默合并。
    {
      canon: "母",
      words: [
        "妈妈", "妈咪", "母亲", "老妈", "阿妈", "阿母", "娘亲", "妈", "母",
        "mother", "mom", "mum", "mommy", "mummy", "mama", "mamma", "ma",
        "お母さん", "おかあさん", "母さん", "ママ", "おふくろ", "はは",
      ],
    },
    {
      canon: "父",
      words: [
        "爸爸", "爸比", "父亲", "老爸", "阿爸", "阿爹", "爹爹", "爹地", "爸", "爹", "父",
        "father", "dad", "daddy", "papa", "pop", "pa",
        "お父さん", "おとうさん", "父さん", "パパ", "ちち",
      ],
    },
    { canon: "祖父", words: ["爷爷", "祖父", "grandfather", "grandpa", "grandad", "おじいさん", "祖父"] },
    { canon: "祖母", words: ["奶奶", "祖母", "grandmother", "grandma", "granny", "おばあさん", "祖母"] },
    { canon: "外祖父", words: ["外公", "外祖父", "姥爷", "maternal grandfather"] },
    { canon: "外祖母", words: ["外婆", "外祖母", "姥姥", "maternal grandmother"] },
    { canon: "兄", words: ["哥哥", "兄长", "兄", "brother", "big brother", "elder brother", "お兄さん", "兄貴", "にいさん"] },
    { canon: "弟", words: ["弟弟", "弟", "little brother", "younger brother", "弟", "おとうと"] },
    { canon: "姐", words: ["姐姐", "姊姊", "姐", "sister", "big sister", "elder sister", "お姉さん", "ねえさん"] },
    { canon: "妹", words: ["妹妹", "妹", "little sister", "younger sister", "妹", "いもうと"] },
    { canon: "子", words: ["儿子", "son"] },
    { canon: "女", words: ["女儿", "闺女", "daughter"] },
    // 丈夫 / 妻子分开成两组：同一个人不可能既是 A 的丈夫又是 A 的妻子，别把它们凑成一条
    { canon: "妻", words: ["妻子", "老婆", "娘子", "wife"] },
    { canon: "夫", words: ["丈夫", "老公", "夫君", "husband"] },
  ];
  const KIN_WORD_CANON = new Map();
  KIN_SYNONYM_GROUPS.forEach((g) =>
    g.words.forEach((w) => KIN_WORD_CANON.set(w, KIN_CANON_MARK + g.canon))
  );
  const KIN_WORD_SET = new Set(KIN_WORD_CANON.keys());
  const KIN_WORD_ALT = Array.from(KIN_WORD_SET).sort((a, b) => b.length - a.length).join("|");
  const KIN_SUFFIX_RE = new RegExp("(?:的)?(" + KIN_WORD_ALT + ")$");
  function kinCanon(key) {
    const s = String(key || "");
    if (!s) return s;
    return s.replace(KIN_SUFFIX_RE, (m, w) => KIN_WORD_CANON.get(w) || m);
  }
  // 名字比较的“预处理表”：同一批聚类里，每个人物的每个叫法只规范化一次。
  // 这样两两比较时先做 indexOf / 长度判断，避免把明显不同的名字也送进错别字扫描。
  function charCallInfo(c) {
    if (!c) return [];
    const names = charCallNames(c);
    const sig = c.__callNamesSig || "";
    if (c.__callInfoSig === sig && c.__callInfo) return c.__callInfo;
    const out = names.map((raw) => {
      const key = normNameKey(raw);
      const clean = typoCleanName(raw);
      return {
        raw,
        key,
        kin: kinCanon(key),
        clean,
        pure: /^[\u4e00-\u9fa5]+$/.test(clean),
        init: latinNameParts(raw), // 拉丁名的分词（"A. Winters" → ["a","winters"]），其它语言是 null
        ja: jaNameKey(raw), // 日文名的假名/罗马字归一键（含汉字的返回空）
        generic: isGenericBridgeName(raw),
        collective: isCollectiveName(raw),
      };
    });
    c.__callInfoSig = sig;
    c.__callInfo = out;
    return out;
  }

  // 两个人是不是同一个人的叫法：名字 / 别名 之间任意一对能对上就算
  let charOverlapCache = { rev: -1, map: new Map() };
  function charNamesOverlap(a, b) {
    if (!a || !b) return false;
    const pairKey = a.id && b.id ? (a.id < b.id ? a.id + "\u0001" + b.id : b.id + "\u0001" + a.id) : "";
    if (charOverlapCache.rev !== stateDataRev) charOverlapCache = { rev: stateDataRev, map: new Map() };
    if (pairKey) {
      const hit = charOverlapCache.map.get(pairKey);
      if (hit !== undefined) return hit;
    }
    const na = charCallInfo(a);
    const nb = charCallInfo(b);
    for (let i = 0; i < na.length; i++) {
      for (let j = 0; j < nb.length; j++) {
        const x = na[i];
        const y = nb[j];
        if (x.generic || y.generic || x.collective || y.collective) continue;
        if (x.key === y.key) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
        // 亲属称谓的同义写法：「小绪的妈妈」＝「小绪的母亲」
        if (x.kin === y.kin && (x.kin !== x.key || y.kin !== y.key)) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
        const short = x.key.length <= y.key.length ? x.key : y.key;
        const long = x.key.length <= y.key.length ? y.key : x.key;
        // samePerson 只可能发生在「一个叫法是另一个的一部分」时（全名 / 简称 / 括号写法）
        if (short.length >= 2 && long.indexOf(short) >= 0 && samePersonRaw(x.key, y.key)) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
        // 拉丁名的「首字母 + 姓」：A. Winters ＝ Alice Winters（中日文名不受影响）
        if (latinInitialsPartsSame(x.init, y.init)) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
        // 日文名：假名 ↔ 罗马字、长音 / 促音写法差异（アリス ＝ Alice ＝ ありす）
        if (x.ja && y.ja && jaKanaSame(x.ja, y.ja)) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
        // 疑似错别字（同音 / 形近 / 两字颠倒）：长度和中文条件先挡掉大部分无关名字
        // 错别字：中文走同音 / 形近字表，英日文走「只差一个字符」（判断在 typoNameReason 里）
        if (x.clean.length === y.clean.length && typoSameName(x.clean, y.clean)) {
          if (pairKey) charOverlapCache.map.set(pairKey, true);
          return true;
        }
      }
    }
    // 「白发少女」这种只用外貌 / 年龄称呼的名字：和已有那个人物的外貌描述对得上也算同一个
    const out = charAppearanceMatch(a, b);
    if (pairKey) charOverlapCache.map.set(pairKey, out);
    return out;
  }

  // 聚类专用的快速版本：叫法信息已经按人物预处理好，不再在每一对里重复取。
  function charNamesOverlapInfo(a, b, ia, ib, appearancePossible) {
    if (!a || !b || !ia || !ib) return false;
    for (let i = 0; i < ia.length; i++) {
      const x = ia[i];
      for (let j = 0; j < ib.length; j++) {
        const y = ib[j];
        if (x.generic || y.generic || x.collective || y.collective) continue;
        if (x.key === y.key) return true;
        // 亲属称谓的同义写法：「小绪的妈妈」＝「小绪的母亲」
        if (x.kin === y.kin && (x.kin !== x.key || y.kin !== y.key)) return true;
        const short = x.key.length <= y.key.length ? x.key : y.key;
        const long = x.key.length <= y.key.length ? y.key : x.key;
        if (short.length >= 2 && long.indexOf(short) >= 0 && samePersonRaw(x.key, y.key)) return true;
        // 拉丁名的「首字母 + 姓」：A. Winters ＝ Alice Winters（中日文名不受影响）
        if (latinInitialsPartsSame(x.init, y.init)) return true;
        // 日文名：假名 ↔ 罗马字、长音 / 促音写法差异（アリス ＝ Alice ＝ ありす）
        if (x.ja && y.ja && jaKanaSame(x.ja, y.ja)) return true;
        // 错别字：中文走同音 / 形近字表，英日文走「只差一个字符」（判断在 typoNameReason 里）
        if (x.clean.length === y.clean.length && typoSameName(x.clean, y.clean)) return true;
      }
    }
    // 只有名字里确实带外貌 / 年龄特征（白发少女、少年…）时才做唯一性扫描。
    if (appearancePossible) return charAppearanceMatch(a, b);
    return false;
  }

  // 这一组人物为什么被凑到一起：给合并弹窗里显示的「理由」
  function charClusterWhy(members) {
    const hits = [];
    const shortHits = [];
    const kinHits = [];
    const variantHits = [];
    const jaHits = [];
    for (let i = 0; i < members.length; i++) {
      const na = charCallNames(members[i]);
      for (let j = i + 1; j < members.length; j++) {
        const nb = charCallNames(members[j]);
        na.forEach((x) =>
          nb.forEach((y) => {
            // 只是繁简 / 异体字写法不同（静流 ＝ 靜流、教団 ＝ 教團）：说清楚，别叫成错别字
            if (x !== y && foldVariant(x) === foldVariant(y) && !variantHits.some((t) => t.a === x && t.b === y)) {
              variantHits.push({ a: x, b: y });
              return;
            }
            const r = typoNameReason(x, y);
            if (r && !hits.some((t) => t.a === x && t.b === y)) hits.push({ a: x, b: y, r });
            const s = shortInsideName(x, y);
            if (s && !shortHits.some((t) => t.short === s.short && t.long === s.long)) shortHits.push(s);
            // 日文名的假名 ↔ 罗马字写法（アリス ＝ Alice）
            const jx = jaNameKey(x);
            const jy = jaNameKey(y);
            if (jx && jy && jaKanaSame(jx, jy) && !jaHits.some((t) => t.a === x && t.b === y)) {
              jaHits.push({ a: x, b: y });
            }
            const kx = normNameKey(x);
            const ky = normNameKey(y);
            if (
              kx !== ky &&
              kinCanon(kx) === kinCanon(ky) &&
              !kinHits.some((t) => t.a === x && t.b === y)
            )
              kinHits.push({ a: x, b: y });
          })
        );
      }
    }
    if (variantHits.length) {
      return uiNameReason("繁简 / 异体字写法", variantHits[0].a, variantHits[0].b, "＝");
    }
    if (hits.length) {
      return uiNameReason("疑似错别字", hits[0].a, hits[0].b, "≈");
    }
    if (shortHits.length) {
      const h = shortHits[0];
      return uiNameReason("简称 / 全称", h.short, h.long, "↔");
    }
    if (kinHits.length) {
      return uiNameReason("亲属称谓同义", kinHits[0].a, kinHits[0].b, "≈");
    }
    if (jaHits.length) {
      return uiNameReason("假名 / 罗马字写法", jaHits[0].a, jaHits[0].b, "＝");
    }
    return uiTextFor("名字相同 / 简称 / 别名");
  }

  // 把「叫法有重合」的人物聚成组（A≈B、B≈C 时 C 也归进同一组）
  function findDuplicateCharClusters() {
    // 聚类开始前强制重建本轮缓存：即使刚批量填入过数据、还没来得及 saveState，也不会读到旧结果。
    charOverlapCache = { rev: stateDataRev, map: new Map() };
    charLookHitsCache = { rev: stateDataRev, map: new Map() };
    const all = state.characters.slice();
    const n = all.length;
    if (n < 2) return [];
    const info = all.map((c) => charCallInfo(c));
    const appearancePossible = all.map((c, i) =>
      info[i].some(
        (x) => charLookGroups(x.raw).length > 0 || charFeatureWords(x.raw, CHAR_AGE_WORDS).length > 0
      )
    );
    // 并查集：每对人物只比一次，比原来的「反复扫描 cluster」稳定很多。
    const parent = new Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (x, y) => {
      const rx = find(x);
      const ry = find(y);
      if (rx !== ry) parent[ry] = rx;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (find(i) === find(j)) continue;
        // 已经在同一条「人物链」里的：作者说了这是同一个人不同时期 / 另一个身份，
        // 就别再提示合并了（链本身就是为了不合并而存在的）
        if (sameChainOf(all[i].id, all[j].id)) continue;
        if (charNamesOverlapInfo(all[i], all[j], info[i], info[j], appearancePossible[i] || appearancePossible[j])) {
          union(i, j);
        }
      }
    }
    const grouped = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!grouped.has(r)) grouped.set(r, []);
      grouped.get(r).push(all[i].id);
    }
    return Array.from(grouped.values()).filter((ids) => ids.length > 1);
  }

  // 「强同名」：完全一致且不少于 5 个字；或连续 6 个字完全相同（不含标点），
  // 并且多出来的部分只能是称谓 / 职务。泛称（士兵、路人、实验体…）不自动合并。
  const STRONG_NAME_PUNCT_RE = /[·•・.。．,，、:：;；!！?？'"“”‘’()（）\[\]【】《》〈〉「」『』\-—–_~～\/｜|]/;
  const STRONG_NAME_PUNCT_G = /[·•・.。．,，、:：;；!！?？'"“”‘’()（）\[\]【】《》〈〉「」『』\-—–_~～\/｜|]/g;
  const STRONG_TITLE_WORDS = ["公主", "王子", "殿下", "陛下", "大人", "小姐", "先生", "女士", "夫人", "将军", "队长", "老师", "医生", "教授", "主任", "老板", "阁下", "女王", "国王", "骑士", "副官", "秘书", "助理", "侍从", "管家", "女仆", "仆人", "长官", "书记官", "研究员"];
  const GENERIC_STRONG_NAME_RE = /^(?:第?[0-9０-９一二三四五六七八九十百千万两〇]+(?:号|人|名|个)?|男|女|老人|老者|少年|少女|女孩|男孩|男人|女人|妇人|士兵|守卫|警卫|仆人|女仆|管家|老板|店员|路人|村民|市民|官员|大臣|医生|护士|老师|学生|研究员|实验体|书记官|指挥官|将军|队长|组长|会长|团长|部长|首领|头目|老大|骑士|公主|王子|国王|女王|陛下|殿下|大人|小姐|先生|女士|夫人|总统|大佐|少佐|中尉|上尉|少校|上校)$/;
  function strongNameKey(name) {
    return normNameKey(name).replace(STRONG_NAME_PUNCT_G, "");
  }

  function isGenericStrongName(name) {
    return GENERIC_STRONG_NAME_RE.test(strongNameKey(name));
  }

  function isGenericBridgeName(name) {
    return isGenericStrongName(name);
  }

  function isCollectiveName(name) {
    const key = strongNameKey(name);
    return /(?:三剑客|三人组|小队|团队|帮派|匪帮|团伙|组织|议会|军团|骑士团|公会|阵营|势力|王朝|帝国|王国|教会|教团|家族)/.test(key);
  }

  function isBridgeNameAllowed(name) {
    return !isGenericBridgeName(name) && !isCollectiveName(name);
  }

  function strongNameExtraIsTitle(text) {
    let rest = String(text || "").replace(STRONG_NAME_PUNCT_G, "");
    if (!rest) return true;
    if (rest.length > 6) return false;
    STRONG_TITLE_WORDS.forEach((w) => {
      rest = rest.split(w).join("");
    });
    return !rest;
  }

  // 严格判定一对「强同名」：完全同名（≥5 字），或一个名字几乎完全包含另一个，
  // 且多出来的部分只能是称谓 / 职务；不满足就交回给合并弹窗让用户确认。
  function strictStrongNamePair(a, b, sharedWindow) {
    if (!a || !b || a.id === b.id) return false;
    if (isGenericStrongName(a.name) || isGenericStrongName(b.name) || isCollectiveName(a.name) || isCollectiveName(b.name)) return false;
    const pa = strongNameKey(a.name);
    const pb = strongNameKey(b.name);
    if (!pa || !pb) return false;
    if (sharedWindow === null) return pa === pb && pa.length >= 5;
    const shorter = pa.length <= pb.length ? pa : pb;
    const longer = pa.length <= pb.length ? pb : pa;
    if (shorter.length < 6) return false;
    if (longer.indexOf(shorter) >= 0) {
      const extra = longer.replace(shorter, "");
      return !extra || strongNameExtraIsTitle(extra);
    }
    if (!sharedWindow || sharedWindow.length < 6) return false;
    if (!pa.includes(sharedWindow) || !pb.includes(sharedWindow)) return false;
    const extras = pa.replace(sharedWindow, "") + pb.replace(sharedWindow, "");
    return !!extras && extras.length <= 6 && strongNameExtraIsTitle(extras);
  }

  function findStrongNameDuplicateClusters() {
    const chars = state.characters.slice();
    if (chars.length < 2) return [];
    const parent = new Map(chars.map((c) => [c.id, c.id]));
    const find = (id) => {
      let x = id;
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
      }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    const exact = new Map();
    const windows = new Map();
    const pairSeen = new Set();
    const tryPair = (a, b, w) => {
      const key = a.id < b.id ? a.id + "\u0001" + b.id : b.id + "\u0001" + a.id;
      if (pairSeen.has(key)) return;
      pairSeen.add(key);
      if (strictStrongNamePair(a, b, w)) union(a.id, b.id);
    };
    chars.forEach((c, idx) => {
      const rawKey = normNameKey(c.name);
      const key = strongNameKey(c.name);
      if (!key) return;
      if (key.length >= 5) {
        if (!exact.has(key)) exact.set(key, []);
        exact.get(key).push(idx);
      }
      // 6 个连续字符必须来自原文；窗口里只要夹了标点就跳过。
      if (rawKey.length >= 6) {
        for (let i = 0; i <= rawKey.length - 6; i++) {
          const w = rawKey.slice(i, i + 6);
          if (STRONG_NAME_PUNCT_RE.test(w)) continue;
          if (!windows.has(w)) windows.set(w, []);
          windows.get(w).push(idx);
        }
      }
    });
    exact.forEach((list) => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) tryPair(chars[list[i]], chars[list[j]], null);
      }
    });
    windows.forEach((list, w) => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) tryPair(chars[list[i]], chars[list[j]], w);
      }
    });
    const grouped = new Map();
    chars.forEach((c) => {
      const r = find(c.id);
      if (!grouped.has(r)) grouped.set(r, []);
      grouped.get(r).push(c.id);
    });
    return Array.from(grouped.values()).filter((ids) => ids.length > 1);
  }

  function pickAutoMergeMain(members, firstEventOrder) {
    let best = members[0];
    members.forEach((c) => {
      if (!best) {
        best = c;
        return;
      }
      const cs = charMainScore(c);
      const bs = charMainScore(best);
      if (cs > bs) {
        best = c;
        return;
      }
      if (cs === bs) {
        const co = firstEventOrder.get(c.id);
        const bo = firstEventOrder.get(best.id);
        const cOrder = co === undefined ? Number.MAX_SAFE_INTEGER : co;
        const bOrder = bo === undefined ? Number.MAX_SAFE_INTEGER : bo;
        if (cOrder < bOrder) best = c;
        else if (cOrder === bOrder && String(c.name || "").length > String(best.name || "").length) best = c;
      }
    });
    return best;
  }

  /* ================= 自定义识别合并规则（设置 → 人物 / 设定档案） =================
     一行一条规则：模式 + 词条（词条之间用空格 / 逗号 / 顿号 / 分号 / 句号等任意隔开）。
       · 静默合并：名字严格等于词条之一 → 直接并；只是近似 → 列进合并弹窗等用户确认
       · 严格识别：名字严格等于词条之一 → 列进合并弹窗等用户确认
       · 匹配识别：名字近似于词条之一 → 列进合并弹窗等用户确认
     只有用户自己写下的「静默合并」规则才会不看确认动数据，其余一律走确认弹窗。 */
  const RULE_MODE_IDS = ["silent", "strict", "loose"];
  const RULE_MODE_LABELS = { silent: "静默合并", strict: "严格识别", loose: "匹配识别" };

  function mergeRules() {
    if (!state.mergeRules || typeof state.mergeRules !== "object") state.mergeRules = { chars: [], entries: [] };
    if (!Array.isArray(state.mergeRules.chars)) state.mergeRules.chars = [];
    if (!Array.isArray(state.mergeRules.entries)) state.mergeRules.entries = [];
    return state.mergeRules;
  }

  // 老项目 / 手改过的数据兜底（每次载入过一遍）
  function ensureMergeRules() {
    const r = mergeRules();
    const fix = (list, dfltMode) =>
      list
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          if (!x.id) x.id = uid();
          if (RULE_MODE_IDS.indexOf(x.mode) < 0) x.mode = dfltMode;
          x.words = String(x.words == null ? "" : x.words);
          if (x.categoryId != null) x.categoryId = String(x.categoryId);
          return x;
        });
    r.chars = fix(r.chars, "silent");
    r.entries = fix(r.entries, "strict");
    return r;
  }

  // 词条切分：空白 / 逗号 / 顿号 / 分号 / 句号 / 冒号 / 斜杠 / 竖线 / 中点 当分隔。
  // 点号（.）、引号、括号不算分隔符：O'Brien、J.R.R.、「“小绪”」这类写法要整段留着，
  // 它们会在比较时被自动忽略（见 ruleKey）。
  const RULE_SPLIT_RE = /[\s,，、;；。:：|｜/\\·•・]+/;
  function ruleTerms(words) {
    const out = [];
    String(words == null ? "" : words)
      .split(RULE_SPLIT_RE)
      .forEach((s) => {
        const t = s.trim();
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    return out;
  }

  // 比较用的键：繁简 / 异体字 / 全角半角 / 大小写 / 空格 / 标点都不算差别
  // （这样「'Bob'」「Bob·」「Bob Smith」「BobSmith」都会落成同一个键）
  const RULE_KEY_STRIP_RE = /[·•・.。．,，、:：;；\-—–_~～/\\|｜"'“”‘’()（）〔〕\[\]【<>《》\s]/g;
  function ruleKey(s) {
    return normNameKey(s).replace(RULE_KEY_STRIP_RE, "");
  }

  // 只用来判断「差一两个字」
  function ruleEditDistance(a, b) {
    const n = a.length;
    const m = b.length;
    if (!n) return m;
    if (!m) return n;
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      for (let j = 1; j <= m; j++) {
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        const best = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = best;
      }
      const t = prev;
      prev = cur;
      cur = t;
    }
    return prev[m];
  }

  // 「近似」：一个把另一个含进去 / 差一两个字 / 中文同音形近写错
  function ruleNameSimilar(a, b) {
    const A = String(a || "").replace(/·/g, "");
    const B = String(b || "").replace(/·/g, "");
    if (!A || !B) return false;
    if (A === B) return true;
    const short = A.length <= B.length ? A : B;
    const long = A.length <= B.length ? B : A;
    if (short.length >= 2 && long.indexOf(short) >= 0 && long.length - short.length <= 3) return true;
    const maxLen = Math.max(A.length, B.length);
    const d = ruleEditDistance(A, B);
    // 允许的差别随名字长度走：短名只容一字之差，否则 Zoe ≈ Bob 这种也会被判成近似
    const limit = maxLen <= 6 ? 1 : maxLen <= 12 ? 2 : 3;
    if (d <= limit) return true;
    return !!typoNameReason(A, B);
  }

  // 一组词条 vs 一个名字列表 → 严格命中 / 只是近似
  function ruleNameHits(names, termKeys) {
    const strict = [];
    const loose = [];
    names.forEach((raw) => {
      const k = ruleKey(raw);
      if (!k) return;
      if (termKeys.indexOf(k) >= 0) {
        if (strict.indexOf(raw) < 0) strict.push(raw);
        return;
      }
      if (termKeys.some((t) => ruleNameSimilar(k, t))) {
        if (loose.indexOf(raw) < 0) loose.push(raw);
      }
    });
    return { strict, loose };
  }

  function ruleWhy(mode, terms) {
    const shown = terms.slice(0, 8).join(" / ") + (terms.length > 8 ? " …" : "");
    return `自定义规则（${RULE_MODE_LABELS[mode] || ""}）：${shown}`;
  }

  // 人物：按自定义规则找出可合并的一组组
  // 「严格识别」只收严格命中的；「静默合并 / 匹配识别」严格命中 + 近似命中都收
  function charRuleClusters() {
    const out = [];
    ensureMergeRules().chars.forEach((rule) => {
      const terms = ruleTerms(rule.words);
      const termKeys = terms.map(ruleKey).filter(Boolean);
      if (!termKeys.length) return;
      const strictIds = [];
      const looseIds = [];
      state.characters.forEach((c) => {
        const hit = ruleNameHits(charCallNames(c), termKeys);
        if (hit.strict.length) strictIds.push(c.id);
        else if (hit.loose.length) looseIds.push(c.id);
      });
      const ids = rule.mode === "strict" ? strictIds.slice() : strictIds.concat(looseIds);
      if (ids.length < 2) return;
      out.push({
        ids,
        mode: rule.mode,
        terms,
        strictIds: strictIds.slice(),
        looseIds: looseIds.slice(),
        why: ruleWhy(rule.mode, terms),
      });
    });
    return out;
  }

  // 设定档案：规则带类别，只对该类别下的条目生效
  function entryRuleClusters(catId) {
    const cats = new Set(((state.settings && state.settings.categories) || []).map((c) => c.id));
    const out = [];
    ensureMergeRules().entries.forEach((rule) => {
      if (!rule.categoryId || !cats.has(rule.categoryId)) return;
      if (catId && rule.categoryId !== catId) return;
      const terms = ruleTerms(rule.words);
      const termKeys = terms.map(ruleKey).filter(Boolean);
      if (!termKeys.length) return;
      const strictIds = [];
      const looseIds = [];
      state.settings.entries.forEach((en) => {
        if (en.categoryId !== rule.categoryId) return;
        const hit = ruleNameHits(entryNamesFor(en), termKeys);
        if (hit.strict.length) strictIds.push(en.id);
        else if (hit.loose.length) looseIds.push(en.id);
      });
      const ids = rule.mode === "strict" ? strictIds.slice() : strictIds.concat(looseIds);
      if (ids.length < 2) return;
      out.push({
        ids,
        mode: rule.mode,
        terms,
        strictIds: strictIds.slice(),
        looseIds: looseIds.slice(),
        why: ruleWhy(rule.mode, terms),
        categoryId: rule.categoryId,
      });
    });
    return out;
  }

  // 静默合并：只有「静默合并」规则里严格命中的那些不看确认直接并
  function applySilentCharRuleMerges(opts) {
    const o = opts || {};
    const clusters = charRuleClusters().filter((cl) => cl.mode === "silent" && cl.strictIds.length >= 2);
    if (!clusters.length) return 0;
    const firstEventOrder = new Map();
    orderedByStory().forEach((e, i) => {
      (e.characterIds || []).forEach((id) => {
        if (!firstEventOrder.has(id)) firstEventOrder.set(id, i);
      });
    });
    let n = 0;
    clusters.forEach((cl) => {
      const members = cl.strictIds.map((id) => getChar(id)).filter(Boolean);
      if (members.length < 2) return;
      const keep = pickAutoMergeMain(members, firstEventOrder);
      if (!keep) return;
      const drops = members.filter((c) => c !== keep).map((c) => c.id);
      if (!drops.length) return;
      mergeClusterInto(keep.id, drops, { finalName: fullestNameOf(members) });
      n++;
    });
    if (!n) return 0;
    if (!o.noLabel) pendingUndoLabel = `自定义规则静默合并人物 ${n} 组`;
    if (o.save !== false) {
      saveState();
      if (o.render !== false) {
        renderCharacters();
        renderTimeline();
        renderMatrix();
        renderEntries();
      }
    }
    return n;
  }

  function applySilentEntryRuleMerges(catId, opts) {
    const o = opts || {};
    const clusters = entryRuleClusters(catId).filter((cl) => cl.mode === "silent" && cl.strictIds.length >= 2);
    if (!clusters.length) return 0;
    let n = 0;
    clusters.forEach((cl) => {
      const members = cl.strictIds.map((id) => getEntry(id)).filter(Boolean);
      if (members.length < 2) return;
      members.sort((a, b) => entryMainScore(b) - entryMainScore(a));
      const keep = members[0];
      const drops = members.slice(1);
      if (!keep || !drops.length) return;
      mergeEntriesInto(keep, drops, { keepLabel: true });
      n++;
    });
    if (!n) return 0;
    if (!o.noLabel) pendingUndoLabel = `自定义规则静默合并设定条目 ${n} 组`;
    if (o.save !== false) {
      saveState();
      if (o.render !== false) {
        renderCategories();
        renderEntries();
        renderCharacters();
      }
    }
    return n;
  }

  function mergeDuplicateCharacters() {
  // 不再静默合并：强同名（同名 / 连续 6 字相同）的那些也一起放进弹窗，由用户确认
  // （例外：用户在「设置 → 人物 → 自定义规则」里写了「静默合并」的那些，先按规则并掉）
  const silentN = applySilentCharRuleMerges();
  const strong = findStrongNameDuplicateClusters().map((ids) => Array.from(ids));
  const ruleClusters = charRuleClusters();
  const ruleWhyOf = new Map();
  ruleClusters.forEach((cl) => ruleWhyOf.set(cl.ids.slice().sort().join("\u0001"), cl.why));
  const clusters = ruleClusters.map((cl) => cl.ids).concat(findDuplicateCharClusters(), strong);
    if (!clusters.length) {
    uiAlert(silentN ? `已按自定义规则静默合并 ${silentN} 组人物，没有别的可合并项了。` : "没有找到可以合并的重复人物。");
      return;
    }
    openMergeDialog(
      "确认合并人物",
      clusters.map((idList) => {
        const members = idList
          .map((id) => getChar(id))
          .filter(Boolean)
          .sort((a, b) => (b.name || "").length - (a.name || "").length);
        const why = ruleWhyOf.get(idList.slice().sort().join("\u0001")) || charClusterWhy(members);
        return makeSwapItem(members, charMainIndex(members), (k, ds, i, ctx) => {
          const picks = ctx.picks(ctx.ordered, null, (m) => charRecordTip(m, m.id === k.id ? "主体（字段以它为先）" : "参与合并"));
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason: `${why} · ${uiMergeTail(ds.length, { onlyOne: true })}`,
            tip: charMergeTip(
              k,
              ds,
              "默认挑信息最完整的那条当主体（排最前）。"
            ),
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              const names = { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(inc)) };
              return {
                tip: charMergeTip(
                  k,
                  inc,
                  uiMergeTail(inc.length, { kept: ds.length > inc.length, onlyOne: true }),
                  pickMergeName(it, names)
                ),
                names,
                reason:
                  inc.length === 0
                    ? `${why} · ${uiMergeTail(0, { onlyOne: true })}`
                    : `${why} · ${uiMergeTail(inc.length, { kept: ds.length > inc.length })}`,
              };
            },
            apply: (finalName) => mergeClusterInto(k.id, ds.filter(ctx.included).map((m) => m.id), { finalName }),
          };
        });
      })
    );
  }

  function snapshotCharData() {
    return {
      characters: JSON.parse(JSON.stringify(state.characters)),
      events: JSON.parse(JSON.stringify(state.events)),
      entries: JSON.parse(JSON.stringify(state.settings.entries)),
      order: JSON.parse(JSON.stringify(state.order)),
    };
  }

  // 把 dropIds 合并进 keepId：别名、备注、字段补全，事件/设定关联转移
  // 这条人物记录有多适合当「主体」：正常时间线里的、信息更全的更适合；
  // 回忆 / 插叙 / 「十年前」这类片段里的记录不适合当主体（应该作为补充）
  function charMainScore(c) {
    if (!c) return -999;
    let s = 0;
    ["gender", "age", "role", "appearance", "personality", "background", "goal", "relationships"].forEach((k) => {
      if (String(c[k] || "").trim()) s += 2;
    });
    if (String(c.notes || "").trim()) s += 1;
    if (String(c.factionIds || []).length) s += 1;
    s += Math.min(2, (c.aliases || []).length * 0.5);
    // 自定义字段 / 人设图也算「信息更完整」
    s += Math.min(4, (c.fields || []).filter((f) => String((f && f.value) || "").trim()).length) * 0.5;
    if (String(c.portrait || "").trim()) s += 0.5;
    const nar = String(c.srcNarrative || "");
    const time = String(c.srcTime || "");
    if (/倒叙|插叙|回忆|闪回/.test(nar)) s -= 6;
    if (/^(十年前|多年前|当初|那时|小时候|幼时|少年时|从前|曾经|故事开始前)/.test(time.trim())) s -= 4;
    if (isExtraChar(c)) s -= 2;
    return s;
  }

  // 合并弹窗里每张卡都会问「关联了几个事件 / 设定条目」。
  // 之前每张卡都全量扫一遍 state.events / state.settings.entries，大项目里会明显拖慢；
  // 这里按一次数据版本建索引，弹窗内反复悬停 / 切换时直接查表。
  let charAssocIndex = { rev: -1, events: new Map(), entries: new Map() };
  function charAssocCounts() {
    if (charAssocIndex.rev === stateDataRev) return charAssocIndex;
    const events = new Map();
    const entries = new Map();
    (state.events || []).forEach((e) => {
      (e.characterIds || []).forEach((id) => events.set(id, (events.get(id) || 0) + 1));
    });
    (state.settings && state.settings.entries ? state.settings.entries : []).forEach((en) => {
      (en.characterIds || []).forEach((id) => entries.set(id, (entries.get(id) || 0) + 1));
    });
    charAssocIndex = { rev: stateDataRev, events, entries };
    return charAssocIndex;
  }

