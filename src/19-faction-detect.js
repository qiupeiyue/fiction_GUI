  /* ================= 势力识别（把误判成人物组织转成设定） ================= */
  const FACTION_STRONG = /(政党|政权|政府|议会|长老会|议事会|评议会|元老院|王国|帝国|共和国|联邦|公国|军部|军队|军团|兵团|集团军|起义军|联军|部队|骑士团|教团|教会|工会|公会|商会|财团|公司|社团|协会|联盟|同盟|家族|氏族|帮派|组织|团体|势力|阵营|王庭|宫廷|学院|学校|研究所|佣兵团|冒险团)/;
  function factionCategory() {
    let cat = findCatByKind("faction");
    if (!cat) {
      cat = {
        id: uid(),
        kind: "faction",
        name: catDefaultName("势力"),
        icon: "🏛",
        color: CAT_COLORS[3],
    fieldTemplate: catDefaultFields(["类型", "立场", "控制区域", "领袖", "简介"]),
      };
      state.settings.categories.push(cat);
    }
    return cat;
  }

  function factionEntries() {
    const cat = findCatByKind("faction");
    if (!cat) return [];
    return state.settings.entries.filter((e) => e.categoryId === cat.id);
  }

  /* ================= 势力层级（1.2.1：固定三级） =================
     势力就是设定条目，用 en.parentId 记上级（空 = 一级）。这里是层级唯一的真相来源，
     别的地方一律通过下面这些函数取层级 / 路径 / 子级，不要自己拼字符串。
     规则见 plan.md：升级＝层级数字变小（可跨级）；降级＝数字变大（一次一级，不能跨级），
     降级把子树挤出三级时，超出三级的那一代直接删掉（不弹确认，可撤销）。 */
  const FACTION_MAX_LEVEL = 3;
  /* 路径分隔符：用细一点的「›」加窄空格，比 CJK 字宽的全角「→」好看、也不占地方。
     输入解析两种都认（老习惯打「→」也行）。 */
  const FACTION_PATH_SEP = "\u2009›\u2009";
  const FACTION_PATH_SPLIT = /[→›]/;

  function factionEntryById(id) {
    const en = getEntry(id);
    return en && catKind(getCat(en.categoryId)) === "faction" ? en : null;
  }

  // 从根到自己的整条链（含自己）；带防环兜底，数据坏了也不会死循环
  function factionChainOf(en) {
    const out = [];
    let cur = en;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur);
      cur = cur.parentId ? factionEntryById(cur.parentId) : null;
      if (out.length > FACTION_MAX_LEVEL + 5) break;
    }
    return out.reverse();
  }
  function factionLevelOf(en) {
    return en ? factionChainOf(en).length : 0; // 一级 = 1
  }
  function factionPathOf(en) {
    return en ? factionChainOf(en).map((x) => x.name).join(FACTION_PATH_SEP) : "";
  }
  function factionRootOf(en) {
    const c = factionChainOf(en);
    return c.length ? c[0] : null;
  }
  function factionChildrenOf(en) {
    if (!en) return [];
    return factionEntries().filter((x) => x.parentId === en.id);
  }
  function factionDescendantsOf(en) {
    const out = [];
    const walk = (node) => {
      factionChildrenOf(node).forEach((ch) => {
        out.push(ch);
        walk(ch);
      });
    };
    walk(en);
    return out;
  }
  /* 成员：deep = true 时连所有子级的人一起算（去重）—— 势力卡显示用（第 28 条）；
     势力分析表的每一行也用 deep（甲挂在 A1›A2 里，A1 那一行也要出现甲，第 33 条）。 */
  function factionMemberIdsOf(en, deep) {
    const set = new Set((en && en.characterIds) || []);
    if (deep && en) factionDescendantsOf(en).forEach((x) => (x.characterIds || []).forEach((id) => set.add(id)));
    return Array.from(set);
  }

  // 「所属」候选：能当它上级的势力（排除自己 / 自己的子树；排除会超过三级或降级跨级的）
  function factionParentOptionsFor(enId) {
    const en = enId ? factionEntryById(enId) : null;
    const bad = new Set();
    if (en) {
      bad.add(en.id);
      factionDescendantsOf(en).forEach((x) => bad.add(x.id));
    }
    const oldLevel = en ? factionLevelOf(en) : 0;
    return factionEntries()
      .filter((x) => !bad.has(x.id))
      .filter((x) => factionLevelOf(x) + 1 <= FACTION_MAX_LEVEL)
      .filter((x) => !en || factionLevelOf(x) + 1 <= oldLevel + 1) // 降级不能跨级
      .map((x) => ({ id: x.id, path: factionPathOf(x), level: factionLevelOf(x), name: x.name }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /* 「所属」下拉框要分级显示（plan.md 第 26 条那套）：
     先只列一级势力；输入/选中的是哪一条，就把那条的子级缩进着接着列出来，逐级往下。
     候选范围仍然受层级限制：上级的层级 + 1 不能超过这张卡的层级 + 1（降级不能跨级），
     也不能超过三级。 */
  function factionParentPickerOptions(enId, typed) {
    const en = enId ? factionEntryById(enId) : null;
    const oldLevel = en ? factionLevelOf(en) : 1;
    const bad = new Set();
    if (en) {
      bad.add(en.id);
      factionDescendantsOf(en).forEach((x) => bad.add(x.id));
    }
    const okParent = (x) =>
      x && !bad.has(x.id) && factionLevelOf(x) + 1 <= FACTION_MAX_LEVEL && factionLevelOf(x) + 1 <= oldLevel + 1;
    const out = [];
    const seen = new Set();
    const push = (o) => {
      if (!o || !o.value || seen.has(o.value)) return;
      seen.add(o.value);
      out.push(o);
    };
    factionEntries()
      .filter((x) => !x.parentId && okParent(x))
      .forEach((root) => push({ value: factionPathOf(root), label: root.name, level: 1 }));
    /* 顺着已经输入的那条往下展开：每一级的子级都缩进着列出来。
       路径写法（A1→A2）和直接打名字（只打「学生会」）都要能触发 ——
       用户经常只知道子级叫什么，不会先打上级。 */
    const t = String(typed == null ? "" : typed).trim();
    if (t) {
      const parts = t.split(FACTION_PATH_SPLIT).map((s) => s.trim()).filter(Boolean);
      let curPath = "";
      for (let i = 0; i < parts.length; i++) {
        curPath = curPath ? curPath + FACTION_PATH_SEP + parts[i] : parts[i]; // 拼成和 factionPathOf 一样的写法才能比对上
        const cur = factionEntries().find((x) => factionPathOf(x) === curPath);
        if (!cur) break;
        factionChildrenOf(cur)
          .filter(okParent)
          .forEach((ch) =>
            push({ value: factionPathOf(ch), label: "　".repeat(i + 1) + "› " + ch.name, level: i + 2 })
          );
      }
      // 只打了名字 / 名字前缀：把它自己那一级也算「选过了」，接着列它的子级
      const last = parts.length ? parts[parts.length - 1] : t;
      if (last) {
        factionEntries().forEach((x) => {
          if (!okParent(x)) return;
          if (x.name !== last && x.name.indexOf(last) !== 0) return;
          const lvl = factionLevelOf(x);
          factionChildrenOf(x)
            .filter(okParent)
            .forEach((ch) =>
              push({ value: factionPathOf(ch), label: "　".repeat(lvl + 1) + "› " + ch.name, level: lvl + 1 })
            );
        });
      }
    }
    return out;
  }

  /* 改上级（＝改「所属」）。返回 { ok, reason?, label?, removed: [条目…] }
     · newLevel 由上级的层级 +1 得到；平级移动 delta＝0、升级 delta＜0、降级 delta＞0 */
  function setFactionParent(enId, parentId) {
    const en = factionEntryById(enId);
    if (!en) return { ok: false, reason: "notfound" };
    let parent = parentId ? factionEntryById(parentId) : null;
    if (parentId && !parent) return { ok: false, reason: "noparent" };
    if (parent && parent.id === en.id) return { ok: false, reason: "self" };
    if (parent && factionChainOf(parent).some((x) => x.id === en.id)) return { ok: false, reason: "cycle" };
    const oldLevel = factionLevelOf(en);
    /* 挂上去会变成四级（不存在）→ 压平：挂到目标的上级那儿，和目标同级（还是三级）。
       例：把一张二级卡拖到三级卡上 → 结果是它的三级同级，而不是第四级。 */
    if (parent && factionLevelOf(parent) + 1 > FACTION_MAX_LEVEL) {
      parent = parent.parentId ? factionEntryById(parent.parentId) : null;
    }
    const newLevel = parent ? factionLevelOf(parent) + 1 : 1;
    if (newLevel > FACTION_MAX_LEVEL) return { ok: false, reason: "tooDeep" };
    if (newLevel > oldLevel + 1) return { ok: false, reason: "skipDown" };

    en.parentId = parent ? parent.id : "";
    const delta = newLevel - oldLevel;
    const path = factionPathOf(en); // 改完之后算，含自己
    const label = `调整势力所属：「${en.name}」→「${path}」`;

    /* 降级把子树挤到四级去的那一代：**压平**（挂到祖父下面，和「原本的上级（现在三级）」同级），
       不再删掉。压平可能又让下一代超层级，所以循环几轮，直到全部 ≤ 三级。 */
    const flattened = [];
    if (delta > 0) {
      for (let guard = 0; guard < 6; guard++) {
        const over = factionEntries().filter((x) => factionLevelOf(x) > FACTION_MAX_LEVEL);
        if (!over.length) break;
        over.forEach((x) => {
          const p = factionEntryById(x.parentId);
          if (p && flattened.indexOf(p.name) < 0) flattened.push(p.name);
          x.parentId = p && p.parentId ? p.parentId : "";
        });
      }
    }
    return { ok: true, oldLevel, newLevel, delta, path, label, flattened, removed: [] };
  }

  // 「所属」输入框里的文字 → 上级 id。空 = 一级；认完整路径，也认唯一的名字
  function resolveFactionParentInput(enId, text) {
    const en = enId ? factionEntryById(enId) : null;
    /* 老习惯打「A1→A2」，现在显示的是「A1 › A2」：先都归一成同一种写法再比。 */
    const t = String(text == null ? "" : text)
      .split(FACTION_PATH_SPLIT)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(FACTION_PATH_SEP)
      .trim();
    if (!t || t === "无" || t === "None" || t === "null" || t === "NULL") return { id: "" };
    const options = factionParentOptionsFor(enId);
    const byPath = options.find((o) => o.path === t);
    if (byPath) return { id: byPath.id };
    const byName = options.filter((o) => o.name === t);
    if (byName.length === 1) return { id: byName[0].id };
    if (byName.length > 1) return { error: "ambiguous" };
    // 没改动（当前上级的原写法）也算通过
    if (en && en.parentId && factionPathOf(factionEntryById(en.parentId)) === t) return { id: en.parentId };
    return { error: "nofound" };
  }

  /* 换类别时（「移动到…」/ 信息卡里改类别）：势力带着整棵子树一起走，并把层级压平
     （目标类别没有层级，parentId 全部清空）—— plan.md 第 23 条。 */
  function flattenFactionSubtree(list) {
    (list || []).forEach((en) => {
      if (en && en.parentId) en.parentId = "";
    });
  }

  /* 删除 / 移动时用：把「势力条目」展开成它自己的整棵子树（plan.md 第 9、23 条）。
     非势力条目原样返回。 */
  function expandEntryIdsWithFactionDescendants(ids) {
    const out = [];
    const push = (id) => {
      if (id && out.indexOf(id) < 0) out.push(id);
    };
    (ids || []).forEach((id) => {
      const en = factionEntryById(id);
      if (!en) {
        push(id);
        return;
      }
      push(en.id);
      factionDescendantsOf(en).forEach((x) => push(x.id));
    });
    return out;
  }

  /* 兜底：把坏掉的 parentId（指向不存在 / 成环 / 算出层级超过三级）清成一级。
     载入存档、合并、删除之后都调一次，界面就不会遇到幽灵父级。 */
  function sanitizeFactionParents() {
    const list = factionEntries();
    if (!list.length) return 0;
    const byId = new Map(list.map((en) => [en.id, en]));
    let fixed = 0;
    list.forEach((en) => {
      if (en.parentId && !byId.has(en.parentId)) {
        en.parentId = "";
        fixed++;
      }
    });
    /* 超出三级的：压平成三级（挂到祖父下面，和原本的上级同级），而不是丢掉 ——
       成环那种坏数据才清成一级。
       注意：这里必须用**本地**算层级（byId），别用 factionLevelOf ——
       那个走缓存索引，撤销 / 回填之后可能还是旧数据，会把本来好好的层级也压一遍。 */
    const levelIn = (en) => {
      let n = 1;
      let cur = en;
      const seen = new Set([en.id]);
      while (cur && cur.parentId && byId.has(cur.parentId)) {
        if (seen.has(cur.parentId)) return FACTION_MAX_LEVEL + 2; // 成环
        seen.add(cur.parentId);
        cur = byId.get(cur.parentId);
        n++;
        if (n > FACTION_MAX_LEVEL + 2) break;
      }
      return n;
    };
    for (let guard = 0; guard < 6; guard++) {
      const over = list.filter((en) => en.parentId && levelIn(en) > FACTION_MAX_LEVEL);
      if (!over.length) break;
      over.forEach((en) => {
        if (levelIn(en) > FACTION_MAX_LEVEL + 1) {
          en.parentId = ""; // 成环：清成一级
          fixed++;
          return;
        }
        const p = en.parentId ? byId.get(en.parentId) : null;
        en.parentId = p && p.parentId && byId.has(p.parentId) ? p.parentId : "";
        fixed++;
      });
    }
    return fixed;
  }

  /* ================= 「所属」级联选择面板 =================
     参考「省 / 市 / 区」那种一层套一层的选法：一列一级势力，点一条就出右边一列它的子级，
     再点再出（最多三级）。点哪条就把「所属」设成哪条；「无」＝一级势力。
     键盘：↑↓ 在本列里走，←→ 换列，Enter 选当前那条，Esc 收起。 */
  let factionPickPanelEl = null;
  let factionPickPlace = null;
  function closeFactionPickPanel() {
    if (factionPickPanelEl) {
      if (factionPickPanelEl.__fxDocKey) document.removeEventListener("keydown", factionPickPanelEl.__fxDocKey, true);
      if (factionPickPanelEl.parentElement) factionPickPanelEl.parentElement.removeChild(factionPickPanelEl);
    }
    factionPickPanelEl = null;
    factionPickPlace = null;
  }
  function factionPickPanelOpen() {
    return !!(factionPickPanelEl && factionPickPanelEl.parentElement);
  }
  uiOnZoomReflow(() => {
    if (factionPickPlace) factionPickPlace();
  });

  /* opts: { anchor | (x,y), pickedId, onPick(id), maxLevel, excludeId }
     maxLevel：最多列到第几级当「上级」。势力卡的「所属」传 2（挂到三级就是四级，不允许）；
     人物卡的「所属势力」传 3（人可以直接属于三级势力）。
     excludeId：正在改「所属」的那张势力卡 —— 它自己、它的子级都不能当自己的上级（会成环），
     而且大于「自己的层级」的上级也不能选（降级不能跨级）。 */
  function openFactionPickPanel(opts) {
    const o = opts || {};
    const anchor = o.anchor;
    if (!anchor && (o.x == null || o.y == null)) return;
    const maxLevel = Math.max(1, Math.min(FACTION_MAX_LEVEL, o.maxLevel || FACTION_MAX_LEVEL));
    const allowSet = o.excludeId ? new Set(factionParentOptionsFor(o.excludeId).map((x) => x.id)) : null;
    closeFactionPickPanel();
    const panel = document.createElement("div");
    panel.className = "fx-pick";
    panel.tabIndex = -1;
    document.body.appendChild(panel);
    factionPickPanelEl = panel;

    const picked0 = o.pickedId ? factionEntryById(o.pickedId) : null;
    // 高亮路径：默认顺着当前「所属」一路展开
    let path = picked0 ? factionChainOf(picked0).map((x) => x.id) : [];
    let curCol = path.length ? path.length - 1 : 0;
    let curRow = 0;
    let query = ""; // 面板顶上的搜索框：打字就按名字匹配（跨层级列出来）

    const itemsOfCol = (col) => {
      /* 整棵树都摆出来（不能当上级的只是灰着不可点）—— 只把「能选的」过滤掉的话，
         用户点开 A1 会看到一片空白，还以为下面没有子级势力。 */
      if (col === 0) return factionEntries().filter((en) => !en.parentId || !factionEntryById(en.parentId));
      const parent = path[col - 1] ? factionEntryById(path[col - 1]) : null;
      return parent ? factionChildrenOf(parent) : [];
    };
    /* 这一条能不能当上级；不能的话给一句短说明（灰着显示，悬浮看原因） */
    const whyNotParent = (en) => {
      if (!allowSet || allowSet.has(en.id)) return "";
      if (o.excludeId) {
        if (en.id === o.excludeId) return "不能选自己或自己的下级";
        if (factionChainOf(en).some((x) => x.id === o.excludeId)) return "不能选自己或自己的下级";
      }
      return "这个所属不行（会超过三级或成环）";
    };
    const render = () => {
      const head = `<div class="fx-pick-head"><input type="text" class="fx-pick-search" placeholder="${esc(
        uiTextFor("搜索势力名")
      )}" value="${esc(query)}" /></div>`;
      /* 打了字：把所有能选的候选按名字匹配，平铺成一列（标签带完整路径） */
      if (query) {
        const q = query.trim().toLowerCase();
        const all = [];
        const walkAll = (en, level) => {
          if (level >= 1 && (!allowSet || allowSet.has(en.id))) all.push(en);
          if (level >= maxLevel) return;
          factionChildrenOf(en).forEach((ch) => walkAll(ch, level + 1));
        };
        factionEntries()
          .filter((en) => !en.parentId || !factionEntryById(en.parentId))
          .forEach((en) => walkAll(en, 1));
        const hits = all.filter((en) => String(en.name || "").toLowerCase().indexOf(q) >= 0).slice(0, 60);
        panel.innerHTML =
          head +
          `<div class="fx-pick-cols"><div class="fx-pick-col fx-pick-flat">` +
          (hits.length
            ? hits
                .map(
                  (en, i) =>
                    `<div class="fx-pick-item ${curCol === -1 && i === curRow ? "cur" : ""}" data-id="${esc(
                      en.id
                    )}" data-row="${i}"><span class="fx-pick-name">${esc(factionPathOf(en))}</span></div>`
                )
                .join("")
            : `<div class="fx-pick-item none">${esc(uiTextFor("没有匹配的势力"))}</div>`) +
          `</div></div>`;
        bindItems();
        return;
      }
      const cols = [];
      for (let c = 0; c < maxLevel; c++) {
        const items = itemsOfCol(c);
        if (c > 0 && !items.length) break;
        /* 每一列都给一条「无」：第一列的「无」＝一级势力（不挂上级）；
           后面列的「无」＝就用上一级那条（不往这一级挂）。 */
        const nonePicked = c === 0 ? !path.length : path.length === c;
        cols.push(
          `<div class="fx-pick-col" data-col="${c}">` +
            `<div class="fx-pick-item none ${nonePicked ? "picked" : ""} ${
              c === curCol && curRow === 0 ? "cur" : ""
            }" data-none="${c}">${esc(uiTextFor("无"))}</div>` +
            items
              .map((en, i) => {
                const isPicked = path[c] === en.id;
                const hasKids = factionChildrenOf(en).length > 0;
                const why = whyNotParent(en);
                return `<div class="fx-pick-item ${why ? "dis" : ""} ${isPicked ? "picked" : ""} ${
                  // 光标行号把每条列顶上的「无」也算作第 0 行，和键盘那套一致（i + 1）
                  c === curCol && i + 1 === curRow ? "cur" : ""
                }" data-id="${esc(en.id)}" data-col="${c}" data-row="${i}"${
                  why ? ` title="${esc(uiTextFor(why))}"` : ""
                }><span class="fx-pick-name">${esc(en.name)}</span>${hasKids ? `<span class="fx-pick-more">›</span>` : ""}</div>`;
              })
              .join("") +
            `</div>`
        );
      }
      panel.innerHTML = head + `<div class="fx-pick-cols">` + cols.join("") + `</div>`;
      bindItems();
    };
    const bindItems = () => {
      panel.querySelectorAll(".fx-pick-item").forEach((el) => {
        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (el.classList.contains("dis")) {
            // 灰着的那几条不能当上级：说一句为什么，别点了没反应
            if (el.title) showToast(el.title);
            return;
          }
          if (el.dataset.none != null) {
            const c = parseInt(el.dataset.none, 10) || 0;
            const id = c === 0 ? "" : path[c - 1] || "";
            path = c === 0 ? [] : path.slice(0, c);
            o.onPick && o.onPick(id);
            curCol = 0;
            curRow = 0;
            render();
            return;
          }
          const id = el.dataset.id;
          const col = parseInt(el.dataset.col, 10);
          path = path.slice(0, col);
          path[col] = id;
          curCol = Math.min(maxLevel - 1, col + (factionChildrenOf(factionEntryById(id)).length && col + 1 < maxLevel ? 1 : 0));
          curRow = 0;
          o.onPick && o.onPick(id);
          render();
        });
      });
      const search = panel.querySelector(".fx-pick-search");
      if (search) {
        search.addEventListener("input", (ev) => {
          query = search.value;
          curCol = query ? -1 : 0;
          curRow = 0;
          if (ev && (ev.isComposing || ev.keyCode === 229)) return; // 输入法组字中：先别重画，不然会把拼字打断
          render();
          const s2 = panel.querySelector(".fx-pick-search");
          if (s2) {
            s2.focus();
            try {
              s2.setSelectionRange(s2.value.length, s2.value.length);
            } catch (e) {
              /* ignore */
            }
          }
        });
      }
    };
    render();

    // 贴锚点：默认放右下，放不下就翻到左下；缩放后按当前矩形重放
    factionPickPlace = () => {
      if (!factionPickPanelEl || !factionPickPanelEl.isConnected) return;
      const liveAnchor = anchor && anchor.isConnected ? anchor : null;
      const r = liveAnchor
        ? uiVisualRect(liveAnchor)
        : { left: o.x, right: o.x, top: o.y, bottom: o.y };
      const pr = uiVisualRect(panel);
      let left = r.left;
      let top = r.bottom + (liveAnchor ? 4 : 18);
      if (!liveAnchor) left = r.left + 12;
      if (left + pr.width > window.innerWidth - 8) left = Math.max(8, r.right - pr.width);
      if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 4);
      panel.style.left = uiZoomPx(left);
      panel.style.top = uiZoomPx(top);
    };
    factionPickPlace();

    const handlePanelKey = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return; // 输入法组字中
      /* 在这个面板里按下的键就地处理掉：不拦的话回车会继续冒泡到
         「弹窗里回车＝保存并关闭」，选一条所属就把当前信息卡一起关掉了。 */
      const swallow = () => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      const inSearch = !!(ev.target && ev.target.classList && ev.target.classList.contains("fx-pick-search"));
      const flatHits = () => Array.from(panel.querySelectorAll(".fx-pick-flat .fx-pick-item[data-id]"));
      const backToSearch = () => {
        const s2 = panel.querySelector(".fx-pick-search");
        if (!s2) return;
        s2.focus();
        try {
          s2.setSelectionRange(s2.value.length, s2.value.length);
        } catch (e) {
          /* ignore */
        }
      };
      /* 搜索框里打了字：↑↓ 在平铺结果里走、Enter＝选当前那条、Esc＝先清空搜索（再按一次才收起） */
      if (inSearch && query) {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          swallow();
          const hits = flatHits();
          if (!hits.length) return;
          curRow = (curRow + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
          render();
          backToSearch();
        } else if (ev.key === "Enter") {
          swallow();
          const hits = flatHits();
          const el = hits[curRow] || hits[0];
          if (el) el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          /* 全局那条「输入框里回车＝确认并移出光标」会先把光标收走，
             这里把焦点拿回来，后面的 ↑↓ / Esc 才接着管用。 */
          backToSearch();
        } else if (ev.key === "Escape") {
          swallow();
          query = "";
          curCol = 0;
          curRow = 0;
          render();
          backToSearch();
        }
        return;
      }
      /* 搜索框里还没打字：Enter / Esc / 方向键交给下面那套「多列」逻辑；
         直接敲字＝自动进搜索框（不用先点一下输入框）。 */
      if (inSearch && ev.key === "Escape") {
        swallow();
        closeFactionPickPanel();
        return;
      }
      if (!inSearch && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        swallow();
        query = ev.key;
        curCol = -1;
        curRow = 0;
        render();
        backToSearch();
        return;
      }
      const items = Array.from(panel.querySelectorAll(`.fx-pick-col[data-col="${curCol}"] .fx-pick-item`));
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        swallow();
        if (!items.length) return;
        curRow = (curRow + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        render();
      } else if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        swallow();
        curCol = Math.max(0, Math.min(maxLevel - 1, curCol + (ev.key === "ArrowRight" ? 1 : -1)));
        curRow = 0;
        render();
      } else if (ev.key === "Enter") {
        swallow();
        const el = items[curRow];
        if (el) el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      } else if (ev.key === "Escape") {
        swallow();
        /* 搜索框里有字就先把字清了，再按一次才收面板（不管焦点在输入框还是面板上） */
        if (query) {
          query = "";
          curCol = 0;
          curRow = 0;
          render();
          backToSearch();
        } else {
          closeFactionPickPanel();
        }
      }
    };
    panel.addEventListener("keydown", handlePanelKey);
    /* 焦点不在面板上时（刚点完「▾」、或弹窗把焦点拿走了）按 ↑↓ / Enter / Esc 也要管用：
       面板开着的这一段在 document 上兜一层。焦点在输入框里就不抢（让输入框自己处理）。 */
    const onDocKey = (ev) => {
      if (!factionPickPanelEl || factionPickPanelEl !== panel || !panel.isConnected) return; // 面板已经没了就别再接键
      if (panel.contains(ev.target)) return; // 面板里已经处理过一遍了
      const tag = String((ev.target && ev.target.tagName) || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || (ev.target && ev.target.isContentEditable)) return;
      handlePanelKey(ev);
    };
    panel.__fxDocKey = onDocKey;
    document.addEventListener("keydown", onDocKey, true);
    /* 鼠标真的动了才把键盘光标带过去（用 mousemove，不用 mouseenter：
       重画之后浏览器会把静止的鼠标重新「进」一次，那样 ↑↓ 刚移开又被拽回去，
       看着就是「回车选了别的」）。 */
    let curFromMouse = null;
    const paintCur = () =>
      panel.querySelectorAll(".fx-pick-item").forEach((el) => {
        const isCur =
          el.dataset.none != null
            ? parseInt(el.dataset.none, 10) === curCol && curRow === 0
            : el.dataset.col != null
            ? parseInt(el.dataset.col, 10) === curCol && parseInt(el.dataset.row, 10) + 1 === curRow
            : curCol === -1 && parseInt(el.dataset.row, 10) === curRow;
        el.classList.toggle("cur", isCur);
      });
    panel.addEventListener("mousemove", (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest(".fx-pick-item") : null;
      if (!el || el === curFromMouse) return;
      curFromMouse = el;
      if (el.dataset.none != null) {
        curCol = parseInt(el.dataset.none, 10) || 0;
        curRow = 0;
      } else if (el.dataset.col != null) {
        curCol = parseInt(el.dataset.col, 10);
        curRow = (parseInt(el.dataset.row, 10) || 0) + 1; // 「无」占了第 0 行
      } else {
        curCol = -1;
        curRow = parseInt(el.dataset.row, 10) || 0;
      }
      paintCur();
    });
    setTimeout(() => panel.focus(), 20);
    // 点面板外面就收起（值已经按下去了，不撤销）
    setTimeout(() => {
      document.addEventListener("mousedown", function onOut(ev) {
        if (!factionPickPanelOpen()) {
          document.removeEventListener("mousedown", onOut, true);
          return;
        }
        if (factionPickPanelEl && (factionPickPanelEl === ev.target || factionPickPanelEl.contains(ev.target))) return;
        // 点的是打开它的那个按钮：交给按钮自己 toggle，别在这里抢着关
        if (anchor && (ev.target === anchor || anchor.contains(ev.target))) {
          document.removeEventListener("mousedown", onOut, true);
          return;
        }
        closeFactionPickPanel();
        document.removeEventListener("mousedown", onOut, true);
      }, true);
    }, 0);
  }

  /* 显示用：一组已选势力里，去掉「已经有子级被选中」的那些上级 ——
     已经显示 A1→A2 就不再单列 A1（不重复父链）。传进来的是条目数组，返回也是数组。 */
  function factionDisplayChainList(entries) {
    /* 传进来的是「已选中的势力条目」，返回其中「没有被别的已选项挂在下面当子级」的那些 ——
       也就是只留最深的那一批：显示了 A1→A2 就不单列 A1。 */
    return entries.filter(
      (en) => !entries.some((other) => other.id !== en.id && factionChainOf(other).some((x) => x.id === en.id))
    );
  }

  // 把人物身上指向「已经不是势力」的 id 清掉（换类别 / 删除之后用）
  function pruneCharacterFactionIds() {
    const ok = new Set(factionEntries().map((en) => en.id));
    let n = 0;
    (state.characters || []).forEach((c) => {
      const list = c.factionIds || [];
      let next = list.filter((id) => ok.has(id));
      /* 同时挂在一级和它的子级上时只留最下面那条：人只放最下层，
         否则「按势力分组」边栏里会在 A1 和 A1›A2 下面各出现一次。 */
      if (next.length > 1) {
        next = next.filter((id) => {
          const en = factionEntryById(id);
          if (!en) return true;
          return !next.some((other) => {
            if (other === id) return false;
            const o = factionEntryById(other);
            return !!(o && factionChainOf(o).slice(0, -1).some((x) => x.id === en.id));
          });
        });
      }
      if (next.length !== list.length) {
        c.factionIds = next;
        n++;
      }
    });
    return n;
  }

  // 人物「所属势力」多选池
  let charFactionSel = new Set();
  let factionPoolFolded = true; // 所属势力的勾选框默认折叠
  /* 人物卡里已经摊开的势力（点过 / 选过的那些）：
     摊开跟着「用户点过」走，不跟着「当前选中」走 —— 否则取消一个子级，
     同级的另一个会跟着一起消失（甲要能同时属于 B1›B2 和 B1›B3）。 */
  let factionPoolExpanded = new Set();

  function setFactionPoolFold(folded) {
    factionPoolFolded = !!folded;
    const pool = $("#c-faction-pool");
    if (pool) pool.hidden = factionPoolFolded;
    const btn = $("#c-faction-fold");
    if (btn) {
      btn.textContent = factionPoolFolded ? "▶" : "▼";
      btn.title = factionPoolFolded ? "展开势力勾选框" : "折叠势力勾选框";
      btn.setAttribute("aria-expanded", factionPoolFolded ? "false" : "true");
    }
  }

  /* 把焦点从势力池的按钮上拿开（别让它吃掉回车）。焦点本来就该在输入框里时不动。 */
  function claimCharModalFocus() {
    const a = document.activeElement;
    if (!a || !a.closest) return;
    const tag = String(a.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!a.closest("#char-modal")) return;
    if (a.blur) a.blur();
  }
  function renderCharFactionPool(selectedIds, opts) {
    charFactionSel = new Set(selectedIds || []);
    const box = $("#c-faction-pool");
    if (!box) return;
    const list = factionEntries();
    if (opts && opts.reset) factionPoolExpanded = new Set();
    /* 只列一级势力；**选了某一级之后，才把它的子级列出来**（子级用 A1→A2 这样的完整路径显示，
       三级是 A1→A2→A3）。这样打开人物卡不会一下铺开一大片。 */
    const visible = [];
    const seenIds = new Set();
    const pushVisible = (en) => {
      if (!en || seenIds.has(en.id)) return;
      seenIds.add(en.id);
      visible.push(en);
    };
    /* 要摊开的 = 用户点开过的 + 已选中的那些的整条祖先链（不摊开就看不见自己选的是哪条） */
    const open = new Set(factionPoolExpanded);
    list
      .filter((en) => charFactionSel.has(en.id))
      .forEach((en) => factionChainOf(en).forEach((x) => open.add(x.id)));
    const walkTree = (en) => {
      pushVisible(en);
      if (!open.has(en.id)) return;
      factionChildrenOf(en).forEach((ch) => walkTree(ch));
    };
    list.filter((en) => !en.parentId || !list.some((x) => x.id === en.parentId)).forEach((en) => walkTree(en));
    // 「所属势力」后面直接列出已选中的势力
    const chosen = $("#c-faction-chosen");
    if (chosen) {
      /* 只列「最深的那些」：已经显示了 A1→A2 就不再单列 A1（不重复父链，plan.md 第 3 条）。 */
      const names = factionDisplayChainList(list.filter((en) => charFactionSel.has(en.id))).map(
        (en) => factionPathOf(en) || en.name
      );
      chosen.textContent = names.length ? " · " + names.join("、") : "";
      chosen.title = names.length ? "已选：" + names.join("、") : "";
    }
    if (!list.length) {
      /* 一个势力都还没有时，也要有那颗「＋」——否则用户在这张卡里根本没法新建第一个势力。 */
      box.innerHTML = `<span class="pool-empty">还没有势力条目。做一次「文本分析」会自动识别势力与隶属关系；也可以点右边的「＋」新建，或到「设定档案 → 势力」新建。</span>`;
      appendFactionAddChip(box);
      return;
    }
    box.innerHTML = visible
        .map((en) => {
          const path = factionPathOf(en) || en.name;
          return `<span class="pool-chip ${charFactionSel.has(en.id) ? "active" : ""}" data-faction-id="${esc(
            en.id
          )}" title="点击选中 / 取消 · 双击打开这张势力条目">${esc(path)}</span>`;
        })
      .join("");
    box.querySelectorAll(".pool-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.factionId;
          if (charFactionSel.has(id)) {
            charFactionSel.delete(id);
          } else {
            /* 勾子级＝它已经属于那条链了，把链上的上级取消掉（不重复父链，plan.md 第 3 条）：
               结果和「只存末级」一致。同理，点上面那条（A1›A2）时它下面已经勾着的
               子级（A1›A2›A3）也要一起灭掉 —— 同一条链上只留点的那一条。 */
            const en = factionEntryById(id);
            if (en) {
              factionChainOf(en).forEach((x) => charFactionSel.delete(x.id));
              factionDescendantsOf(en).forEach((x) => charFactionSel.delete(x.id));
            }
            charFactionSel.add(id);
          }
        factionPoolExpanded.add(id); // 点过的这条就地摊开，同级那些别跟着变
        /* 选完把焦点从「折叠三角 / 胶囊」上拿开：焦点留在按钮上时，弹窗那条'回车＝保存'会被'回车归按钮'拦掉，看着就像快捷键失效 */
        claimCharModalFocus();
        renderCharFactionPool(Array.from(charFactionSel));
      });
      chip.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        openEntryModal(chip.dataset.factionId);
      });
    });
    // 「＋ 新建势力」：跟在最后那颗势力胶囊后面
    appendFactionAddChip(box.querySelector(".pool-group-body:last-of-type") || box);
  }

  // 那颗「＋」：点一下开「新建：势力」的完整弹窗，存下来自动挂到这个人身上
  function appendFactionAddChip(host) {
    if (!host) return;
    const old = host.querySelector(".faction-add-chip");
    if (old) old.remove();
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "pool-chip faction-add-chip";
    addBtn.dataset.factionAdd = "1";
    addBtn.textContent = "＋";
    addBtn.title = uiTextFor("新建势力");
    addBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      createFactionFromCharModal();
    });
    host.appendChild(addBtn);
  }

  /* 人物信息栏里：新建势力 —— 开的就是「新建：势力」那个完整弹窗
     （和「设定档案 → 势力」的＋新建、势力分析右上角的新建势力同一套界面）。
     存下来之后自动把这条势力加到这个人的「所属势力」里。 */
  function createFactionFromCharModal() {
    const cat = factionCategory();
    if (!cat) return;
    const entryModal = document.getElementById("entry-modal");
    if (!entryModal) return;
    // 人物卡先让位：两层弹窗叠着会让 Esc 一次关掉两层，人物卡里没保存的改动就白填了
    const charModal = document.getElementById("char-modal");
    const restoreCharModal = () => {
      if (charModal) charModal.hidden = false;
    };
    if (charModal) charModal.hidden = true;
    const before = new Set((state.settings.entries || []).map((e) => e.id));
    const prev = selectedCategoryId;
    selectedCategoryId = cat.id; // 让「新建」弹窗默认归到「势力」
    try {
      openEntryModal(null);
    } finally {
      selectedCategoryId = prev;
    }
    let sawOpen = false;
    const timer = setInterval(() => {
      const fresh = (state.settings.entries || []).find((e) => e.categoryId === cat.id && !before.has(e.id));
      if (fresh) {
        clearInterval(timer);
        charFactionSel.add(fresh.id);
        setFactionPoolFold(false); // 新建后展开，方便看到并确认这一条
        restoreCharModal();
        renderCharFactionPool(Array.from(charFactionSel));
        renderCategories();
        renderEntries();
        return;
      }
      if (!entryModal.hidden) {
        sawOpen = true;
        return;
      }
      if (sawOpen) {
        // 关掉时还没建出来＝用户取消了：把人物卡放回来，其它什么都不动
        clearInterval(timer);
        restoreCharModal();
      }
    }, 200);
  }

  // 势力分析界面右上角：新建势力。
  // 功能和「设定档案 → 势力」里的「＋ 新建」完全一样——打开同一个条目弹窗，
  // 只是类别默认选「势力」。建完保存后（renderEntries → 势力分析跟着刷新）表格立刻多一行。
  function createFactionFromAnalysis() {
    const cat = factionCategory();
    if (!cat) return;
    const prev = selectedCategoryId;
    selectedCategoryId = cat.id; // 让「新建」弹窗默认归到「势力」
    try {
      openEntryModal(null);
    } finally {
      selectedCategoryId = prev; // 不动「设定档案」当前选中的类别
    }
  }

  function resolveFactionIds(namesStr) {
    const names = String(namesStr || "")
      .split(/[、,，\/;；\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return [];
    const cat = factionCategory();
    const ids = [];
    names.forEach((n) => {
      let en = state.settings.entries.find((x) => x.categoryId === cat.id && normTitle(x.name) === normTitle(n));
      if (!en) {
        // 只有"看起来像组织"的名字才自动建条目，避免把人物 / 职务误建成势力
        if (!plausibleFactionName(n)) return;
        en = {
          id: uid(),
          categoryId: cat.id,
          name: n,
          fields: [],
          summary: "",
          tags: ["自动识别"],
          characterIds: [],
          eventIds: [],
          notes: "",
        };
        state.settings.entries.push(en);
      }
      if (!ids.includes(en.id)) ids.push(en.id);
    });
    return ids;
  }

  // 名字看起来像组织 / 势力吗（排除人名、职务名）
  const ORG_SUFFIX = /(国家|政权|政府|议会|政党|军队|军部|军团|兵团|集团军|起义军|联军|部队|骑士团|教团|教会|工会|公会|商会|财团|公司|社团|协会|联盟|同盟|家族|氏族|帮派|组织|团体|势力|阵营|王庭|宫廷|学院|学校|研究所|帝国|王国|共和国|联邦|公国|党|军|团|会|国|邦|部|派|盟|社|队|院|所)$/;
  const PERSON_HINT = /(士兵|卫兵|军官|士兵|成员|首领|领袖|侍者|仆人|商人|学生|教师|医生|记者|侦探|公主|王子|公爵|伯爵|男爵|侯爵|博士|教授|老人|少年|少女|女孩|男孩|女士|先生|夫人|殿下|陛下|大人|老大|头目|手下|爸爸|妈妈|父亲|母亲|哥哥|弟弟|姐姐|妹妹)$/;
  function plausibleFactionName(name) {
    const n = String(name || "").trim();
    if (n.length < 2) return false;
    if (FACTION_STRONG.test(n)) return true;
    if (PERSON_HINT.test(n)) return false;
    return ORG_SUFFIX.test(n);
  }

  /* 以前这里有一套「静默把人物卡转成势力条目」+ 启动 / 填入时自动执行。
     用户 2026-10-17 明确：设定档案只接受「填入设定档案」写进来的分析结果和用户手动编辑，
     除非用户点「自动更新」，不从人物 / 事件等别处回填。这套自动转换已整体删除。 */

