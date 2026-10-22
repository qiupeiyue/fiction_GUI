  /* ================= 生成整本小说（Markdown / Word / PDF） =================
     事件正文是唯一的内容来源；章节 / 小节按事件轴（orderedByStory）的顺序穿插。
     生成结果写到导出根目录（正文文件夹的上一层），不会被“孤立 .md 清理”误删。 */
  let novelGenerating = false;
  const NOVEL_INLINE_TAGS = {
    span: 1,
    b: 1,
    strong: 1,
    i: 1,
    em: 1,
    u: 1,
    s: 1,
    del: 1,
    mark: 1,
    sub: 1,
    sup: 1,
    code: 1,
    small: 1,
  };

  function novelBookDateText() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function novelBookTarget(format, baseName, dirOverride) {
    const spec = novelFolderSpec();
    const p = novelProject();
    const base = safeFileName(baseName || (p && p.title) || uiTextFor("我的小说"), "novel");
    const name = `${base}.${format}`;
    const dir = String(dirOverride || (spec && spec.abs) || "").replace(/[\\/]+$/, "");
    return {
      base,
      name,
      dir,
      abs: dir ? joinNativePath(dir, name) : "",
    };
  }

  function novelBookAnchor(prefix, n) {
    return `${prefix}-${n}`;
  }

  function novelRememberOutput(target) {
    const p = novelProject();
    if (!p || !target || !target.abs) return;
    const abs = String(target.abs);
    const name = novelBasename(abs);
    if (!name) return;
    p.novelOutputs = Array.isArray(p.novelOutputs) ? p.novelOutputs : [];
    p.novelOutputs = p.novelOutputs.filter((x) => x && String(x.abs || "") !== abs);
    p.novelOutputs.push({ abs, name, at: Date.now() });
    if (p.novelOutputs.length > 50) p.novelOutputs = p.novelOutputs.slice(-50);
    saveState({ noUndo: true });
  }

  async function novelBookCollect() {
    const p = novelProject();
    const title = (p && p.title) || uiTextFor("我的小说");
    const spec = novelFolderSpec();
    const rows = [];
    const order = orderedByStory();
    for (const e of order) {
      if (!e || !e.novelFile) continue;
      let text = "";
      if (novelState.open && novelState.eventId === e.id && !novelState.loading) {
        const ta = $("#novel-text");
        text = ta ? ta.value : "";
      } else {
        const name = novelCleanFileName(e.novelFile);
        if (!name) continue;
        const r = await novelReadFile(spec, name);
        if (!r || !r.ok) continue;
        text = r.content || "";
      }
      text = String(text).replace(/\r\n?/g, "\n").trim();
      if (text) rows.push({ event: e, text });
    }

    const blocks = [];
    const toc = [];
    let lastChapter = null;
    let lastSection = null;
    let chapterNo = 0;
    let sectionNo = 0;
    rows.forEach((row) => {
      const e = row.event;
      const chapterId = e.chapterId || "";
      if (chapterId !== lastChapter) {
        lastChapter = chapterId;
        lastSection = null;
        chapterNo++;
        const c = chapterId ? getChapter(chapterId) : null;
        const label = (c && c.title) || uiTextFor("未分章");
        const anchor = novelBookAnchor("ch", chapterNo);
        blocks.push({ type: "chapter", anchor, title: label, chapterId });
        toc.push({ type: "chapter", anchor, title: label });
      }
      const sectionId = e.sectionId || "";
      if (sectionId !== lastSection) {
        lastSection = sectionId;
        if (sectionId) {
          const sr = getSection(sectionId);
          const label = (sr && sr.section && sr.section.title) || "";
          if (label) {
            sectionNo++;
            const anchor = novelBookAnchor("sec", sectionNo);
            blocks.push({ type: "section", anchor, title: label, sectionId });
            toc.push({ type: "section", anchor, title: label });
          }
        }
      }
      blocks.push({ type: "event", event: e, text: row.text });
    });

    return {
      title,
      date: novelBookDateText(),
      blocks,
      toc,
      chapters: blocks.filter((b) => b.type === "chapter").length,
      sections: blocks.filter((b) => b.type === "section").length,
      events: rows.length,
    };
  }

  function novelMarkdownLabel(text) {
    return String(text == null ? "" : text).replace(/[\[\]]/g, "\\$&");
  }

  function novelBookMarkdown(doc) {
    const out = [`# ${doc.title}`, ""];
    out.push(`> ${uiSentence("novelBookMeta", doc.chapters, doc.sections, doc.events)}`);
    out.push(`> ${uiSentence("novelBookGeneratedAt", doc.date)}`, "");
    out.push(`## ${uiTextFor("目录")}`, "");
    doc.toc.forEach((item) => {
      const indent = item.type === "section" ? "  " : "";
      out.push(`${indent}- [${novelMarkdownLabel(item.title)}](#${item.anchor})`);
    });
    out.push("");
    doc.blocks.forEach((b) => {
      if (b.type === "chapter") {
        out.push(`<a id="${b.anchor}"></a>`, "", `## ${b.title}`, "");
      } else if (b.type === "section") {
        out.push(`<a id="${b.anchor}"></a>`, "", `### ${b.title}`, "");
      } else if (b.type === "event") {
        out.push(b.text.trim(), "");
      }
    });
    return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }

  function novelFindClosingTag(s, name, from) {
    const re = new RegExp("<\\/?\\s*" + name + "\\b[^>]*>", "gi");
    re.lastIndex = from;
    let depth = 1;
    let m;
    while ((m = re.exec(s))) {
      if (/^<\//.test(m[0])) depth--;
      else depth++;
      if (depth <= 0) return { start: m.index, end: re.lastIndex };
    }
    return null;
  }

  function novelSafeStyle(attrs) {
    const m = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(String(attrs || ""));
    if (!m) return "";
    const allow = { color: 1, "background-color": 1, "font-weight": 1, "font-style": 1, "text-decoration": 1 };
    const out = [];
    String(m[2] != null ? m[2] : m[3] || "")
      .split(";")
      .forEach((part) => {
        const i = part.indexOf(":");
        if (i < 0) return;
        const key = part.slice(0, i).trim().toLowerCase();
        const value = part.slice(i + 1).trim();
        if (!allow[key] || !value) return;
        if (!/^[#(),.%\w\s-]+$/.test(value)) return;
        out.push(`${key}:${value}`);
      });
    return out.join(";");
  }

  function novelSpanColor(attrs) {
    const style = novelSafeStyle(attrs);
    const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
    return m ? m[1].trim() : "";
  }

  function novelSafeUrl(url) {
    const s = String(url || "").trim();
    return /^(https?:|mailto:|#|\/)/i.test(s) ? s : "#";
  }

  function novelInlineHtml(input) {
    const s = String(input == null ? "" : input);
    let out = "";
    for (let i = 0; i < s.length; ) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length) {
        out += esc(s[i + 1]);
        i += 2;
        continue;
      }
      if (ch === "`") {
        const j = s.indexOf("`", i + 1);
        if (j >= 0) {
          out += `<code>${esc(s.slice(i + 1, j))}</code>`;
          i = j + 1;
          continue;
        }
      }
      if (s.startsWith("**", i) || s.startsWith("__", i)) {
        const mark = s.slice(i, i + 2);
        const j = s.indexOf(mark, i + 2);
        if (j >= 0) {
          out += `<strong>${novelInlineHtml(s.slice(i + 2, j))}</strong>`;
          i = j + 2;
          continue;
        }
      }
      if (s.startsWith("~~", i)) {
        const j = s.indexOf("~~", i + 2);
        if (j >= 0) {
          out += `<del>${novelInlineHtml(s.slice(i + 2, j))}</del>`;
          i = j + 2;
          continue;
        }
      }
      if (ch === "*" || ch === "_") {
        const j = s.indexOf(ch, i + 1);
        if (j > i + 1) {
          out += `<em>${novelInlineHtml(s.slice(i + 1, j))}</em>`;
          i = j + 1;
          continue;
        }
      }
      if (ch === "[") {
        const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/.exec(s.slice(i));
        if (m) {
          out += `<a href="${esc(novelSafeUrl(m[2]))}">${novelInlineHtml(m[1])}</a>`;
          i += m[0].length;
          continue;
        }
      }
      if (ch === "<") {
        const m = /^<(\/?)([a-zA-Z][\w-]*)([^>]*)>/.exec(s.slice(i));
        if (m && NOVEL_INLINE_TAGS[m[2].toLowerCase()]) {
          const name = m[2].toLowerCase();
          if (name === "br") {
            out += "<br>";
            i += m[0].length;
            continue;
          }
          if (!m[1]) {
            const close = novelFindClosingTag(s, name, i + m[0].length);
            if (close) {
              const inner = s.slice(i + m[0].length, close.start);
              const style = name === "span" ? novelSafeStyle(m[3]) : "";
              out += `<${name}${style ? ` style="${esc(style)}"` : ""}>${novelInlineHtml(inner)}</${name}>`;
              i = close.end;
              continue;
            }
          }
        }
      }
      out += esc(ch);
      i++;
    }
    return out;
  }

  function novelMarkdownBlocks(text) {
    const lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let inCode = false;
    let code = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inCode) {
        if (/^\s*(```|~~~)/.test(line)) {
          blocks.push({ type: "code", text: code.join("\n") });
          inCode = false;
          code = [];
        } else {
          code.push(line);
        }
        continue;
      }
      if (/^\s*(```|~~~)/.test(line)) {
        inCode = true;
        code = [];
        continue;
      }
      if (!line.trim()) continue;
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        blocks.push({ type: "heading", level: h[1].length, text: h[2] });
        continue;
      }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        blocks.push({ type: "hr" });
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        i--;
        blocks.push({ type: "quote", text: quote.join("\n") });
        continue;
      }
      const lm = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (lm) {
        const items = [];
        const ordered = /^\d/.test(lm[1]);
        while (i < lines.length) {
          const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (!m) break;
          items.push(m[2]);
          i++;
        }
        i--;
        blocks.push({ type: "list", ordered, items });
        continue;
      }
      blocks.push({ type: "p", text: line });
    }
    if (inCode) blocks.push({ type: "code", text: code.join("\n") });
    return blocks;
  }

  function novelMarkdownToHtml(text, opts) {
    const offset = opts && Number.isFinite(Number(opts.headingOffset)) ? Number(opts.headingOffset) : 3;
    return novelMarkdownBlocks(text)
      .map((b) => {
        if (b.type === "heading") {
          const level = Math.max(1, Math.min(6, b.level + offset));
          return `<h${level} class="md-heading">${novelInlineHtml(b.text)}</h${level}>`;
        }
        if (b.type === "quote") {
          return `<blockquote><p>${novelInlineHtml(b.text).replace(/\n/g, "<br>")}</p></blockquote>`;
        }
        if (b.type === "list") {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items
            .map((item) => `<li>${novelInlineHtml(item)}</li>`)
            .join("")}</${tag}>`;
        }
        if (b.type === "code") return `<pre><code>${esc(b.text)}</code></pre>`;
        if (b.type === "hr") return "<hr class=\"scene-break\">";
        return `<p>${novelInlineHtml(b.text).replace(/\n/g, "<br>")}</p>`;
      })
      .join("\n");
  }

  function novelBookHtml(doc) {
    const toc = doc.toc
      .map(
        (item) =>
          `<li class="${item.type}"><a href="#${item.anchor}">${novelInlineHtml(item.title)}</a></li>`
      )
      .join("");
    const body = doc.blocks
      .map((b) => {
        if (b.type === "chapter") {
          return `<h2 class="chapter" id="${b.anchor}">${esc(b.title)}</h2>`;
        }
        if (b.type === "section") {
          return `<h3 class="section" id="${b.anchor}">${esc(b.title)}</h3>`;
        }
        if (b.type === "event") return `<div class="event-text">${novelMarkdownToHtml(b.text)}</div>`;
        return "";
      })
      .join("\n");
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Yu Mincho", serif; color: #222; font-size: 12pt; line-height: 1.9; }
  .title-page { min-height: 245mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
  .book-kicker { font-size: 10pt; letter-spacing: 0.18em; color: #8a7a9e; margin-bottom: 18mm; }
  .book-title { font-size: 30pt; line-height: 1.35; margin: 0 0 14mm; font-family: "Songti SC", "STSong", "SimSun", serif; font-weight: 700; color: #1f2937; }
  .book-meta, .book-date { font-size: 10.5pt; color: #6b7280; margin: 2mm 0; }
  .toc-page { page-break-after: auto; }
  .toc-title { font-size: 20pt; font-weight: 700; text-align: center; margin: 0 0 12mm; color: #1f2937; }
  .toc-list { list-style: none; margin: 0; padding: 0; }
  .toc-list li { margin: 0 0 2.5mm; font-size: 11pt; }
  .toc-list li.section { margin-left: 9mm; font-size: 10pt; color: #4b5563; }
  .toc-list a { color: inherit; text-decoration: none; }
  h2.chapter { page-break-before: always; text-align: center; font-size: 20pt; line-height: 1.5; margin: 0 0 8mm; padding: 0; color: #1f2937; page-break-after: avoid; }
  h3.section { font-size: 14pt; margin: 8mm 0 4mm; color: #374151; page-break-after: avoid; }
  .event-text p { margin: 0 0 0.55em; text-indent: 2em; text-align: justify; }
  .event-text p:last-child { margin-bottom: 0; }
  .event-text h4, .event-text h5, .event-text h6 { margin: 6mm 0 3mm; color: #374151; page-break-after: avoid; }
  blockquote { margin: 4mm 0; padding: 2mm 4mm; border-left: 2px solid #c4b5d8; color: #4b5563; background: #faf8fc; }
  blockquote p { text-indent: 0; }
  ul, ol { margin: 2mm 0 4mm 7mm; padding: 0; }
  li { margin: 0 0 1.5mm; }
  pre { margin: 3mm 0; padding: 3mm 4mm; background: #f4f4f6; border: 1px solid #e5e7eb; white-space: pre-wrap; word-break: break-word; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 0.92em; background: #f4f4f6; padding: 0 0.2em; }
  pre code { background: transparent; padding: 0; }
  hr.scene-break { border: 0; border-top: 1px solid #d1d5db; width: 32%; margin: 7mm auto; }
  a { color: #5b4b8a; text-decoration: none; }
  .md-heading { break-after: avoid; }
</style></head>
<body>
  <section class="title-page">
    <div class="book-kicker">${esc(uiTextFor("小说"))}</div>
    <h1 class="book-title">${esc(doc.title)}</h1>
    <div class="book-meta">${esc(uiSentence("novelBookMeta", doc.chapters, doc.sections, doc.events))}</div>
    <div class="book-date">${esc(uiSentence("novelBookGeneratedAt", doc.date))}</div>
  </section>
  <section class="toc-page">
    <div class="toc-title">${esc(uiTextFor("目录"))}</div>
    <ul class="toc-list">${toc}</ul>
  </section>
  ${body}
</body></html>`;
  }

  function novelInlineTokens(input, style, out) {
    const s = String(input == null ? "" : input);
    const base = style || {};
    const tokens = out || [];
    let buf = "";
    const flush = () => {
      if (buf) {
        tokens.push(Object.assign({}, base, { text: buf }));
        buf = "";
      }
    };
    for (let i = 0; i < s.length; ) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length) {
        buf += s[i + 1];
        i += 2;
        continue;
      }
      if (ch === "`") {
        const j = s.indexOf("`", i + 1);
        if (j >= 0) {
          flush();
          tokens.push(Object.assign({}, base, { text: s.slice(i + 1, j), code: true }));
          i = j + 1;
          continue;
        }
      }
      if (s.startsWith("**", i) || s.startsWith("__", i)) {
        const mark = s.slice(i, i + 2);
        const j = s.indexOf(mark, i + 2);
        if (j >= 0) {
          flush();
          novelInlineTokens(s.slice(i + 2, j), Object.assign({}, base, { bold: true }), tokens);
          i = j + 2;
          continue;
        }
      }
      if (s.startsWith("~~", i)) {
        const j = s.indexOf("~~", i + 2);
        if (j >= 0) {
          flush();
          novelInlineTokens(s.slice(i + 2, j), Object.assign({}, base, { strike: true }), tokens);
          i = j + 2;
          continue;
        }
      }
      if (ch === "*" || ch === "_") {
        if (ch === "_" && /[A-Za-z0-9]/.test(s[i - 1] || "") && /[A-Za-z0-9]/.test(s[i + 1] || "")) {
          buf += ch;
          i++;
          continue;
        }
        const j = s.indexOf(ch, i + 1);
        if (j > i + 1) {
          flush();
          novelInlineTokens(s.slice(i + 1, j), Object.assign({}, base, { italic: true }), tokens);
          i = j + 1;
          continue;
        }
      }
      if (ch === "[") {
        const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/.exec(s.slice(i));
        if (m) {
          flush();
          novelInlineTokens(m[1], Object.assign({}, base, { link: novelSafeUrl(m[2]) }), tokens);
          i += m[0].length;
          continue;
        }
      }
      if (ch === "<") {
        const m = /^<(\/?)([a-zA-Z][\w-]*)([^>]*)>/.exec(s.slice(i));
        if (m && NOVEL_INLINE_TAGS[m[2].toLowerCase()]) {
          const name = m[2].toLowerCase();
          if (name === "br") {
            flush();
            tokens.push(Object.assign({}, base, { text: "\n" }));
            i += m[0].length;
            continue;
          }
          if (!m[1]) {
            const close = novelFindClosingTag(s, name, i + m[0].length);
            if (close) {
              const inner = s.slice(i + m[0].length, close.start);
              const next = Object.assign({}, base);
              if (name === "b" || name === "strong") next.bold = true;
              if (name === "i" || name === "em") next.italic = true;
              if (name === "u") next.underline = true;
              if (name === "s" || name === "del") next.strike = true;
              if (name === "code") next.code = true;
              if (name === "span") {
                const color = novelSpanColor(m[3]);
                if (color) next.color = color;
              }
              flush();
              novelInlineTokens(inner, next, tokens);
              i = close.end;
              continue;
            }
          }
        }
      }
      buf += ch;
      i++;
    }
    flush();
    return tokens;
  }

  function novelDocxRun(text, st) {
    const s = String(text == null ? "" : text);
    if (!s) return "";
    const style = st || {};
    const rPr = [];
    if (style.code) rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/>');
    if (style.bold) rPr.push("<w:b/>");
    if (style.italic) rPr.push("<w:i/>");
    if (style.underline || style.link) rPr.push('<w:u w:val="single"/>');
    if (style.strike) rPr.push("<w:strike/>");
    if (style.color || style.link) {
      const color = style.link ? "0563C1" : novelDocxColor(style.color);
      if (color) rPr.push(`<w:color w:val="${color}"/>`);
    }
    if (style.code) rPr.push('<w:shd w:val="clear" w:fill="F2F2F2"/>');
    const parts = s.split("\n");
    let xml = "";
    parts.forEach((part, i) => {
      if (i) xml += "<w:br/>";
      if (part) xml += `<w:t xml:space="preserve">${esc(part)}</w:t>`;
    });
    if (!xml) return "";
    return `<w:r>${rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : ""}${xml}</w:r>`;
  }

  function novelDocxColor(value) {
    let s = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map((c) => c + c).join("");
    if (/^[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
    const named = {
      red: "FF0000",
      green: "008000",
      blue: "0000FF",
      orange: "FFA500",
      purple: "800080",
      gray: "808080",
      grey: "808080",
      black: "000000",
      white: "FFFFFF",
    };
    return named[String(value || "").trim().toLowerCase()] || "";
  }

  function novelDocxRuns(text, style) {
    return novelInlineTokens(text, style)
      .map((t) => novelDocxRun(t.text, t))
      .join("");
  }

  let novelDocxBookmarkId = 1;
  function novelDocxBookmark(name) {
    const id = novelDocxBookmarkId++;
    return {
      start: `<w:bookmarkStart w:id="${id}" w:name="${esc(name)}"/>`,
      end: `<w:bookmarkEnd w:id="${id}"/>`,
    };
  }

  function novelDocxParagraph(runs, opts) {
    const o = opts || {};
    const pPr = [];
    if (o.style) pPr.push(`<w:pStyle w:val="${o.style}"/>`);
    if (o.keepNext) pPr.push("<w:keepNext/>");
    if (o.pageBreakBefore) pPr.push("<w:pageBreakBefore/>");
    if (o.align) pPr.push(`<w:jc w:val="${o.align}"/>`);
    if (o.indent) pPr.push('<w:ind w:firstLineChars="200" w:firstLine="420"/>');
    if (o.left) pPr.push(`<w:ind w:left="${o.left}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>`);
    if (o.after != null || o.line) {
      const after = o.after == null ? 0 : o.after;
      pPr.push(`<w:spacing w:line="${o.line || 360}" w:lineRule="auto" w:after="${after}"/>`);
    }
    return `<w:p>${pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : ""}${runs || ""}</w:p>`;
  }

  function novelDocxAnchorParagraph(text, anchor, style) {
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:hyperlink w:anchor="${esc(
      anchor
    )}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">${esc(
      text
    )}</w:t></w:r></w:hyperlink></w:p>`;
  }

  function novelDocxPageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function novelDocxRule() {
    return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D5DB"/></w:pBdr></w:pPr></w:p>';
  }

  function novelDocxBlocks(text) {
    const blocks = novelMarkdownBlocks(text);
    const out = [];
    blocks.forEach((b) => {
      if (b.type === "heading") {
        const style = `Heading${Math.min(6, b.level + 3)}`;
        out.push(novelDocxParagraph(novelDocxRuns(b.text), { style, keepNext: true, after: 120 }));
      } else if (b.type === "quote") {
        out.push(novelDocxParagraph(novelDocxRuns(b.text.replace(/\n/g, "\n")), { style: "Quote", left: 420 }));
      } else if (b.type === "list") {
        b.items.forEach((item, idx) => {
          const prefix = b.ordered ? `${idx + 1}. ` : "• ";
          out.push(
            novelDocxParagraph(novelDocxRun(prefix) + novelDocxRuns(item), {
              style: "ListParagraph",
              left: 600,
              hanging: 300,
              after: 60,
            })
          );
        });
      } else if (b.type === "code") {
        String(b.text)
          .split("\n")
          .forEach((line) => {
            out.push(novelDocxParagraph(novelDocxRun(line, { code: true }), { style: "Code", after: 0 }));
          });
      } else if (b.type === "hr") {
        out.push(novelDocxRule());
      } else {
        out.push(novelDocxParagraph(novelDocxRuns(b.text), { indent: true, after: 120 }));
      }
    });
    return out.join("");
  }

  function novelDocxDocumentXml(doc) {
    novelDocxBookmarkId = 1;
    const body = [];
    body.push(
      novelDocxParagraph(novelDocxRun(doc.title), {
        style: "Title",
        align: "center",
        after: 300,
      })
    );
    body.push(
      novelDocxParagraph(
        novelDocxRun(uiSentence("novelBookMeta", doc.chapters, doc.sections, doc.events)),
        { style: "Subtitle", align: "center", after: 80 }
      )
    );
    body.push(
      novelDocxParagraph(novelDocxRun(uiSentence("novelBookGeneratedAt", doc.date)), {
        style: "Subtitle",
        align: "center",
      })
    );
    body.push(novelDocxPageBreak());
    body.push(
      novelDocxParagraph(novelDocxRun(uiTextFor("目录")), {
        style: "TOCHeading",
        align: "center",
        after: 260,
      })
    );
    doc.toc.forEach((item) => {
      body.push(novelDocxAnchorParagraph(item.title, item.anchor, item.type === "section" ? "TOC2" : "TOC1"));
    });

    doc.blocks.forEach((b) => {
      if (b.type === "chapter") {
        const bm = novelDocxBookmark(b.anchor);
        body.push(
          novelDocxParagraph(bm.start + novelDocxRuns(b.title) + bm.end, {
            style: "Heading1",
            align: "center",
            pageBreakBefore: true,
          })
        );
      } else if (b.type === "section") {
        const bm = novelDocxBookmark(b.anchor);
        body.push(
          novelDocxParagraph(bm.start + novelDocxRuns(b.title) + bm.end, {
            style: "Heading2",
            keepNext: true,
          })
        );
      } else if (b.type === "event") {
        body.push(novelDocxBlocks(b.text));
      }
    });

    const sectPr =
      '<w:sectPr><w:footerReference w:type="default" r:id="rId1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join(
      ""
    )}${sectPr}</w:body></w:document>`;
  }

  function novelDocxStylesXml() {
    const heading = (id, name, size, before, after, outline, align) =>
      `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="${after}"/><w:outlineLvl w:val="${outline}"/><w:jc w:val="${align}"/></w:pPr><w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei" w:eastAsia="黑体"/><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="1F2937"/></w:rPr></w:style>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="0"/></w:pPr><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="300"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="1F2937"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="6B7280"/></w:rPr></w:style>
${heading("Heading1", "heading 1", 36, 0, 360, 0, "center")}
${heading("Heading2", "heading 2", 28, 360, 180, 1, "left")}
${heading("Heading3", "heading 3", 24, 240, 120, 2, "left")}
${heading("Heading4", "heading 4", 22, 180, 100, 3, "left")}
${heading("Heading5", "heading 5", 22, 120, 80, 4, "left")}
${heading("Heading6", "heading 6", 22, 120, 80, 5, "left")}
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="260"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/><w:spacing w:after="60"/></w:pPr><w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="4B5563"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:i/><w:color w:val="4B5563"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F2F2F2"/><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="600" w:hanging="300"/><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
  }

  function novelDocxZipParts(doc) {
    const now = new Date().toISOString();
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="420"/><w:compat/></w:settings>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(
      doc.title
    )}</dc:title><dc:creator>Adaa Fiction Workshop</dc:creator><cp:lastModifiedBy>Adaa Fiction Workshop</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Adaa Fiction Workshop</Application></Properties>`;
    return {
      "[Content_Types].xml": contentTypes,
      "_rels/.rels": rels,
      "word/document.xml": novelDocxDocumentXml(doc),
      "word/styles.xml": novelDocxStylesXml(),
      "word/settings.xml": settings,
      "word/footer1.xml": footer,
      "word/_rels/document.xml.rels": docRels,
      "docProps/core.xml": core,
      "docProps/app.xml": app,
    };
  }

  async function novelDocxBase64(doc) {
    if (typeof JSZip === "undefined") throw new Error("JSZip is not available");
    const zip = new JSZip();
    const parts = novelDocxZipParts(doc);
    Object.keys(parts).forEach((name) => zip.file(name, parts[name]));
    return await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function novelEpubLanguage() {
    const lang = uiLanguage();
    return lang === "en" ? "en" : lang === "ja" ? "ja" : lang === "zh-TW" ? "zh-Hant" : "zh-Hans";
  }

  function novelEpubUuid() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {
      /* fall through */
    }
    let out = "";
    for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`;
  }

  function novelXhtmlSafe(html) {
    return String(html == null ? "" : html)
      .replace(/<br\s*\/?>/gi, "<br/>")
      .replace(/<hr([^>]*?)\/?>/gi, "<hr$1/>");
  }

  function novelEpubXhtml(title, body, lang, cssHref) {
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="${cssHref || "../styles.css"}"/></head>
<body>${body}</body>
</html>`;
  }

  function novelEpubItems(doc) {
    const chapters = [];
    let current = null;
    doc.blocks.forEach((b) => {
      if (b.type === "chapter") {
        current = {
          no: chapters.length + 1,
          anchor: b.anchor,
          title: b.title,
          sections: [],
          body: [`<h2 id="${b.anchor}">${esc(b.title)}</h2>`],
        };
        chapters.push(current);
        return;
      }
      if (!current) return;
      if (b.type === "section") {
        current.sections.push({ anchor: b.anchor, title: b.title });
        current.body.push(`<h3 id="${b.anchor}">${esc(b.title)}</h3>`);
      } else if (b.type === "event") {
        current.body.push(`<div class="event-text">${novelXhtmlSafe(novelMarkdownToHtml(b.text))}</div>`);
      }
    });
    return chapters;
  }

  async function novelEpubBase64(doc) {
    if (typeof JSZip === "undefined") throw new Error("JSZip is not available");
    const zip = new JSZip();
    const lang = novelEpubLanguage();
    const uid = "urn:uuid:" + novelEpubUuid();
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const chapters = novelEpubItems(doc);
    const css = `body { font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif; line-height: 1.8; margin: 5%; color: #222; }
h1 { text-align: center; margin: 32% 0 1.2em; font-size: 1.9em; }
h2 { text-align: center; font-size: 1.45em; margin: 18% 0 1.2em; page-break-before: always; }
h2:first-child { margin-top: 8%; }
h3 { font-size: 1.2em; margin: 1.8em 0 0.7em; }
p { text-indent: 2em; margin: 0 0 0.65em; text-align: justify; }
blockquote { margin: 1.2em 1.5em; padding: 0.5em 1em; border-left: 2px solid #c4b5d8; color: #555; }
blockquote p { text-indent: 0; }
ul, ol { margin: 0.8em 0 1em 2em; }
pre { white-space: pre-wrap; background: #f4f4f6; padding: 0.8em; }
code { font-family: Consolas, "Courier New", monospace; }
hr.scene-break { border: 0; border-top: 1px solid #ccc; width: 32%; margin: 1.8em auto; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { margin: 0 0 1.5em; }
.book-meta { font-size: 0.92em; color: #666; margin: 0.4em 0; }
.toc { margin-top: 1em; }
.toc h1 { margin: 0 0 1.5em; font-size: 1.6em; }
.toc ol { list-style: none; padding: 0; }
.toc li { margin: 0.55em 0; }
.toc li.section { margin-left: 1.6em; font-size: 0.92em; }
.toc a { color: #4b3f72; text-decoration: none; }`;

    const titleBody = `<section class="title-page" epub:type="titlepage"><h1>${esc(doc.title)}</h1><p class="book-meta">${esc(
      uiSentence("novelBookMeta", doc.chapters, doc.sections, doc.events)
    )}</p><p class="book-meta">${esc(uiSentence("novelBookGeneratedAt", doc.date))}</p></section>`;
    const chapterEntries = chapters.map((ch) => ({
      href: `text/chapter-${ch.no}.xhtml#${ch.anchor}`,
      title: ch.title,
      sections: ch.sections.map((s) => ({ href: `text/chapter-${ch.no}.xhtml#${s.anchor}`, title: s.title })),
    }));
    let playOrder = 1;
    const navPoints = chapterEntries
      .map((ch) => {
        const chapterOrder = playOrder++;
        const sectionPoints = ch.sections
          .map((s) => {
            const order = playOrder++;
            return `<navPoint id="navPoint-${order}" playOrder="${order}"><navLabel><text>${esc(
              s.title
            )}</text></navLabel><content src="${s.href}"/></navPoint>`;
          })
          .join("");
        return `<navPoint id="navPoint-${chapterOrder}" playOrder="${chapterOrder}"><navLabel><text>${esc(
          ch.title
        )}</text></navLabel><content src="${ch.href}"/>${sectionPoints}</navPoint>`;
      })
      .join("");
    const navList = chapterEntries
      .map(
        (ch) =>
          `<li><a href="${ch.href}">${esc(ch.title)}</a>${
            ch.sections.length
              ? `<ol>${ch.sections.map((s) => `<li class="section"><a href="${s.href}">${esc(s.title)}</a></li>`).join("")}</ol>`
              : ""
          }</li>`
      )
      .join("");
    const navBody = `<nav class="toc" epub:type="toc" id="toc"><h1>${esc(uiTextFor("目录"))}</h1><ol>${navList}</ol></nav>`;

    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${esc(
        doc.title
      )}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="styles.css" media-type="text/css"/><item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>${chapters
        .map((ch) => `<item id="ch${ch.no}" href="text/chapter-${ch.no}.xhtml" media-type="application/xhtml+xml"/>`)
        .join("")}</manifest>
<spine toc="ncx"><itemref idref="title"/><itemref idref="nav"/>${chapters
        .map((ch) => `<itemref idref="ch${ch.no}"/>`)
        .join("")}</spine>
</package>`
    );
    zip.file(
      "OEBPS/toc.ncx",
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${esc(
        doc.title
      )}</text></docTitle><navMap>${navPoints}</navMap></ncx>`
    );
    zip.file("OEBPS/styles.css", css);
    zip.file("OEBPS/nav.xhtml", novelEpubXhtml(uiTextFor("目录"), navBody, lang, "styles.css"));
    zip.file("OEBPS/text/title.xhtml", novelEpubXhtml(doc.title, titleBody, lang));
    chapters.forEach((ch) => {
      zip.file(
        `OEBPS/text/chapter-${ch.no}.xhtml`,
        novelEpubXhtml(ch.title, `<section epub:type="chapter">${ch.body.join("\n")}</section>`, lang)
      );
    });
    return await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function novelBytesBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function novelPagesPlain(text) {
    return novelInlineTokens(text, {}, [])
      .map((t) => t.text)
      .join("");
  }

  function novelPagesAdd(doc, text, style, opts) {
    const o = opts || {};
    const value = String(text == null ? "" : text)
      .replace(/\r\n?/g, "\n")
      .replace(/\n+/g, " ")
      .trim();
    if (!value) return null;
    const idx = doc.appendParagraph(value, style, o.list);
    const format = Object.assign({}, o.format || {});
    if (o.indent) {
      format.firstLineIndent = 24;
      format.lineSpacing = 1.5;
      format.spaceAfter = 6;
    }
    if (o.quote) {
      format.leftIndent = 28;
      format.firstLineIndent = 0;
      format.lineSpacing = 1.5;
      format.spaceAfter = 6;
    }
    if (o.code) {
      format.leftIndent = 12;
      format.lineSpacing = 1.35;
      format.spaceAfter = 2;
    }
    if (Object.keys(format).length) doc.body.paragraph(idx).format(format);
    if (o.bookmark) o.bookmarks.push({ index: idx, name: o.bookmark });
    return idx;
  }

  function novelPagesBlocks(doc, text, bookmarks) {
    const blocks = novelMarkdownBlocks(text);
    blocks.forEach((b) => {
      if (b.type === "heading") {
        const style = b.level <= 1 ? "Heading" : b.level === 2 ? "Heading 2" : "Heading 3";
        const idx = novelPagesAdd(doc, novelPagesPlain(b.text), style, { bookmarks });
        if (idx != null) doc.body.paragraph(idx).format({ outlineLevel: Math.min(3, b.level), showInToc: true });
      } else if (b.type === "quote") {
        novelPagesPlain(b.text)
          .split("\n")
          .forEach((line) => novelPagesAdd(doc, line, "Body", { quote: true }));
      } else if (b.type === "list") {
        b.items.forEach((item) =>
          novelPagesAdd(doc, novelPagesPlain(item), "Body", {
            list: b.ordered ? "Numbered" : "Bullet",
            format: { lineSpacing: 1.45, spaceAfter: 4 },
          })
        );
      } else if (b.type === "code") {
        String(b.text)
          .split("\n")
          .forEach((line) => novelPagesAdd(doc, line, "Body", { code: true }));
      } else if (b.type === "hr") {
        doc.appendParagraph("", "Body");
      } else {
        novelPagesPlain(b.text)
          .split("\n")
          .forEach((line) => novelPagesAdd(doc, line, "Body", { indent: true }));
      }
    });
  }

  function novelPagesBase64(doc) {
    // 真正的 Pages 文档：用 vendor/cupertino-files.min.js（MIT）的空白模板写入段落、标题和书签。
    const api = typeof window !== "undefined" ? window.CupertinoFiles : null;
    if (!api || typeof api.PagesDocument !== "function") throw new Error("Pages engine is not available");
    const out = api.PagesDocument.blank();
    const bookmarks = [];
    const usedBookmarks = new Set();
    const bookmarkName = (title) => {
      const base = String(title || "").trim() || uiTextFor("未命名事件");
      let name = base;
      let n = 2;
      while (usedBookmarks.has(name)) name = `${base} (${n++})`;
      usedBookmarks.add(name);
      return name;
    };
    novelPagesAdd(out, doc.title, "Title", { format: { alignment: "center" } });
    novelPagesAdd(out, uiSentence("novelBookMeta", doc.chapters, doc.sections, doc.events), "Subtitle", {
      format: { alignment: "center" },
    });
    novelPagesAdd(out, uiSentence("novelBookGeneratedAt", doc.date), "Subtitle", {
      format: { alignment: "center" },
    });
    novelPagesAdd(out, uiTextFor("目录"), "Heading", {
      format: { pageBreakBefore: true, outlineLevel: 1, showInToc: false },
    });
    doc.blocks.forEach((b) => {
      if (b.type === "chapter") {
        novelPagesAdd(out, b.title, "Body", { list: "Bullet" });
      } else if (b.type === "section") {
        novelPagesAdd(out, "\u3000" + b.title, "Body", { list: "Dash" });
      }
    });
    doc.blocks.forEach((b) => {
      if (b.type === "chapter") {
        novelPagesAdd(out, b.title, "Heading", {
          bookmark: bookmarkName(b.title),
          bookmarks,
          format: { pageBreakBefore: true, outlineLevel: 1, showInToc: true },
        });
      } else if (b.type === "section") {
        novelPagesAdd(out, b.title, "Heading 2", {
          bookmark: bookmarkName(b.title),
          bookmarks,
          format: { outlineLevel: 2, showInToc: true, keepWithNext: true },
        });
      } else if (b.type === "event") {
        novelPagesBlocks(out, b.text, bookmarks);
      }
    });
    bookmarks.forEach((bm) => {
      const range = out.body.paragraph(bm.index).range();
      out.body.addBookmark(range.start, range.end, bm.name);
    });
    return novelBytesBase64(out.save());
  }

  function novelBase64Blob(base64, mime) {
    const bin = atob(String(base64 || ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function novelDownloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function novelGenerateBook() {
    if (novelGenerating) return;
    const p = novelProject();
    const defaultBase = safeFileName((p && p.title) || uiTextFor("我的小说"), "novel");
    const folder = novelFolderSpec();
    const defaultDir = (folder && folder.abs) || (folder && folder.root) || "";
    const picked = await uiChoose(
      "",
      [
        { value: "ok", label: uiTextFor("确定"), primary: true },
        { value: "", label: uiTextFor("取消"), cancel: true, tip: "Esc" },
      ],
      uiTextFor("生成小说"),
      {
        row: true,
        inputs: [
          { key: "name", label: uiTextFor("保存文件名"), value: defaultBase, placeholder: defaultBase },
          {
            key: "dir",
            label: uiTextFor("保存路径"),
            value: defaultDir,
            placeholder: defaultDir,
            tip: defaultDir,
            button: uiTextFor("选择..."),
            onButton: async (inputEl) => {
              const n = nativeApp();
              if (!n || typeof n.pickFolder !== "function") {
                showToast(uiTextFor("浏览器版不能打开文件夹"));
                return null;
              }
              try {
                return await n.pickFolder(String((inputEl && inputEl.value) || defaultDir || ""));
              } catch (err) {
                showToast(uiTextFor("选择文件夹失败"));
                return null;
              }
            },
          },
          {
            key: "format",
            type: "select",
            label: uiTextFor("格式"),
            value: "md",
            options: [
              { value: "md", label: uiTextFor("Markdown（.md）") },
              { value: "docx", label: uiTextFor("Word（.docx）") },
              { value: "pages", label: uiTextFor("Pages（.pages）") },
              { value: "epub", label: uiTextFor("EPUB（.epub）") },
              { value: "pdf", label: uiTextFor("PDF（.pdf）") },
            ],
          },
        ],
      }
    );
    if (!picked || typeof picked !== "object" || picked.choice !== "ok") return;
    const values = picked.values || {};
    const format = values.format || "md";
    if (!format) return;

    const saved = await novelSaveCurrent({ silent: true });
    if (!saved) return;
    const rawName = values.name || "";
    const rawDir = values.dir || defaultDir;
    const base = safeFileName(String(rawName || "").trim() || defaultBase, "novel").replace(
      /\.(md|docx|pdf|epub|pages)$/i,
      ""
    ).replace(/[. ]+$/g, "") || defaultBase;
    const target = novelBookTarget(format, base, rawDir);
    const n = nativeApp();
    const eventFiles = new Set(
      (state.events || []).map((e) => novelCleanFileName(e && e.novelFile)).filter(Boolean)
    );
    if (format === "md" && eventFiles.has(target.name)) {
      showToast(uiTextFor("文件名与事件正文冲突"));
      return;
    }
    if (n && !target.dir) {
      showToast(uiTextFor("还没有设置导出目录"));
      return;
    }
    if (format === "pdf" && (!n || typeof n.printNovelPdf !== "function")) {
      showToast(uiTextFor("PDF 只在安装版可用"));
      return;
    }

    novelGenerating = true;
    const btn = $("#novel-generate-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = uiTextFor("正在生成…");
    }
    try {
      const doc = await novelBookCollect();
      if (!doc.events) {
        showToast(uiTextFor("没有可生成的正文"));
        return;
      }
      if (format === "md") {
        const text = novelBookMarkdown(doc);
        if (n && typeof n.writeFileAbs === "function") {
          await n.writeFileAbs(target.abs, text);
        } else {
          novelDownloadBlob(target.name, new Blob([text], { type: "text/markdown;charset=utf-8" }));
        }
      } else if (format === "docx") {
        const base64 = await novelDocxBase64(doc);
        if (n && typeof n.writeBinaryFileAbs === "function") {
          await n.writeBinaryFileAbs(target.abs, base64);
        } else {
          novelDownloadBlob(
            target.name,
            novelBase64Blob(base64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
          );
        }
      } else if (format === "epub") {
        const base64 = await novelEpubBase64(doc);
        if (n && typeof n.writeBinaryFileAbs === "function") {
          await n.writeBinaryFileAbs(target.abs, base64);
        } else {
          novelDownloadBlob(target.name, novelBase64Blob(base64, "application/epub+zip"));
        }
      } else if (format === "pages") {
        const base64 = novelPagesBase64(doc);
        if (n && typeof n.writeBinaryFileAbs === "function") {
          await n.writeBinaryFileAbs(target.abs, base64);
        } else {
          novelDownloadBlob(target.name, novelBase64Blob(base64, "application/vnd.apple.pages"));
        }
      } else {
        const r = await n.printNovelPdf({ html: novelBookHtml(doc), absPath: target.abs, title: doc.title });
        if (!r || r.ok === false) throw new Error((r && r.error) || "PDF");
      }
      novelRememberOutput(target);
      showToast(uiSentence("novelGenerated", n && target.abs ? target.abs : target.name));
    } catch (err) {
      showToast(uiSentence("novelGenerateFailed", novelSaveErrorText(err)));
    } finally {
      novelGenerating = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = uiTextFor("生成小说");
      }
    }
  }
