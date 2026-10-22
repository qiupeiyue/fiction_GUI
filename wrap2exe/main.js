const { app, BrowserWindow, shell, ipcMain, dialog, net } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { autoUpdater } = require("electron-updater");

/* 二维事件图「兼容渲染」诊断开关（用户 2026-10-20）：
   页面层面会立刻改用无合成层的画法；主进程再存一份，启动时要真的关掉 GPU。
   ⚠️ app.commandLine.appendSwitch 必须在 app ready 之前调用才生效。 */
function matrixCompatFlagFile() {
  return path.join(app.getPath("userData"), "matrix-compat.txt");
}
function matrixCompatEnabled() {
  try {
    return fs.readFileSync(matrixCompatFlagFile(), "utf8").trim() === "1";
  } catch (e) {
    return false;
  }
}
try {
  if (matrixCompatEnabled()) {
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
  }
} catch (e) {
  /* 读不到设置就当没开 */
}

// exe 所在目录：打包后是安装目录 / win-unpacked 目录；开发模式是 electron 的 dist。
function exeDir() {
  return path.dirname(process.execPath);
}

function safeName(name) {
  return String(name || "未命名").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
}

// 这个目录能不能真的写进去？安装在 C:\Program Files 这类位置时，
// mkdir 会直接 EPERM（甚至会弹「A JavaScript error occurred in the main process」这种致命框），
// 所以建完之后再实际写一个探针文件确认一次。
function dirWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-test");
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

const nativeDirCache = new Map();

// 导出 / 历史版本的默认目录：文档 \ fiction_GUI \ output|history
// 放「文档」下有两个好处：装到 C:\Program Files 这种只读位置也写得进去；
// 卸载 / 换版本 / 换安装位置都不会碰到用户自己的导出文件。
// 依次找第一个真正写得进去的位置：文档 → 用户数据目录 → 安装目录（老规矩，兜底）。
// 结果缓存：同一次运行里只探测一次，免得每次导出都去试写。
function nativeDir(kind) {
  const leaf = kind === "history" ? "history" : "output";
  if (nativeDirCache.has(leaf)) return nativeDirCache.get(leaf);
  const candidates = [];
  try {
    candidates.push(path.join(app.getPath("documents"), "fiction_GUI", leaf));
  } catch (e) {
    /* 取不到「文档」就算了 */
  }
  try {
    candidates.push(path.join(app.getPath("userData"), "fiction_GUI", leaf));
  } catch (e) {
    /* 同上 */
  }
  try {
    candidates.push(path.join(exeDir(), leaf));
  } catch (e) {
    /* 同上 */
  }
  let dir = candidates[candidates.length - 1] || exeDir();
  for (let i = 0; i < candidates.length; i++) {
    if (dirWritable(candidates[i])) {
      dir = candidates[i];
      break;
    }
  }
  nativeDirCache.set(leaf, dir);
  return dir;
}

ipcMain.handle("native:dirs", () => {
  return { output: nativeDir("output"), history: nativeDir("history") };
});

// 把「当前导出 / 历史版本目录」各记成用户数据目录里的一个小文件
// （卸载提示要显示用户实际在用的位置，而安装脚本读不到程序里的设置）。
// 一个路径一个文件、末尾不带换行，安装脚本 FileRead 出来就是干净的字符串。
ipcMain.handle("native:savePathHint", (e, outPath, historyPath) => {
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "path-export.txt"), String(outPath == null ? "" : outPath).trim(), "utf8");
    fs.writeFileSync(path.join(dir, "path-history.txt"), String(historyPath == null ? "" : historyPath).trim(), "utf8");
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle("native:write", (e, dir, name, content) => {
  const d = nativeDir(dir === "history" ? "history" : "output");
  const target = path.join(d, safeName(name));
  if (!target.startsWith(d + path.sep) && target !== d) throw new Error("非法路径");
  fs.writeFileSync(target, String(content == null ? "" : content), "utf8");
  return true;
});

ipcMain.handle("native:delete", (e, dir, name) => {
  const d = nativeDir(dir === "history" ? "history" : "output");
  const target = path.join(d, safeName(name));
  if (!target.startsWith(d + path.sep)) return false;
  try { fs.unlinkSync(target); return true; } catch (err) { return false; }
});

