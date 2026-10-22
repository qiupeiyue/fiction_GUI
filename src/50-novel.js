  /* ================= 文本编辑（事件正文 .md） =================
     一个事件＝一个 .md 文件。文件名在第一次保存时生成一次，之后只认
     event.novelFile，**绝不拿会变化的 # 行号当身份**。 */
  const NOVEL_LEFT_KEY = "fiction_gui_novel_left_w_v1";
  const NOVEL_WRAP_KEY = "fiction_gui_novel_wrap_v1";
  const NOVEL_PREVIEW_RATIO_KEY = "fiction_gui_novel_preview_ratio_v1";
  const NOVEL_DEFAULT_W = 300;
  const NOVEL_AUTOSAVE_MS = 1600;
  const NOVEL_SOURCE_MAX = 12000;
  let novelLeftW = NOVEL_DEFAULT_W;
  let novelPreviewRatio = 0.45;
  let novelBound = false;
  let novelClickTimer = 0;
  let novelPreviewTimer = 0;
  let novelAutoTimer = 0;
  let novelIndexAt = 0;
  let novelIndexSeq = 0;
  let novelSelectedId = "";
  let novelSourceCache = { key: "", text: "", label: "" };
  let novelFileIndex = new Map();
  let novelDirHandle = null;
  let novelDirHandleKey = "";
  let novelState = {
    eventId: "",
    loadedText: "",
    dirty: false,
    saving: false,
    loading: false,
    open: false,
    token: 0,
    wrap: true,
    preview: true,
    missing: false,
    folder: null,
  };

  function novelIsCurrent() {
    return typeof currentTab !== "undefined" && currentTab === "novel";
  }

  function novelCurrentEventId() {
    return novelState.open ? novelState.eventId : novelSelectedId;
  }

  function novelProject() {
    try {
      return getActiveProject();
    } catch (e) {
      return null;
    }
  }

  function novelDirname(p) {
    const s = String(p || "").replace(/[\\/]+$/, "");
    const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
    return i >= 0 ? s.slice(0, i) : "";
  }

  function novelBasename(p) {
    const s = String(p || "").replace(/[\\/]+$/, "");
    const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function novelStripJson(name) {
    return String(name || "").replace(/\.json$/i, "");
  }

  function novelDefaultRoot() {
    const n = nativeApp();
    if (n && typeof pathPrefs !== "undefined" && pathPrefs) {
      const dir = String(pathPrefs.exportDir || "").trim();
      if (dir) return dir;
    }
    const d = nativeDefaultPaths();
    return (d && d.output) || "";
  }

  /* 小说的文件夹＝「导出目录 \ 当前小说名」；文本编辑的每事件 .md 再放进
     「小说文件夹 \ {小说名}_MyText」。JSON 和生成的小说留在小说文件夹这一层。
     第一次真正保存时把 root / name 钉在项目上（p.novelDir，不进导出 JSON），
     老项目已经钉过的文件夹继续沿用，避免已有正文看起来消失。
     MyText 后缀固定用英文，不跟界面语言变，否则切语言会换目录。 */
  function novelFolderSpec() {
    const p = novelProject();
    const pinned = p && p.novelDir && p.novelDir.name ? p.novelDir : null;
    if (pinned) {
      const root = String(pinned.root);
      const name = novelCleanFileName(pinned.name);
      if (name) {
        const abs = root ? joinNativePath(root, name) : "";
        const textName = novelCleanFileName(`${name}_MyText`);
        return { root, name, abs, textName, textAbs: abs ? joinNativePath(abs, textName) : "", pinned: true };
      }
    }
    const last = p && p.lastExportAbs ? String(p.lastExportAbs) : "";
    // 新结构：JSON 在「导出目录 \ 小说名 \ 小说名.json」里；老结构：JSON 直接躺在导出目录。
    const lastDir = last ? novelDirname(last) : "";
    const lastBase = last ? novelStripJson(novelBasename(last)) : "";
    const lastDirBase = lastDir ? novelBasename(lastDir) : "";
    const exportRoot = novelDefaultRoot();
    const norm = (s) => String(s || "").replace(/[\\/]+$/, "").toLowerCase();
    const inExportSubdir =
      !!(lastDir && exportRoot && norm(lastDir) !== norm(exportRoot) && norm(lastDir).startsWith(norm(exportRoot) + "\\"));
    const nested = !!(last && (inExportSubdir || (lastDirBase && lastDirBase === lastBase)));
    const root = nested ? novelDirname(lastDir) : lastDir || exportRoot;
    const title = (p && p.title) || uiTextFor("我的小说");
    const name = nested && lastDirBase ? safeFileName(lastDirBase, "novel") : safeFileName(title, "novel");
    const abs = root ? joinNativePath(root, name) : "";
    const textName = novelCleanFileName(`${name}_MyText`);
    return { root, name, abs, textName, textAbs: abs ? joinNativePath(abs, textName) : "", pinned: false };
  }

  function novelPinFolder(spec) {
    const p = novelProject();
    if (!p || !spec || !spec.name) return;
    if (nativeApp() && !spec.root) return;
    if (p.novelDir && p.novelDir.root === spec.root && p.novelDir.name === spec.name) return;
    p.novelDir = { root: spec.root, name: spec.name };
    saveState({ noUndo: true });
  }

  async function novelBrowserHandle(spec, create) {
    if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") return null;
    const p = novelProject();
    const key = "novel_dir_" + (p ? p.id : "none") + "_" + spec.name + "_" + spec.textName;
    if (novelDirHandle && novelDirHandleKey === key) return novelDirHandle;
    if (!create) {
      try {
        const saved = await idbGet(key);
        if (saved && typeof saved.getFileHandle === "function") {
          novelDirHandle = saved;
          novelDirHandleKey = key;
          return saved;
        }
      } catch (e) {
        /* 没有授权过 */
      }
      return null;
    }
    try {
      const root = await window.showDirectoryPicker({ mode: "readwrite" });
      const base = await root.getDirectoryHandle(spec.name, { create: true });
      const dir = await base.getDirectoryHandle(spec.textName, { create: true });
      novelDirHandle = dir;
      novelDirHandleKey = key;
      try {
        await idbSet(key, dir);
      } catch (e) {
        /* 存不下也不影响这次使用 */
      }
      return dir;
    } catch (e) {
      return null;
    }
  }

  async function novelReadFile(spec, name) {
    if (!spec || !spec.name || !name) return { ok: false, error: "empty", content: "" };
    const n = nativeApp();
    if (n && typeof n.readTextFile === "function") {
      if (!spec.textAbs) return { ok: false, error: "empty", content: "" };
      return await n.readTextFile(joinNativePath(spec.textAbs, name));
    }
    const dir = await novelBrowserHandle(spec, false);
    if (!dir) return { ok: false, error: "no-folder", content: "" };
    try {
      const fh = await dir.getFileHandle(name);
      const f = await fh.getFile();
      return { ok: true, content: String(await f.text()).replace(/^\uFEFF/, "") };
    } catch (e) {
      return {
        ok: false,
        error: e && e.name === "NotFoundError" ? "missing" : String((e && e.message) || e),
        content: "",
      };
    }
  }

  async function novelWriteFile(spec, name, text) {
    if (!spec || !spec.name) throw new Error(uiTextFor("还没有设置导出目录"));
    const n = nativeApp();
    if (n && typeof n.writeNovelFile === "function") {
      if (!spec.root) throw new Error(uiTextFor("还没有设置导出目录"));
      await n.writeNovelFile(joinNativePath(spec.textAbs, name), text);
      novelPinFolder(spec);
      return true;
    }
    const dir = await novelBrowserHandle(spec, true);
    if (!dir) throw new Error(uiTextFor("浏览器版需要先选择正文文件夹"));
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
    novelPinFolder(spec);
    return true;
  }

  async function novelListFiles(spec) {
    if (!spec || !spec.name) return { ok: false, error: "empty", entries: [] };
    const n = nativeApp();
    if (n && typeof n.listDir === "function") {
      if (!spec.textAbs) return { ok: false, error: "empty", entries: [] };
      return await n.listDir(spec.textAbs);
    }
    const dir = await novelBrowserHandle(spec, false);
    if (!dir) return { ok: false, error: "no-folder", entries: [] };
    const entries = [];
    try {
      for await (const [name, handle] of dir.entries()) {
        if (!handle || handle.kind !== "file") continue;
        try {
          const f = await handle.getFile();
          entries.push({ name, size: f.size, mtime: f.lastModified });
        } catch (e) {
          /* 文件刚好被删 */
        }
      }
      return { ok: true, entries };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), entries: [] };
    }
  }

  async function novelReveal(absPath) {
    const n = nativeApp();
    if (n && typeof n.revealPath === "function") return await n.revealPath(absPath);
    return { ok: false, error: "unsupported" };
  }

  /* ---- 正文垃圾箱：删掉 / 合并掉的 .md 先在内存里留一份，撤销能原样放回来 ---- */
  let novelFileTrash = new Map(); // "projectId|文件名" -> { content, at }
  const NOVEL_TRASH_MAX = 1000;

  function novelTrashKey(name) {
    const p = novelProject();
    return (p ? p.id : "") + "|" + String(name || "");
  }

  function novelTrashPrune() {
    if (novelFileTrash.size <= NOVEL_TRASH_MAX) return;
    const rows = Array.from(novelFileTrash.entries()).sort((a, b) => a[1].at - b[1].at);
    rows.slice(0, rows.length - NOVEL_TRASH_MAX).forEach(([key]) => novelFileTrash.delete(key));
  }

  function novelTrashPut(name, content) {
    if (!name) return;
    novelFileTrash.set(novelTrashKey(name), {
      content: String(content == null ? "" : content),
      at: Date.now(),
    });
    novelTrashPrune();
  }

  function novelTrashTake(name) {
    const key = novelTrashKey(name);
    const value = novelFileTrash.get(key);
    if (value) novelFileTrash.delete(key);
    return value || null;
  }

  async function novelDeleteFile(spec, name) {
    if (!spec || !spec.name || !name) return false;
    const n = nativeApp();
    if (n && typeof n.deleteFileAbs === "function") {
      if (!spec.textAbs) return false;
      try {
        return await n.deleteFileAbs(joinNativePath(spec.textAbs, name));
      } catch (e) {
        return false;
      }
    }
    const dir = await novelBrowserHandle(spec, false);
    if (!dir) return false;
    try {
      await dir.removeEntry(name);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function novelReloadIndexOnly(spec) {
    const r = await novelListFiles(spec);
    if (!r || !r.ok) return;
    novelFileIndex = new Map();
    (r.entries || []).forEach((x) => {
      if (x && x.name) novelFileIndex.set(x.name, x);
    });
    novelIndexAt = Date.now();
  }

  async function novelReloadEditorIfClean() {
    if (!novelState.open || novelState.dirty || novelState.loading) return;
    const e = getEvent(novelState.eventId);
    if (!e) return;
    const name = e.novelFile ? novelCleanFileName(e.novelFile) : "";
    const ta = $("#novel-text");
    if (!name) {
      novelState.loadedText = "";
      novelState.missing = false;
      if (ta) ta.value = "";
      updateNovelEditorChrome();
      return;
    }
    const spec = novelFolderSpec();
    try {
      const r = await novelReadFile(spec, name);
      if (novelState.dirty) return; // 读的时候用户又打字了：保留用户当前内容
      if (r && r.ok) {
        const text = String(r.content || "").replace(/\r\n?/g, "\n");
        novelState.loadedText = text;
        novelState.missing = false;
        if (ta) ta.value = text;
        updateNovelEditorChrome();
      } else {
        novelState.missing = true;
        updateNovelEditorChrome();
      }
    } catch (e2) {
      /* ignore */
    }
  }

  /* 让磁盘上的 .md 跟当前工作区对齐：
     ① 工作区还链接、但文件不在的 → 先从内存垃圾箱放回来（撤销 / 恢复用）；
     ② 不再被任何事件链接的 .md → 读进内存垃圾箱后删除。
     串行执行，并用 stateDataRev 防止「同步途中又撤销 / 恢复」把新链接的文件删掉。 */
  let novelSyncChain = Promise.resolve();
  let novelMigrateKey = "";
  let novelMigratePromise = null;

  /* 旧版把 .md 直接放在小说文件夹里；新版放进 {小说名}_MyText。
     首次同步 / 打开正文时把仍被事件链接的旧文件搬过去，只搬不删新目录已有文件。 */
  async function novelMigrateTextFolder(spec) {
    const n = nativeApp();
    if (!n || !spec || !spec.pinned || !spec.abs || !spec.textAbs) return 0;
    const p = novelProject();
    const rev = stateDataRev;
    const key = `${p ? p.id : ""}|${spec.textAbs}|${rev}`;
    if (novelMigrateKey === key && novelMigratePromise) return novelMigratePromise;
    novelMigrateKey = key;
    novelMigratePromise = (async () => {
      let moved = 0;
      const names = Array.from(
        new Set(
          (state.events || [])
            .map((e) => novelCleanFileName(e && e.novelFile))
            .filter(Boolean)
        )
      );
      for (const name of names) {
        const src = joinNativePath(spec.abs, name);
        const dst = joinNativePath(spec.textAbs, name);
        try {
          const already = await n.readTextFile(dst);
          if (already && already.ok) continue;
          if (stateDataRev !== rev) {
            // state 已变化：交给下一次同步，不搬旧快照
            return moved;
          }
          const old = await n.readTextFile(src);
          if (!old || !old.ok) continue;
          await n.writeNovelFile(dst, String(old.content || ""));
          try {
            await n.deleteFileAbs(src);
          } catch (e) {
            /* 新文件已经写好，旧文件删不掉也不影响使用 */
          }
          moved++;
        } catch (e) {
          /* 单个文件失败就留着旧的，下一次再试 */
        }
      }
      return moved;
    })().catch(() => 0);
    return novelMigratePromise;
  }

  function novelSyncFilesToState(reason) {
    novelSyncChain = novelSyncChain
      .then(() => novelSyncFilesToStateNow(reason))
      .catch((e) => console.warn("正文同步失败：", e));
    return novelSyncChain;
  }

  async function novelSyncFilesToStateNow(reason) {
    const spec = novelFolderSpec();
    if (!spec || !spec.pinned || !spec.name) return;
    await novelMigrateTextFolder(spec);
    const rev = stateDataRev;
    const linked = new Set();
    (state.events || []).forEach((e) => {
      if (!e || !e.novelFile) return;
      const name = novelCleanFileName(e.novelFile);
      if (name) linked.add(name);
    });
    const keptOutputs = new Set();
    const proj = novelProject();
    ((proj && proj.novelOutputs) || []).forEach((o) => {
      const name = novelCleanFileName(o && o.name);
      if (name) keptOutputs.add(name);
    });

    for (const name of Array.from(linked)) {
      if (stateDataRev !== rev) return;
      if (novelFileIndex.has(name)) continue;
      const saved = novelTrashTake(name);
      if (!saved) continue;
      try {
        await novelWriteFile(spec, name, saved.content);
        novelFileIndex.set(name, { name, size: saved.content.length, mtime: Date.now() });
      } catch (e) {
        novelTrashPut(name, saved.content);
      }
    }
    if (stateDataRev !== rev) return;

    const list = await novelListFiles(spec);
    if (stateDataRev !== rev) return;
    if (list && list.ok) {
      for (const entry of list.entries || []) {
        if (stateDataRev !== rev) return;
        const name = entry && entry.name ? String(entry.name) : "";
        if (!/\.md$/i.test(name) || linked.has(name) || keptOutputs.has(name)) continue;
        const r = await novelReadFile(spec, name);
        if (stateDataRev !== rev) return;
        if (!r || !r.ok) continue;
        novelTrashPut(name, r.content || "");
        const ok = await novelDeleteFile(spec, name);
        if (ok) novelFileIndex.delete(name);
      }
    }
    if (stateDataRev !== rev) return;

    await novelReloadIndexOnly(spec);
    if (stateDataRev !== rev) return;
    novelCloseIfEventGone();
    renderNovelOutline();
    renderNovelProgress();
    if (novelState.open) {
      await novelReloadEditorIfClean();
      updateNovelEditorChrome();
    }
  }

  function novelShortId(id) {
    const s = String(id || "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36).padStart(6, "0").slice(-6);
  }

  function novelCssEsc(s) {
    const v = String(s == null ? "" : s);
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&");
  }

  function novelCleanFileName(name) {
    const s = String(name || "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .trim();
    return s === "." || s === ".." ? "" : s;
  }

  function novelEventHasFile(e) {
    return !!(e && e.novelFile && novelCleanFileName(e.novelFile));
  }

  /* 删除事件前：只有链接了正文文件才弹确认。Enter＝确定，Esc＝取消由 uiConfirm 自己处理。 */
  async function confirmEventDeletionWithNovel(events) {
    const list = (events || []).filter(Boolean);
    const linked = list.filter(novelEventHasFile);
    if (!linked.length) return true;
    const msg =
      list.length === 1
        ? uiSentence("novelDeleteEventWithFile", list[0].title || uiTextFor("未命名事件"))
        : uiSentence("novelDeleteEventsWithFile", linked.length, list.length);
    return await uiConfirm(msg, uiTextFor("删除事件"));
  }

  function novelFileBase(e) {
    const title = safeFileName(e && e.title ? e.title : "event", "event")
      .replace(/\.md$/i, "")
      .slice(0, 56);
    return `${title}_${novelShortId(e && e.id)}`;
  }

  function novelFileOwner(name) {
    const list = (state && state.events) || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].novelFile === name) return list[i].id;
    }
    return "";
  }

  function novelEnsureFile(e, spec) {
    if (!e) return "";
    if (e.novelFile) {
      const clean = novelCleanFileName(e.novelFile);
      if (clean) {
        e.novelFile = clean;
        return clean;
      }
      delete e.novelFile;
    }
    const base = novelFileBase(e);
    let name = base + ".md";
    let n = 2;
    while (novelFileIndex.has(name) || novelFileOwner(name)) {
      name = `${base}_${n++}.md`;
      if (n > 999) break;
    }
    e.novelFile = name;
    novelPinFolder(spec);
    saveState({ noUndo: true });
    return name;
  }

  function novelNormalizePart(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
  }

  function novelMergedFileName(keep) {
    const base = safeFileName(keep && keep.title ? keep.title : "event", "event")
      .replace(/\.md$/i, "")
      .slice(0, 56);
    const token = novelShortId(uid());
    let name = `${base}_${token}.md`;
    let n = 2;
    while (novelFileIndex.has(name) || novelFileOwner(name)) {
      name = `${base}_${token}_${n++}.md`;
      if (n > 999) break;
    }
    return name;
  }

  /* 合并事件：先按事件轴顺序把正文拼成一个新 .md（新文件名 / 新 id），
     再做数据合并并把 keep 的 novelFile 指到新文件；旧文件由 novelSyncFilesToState 删掉。 */
  async function mergeEventsIntoWithNovel(keepId, dropIds) {
    const keep = getEvent(keepId);
    if (!keep) return false;
    const ids = [keepId].concat((dropIds || []).filter((id) => id && id !== keepId));
    const idSet = new Set(ids);
    const ordered = orderedByStory().filter((e) => idSet.has(e.id));
    const spec = novelFolderSpec();
    const parts = [];
    for (const e of ordered) {
      let text = "";
      if (novelState.open && novelState.eventId === e.id && !novelState.loading) {
        const ta = $("#novel-text");
        text = ta ? String(ta.value || "") : "";
      } else if (e.novelFile) {
        const name = novelCleanFileName(e.novelFile);
        if (name) {
          const r = await novelReadFile(spec, name);
          if (r && r.ok) text = String(r.content || "");
          else if (r && (r.error === "missing" || r.error === "no-folder")) text = "";
          else {
            throw new Error(
              `${uiTextFor("合并正文失败")}：${String((r && r.error) || uiTextFor("读取失败"))}`
            );
          }
        }
      }
      text = novelNormalizePart(text);
      if (text.trim()) parts.push(text);
    }
    const mergedText = parts.join("\n\n");
    let newName = "";
    if (mergedText) {
      newName = novelMergedFileName(keep);
      await novelWriteFile(spec, newName, mergedText);
      novelFileIndex.set(newName, { name: newName, size: mergedText.length, mtime: Date.now() });
    }
    mergeEventsInto(keepId, dropIds);
    if (newName) keep.novelFile = newName;
    else delete keep.novelFile;
    if (novelState.open && novelState.eventId === keepId) {
      novelState.token++;
      novelState.loading = false;
      novelState.loadedText = mergedText;
      novelState.dirty = false;
      novelState.missing = false;
      const ta = $("#novel-text");
      if (ta) ta.value = mergedText;
    }
    saveState({ noUndo: true });
    await novelSyncFilesToState("merge");
    if (novelState.open && novelState.eventId === keepId) updateNovelEditorChrome();
    return true;
  }

  async function novelRefreshIndex(force) {
    const spec = novelFolderSpec();
    await novelMigrateTextFolder(spec);
    if (
      !force &&
      novelState.folder &&
      novelState.folder.textAbs === spec.textAbs &&
      Date.now() - novelIndexAt < 1500
    ) {
      renderNovelOutline();
      renderNovelProgress();
      return;
    }
    const seq = ++novelIndexSeq;
    novelState.folder = spec;
    const r = await novelListFiles(spec);
    if (seq !== novelIndexSeq) return;
    novelFileIndex = new Map();
    if (r && r.ok) {
      (r.entries || []).forEach((x) => {
        if (x && x.name) novelFileIndex.set(x.name, x);
      });
    }
    novelIndexAt = Date.now();
    renderNovelOutline();
    renderNovelProgress();
    if (novelState.open) updateNovelEditorChrome();
    if ((state.events || []).some((e) => e && e.novelFile)) novelSyncFilesToState("index");
  }

  function novelWritten(e) {
    if (!e) return false;
    if (novelState.open && novelState.eventId === e.id) {
      const ta = $("#novel-text");
      return !!(ta && String(ta.value || "").trim());
    }
    const f = e.novelFile ? novelFileIndex.get(e.novelFile) : null;
    return !!(f && f.size > 0);
  }

  function novelWordCount(text) {
    return Array.from(String(text || "").replace(/\s+/g, "")).length;
  }

  function novelSaveErrorText(err) {
    const s = String((err && err.message) || err || "");
    const noPerm = s.indexOf("no-permission:");
    if (noPerm >= 0) {
      return uiSentence("novelNoPermission", s.slice(noPerm + "no-permission:".length));
    }
    const writeFail = s.indexOf("write-failed:");
    if (writeFail >= 0) {
      return uiSentence("novelWriteFailed", s.slice(writeFail + "write-failed:".length));
    }
    return s;
  }

  function novelRangeOf(segs, field, id) {
    const mine = (segs || []).filter((s) => s[field] === id);
    if (!mine.length) return "";
    const a = Math.min.apply(null, mine.map((s) => s.startRow)) + 1;
    const b = Math.max.apply(null, mine.map((s) => s.endRow)) + 1;
    return `(#${a}:${b})`;
  }

  function novelItems() {
    const events = orderedByStory();
    const items = [];
    let prevCh = null;
    let prevSec = null;
    let chCollapsed = false;
    let secCollapsed = false;
    events.forEach((e) => {
      const chId = e.chapterId || "";
      if (chId !== prevCh) {
        const c = getChapter(chId);
        chCollapsed = c ? !!c.collapsed : false;
        items.push({ kind: "chapter", id: chId, v: e.storyIndex });
        prevCh = chId;
        prevSec = null;
      }
      if (chCollapsed) return;
      const secId = chId ? e.sectionId || "" : "";
      if (secId !== prevSec) {
        const sr = getSection(secId);
        secCollapsed = sr ? !!sr.section.collapsed : false;
        if (sr) items.push({ kind: "section", id: secId, chapterId: chId, v: e.storyIndex });
        prevSec = secId;
      }
      if (secCollapsed) return;
      items.push({ kind: "event", e, v: e.storyIndex });
    });
    // 还没有事件的章 / 节：按锚点插在事件列里，位置与二维事件图一致
    const emptyChapters = [];
    (state.chapters || []).forEach((c) => {
      if (state.events.some((e) => (e.chapterId || "") === c.id)) return;
      emptyChapters.push({ anchor: chapterAnchorStory(c.id), item: { kind: "chapter", id: c.id, empty: true } });
    });
    emptyChapters.forEach((x) => {
      let at = items.length;
      for (let i = 0; i < items.length; i++) {
        const v = items[i].v;
        if (typeof v === "number" && v >= x.anchor) {
          at = i;
          break;
        }
      }
      items.splice(at, 0, x.item);
    });
    (state.chapters || []).forEach((c) => {
      if (c.collapsed) return;
      const sections = c.sections || [];
      if (!sections.length) return;
      let pos = -1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "chapter" && items[i].id === c.id) {
          pos = i + 1;
          break;
        }
      }
      if (pos < 0) return;
      const chVals = state.events.filter((e) => (e.chapterId || "") === c.id).map((e) => e.storyIndex || 0);
      const firstStory = chVals.length ? Math.min.apply(null, chVals) : null;
      sections.forEach((s) => {
        const isEmpty = !state.events.some((e) => e.sectionId === s.id);
        if (isEmpty) {
          const anchor = sectionAnchorStoryFor(c, s);
          if (firstStory !== null && anchor > firstStory) {
            let at = items.length;
            for (let i = pos; i < items.length; i++) {
              const v = items[i].v;
              if (typeof v === "number" && v >= anchor) {
                at = i;
                break;
              }
            }
            items.splice(at, 0, { kind: "section", id: s.id, chapterId: c.id, empty: true });
          } else {
            items.splice(pos, 0, { kind: "section", id: s.id, chapterId: c.id, empty: true });
            pos++;
          }
          return;
        }
        for (let i = pos; i < items.length; i++) {
          if (items[i].kind === "section" && items[i].id === s.id) {
            pos = i + 1;
            break;
          }
        }
      });
    });
    return items;
  }

  function renderNovelOutline() {
    const box = $("#novel-outline");
    if (!box) return;
    const scroll = $("#novel-outline-scroll");
    const keepTop = scroll ? scroll.scrollTop : 0;
    const items = novelItems();
    const ranges = axisBandRanges();
    const rows = axisRows();
    const selectedId = novelState.open ? novelState.eventId : novelSelectedId;
    const rowMap = new Map();
    rows.forEach((row, i) => {
      (row.items || []).forEach((e) => rowMap.set(e.id, i + 1));
    });
    if (!items.length) {
      box.innerHTML = `<p class="novel-empty-inline">${esc(
        uiTextFor("还没有事件。先在事件轴创建事件。")
      )}</p>`;
      if (scroll) scroll.scrollTop = 0;
      return;
    }
    let html = "";
    items.forEach((it) => {
      if (it.kind === "chapter") {
        const c = getChapter(it.id);
        const collapsed = c ? !!c.collapsed : false;
        const range = novelRangeOf(ranges.chapterSegs, "chapterId", it.id);
        html += `<div class="novel-band chapter" data-chapter-id="${esc(
          it.id
        )}" data-empty="${it.empty ? "1" : ""}" title="${esc(
          uiTextFor("单击折叠 / 展开这一章")
        )}"><span class="band-caret">${collapsed ? "▶" : "▼"}</span><span class="band-title">${esc(
          c ? c.title : uiTextFor("未分章")
        )}</span>${range ? `<span class="band-range">${esc(range)}</span>` : ""}</div>`;
      } else if (it.kind === "section") {
        const sr = getSection(it.id);
        if (!sr) return;
        const collapsed = !!sr.section.collapsed;
        const range = novelRangeOf(ranges.sectionSegs, "sectionId", it.id);
        html += `<div class="novel-band section" data-chapter-id="${esc(
          it.chapterId || sr.chapter.id || ""
        )}" data-section-id="${esc(it.id)}" data-empty="${it.empty ? "1" : ""}" title="${esc(
          uiTextFor("单击折叠 / 展开这一节")
        )}"><span class="band-caret">${collapsed ? "▶" : "▼"}</span><span class="band-title">${esc(
          sr.section.title
        )}</span>${range ? `<span class="band-range">${esc(range)}</span>` : ""}</div>`;
      } else {
        const e = it.e;
        const ids = linesOf(e) || [];
        const firstLine = ids.length ? getLine(ids[0]) : null;
        const lc = firstLine ? firstLine.color : "#888";
        const codes = ids
          .map((id) => {
            const l = getLine(id);
            return l ? l.code || "?" : "?";
          })
          .join("+");
        const written = novelWritten(e);
        const no = rowMap.get(e.id) || 0;
        html += `<div class="novel-row ${written ? "written" : ""} ${
          selectedId === e.id ? "sel" : ""
        }" data-event-id="${esc(e.id)}" style="border-left-color:${esc(lc)}" title="${esc(
          uiTextFor("单击编辑事件 · 双击写正文 · 右键更多操作")
        )}"><span class="n-line" style="color:${esc(lc)}">${esc(codes)}</span><span class="n-title">${esc(
          e.title || uiTextFor("未命名事件")
        )}</span><span class="n-status" title="${esc(
          written ? uiTextFor("已写") : uiTextFor("未写")
        )}">${written ? "✓" : "·"}</span><span class="n-no">#${esc(no)}</span></div>`;
      }
    });
    box.innerHTML = html;
    if (scroll) scroll.scrollTop = keepTop;
    bindNovelOutline();
  }

  function novelSelectRow(id) {
    novelSelectedId = id || "";
    $$("#novel-outline .novel-row").forEach((r) => r.classList.toggle("sel", r.dataset.eventId === id));
  }

  function novelUpdateRowStatus(id) {
    if (!id) return;
    const row = document.querySelector(`#novel-outline .novel-row[data-event-id="${novelCssEsc(id)}"]`);
    if (!row) return;
    const e = getEvent(id);
    const written = novelWritten(e);
    row.classList.toggle("written", written);
    const st = row.querySelector(".n-status");
    if (st) {
      st.textContent = written ? "✓" : "·";
      st.title = written ? uiTextFor("已写") : uiTextFor("未写");
    }
  }

  function novelToggleBand(chapterId, sectionId) {
    if (sectionId) {
      const r = getSection(sectionId);
      if (!r) return;
      r.section.collapsed = !r.section.collapsed;
    } else {
      const c = getChapter(chapterId);
      if (!c) return;
      c.collapsed = !c.collapsed;
    }
    saveState();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderNovelOutline();
  }

  function novelScrollToChapter(chapterId, sectionId) {
    const c = chapterId ? getChapter(chapterId) : null;
    if (c && c.collapsed) {
      c.collapsed = false;
      saveState();
      renderChapterRail();
    }
    if (sectionId) {
      const sr = getSection(sectionId);
      if (sr && sr.section.collapsed) {
        sr.section.collapsed = false;
        saveState();
        renderChapterRail();
      }
    }
    renderNovelOutline();
    const sel = sectionId
      ? `.novel-band.section[data-section-id="${novelCssEsc(sectionId)}"]`
      : `.novel-band.chapter[data-chapter-id="${novelCssEsc(chapterId || "")}"]`;
    const el = document.querySelector("#novel-outline " + sel);
    if (!el) return false;
    const scroll = $("#novel-outline-scroll");
    if (scroll) {
      const r = el.getBoundingClientRect();
      const sr = scroll.getBoundingClientRect();
      scroll.scrollTop += Math.round(r.top - sr.top - 28);
    }
    el.classList.add("flash-band");
    setTimeout(() => el.classList.remove("flash-band"), 1200);
    return true;
  }

  function bindNovelOutline() {
    const box = $("#novel-outline");
    if (!box) return;
    box.querySelectorAll(".novel-band.chapter").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
        novelToggleBand(el.dataset.chapterId || "", "");
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, el.dataset.chapterId || "", "");
        markContextTarget(el);
      });
    });
    box.querySelectorAll(".novel-band.section").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
        novelToggleBand(el.dataset.chapterId || "", el.dataset.sectionId || "");
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showBandMenu(ev.clientX, ev.clientY, el.dataset.chapterId || "", el.dataset.sectionId || "");
        markContextTarget(el);
      });
    });
    box.querySelectorAll(".novel-row").forEach((row) => {
      row.addEventListener("click", (ev) => {
        if (ev.button !== 0) return;
        const id = row.dataset.eventId;
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
        novelSelectRow(id);
        if (ev.detail >= 2) {
          novelOpenFromRow(id);
          return;
        }
        novelClickTimer = setTimeout(() => {
          novelClickTimer = 0;
          if (getEvent(id)) openEventModal(id);
        }, 320);
      });
      row.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
        novelOpenFromRow(row.dataset.eventId);
      });
      row.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
        exitSelectModesForContextMenu();
        showEventTitleMenu(ev.clientX, ev.clientY, row.dataset.eventId);
      });
    });
  }

  function novelOpenFromRow(id) {
    const modal = $("#event-modal");
    if (modal && !modal.hidden) {
      const cur = $("#event-id") ? String($("#event-id").value || "") : "";
      if (cur === id) closeModal("event-modal");
    }
    openNovelEditor(id);
  }

  function novelAnalysisTasks() {
    return state && state.analysis && Array.isArray(state.analysis.tasks) ? state.analysis.tasks : [];
  }

  function novelSourceKey(e) {
    if (!e) return "";
    return [
      e.id,
      e.sourceFileId || "",
      e.source || "",
      e.sourceSegId || "",
      (Array.isArray(e.sourceSegIds) ? e.sourceSegIds : []).join(","),
      e.chapterId || "",
      e.sectionId || "",
      stateDataRev,
      novelAnalysisTasks()
        .map((t) => (t && t.id) || "")
        .join(","),
    ].join("|");
  }

  /* 事件 → 文本分析原文。优先用写回时记下的 sourceSegIds；
     老数据只有 source / sourceFileId，就按「节 → 章 → 出处」在任务的分段里找。 */
  function novelFindEventSourceText(e) {
    if (!e) return { text: "", label: "" };
    const hasMarker = !!(e.sourceFileId || e.sourceSegId || (Array.isArray(e.sourceSegIds) && e.sourceSegIds.length));
    if (!hasMarker) return { text: "", label: "" };
    const tasks = novelAnalysisTasks();
    const segIds = [];
    const addId = (id) => {
      const s = String(id || "").trim();
      if (s && segIds.indexOf(s) < 0) segIds.push(s);
    };
    (Array.isArray(e.sourceSegIds) ? e.sourceSegIds : []).forEach(addId);
    if (e.sourceSegId) addId(e.sourceSegId);
    const fileId = String(e.sourceFileId || "");
    const source = String(e.source || "").trim();
    const found = [];
    const seen = new Set();
    const addFound = (task, seg) => {
      if (!task || !seg) return;
      const key = String(task.id || "") + "|" + String(seg.id || "");
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ task, seg });
    };
    tasks.forEach((task) => {
      (task.segments || []).forEach((seg) => {
        if (segIds.indexOf(seg.id) >= 0) addFound(task, seg);
      });
    });
    if (!found.length) {
      const chapter = getChapter(e.chapterId);
      const section = getSection(e.sectionId);
      const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[·・|｜/–—-]+/g, "");
      const passes = [];
      if (section && section.section.title) passes.push([section.section.title]);
      if (chapter && chapter.title) passes.push([chapter.title]);
      if (source) {
        const parts = [source];
        source.split(/[·・|｜/–—-]+/).forEach((x) => {
          const t = x.trim();
          if (t) parts.push(t);
        });
        passes.push(parts);
      }
      for (const labels of passes) {
        const targets = labels.map(norm).filter(Boolean);
        if (!targets.length) continue;
        const hits = [];
        tasks.forEach((task) => {
          (task.segments || []).forEach((seg) => {
            if (fileId && seg.fileId && seg.fileId !== fileId) return;
            const nl = norm(seg.label);
            if (nl && targets.some((t) => t === nl || t.includes(nl) || nl.includes(t))) hits.push({ task, seg });
          });
        });
        if (hits.length) {
          hits.forEach((x) => addFound(x.task, x.seg));
          break;
        }
      }
    }
    found.sort((a, b) => (Number(a.seg.start) || 0) - (Number(b.seg.start) || 0));
    const parts = [];
    found.forEach(({ task, seg }) => {
      const text = typeof segmentText === "function" ? segmentText(task, seg) : "";
      const t = String(text || "").trim();
      if (t && parts.indexOf(t) < 0) parts.push(t);
    });
    if (!parts.length && fileId && !segIds.length && !e.sourceSegId) {
      const ownerTask = tasks.find((t) => (t.files || []).some((f) => f && f.id === fileId));
      const hasSegments = !!(ownerTask && (ownerTask.segments || []).some((s) => s && s.fileId === fileId));
      if (hasSegments) return { text: "", label: source };
      for (const task of tasks) {
        const file = (task.files || []).find((f) => f && f.id === fileId);
        if (!file || !file.text) continue;
        const t = String(file.text).trim();
        if (t) {
          parts.push(t);
          break;
        }
      }
    }
    const label = source || (found[0] && found[0].seg && found[0].seg.label) || "";
    return { text: parts.join("\n\n"), label };
  }

  function novelGetEventSource(e) {
    if (!e) return { key: "", text: "", label: "" };
    const key = novelSourceKey(e);
    if (novelSourceCache.key === key) return novelSourceCache;
    const found = novelFindEventSourceText(e);
    novelSourceCache = { key, text: found.text, label: found.label };
    return novelSourceCache;
  }

  function updateNovelSourceButton(e) {
    const btn = $("#novel-source-btn");
    if (!btn) return;
    const found = e ? novelGetEventSource(e) : null;
    const on = !novelState.loading && !!(found && found.text);
    btn.disabled = !on;
    btn.title = uiTextFor(on ? "从「文本分析」填入这个事件的原文" : "没有找到这个事件对应的原文");
  }

  async function novelFillSourceText() {
    if (novelState.loading) return;
    const e = getEvent(novelState.eventId);
    if (!e) return;
    const found = novelGetEventSource(e);
    if (!found.text) return;
    const ta = $("#novel-text");
    if (!ta) return;
    if (String(ta.value || "").trim()) {
      const ok = await uiConfirm(uiTextFor("当前正文不是空的，填入原文会覆盖它。继续吗？"), uiTextFor("填入原文"));
      if (!ok) return;
    }
    let text = String(found.text).replace(/\r\n?/g, "\n");
    let truncated = false;
    if (text.length > NOVEL_SOURCE_MAX) {
      text = text.slice(0, NOVEL_SOURCE_MAX);
      truncated = true;
    }
    ta.focus();
    ta.select();
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (err) {
      /* 下面走 value 兜底 */
    }
    if (!inserted) ta.value = text;
    novelState.dirty = true;
    updateNovelEditorChrome();
    novelUpdateRowStatus(e.id);
    renderNovelProgress();
    scheduleNovelPreview();
    try {
      ta.setSelectionRange(text.length, text.length);
    } catch (err) {
      /* ignore */
    }
    showToast(truncated ? uiSentence("novelSourceTruncated", NOVEL_SOURCE_MAX) : uiTextFor("已填入原文"));
  }

  function novelShowFormatGuide() {
    uiAlert(uiSentence("novelFormatGuide"), uiTextFor("格式参考"));
  }

  function renderNovelEditorTags(e) {
    const box = $("#novel-editor-tags");
    if (!box) return;
    const colon = uiLanguage() === "en" ? ": " : "：";
    const paren = (text) => (uiLanguage() === "en" ? ` (${text})` : `（${text}）`);
    const isInsert = !!(e && String(e.narrative || "").trim() === "插叙");
    const narrLabel = uiTextFor(isInsert ? "插叙" : "顺叙");
    const tags = [
      `<span class="novel-tag narr ${isInsert ? "insert" : ""}" title="${esc(
        uiTextFor("叙述方式") + colon + narrLabel
      )}">${esc(narrLabel)}</span>`,
    ];
    const lineIds = e ? linesOf(e) : [];
    let lineShown = 0;
    lineIds.forEach((id) => {
      const line = getLine(id);
      if (!line) return;
      const code = String(line.code || line.name || "?").trim() || "?";
      const name = String(line.name || "").trim();
      const tip = uiTextFor("所属线路") + colon + (name || code) + (name && code && name !== code ? paren(code) : "");
      const color = /^#[0-9a-fA-F]{3,8}$/.test(String(line.color || "")) ? String(line.color) : "#888";
      tags.push(
        `<span class="novel-tag line" style="--tag-color:${esc(
          color
        )}" title="${esc(tip)}">${esc(code)}</span>`
      );
      lineShown++;
    });
    if (!lineShown) {
      tags.push(
        `<span class="novel-tag muted" title="${esc(uiTextFor("所属线路"))}">${esc(
          uiTextFor("未分线路")
        )}</span>`
      );
    }
    box.innerHTML = tags.join("");
  }

  function updateNovelEditorChrome() {
    const e = getEvent(novelState.eventId);
    if (!e) return;
    const title = $("#novel-editor-title");
    const sub = $("#novel-editor-sub");
    const ta = $("#novel-text");
    const word = $("#novel-word-count");
    const stateEl = $("#novel-save-state");
    const pathEl = $("#novel-file-path");
    if (title) title.textContent = e.title || uiTextFor("未命名事件");
    renderNovelEditorTags(e);
    updateNovelSourceButton(e);
    updateNovelPreviewButton();
    const c = getChapter(e.chapterId);
    const sr = getSection(e.sectionId);
    const bits = [c ? c.title : uiTextFor("未分章")];
    if (sr) bits.push(sr.section.title);
    const rowNo = rowNoOfEvent(e);
    if (rowNo) bits.push("#" + rowNo);
    if (sub) sub.textContent = bits.join(" · ");
    if (word) word.textContent = uiSentence("novelWordCount", novelWordCount(ta ? ta.value : ""));
    if (stateEl) {
      if (novelState.loading) stateEl.textContent = uiTextFor("读取中…");
      else if (novelState.saving) stateEl.textContent = uiTextFor("保存中…");
      else if (novelState.dirty) stateEl.textContent = uiTextFor("未保存");
      else if (novelState.missing && !String(ta ? ta.value : "").trim()) stateEl.textContent = uiTextFor("文件不存在");
      else stateEl.textContent = uiTextFor(e.novelFile ? "已保存" : "未保存");
    }
    if (pathEl) {
      if (e.novelFile) {
        const spec = novelFolderSpec();
        pathEl.textContent = `${spec.textName}\\${e.novelFile}`;
        pathEl.title = spec.textAbs ? joinNativePath(spec.textAbs, e.novelFile) : e.novelFile;
      } else {
        pathEl.textContent = uiTextFor("保存后生成 .md");
        pathEl.title = "";
      }
    }
    const saveBtn = $("#novel-save-btn");
    if (saveBtn) saveBtn.disabled = novelState.loading || novelState.saving;
  }

  function renderNovelProgress() {
    const el = $("#novel-progress");
    if (!el) return;
    const list = (state && state.events) || [];
    let written = 0;
    list.forEach((e) => {
      if (novelWritten(e)) written++;
    });
    el.textContent = uiSentence("novelProgress", written, list.length);
  }

  async function openNovelEditor(eventId) {
    const e = getEvent(eventId);
    if (!e) return;
    if (e.novelFile) {
      const clean = novelCleanFileName(e.novelFile);
      if (clean) e.novelFile = clean;
      else delete e.novelFile;
    }
    if (novelState.open && novelState.eventId && novelState.eventId !== eventId) {
      const ok = await novelSaveCurrent({ silent: true });
      if (!ok) return;
    }
    if (novelState.open && novelState.eventId === eventId && !novelState.loading) {
      const ta0 = $("#novel-text");
      if (ta0) ta0.focus();
      return;
    }
    const token = ++novelState.token;
    novelState.eventId = eventId;
    novelState.open = true;
    novelState.loading = true;
    novelState.dirty = false;
    novelState.missing = false;
    novelState.loadedText = "";
    novelSelectRow(eventId);
    const empty = $("#novel-empty");
    const panel = $("#novel-editor");
    if (empty) empty.hidden = true;
    if (panel) panel.hidden = false;
    const ta = $("#novel-text");
    if (ta) {
      ta.value = "";
      ta.readOnly = true;
    }
    if (novelState.preview) {
      const pv = $("#novel-preview");
      if (pv) pv.innerHTML = "";
    }
    updateNovelEditorChrome();
    const spec = novelFolderSpec();
    novelState.folder = spec;
    await novelMigrateTextFolder(spec);
    let text = "";
    if (e.novelFile) {
      try {
        const r = await novelReadFile(spec, e.novelFile);
        if (token !== novelState.token) return;
        if (r && r.ok) text = String(r.content || "").replace(/\r\n?/g, "\n");
        else if (r) novelState.missing = true;
      } catch (err) {
        if (token !== novelState.token) return;
        showToast(`${uiTextFor("读取失败")}：${String((err && err.message) || err)}`);
      }
    }
    if (token !== novelState.token) return;
    novelState.loadedText = text;
    novelState.dirty = false;
    novelState.loading = false;
    if (ta) {
      ta.value = text;
      ta.readOnly = false;
      ta.focus();
      try {
        ta.setSelectionRange(text.length, text.length);
      } catch (err) {
        /* ignore */
      }
    }
    updateNovelEditorChrome();
    renderNovelPreview();
    novelUpdateRowStatus(eventId);
    renderNovelProgress();
  }

  async function novelSaveCurrent(opts) {
    if (!novelState.open || !novelState.eventId) return true;
    if (novelState.loading || novelState.saving) return false;
    if (!novelState.dirty && !(opts && opts.force)) return true;
    const e = getEvent(novelState.eventId);
    if (!e) return true;
    const ta = $("#novel-text");
    const text = ta ? String(ta.value || "") : "";
    if (!text && !e.novelFile) {
      novelState.dirty = false;
      updateNovelEditorChrome();
      novelUpdateRowStatus(e.id);
      renderNovelProgress();
      return true;
    }
    const spec = novelFolderSpec();
    if (!spec.name || (nativeApp() && !spec.root)) {
      showToast(uiTextFor("还没有设置导出目录"));
      return false;
    }
    const name = novelEnsureFile(e, spec);
    novelState.saving = true;
    updateNovelEditorChrome();
    try {
      await novelWriteFile(spec, name, text);
      novelState.loadedText = text;
      novelState.dirty = false;
      novelState.missing = false;
      novelState.saving = false;
      novelState.folder = spec;
      novelFileIndex.set(name, { name, size: text.length, mtime: Date.now() });
      updateNovelEditorChrome();
      novelUpdateRowStatus(e.id);
      renderNovelProgress();
      if (!(opts && opts.silent)) showToast(uiTextFor("已保存"));
      return true;
    } catch (err) {
      novelState.saving = false;
      updateNovelEditorChrome();
      const raw = String((err && err.message) || err || "");
      const coded = raw.indexOf("no-permission:") >= 0 || raw.indexOf("write-failed:") >= 0;
      const detail = novelSaveErrorText(err);
      if (!(opts && opts.silent)) showToast(coded ? detail : `${uiTextFor("保存失败")}：${detail}`);
      return false;
    }
  }

  async function closeNovelEditor() {
    if (!novelState.open) return;
    const lastId = novelState.eventId;
    const ok = novelState.loading ? true : await novelSaveCurrent({ silent: true });
    if (!ok) return;
    novelState.token++;
    novelState.eventId = "";
    novelState.open = false;
    novelState.loading = false;
    novelState.dirty = false;
    novelState.missing = false;
    const panel = $("#novel-editor");
    const empty = $("#novel-empty");
    if (panel) panel.hidden = true;
    if (empty) empty.hidden = false;
    const sourceBtn = $("#novel-source-btn");
    if (sourceBtn) sourceBtn.disabled = true;
    novelSelectRow(lastId);
    renderNovelProgress();
  }

  function onNovelInput(ev) {
    if (!novelState.open) return;
    const ta = $("#novel-text");
    novelState.dirty = String(ta ? ta.value : "") !== String(novelState.loadedText || "");
    updateNovelEditorChrome();
    novelUpdateRowStatus(novelState.eventId);
    renderNovelProgress();
    scheduleNovelPreview();
    if (ev && ev.isComposing) return;
    clearTimeout(novelAutoTimer);
    novelAutoTimer = setTimeout(() => {
      novelAutoTimer = 0;
      if (novelState.open && novelState.dirty) novelSaveCurrent({ silent: true });
    }, NOVEL_AUTOSAVE_MS);
  }

  function novelTopLayerOpen() {
    if (document.querySelector(".context-menu:not([hidden])")) return true;
    if (document.querySelector(".ui-select-panel")) return true;
    if (document.querySelector(".modal-overlay:not([hidden])")) return true;
    return false;
  }

  function onNovelKeydown(ev) {
    if (!novelState.open || novelTopLayerOpen()) return;
    if (ev.isComposing || ev.keyCode === 229) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const key = String(ev.key || "");
    const target = ev.target;
    const inside = !!(target && target.closest && target.closest("#novel-editor"));
    if (mod && (key === "s" || key === "S")) {
      ev.preventDefault();
      ev.stopPropagation();
      novelSaveCurrent();
      return;
    }
    if (key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeNovelEditor();
      return;
    }
    if (inside && mod && /^(z|y|a|c|v|x|f)$/i.test(key)) {
      // 正文框里的撤销 / 复制 / 粘贴 / 全选 / 查找都交给浏览器原生
      ev.stopPropagation();
    }
  }

  function novelApplyWidth(w) {
    novelLeftW = Math.max(220, Math.min(520, Math.round(Number(w) || NOVEL_DEFAULT_W)));
    const left = $("#novel-left");
    if (left) left.style.setProperty("--novel-left-w", novelLeftW + "px");
    try {
      localStorage.setItem(NOVEL_LEFT_KEY, String(novelLeftW));
    } catch (e) {
      /* ignore */
    }
  }

  function novelApplyWrap(on) {
    const ta = $("#novel-text");
    novelState.wrap = !!on;
    if (ta) {
      ta.setAttribute("wrap", novelState.wrap ? "soft" : "off");
      ta.classList.toggle("wrap-off", !novelState.wrap);
    }
    const cb = $("#novel-wrap-toggle");
    if (cb) cb.checked = novelState.wrap;
    try {
      localStorage.setItem(NOVEL_WRAP_KEY, novelState.wrap ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function updateNovelPreviewButton() {
    const btn = $("#novel-preview-btn");
    if (!btn) return;
    btn.classList.toggle("btn-primary", !!novelState.preview);
    btn.setAttribute("aria-pressed", novelState.preview ? "true" : "false");
    btn.title = uiTextFor(novelState.preview ? "隐藏 Markdown 预览" : "显示 Markdown 预览");
  }

  function renderNovelPreview() {
    const preview = $("#novel-preview");
    if (!preview || !novelState.preview) return;
    const ta = $("#novel-text");
    const text = ta ? String(ta.value || "") : "";
    preview.innerHTML = text.trim()
      ? novelMarkdownToHtml(text, { headingOffset: 0 })
      : `<p class="novel-preview-empty">${esc(uiTextFor("预览"))}</p>`;
  }

  function scheduleNovelPreview() {
    clearTimeout(novelPreviewTimer);
    novelPreviewTimer = setTimeout(() => {
      novelPreviewTimer = 0;
      renderNovelPreview();
    }, 70);
  }

  function novelApplyPreviewWidth(ratio) {
    novelPreviewRatio = Math.max(0.2, Math.min(0.8, Number(ratio) || 0.45));
    const ta = $("#novel-text");
    const preview = $("#novel-preview");
    if (novelState.preview && ta && preview) {
      const left = Math.round((1 - novelPreviewRatio) * 1000) / 1000;
      const right = Math.round(novelPreviewRatio * 1000) / 1000;
      ta.style.flex = `${left} 1 0`;
      preview.style.flex = `${right} 1 0`;
    } else {
      if (ta) ta.style.flex = "";
      if (preview) preview.style.flex = "";
    }
    try {
      localStorage.setItem(NOVEL_PREVIEW_RATIO_KEY, String(novelPreviewRatio));
    } catch (e) {
      /* ignore */
    }
  }

  function novelApplyPreview(on) {
    novelState.preview = !!on;
    const body = $("#novel-editor .novel-editor-body");
    const preview = $("#novel-preview");
    const resizer = $("#novel-preview-resizer");
    if (body) body.classList.toggle("preview-on", novelState.preview);
    if (preview) preview.hidden = !novelState.preview;
    if (resizer) resizer.hidden = !novelState.preview;
    updateNovelPreviewButton();
    novelApplyPreviewWidth(novelPreviewRatio);
    if (novelState.preview) renderNovelPreview();
  }

  async function novelRevealFolder() {
    const spec = novelFolderSpec();
    await novelMigrateTextFolder(spec);
    const n = nativeApp();
    if (!n) {
      showToast(uiTextFor("浏览器版不能打开文件夹"));
      return;
    }
    if (!spec.textAbs) {
      showToast(uiTextFor("还没有设置导出目录"));
      return;
    }
    const r = typeof n.openFolder === "function" ? await n.openFolder(spec.textAbs) : await novelReveal(spec.textAbs);
    if (r && r.ok === false && r.error !== "unsupported") showToast(String(r.error || ""));
  }

  async function novelRevealCurrentFile() {
    if (!nativeApp()) {
      showToast(uiTextFor("浏览器版不能打开文件夹"));
      return;
    }
    const e = getEvent(novelState.eventId);
    if (!e || !e.novelFile) {
      showToast(uiTextFor("先保存一次"));
      return;
    }
    const spec = novelFolderSpec();
    await novelMigrateTextFolder(spec);
    if (!novelFileIndex.has(e.novelFile)) {
      showToast(uiTextFor("文件不存在"));
      await novelRevealFolder();
      return;
    }
    const r = await novelReveal(joinNativePath(spec.textAbs, e.novelFile));
    if (r && r.ok === false && r.error !== "unsupported") showToast(String(r.error || ""));
  }

  function initNovelView() {
    if (novelBound) return;
    novelBound = true;
    try {
      const w = parseFloat(localStorage.getItem(NOVEL_LEFT_KEY) || "");
      if (Number.isFinite(w)) novelLeftW = Math.max(220, Math.min(520, w));
      const wrap = localStorage.getItem(NOVEL_WRAP_KEY);
      novelState.wrap = wrap !== "0";
      const ratio = parseFloat(localStorage.getItem(NOVEL_PREVIEW_RATIO_KEY) || "");
      if (Number.isFinite(ratio)) novelPreviewRatio = Math.max(0.2, Math.min(0.8, ratio));
    } catch (e) {
      /* ignore */
    }
    novelApplyWidth(novelLeftW);
    novelApplyWrap(novelState.wrap);
    novelState.preview = true;
    novelApplyPreview(true);
    const saveBtn = $("#novel-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", () => novelSaveCurrent());
    const closeBtn = $("#novel-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", () => closeNovelEditor());
    const folderBtn = $("#novel-folder-btn");
    if (folderBtn) folderBtn.addEventListener("click", () => novelRevealFolder());
    const generateBtn = $("#novel-generate-btn");
    if (generateBtn) generateBtn.addEventListener("click", () => novelGenerateBook());
    const revealBtn = $("#novel-reveal-btn");
    if (revealBtn) revealBtn.addEventListener("click", () => novelRevealCurrentFile());
    const sourceBtn = $("#novel-source-btn");
    if (sourceBtn) sourceBtn.addEventListener("click", () => novelFillSourceText());
    const formatBtn = $("#novel-format-btn");
    if (formatBtn) formatBtn.addEventListener("click", () => novelShowFormatGuide());
    const wrapCb = $("#novel-wrap-toggle");
    if (wrapCb) wrapCb.addEventListener("change", () => novelApplyWrap(wrapCb.checked));
    const previewBtn = $("#novel-preview-btn");
    if (previewBtn) previewBtn.addEventListener("click", () => novelApplyPreview(!novelState.preview));
    const previewRz = $("#novel-preview-resizer");
    if (previewRz) {
      previewRz.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0 || !novelState.preview) return;
        ev.preventDefault();
        ev.stopPropagation();
        const body = $("#novel-editor .novel-editor-body");
        if (!body) return;
        const rect = body.getBoundingClientRect();
        const stacked = window.matchMedia("(max-width: 1200px)").matches;
        document.body.classList.add(stacked ? "novel-preview-resizing-row" : "novel-preview-resizing-col");
        const onMove = (e) => {
          const ratio = stacked ? (e.clientY - rect.top) / rect.height : (rect.right - e.clientX) / rect.width;
          novelApplyPreviewWidth(ratio);
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("novel-preview-resizing-row", "novel-preview-resizing-col");
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      previewRz.addEventListener("dblclick", () => novelApplyPreviewWidth(0.45));
    }
    const ta = $("#novel-text");
    if (ta) {
      ta.addEventListener("input", onNovelInput);
      ta.addEventListener("scroll", () => {
        const pv = $("#novel-preview");
        if (!pv || pv.hidden) return;
        const max = ta.scrollHeight - ta.clientHeight;
        const pvMax = pv.scrollHeight - pv.clientHeight;
        if (max > 0 && pvMax > 0) pv.scrollTop = (ta.scrollTop / max) * pvMax;
      });
      ta.addEventListener("compositionend", () => {
        if (novelState.open && novelState.dirty) {
          clearTimeout(novelAutoTimer);
          novelAutoTimer = setTimeout(() => {
            novelAutoTimer = 0;
            if (novelState.open && novelState.dirty) novelSaveCurrent({ silent: true });
          }, NOVEL_AUTOSAVE_MS);
        }
      });
    }
    const rz = $("#novel-col-resizer");
    if (rz) {
      rz.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        const startX = ev.clientX;
        const startW = novelLeftW;
        let moved = false;
        const onMove = (e) => {
          const dx = (e.clientX - startX) / uiZoomScale($("#novel-left"));
          if (!moved && Math.abs(dx) < 2) return;
          moved = true;
          document.body.classList.add("novel-col-resizing");
          novelApplyWidth(startW + dx);
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.classList.remove("novel-col-resizing");
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
      rz.addEventListener("dblclick", () => novelApplyWidth(NOVEL_DEFAULT_W));
    }
    document.addEventListener("keydown", onNovelKeydown, true);
    document.addEventListener(
      "click",
      (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest("#novel-outline .novel-row")) return;
        clearTimeout(novelClickTimer);
        novelClickTimer = 0;
      },
      true
    );
    window.addEventListener("beforeunload", () => {
      if (novelState.open && novelState.dirty) novelSaveCurrent({ silent: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && novelState.open && novelState.dirty) novelSaveCurrent({ silent: true });
    });
  }

  function renderNovelView() {
    novelCloseIfEventGone();
    const spec = novelFolderSpec();
    novelState.folder = spec;
    renderNovelOutline();
    renderNovelProgress();
    updateNovelEditorChrome();
    updateNovelPreviewButton();
    novelRefreshIndex(true);
  }

  function refreshNovelOutlineIfVisible() {
    if (!novelIsCurrent()) return;
    novelCloseIfEventGone();
    renderNovelOutline();
    renderNovelProgress();
    updateNovelPreviewButton();
    if (novelState.open) updateNovelEditorChrome();
  }

  async function novelBeforeLeave() {
    if (novelState.open && novelState.dirty) await novelSaveCurrent({ silent: true });
  }

  function novelCloseIfEventGone() {
    if (!novelState.open) return;
    if (getEvent(novelState.eventId)) return;
    novelState.token++;
    novelState.eventId = "";
    novelState.open = false;
    novelState.loading = false;
    novelState.dirty = false;
    novelState.missing = false;
    const panel = $("#novel-editor");
    const empty = $("#novel-empty");
    if (panel) panel.hidden = true;
    if (empty) empty.hidden = false;
    const sourceBtn = $("#novel-source-btn");
    if (sourceBtn) sourceBtn.disabled = true;
    novelSelectRow("");
  }

  /* 换小说 / 清空工作区：正文面板必须收起来并清掉上一份项目的状态，
     否则新项目里还挂着旧事件 id，保存时会找不到事件。 */
  function novelResetForProject() {
    novelIndexSeq++;
    novelState.token++;
    novelSelectedId = "";
    novelState.eventId = "";
    novelState.open = false;
    novelState.loading = false;
    novelState.dirty = false;
    novelState.missing = false;
    novelState.loadedText = "";
    novelState.folder = null;
    novelSourceCache = { key: "", text: "", label: "" };
    novelFileIndex = new Map();
    novelIndexAt = 0;
    novelDirHandle = null;
    novelDirHandleKey = "";
    const panel = $("#novel-editor");
    const empty = $("#novel-empty");
    const ta = $("#novel-text");
    if (panel) panel.hidden = true;
    if (empty) empty.hidden = false;
    if (ta) ta.value = "";
    const preview = $("#novel-preview");
    if (preview) preview.innerHTML = "";
    const sourceBtn = $("#novel-source-btn");
    if (sourceBtn) sourceBtn.disabled = true;
    novelSelectRow("");
  }
