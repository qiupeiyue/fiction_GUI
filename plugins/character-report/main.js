const { app, BrowserWindow, dialog, ipcMain, shell, Menu, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { buildHtml, collectReport } = require("./report");

const LANGS = ["zh-CN", "zh-TW", "en", "ja"];
const INCLUDE_KEYS = ["fields", "relations", "trajectory", "radar", "analysis", "toc"];
const OUTPUT_SUFFIX = {
  "zh-CN": "人物档案",
  "zh-TW": "人物檔案",
  en: "Character Book",
  ja: "人物資料",
};
const DIALOG_TITLES = {
  "zh-CN": { json: "选择导出的 JSON", pdf: "保存人物档案" },
  "zh-TW": { json: "選擇匯出的 JSON", pdf: "儲存人物檔案" },
  en: { json: "Select exported JSON", pdf: "Save character report" },
  ja: { json: "書き出した JSON を選択", pdf: "人物資料を保存" },
};

let mainWindow = null;
let busy = false;

function normalizeLang(value) {
  const lang = String(value || "").trim();
  return LANGS.includes(lang) ? lang : "";
}

function systemLang() {
  const locale = String(app.getLocale() || "").toLowerCase();
  if (locale.startsWith("zh-tw") || locale.startsWith("zh-hk") || locale.startsWith("zh-mo")) return "zh-TW";
  if (locale.startsWith("zh")) return "zh-CN";
  if (locale.startsWith("ja")) return "ja";
  return "en";
}

function safeName(name) {
  return String(name || "Novel")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Novel";
}

function exportTitle(input) {
  if (!input || typeof input !== "object") return "";
  if (input.data && Array.isArray(input.data.characters)) return String(input.title || "Novel");
  if (input.data && input.data.data && Array.isArray(input.data.data.characters)) {
    return String(input.title || input.data.title || "Novel");
  }
  if (Array.isArray(input.characters)) return String(input.title || "Novel");
  return "";
}

function defaultOutput(inputPath, title, lang) {
  const suffix = OUTPUT_SUFFIX[lang] || OUTPUT_SUFFIX["zh-CN"];
  return path.join(path.dirname(inputPath), `${safeName(title || path.basename(inputPath, path.extname(inputPath)))}_${suffix}.pdf`);
}

function normalizePdfPath(outputPath) {
  let target = String(outputPath || "").trim();
  if (!target) return "";
  target = path.resolve(target);
  if (/[\\/]$/.test(target)) {
    target = path.join(target, `${OUTPUT_SUFFIX["zh-CN"]}.pdf`);
  }
  if (path.extname(target).toLowerCase() !== ".pdf") target += ".pdf";
  return target;
}

function normalizeInclude(value) {
  const result = {};
  INCLUDE_KEYS.forEach((key) => {
    result[key] = !value || value[key] !== false;
  });
  return result;
}

function hasVisibleContent(include) {
  return INCLUDE_KEYS.some((key) => key !== "toc" && include[key]);
}

async function readExport(inputPath) {
  const abs = path.resolve(String(inputPath || "").trim());
  if (!inputPath || !String(inputPath).trim()) {
    return { ok: false, code: "no-json" };
  }
  let raw;
  try {
    raw = await fs.promises.readFile(abs, "utf8");
  } catch (err) {
    return { ok: false, code: "input-read", detail: String((err && err.message) || err), path: abs };
  }
  let data;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { ok: false, code: "invalid-json", detail: String((err && err.message) || err), path: abs };
  }
  const title = exportTitle(data);
  if (!title) {
    return { ok: false, code: "invalid-json", detail: "Not a fiction-gui export.", path: abs };
  }
  return { ok: true, data, title, path: abs };
}

async function suggestOutput(inputPath, lang) {
  const loaded = await readExport(inputPath);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    path: loaded.path,
    title: loaded.title,
    defaultOutput: defaultOutput(loaded.path, loaded.title, lang),
  };
}