// 安装向导里让用户选好的「导出路径 / 历史版本路径 / 语言」（install-prefs.txt，三行）。
// 程序第一次运行时读它当默认值；读不到就用自己的默认。
// 安装脚本按 UTF-16LE 写（路径里带中文 / 日文也不会乱码），这里连编码一起判断，
// 顺带兼容手改过的 UTF-8 / 带 BOM 的文件。
function readPrefsText(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xef && buf[1] === 0xbb) return buf.slice(3).toString("utf8");
  if (buf.length >= 2 && buf[1] === 0x00) return buf.toString("utf16le");
  return buf.toString("utf8");
}

ipcMain.on("native:installPrefs", (event) => {
  let out = { exportDir: "", historyDir: "", language: "" };
  try {
    const f = path.join(app.getPath("userData"), "install-prefs.txt");
    const lines = readPrefsText(f)
      .split(/\r?\n/)
      .map((s) => s.replace(/^\uFEFF/, ""));
    out = {
      exportDir: String(lines[0] || "").trim(),
      historyDir: String(lines[1] || "").trim(),
      language: String(lines[2] || "").trim(),
    };
  } catch (e) {
    /* 没装过 / 文件不在，就用空值 */
  }
  event.returnValue = out;
});

// 默认路径（文档 / 安装目录下 output / history），preload 里同步取一次
ipcMain.on("native:defaultPaths", (event) => {
  // 同步 IPC 里抛异常没人接，会变成主进程致命弹窗：这里每一项都单独兜住，绝不往外抛。
  let documents = "";
  let output = "";
  let history = "";
  try {
    documents = app.getPath("documents");
  } catch (e) {
    /* ignore */
  }
  try {
    output = nativeDir("output");
  } catch (e) {
    /* ignore */
  }
  try {
    history = nativeDir("history");
  } catch (e) {
    /* ignore */
  }
  // 顺带把「老版本默认用的安装目录下那条路径」也告诉渲染进程：
  // 旧设置里如果存着这条老默认值，渲染进程会把它换成上面 resolved 的新默认目录。
  let exeOutput = "";
  let exeHistory = "";
  try {
    exeOutput = path.join(exeDir(), "output");
  } catch (e) {
    /* ignore */
  }
  try {
    exeHistory = path.join(exeDir(), "history");
  } catch (e) {
    /* ignore */
  }
  event.returnValue = { documents, output, history, exeOutput, exeHistory };
});

// 写入任意绝对路径（自动建父目录），导出 / 历史版本用
ipcMain.handle("native:writeFileAbs", (e, absPath, content) => {
  const p = String(absPath || "").trim();
  if (!p) throw new Error("路径为空");
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err) {
    // 例如装到 Program Files、却把导出目录设在那里：给一句能看懂的话，别抛原始报错
    throw new Error("这个位置没有写入权限：" + path.dirname(p) + "（可在「设置 → 路径设置」里换一个目录）");
  }
  fs.writeFileSync(p, String(content == null ? "" : content), "utf8");
  return true;
});

// 二进制写入（生成 Word 用）：渲染进程给 base64，主进程负责原子落盘。
ipcMain.handle("native:writeBinaryFileAbs", (e, absPath, base64) => {
  const p = String(absPath || "").trim();
  if (!p) throw new Error("路径为空");
  const buf = Buffer.from(String(base64 == null ? "" : base64), "base64");
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err) {
    throw new Error("no-permission:" + path.dirname(p));
  }
  const tmp = p + ".tmp-" + process.pid + "-" + Date.now();
  try {
    fs.writeFileSync(tmp, buf);
    try {
      fs.renameSync(tmp, p);
    } catch (err) {
      fs.writeFileSync(p, buf);
      try {
        fs.unlinkSync(tmp);
      } catch (e2) {
        /* ignore */
      }
    }
    return true;
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch (e2) {
      /* ignore */
    }
    throw new Error("write-failed:" + String((err && err.message) || err));
  }
});

