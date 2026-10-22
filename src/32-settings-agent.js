  function bindSettingsModal() {
    const nav = $("#set-nav");
    if (nav)
      nav.querySelectorAll(".set-nav-btn").forEach((b) =>
        b.addEventListener("click", () => selectSettingsPane(b.dataset.setPane))
      );
    const openBtn = $("#settings-btn");
    if (openBtn) openBtn.addEventListener("click", () => openSettingsModal());
    const saveBtn = $("#settings-save-btn");
    if (saveBtn)
      saveBtn.addEventListener("click", () => {
        saveSettingsModal({ keepOpen: true }); // 保存但不关界面
        saveBtn.blur(); // 之后再按 Enter ＝ 保存并关闭
      });
    bindAutoSaveSettings();
    bindAutoUpdatePane();
    bindLangPane();
    bindPathsPane();
    bindFieldsetPanels();
    bindManageLists();
    bindRadarSettings();
    bindRulePanes();
    bindSettingsEnterKey();
    // 设置界面里的 Ctrl+Z / Ctrl+Y：撤 / 恢复「设置面板里的改动」
    document.addEventListener("keydown", (ev) => {
      if (!settingsModalOpen || !(ev.ctrlKey || ev.metaKey)) return;
      // 设置上面还压着别的弹窗（重命名 / 二次确认等）时，快捷键交给那个弹窗
      const others = $$(".modal-overlay:not([hidden])").filter((ov) => ov.id !== "settings-modal");
      if (others.length) return;
      const key = String(ev.key || "").toLowerCase();
      if (key === "l") {
        // Ctrl+L＝保存，但不关设置界面
        ev.preventDefault();
        ev.stopPropagation();
        saveSettingsModal({ keepOpen: true });
      } else if (key === "z" && !ev.shiftKey) {
        ev.preventDefault();
        ev.stopPropagation();
        settingsUndoStep();
      } else if (key === "y" || (key === "z" && ev.shiftKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        settingsRedoStep();
      }
    });
    $$(".js-set-undo").forEach((b) => b.addEventListener("click", () => settingsUndoStep()));
    const relKindResetBtn = $("#rel-kind-reset");
    if (relKindResetBtn) relKindResetBtn.addEventListener("click", () => resetRelKinds());
    const relKindAddBtn = $("#rel-kind-add-btn");
    if (relKindAddBtn)
      relKindAddBtn.addEventListener("click", () =>
        Promise.resolve(addCustomRelKind()).then(() => renderManageRelKinds())
      );
    // 三栏各自的「恢复默认」：只清掉这一栏（人物 / 事件 / 设定档案）的保护方式
    $$("[data-protect-reset]").forEach((b) =>
      b.addEventListener("click", () => resetFillProtect(b.dataset.protectReset || ""))
    );
    try {
      const saved = localStorage.getItem(SET_PANE_KEY);
      if (saved && SET_PANES.includes(saved)) settingsPane = saved;
    } catch (e) {
      /* ignore */
    }
    selectSettingsPane(settingsPane);
  }

  // 设置 → 历史版本：自动保存开关 + 间隔；另外每 5 秒补一次「被节流跳过」的存档
  // 设置界面：右上角 × 和 Esc ＝ 关闭不保存；Enter ＝ 保存并关闭
  //   Agent 子界面 → 保存 Agent 配置；历史版本 → 有备注就先存一版；其它子界面 → 直接关
  function bindSettingsEnterKey() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const modal = $("#settings-modal");
      if (!modal || modal.hidden) return;
      if (e.isComposing || e.keyCode === 229) return; // 输入法组词中
      const t = e.target;
      if (t && t.closest) {
        if (t.closest("textarea")) return; // 多行输入里回车就是换行
        // 输入框里回车＝把这一格记下、光标移出去（见「回车＝失焦」那段），不保存也不关设置
        if (t.tagName === "INPUT") return;
      }
      e.preventDefault();
      e.stopPropagation();
      // 回车＝保存并关闭（Agent 子界面会先提交表单；历史版本有备注就先存一版）
      saveSettingsModal();
    });
  }

  function bindAutoSaveSettings() {
    loadAutoSaveOpts();
    const cb = $("#autosave-enabled");
    if (cb)
      cb.addEventListener("change", () => {
        setAutoSaveOpts({ enabled: cb.checked });
        showToast(cb.checked ? `已开启自动保存（每 ${autoSaveOpts.minutes} 分钟最多一版）` : "已关闭自动保存，仍可手动保存版本");
      });
    const num = $("#autosave-interval");
    if (num)
      num.addEventListener("change", () => {
        const v = Math.max(AUTOSAVE_MIN_MINUTES, Math.min(AUTOSAVE_MAX_MINUTES, Math.round(Number(num.value) || AUTOSAVE_DEF.minutes)));
        num.value = String(v);
        setAutoSaveOpts({ minutes: v });
        showToast(`自动保存间隔已改成 ${v} 分钟`);
      });
    syncAutoSaveUi();
    setInterval(() => {
      if (autoSaveDirty) autoLogSnapshot();
    }, 5000);
  }

  function openAgentModal() {
    const st = $("#agent-test-status");
    if (st) {
      st.textContent = "";
      st.className = "agent-test-status";
    }
    openSettingsModal("agent");
  }

  function currentProvider(baseUrl) {
    const b = (baseUrl || "").replace(/\/+$/, "");
    return AGENT_PROVIDERS.find((p) => p.baseUrl && p.baseUrl.replace(/\/+$/, "") === b) || null;
  }

  function renderAgentForm() {
    const cfg = loadAgentConfig();
    const keyEl = $("#agent-key");
    if (keyEl) keyEl.value = cfg.apiKey || "";
    const prov = $("#agent-provider");
    prov.innerHTML = AGENT_PROVIDERS.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
    const match = currentProvider(cfg.baseUrl);
    const pid = match ? match.id : "custom";
    prov.value = pid;
    $("#agent-custom-baseurl").hidden = pid !== "custom";
    $("#agent-custom-baseurl").value = pid === "custom" ? cfg.baseUrl : "";
    const cached = cachedModelList(cfg.baseUrl);
    renderModelSelect(pid, cfg.model, cached ? sortModelIds(cached.ids, (match && match.models) || []) : null);
    setAgentModelStatus(cached ? `本地缓存 ${cached.ids.length} 个模型` : "");
    $("#agent-concurrency").value = String(cfg.concurrency || 3);
    const mt = $("#agent-max-tokens");
    if (mt) mt.value = String(cfg.maxTokens || DEFAULT_MAX_TOKENS);
    const ch = $("#agent-chapters");
    if (ch) ch.value = String(Math.max(1, Math.min(3, Math.floor(Number(cfg.chaptersPerCall) || 1))));
    // 配了 Key 就顺手联网更新一次（缓存还在 12 小时内的会直接跳过）
    if (cfg.apiKey) setTimeout(() => refreshAgentModels(false, true), 80);
  }

  /* ---- 模型列表：能联网时从 /models 拉最新列表，拉不到就用内置常用列表 ---- */
  const AGENT_MODELS_KEY = "fiction_gui_agent_models_v1";
  const MODEL_CACHE_MAX_AGE = 12 * 60 * 60 * 1000; // 缓存 12 小时

  function loadModelCache() {
    try {
      return JSON.parse(localStorage.getItem(AGENT_MODELS_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveModelCache(cache) {
    try {
      localStorage.setItem(AGENT_MODELS_KEY, JSON.stringify(cache));
    } catch (e) {
      /* ignore */
    }
  }

  function cachedModelList(baseUrl) {
    const hit = loadModelCache()[baseUrl];
    return hit && Array.isArray(hit.ids) && hit.ids.length ? hit : null;
  }

  // 明显不是「对话补全」用途的模型滤掉（向量 / 语音 / 画图 / 审核 / 补全专用）
  function isUsableChatModel(id) {
    const s = String(id || "").toLowerCase();
    return !/embedding|embed-|whisper|tts|audio|realtime|dall-e|image|moderation|rerank|bge-|clip|speech|transcribe|stable-diffusion|sd-turbo|codex/.test(
      s
    );
  }

  // 排序依据：正式版优先 → 版本号 / 日期新 → 名字短
  function modelSortMeta(id) {
    const s = String(id || "").toLowerCase();
    const preview = /preview|beta|experimental|alpha|deprecated|legacy|old|rc\d/.test(s) ? 1 : 0;
    const d = s.match(/(20\d{2})[-._]?(\d{2})[-._]?(\d{2})/);
    const dateKey = d ? Number(d[1] + d[2] + d[3]) : 0;
    const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0 && n < 1000);
    return { preview, dateKey, ver: nums.length ? Math.max.apply(null, nums) : 0 };
  }

  // 内置的「常用模型」排最前（保持它们的顺序），其余按上面的规则排
  function sortModelIds(ids, curated) {
    const cur = new Map((curated || []).map((m, i) => [String(m).toLowerCase(), i]));
    return ids.slice().sort((a, b) => {
      const ai = cur.has(String(a).toLowerCase()) ? cur.get(String(a).toLowerCase()) : 9999;
      const bi = cur.has(String(b).toLowerCase()) ? cur.get(String(b).toLowerCase()) : 9999;
      if (ai !== bi) return ai - bi;
      const ka = modelSortMeta(a);
      const kb = modelSortMeta(b);
      if (ka.preview !== kb.preview) return ka.preview - kb.preview;
      if (ka.dateKey !== kb.dateKey) return kb.dateKey - ka.dateKey;
      if (ka.ver !== kb.ver) return kb.ver - ka.ver;
      if (String(a).length !== String(b).length) return String(a).length - String(b).length;
      return String(a).localeCompare(String(b));
    });
  }

  function setAgentModelStatus(text, cls) {
    const el = $("#agent-model-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "agent-model-status" + (cls ? " " + cls : "");
  }

  // 记下当前表单指向的 baseUrl（用户可能正在改下拉，所以不能只看已保存的配置）
  function agentBaseUrlFromForm() {
    const pid = $("#agent-provider").value;
    const prov = AGENT_PROVIDERS.find((p) => p.id === pid);
    const raw = prov && prov.baseUrl ? prov.baseUrl : $("#agent-custom-baseurl").value.trim();
    return (raw || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  async function fetchModelIds(cfg) {
    const url = cfg.baseUrl.replace(/\/+$/, "") + "/models";
    const resp = await agentFetch(url, { method: "GET", headers: { Authorization: "Bearer " + cfg.apiKey } }, 30000);
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error("接口返回 " + resp.status + (t ? "：" + String(t).replace(/\s+/g, " ").slice(0, 80) : ""));
    }
    const raw = await resp.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error("返回的不是 JSON");
    }
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data.data)) arr = data.data;
    else if (data.data && Array.isArray(data.data.models)) arr = data.data.models;
    else if (Array.isArray(data.models)) arr = data.models;
    const ids = arr
      .map((x) => (typeof x === "string" ? x : (x && (x.id || x.name || x.model)) || ""))
      .map((x) => String(x).trim())
      .filter((x) => x && isUsableChatModel(x));
    if (!ids.length) throw new Error("接口没返回可用的对话模型");
    return Array.from(new Set(ids));
  }

  // force=true 忽略缓存强制刷新；silent=true 时失败只在状态里提示，不弹窗
  async function refreshAgentModels(force, silent) {
    const cfg = readAgentForm();
    const baseUrl = cfg.baseUrl;
    if (!cfg.apiKey) {
      if (!silent) setAgentModelStatus("先填 API Key 才能联网获取", "warn");
      return false;
    }
    const cached = cachedModelList(baseUrl);
    if (!force && cached && Date.now() - (cached.at || 0) < MODEL_CACHE_MAX_AGE) return true;
    setAgentModelStatus("获取中…", "loading");
    try {
      const ids = await fetchModelIds(cfg);
      const cache = loadModelCache();
      cache[baseUrl] = { ids, at: Date.now() };
      saveModelCache(cache);
      if (agentBaseUrlFromForm() === baseUrl) {
        const prov = AGENT_PROVIDERS.find((p) => p.baseUrl && p.baseUrl.replace(/\/+$/, "") === baseUrl);
        const pid = $("#agent-provider").value;
        const keep = $("#agent-model").value === "__custom__" ? $("#agent-custom-model").value.trim() : $("#agent-model").value;
        renderModelSelect(pid, keep, sortModelIds(ids, (prov && prov.models) || []));
      }
      const stamp = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      setAgentModelStatus(`已获取 ${ids.length} 个模型 · ${stamp}`, "ok");
      return true;
    } catch (e) {
      if (!silent) setAgentModelStatus(uiTextFor("获取失败") + "：" + uiTrans(e && e.message ? e.message : String(e)), "err");
      return false;
    }
  }

  function renderModelSelect(pid, savedModel, fetched) {
    const sel = $("#agent-model");
    const prov = AGENT_PROVIDERS.find((p) => p.id === pid);
    const curated = prov && prov.models ? prov.models.slice() : [];
    const models = fetched && fetched.length ? fetched.slice() : curated;
    let html = "";
    if (pid !== "custom") {
      if (savedModel && !models.includes(savedModel)) {
        html += `<option value="${esc(savedModel)}">${esc(savedModel)}（当前）</option>`;
      }
      models.forEach((m) => {
        html += `<option value="${esc(m)}">${esc(m)}</option>`;
      });
      html += `<option value="__custom__">自定义模型…</option>`;
      sel.innerHTML = html;
      sel.value = savedModel && !models.includes(savedModel) ? savedModel : models.includes(savedModel) ? savedModel : models[0] || "__custom__";
    } else {
      sel.innerHTML = `<option value="__custom__">自定义模型…</option>`;
      sel.value = "__custom__";
    }
    const isCustom = sel.value === "__custom__";
    $("#agent-custom-model").hidden = !isCustom;
    $("#agent-custom-model").value = isCustom ? savedModel || "" : "";
  }

  function onAgentProviderChange() {
    const pid = $("#agent-provider").value;
    $("#agent-custom-baseurl").hidden = pid !== "custom";
    if (pid === "custom") {
      $("#agent-custom-baseurl").value = loadAgentConfig().baseUrl;
    }
    const prov = AGENT_PROVIDERS.find((p) => p.id === pid);
    const baseUrl = (prov && prov.baseUrl ? prov.baseUrl : $("#agent-custom-baseurl").value.trim()).replace(/\/+$/, "");
    const cached = cachedModelList(baseUrl);
    renderModelSelect(pid, "", cached ? sortModelIds(cached.ids, (prov && prov.models) || []) : null);
    setAgentModelStatus(cached ? `本地缓存 ${cached.ids.length} 个模型` : "");
  }

  function onAgentModelChange() {
    $("#agent-custom-model").hidden = $("#agent-model").value !== "__custom__";
  }

  function submitAgentForm(e) {
    e.preventDefault();
    const keepOpen = agentSaveKeepOpen; // 「保存」按钮 / Ctrl+L：保存不关界面
    agentSaveKeepOpen = false;
    const prev = loadAgentConfig();
    const next = readAgentForm();
    const changed = prev.apiKey !== next.apiKey || prev.baseUrl !== next.baseUrl || prev.model !== next.model;
    saveAgentConfig(readAgentForm());
    if (keepOpen) takeSettingsSnapshot(); // 保存后重新立基线，后面 Esc 不会把已保存的退回
    else {
      settingsSnapshot = null; // 已经保存，关掉时不要再退回
      closeModal("settings-modal");
    }
    if (!changed) {
      // 配置没变：刚才手动「测试连接」的结果照样有效，别把它当成过期作废
      syncAgentUi();
      showToast("Agent 配置已保存");
      return;
    }
    // 配置变了：老检测结果作废，马上按新配置重测一次
    const hadStatus = !!agentStatus.at;
    agentStatus = { ok: false, at: 0, msg: "" };
    saveAgentStatus();
    syncAgentUi();
    showToast(hadStatus ? "Agent 配置已保存，正在重新检测连接…" : "Agent 配置已保存，正在检测连接…");
    refreshAgentAvailability(true);
  }

  function readAgentForm() {
    const pid = $("#agent-provider").value;
    const prov = AGENT_PROVIDERS.find((p) => p.id === pid);
    let baseUrl = prov && prov.baseUrl ? prov.baseUrl : $("#agent-custom-baseurl").value.trim();
    baseUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    let model = $("#agent-model").value;
    if (model === "__custom__") model = $("#agent-custom-model").value.trim() || "gpt-4o-mini";
    return {
      baseUrl,
      apiKey: $("#agent-key").value.trim(),
      model,
      concurrency: parseInt($("#agent-concurrency").value, 10) || 3,
      maxTokens: parseInt(($("#agent-max-tokens") || {}).value, 10) || DEFAULT_MAX_TOKENS,
      reflect: true,
      chaptersPerCall: Math.max(1, Math.min(3, parseInt(($("#agent-chapters") || {}).value, 10) || 1)),
    };
  }

  // 手动「测试连接」的结果也记进可用性里——但只在这个配置和已保存的一致时才作数，
  // 免得用户只是随手试填了一个坏 Key，就把本来能用的 Agent 判成「接不上。
  function rememberAgentStatusFromForm(cfg, ok, msg) {
    const saved = loadAgentConfig();
    const same =
      saved.apiKey === cfg.apiKey && saved.baseUrl === cfg.baseUrl && saved.model === cfg.model;
    if (ok) {
      // 成功一定作数：手动测试能通，说明这个 Agent 确实可用，
      // 立刻解开「功能变灰」——以前这里还要求表单和已保存配置逐项相同，
      // 只要模型 / 地址写法有点差异，成功结果就被丢掉，于是出现「测试连接正常但功能被禁用」。
      agentStatus = { ok: true, at: Date.now(), msg: msg || "" };
    } else if (same) {
      // 失败只在「和已保存配置一致」时才作数，免得随手试填一个坏 Key 把能用的 Agent 判死
      agentStatus = { ok: false, at: Date.now(), msg: msg || "" };
    } else {
      return;
    }
    saveAgentStatus();
    syncAgentUi();
  }

  async function testAgentConnection() {
    const cfg = readAgentForm();
    const status = $("#agent-test-status");
    status.className = "agent-test-status";
    if (!cfg.apiKey) {
      status.textContent = "请先填写 API Key";
      status.classList.add("err");
      return;
    }
    status.textContent = "测试中…";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      let resp;
      try {
        resp = await agentFetch(
          cfg.baseUrl + "/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              model: cfg.model,
              max_tokens: 200,
              messages: [{ role: "user", content: '只回答这一行 JSON，不要别的：{"ok":true}' }],
            }),
          },
          30000
        );
      } catch (e) {
        if (controller.signal.aborted) throw new Error("超时（30 秒无响应）");
      throw new Error("连接失败：" + (e && e.message ? e.message : e) + "（可能是地址错误、Key 无效，或该接口不允许直连）");
      }
      const rawBody = await resp.text();
      if (!resp.ok) {
        throw new Error("接口返回 " + resp.status + "：" + rawBody.replace(/\s+/g, " ").slice(0, 200));
      }
      // 不只是看状态码：还要确认真的能拿到正文（这才是分析失败的常见原因）
      let data = null;
      try {
        data = JSON.parse(rawBody);
      } catch (e) {
        throw new Error("返回的不是 JSON：" + rawBody.replace(/\s+/g, " ").slice(0, 160));
      }
      if (data.error) throw new Error("接口返回错误：" + String(data.error.message || JSON.stringify(data.error)).slice(0, 160));
      const choice = data.choices && data.choices[0];
      const msg = (choice && choice.message) || {};
      const content = pickMessageText(msg.content);
      const finish = (choice && choice.finish_reason) || "";
      const usage = data.usage || {};
      if (!content) {
        throw new Error(
          `能连上，但模型没返回正文（finish_reason=${finish || "?"}${
            msg.reasoning_content ? "，只返回了思考内容" : ""
          }）。分析时也会因此失败：请换用非思考模型，或把「输出上限」调大。`
        );
      }
      status.textContent = `连接成功 ✓ 模型 ${cfg.model} 可用（返回 ${content.length} 字${
        finish ? "，finish_reason=" + finish : ""
      }${usage.completion_tokens ? "，输出 " + usage.completion_tokens + " tokens" : ""}）`;
      status.classList.add("ok");
      rememberAgentStatusFromForm(cfg, true, "连接正常");
    } catch (e) {
      status.textContent = uiTextFor("失败") + "：" + uiTrans(e && e.message ? e.message : String(e));
      status.classList.add("err");
      rememberAgentStatusFromForm(cfg, false, (e && e.message ? e.message : String(e)).slice(0, 120));
    } finally {
      clearTimeout(timer);
    }
  }