async function renderPdf(html, outputPath) {
  let tmpDir = "";
  let win = null;
  try {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fiction-gui-character-report-"));
    const tmpHtml = path.join(tmpDir, "report.html");
    await fs.promises.writeFile(tmpHtml, html, "utf8");
    win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        javascript: false,
      },
    });
    await win.loadFile(tmpHtml);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#6b7280;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.6, bottom: 0.6, left: 0.55, right: 0.55 },
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    const tmpPdf = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
    await fs.promises.writeFile(tmpPdf, pdf);
    try {
      await fs.promises.rename(tmpPdf, outputPath);
    } catch (err) {
      try {
        await fs.promises.unlink(tmpPdf);
      } catch (ignore) {
        /* ignore */
      }
      throw err;
    }
    return { ok: true, path: outputPath };
  } catch (err) {
    const message = String((err && err.message) || err || "PDF");
    if (/EACCES|EPERM|permission|access is denied/i.test(message)) {
      return { ok: false, code: "no-permission", detail: path.dirname(outputPath) };
    }
    return { ok: false, code: "write-failed", detail: message };
  } finally {
    try {
      if (win) win.destroy();
    } catch (ignore) {
      /* ignore */
    }
    if (tmpDir) {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (ignore) {
        /* ignore */
      }
    }
  }
}

async function generateReport(payload) {
  const options = payload || {};
  if (busy) return { ok: false, code: "busy" };
  const lang = normalizeLang(options.lang) || "zh-CN";
  const include = normalizeInclude(options.include);
  if (!hasVisibleContent(include)) return { ok: false, code: "no-content" };

  busy = true;
  try {
    const loaded = await readExport(options.inputPath);
    if (!loaded.ok) return loaded;
    const outputPath = normalizePdfPath(options.outputPath) || defaultOutput(loaded.path, loaded.title, lang);
    let html = "";
    try {
      html = buildHtml(loaded.data, lang, { include });
    } catch (err) {
      return { ok: false, code: "invalid-json", detail: String((err && err.message) || err) };
    }
    const result = await renderPdf(html, outputPath);
    if (result.ok) result.title = loaded.title;
    return result;
  } finally {
    busy = false;
  }
}

function parseArgs(argv) {
  const args = (argv || []).slice();
  const out = {
    ui: false,
    inputPath: "",
    outputPath: "",
    lang: "",
    include: {},
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || "");
    if (arg === "--ui") {
      out.ui = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--out" && args[i + 1]) {
      out.outputPath = args[++i];
    } else if (arg === "--lang" && args[i + 1]) {
      out.lang = normalizeLang(args[++i]);
    } else if (arg === "--input" && args[i + 1]) {
      out.inputPath = args[++i];
    } else if (arg === "--include" && args[i + 1]) {
      const names = String(args[++i])
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      INCLUDE_KEYS.forEach((key) => {
        out.include[key] = names.includes("all") || names.includes(key);
      });
    } else if (arg === "--no-toc") {
      out.include.toc = false;
    } else if (arg.startsWith("--no-")) {
      const key = arg.slice(5);
      if (INCLUDE_KEYS.includes(key)) out.include[key] = false;
    } else if (!arg.startsWith("-") && !out.inputPath) {
      out.inputPath = arg;
    }
  }
  return out;
}

function usage() {
  return [
    "Character Report PDF",
    "",
    "  node run.js                         Open the window",
    "  node run.js <export.json>           Generate with defaults",
    "  node run.js <export.json> --out <pdf> --lang zh-CN|zh-TW|en|ja",
    "  node run.js <export.json> --include fields,relations,trajectory,radar,analysis",
    "  node run.js <export.json> --no-relations --no-analysis --no-toc",
    "  node run.js <export.json> --ui      Open the window with values filled in",
  ].join("\n");
}