// 生成 PDF：用隐藏的 BrowserWindow 渲染 HTML，再交给 Chromium 的 printToPDF。
// generateDocumentOutline 会把 h1/h2/h3 写成 PDF 书签；目录页里的 #锚点链接也会保留。
ipcMain.handle("native:printNovelPdf", async (e, opts) => {
  const o = opts || {};
  const absPath = String(o.absPath || "").trim();
  const html = String(o.html || "");
  if (!absPath) return { ok: false, error: "路径为空" };
  let tmpDir = "";
  let win = null;
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fiction-gui-pdf-"));
    const tmpHtml = path.join(tmpDir, "novel.html");
    fs.writeFileSync(tmpHtml, html, "utf8");
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
    await new Promise((resolve) => setTimeout(resolve, 150));
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#6b7280;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.8, bottom: 0.8, left: 0.7, right: 0.7 },
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    fs.writeFileSync(absPath, pdf);
    return { ok: true, path: absPath };
  } catch (err) {
    const msg = String((err && err.message) || err || "PDF");
    if (/EACCES|EPERM|permission/i.test(msg)) {
      return { ok: false, error: "no-permission:" + path.dirname(absPath) };
    }
    return { ok: false, error: "write-failed:" + msg };
  } finally {
    try {
      if (win) win.destroy();
    } catch (err) {
      /* ignore */
    }
    try {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      /* ignore */
    }
  }
});

// 正文 .md：读 / 列目录 / 原子写 / 在资源管理器里定位。
// 正文是用户手写的内容，写入时先写临时文件再改名，避免中途崩溃把原文件截断。
ipcMain.handle("native:readTextFile", (e, absPath) => {
  const p = String(absPath || "").trim();
  if (!p) return { ok: false, error: "empty", content: "" };
  try {
    return { ok: true, content: fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "") };
  } catch (err) {
    return {
      ok: false,
      error: err && err.code === "ENOENT" ? "missing" : String((err && err.message) || err),
      content: "",
    };
  }
});

ipcMain.handle("native:listDir", (e, absPath) => {
  const p = String(absPath || "").trim();
  if (!p) return { ok: false, error: "empty", entries: [] };
  try {
    const entries = fs
      .readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const fp = path.join(p, d.name);
        let size = 0;
        let mtime = 0;
        try {
          const st = fs.statSync(fp);
          size = st.size;
          mtime = st.mtimeMs;
        } catch (err) {
          /* 文件刚好被删：忽略这一条 */
        }
        return { name: d.name, size, mtime };
      });
    return { ok: true, entries };
  } catch (err) {
    return {
      ok: false,
      error: err && err.code === "ENOENT" ? "missing" : String((err && err.message) || err),
      entries: [],
    };
  }
});

ipcMain.handle("native:writeNovelFile", (e, absPath, content) => {
  const p = String(absPath || "").trim();
  if (!p) throw new Error("路径为空");
  const text = String(content == null ? "" : content);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err) {
    throw new Error("no-permission:" + path.dirname(p));
  }
  const tmp = p + ".tmp-" + process.pid + "-" + Date.now();
  try {
    fs.writeFileSync(tmp, text, "utf8");
    try {
      fs.renameSync(tmp, p);
    } catch (err) {
      // 少数文件系统上 rename 覆盖会失败：退回直接写，至少保证内容落盘
      fs.writeFileSync(p, text, "utf8");
      try {
        fs.unlinkSync(tmp);
      } catch (e) {
        /* ignore */
      }
    }
    return true;
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch (e) {
      /* ignore */
    }
    throw new Error("write-failed:" + String((err && err.message) || err));
  }
});

