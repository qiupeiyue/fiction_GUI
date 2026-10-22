const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("characterReport", {
  bootstrap: () => ipcRenderer.invoke("character-report:bootstrap"),
  pickJson: (currentPath, lang) => ipcRenderer.invoke("character-report:pick-json", currentPath, lang),
  pickOutput: (currentPath, lang) => ipcRenderer.invoke("character-report:pick-output", currentPath, lang),
  suggestOutput: (inputPath, lang) => ipcRenderer.invoke("character-report:suggest-output", inputPath, lang),
  generate: (payload) => ipcRenderer.invoke("character-report:generate", payload),
  reveal: (target) => ipcRenderer.invoke("character-report:reveal", target),
  close: () => ipcRenderer.invoke("character-report:close"),
});
