  /* ================= 撤销 / 恢复 ================= */
  const UNDO_LIMIT = 10;
  let undoStack = []; // [{ label, snap }]：每一步修改「之前」的状态
  let redoStack = [];
  let lastSnapObj = null;
  let lastFingerprint = "";
  let pendingUndoLabel = "";
  let toastTimer = null;

  /* 设置弹窗自己的撤销 / 恢复：设置面板被弹窗盖住，顶栏的按钮点不到，
     所以设置界面里另记一条历史（Ctrl+Z / Ctrl+Y 也只作用于设置界面） */
  let settingsModalOpen = false;
  let settingsUndoGuard = false;
  const SETTINGS_UNDO_LIMIT = 10;
  let settingsUndoStack = [];
  let settingsRedoStack = [];

  // 深拷贝数据；人设图这类大字符串直接共用引用，避免内存翻倍
  function deepCopyData(v) {
    if (Array.isArray(v)) return v.map(deepCopyData);
    if (v && typeof v === "object") {
      const o = {};
      Object.keys(v).forEach((k) => {
        o[k] = deepCopyData(v[k]);
      });
      return o;
    }
    return v;
  }

  // 内容指纹：图片只记长度，比较起来很快
  function dataFingerprint() {
    try {
      // 人设图 / 设定图这类大字符串只记长度，比较起来才快
      return JSON.stringify(state, (k, v) =>
        (k === "portrait" || k === "image") && typeof v === "string" ? v.length : v
      );
    } catch (e) {
      return String(Date.now());
    }
  }

  function resetUndoHistory() {
    undoStack = [];
    redoStack = [];
    lastSnapObj = state ? deepCopyData(state) : null;
    lastFingerprint = state ? dataFingerprint() : "";
    pendingUndoLabel = "";
    updateUndoButtons();
  }

  // 每次保存后调用：内容真的变了才记一步
  function recordUndoStep(force) {
    if (!state) return;
    const fp = dataFingerprint();
    if (!force && fp === lastFingerprint) return;
    if (!lastSnapObj) {
      // 还没有基线（刚加载项目），只记录基线，不产生可撤销步骤
      lastSnapObj = deepCopyData(state);
      lastFingerprint = fp;
      pendingUndoLabel = "";
      return;
    }
    // 设置界面开着的时候，同一步顺便记进「设置」自己的撤销栈（设置面板被弹窗盖住，点不到顶栏的撤销）
    if (settingsSnapshot && !settingsUndoGuard) pushSettingsUndo(pendingUndoLabel || "修改设置", null, lastSnapObj);
    undoStack.push({ label: pendingUndoLabel || "修改", snap: lastSnapObj });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    lastSnapObj = deepCopyData(state);
    lastFingerprint = fp;
    pendingUndoLabel = "";
    updateUndoButtons();
  }

  function applySnapshot(snap) {
    const copy = deepCopyData(snap);
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, copy);
    ensureData();
    // 快照恢复会把 state 换成一批全新的对象；必须让按 stateDataRev 缓存的
    // orderedByStory / axisRows / lookupIndexes 失效，否则 renderAll 仍会拿
    // 旧对象重画，界面看起来就像「撤销 / 恢复没生效」。
    stateDataRev++;
  }

  function persistOnly() {
    const p = getActiveProject();
    if (p) p.updatedAt = Date.now();
    persistProjectsLocal();
    scheduleIdbProjectsSave();
  }

  function undoTimeline() {
    if (analysisActivelyRunning()) {
      uiAlert("文本分析正在跑。点一下「暂停」（或「终止」）后就能继续撤销 / 编辑。");
      return false;
    }
    if (!undoStack.length) return false;
    const entry = undoStack.pop();
    redoStack.push({ label: entry.label, snap: deepCopyData(state) });
    applySnapshot(entry.snap);
    lastSnapObj = deepCopyData(state);
    lastFingerprint = dataFingerprint();
    logSnapshot("撤销：" + entry.label);
    persistOnly();
    renderAll();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("undo");
    updateUndoButtons();
    showToast("已撤销：" + uiTrans(entry.label));
    return true;
  }

  function redoTimeline() {
    if (analysisActivelyRunning()) {
      uiAlert("文本分析正在跑。点一下「暂停」（或「终止」）后就能继续恢复。");
      return false;
    }
    if (!redoStack.length) return false;
    const entry = redoStack.pop();
    undoStack.push({ label: entry.label, snap: deepCopyData(state) });
    applySnapshot(entry.snap);
    lastSnapObj = deepCopyData(state);
    lastFingerprint = dataFingerprint();
    logSnapshot("恢复：" + entry.label);
    persistOnly();
    renderAll();
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("redo");
    updateUndoButtons();
    showToast("已恢复：" + uiTrans(entry.label));
    return true;
  }

  function updateUndoButtons() {
    // 标签先按当前语言翻一遍（里面夹着人名 / 数量，只靠外层模板翻不到 $1 里面）
    const undoLabel = undoStack.length ? `撤销：${uiTrans(undoStack[undoStack.length - 1].label)}（Ctrl+Z）` : "没有可撤销的操作（Ctrl+Z）";
    const redoLabel = redoStack.length ? `恢复：${uiTrans(redoStack[redoStack.length - 1].label)}（Ctrl+Y）` : "没有可恢复的操作（Ctrl+Y）";
    $$(".js-undo").forEach((btn) => {
      btn.disabled = !undoStack.length;
      btn.title = undoLabel;
    });
    $$(".js-redo").forEach((btn) => {
      btn.disabled = !redoStack.length;
      btn.title = redoLabel;
    });
  }

  function showToast(text) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 1800);
  }

