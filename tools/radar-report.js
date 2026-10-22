#!/usr/bin/env node
/* 雷达评分「一体化视图」报告（只读）。

   把每条分析结果里的三样东西合成一份可读报告：
     · 最终分      r.radar
     · 最终理由    r.radarWhy
     · 各段证据    r.radarEvidence（原文引文 + 该段当时的分 + 出处）

   只读：只读导出的 JSON，只写 .md / .json 报告，不改动任何评分或存档。

   用法：
     node tools/radar-report.js "C:\...\output\空之彼岸_2026-10-17.json"
     node tools/radar-report.js <输入.json> --char 艾达 --limit 12
     node tools/radar-report.js <输入.json> --type all --context
     node tools/radar-report.js <输入.json> --json "C:\...\雷达视图.json"

   选项：
     --out <file.md>       指定 Markdown 输出（默认 <输入>_雷达一体化.md）
     --json <file.json>    另存结构化视图
     --char <关键词>       只输出名字包含关键词的记录
     --type <类型>         character（默认）/ setting / relation / all
     --limit <n>           每个维度最多列 n 条证据（0＝全部，默认 0）
     --context             附带引文在原文里的上下文（默认每侧 80 字）
     --context-chars <n>   上下文每侧字数（默认 80）
     --no-merge            不合并同名记录（默认按 type+name 合并，避免重复条目）
     --help

   数据来源说明：老存档没有 radarEvidence，视图会标「旧数据」——
   这时每维只有一条从最终 radarWhy 回退出来的副本，不能当作分块原文依据。
*/
const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

/* ---- 从构建后的 app.js 里取出同一份整理逻辑，避免报告和程序各解释一遍 ---- */
const appPath = path.join(__dirname, "..", "app.js");
const src = fs.readFileSync(appPath, "utf8");
const from = src.indexOf("function mergeFieldLists(");
const to = src.indexOf("function resultOrderKey(");
if (from < 0 || to <= from) fail("找不到 app.js 里的合并 / 证据函数：先运行 node tools/build.js --force");
const api = new Function(
  src.slice(from, to) + "\nreturn { radarEvidenceView, dedupeRecords };"
)();

