(function () {
  "use strict";

  const PROJECTS_KEY = "fiction_gui_projects_v1";
  const LEGACY_KEYS = ["fiction_gui_state_v2", "fiction_gui_state_v1"];
  const IDB_NAME = "fiction_gui_idb_v1";
  const IDB_STORE = "kv";
  const IDB_PROJECTS_KEY = "projects_v1";
  const IDB_UI_KEY = "ui_state_v1";
  // 参考学术期刊 figure 的配色（低饱和、冷调、相互区分度好），不用金色 / 高亮荧光色
  const CHAR_COLORS = ["#8DA0CB", "#66C2A5", "#E78AC3", "#9E9AC8", "#86A5D6", "#BC80BD", "#A3C4A3", "#B3B3B3"];
  const LINE_COLORS = ["#4E669E", "#8DA0CB", "#66C2A5", "#E78AC3", "#9E9AC8", "#86A5D6", "#A3C4A3", "#BC80BD"];
  const CAT_COLORS = ["#8DA0CB", "#66C2A5", "#E78AC3", "#BC80BD", "#9E9AC8", "#86A5D6", "#6FA9D8"];
  const GROUP_COLORS = ["#8DA0CB", "#66C2A5", "#E78AC3", "#9E9AC8", "#86A5D6", "#BC80BD", "#A3C4A3", "#B3B3B3"];
  const AGENT_KEY = "fiction_gui_agent_config";
  const UI_STATE_KEY = "fiction_gui_ui_state_v1";
  const DEFAULT_MAX_TOKENS = 8000; // 一次请求最多让模型输出多少 token
  const AGENT_PROVIDERS = [
    { id: "deepseek", label: "DeepSeek · api.deepseek.com", baseUrl: "https://api.deepseek.com", models: ["deepseek-flash", "deepseek-v4-pro"] },
    { id: "openai", label: "OpenAI · api.openai.com/v1", baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o"] },
    { id: "custom", label: "自定义…", baseUrl: "", models: [] },
  ];
  // 章节标题的识别口径（简中 / 繁中 / 日文 / 英文都认）：
  // 「第X章 / 第X節 / 第X話 / 第三回 / 卷二 / 第一部 / 3章 / Chapter 3 / Chpt2 / Episode 5 / Ep1 / Part 2 / P3 / Vol.1 /
  //  楔子 / 序章 / 幕間 / 終章 / 尾聲 / 番外編 / プロローグ / エピローグ / あとがき …」
  const HEADING_RE =
    /^(?:[0-9０-９]{1,3}\s*[.、．·\-]\s*)?(?:第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*[章节節回卷部篇话話幕]|[0-9０-９零一二三四五六七八九十百千万两〇]{1,4}\s*[章节節回卷部篇话話幕](?=\s|$|[:：、.．·\-])|[0-9０-９]{1,3}(?:\.[0-9０-９]{1,3}){1,2}(?=\s|$|[:：、.．·\-])|楔子|序章|序言|引子|尾声|尾聲|终章|終章|番外|番外編|番外篇|后记|後記|前言|自序|跋|幕間|幕间|断章|斷章|間章|间章|外传|外傳|最終章|プロローグ|エピローグ|あとがき|後書き|まえがき|(?:chapter|episode|epilogue|interlude|prologue|prolog|foreword|afterword|section|sec|part|pt|volume|vol|book|chap|chpt|chp|ep|p)(?:\s|[.\-:：])*(?:\d+|[ivxlcdm]+|[零一二三四五六七八九十百〇]+))/i;

  // 「第一节课时，小绪的母亲到了学校…」这种是正文，不是「第一节」标题。
  // 只看节号后面的文字：没空格且紧接着“课 / 时 / 的 / 上…”这类正文词，或后面更像一整句话，就排除。
// 界面缩放（html 上的 zoom）会把 getBoundingClientRect 的坐标一起放大，
// 而列宽 / 边栏宽度这些数字是元素自己坐标系里的 px。
// 凡是「鼠标位移 / 鼠标坐标」和这些数字一起算的地方，都要先除回这个比例，否则会整列 / 整块偏。
function uiZoomScale(el) {
  /* 页面整体缩放以 html 上实际设置的比例为准；body.offsetWidth / rect.width
     在 Electron + 系统 DPI / 某些显卡缩放下不一定可靠。 */
  if (!el || el === document.body || el === document.documentElement) {
    const appZoom = Number(window.__APP_UI_ZOOM__);
    if (Number.isFinite(appZoom) && appZoom > 0) return appZoom;
  }
  if (!el || !el.getBoundingClientRect) return 1;
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || 0;
  const s = w > 0 && r.width > 0 ? r.width / w : 1;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function uiAppZoom() {
  const appZoom = Number(window.__APP_UI_ZOOM__);
  if (Number.isFinite(appZoom) && appZoom > 0) return appZoom;
  const cssZoom = parseFloat(document.documentElement.style.zoom);
  return Number.isFinite(cssZoom) && cssZoom > 0 ? cssZoom : 1;
}

/* Electron（CSS zoom + 系统 DPI）下 body.getBoundingClientRect() 是布局像素，
   鼠标事件 / innerWidth 是视觉像素；网页版 Edge 又是反过来。
   这个比例把「布局矩形」换成「视觉矩形」，所有元素锚点都先走它。 */
function uiRectZoomFactor() {
  const z = uiAppZoom();
  const b = document.body;
  if (!b || !b.getBoundingClientRect) return 1;
  const rectW = b.getBoundingClientRect().width;
  const offW = b.offsetWidth;
  const rectScale = offW > 0 && rectW > 0 ? rectW / offW : 1;
  return Number.isFinite(rectScale) && rectScale > 0 ? z / rectScale : 1;
}

function uiVisualRect(el) {
  if (!el || !el.getBoundingClientRect) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  const f = uiRectZoomFactor();
  return {
    left: r.left * f,
    top: r.top * f,
    right: r.right * f,
    bottom: r.bottom * f,
    width: r.width * f,
    height: r.height * f,
  };
}

/* 挂在 body 上的浮层（悬停卡 / 各种 popup / 缩略图）：左边距、上边距要写「元素自己坐标系里的 px」，
   而 getBoundingClientRect / clientX / innerWidth 给的都是「视觉 px」——
   界面缩放（html 上的 zoom）会让内联的 px 再被放大一次，所以这里统一除回去。
   凡是要把视觉坐标写进 style.left / style.top / right / bottom 的地方，都走这个函数。 */
function uiZoomPx(px, el) {
  const z = el ? uiZoomScale(el) || 1 : uiAppZoom() || 1;
  return Math.round(px / z) + "px";
}

/* 界面缩放一变，所有「贴着鼠标 / 贴着元素」的浮层都得重算位置：
   它们的 left / top 写的是**元素坐标系里的 px**，同一个值在缩放之后会被渲染到别的地方
   （实测：1.5 倍时把鼠标停在原地改缩放，气泡会飘到鼠标右下方一两百像素）。
   各浮层自己把重算逻辑注册进来，缩放流程末尾统一叫一次。 */
const uiFloatReflowHooks = [];
function uiOnZoomReflow(fn) {
  if (typeof fn === "function" && uiFloatReflowHooks.indexOf(fn) < 0) uiFloatReflowHooks.push(fn);
}
function uiReflowFloatingLayers() {
  uiFloatReflowHooks.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* 单个浮层出错不影响别的 */
    }
  });
}

  function looksLikeSectionProse(text) {
    const s = String(text || "").trim();
    const m = s.match(/^第\s*([0-9０-９零一二三四五六七八九十百千万两〇]+)\s*节([\s\S]*)$/);
    if (!m) return false;
    const rawRest = String(m[2] || "");
    const rest = rawRest.trim();
    if (!rest) return false; // 只有「第一节」本身，按标题处理
    // 「第一节 上 / 第一节 初遇」这种带空格分隔的，仍按标题处理。
    if (!/^\s/.test(rawRest)) {
      if (/^[课时钟分秒]/.test(rest)) return true;
      if (/^(的|地|得|上|下|前|后|中|里|内|外|间|末|初)/.test(rest) && rest.length <= 8) return true;
    }
    if (/[，。！？；]/.test(rest)) return true;
    if (rest.length > 18) return true;
    return false;
  }

  function looksLikeHeadingLine(text) {
    const s = String(text || "").trim();
    if (!s || s.length > 60) return false;
    // PDF 取字常把字间塞进空格（「第 一 章」「尾 声」）：收一下空格再看像不像标题
    const compact = normalizeSegLabel(s);
    if (!HEADING_RE.test(s) && !HEADING_RE.test(compact)) return false;
    if (looksLikeSectionProse(compact)) return false;
    return true;
  }

  // 已知标题的「格式签名」：数字 → #，大写字母 → A，小写字母 → a，中日文 → 汉。
  // 用来从 P1/P2/P3 这类已识别标题里推断同格式的标记（例如 END: Cyan）。
  function headingFormatSignature(s) {
    return String(s || "")
      .trim()
      .replace(/[0-9０-９]+/g, "#")
      .replace(/[A-Z]+/g, "A")
      .replace(/[a-z]+/g, "a")
      .replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]+/g, "汉");
  }

  function signatureToRegex(sig) {
    let out = "^";
    for (const ch of String(sig || "")) {
      if (ch === "#") out += "[0-9０-９]+";
      else if (ch === "A") out += "[A-Z]+";
      else if (ch === "a") out += "[a-z]+";
      else if (ch === "汉") out += "[\\u3400-\\u4dbf\\u4e00-\\u9fff\\u3040-\\u30ff]+";
      else if ("\\^$.|?*+()[]{}".indexOf(ch) >= 0) out += "\\" + ch;
      else out += ch;
    }
    return new RegExp(out + "$");
  }

  function inferHeadingFormats(labels) {
    const counts = new Map();
    (labels || []).forEach((label) => {
      const sig = headingFormatSignature(label);
      if (!sig || sig.length > 24) return;
      counts.set(sig, (counts.get(sig) || 0) + 1);
    });
    const out = [];
    counts.forEach((n, sig) => {
      if (n < 2) return;
      // 太泛的签不学（比如整行都是汉字 / 整行都是纯数字）
      if (/^[汉A a#]+$/.test(sig) && !/[A#]/.test(sig)) return;
      out.push(signatureToRegex(sig));
    });
    return out;
  }

  function matchesLearnedFormat(text, regexes) {
    const s = String(text || "").trim();
    return (regexes || []).some((re) => {
      try {
        return re.test(s);
      } catch (e) {
        return false;
      }
    });
  }

  // 不管前后有没有空行，这些本身就是明确的分节标记
  function isStrongMarkerFormat(text) {
    return /^(?:PROLOGUE|EPILOGUE|INTERLUDE|END|FIN|START|THE\s+END|尾声|尾聲|终章|終章|后记|後記|番外|番外編|番外篇|幕間|幕间|間章|间章|プロローグ|エピローグ|あとがき|後書き)\s*[:：]\s*.{1,40}$/i.test(
      String(text || "").trim()
    );
  }

  function isClassicChapterLabel(text) {
    return /^(?:第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*[章節节回卷部篇话話幕]|chapter\b|chpt\b|chp\b|volume\b|vol\b|book\b)/i.test(
      String(text || "").trim()
    );
  }

  function isFormatMarkerLabel(text) {
    const t = String(text || "").trim();
    if (!t || isClassicChapterLabel(t)) return false;
    return looksLikeMarkerFormat(t) || isStrongMarkerFormat(t);
  }

  function looksLikeCandidateMarker(text, i, lines) {
    const t = String(text || "").trim();
    if (!t || t.length > 40) return false;
    if (isClassicChapterLabel(t)) return false;
    if (isStrongMarkerFormat(t)) return true;
    if (!looksLikeMarkerFormat(t)) return false;
    return looksLikeStandaloneMarker(t, i, lines);
  }

  // 像分节标记的短行：P1、END: Cyan、EP.3、全大写短标记等
  function looksLikeMarkerFormat(text) {
    const s = String(text || "").trim();
    if (!s || s.length > 40) return false;
    if (/[。！？；，、]$/.test(s)) return false;
    if (looksLikeHeadingLine(s)) return true;
    if (/^[A-Za-z0-9]{1,12}\s*[:：]\s*.{1,30}$/.test(s)) return true;
    if (/^[A-Za-z]{1,5}[\s.\-_:：]*[0-9]{1,4}$/.test(s)) return true;
    if (/^[0-9]{1,4}$/.test(s)) return true;
    if (/^[A-Z][A-Z0-9 _\-]{1,24}$/.test(s)) return true;
    if (/^(?:END|FIN|THE\s+END|START|PROLOGUE|EPILOGUE|INTERLUDE)$/i.test(s)) return true;
    return false;
  }

  // 分节标记一般独占一行，前后至少一侧是空行
  function looksLikeStandaloneMarker(text, i, lines) {
    const s = String(text || "").trim();
    if (!s || s.length > 40) return false;
    const prevBlank = i === 0 || !String(lines[i - 1] || "").trim();
    const nextBlank = i >= lines.length - 1 || !String(lines[i + 1] || "").trim();
    if (!prevBlank && !nextBlank) return false;
    if (!/[A-Za-z0-9]/.test(s)) return false;
    if (/[。！？；，、]$/.test(s)) return false;
    if (/[:：]/.test(s)) return true;
    if (/^[A-Z0-9 _\-]{2,}$/.test(s)) return true;
    if (/^[A-Za-z]+\d+$/.test(s)) return true;
    return s.split(/\s+/).length <= 3 && s.length <= 20;
  }
  const ANALYSIS_PROMPT = `你是小说设定抽取助手。阅读用户提供的文本，抽取可以结构化的设定信息。只输出 JSON，不要任何解释、不要 markdown 代码块。

输出格式（严格遵守）：
{
  "records": [
    {"type":"character","name":"角色最完整的名字","fields":[{"label":"重要度","value":"主要或龙套"},{"label":"别名","value":"其他称呼，逗号分隔"},{"label":"性别","value":"男 / 女 / 不明"},{"label":"年龄","value":"如：26 岁 / 二十出头 / 少年"},{"label":"身份","value":"职业或社会身份，如：青鸟议会书记官、高二学生"},{"label":"所属势力","value":"势力A、势力B"},{"label":"外貌","value":"外形要点，如：瘦高、银白长发、灰蓝眼、左眉一道旧疤、常年黑风衣"},{"label":"性格","value":"性格要点 + 行为依据，如：表面温和健谈，实际控制欲强、疑心重"},{"label":"背景","value":"出身与关键经历，如：贫民窟长大，父母死于瘟疫，被舅舅收养"},{"label":"目标","value":"想要什么 + 为什么，如：找到妹妹的下落，为此可以出卖任何人"},{"label":"人际关系","value":"和谁是什么关系、态度如何，如：与莉芙是青梅竹马，对她既依赖又愧疚"},{"label":"能力","value":"擅长的技能 / 战斗方式 / 特长（没写就省略这个字段）"},{"label":"弱点","value":"软肋 / 恐惧 / 把柄 / 成瘾（没写就省略这个字段）"}],"summary":"一句话概述"},
    {"type":"event","name":"事件标题","fields":[{"label":"时间","value":"这件事在故事世界里真正发生的时间，如：大陆历 1982 年立春 / 十年前 / 故事开始前三天（不要写章节号）"},{"label":"地点","value":"这件事发生的场所，如：王都·白塔 / 城郊驿站"},{"label":"叙事","value":"顺叙"},{"label":"登场人物","value":"角色A、角色B"},{"label":"起因","value":"…"},{"label":"经过","value":"…"},{"label":"结果","value":"…"}],"summary":"…"},
    {"type":"setting","name":"条目名","category":"物品或名词或纪年或其他","fields":[{"label":"字段","value":"内容"}],"summary":"…"},
    {"type":"merge","name":"最终真名或主名","fields":[{"label":"同一人物","value":"名字1、名字2"},{"label":"依据","value":"文本依据"}],"summary":"为何判断是同一人"},
    {"type":"relation","name":"关系简述","fields":[{"label":"人物A","value":"名字"},{"label":"人物B","value":"名字"},{"label":"关系","value":"如：兄妹 / 师徒 / 宿敌"},{"label":"类型","value":"亲属"},{"label":"依据","value":"文本依据"}],"summary":"…"}
  ]
}

规则：
- 只抽取文本中明确出现的信息，不要编造或补全。
- type 只能是 character / event / setting / merge / relation 五种。
- 【重要度】每个人物必须包含「重要度」字段，值只能是「主要」或「龙套」。龙套＝只出现一两次、没有完整设定、通常没有正式姓名的角色（路人、士兵、卫兵、侍者、围观群众、某位官员、无名商人、群众甲等）。有正式名字且有戏份的用「主要」。
- 【只被顺带提一句的，别输出】如果某个人物整段文本里只在半句话里出现过（例如「商店老板」「路人甲」「某位士兵」「门口的侍者」），既没有正式名字也没有戏份，就直接不要为他输出 character 记录；某个物品 / 名词如果只是顺带一提、没有任何信息量，也不要输出 setting。宁缺毋滥：漏掉一个无关紧要的路人没关系，冒出一堆没用的路人更糟。
- 【人物 vs 势力，必须分清】character 只能是个体角色（一个有血有肉、能自己做决定、有心理活动的具体的人）。国家、政权、政党、帮派、军队、军团、教团、教会、公会、商会、公司、家族势力、种族、联盟、起义军、抵抗组织等集体名词，一律不要输出成 character，而要输出成 setting，category 用「势力」。判断方法：它能不能"自己说话、自己做决定、有自己的心理活动"——能的是人物，不能的是势力。
- 【势力条目怎么输出】setting 且 category 为「势力」时，fields 建议用：{"label":"类型","value":"国家/政权/政党/军队/组织/教会/公会/家族/公司/其他"}、{"label":"立场","value":"…"}、{"label":"控制区域","value":"…"}、{"label":"领袖","value":"…"}、{"label":"简介","value":"…"}；另外用 {"label":"关联人物","value":"人物A、人物B"} 写清这个势力的相关人物（顿号分隔，与人物条目里的「所属势力」两边都要写）。
- 【设定条目的关联人物】每条 setting（物品 / 地点 / 纪年 / 势力 / 装备 / 名词都一样）都要用 {"label":"关联人物","value":"人物A、人物B"} 列出与它有关的人物（顿号分隔；没有就不写）。物品写持有者或使用者、地点写归属或常去的人、纪年写涉及的时期人物、势力写成员与领袖、装备写使用者或铸造者、名词写出处或关联的人，都放这一项，不要另起「持有者」「相关人物」这类字段。
- 【装备条目怎么输出】setting 且 category 为「装备」时，fields 建议用：{"label":"种类","value":"武器/防具/配饰/道具/载具/其他"}、{"label":"外观","value":"…"}、{"label":"功能 / 用途","value":"…"}、{"label":"来历","value":"…"}；并用 {"label":"关联人物","value":"…"} 写出它的使用者、持有者或铸造者。单独的兵器、铠甲、法器、道具、载具、义体、药剂装备这类"被人拿在手里 / 穿在身上 / 带在身边"的具体物件归「装备」；没有实体的技术、体系、概念仍归「物品 / 名词」。
- 【同名要拆开】如果某个名字既是势力名、又是某个人的代号或外号（例如「阿尔法」既是起义军的名称、又是某人的代号），要分别输出：势力用一条 setting（category=势力），人物用一条 character，并在 summary 里说明两者的区别。
- 【主动梳理势力与隶属关系】每读一段文本，都要主动找出其中出现的势力 / 组织（国家、政权、政党、军队、军团、教团、公会、家族、帮派、公司、联盟等），为每一个输出一条 setting（category=势力），字段填「类型 / 立场 / 控制区域 / 领袖 / 简介」，并用「关联人物」列出相关的人。同时判断每个人物分别属于哪些势力：在 character 里加 {"label":"所属势力","value":"势力A、势力B"}（顿号分隔，可以多个；一个人可以同时属于多个势力，例如既是某国军人又是某秘密组织成员，要全部列出）。势力的「关联人物」和人物的「所属势力」两边都要写。
- 【人物要抽全】文本中出现的、有名字的人物都要输出 character 记录，绝不要遗漏主角、视角人物和重要配角。特别注意「简称（全名）」这种写法（例如「莉芙（科诺莉芙·维尔特）」）：这是同一个人，只输出一条，name 用完整正式的名字，简称写进「别名」。只要一个人物在文本中有名有姓、有动作或台词，就必须出现在结果里。
- 【同一人物只输出一条】同一个人的不同称呼属于同一个人，绝不能拆成多条。包括：全名与名（如「艾达·普希金」和「艾达」）、名·姓与名（如「莉芙·维尔特」和「莉芙」）、**简称是名字里的一截**（如「科诺莉芙·维尔特」和「莉芙」——注意这类截取式昵称最容易漏）、姓与名、昵称、绰号、头衔+名字（如「艾达殿下」）、音译变体。请合并为一条 character，name 用文本中最完整正式的写法；**只有原文明确支持、确实指这个人的称呼才写进「别名」**（用逗号分隔）。亲属关系、职业、敬称、描述性称呼和不确定的猜测不要当别名；头衔 / 关系写进「人际关系」。
- 【假身份 / 双重身份】只有原文**明确揭示**是同一个人时，才把化名、假身份、卧底身份并入同一条：name 用最正式/最终的名字，其余有依据的称呼写进「别名」。**「某人冒充 A」不等于 A**：冒充者、假冒的 A、A 的替身是另一个人或一条描述，不要把「假冒的 A」写进 A 的别名；把冒充关系写进「人际关系」或「背景」。
- 【身份合并记录】如果本段文本揭示了两个此前可能被当作不同人的名字其实是同一人（真名揭晓、卧底暴露、伪装身份被揭穿、双胞胎互换等），除了按上面合并成一条 character 之外，还要额外输出一条 merge 记录，「同一人物」里列出所有相关名字。
- 【人物档案要写细，但不许脑补】有依据的信息都要落到对应字段上，宁可写一句具体的，也不要只写「性格复杂」「身世成谜」这种空话；反过来，文本没写的绝不替作者补。各字段怎么写：
  · 外貌：身高体型、胖瘦、发色发型、瞳色、五官、肤色、疤痕 / 胎记 / 纹身 / 义肢、眼镜、惯常穿着（制服、风衣、白袍、斗篷…）、嗓音、气味、走路姿态。要区分「长期特征」与「临时状态」：长期特征（天生白发、断指、脸上刀疤）写进外貌；临时状态（受伤、易容、女扮男装、临时换装）写进背景或事件，别当成固定长相。用比喻或借他人视角写的气质（「像一把收在鞘里的刀」「笑起来让人后背发冷」）也算外貌信息，可以照写。
  · 性别 / 年龄：文本没明说就不要写；写得含糊（「少年」「中年人」「二十出头」）就照原样写，不要自己换算成具体岁数。女扮男装、伪装身份时以真实身份为准，并在「背景」里写明伪装。
  · 性格：不要堆形容词，每个要点后面跟一句行为依据（「嘴上刻薄，实际上每次都替人收拾烂摊子」）。特别注意现代小说常见的：表里反差（表面温柔 / 内里偏执，吊儿郎当 / 关键时刻极可靠）、行为模式（讨好型、回避型、控制欲、社恐、强迫、嘴硬心软）、心理状态（抑郁、创伤后应激、成瘾、失眠）。同一人前后矛盾的表现，用「但 / 只有对某某」把条件写清楚。
  · 背景：出身（家庭、阶层、地域）、成长经历（孤儿、寄养、被收养、军营长大、寄人篱下）、关键变故（灭门、车祸、被实验、被出卖、穿越、重生、失忆）、学历与职业经历、当前处境（被通缉、隐姓埋名、负债、带伤逃亡、刚出狱）。按时间先后写，用分号隔开。
  · 目标 / 动机：写「想要什么」+「为什么」+「愿意为此做到什么程度」；区分短期目标（这三天要先救出人）和长期执念（替全家报仇）。由创伤、愧疚、恐惧催生的执念也写在这里。
  · 人际关系：写清和谁、什么关系、态度如何（爱 / 恨 / 依赖 / 愧疚 / 想保护 / 想报复），能对上具体人物就用完整名字；同时这些关系也要按上面【人物关系】的规则输出 relation 记录。
  · 能力 / 弱点：会什么（剑术、黑客、医术、厨艺、谈判、读心…）、靠什么生存、怕什么、有什么把柄或成瘾。没有依据就不要写这两个字段。
  · 字数：外貌、背景可以写到 50 字左右，其余字段每项不超过 30 字；不要复述原文长句，只写提炼后的要点。
- 【现代 / 轻小说常见设定与专有名词】这套工具体常用于现代、奇幻、异世界、学园、恋爱喜剧类小说，识别时留意以下套路，但只按文本实际写、不许脑补：
  · 世界观名词按类别归好：魔法、技能、天赋、等级、职阶、职业（勇者、贤者、剑士、魔法师、治愈师、刺客、商人）、公会、冒险者、委托、讨伐、迷宫、秘境、学园、社团、部活、文化祭、修学旅行、转生、异世界、召唤、魔王、勇者、圣剑、神器、结界 → 这些作为 setting 输出，类别用「名词」或「物品」或「势力」（公会、骑士团、学院这类组织用「势力」）。
  · 异世界 / 转生 / 召唤 / 重生 / 游戏化（面板、任务、系统提示）：这是背景或能力，写进人物的「背景 / 能力」，不要当成真实地理；系统、面板、状态栏这类只存在于设定里的东西不要输出成 entity。
  · 学园题材：社团、班级、座位、学园祭、文化祭、修学旅行、学生会、风纪委员 → 相关人物关系按「同学 / 同桌 / 学长学弟 / 社团同伴」归类（见【现代题材常见关系怎么归类】）。
  · 恋爱喜剧常见套路：傲娇、毒舌、天然呆、高岭之花、青梅竹马、义妹 / 义兄、转校生、同班同学、社团前后辈、贴贴、壁咚、膝枕、投喂、共撑一把伞、脸红、傲娇「才、才不是因为你」——这些用来佐证「恋爱 / 朋友」，关系类型仍按上面规则判，不要因为"傲娇 / 毒舌"就误判成「敌对」。
  · 【话外篇 / 番外 / 角色讲述的故事】标题里带「话外篇 / 番外 / 外传 / 间章 / 小剧场」的段落，以及「某个角色给别人讲述的故事」（故事里的故事、传说、回忆里讲的往事）都要照常抽取：当成一条 event，把起因 / 经过 / 结果写清；「登场人物」写清是哪个人讲的，summary 里点明这是谁讲述的什么故事。不要因为它是「故事里的故事」就跳过。
  · 【第一人称 / 多视角】第一人称叙事里「我」指谁要看上下文：多主角、多视角或分章切换视角的小说里，不同章 / 节的「我」可能是不同的人，不要因为都写作「我」就把他们当成同一个人，也不要单独建一个叫「我」的人物；真名不明时用「〈第X章〉的叙述者」这类能区分的写法。同一个人物的不同称呼要合并，但名字毫无关系的两个人不要凭猜测并到一起。
  · 「别名」只写确实特指这个人的其他叫法（全名、简称、绰号、有依据的假身份、译名）；**不确定就不写，宁可少写，不要把猜测、关系称呼、职业或描述性短语塞进别名**。父亲、母亲、男子、女子、女孩、男孩、男生、女生、少年、少女、学生、同学、老师、我、你、他、那孩子、路人 这类宽泛称呼绝不能当别名写进来（两个不同人的「父亲」会被当成同一个人）。称呼与敬语不是新人物：名字前后带「大人、殿下、小姐、少爷、前辈、学长、学姐、君、酱、桑、酱」等敬称 / 昵称后缀，或者用特征代称（「银发少女」「红发少年」「眼镜男」「黑发剑士」）时，只在原文明确指向同一人时并到具体人物；描述性短语（如「带头作伪证指控少女的同学」「站在门口的那个人」）不是人名，绝不能当人物名输出：确属无名的路人（只出现一次、没有戏份）就直接不输出，需要提及时用「同学」「路人」这类通称。
- 【能力 / 战斗体系】现代轻小说常带一套能力体系，抽取时把「技能 / 魔法 / 天赋 / 等级 / 职阶 / 武器 / 称号」这类写进对应人物的「能力」或「弱点」字段；如果某能力、道具、魔具本身很重要（有名字、反复出现、影响剧情），再单独输出一条 setting（category=物品 或 名词）。
- 【科幻题材】星际、太空歌剧、赛博朋克、末日废土、反乌托邦、基因改造、克隆、义体、人工智能、时间旅行、平行世界等题材注意：
  · 组织（政府、公司、舰队、殖民团、反抗军、黑帮、地下组织）→ setting，category=势力；人物只输出有自我意识、能自己做决定的个体。
  · 具名科技 / 造物：星舰、空间站、义体、武器、病毒、药剂、程序、AI、机器人、基因技术 → setting，category=装备 / 物品 / 名词；其中「有自我意识、像人一样思考说话」的 AI / 机器人 / 仿生人，可以按人物处理，但要在 summary 里说明它是非人类个体。
  · 现代题材的装备：枪械（手枪、步枪、狙击枪、霰弹枪、冲锋枪）、刀具与冷兵器（匕首、军刀、武士刀、直刀、折叠刀、警棍）、爆炸物与炸药、防护（防弹衣、头盔、护具、盾、防护服）、随身配饰（戒指、项链、护身符、面具、眼镜、手表、耳饰）、随身器材（通讯器、对讲机、望远镜、相机、工具箱、钥匙卡、注射器、药械）、载具与机械（摩托、跑车、直升机、无人机、装甲车、机甲、星舰）→ setting，category=装备。判断标准：它有名字、有具体的形制或用途，并且在剧情里被人携带、使用、改装或争夺过；纯粹当背景的生活用品（手机、钱包、背包、钥匙）不要输出。
  · 魔幻 / 西式奇幻的装备：法杖、魔杖、魔导书（grimoire）、戒指、护符（amulet / talisman）、圣剑、魔剑、铠甲、披风、药水与魔药（potion / elixir）、卷轴、召唤物用的法器 → setting，category=装备。要写清属性与附魔、认主条件、诅咒或代价、由谁锻造（哪个种族、哪座塔、哪位匠人），以及现在在谁手里；威能放「功能 / 用途」，来路放「来历」，持有者与铸造者放「关联人物」。
  · 玄幻 / 仙侠的装备：法宝、飞剑、灵器与灵宝、丹药、符箓、阵盘、储物袋与储物戒、灵石、功法玉简 → setting，category=装备。要写清品阶（下品 / 中品 / 上品 / 极品，凡器 / 灵器 / 仙器之类）、认主与器灵、威能与反噬、出自哪个宗门 / 秘境 / 炼器师；宗门与秘境的信息归「来历」，人物归「关联人物」。
  · 科幻的装备：能量武器、光束枪与等离子炮、动力装甲、外骨骼、义体与植入物（implant）、脑机接口、AI 芯片、纳米医疗包、太空服、能量护盾、通讯与跃迁装置、飞船与星舰 → setting，category=装备。要写清型号与序列号、制造商与所属舰队 / 公司 / 势力、能源与耗材、军规等级或改装情况；同型号的不同编号算不同装备，同一件的不同代号算它的「别名」。
  · 历史 / 古代题材的装备：刀枪剑戟弓弩、明光铠与锁子甲、板甲、战马与马具、兵符、印信、玉玺、圣旨、旌旗、号角、火铳与火炮 → setting，category=装备。要写清材质与工艺（镔铁、百炼钢、乌木之类）、官造还是私铸、铭文与年号、归属的朝代 / 军队 / 将领；使用这件器物的人写进「关联人物」。
  · RPG 游戏 / 系统流 / 网游 / 异世界题材的装备：游戏里出现或有系统面板的武器、防具、饰品、消耗品、材料与套装（rare / legendary / SSR / UR、「レア」「伝説」这类品质标识也算线索）→ setting，category=装备。要写清品质与品阶、等级或职业要求（Lv.35、限剑士之类）、属性与词条（攻击力 / 防御力 / 耐久 / 暴击 / 词缀）、强化与镶嵌（+7、宝石孔位）、套装归属、绑定与耐久状态、掉落地或产出方式（哪个副本、哪个 BOSS、哪条任务线）。这些写进「功能 / 用途」与「来历」；持有者与队伍成员写进「关联人物」。批量掉落、随手卖掉的普通白板装备不要每件都建条目，只保留有名字、有品质、和剧情或人物真正有关的那些。
  · 装备条目怎么写细：种类写清属于哪一类（武器 / 防具 / 配饰 / 道具 / 载具 / 其他）；外观写形制、材质、颜色、标识、改装与磨损；功能 / 用途写它能做什么、射程威力或防护等级、使用条件、代价与副作用；来历写铸造者、所属组织、出自哪个年代或地点、怎么到使用者手里的。使用者、持有者、抢夺者、维修者都写进「关联人物」，不要另起字段；同一件装备几经易手时，把前后几任持有者都列出来。
  · 现代题材常见呼应：装备往往和人物的身份、势力、事件绑在一起（警用装备对应警方、军用装备对应部队或雇佣兵、私人定制武器对应组织或家族、改装车对应帮派或个人标志）。识别装备时要顺手判断它属于哪个势力、出现在哪些事件里——势力写进人物 / 势力的关联，事件相关的信息写进装备的「来历」或对应的事件条目，不要把两件事混成一件。
  · 跨语言文本一视同仁：简体、繁体、英文、日文的作品都按上面这套规则处理（现代、魔幻、玄幻、科幻、历史、RPG 游戏各题材都一样）。原文里的型号、铭文、招式名、品质标识、简称照原样写进「外观」或「功能 / 用途」；官方译名、音译名、代称、绰号（例如同一件装备在不同译法或不同角色口中的叫法：sword / 剣 / 剑、amulet / 護符 / 护符、Lv.35 / レベル35 / 35 级）写进「别名」，不要因为语言或译名不同就把同一件装备拆成两条。
  · 义体 / 基因改造 / 克隆 / 失忆 / 时间线改变 → 写进人物的背景、外貌或能力；「时间旅行 / 平行世界 / 循环」属于事件的时间或背景设定，不要当成多个同名人物，优先按【假身份 / 双重身份】合并。
- 【魔幻 / 玄幻题材】修炼、斗气、魔法、异能与仙侠玄幻注意：
  · 修炼体系（境界、灵根、功法、法宝、丹药、斗气、异能、血脉、天赋、神格）→ 能力 / 物品 / 名词；具名的重要功法、法宝、神器、魔器单独出 setting。
  · 门派、宗族、教派、学院、神殿、王国、异族、魔族、妖族、龙族、精灵、矮人、兽人等 → setting，category=势力或名词；只有「具体出场、有名字有戏份」的个体才输出成人物。
  · 种族 / 血统（半精灵、龙裔、混血、妖族后裔）写进人物的外貌或背景；「妖 / 魔 / 神 / 古神」若是集体概念或存在感稀薄的设定，归名词或势力，别当成普通人物。
- 【犯罪 / 惊悚 / 心理恐怖题材】侦破、凶杀、悬疑、惊悚、恐怖、心理创伤注意：
  · 案件要素（线索、动机、案发现场、时间线、嫌疑人、凶手、受害者、不在场证明）尽量落进事件的「起因 / 经过 / 结果」与「时间 / 地点」；凶手 / 受害者是人物，写清身份与动机。
  · 反转、伏笔、红鲱鱼、真假线索：只按文本已交代的事实写，不替作者判定"谁是凶手"，除非文本已揭晓；未揭晓的悬念写进事件的「备注 / 伏笔」或相关人物的「目标 / 动机」。
  · 幻觉、梦境、内心独白、精神分裂、创伤、恐惧源、超自然现象：这是人物的心理状态 / 弱点 / 背景，或事件的氛围，不要当成"真实发生了的事件"；「这是幻觉 / 是梦 / 是他疯了」这类由文本明确交代的真相，写进 summary 或备注。
  · 恐怖元素（怪物、诅咒、怨灵、鬼屋、邪教、仪式、异变）→ setting，category=物品 / 名词 / 势力；确有具体角色（有名字有戏份的怪物 / 怨灵）才输出人物。
- 【官能 / 成人向题材】情爱、官能、成人向小说也按这套规则抽取，但注意分寸：
  · 亲密 / 情欲场景按 event 处理：起因（氛围、动机、关系变化）、经过（发生了什么，只写要点，不逐字复述露骨描写）、结果（情感后果、关系走向）；地点、登场人物照常填。
  · 亲密关系归「恋爱」，关系描述写清性质（恋人、情侣、未婚夫妻、情人、婚外情、交易关系、单恋、追求、一夜情、炮友、契约关系、主仆之恋等），「依据」写原文关键句；不要因为直白描写就漏判，也不要把它概括成"朋友"。
  · 由情欲 / 亲密关系驱动的心理（欲望、占有欲、依赖、成瘾、羞耻、愧疚、创伤、性创伤、支配 / 臣服倾向）写进人物的「目标 / 动机」「弱点」「背景」；它常常是人物弧光或剧情转折的根，别只当成可有可无的细节。
  · 尺度内容本身不要逐字写进任何字段；只提炼人物关系、人物心理与剧情走向，避免把色情描写当成世界观抽成 setting。
- 【中、英、日夹杂】文本里混着中文、英文、日文（假名 / 汉字 / 罗马音）时，按"同一实体只出一条"来对齐，不要因为换了写法就拆成多条：
  · 同一人物的多种写法（英文名、日文假名、罗马音、汉字译名、中文音译）合并为一条 character，name 用文本中最完整正式的写法，其余写法全部写进「别名」。例：「Aria」「アリア」「阿丽娅」是同一个人；「Sakura」「さくら」「樱 / 小樱」是同一个人。
  · 英文名的大小写、连字符、昵称（Alexander / Alex）、日文敬称后缀（さん / ちゃん / くん / 様 / 殿）都不算新人物；后缀去掉后并入本体，写进别名。
  · 专有名词、地名、势力名、能力 / 技能名的多种写法（英文 / 罗马音 / 汉字 / 中文意译）合并到同一 setting，名称用正文最常用的写法，其它写法放进「别名」或「简介」里注明，不要拆成两条。
  · 实在无法确定两个不同写法的词是不是同一个时，宁可按"可能是同一"合并，并在 summary 里写一句「疑似同一，待作者确认」，也不要各自单独成条造成重复。
- 【必须区分「时间」和「叙事顺序」】这是两件不同的事：①「时间」＝这件事在故事世界里真正发生的时间（如「大陆历 1982 年立春第一天」「十年前」「故事开始前三天」「第三天清晨」），写进 event 的「时间」字段，不要写章节号，也不要写它在第几章被讲到；②「叙事顺序」＝小说是第几个讲它的，用 event 的「叙事」字段标注，只能填「顺叙」或「插叙」——回忆、闪回、预叙、插在中间补充等非线性叙述一律填「插叙」，正常时间推进的填「顺叙」；不要输出「倒叙」这种写法。两者互不影响：一个插叙讲出来的事件，它的「时间」可能很早，但它是后面才被讲到的。
- 【人物关系】文本中明确交代的人物关系要输出 relation 记录：「人物A」「人物B」用与 character 一致的完整名字，「关系」用一两个词概括（如「兄妹」「师徒」「宿敌」「同僚」「挚友」「恋人」），「类型」只能填 亲属 / 师徒 / 敌对 / 恋爱 / 朋友 / 同事 / 其他。
  · 【同一对人物可以同时有多条关系，别合并成一条】例如既是兄妹又是同事、既是朋友又在恋爱、既是师徒后来又反目成仇、既是上下级又是朋友——这些都要分别输出多条 relation 记录（人物A / 人物B 相同，「关系」和「类型」各自不同），一条只记一种类型。判定时把每种类型分别过一遍，成立就输出；只有「同一对人物 + 同一类型」才不要重复。
  · 【亲属】血亲 / 姻亲 / 收养 / 家族：父亲、母亲、儿子、女儿、哥哥、弟弟、姐姐、妹妹、伯叔姑舅姨、祖父母、外祖父母、堂表亲、继亲、义父义母、养父母、义兄义妹、岳父母、公婆、女婿、儿媳、配偶（丈夫 / 妻子）。现代写法也算：爸爸、妈妈、老爸、老妈、爹地、干爹、干妈、外公、外婆、爷爷、奶奶、独生子女、双胞胎、龙凤胎、同父异母、亲戚、家族、一家人。已婚夫妻填「亲属」（他们已经是家人）；只写到男女朋友 / 男友 / 女友 / 交往中 / 恋爱中 / 订婚的，一律填「恋爱」，不要填「亲属」。判断只看亲属称谓本身，别因为句子里有「少女」「女孩」「同学」这类字就当成亲属。
  · 【恋爱】不看性别，男男 / 女女 / 男女都算。判据是「心意 + 专属感」，不是有没有肢体接触：
    – 明写的心意或身份：喜欢、爱上、爱慕、暗恋、单恋、告白、表白、心动、脸红心跳、心跳加速、吃醋、占有欲、非他不可、舍不得、心上人、恋人、情侣、男朋友、女朋友、未婚妻 / 未婚夫、婚约、订婚、私定终身、初吻、殉情。
    – 亲密接触必须看「部位 + 氛围 + 双方身份」，这里最容易误判：
      ○ 算「恋爱」：嘴唇碰到嘴唇、深吻 / 热吻 / 舌吻 / 拥吻 / 吻到喘不过气、吻住不放、缠绵的拥抱、拥入怀中、十指相扣、依偎着睡、同床共枕，以及带情欲或专属意味的搂抱、抚摸、耳鬓厮磨。
      ○ 不算「恋爱」：亲额头 / 脸颊 / 手背 / 头顶（长辈对孩子、祝福、道别、安慰、哄睡）、贴面礼、礼节性的握手或拥抱、道别时的拥抱、纯粹安慰用的拥抱、拉着对方手腕赶路，以及小孩之间、家人之间、同性好友之间打闹式的亲昵。
      ○ 结合氛围判断：同一处有屏息、脸热、愣住、不敢动、舍不得放开、时间像停住之类「暧昧」信号 → 填「恋爱」；动作利落、顺手、安慰或玩笑性质 → 按当时双方的身份填（亲属 / 朋友 / 同事）。
      ○ 友爱性质的接触（勾肩搭背、抱一下就松开、打闹、开玩笑地亲脸颊）不算恋爱，填「朋友」。
    – 前任、单恋、三角恋、表白被拒、已经分手：只要文本交代过这层情感，仍填「恋爱」，「关系」里写清（如「前任」「单恋」）。
  · 【朋友】私交亲密、彼此信任、常来常往：朋友、好友、挚友、知己、死党、闺蜜、哥们、兄弟般的交情、青梅竹马、发小、有交情的同学、相处融洽的室友 / 邻居、网友、笔友、生死之交、义结金兰、只把秘密告诉对方、经常一起玩、互相调侃、替对方出头。
  · 【同事】立场一致或同属一个组织 / 单位，有合作但私交未必密切：同事、同僚、战友、搭档、队友、上下级、上司、下属、老板、员工、经纪人与艺人、保镖与雇主、主人与仆人、同一门派 / 军团 / 公司 / 公会 / 小队、同盟、盟友、合作关系、雇佣关系。注意：上下级、主仆、队友默认填「同事」，只有文本另有交情描写（一起玩、谈心、交心）才改填「朋友」。
  · 【师徒】授业与受业：师父、师傅、师尊、恩师、教官、教练、导师、弟子、徒弟、学徒、传人、关门弟子。同门师兄弟 / 师姐妹之间填「同事」，与师父 / 徒弟之间填「师徒」。
    ⚠ 只有文本里确实写出师承关系（拜师、收徒、师承、教导、授业等，或双方以师父 / 徒弟相称）才算师徒；「A 是某班的老师 / 班主任，B 是同一个班的学生」这种同班师生也算师徒（关系写「师生」）。另外，「明确指导 / 传授某门武艺、技艺或技能」也算师徒：教剑法、指点武艺、传授医术 / 魔法 / 厨艺、教他枪法 / 拳法 / 箭术、师从某人学艺、手把手教手艺等，只要有“教 / 学具体技能”的明确交代就填「师徒」（关系写「师生 / 师徒」）。只是出现「学生」「学生会长」「同学」「老师」这类角色词、或者句子里顺带提到学生，都不算关系——宁缺毋滥，拿不准就不要输出。
  · 【敌对】仇怨、对抗、争到你死我活：宿敌、死敌、仇人、敌人、对手、死对头、政敌、情敌、血海深仇、灭门、追杀、背叛、出卖、陷害、决裂、反目、争权、争夺同一个人 / 同一个位置、誓不两立。
  · 【其他】以上都不合适时用：只有一次交易、纯粹同框的路人、关系尚不明朗的初遇。
  · 【现代题材常见关系怎么归类】同学 / 同桌 / 学长学弟 → 有交情算「朋友」，只是同班算「其他」；室友 / 邻居 / 网友 / 笔友 → 走得近算「朋友」；相亲对象 / 前任 / 现任 / 单恋 / 暧昧对象 → 「恋爱」（前任在「关系」里写「前任」）；继父继母 / 养父母 / 婆媳 / 妯娌 / 干亲 → 「亲属」；经纪人与艺人 / 保镖与雇主 / 司机与老板 / 合伙人与搭档 → 「同事」；房东与租客 / 债主与欠债人 / 警察与线人 / 医生与病人 / 律师与委托人 / 粉丝与偶像 / 买家与卖家 → 「其他」。
  · 「关系」这一栏写具体词（兄妹 / 养父子 / 上司与下属 / 战友 / 同门 / 闺蜜 / 青梅竹马 / 前任 / 单恋 / 宿敌 / 仇人），「依据」写原文里的关键句或动作。拿不准「朋友」还是「同事」时，看有没有私人交情：写了交情、知心话、互相牵挂 → 「朋友」；只有共同立场、共同目标、一起办事 → 「同事」。
- 【每个事件都要标注登场人物】每条 event 必须包含「登场人物」字段，列出该事件中出现的所有人物，用中文顿号「、」分隔，使用与 character 一致的完整名字；确实没有人物时留空字符串。这是必须字段。
- 【每个事件都要标注发生的场所 / 地点】每条 event 都要尽量填「地点」字段：写清这件事发生在哪里（如「王都·白塔」「城郊驿站」「青鸟议会大厅」「艾达家的庭院」）。原文只写了笼统的场所（「一间酒馆」「城门外」）就照原样写，不要自己编一个地名；整段确实没有交代场所时才留空字符串。注意「地点」指的是"在哪里发生"，「势力」指的是"属于哪个组织 / 政权"，不要把势力名（如「青鸟」「阿尔法」）当成地点填进去。
- 【章节 / 文件来源】每次分析都会标出本文来自哪一章（标题可能来自文件名，例如「第五章 出发」「P1」「Chpt2」「Ep3」「Chapter 4」，一个文件常常就是一章），以及它在全书里的顺序。请按这个顺序理解剧情推进；如果同一章被切成多块，只提取本块出现的信息，不要把别的块里的内容重复输出。
- 人物用 character，剧情事件用 event，世界观设定（物品、装备、专有名词、年代纪事、地点、势力等）用 setting。
- setting 的 category 只能填：物品 / 装备 / 名词 / 地点 / 纪年 / 势力 / 其他，无法归类就用「其他」。城市、村镇、建筑、房间、区域、山川这类「在哪儿发生」的场所名词用「地点」；经常出现在剧情里的重要地点（反复出现的场景、有名字的城 / 宫 / 学院 / 秘境等）要单独输出一条 setting，category 用「地点」，字段填「类型 / 位置 / 归属 \/ 控制者 / 气候 \/ 地貌 / 重要事件 / 简介」，其中「重要事件」写在这里发生过的关键事件。
- 每个字段的值保持简洁（一般不超过 30 字；人物的「外貌」「背景」可以到 50 字左右），summary 不超过 40 字，不要复述原文，避免输出过长。
- 每一段（每次调用）都独立输出：把**本段**能确定的所有信息写全；同一人物在本段出现多次也只输出一条 character，看到的新信息补进对应字段。跨段的重复与合并由程序处理，你只管把本段抽全、抽准。

【输出示例（参考结构，别照抄内容）】
同一人物跨章节只输出一条；本段看不到的信息就不写，看到的新信息补进对应字段：
{"records":[
  {"type":"character","name":"阿斯塔","fields":[{"label":"重要度","value":"主要"},{"label":"别名","value":"阿星"},{"label":"身份","value":"佣兵团剑士"},{"label":"性格","value":"寡言、对同伴极护短"},{"label":"背景","value":"幼时村庄被毁，被老团长收养"}],"summary":"沉默但可靠的佣兵剑士"},
  {"type":"event","name":"初遇","fields":[{"label":"时间","value":"故事开始前三年"},{"label":"地点","value":"灰谷驿站"},{"label":"叙事","value":"顺叙"},{"label":"登场人物","value":"阿斯塔、莉芙"},{"label":"起因","value":"莉芙被佣兵团围住"},{"label":"经过","value":"阿斯塔出手解围"},{"label":"结果","value":"两人同行"}],"summary":"两人初识"},
  {"type":"relation","name":"伙伴","fields":[{"label":"人物A","value":"阿斯塔"},{"label":"人物B","value":"莉芙"},{"label":"关系","value":"挚友"},{"label":"类型","value":"朋友"},{"label":"依据","value":"两人多次并肩作战"}],"summary":"并肩的伙伴"}
]}
- 没有可抽取内容就返回 {"records":[]}。`;

  /* ================= 文本风格：各种写法自动都要认 =================
     小说可能是简中 / 繁中 / 台普 / 粤语 / 英译腔 / 日译腔 / TVB 腔，甚至直接是日文、英文原文。
     这里给模型一段「所有写法都要照顾到」的识别要点（不需要用户选，模型自己按文本判断），
     凡是涉及分析的地方都会把它拼进系统提示词。 */
  const TEXT_STYLE_GUIDE = `【文本风格：中文各变体 + 译文腔 + 日文 / 英文原文，自己判断、都要认】
先看这段文本是什么写法（普通话、繁体中文、台普、粤语 / 港普、TVB 腔、英式翻译腔、日式翻译腔，或干脆是日文 / 英文原文），再按那种写法处理人名、称呼、方言用词与语气词。下面是各自的坑：

- 繁体中文：按繁体用词记录，不要转成简体；「臺 / 台」「裡 / 里」「著 / 着」「為 / 为」是同一写法，不要当成不同条目；异体字（教団 / 教團）算同一个词。
- 台普（台湾腔）：便当 / 机车 / 捷运 / 计程车 / 影片 / 软体 / 资讯 / 学测 / 国中 / 里长 / 老爸 / 老妈 / 阿公 / 阿嬷 / 耍宝 / 龟毛 这类用词一律按台湾说法记录（「计程车」别改「出租车」、「便当」别改「盒饭」）；阿公 / 阿嬷按上下文是爷爷 / 奶奶或外公 / 外婆；啦 / 欸 / 喔 / 耶 / 齁 是语气助词；「阿＋单字」（阿明 / 阿伟）算同一人的别名。
- 粤语 / 港普：唔 / 嘅 / 係 / 啲 / 咁 / 哋 / 睇 / 冇 / 嚟 / 嗰 / 俾 / 揾 / 靓 / 嘢 / 喺 这些是粤语用字；「阿明」「靓仔辉」里的阿、靓仔是前缀或口癖不是姓；老豆 / 老母 / 细佬 / 大佬 / 家姐 / 细妹 / 契爷 / 契妈 对应父亲 / 母亲 / 弟弟 / 哥哥 / 姐姐 / 妹妹 / 干爹 / 干妈，关系写进「人际关系」而字段值仍用原文用词；茶餐厅 / 屋邨 / 的士 / 写字楼 / 街市 照原文写；别按普通话字面理解（唔好＝不要、冇得＝没有、搞掂＝办妥、点解＝为什么）。
- TVB 腔：阿 Sir / Madam / 师兄 / 师姐 / 细佬 / 大佬 / 叔父 是关系称呼不是名字；警队的上司与下属、黑帮的头目与手下、江湖辈分按剧情判断，不要见「哥 / 姐」就判成亲属；落口供 / 讲数 这类行话按行话理解；警署 / 律政署 / 茶楼 / 大排档 照原文写。
- 英式翻译腔：句式欧化、长定语多、常用被动语态；人名多为音译（爱丽丝·温特斯），把 Mr. / Mrs. / Miss / Sir / lady 这类称谓从名字里剥出去；教名、昵称、姓氏简称（Elizabeth → Liz / 贝丝）算同一人的别名；uncle / aunt 可能是叔舅姑姨，cousin 是堂表亲，in-law 是姻亲，都不要按字面判成父亲 / 兄弟，拿不准就写「叔伯辈亲属」；译文腔的心理描写（他心想 / 某种程度上）不是台词也不是事件；美式日期、相对时间（一周后）照原文写。
- 日式翻译腔：～君 / ～酱 / ～桑 / ～先生 / ～老师 / ～前辈 / ～大人 / ～殿下 与名字分开，「某某同学」「某某前辈」里某某才是名字；被译者补出来的「他 / 她」不一定可靠，拿不准就不写性别；先輩 / 後輩 / 幼馴染 / 先生（可能是老师也可能是医生）按上下文判断，社团 / 班级 / 学园 是设定不是人物；句末「呢 / 哦 / 啦 / 嘛 / ……的说 / ～」是语气词。
- 日文原文：姓与名常分开写、还会有假名写法与罗马字写法（ルビ、ふりがな），同一个人的汉字名 / 假名 / 罗马字要合并；敬称（さん / くん / ちゃん / 様 / 先生）不算名字；敬语（です / ます / ございます）没有额外含义，不要写进字段。
- 英文原文：大小写不同的写法算同一个名字（ALICE / Alice / alice）；昵称与正式名（Bob / Robert、Liz / Elizabeth）合并；Mr. / Mrs. / Ms. / Dr. / Sir / Lord 是称谓不是名字；时态（had been / will be）说明时间先后，安排事件顺序时用上；章节标题常见 CHAPTER / Chapter / PART / PROLOGUE / EPILOGUE。

【原文用词原则（所有写法都适用）】
- 字段值用**原文的说法**记录，不要替换成更"标准"的近义词：原文写「的士」就写「的士」（别写"出租车"），写「便当」就写「便当」（别写"盒饭"），写「計程車」就照原文写，英文原文就用英文写。
- 人名以原文出现的写法为准。尊称、职称、亲属称呼、语气词、口癖都不算名字的一部分，要拆开：名字记在 name / 别名，称呼与关系记进「人际关系」。
- 语气助词（啦 / 喔 / 欸 / 呢 / 吧 / 嘛 / ……的说 / ～）不是人名、不是设定、不是事件。
- 第一人称「我」在不同章节可能指不同的人：拿不准就不要合并，也不要把不同人的「我」并成同一个。
- 方言词、行话、异体字按原文含义理解后再判断，但字段值仍然写原文用词。`;

  // 拼进系统提示词的那段（所有分析都会带上；用户不用选，模型自己按文本判断）
  function textStyleHint() {
    return `\n\n${TEXT_STYLE_GUIDE}`;
  }

  let projects = [];
  let activeProjectId = null;
  let state = null;
  /* 按线路筛选（事件轴 / 二维事件图 / 时间线三个界面共用同一份选择）：
     空集＝显示全部；否则只显示选中的这几条线路。逐个点筛选条上的线路即可多选 / 取消。 */
  let lineFilter = new Set();
  function lineFilterOn() {
    return lineFilter.size > 0;
  }
  // 这条线路现在要不要显示
  function lineFilterShows(lineId) {
    return lineFilter.size === 0 || lineFilter.has(lineId);
  }
  // 当前要显示的线路列表（横轴用）
  function lineFilterLanes() {
    return (state && state.lines ? state.lines : []).filter((l) => lineFilterShows(l.id));
  }
  // 这些事件里有没有「属于当前筛选线路」的
  function lineFilterHitsEvent(e) {
    if (!lineFilter.size) return true;
    return (typeof linesOf === "function" ? linesOf(e) : e.lineIds || []).some((id) => lineFilter.has(id));
  }
  // 新建事件 / 新建记录时默认选哪条线路：筛选中就取筛选里的第一条，否则取第一条线路
  function lineFilterDefaultId() {
    const list = state && state.lines ? state.lines : [];
    if (lineFilter.size) {
      const hit = list.find((l) => lineFilter.has(l.id));
      if (hit) return hit.id;
    }
    return list.length ? list[0].id : "";
  }
  // 线路被删掉后，把筛选里已经不存在的 id 清掉
  function lineFilterDropMissing() {
    if (!lineFilter.size) return;
    const known = new Set((state && state.lines ? state.lines : []).map((l) => l.id));
    lineFilter = new Set(Array.from(lineFilter).filter((id) => known.has(id)));
  }
  function lineFilterClear() {
    lineFilter = new Set();
  }
  let selectedCategoryId = null;
  let currentTab = "timeline";
  let entrySortDir = "asc"; // 设定条目的「按首字母排序」方向：asc=A→Z / desc=Z→A
  let selectedTaskId = null;
  let analysisRun = null;
  // 后处理（汇总 / 雷达 / 反思）自己的中止开关：暂停时也要能立刻掐断在途请求
  let postAbortCtl = null;
  let resultTabView = {}; // 分析结果区当前选中的选项卡（人物 / 事件 / 设定条目 / 人物关系；按任务记，只存内存）
  let resultGroupFolded = {}; // 分析结果里各分栏（章 / 节、类别、关系种类）的折叠状态（只存内存）
  let resultSearch = ""; // 分析结果的关键字搜索
  let resultSearchTask = null; // 上面这个关键字属于哪个任务（换任务就清空）
  let resultMergeTask = null; // 结果区「自动合并」弹窗当前任务
  let resultMergeGroups = []; // 当前所有可合并组
  let resultMergeSelected = new Set(); // 勾选要合并的组
  let resultMergeExcluded = new Map(); // 每组里被划掉、不参与合并的成员
  let resultMergeTab = "character"; // 弹窗当前选项卡
  let resultManualMerge = null; // 手动合并：{ task, type, selected, anchor }
  let resultViewTaskId = null; // 结果区当前显示的是哪个任务
  let resultOnlyUnfilled = false; // 「仅显示未填入」开关（只记在内存里）
  let waitTimer = null;
  let matrixFoldedGroups = new Set(); // 二维事件图里被折叠的人物分组（只影响显示）
  let matrixExpandedEventSets = new Set(); // 二维事件图里被展开的事件集（默认折叠）
  let matrixRowHeaderW = 220; // 二维事件图左侧事件栏宽度
  let pendingMergeItems = null;
  let modalOpenedAt = 0; // 最近一次打开弹窗的时间（用来忽略紧接着的遮罩点击）
  const MERGE_DIALOG_TEXT = {
    事件: {
      short: "以下事件被判断为同一个事件。单击词条＝要不要合并，双击词条＝选它当主体（会加框），再点「确认合并」。",
      long: [
        "单击事件＝要不要合并（灰掉划掉的就不合）；双击事件＝把它设为主体（会加框）。",
        "「自动合并」只找同一线路里相邻、标题高度相似的重复事件；跨线路、中间隔着别的事件的不会自动匹配。",
        "合并会把人物、线路、起因 / 经过 / 结果并到一起，设定条目里的关联也会跟着转移。",
        "取消勾选的项目不会合并；合错了点左上角「撤销」或按 Ctrl+Z 可以退回。",
      ].join("\n"),
    },
    设定条目: {
      short: "以下条目被判断为同一条设定。单击词条＝要不要合并，双击词条＝选它当主体（会加框），再点「确认合并」。",
      long: [
        "单击条目＝要不要合并（灰掉划掉的就不合）；双击条目＝把它设为主体（会加框）。",
        "「自动合并」把名字相同、高度相似（含「别名」里写过的写法），以及疑似错别字（同音字 / 形近字 / 相邻两字颠倒，例如「圣光教团」↔「圣光教団」）的条目列成一组；只是名字里共用了几个字的不算。",
        "「词条名」下拉框＝合并后用哪个名字：默认主体的名字（排第一，标着「（主体）」），后面是这一组里出现过的其它写法（同名只列一次），末尾「自定义…」可以自己输入。",
        "合并会把字段、概述、关联人物、关联事件一并汇总，其余名字记进「别名」；「势力」条目合并后还会同步人物的「所属势力」。",
        "合错了点左上角「撤销」或按 Ctrl+Z 可以退回。",
      ].join("\n"),
    },
    势力: {
      short: "以下条目疑似「势力 / 组织」而不是个体角色。勾选后会转成势力设定。",
      long: [
        "这些条目被判断成「势力 / 组织」，不是某个具体角色。",
        "勾选后会转成「势力」类别下的设定条目，身份、背景等资料一起带过去；作为人物留下的事件登场与关系关联会移除。",
        "取消勾选的不动；做错了点左上角「撤销」或按 Ctrl+Z 可以退回。",
      ].join("\n"),
    },
    人物: {
      short: "以下人物被判断为同一人。单击词条＝要不要合并，双击词条＝选它当主体（会加框），再点「确认合并」。",
      long: [
        "单击词条＝要不要合并（灰掉划掉的就不合）；双击词条＝把它设为主体（会加框）。",
        "「自动合并」会把名字相同、有简称 / 别名关系、假身份 / 双重身份、亲属称谓的同义写法（「XX 的妈妈」＝「XX 的母亲」）、繁简 / 异体字写法（「静流」＝「靜流」「教団」＝「教團」），以及疑似错别字（同音字、形近字、相邻两字写颠倒）的人物列成一组。只是姓氏相同、同一家族名字相似的不算。",
        "「词条名」下拉框＝合并后用哪个名字：默认主体的名字（排第一，标着「（主体）」），后面是这一组里出现过的其它写法（同名只列一次），末尾「自定义…」可以自己输入。",
        "合并后：其余写法记进「别名」，事件与设定里的关联一并转移；字段顺序＝主体的外貌 / 性格 / 背景 / 目标 / 备注等排在最前，被合并进来的接在后面（不会丢）。",
        "合错了点左上角「撤销」或按 Ctrl+Z 可以退回。",
      ].join("\n"),
    },
  };
  let pendingMergeKind = "人物";
  let mergeUndoSnapshot = null;
  let batchMode = false;
  let batchSelected = new Set();
  // 多选时「有选中成员的链」：给这些链上的所有卡片挂回形针（含没选中的同链卡片）
  const batchChainMark = new Set();
  let lastFilteredCharIds = [];
  let evaxisValues = []; // 事件轴“画出来的”每一行对应的 storyIndex（只用于位置/拖拽，不是 #；# 见 axisRows()）
  const ROW_LABEL_W = 23; // 左侧行标列的宽度
  const LANE_PLUS_W = 40; // 事件轴横轴最右边「＋ 新建线路」那一列的宽度
  const LANE_W_MIN = 112; // 单条线路可以拖到的最窄宽度
  const LANE_W_MAX = 675; // 单条线路可以拖到的最宽宽度
  let laneWidths = {}; // 按线路 id 记住手动拖过的列宽（没记过的用自动算出来的）
  const LANE_MIN_W = 158; // 事件轴每条线路的最小列宽
  const LANE_MAX_W = 255; // 最大列宽（线路很少时别把卡片拉得太长）
  let lastLaneWidth = 0; // 上一次用的列宽，用来判断窗口缩放后是否需要重画
  let dragState = null;
  let statsSort = { key: "score", dir: "desc" };
  let statsSelectedCharId = null;
  let statsHiddenGroups = new Set(); // 出场统计顶部过滤条里没勾的组
  let statsQuery = ""; // 出场统计顶部的搜索框
  let relSelectedCharId = null;
  let relFocusIds = new Set(); // 关系网里被「着重展示」的人物（1 个或一条边的两端）
  let relLabelsVisible = true; // 关系网是否显示连线上的关系文字（默认显示）
  let relCheckedIds = null;
  let relCheckedSeeded = false; // 左侧人物勾选是否已经按默认规则初始化过
  let relSeenIds = new Set(); // 已经按默认规则处理过的人物（之后用户手动取消勾选就不会再被自动勾上）
  // 关系网里显示哪几类关系（亲属 / 师徒 / …）：可多选，空集合＝全部
  let relKindFilters = new Set();
  let matrixBandDragStamp = 0; // 二维事件图章/节带刚拖完的时间戳：拖完紧接着的那一下 click 不折叠
  let entryDragging = false;
  let entryDragId = null; // 正在拖动的设定条目 id（dragover 阶段读不到 dataTransfer，用它代替）
  let entryDragIds = null; // 批量拖动时：这次一起带走的所有条目 id
  let entryBatchMode = false;
  let entryBatchSel = new Set();
  let relLayout = null;
  let relUndoSnapshot = null;
  let mergeSelectMode = false;
  let cardClipboard = null; // Ctrl+C 记住的卡片：{ type:"char"|"entry"|"event", ids:[] }
  let mergeSelected = new Set();
  let selectPurpose = "select";
  let pendingEventPlace = null; // 右键空白位置 → 新建事件时带上的位置（故事时间点 + 线路）
  let eventPlaceDraft = null; // 事件弹窗打开期间记住的位置
  let collapsedEventCards = new Set(); // 事件轴上被手动折叠的卡片；默认是展开的
  let expandedEventSets = new Set(); // 双击事件集后展开的集合（键：setId::lineId）
  let expandedSetMembers = new Set(); // 展开事件集后，被用户手动展开的事件卡
  let dragGroupIds = null;
  let dragSetId = null; // 正在拖动整个事件集卡片
  let dragAutoScrollRaf = 0;
  let dragAutoScrollPoint = null;
  const charPoolSel = new Map();
  let poolCollapsed = null;
  let eventFilter = { keyword: "", charId: "", lineId: "", chapterId: "", narrative: "" };
  let evtClickTimer = null; // 事件标题的单击（打开弹窗）与双击（快捷改名）区分
  // 内置关系类型：「朋友」＝私交亲密；「同事」＝立场一致、不敌对、有合作，但私交未必密切。
  // 「恋爱」不分性别（男男 / 女女 / 男女都算）。
  const REL_KINDS = {
    亲属: "#7cc98b",
    师徒: "#7fb3d5",
    敌对: "#e07a7a",
    恋爱: "#d86c8a",
    朋友: "#8fd8c0",
    同事: "#49bfb1",
    // 「链接」＝同一个人不同时期 / 另一个身份：由「人物链」自动维护，一条链里的人彼此都有一条
    链接: "#6f7fb8",
    其他: "#a79ec0",
  };

  let charColor = CHAR_COLORS[0];
  let portraitDraft = ""; // 人物弹窗里正在编辑的人设图（dataURL）
  let lineColor = LINE_COLORS[0];
  let lineInsertAfterId = ""; // 新建线路时插到哪条线路右边（事件轴线路卡右键「新建线路」）
  let catColor = CAT_COLORS[0];

