  function evidenceCharsOf(names, sentences) {
    // 名字和句子都用「折叠异体字 + 转小写」比对：英文 ALICE / Alice、繁中静流 / 靜流、
    // 日文异体字 団 / 團 都能对上。这里的判断只跟正文有关，跟界面语言无关。
    const keys = Array.from(
      new Set(
        (names || [])
          .map((n) => foldVariant(String(n || "").replace(/[\s\u00a0\u3000]/g, "").trim()).toLowerCase())
          .filter(Boolean)
      )
    );
    if (!keys.length || !sentences.length) return 0;
    const idx = sentenceCharIndex(sentences);
    // 候选句子 = 各名字「首字」出现过的句子；按下标排序，保持原来的顺序
    const cand = [];
    keys.forEach((k) => {
      const arr = idx.byChar.get(k[0]);
      if (arr) arr.forEach((i) => cand.push(i));
    });
    if (!cand.length) return 0;
    cand.sort((a, b) => a - b);
    let total = 0;
    let last = -1;
    for (let n = 0; n < cand.length; n++) {
      const i = cand[n];
      if (i === last) continue; // 同一句被多个名字命中时只算一次
      last = i;
      const hitText = sentenceMatchOf(sentences[i]);
      if (!hitText || !keys.some((k) => hitText.includes(k))) continue;
      // 计数用「原文」（保留空格）：拉丁文要按词切，去了空格就成一个长词了。
      // 中日文不受空格影响，结果和以前一样。
      const whole = sentences[i] && typeof sentences[i] === "object" ? sentences[i].text : "";
      total += mentionUnit(whole || sentenceFlatOf(sentences[i]));
      if (total > 5000) break; // 早就超过门槛了，不用再数
    }
    return total;
  }

  // 人物 / 设定记录在正文里的「戏份」：名字 + 别名（含字段里写的别名）提到过的句子总字数
  function recordEvidenceChars(r, sentences) {
    const names = [r && r.name].concat(nameAliasesOf(r || {}));
    (r && r.fields ? r.fields : []).forEach((f) => {
      if (!/别名|别称|又称|其他写法|同义词|曾用名/.test(String((f && f.label) || ""))) return;
      String((f && f.value) || "")
        .split(/[、,，;；/]/)
        .forEach((v) => {
          const t = v.trim();
          if (t) names.push(t);
        });
    });
    return evidenceCharsOf(names, sentences);
  }

  function allSegments() {
    const out = [];
    ((state.analysis && state.analysis.tasks) || []).forEach((t) => (t.segments || []).forEach((s) => out.push(s)));
    return out;
  }

  // 这个文件里的章对应到哪一章（文件里的「第一章·风的脚步」是哪一章）
  function chapterIdOfFile(fileId) {
    if (!fileId) return "";
    const seg = allSegments().find((s) => s.fileId === fileId && s.chapterId);
    return seg && getChapter(seg.chapterId) ? seg.chapterId : "";
  }

  // 来源标签能落在哪些地方：可能是某一章，也可能是「好几章里都有的同名小节」
  function placesForSource(label) {
    const t = String(label || "").trim();
    if (!t || /未分章/.test(t)) return [];
    const out = [];
    (state.chapters || []).forEach((c, idx) => {
      if (String(c.title || "").trim() === t) {
        out.push({ chapterId: c.id, chapterIdx: idx, sectionId: "" });
        return;
      }
      (c.sections || []).forEach((sec) => {
        if (String(sec.title || "").trim() === t) out.push({ chapterId: c.id, chapterIdx: idx, sectionId: sec.id });
      });
    });
    return out;
  }

  // 分析来源的段落标签 → 章 / 节。
  // 要点：多个章里都可能有同名小节（Part.1…Part.5 很常见），所以优先用「分段上登记过的归属」，
  // 其次用「同一个文件对应的那一章」区分，避免所有事件都被算到第一章。
  function placeForSource(label, fileId, opts) {
    const noCreate = !!(opts && opts.noCreate);
    const raw = String(label || "").trim();
    if (!raw || /未分章/.test(raw)) return { chapterId: "", sectionId: "" };
    // 合并分析（每次 2~3 章）时，结果上记的是「第一章–第二章」这种跨度；
    // 优先用它自己的 segId（组里第一段）定位，避免再按拼接标题造出一个假章。
    const wantSegId = opts && opts.segId;
    if (wantSegId) {
      const own = allSegments().find((s) => s.id === wantSegId && s.chapterId && getChapter(s.chapterId));
      if (own) return { chapterId: own.chapterId, sectionId: own.sectionId || "" };
    }
    /* 两种合写要分开处理：
       「第一章–第二章」是合并分析的跨度，先试前半段（组里第一段）；
       「第一章 · 第一节」是章 + 节，先试后半段（节）。 */
    const rangeParts = raw
      // 只认合并分析用的短横「–」/ 波浪号；不要拆章节标题里常见的破折号「——」
      .split(/[–~～]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    /* 「第九章·八音盒 · Part.1 少女·上」：章名自己带无空格的「·」，
       真正分隔章 / 节的是带空格的「 · 」。先按带空格的切，才不会把章名切碎。 */
    const sectionParts = (/\s[·・|｜/]\s/.test(raw)
      ? raw.split(/\s[·・|｜/]\s+/)
      : raw.split(/[·・|｜/]+/))
      .map((s) => s.trim())
      .filter(Boolean);
    const tries =
      rangeParts.length > 1
        ? [raw].concat(rangeParts)
        : sectionParts.length > 1
        ? [raw].concat(sectionParts.slice().reverse())
        : [raw];
    for (const t of tries) {
      const seg = allSegments().find(
        (s) => String(s.label || "").trim() === t && (!fileId || s.fileId === fileId) && s.chapterId && getChapter(s.chapterId)
      );
      if (seg) return { chapterId: seg.chapterId, sectionId: seg.sectionId || "" };
    }
    for (const t of tries) {
      const cand = placesForSource(t);
      if (cand.length === 1) {
        const c = getChapter(cand[0].chapterId);
        // 只有一章同名、但它属于另一份文件：不能把这份文件的事件塞过去
        if (!fileId || !c || !c.sourceFileId || String(c.sourceFileId) === String(fileId)) {
          return { chapterId: cand[0].chapterId, sectionId: cand[0].sectionId };
        }
      }
      if (cand.length > 1) {
        const exact = fileId
          ? cand.find((c) => {
              const ch = getChapter(c.chapterId);
              return ch && String(ch.sourceFileId || "") === String(fileId);
            })
          : null;
        const manual = cand.find((c) => {
          const ch = getChapter(c.chapterId);
          return ch && !ch.sourceFileId;
        });
        const use = exact || manual;
        if (use) return { chapterId: use.chapterId, sectionId: use.sectionId };
      }
    }
    // 还没建过章节：只有像「章」的标题才自动补一章，像「Part.1」这种小节名不建章
    const autoT =
      tries.find(
        (t) =>
          !looksLikeSectionTitle(t) &&
          !/^(?:part|episode|section)[\s.．·\-]*[0-9ivxlcdm]+/i.test(t) &&
          looksLikeHeadingLine(t)
      ) || "";
    if (autoT && !noCreate) {
      const c = newChapter(autoT);
      if (fileId) c.sourceFileId = fileId;
      bumpStateRev(); // 新章还没进索引缓存，后面的 getChapter 要能看到它
      return { chapterId: c.id, sectionId: "" };
    }
    return { chapterId: "", sectionId: "" };
  }

  /* ---- 出处显示：章 · 节 · #行号 ---- */
  // 只查已经建好的章 / 节（显示用，不新建）
  function placeLookup(label, fileId) {
    const raw = String(label || "").trim();
    if (!raw) return { chapterId: "", sectionId: "" };
    const parts = raw
      .split(/[·・|｜/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tries = parts.length > 1 ? [raw].concat(parts.slice().reverse()) : [raw];
    for (const t of tries) {
      const seg = allSegments().find(
        (s) => String(s.label || "").trim() === t && (!fileId || s.fileId === fileId) && s.chapterId && getChapter(s.chapterId)
      );
      if (seg) return { chapterId: seg.chapterId, sectionId: seg.sectionId || "" };
    }
    for (const t of tries) {
      const ch = (state.chapters || []).find((c) => String(c.title || "").trim() === t);
      if (ch) return { chapterId: ch.id, sectionId: "" };
      let hit = null;
      (state.chapters || []).forEach((c) => {
        (c.sections || []).forEach((s) => {
          if (!hit && String(s.title || "").trim() === t) hit = { chapterId: c.id, sectionId: s.id };
        });
      });
      if (hit) return hit;
    }
    return { chapterId: "", sectionId: "" };
  }

  // 事件在事件轴上是第几个 #（1 起算）
