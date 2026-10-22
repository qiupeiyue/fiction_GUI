const STRINGS = {
  "zh-CN": {
    windowTitle: "人物档案 PDF",
    title: "人物档案 PDF",
    subtitle: "从导出的 JSON 生成",
    jsonLabel: "小说 JSON",
    jsonPlaceholder: "选择导出的 .json 文件",
    outputLabel: "输出 PDF",
    outputPlaceholder: "选择保存位置",
    choose: "选择…",
    languageLabel: "报告语言",
    contentLabel: "报告内容",
    includeFields: "基本信息",
    includeRelations: "人物关系",
    includeTrajectory: "人物小传",
    includeRadar: "雷达评分与依据",
    includeAnalysis: "分析摘要",
    includeToc: "目录",
    generate: "生成 PDF",
    generating: "正在生成…",
    close: "关闭",
    reveal: "打开所在文件夹",
    note: "只读 JSON，不修改工作区。",
    ready: "选择 JSON 后生成。",
    success: "已生成。",
    errors: {
      noJson: "请选择 JSON 文件。",
      inputRead: "无法读取 JSON。",
      invalidJson: "不是有效的导出 JSON。",
      noContent: "至少选择一项内容。",
      noPermission: "没有写入权限。",
      writeFailed: "PDF 写入失败。",
      notFound: "文件不存在。",
      generic: "生成失败。",
    },
  },
  "zh-TW": {
    windowTitle: "人物檔案 PDF",
    title: "人物檔案 PDF",
    subtitle: "從匯出的 JSON 產生",
    jsonLabel: "小說 JSON",
    jsonPlaceholder: "選擇匯出的 .json 檔案",
    outputLabel: "輸出 PDF",
    outputPlaceholder: "選擇儲存位置",
    choose: "選擇…",
    languageLabel: "報告語言",
    contentLabel: "報告內容",
    includeFields: "基本資訊",
    includeRelations: "人物關係",
    includeTrajectory: "人物小傳",
    includeRadar: "雷達評分與依據",
    includeAnalysis: "分析摘要",
    includeToc: "目錄",
    generate: "產生 PDF",
    generating: "正在產生…",
    close: "關閉",
    reveal: "開啟所在資料夾",
    note: "只讀 JSON，不修改工作區。",
    ready: "選擇 JSON 後產生。",
    success: "已產生。",
    errors: {
      noJson: "請選擇 JSON 檔案。",
      inputRead: "無法讀取 JSON。",
      invalidJson: "不是有效的匯出 JSON。",
      noContent: "至少選擇一項內容。",
      noPermission: "沒有寫入權限。",
      writeFailed: "PDF 寫入失敗。",
      notFound: "檔案不存在。",
      generic: "產生失敗。",
    },
  },
  en: {
    windowTitle: "Character Report PDF",
    title: "Character Report PDF",
    subtitle: "Build from an exported JSON",
    jsonLabel: "Novel JSON",
    jsonPlaceholder: "Choose an exported .json file",
    outputLabel: "Output PDF",
    outputPlaceholder: "Choose where to save",
    choose: "Choose…",
    languageLabel: "Report language",
    contentLabel: "Report content",
    includeFields: "Profile",
    includeRelations: "Relations",
    includeTrajectory: "Character biography",
    includeRadar: "Radar scores & evidence",
    includeAnalysis: "Analysis summary",
    includeToc: "Contents",
    generate: "Generate PDF",
    generating: "Generating…",
    close: "Close",
    reveal: "Show in folder",
    note: "Reads JSON only. Your workspace is not modified.",
    ready: "Choose a JSON file to begin.",
    success: "Generated.",
    errors: {
      noJson: "Choose a JSON file.",
      inputRead: "Could not read the JSON.",
      invalidJson: "This is not a valid exported JSON.",
      noContent: "Select at least one section.",
      noPermission: "No permission to write here.",
      writeFailed: "Could not write the PDF.",
      notFound: "File not found.",
      generic: "Generation failed.",
    },
  },
  ja: {
    windowTitle: "人物資料 PDF",
    title: "人物資料 PDF",
    subtitle: "書き出した JSON から作成",
    jsonLabel: "小説 JSON",
    jsonPlaceholder: "書き出した .json を選択",
    outputLabel: "出力 PDF",
    outputPlaceholder: "保存先を選択",
    choose: "選択…",
    languageLabel: "レポート言語",
    contentLabel: "レポート内容",
    includeFields: "基本情報",
    includeRelations: "人物関係",
    includeTrajectory: "人物小伝",
    includeRadar: "レーダースコアと根拠",
    includeAnalysis: "解析概要",
    includeToc: "目次",
    generate: "PDF を生成",
    generating: "生成中…",
    close: "閉じる",
    reveal: "保存先を開く",
    note: "JSON のみ読み込み、作業データは変更しません。",
    ready: "JSON を選択してください。",
    success: "生成しました。",
    errors: {
      noJson: "JSON ファイルを選択してください。",
      inputRead: "JSON を読み込めません。",
      invalidJson: "有効な書き出し JSON ではありません。",
      noContent: "内容を 1 つ以上選択してください。",
      noPermission: "書き込み権限がありません。",
      writeFailed: "PDF を書き込めません。",
      notFound: "ファイルが見つかりません。",
      generic: "生成に失敗しました。",
    },
  },
};

