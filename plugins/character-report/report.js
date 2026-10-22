const LABELS = {
  "zh-CN": {
    characterBook: "人物档案",
    generated: "生成于",
    characters: "人物",
    withEvidence: "有文本分析依据",
    basic: "基本信息",
    importanceMain: "主要",
    importanceSupporting: "次要",
    importanceExtra: "龙套",
    importanceUnknown: "未标注",
    relations: "人物关系",
    trajectory: "人物小传",
    bioStart: "故事从「{title}」开始。",
    bioThen: "后来，",
    bioFinally: "到最后，",
    bioPhaseStart: "故事前期，",
    bioPhaseMid: "随着经历推进，",
    bioPhaseLate: "到了后期，",
    bioSummary: "总体来看，",
    bioFlow: "人生轨迹：",
    radar: "雷达评分",
    radarEvidence: "雷达评分依据",
    radarSupportLink: "此外，",
    radarSupportQuote: "文中还写到",
    radarConclusionHigh: "这些表现跨越多段情节且方向一致，因此{axis}最终评为{score}分（{level}）。",
    radarConclusionHighLimited: "现有依据集中指向这一方向，因此{axis}最终评为{score}分（{level}）。",
    radarConclusionLow: "相关表现集中而明确，足以支撑{axis}这一维度评为{level}，因此给{score}分。",
    radarConclusionMid: "正反两面的表现并存，权衡后{axis}定为{score}分（{level}）。",
    radarNoFinal: "综合以上依据，这一维度暂不给出最终分数。",
    levelVeryLow: "很低",
    levelLow: "偏低",
    levelMid: "中等",
    levelHigh: "较高",
    levelVeryHigh: "很高",
    analysis: "分析摘要",
    analysisSummary: "人物概述",
    noEvidence: "暂无文本分析依据",
    noEvents: "暂无登场事件",
    noRelations: "暂无人物关系",
    field: "字段",
    value: "内容",
    source: "来源",
    manual: "手动",
    task: "任务",
    score: "分数",
    axis: "维度",
    quote: "原文引文",
    reason: "理由",
    events: "登场事件",
    chapter: "章",
    section: "节",
    time: "时间",
    place: "地点",
    cause: "起因",
    process: "经过",
    result: "结果",
    notes: "备注",
    aliases: "别名",
    group: "分组",
    factions: "所属势力",
    tags: "标签",
    gender: "性别",
    age: "年龄",
    role: "身份 / 职业",
    appearance: "外貌",
    personality: "性格",
    background: "背景",
    goal: "目标 / 动机",
    relationships: "人际关系",
    custom: "自定义",
    eventNo: "#",
    evidenceCount: "条依据",
  },
  en: {
    characterBook: "Character Book",
    generated: "Generated",
    characters: "Characters",
    withEvidence: "with text-analysis evidence",
    basic: "Profile",
    importanceMain: "Main",
    importanceSupporting: "Supporting",
    importanceExtra: "Extra",
    importanceUnknown: "Unranked",
    relations: "Relations",
    trajectory: "Character biography",
    bioStart: "The story begins with “{title}”. ",
    bioThen: "Later, ",
    bioFinally: "By the end, ",
    bioPhaseStart: "In the early part of the story, ",
    bioPhaseMid: "As the story develops, ",
    bioPhaseLate: "By the later stages, ",
    bioSummary: "Overall, ",
    bioFlow: "Story arc: ",
    radar: "Radar scores",
    radarEvidence: "Radar evidence",
    radarSupportLink: "In addition, ",
    radarSupportQuote: "the text also notes ",
    radarConclusionHigh: "These patterns recur across multiple parts of the story and point in the same direction, so {axis} is rated {score} ({level}).",
    radarConclusionHighLimited: "The available evidence points consistently in this direction, so {axis} is rated {score} ({level}).",
    radarConclusionLow: "The relevant evidence is concentrated and specific enough to support a {level} rating for {axis}, so it is scored {score}.",
    radarConclusionMid: "Both positive and negative evidence are present; after weighing them, {axis} is rated {score} ({level}).",
    radarNoFinal: "No final score is assigned for this axis.",
    levelVeryLow: "very low",
    levelLow: "low",
    levelMid: "moderate",
    levelHigh: "high",
    levelVeryHigh: "very high",
    analysis: "Analysis summary",
    analysisSummary: "Overview",
    noEvidence: "No text-analysis evidence found",
    noEvents: "No events yet",
    noRelations: "No relations",
    field: "Field",
    value: "Value",
    source: "Source",
    manual: "Manual",
    task: "Task",
    score: "Score",
    axis: "Axis",
    quote: "Quote",
    reason: "Reason",
    events: "Events",
    chapter: "Chapter",
    section: "Section",
    time: "Time",
    place: "Place",
    cause: "Cause",
    process: "Process",
    result: "Result",
    notes: "Notes",
    aliases: "Aliases",
    group: "Group",
    factions: "Factions",
    tags: "Tags",
    gender: "Gender",
    age: "Age",
    role: "Role",
    appearance: "Appearance",
    personality: "Personality",
    background: "Background",
    goal: "Goal / motivation",
    relationships: "Relationships",
    custom: "Custom",
    eventNo: "#",
    evidenceCount: "evidence",
  },
  "zh-TW": {
    characterBook: "人物檔案",
    generated: "生成於",
    characters: "人物",
    withEvidence: "有文字分析依據",
    basic: "基本資訊",
    importanceMain: "主要",
    importanceSupporting: "次要",
    importanceExtra: "龍套",
    importanceUnknown: "未標註",
    relations: "人物關係",
    trajectory: "人物小傳",
    bioStart: "故事從「{title}」開始。",
    bioThen: "後來，",
    bioFinally: "到最後，",
    bioPhaseStart: "故事前期，",
    bioPhaseMid: "隨著經歷推進，",
    bioPhaseLate: "到了後期，",
    bioSummary: "總體來看，",
    bioFlow: "人生軌跡：",
    radar: "雷達評分",
    radarEvidence: "雷達評分依據",
    radarSupportLink: "此外，",
    radarSupportQuote: "文中還寫到",
    radarConclusionHigh: "這些表現跨越多段情節且方向一致，因此{axis}最終評為{score}分（{level}）。",
    radarConclusionHighLimited: "現有依據集中指向這一方向，因此{axis}最終評為{score}分（{level}）。",
    radarConclusionLow: "相關表現集中而明確，足以支撐{axis}這一維度評為{level}，因此給{score}分。",
    radarConclusionMid: "正反兩面的表現並存，權衡後{axis}定為{score}分（{level}）。",
    radarNoFinal: "綜合以上依據，這一維度暫不給出最終分數。",
    levelVeryLow: "很低",
    levelLow: "偏低",
    levelMid: "中等",
    levelHigh: "較高",
    levelVeryHigh: "很高",
    analysis: "分析摘要",
    analysisSummary: "人物概述",
    noEvidence: "暫無文字分析依據",
    noEvents: "暫無登場事件",
    noRelations: "暫無人物關係",
    field: "欄位",
    value: "內容",
    source: "來源",
    manual: "手動",
    task: "任務",
    score: "分數",
    axis: "維度",
    quote: "原文引文",
    reason: "理由",
    events: "登場事件",
    chapter: "章",
    section: "節",
    time: "時間",
    place: "地點",
    cause: "起因",
    process: "經過",
    result: "結果",
    notes: "備註",
    aliases: "別名",
    group: "分組",
    factions: "所屬勢力",
    tags: "標籤",
    gender: "性別",
    age: "年齡",
    role: "身分 / 職業",
    appearance: "外貌",
    personality: "性格",
    background: "背景",
    goal: "目標 / 動機",
    relationships: "人際關係",
    custom: "自訂",
    eventNo: "#",
    evidenceCount: "條依據",
  },
  ja: {
    characterBook: "人物ファイル",
    generated: "生成日",
    characters: "人物",
    withEvidence: "テキスト解析の根拠あり",
    basic: "基本情報",
    importanceMain: "主要",
    importanceSupporting: "準主要",
    importanceExtra: "モブ",
    importanceUnknown: "未設定",
    relations: "人物関係",
    trajectory: "人物小伝",
    bioStart: "物語は「{title}」から始まります。",
    bioThen: "その後、",
    bioFinally: "終盤には、",
    bioPhaseStart: "物語の前半では、",
    bioPhaseMid: "物語が進むにつれて、",
    bioPhaseLate: "後半には、",
    bioSummary: "全体として、",
    bioFlow: "歩み：",
    radar: "レーダースコア",
    radarEvidence: "レーダーの根拠",
    radarSupportLink: "さらに、",
    radarSupportQuote: "本文では",
    radarConclusionHigh: "これらの表現は複数の場面で一貫して現れるため、{axis}は{score}（{level}）と評価しました。",
    radarConclusionHighLimited: "提示された根拠は一貫して同じ方向を指すため、{axis}は{score}（{level}）と評価しました。",
    radarConclusionLow: "関連する表現は具体的で、{axis}を{level}と評価する根拠になります。そのため{score}としました。",
    radarConclusionMid: "肯定と否定の両方の表現があるため、両者を比べたうえで{axis}は{score}（{level}）と評価しました。",
    radarNoFinal: "以上の根拠から、この項目の最終スコアはまだ決めていません。",
    levelVeryLow: "とても低い",
    levelLow: "低い",
    levelMid: "中程度",
    levelHigh: "高い",
    levelVeryHigh: "とても高い",
    analysis: "解析概要",
    analysisSummary: "人物概況",
    noEvidence: "テキスト解析の根拠はありません",
    noEvents: "登場イベントはありません",
    noRelations: "人物関係はありません",
    field: "項目",
    value: "内容",
    source: "出典",
    manual: "手動",
    task: "タスク",
    score: "スコア",
    axis: "軸",
    quote: "原文引用",
    reason: "理由",
    events: "登場イベント",
    chapter: "章",
    section: "節",
    time: "時間",
    place: "場所",
    cause: "原因",
    process: "経過",
    result: "結果",
    notes: "メモ",
    aliases: "別名",
    group: "グループ",
    factions: "所属勢力",
    tags: "タグ",
    gender: "性別",
    age: "年齢",
    role: "身分 / 職業",
    appearance: "外見",
    personality: "性格",
    background: "背景",
    goal: "目標 / 動機",
    relationships: "人間関係",
    custom: "カスタム",
    eventNo: "#",
    evidenceCount: "件の根拠",
  },
};