/* ---- 参数 ---- */
function usage() {
  console.log(
    [
      "用法：node tools/radar-report.js <输入.json> [选项]",
      "  --out <file.md>       指定 Markdown 输出（默认 <输入>_雷达一体化.md）",
      "  --json <file.json>    另存结构化视图",
      "  --char <关键词>       只输出名字包含关键词的记录",
      "  --type <类型>         character（默认）/ setting / relation / all",
      "  --limit <n>           每个维度最多列 n 条证据（0＝全部，默认 0）",
      "  --context             附带引文在原文里的上下文（默认每侧 80 字）",
      "  --context-chars <n>   上下文每侧字数（默认 80）",
      "  --no-merge            不合并同名记录（默认按 type+name 合并）",
      "  --help",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const o = {
    files: [],
    out: "",
    json: "",
    char: "",
    type: "character",
    limit: 0,
    context: false,
    contextChars: 80,
    merge: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--out") o.out = argv[++i] || "";
    else if (a === "--json") o.json = argv[++i] || "";
    else if (a === "--char") o.char = argv[++i] || "";
    else if (a === "--type") o.type = argv[++i] || "character";
    else if (a === "--limit") o.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--context") o.context = true;
    else if (a === "--context-chars") o.contextChars = Math.max(20, parseInt(argv[++i], 10) || 80);
    else if (a === "--no-merge") o.merge = false;
    else if (a === "--merge") o.merge = true;
    else if (a.startsWith("--")) fail("未知选项：" + a);
    else o.files.push(a);
  }
  return o;
}

function latestExport() {
  /* 程序导出的默认目录是「文档 \ fiction_GUI \ output」；项目目录下也可能有一份。两边都找。 */
  const dirs = [
    path.join(__dirname, "..", "output"),
    path.join(process.env.USERPROFILE || "", "Documents", "fiction_GUI", "output"),
  ];
  let best = null;
  dirs.forEach((dir) => {
    if (!dir || !fs.existsSync(dir)) return;
    fs.readdirSync(dir)
      .filter((f) => /\.json$/i.test(f) && !/雷达一体化|radar[-_]view/i.test(f))
      .forEach((f) => {
        const p = path.join(dir, f);
        const t = fs.statSync(p).mtimeMs;
        if (!best || t > best.t) best = { p, t };
      });
  });
  return best ? best.p : "";
}

/* ---- 读导出 ---- */
function projectsOf(j) {
  if (!j || typeof j !== "object") return [];
  if (Array.isArray(j.projects)) return j.projects;
  if (j.data && Array.isArray(j.data.projects)) return j.data.projects;
  if (j.data && j.data.analysis) return [j.data];
  if (j.analysis) return [j];
  return [];
}

function segmentTextFor(task, e) {
  if (!task || !e) return "";
  const segs = task.segments || [];
  let seg = e.segId ? segs.find((s) => s.id === e.segId) : null;
  if (!seg && e.source) {
    seg = segs.find((s) => s.label === e.source && (!e.fileId || s.fileId === e.fileId)) || null;
  }
  if (!seg) return "";
  const f = (task.files || []).find((x) => x.id === seg.fileId);
  if (!f || !f.text) return "";
  const a = Math.max(0, Number(seg.start) || 0);
  const b = Number(seg.end) != null && isFinite(Number(seg.end)) ? Number(seg.end) : String(f.text).length;
  return String(f.text).slice(a, Math.max(a, b));
}

function contextOf(task, e, chars) {
  const text = segmentTextFor(task, e);
  if (!text) return "";
  for (const q of e.quotes || []) {
    const at = text.indexOf(q);
    if (at < 0) continue;
    const a = Math.max(0, at - chars);
    const b = Math.min(text.length, at + q.length + chars);
    return text.slice(a, b).replace(/\s+/g, " ").trim();
  }
  return "";
}

/* 维度顺序跟设置 → 人物 → 雷达图 的模板走（label 优先，老数据可能用 key）。 */
function axisOrderOf(project) {
  const defs = (project && project.radar && project.radar.axes) || [];
  const out = [];
  const add = (v) => {
    const s = String(v || "").trim();
    if (s && out.indexOf(s) < 0) out.push(s);
  };
  defs.forEach((a) => {
    if (!a) return;
    add(a.label);
    add(a.key);
  });
  return out;
}

function collect(file, o) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const projects = projectsOf(j);
  const groups = [];
  projects.forEach((p) => {
    ((p.analysis && p.analysis.tasks) || []).forEach((task) => {
      let list = (task.results || []).filter(
        (r) => r && (r.radar || r.radarWhy) && (o.type === "all" || r.type === o.type)
      );
      if (o.char) {
        const needle = String(o.char).trim().toLowerCase();
        list = list.filter((r) => String(r.name || "").toLowerCase().indexOf(needle) >= 0);
      }
      if (!list.length) return;
      if (o.merge) list = api.dedupeRecords(list);
      groups.push({ project: p, task: task, records: list, axisOrder: axisOrderOf(p) });
    });
  });
  return {
    file: file,
    title: String(j.title || (j.data && j.data.title) || path.basename(file, ".json")),
    groups: groups,
  };
}

/* ---- Markdown ---- */
function cell(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function evidenceMarkdown(task, axis, o, legacy) {
  const lines = [];
  const ev = axis.evidence || [];
  const picked = o.limit > 0 ? ev.slice(0, o.limit) : ev;
  if (!ev.length) {
    lines.push("（没有分块证据）");
    return lines;
  }
  picked.forEach((e) => {
    const head =
      "- " +
      (legacy ? "（旧数据·仅最终理由）" : "") +
      (!legacy && e.source ? "[" + e.source + "] " : "") +
      (e.score == null ? "" : "该段 " + e.score + " 分：") +
      (e.reason || "（此段没有理由）") +
      (e.quotes && e.quotes.length ? "" : "（无引文）");
    lines.push(head);
    if (o.context && !legacy) {
      const ctx = contextOf(task, e, o.contextChars);
      if (ctx) lines.push("  > 上下文：" + ctx);
    }
  });
  if (picked.length < ev.length) lines.push("- … 还有 " + (ev.length - picked.length) + " 段未列（用 --limit 0 看全部）");
  return lines;
}

function buildMarkdown(report, o) {
  const lines = [];
  lines.push("# 《" + report.title + "》雷达评分一体化视图");
  lines.push("");
  lines.push("> 只读报告：数据来自 `" + path.basename(report.file) + "`；不改动任何评分或存档。");
  lines.push("");

  let records = 0;
  let axes = 0;
  let axesFinalQuote = 0;
  let axesEvidenceQuote = 0;
  let legacyRecords = 0;
  report.groups.forEach((g) => {
    g.records.forEach((r) => {
      const v = api.radarEvidenceView(r, { axisOrder: g.axisOrder });
      records++;
      if (v.legacy) legacyRecords++;
      v.axes.forEach((a) => {
        axes++;
        if (a.quotes.length) axesFinalQuote++;
        if (!v.legacy && (a.evidence || []).some((e) => e.quotes && e.quotes.length)) axesEvidenceQuote++;
      });
    });
  });
  lines.push(
    "记录 " +
      records +
      " 条 · 维度 " +
      axes +
      " 个 · 最终理由含引文 " +
      axesFinalQuote +
      " · 分块证据含引文 " +
      axesEvidenceQuote +
      "（仅新数据） · 旧数据 " +
      legacyRecords +
      " 条"
  );
  lines.push("");

  report.groups.forEach((g) => {
    g.records.forEach((r) => {
      const v = api.radarEvidenceView(r, { axisOrder: g.axisOrder });
      lines.push("## " + (v.name || "（未命名）"));
      lines.push("");
      lines.push(
        "类型：" +
          (v.type || "—") +
          " · 合并 " +
          v.mergedFrom +
          " 段" +
          (v.legacy ? " · **旧数据（没有分块证据，下面是最终理由回退）**" : " · 证据 " + v.evidenceTotal + " 段")
      );
      if (g.task && g.task.name && report.groups.length > 1) lines.push("任务：" + g.task.name);
      lines.push("");

      lines.push("| 维度 | 最终分 | 最终理由 | 证据段数 | 有引文段 |");
      lines.push("|---|---:|---|---:|---:|");
      v.axes.forEach((a) => {
        const finalTag = !a.reason ? "—" : a.quotes.length ? "有引文" : "无引文";
        const evCount = v.legacy ? "—" : a.evidenceCount;
        const quoted = v.legacy ? "—" : a.quotedCount;
        lines.push(
          "| " +
            cell(a.axis) +
            " | " +
            (a.score == null ? "—" : a.score) +
            " | " +
            finalTag +
            " | " +
            evCount +
            " | " +
            quoted +
            " |"
        );
      });
      lines.push("");

      v.axes.forEach((a) => {
        lines.push("### " + a.axis + " — 最终分 " + (a.score == null ? "—" : a.score));
        lines.push("");
        lines.push("最终理由：" + (a.reason || "（没有最终理由）"));
        lines.push("");
        lines.push(v.legacy ? "旧数据回退（仅最终理由）：" : "分块证据（" + a.evidenceCount + " 段）：");
        lines.push("");
        lines.push.apply(lines, evidenceMarkdown(g.task, a, o, v.legacy));
        lines.push("");
      });
      lines.push("---");
      lines.push("");
    });
  });
  return lines.join("\n");
}

function buildJson(report, o) {
  return {
    source: report.file,
    title: report.title,
    generatedAt: new Date().toISOString(),
    options: {
      type: o.type,
      char: o.char,
      limit: o.limit,
      merge: o.merge,
      context: o.context,
      contextChars: o.contextChars,
    },
    groups: report.groups.map((g) => ({
      task: g.task && g.task.name ? g.task.name : "",
      records: g.records.map((r) => {
        const v = api.radarEvidenceView(r, { axisOrder: g.axisOrder });
        if (!o.context) return v;
        v.axes = v.axes.map((a) => ({
          ...a,
          evidence: a.evidence.map((e) => ({ ...e, context: contextOf(g.task, e, o.contextChars) })),
        }));
        return v;
      }),
    })),
  };
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return usage();
  if (!o.files.length) {
    const latest = latestExport();
    if (!latest) fail("没有输入文件：请把导出的 JSON 路径传进来（node tools/radar-report.js <文件>）");
    console.log("未指定输入，使用最新的导出：" + latest);
    o.files.push(latest);
  }

  const reports = o.files.map((f) => collect(path.resolve(f), o));
  const mdAll = reports.map((r) => buildMarkdown(r, o)).join("\n\n---\n\n");
  const jsonAll =
    o.files.length === 1 ? buildJson(reports[0], o) : reports.map((r) => buildJson(r, o));

  if (o.out) {
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    fs.writeFileSync(path.resolve(o.out), mdAll, "utf8");
    console.log("已生成 Markdown：" + path.resolve(o.out));
  } else {
    reports.forEach((r, i) => {
      const base = path.basename(r.file, path.extname(r.file));
      const out = path.join(path.dirname(r.file), base + "_雷达一体化.md");
      fs.writeFileSync(out, buildMarkdown(r, o), "utf8");
      console.log("已生成 Markdown：" + out);
    });
  }
  if (o.json) {
    fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true });
    fs.writeFileSync(path.resolve(o.json), JSON.stringify(jsonAll, null, 2), "utf8");
    console.log("已生成 JSON：" + path.resolve(o.json));
  }

  reports.forEach((r) => {
    let records = 0;
    let axes = 0;
    let legacy = 0;
    let noQuote = 0;
    r.groups.forEach((g) => {
      g.records.forEach((rec) => {
        const v = api.radarEvidenceView(rec, { axisOrder: g.axisOrder });
        records++;
        if (v.legacy) legacy++;
        v.axes.forEach((a) => {
          axes++;
          if (!a.quotes.length && !(a.evidence || []).some((e) => e.quotes && e.quotes.length)) noQuote++;
        });
      });
    });
    console.log(
      path.basename(r.file) +
        "：" +
        records +
        " 条记录 / " +
        axes +
        " 个维度 · 无任何引文 " +
        noQuote +
        " · 旧数据 " +
        legacy
    );
  });
}

main();