const LANG_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const CHECK_KEYS = [
  ["fields", "include-fields"],
  ["relations", "include-relations"],
  ["trajectory", "include-trajectory"],
  ["radar", "include-radar"],
  ["analysis", "include-analysis"],
  ["toc", "include-toc"],
];

const PREF_KEY = "fiction_gui_character_report_v1";
const api = window.characterReport;
const el = {};
const state = {
  lang: "zh-CN",
  outputAuto: true,
  busy: false,
  langOpen: false,
  activeLangIndex: 0,
  suggestSeq: 0,
  lastOutput: "",
  status: { kind: "ready", code: "ready", detail: "" },
};

function cacheElements() {
  [
    "brand-logo",
    "app-title",
    "app-subtitle",
    "input-path",
    "output-path",
    "pick-json",
    "pick-output",
    "lang-button",
    "lang-value",
    "lang-panel",
    "include-fields",
    "include-relations",
    "include-trajectory",
    "include-radar",
    "include-analysis",
    "include-toc",
    "status",
    "spinner",
    "status-text",
    "status-detail",
    "reveal",
    "close",
    "generate",
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
  el.langWrap = el["lang-button"].parentElement;
  el.checkboxes = CHECK_KEYS.map(([, id]) => el[id]);
}

function normalizeLang(lang) {
  return STRINGS[lang] ? lang : "";
}

function strings() {
  return STRINGS[state.lang] || STRINGS["zh-CN"];
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" ? value : {};
  } catch (err) {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({
        inputPath: el["input-path"].value.trim(),
        outputPath: el["output-path"].value.trim(),
        outputAuto: state.outputAuto,
        lang: state.lang,
        include: collectInclude(),
      })
    );
  } catch (err) {
    /* ignore */
  }
}

function collectInclude() {
  const include = {};
  CHECK_KEYS.forEach(([key, id]) => {
    include[key] = !!el[id].checked;
  });
  return include;
}

function hasVisibleContent(include) {
  return CHECK_KEYS.some(([key]) => key !== "toc" && include[key]);
}

function renderLanguageOptions() {
  const panel = el["lang-panel"];
  panel.replaceChildren();
  LANG_OPTIONS.forEach((option, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ui-select-item";
    item.dataset.lang = option.value;
    item.dataset.index = String(index);
    item.setAttribute("role", "option");
    item.textContent = option.label;
    panel.appendChild(item);
  });
  syncLanguageSelection();
}

