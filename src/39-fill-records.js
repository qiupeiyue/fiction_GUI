  function eventRowNumberOf(e) {
    if (!e) return 0;
    const i = orderedByStory().findIndex((x) => x.id === e.id);
    return i < 0 ? 0 : i + 1;
  }

  // 某个章 / 节里第一个事件的 # 号
  function firstEventRowIn(chapterId, sectionId) {
    const list = orderedByStory().filter((e) => {
      if (sectionId) return e.sectionId === sectionId;
      if (chapterId) return e.chapterId === chapterId;
      return false;
    });
    return list.length ? eventRowNumberOf(list[0]) : 0;
  }

  // 把出处补成「第一章 … · 第一节 … · #12」（已经很具体、或还没建章 / 节时原样返回）
  function sourceWithRow(source, fileId) {
    const base = String(source || "").trim();
    if (!base) return "";
    if (/#\d+/.test(base)) return base;
    const plc = placeLookup(base, fileId);
    if (!plc.chapterId && !plc.sectionId) return base;
    const row = firstEventRowIn(plc.chapterId, plc.sectionId);
    return row ? base + " · #" + row : base;
  }

  // 「别名」里如果混进了另一个人的名字（例如模型把「久亚」写成「监控子」的别名），
  // 就不能静默当别名并进来 —— 那等于把两个不同的人悄悄并成一个。
  // 这类别名会被摘出来，等这批结果都建完卡后统一交给合并弹窗，让用户自己确认。
  function splitCharacterAliases(name, aliases, takenNames) {
    const keep = [];
    const conflicts = [];
    (aliases || []).forEach((a) => {
      const t = String(a || "").trim();
      if (!t || isTooGenericAlias(t)) return;
      const k = normNameKey(t);
      if (!k || k === normNameKey(name)) return;
      if (takenNames && takenNames.has(k)) {
        if (conflicts.indexOf(t) < 0) conflicts.push(t);
        return;
      }
      // 日文名的假名 / 罗马字写法（アリス 与 Alice）也要算「这其实是另一个人的名字」，
      // 免得被静默并进别名 —— 交给合并弹窗让用户确认
      const jk = jaNameKey(t);
      if (jk && takenNames && takenNames.has("ja:" + jk)) {
        if (conflicts.indexOf(t) < 0) conflicts.push(t);
        return;
      }
      if (keep.indexOf(t) < 0) keep.push(t);
    });
    return { keep, conflicts };
  }

  // 两个叫法「看着像同一个人」：有共同的字、互为简称、或只是写错了一两个字。
  // 「久亚 / 监控子」这种八竿子打不着的，就不像。
  function namesLookRelated(a, b) {
    const x = normNameKey(a);
    const y = normNameKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return true;
    for (const ch of x) if (y.indexOf(ch) >= 0) return true;
    return samePerson(a, b) || typoSameName(a, b);
  }

  function findCharacterByName(name, extraAliases) {
    const cands = [name].concat(extraAliases || []);
    /* 名字一字不差就先认这张卡 —— 哪怕它带「教会 / 家族 / 公会 / 军团」这类集体词。
       `charCallInfo` 会把这类名字标成 collective（那是给"两个人是不是同一人"的合并比较用的），
       如果这里也跟着过滤，名字叫「守夜人教会」的人物每次写回都会匹配不到、再新建一张。
       用户 2026-10-17 报的"反复迭代建立人物卡"就是这条。 */
    const rawKey = normNameKey(name);
    if (rawKey) {
      const same = state.characters.find((c) => normNameKey(c.name) === rawKey);
      if (same) return same;
    }
    // 先找名字一字不差的那个：否则「艾达」会先把「艾达·普利西法」抢走
    // （samePerson 认为「艾达」是「艾达·普利西法」的简称，但同名的那条才是本尊）
    const exact = state.characters.find((c) => {
      const mine = charCallInfo(c).filter((x) => !x.generic && !x.collective);
      return cands.some((n) => {
        if (!isBridgeNameAllowed(n)) return false;
        const k = normNameKey(n);
        return k && mine.some((x) => x.key === k);
      });
    });
    if (exact) return exact;
    return (
      state.characters.find((c) => {
        // 已有这个人的叫法（正式名 + 手填的别名，别名里写多个也会拆开）都拿出来比一遍
        const mine = charCallInfo(c).filter((x) => !x.generic && !x.collective);
        return cands.some((n) => isBridgeNameAllowed(n) && mine.some((x) => samePerson(x.raw, n)));
      }) || null
    );
  }

  function addAliases(c, names) {
    if (!Array.isArray(c.aliases)) c.aliases = [];
    // 以前填进去的宽泛词也顺手清掉：它们正是「两个不同的人被并成一个」的元凶
    const kept = c.aliases.filter((a) => !isTooGenericAlias(a));
    if (kept.length !== c.aliases.length) c.aliases = kept;
    names.forEach((n) => {
      const t = String(n || "").trim();
      if (!t) return;
      if (isTooGenericAlias(t)) return; // 「父亲」「学生」「我」「那孩子」这类宽泛词不进别名
      if (samePerson(c.name, t)) return;
      if (c.aliases.some((a) => samePerson(a, t))) return;
      c.aliases.push(t);
    });
  }

  // 这类词太宽泛，当别名会被「自动合并」当成同一个人（例如两个不同人的「父亲」被并成一个）。
  // 「X 的父亲」这种带专属前缀的称谓不在此列，照常保留。
  const GENERIC_ALIAS_RE =
    /^(?:爸爸|妈妈|父亲|母亲|爸妈|爹|娘|老爸|老妈|爷爷|奶奶|外公|外婆|姥爷|姥姥|祖父|祖母|外祖父|外祖母|哥哥|弟弟|姐姐|妹妹|兄长|兄弟|姐妹|兄妹|姐弟|儿子|女儿|孩子|孙子|孙女|外孙|外孙女|丈夫|妻子|老公|老婆|夫妻|配偶|夫君|娘子|嫂子|弟妹|姐夫|妹夫|妯娌|亲家|岳父|岳母|公公|婆婆|女婿|儿媳|叔叔|伯伯|姑姑|舅舅|姨妈|婶婶|大伯|干爹|干妈|养父|养母|继父|继母|义父|义母|男子|女子|男人|女人|男孩|女孩|男生|女生|少年|少女|青年|老人|老者|中年人|学生|老师|教师|同学|班长|校长|主任|医生|护士|警察|士兵|卫兵|军官|仆人|女仆|管家|老板|店员|路人|行人|村民|市民|观众|群众|记者|商人|工匠|船员|骑士|公主|王子|国王|女王|陛下|殿下|大人|小姐|先生|女士|夫人|我|你|他|她|它|我们|你们|他们|她们|咱们|大家|某人|有人|对方|两人|二人|彼此|那个人|这个人|那个孩子|这个孩子|那孩子|这孩子|那男孩|那女孩|i|me|my|you|your|he|him|his|she|her|hers|they|them|their|we|us|our|it|its|everyone|everybody|someone|somebody|anyone|nobody|the boy|the girl|the man|the woman|the old man|the student|the teacher|the kid|the child|the guy|boy|girl|man|woman|kid|child|guy|lady|gentleman|sir|madam|father|mother|dad|mom|mum|daddy|mommy|papa|mama|brother|sister|son|daughter|husband|wife|uncle|aunt|auntie|cousin|grandfather|grandmother|grandpa|grandma|grandson|granddaughter|nephew|niece|stepfather|stepmother|godfather|godmother|teacher|student|pupil|classmate|friend|doctor|nurse|police|officer|soldier|guard|servant|maid|boss|stranger|商人|私|僕|俺|あたし|わたし|あなた|彼|彼女|みんな|皆|誰か|だれか|少年|少女|男の子|女の子|男|女|学生|生徒|先生|友達|幼馴染|同級生|先輩|後輩|部長|課長|社長|店員|店長|警官|警察官|兵士|騎士|召使い|使用人|主人|王|女王|王子|姫|殿下|様|お父さん|お母さん|お兄さん|お姉さん|父|母|兄|弟|姉|妹|祖父|祖母|息子|娘|夫|妻|恋人|親友|仲間|敵|ライバル)$/i;

  function isTooGenericAlias(t) {
    const s = String(t || "").trim();
    if (!s) return true;
    if (GENERIC_ALIAS_RE.test(s)) return true;
    // 单纯重复主名末尾那截称谓也没意义：「X 的父亲」的别名只写「父亲」时拦掉（上面已覆盖），
    // 而「父亲大人」这种也一并当成泛称
    // 英文 / 日文的泛称：「the mother」「お母さん」这类也不该当别名
    if (/^(?:the\s+)?(?:father|mother|dad|mom|mum|brother|sister|son|daughter|husband|wife|boy|girl|man|woman|kid|child|student|teacher|doctor|nurse|soldier|guard)s?$/i.test(s)) return true;
    if (/^(?:お)?(?:父|母|兄|姉|弟|妹)(?:さん|ちゃん|さま)?(?:さま)?$/i.test(s)) return true;
    return /^(?:父亲|母亲|爸爸|妈妈|哥哥|弟弟|姐姐|妹妹|儿子|女儿|丈夫|妻子)(?:大人|大人|殿下)?$/.test(s);
  }

  /* 把「登场人物」「关联人物」字符串解析成人物 id：**只连已经有的人物卡，绝不在这里补建**。
     人物是「填入设定档案」第一遍按分析结果建好的；事件卡 / 条目卡只负责连线。
     以前名字对不上就顺手建一张，结果每点一次填入都会从事件卡里冒出一批新人物，
     再被「势力 / 组织自动转入」转成条目，反复叠卡（用户 2026-10-17 报）。
     名字对不上（没勾选、被过滤、写法不同）就跳过这条连线，让人物库保持以分析结果为准。 */
  function resolveCharacterIds(namesStr) {
    const ids = [];
    String(namesStr || "")
      .split(/[、,，\/;；\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((n) => {
        const c = findCharacterByName(n, []);
        if (!c) return;
        if (!ids.includes(c.id)) ids.push(c.id);
      });
    return ids;
  }

  // 名字和已有卡片一字不差＝同一张卡：只把这次识别到的信息并进来，不新建卡
  function updateCharacterFromRecord(c, r, aliases) {
    if (!c) return null;
    addAliases(c, [String(r.name || "").trim()].concat(aliases || []));
    linkCharToFactions(c, resolveFactionIds(fieldValue(r, "所属势力") || fieldValue(r, "势力")));
    // 雷达图数值：非空锁定＝只补空着的顶点；兼并＝用新数值覆盖；全部锁定＝不动
    if (radarOn()) {
      const inc = radarValuesFromRecord(r);
      if (inc && Object.keys(inc).length) {
        const hadValues = !!(c.radar && Object.keys(c.radar).length);
        const next = protectRadarValues(c.radar, inc);
        if (Object.keys(next).length) {
          c.radar = next;
          // 第一次给这张卡填上数值：顺手把雷达图打开，免得填了却看不见
          if (!hadValues) c.radarOn = true;
          /* ⚠️ 打分依据（radarWhy）**只留在文本分析的 results 里**，不要写到人物卡上（用户 2026-10-17）：
             那是给 Agent 综合 / 反思时看的内部材料，不是人物信息；
             存档跟着分析任务走 —— 删掉任务，依据自然一起没了。 */
        }
      }
    }
    return c;
  }

  // aliasOverride：调用方已经筛过的别名（摘掉了「其实是另一个人名字」的那些）
  function addCharacterFromRecord(r, forceCreate, aliasOverride) {
    const name = (r.name || "").trim();
    if (!name) return null;
    const aliases = aliasOverride || nameAliasesOf(r);
    // 只有「名字一字不差」才算同一个人，直接更新那张卡；
    // 只在别名 / 简称上对得上的，一律另建卡，由调用方挂进合并弹窗让用户确认（不静默合并）
    if (!forceCreate) {
      const existing = findCharacterByName(name, aliases);
      if (existing && normNameKey(existing.name) === normNameKey(name)) {
        return updateCharacterFromRecord(existing, r, aliases);
      }
    }
    // 作者在「设置 → 全局字段」里改过的内置字段名也算「已归位」，不再重复塞进备注．
    // 自定义字段（作者自己加的，例如「武器」）单独落到人物的「自定义字段」里
    const schemaDefs = fieldsetSchemaOf("char");
    const schemaLabels = schemaDefs
      .filter((f) => !f.custom)
      .map((f) => f.label)
      .filter(Boolean);
    const customLabels = schemaDefs
      .filter((f) => f.custom)
      .map((f) => String(f.label || "").trim())
      .filter(Boolean);
    const known = [
      "重要度",
      "角色重要度",
      "别名",
      "别称",
      "昵称",
      "称呼",
      "简称",
      "又名",
      "曾用名",
      "绰号",
      "性别",
      "年龄",
      "身份",
      "职业",
      "所属势力",
      "势力",
      "外貌",
      "性格",
      "背景",
      "目标",
      "动机",
      "人际关系",
      "关系",
    ]
      .concat(schemaLabels)
      .concat(radarOn() ? radarAxes().map((a) => String(a.label || "").trim()).filter(Boolean) : []);
    const customRows = [];
    const extra = [];
    (r.fields || []).forEach((f) => {
      const lb = String(f.label || "").trim();
      const val = String(f.value || "").trim();
      if (!lb || !val) return;
      if (isInternalRadarField(f)) return; // 给程序看的备注（另见 radar / radarWhy）不进卡片
      if (customLabels.includes(lb)) {
        customRows.push({ label: lb, value: val });
        return;
      }
      if (known.some((k) => lb.includes(k))) return; // 已经填进固定栏位
      extra.push(`${lb}：${val}`);
    });
    if (r.source) extra.unshift("出处：" + r.source);
    if (r.summary) extra.push(r.summary);
    const c = {
      id: uid(),
      name,
      color: CHAR_COLORS[state.characters.length % CHAR_COLORS.length],
      gender: schemaFieldValue(r, "char", "gender"),
      age: schemaFieldValue(r, "char", "age"),
      role: schemaFieldValue(r, "char", "role") || fieldValue(r, "职业"),
      appearance: schemaFieldValue(r, "char", "appearance"),
      personality: schemaFieldValue(r, "char", "personality"),
      background: schemaFieldValue(r, "char", "background"),
      goal: schemaFieldValue(r, "char", "goal") || fieldValue(r, "动机"),
      relationships: schemaFieldValue(r, "char", "relationships") || fieldValue(r, "关系"),
      fields: customRows,
      notes: extra.join("\n"),
      groupId: isExtraRecord(r) ? extraGroupIdOf() || "" : "",
      aliases: [],
      factionIds: [],
      // 记下这条记录是从哪个时间 / 叙事方式来的，之后自动合并时用来判断谁是主体
      srcTime: fieldValue(r, "时间") || fieldValue(r, "实际发生时间") || fieldValue(r, "发生时间") || "",
      srcNarrative: normNarrative(fieldValue(r, "叙事")),
    };
    // 雷达图启用时：把这条记录里的顶点数值一起写进来（新卡直接打开雷达图）
    if (radarOn()) {
      const inc = radarValuesFromRecord(r);
      if (inc && Object.keys(inc).length) {
        c.radar = inc;
        c.radarOn = true;
      }
    }
    state.characters.push(c);
    // 别名走 addAliases 过一遍：宽泛词（「我」「父亲」…）不进卡，也不会重复
    addAliases(c, aliases);
    bumpStateRev();
    linkCharToFactions(c, resolveFactionIds(fieldValue(r, "所属势力") || fieldValue(r, "势力")));
    return c;
  }

  // 把人物挂到多个势力上（同时写回势力条目的「关联人物」）
  function linkCharToFactions(c, factionIds) {
    if (!c || !factionIds || !factionIds.length) return;
    // 听「输入保护 → 所属势力」：全部锁定 / 非空锁定 / 追加 / 兼并
    const mode = protectModeOf("char:faction");
    if (mode === "lock") return;
    if (mode === "lockEmpty" && (c.factionIds || []).length) return;
    const next = protectListValue("char:faction", c.factionIds || [], factionIds);
    const before = Array.from(c.factionIds || []);
    // 兼并可能把旧的势力去掉，那边也要把这个人从成员里摘掉
    before.forEach((fid) => {
      if (next.indexOf(fid) >= 0) return;
      const en = getEntry(fid);
      if (en) en.characterIds = (en.characterIds || []).filter((id) => id !== c.id);
    });
    c.factionIds = next;
    next.forEach((fid) => {
      const en = getEntry(fid);
      if (!en) return;
      const s = new Set(en.characterIds || []);
      s.add(c.id);
      en.characterIds = Array.from(s);
    });
  }

  function addEventFromRecord(r) {
    function eventPlaceOf(rec) {
      // AI 可能把地点写成这几种字段名，都兼容
      return (
        schemaFieldValue(rec, "event", "place") ||
        fieldValue(rec, "地点") ||
        fieldValue(rec, "发生地点") ||
        fieldValue(rec, "事发地点") ||
        fieldValue(rec, "场所") ||
        fieldValue(rec, "场景") ||
        ""
      ).trim();
    }
    function sourceSegIdsOf(rec) {
      const out = [];
      const add = (id) => {
        const s = String(id || "").trim();
        if (s && out.indexOf(s) < 0) out.push(s);
      };
      ((rec && rec.sourceSegIds) || []).forEach(add);
      if (rec && rec.segId) add(rec.segId);
      ((rec && rec.sourceRefs) || []).forEach((ref) => ref && ref.segId && add(ref.segId));
      return out;
    }
    const title = (r.name || "").trim();
    if (!title) return;
    const who = fieldValue(r, "登场人物") || fieldValue(r, "出场人物") || fieldValue(r, "涉及人物") || fieldValue(r, "人物");
    const ids = resolveCharacterIds(who);
    const titleKey = normTitle(title);
    const existing = state.events.find((e) => normTitle(e.title) === titleKey);
    if (existing) {
      // 已有同名事件：合并登场人物与缺失字段，不重复创建
      const merged = Array.isArray(existing.characterIds) ? existing.characterIds.slice() : [];
      ids.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      // 登场人物：听「输入保护 → 事件 · 登场人物」（追加＝只加人，兼并＝以这次识别到的人为准）
      existing.characterIds = protectListValue("event:characters", existing.characterIds || [], ids.length ? ids : merged);
      if (!existing.time) {
        existing.time =
          fieldValue(r, "实际发生时间") || fieldValue(r, "发生时间") || fieldValue(r, "时间") || "";
        delete existing.timeSortKey; // 时间文字换成识别结果了：不要再用旧的排序兜底
      }
      if (!existing.place) {
        existing.place = eventPlaceOf(r);
      }
      // 起因 / 经过 / 结果 / 备注：听「输入保护 → 事件」
      [["cause", "起因"], ["process", "经过"], ["result", "结果"], ["notes", "备注"]].forEach(([k, lb]) => {
        const v = schemaFieldValue(r, "event", k) || fieldValue(r, lb);
        if (!v) return;
        existing[k] = protectTextValue("event:" + k, existing[k], v);
      });
      // 事件的卡片自定义字段：按「事件 · 自定义字段」的保护方式合并
      if (Array.isArray(r.fields) && r.fields.length) {
        if (!Array.isArray(existing.fields)) existing.fields = [];
        r.fields.forEach((f) => {
          const label = String((f && f.label) || "").trim();
          const value = String((f && f.value) || "").trim();
          if (!label || !value) return;
          const own = existing.fields.find((x) => String((x && x.label) || "").trim() === label);
          const next = protectTextValue("event:customFields", own ? own.value : "", value);
          if (!next) return;
          if (!own) existing.fields.push({ label, value: next });
          else own.value = next;
        });
      }
      if (!existing.chapterId && r.source && !existing.sourcePinned) {
        const p = placeForSource(r.source, r.fileId, { segId: r.segId });
        existing.chapterId = p.chapterId;
        if (!existing.sectionId) existing.sectionId = p.sectionId;
      }
      if (!existing.source) existing.source = r.source || "";
      if (!existing.sourceFileId) existing.sourceFileId = r.fileId || "";
      const segIds = sourceSegIdsOf(r);
      if (segIds.length) {
        const cur = Array.isArray(existing.sourceSegIds) ? existing.sourceSegIds.slice() : [];
        segIds.forEach((id) => {
          if (cur.indexOf(id) < 0) cur.push(id);
        });
        existing.sourceSegIds = cur;
        if (!existing.sourceSegId) existing.sourceSegId = segIds[0];
      }
      return existing;
    }
    const place = placeForSource(r.source, r.fileId, { segId: r.segId });
    // 作者自定义的事件字段（例如「参战方」）落到事件的「自定义字段」里
    const evCustomLabels = fieldsetSchemaOf("event")
      .filter((f) => f.custom)
      .map((f) => String(f.label || "").trim())
      .filter(Boolean);
    const evFields = (r.fields || [])
      .filter((f) => f && f.label && f.value && evCustomLabels.includes(String(f.label).trim()))
      .map((f) => ({ label: String(f.label).trim(), value: String(f.value).trim() }));
    const segIds = sourceSegIdsOf(r);
    const ev = {
      id: uid(),
      title,
      // 「时间」：兼容旧结果里叫「实际发生时间」的字段；实在没有就不要用章节名顶替
      time:
        schemaFieldValue(r, "event", "time") ||
        fieldValue(r, "实际发生时间") ||
        fieldValue(r, "发生时间") ||
        fieldValue(r, "时间") ||
        "",
      place: eventPlaceOf(r),
      cause: schemaFieldValue(r, "event", "cause") || fieldValue(r, "起因"),
      process: schemaFieldValue(r, "event", "process") || fieldValue(r, "经过"),
      result: schemaFieldValue(r, "event", "result") || fieldValue(r, "结果"),
      fields: evFields,
      notes: r.summary || "",
      characterIds: ids,
      lineIds: [lineFilterDefaultId()],
      storyIndex: insertStoryIndexFor(place.chapterId),
      narrative: normNarrative(fieldValue(r, "叙事")),
      chapterId: place.chapterId,
      sectionId: place.sectionId,
      source: r.source || "",
      sourceFileId: r.fileId || "",
      sourceSegId: segIds[0] || "",
      sourceSegIds: segIds,
    };
    state.events.push(ev);
    state.order.push(ev.id);
    bumpStateRev();
    return ev;
  }

  function addSettingFromRecord(r) {
    const name = (r.name || "").trim();
    if (!name) return;
    const catName = (r.category || "名词").trim();
    // 类别名可能是中文（老项目 / AI 按中文提示词回填），也可能是当前语言的写法：
    // 先按名字找，再按 kind（物品 / 名词 / 地点 / 纪年 / 势力）归到已有类别上，实在没有才新建。
    const wantKind = catKindByName(catName);
    let cat =
      state.settings.categories.find((c) => String(c.name || "").trim() === catName) ||
      (wantKind ? findCatByKind(wantKind) : null);
    if (!cat) {
      cat = {
        id: uid(),
        kind: wantKind || "",
        name: catName,
        icon: "📄",
        color: CAT_COLORS[state.settings.categories.length % CAT_COLORS.length],
        fieldTemplate: (r.fields || []).map((f) => f.label).filter(Boolean),
      };
      state.settings.categories.push(cat);
      normalizeCatOrder();
    }
    const who = fieldValue(r, "关联人物") || fieldValue(r, "相关人物") || fieldValue(r, "登场人物");
    const ids = resolveCharacterIds(who);
    const nameKey = normTitle(name);
    const existing = state.settings.entries.find((en) => en.categoryId === cat.id && normTitle(en.name) === nameKey);
    // 听「输入保护 → 设定档案」：整类锁定就完全不动（类别还没有字段模板时用得上）
    if (protectModeOf("entry:" + cat.id) === "lock") return;
    if (existing) {
      const merged = Array.isArray(existing.characterIds) ? existing.characterIds.slice() : [];
      ids.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      existing.characterIds = merged;
      // 同一条目：每个字段按自己的保护方式合并（重复的行去掉，不丢旧信息）
      if (!Array.isArray(existing.fields)) existing.fields = [];
      (r.fields || []).forEach((f) => {
        const label = String((f && f.label) || "").trim();
        const value = String((f && f.value) || "").trim();
        if (!label || !value) return;
        if (isInternalRadarField(f)) return;
        const own = existing.fields.find((x) => String((x && x.label) || "").trim() === label);
        const next = protectTextValue(protectEntryFieldKey(cat.id, label), own ? own.value : "", value);
        if (!next) return;
        if (!own) existing.fields.push({ label, value: next });
        else own.value = next;
      });
      if (r.summary) {
        existing.summary = protectTextValue(protectEntryFieldKey(cat.id, "概述"), existing.summary, r.summary);
      }
      if (catKind(cat) === "gear") fillGearRadarOf(existing, r);
      if (catKind(cat) === "faction") linkCharsToFactionEntry(existing);
      return;
    }
    const entry = {
      id: uid(),
      categoryId: cat.id,
      name,
      fields: stripInternalRadarFields((r.fields || []).filter((f) => f.label || f.value)),
      summary: r.summary || "",
      tags: [],
      characterIds: ids,
      eventIds: [],
      notes: r.source ? "出处：" + r.source : "",
    };
    state.settings.entries.push(entry);
    bumpStateRev();
    if (catKind(cat) === "gear") fillGearRadarOf(entry, r);
    // 「势力」条目：反向把成员写进人物的「所属势力」
    if (catKind(cat) === "faction") linkCharsToFactionEntry(entry);
  }

  /* 带「雷达图」这个追加功能的类别（装备默认开着）：顶点用这张卡自己的
     （还没建过就照这一类别的模板），听「输入保护 → 这个类别 · 雷达图」。 */
  function fillGearRadarOf(en, r) {
    if (!en || !r) return;
    const cat = getCat(en.categoryId);
    if (!catRadarOn(cat)) return; // 这一类没开 / 被禁用：数值和卡片都不动
    const tpl = catRadarAxes(cat);
    const axes = Array.isArray(en.radarAxes) && en.radarAxes.length ? en.radarAxes : tpl;
    const inc = radarValuesByAxes(axes, r);
    if (!Object.keys(inc).length) return;
    const hadValues = !!(en.radar && Object.keys(en.radar).length);
    const next = protectRadarValuesWith(en.radar, inc, catRadarProtectKey(cat.id));
    if (!Object.keys(next).length) return; // 被锁住 / 没有有效数值：这张卡什么都不动
    en.radar = next;
    if (!Array.isArray(en.radarAxes) || !en.radarAxes.length) {
      en.radarAxes = axes.map((a) => Object.assign({}, a));
    }
    // 第一次给这张卡填上数值：顺手把雷达图打开，免得填了却看不见
    if (!hadValues) en.radarOn = true;
    /* 打分依据（radarWhy）不往条目卡上写：它只属于文本分析任务的 results（见上面人物那一段的说明）。 */
  }

  // 势力条目的成员 → 人物的「所属势力」（双向同步）
  // 把被误转成势力设定的条目还原成人物角色
  function convertFactionBackToCharacter(entryId) {
    const en = getEntry(entryId);
    if (!en) return;
    const fields = en.fields || [];
    const fv = (label) => {
      const f = fields.find((x) => (x.label || "").includes(label));
      return f ? String(f.value || "").trim() : "";
    };
    state.characters.push({
      id: uid(),
      name: en.name,
      color: CHAR_COLORS[state.characters.length % CHAR_COLORS.length],
      gender: "",
      age: "",
      role: fv("类型"),
      appearance: "",
      personality: String(en.summary || ""),
      background: fv("简介"),
      goal: "",
      relationships: "",
      notes: "由势力条目转回人物",
      groupId: "",
      aliases: [],
      factionIds: [],
    });
    state.settings.entries = state.settings.entries.filter((x) => x.id !== entryId);
    saveState();
    renderCharacters();
    refreshLineViews(); // 含时间线：回填也会改时间 / 事件，时间线要跟着更新
    renderEntries();
    renderCategories();
    renderStats();
    closeModal("entry-modal");
  }

  function linkCharsToFactionEntry(entry) {
    if (!entry) return;
    (entry.characterIds || []).forEach((cid) => {
      const c = getChar(cid);
      if (!c) return;
      const list = new Set(c.factionIds || []);
      if (!list.has(entry.id)) {
        list.add(entry.id);
        c.factionIds = Array.from(list);
      }
    });
  }

  // 把人物拖到设定条目上：加入这个条目；势力条目会同步写入人物的「所属势力」
  function addCharsToEntry(charIds, entryId) {
    const en = getEntry(entryId);
    if (!en) return;
    const ids = new Set(en.characterIds || []);
    let added = 0;
    (charIds || []).forEach((id) => {
      if (getChar(id) && !ids.has(id)) {
        ids.add(id);
        added++;
      }
    });
    if (!added) {
      flashEntry(en.id);
      return;
    }
    en.characterIds = Array.from(ids);
    const cat = getCat(en.categoryId);
    if (cat && catKind(cat) === "faction") linkCharsToFactionEntry(en);
    saveState();
    refreshFactionViews();
    flashEntry(en.id);
  }

  function flashEntry(entryId) {
    const el = $(`#entry-list .entry-card[data-entry-id="${entryId}"]`);
    if (!el || typeof el.animate !== "function") return;
    el.animate(
      [
        { boxShadow: "0 0 0 3px rgba(111, 169, 216, 0.7)" },
        { boxShadow: "0 0 0 0 rgba(111, 169, 216, 0)" },
      ],
      { duration: 600, easing: "ease-out" }
    );
  }

async function fillResultsToSettings() {
    const task = getSelectedTask();
    if (!task) return;
    await fillTaskRecords(task, task.results || []);
}

/* 「跨任务归并-填入设定档案」：把所有任务的结果合并去重后一起填入（事件除外——
   事件归属章节、各任务自己点「填入」时才会按它自己的章节摆对）。 */
async function fillAllTasksToSettings() {
  const tasks = (state.analysis && state.analysis.tasks) || [];
  const all = [];
  tasks.forEach((t) => {
    if (t && Array.isArray(t.results)) all.push.apply(all, t.results);
  });
  if (!all.length) {
    uiAlert(uiTextFor("工作区里还没有可填入的分析结果。"));
    return;
  }
  const merged = dedupeRecords(all).filter((r) => r && r.type && r.type !== "event");
  if (!merged.length) {
    uiAlert(uiTextFor("没有可合并填入的人物 / 设定 / 关系结果。"));
    return;
  }
  const pseudo = {
    id: "__ALL__",
    name: "",
    results: merged,
    files: tasks.reduce((a, t) => a.concat((t && t.files) || []), []),
    segments: [],
    segApplied: true,
    segAskMuted: true,
  };
  await fillTaskRecords(pseudo, merged, uiTextFor("跨任务归并-填入设定档案"));
}

/* 同一套填入流程的核心：task 只是提供 segments / files / results 的上下文；
   「跨任务归并-填入」会传一个合并后的伪任务进来（label 也是那时给的）。 */
async function fillTaskRecords(task, records, label) {
    if (!task || !(records || []).length) return;
  // 还没按识别结果划分章节时先提醒一句：先把章 / 节建好，填入的事件才能落到正确的章 / 节里
  if ((task.segments || []).length && !task.segApplied && !task.segAskMuted) {
    const choice = await uiChoose(
      "还没按识别结果划分章节。先划分，填入的事件就能落到对应的章 / 节下面。",
      [
        { label: "划分章节并继续", value: "yes", primary: true, tip: "按识别结果在事件轴建立章节和小节，然后继续填入" },
        { label: "直接填入", value: "no", tip: "不建章节，直接填入（以后不再提醒这个任务）" },
        { label: "返回", value: "back", cancel: true, tip: "什么都不做，回到文本分析界面" },
      ],
      "填入设定档案"
    );
    if (!choice || choice === "back") return;
    if (choice === "yes") {
      pendingUndoLabel = "按识别的章 / 节建立章节";
      const n = buildChaptersFromSegments();
      task.segApplied = true;
      saveState();
      refreshLineViews(); // 含章节边栏 / 事件轴 / 二维图 / 时间线
      if (n) showToast(`已按识别结果建立 ${n} 个章节 / 小节`);
    } else {
      task.segAskMuted = true; // 选了「直接填入」就不再为这个任务提醒
      saveState();
    }
  }
    // 并行抓取的结果顺序是乱的，先按分块顺序号（或来源章节）归位
    sortResultsByOrder(task);
  // 只填「当前显示出来、并且勾选了的」结果（有搜索 / 过滤时，隐藏的不会被填）。
  // 注意：不再跳过带「已填入」标记的条目 —— 那个标记只是「填过」的提示，
  // 想再填一遍（比如中间清过工作区、或改过输入保护）直接点就行，会按输入保护规则更新。
    const shownNow = filterResultList(records || [], String(resultSearch || "").trim().toLowerCase(), task.id === "__ALL__" ? null : thinFilterFor(task));
    const shownSet = new Set(shownNow);
  const included = records.filter((r) => shownSet.has(r) && r.included !== false);
    if (!included.length) {
      uiAlert(
      "没有可填的结果：当前显示的结果里一条都没勾选。"
      );
      return;
    }
    let cc = 0;
    let ce = 0;
    let cs = 0;
    let cm = 0;
    let csKip = 0; // 被过滤掉的「只提了一句」的人物 / 设定
    const dupSuggestions = [];
    const aliasConflicts = []; // 别名里其实是「另一个人名字」的配对，填完统一交给合并弹窗
    const filledResults = new Set(); // 这一轮真正处理成功的结果，用于恢复「已填入」标记
    // 只被顺带提一句的（全文里提到它的句子加起来不到阈值）不建人物、也不建设定条目
    // 阈值和开关都在「文本分析」界面上，可随时改
    loadFillOpts();
    const thinLimit = thinThreshold();
    const filterThin = task.id === "__ALL__" ? false : !!fillOpts.filterThin;
    const sentences = filterThin ? taskSentences(task) : [];
    const tooThin = (r) => filterThin && recordEvidenceChars(r, sentences) < thinLimit;
    // 第一遍：先建立人物，供事件/设定关联
    // 这一轮里「会出现的人名」：已有卡片的所有叫法 + 本批结果里的人物名。
    // 用来判断某条记录的「别名」是不是其实是另一个人的名字（那样就不能静默并进来）。
    const takenNameKeys = new Set();
    included
      .filter((r) => r.type === "character")
      .forEach((r) => {
        const k = normNameKey(String(r.name || "").trim());
        if (k) takenNameKeys.add(k);
        const jk = jaNameKey(String(r.name || "").trim());
        if (jk) takenNameKeys.add("ja:" + jk);
      });
    state.characters.forEach((c) => {
      charCallNames(c).forEach((n) => {
        const k = normNameKey(n);
        if (k) takenNameKeys.add(k);
        const jk = jaNameKey(n);
        if (jk) takenNameKeys.add("ja:" + jk);
      });
    });
    included
      .filter((r) => r.type === "character")
      .forEach((r) => {
        const name = (r.name || "").trim();
        if (!name) return;
        if (tooThin(r)) {
          csKip++;
          return;
        }
        const { keep, conflicts } = splitCharacterAliases(name, nameAliasesOf(r), takenNameKeys);
        const existing = findCharacterByName(name, keep);
        // 名字和已有卡片一字不差 → 同一张卡：原地更新（不再另建一张重名的卡）
        if (existing && normNameKey(existing.name) === normNameKey(name)) {
          updateCharacterFromRecord(existing, r, keep);
          cc++;
          filledResults.add(r);
          conflicts.forEach((a) => aliasConflicts.push({ keepId: existing.id, alias: a, source: r.source || "" }));
          return;
        }
        // 其余情况（名字对不上、只在别名 / 简称上对得上）一律单独建卡，
        // 填完后放进合并弹窗让用户点一下 —— 绝不静默并成一个人
        const created = addCharacterFromRecord(r, true, keep);
        cc++;
        filledResults.add(r);
        if (!created) return;
        if (existing) dupSuggestions.push({ keepId: existing.id, createdId: created.id, aliases: [], source: r.source || "" });
        conflicts.forEach((a) => aliasConflicts.push({ keepId: created.id, alias: a, source: r.source || "" }));
      });
    // 第二遍：事件与设定
    // 先把「章 / 节」结构建齐（这样事件能直接落到对应的章 / 节，而不是堆在未分章里）
    if ((task.segments || []).some((s) => s.label && !/未分章/.test(s.label))) {
      buildChaptersFromSegments();
    }
    // 再把事件会用到的章节建齐并按章号排序，保证新事件落在正确的时间段
    included
      .filter((r) => r.type === "event" && r.source)
      .forEach((r) => {
        placeForSource(r.source, r.fileId, { segId: r.segId });
      });
    sortChaptersNaturally();
    included
      .filter((r) => r.type === "event")
      .forEach((r) => {
        addEventFromRecord(r);
        ce++;
        filledResults.add(r);
      });
    included
      .filter((r) => r.type === "setting")
      .forEach((r) => {
        if (tooThin(r)) {
          csKip++;
          return;
        }
        addSettingFromRecord(r);
        cs++;
        filledResults.add(r);
      });
    // 上面几轮塞了很多新卡片，缓存版本号在这里撞一次：
    // 后面 getChar() / findStrongNameDuplicateClusters() 才不会读到过期索引
    bumpStateRev();

    // 自定义规则：「静默合并」的那部分在这里并掉（其余命中项在下面的合并弹窗里确认）
    let ruleSilentN = applySilentCharRuleMerges({ save: false, noLabel: true });
    ruleSilentN += applySilentEntryRuleMerges("", { save: false, noLabel: true });

  // 强同名（同名 / 连续 6 字相同且不含标点）的也不再静默合并，统一放进下面的合并弹窗确认
  const strongClusters = findStrongNameDuplicateClusters();

    // 人物关系
    let cr = 0;
    included
      .filter((r) => r.type === "relation")
      .forEach((r) => {
        const a = fieldValue(r, "人物A") || fieldValue(r, "人物1") || fieldValue(r, "甲");
        const b = fieldValue(r, "人物B") || fieldValue(r, "人物2") || fieldValue(r, "乙");
        const ca = findCharacterByName(a, []);
        const cb = findCharacterByName(b, []);
        if (!ca || !cb || ca.id === cb.id) return;
        const label = fieldValue(r, "关系") || r.name || "";
        const rawKind = fieldValue(r, "类型");
        const kind = pickRelKind(rawKind, label);
        if (addRelation(ca.id, cb.id, label, kind, fieldValue(r, "依据") || r.summary || "")) cr++;
        filledResults.add(r);
      });
    // 关系体检跟着文本分析静默做：刚写进来的关系里站不住的，直接清掉（不弹窗，能撤销）
    const crDropped = auditRelationsSilently();

    // 龙套自动纠错：出场较多的角色不该留在龙套组
    promoteActiveExtras(true);
    /* 不再静默「把人物卡转成势力条目」（用户 2026-10-17）：
       「填入设定档案」只写这次勾选的分析结果，不从人物卡 / 事件卡等别处再派生条目；
       想按人物 / 事件重新整理设定，走「设定档案 → 自动更新」。 */

    // 身份合并记录：文本明确揭示两个名字其实是同一人。
    // 多条记录只要有共同人物就归成一组：一栏里一次并掉，不会出现「艾达=艾达·普利西法」列两栏的情况
    const idGroups = [];
    included
      .filter((r) => r.type === "merge")
      .forEach((r) => {
        const raw = fieldValue(r, "同一人物") || fieldValue(r, "人物") || fieldValue(r, "身份");
        const names = String(raw || "")
          .split(/[、,，\/;；]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const ids = [];
        names.forEach((n) => {
          const c = findCharacterByName(n, []);
          if (c && !ids.includes(c.id)) ids.push(c.id);
        });
        if (ids.length < 2) return;
        // AI 说“同一人物”也要有证据：名字本身相似，或原文依据句里同时出现这些名字。
        // 只有泛称 / 组织名（老大、校园三剑客…）串起来的低置信记录不自动进合并组。
        const similarPair = ids.some((idA, ai) =>
          ids.slice(ai + 1).some((idB) => charNamesOverlap(getChar(idA), getChar(idB)))
        );
        const evidenceText = normNameKey(
          [fieldValue(r, "依据"), r.summary, r.notes].filter(Boolean).join(" ")
        );
        const evidenceHasNames =
          evidenceText &&
          names.length >= 2 &&
          names.every((n) => {
            const k = normNameKey(n);
            return k && evidenceText.indexOf(k) >= 0;
          });
        if (!similarPair && !evidenceHasNames) return;
        filledResults.add(r);
        let g = idGroups.find((grp) => ids.some((id) => grp.ids.has(id)));
        if (!g) {
          g = { ids: new Set(), basis: [], sources: [] };
          idGroups.push(g);
        }
        ids.forEach((id) => g.ids.add(id));
        const basisText = fieldValue(r, "依据") || r.summary || "文本揭示的身份关系";
        if (basisText && !g.basis.includes(basisText)) g.basis.push(basisText);
        if (r.source && !g.sources.includes(r.source)) g.sources.push(r.source);
        // 和别的组有共同人物就合成一组
        for (let i = idGroups.length - 1; i >= 0; i--) {
          const other = idGroups[i];
          if (other === g) continue;
          let shared = false;
          other.ids.forEach((id) => {
            if (g.ids.has(id)) shared = true;
          });
          if (!shared) continue;
          other.ids.forEach((id) => g.ids.add(id));
          other.basis.forEach((x) => {
            if (!g.basis.includes(x)) g.basis.push(x);
          });
          other.sources.forEach((x) => {
            if (!g.sources.includes(x)) g.sources.push(x);
          });
          idGroups.splice(i, 1);
        }
      });
    const identityItems = idGroups
      .map((g) => {
        const members = Array.from(g.ids)
          .map((id) => getChar(id))
          .filter(Boolean);
        if (members.length < 2) return null;
        const init = charMainIndex(members);
        return makeSwapItem(members, init, (k, ds, i, ctx) => {
          const picks = ctx.picks(ctx.ordered, null, (m) =>
            charRecordTip(m, uiTextFor(m.id === k.id ? "主体（字段以它为先）" : "参与合并"))
          );
          const basisText = g.basis[0] || uiTextFor("文本揭示的身份关系");
          const src = earliestSourceOf(g.sources) || g.sources[0] || "";
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason: `${basisText}${src ? " · " + src : ""} · ${uiMergeTail(ds.length, { onlyOne: true })}`,
            tip: charMergeTip(k, ds, src ? `本条记录出处：${src}` : ""),
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              return { names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(inc)) } };
            },
            apply: (finalName) => mergeClusterInto(k.id, ds.filter(ctx.included).map((m) => m.id), { finalName }),
          };
        });
      })
      .filter(Boolean);
    cm += identityItems.length;
    // 疑似重复的新人物：把成对的线索连成一串（A-B、B-C 归成同一组），
    // 一组里所有词条并排放在一栏，勾选后一次性合并成同一个
    // 先补上「别名冲突」：「久亚」被写成「监控子」的别名这种事，等这批卡都建完
    // 才能配上另一张卡（那张卡可能排在后面才建出来）。
    aliasConflicts.forEach((x) => {
      const other = findCharacterByName(x.alias, []);
      if (!other || other.id === x.keepId) return;
      const keepCard = getChar(x.keepId);
      dupSuggestions.push({
        keepId: x.keepId,
        createdId: other.id,
        aliases: [],
        source: x.source || "",
        why: "疑似同一人（「" + x.alias + "」被写成了它的别名）",
        // 两个名字看着一点也不像（「久亚 / 监控子」）＝证据太弱：弹窗里默认不勾，让用户自己点
        weak: !namesLookRelated(keepCard ? keepCard.name : "", x.alias),
      });
    });
    const newIds = new Set(); // 这一批新识别出来的
    const oldIds = new Set(); // 工作区里已有的
    const srcById = new Map(); // 人物 id → 它的出处
    const dupPairs = [];
    dupSuggestions.forEach((s) => {
      const keep = getChar(s.keepId);
      const created = getChar(s.createdId);
      if (!keep || !created) return;
      oldIds.add(s.keepId);
      newIds.add(s.createdId);
      if (s.source) {
        const arr = srcById.get(s.createdId) || [];
        if (!arr.includes(s.source)) arr.push(s.source);
        srcById.set(s.createdId, arr);
      }
      dupPairs.push({
        keepId: s.keepId,
        createdId: s.createdId,
        aliases: s.aliases || [],
        source: s.source || "",
        why: s.why || "",
        weak: !!s.weak,
      });
    });
    const dupGroups = [];
    // 强同名的那几组也塞进同一个弹窗（标上原因），让用户自己确认要不要并
    strongClusters.forEach((ids) => {
      const set = new Set(ids);
      if (set.size > 1)
        dupGroups.push({ ids: set, aliases: [], sources: [], why: "同名（名字高度重合）", strong: true });
    });
    dupPairs.forEach((p2) => {
      let g = dupGroups.find((grp) => grp.ids.has(p2.keepId) || grp.ids.has(p2.createdId));
      if (!g) {
        g = { ids: new Set(), aliases: [], sources: [] };
        dupGroups.push(g);
      }
      if (p2.why && !g.why) g.why = p2.why;
      // 这一组里既有「看着像」的线索、又有「名字一点不像」的线索时：
      // 后者先划掉（默认不并），用户想并再自己点亮
      if (!g.weakIds) g.weakIds = new Set();
      if (p2.weak) {
        g.weak = true;
        // 被「写成别名」的那张卡（例如「久亚」）先划掉：默认按「不是同一人」处理
        if (p2.createdId) g.weakIds.add(p2.createdId);
      } else {
        g.strong = true;
      }
      g.ids.add(p2.keepId);
      g.ids.add(p2.createdId);
      (p2.aliases || []).forEach((a) => {
        if (a && !g.aliases.includes(a)) g.aliases.push(a);
      });
      if (p2.source && !g.sources.includes(p2.source)) g.sources.push(p2.source);
      // 和别的组有共同人物就合成一组（A-B、B-C → A/B/C 一组）
      for (let i = dupGroups.length - 1; i >= 0; i--) {
        const other = dupGroups[i];
        if (other === g) continue;
        let shared = false;
        other.ids.forEach((id) => {
          if (g.ids.has(id)) shared = true;
        });
        if (!shared) continue;
        other.ids.forEach((id) => g.ids.add(id));
        if (other.why && !g.why) g.why = other.why;
        if (!g.weakIds) g.weakIds = new Set();
        if (other.weak) {
          g.weak = true;
          (other.weakIds || []).forEach((id) => g.weakIds.add(id));
        } else if (other.strong) g.strong = true;
        other.aliases.forEach((a) => {
          if (!g.aliases.includes(a)) g.aliases.push(a);
        });
        other.sources.forEach((x) => {
          if (!g.sources.includes(x)) g.sources.push(x);
        });
        dupGroups.splice(i, 1);
      }
    });
    const dupItems = dupGroups
      .map((g) => {
        const members = Array.from(g.ids)
          .map((id) => getChar(id))
          .filter(Boolean);
        if (members.length < 2) return null;
        const init = charMainIndex(members);
        const it = makeSwapItem(members, init, (k, ds, i, ctx) => {
          const tipOf = (m) => {
            const isSubject = m.id === k.id;
            const isNew = newIds.has(m.id) && !oldIds.has(m.id);
            const base = charRecordTip(m, (isNew ? "新识别" : "已有") + (isSubject ? "（主体）" : ""));
            const srcs = (srcById.get(m.id) || []).filter((x) => base.indexOf(x) < 0);
            const extra = isSubject
              ? uiSentence("mergeSubjectNote")
              : uiLanguage() === "en"
              ? "\n(merged into “" + k.name + "”)"
              : uiLanguage() === "ja"
              ? "\n（「" + k.name + "」に統合されます）"
              : uiLanguage() === "zh-TW"
              ? "\n（會併進「" + k.name + "」）"
              : "\n（会并进「" + k.name + "」）";
            return base + (srcs.length ? "\n" + srcs.map((x) => "出处：" + x).join("\n") : "") + extra;
          };
          const picks = ctx.picks(ctx.ordered, null, tipOf);
          const groupSource = earliestSourceOf(g.sources) || g.sources[0] || "";
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason:
              (g.why ? uiTextFor(g.why) : uiTextFor("疑似同一人")) +
              (g.aliases.length
                ? uiParens(
                    uiTextFor("别名") + (uiLanguage() === "en" ? ": " : "：") + g.aliases.join(uiLanguage() === "en" ? ", " : "、")
                  )
                : "") +
              (groupSource ? " · " + groupSource : "") +
              " · " +
              uiMergeTail(ds.length, {}),
            tip: charMergeTip(k, ds, groupSource ? `本条记录出处：${groupSource}` : ""),
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              return { names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(inc)) } };
            },
            apply: (finalName) => mergeClusterInto(k.id, ds.filter(ctx.included).map((m) => m.id), { finalName }),
          };
        });
        // 「只在别名里对得上、名字又一点不像」的线索（久亚被写成监控子的别名就是这类）：
        // 标出来交给 openMergeDialog 统一处理 —— 有强线索就先把这张卡划掉，只剩弱线索就默认不勾。
        if (it && g.weak && g.weakIds && g.weakIds.size) {
          it.weakPairIds = Array.from(g.weakIds);
          // 这一栏里有没有「名字看着像 / 文本明说」的强线索；纯弱线索的才默认不勾
          it.strongEvidence = !!g.strong;
        } else if (it && g.weak) {
          it.strongEvidence = false;
        } else if (it) {
          it.strongEvidence = true;
        }
        return it;
      })
      .filter(Boolean);
    // 自定义识别规则命中的人物：也列进来让用户确认（静默合并的那部分上面已经并掉了）
    const ruleItems = charRuleClusters()
      .map((cl) => {
        const members = cl.ids.map((id) => getChar(id)).filter(Boolean);
        if (members.length < 2) return null;
        const init = charMainIndex(members);
        return makeSwapItem(members, init, (k, ds, i, ctx) => {
          const picks = ctx.picks(ctx.ordered, null, (m) =>
            charRecordTip(m, m.id === k.id ? "主体（字段以它为先）" : "参与合并")
          );
          return {
            label: "",
            labelHtml: "",
            picks,
            names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(ds)) },
            reason: cl.why,
            tip: charMergeTip(k, ds, cl.why),
            live: (it) => {
              const inc = ds.filter((m) => !it.excluded.has(m.id));
              return { names: { keep: String(k.name || "").trim(), full: fullestNameOf([k].concat(inc)) } };
            },
            apply: (finalName) => mergeClusterInto(k.id, ds.filter(ctx.included).map((m) => m.id), { finalName }),
          };
        });
      })
      .filter(Boolean);
    // 自定义规则命中的排在前面（用户自己写的规则优先），其次是身份合并记录，
    // 最后是「疑似重复」；同一组若被多处列出，弹窗入口会去重保留前者。
    const items = ruleItems.concat(identityItems, dupItems);
    if (filledResults.size) {
      filledResults.forEach((r) => {
        r.applied = true;
      });
      pendingUndoLabel =
        label ||
        (`填入设定档案：人物 ${cc} / 事件 ${ce} / 设定 ${cs} / 关系 ${cr}${crDropped ? `（体检清掉 ${crDropped}）` : ""}` +
          (ruleSilentN ? `（自定义规则静默合并 ${ruleSilentN} 组）` : ""));
      if (crDropped) showToast(`关系体检：清掉 ${crDropped} 条站不住的关系`);
      // 批量回填会让新增事件挤在章节原有事件后面（用 +0.001 排位），
      // 多章并发时可能撞出同一个 storyIndex；回填完规整成唯一整数，章 / 节范围才准确
      normalizeStoryIndexes();
      saveState();
      refreshFactionViews(); // 含势力卡 / 人物边栏 / 势力分析表 / 出场统计
      refreshLineViews(); // 含时间线：回填会改时间 / 事件，时间线要跟着更新
      renderCategories();
      renderRelations();
      if (task.id !== "__ALL__") renderResultReview(task);
      renderTaskList();
    }
    if (items.length) openMergeDialog("新识别的人物可能已存在，请选择是否合并", items);
  }

