#!/usr/bin/env node
/* 分块级雷达依据（radarEvidence）自检。

   背景：综合汇总 / 雷达重判 / 反思会把结果的最终 radar / radarWhy 覆盖掉。
   如果只存最终理由，导出的 JSON 里就会出现「有分数、没依据」的维度。
   `radarEvidence` 把每一段材料当时的 {分数, 理由, 出处} 单独存档，重判不碰它。

   用法（先构建）：
     node tools/build.js --force
     node tools/check-radar-evidence.js

   它从 app.js 里抽出「合并 / 去重」那一组纯函数（不启动浏览器、不碰存档），
   断言：合并 2 段 → 2 条证据；再合 1 段 → 3 条；去重后不重复；
   老数据（没有 radarEvidence）合并时能补一条；最终 radar 仍按等权平均。
*/
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "app.js");
const src = fs.readFileSync(appPath, "utf8");
const from = src.indexOf("  function mergeFieldLists(");
const to = src.indexOf("function resultOrderKey(");
if (from < 0 || to <= from) {
  console.error("找不到合并函数块：先运行 node tools/build.js --force");
  process.exit(2);
}
const api = new Function(
  src.slice(from, to) +
    "\nreturn { mergeResultRecords, dedupeRecords, radarEvidenceListOf, radarEvidenceInOrder, sampleEvenly, radarEvidenceView };"
)();

function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