function syncLanguageSelection() {
  const selected = LANG_OPTIONS.findIndex((option) => option.value === state.lang);
  Array.from(el["lang-panel"].children).forEach((item, index) => {
    const isSelected = index === selected;
    item.classList.toggle("selected", isSelected);
    item.classList.toggle("active", state.langOpen && index === state.activeLangIndex);
    item.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
  const current = LANG_OPTIONS[selected >= 0 ? selected : 0];
  el["lang-value"].textContent = current.label;
}

function setLanguageOpen(open, activeIndex) {
  state.langOpen = !!open;
  el["lang-button"].setAttribute("aria-expanded", open ? "true" : "false");
  el["lang-panel"].hidden = !open;
  if (open) {
    const selected = LANG_OPTIONS.findIndex((option) => option.value === state.lang);
    state.activeLangIndex =
      Number.isInteger(activeIndex) && activeIndex >= 0
        ? Math.min(activeIndex, LANG_OPTIONS.length - 1)
        : Math.max(0, selected);
  }
  syncLanguageSelection();
  if (open) {
    const active = el["lang-panel"].children[state.activeLangIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }
}

function moveLanguageActive(delta) {
  if (!state.langOpen) setLanguageOpen(true);
  state.activeLangIndex =
    (state.activeLangIndex + delta + LANG_OPTIONS.length) % LANG_OPTIONS.length;
  syncLanguageSelection();
  const active = el["lang-panel"].children[state.activeLangIndex];
  if (active) active.scrollIntoView({ block: "nearest" });
}

function chooseLanguage(lang) {
  if (!normalizeLang(lang)) return;
  setLanguageOpen(false);
  applyLanguage(lang);
  el["lang-button"].focus();
}

function applyLanguage(lang, options) {
  const next = normalizeLang(lang) || "zh-CN";
  state.lang = next;
  const t = strings();
  document.documentElement.lang = next;
  document.title = t.windowTitle;
  el["app-title"].textContent = t.title;
  el["app-subtitle"].textContent = t.subtitle;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (t[key] != null) node.textContent = t[key];
  });
  el["input-path"].placeholder = t.jsonPlaceholder;
  el["output-path"].placeholder = t.outputPlaceholder;
  syncLanguageSelection();
  renderStatus();
  savePrefs();
  if ((!options || options.refreshOutput !== false) && state.outputAuto) {
    refreshSuggestedOutput();
  }
}

function renderStatus() {
  const t = strings();
  let text = t.ready;
  let detail = "";
  const kind = state.status.kind;
  if (kind === "busy") {
    text = t.generating;
  } else if (kind === "success") {
    text = t.success;
    detail = state.status.detail || "";
  } else if (kind === "error") {
    const key = state.status.code || "generic";
    text = t.errors[key] || t.errors.generic;
    detail = state.status.detail || "";
  }
  el.status.className = `status ${kind === "ready" ? "" : kind}`.trim();
  el["status-text"].textContent = text;
  el["status-detail"].textContent = detail;
  el["status-detail"].hidden = !detail;
  el.spinner.hidden = kind !== "busy";
}

function setStatus(kind, code, detail) {
  state.status = { kind, code: code || "", detail: detail || "" };
  renderStatus();
}

function setBusy(on) {
  state.busy = !!on;
  [
    el["input-path"],
    el["output-path"],
    el["pick-json"],
    el["pick-output"],
    el["lang-button"],
    el.close,
    el.generate,
    el.reveal,
    ...el.checkboxes,
  ].forEach((node) => {
    node.disabled = state.busy;
  });
  el.generate.textContent = state.busy ? strings().generating : strings().generate;
}

function setOutput(value, auto) {
  el["output-path"].value = value || "";
  state.outputAuto = !!auto;
  if (!state.outputAuto) state.suggestSeq += 1;
  savePrefs();
}

async function refreshSuggestedOutput() {
  if (!state.outputAuto) return;
  const inputPath = el["input-path"].value.trim();
  if (!inputPath) {
    setOutput("", true);
    return;
  }
  const seq = ++state.suggestSeq;
  const info = await api.suggestOutput(inputPath, state.lang);
  if (seq !== state.suggestSeq || !state.outputAuto) return;
  if (info && info.ok && info.defaultOutput) setOutput(info.defaultOutput, true);
}

function clearGeneratedOutput() {
  state.lastOutput = "";
  el.reveal.hidden = true;
}

async function pickJson() {
  if (state.busy) return;
  const info = await api.pickJson(el["input-path"].value.trim(), state.lang);
  if (!info || info.canceled) return;
  clearGeneratedOutput();
  el["input-path"].value = info.path || "";
  if (info.error) {
    setStatus("error", info.error, info.detail || "");
  } else {
    setStatus("ready", "ready");
  }
  savePrefs();
  if (info.ok && info.defaultOutput && state.outputAuto) {
    setOutput(info.defaultOutput, true);
  } else if (!el["output-path"].value.trim() && info.defaultOutput) {
    setOutput(info.defaultOutput, true);
  }
}

async function pickOutput() {
  if (state.busy) return;
  const info = await api.pickOutput(el["output-path"].value.trim(), state.lang);
  if (!info || info.canceled) return;
  clearGeneratedOutput();
  setOutput(info.path || "", false);
}

async function generate() {
  if (state.busy) return;
  const inputPath = el["input-path"].value.trim();
  if (!inputPath) {
    setStatus("error", "noJson");
    el["input-path"].focus();
    return;
  }
  const include = collectInclude();
  if (!hasVisibleContent(include)) {
    setStatus("error", "noContent");
    return;
  }
  clearGeneratedOutput();
  savePrefs();
  setBusy(true);
  setStatus("busy", "generating");
  let result;
  try {
    result = await api.generate({
      inputPath,
      outputPath: el["output-path"].value.trim(),
      lang: state.lang,
      include,
    });
  } catch (err) {
    result = { ok: false, code: "generic", detail: String((err && err.message) || err) };
  }
  setBusy(false);
  if (result && result.ok) {
    state.lastOutput = result.path || "";
    if (result.path) {
      el["output-path"].value = result.path;
      state.outputAuto = false;
    }
    el.reveal.hidden = false;
    setStatus("success", "success", result.path || "");
    savePrefs();
  } else {
    setStatus("error", (result && result.code) || "generic", (result && result.detail) || "");
  }
}

async function revealOutput() {
  if (!state.lastOutput) return;
  const result = await api.reveal(state.lastOutput);
  if (!result || !result.ok) setStatus("error", "notFound");
}

async function requestClose() {
  if (state.busy) return;
  const result = await api.close();
  if (result && result.ok === false) setStatus("busy", "generating");
}

function bindEvents() {
  el["lang-button"].addEventListener("click", (event) => {
    event.stopPropagation();
    setLanguageOpen(!state.langOpen);
  });
  el["lang-button"].addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveLanguageActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (state.langOpen) {
        chooseLanguage(LANG_OPTIONS[state.activeLangIndex].value);
      } else {
        setLanguageOpen(true);
      }
    } else if (event.key === "Escape" && state.langOpen) {
      event.preventDefault();
      event.stopPropagation();
      setLanguageOpen(false);
    }
  });
  el["lang-panel"].addEventListener("click", (event) => {
    const item = event.target.closest(".ui-select-item");
    if (!item) return;
    event.stopPropagation();
    chooseLanguage(item.dataset.lang);
  });
  document.addEventListener("pointerdown", (event) => {
    if (state.langOpen && !el.langWrap.contains(event.target)) setLanguageOpen(false);
  });

  el["pick-json"].addEventListener("click", pickJson);
  el["pick-output"].addEventListener("click", pickOutput);
  el.generate.addEventListener("click", generate);
  el.close.addEventListener("click", requestClose);
  el.reveal.addEventListener("click", revealOutput);

  el["input-path"].addEventListener("input", () => {
    clearGeneratedOutput();
    savePrefs();
    if (state.outputAuto) refreshSuggestedOutput();
  });
  el["input-path"].addEventListener("change", () => {
    if (state.outputAuto) refreshSuggestedOutput();
  });
  el["output-path"].addEventListener("input", () => {
    clearGeneratedOutput();
    state.outputAuto = false;
    savePrefs();
  });
  el.checkboxes.forEach((box) => {
    box.addEventListener("change", () => {
      clearGeneratedOutput();
      savePrefs();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (state.langOpen) {
        event.preventDefault();
        setLanguageOpen(false);
        return;
      }
      if (state.busy) {
        event.preventDefault();
        setStatus("busy", "generating");
        return;
      }
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target === el["input-path"] || target === el["output-path"]) {
      event.preventDefault();
      generate();
    }
  });

  el["brand-logo"].addEventListener("error", () => {
    el["brand-logo"].hidden = true;
  });
}

