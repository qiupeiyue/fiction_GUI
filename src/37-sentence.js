
  function foldVariant(s) {
    const t = String(s == null ? "" : s);
    if (!t) return t;
    return t.replace(VARIANT_RE, (ch) => VARIANT_MAP.get(ch) || ch);
  }

  /* ---------- 分句 / 度量：一律按「正文自己是什么语言」判断 ----------
     和界面语言无关：中文界面下分析英文小说、英文界面下分析日文小说都要对。
     原来只按中文标点切句，英文句号不算边界 —— 结果一整段算「一句」：
     戏份字数按整段累加、共现句退化成「同段即同场」、原文关系挖掘里
     「句子 4~120 字」的过滤把英文整段全滤掉。这里补上英文句号（带缩写保护）。 */
  const SENT_ABBR = new Set(
    ("mr mrs ms dr prof st jr sr vs etc eg ie cf fig no vol ch chap pp mt lt sgt capt gen col maj rev hon inc ltd co corp approx dept est al ed eds trans min max sec art para ver univ assn bros mfg jan feb mar apr jun jul aug sep sept oct nov dec").split(" ")
  );
  const CJK_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u3005\u3006]/;
  function isCjkChar(ch) {
    return !!ch && CJK_CHAR_RE.test(ch);
  }
  // 「第 i 个字符之后」能不能当句子边界（分句和长文切块共用）
  function canBreakAfter(s, i) {
    const ch = s.charAt(i);
    if (!ch) return false;
    if (ch === "。" || ch === "！" || ch === "？" || ch === "；" || ch === "…" || ch === "：" || ch === "\n") return true;
    if (ch === "!" || ch === "?" || ch === ";" || ch === ":") return true;
    if (ch !== ".") return false;
    const prev = s.charAt(i - 1);
    const next = s.charAt(i + 1);
    // 小数点：3.5 / 1.2.3
    if (/[0-9]/.test(prev) && /[0-9]/.test(next)) return false;
    // 省略号：交给最后一个点判断
    if (next === "." || prev === ".") return false;
    // 缩写 / 首字母：J. R. R.、Mr.、etc.
    const m = /([A-Za-z]+)$/.exec(s.slice(Math.max(0, i - 12), i));
    if (m) {
      const w = m[1];
      if (w.length === 1) return false; // 单个字母（J. / A.）不当句末
      if (SENT_ABBR.has(w.toLowerCase())) return false;
    }
    // 后面要像「新一句话的开头」：大写字母 / 引号 / 括号 / 数字 / 中日文
    let j = i + 1;
    while (j < s.length && (s.charAt(j) === " " || s.charAt(j) === "\t")) j++;
    const first = s.charAt(j);
    if (!first) return true;
    return /[A-Z0-9"“'‘(\[]/.test(first) || isCjkChar(first);
  }
  // 按句子切开（中 / 日 / 英混排都认；返回原文片段，不改字）
  function splitTextSentences(text) {
    const s = String(text == null ? "" : text);
    const out = [];
    let start = 0;
    let guard = 0;
    for (let i = 0; i < s.length && guard++ < 2000000; i++) {
      if (!canBreakAfter(s, i)) continue;
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
    if (start < s.length) out.push(s.slice(start));
    return out.filter((x) => String(x || "").trim());
  }
  /* 「戏份 / 提及量」的度量：中日文按字数；拉丁文按「词 × 1.7」折成等效字数
     （中英对译的经验比例），这样同一个阈值（默认 100）在中文和英文小说里挑出来的东西差不多。
     数字和全角标点按 1 个字算，保持中文文本的计数和以前基本一致。 */
  const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;
  function mentionUnit(text) {
    const s = String(text == null ? "" : text);
    if (!s) return 0;
    let unit = 0;
    for (const ch of s) {
      if (isCjkChar(ch) || /[0-9]/.test(ch) || /[\u3000-\u303f\uff00-\uffef]/.test(ch)) unit++;
    }
    const words = (s.match(LATIN_WORD_RE) || []).length;
    return unit + Math.round(words * 1.7);
  }
  // 一句话在英文里字符数天然更多：判断「短句」时也用等效字数
  function shortSentenceUnit(text) {
    return mentionUnit(text);
  }
  // 句子长度上限：中日文沿用原来的口径，拉丁文按等效字数放宽（同一句话英文写出来长得多）
  function withinSentenceCap(sent, cjkCap, latinCap) {
    const hasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(sent || ""));
    return shortSentenceUnit(sent) <= (hasCjk ? cjkCap : latinCap);
  }
  // 长文切块的上限：按正文语言折算成字符数（中日文 3 万等效字 ≈ 3 万字符）
  const SPLIT_UNIT_LIMIT = 30000;
  function splitLimitFor(text) {
    const head = String(text == null ? "" : text).slice(0, 4000);
    if (!head) return SPLIT_UNIT_LIMIT;
    const perChar = mentionUnit(head) / head.length;
    const chars = Math.round(SPLIT_UNIT_LIMIT / Math.max(0.15, perChar));
    // 英文按等效字算是 10 万字符上下，但模型上下文吃不下那么多：封顶 6 万字符
    return Math.max(8000, Math.min(60000, chars));
  }

  function normNameKey(s) {
    const raw = String(s == null ? "" : s);
    // 合并时要做几万次名字两两比较，这一步是纯字符串处理：结果缓存起来
    const hit = normNameKeyCache.get(raw);
    if (hit !== undefined) return hit;
    const v = raw
      .replace(/[\u200b-\u200f\u202a-\u202e\ufeff\u00ad]/g, "") // 零宽 / 不可见字符
      .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 全角 → 半角
      .replace(/\u3000/g, " ")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[·•・.。．,，、:：;；\u2022\u2027\u30fb\u00b7\-—–_~～\/｜|]/g, "·"); // 各种间隔符统一
    // 繁简 / 异体字 / 日文新字体归一：教团＝教団＝教團，圖＝図＝图
    const folded = foldVariant(v);
    if (normNameKeyCache.size > 20000) normNameKeyCache.clear();
    normNameKeyCache.set(raw, folded);
    return folded;
  }
  const normNameKeyCache = new Map();

  const samePersonCache = new Map();
  function samePerson(a, b) {
    const oa = normNameKey(a);
    const ob = normNameKey(b);
    if (!oa || !ob) return false;
    const cacheKey = oa < ob ? oa + "\u0001" + ob : ob + "\u0001" + oa;
    const hit = samePersonCache.get(cacheKey);
    if (hit !== undefined) return hit;
    // 「首字母 + 姓」这种拉丁名写法要用原文判断（归一后空格没了，词边界也就丢了）
    const answer = samePersonRaw(oa, ob) || latinInitialsSame(a, b);
    if (samePersonCache.size > 20000) samePersonCache.clear();
    samePersonCache.set(cacheKey, answer);
    return answer;
  }

  function samePersonRaw(oa, ob) {
    if (oa === ob) return true;
    const short = oa.length <= ob.length ? oa : ob;
    const long = oa.length <= ob.length ? ob : oa;
    if (short.length >= 2 && long.startsWith(short)) {
      const sep = long.charAt(short.length);
      if (/[·•・.。．\-—,，、（）()\[\]【】《》〈〉「」『』:：;；]/.test(sep)) return true;
    }
    // 简称是全名里的一截：如「莉芙」⊂「科诺莉芙·维尔特」（名 A·姓 B 与名 A、以及昵称式截取）
    if (shortInsideName(oa, ob)) return true;
    // 括号里的简称 / 全名：如「莉芙（科诺莉芙·维尔特）」与「科诺莉芙·维尔特」
    if (short.length >= 2) {
      const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("[（(【《〈「『]\\s*" + escaped + "\\s*[）)】》〉」』]$");
      if (re.test(long)) return true;
    }
    return false;
  }

  // 短名是不是长名「名字部分」里的一截（莉芙 ⊂ 科诺莉芙·维尔特；艾达 ⊂ 艾达·普希金）。
  // 只看第一个分隔符之前的那一段：这样不会因为「同一个姓」就把一家人并成一个。
  /* 拉丁名的「首字母 + 姓」写法：
       A. Winters = Alice Winters ／ J. R. R. Tolkien = John Ronald Reuel Tolkien
     逐段比较：写法完全相同的段跳过，不一样的段必须有一边是单字母、且另一边以它开头；
     段数必须一样、至少命中一个首字母，才不会把 Alice Winters 和 Anna Williams 判成同一人。
     只认拉丁字母（含 · 分隔），中日文名一个字都不受影响。 */
  function latinInitialsSame(a, b) {
    return latinInitialsPartsSame(latinNameParts(a), latinNameParts(b));
  }
  // 拉丁名切词："A. Winters" → ["a","winters"]；含非拉丁字符（中日文等）就返回 null
  function latinNameParts(s) {
    const t = String(s == null ? "" : s);
    if (!t || !/^[A-Za-z\u00c0-\u024f\s·•・.\-'’]+$/.test(t)) return null;
    const parts = t
      .toLowerCase()
      .replace(/[.·•・\-'’]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length || parts.some((x) => !/^[a-z\u00c0-\u024f]+$/.test(x))) return null;
    return parts;
  }
  function latinInitialsPartsSame(ta, tb) {
    if (!ta || !tb) return false;
    if (ta.length < 2 || ta.length !== tb.length) return false;
    let initials = 0;
    for (let i = 0; i < ta.length; i++) {
      const x = ta[i];
      const y = tb[i];
      if (x === y) continue;
      if (x.length === 1 && y.startsWith(x)) {
        initials++;
        continue;
      }
      if (y.length === 1 && x.startsWith(y)) {
        initials++;
        continue;
      }
      return false;
    }
    return initials > 0;
  }

  function shortInsideName(a, b) {
    const oa = normNameKey(a);
    const ob = normNameKey(b);
    if (!oa || !ob || oa === ob) return null;
    const short = oa.length <= ob.length ? oa : ob;
    const long = oa.length <= ob.length ? ob : oa;
    if (short.length < 2 || long.length <= short.length) return null;
    const segs = long.split(/[·•・.。．\-—,，、（）()\[\]【】《》〈〉「」『』:：;；\/｜|]+/).filter(Boolean);
    const firstSeg = segs[0] || "";
    if (firstSeg.length > short.length && firstSeg.indexOf(short) >= 0) {
      const at = firstSeg.indexOf(short);
      // ① 截取式昵称：莉芙 ⊂ 科诺莉芙·维尔特（必须是「名·姓」结构里的名字末尾截取）。
      //    「莉芙」⊂「可诺莉芙」这种单段名字里的结尾相同，不一定是同一个人；
      //    「诺莉」嵌在「可诺莉芙」中间，更不是同一人的证据。
      if (at > 0 && segs.length > 1 && at + short.length === firstSeg.length) return { short, long, seg: firstSeg };
      // ② 「名·姓」里的名被叫短了：米拉 ⊂ 米拉贝拉·卡伊。
      //    只在长名确实带分隔符（说明是「名·姓」结构）时才算；
      //    「凯尔 / 凯尔顿」这种单段名字的包含关系不算，免得把两个人并成一个。
      if (at === 0 && segs.length > 1) return { short, long, seg: firstSeg };
    }
    return null;
  }

  function nameAliasesOf(record) {
    const out = [];
    (record.fields || []).forEach((f) => {
      if (/别名|别称|昵称|称呼|简称|又名|曾用名|绰号/.test(f.label || "")) {
        String(f.value || "")
          .split(/[、,，\/;；\n]+/)
          .forEach((s) => {
            const t = s.trim();
          // 「父亲」「学生」「我」「那孩子」这类宽泛词不当别名：会让「自动合并」把不同的人并成一个
          if (t && !isTooGenericAlias(t)) out.push(t);
          });
      }
    });
    return out;
  }

  function isExtraRecord(r) {
    const v = fieldValue(r, "重要度") || fieldValue(r, "角色重要度");
    // 正文是英文 / 日文时，模型很可能回 extra / minor / 端役 这类写法，也要认出「龙套」
    return /龙套|路人|群演|配角|次要|extras?|minor|supporting|background|side\s?char|walk-?on|端役|脇役|モブ/i.test(v);
  }

  // 全文按句子切开（不算太精确，但足够用来估「这个名字有多少戏份」）
  // 每句再存一份「去掉空格」的版本，避免「1868 年」和「1868年」对不上
  function buildTextSentences(taskOrTasks) {
    const list = Array.isArray(taskOrTasks) ? taskOrTasks : [taskOrTasks];
    const out = [];
    list.forEach((task) => {
      (task && task.files ? task.files : []).forEach((f) => {
        const parts = splitTextSentences(f.text || "");
        parts.forEach((s) => {
          const t = s.replace(/\s+/g, " ").trim();
          if (t) {
            const flat = t.replace(/[\s\u00a0\u3000]/g, "");
            // match：折叠异体字 + 转小写，只用来比对名字（显示仍旧用原文 text）
            out.push({ text: t, flat, match: foldVariant(flat).toLowerCase() });
          }
        });
      });
    });
    return out;
  }

  // 全文里提到这几个名字（含别名）的句子，加起来多少字
  // 句子太多时（长篇小说几万句）不能每查一个名字就把所有句子扫一遍，
  // 所以按「首字 → 出现过这个字的句子下标」建一份索引（同一个句子数组只建一次）。
  // 结果和原来的逐句扫描完全一致（命中同一句只算一次、累加到 5000 就停）。
  const sentenceIndexCache = new WeakMap();
  // 同一个任务的分句结果也缓存一份：文件正文没变（长度签名一样）就直接复用，
  // 这样反复勾选过滤、反复填设定档案时不用每次重新分句
  const taskSentencesCache = new WeakMap();
  function sentenceFlatOf(s) {
    return s && typeof s === "object" ? s.flat : String(s || "");
  }
  function sentenceMatchOf(s) {
    return s && typeof s === "object" ? String(s.match == null ? s.flat || "" : s.match) : foldVariant(String(s || "")).toLowerCase();
  }
  function taskSentences(task) {
    if (!task) return [];
    const sig = (task.files || []).map((f) => String(f.text || "").length).join(",");
    const hit = taskSentencesCache.get(task);
    if (hit && hit.sig === sig) return hit.sentences;
    const sentences = buildTextSentences(task);
    taskSentencesCache.set(task, { sig, sentences });
    return sentences;
  }
  function sentenceCharIndex(sentences) {
    let idx = sentenceIndexCache.get(sentences);
    if (idx) return idx;
    const byChar = new Map();
    for (let i = 0; i < sentences.length; i++) {
      const flat = sentenceMatchOf(sentences[i]);
      if (!flat) continue;
      const seen = new Set();
      for (const ch of flat) {
        if (seen.has(ch)) continue;
        seen.add(ch);
        let arr = byChar.get(ch);
        if (!arr) byChar.set(ch, (arr = []));
        arr.push(i);
      }
    }
    idx = { byChar };
    sentenceIndexCache.set(sentences, idx);
    return idx;
  }

