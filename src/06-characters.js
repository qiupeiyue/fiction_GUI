  /* ================= 人物 ================= */
  function renderCharacters() {
    const list = $("#char-list");
    const empty = $("#char-empty");
    const q = ($("#char-search").value || "").trim().toLowerCase();

    const filtered = state.characters.filter((c) => {
      if (!q) return true;
      // 搜索也做繁简 / 异体字归一：搜「台」能搜到「臺」，搜「教团」能搜到「教団」
      return foldVariant(String(c.name || "")).toLowerCase().includes(foldVariant(q));
    });
    /* 搜到 A 时，同一条人物链上的 a 也要跟出来、**放在 A 下面**（名字后挂回形针）。
       搜索状态下改成一条平铺的清单：同链的人可能属于别的分组，硬塞回分组里就跑到 A 上面去了。 */
    let shown = filtered;
    let searchMateIds = new Set();
    if (q) {
      const allRows = state.characters.map((c) => ({ char: c }));
      const hitRows = filtered.map((c) => ({ char: c }));
      const picked = withChainMates(allRows, q, (row) => row.char, { hits: hitRows });
      shown = picked.rows.map((row) => row.char);
      searchMateIds = picked.mateIds;
    }
    lastFilteredCharIds = shown.map((c) => c.id);
    // 多选时：勾到某条链上的任意一张卡 → 那条链上所有卡片都挂回形针（颜色＝链的颜色）
    batchChainMark.clear();
    if (batchMode) {
      batchSelected.forEach((id) => {
        const ch = chainOfChar(id);
        if (ch) batchChainMark.add(ch.id);
      });
    }

    empty.hidden = state.characters.length > 0;
    /* 搜不到就只留一句提示；但「一个人都还没有」时要把分组照常画出来
       ——「未分组」和用户建好的分组是界面结构，空着也要看得见（不然没法先建组、再拖人进去）。 */
    if (shown.length === 0 && q) {
      list.innerHTML = `<p class="empty-tip">没有匹配的人物。</p>`;
      return;
    }

    if (q) {
      // 搜索：命中的人 + 他链上的人，平铺成一列，同链的人紧跟在命中的人下面
      list.innerHTML = shown.map((c) => charCardHtml(c, searchMateIds)).join("");
      bindCharCardTips(list);
      bindCharacterCards();
      renderBatchBar();
      scheduleCharAnalysisRefresh();
      return;
    }

    const byGroup = new Map();
    filtered.forEach((c) => {
      const gid = charBucketIdOf(c);
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(c);
    });

    // 顺序：普通分组 → 未分组 → 龙套（龙套永远在最下方）
    let html = "";
    charGroupBucketsOrder().forEach(({ id, group: g }) => {
      const chars = byGroup.get(id) || [];
      if (!g) {
        // 「未分组」始终显示，方便把人物拖回来
        html += ungroupedHeadHtml(chars.length);
        if (!state.ungroupedCollapsed) html += chars.map(charCardHtml).join("");
        return;
      }
      html += groupHeadHtml(g, chars.length);
      if (!g.collapsed) html += chars.map(charCardHtml).join("");
    });
    // 勾选会重画整个列表：把滚动位置原样保留，勾谁都不会让栏内内容上下跑
    const keepScroll = list.scrollTop;
    list.innerHTML = html;
    bindCharCardTips(list);
    bindGroupHeads();
    bindGroupDragSort();
    bindCharacterCards();
    renderBatchBar();
    if (keepScroll && list.scrollTop !== keepScroll) list.scrollTop = keepScroll;
    // 人物分析那几栏（关系网 / 出场统计 / 势力分析 / 雷达分析）＝人物边栏的镜像：
    // 加人 / 改名 / 换组 / 删人 / 合并之后立刻跟着重画，
    // 不用再点「一键生成 / 更新」，也不用切页签再切回来。
    scheduleCharAnalysisRefresh();
  }

  /* 人物分析那几栏跟着人物边栏（和设定档案里的势力条目）实时刷新。
     只重画「当前正开着的那一栏」，同一轮里的多次变动合并成一次。 */
  const CHAR_ANALYSIS_RENDER = {
    relations: renderRelations,
    stats: renderStats,
    faction: renderFactionAnalysis,
    radar: renderRadarAnalysis,
  };
  let charAnalysisRefreshTimer = 0;
  function scheduleCharAnalysisRefresh() {
    if (charAnalysisRefreshTimer) return;
    charAnalysisRefreshTimer = setTimeout(() => {
      charAnalysisRefreshTimer = 0;
      const fn = CHAR_ANALYSIS_RENDER[currentTab];
      if (fn) safeRender(fn);
    }, 40);
  }

  function toggleBatchMode() {
    batchMode = !batchMode;
    batchSelected.clear();
    renderCharacters();
    renderBatchBar();
    const btn = $("#batch-btn");
    if (btn) btn.classList.toggle("btn-primary", batchMode);
  }

  // 批量模式下：整组勾选 / 取消勾选
  function toggleBatchGroup(gid) {
    const list = state.characters.filter((c) =>
      isUngroupedGid(gid) || !getGroup(c.groupId) ? isUngroupedGid(c.groupId) || !getGroup(c.groupId) : c.groupId === gid
    );
    if (!list.length) return;
    const allOn = list.every((c) => batchSelected.has(c.id));
    list.forEach((c) => {
      if (allOn) batchSelected.delete(c.id);
      else batchSelected.add(c.id);
    });
    renderCharacters();
    renderBatchBar();
  }

  function renderBatchBar() {
    const bar = $("#batch-bar");
    if (!bar) return;
    bar.hidden = !batchMode;
    if (!batchMode) {
      const delBtn0 = $("#batch-delete-btn");
      if (delBtn0) delBtn0.disabled = false;
      return;
    }
    $("#batch-count").textContent =
      (() => {
        const vis = new Set(shownCharIds());
        const visSel = Array.from(batchSelected).filter((id) => vis.has(id)).length;
        const hidSel = batchSelected.size - visSel;
        // 这句别写太长：文字一变长，工具条就会换行、把下面的列表挤矮，
        // 列表在底部时浏览器会把滚动位置往上夹，看着就像「勾一下就往上翻」。
        // 详细说明放到悬停提示里。
        return `已选 ${visSel} 人${hidSel ? `（另有 ${hidSel} 个被藏起来）` : ""}`;
      })();
    const countEl = $("#batch-count");
    if (countEl)
      countEl.title =
        uiTextFor("勾选顺序：先点的那张是主信息（合并时保留它的名字与字段）。可用下面这些按钮移动分组 / 合并 / 删除。") +
        uiTextFor("被搜索或折叠藏起来的人物不参与批量。");
    const delBtn = $("#batch-delete-btn");
    if (delBtn) {
      delBtn.disabled = batchSelected.size === 0;
      delBtn.title =
        batchSelected.size === 0
          ? "先点人物卡片勾选，再点这里删除"
          : `删除选中的 ${batchSelected.size} 个人物，并从事件、关系网、设定关联里一起移除（可撤销）`;
    }
    const mergeBtn = $("#batch-merge-btn");
    if (mergeBtn) mergeBtn.disabled = batchSelected.size < 2;
    const relEditBtn = $("#batch-rel-edit-btn");
    if (relEditBtn) {
      // 关系是「两个人之间」的东西：只有正好勾了 2 个人时才让点
      relEditBtn.disabled = batchSelected.size !== 2;
      relEditBtn.title =
        batchSelected.size === 2
          ? "编辑关系：给这两个人新建关系，或修改他们已有的关系"
          : "编辑关系：勾选正好 2 个人物时可用";
    }
    const updateBtn = $("#batch-update-events-btn");
    if (updateBtn) updateBtn.disabled = batchSelected.size === 0;
    const copyBtn = $("#batch-copy-btn");
    if (copyBtn) copyBtn.disabled = batchSelected.size === 0;
    const sel = $("#batch-group");
    const cur = sel.value;
    sel.innerHTML = charGroupOptionsHtml(true);
    // 没选过就默认停在「未分组」，避免误移动
    sel.value = cur === "__new__" || (cur && getGroup(cur)) ? cur : "";
  }

  function batchSelectAll() {
    // 只作用于当前显示出来的人物（搜索 / 分组折叠之后剩下的那些）
    const ids = shownCharIds();
    if (!ids.length) {
      showToast("当前没有显示出来的人物");
      return;
    }
    const allSelected = ids.length > 0 && ids.every((id) => batchSelected.has(id));
    if (allSelected) ids.forEach((id) => batchSelected.delete(id));
    else ids.forEach((id) => batchSelected.add(id));
    renderCharacters();
    renderBatchBar();
    showToast(allSelected ? `已取消全选（当前显示的 ${ids.length} 位）` : `已全选当前显示的 ${ids.length} 位人物`);
  }

  // 批量：只勾了 2 个人物时，直接编辑这两个人之间的关系
  //  A / B 由多选决定，界面上不再选人：只列这两人现有的关系，可以改、删、加，
  //  也能在这里新建关系类型。
  let pairRelIds = null;

  function editRelationBetweenSelected() {
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (ids.length !== 2) {
      showToast("勾选正好 2 个人物时才能编辑关系");
      return;
    }
    openPairRelModal(ids[0], ids[1]);
  }

  function pairRelRowHtml(r) {
    const kind = r ? r.kind || "其他" : "其他";
    const kindSel = relKindOptionsHtml(kind);
    // 「链接」关系是人物链派生的：不能在这一行单独删（要删请用批量条的「链接」逻辑）
    const chainRow = !!(r && isChainKindName(r.kind));
    return `<div class="pair-rel-row" data-rel-id="${esc(r ? r.id : "")}">
      <span class="pr-kindwrap"><i class="pr-dot" style="background:${esc(relKindColor(kind))}" title="类型颜色"></i><select class="pr-kind"${
        chainRow ? " disabled" : ""
      } title="${esc(
        chainRow ? uiTextFor("「链接」是人物链专用类型：类型名在「设置 → 关系网」改") : "关系类型"
      )}">${kindSel}</select></span>
      <input type="text" class="pr-label" placeholder="如：兄妹 / 师徒" value="${esc(r ? r.label || "" : "")}" title="关系" />
      <input type="text" class="pr-note" placeholder="补充说明、出现章节…" value="${esc(r ? r.note || "" : "")}" title="备注" />
      <button type="button" class="icon-btn pr-del"${chainRow ? " disabled" : ""} title="${esc(
        chainRow ? uiTextFor("「链接」关系跟着人物链走：在人物卡的链条上点 × 摘掉即可") : "删除这条关系"
      )}">×</button>
    </div>`;
  }

  // 关系类型下拉：现成的类型 + 「＋ 新建…」
  function relKindOptionsHtml(selected) {
    const names = relKindList().map((k) => k.name);
    if (!names.includes(selected)) names.unshift(selected);
    return (
      names.map((n) => `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`).join("") +
      `<option value="__new__">＋ 新建…</option>`
    );
  }

  function pairRelRows() {
    return $$("#pair-rel-list .pair-rel-row");
  }

  // 这两人之间一条关系都没有时：表头和不留白的空列表都收起来，只留底下那排按钮
  function syncPairRelEmpty() {
    const form = $("#pair-rel-form");
    if (!form) return;
    const list = $("#pair-rel-list");
    form.classList.toggle("pair-rel-empty", !list || !list.children.length);
  }

  function addPairRelRow(r) {
    const box = $("#pair-rel-list");
    if (!box) return;
    box.insertAdjacentHTML("beforeend", pairRelRowHtml(r || null));
    bindPairRelRow(box.lastElementChild);
    syncPairRelEmpty();
  }

  function bindPairRelRow(row) {
    if (!row) return;
    const del = row.querySelector(".pr-del");
    if (del)
      del.addEventListener("click", () => {
        row.remove();
        syncPairRelEmpty();
      });
    const sel = row.querySelector(".pr-kind");
    if (sel)
      sel.addEventListener("change", async () => {
        const dot = row.querySelector(".pr-dot");
        const paint = (name) => {
          if (dot) dot.style.background = relKindColor(name);
        };
        if (sel.value !== "__new__") {
          paint(sel.value);
          return;
        }
        const name = await addCustomRelKind();
        if (name) {
          sel.innerHTML = relKindOptionsHtml(name);
          paint(name);
        } else {
          const back = relKindList()[0] ? relKindList()[0].name : "其他";
          sel.value = back;
          paint(back);
        }
      });
  }

  function openPairRelModal(aId, bId) {
    const a = getChar(aId);
    const b = getChar(bId);
    if (!a || !b) return;
    pairRelIds = [aId, bId];
    const title = $("#pair-rel-title");
    if (title) title.textContent = `编辑关系：${a.name} ↔ ${b.name}`;
    const box = $("#pair-rel-list");
    box.innerHTML = "";
    const list = (state.relations || []).filter((r) => samePairIds(r, aId, bId));
    list.forEach((r) => addPairRelRow(r)); // 一条关系都没有就不摆空行
    syncPairRelEmpty();
    openModal("pair-rel-modal");
  }

  function submitPairRelForm(ev) {
    ev.preventDefault();
    if (!pairRelIds) return;
    const [aId, bId] = pairRelIds;
    const a = getChar(aId);
    const b = getChar(bId);
    if (!a || !b) {
      closeModal("pair-rel-modal");
      return;
    }
    const rows = pairRelRows().map((row) => ({
      id: row.dataset.relId || "",
      kind: (row.querySelector(".pr-kind") || {}).value || "其他",
      label: ((row.querySelector(".pr-label") || {}).value || "").trim(),
      note: ((row.querySelector(".pr-note") || {}).value || "").trim(),
    }));
    const keep = new Set(rows.filter((x) => x.id).map((x) => x.id));
    let changed = 0;
    // 删掉这一对被界面移除的关系
    const before = (state.relations || []).length;
    state.relations = (state.relations || []).filter((r) => !samePairIds(r, aId, bId) || keep.has(r.id));
    changed += before - state.relations.length;
    rows.forEach((x) => {
      if (x.id) {
        const r = (state.relations || []).find((y) => y.id === x.id);
        if (!r) return;
        if ((r.kind || "") !== x.kind || (r.label || "") !== x.label || (r.note || "") !== x.note) {
          r.kind = x.kind;
          r.label = x.label;
          r.note = x.note;
          changed++;
        }
        return;
      }
      // 新加的一条：类型或描述至少填一个才算
      if (!x.label && !x.note && !x.kind) return;
      state.relations.push({ id: uid(), fromId: aId, toId: bId, kind: x.kind, label: x.label, note: x.note });
      changed++;
    });
    if (changed) {
      pendingUndoLabel = `编辑关系：「${a.name} ↔ ${b.name}」`;
      // 这一对里只要有「链接」类型的行 → 两个人串成一条人物链（和批量条上的「链接」一样）
      if (rows.some((x) => isChainKindName(x.kind))) linkRelationPairsIntoChain(aId, bId);
      saveState();
      renderRelations();
      renderStats();
      renderCharacters();
      showToast(`已更新「${a.name} ↔ ${b.name}」的关系`);
    }
    pairRelIds = null;
    finishCardSave("pair-rel-modal");
  }

  // 选中的多个人物：手动合并成一个
  function applyBatchCharacterMerge() {
    const dropped = pruneSelectionToVisible("char");
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (ids.length < 2) {
      uiAlert(
        dropped && batchSelected.size < 2
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请至少勾选两个人物再合并。"
      );
      return;
    }
    // 按点击先后：先点的为主信息，后点的作为追加信息
    const members = ids.map((id) => getChar(id)).filter(Boolean);
    const keep = members[0];
    const drops = members.slice(1);
    openMergeDialog(
      "确认合并人物",
      [
        makeSwapItem(members, 0, (k, ds, i, ctx) => {
          const picks = ctx.picks([k].concat(ds), null, (m) => charRecordTip(m, m.id === k.id ? "主体" : "并入"));
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason:
              uiTextFor(i === 0 ? "按你点击的顺序" : "你双击换过主体") + " · " + uiMergeTail(ds.length, {}),
            tip: charMergeTip(
              k,
              ds,
              uiTextFor("字段以加框的主体为先，其余依次追加，内容不会丢。")
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
                reason: uiMergeTail(inc.length, { kept: ds.length > inc.length, onlyOne: true }),
              };
            },
            apply: (finalName) => {
              mergeClusterInto(k.id, ds.filter(ctx.included).map((m) => m.id), { finalName });
              batchMode = false;
              batchSelected.clear();
            },
          };
        }),
      ],
      "人物"
    );
  }

  const CHARACTER_UPDATE_SYSTEM = `你是小说人物档案整理助手。输入是选中人物的现有档案，以及事件轴中与他们相关的事件（按事件轴从上到下排列）。请根据事件中的事实，整理、去重、合并并更新每个人物档案。

规则：
- 只使用提供的档案和事件，不要编造。
- 每个字段输出“整理后的完整内容”，不要只写新增部分。
- 把原档案和事件中的新信息合并：重复内容去掉，相关表述合成通顺的一段。
- 背景经历按时间先后排列；没有明确时间的经历放在合适位置。
- 新的、更具体的事件信息优先；但不要丢掉旧档案里仍然有效的信息。明显冲突时，保留两者的简短对照。
- 人际关系写清“和谁、什么关系、态度如何”。
- 别名只收录确实指同一个人的称呼。
- 原有自定义字段要保留；事件里明确出现的新字段可以补充。
- 如果输入里给了「雷达图顶点」和每个人物的「雷达图」，就要为每个人物输出 "radar" 对象：键名严格用这些顶点名（括号里是作者对该顶点的说明，打分要按说明判断），值是 0~10 的数字（可以小数）。只有文本明确写了「为零 / 完全没有 / 毫无」这类意思时才填 0；没有依据、拿不准的顶点就不要出现在 radar 里，千万不要用 0 顶替。给数值时参考现代轻小说常见的「数值化」写法：战斗力、智力、体力、敏捷、魔力、魅力或性格特质常被做成面板 / 状态栏 / 属性表，文本若有明确数值或强弱对比就据此估分；只有文字描写时按相对水平给分（明显强=8~10，普通=4~6，明显弱=1~3）。评分要放在全局里看：任何顶点（战斗力、智力、魔力、魅力、性格特质等）都可比较，文本若有 A 强于 B、B 强于 C 这类相对关系，给分尽量保持 A>B>C；同一维度下所有人物按相对水平统一定标（仅作参考，无直接依据不强行排序）。顶点名如果对应到下面这些含义，要会从「侧写」换算过去：考试成绩 / 测验名次好 → 智力 / 智商高；打架比武占上风、体格强健 → 战斗力 / 体力高；被很多人追求、常被夸好看 → 魅力高；法术威力 / 魔力总量被强调 → 魔力高；指挥得当、射箭准、跑得快 → 对应的统率 / 敏捷等顶点高。没启用雷达图（输入里没有顶点）就不要输出 radar。
- 不要输出解释、markdown、代码块，只输出 JSON。

输出格式：
{"characters":[{"id":"原 id","name":"","role":"","gender":"","age":"","appearance":"","personality":"","background":"","goal":"","relationships":"","fields":[{"label":"","value":""}],"aliases":[],"radar":{}}]}`;

  async function updateCharactersFromEvents() {
    const dropped = pruneSelectionToVisible("char");
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "先点「批量」进入批量模式，再勾选要更新的人物。"
      );
      return;
    }
  if (analysisActivelyRunning()) {
    uiAlert("文本分析正在跑。点一下「暂停」（或「终止」）后就能按事件更新人物档案。");
      return;
    }
    if (agentDisabled) {
      uiAlert("Agent 已被禁用。想恢复的话，去「设置 → Agent」点一下「恢复 Agent」。");
      return;
    }
    const cfg = loadAgentConfig();
    if (!cfg.apiKey) {
      uiAlert("请先在「设置 → Agent」里填写 API Key。");
      openAgentModal();
      return;
    }
    const chars = ids.map((id) => getChar(id)).filter(Boolean);
    const idSet = new Set(ids);
    const events = orderedEvents()
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => (e.characterIds || []).some((id) => idSet.has(id)));
    if (!events.length) {
      uiAlert("选中的人物在事件轴里还没有关联事件。可以先把人物拖到事件卡片上，或在事件编辑里勾选登场人物。");
      return;
    }
    const payload = {
      任务: "根据事件轴整理并更新人物档案",
       雷达图顶点: radarOn()
         ? radarAxes()
             .filter((a) => String(a.label || "").trim())
             .map((a) =>
               String(a.label || "").trim() + (String(a.desc || "").trim() ? "（" + String(a.desc).trim() + "）" : "")
             )
         : [],
      人物档案: chars.map((c) => ({
        id: c.id,
        姓名: c.name || "",
        别名: c.aliases || [],
        身份职业: c.role || "",
        性别: c.gender || "",
        年龄: c.age || "",
        外貌: c.appearance || "",
        性格: c.personality || "",
        背景经历: c.background || "",
        目标动机: c.goal || "",
        人际关系: c.relationships || "",
        自定义字段: c.fields || [],
        雷达图: radarOn() ? c.radar || {} : undefined,
      })),
      事件轴: events.map(({ e, i }) => ({
        "#": i + 1,
        标题: e.title || "",
        实际时间: e.time || "",
        地点: e.place || "",
        叙事: e.narrative || "",
        登场人物: (e.characterIds || [])
          .map((id) => {
            const c = getChar(id);
            return c ? c.name : "";
          })
          .filter(Boolean),
        起因: e.cause || "",
        经过: e.process || "",
        结果: e.result || "",
        备注: e.notes || "",
      })),
    };
    const btn = $("#batch-update-events-btn");
    const oldText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "更新中…";
    }
    showToast(`正在按事件轴更新 ${chars.length} 位人物…`);
    try {
      const result = await callAgent(
        cfg,
        JSON.stringify(payload, null, 2),
        null,
        "",
        CHARACTER_UPDATE_SYSTEM + textStyleHint() + "\n\n" + genreSenseHint()
      );
      const list = result && Array.isArray(result.characters) ? result.characters : [];
      if (!list.length) {
        uiAlert("模型没有返回可更新的人物档案。");
        return;
      }
      pendingUndoLabel = `按事件更新 ${chars.length} 位人物档案`;
      let updated = 0;
      list.forEach((rec) => {
        const c = (rec && rec.id && getChar(rec.id)) || findCharacterByName((rec && rec.name) || "", (rec && rec.aliases) || []);
        if (!c || !idSet.has(c.id)) return;
        let changed = false;
        ["role", "gender", "age", "appearance", "personality", "background", "goal", "relationships"].forEach((k) => {
          const v = String((rec && rec[k]) || "").trim();
          if (!v) return;
          // 听「设置 → 文本分析 → 输入保护」：锁定就完全不动，追加 / 兼并按规则合并
          const key = "char:" + k;
          const mode = protectModeOf(key);
          if (mode === "lock") return;
          const next =
            k === "background" && mode === "merge"
              ? mergeTextsByTime([
                  { time: c.srcTime, text: c.background },
                  { time: "", text: v },
                ]) || protectTextValue(key, c[k], v)
              : protectTextValue(key, c[k], v);
          if (next !== String(c[k] == null ? "" : c[k])) {
            c[k] = next;
            changed = true;
          }
        });
        if (Array.isArray(rec.aliases) && rec.aliases.length) {
          const before = (c.aliases || []).length;
          addAliases(c, rec.aliases);
          if ((c.aliases || []).length !== before) changed = true;
        }
        (rec.fields || []).forEach((f) => {
          const label = String((f && f.label) || "").trim();
          const value = String((f && f.value) || "").trim();
          if (!label || !value) return;
          if (!Array.isArray(c.fields)) c.fields = [];
          const own = c.fields.find((x) => String((x && x.label) || "").trim() === label);
          // 卡片自定义字段也听输入保护（锁定＝不新增也不改）
          const nextVal = protectTextValue("char:customFields", own ? own.value : "", value);
          if (!nextVal) return;
          if (!own) {
            c.fields.push({ label, value: nextVal });
            changed = true;
          } else if (String(own.value || "") !== nextVal) {
            own.value = nextVal;
            changed = true;
          }
        });
        // 雷达图数值：按输入保护合并（非空锁定只补空着的顶点，0 不算空）
        if (radarOn() && rec.radar && typeof rec.radar === "object") {
          const inc = radarValuesFromRecord(rec);
          if (inc && Object.keys(inc).length) {
            const hadRadar = !!(c.radar && Object.keys(c.radar).length);
            const next = protectRadarValues(c.radar, inc);
            if (Object.keys(next).length && JSON.stringify(next) !== JSON.stringify(c.radar || {})) {
              c.radar = next;
              changed = true;
            }
            // 第一次给这张卡填上数值：顺手把雷达图打开，免得填了却看不见
            if (Object.keys(next).length && !hadRadar && c.radarOn !== true) {
              c.radarOn = true;
              changed = true;
            }
          }
        }
        if (changed) updated++;
      });
      if (!updated) {
        showToast("模型返回了结果，但没有需要改动的人物档案。");
        return;
      }
      saveState();
      renderCharacters();
      renderTimeline();
      renderMatrix();
      renderEntries();
      renderRelations();
      renderStats();
      renderBatchBar();
      showToast(`已按事件轴更新 ${updated} 位人物的档案（可撤销）`);
    } catch (e) {
      console.warn(e);
      uiAlert("按事件更新失败：" + (e && e.message ? e.message : e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || "按事件更新";
      }
      renderBatchBar();
    }
  }

  function copyCharacters(ids) {
    const set = new Set(ids || []);
    if (!set.size) return 0;
    const next = [];
    const copies = [];
    state.characters.forEach((c) => {
      next.push(c);
      if (!set.has(c.id)) return;
      const cp = Object.assign({}, c, { id: uid(), name: copyItemName(c.name) });
      cp.aliases = (c.aliases || []).slice();
      cp.fields = (c.fields || []).map((f) => Object.assign({}, f));
      cp.factionIds = (c.factionIds || []).slice();
      delete cp.__callNames;
      delete cp.__callNamesSig;
      delete cp.__callInfo;
      delete cp.__callInfoSig;
      next.push(cp);
      copies.push(cp);
    });
    if (!copies.length) return 0;
    state.characters = next;
    pendingUndoLabel = `复制 ${copies.length} 个人物`;
    saveState();
    renderCharacters();
    renderMatrix();
    renderRelations();
    renderStats();
    renderFactionAnalysis();
    return copies.length;
  }

  function batchCopyCharacters() {
    const dropped = pruneSelectionToVisible("char");
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "先点「批量」进入批量模式，再勾选要复制的人物。"
      );
      return;
    }
    const n = copyCharacters(ids);
    if (n) showToast(`已复制 ${n} 个人物，放在原卡片下方`);
  }

  // 真正把人删掉：事件登场、人物关系、设定关联一起清理（不负责确认与撤销，调用方处理）
  function removeCharacters(ids) {
    const set = new Set(ids);
    state.characters = state.characters.filter((c) => !set.has(c.id));
    state.events.forEach((e) => {
      if (!(e.characterIds || []).some((id) => set.has(id))) return;
      e.characterIds = e.characterIds.filter((id) => !set.has(id));
    });
    state.relations = (state.relations || []).filter((r) => !set.has(r.fromId) && !set.has(r.toId));
    state.settings.entries.forEach((en) => {
      if (!(en.characterIds || []).some((id) => set.has(id))) return;
      en.characterIds = en.characterIds.filter((id) => !set.has(id));
    });
  }

  function afterCharactersRemoved() {
    saveState();
    renderCharacters();
    refreshLineViews();
    renderRelations();
    renderEntries();
    renderStats();
    renderFactionAnalysis();
    renderMergeSelectBar();
    renderBatchBar();
  }

  // 批量删除人物：连同事件登场、人物关系、设定关联一起清掉（可撤销）
  async function batchDeleteCharacters() {
    const dropped = pruneSelectionToVisible("char");
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (!ids.length) {
      uiAlert(
        dropped
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "还没有勾选人物。先点「批量」进入批量模式，再点卡片勾选要删除的人。"
      );
      return;
    }
    // 人物卡片不弹二次确认（删掉后随时可以「撤销」还原）
    pendingUndoLabel = `批量删除 ${ids.length} 个人物`;
    removeCharacters(ids);
    batchSelected.clear();
    afterCharactersRemoved();
    showToast(
      `已删除 ${ids.length} 个人物（连带事件登场 / 关系 / 设定关联），可撤销还原` +
        (dropped ? `；另有 ${dropped} 个被藏起来的没动` : "")
    );
  }

  // 清掉「全文里只提了一句」的人物（旧数据里积下来的几百个龙套，一键清）
  // 清理前先列清单：默认全勾，用户可以自己反勾选留下想留的
  function pruneThinCharacters() {
    openThinCleanupDialog("character");
  }

  function pruneThinEntries() {
    openThinCleanupDialog("entry");
  }

  // 只清理某一个类别里的超短条目（右键类别用）
  function pruneThinEntriesInCategory(catId) {
    openThinCleanupDialog("entry", { catId });
  }

  // 人物「清理过滤」：涉及事件数不足，或正文里提到它的文字太少，两个条件满足其一就列出。
  // 两组阈值都能改：事件数 M（默认 3）、文本字数 N（默认 100）。
  function openCharacterPruneDialog(sentences) {
    loadFillOpts();
    const m0 = pruneEventThreshold();
    const n0 = pruneTextThreshold();
    const eventCountOf = (c) => state.events.filter((e) => (e.characterIds || []).includes(c.id)).length;
    const evidenceOf = (c) => evidenceCharsOf([c.name].concat(c.aliases || []), sentences);
    const collectRows = (m, n) => {
      const victims = state.characters.filter((c) => eventCountOf(c) < m || evidenceOf(c) < n);
      const list = victims
        .map((c) => {
          const ec = eventCountOf(c);
          const ev = evidenceOf(c);
          const parts = [];
          if (ec < m) parts.push(uiCountPhrase("events", ec));
          if (ev < n) parts.push(uiCountPhrase("mentioned", Number.isFinite(ev) ? ev : 0));
          return { id: c.id, label: c.name, reason: parts.join(" · ") };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
      return list;
    };
    const titleOf = (list) => `过滤（${list.length}）`;
    const hintOf = () => "";
    const refresh = () => {
      const m = parseInt($("#merge-list-threshold-input").value, 10) || 0;
      const n = parseInt($("#merge-list-threshold2-input").value, 10) || 0;
      setFillOpts({ pruneEventThreshold: m, pruneTextThreshold: n });
      const next = collectRows(m, n);
      return { items: next.map(({ id, label, reason }) => ({ id, label, reason })), title: titleOf(next), hint: hintOf() };
    };
    const rows0 = collectRows(m0, n0);
    if (!rows0.length) {
      uiAlert(`没有需要清理的人物：都满足「至少涉及 ${m0} 个事件」或「正文里提到 ${n0} 字以上」。`);
      return;
    }
    openChecklistDialog({
      title: titleOf(rows0),
      hint: hintOf(),
      items: rows0.map(({ id, label, reason }) => ({ id, label, reason })),
      threshold: {
        value: m0,
        label: "来源：事件 · 过滤阈值",
        unit: "事件",
        min: 0,
        max: 10000,
        step: 1,
        onChange: refresh,
      },
      threshold2: {
        value: n0,
        label: "来源：文本分析 · 过滤阈值",
        unit: "字",
        min: 0,
        max: 5000,
        step: 10,
        onChange: refresh,
      },
      confirmText: "确认清理",
      onConfirm: (chosen) => {
        const ids = Array.from(new Set(chosen.map((x) => x.id)));
        pendingUndoLabel = `清理过滤 ${ids.length} 个人物`;
        removeCharacters(ids);
        batchSelected.clear();
        afterCharactersRemoved();
        showToast(`已清理 ${ids.length} 个人物，可用「撤销」还原`);
      },
    });
  }

  // 人物 / 设定条目共用的清理清单
  function openThinCleanupDialog(kind, opts) {
    const isChar = kind === "character";
    const catId = !isChar && opts && opts.catId ? opts.catId : "";
    const scopeCat = catId ? getCat(catId) : null;
    const label = isChar ? "人物" : scopeCat ? catDisplayName(scopeCat) : "设定条目";
    const pronoun = isChar ? "他" : "它";
    // 用当前选中的分析任务；没选就用全部任务里的正文
    const task = getSelectedTask();
    const tasks = task ? [task] : state.analysis.tasks || [];
    const sentences = buildTextSentences(tasks);
    if (!sentences.length) {
      uiAlert(`还没有可用来判断的正文：请先在「文本分析」里导入文本（这样才能知道每个${label}被提到多少）。`);
      return;
    }
    loadFillOpts();
    if (isChar) {
      openCharacterPruneDialog(sentences);
      return;
    }
    const limit0 = thinThreshold();
    const evidenceOf = (obj) =>
      isChar ? evidenceCharsOf([obj.name].concat(obj.aliases || []), sentences) : evidenceCharsOf(entryNamesFor(obj), sentences);
    // 按给定阈值筛一遍（阈值可以在弹窗里改，改完立刻重算）
    const collectRows = (limit) => {
      const victims = (isChar ? state.characters : state.settings.entries).filter(
        (obj) => (!catId || obj.categoryId === catId) && evidenceOf(obj) < limit
      );
      // 条目按类别排在一起，并在每行标出它属于哪个类别（名词 / 物品 / 地点 / 势力 …）
      const list = victims.map((obj) => {
        const catName = isChar ? "" : catDisplayName(getCat(obj.categoryId)) || "未分类";
        return {
          id: obj.id,
          label: obj.name,
          catName,
          reason:
            (catName ? catName + " · " : "") +
            uiCountPhrase("evidence", Number.isFinite(evidenceOf(obj)) ? evidenceOf(obj) : 0),
        };
      });
      list.sort(
        (a, b) => (a.catName || "").localeCompare(b.catName || "", "zh-Hans-CN") || a.label.localeCompare(b.label, "zh-Hans-CN")
      );
      return list;
    };
    // 抬头写短一点：作用范围就是标题里的这个类别，不必再重复「只提了一句」那种长句；
    // 每一条属于哪个类别，行里的理由已经写了
    const titleOf = (list) => `清理超短条目：${label}（${list.length}）`;
    const hintOf = () => "";
    const rows0 = collectRows(limit0);
    if (!rows0.length) {
      uiAlert(`没有需要清理的：现有的${label}在正文里被提到的句子都超过了 ${limit0} 字。`);
      return;
    }
    const items = rows0.map(({ id, label, reason }) => ({ id, label, reason }));
    openChecklistDialog({
      title: titleOf(rows0),
      hint: hintOf(limit0),
      items,
      threshold: {
        value: limit0,
        label: "识别阈值：提到它的句子加起来不到",
        unit: "字",
        min: 0,
        max: 5000,
        step: 10,
        onChange: (v) => {
          setFillOpts({ threshold: v });
          loadFillOpts();
          const next = collectRows(v);
          const body = $("#fill-thin-threshold");
          if (body) body.value = String(v);
          return { items: next.map(({ id, label, reason }) => ({ id, label, reason })), title: titleOf(next), hint: hintOf(v) };
        },
      },
      confirmText: "确认清理",
      onConfirm: (chosen) => {
        const ids = Array.from(new Set(chosen.map((x) => x.id)));
        const set = new Set(ids);
        pendingUndoLabel = `清理 ${ids.length} 个「只提了一句」的${label}`;
        if (isChar) {
          removeCharacters(ids);
          batchSelected.clear();
          afterCharactersRemoved();
        } else {
          state.settings.entries = state.settings.entries.filter((en) => !set.has(en.id));
          (state.characters || []).forEach((c) => {
            c.factionIds = (c.factionIds || []).filter((id) => !set.has(id));
          });
          entryBatchSel.clear();
          saveState();
          renderCategories();
          renderEntries();
          renderCharacters();
          renderEntryBatchBar();
          renderFactionAnalysis();
        }
        showToast(`已清理 ${ids.length} 个「只提了一句」的${label}，可用「撤销」还原`);
      },
    });
  }

  // 从卡片右键菜单删除单个人物
  async function deleteCharacterById(id) {
    const c = getChar(id);
    if (!c) return;
    // 人物卡片不弹二次确认
    pendingUndoLabel = `删除人物：「${c.name}」`;
    removeCharacters([id]);
    batchSelected.delete(id);
    afterCharactersRemoved();
    showToast(`已删除「${c.name}」，可用「撤销」还原`);
  }

  // 批量条上的「链接」：把勾选的人物串成一条人物链；已经同链的再点一次＝取消链接。
  // 人物链表示「同一个人不同时期 / 另一个身份」，所以这些卡片之间不再提示合并。
  function applyBatchChain() {
    const dropped = pruneSelectionToVisible("char");
    const ids = Array.from(batchSelected).filter((id) => getChar(id));
    if (ids.length < 2) {
      uiAlert(
        uiTextFor("至少勾选两个人物才能构成一条人物链")
      );
      return;
    }
      const cur = chainOfChar(ids[0]);
      const allSameChain = !!cur && ids.every((id) => cur.memberIds.includes(id));
      if (allSameChain) {
        // 「链接」是取并集，不是开关：已经在同一条链里的再点一次不改动，只提示一句
        showToast(uiTextFor("勾选的人物已经在同一条人物链里了"));
        return;
      }
      // 取并集：勾选的人所在的链（A 链、B 链…）整条并进来，合成同一条链
    const all = new Set();
    ids.forEach((id) => {
      const old = chainOfChar(id);
      if (old) chainMembersOf(old).forEach((m) => all.add(m.id));
      all.add(id);
    });
    pendingUndoLabel = `人物链：${all.size} 个人物`;
    linkCharsIntoChain(Array.from(all));
    saveState();
    renderCharacters();
    renderMatrix();
    renderStats();
    renderRelations(); // 链变了 → 「链接」关系跟着变，右侧关系列表 / 关系图一起刷新
    showToast(all.size > ids.length ? uiSentence("chainMergedInto", all.size) : uiSentence("chainLinked", all.size));
    if (dropped && !batchSelected.size) exitBatchExcept("char");
  }

  async function applyBatchMove() {
    // 批量只作用于当前显示出来的卡片：先把被筛选 / 折叠藏起来的选择去掉
    const droppedChar = pruneSelectionToVisible("char");
    const sel = $("#batch-group");
    if (!batchSelected.size) {
      if (sel) sel.value = ""; // 没得可移：下拉复原，别卡在「＋ 新建…」
      uiAlert(
        droppedChar
          ? "勾选的卡片被搜索 / 折叠藏起来了，先让它们显示出来"
          : "请先勾选要移动的人物。"
      );
      return;
    }
    let gid = sel ? sel.value : "";
    let createdName = "";
    // 下拉里选了「＋ 新建…」：先新建一个分组，再把勾选的人移进去
    if (gid === "__new__") {
      const name = await uiPrompt("新分组的名称？");
      if (name === null || !String(name).trim()) {
        if (sel) sel.value = ""; // 取消：不建组、也不移动
        return;
      }
      const g = {
        id: uid(),
        name: String(name).trim(),
        color: GROUP_COLORS[state.groups.length % GROUP_COLORS.length],
        collapsed: false,
      };
      insertGroupBeforeUngrouped(g); // 新分组排在「未分组」上方
      // 立刻撞一下版本号：下面 getGroup(gid) 按 stateDataRev 缓存，不撞的话读不到刚建的组，
      // 人物会被当成「未分组」落进去 —— 字幕说移进了新组，实际却没移进去。
      bumpStateRev();
      gid = g.id;
      createdName = g.name;
    }
    const target = gid && getGroup(gid) ? gid : "";
    const destName = target ? groupDisplayName(getGroup(target)) : uiTextFor("未分组");
    let n = 0;
    batchSelected.forEach((id) => {
      const c = getChar(id);
      if (c && (c.groupId || "") !== target) {
        c.groupId = target;
        n++;
      }
    });
    pendingUndoLabel = createdName
      ? `新建分组「${createdName}」并把 ${n} 位人物移进去`
      : `把 ${n} 位人物移动到「${destName}」`;
    // 移好的人从选择里去掉（被筛选 / 折叠藏起来的那些本来就已经剔掉了）
    Array.from(batchSelected).forEach((id) => {
      const c = getChar(id);
      if (c && (c.groupId || "") === target) batchSelected.delete(id);
    });
    saveState();
    renderCharacters();
    renderMatrix();
    renderBatchBar();
    if (sel) sel.value = target; // 新建后下拉指向新组
    uiAlert(
      (createdName ? `已新建分组「${createdName}」，并把 ${n} 位人物移进去。` : `已把 ${n} 位人物移动到「${destName}」。`) +
        (droppedChar ? `\n\n（另有 ${droppedChar} 个被筛选 / 折叠藏起来的没参与）` : "")
    );
  }

  function groupHeadHtml(g, count) {
    const collapsed = !!g.collapsed;
    const canDrag = g.special !== "extra";
    /* 程序自带的固定分组：「未分组」（人物没地方放就落这儿）与「龙套」（文本分析专用、
       永远排最后）—— 改名和删除的按钮干脆不画，只留折叠 / 展开（龙套另有「⇧ 移出龙套」）。
       龙套要是被改名 / 删掉，靠 special==="extra" 认它的那些功能就会乱。 */
    const isExtra = g.special === "extra";
    const fixed = isExtra || g.special === UNGROUPED_SPECIAL;
    return `<div class="group-head ${collapsed ? "collapsed" : ""}${canDrag ? " group-draggable" : ""}" data-group-id="${esc(
      g.id
    )}" draggable="${canDrag ? "true" : "false"}" title="${
      isExtra
        ? "「龙套」是文本分析专用的固定分组：不能改名，也固定在最后"
        : fixed
          ? "「未分组」是程序自带的固定分组：不能改名、也不能删除"
          : "拖动这一行＝整体调整分组显示顺序 · 双击组名＝重命名"
    }">
      <button class="icon-btn grp-toggle" data-group-id="${esc(g.id)}" title="${collapsed ? "展开" : "折叠"}">${collapsed ? "▶" : "▼"}</button>
      <span class="group-dot" style="background:${esc(g.color)}"></span>
      <span class="group-name">${esc(groupDisplayName(g))}</span>
      <span class="group-count">${count}</span>
      <span class="group-actions">
        ${batchMode ? `<button class="icon-btn grp-pick" data-group-id="${esc(g.id)}" title="把这一组的人全部勾选 / 取消">☑</button>` : ""}
        ${isExtra ? `<button class="icon-btn grp-promote" data-group-id="${esc(g.id)}" title="把出场较多的角色移出「龙套」">⇧</button>` : ""}
        ${
          fixed
            ? ""
            : `<button class="icon-btn grp-rename" data-group-id="${esc(g.id)}" title="重命名分组">✎</button>
        <button class="icon-btn grp-del" data-group-id="${esc(g.id)}" title="删除分组（组内人物回到「未分组」，不会被删）">×</button>`
        }
      </span>
    </div>`;
  }

  function ungroupedHeadHtml(count) {
    const collapsed = !!state.ungroupedCollapsed;
    return `<div class="group-head ${collapsed ? "collapsed" : ""}" data-group-id="">
      <button class="icon-btn grp-toggle ungrouped-toggle" title="${collapsed ? "展开" : "折叠"}">${collapsed ? "▶" : "▼"}</button>
      <span class="group-dot" style="background:#6b6480"></span>
      <span class="group-name">${esc(uiTextFor("未分组"))}</span>
      <span class="group-count">${count}</span>
      ${batchMode ? `<span class="group-actions"><button class="icon-btn grp-pick" data-group-id="" title="把未分组的人全部勾选 / 取消">☑</button></span>` : ""}
    </div>`;
  }

  /* ================= 人物链 =================
     一条链＝把 2 张以上人物卡串在一起，表示「同一个人在不同时期 / 另一个身份」，
     所以它们不该被合并。链只影响界面提示与自动合并的候选（同链不再提示合并），
     不会动任何卡片内容。一个角色最多属于一条链。 */
  function charChains() {
    if (!Array.isArray(state.charChains)) state.charChains = [];
    return state.charChains;
  }
  function chainOfChar(charId) {
    if (!charId) return null;
    return charChains().find((ch) => ch && Array.isArray(ch.memberIds) && ch.memberIds.includes(charId)) || null;
  }
  function chainMembersOf(chain) {
    if (!chain) return [];
    return (chain.memberIds || []).map((id) => getChar(id)).filter(Boolean);
  }
