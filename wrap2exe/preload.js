// 只把「导出 / 历史 / 正文 .md」相关的文件读写、目录列举与打开能力交给渲染进程，
// 其它 Node / 文件系统能力一律不暴露。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appNative", {
  isElectron: true,
  getDirs: () => ipcRenderer.invoke("native:dirs"),
  // 把「当前导出 / 历史版本目录」写给主进程存下来（卸载提示要用）
  savePathHint: (outPath, historyPath) => ipcRenderer.invoke("native:savePathHint", outPath, historyPath),
  // 自动更新开关（存在主进程那边，启动时用它决定要不要检查更新）
  getAutoUpdate: () => ipcRenderer.sendSync("native:getAutoUpdate"),
  setAutoUpdate: (on) => ipcRenderer.invoke("native:setAutoUpdate", !!on),
  // 二维图「兼容渲染」：主进程那份决定重启后是否 disable-gpu
  getMatrixCompat: () => ipcRenderer.sendSync("native:getMatrixCompat"),
  setMatrixCompat: (on) => ipcRenderer.invoke("native:setMatrixCompat", !!on),
  checkUpdateNow: () => ipcRenderer.invoke("native:checkUpdateNow"),
  getUpdateState: () => ipcRenderer.sendSync("native:getUpdateState"),
  onUpdateStatus: (cb) => {
    const h = (e, payload) => {
      try {
        cb(payload || {});
      } catch (err) {
        /* ignore */
      }
    };
    ipcRenderer.on("native:updateStatus", h);
    return () => ipcRenderer.removeListener("native:updateStatus", h);
  },
  // 界面语言同步给主进程（主进程读不到 localStorage），更新提示按它来
  setUiLanguage: (lang) => ipcRenderer.invoke("native:setUiLanguage", String(lang || "")),
  // 新版下载完：主进程只发事件，界面按当前语言问一句
  onUpdateReady: (cb) => {
    const h = (e, payload) => {
      try {
        cb(payload || {});
      } catch (err) {
        /* ignore */
      }
    };
    ipcRenderer.on("native:updateReady", h);
    return () => ipcRenderer.removeListener("native:updateReady", h);
  },
  installUpdate: () => ipcRenderer.invoke("native:installUpdate"),
  // 安装向导里选的导出 / 历史版本路径与语言（第一次运行时当默认值）
  getInstallPrefs: () => ipcRenderer.sendSync("native:installPrefs"),
  getDefaultPaths: () => ipcRenderer.sendSync("native:defaultPaths"),
  writeFile: (dir, name, content) => ipcRenderer.invoke("native:write", dir, name, content),
  deleteFile: (dir, name) => ipcRenderer.invoke("native:delete", dir, name),
  writeFileAbs: (absPath, content) => ipcRenderer.invoke("native:writeFileAbs", absPath, content),
  writeBinaryFileAbs: (absPath, base64) => ipcRenderer.invoke("native:writeBinaryFileAbs", absPath, base64),
  deleteFileAbs: (absPath) => ipcRenderer.invoke("native:deleteFileAbs", absPath),
  // 正文 .md：读 / 列目录 / 原子写 / 在资源管理器里定位
  readTextFile: (absPath) => ipcRenderer.invoke("native:readTextFile", String(absPath || "")),
  listDir: (absPath) => ipcRenderer.invoke("native:listDir", String(absPath || "")),
  writeNovelFile: (absPath, content) => ipcRenderer.invoke("native:writeNovelFile", absPath, content),
  printNovelPdf: (opts) => ipcRenderer.invoke("native:printNovelPdf", opts),
  revealPath: (absPath) => ipcRenderer.invoke("native:revealPath", String(absPath || "")),
  openFolder: (absPath) => ipcRenderer.invoke("native:openFolder", String(absPath || "")),
  pickFile: (defaultPath) => ipcRenderer.invoke("native:pickFile", defaultPath),
  pickFolder: (defaultPath) => ipcRenderer.invoke("native:pickFolder", defaultPath),
  // 用系统默认程序打开一个文件（文本分析里双击文档＝打开原文）
  openFilePath: (absPath) => ipcRenderer.invoke("native:openPath", String(absPath || "")),
  agentFetch: (opts) => ipcRenderer.invoke("native:agentRequest", opts),
});