function labelsFor(lang) {
  return LABELS[lang] || LABELS["zh-CN"];
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlText(value) {
  return esc(value).replace(/\r?\n/g, "<br>");
}

function text(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function unique(list) {
  const out = [];
  (list || []).forEach((value) => {
    const s = text(value);
    if (s && out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

function localDateText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

const GENERIC_ALIAS_RE = /^(?:无|未知|没有|暂无|none|null|n\/a|—|-|无明确别名.*|不列为.*|不是别名.*|非别名.*)$/i;

function nameTokens(value) {
  const raw = text(value);
  if (!raw || /无明确别名|不列为|不是别名|非别名/.test(raw)) return [];
  return raw
    .split(/[、,，/／;；|｜]+/)
    .map((part) => part.trim().replace(/^[「『“"']+|[」』”"']+$/g, ""))
    .filter((part) => part && !GENERIC_ALIAS_RE.test(part));
}

function characterNameTokens(char) {
  const out = [];
  const add = (value) => {
    const s = text(value);
    if (s && out.indexOf(s) < 0) out.push(s);
  };
  add(char && char.name);
  (char && char.aliases ? char.aliases : []).forEach((alias) => nameTokens(alias).forEach(add));
  ((char && char.fields) || []).forEach((field) => {
    if (!/别名|别称|曾用名|昵称|同一人物/.test(text(field && field.label))) return;
    nameTokens(field && field.value).forEach(add);
  });
  return out;
}

function analysisNameTokens(record) {
  const out = [];
  const add = (value) => {
    const s = text(value);
    if (s && out.indexOf(s) < 0) out.push(s);
  };
  add(record && record.name);
  ((record && record.fields) || []).forEach((field) => {
    if (!/别名|别称|曾用名|昵称|同一人物/.test(text(field && field.label))) return;
    nameTokens(field && field.value).forEach(add);
  });
  return out;
}

function namesLikelySame(a, b) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const short = left.length <= right.length ? left : right;
  const long = left.length <= right.length ? right : left;
  return short.length >= 2 && (long.startsWith(short + "·") || long.startsWith(short + "・"));
}

function mergeTextValue(a, b) {
  const left = text(a);
  const right = text(b);
  if (!left) return right;
  if (!right || left === right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return left + "；" + right;
}

function mergeCharacterCards(characters, events) {
  const cards = (characters || []).filter(Boolean);
  const parent = cards.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const byName = new Map();
  cards.forEach((card, index) => {
    const key = norm(card.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(index);
  });
  cards.forEach((card, index) => {
    const tokens = characterNameTokens(card);
    tokens.forEach((token) => {
      (byName.get(norm(token)) || []).forEach((other) => union(index, other));
    });
  });

  const groups = new Map();
  cards.forEach((card, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(card);
  });

  const eventCount = (card) =>
    (events || []).filter((event) => (event.characterIds || []).includes(card.id)).length;
  const score = (card) =>
    eventCount(card) * 3 +
    ((card.fields || []).length || 0) +
    Object.keys(card.radar || {}).length +
    (text(card.name).length >= 4 ? 2 : 0);

  return Array.from(groups.values()).map((group) => {
    const primary = group.slice().sort((a, b) => score(b) - score(a))[0];
    const merged = Object.assign({}, primary);
    merged.ids = unique(group.map((card) => card.id));
    merged.aliases = unique(
      group
        .flatMap((card) => [card.name].concat(card.aliases || []))
        .filter((name) => norm(name) !== norm(primary.name))
    );
    merged.factionIds = unique(group.flatMap((card) => card.factionIds || []));
    merged.tags = unique(group.flatMap((card) => card.tags || []));
    [
      "gender",
      "age",
      "role",
      "appearance",
      "personality",
      "background",
      "goal",
      "relationships",
      "notes",
    ].forEach((key) => {
      group.forEach((card) => {
        merged[key] = mergeTextValue(merged[key], card[key]);
      });
    });
    const fields = [];
    group.forEach((card) => {
      (card.fields || []).forEach((field) => {
        const label = text(field && field.label);
        const value = text(field && field.value);
        if (!label || !value) return;
        const hit = fields.find((item) => norm(item.label) === norm(label));
        if (hit) hit.value = mergeTextValue(hit.value, value);
        else fields.push({ label, value });
      });
    });
    merged.fields = fields;
    merged.radar = Object.assign({}, primary.radar || {});
    group.forEach((card) => {
      Object.keys(card.radar || {}).forEach((key) => {
        if (merged.radar[key] == null || merged.radar[key] === "") merged.radar[key] = card.radar[key];
      });
    });
    merged.__nameTokens = characterNameTokens(merged);
    return merged;
  });
}

const FIELD_ALIASES = {
  name: ["姓名", "名字", "name", "名前"],
  gender: ["性别", "性別", "gender"],
  age: ["年龄", "年齡", "age"],
  role: ["身份", "职业", "身份/职业", "身分", "職業", "role", "役割"],
  appearance: ["外貌", "形象", "appearance", "外見"],
  personality: ["性格", "personality"],
  background: ["背景", "背景经历", "背景經歷", "经历", "經歷", "background", "背景設定"],
  goal: ["目标", "目標", "动机", "動機", "goal", "motivation", "目的"],
  relationships: ["人际关系", "人際關係", "关系", "關係", "relationships", "人間関係"],
  aliases: ["别名", "別名", "别称", "別稱", "昵称", "暱稱", "又名", "曾用名", "绰号", "綽號"],
  group: ["分组", "分組", "group", "グループ"],
  factions: ["所属势力", "所屬勢力", "势力", "勢力", "factions", "所属勢力"],
  tags: ["标签", "標籤", "tags", "タグ"],
  notes: ["备注", "備註", "notes", "メモ"],
};

function labelKey(value) {
  return text(value).toLowerCase().replace(/[\s/／·・|｜\-—]+/g, "");
}

function fieldKeyForLabel(label) {
  const key = labelKey(label);
  if (!key) return "";
  const names = Object.keys(FIELD_ALIASES);
  for (let i = 0; i < names.length; i += 1) {
    if (FIELD_ALIASES[names[i]].some((name) => labelKey(name) === key)) return names[i];
  }
  return "";
}

function mergeFieldRows(rows, analysisFields) {
  const merged = (rows || []).map((row) => Object.assign({}, row));
  (analysisFields || []).forEach((field) => {
    const label = text(field && field.label);
    const value = text(field && field.value);
    if (!label || !value) return;
    const key = fieldKeyForLabel(label);
    if (key === "name") return;
    const row = merged.find(
      (item) => (key && item.key === key) || labelKey(item.label) === labelKey(label)
    );
    if (row) {
      if (!text(row.value)) row.value = value;
      return;
    }
    merged.push({ key: key || "analysis:" + label, label, value });
  });
  return merged;
}

function analysisFieldsOf(analysis) {
  const out = [];
  (analysis || []).forEach(({ records }) => {
    (records || []).forEach((record) => {
      (record.fields || []).forEach((field) => {
        const label = text(field && field.label);
        const value = text(field && field.value);
        if (!label || !value || fieldKeyForLabel(label) === "name") return;
        if (!out.some((item) => labelKey(item.label) === labelKey(label) && norm(item.value) === norm(value))) {
          out.push({ label, value });
        }
      });
    });
  });
  return out;
}

function analysisSummaryOf(analysis, lang) {
  const sentences = [];
  (analysis || []).forEach(({ records }) => {
    (records || []).forEach((record) => {
      const raw = text(record.summary);
      if (!raw) return;
      raw.split(/(?<=[。！？!?.])\s*/).forEach((part) => {
        const sentence = text(part);
        if (sentence && sentences.indexOf(sentence) < 0) sentences.push(sentence);
      });
    });
  });
  return sentences.slice(0, 3).join(lang === "en" ? " " : "");
}

function rawImportanceOf(char, analysis) {
  const fromCard = ((char && char.fields) || []).find((field) =>
    /重要度|重要程度/.test(text(field && field.label))
  );
  if (fromCard && text(fromCard.value)) return text(fromCard.value);
  for (const group of analysis || []) {
    for (const record of group.records || []) {
      const field = (record.fields || []).find((item) =>
        /重要度|重要程度/.test(text(item && item.label))
      );
      if (field && text(field.value)) return text(field.value);
    }
  }
  return "";
}

function importanceInfo(raw, eventCount, labels) {
  const value = text(raw).toLowerCase();
  if (/主要|主角|重要/.test(value) && !/不重要/.test(value)) {
    return { rank: 0, label: labels.importanceMain, value: text(raw) };
  }
  if (/次要|配角|support|準主要|准主要/.test(value)) {
    return { rank: 1, label: labels.importanceSupporting, value: text(raw) };
  }
  if (/龙套|路人|extra|モブ|mob/.test(value)) {
    return { rank: 2, label: labels.importanceExtra, value: text(raw) };
  }
  return {
    rank: eventCount > 0 ? 3 : 4,
    label: labels.importanceUnknown,
    value: text(raw),
  };
}

function projectOf(input) {
  if (!input || typeof input !== "object") return null;
  if (input.data && Array.isArray(input.data.characters)) {
    return { title: String(input.title || "Novel"), data: input.data };
  }
  if (input.data && input.data.data && Array.isArray(input.data.data.characters)) {
    return { title: String(input.title || input.data.title || "Novel"), data: input.data.data };
  }
  if (Array.isArray(input.characters)) return { title: String(input.title || "Novel"), data: input };
  return null;
}

function radarEvidenceList(record) {
  const out = [];
  if (record && Array.isArray(record.radarEvidence)) {
    record.radarEvidence.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (!item.radar && !item.radarWhy) return;
      out.push({
        radar: item.radar || {},
        radarWhy: item.radarWhy || {},
      });
    });
  }
  if (!out.length && record && (record.radar || record.radarWhy)) {
    out.push({
      radar: record.radar || {},
      radarWhy: record.radarWhy || {},
    });
  }
  return out;
}

function radarLevelLabel(value, labels) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "";
  if (score <= 2.5) return labels.levelVeryLow;
  if (score <= 4.5) return labels.levelLow;
  if (score <= 5.5) return labels.levelMid;
  if (score <= 7.5) return labels.levelHigh;
  return labels.levelVeryHigh;
}

function reasonOverlaps(a, b) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function collectReport(input, lang) {
  const project = projectOf(input);
  if (!project) throw new Error("Input is not a fiction-gui export.");
  const data = project.data;
  const labels = labelsFor(lang);
  const chapters = new Map((data.chapters || []).map((chapter) => [chapter.id, chapter]));
  const sections = new Map();
  (data.chapters || []).forEach((chapter) => {
    (chapter.sections || []).forEach((section) => sections.set(section.id, { chapter, section }));
  });
  const groups = new Map((data.groups || []).map((group) => [group.id, group]));
  const entries = new Map((((data.settings || {}).entries) || []).map((entry) => [entry.id, entry]));
  const lines = new Map((data.lines || []).map((line) => [line.id, line]));
  const eventSets = new Map((data.eventSets || []).map((set) => [set.id, set]));
  const narration = new Map((data.order || []).map((id, index) => [id, index]));
  const events = (data.events || [])
    .slice()
    .sort((a, b) => (Number(a.storyIndex) || 0) - (Number(b.storyIndex) || 0) || (narration.get(a.id) ?? 0) - (narration.get(b.id) ?? 0));
  const characters = mergeCharacterCards(data.characters || [], events);
  const tasks = ((data.analysis || {}).tasks) || [];
  let radarAxes = (((data.radar || {}).axes) || []).filter((axis) => text(axis && axis.label));
  if (!radarAxes.length) {
    const keys = [];
    const addKey = (key) => {
      const value = text(key);
      if (value && keys.indexOf(value) < 0) keys.push(value);
    };
    (data.characters || []).forEach((char) => Object.keys(char.radar || {}).forEach(addKey));
    ((data.analysis || {}).tasks || []).forEach((task) => {
      (task.results || []).forEach((result) => {
        Object.keys(result.radar || {}).forEach(addKey);
        Object.keys(result.radarWhy || {}).forEach(addKey);
        (result.radarEvidence || []).forEach((item) => {
          Object.keys(item.radar || {}).forEach(addKey);
          Object.keys(item.radarWhy || {}).forEach(addKey);
        });
      });
    });
    radarAxes = keys.map((key) => ({ key, label: key }));
  }
  const axisOrder = [];
  radarAxes.forEach((axis) => {
    if (axis.label && axisOrder.indexOf(axis.label) < 0) axisOrder.push(axis.label);
    if (axis.key && axisOrder.indexOf(axis.key) < 0) axisOrder.push(axis.key);
  });

  function groupName(char) {
    const group = char && char.groupId ? groups.get(char.groupId) : null;
    return text(group && group.name) || "";
  }

  function factionNames(char) {
    return unique((char.factionIds || []).map((id) => entries.get(id)).filter(Boolean).map((entry) => entry.name));
  }

  function relationRows(char) {
    const ids = new Set(char.ids || [char.id]);
    return (data.relations || [])
      .filter((rel) => rel && (ids.has(rel.fromId) || ids.has(rel.toId)))
      .map((rel) => {
        const otherId = ids.has(rel.fromId) ? rel.toId : rel.fromId;
        const other = characters.find((item) => (item.ids || [item.id]).includes(otherId));
        if (!other) return null;
        return { name: other.name, kind: text(rel.kind), note: text(rel.note) };
      })
      .filter(Boolean);
  }

  function analysisFor(char) {
    const keys = (char.__nameTokens || characterNameTokens(char)).slice();
    const out = [];
    tasks.forEach((task) => {
      const records = ((task.results || []) || []).filter(
        (record) => {
          if (!record || record.type !== "character") return false;
          const recordKeys = analysisNameTokens(record);
          return recordKeys.some((recordKey) =>
            keys.some((charKey) => namesLikelySame(recordKey, charKey))
          );
        }
      );
      if (records.length) out.push({ task, records });
    });
    return out;
  }

  function fieldRows(char) {
    const rows = [];
    const add = (key, label, value) => {
      const v = text(value);
      if (v) rows.push({ key, label, value: v });
    };
    add("gender", labels.gender, char.gender);
    add("age", labels.age, char.age);
    add("role", labels.role, char.role);
    add("appearance", labels.appearance, char.appearance);
    add("personality", labels.personality, char.personality);
    add("background", labels.background, char.background);
    add("goal", labels.goal, char.goal);
    add("relationships", labels.relationships, char.relationships);
    add("aliases", labels.aliases, (char.aliases || []).join("、"));
    add("group", labels.group, groupName(char));
    add("factions", labels.factions, factionNames(char).join("、"));
    add("tags", labels.tags, (char.tags || []).join("、"));
    (char.fields || []).forEach((field) => {
      if (field && text(field.label) && text(field.value)) {
        rows.push({
          key: "custom:" + field.label,
          label: text(field.label),
          value: text(field.value),
        });
      }
    });
    add("notes", labels.notes, char.notes);
    return rows;
  }

  function radarRows(char, analysis) {
    if (!radarAxes.length) return [];
    return radarAxes.map((axis) => {
      const keys = [axis.label, axis.key].filter(Boolean);
      const value =
        keys
          .map((key) => char.radar && char.radar[key])
          .find((item) => item != null && item !== "") ?? null;
      const primary = [];
      const support = [];
      analysis.forEach(({ records }) => {
        records.forEach((record) => {
          const finalKey = keys.find((key) => text(record.radarWhy && record.radarWhy[key]));
          const finalReason = text(finalKey ? record.radarWhy[finalKey] : "");
          if (finalReason && !primary.some((item) => reasonOverlaps(item, finalReason))) {
            primary.push(finalReason);
          }
          radarEvidenceList(record).forEach((item) => {
            const whyKey = keys.find((key) => text((item.radarWhy || {})[key]));
            const reason = text(whyKey ? item.radarWhy[whyKey] : "");
            if (!reason) return;
            if (primary.some((textValue) => reasonOverlaps(textValue, reason))) return;
            if (support.some((textValue) => reasonOverlaps(textValue, reason))) return;
            support.push(reason);
          });
        });
      });
      return {
        key: axis.key,
        label: text(axis.label) || text(axis.key),
        value,
        primary: primary.join(" "),
        support: support.slice(0, 4),
        evidenceTotal: primary.length + support.length,
      };
    });
  }

  function trajectory(char) {
    const rows = [];
    const ids = new Set(char.ids || [char.id]);
    events.forEach((event) => {
      if (!(event.characterIds || []).some((id) => ids.has(id))) return;
      const chapter = event.chapterId ? chapters.get(event.chapterId) : null;
      const section = event.sectionId ? sections.get(event.sectionId) : null;
      const row = Number(event.storyIndex) || 0;
      const lineNames = (event.lineIds || []).map((id) => lines.get(id)).filter(Boolean).map((line) => line.code || line.name);
      const setId = event.eventSetAssign && Object.values(event.eventSetAssign)[0];
      const set = setId ? eventSets.get(setId) : null;
      rows.push({
        no: row + 1,
        title: event.title || "—",
        chapter: chapter && chapter.title,
        section: section && section.section && section.section.title,
        lines: lineNames,
        eventSet: set && set.name,
        time: event.time,
        place: event.place,
        cause: event.cause,
        process: event.process,
        result: event.result,
        notes: event.notes,
        narrative: event.narrative,
      });
    });
    return rows;
  }

  const records = characters.map((char) => {
    const analysis = analysisFor(char);
    const analysisFields = analysisFieldsOf(analysis);
    const trajectoryRows = trajectory(char);
    const importance = importanceInfo(rawImportanceOf(char, analysis), trajectoryRows.length, labels);
    return {
      name: char.name || "—",
      aliases: (char.aliases || []).filter(Boolean),
      group: groupName(char),
      factions: factionNames(char),
      tags: (char.tags || []).filter(Boolean),
      importance: importance.value,
      importanceLabel: importance.label,
      importanceRank: importance.rank,
      eventCount: trajectoryRows.length,
      ids: char.ids || [char.id],
      fields: fieldRows(char),
      analysisFields,
      analysisSummary: analysisSummaryOf(analysis, lang),
      relations: relationRows(char),
      trajectory: trajectoryRows,
      radar: radarRows(char, analysis),
      analysis,
    };
  });
  records.sort(
    (a, b) =>
      a.importanceRank - b.importanceRank ||
      b.eventCount - a.eventCount ||
      String(a.name).localeCompare(String(b.name), lang === "ja" ? "ja" : "zh")
  );

  return {
    title: project.title,
    lang,
    labels,
    records,
    date: localDateText(),
    withEvidence: records.filter((record) => record.analysis.length > 0).length,
  };
}

function finishSentence(value, lang) {
  const s = text(value);
  if (!s) return "";
  return /[。！？!?…]$/.test(s) ? s : s + (lang === "en" ? "." : "。");
}

function clipNarrative(value, max) {
  const s = text(value);
  if (!s) return "";
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max).join("").replace(/[，,；;：:\s]+$/, "") + "…";
}

function labelWidthEm(value) {
  let width = 0;
  Array.from(text(value)).forEach((char) => {
    const code = char.codePointAt(0);
    if (/\s/.test(char)) width += 0.34;
    else if (code >= 0x2e80) width += 1;
    else if (/[A-Z]/.test(char)) width += 0.68;
    else width += 0.56;
  });
  return width;
}

function firstColumnWidthEm(labels) {
  let max = 0;
  (labels || []).forEach((label) => {
    max = Math.max(max, labelWidthEm(label));
  });
  return Math.min(18, Math.max(4.2, max + 1.6));
}

function summarizeEvent(event, lang) {
  const result = text(event.result);
  const process = text(event.process);
  const cause = text(event.cause);
  let chosen = "";
  if (result && !/^[（(]/.test(result)) chosen = result;
  else if (process) chosen = process;
  else if (result) chosen = result.replace(/^[（(]/, "").replace(/[）)]$/, "");
  else if (cause) chosen = cause;
  if (!chosen) return "";
  return finishSentence(clipNarrative(chosen, 105), lang);
}

function samplePhase(events, max) {
  if (events.length <= max) return events;
  const out = [];
  for (let i = 0; i < max; i += 1) {
    const event = events[Math.round((i * (events.length - 1)) / (max - 1))];
    if (event && out.indexOf(event) < 0) out.push(event);
  }
  return out;
}

function bioFor(record, labels, lang, analysisSummary) {
  if (!record.trajectory.length) return `<p class="muted">${esc(labels.noEvents)}</p>`;
  const total = record.trajectory.length;
  const phaseCount = Math.min(3, Math.max(1, Math.ceil(total / 3)));
  const phaseSize = Math.ceil(total / phaseCount);
  const phaseLabels =
    phaseCount === 1
      ? [labels.bioPhaseStart]
      : phaseCount === 2
      ? [labels.bioPhaseStart, labels.bioPhaseLate]
      : [labels.bioPhaseStart, labels.bioPhaseMid, labels.bioPhaseLate];
  const parts = [];
  const flow = [];
  if (total <= 8) {
    record.trajectory.forEach((event) => flow.push(event));
  } else {
    for (let i = 0; i < 8; i += 1) {
      const event = record.trajectory[Math.round((i * (total - 1)) / 7)];
      if (event && flow.indexOf(event) < 0) flow.push(event);
    }
  }
  const flowTitles = flow.map((event) => clipNarrative(event.title, 26)).filter(Boolean);
  if (flowTitles.length) {
    parts.push(
      `<p class="bio-flow"><span>${esc(labels.bioFlow)}</span>${htmlText(flowTitles.join(" → "))}</p>`
    );
  }
  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const start = phaseIndex * phaseSize;
    const phase = record.trajectory.slice(start, start + phaseSize);
    if (!phase.length) continue;
    const chosen = samplePhase(phase, 3);
    let body = chosen
      .map((event) => summarizeEvent(event, lang))
      .filter(Boolean)
      .join(lang === "en" ? " " : "");
    const prefix = phaseLabels[phaseIndex] || "";
    if (prefix && lang === "en" && body) body = body.charAt(0).toLowerCase() + body.slice(1);
    if (body) parts.push(`<p>${htmlText(prefix)}${htmlText(body)}</p>`);
  }
  const summary = clipNarrative(analysisSummary, 170);
  if (summary) {
    parts.push(`<p class="bio-summary">${htmlText(labels.bioSummary)}${htmlText(finishSentence(summary, lang))}</p>`);
  }
  return parts.join("");
}

function renderCharacter(record, labels, index, lang, include) {
  const mergedFields = include.analysis ? mergeFieldRows(record.fields, record.analysisFields) : record.fields;
  const analysisSummary = include.analysis ? text(record.analysisSummary) : "";
  const profileLabels = [labels.field]
    .concat(analysisSummary ? [labels.analysisSummary] : [])
    .concat(include.fields ? mergedFields.map((row) => row.label) : []);
  const profileColWidth = firstColumnWidthEm(profileLabels);
  const fieldRows = [
    analysisSummary
      ? `<tr class="summary-row"><th>${esc(labels.analysisSummary)}</th><td>${htmlText(analysisSummary)}</td></tr>`
      : "",
    ...(include.fields
      ? mergedFields.map((row) => `<tr><th>${esc(row.label)}</th><td>${htmlText(row.value)}</td></tr>`)
      : []),
  ].join("");
  const relationRows = record.relations.length
    ? record.relations
        .map(
          (rel) =>
            `<li><b>${esc(rel.name)}</b>${rel.kind ? ` · ${esc(rel.kind)}` : ""}${
              rel.note ? `<span class="muted"> — ${htmlText(rel.note)}</span>` : ""
            }</li>`
        )
        .join("")
    : `<li class="muted">${esc(labels.noRelations)}</li>`;
  const trajectoryRows = record.trajectory.length
    ? bioFor(record, labels, lang, include.analysis ? record.analysisSummary : "")
    : `<p class="muted">${esc(labels.noEvents)}</p>`;
  const radarAxes = record.radar.filter(
    (axis) => axis.value != null || axis.primary || (axis.support && axis.support.length)
  );
  const radarColWidth = firstColumnWidthEm([labels.axis].concat(radarAxes.map((axis) => axis.label)));
  const radarRows = radarAxes
    .map(
      (axis) =>
        `<tr><th>${esc(axis.label)}</th><td>${axis.value == null ? "—" : esc(axis.value)}</td></tr>`
    )
    .join("");
  const radarEvidence = radarAxes
    .filter((axis) => axis.primary || (axis.support && axis.support.length))
    .map((axis) => {
      const level = radarLevelLabel(axis.value, labels);
      const scoreText = axis.value == null ? "—" : String(axis.value);
      const support = axis.support || [];
      const main = axis.primary || support.join(" ");
      const extra = axis.primary && norm(axis.primary).length < 90 ? support.slice(0, 1) : [];
      const paragraphs = [];
      let evidence = main ? finishSentence(main, lang) : "";
      if (extra.length) {
        const rest = extra.map((reason) => finishSentence(reason, lang)).join(lang === "en" ? " " : "");
        const bridge = /^[「“"‘']/.test(rest) ? labels.radarSupportQuote : labels.radarSupportLink;
        if (evidence) {
          const stripped = evidence.replace(/[。！？!?…]\s*$/, "");
          const sep = lang === "en" ? "; " : lang === "ja" ? "。" : "；";
          evidence = finishSentence(stripped + sep + bridge + rest, lang);
        } else {
          evidence = finishSentence(bridge + rest, lang);
        }
      }
      if (evidence) paragraphs.push(`<p>${htmlText(evidence)}</p>`);
      let conclusion = labels.radarNoFinal;
      if (level) {
        const score = Number(axis.value);
        const key =
          score <= 4.5
            ? "radarConclusionLow"
            : score <= 5.5
            ? "radarConclusionMid"
            : axis.evidenceTotal >= 2 || norm(main).length >= 80
            ? "radarConclusionHigh"
            : "radarConclusionHighLimited";
        conclusion = labels[key]
          .replace("{axis}", axis.label)
          .replace("{level}", level)
          .replace("{score}", scoreText);
      }
      paragraphs.push(`<p class="radar-conclusion">${htmlText(conclusion)}</p>`);
      return `<div class="axis-block"><h4>${esc(axis.label)} <span class="muted">${esc(
        scoreText
      )}</span></h4>${paragraphs.join("")}</div>`;
    })
    .join("");
  const headingTags = [record.group, ...record.factions, ...record.tags].filter(Boolean);
  return `<section class="character" id="char-${index}">
    <h2 id="char-head-${index}">${esc(record.name)} <span class="imp-badge">${esc(
    record.importanceLabel
  )}</span></h2>
    ${headingTags.length ? `<div class="tags">${headingTags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>` : ""}
    ${
      include.fields || analysisSummary
        ? `<h3>${esc(labels.basic)}</h3>
    <table class="fields"><colgroup><col style="width:${profileColWidth}em"><col></colgroup><thead><tr><th>${esc(labels.field)}</th><th>${esc(
            labels.value
          )}</th></tr></thead><tbody>${
            fieldRows || `<tr><td colspan="2" class="muted">—</td></tr>`
          }</tbody></table>`
        : ""
    }
    ${include.relations ? `<h3>${esc(labels.relations)}</h3><ul>${relationRows}</ul>` : ""}
    ${include.trajectory ? `<h3>${esc(labels.trajectory)}</h3><div class="bio">${trajectoryRows}</div>` : ""}
    ${
      include.radar && radarRows
        ? `<h3>${esc(labels.radar)}</h3><table class="fields"><colgroup><col style="width:${radarColWidth}em"><col></colgroup><thead><tr><th>${esc(labels.axis)}</th><th>${esc(
            labels.score
          )}</th></tr></thead><tbody>${radarRows}</tbody></table>
           <h3>${esc(labels.radarEvidence)}</h3>${radarEvidence || `<p class="muted">${esc(labels.noEvidence)}</p>`}`
        : ""
    }
  </section>`;
}

function buildHtml(input, lang, opts) {
  const requested = opts && opts.include ? opts.include : {};
  const include = {
    fields: requested.fields !== false,
    relations: requested.relations !== false,
    trajectory: requested.trajectory !== false,
    radar: requested.radar !== false,
    analysis: requested.analysis !== false,
    toc: requested.toc !== false,
  };
  const report = collectReport(input, lang || "zh-CN");
  const labels = report.labels;
  const colon = report.lang === "en" ? ": " : "：";
  const toc = report.records
    .map(
      (record, index) =>
        `<li><a href="#char-head-${index + 1}"><span>${esc(record.name)}</span><span class="toc-imp">${esc(
          record.importanceLabel
        )}</span></a></li>`
    )
    .join("");
  const sections = report.records
    .map((record, index) => renderCharacter(record, labels, index + 1, report.lang, include))
    .join("");
  return `<!doctype html><html lang="${esc(report.lang)}"><head><meta charset="utf-8"><title>${esc(
    report.title
  )} · ${esc(labels.characterBook)}</title>
<style>
@page { size: A4; }
* { box-sizing: border-box; }
p { margin: 0; orphans: 2; widows: 2; }
body { margin: 0; color: #26303b; font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif; font-size: 10.2pt; line-height: 1.68; }
.cover { min-height: 245mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover h1 { margin: 0 0 9mm; font-size: 26pt; letter-spacing: .08em; color: #1f2937; }
.cover .subtitle { font-size: 15.5pt; color: #5b6472; margin-bottom: 11mm; }
.cover .meta { font-size: 9.5pt; color: #697386; line-height: 1.75; }
.toc { page-break-after: always; }
.toc h2 { text-align: center; font-size: 18pt; margin: 0 0 8mm; }
.toc ul { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 16mm; line-height: 1.7; }
.toc li { margin: 0 0 2.4mm; }
.toc a { display: flex; justify-content: space-between; gap: 3mm; color: inherit; text-decoration: none; }
.toc-imp { flex: none; color: #7b8494; font-size: 8pt; }
.character { page-break-before: always; }
.character h2 { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; font-size: 21pt; font-weight: 700; text-align: center; margin: 0 0 4mm; color: #1f2937; }
.imp-badge { display: inline-block; margin-left: 2.5mm; padding: .5mm 2mm; border: 1px solid #d8dee8; border-radius: 99px; color: #6b7280; font-size: 8pt; font-weight: 500; vertical-align: middle; }
.tags { text-align: center; margin-bottom: 6mm; }
.tags span { display: inline-block; margin: 0 1.2mm 1.2mm 0; padding: 1mm 2.3mm; border: 1px solid #d8dee8; border-radius: 99px; font-size: 8.3pt; color: #5b6472; }
h2, h3, h4 { font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; }
h3 { font-size: 13.5pt; color: #243447; border-bottom: 1.2px solid #d8dee8; padding-bottom: 1.6mm; margin: 7mm 0 3.2mm; break-after: avoid; }
h4 { font-size: 11pt; color: #243447; margin: 4mm 0 1.4mm; }
.fields { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 4mm; font-size: 9.8pt; line-height: 1.55; }
.fields thead { display: table-header-group; }
.fields tr { break-inside: avoid; }
.fields th, .fields td { border: 1px solid #e1e6ee; padding: 1.5mm 2.2mm; vertical-align: top; text-align: left; }
.fields th { white-space: normal; overflow-wrap: anywhere; background: #f4f6f9; color: #334155; font-size: 9.4pt; font-weight: 600; }
.fields td { width: auto; overflow-wrap: anywhere; }
.fields tbody tr:nth-child(even) td { background: #fbfcfd; }
.fields tr.summary-row th, .fields tr.summary-row td { background: #f7f8fb; }
.muted { color: #8a93a3; }
.bio { margin: 2mm 0 4mm; }
.bio p { margin: 0 0 3mm; text-indent: 2em; text-align: justify; line-height: 1.7; }
.bio-flow { margin: 0 0 3.5mm; padding: 2mm 3mm; border: 1px solid #e3e7ed; border-radius: 1.2mm; background: #f7f9fc; text-indent: 0 !important; color: #425066; font-size: 9.3pt; line-height: 1.65; }
.bio-flow span { margin-right: 2mm; color: #64748b; font-weight: 600; }
.bio-summary { margin-top: 3mm; padding: 2.5mm 3.5mm; border-left: 3px solid #9aa8bb; background: #f7f9fc; text-indent: 0 !important; }
.meta { color: #667085; font-size: 8.8pt; margin-bottom: 1mm; }
.axis-block { margin: 0 0 5mm; padding-top: 2.5mm; border-top: 1px solid #edf0f5; break-inside: avoid; }
.axis-block h4 { margin-top: 0; }
.axis-block p { margin: 0 0 2mm; text-align: justify; line-height: 1.68; }
.radar-conclusion { margin: 2mm 0 0; padding: 2mm 3mm; border-left: 3px solid #b8c3d3; background: #f7f9fc; color: #3f4c5f; text-indent: 0; }
</style></head><body>
<section class="cover"><h1>${esc(report.title)}</h1><div class="subtitle">${esc(labels.characterBook)}</div>
<div class="meta">${esc(labels.characters)}${colon}${report.records.length} · ${esc(labels.withEvidence)}${colon}${report.withEvidence}<br>${esc(
    labels.generated
  )}${colon}${esc(report.date)}</div></section>
${include.toc ? `<section class="toc"><h2>${esc(labels.characterBook)}</h2><ul>${toc}</ul></section>` : ""}
${sections}
</body></html>`;
}

module.exports = { buildHtml, collectReport };
