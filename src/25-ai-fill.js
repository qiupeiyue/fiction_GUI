  /* ================= AI 自动更新（设定档案 / 人物势力分析） ================= */
  // 把小说现有信息压缩成给模型的上下文
  function agentStoryContext(maxText) {
    const parts = [];
    const chars = state.characters || [];
    if (chars.length) {
      parts.push(
        "【人物】\n" +
          chars
            .map((c) => {
              const alias = (c.aliases || []).filter(Boolean).slice(0, 6);
              const fac = (c.factionIds || [])
                .map((id) => (getEntry(id) || {}).name)
                .filter(Boolean);
              // 文本分析写进字段的那份「所属势力」也一并带上（两处都可能有）
              (c.fields || []).forEach((f) => {
                const lb = String((f && f.label) || "");
                if (!/(所属势力|势力|阵营)/.test(lb)) return;
                String((f && f.value) || "")
                  .split(/[、,，;；/／]/)
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .forEach((n) => {
                    if (!fac.includes(n)) fac.push(n);
                  });
              });
              return (
                c.name +
                (c.role ? "（" + c.role + "）" : "") +
                (alias.length ? " · 别名：" + alias.join("、") : "") +
                (fac.length ? " · 所属：" + fac.slice(0, 8).join("、") : "")
              );
            })
            .join("\n")
      );
    }
    const evs = (state.events || []).slice(0, 150);
    if (evs.length) {
      parts.push(
        "【事件】\n" +
          evs
            .map((e) => {
              const who = (e.characterIds || [])
                .map((id) => (getChar(id) || {}).name)
                .filter(Boolean)
                .join("、");
              const brief = [e.cause, e.process, e.result].filter(Boolean).join(" / ").slice(0, 120);
              /* 地点 / 章 / 节 / 备注都要带上：刷新「地点」「纪年」这些类别时，
                 证据全在事件卡上（用户常常就是直接在事件里填的地点）。 */
              const ch = e.chapterId ? getChapter(e.chapterId) : null;
              const sr = e.sectionId ? getSection(e.sectionId) : null;
              const band = [ch && ch.title, sr && sr.section && sr.section.title].filter(Boolean).join(" / ");
              const place = String(e.place || "").trim();
              const notes = String(e.notes || "").trim().slice(0, 80);
              return (
                "· " +
                e.title +
                (e.time ? "（" + e.time + "）" : "") +
                (band ? " · " + band : "") +
                (place ? " · 地点：" + place : "") +
                (who ? " 登场：" + who : "") +
                (brief ? "　" + brief : "") +
                (notes ? "　注：" + notes : "")
              );
            })
            .join("\n")
      );
    }
    // 设定条目：列出每一类已经有哪些（刷新某一类时，别把已有的又造一遍）
    {
      const cats = (state.settings && state.settings.categories) || [];
      const lines = cats
        .map((cat) => {
          const names = (state.settings.entries || [])
            .filter((en) => en.categoryId === cat.id)
            .map((en) => String(en.name || "").trim())
            .filter(Boolean);
          return names.length ? "· " + catDisplayName(cat) + "：" + names.slice(0, 40).join("、") : "";
        })
        .filter(Boolean);
      if (lines.length) parts.push("【设定条目】\n" + lines.join("\n"));
    }
    const texts = [];
    (state.analysis.tasks || []).forEach((t) => {
      (t.files || []).forEach((f) => {
        if (f.text) texts.push(f.text);
      });
    });
    if (texts.length) {
      parts.push("【原文摘录】\n" + texts.join("\n\n").slice(0, maxText || 12000));
    }
    return parts.join("\n\n");
  }

  // 文本分析时附给模型看的「工作区已有信息」：让它沿用已有写法，并主动判断该合并到谁
  function workspaceContextForPrompt() {
    const parts = [];
    const chars = state.characters || [];
    if (chars.length) {
      const CAP = 120;
      const list = chars.slice(0, CAP).map((c) => {
        const alias = (c.aliases || []).filter(Boolean);
        const fac = (c.factionIds || [])
          .map((id) => (getEntry(id) || {}).name)
          .filter(Boolean);
        return (
          "· " +
          c.name +
          (alias.length ? "（别名：" + alias.join("、") + "）" : "") +
          (c.role ? " · " + c.role : "") +
          (fac.length ? " · 所属：" + fac.join("、") : "")
        );
      });
      parts.push(
        "【人物】共 " +
          chars.length +
          " 个\n" +
          list.join("\n") +
          (chars.length > CAP ? "\n（还有 " + (chars.length - CAP) + " 个未列出）" : "")
      );
    }
    (((state.settings && state.settings.categories) || [])).forEach((cat) => {
      const list = (state.settings.entries || []).filter((en) => en.categoryId === cat.id);
      if (!list.length) return;
      const CAP = 100;
      parts.push(
        "【" +
          cat.name +
          "】共 " +
          list.length +
          " 条：" +
          list
            .slice(0, CAP)
            .map((en) => en.name)
            .join("、") +
          (list.length > CAP ? "…（还有 " + (list.length - CAP) + " 条）" : "")
      );
    });
    const lines = state.lines || [];
    if (lines.length) {
      parts.push(
        "【线路】" +
          lines
            .map((l) => `${l.code || "?"} ${l.name || ""}${l.kind ? "（" + l.kind + "）" : ""}`.trim())
            .join("、")
      );
    }
    const chs = state.chapters || [];
    if (chs.length) {
      const CAP = 60;
      parts.push(
        "【章节】共 " +
          chs.length +
          " 章：" +
          chs
            .slice(0, CAP)
            .map((c) => c.title || "")
            .filter(Boolean)
            .join("、") +
          (chs.length > CAP ? "…（还有 " + (chs.length - CAP) + " 章）" : "")
      );
    }
    const evs = state.events || [];
    if (evs.length) {
      const CAP = 120;
      parts.push(
        "【事件】共 " +
          evs.length +
          " 个（标题（时间）［地点］）：\n" +
          evs
            .slice(0, CAP)
            .map((e) => "· " + e.title + (e.time ? "（" + e.time + "）" : "") + (e.place ? "［" + e.place + "］" : ""))
            .join("\n") +
          (evs.length > CAP ? "\n（还有 " + (evs.length - CAP) + " 个未列出）" : "")
      );
    }
    if (!parts.length) return ""; // 新项目，暂时没什么可参考的
    return (
      "\n\n=== 工作区已有信息（用户已经整理好的内容，请充分利用）===\n" +
      parts.join("\n\n") +
      "\n\n【怎么用这些已有信息】\n" +
      "1) 人物：本段文本里出现的人，只要和上面某个人物的名字或别名是同一个人，character 的 name 一律用上面那个已有正式名，其余叫法写进「别名」；并额外输出一条 merge 记录（「同一人物」列出所有叫法）。不要因为写法不同就当成新人物。\n" +
      "2) 事件：如果这段文本讲的其实是上面已有事件里的某一件（标题相近，或同一时间 / 同一地点讲的是同一件事），event 的 name 直接沿用已有事件的标题（回填时会自动并到同一条，不会重复）。确实是新事件才用新标题。\n" +
      "3) 设定条目：物品 / 名词 / 地点 / 势力 / 纪年，如果已有同名或同义的条目，name 用已有条目的写法，不要另造一个近似的写法。\n" +
      "4) 时间与地点：如果和上面已有事件里的一致，沿用出现过的写法（例如「星历一年」「王都·白塔」），不要写成只差一个空格或标点的近似值。\n" +
      "5) 这些只是参考：不要因为它们出现过就凭空输出记录，仍然只抽取本段文本里真实出现的内容。"
    );
  }

  // 把模型给出的人物姓名（含别名）换成人物 id
  function resolveCharacterIdsByName(names) {
    const ids = [];
    (names || []).forEach((raw) => {
      const key = normTitle(raw);
      if (!key) return;
      const c = state.characters.find(
        (x) => normTitle(x.name) === key || (x.aliases || []).some((a) => normTitle(a) === key)
      );
      if (c && !ids.includes(c.id)) ids.push(c.id);
    });
    return ids;
  }

  async function withAgent(btn, busyText, job) {
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
    const old = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = busyText;
    }
    try {
      await job(cfg);
    } catch (err) {
      uiAlert("自动更新失败：" + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = old || "自动更新";
      }
    }
  }

  const SETTING_REFRESH_PROMPT = [
    "你是小说设定整理助手。根据给出的资料，整理「{CATEGORY}」这一类设定条目。",
    "规则：",
    "1. 只依据资料，不要编造；资料里没提到的东西不要写。",
    "2. 合并指同一事物的不同称呼；补全缺失字段；修正明显错误。",
    "3. 每个条目的 fields 用中文标签，挑 2-5 个最有信息量的字段。",
    "4. characters 写与这条设定相关的人物姓名，必须与资料中人物姓名一致，没有就给空数组。",
    '5. 只输出 JSON，不要解释、不要 markdown：{"entries":[{"name":"","fields":[{"label":"","value":""}],"summary":"","characters":[]}]}',
  ].join("\n");

  // 设定档案：按当前类别让 AI 刷新条目
  async function refreshSettingCategory() {
    const cat = getCat(selectedCategoryId);
    if (!cat) return;
    const btn = $("#entry-agent-refresh-btn");
    await withAgent(btn, "识别中…", async (cfg) => {
      const existing = state.settings.entries.filter((e) => e.categoryId === cat.id);
      const text =
        SETTING_REFRESH_PROMPT.replace("{CATEGORY}", cat.name) +
        textStyleHint() +
        "\n\n" +
        genreSenseHint() +
        "\n\n" +
        agentStoryContext(12000) +
        "\n\n【现有「" +
        cat.name +
        "」条目】\n" +
        (existing.length
          ? existing
              .map(
                (e) =>
                  "· " +
                  e.name +
                  "：" +
                  (e.fields || []).map((f) => f.label + "=" + f.value).join("；") +
                  (e.summary ? "；概述=" + e.summary : "")
              )
              .join("\n")
          : "（暂无）");
      const res = await callAgent(cfg, text, null);
      applySettingRefresh(cat, res);
    });
  }

  function applySettingRefresh(cat, res) {
    const list = res && Array.isArray(res.entries) ? res.entries : [];
    if (!list.length) {
      uiAlert("模型没有返回可用的条目，这次没有改动。");
      return;
    }
    pendingUndoLabel = `AI 自动更新「${catDisplayName(cat)}」设定`;
    let added = 0;
    let updated = 0;
    /* 势力类别：成员（条目这边的「关联人物」和人物那边的「所属势力」）也要听
       「输入保护 → 人物 · 所属势力」这一条：锁定＝两边都不动，非空锁定＝只补空着的。 */
    const isFactionCat = catKind(cat) === "faction";
    const factionMode = isFactionCat ? protectModeOf("char:faction") : "";
    list.forEach((r) => {
      const name = String((r && r.name) || "").trim();
      if (!name) return;
      if (protectModeOf("entry:" + cat.id) === "lock") return; // 这一类锁定：完全不动
      const fields = (r.fields || []).filter((f) => f && (f.label || f.value));
      const charIds = resolveCharacterIdsByName(r.characters || []);
      const existing = state.settings.entries.find(
        (e) => e.categoryId === cat.id && normTitle(e.name) === normTitle(name)
      );
      if (existing) {
        // 听输入保护：逐字段合并，不再整体覆盖
        if (fields.length) {
          if (!Array.isArray(existing.fields)) existing.fields = [];
          fields.forEach((f) => {
            const label = String((f && f.label) || "").trim();
            const value = String((f && f.value) || "").trim();
            if (!label || !value) return;
            const own = existing.fields.find((x) => String((x && x.label) || "").trim() === label);
            const next = protectTextValue(protectEntryFieldKey(cat.id, label), own ? own.value : "", value);
            if (!next) return;
            if (!own) existing.fields.push({ label, value: next });
            else own.value = next;
          });
        }
        if (r.summary) {
          existing.summary = protectTextValue(protectEntryFieldKey(cat.id, "概述"), existing.summary, String(r.summary).trim());
        }
        if (charIds.length) {
          const membersEmpty = !(existing.characterIds || []).length;
          const canFillMembers = factionMode !== "lock" && !(factionMode === "lockEmpty" && !membersEmpty);
          if (canFillMembers) existing.characterIds = Array.from(new Set((existing.characterIds || []).concat(charIds)));
        }
        updated++;
      } else {
        // 新条目：每个字段也按保护方式决定写不写（锁着的字段不写进来）
        const keptFields = [];
        fields.forEach((f) => {
          const label = String((f && f.label) || "").trim();
          const value = String((f && f.value) || "").trim();
          if (!label || !value) return;
          const next = protectTextValue(protectEntryFieldKey(cat.id, label), "", value);
          if (!next) return;
          keptFields.push({ label, value: next });
        });
        const summary = r.summary
          ? protectTextValue(protectEntryFieldKey(cat.id, "概述"), "", String(r.summary).trim())
          : "";
        if (!keptFields.length && !summary) return; // 字段都被锁着：这条干脆不建
        state.settings.entries.push({
          id: uid(),
          categoryId: cat.id,
          name,
          groupId: "",
          fields: keptFields,
          summary,
          tags: ["AI"],
          characterIds: charIds,
          eventIds: [],
          notes: "",
        });
        added++;
      }
    });
    /* 势力类别：把成员写回人物身上（同一套保护：锁定不动、非空锁定只补还没归属的人） */
    if (isFactionCat && factionMode !== "lock") {
      state.settings.entries
        .filter((e) => e.categoryId === cat.id)
        .forEach((en) => {
          (en.characterIds || []).forEach((cid) => {
            const c = getChar(cid);
            if (!c) return;
            if (factionMode === "lockEmpty" && (c.factionIds || []).length) return;
            if (!(c.factionIds || []).includes(en.id)) c.factionIds = (c.factionIds || []).concat(en.id);
          });
        });
    }
    saveState();
    renderEntries();
    renderCategories();
    renderCharacters();
    renderStats();
    uiAlert("「" + catDisplayName(cat) + "」自动更新完成：新增 " + added + " 条、更新 " + updated + " 条。");
  }

  /* ---- 关系类型：内置六种 + 用户自定义 ---- */
  const REL_KIND_PALETTE = ["#8DA0CB", "#66C2A5", "#E78AC3", "#BC80BD", "#9E9AC8", "#86A5D6", "#A3C4A3", "#B3B3B3", "#7FA9C9", "#C0A6C8"];

  function relKindList() {
    const list = ensureRelKinds();
    relocalizeRelKinds();
    return list;
  }

  /* 关系类型的「规范名」→ 当前语言下的写法。
     内置类型内部一律用规范名（亲属 / 师徒…）做判断，存进关系里的名字按语言取，
     这样英文项目里类型就叫 Family / Mentor…，而识别逻辑还是认同一套规范名。 */
  function relKindNameOf(canon) {
    const c = String(canon || "");
    const hit = relKindList().find((k) => k && (k.canon === c || k.name === c));
    return hit ? hit.name : c;
  }
  /* ---- 内置关系类型的名字跟着界面语言走（老工作区是用中文建的，落盘的也是中文名）----
     认「出厂名」：名字等于任意一种语言里的出厂名 ⇒ 用户没改过它，切语言时跟着改；
     作者自己改过的名字（「家人」这种）原样保留。自定义类型不参与。 */
  let relKindLangMapCache = null;
  function relKindLangMap() {
    if (relKindLangMapCache) return relKindLangMapCache;
    const m = new Map();
    const absorb = (rows) => {
      (rows || []).forEach((row) => {
        const canon = String((row && row[0]) || "").trim();
        if (!canon || !Object.prototype.hasOwnProperty.call(REL_KINDS, canon) || m.has(canon)) return;
        const names = {};
        UI_LANGS.forEach((id, i) => {
          names[id] = String((row && row[i]) || canon).trim() || canon;
        });
        m.set(canon, names);
      });
    };
    absorb(UI_DEFAULT_TERMS);
    absorb(UI_TERMS);
    relKindLangMapCache = m;
    return m;
  }
  function relKindBuiltinName(canon) {
    const c = String(canon || "");
    const m = relKindLangMap().get(c);
    if (!m) return c;
    return m[uiLanguage()] || m["zh-CN"] || c;
  }
  // 这个名字是不是某个内置类型的出厂名（是就返回那个内置类型，否则返回 ""）
  function relKindCanonOfName(name) {
    const n = String(name == null ? "" : name).trim();
    if (!n) return "";
    if (Object.prototype.hasOwnProperty.call(REL_KINDS, n)) return n;
    const m = relKindLangMap();
    for (const [canon, names] of m) {
      if (names["zh-CN"] === n || names["zh-TW"] === n || names.en === n || names.ja === n) return canon;
    }
    return "";
  }
  function relocalizeRelKinds() {
    const list = Array.isArray(state.relKinds) ? state.relKinds : null;
    if (!list || !list.length) return;
    const renamed = new Map();
    let touched = false;
    list.forEach((k) => {
      if (!k || !k.name) return;
      // 只看「现在的名字」：名字不是任何语言里的出厂名，就说明作者改过名（或这是自定义类型），
      // 名字一个字都不动 —— 只补 canon，方便「链接」这类内置判断继续认得它。
      const canon = relKindCanonOfName(k.name);
      if (!canon || REL_KINDS[canon] === undefined) return;
      if (!k.canon) {
        k.canon = canon; // 老数据没有 canon，补上
        touched = true;
      }
      const want = relKindBuiltinName(canon);
      if (!want || want === k.name) return;
      // 目标名字已经被别的类型占了就不动，免得撞车
      if (list.some((x) => x && x !== k && x.name === want)) return;
      renamed.set(k.name, want);
      k.name = want;
      touched = true;
    });
    (state.relations || []).forEach((r) => {
      if (!r) return;
      const hit = renamed.get(String(r.kind || "其他"));
      if (hit) {
        r.kind = hit;
        touched = true;
      }
    });
    Array.from(relKindFilters).forEach((n) => {
      if (renamed.has(n)) {
        relKindFilters.delete(n);
        relKindFilters.add(renamed.get(n));
      }
    });
    return touched;
  }
  function relKindHasCanon(canon) {
    const c = String(canon || "");
    return relKindList().some((k) => k && (k.canon === c || k.name === c));
  }

  // 关系类型：从没建过就补一套内置的（用户把类型全删光也尊重他的选择）。
  // 老版本内置的「盟友」拆成「朋友」（私交亲密）+「同事」（立场一致、未必私交）；
  // 后来叫过的「同盟」一并改名为「同事」。已有的这类关系跟着归位（幂等，跑几次都安全）。
  function ensureRelKinds() {
    if (!Array.isArray(state.relKinds)) {
      state.relKinds = Object.keys(REL_KINDS).map((k) => ({ name: uiTextFor(k), canon: k, color: REL_KINDS[k], builtin: true }));
      state.relKindLinkSeeded = true;
      return state.relKinds;
    }
    const list = state.relKinds;
    const has = (name) => list.some((k) => k && k.name === name);
    // ④ 「链接」：人物链专用的类型。老工作区补一个（补过一次就不再管用户删没删）
    // 注意：这里不能用 relKindHasCanon（它会回头调 ensureRelKinds，自己递归自己）
    const hasCanon = (c) => list.some((k) => k && (k.canon === c || k.name === c));
    if (!state.relKindLinkSeeded && !hasCanon("链接")) {
      list.push({ name: uiTextFor("链接"), canon: "链接", color: REL_KINDS["链接"], builtin: true });
      state.relKindLinkSeeded = true;
    }
    // ① 老内置「盟友」→「朋友」+「同事」
    const allyIdx = list.findIndex((k) => k && k.name === "盟友");
    if (allyIdx >= 0) {
      const oldColor = list[allyIdx].color;
      const add = [];
      if (!has("朋友")) add.push({ name: "朋友", color: REL_KINDS["朋友"], builtin: true });
      if (!has("同事")) add.push({ name: "同事", color: oldColor || REL_KINDS["同事"], builtin: true });
      list.splice(allyIdx, 1, ...add);
    }
    // ② 上一版的「同盟」→「同事」
    const unionIdx = list.findIndex((k) => k && k.name === "同盟");
    if (unionIdx >= 0) {
      if (has("同事")) list.splice(unionIdx, 1);
      else list[unionIdx].name = "同事";
    }
    // ③ 已有关系里的老叫法归位
    if (has("同事")) {
      (state.relations || []).forEach((r) => {
        if (r && (r.kind === "盟友" || r.kind === "同盟")) r.kind = "同事";
      });
    }
    return list;
  }

  function relKindColor(name) {
    const hit = relKindList().find((k) => k.name === name);
    return (hit && hit.color) || REL_KINDS["其他"];
  }

  function relKindExists(name) {
    return relKindList().some((k) => k.name === name);
  }

  // 告诉模型：这部作品现在可用的关系类型（改名 / 删过之后也以这份为准）
  function customRelKindsHint() {
    try {
      const list = relKindList();
      if (!list.length) return "";
      return `\n\n【本作品的人物关系类型（relation 的「类型」字段请从这里选）】${list.map((k) => k.name).join(" / ")}`;
    } catch (e) {
      return "";
    }
  }

  // 设置 → 人物 → 关系网：和「人物分析」界面的关系网是同一份数据（增加 / 改名 / 删除）
  // 恢复默认：关系类型回到内置的那几种；用到被去掉类型的连线改归「其他」（不删连线）
  function resetRelKinds() {
    const defs = Object.keys(REL_KINDS).map((k) => ({ name: relKindBuiltinName(k), canon: k, color: REL_KINDS[k], builtin: true }));
    const names = new Set(defs.map((d) => d.name));
    const other = relKindBuiltinName("其他");
    const fallback = names.has(other) ? other : defs.length ? defs[0].name : "";
    pushSettingsUndo("关系网恢复默认");
    state.relKinds = defs;
    let moved = 0;
    (state.relations || []).forEach((r) => {
      if (names.has(r.kind || other)) return;
      if (!fallback) return;
      r.kind = fallback;
      moved++;
    });
    Array.from(relKindFilters).forEach((k) => { if (!names.has(k)) relKindFilters.delete(k); });
    pendingUndoLabel = "关系网：恢复默认";
    settingsUndoGuard = true;
    try {
      saveState();
    } finally {
      settingsUndoGuard = false;
    }
    renderManageRelKinds();
    renderRelations();
    showToast(`关系类型已恢复默认${moved ? `（${moved} 条连线改归「${fallback}」）` : ""}（可撤销）`);
  }

  function renderManageRelKinds() {
    const box = $("#manage-relkind");
    if (!box) return;
    const list = relKindList();
    box.innerHTML = list.length
      ? list
          .map((k, i) =>
            manageRowHtml(
              "relkind",
              k.name,
              relKindColor(k.name),
              isChainKindName(k.name)
                ? uiTextFor("「链接」是人物链专用的类型，不能删除（可以改名）")
                : "删除这个关系类型（用到它的连线一并删除，可撤销）",
              `<input type="text" class="manage-name" data-manage-name="relkind" value="${esc(
                k.name
              )}" placeholder="关系类型名" title="改名（用到它的连线一起改，可撤销）" />`,
              i,
              false,
              isChainKindName(k.name) ? { delDisabled: true } : null
            )
          )
          .join("")
      : `<div class="manage-empty">还没有关系类型，点右上角「＋ 新建」。</div>`;
    bindManageDrag("relkind", box);
  }

  // 新建一个自定义关系类型；返回新类型名（取消返回 ""）
  async function addCustomRelKind() {
    const v = await uiPrompt("新关系类型的名称？", "");
    if (v === null) return "";
    const name = String(v).trim();
    if (!name) return "";
    const list = relKindList();
    const hit = list.find((k) => k.name === name);
    if (hit) {
      showToast(`「${name}」已经存在`);
      return name;
    }
    pendingUndoLabel = `新建关系类型：「${name}」`;
    list.push({ name, color: REL_KIND_PALETTE[list.length % REL_KIND_PALETTE.length] });
    saveState();
    showToast(`已新建关系类型「${name}」`);
    return name;
  }

  // 关系弹窗里的类型下拉：内置 + 自定义 +「新建类型」
  function renderRelKindSelect(selected) {
    const sel = $("#rel-kind");
    if (!sel) return;
    sel.innerHTML =
      relKindList()
        .map((k) => `<option value="${esc(k.name)}">${esc(k.name)}</option>`)
        .join("") + `<option value="__new__">＋ 新建…</option>`;
    sel.value = relKindExists(selected) ? selected : (relKindList()[0] || {}).name || "";
    sel.dataset.prev = sel.value;
    paintRelKindDot(sel.value);
  }

  // 类型色点：和关系图例里那个颜色一致
  function paintRelKindDot(kind) {
    const dot = $("#rel-kind-dot");
    if (dot) dot.style.background = relKindColor(kind);
  }

  // 重命名一个关系类型（内置的也能改，连带改掉所有用到它的关系）
  async function renameRelKind(name, newName) {
    const list = relKindList();
    const hit = list.find((k) => k.name === name);
    if (!hit) return;
    let next = String(newName == null ? "" : newName).trim();
    if (newName == null) {
      const v = await uiPrompt(`把关系类型「${name}」改名为？`, name);
      if (v === null) return;
      next = String(v).trim();
    }
    if (!next || next === name) return;
    if (relKindExists(next)) {
      uiAlert(`「${next}」已经存在了。`);
      return;
    }
    pendingUndoLabel = `重命名关系类型：「${name}」→「${next}」`;
    hit.name = next;
    (state.relations || []).forEach((r) => {
      if ((r.kind || "其他") === name) r.kind = next;
    });
    if (relKindFilters.has(name)) { relKindFilters.delete(name); relKindFilters.add(next); }
    saveState();
    renderRelations();
  }

  // 删除一个关系类型（内置的也能删；用到它的关系连线一并删除）
  async function deleteRelKind(name) {
    // 「链接」跟着人物链走，删了链就没法记录了 —— 只给改名，不给删
    if (isChainKindName(name)) {
      uiAlert(uiTextFor("「链接」是人物链专用的类型，不能删除（可以改名）。"));
      return;
    }
    const list = relKindList();
    const hit = list.find((k) => k.name === name);
    if (!hit) return;
    const victims = (state.relations || []).filter((r) => (r.kind || "其他") === name);
    const rest = list.filter((k) => k.name !== name);
    // 关系类型属于设定类：不弹二次确认，相关连线一并删掉，可以用「撤销」还原
    const before = {
      relations: JSON.parse(JSON.stringify(state.relations || [])),
      relKinds: JSON.parse(JSON.stringify(state.relKinds || [])),
    };
    pendingUndoLabel = `删除关系类型：「${name}」`;
    state.relKinds = rest;
    if (victims.length) {
      const ids = new Set(victims.map((r) => r.id));
      state.relations = (state.relations || []).filter((r) => !ids.has(r.id));
    }
    relKindFilters.delete(name);
    saveState();
    renderRelations();
    showRelDeleteUndoBar(`删除关系类型：「${name}」（可撤销）`, before);
    showToast(`已删除关系类型「${name}」${victims.length ? `，同时删掉 ${victims.length} 条关系连线` : ""}`);
  }

  // 模型 / 旧数据可能还写着老叫法，先归一到当前的关系类型
  const REL_KIND_ALIAS = {
    盟友: "同事",
    盟友关系: "同事",
    结盟: "同事",
    同盟: "同事",
    恋人: "恋爱",
    情侣: "恋爱",
    爱人: "恋爱",
    好友: "朋友",
  };

  function pickRelKind(rawKind, label) {
    const raw = String(rawKind || "").trim();
    let fixed = REL_KIND_ALIAS[raw] || raw;
    // 模型可能给规范名（亲属）、也可能给当前语言下的写法（Family），两种都认
    if (fixed && !relKindExists(fixed) && !relKindHasCanon(fixed)) fixed = "";
    if (fixed) fixed = relKindNameOf(fixed);
    // 兜底：只写到男女朋友 / 恋人 / 交往这类，不算「亲属」（已婚的夫妻 / 配偶才算）
    if (
      relKindHasCanon(fixed) &&
      relKindNameOf(fixed) === relKindNameOf("亲属") &&
      /男女朋友|男朋友|女朋友|男友|女友|恋人|情侣|交往|恋爱|订婚|未婚妻|未婚夫|告白|表白|暗恋|单恋/.test(
        String(label || "")
      ) &&
      relKindHasCanon("恋爱")
    ) {
      fixed = relKindNameOf("恋爱");
    }
    if (fixed) return fixed;
    return relKindNameOf(inferKind(label));
  }

  function inferKind(text) {
    const t = String(text || "");
    let guess = "其他";
    // 明确的恋爱词先判（「未婚妻 / 未婚夫」这类不该被下面的「妻 / 夫」抢走）；「恋爱」不看性别
    if (
      /恋人|爱人|情人|情侣|男女朋友|男朋友|女朋友|男友|女友|婚约|订婚|未婚妻|未婚夫|交往|谈恋爱|恋爱|相恋|相爱|爱慕|追求|示爱|暗恋|单恋|心上人|初恋|伴侣|告白|表白|求婚|吃醋|占有欲|初吻|殉情|吻(?!合)|亲了|轻吻|唇|深吻|热吻|舌吻|拥吻|激吻|拥抱|相拥|拥入怀中|搂|抱在一起|牵手|十指相扣|依偎|亲昵|缠绵|耳鬓厮磨|抚摸|同床|共枕|初夜|一夜情/.test(
        t
      )
    )
      guess = "恋爱";
    // 师门称谓先判：「师姐 / 师兄」是同事，别被下面的「姐 / 兄」当成亲属
    else if (/师父|师傅|师尊|师叔|师伯|师姑|师娘/.test(t)) guess = "师徒";
    else if (/师兄|师弟|师姐|师妹|同门|同窗/.test(t)) guess = "同事";
    // 亲属只认亲属称谓本身：以前写成 /父|母|儿|女|兄|弟…/ 这种单字，
    // 「少女」「男女朋友」里的「女」、「幼儿」里的「儿」都会被误判成亲属，所以改成词表。
    // 已婚（夫妻 / 配偶）算亲属，恋爱 / 订婚阶段算恋爱。
    else if (
      /父亲|母亲|父母|爸妈|爸爸|妈妈|老爸|老妈|爹|娘|儿子|女儿|儿女|兄长|兄弟|兄妹|姐妹|哥哥|弟弟|姐姐|妹妹|兄弟姐妹|祖父|祖母|爷爷|奶奶|外公|外婆|姥姥|姥爷|外祖父|外祖母|孙子|孙女|外孙|外孙女|祖孙|叔|伯|姑|舅|姨|侄子|侄女|外甥|外甥女|堂亲|堂兄|堂弟|堂姐|堂妹|表亲|表兄|表弟|表姐|表妹|表哥|表姐|家族|血亲|亲生|养父|养母|养子|养女|义父|义母|义子|义女|继父|继母|干爹|干妈|干儿子|干女儿|岳父|岳母|公公|婆婆|女婿|儿媳|妻子|丈夫|老婆|老公|夫妻|配偶|夫君|娘子|嫂子|弟妹|姐夫|妹夫|妯娌|亲家|母|父|兄|弟|姐|妹|妻|夫/.test(
        t
      )
    )
      guess = "亲属";
    // 师徒只认明确的师承称谓：「学生 / 老师 / 同学」这种角色词不算
    //（「木讷的幽灵学生」「平日有学生与…」就是这么被误判成师徒的）
    else if (/师徒|师父|师傅|师尊|师叔|师伯|弟子|徒弟|学徒|门生|传人|拜师|收徒|授业|恩师|关门弟子|亲传/.test(t))
      guess = "师徒";
    else if (/仇|敌|恨|对立|宿敌|杀|背叛|追杀|冲突/.test(t)) guess = "敌对";
    else if (/爱|恋|婚约|情人|情侣|未婚|暗恋|心上人/.test(t)) guess = "恋爱";
    // 私交亲密 → 朋友；只有立场 / 合作（同事、同僚、战友…）→ 同事
    else if (/朋友|好友|挚友|知己|死党|青梅竹马|伙伴|同伴|友人|交往甚密/.test(t)) guess = "朋友";
    else if (/同事|同僚|同盟|盟友|结盟|联盟|联合|阵营|同阵营|合作|共谋|战友|搭档|上下级|上司|下属|主人|仆人/.test(t)) guess = "同事";
    else if (/友/.test(t)) guess = "朋友";
    // 这些内置类型可能被改名 / 删除，改不了就退回当前列表里的第一个
    if (relKindExists(guess)) return guess;
    const list = relKindList();
    if (list.some((k) => k.name === "其他")) return "其他";
    return (list[0] || {}).name || guess;
  }

  // 带上下文的关系判断：一句原文里出现了关系词时，用「整句」再校正一次。
  // 最典型的是「吻」和「拥抱」——亲嘴唇 / 深吻是恋爱，亲额头、脸颊、手背，
  // 或者安慰、道别、长辈对孩子，就不该算恋爱。
  function inferKindFromText(keyword, sentence) {
    const kw = String(keyword || "");
    const s = String(sentence || "");
    let guess = inferKind(kw);
    const isContact = /吻|亲了|亲了亲|抱|搂|牵手|拉手|依偎|贴面|抚摸|同床/.test(kw + s) && /吻|抱|搂|牵手|依偎|抚摸|贴面/.test(s);
    if (!isContact) return guess;
    // ① 明确的情欲 / 暧昧信号 → 恋爱（覆盖「亲额头」被误判的情况）
    const romantic =
      /唇|舌头|舌吻|深吻|热吻|激吻|拥吻|吻到|吻住|缠绵|恋|告白|表白|心动|心跳|脸红|脸热|耳根|屏息|吃醋|占有欲|初吻|情欲|呼吸/.test(s);
    // ② 明确的长辈 / 亲情 / 礼节 / 安慰信号 → 不算恋爱
    const platonic =
      /额头|脸颊|脸侧|手背|手心|头顶|贴面|晚安|哄睡|睡吧|安慰|别哭|辛苦|乖|孩子|女儿|儿子|妹妹|弟弟|姐姐|哥哥|妈妈|母亲|爸爸|父亲|奶奶|爷爷|外婆|外公|长辈|礼节|礼仪|道别|送别|祝福|告别|打闹|玩笑|打趣|调侃|嬉闹|闹着玩|兄弟|朋友|战友|拍肩|拍拍/.test(s);
    if (romantic && !platonic) return "恋爱";
    if (platonic && !romantic) {
      // 亲人之间 → 亲属；其它按句子里出现的身份词判，实在没有就算「其他」
      if (/妈妈|母亲|爸爸|父亲|奶奶|爷爷|外婆|外公|长辈|女儿|儿子|妹妹|弟弟|姐姐|哥哥|孩子/.test(s)) return "亲属";
      if (/朋友|兄弟|闺蜜|战友|伙伴|同伴/.test(s)) return "朋友";
      return relKindExists("其他") ? "其他" : guess;
    }
    return guess;
  }

  function addRelation(fromId, toId, label, kind, note) {
    if (!fromId || !toId || fromId === toId) return false;
    if (!getChar(fromId) || !getChar(toId)) return false;
    // 「链接」是人物链专用的类型，不参与文本自动识别：识别 / 一键生成 / 填入都不会写它
    if (isChainKindName(kind)) return false;
    // 人名体检：章节标题、描述性短语都不是人名，别拿它们编关系
    if (looksLikeNonNameCharacter(getChar(fromId).name) || looksLikeNonNameCharacter(getChar(toId).name)) {
      return false;
    }
    // 听「输入保护 → 人物关系」：全部锁定＝一条都不动；非空锁定＝这对人已经有关系就不再补；
    // 追加＝只新增不改写；兼并＝按识别结果重写这条关系的描述
    const mode = protectModeOf("relation:desc");
    if (mode === "lock") return false;
    let finalKind = kind || inferKind(label);
    // 类型复核：师徒 / 亲属这类必须有对应称谓依据，否则按文本重新推断；再撑不住就不建。
    if (!relKindSupported(finalKind, `${label || ""} ${note || ""}`)) {
      const wasKind = finalKind;
      // 只用「依据 / 关系描述」重新推断（标签常常就是把类型名抄了一遍，说明不了问题）
      const basis = `${String(note || "").trim()} ${String(label || "").trim() === wasKind ? "" : String(label || "").trim()}`;
      const better = inferKind(basis);
      if (!relKindExists(better) || better === "其他" || better === wasKind) return false;
      if (!relKindSupported(better, basis)) return false;
      finalKind = better;
      if (String(label || "").trim() === wasKind) label = finalKind;
    }
    const samePair = (r) =>
      (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId);
    // 同一对人物可以「多种关系并存」（既是亲属又是同事、既是朋友又在恋爱…），
    // 所以只有「对同两个人 + 同一个类型」才算重复；写法和标签不同也按重复处理，免得堆一堆同义条目。
    const existingSame = (state.relations || []).find((r) => samePair(r) && (r.kind || "其他") === finalKind);
    if (existingSame) {
      if (mode !== "merge") return false;
      let changed = false;
      const nextNote = protectTextValue("relation:desc", existingSame.note, note);
      if (nextNote !== String(existingSame.note || "")) {
        existingSame.note = nextNote;
        changed = true;
      }
      if (label && label !== existingSame.label) {
        existingSame.label = label;
        changed = true;
      }
      return changed;
    }
    if (mode === "lockEmpty" && (state.relations || []).some(samePair)) return false;
    state.relations.push({
      id: uid(),
      fromId,
      toId,
      label: label || "",
      kind: finalKind,
      note: note || "",
      auto: true, // 分析 / 自动生成写进来的关系，供静默关系体检复查
    });
    return true;
  }

  function samePairIds(r, aId, bId) {
    return (r.fromId === aId && r.toId === bId) || (r.fromId === bId && r.toId === aId);
  }

  function hasRelationKind(aId, bId, kind) {
    return (state.relations || []).some((r) => samePairIds(r, aId, bId) && r.kind === kind);
  }

  // 来源一：人物档案的「人际关系 / 备注」文本
  function detectRelationsSilent() {
    let added = 0;
    state.characters.forEach((c) => {
      const text = [c.relationships, c.notes].filter(Boolean).join("\n");
      if (!text.trim()) return;
      state.characters.forEach((o) => {
        if (o.id === c.id) return;
        const names = [o.name].concat(o.aliases || []).filter((n) => n && String(n).length >= 2);
        const hit = names.find((n) => text.includes(n));
        if (!hit) return;
        const idx = text.indexOf(hit);
        // 只取「同一小句」的内容：以前取前后各 14 字，窗口会跨过「；」把不相干的小句拼起来，
        // 于是「相爱；…；Yuki 一起去了很多地方调查」里的「相爱」被算到这一对头上（断章取义）。
        const clause = clauseAround(text, idx, String(hit).length);
        const kind = inferKind(clause);
        if (!kind || kind === "其他") return; // 说不清是什么关系就不建
        const snippet = clause.length > 40 ? clause.slice(0, 40) : clause;
        if (addRelation(c.id, o.id, snippet, kind, `人物档案：${snippet}`)) added++;
      });
    });
    return added;
  }

  // 取包含某段文字的那句话（只在真正的句界切：。！？；和换行），
  // 不切在逗号 / 顿号上——那样会把词语、称呼切成两半，反而错判。
  function clauseAround(text, idx, len) {
    const t = String(text || "");
    const before = t.slice(0, idx);
    const cut = /[。！？；!?;\n]/g;
    let start = 0;
    let m;
    while ((m = cut.exec(before))) start = m.index + 1;
    const rest = t.slice(idx + (len || 0));
    const endM = rest.match(/^[^。！？；!?;\n]*/);
    const end = idx + (len || 0) + (endM ? endM[0].length : 0);
    return t.slice(start, end).replace(/\s+/g, " ").trim();
  }

  // 班级标记：二年B班 / 高三3班 / 初一2班 / 5 班…
  const CLASS_TAG_RE = /(?:[一二三四五六七八九十0-9０-９]{1,3}\s*年\s*[A-Za-z一-龥]{0,2}\s*班|[A-Za-z一-龥]{0,2}\s*[0-9０-９]{1,2}\s*班|(?:class|grade|year)\s*[0-9A-Za-z一二三四五六七八九十]{1,3}\b)/i;
  // 班 / 师生这些词也认英文与日文写法（正文是什么语言就用哪套，和界面语言无关）
  const TEACHER_WORD_RE = /老师|教师|班主任|任教|授课|教书|教官|教练|导师|讲师|先生|教師|担任|teacher|professor|instructor|teaches|taught|lecturer/i;
  const STUDENT_WORD_RE = /学生|就读|在读|上学|念书|班里|班上|學生|在学|クラス|student|pupil|classmate|in class|attends|studies at/i;

  // 来源四：全文明确写了「A 是某班的老师」「B 是某班的学生」→ 同一个班算师生（师徒）。
  // 注意：必须同一个班级 + 老师 / 学生各一侧，才会成关系；光出现「学生」不算。
  function mineTeacherStudentFromText() {
    const chars = state.characters;
    if (chars.length < 2) return 0;
    const nameTable = [];
    chars.forEach((c) => {
      [c.name].concat(c.aliases || []).forEach((n) => {
        const t = String(n || "").trim();
        // 名字也折叠一次 + 转小写：繁简 / 竹字头异体字 / 英文大小写都能对上
        if (t.length >= 2) nameTable.push({ id: c.id, name: t, folded: foldVariant(t).toLowerCase() });
      });
    });
    if (!nameTable.length) return 0;
    const texts = [];
    (state.analysis.tasks || []).forEach((t) =>
      (t.segments || []).forEach((s) => {
        const f = (t.files || []).find((x) => x.id === s.fileId);
        if (f) texts.push((f.text || "").slice(s.start, s.end));
      })
    );
    const normClass = (x) =>
      String(x || "")
        .replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)))
        .replace(/\s+/g, "")
        .toLowerCase();
    const teachers = new Map(); // 班级 → Set(人物 id)
    const students = new Map();
    const addTo = (map, cls, id) => {
      if (!map.has(cls)) map.set(cls, new Set());
      map.get(cls).add(id);
    };
    texts.forEach((text) => {
      splitTextSentences(text).forEach((sent) => {
        if (!sent || sent.length < 4 || !withinSentenceCap(sent, 160, 400)) return;
        const cls = (sent.match(CLASS_TAG_RE) || [])[0];
        if (!cls) return;
        if (!TEACHER_WORD_RE.test(sent) && !STUDENT_WORD_RE.test(sent)) return;
        const key = normClass(cls);
        const flatSent = foldVariant(sent).toLowerCase();
        // 「老师」「学生」这些词和名字的临近范围：英文一个字词更长，窗口放宽
        const win = /[\u3040-\u30ff\u4e00-\u9fff]/.test(sent) ? 14 : 40;
        nameTable.forEach((item) => {
          const pos = flatSent.indexOf(item.folded);
          if (pos < 0) return;
          const near = flatSent.slice(Math.max(0, pos - win), pos + item.folded.length + win);
            if (TEACHER_WORD_RE.test(near)) addTo(teachers, key, item.id);
            if (STUDENT_WORD_RE.test(near)) addTo(students, key, item.id);
        });
      });
    });
    let added = 0;
    teachers.forEach((tSet, key) => {
      const sSet = students.get(key);
      if (!sSet) return;
      tSet.forEach((tid) => {
        sSet.forEach((sid) => {
          if (tid === sid) return;
          if (addRelation(tid, sid, "师生", "师徒", `同属 ${key}（老师 / 学生）`)) added++;
        });
      });
    });
    return added;
  }

  // 来源二：原文里同时出现两个人名、且含关系关键词的句子
  // 亲属称谓（妈妈 / 母亲 / 父亲…）常常是别人的「别名」而不是独立人名：
  // 「小绪的妈妈」里「妈妈」指的是「小绪的母亲」这个人 ✓，
  // 而「拉格朗妈妈」配到「Yuki 的母亲」就是硬凑 ✗。下面按「必须是同一个人的亲属」校验。
  const KIN_ALIAS_RE =
    /^(爸爸|妈妈|父亲|母亲|爸妈|老爸|老妈|爹|娘|哥哥|弟弟|姐姐|妹妹|兄长|儿子|女儿|丈夫|妻子|老公|老婆|配偶|爷爷|奶奶|外公|外婆|祖父|祖母|外祖父|外祖母|叔叔|伯伯|姑姑|舅舅|姨妈|大伯|婶婶|嫂子|姐夫|妹夫|师父|师傅|师娘|阿爸|阿妈|阿公|阿嬷|阿婆|阿伯|阿叔|老豆|老窦|老母|细佬|大佬|阿哥|阿姐|阿妹|家姐|细妹|契爷|契妈|外父|外母|家公|家婆|老爷|奶奶|堂哥|堂姐|表哥|表姐|舅父|姑妈|姑姐|姨母|婶母|學長|學姐|お母さん|おかあさん|母さん|ママ|おふくろ|お父さん|おとうさん|父さん|パパ|お兄さん|兄貴|お姉さん|姉貴|おじいさん|おばあさん|兄|弟|姉|妹|祖父|祖母|息子|娘|夫|妻|uncle|aunt|auntie|cousin|brother|sister|father|mother|dad|mom|mum|mommy|mummy|papa|mama|son|daughter|husband|wife|grandfather|grandmother|grandpa|grandma|granny|nephew|niece|stepfather|stepmother|godfather|godmother|fianc[eé]|betrothed)$/i;

  // 亲属关系必须有「关系陈述」，光用称呼指代人（「X的父亲对我说…」）不算：
  // 「他是小绪的父亲」「小绪和母亲相依为命」「父子」这种才算。
  const KIN_STATE_RE =
    /是|就是|正是|成了|当作|认作|称为|叫做|父子|父女|母子|母女|兄弟|姐妹|兄妹|姐弟|夫妻|夫妇|亲人|一家人|亲生|收养|养子|养女|相依为命|\bis\b|\bwas\b|\bare\b|\bwere\b|\bbecame\b|\bcalled\b|\bknown as\b|\bthe (father|mother|brother|sister|son|daughter|husband|wife)\b|の(父|母|兄|姉|弟|妹|息子|娘|夫|妻)|である|だった/i;

  // 领属称谓：X 的父亲 / X 的妈妈 / X 的师父…
  const POSSESSIVE_KIN_RE =
    /^.{1,12}的(?:爸爸|妈妈|父亲|母亲|爹|娘|哥哥|弟弟|姐姐|妹妹|儿子|女儿|丈夫|妻子|老公|老婆|祖父|祖母|爷爷|奶奶|外公|外婆|叔叔|伯伯|姑姑|舅舅|姨妈|师父|师傅)$/;

  // 同一称谓的不同叫法（「小绪的妈妈」＝「小绪的母亲」），用来核对「X 的某位亲属」到底是谁
  const KIN_FAMILIES = [
    ["父亲", "爸爸", "爹", "老爸", "父"],
    ["母亲", "妈妈", "娘", "老妈", "母"],
    ["哥哥", "兄长", "兄"],
    ["弟弟", "弟"],
    ["姐姐", "姐"],
    ["妹妹", "妹"],
    ["儿子"],
    ["女儿"],
    ["丈夫", "老公", "夫君", "夫"],
    ["妻子", "老婆", "娘子", "妻"],
    ["祖父", "爷爷"],
    ["祖母", "奶奶"],
    ["外祖父", "外公", "姥爷"],
    ["外祖母", "外婆", "姥姥"],
    ["师父", "师傅", "师尊"],
  ];

  function kinFamilyOf(word) {
    return KIN_FAMILIES.find((g) => g.indexOf(word) >= 0) || null;
  }

  // 关系类型「撑不撑得住」：师徒 / 亲属必须有明确的称谓依据，光有角色词（学生、同学…）不算。
  // 撑不住就按文本重新推断；还是撑不住就不建这条关系（宁缺毋滥）。
  function relKindSupported(kind, text) {
    const t = String(text || "");
    if (kind === "师徒") {
      if (/师父|师傅|师尊|师叔|师伯|师姑|师娘|弟子|徒弟|学徒|门生|传人|拜师|为师|收徒|授业|恩师|关门弟子|亲传|同门/.test(t)) {
        return true;
      }
      // 明确「指导 / 传授某门武艺、技能」：有教授动作词 + 一门具体的武艺 / 技艺
      const SKILL_RE =
        /武艺|武功|武技|武术|格斗|剑法|剑术|剑技|刀法|刀术|枪法|枪术|拳法|拳脚|招式|心法|内功|身法|魔法|法术|术法|咒术|箭术|射术|医术|医道|厨艺|厨技|手艺|技艺|技能|本领|功夫|骑术|战术|兵法|谋略|剑道|柔道|空手道|忍术|体术|秘技|绝招|武学|吐纳/;
      if (/指导|指点|指教|教导|传授|师从|点拨|倾囊相授|言传身教|手把手|亲传|收徒|拜师/.test(t) && SKILL_RE.test(t)) {
        return true;
      }
      // 「教 X 某门技能」：教（给/会/他/她/我/你…）＋ 具体技艺；排除「教室 / 教师 / 教学 / 教材」这类
      if (/教(?![室师学材案授员导])[^。！？!?；;\n]{0,8}(?:武艺|武功|武技|武术|剑法|剑术|剑技|刀法|刀术|枪法|枪术|拳法|箭术|医术|医道|厨艺|厨技|手艺|技艺|技能|本领|功夫|魔法|法术|格斗)/.test(t)) {
        return true;
      }
      // 同班师生：明确写了「某班的老师」+「某班的学生」也算
      return (
        /(?:[一二三四五六七八九十0-9０-９]{1,3}\s*年\s*[A-Za-z一-龥]{0,2}\s*班|[0-9０-９]{1,2}\s*班)/.test(t) &&
        TEACHER_WORD_RE.test(t) &&
        STUDENT_WORD_RE.test(t)
      );
    }
    if (kind === "亲属") {
      return /父亲|母亲|爸爸|妈妈|爸妈|爹|娘|儿子|女儿|儿女|哥哥|弟弟|姐姐|妹妹|兄长|兄弟|姐妹|兄妹|姐弟|祖父|祖母|爷爷|奶奶|外公|外婆|姥姥|姥爷|叔|伯|姑|舅|姨|侄子|侄女|外甥|堂|表亲|家族|血亲|亲生|养父|养母|养子|养女|义父|义母|继父|继母|干爹|干妈|岳父|岳母|公公|婆婆|女婿|儿媳|妻子|丈夫|老婆|老公|夫妻|配偶|嫂子|姐夫|妹夫|妯娌|亲家/.test(
        t
      );
    }
    return true;
  }

  // 这个名字像不像「人名」？章节标题、描述性短语、带标点的长句子都不算：
  //   「第三个囚笼」（章节标题）✗、「带头作伪证指控少女的同学」✗、「站在门口的那个人」✗
  //   「杰西」「阿斯塔·露娜」「小绪的母亲」「白发少女」✓
  function looksLikeNonNameCharacter(name) {
    const s = String(name || "").trim();
    if (!s) return true;
    // 带标点 / 括号 / 引号的不是人名
    if (/[、，。！？；：""''「」『』（）()【】《》\n]/.test(s)) return true;
    const cjk = (s.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
    if (cjk >= 9) return true; // 「带头作伪证指控少女的同学」＝11 字
    if (cjk >= 6 && /(?:的|地|了|着|被|给|把|是|在)[^\s]{1,8}$/.test(s)) return true; // 描述性收尾
    if (/^(?:那个|这个|一个|一位|某位|某些|几名|一群|那位|这位|那名|这名|第[一二三四五六七八九十0-9]+个)/.test(s)) {
      return true; // 泛指 / 序数式描述：「那个男孩」「第三个囚笼」
    }
    // 章节 / 小节的标题当成人物名（P3 第三个囚笼 → 「第三个囚笼」）
    return isSegmentTitleAsName(s);
  }

  function isSegmentTitleAsName(s) {
    let hit = false;
    (state.analysis && state.analysis.tasks ? state.analysis.tasks : []).forEach((t) => {
      (t.segments || []).forEach((seg) => {
        if (hit) return;
        const label = normalizeSegLabel(seg.label || "");
        if (!label) return;
        const body = label.replace(/^(?:P\s*\d+|第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*[章节]|[A-Za-z]+\s*[:：])\s*/i, "").trim();
        if (body && (body === s || label === s || (body.length > s.length && body.includes(s)))) hit = true;
      });
    });
    return hit;
  }

  function mineRelationsFromText() {
    const chars = state.characters;
    if (chars.length < 2) return 0;
    // 名字 -> 人物（含别名）
    const nameTable = [];
    chars.forEach((c) => {
      [c.name].concat(c.aliases || []).forEach((n) => {
        const t = String(n || "").trim();
        // 名字折叠一次 + 转小写：简体名字才能在繁体正文里对上、日文异体字（団 / 團）同理，
        // 英文则让 ALICE / Alice 对上（和正文句子那边同一套归一，跟界面语言无关）
        if (t.length >= 2) nameTable.push({ id: c.id, name: t, folded: foldVariant(t).toLowerCase() });
      });
    });
    if (!nameTable.length) return 0;
    const KW =
      // 除了普通话的关系词，还把繁体 / 台普 / 粤语（港普、TVB 腔）/ 日式与英式翻译腔里常见的说法一起认了
      /父亲|母亲|父上|母上|爸爸|妈妈|哥哥|弟弟|姐姐|妹妹|兄弟|姐妹|兄妹|姐弟|儿子|女儿|丈夫|妻子|师父|师傅|师尊|弟子|徒弟|学生|老师|恩师|教官|教练|导师|恋人|爱人|情人|情侣|暗恋|单恋|心上人|相恋|告白|表白|未婚妻|未婚夫|宿敌|死敌|仇人|敌人|对手|死对头|政敌|情敌|朋友|好友|挚友|知己|死党|闺蜜|青梅竹马|幼馴染|发小|战友|搭档|队友|同事|同僚|同盟|盟友|结盟|联盟|上司|下属|老板|员工|主人|仆人|养父|养母|义兄|义妹|吻|亲了|轻吻|拥抱|相拥|搂|抱在一起|牵手|十指相扣|依偎|缠绵|亲昵|抚摸|同床|父親|母親|爸爸|媽媽|哥哥|弟弟|姐姐|妹妹|姊姊|兄弟|姐妹|姊妹|兒女|丈夫|妻子|師父|師傅|弟子|徒弟|學生|老師|恩師|教練|戀人|愛人|情人|情侶|暗戀|單戀|心上人|相戀|告白|表白|未婚妻|未婚夫|宿敵|死敵|仇人|敵人|對手|朋友|好友|摯友|知己|死黨|閨蜜|青梅竹馬|發小|戰友|搭檔|隊友|同事|同僚|同盟|盟友|上司|下屬|老闆|員工|主人|僕人|養父|養母|老豆|老母|老竇|細佬|大佬|家姐|細妹|阿哥|阿姐|阿妹|阿爸|阿媽|契爺|契媽|契仔|契女|外父|外母|家公|家婆|老爺|奶奶|阿公|阿嬤|阿婆|阿伯|阿叔|阿嫂|堂哥|堂姐|表哥|表姐|舅父|姑媽|姑姐|姨媽|叔伯|學長|學姐|學弟|學妹|老爸|老媽|兄弟姊妹|uncle|aunt|auntie|cousin|brother|sister|father|mother|dad|mom|mum|papa|mama|son|daughter|husband|wife|fianc[eé]|betrothed|grandfather|grandmother|grandpa|grandma|nephew|niece|sibling|stepfather|stepmother|godfather|godmother|mentor|master|disciple|teacher|student|friend|best\s?friend|comrade|colleague|partner|boss|subordinate|rival|enemy|nemesis|lover|beloved|sweetheart|crush|senior|junior|先輩|後輩|同級生|先生|師匠|親友|幼なじみ|ライバル/i;
    const texts = [];
    (state.analysis.tasks || []).forEach((t) =>
      (t.segments || []).forEach((s) => {
        const f = (t.files || []).find((x) => x.id === s.fileId);
        if (f) texts.push((f.text || "").slice(s.start, s.end));
      })
    );
    let added = 0;
    texts.forEach((text) => {
      // 按正文语言分句（英文句号也算边界）；句子太长就不用（噪音大）
      const sentences = splitTextSentences(text);
      sentences.forEach((sent) => {
        if (!sent || sent.length < 4) return;
        // 中日文沿用原来的 120 字上限；英文按等效字数放宽到 300（≈50 词）
        if (!withinSentenceCap(sent, 120, 300)) return;
        const kw = sent.match(KW);
        if (!kw) return;
        const hits = [];
        const flatSent = foldVariant(sent).toLowerCase();
        nameTable.forEach((item) => {
          const pos = flatSent.indexOf(item.folded);
          if (pos < 0) return;
          if (hits.some((h) => h.id === item.id)) return;
          hits.push({ id: item.id, token: item.folded, pos, kinAlias: KIN_ALIAS_RE.test(item.folded) });
        });
        if (!hits.length) return;
        // 结合上下文：这个关系词必须贴着这两名人（或整句很短），否则它很可能说的是别人。
        // 例：「杰西盯着黑板，教室里白发少女的朋友正在说笑」→「朋友」离杰西很远，不算。
        const kwPos = sent.indexOf(kw[0]);
        const nearOf = (h) => kwPos >= h.pos - 22 && kwPos <= h.pos + h.token.length + 22;
        const allNear = hits.every(nearOf);
        const shortEnough = shortSentenceUnit(sent) <= 30;
        if (!allNear && !shortEnough) return;
        // 亲属称谓（妈妈 / 母亲…）常是别人的别名，不是独立人名：
        //   「小绪的妈妈」→ 该配到「小绪的母亲」✓
        //   「拉格朗妈妈」→ 配到「Yuki 的母亲」就是硬凑 ✗
        // 所以：称谓紧跟在某人名后面时，只认「名字里含这个人的那位亲属」，找不到就不生成。
        let gluedKin = false;
        let pair = null;
        for (const h of hits) {
          if (!h.kinAlias) continue;
          for (const o of hits) {
            if (o.id === h.id) continue;
            const gap = h.pos - o.pos - o.token.length; // 0＝紧挨着，1＝中间隔一个「的」这类字
            if (gap === 0 || gap === 1) {
              gluedKin = true;
              // 认「X 的某位亲属」：名字要以 X 开头、并以这个称谓（或它的同义叫法）结尾
              // 「小绪的父亲」找的是父亲，不会错配到「小绪的母亲」
              const fam = kinFamilyOf(h.token) || [h.token];
              const owner = chars.find((c) => {
                if (c.id === o.id) return false;
                const n = foldVariant(String(c.name || "").trim()); // 名字也折叠：繁体名字能和简体称谓对上
                return n.startsWith(o.token) && fam.some((w) => n.endsWith(w));
              });
              if (owner) pair = [o.id, owner.id];
              break;
            }
          }
          if (gluedKin) break;
        }
        // 凡是用亲属称谓命中的（妈妈 / 母亲…），没定位到「某个人的那位亲属」就不生成：
        // 这类称谓太泛（好几个人都可能被叫做「妈妈」），宁可少一条也别硬凑。
        if (hits.some((h) => h.kinAlias) && !pair) return;
        if (!pair) {
          if (hits.length !== 2) return;
          pair = [hits[0].id, hits[1].id];
        }
        // 亲属称谓参与的关系：那个小句里必须有「关系陈述」才建。
        //   「谐振子的父亲对我说…」「小绪的妈妈今天没来」只是用称呼指代人 ✗
        //   「他是小绪的父亲」这种才算陈述 ✓
        const kinToken = hits.find((h) => h.kinAlias) || hits.find((h) => POSSESSIVE_KIN_RE.test(h.token));
        if (kinToken) {
          const clause =
            String(sent).split(/[，。！？；、,;!?]/).find((c) => c.includes(kinToken.token)) || "";
          if (!KIN_STATE_RE.test(clause)) return;
        }
        // 判成「其他」＝这句话没说清是什么关系，宁缺毋滥，不建。
        const previewKind = inferKindFromText(kw[0], sent);
        if (!previewKind || previewKind === "其他") return;
        const [aId, bId] = pair;
        // 用整句校正：同样是「吻」，亲嘴唇和亲额头不是一回事
        const kind = previewKind;
        const relLabel = /^(亲了|亲了亲|轻吻|吻)$/.test(kw[0]) ? "亲吻" : kw[0];
        if (hasRelationKind(aId, bId, kind)) return;
        if (addRelation(aId, bId, relLabel, kind, `原文：${sent.slice(0, 40)}`)) added++;
      });
    });
    return added;
  }

  // 来源三：分析结果里还没应用的关系记录
  function applyRelationRecordsFromResults() {
    let added = 0;
    (state.analysis.tasks || []).forEach((t) =>
      (t.results || []).forEach((r) => {
        if (!r || r.type !== "relation") return;
        const a = fieldValue(r, "人物A") || fieldValue(r, "人物1") || fieldValue(r, "甲");
        const b = fieldValue(r, "人物B") || fieldValue(r, "人物2") || fieldValue(r, "乙");
        const ca = findCharacterByName(a, []);
        const cb = findCharacterByName(b, []);
        if (!ca || !cb || ca.id === cb.id) return;
        const label = fieldValue(r, "关系") || r.name || "";
        const rawKind = fieldValue(r, "类型");
        const kind = pickRelKind(rawKind, label);
        if (addRelation(ca.id, cb.id, label, kind, fieldValue(r, "依据") || r.summary || "")) added++;
      })
    );
    return added;
  }

  /* 「已新增 N 条关系 / 撤回生成」这条提示别一直挂在界面上：
     过一会儿自己收起来（想撤回还有顶栏的撤销 / Ctrl+Z）。 */
  let relUndoHideTimer = 0;
  function showRelUndoBar(n) {
    const bar = $("#rel-undo-bar");
    if (!bar) return;
    $("#rel-undo-text").textContent = `已新增 ${n} 条关系`;
    const btn = $("#rel-undo-btn");
    if (btn) btn.textContent = uiTextFor("撤回生成");
    bar.hidden = n <= 0;
    if (relUndoHideTimer) {
      clearTimeout(relUndoHideTimer);
      relUndoHideTimer = 0;
    }
    if (n > 0 && typeof setTimeout === "function") {
      relUndoHideTimer = setTimeout(() => {
        relUndoHideTimer = 0;
        hideRelUndoBar();
      }, 2000); // 最多显示 2 秒，别挂在界面上（想撤回还有撤销 / Ctrl+Z）
    }
  }

  /* 删除一条（或多条）人物关系后也给一条「撤销」：不依赖 Ctrl+Z / 顶栏按钮，
     弹窗刚关、焦点在别处时也能直接点回来（用户 2026-10-17 报「删除关系没法撤回」）。 */
  function showRelDeleteUndoBar(text, before) {
    const bar = $("#rel-undo-bar");
    if (!bar || !before) return;
    relUndoSnapshot = before;
    $("#rel-undo-text").textContent = text;
    const btn = $("#rel-undo-btn");
    if (btn) btn.textContent = uiTextFor("撤销");
    bar.hidden = false;
    if (relUndoHideTimer) {
      clearTimeout(relUndoHideTimer);
      relUndoHideTimer = 0;
    }
    if (typeof setTimeout === "function") {
      relUndoHideTimer = setTimeout(() => {
        relUndoHideTimer = 0;
        hideRelUndoBar();
      }, 4000);
    }
  }

  function hideRelUndoBar() {
    if (relUndoHideTimer) {
      clearTimeout(relUndoHideTimer);
      relUndoHideTimer = 0;
    }
    const bar = $("#rel-undo-bar");
    if (bar) bar.hidden = true;
    relUndoSnapshot = null;
  }

  function undoRelationGenerate() {
    if (!relUndoSnapshot) return;
    if (Array.isArray(relUndoSnapshot)) {
      state.relations = relUndoSnapshot;
    } else {
      if (Array.isArray(relUndoSnapshot.relations)) state.relations = relUndoSnapshot.relations;
      if (Array.isArray(relUndoSnapshot.relKinds)) state.relKinds = relUndoSnapshot.relKinds;
      if (Array.isArray(relUndoSnapshot.charChains)) state.charChains = relUndoSnapshot.charChains;
    }
    relUndoSnapshot = null;
    saveState();
    renderRelations();
    renderStats();
    renderCharacters(); // 人物链被还原时，卡片上的链标记也要回来
    const cid = ($("#char-id") || {}).value;
    if (cid && getChar(cid)) renderCharChainSlots(getChar(cid));
    hideRelUndoBar();
  }

  // 关系体检：把按当前规则站不住的关系挑出来（人物不是人名 / 类型在依据里找不到支撑）。
  // 现在是「填文本分析」时静默跑一遍，只清分析自己写进来的关系，用户手建的关系不动。
  function auditRelations() {
    const bad = [];
    (state.relations || []).forEach((r) => {
      const a = getChar(r.fromId);
      const b = getChar(r.toId);
      const why = [];
      if (!a || !b) {
        why.push("人物已不存在");
      } else {
        if (looksLikeNonNameCharacter(a.name)) why.push(`「${a.name}」不是人名`);
        if (looksLikeNonNameCharacter(b.name)) why.push(`「${b.name}」不是人名`);
        if (!relKindSupported(r.kind, `${r.label || ""} ${r.note || ""}`)) {
          why.push(`类型「${r.kind || "其他"}」在依据里找不到支撑`);
        }
      }
      if (why.length) bad.push({ rel: r, why, a, b });
    });
    return bad;
  }

  // 静默关系体检：只处理「分析写进来的」关系（addRelation 建的会打 auto 标记），
  // 站不住的直接丢掉、不弹窗；用户手建 / 手改过的一律不动，并返回清掉的条数。
  function auditRelationsSilently() {
    const bad = auditRelations().filter((x) => x.rel && x.rel.auto);
    if (!bad.length) return 0;
    const gone = new Set(bad.map((x) => x.rel.id));
    state.relations = (state.relations || []).filter((r) => !gone.has(r.id));
    return bad.length;
  }

  // 一键生成 / 更新关系网
  function generateRelations() {
    if (protectModeOf("relation:desc") === "lock") {
      uiAlert("「人物关系」现在是「全部锁定」（设置 → 文本分析 → 输入保护），所以这次不改动任何关系。");
      return;
    }
    pendingUndoLabel = "一键生成 / 更新关系网";
    relUndoSnapshot = JSON.parse(JSON.stringify(state.relations || []));
    const before = (state.relations || []).length;
    const nProfile = detectRelationsSilent();
    const nTeacher = mineTeacherStudentFromText();
    const nText = mineRelationsFromText();
    const nResult = applyRelationRecordsFromResults();
    // 系谱也是「更新关系网的依据」之一（用户 2026-10-16）：结合线＝恋爱，世系线＝亲属（父母→子女）
    const nPed = typeof syncRelationsFromPedigree === "function" ? syncRelationsFromPedigree() : 0;
    const added = nProfile + nTeacher + nText + nResult + nPed; // 这次一共写进来多少条
    const nDropped = auditRelationsSilently();
    const net = (state.relations || []).length - before; // 最终净增
    saveState();
    renderRelations();
    renderStats();
    showRelUndoBar(net);
    if (nDropped) showToast(`关系体检：清掉 ${nDropped} 条站不住的关系`);
    uiAlert(
      added
        ? `本次新增 ${added} 条关系${nDropped ? `（其中 ${nDropped} 条站不住，已被关系体检清掉）` : ""}：\n\n· 人物档案：${nProfile} 条\n· 同班师生：${nTeacher} 条\n· 原文共现句：${nText} 条\n· 分析结果：${nResult} 条\n· 系谱：${nPed} 条\n\n有误可点「撤回生成」还原。`
        : "没有发现新关系：人物档案、原文和系谱里都没有可用的线索。"
    );
  }

  /* 系谱 → 关系网（用户 2026-10-16 定的方向：系谱是更新关系网的依据，只管亲属 / 恋爱）：
     结合线两端＝恋爱（配偶），世系线＝亲属（父母 → 子女）；
     另外**共用至少一个父 / 母**的两个孩子＝兄弟姐妹（同父或同父母都算，用户 2026-10-16 追加），也是亲属。
     只补**还没有**的关系 —— addRelation 自己按「同一对人物 + 同一类型」去重，也听「输入保护」的设置；
     系谱这边只读不写（它不是自动回填的接受方）。 */
  function syncRelationsFromPedigree() {
    if (typeof pedCharts !== "function") return 0;
    let charts = [];
    try {
      charts = pedCharts() || [];
    } catch (e) {
      return 0;
    }
    const love = relKindNameOf("恋爱");
    const family = relKindNameOf("亲属");
    const noteLove = uiTextFor("系谱：结合线");
    const noteFamily = uiTextFor("系谱：血亲");
    const noteSibling = uiTextFor("系谱：兄弟姐妹");
    let n = 0;
    const put = (a, b, kind, note) => {
      if (a && b && a !== b && addRelation(a, b, kind, kind, note)) n++;
    };
    /* 这个孩子挂在哪些父 / 母下面：双亲锚点＝两个人，单亲锚点＝那一个 */
    const parentsOf = (unions, d) => {
      if (d.union) {
        const u = unions.find((o) => o && o.id === d.union);
        return u ? [u.a, u.b].filter(Boolean) : [];
      }
      return d.parent ? [d.parent] : [];
    };
    charts.forEach((c) => {
      const unions = (c && c.unions) || [];
      unions.forEach((u) => {
        if (u) put(u.a, u.b, love, noteLove);
      });
      /* 兄弟姐妹：**共用至少一个父 / 母**就算（同父或同父母），从世系线的锚点算 ——
         一个挂在结合线上、另一个只挂在其中一人下面（半血缘）也认。
         人数多到离谱时只算前 400 对，别把界面卡住。 */
      const kids = [];
      ((c && c.descents) || []).forEach((d) => {
        if (!d || !d.child) return;
        const ps = parentsOf(unions, d);
        if (ps.length) kids.push({ id: d.child, parents: ps });
        if (d.union) {
          const u = unions.find((o) => o && o.id === d.union);
          if (!u) return;
          put(u.a, d.child, family, noteFamily);
          put(u.b, d.child, family, noteFamily);
        } else if (d.parent) {
          put(d.parent, d.child, family, noteFamily);
        }
      });
      let pairs = 0;
      for (let i = 0; i < kids.length && pairs < 400; i++) {
        for (let j = i + 1; j < kids.length && pairs < 400; j++) {
          const a = kids[i], b = kids[j];
          if (!a.parents.some((p) => b.parents.indexOf(p) >= 0)) continue;
          pairs++;
          put(a.id, b.id, family, noteSibling);
        }
      }
    });
    return n;
  }

  // 兼容旧入口
  function detectRelations() {
    generateRelations();
  }

  // 关系网左侧人物栏的候选＝全部人物（分组与顺序都跟人物边栏一致）。
  // 以前这里只列「已经出现在关系里的人」，所以新加的人物非得点一下「一键生成 / 更新」才会出现；
  // 现在这一栏跟着人物边栏实时走（见 renderCharacters 末尾的联动）。
  function relCandidates() {
    return (state.characters || []).slice();
  }

  function ensureRelChecked(cands) {
    if (!relCheckedIds) relCheckedIds = new Set();
    // 默认勾选所有非龙套人物 + 全部势力；若一个都没有，则全选。
    // 注意：如果关系网是在「还没有任何关系」时打开的，候选是空的，
    // 这时不能算「已经初始化过」——等以后识别出关系、有人物可选时要重新给上默认勾选。
    if (!relCheckedIds.size && !relCheckedSeeded) {
      cands.forEach((x) => {
        const ch = getChar(x.id);
        if (ch) {
          if (!isExtraChar(ch)) relCheckedIds.add(x.id);
        } else {
          relCheckedIds.add(x.id);
        }
        relSeenIds.add(x.id);
      });
      if (!relCheckedIds.size)
        cands.forEach((x) => {
          relCheckedIds.add(x.id);
          relSeenIds.add(x.id);
        });
      if (relCheckedIds.size) relCheckedSeeded = true;
    }
    const alive = new Set(cands.map((c) => c.id));
    Array.from(relCheckedIds).forEach((id) => {
      if (!alive.has(id)) relCheckedIds.delete(id);
    });
    // 人物边栏里新加的人：按同一条默认规则（非龙套默认勾上）补进来。
    // 只处理「没见过的人」，所以用户手动取消勾选的不会被again勾上。
    if (relCheckedSeeded) {
      cands.forEach((x) => {
        if (relSeenIds.has(x.id)) return;
        relSeenIds.add(x.id);
        const ch = getChar(x.id);
        if (!ch || !isExtraChar(ch)) relCheckedIds.add(x.id);
      });
    }
    return relCheckedIds;
  }

  /* ---- 左侧两栏（按群组 / 按势力）的横向折叠：状态记在本地，下次进来保持 ---- */
  /* ---- 各页面边栏的横向折叠（人物栏 / 章节栏 / 设定类别栏 / 分析任务栏） ---- */
  const PANE_KEY = "fiction_gui_panes_v1";
  const PANE_DEFS = [
    { key: "char", target: "#sidebar", handle: "#pane-handle-char", btn: "#pane-toggle-char", label: "人物边栏" },
    { key: "chapter", target: "#chapter-rail", handle: "#pane-handle-chapter", btn: "#pane-toggle-chapter", label: "章节边栏" },
    // flip：这一栏贴在右边，折叠 / 展开的箭头方向要反过来
    { key: "map", target: "#map-pane", handle: "#pane-handle-map", btn: "#pane-toggle-map", label: "地图栏", flip: true },
  ];
  let paneCollapsed = {};

  function loadPaneState() {
    try {
      const raw = localStorage.getItem(PANE_KEY);
      paneCollapsed = raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      paneCollapsed = {};
    }
  }

  function applyPaneState() {
    PANE_DEFS.forEach((d) => {
      const folded = !!paneCollapsed[d.key];
      const el = $(d.target);
      if (el) el.classList.toggle("collapsed", folded);
      const title = folded ? `展开${d.label}` : `折叠${d.label}`;
      const btn = $(d.btn);
      if (btn) {
        btn.textContent = d.flip ? (folded ? "◀" : "▶") : folded ? "▶" : "◀";
        btn.title = title;
      }
      const h = $(d.handle);
      if (h) h.title = title;
    });
  }

  function togglePane(key) {
    paneCollapsed[key] = !paneCollapsed[key];
    try {
      localStorage.setItem(PANE_KEY, JSON.stringify(paneCollapsed));
    } catch (e) {
      /* ignore */
    }
    applyPaneState();
    // 事件轴的列宽是按剩余宽度算的，边栏收起后要重排一次
    setTimeout(() => {
      const view = $("#view-timeline");
      if (view && !view.hidden) renderTimeline();
    }, 30);
  }

  function bindPaneToggles() {
    loadPaneState();
    PANE_DEFS.forEach((d) => {
      const h = $(d.handle);
      if (h) h.addEventListener("click", () => togglePane(d.key));
    });
    bindPaneResizers();
    applyPaneState();
  }

  /* ---- 拖拽边栏边界改宽度：只改排版，不改字体 / 图标大小；到最小宽度就不再变窄 ---- */
  // 每个边栏：改哪个元素的宽度 + 最小 / 最大宽度（最小宽度都 ≥ 一张卡片，避免卡片被压得藏字）
  const PANE_RESIZE = {
    char: { sel: ".sidebar-inner", min: 200, max: 780 },
    chapter: { sel: "#chapter-rail", min: 132, max: 460 },
    // flip：这一栏在右边，往左拖才是变宽
    map: { sel: "#map-pane", min: 180, max: 900, flip: true },
  };
  let paneResizeTimer = null;

  function afterPaneResize() {
    clearTimeout(paneResizeTimer);
    paneResizeTimer = setTimeout(() => {
      // 事件轴的列宽是按剩余宽度算出来的，边栏一变就要重排
      invalidateAxisWidth();
      const view = $("#view-timeline");
      if (view && !view.hidden) renderTimeline();
      const mv = $("#view-matrix");
      if (mv && !mv.hidden) renderMatrix();
    }, 60);
  }

  // 让一根「边界条」可以拖：拖动＝改宽度；原地单击＝原来的折叠 / 展开
  function bindPaneResize(handle, widthEl, min, max, flip) {
    if (!handle || !widthEl) return;
    let dragging = false;
    handle.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      if (widthEl.offsetParent === null) return; // 收起来的边栏不拖宽度
      const startX = ev.clientX;
      // 界面缩放时 getBoundingClientRect 是放大过的，而 widthEl.style.width 用的是元素自己坐标系 → 先除回来
      const startW = widthEl.getBoundingClientRect().width / uiZoomScale(widthEl);
      if (!startW) return;
      let moved = false;
      const onMove = (e) => {
        const dx = (e.clientX - startX) / uiZoomScale(widthEl);
        if (!moved) {
          if (Math.abs(dx) < 3) return; // 3px 以内算点击，交给折叠按钮
          moved = true;
          dragging = true;
          document.body.classList.add("pane-resizing");
        }
        ev.preventDefault();
        const w = Math.max(min, Math.min(max, Math.round(startW + (flip ? -dx : dx))));
        widthEl.style.width = w + "px";
        widthEl.style.flex = "none";
        afterPaneResize();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          document.body.classList.remove("pane-resizing");
          // 拖动结束的这一次 click 不要触发折叠
          const swallow = (e) => {
            e.stopPropagation();
            e.preventDefault();
          };
          document.addEventListener("click", swallow, { capture: true, once: true });
          afterPaneResize();
          setTimeout(() => {
            dragging = false;
          }, 0);
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function bindPaneResizers() {
    PANE_DEFS.forEach((d) => {
      const spec = PANE_RESIZE[d.key];
      if (!spec) return;
      const h = $(d.handle);
      const el = $(spec.sel);
      if (h && el) bindPaneResize(h, el, spec.min, spec.max, !!spec.flip);
    });
  }

  /* ---- 文本分析里的「章节 / 小节」列表：上下拖动改高度 ---- */
  /* ---- 顶栏：页签和右侧按钮挤到两行时，页签后面那条分隔线就藏起来 ---- */
  function syncTabsDivider() {
    const sep = $("#tabs-vsep");
    const tabs = $("#tabs");
    const acts = $(".topbar-actions");
    if (!sep || !tabs || !acts) return;
    const sameRow = Math.abs(tabs.getBoundingClientRect().top - acts.getBoundingClientRect().top) < 6;
    sep.style.display = sameRow ? "" : "none";
  }

  const SEG_LIST_H_KEY = "fiction_gui_seg_list_height_v1";
  const SEG_LIST_FOLD_KEY = "fiction_gui_seg_list_folded_v1";
  const SEG_LIST_MIN_H = 120;
  const SEG_LIST_DEF_H = 260;
  let segListFolded = false;

  // 折叠条（「底边横条 + 三角」，和人物边栏那条一个样式）：▲＝展开中，▼＝已折叠
  function applySegFoldState() {
    const handle = $("#seg-fold");
    const list = $("#segment-list");
    if (!handle || !list) return;
    list.hidden = segListFolded;
    handle.textContent = segListFolded ? "▲" : "▼";
    handle.title = segListFolded
      ? "展开「章节 / 小节」列表（回到默认长度）；按住上下拖动也可以直接拉出来"
      : "折叠「章节 / 小节」列表；按住上下拖动＝直接改高度";
  }

