  /* ================= 时间线的「时间」解析 =================
     时间线要判断「一行排哪儿、和谁同一行」，得先把「时间」那段文字变成一个可比的数。
     以前只认「文字里第一个阿拉伯数字」，于是「一九九一年」「今年」全掉到最下面的文字行。
     现在分三层：
       ① 绝对年份：1991 / 1991年 / 一九九一年 / 公元1991年 / 公元前221年 / BC 44
       ② 其它数字：第3章 / 5 / 1991-3-5（只认 1–9999；太大的乱串当文字行）
       ③ 相对说法：今年 / 去年 / 十年前 / 今天 / 上个月 / this year / last year / 昨年 / 一昨日…
          —— 锚＝「这本书里离它最近的那个绝对年份」（先看正文里在它前面的，
             前面没有就看后面最近的，全都没有就用全书最常出现的年份）。
             没有锚（整本都没写年份）就退回文字行。
     认不出来的（含乱串、纯字母）：文字行 —— 排在有数值的行后面，按正文里第一次出现的位置排。
     多语言：四套语言的相对说法都认（和界面语言无关，文本是什么语言就按什么语言认）。 */

  const CN_DIGIT = {
    "〇": 0, "零": 0, "一": 1, "壹": 1, "二": 2, "两": 2, "兩": 2, "貳": 2, "贰": 2,
    "三": 3, "叁": 3, "參": 3, "参": 3, "四": 4, "肆": 4, "五": 5, "伍": 5,
    "六": 6, "陆": 6, "陸": 6, "七": 7, "柒": 7, "八": 8, "捌": 8, "九": 9, "玖": 9,
  };
  const CN_UNIT = {
    "十": 10, "拾": 10, "百": 100, "佰": 100, "千": 1000, "仟": 1000,
    "万": 10000, "萬": 10000, "亿": 100000000, "億": 100000000,
  };
  const CN_SMALL_UNIT = { "廿": 20, "卅": 30 };
  const CN_NUM_CHARS = "〇零一壹二两兩貳贰三叁參参四肆五伍六陆陸七柒八捌九玖十拾百佰千仟万萬亿億廿卅";
  // 注意：拼进正则里要用字符类（[]），直接写 CN_NUM_CHARS 会变成一串字面量
  const CN_CLASS = "[" + CN_NUM_CHARS + "]";
  const CN_NUM_RE = new RegExp(CN_CLASS + "{1,12}");

  /* 中文数字 → 整数：既认「逐字读」（一九九一＝1991、二〇二四＝2024），
     也认「按位读」（两千零一＝2001、一千九百九十一＝1991、十二＝12、廿＝20） */
  function cnNumToInt(raw) {
    const s = String(raw == null ? "" : raw).replace(/\s+/g, "");
    if (!s) return null;
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    if (s.length === 1 && CN_SMALL_UNIT[s] != null) return CN_SMALL_UNIT[s];
    // 逐字读：每个字都是数字字（年份最常见的写法）
    let allDigit = true;
    for (const ch of s) {
      if (CN_DIGIT[ch] == null) {
        allDigit = false;
        break;
      }
    }
    if (allDigit && s.length >= 2) {
      let out = "";
      for (const ch of s) out += String(CN_DIGIT[ch]);
      return parseInt(out, 10);
    }
    // 按位读
    let total = 0;
    let section = 0;
    let num = 0;
    let ok = false;
    for (const ch of s) {
      if (CN_DIGIT[ch] != null) {
        num = CN_DIGIT[ch];
        ok = true;
        continue;
      }
      if (CN_SMALL_UNIT[ch] != null) {
        section += CN_SMALL_UNIT[ch];
        ok = true;
        continue;
      }
      const u = CN_UNIT[ch];
      if (u == null) return null;
      ok = true;
      if (u >= 10000) {
        section = (section + num) * u;
        total += section;
        section = 0;
        num = 0;
      } else {
        section += (num || 1) * u;
        num = 0;
      }
    }
    return ok ? total + section + num : null;
  }

  // 全角数字 / 字母、全角斜杠冒号之类折成半角，空白收一收
  const CHRONO_FULLWIDTH = { "：": ":", "／": "/", "－": "-", "．": ".", "～": "~", "　": " " };
  function chronoNorm(raw) {
    return String(raw == null ? "" : raw)
      .replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[\uFF1A\uFF0F\uFF0D\uFF0E\uFF5E\u3000]/g, (c) => CHRONO_FULLWIDTH[c] || c)
      .replace(/\s+/g, " ")
      .trim();
  }

  /* 相对说法：offset 是相对「锚点」的偏移；unit＝year / month / day。
     year：值＝锚＋offset；month：值＝锚＋offset/12（排在锚那一行紧隔壁）；
     day：值＝锚（同一年里，具体哪天不影响行，行内按正文顺序排）。 */
  const CHRONO_REL_WORDS = [
    // 年
    { unit: "year", off: 0, re: /(今年|本年|本年度|this year|current year|現在|现在|currently|目前)/i },
    { unit: "year", off: -1, re: /(去年|上年|昨年|旧年|舊年|last year|previous year)/i },
    { unit: "year", off: 1, re: /(明年|来年|來年|次年|翌年|next year|following year)/i },
    { unit: "year", off: -2, re: /(前年|一昨年|the year before last)/i },
    { unit: "year", off: -3, re: /(大前年)/ },
    { unit: "year", off: 2, re: /(后年|後年|再来年|再來年|the year after next)/i },
    // 月
    { unit: "month", off: 0, re: /(本月|这个月|這個月|今月|this month)/i },
    { unit: "month", off: -1, re: /(上个月|上個月|上月|先月|last month)/i },
    { unit: "month", off: 1, re: /(下个月|下個月|下月|来月|來月|next month)/i },
    // 日（同一年；具体哪天不单独成行）
    { unit: "day", off: 0, re: /(今天|今日|本日|当天|當天|当日|當日|同一天|today|tonight)/i },
    { unit: "day", off: -1, re: /(昨天|昨日|前一天|前一日|yesterday)/i },
    { unit: "day", off: 1, re: /(明天|明日|次日|翌日|tomorrow)/i },
    { unit: "day", off: -2, re: /(前天|一昨日|the day before yesterday)/i },
    { unit: "day", off: 2, re: /(后天|後天|明後日|the day after tomorrow)/i },
  ];
  const CHRONO_REL_NUM = "([0-9]{1,4}|" + CN_CLASS + "{1,6}|几|幾|數|数)";
  const CHRONO_REL_UNIT = "(个月|個月|月|年|天|日|周|週|星期)";
  const CHRONO_REL_AFTER = "(之前|以前|之後|之后|以后|以後|前|後|后|内|內)";
  const CHRONO_EN_NUM = "([0-9]{1,4}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)";

  /* 年份：阿拉伯 / 中文数字 / 公元（公元前取负） */
  function chronoParseYear(s) {
    const bc = /(公元前|西元前|紀元前|纪元前|BC\b|BCE\b|B\.C\.)/i.test(s);
    const m = new RegExp("([0-9]{1,5}|" + CN_CLASS + "{1,12})\\s*年").exec(s);
    if (!m) return null;
    const n = cnNumToInt(m[1]);
    if (n == null || n < 1 || n > 9999) return null;
    return { year: n, bc };
  }
  /* 月 / 日（年份可以没有）：1991年3月5日 / 三月十三号 / 5月 / 十三日 */
  function chronoParseMonthDay(s) {
    const N = "([0-9]{1,2}|" + CN_CLASS + "{1,3})";
    let month = null;
    let day = null;
    const m = new RegExp(N + "\\s*月\\s*(?:" + N + "\\s*(?:日|号|號))?").exec(s);
    if (m) {
      month = cnNumToInt(m[1]);
      if (m[2] != null) day = cnNumToInt(m[2]);
    } else {
      const md = new RegExp(N + "\\s*(?:日|号|號)").exec(s);
      if (md) day = cnNumToInt(md[1]);
    }
    if (month != null && (month < 1 || month > 12)) month = null;
    if (day != null && (day < 1 || day > 31)) day = null;
    if (month == null && day == null) return null;
    return { month, day };
  }

  /* 把一段「时间」文字解析成：
       {kind:"year", value}                —— 年份：1991 / 一九九一年 / 1991年3月5日（值＝1991.0305）
                                              （只有「年份」能当别的相对说法的锚点）
       {kind:"num", value}                 —— 其它数字：第3章＝3、5＝5（能排序，不当锚点）
       {kind:"date", month, day}           —— 只有月 / 日（年份靠锚点补）
       {kind:"rel", unit, offset}          —— 相对：今年 / 昨天 / 十年前 / last year
       null                                —— 认不出（乱串、纯字母…） */
  function chronoParseTime(raw) {
    const s = chronoNorm(raw);
    if (!s) return null;
    // ① 相对说法要先判：「十年前」里的「十年」不能被当成 10 年
    const rel = chronoParseRelative(s);
    if (rel) return rel;
    const ym = chronoParseYear(s);
    const md = chronoParseMonthDay(s);
    if (ym) {
      const y = ym.bc ? -ym.year : ym.year;
      // 带月 / 日的单独成一行，就排在它那一年紧隔壁（1991 < 1991.0305 < 1992）
      if (md) return { kind: "year", value: y + (md.month || 0) / 100 + (md.day || 0) / 10000 };
      return { kind: "year", value: y };
    }
    if (md) return { kind: "date", month: md.month, day: md.day };
    // ② 其它阿拉伯数字（1–9999；太大的乱串算认不出）
    const mNum = /-?[0-9]+/.exec(s);
    if (mNum) {
      const v = parseInt(mNum[0], 10);
      // 0 是有效值（「第0章」这种）；只把明显不像时间的巨大数字（乱串）排除掉
      if (!isFinite(v) || Math.abs(v) > 9999) return null;
      // 四位数（1000–2999）看着就是年份，可以当锚点；「第3章」这种只当排序值
      const yearish = /^[0-9]{4}$/.test(mNum[0]) && v >= 1000 && v <= 2999;
      return { kind: yearish ? "year" : "num", value: v };
    }
    // ③ 中文数字 + 时间量词（第三章 / 三点 / 二更…）：不跟量词的（「一天傍晚」）不算，
    //    免得把「一」「二」这种当成年份。
    const mCn = new RegExp(CN_CLASS + "{1,12}\\s*(世纪|世紀|点|點|时|時|分|秒|章|回|节|節|话|話|级|級|层|層|更|轮|輪|会|會|岁|歲)").exec(s);
    if (mCn) {
      const m = new RegExp("(" + CN_CLASS + "{1,12})").exec(mCn[0]);
      const n = m ? cnNumToInt(m[1]) : null;
      if (n != null && n >= 1 && n <= 9999) return { kind: "num", value: n };
    }
    return null;
  }

  // 相对说法：词表 + 「N 年前 / N 个月后 / N years ago / in N years」这类
  function chronoParseRelative(s) {
    /* 取「匹配到的词最长」的那一条：「再来年」要按 +2 走，不能被里面的「来年」（+1）抢走；
       「一昨年 / 一昨日」同理（别被「昨年 / 昨日」抢走）。 */
    let best = null;
    for (const row of CHRONO_REL_WORDS) {
      const m = row.re.exec(s);
      if (!m) continue;
      if (!best || m[0].length > best.len) best = { row, len: m[0].length };
    }
    if (best) return { kind: "rel", unit: best.row.unit, offset: best.row.off };
    const mZh = new RegExp(CHRONO_REL_NUM + "\\s*" + CHRONO_REL_UNIT + "\\s*" + CHRONO_REL_AFTER).exec(s);
    if (mZh) {
      let n = cnNumToInt(mZh[1]);
      if (n == null && /^(几|幾|數|数)$/.test(mZh[1])) n = 3; // 「几个月前」＝大约三个月
      if (n != null && n > 0) {
        const unit = /(个月|個月|月)/.test(mZh[2]) ? "month" : /年/.test(mZh[2]) ? "year" : "day";
        const after = /(之后|之後|以后|以後|後|后|内|內)/.test(mZh[3]);
        return { kind: "rel", unit, offset: after ? n : -n };
      }
    }
    // 英文：N years ago / N years later / in N years / N months before
    const mEnA = new RegExp(CHRONO_EN_NUM + "\\s*(years?|months?|days?|weeks?)\\s*(ago|later|from now|after|before)", "i").exec(s);
    const mEnB = mEnA ? null : new RegExp("\\bin\\s+" + CHRONO_EN_NUM + "\\s*(years?|months?|days?|weeks?)", "i").exec(s);
    const hitEn = mEnA || mEnB;
    if (hitEn) {
      const numTxt = String(mEnA ? mEnA[1] : mEnB[1]).toLowerCase();
      const unitTxt = String(mEnA ? mEnA[2] : mEnB[2]).toLowerCase();
      const dirTxt = mEnA ? String(mEnA[3] || "").toLowerCase() : "";
      const n = /^[0-9]+$/.test(numTxt) ? parseInt(numTxt, 10) : enNumWord(numTxt);
      if (n != null && n > 0) {
        const unit = /month/.test(unitTxt) ? "month" : /year/.test(unitTxt) ? "year" : "day";
        return { kind: "rel", unit, offset: /^(ago|before)$/.test(dirTxt) ? -n : n };
      }
    }
    return null;
  }
  function enNumWord(w) {
    const map = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
    return map[w] == null ? null : map[w];
  }

  /* ---- 每本书一份索引：事件 → {value, anchor, rel}；按 stateDataRev 缓存 ---- */
  let chronoTimeCacheRev = null;
  let chronoTimeCache = new Map();
  function chronoTimeIndex() {
    if (chronoTimeCacheRev === stateDataRev) return chronoTimeCache;
    const list = (state.events || []).slice().sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0));
    const parsed = new Map();
    const yearCount = new Map();
    list.forEach((e) => {
      let p = null;
      try {
        p = chronoParseTime(e && e.timeSortKey != null ? e.timeSortKey : e && e.time);
      } catch (err) {
        p = null;
      }
      parsed.set(e.id, p);
      if (p && p.kind === "year") {
        const y = Math.trunc(p.value);
        yearCount.set(y, (yearCount.get(y) || 0) + 1);
      }
    });
    // 全书最常出现的年份（用来兜底）
    let dominant = null;
    let best = -1;
    yearCount.forEach((n, y) => {
      if (n > best || (n === best && dominant !== null && y > dominant)) {
        best = n;
        dominant = y;
      }
    });
    // 前后各扫一遍：每个位置「前面最近 / 后面最近」的绝对年份
    const prevAnchor = new Map();
    let last = null;
    list.forEach((e) => {
      prevAnchor.set(e.id, last);
      const p = parsed.get(e.id);
      if (p && p.kind === "year") last = Math.trunc(p.value);
    });
    const nextAnchor = new Map();
    let next = null;
    for (let i = list.length - 1; i >= 0; i--) {
      nextAnchor.set(list[i].id, next);
      const p = parsed.get(list[i].id);
      if (p && p.kind === "year") next = Math.trunc(p.value);
    }
    const out = new Map();
    list.forEach((e) => {
      const p = parsed.get(e.id);
      // 邻居锚点：正文里在它前面最近的那个年份；前面没有就看后面最近的；都没有用全书最常见的年份
      const nb =
        prevAnchor.get(e.id) != null ? prevAnchor.get(e.id) : nextAnchor.get(e.id) != null ? nextAnchor.get(e.id) : dominant;
      if (!p) {
        out.set(e.id, { value: null, anchor: nb, rel: false });
        return;
      }
      if (p.kind === "year") {
        out.set(e.id, { value: p.value, anchor: Math.trunc(p.value), rel: false });
        return;
      }
      if (p.kind === "num") {
        out.set(e.id, { value: p.value, anchor: nb, rel: false });
        return;
      }
      if (nb == null) {
        out.set(e.id, { value: null, anchor: null, rel: true });
        return;
      }
      const value =
        p.kind === "date"
          ? nb + (p.month || 0) / 100 + (p.day || 0) / 10000
          : p.unit === "month"
            ? nb + p.offset / 12
            : p.unit === "year"
              ? nb + p.offset
              : nb;
      out.set(e.id, { value, anchor: nb, rel: true });
    });
    chronoTimeCacheRev = stateDataRev;
    chronoTimeCache = out;
    return out;
  }
  // 某个事件解析出来的年份（给「改文字时位置要不要挪」用）
  function chronoKeyOfTextFor(e, text) {
    const t = chronoNorm(text);
    let p = null;
    try {
      p = chronoParseTime(t);
    } catch (err) {
      p = null;
    }
    if (!p) return "t:" + t;
    if (p.kind === "year" || p.kind === "num") return "n:" + p.value;
    const hit = chronoTimeIndex().get(e && e.id);
    const anchor = hit && typeof hit.anchor === "number" ? hit.anchor : null;
    if (anchor == null) return "t:" + t;
    if (p.kind === "date") return "n:" + (anchor + (p.month || 0) / 100 + (p.day || 0) / 10000);
    return "n:" + (p.unit === "month" ? anchor + p.offset / 12 : p.unit === "year" ? anchor + p.offset : anchor);
  }