async function runDirect(options) {
  const loaded = await readExport(options.inputPath);
  if (!loaded.ok) {
    console.error(`[character-report] ${loaded.code}${loaded.detail ? ": " + loaded.detail : ""}`);
    app.exit(1);
    return;
  }
  const include = normalizeInclude(options.include);
  if (!hasVisibleContent(include)) {
    console.error("[character-report] no-content");
    app.exit(1);
    return;
  }
  const lang = normalizeLang(options.lang) || "zh-CN";
  const outputPath = normalizePdfPath(options.outputPath) || defaultOutput(loaded.path, loaded.title, lang);
  let html = "";
  try {
    html = buildHtml(loaded.data, lang, { include });
  } catch (err) {
    console.error(`[character-report] invalid-json: ${String((err && err.message) || err)}`);
    app.exit(1);
    return;
  }
  const result = await renderPdf(html, outputPath);
  if (result.ok) {
    console.log(result.path);
    app.exit(0);
  } else {
    console.error(`[character-report] ${result.code}${result.detail ? ": " + result.detail : ""}`);
    app.exit(1);
  }
}

function createWindow(boot) {
  mainWindow = new BrowserWindow({
    width: 650,
    height: 740,
    minWidth: 560,
    minHeight: 620,
    show: false,
    backgroundColor: "#fff7fa",
    autoHideMenuBar: true,
    title: "Character Report PDF",
    icon: path.join(__dirname, "..", "..", "logo_adaa.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.__boot = boot;
  mainWindow.on("close", (event) => {
    if (busy) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "ui.html"));
}

async function bootstrapPayload(options) {
  const payload = {
    systemLang: systemLang(),
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    lang: normalizeLang(options.lang),
    include: options.include,
  };
  if (payload.inputPath) {
    const info = await suggestOutput(payload.inputPath, payload.lang || payload.systemLang);
    if (info.ok) {
      payload.title = info.title;
      payload.defaultOutput = info.defaultOutput;
      payload.inputPath = info.path;
    }
  }
  return payload;
}

function registerIpc() {
  ipcMain.handle("character-report:bootstrap", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return (win && win.__boot) || { systemLang: systemLang() };
  });

  ipcMain.handle("character-report:pick-json", async (event, currentPath, lang) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const chosenLang = normalizeLang(lang) || systemLang();
    const result = await dialog.showOpenDialog(win, {
      title: (DIALOG_TITLES[chosenLang] || DIALOG_TITLES["zh-CN"]).json,
      defaultPath: currentPath && fs.existsSync(currentPath) ? currentPath : app.getPath("documents"),
      properties: ["openFile"],
      filters: [{ name: "Fiction GUI JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const info = await suggestOutput(result.filePaths[0], chosenLang);
    return info.ok ? info : { path: result.filePaths[0], error: info.code, detail: info.detail };
  });

  ipcMain.handle("character-report:pick-output", async (event, currentPath, lang) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const chosenLang = normalizeLang(lang) || systemLang();
    const suffix = OUTPUT_SUFFIX[chosenLang] || OUTPUT_SUFFIX["zh-CN"];
    const target = normalizePdfPath(currentPath) || path.join(app.getPath("documents"), `${suffix}.pdf`);
    const result = await dialog.showSaveDialog(win, {
      title: (DIALOG_TITLES[chosenLang] || DIALOG_TITLES["zh-CN"]).pdf,
      defaultPath: target,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return { path: normalizePdfPath(result.filePath) };
  });

  ipcMain.handle("character-report:suggest-output", async (event, inputPath, lang) => {
    return suggestOutput(inputPath, normalizeLang(lang) || "zh-CN");
  });

  ipcMain.handle("character-report:generate", async (event, payload) => {
    const result = await generateReport(payload);
    if (result.ok) {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.setTitle(`${path.basename(result.path)} - Character Report PDF`);
    }
    return result;
  });

  ipcMain.handle("character-report:reveal", async (event, target) => {
    const value = String(target || "").trim();
    if (!value || !fs.existsSync(value)) return { ok: false, code: "not-found" };
    shell.showItemInFolder(value);
    return { ok: true };
  });

  ipcMain.handle("character-report:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !busy) win.close();
    return { ok: !busy };
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = "light";
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    app.exit(0);
    return;
  }
  if (!options.ui && options.inputPath) {
    await runDirect(options);
    return;
  }
  registerIpc();
  const boot = await bootstrapPayload(options);
  createWindow(boot);
  app.on("activate", () => {
    if (!mainWindow) createWindow(boot);
  });
}).catch((err) => {
  console.error(`[character-report] ${String((err && err.stack) || err)}`);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