ipcMain.handle("native:revealPath", async (e, absPath) => {
  const p = String(absPath || "").trim();
  if (!p) return { ok: false, error: "empty" };
  try {
    if (!fs.existsSync(p)) return { ok: false, error: "missing" };
    if (fs.statSync(p).isDirectory()) {
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true };
    }
    shell.showItemInFolder(p);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// 打开（必要时先建）一个文件夹：正文文件夹可能还没建出来
ipcMain.handle("native:openFolder", async (e, absPath) => {
  const p = String(absPath || "").trim();
  if (!p) return { ok: false, error: "empty" };
  try {
    fs.mkdirSync(p, { recursive: true });
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// 删除任意绝对路径
ipcMain.handle("native:deleteFileAbs", (e, absPath) => {
  try { fs.unlinkSync(String(absPath || "").trim()); return true; } catch (err) { return false; }
});

// 用系统默认程序打开一个文件（文本分析里双击文档＝打开原文）。
// 只允许打开真实存在的文件，避免渲染进程拿它去执行别的命令。
ipcMain.handle("native:openPath", async (e, p) => {
  const abs = path.resolve(String(p || "").trim());
  if (!abs) return { ok: false, error: "empty" };
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: false, error: "missing" };
    const err = await shell.openPath(abs);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (ex) {
    return { ok: false, error: String((ex && ex.message) || ex) };
  }
});

// 原生打开文件对话框（导入用），返回 { path, name, content } 或 null
ipcMain.handle("native:pickFile", async (e, defaultPath) => {
  const result = await dialog.showOpenDialog({
    defaultPath: String(defaultPath || ""),
    properties: ["openFile"],
    filters: [{ name: "小说工坊 JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
  const p = result.filePaths[0];
  return { path: p, name: path.basename(p), content: fs.readFileSync(p, "utf8") };
});

// 选择保存文件夹（生成小说用），返回绝对路径或 null
ipcMain.handle("native:pickFolder", async (e, defaultPath) => {
  const result = await dialog.showOpenDialog({
    defaultPath: String(defaultPath || ""),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// 渲染进程里的 fetch 从 file:// 发请求会被 CORS 卡住；这里走 Electron 主进程的 net.fetch，
// 不做 CORS 校验，用于 Agent 的连接测试、拉取模型列表和正式分析请求。
ipcMain.handle("native:agentRequest", async (e, opts) => {
  const o = opts || {};
  const url = String(o.url || "").trim();
  if (!url) throw new Error("请求地址为空");
  const timeoutMs = Math.max(1000, Math.min(300000, Number(o.timeoutMs) || 120000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await net.fetch(url, {
      method: String(o.method || "GET").toUpperCase(),
      headers: o.headers && typeof o.headers === "object" ? o.headers : {},
      body: o.body == null ? undefined : String(o.body),
      signal: controller.signal,
    });
    const body = await resp.text();
    const headers = {};
    resp.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: resp.status, statusText: resp.statusText || "", headers, body };
  } catch (err) {
    const msg = String((err && err.message) || err || "请求失败");
    throw new Error(controller.signal.aborted ? "连接超时" : msg);
  } finally {
    clearTimeout(timer);
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Adaa的小说工坊",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "logo_adaa.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // 用 file:// 加载本地文件，origin 仍是 file://，
  // 这样 IndexedDB / 文件系统接口的行为和现在浏览器里完全一致。
  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) setupAutoUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 「设置 → 自动更新」的开关：主进程要存一份（渲染进程的 localStorage 它读不到），
// 启动时按这个决定要不要检查更新。
function autoUpdateFlagFile() {
  return path.join(app.getPath("userData"), "auto-update.txt");
}
function autoUpdateEnabled() {
  try {
    return fs.readFileSync(autoUpdateFlagFile(), "utf8").trim() !== "0";
  } catch (e) {
    return true; // 默认开启
  }
}
function writeAutoUpdateEnabled(on) {
  try {
    const f = autoUpdateFlagFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, on ? "1" : "0", "utf8");
  } catch (e) {
    /* 存不上不影响本次运行 */
  }
}

let updateState = {
  status: "idle",
  version: "",
  current: "",
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  error: "",
};

function updatePayload() {
  return Object.assign({}, updateState);
}

function sendUpdateStatus() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("native:updateStatus", updatePayload());
  } catch (e) {
    /* ignore */
  }
}

function setUpdateState(patch) {
  updateState = Object.assign({}, updateState, patch || {});
  sendUpdateStatus();
}

ipcMain.on("native:getAutoUpdate", (event) => {
  let on = true;
  try {
    on = autoUpdateEnabled();
  } catch (e) {
    /* ignore */
  }
  event.returnValue = on;
});

ipcMain.on("native:getUpdateState", (event) => {
  event.returnValue = updatePayload();
});

ipcMain.handle("native:setAutoUpdate", (e, on) => {
  const enabled = !!on;
  writeAutoUpdateEnabled(enabled);
  try {
    autoUpdater.autoDownload = enabled;
    if (enabled && app.isPackaged) {
      setUpdateState({ status: "checking", error: "", percent: 0 });
      autoUpdater.checkForUpdates().catch((err) => {
        setUpdateState({ status: "error", error: String((err && err.message) || err) });
      });
    } else if (!enabled) {
      setUpdateState({ status: "disabled", percent: 0 });
    }
  } catch (err) {
    setUpdateState({ status: "error", error: String((err && err.message) || err) });
  }
  return true;
});

// 二维图「兼容渲染」：渲染进程的 localStorage 只够页面层面用，重启后要关 GPU 得靠主进程这份。
ipcMain.on("native:getMatrixCompat", (event) => {
  let on = false;
  try {
    on = matrixCompatEnabled();
  } catch (e) {
    /* ignore */
  }
  event.returnValue = on;
});
ipcMain.handle("native:setMatrixCompat", (e, on) => {
  try {
    const f = matrixCompatFlagFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, on ? "1" : "0", "utf8");
    return true;
  } catch (e) {
    return false;
  }
});

// 「立即检查」：返回一句能直接显示给用户的话
ipcMain.handle("native:checkUpdateNow", async () => {
  // 只回「结果码 + 版本号」，具体那句话由渲染进程按界面语言拼（主进程读不到界面语言设置）
  if (!app.isPackaged) return { ok: false, code: "dev", text: "开发模式下不检查更新" };
  if (updateState.status === "downloading") {
    return { ok: true, code: "downloading", ...updatePayload() };
  }
  if (updateState.status === "ready") {
    return { ok: true, code: "ready", ...updatePayload() };
  }
  try {
    setUpdateState({ status: "checking", error: "", percent: 0 });
    const r = await autoUpdater.checkForUpdates();
    const latest = r && r.updateInfo ? String(r.updateInfo.version || "") : "";
    const cur = app.getVersion();
    if (!latest || latest === cur) {
      setUpdateState({ status: "latest", current: cur, version: cur, percent: 0 });
      return { ok: true, code: "latest", cur, latest, text: "已经是最新版本（v" + cur + "）" };
    }
    if (updateState.status !== "downloading") {
      setUpdateState({
        status: autoUpdater.autoDownload ? "downloading" : "available",
        current: cur,
        version: latest,
        percent: 0,
      });
    }
    return { ok: true, code: "found", cur, latest, text: "发现新版本 v" + latest };
  } catch (err) {
    setUpdateState({ status: "error", error: String((err && err.message) || err || "") });
    return { ok: false, code: "error", text: "检查失败：" + String((err && err.message) || err || "") };
  }
});

/* 界面语言：渲染进程改语言时会同步过来（主进程读不到 localStorage），
   这样「没开着窗口」时兜底的原生弹窗也能用对语言。 */
function uiLangFile() {
  return path.join(app.getPath("userData"), "ui-language.txt");
}
function readUiLang() {
  try {
    const v = fs.readFileSync(uiLangFile(), "utf8").trim();
    return v || "zh-CN";
  } catch (e) {
    return "zh-CN";
  }
}
function writeUiLang(v) {
  try {
    const f = uiLangFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, String(v || "zh-CN"), "utf8");
  } catch (e) {
    /* ignore */
  }
}
ipcMain.handle("native:setUiLanguage", (e, lang) => {
  writeUiLang(lang);
  return true;
});

// 主进程自己用的几条提示（只在「没有窗口」时兜底用；有窗口时交给界面按语言显示）
const UPD_TEXT = {
  "zh-CN": {
    readyTitle: "发现新版本",
    ready: (v) => `新版本 v${v} 已经下载好了。\n\n现在重启并安装吗？（选「以后」就等退出程序时自动安装）`,
    now: "现在重启安装",
    later: "以后",
    failTitle: "自动更新失败",
  },
  "zh-TW": {
    readyTitle: "發現新版本",
    ready: (v) => `新版本 v${v} 已經下載好了。\n\n現在重新啟動並安裝嗎？（選「稍後」就等結束程式時自動安裝）`,
    now: "現在重新啟動安裝",
    later: "稍後",
    failTitle: "自動更新失敗",
  },
  en: {
    readyTitle: "Update available",
    ready: (v) => `Version v${v} has been downloaded.\n\nRestart and install now? (Choose “Later” to install when you quit.)`,
    now: "Restart and install",
    later: "Later",
    failTitle: "Update failed",
  },
  ja: {
    readyTitle: "新しいバージョンがあります",
    ready: (v) => `新しいバージョン v${v} のダウンロードが完了しました。\n\n今すぐ再起動してインストールしますか？（「後で」を選ぶと終了時に自動でインストールします）`,
    now: "再起動してインストール",
    later: "後で",
    failTitle: "更新に失敗しました",
  },
};
function updText() {
  return UPD_TEXT[readUiLang()] || UPD_TEXT["zh-CN"];
}

// 自动更新：只在打包后的 exe 里生效，开发模式（npm start）跳过。
function setupAutoUpdater() {
  try {
    autoUpdater.setFeedURL({ provider: "github", owner: "qiupeiyue", repo: "fiction_GUI" });
    const on = autoUpdateEnabled();
    autoUpdater.autoDownload = on; // 发现新版就自动下载（关了就不自动下）
    autoUpdater.autoInstallOnAppQuit = true; // 退出软件时自动装（弹窗选「以后」也照常）
    updateState.current = app.getVersion();
    if (!on) updateState.status = "disabled";
    autoUpdater.on("checking-for-update", () => {
      setUpdateState({ status: "checking", error: "", percent: 0 });
    });
    autoUpdater.on("update-available", (info) => {
      setUpdateState({
        status: autoUpdater.autoDownload ? "downloading" : "available",
        version: String((info && info.version) || ""),
        percent: 0,
      });
    });
    autoUpdater.on("update-not-available", (info) => {
      setUpdateState({
        status: "latest",
        current: app.getVersion(),
        version: String((info && info.version) || app.getVersion()),
        percent: 0,
      });
    });
    autoUpdater.on("download-progress", (p) => {
      const percent = Math.max(0, Math.min(100, Number((p && p.percent) || 0)));
      setUpdateState({
        status: "downloading",
        percent,
        transferred: Number((p && p.transferred) || 0),
        total: Number((p && p.total) || 0),
        bytesPerSecond: Number((p && p.bytesPerSecond) || 0),
      });
    });
    autoUpdater.on("error", (err) => {
      console.warn("自动更新检查失败：", err && err.message);
      setUpdateState({ status: "error", error: String((err && err.message) || err || "") });
    });
    // 下载完不弹 electron-updater 自带的英文通知，改成让界面按设置的语言问一句
    autoUpdater.on("update-downloaded", (info) => {
      const ver = String((info && info.version) || "");
      setUpdateState({ status: "ready", version: ver, percent: 100 });
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        try {
          win.webContents.send("native:updateReady", { version: ver });
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      const t = updText();
      dialog
        .showMessageBox({
          type: "info",
          title: t.readyTitle,
          message: t.ready(ver),
          buttons: [t.now, t.later],
          defaultId: 0,
          cancelId: 1,
        })
        .then((r) => {
          if (r && r.response === 0) autoUpdater.quitAndInstall();
        })
        .catch(() => {});
    });
    if (!on) {
      console.log("自动更新已在设置里关闭，跳过启动检查。");
      return;
    }
    setUpdateState({ status: "checking", current: app.getVersion(), error: "", percent: 0 });
    autoUpdater.checkForUpdates().catch((e) => console.warn("自动更新：", e && e.message));
  } catch (e) {
    console.warn("自动更新初始化失败：", e && e.message);
    setUpdateState({ status: "error", error: String((e && e.message) || e) });
  }
}

// 界面上点了「现在重启安装」
ipcMain.handle("native:installUpdate", () => {
  try {
    autoUpdater.quitAndInstall();
    return true;
  } catch (e) {
    return false;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
