  /* ================= 导入 / 导出 ================= */
  async function exportJSON() {
    if (typeof novelBeforeLeave === "function") await novelBeforeLeave();
    const p = getActiveProject();
    const title = (p ? p.title : "") || uiTextFor("我的小说");
    const payload = { app: "fiction-gui", version: 2, title, data: state };
    const text = JSON.stringify(payload, null, 2);
    const name = exportFileNameOf(title);
  // 打包后默认直接写到「设置 → 路径」里填的导出目录
    if (nativeApp()) {
      try {
        const n = nativeApp();
        const spec = novelFolderSpec();
        if (!spec.root) throw new Error("没有设置导出目录");
        const abs = joinNativePath(spec.abs || joinNativePath(spec.root, spec.name), name);
        await n.writeFileAbs(abs, text);
        novelPinFolder(spec);
        const proj = getActiveProject();
        if (proj) {
          proj.lastExportAbs = abs;
          proj.lastExportName = name;
          saveState({ noUndo: true });
        }
        showToast(`已导出到：${abs}`);
        return;
      } catch (e) {
        console.warn("写入导出目录失败，改用系统保存对话框：", e);
      }
    }
    // 「设置 → 路径」里指定了导出位置：用系统的保存对话框，并把它打开到那个文件夹
    if (pathPrefs.exportDir && fsaSaveSupported()) {
      const opts = {
        suggestedName: name,
        types: [{ description: "小说工坊 JSON", accept: { "application/json": [".json"] } }],
      };
      const startIn = await pathStartIn("export");
      if (startIn) opts.startIn = startIn;
      try {
        const fh = await window.showSaveFilePicker(opts);
        const w = await fh.createWritable();
        await w.write(text);
        await w.close();
        const proj = getActiveProject();
        if (proj && fh.name) proj.lastExportName = fh.name;
        showToast(`已导出：${name}`);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // 用户在保存对话框里点了取消
        console.warn("保存对话框不可用，改用普通下载：", e);
      }
    }
    // 没设默认位置（或对话框用不了）：保持原来的「直接下载」方式
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(reader.result);
        let title = null;
        let data = null;
        if (obj && Array.isArray(obj.characters) && Array.isArray(obj.events)) {
          // 旧版：直接是一个项目数据
          data = obj;
          title = (file.name || "").replace(/\.json$/i, "") || "导入的小说";
        } else if (obj && obj.data && Array.isArray(obj.data.characters) && Array.isArray(obj.data.events)) {
          // 新版：{ title, data }
          data = obj.data;
          title = obj.title || "导入的小说";
        } else {
          throw new Error("格式不正确");
        }
        // 导入的这本小说自带锁：先要密码，不对就别导进去
        const lock = privacyNorm(data && data.privacy);
        if (privacyActive(lock)) {
          const ok = await privacyAskPassword({
            info: lock,
            mode: "verify",
            title: uiSentence("privacyNovelLocked", title || uiTextFor("我的小说")),
          });
          if (!ok) {
            showToast(uiTextFor("已取消导入"));
            return;
          }
        }
        if (typeof novelBeforeLeave === "function") await novelBeforeLeave();
        if (typeof novelResetForProject === "function") novelResetForProject();
        const p = {
          id: uid(),
          title: uniqueProjectTitle(title),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data,
          log: [],
        };
        p.lastExportName = file && file.name ? file.name : "";
        if (file && file.__nativePath) {
          p.lastExportAbs = String(file.__nativePath);
          try {
            const n = nativeApp();
            const dir = novelDirname(p.lastExportAbs);
            const base = novelStripJson(novelBasename(p.lastExportAbs));
            const dirBase = novelBasename(dir);
            const norm = (s) => String(s || "").replace(/[\\/]+$/, "").toLowerCase();
            const configured = String(pathPrefs.exportDir || "").trim() ||
              String((nativeDefaultPaths() || {}).output || "");
            const underExport = !!(configured && norm(dir).startsWith(norm(configured) + "\\"));
            let kind = "";
            const oldFolder = await n.listDir(joinNativePath(dir, base));
            if (oldFolder && oldFolder.ok) kind = "old";
            else {
              const here = await n.listDir(dir);
              const hasMd = !!(here && here.ok && (here.entries || []).some((x) => /\.md$/i.test(String((x && x.name) || ""))));
              if (hasMd || dirBase === base || underExport) kind = "new";
            }
            if (kind === "old") p.novelDir = { root: dir, name: base };
            else if (kind === "new") p.novelDir = { root: novelDirname(dir), name: dirBase };
          } catch (e) {
            /* 找不到正文文件夹就等第一次保存时再建 */
          }
        }
        projects.push(p);
        activeProjectId = p.id;
        state = p.data;
        lineFilterClear();
        selectedCategoryId = null;
        selectedTaskId = null;
        ensureData();
        saveState();
        renderAll();
      } catch (err) {
        uiAlert("打开失败：不是有效的项目文件。");
      }
    };
    reader.readAsText(file);
  }

  // 「设置 → 路径」里指定了导入位置时，用系统打开对话框，并把它打开到那个文件夹。
  // 返回 File＝选好了；null＝改用原来的 <input type=file>；undefined＝用户取消。
  async function pickImportFile() {
    if (nativeApp()) {
      const n = nativeApp();
      let dir = String(pathPrefs.importDir || "").trim();
      if (!dir) {
        const d = nativeDefaultPaths();
        dir = (d && d.documents) || "";
      }
      try {
        const r = await n.pickFile(dir || undefined);
        if (!r) return undefined;
        const f = new File([r.content], r.name, { type: "application/json" });
        if (r.path) f.__nativePath = String(r.path);
        return f;
      } catch (e) {
        console.warn("原生打开文件对话框不可用，改用普通选择文件：", e);
        return null;
      }
    }
    if (!pathPrefs.importDir || !fsaOpenSupported()) return null;
    const opts = {
      multiple: false,
      types: [{ description: "小说工坊 JSON", accept: { "application/json": [".json"] } }],
    };
    const startIn = await pathStartIn("import");
    if (startIn) opts.startIn = startIn;
    try {
      const arr = await window.showOpenFilePicker(opts);
      if (!arr || !arr.length) return undefined;
      return await arr[0].getFile();
    } catch (e) {
      if (e && e.name === "AbortError") return undefined;
      console.warn("打开对话框不可用，改用普通选择文件：", e);
      return null;
    }
  }

