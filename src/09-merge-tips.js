  /* ---- 合并弹窗里「名字」上的悬浮说明：这个词条出自哪里、会被导入哪些信息 ---- */
  // 单条人物记录的说明（鼠标停在这个名字上时显示）
  function charRecordTip(c, tag, extra) {
    if (!c) return "";
    const T = (s) => uiTextFor(s);
    const lines = [uiSentence("recordTipTitle", T(tag || "记录"), c.name)];
    const bits = [];
    if (String(c.srcTime || "").trim()) bits.push(T("时间：") + String(c.srcTime).trim());
    const nar = String(c.srcNarrative || "").trim();
    if (nar && nar !== "顺叙") bits.push(T("叙事：") + nar);
    const m = String(c.notes || "").match(/出处：([^\n]+)/);
    if (m) bits.push(T("出处：") + sourceWithRow(m[1].trim()));
    if (bits.length) lines.push(bits.join(T("　")));
    const fields = [
      ["背景", c.background],
    ]
      .filter(([, v]) => String(v || "").trim())
      .map(([k, v]) => T(k) + T("＝") + String(v).replace(/\s+/g, " ").slice(0, 40));
    lines.push(fields.length ? T("现有信息：") + fields.join(T("；")) : T("现在还没有其它信息"));
    if ((c.aliases || []).length) lines.push(T("别名：") + (c.aliases || []).join(T("、")));
    const note = String(c.notes || "")
      .replace(/出处：[^\n]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (note) lines.push(T("备注：") + note.slice(0, 80));
    const assoc = charAssocCounts();
    const ne = assoc.events.get(c.id) || 0;
    const ns = assoc.entries.get(c.id) || 0;
    if (ne || ns) lines.push(uiSentence("recordTipAssoc", ne, ns));
    if (extra) lines.push(extra);
    return lines.join("\n");
  }

  // 设定条目的单条说明（同上，用在设定卡片的自动合并弹窗里）
  function entryRecordTip(en, tag) {
    if (!en) return "";
    const T = (s) => uiTextFor(s);
    const lines = [uiSentence("recordTipTitle", T(tag || "记录"), en.name)];
    const bits = [];
    const cat = getCat(en.categoryId);
    if (cat) bits.push(T("类别：") + catDisplayName(cat));
    const g = en.groupId ? getSettingGroup(en.groupId) : null;
    if (g) bits.push(T("分组：") + g.name);
    const m = String(en.notes || "").match(/出处：([^\n]+)/);
    if (m) bits.push(T("出处：") + sourceWithRow(m[1].trim()));
    if (bits.length) lines.push(bits.join(T("　")));
    const fields = (en.fields || [])
      .filter((f) => String((f && f.value) || "").trim())
      .map((f) => uiTextFor(String(f.label || "字段")) + T("＝") + String(f.value).replace(/\s+/g, " ").slice(0, 40));
    lines.push(fields.length ? T("现有信息：") + fields.join(T("；")) : T("现在还没有其它信息"));
    if (String(en.summary || "").trim()) lines.push(T("概述：") + String(en.summary).replace(/\s+/g, " ").slice(0, 80));
    if ((en.characterIds || []).length || (en.eventIds || []).length)
      lines.push(uiSentence("recordTipAssocEntry", (en.characterIds || []).length, (en.eventIds || []).length));
    return lines.join("\n");
  }

  let nameTipPop = null;
  let nameTipPinned = false; // 点开的说明：鼠标移开也不消失，方便慢慢看 / 复制
  let nameTipOwner = null;
  let nameTipHoverEl = null; // 当前鼠标下的词条名，避免 mouseover 反复重建说明气泡

  function hideNameTip(force) {
    if (nameTipPinned && !force) return; // 钉住的只有明确关闭才收起来
    if (nameTipPop) {
      nameTipPop.remove();
      nameTipPop = null;
    }
    nameTipPinned = false;
    nameTipOwner = null;
  }

  function showNameTip(target, text, pinned, ev) {
    if (!target || !text) return;
    if (nameTipPop && nameTipPinned && !pinned) return; // 已经钉住一条说明时，悬停别处不要抢
    hideNameTip(true);
    const el = document.createElement("div");
    el.className = "name-tip-pop" + (pinned ? " pinned" : "");
    el.textContent = text;
    if (pinned) {
      const hint = document.createElement("span");
      hint.className = "name-tip-hint";
      hint.textContent = "点别处或按 Esc 关闭（可以滚动 / 选中复制）";
      el.appendChild(hint);
    }
    document.body.appendChild(el);
    const r = uiVisualRect(target);
    const er = uiVisualRect(el);
    const w = er.width;
    const h = er.height;
    let left;
    let top;
    /* 位置和「悬浮气泡」那套统一：**贴在鼠标右下角**，右边放不下就翻到鼠标左上。
       以前翻边时改成「右边缘对齐被悬停的元素」，宽一点的词条（合并弹窗里的候选行）就会正好被盖住
       （用户 2026-10-16 报「挡住词条本身」）——所以翻边也一律以鼠标为基准。
       没有鼠标位置（点开的「钉住」说明）时才退回贴元素右下角。 */
    const hasCursor = !!(ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY));
    if (hasCursor) {
      const cx = ev.clientX;
      const cy = ev.clientY;
      left = cx + 12;
      top = cy + 18;
      if (left + w > window.innerWidth - 8) {
        left = Math.max(8, cx - 12 - w);
        top = Math.max(8, cy - h - 12);
      }
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    } else {
      left = r.right + 12;
      top = r.top + 18;
      if (left + w > window.innerWidth - 8) left = Math.max(8, r.right - w - 6);
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    }
    if (top < 8) top = 8;
    // 上面这一串算的都是「视觉 px」：写进 style 前要除回界面缩放
    el.style.left = uiZoomPx(left);
    el.style.top = uiZoomPx(top);
    nameTipPop = el;
    nameTipPinned = !!pinned;
    nameTipOwner = target;
    /* 记住这次的位置参数：界面缩放一变按原样重放（left/top 是「元素坐标系里的 px」） */
    nameTipLast = { target: target, text: text, pinned: !!pinned, ev: ev ? { clientX: ev.clientX, clientY: ev.clientY } : null };
  }

  let nameTipLast = null;
  uiOnZoomReflow(() => {
    if (!nameTipPop || !nameTipLast || !nameTipLast.target || !nameTipLast.target.isConnected) return;
    const a = nameTipLast;
    let ev = a.ev;
    if (!a.pinned && typeof uiLastPointer !== "undefined" && Date.now() - uiLastPointer.at < 5000) {
      ev = { clientX: uiLastPointer.x, clientY: uiLastPointer.y };
    } else if (!a.pinned && a.target.getBoundingClientRect) {
      const r = a.target.getBoundingClientRect();
      ev = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    }
    showNameTip(a.target, a.text, a.pinned, ev);
  });

  function bindMergeItemTips(root) {
    bindNameTipDismiss();
    if (!root || root.__tipsBound) return;
    root.__tipsBound = true;
    root.addEventListener("mouseover", (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest(".name-tip") : null;
      if (!el || !root.contains(el)) return;
      if (nameTipHoverEl === el) return;
      nameTipHoverEl = el;
      if (!nameTipPinned) showNameTip(el, el.dataset.tip || "", false, ev);
    });
    root.addEventListener("mouseout", (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest(".name-tip") : null;
      if (!el || !root.contains(el)) return;
      const to = ev.relatedTarget;
      if (to && el.contains(to)) return;
      if (nameTipHoverEl === el) nameTipHoverEl = null;
      if (!nameTipPinned) hideNameTip();
    });
    root.addEventListener("click", (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest(".name-tip") : null;
      if (!el || !root.contains(el)) return;
      // 点名字只看说明，不要顺手把这一项勾上 / 取消
      ev.preventDefault();
      if (el.closest(".merge-pick")) return; // 词条方块上的名字：这次点击＝参与 / 不参与，交给方块自己处理
      ev.stopPropagation();
      if (nameTipPinned && nameTipOwner === el) hideNameTip(true);
      else showNameTip(el, el.dataset.tip || "", true);
    });
  }

  // 人物卡片的悬停说明：复用合并弹窗同一套气泡样式，内容在悬停时才计算。
  function bindCharCardTips(root) {
    if (!root || root.__charTipsBound) return;
    root.__charTipsBound = true;
    root.addEventListener("mouseover", (ev) => {
      const card = ev.target && ev.target.closest ? ev.target.closest(".char-card[data-tip-id]") : null;
      if (!card || !root.contains(card)) return;
      if (root.__charTipCard === card) return;
      root.__charTipCard = card;
      if (nameTipPinned) return;
      const c = getChar(card.dataset.tipId);
      if (c) showNameTip(card, charRecordTip(c, "人物"), false, ev); // 跟着鼠标，别贴卡片一边
    });
    root.addEventListener("mouseout", (ev) => {
      const card = ev.target && ev.target.closest ? ev.target.closest(".char-card[data-tip-id]") : null;
      if (!card || !root.contains(card)) return;
      const to = ev.relatedTarget;
      if (to && card.contains(to)) return;
      if (root.__charTipCard === card) root.__charTipCard = null;
      if (!nameTipPinned) hideNameTip();
    });
  }

  // 点别处 / 按 Esc 关闭「钉住」的说明（只绑一次）
  function bindNameTipDismiss() {
    if (bindNameTipDismiss.done) return;
    bindNameTipDismiss.done = true;
    document.addEventListener(
      "click",
      (ev) => {
        if (!nameTipPinned) return;
        if (nameTipPop && nameTipPop.contains(ev.target)) return; // 点说明里的滚动条 / 选文字
        if (ev.target && ev.target.closest && ev.target.closest(".name-tip")) return; // 点名字交给它自己
        hideNameTip(true);
      },
      true
    );
    document.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key !== "Escape" || !nameTipPinned) return;
        hideNameTip(true);
        ev.stopPropagation(); // 别顺手把合并弹窗也关了
        ev.preventDefault();
      },
      true
    );
  }

  // 合并项的悬浮说明：这条记录出自哪里、会导入哪些信息、谁会成为主体
  // finalNameOverride 有值时，末尾那行「合并后词条名」就用它（弹窗里双击改过 / 手动换过主体）
  function charMergeTip(keep, drops, extra, finalNameOverride) {
    const list = Array.isArray(drops) ? drops.filter(Boolean) : [drops].filter(Boolean);
    const srcOf = (c) => {
      const bits = [];
      if (String(c.srcTime || "").trim()) bits.push("时间：" + String(c.srcTime).trim());
      const nar = String(c.srcNarrative || "").trim();
      if (nar && nar !== "顺叙") bits.push("叙事：" + nar);
      const m = String(c.notes || "").match(/出处：([^\n]+)/);
      if (m) bits.push("出处：" + sourceWithRow(m[1].trim()));
      return bits.join("　");
    };
    const fieldsOf = (c) =>
      [
        ["背景", c.background],
      ]
        .filter(([, v]) => String(v || "").trim())
        .map(([k, v]) => k + "＝" + String(v).replace(/\s+/g, " ").slice(0, 40));
    const lines = [];
    if (keep) {
      lines.push(`【已有】${keep.name}${srcOf(keep) ? "（" + srcOf(keep) + "）" : ""}`);
      const kf = fieldsOf(keep);
      lines.push(kf.length ? "现有信息：" + kf.join("；") : "现在还没有其它信息");
    }
    let best = keep;
    list.forEach((c) => {
      lines.push("");
      lines.push(`【新识别】${c.name}${srcOf(c) ? "（" + srcOf(c) + "）" : ""}`);
      const df = fieldsOf(c);
      const listSep = uiLanguage() === "en" ? "; " : "；";
      const nameSep = uiLanguage() === "en" ? ", " : "、";
      lines.push(df.length ? uiSentence("mergeImports", df.join(listSep)) : uiSentence("mergeNoExtra"));
      if ((c.aliases || []).length) lines.push(uiSentence("mergeAliases", (c.aliases || []).join(nameSep)));
      if (String(c.notes || "").trim()) {
        const note = String(c.notes).replace(/出处：[^\n]+/g, "").replace(/\s+/g, " ").trim();
        if (note) lines.push(uiSentence("mergeNote", note.slice(0, 80)));
      }
      if (charMainScore(c) > charMainScore(best)) best = c;
    });
    lines.push("");
    const shownName =
      String(finalNameOverride || "").trim() ||
      (keep ? String(keep.name || "").trim() : "") ||
      fullestNameOf([keep].concat(list));
    const manualName = !!String(finalNameOverride || "").trim() && shownName !== (keep ? String(keep.name || "").trim() : "");
    lines.push(uiSentence("mergeName", shownName, uiTextFor(manualName ? "你手动指定的名字" : "用主体的名字")));
    lines.push(
      uiSentence(
        "mergeKey",
        best ? best.name : uiTextFor("（未知）"),
        best && srcOf(best) ? srcOf(best) : "",
        uiSentence("mergeKeyCharTail")
      )
    );
    if (extra) lines.push(extra);
    return lines.join("\n");
  }

  // 叙事方式：顺叙（或没写）算 0，插叙算 1 —— 合并时顺叙的内容排前面
  function charNarrativeRank(c) {
    const nar = String((c && c.srcNarrative) || "").trim();
    if (!nar || nar === "顺叙") return 0;
    return 1;
  }

  // 从时间文本里估一个可排序的键：算不出来的返回 null（排最后）
  function charTimeSortKeyOfText(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    const digit = t.replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)));
    const m = digit.match(/-?\d+(?:\.\d+)?/);
    // 「十年前 / 数年前 / 故事开始前」这类算很早，排在前面
    if (/年前|故事开始前|多年前|数年前|很久以前/.test(t)) {
      const cn = t.match(/([零一二三四五六七八九十百千万两〇]+)\s*年\s*前/);
      const cnVal = cn ? cnNumberValue(cn[1]) : null;
      const n = Number.isFinite(cnVal) ? cnVal : m ? parseFloat(m[0]) : 10;
      return -1e6 - n * 100;
    }
    // 出生 / 幼年 / 童年这类比「十年前」再早
    if (/出生|幼年|幼时|小时候|童年|儿时|婴儿|襁褓/.test(t)) return -2e6;
    if (/^(少年时|少年|学生时代|青春期)/.test(t)) return -1.5e6;
    if (/^(从前|曾经|当年|许久以前|很久以前)/.test(t)) return -1.8e6;
    // 「第三年」「二十年」这类中文年份
    const cnYear = t.match(/第?\s*([零一二三四五六七八九十百千万两〇]+)\s*年/);
    if (cnYear) {
      const n = cnNumberValue(cnYear[1]);
      if (Number.isFinite(n)) return n;
    }
    // 「20 岁 / 二十岁」这类年龄：放在早年档里，比没有时间信息的靠前
    const age = digit.match(/(\d{1,3})\s*岁/);
    if (age) return -5e5 + parseFloat(age[1]);
    if (m) return parseFloat(m[0]);
    if (/中年/.test(t)) return 5e5;
    if (/晚年|老年/.test(t)) return 1e6;
    return null;
  }

  function charTimeSortKey(c) {
    return charTimeSortKeyOfText(c && c.srcTime);
  }

  // 把一段背景经历按「带时间的句子」拆成小段，便于跨人物记录按时间穿插排序。
  // 没有时间的句子会跟着上一句走，不会把一段连贯的描述拆散。
  function expandTimedBackground(item) {
    const text = String((item && item.text) || "").trim();
    if (!text) return [];
    const sentences = splitTextSentences(text);
    const out = [];
    let cur = "";
    let curHasTime = false;
    sentences.forEach((raw) => {
      const piece = String(raw || "").trim();
      if (!piece) return;
      const hasTime = charTimeSortKeyOfText(piece) !== null;
      if (hasTime && cur && curHasTime) {
        out.push({ text: cur, time: charTimeSortKeyOfText(cur) !== null ? "" : item.time });
        cur = piece;
        curHasTime = true;
      } else {
        cur += (cur ? " " : "") + piece;
        if (hasTime) curHasTime = true;
      }
    });
    if (cur) out.push({ text: cur, time: charTimeSortKeyOfText(cur) !== null ? "" : item.time });
    return out;
  }

  // 按时间先后把若干段文字拼起来（人物「背景经历」用它）
  function mergeTextsByTime(items) {
    const expanded = [];
    (items || []).forEach((it, i) => {
      expandTimedBackground(it).forEach((piece, j) => expanded.push({ ...piece, i: i * 1000 + j }));
    });
    const list = expanded
      .map((it, i) => ({ time: it && it.time, text: String((it && it.text) || "").trim(), i }))
      .filter((it) => it.text);
    if (list.length < 2) return list.length ? list[0].text : "";
    // 先去掉重复 / 互相包含的（保留更完整的那条）
    const kept = [];
    list.forEach((it) => {
      const norm = normTitle(it.text);
      const hit = kept.findIndex((k) => {
        const kn = normTitle(k.text);
        return kn === norm || kn.includes(norm) || norm.includes(kn);
      });
      if (hit < 0) kept.push(it);
      else if (normTitle(kept[hit].text).length < norm.length) kept[hit] = it;
    });
    const ranked = kept.map((it, order) => {
      // 记录没带时间时，从背景经历文字里读「十年前 / 幼年 / 第三年 / 20 岁…」
      const key = charTimeSortKeyOfText(it.time) ?? charTimeSortKeyOfText(it.text);
      return { ...it, sortKey: key === null ? Number.MAX_SAFE_INTEGER : key, order };
    });
    ranked.sort((a, b) => a.sortKey - b.sortKey || a.order - b.order);
    return ranked.map((it) => it.text).join("\n");
  }

  // 「莉芙（科诺莉芙·维尔特）」这类写法：括号里更长的那一半才是更完整的名字
  function splitFullerName(name) {
    const s = String(name || "").trim();
    const m = s.match(/^(.*?)[（(【《〈「『]\s*([^）)】》〉」』]+)\s*[）)】》〉」』]$/);
    if (m) {
      const outer = m[1].trim();
      const inner = m[2].trim();
      if (inner && inner.length > outer.length) return { name: inner, aliases: [outer, s].filter(Boolean) };
    }
    return { name: s, aliases: [] };
  }

  // 一组人合并后，词条名用哪个写法：取最完整的那个（全名 / 带姓写法优先）
  function fullestNameOf(list) {
    let best = "";
    (list || []).forEach((c) => {
      const n = splitFullerName(c && c.name).name;
      if (n.length > best.length) best = n;
    });
    return best;
  }

  // 合并后的词条名：默认取「更完整」的写法（A·B 和 A 合并 → 用 A·B，A 记进别名）；
  // wanted 有值时用它（手动换过主体时＝主体的名字，或在弹窗里双击改过的名字）。
  function adoptFullerName(keep, drops, wanted) {
    if (!keep) return;
    const list = [keep].concat(drops || []).filter((c) => c && String(c.name || "").trim());
    if (list.length < 2) return;
    // 先把所有人的原名快照下来：下面改 keep.name 之后，list 里那个对象的 name 也跟着变了
    const names = list.map((c) => String(c.name || "").trim());
    const cur = String(keep.name).trim();
    const want = String(wanted || "").trim();
    const bestName = want || fullestNameOf(list) || cur;
    if (bestName && bestName !== cur) keep.name = bestName;
    const extra = [];
    names.forEach((n) => {
      const sp = splitFullerName(n);
      if (sp.aliases.length) extra.push.apply(extra, sp.aliases);
      if (n) extra.push(n);
    });
    // 这里不能用 addAliases：像「艾达」这种简称本来就是同一个人的写法，
    // addAliases 会把它判定成「和主名同一个人」而跳过，结果简称就丢了。
    if (!Array.isArray(keep.aliases)) keep.aliases = [];
    extra.forEach((n) => {
      const t = String(n || "").trim();
      if (!t || t === keep.name) return;
      if (keep.aliases.some((a) => String(a || "").trim() === t)) return;
      keep.aliases.push(t);
    });
  }

  function mergeClusterInto(keepId, dropIds, opts) {
    let keep = getChar(keepId);
    if (!keep) return;
    let drops = (dropIds || [])
      .map((id) => getChar(id))
      .filter(Boolean)
      .filter((c) => c.id !== keepId);
    // 自动合并（文本分析回填）：谁更像主体谁当主 —— 正常时间线的 / 信息更全的优先，
    // 而不是「谁先被分析出来谁当主」。手动合并不传这个参数，仍然按用户的点击顺序。
    if (opts && opts.autoPickMain && drops.length) {
      const all = [keep].concat(drops);
      let best = keep;
      all.forEach((c) => {
        if (charMainScore(c) > charMainScore(best)) best = c;
      });
      if (best !== keep) {
        keep = best;
        drops = all.filter((c) => c !== best);
      }
    }
    // 词条名统一取最完整的写法（全名优先，如 A·B 而不是 A），其余写法记进别名。
    // 手动合并也走这一步：字段仍按点击顺序，名字只换更完整的那个。
    adoptFullerName(keep, drops, opts && opts.finalName);
    const keepIdFinal = keep.id;
  // 被合并的那几条：顺叙的排前面，插叙的排后面；同一档再按时间先后
    const dropsOrdered = drops.slice().sort((a, b) => {
      const na = charNarrativeRank(a) - charNarrativeRank(b);
      if (na) return na;
      const ta = charTimeSortKey(a);
      const tb = charTimeSortKey(b);
      const ka = ta === null ? Number.MAX_SAFE_INTEGER : ta;
      const kb = tb === null ? Number.MAX_SAFE_INTEGER : tb;
      return ka - kb;
    });
    dropsOrdered.forEach((d) => {
      if (!d || d.id === keepIdFinal) return;
      addAliases(keep, [d.name].concat(d.aliases || []));
      // 主体的信息一律排在最前面，被合并进来的接在后面（不丢任何一段内容）
      ["role", "gender", "age", "appearance", "personality", "goal", "relationships", "notes"].forEach((k) => {
        keep[k] = mergeFieldText(keep[k], d[k], k);
      });
      // 自定义字段也一样：主体已有的标签值在前，同名标签换行追加
      if (!Array.isArray(keep.fields)) keep.fields = [];
      (d.fields || []).forEach((f) => {
        const label = String((f && f.label) || "").trim();
        const value = String((f && f.value) || "").trim();
        if (!label && !value) return;
        const own = keep.fields.find((x) => String((x && x.label) || "").trim() === label);
        if (!own) keep.fields.push({ label: (f && f.label) || "", value: (f && f.value) || "" });
        else own.value = mergeFieldText(own.value, f.value, label);
      });
      // 人设图：主体没有才用对方的
      if (!String(keep.portrait || "").trim() && String(d.portrait || "").trim()) keep.portrait = d.portrait;
      // 雷达图数值：主体没填的顶点，用被合并进来的补上（缺一个补一个，不覆盖主体）
      if (d.radar && typeof d.radar === "object" && !Array.isArray(d.radar)) {
        if (!keep.radar || typeof keep.radar !== "object") keep.radar = {};
        Object.keys(d.radar).forEach((k) => {
          if (keep.radar[k] == null && d.radar[k] != null) keep.radar[k] = d.radar[k];
        });
      }
      state.events.forEach((e) => {
        if ((e.characterIds || []).includes(d.id)) {
          e.characterIds = e.characterIds.filter((id) => id !== d.id);
          if (!e.characterIds.includes(keepIdFinal)) e.characterIds.push(keepIdFinal);
        }
      });
      state.settings.entries.forEach((en) => {
        if ((en.characterIds || []).includes(d.id)) {
          en.characterIds = en.characterIds.filter((id) => id !== d.id);
          if (!en.characterIds.includes(keepIdFinal)) en.characterIds.push(keepIdFinal);
        }
      });
    });
    // 「背景经历」按时间先后排：早年的事在前，后来的事在后（主体不再硬排最前）
    keep.background = mergeTextsByTime(
      [{ time: keep.srcTime, text: keep.background }].concat(
        drops.map((d) => ({ time: d.srcTime, text: d.background }))
      )
    );
    const dropSet = new Set(drops.map((d) => d.id));
    state.characters = state.characters.filter((c) => !dropSet.has(c.id));
    // 出处：取所有被合并记录里最靠前的那一条（例如主体出自第四章、被并的出自第一章 → 用第一章）
    applyEarliestSource(
      keep,
      [keep].concat(drops).map((c) => (c && c.notes) || "")
    );
  }

  function bigrams(s) {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  }

  // 标题是否高度相似（用于找出重复事件）
  function titleSimilar(a, b) {
    const x = normTitle(a);
    const y = normTitle(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;
    const A = bigrams(x);
    const B = bigrams(y);
    if (!A.length || !B.length) return false;
    const setB = new Set(B);
    let inter = 0;
    A.forEach((g) => {
      if (setB.has(g)) inter++;
    });
    return (2 * inter) / (A.length + B.length) >= 0.55;
  }

  function eventScore(e) {
    let s = 0;
    ["time", "cause", "process", "result", "notes"].forEach((k) => {
      if (e[k]) s += 1;
    });
    s += (e.characterIds || []).length * 0.5;
    s += linesOf(e).length * 0.3;
    return s;
  }

  function findDuplicateEventClusters() {
    const all = orderedByStory();
    const clusters = [];
    const join = (aId, bId) => {
      const ca = clusters.find((cl) => cl.includes(aId));
      const cb = clusters.find((cl) => cl.includes(bId));
      if (ca && cb) {
        if (ca !== cb) {
          ca.push(...cb);
          clusters.splice(clusters.indexOf(cb), 1);
        }
        return;
      }
      if (ca) ca.push(bId);
      else if (cb) cb.push(aId);
      else clusters.push([aId, bId]);
    };
    // 只在同一条线路内，判断按故事时间相邻的两个事件
    state.lines.forEach((line) => {
      const seq = all.filter((e) => linesOf(e).includes(line.id));
      for (let i = 0; i + 1 < seq.length; i++) {
        const a = seq[i];
        const b = seq[i + 1];
        if (!titleSimilar(a.title, b.title)) continue;
        join(a.id, b.id);
      }
    });
    return clusters.map((cl) => Array.from(new Set(cl))).filter((cl) => cl.length > 1);
  }

  // 把 dropIds 合并进 keepId：人物/线路取并集，字段补全，设定引用转移
  function mergeEventsInto(keepId, dropIds) {
    const keep = getEvent(keepId);
    if (!keep) return;
    dropIds.forEach((did) => {
      const d = getEvent(did);
      if (!d || d.id === keepId) return;
      // 人物取并集
      const chars = new Set(keep.characterIds || []);
      (d.characterIds || []).forEach((id) => chars.add(id));
      keep.characterIds = Array.from(chars);
      // 线路取并集
      setEventLines(keep, linesOf(keep).concat(linesOf(d)));
      // 文本字段：两边都有内容且不同就并列保留，不丢信息
      ["time", "place", "cause", "process", "result", "notes"].forEach((k) => {
        keep[k] = mergeFieldText(keep[k], d[k], k);
      });
      // 章节：谁先有归属就用谁的
      if (!keep.chapterId && d.chapterId) {
        keep.chapterId = d.chapterId;
        keep.sectionId = d.sectionId || "";
      } else if (keep.chapterId && !keep.sectionId && d.sectionId && d.chapterId === keep.chapterId) {
        keep.sectionId = d.sectionId;
      }
      // 叙事顺序：只要有一条是非线性，就按非线性标注
      if ((!keep.narrative || keep.narrative === "顺叙") && d.narrative) keep.narrative = d.narrative;
      if (!keep.source && d.source) keep.source = d.source;
      state.settings.entries.forEach((en) => {
        if ((en.eventIds || []).includes(d.id)) {
          en.eventIds = en.eventIds.filter((id) => id !== d.id);
          if (!en.eventIds.includes(keepId)) en.eventIds.push(keepId);
        }
      });
    });
    const dropSet = new Set(dropIds);
    state.events = state.events.filter((e) => !dropSet.has(e.id));
    state.order = state.order.filter((id) => !dropSet.has(id));
    // 合并后 keep 的线路是并集，可能和同行其它卡片挤在一起 → 挤了就往下一行挪
    avoidLaneCollision([keepId]);
  }

  // 合并两个文本字段：同一字段内做句级去重 / 整合，而不是简单换行堆叠。
  // field 传入字段名（如 appearance / personality / notes / 出处），用来决定合并方式。
  function mergeFieldText(a, b, field) {
    const x = String(a || "").trim();
    const y = String(b || "").trim();
    if (!x) return y;
    if (!y) return x;
    const label = String(field || "");
    const isNotes = /notes|备注|说明/i.test(label);
    const isSource = /出处|来源|首次出现|初次出现/.test(label);
    const isAlias = /别名|别称|又称|其他写法|同义词|曾用名/.test(label);
    const splitRe = isNotes
      ? /\n+/
      : isAlias
        ? /[、,，;；\n]+/
        : isSource
          ? /[;；\n]+/
          : /[\n。！？!?；;，,、]+/;
    const pieces = [];
    const add = (s) => {
      const t = String(s || "").trim().replace(/[。！？!?；;]+$/, "");
      if (!t) return;
      const nt = normTitle(t);
      if (!nt) return;
      const hit = pieces.findIndex((p) => {
        const np = normTitle(p);
        return np === nt || np.includes(nt) || nt.includes(np);
      });
      if (hit < 0) pieces.push(t);
      else if (normTitle(pieces[hit]).length < nt.length) pieces[hit] = t;
    };
    String(x)
      .split(splitRe)
      .forEach(add);
    String(y)
      .split(splitRe)
      .forEach(add);
    if (!pieces.length) return "";
    return pieces.join(isAlias ? "、" : isNotes || isSource ? "\n" : "；");
  }

  /* ---- 合并后的「出处」：取所有被合并词条里最靠前的那一条 ----
     不能因为某条有「#行号」就直接判它更早：第一条可能只写到「第一章 · 第一节」，
     另一条写到「第四章 · 第三节 · #88」；按章 / 节比较，前者才是最早的。
     顺序：章 → 节 → #事件轴行号。只有 # 没有章 / 节时，用 # 反查该事件所属章 / 节。 */
  function chapterNumberForSource(chapterId) {
    const co = getChapter(chapterId);
    if (!co) return null;
    const k = chapterOrderKey(co.title);
    if (k && k.has) return k.num;
    const idx = (state.chapters || []).findIndex((c) => c.id === chapterId);
    return idx >= 0 ? idx + 1 : null;
  }

  function sectionNumberForSource(chapter, sectionId) {
    if (!chapter || !sectionId) return null;
    const secs = chapter.sections || [];
    const idx = secs.findIndex((s) => s && s.id === sectionId);
    if (idx >= 0) return idx + 1;
    const so = secs.find((s) => s && s.id === sectionId);
    if (so) {
      const k = chapterOrderKey(so.title);
      if (k && k.has) return k.num;
    }
    return null;
  }

  function sourceOrderOf(src, storyRows) {
    const s = String(src || "");
    const toNum = (x) => {
      const v = cnNumberValue(halfWidthDigits(String(x || "")));
      return Number.isFinite(v) ? v : null;
    };
    const chM = s.match(/第\s*([0-9０-９]+|[零一二三四五六七八九十百千万两〇]+)\s*[章回卷部篇]/);
    const secM = s.match(/第\s*([0-9０-９]+|[零一二三四五六七八九十百千万两〇]+)\s*节/);
    let ch = chM ? toNum(chM[1]) : null;
    let sec = secM ? toNum(secM[1]) : null;
    // 兼容 Chapter 12 / Part 2 这类写法；但别把「第 3 节」当成章
    if (ch === null && !secM) {
      const k = chapterOrderKey(s);
      if (k && k.has) ch = k.num;
    }
    const rowM = s.match(/#\s*(\d+)/);
    const row = rowM ? parseInt(rowM[1], 10) : null;
    // 有些记录的出处只有 #行号。用事件轴那一行反查章 / 节，才能和「第一章」公平比较。
    if (row && Array.isArray(storyRows) && storyRows[row - 1]) {
      const ev = storyRows[row - 1];
      const co = getChapter(ev.chapterId);
      if (ch === null) ch = chapterNumberForSource(ev.chapterId);
      if (sec === null) sec = sectionNumberForSource(co, ev.sectionId);
    }
    return { ch, sec, row };
  }

  function compareSourceOrder(a, b) {
    const cmpNullable = (x, y) => {
      const xn = x === null || x === undefined;
      const yn = y === null || y === undefined;
      if (xn && yn) return 0;
      if (xn) return 1; // 没有章 / 节的往后放，有具体位置的优先
      if (yn) return -1;
      return x - y;
    };
    // 两条都带 #事件轴行号时，# 最小就是最靠前（用户看到的事件顺序）。
    if (a.row !== null && a.row !== undefined && b.row !== null && b.row !== undefined && a.row !== b.row) {
      return a.row - b.row;
    }
    const c = cmpNullable(a.ch, b.ch);
    if (c) return c;
    const as = a.sec === null || a.sec === undefined ? 0 : a.sec;
    const bs = b.sec === null || b.sec === undefined ? 0 : b.sec;
    if (as !== bs) return as - bs;
    const ar = a.row === null || a.row === undefined ? 0 : a.row;
    const br = b.row === null || b.row === undefined ? 0 : b.row;
    return ar - br;
  }

  function looksLikeSourceText(raw) {
    const s = String(raw || "").trim();
    if (!s || s.length > 160) return false;
    return (
      /^第\s*([0-9０-９]+|[零一二三四五六七八九十百千万两〇]+)\s*[章回卷部篇节]/.test(s) ||
      /#\s*\d+/.test(s) ||
      /^(chapter|episode|prologue|interlude|epilogue|part|volume|vol|book|chap|chpt|chp|ep|p)[\s.\-:：]*(?:\d+|[ivxlcdm]+)\b/i.test(s)
    );
  }

  function sourceTextFromLine(line) {
    const s = String(line || "").trim();
    if (!s) return "";
    const m = s.match(/^出处：\s*(.+)$/);
    if (m) return m[1].trim();
    return looksLikeSourceText(s) ? s : "";
  }

  // 从若干段文本（一般是各条记录的 notes，或一批原始 source）里挑出最靠前的一条出处
  function earliestSourceOf(texts) {
    const storyRows = orderedByStory();
    const found = [];
    const add = (v) => {
      const val = String(v || "").trim();
      if (!val) return;
      if (found.some((x) => x.value === val)) return;
      found.push({ value: val, order: sourceOrderOf(val, storyRows) });
    };
    (texts || []).forEach((t) => {
      String(t || "")
        .split("\n")
        .forEach((line) => {
          const v = sourceTextFromLine(line);
          if (v) add(v);
        });
    });
    if (!found.length) return null;
    found.sort((a, b) => compareSourceOrder(a.order, b.order));
    return found[0].value;
  }

  // 把合并结果里的「出处」统一成最早的那一条（其余出处行去掉，放在最上面）
  function applyEarliestSource(holder, sourceTexts) {
    const texts = (sourceTexts || []).slice();
    // 设定卡片里如果有「出处 / 来源 / 首次出现」这类字段，也一起参与比较。
    const sourceFields = [];
    ((holder && holder.fields) || []).forEach((f) => {
      let contributed = false;
      String((f && f.value) || "")
        .split(/[;；\n]+/)
        .forEach((part) => {
          const v = sourceTextFromLine(part);
          if (!v) return;
          texts.push(v);
          contributed = true;
        });
      if (contributed) sourceFields.push(f);
    });
    const earliest = earliestSourceOf(texts);
    if (!earliest) return;
    const rest = String((holder && holder.notes) || "")
      .split("\n")
      .filter((line) => !/^\s*出处：/.test(line))
      .join("\n")
      .trim();
    holder.notes = "出处：" + earliest + (rest ? "\n" + rest : "");
    // 这些字段本身就写着出处，合并后也统一成最早的那一条。
    sourceFields.forEach((f) => {
      f.value = earliest;
    });
  }