async function init() {
  cacheElements();
  renderLanguageOptions();
  bindEvents();
  if (el["brand-logo"].complete && !el["brand-logo"].naturalWidth) el["brand-logo"].hidden = true;

  const saved = loadPrefs();
  let boot = {};
  try {
    boot = (await api.bootstrap()) || {};
  } catch (err) {
    boot = {};
  }
  const lang =
    normalizeLang(boot.lang) ||
    normalizeLang(saved.lang) ||
    normalizeLang(boot.systemLang) ||
    "zh-CN";
  state.lang = lang;
  applyLanguage(lang, { refreshOutput: false });

  const inputPath = String(boot.inputPath || saved.inputPath || "");
  el["input-path"].value = inputPath;

  let outputPath = "";
  let outputAuto = saved.outputAuto !== false;
  if (boot.outputPath) {
    outputPath = boot.outputPath;
    outputAuto = false;
  } else if (boot.defaultOutput) {
    outputPath = boot.defaultOutput;
    outputAuto = true;
  } else if (saved.outputPath) {
    outputPath = saved.outputPath;
  }
  setOutput(outputPath, outputAuto);

  const includeSource =
    boot.include && Object.keys(boot.include).length ? boot.include : saved.include || {};
  CHECK_KEYS.forEach(([key, id]) => {
    el[id].checked = includeSource[key] !== false;
  });

  renderStatus();
  if (inputPath && state.outputAuto) await refreshSuggestedOutput();
  savePrefs();
}

init();
