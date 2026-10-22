  function computeHeadingPositions(s) {
    const res = [];
    let i = 0;
    while (i < s.length) {
      const nl = s.indexOf("\n", i);
      const lineEnd = nl === -1 ? s.length : nl;
      const t = s.slice(i, lineEnd).trim();
      if (looksLikeHeadingLine(t)) res.push(i);
      i = lineEnd + 1;
    }
    return res;
  }

  function scanBackIndex(s, from, to, pred) {
    const lo = Math.max(0, from);
    const hi = Math.min(s.length - 1, to - 1);
    for (let i = hi; i >= lo; i--) if (pred(s[i])) return i;
    return -1;
  }

  function scanForwardIndex(s, from, to, pred) {
    const lo = Math.max(0, from);
    const hi = Math.min(s.length, to);
    for (let i = lo; i < hi; i++) if (pred(s[i])) return i;
    return -1;
  }

  // 只在自然「段落」边界切：章节标题行首 > 段落换行
  // 区间里没有段落边界时，向后延伸到最近的段落边界，绝不在句子中间切
  function findCutEnd(s, start, target, minPos, headings, hardCap) {
    const limit = Math.min(target, s.length);

    // 1) 章节切口（切在标题之前，让标题领起下一段）
    let best = -1;
    for (let k = 0; k < headings.length; k++) {
      const h = headings[k];
      if (h > start && h >= minPos && h <= limit) best = h;
    }
    if (best > 0) return best;

    // 2) 段落换行
    const idx = scanBackIndex(s, minPos, limit, (ch) => ch === "\n");
    if (idx >= 0) return idx + 1;

    // 区间内没有段落边界：向后延伸到最近的自然段落 / 章节边界
    let ext = s.length;
    for (let k = 0; k < headings.length; k++) {
      if (headings[k] >= limit) {
        ext = Math.min(ext, headings[k]);
        break;
      }
    }
    const nl = scanForwardIndex(s, limit, s.length, (ch) => ch === "\n");
    if (nl >= 0) ext = Math.min(ext, nl + 1);
    // 极端情况：整页都没有换行，只能靠硬上限兜底，避免单次请求超过模型上下文
    if (ext - start > hardCap) ext = start + hardCap;
    return ext;
  }

  // 把起始位置向后吸附到段落开头，避免从半句话开始
  function snapToBoundary(s, pos, floor, ceil) {
    const upper = Math.min(s.length, ceil == null ? s.length : ceil);
    const limit = Math.min(upper, pos + 400);
    const nl = scanForwardIndex(s, Math.max(pos, floor), limit, (ch) => ch === "\n");
    return nl >= 0 ? nl + 1 : pos;
  }

  function smartChunk(text, size, overlap) {
    const s = String(text || "");
    if (!s) return [];
    if (s.length <= size) return [s];
    const minSize = Math.floor(size * 0.6);
    const hardCap = Math.floor(size * 3);
    const headings = computeHeadingPositions(s);
    const headingSet = new Set(headings);
    const chunks = [];
    let start = 0;
    let guard = 0;
    while (start < s.length && guard++ < 10000) {
      let end = findCutEnd(s, start, start + size, start + minSize, headings, hardCap);
      if (end <= start) end = s.length;
      chunks.push(s.slice(start, end));
      if (end >= s.length) break;
      let next;
      if (headingSet.has(end)) {
        // 章节切口：下一段正好从章节标题开始，不留重叠
        next = end;
      } else {
        next = Math.max(start + 1, end - overlap);
        next = snapToBoundary(s, next, start + 1, end);
      }
      if (next >= end || next <= start) next = end;
      start = next;
    }
    return chunks;
  }

  function extractJSON(text) {
    const cleaned = String(text).replace(/```json/gi, "```").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    return JSON.parse(cleaned);
  }

  // 把接口错误翻译成人话，并标出「值不值得重试」
  function httpErrorInfo(status, body) {
    const detail = String(body || "").replace(/\s+/g, " ").slice(0, 200);
    const info = { httpStatus: status, retryable: status === 408 || status === 409 || status === 429 || status >= 500 };
    if (status === 401) return { ...info, retryable: false, message: "API Key 无效或已过期（401）。请在「设置 → Agent」里检查 Key。" };
    if (status === 403) return { ...info, retryable: false, message: "这个 Key 没有调用权限（403）。" + detail };
    if (status === 404) return { ...info, retryable: false, message: "接口地址不对（404）。请在「设置 → Agent」里检查 API 地址。" + detail };
    if (status === 402) return { ...info, retryable: false, message: "账户余额不足（402）。充值后再试。" + detail };
    if (status === 400) {
      const tooLong = /context length|maximum context|too long|max_tokens|token/i.test(detail);
      const temp = /temperature/i.test(detail);
      return {
        ...info,
        retryable: tooLong || temp,
        tooLong,
        dropTemperature: temp,
        message: tooLong
          ? "这一段太长，超出了模型的上下文上限，已自动拆成两半分析。" + detail
          : temp
            ? "这个模型不接受 temperature 参数，已自动去掉后重试。"
            : "请求被接口拒绝（400）。" + detail,
      };
    }
    if (status === 429) return { ...info, message: "触发接口限流（429）：请求发得太密，正在自动等待后重试。" + detail };
    if (status >= 500) return { ...info, message: `接口服务端错误（${status}）：稍后会自动重试。` + detail };
    return { ...info, message: `接口返回 ${status}：` + detail };
  }

  function markRetryable(err, retryable) {
    if (err && typeof err === "object") err.retryable = retryable;
    return err;
  }

  // 模型的正文可能出现在不同位置，逐个兜底取出来
  function pickMessageText(v) {
    if (typeof v === "string") return v;
    if (Array.isArray(v))
      return v
        .map((x) => (typeof x === "string" ? x : (x && (x.text || x.content)) || ""))
        .join("");
    if (v && typeof v === "object" && typeof v.text === "string") return v.text;
    return "";
  }

  /* 这一轮分析的 token 账（用户 2026-10-17：要能看见"提示缓存有没有真的生效"）：
     各家字段名不一样 —— OpenAI 是 usage.prompt_tokens_details.cached_tokens、
     DeepSeek 是 usage.prompt_cache_hit_tokens、Anthropic 是 usage.cache_read_input_tokens。 */
  const agentTokenStat = { prompt: 0, completion: 0, cached: 0, calls: 0 };
  function resetAgentTokenStat() {
    agentTokenStat.prompt = 0;
    agentTokenStat.completion = 0;
    agentTokenStat.cached = 0;
    agentTokenStat.calls = 0;
  }
  function noteAgentUsage(usage) {
    if (!usage || typeof usage !== "object") return;
    const cached = Number(
      (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) ||
        usage.prompt_cache_hit_tokens ||
        usage.cache_read_input_tokens ||
        0
    );
    const p = Number(usage.prompt_tokens) || 0;
    const c = Number(usage.completion_tokens) || 0;
    if (!p && !c && !cached) return;
    agentTokenStat.prompt += p;
    agentTokenStat.completion += c;
    agentTokenStat.cached += cached;
    agentTokenStat.calls++;
  }

  async function callAgent(cfg, text, externalSignal, extraSystem, systemOverride) {
    const url = cfg.baseUrl + "/chat/completions";
    const controller = new AbortController();
    let timedOut = false;
    const TIMEOUT_MS = 300000;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", onAbort);
    }
    try {
      const resp = await agentFetch(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            model: cfg.model,
            temperature: cfg.temperature === null ? undefined : cfg.temperature == null ? 0.2 : cfg.temperature,
            max_tokens: cfg.maxTokens || DEFAULT_MAX_TOKENS,
            messages: [
              {
                role: "system",
                content:
                  systemOverride ||
                  ANALYSIS_PROMPT +
                    textStyleHint() +
                    fieldSchemaPromptForAnalysis() +
                    customRelKindsHint() +
                    /* 系谱＝自动识别的「提供方」（用户 2026-10-16）：把已知亲属 / 结合关系喂给模型 */
                    (typeof pedigreeRelationHint === "function" ? pedigreeRelationHint() : "") +
                    (extraSystem || ""),
              },
              { role: "user", content: text },
            ],
          }),
        },
        TIMEOUT_MS
      );
      if (!resp.ok) {
        const t = await resp.text();
        const info = httpErrorInfo(resp.status, t);
        const err = new Error(info.message);
        err.httpStatus = info.httpStatus;
        err.retryable = info.retryable;
        if (info.tooLong) err.tooLong = true;
        if (info.dropTemperature) err.dropTemperature = true;
        const ra = resp.headers && resp.headers.get ? resp.headers.get("retry-after") : null;
        if (ra) {
          const n = parseFloat(ra);
          if (!isNaN(n)) err.retryAfterMs = Math.min(120000, Math.round(n * 1000));
        }
        throw err;
      }
      const rawBody = await resp.text();
      let data = null;
      try {
        data = JSON.parse(rawBody);
      } catch (e) {
        throw markRetryable(
          new Error("接口返回的不是 JSON（可能被网关 / 代理拦截了）：" + String(rawBody).replace(/\s+/g, " ").slice(0, 200)),
          true
        );
      }
      // 有些接口会用 200 返回一条错误信息，以前会被当成「内容为空」
      if (data && data.error) {
        const raw = data.error.message || data.error.type || JSON.stringify(data.error);
        const msg = String(raw).slice(0, 200);
        const err = new Error("接口返回错误：" + msg);
        err.retryable = /rate|limit|overload|busy|timeout/i.test(msg);
        err.httpStatus = resp.status;
        throw err;
      }
      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
      const message = (choice && choice.message) || {};
      let content = pickMessageText(message.content);
      noteAgentUsage(data.usage); // 顺手记账（缓存命中数也在里面）
      if (!content && choice && typeof choice.text === "string") content = choice.text;
      if (!content && typeof data.output_text === "string") content = data.output_text;
      if (!content) {
        // 把真正的原因说清楚：截断 / 只返回了思考 / 返回结构不对
        const finish = (choice && choice.finish_reason) || "";
        const usage = data.usage || {};
        const bits = ["接口没有返回正文"];
        if (finish) bits.push("finish_reason=" + finish);
        if (finish === "length") bits.push("（模型的输出上限被用完了：这一段太长，或模型把额度花在“思考”上）");
        else if (message.reasoning_content) bits.push("（模型只返回了思考过程，没有给出答案）");
        if (usage.prompt_tokens || usage.completion_tokens)
          bits.push(`token 用量：输入 ${usage.prompt_tokens || "?"} / 输出 ${usage.completion_tokens || "?"}`);
        bits.push("原始返回片段：" + JSON.stringify(data).slice(0, 180));
        const err = new Error(bits.join(" "));
        err.retryable = true;
        err.truncated = true; // 交给上层自动拆半重试
        throw err;
      }
      try {
        return extractJSON(content);
      } catch (e) {
        const err = markRetryable(new Error("模型返回的不是有效 JSON（内容可能被截断），会自动拆分重试"), true);
        err.truncated = true;
        throw err;
      }
    } catch (e) {
      // 统一把「中断 / 网络」类错误翻译成人话，避免原文泄漏
      if (externalSignal && externalSignal.aborted) throw new Error("__STOPPED__");
      if (timedOut)
        throw markRetryable(
          new Error(`请求超时（已等待 ${Math.round(TIMEOUT_MS / 1000)} 秒）：文本较长或模型较慢，建议改用更快的模型（如 deepseek-flash），或把这一章再分小些`),
          true
        );
      if (e && e.name === "AbortError") throw markRetryable(new Error("请求被中断（可能是网络波动），请重试"), true);
      if (e && e.name === "TypeError")
        throw markRetryable(
      new Error("连接失败：" + e.message + "（常见原因：API 地址或 Key 不对，或该接口不允许直连、需要代理）"),
          true
        );
      throw e;
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
  }

  /* 同一个名字的记录**合并**，不是丢掉后来的（用户 2026-10-17 报「大量信息被吞掉」）：
     一章一块地分析时，同一个人会在很多块里出现，每块看到的是不同场景——
     老实现按 `type|name` 去重、只留**第一条**，于是后面各块识别到的性格 / 关系 / 雷达数值全丢了，
     表现就是「对性格和雷达不敏感」。现在改成：fields 按 label 合、radar 按顶点取平均、
     summary 留更长的、数组类字段（登场人物 / 别名 / 同一人物…）取并集，位置与 source 仍用最早那条。 */
  function mergeFieldLists(a, b) {
    const out = (a || [])
      .filter((f) => f && String(f.label || "").trim())
      .map((f) => ({ label: String(f.label), value: String(f.value == null ? "" : f.value) }));
    (b || []).forEach((f) => {
      const label = String((f && f.label) || "").trim();
      const raw = String((f && f.value) == null ? "" : f.value);
      const val = raw.trim();
      if (!label || !val) return;
      const hit = out.find((x) => x.label === label);
      if (!hit) {
        out.push({ label: label, value: raw });
        return;
      }
      const old = String(hit.value || "").trim();
      if (!old || old === val) {
        hit.value = raw;
        return;
      }
      if (val.indexOf(old) >= 0) {
        hit.value = raw; // 新的更完整
        return;
      }
      if (old.indexOf(val) >= 0) return; // 旧的已经包含新的
      hit.value = joinFieldText(old, val); // 两段都有新信息：接着写，别丢（标点做一点润色）
    });
    return out;
  }
  /* 两段文字接起来时的**标点润色**（用户 2026-10-17：别丢语义，但读着得像人话）：
     前面已经是一句完整的话（以。！？结尾）就直接接；两边都短（≤12 字）用「，」；其余用「；」。
     只动标点，不动任何字。 */
  function joinFieldText(a, b) {
    const x = String(a == null ? "" : a).trim().replace(/[；;、，,\s]+$/, "");
    const y = String(b == null ? "" : b).trim();
    if (!x) return y;
    if (!y) return x;
    const sep = /[。！？!?]$/.test(x) ? "" : x.length <= 12 && y.length <= 12 ? "，" : "；";
    return x + sep + y;
  }
  function joinWhyText(a, b) {
    const x = String(a == null ? "" : a).trim().replace(/[；;、，,\s]+$/, "");
    const y = String(b == null ? "" : b).trim();
    if (!x) return y;
    if (!y) return x;
    return x + (/[。！？!?]$/.test(x) ? "" : "；") + y;
  }
  /* 模型有时会把「给程序看的备注」也塞进 fields（例如「雷达说明：另见radar与radarWhy」）。
     那是 Agent 的内部约定，用户看不懂，也不该出现在人物卡 / 条目卡 / 结果列表里。
     只在**值明确指向内部键**时命中，别误伤作者自己写的「雷达说明」。 */
  const INTERNAL_RADAR_VALUE_RE = /^(?:另见|参见|详见|见)\s*(?:radar|雷达)\s*(?:与|和|及|&|\/|and)?\s*radarWhy\s*[。.；;]?$/i;
  function isInternalRadarField(f) {
    const label = String((f && f.label) || "").trim();
    const value = String((f && f.value) == null ? "" : f.value).trim();
    if (!label && !value) return false;
    if (INTERNAL_RADAR_VALUE_RE.test(value)) return true;
    if (
      /^(?:雷达说明|雷达备注|radar\s*notes?|radar\s*desc)$/i.test(label) &&
      /^(?:radar|雷达|see\s+radar|见\s*radar|radarWhy)$/i.test(value)
    )
      return true;
    return false;
  }
  function stripInternalRadarFields(list) {
    return (list || []).filter((f) => !isInternalRadarField(f));
  }
  function stripInternalRadarNoteLines(text) {
    const src = String(text == null ? "" : text);
    if (!src) return src;
    const lines = src.split(/\r?\n/);
    const kept = lines.filter((ln) => {
      const m = /^\s*(?:雷达说明|雷达备注|radar\s*notes?)\s*[：:]\s*(.+)$/i.exec(ln);
      return !(m && (INTERNAL_RADAR_VALUE_RE.test(m[1].trim()) || /radarWhy/i.test(m[1])));
    });
    return kept.length === lines.length ? src : kept.join("\n");
  }
  /* ---------- 分块级雷达依据（用户 2026-10-20）----------
     每次分段识别写出来的 `radar` / `radarWhy` 都原样留一份在 `radarEvidence` 里。
     综合汇总 / 雷达重判 / 反思只改「最终分」和「最终理由」，**不碰这份证据**——
     否则重判后那段综合理由会把各段原文引文冲掉，导出的 JSON 里就会出现
     「有分数、没依据」的维度（空之彼岸 19 个、SelfPhobia 20 个）。
     一条证据＝一段材料：{ fileId, segId, source, seq, radar, radarWhy }。 */
  const RADAR_EV_WHY_MAX = 600;
  function radarEvidenceClip(v) {
    const s = String(v == null ? "" : v).trim();
    return s.length > RADAR_EV_WHY_MAX ? s.slice(0, RADAR_EV_WHY_MAX) + "…" : s;
  }
  function radarEvidenceEntryOf(r) {
    if (!r || !r.radar || typeof r.radar !== "object") return null;
    const radar = {};
    Object.keys(r.radar).forEach((k) => {
      const v = Number(r.radar[k]);
      if (isFinite(v)) radar[k] = v;
    });
    if (!Object.keys(radar).length) return null;
    const why = {};
    if (r.radarWhy && typeof r.radarWhy === "object") {
      Object.keys(r.radarWhy).forEach((k) => {
        const v = radarEvidenceClip(r.radarWhy[k]);
        if (v) why[k] = v;
      });
    }
    return {
      fileId: String(r.fileId || ""),
      segId: String(r.segId || ""),
      source: String(r.source || "").trim(),
      seq: typeof r.seq === "number" ? r.seq : null,
      radar: radar,
      radarWhy: why,
    };
  }
  /* 取这条记录现有的分块证据；老存档（结果里还没有 radarEvidence）就用当前的
     radar / radarWhy 补一条，至少别把已有的那一段依据丢掉。 */
  function radarEvidenceListOf(r) {
    const out = [];
    if (r && Array.isArray(r.radarEvidence)) {
      r.radarEvidence.forEach((x) => {
        if (!x || typeof x !== "object") return;
        const radar = x.radar && typeof x.radar === "object" ? x.radar : {};
        const why = x.radarWhy && typeof x.radarWhy === "object" ? x.radarWhy : {};
        if (!Object.keys(radar).length && !Object.keys(why).length) return;
        out.push({
          fileId: String(x.fileId || ""),
          segId: String(x.segId || ""),
          source: String(x.source || "").trim(),
          seq: typeof x.seq === "number" ? x.seq : null,
          radar: Object.assign({}, radar),
          radarWhy: Object.assign({}, why),
        });
      });
    }
    if (out.length) return out;
    const one = radarEvidenceEntryOf(r);
    return one ? [one] : [];
  }
  function radarEvidenceKey(x) {
    return (
      [String(x.fileId || ""), String(x.segId || ""), String(x.source || ""), x.seq == null ? "" : String(x.seq)].join("\u0001") +
      "\u0001" +
      JSON.stringify(x.radarWhy || {})
    );
  }
  function mergeRadarEvidencePair(a, b) {
    const out = [];
    const seen = {};
    radarEvidenceListOf(a)
      .concat(radarEvidenceListOf(b))
      .forEach((x) => {
        const k = radarEvidenceKey(x);
        if (seen[k]) return;
        seen[k] = true;
        out.push(x);
      });
    return out;
  }
  /* 证据按分块顺序排（seq 小的在前；老数据没有 seq 的保持原顺序、排在最后）。
     综合汇总 / 雷达重判的提示词要用它做「早 / 中 / 晚」抽样，不能再按合并顺序取前 N 条
     —— 那样合并了 80 段的角色只能看到开头 30 段，后期弧光全丢了。 */
  function radarEvidenceInOrder(list) {
    return (Array.isArray(list) ? list : [])
      .map((x, i) => ({ x, i }))
      .sort((a, b) => {
        const sa = a.x && typeof a.x.seq === "number" ? a.x.seq : null;
        const sb = b.x && typeof b.x.seq === "number" ? b.x.seq : null;
        if (sa == null && sb == null) return a.i - b.i;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sa - sb || a.i - b.i;
      })
      .map((o) => o.x);
  }
  /* 从有序列表里按「早 / 中 / 晚」均匀抽样：永远含首尾，保持原顺序。
     只有 1 个名额时取中间那个（比只看第一章有代表性）。 */
  function sampleEvenly(list, max) {
    const arr = Array.isArray(list) ? list : [];
    const n = Math.max(1, Math.floor(Number(max) || 1));
    if (arr.length <= n) return arr.slice();
    if (n === 1) return [arr[Math.floor((arr.length - 1) / 2)]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.round((i * (arr.length - 1)) / (n - 1));
      if (!out.length || out[out.length - 1] !== arr[idx]) out.push(arr[idx]);
    }
    return out;
  }
  /* 一句理由里的原文引文（「」/“”/""/‘’ 都认；去重、保持出现顺序）。 */
  function radarQuotesOf(text) {
    const out = [];
    const src = String(text == null ? "" : text);
    if (!src) return out;
    const re = /「([^」]{2,})」|“([^”]{2,})”|"([^"]{2,})"|‘([^’]{2,})’/g;
    let m;
    while ((m = re.exec(src))) {
      const q = String(m[1] || m[2] || m[3] || m[4] || "").trim();
      if (q && out.indexOf(q) < 0) out.push(q);
    }
    return out;
  }
  /* 只读的一体化视图：最终分 + 最终理由 + 各段证据（原文引文 / 当时的分 / 出处）。
     不修改传入的记录，也不写回任何地方；报告工具（tools/radar-report.js）和以后可能的
     只读界面都走这一份，避免各自再解释一遍 radarEvidence。 */
  function radarEvidenceView(r, opts) {
    const rec = r || {};
    const order = opts && Array.isArray(opts.axisOrder) ? opts.axisOrder : [];
    const hasStored = Array.isArray(rec.radarEvidence) && rec.radarEvidence.length > 0;
    const evList = radarEvidenceInOrder(radarEvidenceListOf(rec));
    const axisSet = {};
    /* 模型偶尔把 summary / 说明之类塞进 radarWhy；它们不是雷达维度，报告里别列成一行。 */
    const NON_AXIS = {
      summary: 1,
      name: 1,
      type: 1,
      fields: 1,
      radar: 1,
      radarwhy: 1,
      description: 1,
      desc: 1,
      notes: 1,
      note: 1,
      备注: 1,
      说明: 1,
      描述: 1,
    };
    const addAxis = (a) => {
      const s = String(a == null ? "" : a).trim();
      if (!s || NON_AXIS[s.toLowerCase()]) return;
      axisSet[s] = true;
    };
    ["radar", "radarWhy"].forEach((k) => {
      const o = rec[k];
      if (o && typeof o === "object") Object.keys(o).forEach(addAxis);
    });
    evList.forEach((e) => {
      Object.keys((e && e.radar) || {}).forEach(addAxis);
      Object.keys((e && e.radarWhy) || {}).forEach(addAxis);
    });
    const axes = Object.keys(axisSet)
      .sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return 0;
      })
      .map((axis) => {
        const finalRaw = rec.radar && rec.radar[axis];
        const finalNum = finalRaw == null || finalRaw === "" ? null : Number(finalRaw);
        const finalReason = String((rec.radarWhy && rec.radarWhy[axis]) || "").trim();
        const evidence = [];
        evList.forEach((e) => {
          const why = String((e && e.radarWhy && e.radarWhy[axis]) || "").trim();
          const raw = e && e.radar ? e.radar[axis] : null;
          const num = raw == null || raw === "" ? null : Number(raw);
          const hasScore = num != null && isFinite(num);
          if (!why && !hasScore) return;
          evidence.push({
            fileId: String((e && e.fileId) || ""),
            segId: String((e && e.segId) || ""),
            source: String((e && e.source) || "").trim(),
            seq: e && typeof e.seq === "number" ? e.seq : null,
            score: hasScore ? num : null,
            reason: why,
            quotes: radarQuotesOf(why),
          });
        });
        return {
          axis: axis,
          score: finalNum != null && isFinite(finalNum) ? finalNum : null,
          reason: finalReason,
          quotes: radarQuotesOf(finalReason),
          evidence: evidence,
          evidenceCount: evidence.length,
          quotedCount: evidence.filter((x) => x.quotes.length).length,
        };
      });
    return {
      name: String(rec.name || "").trim(),
      type: String(rec.type || ""),
      legacy: !hasStored,
      mergedFrom: Number(rec.mergedFrom) || 1,
      sources: Array.isArray(rec.sources) ? rec.sources.slice() : rec.source ? [String(rec.source)] : [],
      evidenceTotal: evList.length,
      axes: axes,
    };
  }
  /* 雷达按顶点合分：**每条识别记录等权**（用户 2026-10-17 报的那种"两两平均"会偏袒后来的那条 ——
     合并三次就变成 v1/4 + v2/4 + v3/2，越早识别到的越不算数；合并十次时第一条只占 1/512）。
     做法：内部记 `radarSum / radarN`（每个顶点各自的累加值与"算了几条"），`radar` 永远 = sum / n。
     老数据没有 sum / n 的，就按"这一条算一个样本"补上；模型整条重判过（综合 / 反思）会把 sum / n 清掉，
     所以重判后的分数不会被再混进平均值里。 */
  function mergeRadarPair(a, b) {
    const sum = {};
    const n = {};
    const radar = {};
    const put = (rec) => {
      if (!rec || !rec.radar || typeof rec.radar !== "object") return;
      const oldSum = rec.radarSum && typeof rec.radarSum === "object" ? rec.radarSum : {};
      const oldN = rec.radarN && typeof rec.radarN === "object" ? rec.radarN : {};
      Object.keys(rec.radar).forEach((k) => {
        const v = Number(rec.radar[k]);
        if (!isFinite(v)) return;
        const s = isFinite(Number(oldSum[k])) ? Number(oldSum[k]) : v;
        const c = Math.max(1, Math.floor(Number(oldN[k]) || 1));
        sum[k] = (sum[k] || 0) + s;
        n[k] = (n[k] || 0) + c;
        radar[k] = Math.round((sum[k] / n[k]) * 10) / 10;
      });
    };
    put(a);
    put(b);
    return { radar, sum, n };
  }
  function mergeTwoRecords(a, b) {
    const r = Object.assign({}, a);
    /* 记一下这条记录是几段材料并出来的：任务级「综合汇总」靠它挑值得汇总的（跨章节多的那种） */
    r.mergedFrom = (Number(a && a.mergedFrom) || 1) + (Number(b && b.mergedFrom) || 1);
    /* 各段出处都记下来（`source` 仍只留最早那条给界面显示，这里不碰它）：
       反思校验要看「这个人物在各章里的原文」，只看第一章会把后半本才有的字段当成没依据删掉。 */
    const srcLabelsOf = (x) =>
      (Array.isArray(x && x.sources) && x.sources.length
        ? x.sources
        : String((x && x.source) || "").split(/[·・|｜/]+/)
      )
        .map((s) => String(s || "").trim())
        .filter(Boolean);
    const srcAll = [];
    srcLabelsOf(a).concat(srcLabelsOf(b)).forEach((x) => {
      if (srcAll.indexOf(x) < 0) srcAll.push(x);
    });
    if (srcAll.length) r.sources = srcAll;
    r.fields = mergeFieldLists(a && a.fields, b && b.fields);
    /* 雷达：每条记录等权平均（累加值记在 radarSum / radarN 里，`radar` 只是它算出来的当前值）。
       打分依据 radarWhy 在下面按顶点接起来 —— 分数和"为什么给这个分"一起往下传。 */
    if ((a && a.radar && Object.keys(a.radar).length) || (b && b.radar && Object.keys(b.radar).length)) {
      const m = mergeRadarPair(a, b);
      r.radar = m.radar;
      r.radarSum = m.sum;
      r.radarN = m.n;
    }
    /* 每个顶点的**打分依据**（radarWhy）也留着：同一个顶点两段都写了就接起来（去掉重复的），
       这样综合全文看分数时才说得清「为什么给这个分」。 */
    if (b && b.radarWhy && typeof b.radarWhy === "object") {
      const why = Object.assign({}, (a && a.radarWhy) || {});
      Object.keys(b.radarWhy).forEach((k) => {
        const add = String(b.radarWhy[k] == null ? "" : b.radarWhy[k]).trim();
        if (!add) return;
        const cur = String(why[k] || "").trim();
        if (!cur) why[k] = add;
        else if (cur.indexOf(add) < 0) why[k] = joinWhyText(cur, add);
      });
      r.radarWhy = why;
    }
    /* 分块证据一起往下传：综合重判只改 r.radar / r.radarWhy，这一份永远保留。 */
    const evidence = mergeRadarEvidencePair(a, b);
    if (evidence.length) r.radarEvidence = evidence;
    const sa = String((a && a.summary) || "").trim();
    const sb = String((b && b.summary) || "").trim();
    r.summary = sb.length > sa.length ? sb : sa;
    Object.keys(b || {}).forEach((k) => {
      if (
        k === "fields" ||
        k === "radar" ||
        k === "summary" ||
        k === "source" ||
        k === "sources" ||
        k === "radarEvidence" ||
        k === "seq" ||
        k === "type" ||
        k === "name"
      )
        return;
      if (!Array.isArray(b[k])) return;
      const cur = Array.isArray(a && a[k]) ? a[k].slice() : [];
      b[k].forEach((x) => {
        if (cur.indexOf(x) < 0) cur.push(x);
      });
      r[k] = cur;
    });
    return r;
  }
  /* 分析结果专用的合并：比工作区合并多保留「原文位置」。
     每条记录可能有自己的 fileId / segId / source / seq；合并后都收进 sourceRefs，
     以后回原文核对（反思 / 雷达依据）还能按每一段找到原文，而不是只剩一个出处。 */
  function resultSourceRefsOf(r) {
    const out = [];
    const add = (ref) => {
      if (!ref) return;
      const x = {
        fileId: String(ref.fileId || ""),
        segId: String(ref.segId || ""),
        source: String(ref.source || "").trim(),
        seq: typeof ref.seq === "number" ? ref.seq : null,
      };
      if (!x.fileId && !x.segId && !x.source) return;
      if (!out.some((y) => y.fileId === x.fileId && y.segId === x.segId && y.source === x.source)) out.push(x);
    };
    if (Array.isArray(r && r.sourceRefs) && r.sourceRefs.length) {
      r.sourceRefs.forEach(add);
      return out;
    }
    const labels = (Array.isArray(r && r.sources) && r.sources.length
      ? r.sources
      : String((r && r.source) || "").split(/[·・|｜/]+/)
    )
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (r && (r.fileId || r.segId)) {
      add({ fileId: r.fileId, segId: r.segId, source: labels[0] || r.source || "", seq: r.seq });
      labels.slice(1).forEach((source) => add({ fileId: r.fileId, segId: "", source, seq: r.seq }));
    } else {
      labels.forEach((source) => add({ fileId: "", segId: "", source, seq: r && r.seq }));
    }
    return out;
  }
  function mergeResultRecords(a, b) {
    const r = mergeTwoRecords(a, b);
    const refs = resultSourceRefsOf(a).concat(resultSourceRefsOf(b));
    r.sourceRefs = refs.filter(
      (x, i) => refs.findIndex((y) => y.fileId === x.fileId && y.segId === x.segId && y.source === x.source) === i
    );
    r.fileId = (a && a.fileId) || (b && b.fileId) || "";
    r.segId = (a && a.segId) || (b && b.segId) || "";
    r.source = (a && a.source) || (b && b.source) || "";
    const seqs = [a && a.seq, b && b.seq].filter((x) => typeof x === "number");
    if (seqs.length) r.seq = Math.min.apply(null, seqs);
    r.sources = r.sourceRefs.map((x) => x.source).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    const segIds = [];
    const addSegId = (id) => {
      const s = String(id || "").trim();
      if (s && segIds.indexOf(s) < 0) segIds.push(s);
    };
    [a, b].forEach((x) => {
      if (!x) return;
      (x.sourceSegIds || []).forEach(addSegId);
      addSegId(x.segId);
    });
    if (segIds.length) r.sourceSegIds = segIds;
    /* 被并掉的另一个名字也要留在「别名」里：否则「爱丽丝」被并进「爱丽丝·彼得堡」后，
       搜索、回原文核对和填入人物卡都会认不出原来的短名。 */
    if (r.type === "character") {
      const addAlias = (name) => {
        const n = String(name || "").trim();
        if (!n || n === String(r.name || "").trim()) return;
        r.fields = Array.isArray(r.fields) ? r.fields : [];
        let f = r.fields.find((x) => x && /^(别名|别称|又名|曾用名|其他写法)$/.test(String(x.label || "").trim()));
        if (!f) {
          f = { label: "别名", value: "" };
          r.fields.push(f);
        }
        const parts = String(f.value || "")
          .split(/[、,，;；/]+/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (parts.indexOf(n) < 0) parts.push(n);
        f.value = parts.join("、");
      };
      addAlias(a && a.name);
      addAlias(b && b.name);
    }
    /* 人物在多个章节 / 多个别名记录里合并出来后，重要度不能停留在其中一条的「龙套」。
       只要任一条判过「主要」，或合并证据达到 3 段，就升为「主要」；否则保留原判断。 */
    if (r.type === "character" && (r.fields || []).some((f) => f && /重要度|角色重要度/.test(String(f.label || "")))) {
      const impOf = (x) => {
        const f = ((x && x.fields) || []).find((v) => v && /重要度|角色重要度/.test(String(v.label || "")));
        return f ? String(f.value || "") : "";
      };
      const main = /主要|主角|main|protagonist/i.test(impOf(a)) || /主要|主角|main|protagonist/i.test(impOf(b));
      const evidence = Math.max(Number(r.mergedFrom) || 1, (r.sourceRefs || []).length || 0);
      if (main || evidence >= 3) {
        const f = r.fields.find((v) => v && /重要度|角色重要度/.test(String(v.label || "")));
        if (f) f.value = "主要";
      }
    }
    r.pp = {}; // 合并后综合 / 反思 / 雷达都要按新记录重新做
    return r;
  }
  function dedupeRecords(records) {
    const byKey = new Map();
    const out = [];
    (records || []).forEach((r) => {
      if (!r || !r.type) return;
      const key = r.type + "|" + (r.name || "").trim();
      const hit = byKey.get(key);
      if (!hit) {
        byKey.set(key, r);
        out.push(r);
        return;
      }
      const merged = mergeResultRecords(hit, r);
      const at = out.indexOf(hit);
      if (at >= 0) out[at] = merged;
      byKey.set(key, merged);
    });
    return out;
  }

  // 结果排序键：新结果用并行时打的分块顺序号；旧结果退化为按来源段落在任务里的位置
  function resultOrderKey(task, r) {
    if (r && typeof r.seq === "number") return r.seq;
    if (r && r.source) {
      const segs = (task && task.segments) || [];
      // 出处可能是「第一章 … · 第一节 …」合写，整串对不上就拆开再对一次
      const tryLabels = [String(r.source)].concat(
        String(r.source)
          .split(/[·・|｜/]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .reverse()
      );
      for (const t of tryLabels) {
        const idx = segs.findIndex((s) => s.label === t);
        if (idx >= 0) return idx * 100000 + 1;
      }
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function sortResultsByOrder(task) {
    if (!task || !Array.isArray(task.results) || task.results.length < 2) return;
    const withIdx = task.results.map((r, i) => ({ r, i }));
    withIdx.sort((a, b) => resultOrderKey(task, a.r) - resultOrderKey(task, b.r) || a.i - b.i);
    task.results = withIdx.map((x) => x.r);
  }