try {
  const raw = (segId, chapter, score, reason) => ({
    type: "character",
    name: "A",
    radar: { 智力: score },
    radarWhy: { 智力: reason },
    fields: [],
    fileId: "f1",
    segId: segId,
    source: chapter,
    seq: Number(segId.replace(/\D/g, "")) || 0,
  });
  const a = raw("s1", "第一章", 6, "「他迅速算出了答案」反应快");
  const b = raw("s2", "第二章", 8, "「他早就看穿了」洞察力强");
  const c = raw("s3", "第三章", 9, "「一眼看穿三层布局」");

  const m = api.mergeResultRecords(a, b);
  assert(m.radarEvidence && m.radarEvidence.length === 2, "合并两段后应有 2 条证据");
  assert(m.radar.智力 === 7, "两段雷达应等权平均为 7，实际 " + m.radar.智力);
  assert(/算出了答案/.test(m.radarEvidence[0].radarWhy.智力), "第 1 条证据的原文理由丢了");
  assert(/看穿了/.test(m.radarEvidence[1].radarWhy.智力), "第 2 条证据的原文理由丢了");

  // 模拟「综合重判」：只改最终 radar / radarWhy，证据必须一条不少
  m.radar = { 智力: 7.5 };
  m.radarWhy = { 智力: "综观全书：稳定偏高" };
  assert(m.radarEvidence.length === 2, "综合重判后证据条数不应变化");

  const m2 = api.mergeResultRecords(m, c);
  assert(m2.radarEvidence.length === 3, "再合一段后应有 3 条证据");
  assert(/算出了答案/.test(JSON.stringify(m2.radarEvidence[0])), "最早的原文引文在后续合并中丢了");

  const d = api.dedupeRecords([a, b, c]);
  assert(d.length === 1 && d[0].radarEvidence.length === 3, "去重合并后应有 3 条证据");

  const legacy = {
    type: "character",
    name: "L",
    radar: { 魅力: 5 },
    radarWhy: { 魅力: "「人人喜欢他」" },
    source: "旧章",
    fields: [],
  };
  const nl = raw("s9", "新章", 7, "「她一笑全场安静」");
  nl.name = "L";
  const ml = api.mergeResultRecords(legacy, nl);
  assert(ml.radarEvidence.length === 2, "老数据合并时应补 1 条证据，共 2 条");

  // 旧结果单独取出证据时也能补一条
  assert(api.radarEvidenceListOf(legacy).length === 1, "老数据单独取证据应回退为 1 条");

  // 早 / 中 / 晚抽样：必须含首尾、保持顺序、条数不超上限
  const seq = Array.from({ length: 10 }, (_, i) => i);
  const s4 = api.sampleEvenly(seq, 4);
  assert(JSON.stringify(s4) === JSON.stringify([0, 3, 6, 9]), "sampleEvenly(10,4) 应为 0/3/6/9，实际 " + s4);
  assert(api.sampleEvenly(seq, 99).length === 10, "名额足够时应原样返回");
  assert(JSON.stringify(api.sampleEvenly([1, 2, 3], 1)) === JSON.stringify([2]), "只留 1 条时应取中间");

  const ordered = api.radarEvidenceInOrder([
    { seq: 3, radarWhy: { a: "c" } },
    { seq: 1, radarWhy: { a: "a" } },
    { seq: null, radarWhy: { a: "x" } },
    { seq: 2, radarWhy: { a: "b" } },
  ]);
  assert(
    JSON.stringify(ordered.map((x) => x.radarWhy.a)) === JSON.stringify(["a", "b", "c", "x"]),
    "证据应先按 seq 排、没有 seq 的排最后"
  );

  /* ---- 只读一体化视图：最终分 / 最终理由 / 各段证据 / 维度顺序 ---- */
  const viewRec = {
    type: "character",
    name: "V",
    radar: { 智力: 8, 战力: 7 },
    radarWhy: { 智力: "综合“一眼看穿”", 战力: "综合「劈开城门」" },
    radarEvidence: [
      { segId: "s1", source: "一", seq: 1, radar: { 智力: 7 }, radarWhy: { 智力: "「算出答案」快" } },
      { segId: "s2", source: "二", seq: 2, radar: { 智力: 9 }, radarWhy: { 智力: "“看穿布局”准" } },
      { segId: "s3", source: "三", seq: 3, radar: { 战力: 7 }, radarWhy: { 战力: "「劈开城门」强" } },
    ],
  };
  const view = api.radarEvidenceView(viewRec, { axisOrder: ["战力", "智力"] });
  assert(view.legacy === false, "新数据不应标成旧数据");
  assert(view.axes.map((a) => a.axis).join(",") === "战力,智力", "维度顺序应按模板走");
  const intAxis = view.axes.find((a) => a.axis === "智力");
  assert(intAxis.evidence.length === 2 && intAxis.quotedCount === 2, "智力应只收 2 条有分数的证据");
  const powAxis = view.axes.find((a) => a.axis === "战力");
  assert(powAxis.evidence.length === 1, "战力应只收 1 条证据");
  assert(api.radarEvidenceView(legacy).legacy === true, "老数据应标成 legacy");

  /* ---- 提示词层：综合汇总 / 雷达重判要按早 / 中 / 晚抽样，不能只取前 N 段 ---- */
  const helpersFrom = src.indexOf("function radarEvidenceClip(");
  const helpersTo = src.indexOf("function mergeRadarPair(");
  const promptFrom = src.indexOf("function synthPromptFor(r) {");
  const promptTo = src.indexOf("function radarScorePromptFor(r, dossier) {");
  if (helpersFrom < 0 || promptFrom < 0 || promptTo <= promptFrom) {
    throw new Error("找不到提示词函数块：先运行 node tools/build.js --force");
  }
  const promptApi = new Function(
    "function segmentTextOf(task, seg){const f=(task.files||[]).find(x=>x.id===seg.fileId);return f?String(f.text).slice(seg.start||0,seg.end):'';}" +
      src.slice(helpersFrom, helpersTo) +
      src.slice(promptFrom, promptTo) +
      "\nreturn { synthPromptFor, buildRadarDossier };"
  )();
  const evs81 = [];
  for (let i = 1; i <= 81; i++) {
    evs81.push({
      fileId: "f1",
      segId: "s" + i,
      source: "第" + i + "章",
      seq: i,
      radar: { 战力: 5, 智谋: 6 },
      radarWhy: {
        战力: (i % 2 ? "「第" + i + "章的原文」" : "“第" + i + "章的原文”") + " 表现",
        智谋: "“第" + i + "章的谋划” 布局",
      },
    });
  }
  const r81 = {
    name: "测试角色",
    type: "character",
    fields: [],
    radar: { 战力: 6, 智谋: 6 },
    radarEvidence: evs81,
    mergedFrom: 81,
  };
  const prompt = promptApi.synthPromptFor(r81);
  const labels = [...prompt.matchAll(/\[第(\d+)章\]/g)].map((m) => Number(m[1]));
  assert(labels.length === 30, "综合汇总应抽 30 段，实际 " + labels.length);
  assert(Math.min(...labels) === 1 && Math.max(...labels) === 81, "抽样应含首尾，实际 " + Math.min(...labels) + ".." + Math.max(...labels));
  assert(labels.some((n) => n >= 35 && n <= 50), "抽样应覆盖中段，实际 " + labels.join(","));
  assert(prompt.indexOf("智谋：") >= 0, "同一段的第二个维度不能被切掉");
  assert(prompt.indexOf("这里列前 30 段") < 0, "不应再写「列前 30 段」");

  const segs = [];
  const textParts = [];
  let pos = 0;
  for (let i = 1; i <= 20; i++) {
    const s = "前文" + i + "“第" + i + "章的谋划”后文" + i + "。";
    segs.push({ id: "s" + i, fileId: "f1", label: "第" + i + "章", start: pos, end: pos + s.length });
    pos += s.length;
    textParts.push(s);
  }
  const dossier = promptApi.buildRadarDossier(
    { segments: segs, files: [{ id: "f1", text: textParts.join("") }] },
    r81
  );
  assert(dossier.indexOf("【战力】") >= 0 && dossier.indexOf("【智谋】") >= 0, "雷达档案每个维度都要保留");
  assert(dossier.indexOf("上下文：") >= 0, "“” 引文也应补上下文");
  assert(dossier.indexOf("[第1章]") >= 0 && dossier.indexOf("[第81章]") >= 0, "雷达档案也应含首尾");

  console.log(
    "radarEvidence 自检通过：合并 / 累加 / 去重 / 老数据回退 / 重判不覆盖证据 / 早中晚抽样 / 弯引号上下文 / 一体化视图。"
  );
} catch (e) {
  console.error("radarEvidence 自检失败：" + String((e && e.message) || e));
  process.exit(1);
}
