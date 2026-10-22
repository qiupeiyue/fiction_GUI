  /* 后处理（综合汇总 / 雷达重判 / 反思）请求用**独立**的 AbortController：
     用户点「暂停」时立刻掐断在途请求（回包丢弃、目标重新排队），继续后用新 controller 重发；
     「终止」仍然由 analysisRun.controller 联动。这样暂停不用等一条几分钟的请求跑完。 */
  function postSignal() {
    if (!postAbortCtl || postAbortCtl.signal.aborted) {
      postAbortCtl = new AbortController();
      const stopSig = analysisRun && analysisRun.controller && analysisRun.controller.signal;
      if (stopSig) {
        if (stopSig.aborted) postAbortCtl.abort();
        else stopSig.addEventListener("abort", () => abortPostProcessing(), { once: true });
      }
    }
    return postAbortCtl.signal;
  }
  function abortPostProcessing() {
    if (postAbortCtl && !postAbortCtl.signal.aborted) {
      try {
        postAbortCtl.abort();
      } catch (e) {
        /* ignore */
      }
    }
  }
  async function analyzeTask(mode, opts) {
    if (analysisRun && !analysisRun.finished) return;
    const task = getSelectedTask();
    if (!task) return;
    if (agentDisabled) {
      uiAlert("Agent 已被禁用。想恢复的话，去「设置 → Agent」点一下「恢复 Agent」。");
      return;
    }
    const cfg = loadAgentConfig();
    if (!cfg.apiKey) {
      uiAlert("请先在「设置 → Agent」里填写 API Key。");
      openAgentModal();
      return;
    }
    /* 这一轮的 token 账（含"提示缓存命中"）从**一开始**就记：分析请求才是大头 */
    if (typeof resetAgentTokenStat === "function") resetAgentTokenStat();
    const postOnly = mode === "post" || mode === "post-summary" || mode === "post-reflect";
    // 全文顺序 = 文件顺序 → 文件内章节顺序。没有章节标题的文件按整篇作为一个单元。
    /* 「每次几章」（用户 2026-10-17）：>1 时把相邻几章合成一次分析 ——
       省的是每次都要重发的那 1.5 万字系统提示；代价是出处变成「第X章–第Y章」。
       设置里默认 1（不合并，和以前完全一样）。 */
    const chaptersPerCall = Math.max(1, Math.min(3, Math.floor(Number(cfg.chaptersPerCall) || 1)));
    const allUnits = groupAnalysisUnits(buildAnalysisUnits(task), chaptersPerCall);
    /* 勾选只看每一项自己：界面上勾 / 取消「章」时会把下面的「节」一起带上（renderSegments 里级联），
       所以正常操作不会出现"章没勾、节还勾着"；而「勾选分析失败项目」可以只勾中失败的节，
       不必把已经成功的整章再跑一遍（用户 2026-10-17）。merge 段跟上一段一起走。 */
    const inScope = (u) => (u.seg ? u.seg.included !== false : true);
    let units = [];
    if (!postOnly) {
    if (mode === "retry") {
      // 只补跑失败过的片段：成功的分块不重跑，结果也不清空
      const only = opts && opts.ids ? opts.ids : null;
      units = allUnits.filter((u) => {
        const obj = u.seg || u.file;
        if (!obj || !(obj.failChunks || []).length) return false;
        if (only && !only.has(obj.id)) return false;
        return inScope(u) && !!u.text;
      });
      if (!units.length) {
        uiAlert("没有需要重跑的失败片段。");
        return;
      }
    } else {
      /* 先按「勾选的章 / 节」取范围；一个都没勾时**不能**再问「要不要全部重跑」——
         那会被误解成"没勾也会跑"（用户 2026-10-17）。 */
      const selectedUnits = allUnits.filter((u) => inScope(u) && u.text);
      if (!selectedUnits.length) {
        uiAlert(uiTextFor("没有勾选任何章 / 节：先勾上要分析的章 / 节，再点「开始分析」。"));
        return;
      }
      /* 「开始分析」＝**分析所有勾选的章 / 节**，不管之前有没有分析过（用户 2026-10-17 明确要求）：
         勾着就重跑，旧结果由 purgeResultsForUnits 按单元替换；不再弹「都已分析过，要全部重跑吗？」。 */
      units = selectedUnits;
    }
    if (!units.length) {
      uiAlert("没有可分析的内容：请确认已导入文件，并勾选了要分析的章节。");
      return;
    }
    }
    // 清掉这些单元产生的旧结果（「重跑失败部分」不清旧结果、不重置状态，只补失败的那几块）
    const isRetry = mode === "retry";
    if (!isRetry && !postOnly) {
      purgeResultsForUnits(task, units, mode);
      units.forEach((u) => {
        const obj = u.seg || u.file;
        if (!obj) return;
        obj.analyzed = false;
        obj.okChunks = [];
        obj.failChunks = [];
        obj.lastError = "";
      });
    }
    if (!postOnly) {
      /* 整轮分析算**一步**撤销：开头先强行记下「分析结果」，中途落盘一律 noUndo，
         这样顶栏一次「撤销」就能回到分析前（用户 2026-10-17 去掉「撤销本次重分析」后）。 */
      pendingUndoLabel = uiTextFor("分析结果");
      saveState({ forceUndo: true });
    }
    const records = [];
    const jobs = [];
    const unitChunkCount = new Map(); // 单元 id → 分块总数（失败分块号是相对它来记的）
    unitProgress = new Map();
    runUnitObjects = new Map();
    units.forEach((u) => {
      // 一个章 / 节就是一个整体：整段文字一次性发给模型，不按字数切开
      // （并行 = 多个章 / 节同时分析，而不是把一章拆成几段）
      // 只有超过上限的超长单元才会切开，而且只在自然段落 / 句子边界切。
      // 上限按「正文自己是什么语言」折算：中日文 3 万等效字（≈3 万字符），
      // 英文按词折算后字符数会大不少（英文一句话的信息量摊在更多字符上），
      // 这样英文小说不会因为「字符多」被切得太碎（和界面语言无关）。
      const cutLimit = splitLimitFor(u.text);
      const chunks = u.text.length > cutLimit ? smartChunk(u.text, cutLimit, 300) : [u.text];
      const obj = u.seg || u.file;
      /* 合并过的单元：组里所有段（含"并入上一段"的）收尾时要一起标「已分析」 */
      const objs = (u.groupSegIds && u.groupSegIds.length
        ? u.groupSegIds.map((id) => (task.segments || []).find((s) => s.id === id)).filter(Boolean)
        : [obj]
      ).filter(Boolean);
      const onlyFailed = isRetry && obj ? new Set(obj.failChunks || []) : null;
      if (obj) {
        unitChunkCount.set(obj.id, chunks.length);
        runUnitObjects.set(obj.id, obj);
        unitProgress.set(obj.id, { done: 0, total: 0, failed: 0, running: false });
        objs.forEach((o) => {
          if (o === obj) return;
          unitChunkCount.set(o.id, chunks.length);
          runUnitObjects.set(o.id, o);
          unitProgress.set(o.id, { done: 0, total: 0, failed: 0, running: false });
        });
      }
      chunks.forEach((c, ci) => {
        if (onlyFailed && !onlyFailed.has(ci)) return;
        if (obj) unitProgress.get(obj.id).total++;
        objs.forEach((o) => {
          if (o !== obj && unitProgress.has(o.id)) unitProgress.get(o.id).total++;
        });
        jobs.push({
          segId: u.segId,
          fileId: u.fileId,
          label: u.label,
          chapterLabel: u.chapterLabel || "",
          text: c,
          part: ci + 1,
          parts: chunks.length,
          pos: u.pos + 1,
          total: units.length,
          seq: u.pos * 100000 + ci,
          groupCount: (u.group && u.group.length) || 1,
          objs: objs,
        });
      });
    });

    // 重跑开始了：先把这一轮要分析的单元按「排队中」重画一遍 ——
    // 状态这时已经重置，但界面还是旧画面，不重画就会留着「已分析」的绿胶囊
    runUnitObjects.forEach((obj) => paintUnitProgress(obj.id));
    new Set(units.map((u) => u.fileId).filter(Boolean)).forEach((fid) => paintFileProgress(task, fid));

    const segStat = new Map();
    const fileStat = new Map();
    jobs.forEach((j) => {
      if (j.segId) {
        const st = segStat.get(j.segId) || { total: 0, done: 0, fail: 0 };
        st.total++;
        segStat.set(j.segId, st);
      } else {
        const st = fileStat.get(j.fileId) || { total: 0, done: 0, fail: 0 };
        st.total++;
        fileStat.set(j.fileId, st);
      }
    });

    const concurrency = Math.max(1, Math.min(5, cfg.concurrency || 3));
    postAbortCtl = null;
    analysisRun = {
      paused: false,
      stopped: false,
      finished: false,
      controller: new AbortController(),
      total: jobs.length,
      taskId: task.id,
      pct: 0,
      pctLabel: "准备中…",
    };
    renderTaskList(); // 任务栏上标出「分析中」
    updateRunButtons();

    let completed = 0;
    let failed = 0;
    let firstError = null;
    let nextIndex = 0;
    const startedAt = Date.now();
    let wsPrompt = null; // 工作区已有信息（整轮只算一次，所有分块共用同一份）

    const isStopped = () => !!(analysisRun && analysisRun.stopped);
    const waitWhilePaused = async () => {
      if (!analysisRun || !analysisRun.paused || isStopped()) return;
      setAnalyzeStatus(uiTextFor("已暂停，点击「继续」恢复。"));
      while (analysisRun.paused && !isStopped()) await sleep(200);
    };
    // 并行请求撞上限流时，让所有 worker 一起等一会儿再发下一个请求
    let cooldownUntil = 0;
    const waitCooldown = async () => {
      while (!isStopped() && Date.now() < cooldownUntil) {
        await sleep(Math.max(120, Math.min(600, cooldownUntil - Date.now())));
      }
    };
    const bumpCooldown = (ms) => {
      cooldownUntil = Math.max(cooldownUntil, Date.now() + ms);
    };
    /* 可被「终止」打断的等待：429 的 retry-after 最长能到 2 分钟（34-text-utils 里封顶 120000），
       不能让用户点完「终止」还干等——这就是「终止了还显示被占用、切不了任务」的原因（用户 2026-10-16 报）。 */
    const sleepUnlessStopped = async (ms) => {
      const t0 = Date.now();
      while (!isStopped() && Date.now() - t0 < ms) await sleep(Math.min(200, Math.max(20, ms)));
    };
    // 分析期间用户可能暂停去编辑 / 撤销 / 切换小说：任务对象随时可能被替换，
    // 写回前一律按 id 重新认一遍；认不到（任务被删了）就丢弃这次结果。
    const liveTask = () => (state.analysis.tasks || []).find((x) => x.id === task.id) || null;
    const flush = () => {
      if (records.length) {
        // 并行返回顺序是乱的，先按分块顺序号归位
        records.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
        const batch = records.slice();
        records.length = 0;
        // 分析期间用户可以暂停去编辑 / 撤销，任务对象可能已经被换掉（撤销是深拷贝复原）：
        // 按 id 重新认一遍任务再写回，认不到就丢弃，免得写进已废弃的对象里。
        const lt = liveTask();
        if (lt) {
          lt.results = dedupeRecords((lt.results || []).concat(batch));
          lt.updatedAt = Date.now();
          saveState({ noUndo: true });
        }
      }
    };
    const updateStatus = () => {
      if (isStopped() || analysisRun.paused) return;
      const sec = Math.round((Date.now() - startedAt) / 1000);
      setAnalyzeStatus(`正在分析（并发 ${concurrency}）· 已完成 ${completed}/${jobs.length} · 用时 ${sec}s${failed ? ` · 失败 ${failed}` : ""}`);
    };

    setAnalyzeStatus("开始分析…");
    showProgress(0, `0 / ${jobs.length}`);

    /* ---------- 任务级「综合汇总」（用户 2026-10-17：静默做、不加按钮、省开销）----------
       「一章一块」分析出来的记录是机械合并的（字段「；」硬拼、雷达取各段平均），
       对**跨章节反复出现**的人（主人公那种，最难识别准）不够看。这里只挑值得的几条，
       一次请求综合成一条更像人话的记录：字段重写（不丢信息）、雷达综观全部依据重判。
       省钱要点：**只挑出现 ≥3 段或已有字段特别长的**，最多 SYNTH_MAX 条，逐个顺序请求，
       随时可被「终止」打断；失败就保留原样，不影响这次分析的其他结果。 */
    const SYNTH_MAX = 12;
    const CHUNK_OVERLAP = 240; // 重叠目标 ≈ 240 字（约 2~3 句 / 一个小段落）；下面还会对齐到句末，实际略多
    /* ---------- 「只跑一次」：后处理别把没变的记录重新请求一遍（用户 2026-10-17）----------
       分卷 / 分批分析时，每跑一次都会把同一条老记录重新综合、重新评分、重新反思 —— 全是重复花钱。
       这里给每条记录记一个"上次做完那一步时"的指纹（`r.pp`），内容没变就跳过。
       指纹变了（合并进新材料 / 用户改过字段 / 上一步改过它）才会重做。 */
    function recordSig(r) {
      const f = (r.fields || []).map((x) => String((x && x.label) || "") + "=" + String((x && x.value) || "")).join("\n");
      return [
        String(r.type || ""),
        String(r.name || ""),
        Number(r.mergedFrom) || 1,
        JSON.stringify(r.radar || {}),
        (r.sources || []).join(","),
        f,
      ].join("|");
    }
    function ppDone(r, step) {
      return !!(r && r.pp && r.pp[step] && r.pp[step] === recordSig(r));
    }
    function ppMark(r, step) {
      if (!r) return;
      r.pp = Object.assign({}, r.pp || {}, { [step]: recordSig(r) });
    }
    /* 后处理三步（综合汇总 / 雷达综合评分 / 反思校验）用的系统提示：
       以前它们都背着那份 1.5 万字的**识别用**提示（里面全是"怎么从原文抽记录"的规矩），
       既贵又跑题。现在各用一句短提示（也更适合被缓存）。 */
    const POST_SYSTEM =
      "你是小说设定整理助手。严格按用户的要求，只输出 JSON（不要解释、不要 markdown 代码块）；" +
      "字段值精简、只写有依据的内容，不编造。";
    function synthTargets(task) {
      return ((task && task.results) || [])
        .filter((r) => r && r.type && r.name && !ppDone(r, "synth"))
        .map((r) => ({
          r: r,
          merges: Number(r.mergedFrom) || 1,
          size: (r.fields || []).reduce((n, f) => n + String((f && f.value) || "").length, 0),
        }))
        .filter((x) => x.merges >= 3 || x.size >= 260)
        .sort((a, b) => b.merges - a.merges || b.size - a.size)
        .slice(0, SYNTH_MAX)
        .map((x) => x.r);
    }
    /* 反思校验挑谁核（用户 2026-10-17 改口）：
       ① **只核「人物 / 关系」这两类**，设定条目（物品 / 技能 / 地点 / 势力 / 名词…）不做 ——
          条目又多又碎，逐条回原文核对既贵、收益也小；事件 / 身份合并记录同样不做。
       ② 门槛比综合汇总那条（`mergedFrom ≥ 3` 或字段 ≥ 260 字）**放宽一档** ——
          只在这两类里挑，值得多核几条。 */
    const REFLECT_TYPES = ["character", "relation"];
    const REFLECT_MAX = 20;
    function reflectTargets(task) {
      return ((task && task.results) || [])
        .filter((r) => r && r.name && REFLECT_TYPES.indexOf(String(r.type)) >= 0 && !ppDone(r, "reflect"))
        .map((r) => ({
          r: r,
          merges: Number(r.mergedFrom) || 1,
          size: (r.fields || []).reduce((n, f) => n + String((f && f.value) || "").length, 0),
        }))
        .filter((x) => x.merges >= 2 || x.size >= 150)
        .sort((a, b) => b.merges - a.merges || b.size - a.size)
        .slice(0, REFLECT_MAX)
        .map((x) => x.r);
    }
    function synthPromptFor(r) {
      const lines = [];
      lines.push(
        "【任务】下面这些是同一个「" +
          r.name +
          "」（类型 " +
          r.type +
          "）在不同章节里识别出来的信息，可能重复、可能互相补充。请综合成**一条**记录，只输出 JSON：{\"records\":[{…}]}，格式与之前的识别结果完全一样。"
      );
      lines.push(
        "要求：① fields 把各段信息合成完整表述，**一条信息都不能丢**；同义重复的合并成一句自然的话（读着像人话，不要用「；」硬拼）；" +
          "② radar 综观全部依据重判一次（每维 0~10；仍然「没依据就别写、绝不用 0 顶替」），radarWhy 按顶点写清依据；③ summary 写一句概括。" +
          "④ 同一条信息如果在不同阶段不一样（人物前后变化），**两边都要留**，写成「前期…／后期…」；" +
          "**「前期 / 后期」按故事里的时间判断，不是按章节先后**（倒叙 / 插叙 / 回忆 / 番外很常见），请按文中的时间线索分前后。"
      );
      if (r.name) lines.push("名字：" + r.name);
      const fields = (r.fields || []).filter((f) => f && String(f.value || "").trim());
      if (fields.length) lines.push("已有字段：\n" + fields.map((f) => "· " + String(f.label || "字段") + "＝" + String(f.value)).join("\n"));
      if (r.radar && Object.keys(r.radar).length) lines.push("现在的分数：" + JSON.stringify(r.radar));
      /* 优先用分块级 radarEvidence（每段的原始引文都在），老数据才退回拼接后的 radarWhy。 */
      const evList =
        typeof radarEvidenceInOrder === "function"
          ? radarEvidenceInOrder(radarEvidenceListOf(r))
          : typeof radarEvidenceListOf === "function"
          ? radarEvidenceListOf(r)
          : [];
      if (evList.length) {
        const MAX_EV = 30;
        const sampled = typeof sampleEvenly === "function" ? sampleEvenly(evList, MAX_EV) : evList.slice(0, MAX_EV);
        const rows = sampled
          .map((ev) => {
            const parts = Object.keys(ev.radarWhy || {})
              .map((k) => {
                const txt = String(ev.radarWhy[k] || "").trim();
                if (!txt) return "";
                const score = ev.radar && isFinite(Number(ev.radar[k])) ? "（" + Number(ev.radar[k]) + " 分）" : "";
                return k + "：" + txt + score;
              })
              .filter(Boolean);
            /* 每个维度都给一点位置：先按维度数均分 700 字，别让「；」拼完再切把后面的维度切没。 */
            const perAxis = Math.max(60, Math.floor(700 / Math.max(1, parts.length)));
            const body = (parts.length
              ? parts.map((p) => (p.length > perAxis ? p.slice(0, perAxis) + "…" : p)).join("；")
              : JSON.stringify(ev.radar || {})
            ).slice(0, 900);
            return "· " + (ev.source ? "[" + ev.source + "] " : "") + body;
          })
          .filter(Boolean);
        if (rows.length) {
          lines.push(
            "各段依据（" +
              (evList.length > sampled.length
                ? "共 " + evList.length + " 段，按早/中/晚抽 " + sampled.length + " 段；没列出的段落仍可能有依据"
                : "共 " + evList.length + " 段") +
              "）：\n" +
              rows.join("\n")
          );
        }
      } else {
        const why = r.radarWhy && typeof r.radarWhy === "object" ? Object.keys(r.radarWhy) : [];
        if (why.length) lines.push("各段依据：\n" + why.map((k) => "· " + k + "：" + String(r.radarWhy[k])).join("\n"));
      }
      if (String(r.summary || "").trim()) lines.push("已有概述：" + String(r.summary));
      if (String(r.source || "").trim()) lines.push("出处：" + String(r.source));
      return lines.join("\n\n");
    }
    /* 把综合结果**并回**原来那条：只认它给了的部分；它漏掉的字段 / 顶点一律保留老的（绝不丢信息） */
    function applySynth(r, rec) {
      if (!rec) return false;
      if (Array.isArray(rec.fields)) rec.fields = stripInternalRadarFields(rec.fields);
      let changed = false;
      if (Array.isArray(rec.fields) && rec.fields.length) {
        const next = mergeFieldLists(r.fields, rec.fields);
        /* 模型重写过的字段以它为准（读着像人话），它没提到的字段保留原样 */
        const byLabel = new Map(next.map((f) => [f.label, f]));
        (rec.fields || []).forEach((f) => {
          const k = String((f && f.label) || "").trim();
          const v = String((f && f.value) == null ? "" : f.value).trim();
          if (k && v && byLabel.has(k)) byLabel.get(k).value = String(f.value);
        });
        const out = (r.fields || []).map((f) => (byLabel.has(f.label) ? byLabel.get(f.label) : f));
        next.forEach((f) => {
          if (!(r.fields || []).some((o) => o.label === f.label)) out.push(f);
        });
        if (JSON.stringify(out) !== JSON.stringify(r.fields)) {
          r.fields = out;
          changed = true;
        }
      }
      if (rec.radar && typeof rec.radar === "object" && Object.keys(rec.radar).length) {
        const next = Object.assign({}, r.radar || {});
        Object.keys(rec.radar).forEach((k) => {
          const v = Number(rec.radar[k]);
          if (isFinite(v)) next[k] = Math.round(v * 10) / 10;
        });
        if (JSON.stringify(next) !== JSON.stringify(r.radar || {})) {
          r.radar = next;
          changed = true;
        }
        /* 这是模型**综观全部依据重判**出来的分，不是"若干条的平均"：
           把等权平均用的累加值清掉，免得以后合并时又把它当成 n 条样本再摊一次。 */
        delete r.radarSum;
        delete r.radarN;
      }
      if (rec.radarWhy && typeof rec.radarWhy === "object") {
        const next = Object.assign({}, r.radarWhy || {});
        Object.keys(rec.radarWhy).forEach((k) => {
          const v = String(rec.radarWhy[k] == null ? "" : rec.radarWhy[k]).trim();
          if (v) next[k] = v;
        });
        r.radarWhy = next;
      }
      const s = String(rec.summary || "").trim();
      if (s && s !== String(r.summary || "").trim()) {
        r.summary = s;
        changed = true;
      }
      return changed;
    }
    async function synthesizeTaskResults(task) {
      const targets = synthTargets(task);
      if (!targets.length || isStopped()) return 0;
      let done = 0;
      let processed = 0;
      let next = 0;
      const queue = targets.slice();
      /* 每条的提示词互不依赖，按用户配置的并发数并行；请求内容、合并口径和串行时完全一致，
         只是不再一条条等网络。暂停后不再取新目标，已在途的请求照常收尾。 */
      const workers = Math.max(1, Math.min(4, Number(cfg.concurrency) || 1, targets.length));
      const worker = async () => {
        while (!isStopped()) {
          await waitWhilePaused();
          if (isStopped()) return;
          const i = next++;
          if (i >= queue.length) return;
          const r = queue[i];
          setAnalyzeStatusProgress(uiTextFor("正在综合汇总…"), processed, targets.length);
          try {
            const res = await callAgent(cfg, synthPromptFor(r), postSignal(), null, POST_SYSTEM);
            const rec = ((res && res.records) || [])[0];
            if (rec && applySynth(r, rec)) done++;
            /* 模型没给新内容也算"这一步做过了"（不然每次都会再问一遍，白花钱）；
               指纹在 applySynth **之后**取 —— 记的是"这一步做完时的状态" */
            ppMark(r, "synth");
          } catch (e) {
            /* 暂停时主动掐断的在途请求：这条放回队尾，继续后用新的 controller 重发 */
            if (!isStopped() && analysisRun.paused) {
              queue.push(r);
              continue;
            }
            /* 静默：这一条失败就留着机械合并的结果，不打扰用户 */
          }
          processed++;
          setAnalyzeStatusProgress(uiTextFor("正在综合汇总…"), processed, targets.length);
        }
      };
      await Promise.all(Array.from({ length: workers }, worker));
      if (done) pendingUndoLabel = uiTextFor("综合汇总识别结果");
      return done;
    }
    /* ---------- 雷达「按依据综合评分」（用户 2026-10-17 的思路）----------
       不要把各次识别出来的分数做数学平均（哪怕是等权）：分数是模型对**那一段**的印象，
       真正该做的是把每次打分的**依据（原文摘录）连同一点点上下文**收集起来，
       拼成一份"这个人在这本书里的表现档案"，再让模型**综观全部依据给一次综合分**。
       · 依据来源：合并时逐顶点接起来的 `radarWhy`（提示词要求写成「原文摘录」+ 一句理由）；
       · 上下文：把摘录拿回它所在的那一段里，前后各取 120 字；
       · 只处理「人物 / 关系」且**至少合并过两段**的记录（一段材料的分数本来就是一次判断）；
       · 最多 RADAR_SCORE_MAX 条、逐条顺序、随时可终止；失败就保留等权平均的结果。
       跨任务不做（用户 2026-10-17 明确：代价太大）——这套只在单个任务内跑。 */
    const RADAR_SCORE_MAX = 20;
    const RADAR_CTX = 120;
    const RADAR_DOSSIER_MAX = 6000;
    function radarScoreTargets(task) {
      return ((task && task.results) || [])
        .filter(
          (r) =>
            r &&
            r.name &&
            ["character", "relation"].indexOf(String(r.type)) >= 0 &&
            r.radar &&
            typeof r.radar === "object" &&
            Object.keys(r.radar).length &&
            (Number(r.mergedFrom) || 1) >= 2 &&
            !ppDone(r, "radar")
        )
        .map((r) => ({ r, merges: Number(r.mergedFrom) || 1 }))
        .sort((a, b) => b.merges - a.merges)
        .slice(0, RADAR_SCORE_MAX)
        .map((x) => x.r);
    }
    function buildRadarDossier(task, r) {
      const labels = (Array.isArray(r && r.sources) && r.sources.length
        ? r.sources
        : String((r && r.source) || "").split(/[·・|｜/]+/)
      )
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      const refs = Array.isArray(r && r.sourceRefs) ? r.sourceRefs.slice() : [];
      refs.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
      const segByRef = (ref) => {
        if (!ref) return null;
        return (
          (ref.segId && (task.segments || []).find((s) => s.id === ref.segId)) ||
          (ref.source && (task.segments || []).find((s) => s.fileId === ref.fileId && s.label === ref.source)) ||
          null
        );
      };
      const byRef = [];
      refs.forEach((ref) => {
        const seg = segByRef(ref);
        if (seg && byRef.indexOf(seg) < 0) byRef.push(seg);
      });
      const texts = (byRef.length ? byRef : (task.segments || []).filter((s) => labels.indexOf(s.label) >= 0))
        .map((s) => ({ label: s.label, text: segmentTextOf(task, s) }))
        .filter((x) => x.text);
      if (!texts.length) (task.files || []).forEach((f) => f.text && texts.push({ label: "", text: String(f.text) }));
      const blocks = [];
      const evidenceLine = (part, text, source, score) => {
        /* 模型不一定用「」：也认 “”、""、‘’（旧数据里约四分之一是弯引号）。 */
        const quote = (typeof radarQuotesOf === "function" ? radarQuotesOf(part)[0] : "") || "";
        let ctx = "";
        if (quote) {
          const hit =
            (text && text.indexOf(quote) >= 0 && { text }) ||
            texts.find((t) => t.text.indexOf(quote) >= 0) ||
            null;
          if (hit) {
            const at = hit.text.indexOf(quote);
            const a = Math.max(0, at - RADAR_CTX);
            const b2 = Math.min(hit.text.length, at + quote.length + RADAR_CTX);
            ctx = hit.text.slice(a, b2).replace(/\s+/g, " ").trim();
          }
        }
        const why = part
          .replace(/「[^」]*」|“[^”]*”|"[^"]*"|‘[^’]*’/g, "")
          .replace(/^[—\-–：:，,\s]+/, "")
          .trim();
        const scoreTag = isFinite(Number(score)) ? "（该段 " + Number(score) + " 分）" : "";
        return (
          "· " +
          (source ? "[" + source + "] " : "") +
          (quote ? "「" + quote + "」 " : "") +
          why +
          scoreTag +
          (ctx ? "\n  上下文：" + ctx : "")
        );
      };
      /* 新数据：每段的原文理由都在 radarEvidence 里，按维度收起来（带出处和当时的分）。 */
      const evList =
        typeof radarEvidenceInOrder === "function"
          ? radarEvidenceInOrder(radarEvidenceListOf(r))
          : typeof radarEvidenceListOf === "function"
          ? radarEvidenceListOf(r)
          : [];
      if (evList.length) {
        const byAxis = {};
        evList.forEach((ev) => {
          const ownSeg = segByRef(ev);
          const ownText = ownSeg ? segmentTextOf(task, ownSeg) : "";
          Object.keys(ev.radarWhy || {}).forEach((axis) => {
            const raw = String((ev.radarWhy && ev.radarWhy[axis]) || "").trim();
            if (!raw) return;
            (byAxis[axis] || (byAxis[axis] = [])).push({
              raw: raw,
              text: ownText,
              source: ev.source || "",
              score: ev.radar ? ev.radar[axis] : null,
            });
          });
        });
        const axisNames = Object.keys(byAxis);
        const pick = (arr, n) => (typeof sampleEvenly === "function" ? sampleEvenly(arr, n) : arr.slice(0, n));
        /* 每个维度先按「早 / 中 / 晚」抽 8 条；总预算超了就整体减半，
           保证每个维度都还在，而不是前面的维度把预算吃光。 */
        const buildEvBlocks = (limit) => {
          const out = [];
          axisNames.forEach((axis) => {
            const items = pick(byAxis[axis], limit).map((x) =>
              evidenceLine(x.raw, x.text, x.source, x.score)
            );
            if (items.length) out.push("【" + axis + "】\n" + items.join("\n"));
          });
          return out;
        };
        let limit = 8;
        let evBlocks = buildEvBlocks(limit);
        while (evBlocks.join("\n\n").length > RADAR_DOSSIER_MAX && limit > 1) {
          limit = Math.max(1, Math.floor(limit / 2));
          evBlocks = buildEvBlocks(limit);
        }
        if (evBlocks.length) {
          let text = evBlocks.join("\n\n");
          if (text.length > RADAR_DOSSIER_MAX) {
            /* 每个维度至少留一段：按维度均分预算，别让靠后的维度整段消失。 */
            const per = Math.max(160, Math.floor(RADAR_DOSSIER_MAX / Math.max(1, evBlocks.length)) - 4);
            text = evBlocks.map((b) => (b.length > per ? b.slice(0, per) + "…" : b)).join("\n\n");
          }
          return text.slice(0, RADAR_DOSSIER_MAX);
        }
      }
      /* 老存档：radarWhy 是按顶点用「；」接起来的，一条一条摊开（至少还能跑）。 */
      const axes = Object.keys(r.radarWhy || {});
      axes.forEach((axis) => {
        const raw = String((r.radarWhy && r.radarWhy[axis]) || "").trim();
        if (!raw) return;
        const parts = raw
          .split("；")
          .map((s) => s.trim())
          .filter(Boolean);
        const picked = typeof sampleEvenly === "function" ? sampleEvenly(parts, 8) : parts.slice(0, 8);
        const items = picked.map((p) => evidenceLine(p, "", "", null));
        if (items.length) blocks.push("【" + axis + "】\n" + items.join("\n"));
      });
      return blocks.join("\n\n").slice(0, RADAR_DOSSIER_MAX);
    }
    function radarScorePromptFor(r, dossier) {
      /* 维度名后面把作者写的**说明**也带上（设置 → 人物 → 雷达图 里的"说明"）：
         光给名字（比如"体质"）模型容易按字面理解打分。 */
      const defs = typeof radarAxes === "function" ? radarAxes() : [];
      const axes = Object.keys(r.radar || {})
        .map((k) => {
          const hit = (defs || []).find((a) => a && a.label === k);
          return hit && String(hit.desc || "").trim() ? k + "（" + String(hit.desc).trim() + "）" : k;
        })
        .join("、");
      return (
        "【任务】下面是同一个「" +
        r.name +
        "」（类型 " +
        r.type +
        "）在全书各章里的**雷达评分依据**：每条包含原文摘录、一点点上下文和当时给分的理由；" +
        "证据多时会按早 / 中 / 晚抽取，没列出的段落仍可能有依据。" +
        "请综观这些依据，给每个维度一个**综合分**（0~10，可小数），并写一句综合理由。\n" +
        "要求：① 这是**综合判断**，不是数学平均 —— 按证据的质量与数量权衡（反复出现、具体行为 > 一句评价 > 泛泛描写）；" +
        "② 前后变化（人物弧光）按**故事里的时间**判断，不是按章节先后：后期为主就按后期，或者写清「前期…／后期…」；" +
        "③ 没有依据的维度**不要给分**（不要用 0 顶替）；④ 不要因为某一段写得夸张就盖过其余证据。\n" +
        "只输出 JSON：{\"records\":[{\"name\":\"…\",\"radar\":{\"维度\":分数},\"radarWhy\":{\"维度\":\"综合理由（引用关键原文）\"},\"summary\":\"一句话评价（可省略）\"}]}\n\n" +
        "【维度】" + axes + "\n" +
        (r.summary ? "【这一条现在的概括】" + String(r.summary).slice(0, 200) + "\n" : "") +
        "\n【各段依据】\n" + dossier
      );
    }
    function applyRadarScore(r, rec) {
      if (!rec || !rec.radar || typeof rec.radar !== "object") return false;
      let changed = false;
      Object.keys(rec.radar).forEach((k) => {
        const v = Number(rec.radar[k]);
        if (!isFinite(v)) return;
        const val = Math.round(Math.max(0, Math.min(10, v)) * 10) / 10;
        if (r.radar[k] !== val) changed = true;
        r.radar[k] = val;
        /* 这一维是"综观全部依据"的总分，不再参与以后的等权平均 */
        if (r.radarSum) delete r.radarSum[k];
        if (r.radarN) delete r.radarN[k];
      });
      if (r.radarSum && !Object.keys(r.radarSum).length) {
        delete r.radarSum;
        delete r.radarN;
      }
      if (rec.radarWhy && typeof rec.radarWhy === "object") {
        const why = Object.assign({}, r.radarWhy || {});
        Object.keys(rec.radarWhy).forEach((k) => {
          const v = String(rec.radarWhy[k] == null ? "" : rec.radarWhy[k]).trim();
          if (v) why[k] = v;
        });
        r.radarWhy = why;
      }
      return changed;
    }
    async function scoreRadarFromEvidence(task) {
      const targets = radarScoreTargets(task);
      if (!targets.length || isStopped()) return 0;
      let done = 0;
      let processed = 0;
      let next = 0;
      const queue = targets.slice();
      /* 同上：每条各看各的证据档案，互不依赖，按并发数并行。 */
      const workers = Math.max(1, Math.min(4, Number(cfg.concurrency) || 1, targets.length));
      const worker = async () => {
        while (!isStopped()) {
          await waitWhilePaused();
          if (isStopped()) return;
          const i = next++;
          if (i >= queue.length) return;
          const r = queue[i];
          setAnalyzeStatusProgress(uiTextFor("正在按依据综合雷达评分…"), processed, targets.length);
          const dossier = buildRadarDossier(task, r);
          if (dossier) {
            try {
              const res = await callAgent(cfg, radarScorePromptFor(r, dossier), postSignal(), null, POST_SYSTEM);
              const rec = ((res && res.records) || [])[0];
              if (applyRadarScore(r, rec)) done++;
              ppMark(r, "radar");
            } catch (e) {
              if (!isStopped() && analysisRun.paused) {
                queue.push(r);
                continue;
              }
              /* 静默：这一条失败就保留等权平均的结果 */
            }
          }
          processed++;
          setAnalyzeStatusProgress(uiTextFor("正在按依据综合雷达评分…"), processed, targets.length);
        }
      };
      await Promise.all(Array.from({ length: workers }, worker));
      if (done) pendingUndoLabel = uiTextFor("雷达综合评分");
      return done;
    }
    /* ---------- 反思校验（结果区「反思校验」按钮触发；用户 2026-10-17 要的）----------
       把**人物 / 关系**里重要的那几条拿回原文逐字段核对：没依据 / 自相矛盾的改掉或删掉，
       漏掉的补上；name / type 不动。挑选规则见 reflectTargets（设定条目 / 事件不核）。
       省钱的点：只挑最多 REFLECT_MAX 条、逐个顺序、随时可终止、失败保留原样。 */
    function segmentTextOf(task, seg) {
      const f = (task.files || []).find((x) => x.id === seg.fileId);
      if (!f || !f.text) return "";
      const a = Math.max(0, Math.min(Number(seg.start) || 0, String(f.text).length));
      const b = Math.max(a, Math.min(Number(seg.end) != null ? Number(seg.end) : String(f.text).length, String(f.text).length));
      return String(f.text).slice(a, b);
    }
    /* 出处的原文：这条记录命中的那些段（`r.source` 里记着「第1章·第2章…」）。
       长文本不再只截开头 / 结尾：优先抽「名字 / 别名出现的句子 + 前后上下文」，
       再补早、中、晚几个锚点；证据不够时才退回全文头尾。这样既覆盖人物弧光，
       也不把大量无关叙述塞进反思请求。 */
    const REFLECT_TEXT_MAX = 12000;
    const REFLECT_EVIDENCE_MAX = 9000;
    const REFLECT_CONTEXT = 180;
    const reflectTextCache = new WeakMap();
    const reflectLowCache = new WeakMap();
    function cachedSegmentText(task, seg) {
      if (!seg || !seg.id) return "";
      if (reflectTextCache.has(seg)) return reflectTextCache.get(seg);
      const t = segmentTextOf(task, seg);
      reflectTextCache.set(seg, t);
      return t;
    }
    function cachedLowText(owner, text) {
      if (!owner || !owner.id) return foldVariant(String(text || "")).toLowerCase();
      if (reflectLowCache.has(owner)) return reflectLowCache.get(owner);
      const low = foldVariant(String(text || "")).toLowerCase();
      reflectLowCache.set(owner, low);
      return low;
    }
    function sourceTextOf(task, r) {
      /* 优先用合并时攒下的 `sources`（各章都在）：只看最早那条 `source` 的话，
         人物后半本书才有的变化会被当成"没依据"删掉。老记录没有 sources 就退回拆 source。 */
      const labels = (Array.isArray(r && r.sources) && r.sources.length
        ? r.sources
        : String((r && r.source) || "").split(/[·・|｜/]+/)
      )
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);
      const refs = Array.isArray(r && r.sourceRefs) ? r.sourceRefs.slice() : [];
      refs.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
      const segs = [];
      refs.forEach((ref) => {
        const seg =
          (ref.segId && (task.segments || []).find((s) => s.id === ref.segId)) ||
          (ref.source && (task.segments || []).find((s) => s.fileId === ref.fileId && s.label === ref.source)) ||
          null;
        if (seg && segs.indexOf(seg) < 0) segs.push(seg);
      });
      if (!segs.length) {
        (task.segments || []).forEach((s) => {
          if (labels.indexOf(s.label) >= 0 && segs.indexOf(s) < 0) segs.push(s);
        });
      }
      const full = segs.length
        ? segs.map((s) => segmentTextOf(task, s)).filter(Boolean).join("\n\n")
        : (task.files || []).map((f) => f.text).filter(Boolean).join("\n\n");
      if (full.length <= REFLECT_TEXT_MAX) return { text: full, truncated: false, labels };
      const names = [];
      const addName = (n) => {
        const t = String(n || "").trim();
        if (!t) return;
        const k = foldVariant(t).toLowerCase();
        if (k && names.indexOf(k) < 0) names.push(k);
      };
      addName(r && r.name);
      (r && r.aliases || []).forEach(addName);
      try {
        if (typeof nameAliasesOf === "function") (nameAliasesOf(r || {}) || []).forEach(addName);
      } catch (e) {
        /* ignore */
      }
      if (r && r.type === "relation") {
        ["人物A", "人物B", "人物1", "人物2", "甲", "乙"].forEach((lb) => addName(fieldValue(r, lb)));
      }
      const units = segs.length
        ? segs.map((s) => ({ owner: s, label: s.label || "", text: cachedSegmentText(task, s), order: Number(s.start) || 0 }))
        : (task.files || []).map((f, i) => ({ owner: f, label: f.name || "", text: f.text || "", order: i }));
      const items = [];
      const seen = new Set();
      const push = (text, label, order, anchor) => {
        const t = String(text || "").replace(/\s+/g, " ").trim();
        if (!t) return;
        const key = t.slice(0, 160);
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ text: t, label: String(label || "").trim(), order: Number(order) || 0, anchor: !!anchor });
      };
      /* 早 / 中 / 晚锚点：即使人名附近没有识别到，也保留故事两端的阶段证据。 */
      const anchorUnits = [];
      if (units.length) {
        [0, Math.floor(units.length / 3), Math.floor((units.length * 2) / 3), units.length - 1].forEach((i) => {
          if (i >= 0 && i < units.length && anchorUnits.indexOf(units[i]) < 0) anchorUnits.push(units[i]);
        });
      }
      anchorUnits.forEach((u, i) => {
        const t = String(u.text || "");
        if (!t) return;
        const size = 600;
        const at =
          i === 0 ? 0 : i === anchorUnits.length - 1 ? Math.max(0, t.length - size) : Math.max(0, Math.floor((t.length - size) / 2));
        push(t.slice(at, at + size), u.label, u.order + at, true);
      });
      /* 关键词上下文：每个段最多取少量命中，避免同名高频角色把预算占满。 */
      units.forEach((u) => {
        const raw = String(u.text || "");
        if (!raw) return;
        const low = cachedLowText(u.owner, raw);
        let taken = 0;
        for (const name of names) {
          let from = 0;
          while (name && taken < 10) {
            const at = low.indexOf(name, from);
            if (at < 0) break;
            const a = Math.max(0, at - REFLECT_CONTEXT);
            const b = Math.min(raw.length, at + name.length + REFLECT_CONTEXT);
            push(raw.slice(a, b), u.label, u.order + a);
            taken++;
            from = at + Math.max(1, name.length);
          }
          if (taken >= 10) break;
        }
      });
      const anchors = items.filter((x) => x.anchor);
      const evidence = items.filter((x) => !x.anchor);
      const picked = [];
      let used = 0;
      const take = (x) => {
        const add = (x.label ? `【出处：${x.label}】\n` : "") + x.text;
        if (used + add.length > REFLECT_EVIDENCE_MAX) return false;
        picked.push(x);
        used += add.length + 2;
        return true;
      };
      anchors.forEach(take);
      evidence.forEach(take);
      picked.sort((a, b) => a.order - b.order);
      const text = picked
        .map((x) => (x.label ? `【出处：${x.label}】\n` : "") + x.text)
        .join("\n\n");
      return { text: text || full.slice(0, REFLECT_EVIDENCE_MAX), truncated: true, labels };
    }
    function reflectPromptFor(r, src) {
      /* radarEvidence 是分块证据存档（一条记录可能有很多段），反思本来就有出处原文可看，
         不要再把它塞进提示词里白烧 token。 */
      const promptRecord = Object.assign({}, r);
      delete promptRecord.radarEvidence;
      return (
        "【任务】下面是一条已经抽好的识别记录，以及它的出处原文。请**逐字段核对**：\n" +
        "① 没有原文依据、或与原文矛盾的字段改正或删掉；② 原文里明确有、但记录漏掉的关键信息补上；③ name / type 不要改。\n" +
        "④ **人物会随剧情变化，这是正常的**：前期与后期不一致（前期怯懦、后期果断）时，只要两边都有依据就**都留着**，" +
        "写成「前期…／后期…」这种带阶段的说法；不要因为「前后矛盾」就删掉其中一边 —— " +
        "只有**同一时间点**上互相矛盾、或者明显是模型脑补的，才需要改。\n" +
        "⑤ **「前期 / 后期」按故事里的时间判断，不是按章节先后**：章节顺序不一定是时间顺序" +
        "（倒叙、插叙、回忆、番外都很常见），请依据文中的时间线索（年代、年龄、先后事件、回忆提示）来分前后。\n" +
        (src.truncated
          ? "⑥ 下面是从出处中摘出的**关键证据**（按早、中、晚采样，并优先保留名字 / 别名附近上下文），" +
            "不是全文；没贴出来的部分仍然可能存在依据。**没贴出来 ≠ 没有依据**：不要因为这里没看到就删字段，" +
            "只有明确和贴出来的原文对不上才改。\n"
          : "") +
        "⑦ **别名要谨慎清理**：只保留原文里明确指向同一个人的称呼；「假冒的 A」「A 的替身」「父亲 / 队长 / 老师」这类描述、冒充或泛称不是别名，删掉。没把握的保留，不要靠猜。\n" +
        "⑧ **合并项要谨慎拆分**：如果这条记录明显把另一个人（同名但不同身份、冒充者、平行世界版本等）的资料并了进来，" +
        "只保留主名对应的内容，别把别人的字段算进来；原文无法确定时保留，不要硬拆或另造人物。\n" +
        "⑨ 如果【记录】里有 radar：也要按原文复核雷达分数；没有依据的维度不要给分，明显与原文矛盾的分数改正，" +
        "并在 radarWhy 里写清依据；radar 要随记录一起返回。\n" +
        "仍只输出 JSON：{\"records\":[{…}]}（就这一条，格式与之前一样）。\n\n" +
        "【记录】" + JSON.stringify(promptRecord) + "\n\n【出处】" + (src.labels.length ? src.labels.join(" · ") : "（未知）") +
        "\n\n【出处原文】\n" + src.text
      );
    }
    function replaceRecordWith(r, rec) {
      if (rec && Array.isArray(rec.fields)) rec.fields = stripInternalRadarFields(rec.fields);
      if (!rec || !Array.isArray(rec.fields) || !rec.fields.length) return false;
      const next = Object.assign({}, r);
      next.fields = rec.fields.map((f) => ({ label: String((f && f.label) || "字段"), value: String((f && f.value) == null ? "" : f.value) }));
      if (rec.radar && typeof rec.radar === "object" && Object.keys(rec.radar).length) {
        next.radar = Object.assign({}, rec.radar);
        // 反思是整条重判，不是"若干条的平均"：清掉等权平均的累加值
        delete next.radarSum;
        delete next.radarN;
      }
      if (rec.radarWhy && typeof rec.radarWhy === "object") next.radarWhy = Object.assign({}, rec.radarWhy);
      const s = String(rec.summary || "").trim();
      if (s) next.summary = s;
      Object.assign(r, next);
      return true;
    }
    /* 反思结果再做一层保守的别名校验：只剔除明显的描述 / 冒充 / 泛称，不动可能有依据的别名。 */
    function sanitizeReflectedAliases(r) {
      if (!r || !Array.isArray(r.fields)) return false;
      const aliasField = r.fields.find((f) =>
        /^(?:别名|别称|又名|曾用名|其他写法|昵称|称呼|简称|绰号)$/.test(String((f && f.label) || "").trim())
      );
      if (!aliasField) return false;
      const bad = (a) => {
        const t = String(a || "").trim();
        if (!t) return true;
        if (/假冒|假扮|冒充|冒牌|伪装|复制体|克隆体|替身|影武者|自称|所谓/.test(t)) return true;
        if (/的/.test(t) && String(r.name || "").trim() && t.includes(String(r.name || "").trim())) return true;
        if (/^(?:fake|false|impostor|imposter|another|copy|clone|evil|dark|alternate)\b/i.test(t)) return true;
        try {
          if (typeof isTooGenericAlias === "function" && isTooGenericAlias(t)) return true;
        } catch (e) {
          /* ignore */
        }
        return false;
      };
      const parts = String(aliasField.value || "")
        .split(/[、,，;；/｜|]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const kept = parts.filter((x, i, arr) => !bad(x) && arr.indexOf(x) === i);
      if (kept.length === parts.length && kept.every((x, i) => x === parts[i])) return false;
      if (!kept.length) r.fields = r.fields.filter((f) => f !== aliasField);
      else aliasField.value = kept.join("、");
      return true;
    }
    async function reflectTaskResults(task) {
      const targets = reflectTargets(task);
      if (!targets.length || isStopped()) return 0;
      let done = 0;
      let processed = 0;
      let next = 0;
      const queue = targets.slice();
      /* 每条的提示词互不依赖，按用户配置的并发数并行；不改变请求内容 / 结果，
         只减少一串串行网络等待。 */
      const workers = Math.max(1, Math.min(4, Number(cfg.concurrency) || 1, targets.length));
      const worker = async () => {
        while (!isStopped()) {
          await waitWhilePaused();
          if (isStopped()) return;
          const i = next++;
          if (i >= queue.length) return;
          const r = queue[i];
          setAnalyzeStatusProgress(uiTextFor("正在反思校验…"), processed, targets.length);
          try {
            const res = await callAgent(
              cfg,
              reflectPromptFor(r, sourceTextOf(task, r)),
              postSignal(),
              null,
              POST_SYSTEM
            );
            const rec = ((res && res.records) || [])[0];
            if (rec && replaceRecordWith(r, rec)) {
              sanitizeReflectedAliases(r);
              done++;
            }
            ppMark(r, "reflect");
          } catch (e) {
            if (!isStopped() && analysisRun.paused) {
              queue.push(r);
              continue;
            }
            /* 静默：这一条没核对成功就保留原样 */
          }
          processed++;
          setAnalyzeStatusProgress(uiTextFor("正在反思校验…"), processed, targets.length);
        }
      };
      await Promise.all(Array.from({ length: workers }, worker));
      if (done) pendingUndoLabel = uiTextFor("反思校验识别结果");
      return done;
    }

    // 给模型说明这段文字来自哪一章、在全书里的位置：一章被切成多块时也不会弄混顺序
    function analysisJobText(job) {
      const bits = [];
      const srcLabel = jobSourceLabel(job);
      if (srcLabel) bits.push("章节 / 来源：" + srcLabel);
      if (job.chapterLabel && job.chapterLabel !== job.label) bits.push("所属章：" + job.chapterLabel);
      if (job.pos && job.total) bits.push(`全书顺序：第 ${job.pos} / ${job.total} 段`);
      if (job.parts > 1) bits.push(`本章共 ${job.parts} 块，这是第 ${job.part} 块`);
      if (!bits.length) return job.text;
      return "【本次文本】" + bits.join("；") + "。只提取本次文本里的信息。\n\n" + job.text;
    }

    const runOne = async (job) => {
      let lastErr = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        if (isStopped()) throw new Error("__STOPPED__");
        await waitCooldown();
        if (isStopped()) throw new Error("__STOPPED__");
        try {
          // 允许某个任务单独把输出上限调大（短文本被截断时的补救），或去掉 temperature
          let useCfg = cfg;
          if (job.maxTokens && job.maxTokens !== cfg.maxTokens) useCfg = Object.assign({}, useCfg, { maxTokens: job.maxTokens });
          /* 合并单元要一次吐几章的记录：默认 8k 输出容易截断 → 这类调用自动抬到 16k */
          if (job.groupCount > 1) useCfg = Object.assign({}, useCfg, { maxTokens: Math.max(Number(useCfg.maxTokens) || 0, 16000) });
          if (job.noTemperature) useCfg = Object.assign({}, useCfg, { temperature: null });
          // 工作区已有信息整轮只算一次：并行分析时每个分块都用同一份，结果才一致
          if (wsPrompt === null) wsPrompt = workspaceContextForPrompt();
          return await callAgent(useCfg, analysisJobText(job), analysisRun.controller.signal, wsPrompt);
        } catch (e) {
          lastErr = e;
          if (e && e.message === "__STOPPED__") throw e;
          if (isStopped()) throw new Error("__STOPPED__");
          // 模型不接受 temperature：去掉它立刻重试一次
          if (e && e.dropTemperature && !job.noTemperature) {
            job.noTemperature = true;
            continue;
          }
          if (e && e.retryable === false) throw e;
          // 输出被截断 / 内容为空 / 文本太长：原样重试意义不大，直接交给上层「拆成两半」重跑
          const isJsonErr = /JSON|内容为空|没有返回正文/.test(e && e.message ? e.message : "");
          const maxAttempts = isJsonErr || (e && e.tooLong) || (e && e.truncated) ? 1 : 5;
          if (attempt >= maxAttempts) throw lastErr; // 这种错误重试也没用，交给上层拆半
          const backoff = Math.round(1200 * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
          // 接口自己给了 retry-after 就以它为准，否则用指数退避
          const wait = e && e.retryAfterMs != null ? Math.max(300, e.retryAfterMs) : backoff;
          if (e && e.httpStatus === 429) {
            bumpCooldown(wait);
            if (!isStopped()) setAnalyzeStatus(`接口限流（429），暂停 ${Math.round(wait / 1000)} 秒后自动重试…`);
          }
          await sleepUnlessStopped(wait);
        }
      }
      throw lastErr;
    };

    // 万一遇到「返回被截断」或「这一章太长接口放不下」，才临时把这一段拆成两半重试，
    // 拆出来的结果会按先后顺序合并回去，不会打乱事件顺序
    const runJobWithFallback = async (job, depth) => {
      // off：本层结果相对 job.seq 的小数偏移，保证「拆成两半」后左边永远排在右边前面
      const off = job.off || 0;
      const tag = (recs) => {
        (recs || []).forEach((r) => {
          r.subSeq = (typeof r.subSeq === "number" ? r.subSeq : 0) + off;
        });
        return recs || [];
      };
      try {
        const res = await runOne(job);
        return { records: tag(res && res.records) };
      } catch (e) {
        const text = job.text || "";
        const isJsonErr = /JSON/.test(e && e.message ? e.message : "");
        const isTooLong = !!(e && e.tooLong);
        const isShort = !!(e && e.truncated);
        // 文本本身就不长却还被截断：多半是模型把输出额度花在“思考”上 → 把上限翻倍再试一次
        if (isShort && text.length <= 2000 && !job.bumped) {
          const base = Math.max(job.maxTokens || cfg.maxTokens || DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS);
          const bumped = Math.min(64000, base * 2);
          if (bumped > base) {
            if (!isStopped()) setAnalyzeStatus(`「${job.label || "全文"}」输出被截断，已把输出上限临时调到 ${bumped} 再试一次…`);
            return await runJobWithFallback(Object.assign({}, job, { maxTokens: bumped, bumped: true }), depth);
          }
        }
        if ((isJsonErr || isTooLong || isShort) && text.length > 2000 && depth < 3) {
          if (!isStopped())
            setAnalyzeStatus(
              isTooLong
                ? `「${job.label || "全文"}」太长，接口放不下，已临时拆成两半分析…`
                : `「${job.label || "全文"}」的输出被截断（模型没写完），已自动拆成两半重新分析…（若还是一直截断，去「设置 → Agent」把「输出上限」调大）`
            );
          let mid = Math.floor(text.length / 2);
          // 优先切在段落边界；这一段实在没有换行时才退到句末
          let mb = scanBackIndex(text, Math.floor(text.length * 0.3), mid, (ch) => ch === "\n");
          if (mb < 0) mb = scanBackIndex(text, Math.floor(text.length * 0.3), mid, (ch) => BREAK_SENT.test(ch));
          if (mb >= 0) mid = mb + 1;
          const ra = await runJobWithFallback({ label: job.label, text: text.slice(0, mid), seq: job.seq, off: 0 }, depth + 1);
          /* 切成两半时给后半块带上前半块末尾一小段：切点附近的上下文不丢，而且**对齐到句末 / 段落边界**，
             别从半句话中间开始 —— 否则切点那句话会被拦腰截断。
             重叠部分会被两块都看到 —— 没关系，后面同名合并 / 综合会把重复的收敛掉（用户 2026-10-17 要的分块重叠）。 */
          const overlapBase = Math.max(0, mid - CHUNK_OVERLAP);
          const boundary = scanBackIndex(text, overlapBase, mid, (ch) => ch === "\n" || /[。！？!?]/.test(ch));
          const bStart = boundary >= 0 ? boundary + 1 : overlapBase;
          const rb = await runJobWithFallback(
            { label: job.label, text: text.slice(bStart), seq: job.seq, off: 0.5 },
            depth + 1
          );
          const recs = [];
          if (ra && Array.isArray(ra.records)) recs.push(...ra.records);
          if (rb && Array.isArray(rb.records)) recs.push(...rb.records);
          return { records: tag(recs) };
        }
        throw e;
      }
    };

    if (postOnly) {
      const target = getSelectedTask() || task;
      showProgress(0, mode === "post-reflect" ? uiTextFor("反思校验") : uiTextFor("汇总"));
      try {
        let changed = 0;
        if (mode === "post-summary" || mode === "post") {
          setAnalyzeStatus(uiTextFor("正在综合汇总…"));
          const nSynth = await synthesizeTaskResults(target);
          const nRadar = await scoreRadarFromEvidence(target);
          changed += nSynth + nRadar;
          if (nSynth || nRadar) {
            pendingUndoLabel = uiTextFor("综合汇总与雷达评分");
            saveState();
          }
        }
        if (mode === "post-reflect" || mode === "post") {
          const nRef = await reflectTaskResults(target);
          changed += nRef;
          if (nRef) saveState();
        }
        renderFileList(target);
        renderSegments(target);
        renderResultReview(target);
        if (analysisRun && analysisRun.stopped) {
          setAnalyzeStatus(uiTextFor("已终止汇总 / 反思（已完成的部分保留）。"));
        } else {
          setAnalyzeStatus(
            changed
              ? mode === "post-reflect"
                ? uiTextFor("反思校验完成。")
                : mode === "post-summary"
                ? uiTextFor("汇总完成。")
                : uiTextFor("校验汇总完成。")
              : uiTextFor("没有需要更新的内容。")
          );
        }
      } finally {
        hideProgress();
        if (analysisRun) analysisRun.finished = true;
        renderTaskList();
        updateRunButtons();
      }
      return;
    }

    const worker = async () => {
      while (true) {
        if (isStopped()) return;
        while (analysisRun.paused && !isStopped()) await sleep(200);
        if (isStopped()) return;
        const i = nextIndex++;
        if (i >= jobs.length) return;
        const job = jobs[i];
        const st = job.segId ? segStat.get(job.segId) : fileStat.get(job.fileId);
        /* 合并过的单元：组里其它段共用同一份进度统计（收尾时它们也要被标「已分析」） */
        (job.objs || []).forEach((o) => {
          if (!o || !st) return;
          const map = (task.segments || []).indexOf(o) >= 0 ? segStat : fileStat;
          if (!map.has(o.id)) map.set(o.id, st);
        });
        const unitId = job.segId || job.fileId;
        const up = unitProgress.get(unitId);
        if (up) {
          up.running = true;
          paintUnitProgress(unitId);
          if (job.segId && job.fileId) paintFileProgress(task, job.fileId);
        }
        try {
          const res = await runJobWithFallback(job, 0);
          if (res && Array.isArray(res.records)) {
            res.records.forEach((r) => {
              // 「雷达说明：另见 radar 与 radarWhy」这类给程序看的备注不要进结果（更不要进卡片）
              if (r && Array.isArray(r.fields)) r.fields = stripInternalRadarFields(r.fields);
              // 出处写成「第X章 … · 第Y节 …」（节带上所属章），人物 / 事件卡片上都看得到
              const srcLabel = jobSourceLabel(job);
              if (srcLabel) r.source = srcLabel;
              r.seq = job.seq + (typeof r.subSeq === "number" ? r.subSeq : 0);
              r.segId = job.segId || null;
              r.fileId = job.fileId || null;
              r.sourceSegIds = (job.objs || [])
                .map((o) => o && o.id)
                .filter((id) => id && (task.segments || []).some((s) => s.id === id));
              if (r.segId && r.sourceSegIds.indexOf(r.segId) < 0) r.sourceSegIds.unshift(r.segId);
              /* 分块级雷达依据：入账这一刻就把「这一段的分数 + 这一段的原文理由」固定下来。
                 之后综合汇总 / 雷达重判 / 反思只改最终 radar / radarWhy，不会覆盖它。 */
              {
                const ev = radarEvidenceEntryOf(r);
                if (ev) r.radarEvidence = [ev];
              }
            });
            records.push(...res.records);
          }
          if (st) {
            st.done++;
            (st.doneIdx || (st.doneIdx = new Set())).add(job.part - 1);
          }
          if (up) up.done++;
        } catch (e) {
          if (e && e.message === "__STOPPED__") return;
          if (st) {
            st.fail++;
            (st.failIdx || (st.failIdx = new Set())).add(job.part - 1);
            if (!st.err) st.err = String((e && e.message) || e || "未知错误").slice(0, 300);
          }
          if (up) {
            up.done++;
            up.failed++;
          }
          failed++;
          if (!firstError) firstError = e;
        }
        completed++;
        if (up) {
          // 这一单元还有没有在跑的块
          up.running = up.done < up.total;
          paintUnitProgress(unitId);
          if (job.segId && job.fileId) paintFileProgress(task, job.fileId);
        }
        showProgress((completed / jobs.length) * 100, `${completed} / ${jobs.length}`);
        updateStatus();
        if (records.length >= 40) flush();
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      unitProgress.forEach((p) => {
        p.running = false;
      });
      flush();
      // 记下每个分析单元「哪几块成了、哪几块败了」，只有全部成功才算「已分析」
      const finishUnit = (obj, st) => {
        if (!obj) return;
        const total = Math.max(obj.chunkTotal || 0, unitChunkCount.get(obj.id) || 0, st ? st.total : 0);
        obj.chunkTotal = total;
        const ok = new Set(obj.okChunks || []);
        const bad = new Set(obj.failChunks || []);
        if (st) {
          (st.doneIdx || new Set()).forEach((i) => {
            ok.add(i);
            bad.delete(i);
          });
          (st.failIdx || new Set()).forEach((i) => {
            bad.add(i);
            ok.delete(i);
          });
          if (st.err) obj.lastError = st.err;
        }
        obj.okChunks = Array.from(ok).sort((a, b) => a - b);
        obj.failChunks = Array.from(bad).sort((a, b) => a - b);
        obj.analyzed = obj.chunkTotal > 0 && obj.failChunks.length === 0 && obj.okChunks.length >= obj.chunkTotal;
        if (!obj.failChunks.length) obj.lastError = "";
      };
    // 收尾也按 id 重新认任务：认不到说明这个任务已被删除，结果直接丢弃
    const taskEnd = liveTask();
    if (!taskEnd) {
      setAnalyzeStatus("这个分析任务已经被删除了，本次结果没有保存。");
    } else {
      // 「已分析」标记也要写回认到的那个任务（撤销 / 编辑后对象已经不是原来那个了）
      segStat.forEach((st, segId) => finishUnit((taskEnd.segments || []).find((s) => s.id === segId), st));
      // 没有章节标题、按整篇分析的文件
      fileStat.forEach((st, fileId) => finishUnit((taskEnd.files || []).find((x) => x.id === fileId), st));
      renumberResults(taskEnd);
      saveState({ noUndo: true });
      renderFileList(taskEnd);
      renderSegments(taskEnd);
      renderResultReview(taskEnd);
      /* 后处理（合并同一条目 → 综合汇总 / 雷达 / 反思）由结果区按钮触发，
         不再分析一完成就自动跑。 */
      if (isStopped()) {
        setAnalyzeStatus(`已终止，已保留 ${(taskEnd.results || []).length} 条结果。`);
      } else if (failed && completed === failed) {
        setAnalyzeStatus("分析失败：" + (firstError && firstError.message ? firstError.message : "全部请求失败"));
      } else if (failed) {
        const n = failedUnitList(taskEnd).length;
        setAnalyzeStatus(
          `分析完成，共 ${(taskEnd.results || []).length} 条；有 ${n} 处（章 / 节）没分析成功。点「重跑失败部分」只重新分析这些地方，其余不会重跑。`
        );
      } else {
        setAnalyzeStatus(`分析完成，共 ${(taskEnd.results || []).length} 条。先点「合并同一条目」，再点「汇总」或「反思校验」。`);
      }
    }
    renderTaskList();
    updateRetryButton();
    } catch (err) {
      flush();
      renumberResults(task);
      renderFileList(task);
      renderSegments(task);
      renderResultReview(task);
      saveState({ noUndo: true });
      renderTaskList();
      updateRetryButton();
      if (isStopped() || (err && err.message === "__STOPPED__")) {
        setAnalyzeStatus(`已终止，已保留 ${(task.results || []).length} 条结果。`);
      } else {
        setAnalyzeStatus(uiTextFor("分析出错") + "：" + uiTrans(err && err.message ? err.message : String(err)));
        showProgress((completed / jobs.length) * 100, "已中断");
      }
    } finally {
      stopWaiting();
      if (analysisRun) analysisRun.finished = true;
      unitProgress = new Map();
      runUnitObjects = new Map();
      updateRunButtons();
      renderTaskList(); // 去掉任务栏上的「分析中」标记
      // 跑完时如果用户正在看别的任务，把那一栏的「被占用」状态解开
      if (analysisRun && analysisRun.taskId !== selectedTaskId) renderTaskDetail();
    }
  }

