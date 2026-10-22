  /* ================= 文本分析 ================= */
  function getSelectedTask() {
    return state.analysis.tasks.find((t) => t.id === selectedTaskId) || null;
  }

  let lastTaskDeleteAt = 0; // 任务卡 × 的连点保护

  // 进文本分析界面要直接落在第一个任务上：不要先给一个空界面
  function ensureSelectedTask() {
    const tasks = state.analysis.tasks || [];
    if (!tasks.length) {
      selectedTaskId = null;
      return null;
    }
    if (!tasks.some((t) => t.id === selectedTaskId)) selectedTaskId = tasks[0].id;
    return getSelectedTask();
  }

  function renderTaskList() {
    const list = $("#task-list");
    const empty = $("#task-empty");
    if (!list) return;
    ensureSelectedTask();
    const tasks = state.analysis.tasks;
    empty.hidden = tasks.length > 0;
    const owner = runningTaskInfo();
    const addBtn = $("#new-task-btn");
    const fillAllBtn = $("#fill-all-tasks-btn");
    if (fillAllBtn) fillAllBtn.addEventListener("click", () => { if (typeof fillAllTasksToSettings === "function") fillAllTasksToSettings(); });
    // 只重画任务页签；末尾那个「＋」页签的监听挂在启动时，不能被重画冲掉
    $$("#task-list .task-tab").forEach((n) => n.remove());
    const html = tasks
      .map((t) => {
        const active = selectedTaskId === t.id;
        const nFiles = (t.files || []).length;
        const nFail = failedUnitList(t).length;
        return `<div class="view-tab task-tab${active ? " current" : ""}" role="tab" draggable="true" title="单击＝打开 · 双击＝改名 · 拖动＝排序 · ×＝删除" data-task-id="${esc(
          t.id
        )}">
          <span class="task-name">${esc(t.name)}</span>
          <span class="task-count">(${nFiles})</span>
          ${owner && owner.id === t.id ? `<span class="task-running" title="这个任务正在分析，进度条和「暂停 / 终止」在这里">分析中</span>` : ""}
          ${nFail ? `<span class="task-fail" title="这一任务里有 ${nFail} 段分析失败：可以点「重跑失败部分」补跑">失败 ${nFail}</span>` : ""}
          <button type="button" class="icon-btn task-del" title="删除这个任务（文件和结果一起删，可撤销）">×</button>
        </div>`;
      })
      .join("");
    if (addBtn) addBtn.insertAdjacentHTML("beforebegin", html);
    else list.insertAdjacentHTML("beforeend", html);
    let taskDragId = null;
    list.querySelectorAll(".task-tab").forEach((el) => {
      el.addEventListener("click", () => {
        if (selectedTaskId === el.dataset.taskId) return;
        selectedTaskId = el.dataset.taskId;
        // 只改选中态，不重画列表：重画会把节点换掉，双击（＝改名）就接不上了
        $$("#task-list .task-tab").forEach((n) => n.classList.toggle("current", n.dataset.taskId === selectedTaskId));
        renderTaskDetail();
      });
      // 双击整张任务卡＝改名（点右上角 × 的那一下不算）
      el.addEventListener("dblclick", async (ev) => {
        if (ev.target.closest && ev.target.closest(".task-del")) return;
        ev.preventDefault();
        ev.stopPropagation();
        const t = (state.analysis.tasks || []).find((x) => x.id === el.dataset.taskId);
        if (!t) return;
        const name = await uiPrompt("任务名：", t.name);
        if (name === null) return;
        const v = String(name).trim();
        if (!v || v === t.name) return;
        pendingUndoLabel = `重命名分析任务：「${t.name}」→「${v}」`;
        t.name = v;
        t.nameEdited = true; // 用户自己起的名，之后导入文档不再自动改
        saveState();
        renderTaskList();
        renderTaskDetail();
        showToast(`任务已改名为「${v}」`);
      });
      // 右上角 ×＝快捷删除（和人物 / 设定卡片一样不弹二次确认，可撤销）
      const delBtn = el.querySelector(".task-del");
      if (delBtn)
        delBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // 防止手抖连点两下：第二下会因为下面的卡上移而删到下一张（每次删除都还是可以撤销的）
          const now = Date.now();
          if (now - lastTaskDeleteAt < 400) return;
          lastTaskDeleteAt = now;
          quickDeleteTask(el.dataset.taskId);
        });
      // 拖动＝调整任务顺序
      el.addEventListener("dragstart", (ev) => {
        taskDragId = el.dataset.taskId;
        el.classList.add("dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", taskDragId);
          } catch (e) {
            /* ignore */
          }
        }
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        list.querySelectorAll(".drag-before, .drag-after").forEach((x) => x.classList.remove("drag-before", "drag-after"));
        taskDragId = null;
      });
      el.addEventListener("dragover", (ev) => {
        if (!taskDragId || taskDragId === el.dataset.taskId) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const r = el.getBoundingClientRect();
        // 页签是横排的：按鼠标落在被压住那个页签的左半 / 右半来定前 / 后
        const before = ev.clientX < r.left + r.width / 2;
        el.classList.toggle("drag-before", before);
        el.classList.toggle("drag-after", !before);
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-before", "drag-after"));
      el.addEventListener("drop", (ev) => {
        if (!taskDragId || taskDragId === el.dataset.taskId) return;
        ev.preventDefault();
        ev.stopPropagation();
        const r = el.getBoundingClientRect();
        const before = ev.clientX < r.left + r.width / 2;
        const arr = state.analysis.tasks || [];
        const from = arr.findIndex((t) => t.id === taskDragId);
        if (from < 0) return;
        const moved = arr.splice(from, 1)[0];
        const target = arr.findIndex((t) => t.id === el.dataset.taskId);
        arr.splice(before ? target : target + 1, 0, moved);
        pendingUndoLabel = `调整分析任务顺序：「${moved.name}」`;
        saveState();
        renderTaskList();
        showToast(`已把「${moved.name}」调整到${before ? "前面" : "后面"}`);
      });
    });
  }

  // 任务卡右上角 ×：直接删（可撤销），删完自动选中剩下第一个任务
  function quickDeleteTask(id) {
    const t = (state.analysis.tasks || []).find((x) => x.id === id);
    if (!t) return;
    state.analysis.tasks = (state.analysis.tasks || []).filter((x) => x.id !== id);
    if (selectedTaskId === id) {
      selectedTaskId = state.analysis.tasks[0] ? state.analysis.tasks[0].id : null;
    }
    pendingUndoLabel = `删除分析任务：「${t.name}」`;
    saveState();
    renderTaskList();
    renderTaskDetail();
    showToast(`已删除分析任务「${t.name}」，可用「撤销」还原`);
  }

  function renderTaskDetail() {
    const empty = $("#task-detail-empty");
    const body = $("#task-detail-body");
    const task = ensureSelectedTask();
    if (!task) {
      empty.hidden = false;
      body.hidden = true;
      updateSegPickButtons(null);
      updateRetryButton();
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    const nameEl = $("#task-name");
    if (nameEl) nameEl.value = task.name;
    renderFileList(task);
    renderSegments(task);
    renderResultReview(task);
    updateRetryButton();
    const owner = runningTaskInfo();
    if (!owner) {
      const st = $("#analyze-status");
      if (st) {
        st.textContent = "";
        st.title = "";
      }
      hideProgress();
    } else if (owner.id === task.id) {
      // 切回正在分析的任务：把它的进度恢复出来
      if (analysisRun && analysisRun.pct !== undefined) showProgress(analysisRun.pct, analysisRun.pctLabel || "");
      else showProgress(0, "准备中…");
    } else {
      hideProgress();
      setAnalyzeStatus(""); // 有守卫：这里会写成「被「X」占用」
    }
    updateRunButtons();
  }

  // 某个文件识别出的章节（按文中位置排序）
  function fileSegments(task, fileId) {
    return (task.segments || []).filter((s) => s.fileId === fileId).sort((a, b) => a.start - b.start);
  }

  // 单个章节 / 文件（分析单元）的状态：
  // done 已分析 / todo 还没跑 / part 跑了一部分但没失败 / half 有失败但成功过一部分 / fail 全部失败
  function unitAnalysisState(obj) {
    if (!obj) return "todo";
    const fails = (obj.failChunks || []).length;
    const oks = (obj.okChunks || []).length;
    // 本次分析中同样优先看实时计数，避免「分析中 → 未分析」的倒退
    const live = obj.id ? unitProgress.get(obj.id) : null;
    if (live && (live.total || live.done || live.failed)) {
      const done = Math.max(live.done || 0, oks);
      const failed = Math.max(live.failed || 0, fails);
      const total = Math.max(live.total || 0, done + failed, 1);
      if (failed && done >= total) return done - failed > 0 ? "half" : "fail";
      if (done >= total) return "done";
      if (done > 0 || live.running) return "part";
      return "todo";
    }
    if (fails) return oks > 0 ? "half" : "fail";
    if (obj.analyzed === true) return "done";
    return oks > 0 ? "part" : "todo";
  }

  function fileAnalysisState(task, file) {
    const segs = fileSegments(task, file.id);
    if (!segs.length) return unitAnalysisState(file);
    const unitSegs = segs.filter((s) => segLevelOf(s) !== "merge");
    if (!unitSegs.length) return unitAnalysisState(file);
    const states = unitSegs.map(unitAnalysisState);
    if (states.every((s) => s === "fail")) return "fail";
    if (states.some((s) => s === "fail" || s === "half")) return "half";
    if (states.every((s) => s === "done")) return "done";
    return states.some((s) => s !== "todo") ? "part" : "todo";
  }

  // 失败的片段数 / 失败的分析单元，用来提示「只重跑这些地方」
  function failedUnitList(task) {
    const out = [];
    (task.segments || []).forEach((s) => {
      if (segLevelOf(s) === "merge") return;
      if ((s.failChunks || []).length) out.push({ kind: "seg", obj: s, seg: s, fileId: s.fileId, label: s.label, count: s.failChunks.length, error: s.lastError || "" });
    });
    const withSegs = new Set((task.segments || []).map((s) => s.fileId));
    (task.files || []).forEach((f) => {
      if (withSegs.has(f.id)) return;
      if ((f.failChunks || []).length) out.push({ kind: "file", obj: f, seg: null, fileId: f.id, label: f.name, count: f.failChunks.length, error: f.lastError || "" });
    });
    return out;
  }

  const FILE_STATE_LABEL = {
    done: "已分析",
    todo: "未分析",
    part: "部分完成",
    half: "部分失败",
    fail: "分析失败",
  };
  const SEG_STATE_LABEL = FILE_STATE_LABEL;

  // 正在分析时每个章 / 节的实时进度：id → { done, total, failed, running }
  let unitProgress = new Map();
  let runUnitObjects = new Map(); // 本次分析涉及的单元：id → 章节段 / 文件对象

  function progressOf(unitId, obj, liveOverride) {
    const live = liveOverride || unitProgress.get(unitId);
    const okStored = ((obj && obj.okChunks) || []).length;
    const failStored = ((obj && obj.failChunks) || []).length;
    // 本次分析中优先用实时块计数：okChunks 要等整轮跑完才写回，
    // 只用它会出现「分析中 4% → 0%」「已分析 → 未分析」这种倒退。
    const hasLive = !!(live && (live.total || live.done || live.failed));
    const done = Math.max(hasLive ? live.done || 0 : 0, okStored);
    const failed = Math.max(hasLive ? live.failed || 0 : 0, failStored);
    const total = Math.max(
      hasLive ? live.total || 0 : 0,
      done + failed,
      (obj && obj.chunkTotal) || 0,
      1
    );
    let pct = Math.round((done / total) * 100);
    let cls;
    const finished = done + failed; // 已经跑完的块（成功的 + 失败的）
    if (failed && finished >= total) cls = done > 0 ? "half" : "fail";
    else if (finished >= total) cls = obj && obj.analyzed === true ? "done" : "part";
    else if (live && live.running) cls = "run";
    else if (finished > 0) cls = "part";
    else cls = obj && obj.analyzed === true ? "done" : "todo";
    // 整段都失败 / 已完成：进度条整条走满（全失败＝整条红，和以前一致）
    if (cls === "done" || cls === "fail") pct = 100;
    if (cls === "half") pct = Math.max(pct, Math.round((done / total) * 100));
    if (live && live.running && pct < 4) pct = 4; // 刚起步给一点反馈
    if (live) {
      // 同一次分析里只前进不后退
      live.shownPct = Math.max(live.shownPct || 0, pct);
      pct = live.shownPct;
    }
    return { pct, cls };
  }

  function progressHtml(unitId, obj, label, liveOverride) {
    const p = progressOf(unitId, obj, liveOverride);
    const desc =
      p.cls === "done"
        ? "已分析完"
        : p.cls === "fail"
          ? "分析失败"
          : p.cls === "half"
            ? "部分失败"
            : p.cls === "run"
              ? "正在分析…"
              : "还没开始";
    return `<span class="seg-progress ${p.cls}" title="${esc((label ? label + "：" : "") + desc)}"><i class="seg-progress-fill" style="width:${p.pct}%"></i></span>`;
  }

  // 分析过程中只更新那一条进度条，不整块重绘
  function paintUnitProgress(unitId) {
    const seg = runUnitObjects.get(unitId);
    ["#segment-list", "#file-list"].forEach((sel) => {
      const box = $(sel);
      if (!box) return;
      const el = box.querySelector(`[data-seg-id="${unitId}"], [data-file-id="${unitId}"]`);
      if (!el) return;
      const p = progressOf(unitId, seg);
      const wrap = el.querySelector(".seg-progress");
      const fill = el.querySelector(".seg-progress-fill");
      if (!wrap || !fill) return;
      wrap.className = "seg-progress " + p.cls;
      fill.style.width = p.pct + "%";
      // 状态胶囊也一起更新：重跑开始时状态已经重置，这里不跟着改就会留着「已分析」
      const pill = el.querySelector(".seg-status");
      if (pill && seg) {
        const st = unitAnalysisState(seg);
        pill.className = "seg-status " + st;
        pill.textContent = SEG_STATE_LABEL[st] || "";
        pill.title = String(seg.lastError || "");
      }
    });
  }

  // 文件行的进度 = 它下面所有章 / 节的进度合起来
  function fileProgressTarget(task, file) {
    const segs = fileSegments(task, file.id);
    if (!segs.length) return { obj: file, live: null };
    let ok = 0;
    let bad = 0;
    let total = 0;
    let all = true;
    let liveDone = 0;
    let liveTotal = 0;
    let liveFail = 0;
    let liveRunning = false;
    segs.forEach((s) => {
      ok += (s.okChunks || []).length;
      bad += (s.failChunks || []).length;
      total += Math.max(s.chunkTotal || 0, 1);
      if (s.analyzed !== true) all = false;
      const lp = unitProgress.get(s.id);
      if (lp && lp.running) {
        liveRunning = true;
        liveDone += lp.done;
        liveTotal += lp.total;
        liveFail += lp.failed;
      }
    });
    return {
      obj: { okChunks: { length: ok }, failChunks: { length: bad }, chunkTotal: total, analyzed: all },
      live: liveRunning ? { running: true, done: liveDone, total: liveTotal, failed: liveFail } : null,
    };
  }

  function paintFileProgress(task, fileId) {
    const box = $("#file-list");
    if (!box) return;
    const file = (task.files || []).find((f) => f.id === fileId);
    const el = box.querySelector(`[data-file-id="${fileId}"]`);
    if (!file || !el) return;
    const t = fileProgressTarget(task, file);
    const p = progressOf(fileId, t.obj, t.live);
    const wrap = el.querySelector(".seg-progress");
    const fill = el.querySelector(".seg-progress-fill");
    if (!wrap || !fill) return;
    wrap.className = "seg-progress " + p.cls;
    fill.style.width = p.pct + "%";
    // 文件行的状态胶囊也跟着更新（重跑开始时不能还显示「已分析」）
    const pill = el.querySelector(".file-status");
    if (pill) {
      const st = unitAnalysisState(t.obj);
      pill.className = "file-status " + st;
      pill.textContent = SEG_STATE_LABEL[st] || "";
    }
  }

  // 文件名自然排序：让「第2章」排在「第10章」前面
  function naturalCompare(a, b) {
    try {
      return String(a).localeCompare(String(b), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    } catch (e) {
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    }
  }

  // 从「第X章 / 第X节」里取出章节号（支持中文数字），取不到返回 null
  const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function cnNumberValue(s) {
    const str = String(s || "");
    if (/^[0-9]+$/.test(str)) return parseInt(str, 10);
    let total = 0;
    let section = 0;
    let num = 0;
    for (const ch of str) {
      if (ch === "万") {
        section = (section + num) * 10000;
        total += section;
        section = 0;
        num = 0;
      } else if (ch === "千" || ch === "百" || ch === "十") {
        const unit = ch === "千" ? 1000 : ch === "百" ? 100 : 10;
        section += (num || 1) * unit;
        num = 0;
      } else if (CN_DIGITS[ch] !== undefined) {
        num = CN_DIGITS[ch];
      } else {
        return null;
      }
    }
    const value = total + section + num;
    return value > 0 ? value : null;
  }
  function chapterNumberKey(name) {
    const k = chapterOrderKey(cleanFileBase(name));
    return k.has ? k.num : null;
  }
  // 文件排序：先按「第X章」的章号，再按文件名自然顺序
  function compareStoryFiles(a, b) {
    const ka = chapterNumberKey(a && a.name);
    const kb = chapterNumberKey(b && b.name);
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    if (ka !== null && kb === null) return -1;
    if (ka === null && kb !== null) return 1;
    return naturalCompare(a && a.name, b && b.name);
  }

  // 让 segments 数组顺序跟文件顺序一致（文件上移/下移后调用）
  function syncSegmentsOrder(task) {
    const rank = new Map();
    (task.files || []).forEach((f, i) => rank.set(f.id, i));
    task.segments = (task.segments || [])
      .map((s, i) => ({ s, i }))
      .sort(
        (a, b) =>
          (rank.get(a.s.fileId) ?? 1e9) - (rank.get(b.s.fileId) ?? 1e9) || a.s.start - b.s.start || a.i - b.i
      )
      .map((x) => x.s);
  }

  function moveFile(task, fileId, delta) {
    const files = task.files || [];
    const i = files.findIndex((f) => f.id === fileId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= files.length) return;
    const moved = files.splice(i, 1)[0];
    files.splice(j, 0, moved);
    afterFileOrderChange(task, moved, j);
  }

  // 拖到某一份文件的前 / 后：文件顺序就是分章顺序，段落顺序和章节顺序一起跟着改
  function reorderFile(task, fileId, targetId, after) {
    if (!task || !fileId || !targetId || fileId === targetId) return;
    const files = task.files || [];
    const from = files.findIndex((f) => f.id === fileId);
    const target = files.findIndex((f) => f.id === targetId);
    if (from < 0 || target < 0) return;
    const moved = files.splice(from, 1)[0];
    let to = files.findIndex((f) => f.id === targetId);
    if (to < 0) to = files.length;
    else if (after) to += 1;
    files.splice(to, 0, moved);
    afterFileOrderChange(task, moved, to);
  }

  function afterFileOrderChange(task, moved, index) {
    syncSegmentsOrder(task);
    sortChaptersNaturally();
    renumberResults(task);
    saveState();
    renderFileList(task);
    renderSegments(task);
    renderResultReview(task);
    renderTaskList();
    renderChapterRail();
    renderTimeline();
    renderMatrix();
    renderChrono();
    setAnalyzeStatus(`已调整顺序：${moved.name} 现在是第 ${index + 1} 位。`);
  }

  let fileDragId = ""; // 文件列表拖拽排序：正在拖的文件 id

  function renderFileList(task) {
    const box = $("#file-list");
    const files = task.files || [];
    if (!files.length) {
      box.innerHTML = `<p class="file-empty">还没有导入文件。</p>`;
      return;
    }
    box.innerHTML =
      files
        .map((f, i) => {
          const st = fileAnalysisState(task, f);
          const fp = fileProgressTarget(task, f);
          return `<div class="file-item" draggable="true" data-file-id="${esc(f.id)}" title="${esc(
            uiTextFor("拖动调整全文顺序（也可用 ↑ ↓）")
          )}">
          <span class="file-order" title="${esc(uiTextFor("拖动调整全文顺序（也可用 ↑ ↓）"))}">${i + 1}</span>
          <span class="file-icon">📄</span>
          <span class="file-name" title="${esc(f.name)}&#10;双击＝用系统默认程序打开原文件">${esc(f.name)}</span>
          ${
            f.toc
              ? `<span class="file-toc" title="这份 PDF 是按它的目录分章的：目录里 ${f.toc.chapters} 章，正文里核对到 ${f.toc.found}/${f.toc.total} 章（目录页码比 PDF 页少 ${f.toc.offset} 页，已经按正文核对过）">按目录分章</span>`
              : ""
          }
          ${
            !f.toc && !f.pageOffsets && /\.pdf$/i.test(f.name || "")
              ? `<span class="file-toc muted" title="旧版导入的 PDF 没有页码位置信息，用不了目录分章：删掉重新导入即可（已有结果不会丢）。">重新导入可自动分章</span>`
              : ""
          }
          ${progressHtml(f.id, fp.obj, f.name, fp.live)}
          <span class="file-status ${st}">${FILE_STATE_LABEL[st]}</span>
          <span class="file-size">${(f.size || 0) > 0 ? humanSize(f.size) : ""} · ${(f.text || "").length} 字</span>
          ${st === "half" || st === "fail" ? `<button class="icon-btn file-retry" title="只补跑这个文档里失败的片段，已分析好的部分不重跑">重跑失败</button>` : ""}
          <button class="icon-btn file-move file-up" title="上移一位（调整全文顺序）" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn file-move file-down" title="下移一位（调整全文顺序）" ${i === files.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-btn file-del" title="移除这个文档">×</button>
        </div>`;
        })
        .join("");

    box.querySelectorAll(".file-up").forEach((b) =>
      b.addEventListener("click", () => moveFile(task, b.closest(".file-item").dataset.fileId, -1))
    );
    box.querySelectorAll(".file-down").forEach((b) =>
      b.addEventListener("click", () => moveFile(task, b.closest(".file-item").dataset.fileId, 1))
    );
    box.querySelectorAll(".file-del").forEach((b) =>
      b.addEventListener("click", () => {
        const fid = b.closest(".file-item").dataset.fileId;
        task.files = (task.files || []).filter((f) => f.id !== fid);
        task.segments = (task.segments || []).filter((s) => s.fileId !== fid);
        renumberResults(task);
        saveState();
        renderFileList(task);
        renderSegments(task);
        renderResultReview(task);
        renderTaskList();
      })
    );
    box.querySelectorAll(".file-retry").forEach((b) =>
      b.addEventListener("click", () => {
        const fid = b.closest(".file-item").dataset.fileId;
        const ids = new Set([fid]);
        (task.segments || []).forEach((s) => {
          if (s.fileId === fid) ids.add(s.id);
        });
        analyzeTask("retry", { ids });
      })
    );
    // 拖动文件行＝调整「全文顺序」；章节 / 分段 / 已分析结果的顺序一起跟着变
    box.querySelectorAll(".file-item").forEach((el) => {
      el.addEventListener("dragstart", (ev) => {
        if (ev.target.closest && ev.target.closest("button, input, select, a")) {
          ev.preventDefault();
          return;
        }
        fileDragId = el.dataset.fileId;
        el.classList.add("file-dragging");
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = "move";
          try {
            ev.dataTransfer.setData("text/plain", fileDragId);
          } catch (e) {
            /* ignore */
          }
        }
      });
      el.addEventListener("dragend", () => {
        fileDragId = "";
        box.querySelectorAll(".file-item").forEach((x) => x.classList.remove("file-dragging", "file-drop-before", "file-drop-after"));
      });
      el.addEventListener("dragover", (ev) => {
        if (!fileDragId || fileDragId === el.dataset.fileId) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        const r = el.getBoundingClientRect();
        const after = ev.clientY > r.top + r.height / 2;
        box.querySelectorAll(".file-item").forEach((x) => x.classList.remove("file-drop-before", "file-drop-after"));
        el.classList.add(after ? "file-drop-after" : "file-drop-before");
      });
      el.addEventListener("dragleave", (ev) => {
        if (ev.relatedTarget && el.contains(ev.relatedTarget)) return;
        el.classList.remove("file-drop-before", "file-drop-after");
      });
      el.addEventListener("drop", (ev) => {
        if (!fileDragId) return;
        ev.preventDefault();
        const after = el.classList.contains("file-drop-after");
        const dragId = fileDragId;
        fileDragId = "";
        box.querySelectorAll(".file-item").forEach((x) => x.classList.remove("file-dragging", "file-drop-before", "file-drop-after"));
        if (dragId && dragId !== el.dataset.fileId) reorderFile(task, dragId, el.dataset.fileId, after);
      });
    });
    // 双击这个文档＝用系统默认程序打开它原来的文件（安装版才有原路径）
    box.querySelectorAll(".file-item").forEach((el) =>
      el.addEventListener("dblclick", (ev) => {
        if (ev.target.closest && ev.target.closest("button, input, select, a")) return;
        openSourceFile(task, el.dataset.fileId);
      })
    );
  }

  /* 双击文件列表里的文档＝用系统默认程序打开原文件。
     原路径是导入时从 File.path 记下来的（只有安装版有）；旧版导入的存档里没有，
     那就只能提示重新导入一次。 */
  async function openSourceFile(task, fileId) {
    const f = ((task && task.files) || []).find((x) => x.id === fileId);
    if (!f) return;
    const native = nativeApp();
    if (!f.srcPath) {
      showToast("这条没有原文件位置（旧版导入的、或是在浏览器里打开的）：删掉重新导入一次就能双击打开。");
      return;
    }
    if (!native || typeof native.openFilePath !== "function") {
      showToast("只有在安装版（exe）里才能双击打开原文件。");
      return;
    }
    const r = await native.openFilePath(f.srcPath);
    if (r && r.ok) return;
    showToast(`打不开这个文件：${(r && r.error) || ""}　文件可能被移动、改名或删掉了。`);
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  // 按「文件顺序 → 文件内章节顺序」构造分析单元；每个单元带全文位置号 pos
  // 分析结果里的「出处」文字：节要带上所属章，写成「第X章 … · 第Y节 …」
  function jobSourceLabel(job) {
    const label = String((job && job.label) || "").trim();
    const ch = String((job && job.chapterLabel) || "").trim();
    if (!ch || !label || ch === label) return label || ch;
    return ch + " · " + label;
  }

  /* 相邻几章合成**一次**分析（用户 2026-10-17）：
     每次调用都要重发那份 1.5 万字的系统提示，章节越碎越贵 —— 合并是唯一"省得多、折损小"的开关。
     · 只在**同一个文件**里相邻、合计不超过 `MERGE_UNIT_MAX`（1.2 万字）时合并；
     · 章 / 节的顺序不变；出处写成「第X章–第Y章」（比按章粗一档，这是代价）；
     · 组的"身份"仍算第一段（`seg` / `segId` 不动），收尾时组里所有段一起标「已分析」。
     `per`＝每次几章（1 就是不合并，保持原样）。 */
  const MERGE_UNIT_MAX = 12000;
  function groupAnalysisUnits(units, per) {
    const n = Math.max(1, Math.min(3, Math.floor(Number(per) || 1)));
    const list = units || [];
    if (n <= 1 || list.length < 2) return list;
    const out = [];
    let cur = null;
    list.forEach((u) => {
      const joinable =
        cur && cur.fileId === u.fileId && cur.group.length < n && cur.text.length + u.text.length + 2 <= MERGE_UNIT_MAX;
      if (!joinable) {
        cur = Object.assign({}, u, {
          group: [u],
          /* 组里所有段 id（含"并入上一段"的那些）：收尾时一起标「已分析」 */
          groupSegIds: (u.segId ? [u.segId] : []).concat(u.mergedSegIds || []),
        });
        out.push(cur);
        return;
      }
      cur.group.push(u);
      cur.text = cur.text + "\n\n" + u.text;
      cur.label = cur.group[0].label + "–" + u.label;
      cur.groupSegIds = (cur.groupSegIds || []).concat(u.segId ? [u.segId] : [], u.mergedSegIds || []);
    });
    out.forEach((u, i) => (u.pos = i));
    return out;
  }

  // 一个「章」（它下面没有节）或一个「节」就是一个分析单元，并行时按这个划分切
  function buildAnalysisUnits(task) {
    const units = [];
    (task.files || []).forEach((f) => {
      const segs = fileSegments(task, f.id);
      if (segs.length) {
        let chapterLabel = "";
        segs.forEach((s) => {
          const level = segLevelOf(s);
          // 「并入上一段」：文本接到同一个文件里上一段的末尾，不再单独作为一个分析单元。
          if (level === "merge") {
            const prev = units[units.length - 1];
            if (prev && prev.fileId === f.id) {
              if (s.included !== false) {
                const extra = segmentText(task, s).trim();
                if (extra) prev.text = (prev.text ? prev.text + "\n" : "") + extra;
              }
              prev.mergedSegIds = (prev.mergedSegIds || []).concat(s.id);
              return;
            }
          }
          const isSection = level === "section";
          const text = segmentText(task, s).trim();
          if (!text) {
            // 空段不发给模型，但章标题仍然要作为后面小节的 chapterLabel。
            if (!isSection) chapterLabel = s.label;
            return;
          }
          units.push({
            segId: s.id,
            fileId: f.id,
            seg: s,
            label: s.label,
            chapterLabel: isSection ? chapterLabel : "",
            text,
          });
          if (!isSection) chapterLabel = s.label;
        });
      } else {
        units.push({
          segId: null,
          fileId: f.id,
          file: f,
          seg: null,
          label: String(f.name || "").replace(/\.[^.]+$/, ""),
          chapterLabel: "",
          text: (f.text || "").trim(),
        });
      }
    });
    units.forEach((u, i) => (u.pos = i));
    return units;
  }

  // 兼容老数据：没存过 level 的按标题猜
  function segLevelOf(s) {
    if (!s) return "chapter";
    if (s.level === "merge") return "merge";
    if (s.level === "section" || s.level === "chapter") return s.level;
    return looksLikeSectionTitle(s.label || "") ? "section" : "chapter";
  }

  // 找到「这一段并入的目标」：往前找最近的非 merge 分段（连续多段并入时，落到同一个宿主上）。
  function hostSegmentBefore(task, seg) {
    if (!task || !seg) return null;
    const list = fileSegments(task, seg.fileId).filter((x) => x.start < seg.start);
    for (let i = list.length - 1; i >= 0; i--) {
      if (segLevelOf(list[i]) !== "merge") return list[i];
    }
    return null;
  }

  // 并入关系变化后，宿主段落的文本变了：标回未分析，让「开始分析」重新带上新增的文字。
  function invalidateSegmentAnalysis(seg) {
    if (!seg) return;
    seg.analyzed = false;
    seg.okChunks = [];
    seg.failChunks = [];
    seg.chunkTotal = 0;
    seg.lastError = "";
  }

  // 把所有结果的顺序号统一按全文位置重新编号。
  // 这样即使只重跑中间某一章，新结果也会回到它在全文中的位置，不会跑到最前面或最后面。
  function renumberResults(task) {
    const results = task.results || [];
    if (!results.length) return;
    const segPos = new Map();
    const filePos = new Map();
    const labelPos = new Map();
    let pos = 0;
    (task.files || []).forEach((f) => {
      const segs = fileSegments(task, f.id);
      if (segs.length) {
        segs.forEach((s) => {
          segPos.set(s.id, pos);
          if (!labelPos.has(s.label)) labelPos.set(s.label, pos);
          pos++;
        });
      } else {
        filePos.set(f.id, pos);
        pos++;
      }
    });
    const segLabel = new Map((task.segments || []).map((s) => [s.id, s.label]));
    const buckets = new Map();
    results.forEach((r, i) => {
      let key = null;
      if (r.segId && segPos.has(r.segId)) key = segPos.get(r.segId);
      else if (r.segId && segLabel.has(r.segId) && labelPos.has(segLabel.get(r.segId))) key = labelPos.get(segLabel.get(r.segId));
      else if (r.fileId && filePos.has(r.fileId)) key = filePos.get(r.fileId);
      else if (r.source && labelPos.has(r.source)) key = labelPos.get(r.source);
      const k = key === null ? "unknown" : key;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push({ r, i });
    });
    const keys = Array.from(buckets.keys()).sort((a, b) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a - b;
    });
    const out = [];
    keys.forEach((k) => {
      const arr = buckets.get(k);
      arr.sort((a, b) => (a.r.seq ?? 0) - (b.r.seq ?? 0) || a.i - b.i);
      arr.forEach(({ r }, j) => {
        r.seq = (k === "unknown" ? pos + 1 : k) * 100000 + j;
        out.push(r);
      });
    });
    task.results = out;
  }

  // 重新分析前清掉目标单元产生的旧结果，避免旧错误结果和新结果同时出现
  function purgeResultsForUnits(task, units, mode) {
    const before = task.results || [];
    if (mode === "all") {
      task.results = [];
      return before;
    }
    const segIds = new Set(units.filter((u) => u.segId).map((u) => u.segId));
    const fileIds = new Set(units.map((u) => u.fileId));
    const labels = new Set(units.map((u) => u.label).filter(Boolean));
    const removed = [];
    task.results = before.filter((r) => {
      // 新版结果直接带 segId / fileId；老结果只有来源章节名，按章节名兜底
      const hit =
        (r.segId && segIds.has(r.segId)) ||
        (r.fileId && fileIds.has(r.fileId)) ||
        (!r.segId && !r.fileId && r.source && labels.has(r.source));
      if (hit) removed.push(r);
      return !hit;
    });
    return removed;
  }

  // 分析「正在跑」还是「暂停着」：暂停时用户可以照常编辑 / 撤销，不必先终止。
  function analysisActivelyRunning() {
    return !!(analysisRun && !analysisRun.finished && !analysisRun.paused);
  }

  // 「重跑失败部分」按钮：有失败片段时才出现，提示具体是哪几处
  function updateRetryButton() {
    const btn = $("#retry-failed-btn");
    if (!btn) return;
    const task = getSelectedTask();
    const list = task ? failedUnitList(task) : [];
    const running = !!(analysisRun && !analysisRun.finished);
    btn.hidden = !list.length;
    btn.disabled = running || !list.length;
    btn.textContent = list.length ? `重跑失败部分（${list.length} 处）` : "重跑失败部分";
    btn.title = list.length
      ? "只补跑这些失败的地方：" +
        list.map((x) => x.label || "未命名").join("、") +
        "；已经分析好的内容不会重跑。"
      : "没有失败的部分";
  }

  // 一些「不像章节名」的常见文件名：整本书导出、扫描件、未命名稿等，不要拿它当章节名
  const GENERIC_FILE_BASE_RE =
    /^(全文|正文|小说|本文|文本|内容|合并|全集|合集|未命名|新文档|新建文本文档|无标题|作品|书稿|untitled|document|docs?|output|result|book|novel|text|merge|all|final)$/i;

  function cleanFileBase(name) {
    return String(name || "")
      .replace(/\.[^.\\/]+$/, "")
      .replace(/[\s_\-]*[（(]\d+[）)]$/, "")
      .trim();
  }

  // 由文件名推断章节名；推断不出来返回 ""（一章一个文件的场景很常见）
  /* 章 / 节标题里的空格整理：
     ① 连续空格、全角空格、制表符一律并成一个普通空格；
     ② 从 PDF 取字经常在"每个字之间"插空格（「第 一 章  风 的 脚 步」），
        如果大部分相邻汉字之间都有空格，就判断这是排版假空格，全部去掉，
        再按「第X章 / 第X节」补一个空格，变成「第一章 风的脚步」；
     ③ 正常的「第一章 风之脚步」只有一个分隔空格，保持原样。 */
  function normalizeSegLabel(raw) {
    // 中日文、数字、拉丁字母：PDF 取字经常在这些字符之间插排版空格。
    const SEG_CJK_CLS = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\u3040-\\u30ff0-9０-９A-Za-z";
    let t = String(raw == null ? "" : raw)
      .replace(/[\s\u00a0\u3000]+/g, " ")
      .trim();
    if (!t) return "";
    // PDF 取字常把拉丁词拆开（P ROLOGUE / END: C yan / P 10 L emonade）：先合回去
    t = joinSplitLatinForLabel(t);
    // 「第 3 章」这种章号里塞了空格的，先把章号收紧成「第3章」
    t = t.replace(/^第\s*([0-9０-９零一二三四五六七八九十百千万两〇]+)\s*([章节回卷部篇话幕])/, "第$1$2");
    // 「序 章」「尾 声」这类固定叫法里的字间空格
    t = t.replace(/序\s*章|序\s*言|尾\s*声|终\s*章|番\s*外|前\s*言|后\s*记|自\s*序|楔\s*子|引\s*子/g, (x) =>
      x.replace(/\s+/g, "")
    );
    const inner = new RegExp("[" + SEG_CJK_CLS + "]", "g");
    const gap = new RegExp("[" + SEG_CJK_CLS + "] (?=[" + SEG_CJK_CLS + "])", "g");
    const chars = (t.match(inner) || []).length;
    const gaps = (t.match(gap) || []).length;
    if (chars >= 3 && gaps * 2 >= chars) {
      let prev;
      const strip = new RegExp("([ " + SEG_CJK_CLS + "]) (?=[" + SEG_CJK_CLS + "])", "g");
      do {
        prev = t;
        t = t.replace(strip, "$1");
      } while (t !== prev);
      // 去掉假空格后，章 / 节标记和标题会连在一起，这里补回一个空格
      const m = t.match(/^(第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*[章节回卷部篇话幕])([^\s].*)$/);
      if (m) t = m[1] + " " + m[2];
      const mp = t.match(/^([Pp]\s*[0-9０-９]{1,4})([\u4e00-\u9fffA-Za-z].*)$/);
      if (mp) t = mp[1] + " " + mp[2];
    }
    // 英文 / 数字分节标记里的排版空格：END : Crimson → END: Crimson；P 1 → P1
    if (/^[A-Za-z0-9\s:：._\-]+$/.test(t)) {
      t = t.replace(/\s*([:：])\s*/g, "$1 ").trim();
      // 只收紧「单字母标记 + 数字」（P 1 → P1）；别把 Chapter 2 / Level 2 这种正常英文标题连起来
      t = t.replace(/([A-Z])\s+([0-9])/g, "$1$2");
    }
    // 标记 + 标题混排时也收一下标记里的空格：P 9 MONOLOGUE ： xxx → P9 MONOLOGUE: xxx
    t = t.replace(/^([A-Z]{1,6})\s+([0-9]{1,4})(?=\s|$)/, "$1$2");
    t = t.replace(/^([A-Za-z]{1,6})\s*[:：]\s*/, "$1: ");
    // 标题行尾常混进页码 / 孤立引号（PDF 取字导致）：P2 xxx “ 9 → P2 xxx
    t = t.replace(/\s+[“”"'‘’]{1,2}\s*[0-9０-９]{1,3}\s*$/, "");
    return t.replace(/\s+/g, " ").trim();
  }

  // PDF 取字常把拉丁词按字母拆开，形如：
  //   P R O L O G U E      → PROLOGUE
  //   P ROLOGUE  K a r m a → PROLOGUE  Karma
  //   END: C yan  L emonade → END: Cyan  Lemonade
  // 通用处理两类拆法（不做词表特例）：
  //   ① 连续的单字母串：字母之间只有一个空格时合起来
  //   ② 以拉丁标记开头的标签（P 9 xxx / END: xxx / P1 xxx）：单字母 + 词 也合起来
  // ② 只在「像章节标记的短标签」上做，正文里的英文不受影响。
  const LATIN_MARKER_HEAD_RE =
    /^(?:[A-Za-z]{1,12}[\s.\-]*[0-9]{1,4}|[A-Za-z]{2,14}\s*[:：]|[A-Za-z](?: [A-Za-z])+)/;

  function joinSplitLatinForLabel(raw) {
    let t = String(raw == null ? "" : raw);
    // ① 连着 3 个以上的单字母：K a r m a → Karma、P R O L O G U E → PROLOGUE
    //    只认 3 个以上，避免把「P ROLOGUE」里的「P R」误合
    t = t.replace(/\b[A-Za-z](?: [A-Za-z]){2,}\b/g, (m) => m.replace(/ /g, ""));
    // ② 拉丁标记开头的短标签：P ROLOGUE : Karma → PROLOGUE: Karma
    //    只合「大写单字母 + 词」（P ROLOGUE / C yan），别把正常的英文标题连起来（The Letter）
    if (t.length <= 60 && LATIN_MARKER_HEAD_RE.test(t)) {
      t = t.replace(/\b([A-Z]) +([A-Za-z]{2,})/g, (m, a, b) => (a === "A" || a === "I" ? m : a + b));
    }
    return t;
  }

  function chapterLabelFromFileName(name, multiFile) {
    const base = cleanFileBase(name);
    if (!base) return "";
    if (looksLikeHeadingLine(base)) return normalizeSegLabel(base);
    // 「001 初遇」「03-雪夜」「12.归途」→「第1章 初遇」……
    const m = base.match(/^([0-9０-９]{1,3})[\s.、．·\-_]+(\S.*)$/);
    if (m) {
      const n = parseInt(m[1].replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))), 10);
      const rest = m[2].trim();
      if (n > 0 && rest && !looksLikeHeadingLine(rest)) return normalizeSegLabel(`第${n}章 ${rest}`);
    }
    if (/^[0-9０-９]{1,3}$/.test(base)) {
      const n = parseInt(base.replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d))), 10);
      if (n > 0) return `第${n}章`;
    }
    // 一份文件通常就是一章：文件名能当章节名就用它（「全文 / 文本 / 正文」这类泛称除外）
    if (!GENERIC_FILE_BASE_RE.test(base)) return normalizeSegLabel(base);
    return "";
  }

  const TOC_KEY_RE = /目\s*录|目錄|contents/i;

  // 去掉空白与各种间隔点：目录排版、页眉里的「第一章·风的脚步」都能对上
  function flatKey(s) {
    return String(s || "")
      .replace(/[\s\u00a0\u3000]/g, "")
      .replace(/[·・•‧∙·]/g, "")
      .trim();
  }

  function pageSlices(text, pageOffsets) {
    const pages = [];
    for (let i = 0; i < pageOffsets.length; i++) {
      const s = pageOffsets[i];
      const e = i + 1 < pageOffsets.length ? pageOffsets[i + 1] : text.length;
      pages.push(text.slice(s, e));
    }
    return pages;
  }

  // 目录页里的章节标题：可能是「第\n一\n章\n风\n的\n脚\n步」这种一字一行，
  // 所以先把目录页压成一行再匹配，并且用否定预查避免把两章连成一串。
  function tocTitlesFrom(tocText) {
    const flat = flatKey(tocText);
    const out = [];
    const seen = new Set();
    const re =
      /第\s*([0-9０-９零一二三四五六七八九十百千万两〇]{1,6})\s*([章节回卷部篇])((?:(?!第\s*[0-9０-９零一二三四五六七八九十百千万两〇]{1,6}\s*[章节回卷部篇])[\u4e00-\u9fff、—\-～~]){0,24})/g;
    let m;
    while ((m = re.exec(flat))) {
      let rest = (m[3] || "").replace(/[、—\-～~]+$/, "");
      // 目录里两章可能紧挨着（中间没有分隔符），别把下一章的「序言 / 楔子…」粘进来
      const cut = rest.search(/(序言|楔子|序章|引子|尾声|终章|番外|后记|前言|目录)/);
      if (cut > 0) rest = rest.slice(0, cut);
      const title = "第" + m[1] + m[2] + (rest ? " " + rest : "");
      if (title.length < 3 || seen.has(title)) continue;
      seen.add(title);
      out.push(title);
    }
    // 英文目录：P1 / Chpt2 / Ep3 / Chapter 4 / Part 5 / Vol.6…
    if (!out.length) {
      const reEn = /(^|\n)\s*((?:chapter|episode|epilogue|interlude|prologue|part|pt|vol|volume|book|chap|chpt|chp|ep|p)[\s.\-:：]*(?:\d+|[ivxlcdm]+)\b[^\n]*)/gi;
      let me;
      while ((me = reEn.exec(tocText))) {
        const title = String(me[2] || "")
          .replace(/[\s.·…•・]{2,}\s*[0-9０-９]{1,4}\s*$/, "")
          .replace(/\s*[0-9０-９]{1,4}\s*$/, "")
          .trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        out.push(title);
      }
    }
    ["序言", "楔子", "序章", "引子", "尾声", "终章", "番外", "后记", "前言"].forEach((k) => {
      if (flat.includes(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    });
    return out;
  }

  // 目录里的页码：形如「…… 1 6 7」（数字之间可能带空格）
  function tocPagesFrom(tocText) {
    const nums = [];
    const re = /[…．.·・••‧∙]{2,}[^\d０-９]{0,8}([0-9０-９](?:[\s\u00a0]*[0-9０-９])*)/g;
    let m;
    while ((m = re.exec(tocText))) {
      const digits = m[1]
        .replace(/[\s\u00a0]/g, "")
        .replace(/[０-９]/g, (d) => String("０１２３４５６７８９".indexOf(d)));
      if (digits) nums.push(parseInt(digits, 10));
    }
    return nums;
  }

  // 读 PDF 的目录：找出目录页 → 取出章节名和页码 → 到正文里核对（目录页码常常不等于 PDF 页码）
  function tocChapters(text, pageOffsets) {
    if (!pageOffsets || pageOffsets.length < 4) return null;
    const pages = pageSlices(text, pageOffsets);
    const scanLimit = Math.min(pages.length, Math.max(6, Math.round(pages.length * 0.2)));
    let tocIdx = -1;
    for (let i = 0; i < scanLimit; i++) {
      if (TOC_KEY_RE.test(pages[i].slice(0, 400))) {
        tocIdx = i;
        break;
      }
    }
    if (tocIdx < 0) return null;
    let tocText = pages[tocIdx];
    for (let k = 1; k <= 3 && tocIdx + k < pages.length; k++) {
      const p = pages[tocIdx + k];
      if (flatKey(p).length < 4) continue; // 空白页
      // 只有「还带着 …… 页码」的页才算目录的续页，正文页不能混进来
      if (!tocPagesFrom(p).length) break;
      tocText += "\n" + p;
    }
    const titles = tocTitlesFrom(tocText);
    const nums = tocPagesFrom(tocText);
    if (titles.length < 2 || nums.length !== titles.length) return null;
    // 目录排版常把标题和页码分成两组，所以按「章号顺序」配「页码升序」最稳；
    // 普通目录（标题页码交错排列、页码本来就递增）就直接按顺序配。
    const asc = nums.every((n, i) => i === 0 || n >= nums[i - 1]);
    const orderTitles = asc ? titles : titles.slice().sort((a, b) => chapterOrderKey(a).num - chapterOrderKey(b).num);
    const orderNums = asc ? nums : nums.slice().sort((a, b) => a - b);
    const pairs = orderTitles.map((t, i) => ({ title: t, printedPage: orderNums[i] }));

    // 到正文里核对：页眉每页都重复，所以「第一次出现」的那一页就是这一章开头
    const located = pairs.map((p) => {
      const key = flatKey(p.title);
      let page = -1;
      for (let i = tocIdx + 1; i < pages.length; i++) {
        if (flatKey(pages[i]).includes(key)) {
          page = i;
          break;
        }
      }
      return Object.assign({}, p, { pdfPage: page });
    });
    const found = located.filter((x) => x.pdfPage >= 0);
    if (found.length < Math.max(2, Math.ceil(located.length * 0.5))) return null;
    // 目录页码与 PDF 页的差值（取出现次数最多的那个），用来补没直接找到的章
    const counter = new Map();
    found.forEach((x) => {
      const off = x.pdfPage - x.printedPage;
      counter.set(off, (counter.get(off) || 0) + 1);
    });
    let bestOffset = 0;
    let bestCount = -1;
    counter.forEach((n, off) => {
      if (n > bestCount) {
        bestCount = n;
        bestOffset = off;
      }
    });
    located.forEach((x) => {
      if (x.pdfPage < 0) {
        const guess = x.printedPage + bestOffset;
        if (guess > tocIdx && guess < pages.length) x.pdfPage = guess;
      }
    });
    // 按 PDF 页排序并保证严格递增（目录顺序乱了就丢掉对不上的条目）
    const list = located.filter((x) => x.pdfPage > tocIdx).sort((a, b) => a.pdfPage - b.pdfPage);
    const out = [];
    list.forEach((x) => {
      const last = out[out.length - 1];
      if (last && x.pdfPage <= last.pdfPage) return;
      out.push(x);
    });
    if (out.length < 2) return null;
    out.forEach((x, i) => {
      x.endPage = i + 1 < out.length ? out[i + 1].pdfPage : pageOffsets.length;
    });
    return { chapters: out, tocPage: tocIdx, offset: bestOffset, found: found.length, total: located.length };
  }

  // 章内的小节标题：Part.1 / 第X节 / 1.1
  const INNER_SECTION_RE =
    /^(?:part\s*[.．]?\s*[0-9ivxlcdm]+|第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*节|[0-9]{1,2}\.[0-9]{1,2}(?![0-9])|p\s*[0-9]{1,4}(\s|$))/i;

  // 在一章的范围内找出小节（重复出现的行＝页眉，不算）
  function sectionSegsWithin(text, start, end, repeats) {
    const out = [];
    let cur = null;
    const push = (s) => {
      if (s && s.end > s.start) out.push(s);
    };
    const sliceLines = text.slice(start, end).split(/\r?\n/);
    const markerStyleActive = sliceLines.filter((line) => looksLikeSectionTitle(normalizeSegLabel(line.trim()))).length >= 2;
    let off = start;
    sliceLines.forEach((line) => {
        const lineEnd = off + line.length;
        const t = line.trim();
        const compact = normalizeSegLabel(t);
        const isSec =
          compact &&
          compact.length <= 60 &&
          !isClassicChapterLabel(compact) &&
          (INNER_SECTION_RE.test(compact) || isStrongMarkerFormat(compact) || (markerStyleActive && isFormatMarkerLabel(compact))) &&
          (repeats.get(flatKey(compact)) || 0) < 3;
        if (isSec) {
          if (cur) push(cur);
          cur = { label: compact, start: lineEnd, end: lineEnd, level: "section" };
        } else if (cur) {
          cur.end = lineEnd;
        }
        off = lineEnd + 1;
      });
    if (cur) push(cur);
    return out;
  }

  // 按目录切分段：一章一段（章里还有 Part.N 之类的，就再切成小节）
  function tocSegments(text, pageOffsets, toc) {
    const segs = [];
    const repeats = repeatedLineCounts(text);
    toc.chapters.forEach((ch) => {
      const start = pageOffsets[ch.pdfPage];
      const end = ch.endPage < pageOffsets.length ? pageOffsets[ch.endPage] : text.length;
      if (end <= start) return;
      const inner = sectionSegsWithin(text, start, end, repeats);
      if (!inner.length) {
        segs.push({ label: normalizeSegLabel(ch.title), start, end, level: "chapter" });
        return;
      }
      // 章标题到第一个小节之间那点引言，仍然算作这一章自己
      if (inner[0].start > start) segs.push({ label: normalizeSegLabel(ch.title), start, end: inner[0].start, level: "chapter" });
      inner.forEach((s) => segs.push(s));
    });
    return segs;
  }

  // 每页重复出现的短行（页眉 / 页脚）不该当成章节标题
  function repeatedLineCounts(text) {
    const counts = new Map();
    String(text || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const t = line.trim();
        if (!t || t.length > 60) return;
        const key = flatKey(t);
        if (!key || key.length < 2) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    return counts;
  }

  // 有些 PDF 把「标题」和紧跟的正文挤在同一行，例如：
  //   P 9   MONOLOGUE ： 没能 成为雪的某个女孩 从前有一个男孩，他住在森林里一间小房子里。
  // 这行的标题到「…某个女孩」为止，后面是正文。这里把这种行切成「标题行 + 正文行」，
  // 标题才认得出，标题后的正文也不会被算进上一节。
  const GLUED_HEAD_CHARS = 18; // 标题按空白切块累加到这么多字，就认为标题结束

  function splitGluedHeading(text) {
    const s = String(text || "");
    if (s.length <= 60) return null;
    const head = normalizeSegLabel(s.slice(0, 40));
    if (!HEADING_RE.test(head) || !looksLikeMarkerFormat(head)) return null;
    // 先吃掉开头的标记：P 9 / P 9 MONOLOGUE / END: / 第3章
    const pre = s.match(
      /^\s*(?:第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*[章节回卷部篇]|[A-Za-z]{1,10}\s*[0-9]{1,4}(?:\s+[A-Za-z]{2,12})?|[A-Za-z]{2,12})\s*[:：]?\s*/
    );
    if (!pre) return null;
    let i = pre[0].length;
    let acc = 0;
    let cut = i;
    while (i < s.length) {
      const m = s.slice(i).match(/^(\s*)(\S+)/);
      if (!m) break;
      const chunk = m[2];
      if (/[。！？；]/.test(chunk)) break; // 句末标点：标题到此为止
      if (acc > 0 && acc + chunk.length > GLUED_HEAD_CHARS) break;
      acc += chunk.length;
      cut = i + m[1].length + chunk.length;
      i = cut;
      if (acc >= GLUED_HEAD_CHARS) break;
    }
    if (cut <= pre[0].length) return null;
    let bodyOffset = cut;
    while (bodyOffset < s.length && /\s/.test(s[bodyOffset])) bodyOffset++;
    if (bodyOffset >= s.length - 4) return null; // 后面没剩多少，不值得拆
    return { headLen: cut, bodyOffset };
  }

  function detectSegments(text, fileName, opts) {
    const multiFile = !!(opts && opts.multiFile);
    const pageOffsets = (opts && opts.pageOffsets) || null;
    const isMarkdown = /\.(?:md|markdown)$/i.test(String(fileName || ""));
    // 一、有目录的 PDF：优先按目录分章（目录页码会先和正文核对）
    if (pageOffsets && pageOffsets.length > 3) {
      const toc = tocChapters(String(text || ""), pageOffsets);
      if (toc) {
        const segs = tocSegments(String(text || ""), pageOffsets, toc);
        if (segs.length >= 2) return { segs, toc };
      }
    }
    // 二、没有目录：按正文标题识别，但每页都重复的页眉 / 页脚不算标题。
    //     先按常规标题规则找一批，再从这批标题的「格式」推断同类标记，
    //     例如正文里大量出现 P1 / P2 / P3，就据此把同样格式的 END: Cyan 也当成分节标记。
    const repeats = repeatedLineCounts(text);
    const lineRecs = [];
    {
      let off = 0;
      let mdFence = false;
      String(text || "")
        .split(/\r?\n/)
        .forEach((line) => {
          let mdLevel = 0;
          let display = line;
          if (isMarkdown) {
            // Markdown 的代码块里出现的 # 不是标题
            if (/^\s*(```|~~~)/.test(line)) {
              mdFence = !mdFence;
            } else if (!mdFence) {
              const m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
              if (m) {
                mdLevel = m[1].length;
                display = m[2]
                  .replace(/(\*\*|__|~~|`)/g, "")
                  .replace(/^[*_]+|[*_]+$/g, "")
                  .trim();
              }
            }
          }
          if (mdLevel) {
            lineRecs.push({ text: display, start: off, end: off + line.length, mdLevel });
            off += line.length + 1;
            return;
          }
          const glued = splitGluedHeading(line);
          if (glued) {
            // 标题和正文挤在一行：切成「标题行」+「正文行」，两段的偏移都对着原文
            lineRecs.push({ text: line.slice(0, glued.headLen), start: off, end: off + glued.headLen });
            lineRecs.push({
              text: line.slice(glued.bodyOffset),
              start: off + glued.bodyOffset,
              end: off + line.length,
            });
          } else {
            lineRecs.push({ text: line, start: off, end: off + line.length });
          }
          off += line.length + 1;
        });
    }
    const lines = lineRecs.map((r) => r.text);
    const mdLevelOf = (i) => (lineRecs[i] && lineRecs[i].mdLevel) || 0;
    const mdSectionLike = (t) =>
      looksLikeSectionTitle(t) ||
      /^(?:part|episode|section|p)[\s.．·\-:：]*[0-9ivxlcdm]+(?:\s|$|[:：、.．·\-])/i.test(t);
    let mdChapterLevel = 0;
    if (isMarkdown) {
      const levels = [];
      lineRecs.forEach((r) => {
        if (!r.mdLevel) return;
        const t = normalizeSegLabel(r.text);
        if (t && !mdSectionLike(t) && looksLikeHeadingLine(t)) levels.push(r.mdLevel);
      });
      const all = lineRecs.filter((r) => r.mdLevel).map((r) => r.mdLevel);
      mdChapterLevel = levels.length ? Math.min.apply(null, levels) : all.length ? Math.min.apply(null, all) : 0;
    }
    const headingFlags = new Array(lines.length).fill(false);
    const mdTitleSkip = new Array(lines.length).fill(false);
    const firstLabels = [];
    const repeatSeen = new Set(); // 页眉 / 页脚：只认第一次出现的那一行
    const shouldSkipRepeat = (trimmed) => {
      const key = flatKey(trimmed);
      if (!key || (repeats.get(key) || 0) < 3) return false;
      if (repeatSeen.has(key)) return true;
      repeatSeen.add(key);
      return false;
    };
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const compact = normalizeSegLabel(trimmed);
      // Markdown 有显式标题：正文里「第一章正文」这种行不能靠正则再猜成标题
      let isHeading = isMarkdown ? !!mdLevelOf(i) : looksLikeHeadingLine(trimmed) || looksLikeHeadingLine(compact);
      // Markdown 里第一行「# 书名」这种不是章的标题：当成文档标题，不切分段
      if (
        mdLevelOf(i) &&
        mdChapterLevel &&
        mdLevelOf(i) < mdChapterLevel &&
        !looksLikeHeadingLine(compact) &&
        !mdSectionLike(compact) &&
        !firstLabels.length
      ) {
        isHeading = false;
        mdTitleSkip[i] = true;
      }
      if (isHeading && shouldSkipRepeat(compact)) isHeading = false;
      if (isHeading) {
        headingFlags[i] = true;
        firstLabels.push(compact);
      }
    }
    // 全局回看：不只看第一遍认出的标题，还把「短、独占一行、拉丁/数字标记」
    // 这类同格式的行反复扫几遍，捡漏 P1/P2/P3、END: Crimson、PROLOGUE: Karma 等。
    for (let round = 0; !isMarkdown && round < 4; round++) {
      const labels = lines.filter((_, i) => headingFlags[i]).map((l) => normalizeSegLabel(l.trim()));
      const formatRegexes = inferHeadingFormats(labels);
      const sigCounts = new Map();
      lines.forEach((line, i) => {
        if (headingFlags[i]) return;
        const t = normalizeSegLabel(line.trim());
        if (!looksLikeCandidateMarker(t, i, lines)) return;
        const sig = headingFormatSignature(t);
        if (!sig) return;
        sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1);
      });
      let changed = false;
      for (let i = 0; i < lines.length; i++) {
        if (headingFlags[i]) continue;
        const t = normalizeSegLabel(lines[i].trim());
        if (!looksLikeCandidateMarker(t, i, lines)) continue;
        const sig = headingFormatSignature(t);
        const strong = isStrongMarkerFormat(t);
        const learned = matchesLearnedFormat(t, formatRegexes);
        const repeated = !!(sig && (sigCounts.get(sig) || 0) >= 2);
        if (!strong && !learned && !repeated) continue;
        if (shouldSkipRepeat(t)) continue;
        headingFlags[i] = true;
        changed = true;
      }
      if (!changed) break;
    }
    const finalLabels = lines.filter((_, i) => headingFlags[i]).map((l) => normalizeSegLabel(l.trim()));
    const markerStyleActive = finalLabels.filter((l) => looksLikeSectionTitle(l)).length >= 2;
    const segs = [];
    let current = null;
    function push(seg) {
      // 只有标题、后面紧跟下一个标题的空段也保留：它用来确定「章 / 节」的层级，
      // 分析时会跳过空文本，不影响模型请求。
      if (seg && (seg.end > seg.start || seg.label)) {
        // 没有标题、只有空白的开头段不要单独占一章（Markdown 的文档标题下面很常见）
        if (!seg.label && !String(text || "").slice(seg.start, seg.end).trim()) return;
        segs.push({ label: seg.label || "", start: seg.start, end: seg.end, level: seg.level || "" });
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const lineStart = lineRecs[i] ? lineRecs[i].start : 0;
      const lineEnd = lineRecs[i] ? lineRecs[i].end : lineStart + lines[i].length;
      if (headingFlags[i]) {
        if (current) push(current);
        const label = normalizeSegLabel(lines[i].trim());
        let level = "chapter";
        if (mdLevelOf(i)) {
          // Markdown：标题本身就是结构；比章级更深的标题算节，Part.N / 第X节一律算节
          if (mdSectionLike(label)) level = "section";
          else if (mdChapterLevel && mdLevelOf(i) > mdChapterLevel) level = "section";
          else level = "chapter";
        } else if (looksLikeSectionTitle(label)) level = "section";
        else if (markerStyleActive && isFormatMarkerLabel(label)) level = "section";
        else if (inferSegLevel(label, hasPrevChapter(segs)) === "section") level = "section";
        current = { label, start: lineEnd, end: lineEnd, level };
      } else if (mdTitleSkip[i]) {
        // Markdown 的「# 书名」：只作为文档标题，不单独占一章；后面若有前言，会并进下一个分段
        if (current) push(current);
        current = { label: "", start: lineEnd, end: lineEnd };
      } else if (!current) {
        current = { label: "", start: 0, end: lineEnd };
      } else {
        current.end = lineEnd;
      }
    }
    if (current) push(current);
    // 文件里没识别到任何章节标题时，看文件名像不像章节名（一章一个文件很常见），像就用它当这一章的标签
    const hasHeading = segs.some((s) => s.label);
    const fromFileName = chapterLabelFromFileName(fileName, multiFile);
    if (!hasHeading && fromFileName) {
      // 正文里一个标题都没认出来：整份文件当成一章，就用文档名当章节名
      segs.forEach((s) => {
        s.label = fromFileName;
      });
      return { segs };
    }
    segs.forEach((s) => {
      if (s.label) return;
      // 认出了标题、但开头那段（或别处）没有标题：用上传的文档名当这一段的标签，
      // 不要显示「开头 · 未分章」这种表述
      s.label = fromFileName || "未分章";
    });
    return { segs };
  }

  // force=false：增量识别，只处理新导入的文件，保留已有分段的改动与「已分析」标记
  // force=true ：全部重新识别
  function rebuildSegments(task, force) {
    const prev = task.segments || [];
    const byFile = new Map();
    prev.forEach((s) => {
      if (!byFile.has(s.fileId)) byFile.set(s.fileId, []);
      byFile.get(s.fileId).push(s);
    });
    // 一批文件一起导入时（多于一个），每个文件通常就是一章
    const multiFile = (task.files || []).length > 1;
    const next = [];
    (task.files || []).forEach((f) => {
      const detected = detectSegments(f.text || "", f.name, { multiFile, pageOffsets: f.pageOffsets });
      const fresh = detected.segs || [];
      // 记下「这个 PDF 是按目录分的章」，界面上可以提示一下
      if (detected.toc) {
        f.toc = {
          chapters: detected.toc.chapters.length,
          found: detected.toc.found,
          total: detected.toc.total,
          offset: detected.toc.offset,
        };
      } else if (f.toc) {
        delete f.toc;
      }
      const kept = force ? null : byFile.get(f.id);
      if (kept && kept.length) {
        // 已经分析过、或用户手动改过标题的分段保持原样
        if (kept.some((s) => s.analyzed || s.labelEdited)) {
          kept.forEach((s) => next.push(s));
        } else {
          // 还没分析也没手动改过：按最新规则重算标题，保留勾选状态与 id
          fresh.forEach((s, i) => {
            const old = kept[i];
            if (old) {
              old.label = normalizeSegLabel(s.label);
              old.start = s.start;
              old.end = s.end;
              if (s.level) old.level = s.level;
              if (!old.levelEdited) old.level = s.level || inferSegLevel(s.label, hasPrevChapter(next));
              next.push(old);
            } else {
              next.push({
                id: uid(),
                fileId: f.id,
                label: normalizeSegLabel(s.label),
                start: s.start,
                end: s.end,
                included: true,
                analyzed: false,
                level: s.level || inferSegLevel(s.label, hasPrevChapter(next)),
              });
            }
          });
        }
      } else {
        fresh.forEach((s) => {
          next.push({
            id: uid(),
            fileId: f.id,
            label: normalizeSegLabel(s.label),
            start: s.start,
            end: s.end,
            included: true,
            analyzed: false,
            level: s.level || inferSegLevel(s.label, hasPrevChapter(next)),
          });
        });
      }
    });
    task.segments = next;
    // 新识别（含重新识别）出来的章 / 节还没"划分"过：下次点「开始分析」先问一句
    task.segApplied = false;
  }

  // 同一文件里这一行之前是否已经有「章」（用来判断后面的是章还是节）
  function hasPrevChapter(list) {
    for (let i = (list || []).length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.level === "section" || s.level === "merge" || /未分章/.test(s.label || "")) continue;
      return true;
    }
    return false;
  }

  // 小节标题的常见写法：第X节 / 1.1 / 小节三
  function looksLikeSectionTitle(t) {
    const s = String(t || "").trim();
    if (looksLikeSectionProse(s)) return false;
    return (
      /第\s*[0-9０-９零一二三四五六七八九十百千万两〇]+\s*节/.test(s) ||
      /^[0-9]{1,2}\.[0-9]{1,2}/.test(s) ||
      /^\s*小?节\s*[0-9一二三四五六七八九十]/.test(s) ||
      /^\s*p\s*[0-9]{1,4}(\s|$)/i.test(s)
    );
  }

  // 「章」还是「节」：节标题（第X节 / 1.1）或跟在某章后面的 Part.N 都算节
  function inferSegLevel(label, prevChapterExists) {
    const t = String(label || "").trim();
    if (looksLikeSectionTitle(t)) return "section";
    // Part.1 / Episode 2 / Section 3 后面带标题也算节（「Part.1 可可西奇遇」）
    if (
      prevChapterExists &&
      /^(?:part|episode|section|p)[\s.．·\-:：]*[0-9ivxlcdm]+(?:\s|$|[:：、.．·\-])/i.test(t)
    )
      return "section";
    return "chapter";
  }

  function segmentText(task, seg) {
    const f = (task.files || []).find((x) => x.id === seg.fileId);
    return f ? (f.text || "").slice(seg.start, seg.end) : "";
  }

  // 「全选未分析章/节」：只勾上还没分析成功的章 / 节，已经分析过的保持原样
  // 「清空选中」：把所有章 / 节的勾都去掉
  /* 「勾选分析失败项目」：把失败的章 / 节勾上、其它先取消 —— 再点「开始分析」就只重跑这些。
     节失败时，所属的章也要勾上（范围逻辑要求章参与，节才会被分析）。 */
  function pickFailedSegments(task) {
    if (!task) return;
    const list = failedUnitList(task);
    if (!list.length) {
      showToast(uiTextFor("没有分析失败的章 / 节。"));
      return;
    }
    pendingUndoLabel = uiTextFor("勾选分析失败的章 / 节");
    (task.segments || []).forEach((s) => {
      s.included = false;
    });
    list.forEach((x) => {
      if (x.kind !== "seg" || !x.seg) return;
      x.seg.included = true;
    });
    saveState();
    renderSegments(task);
    renderTaskList();
    const n = list.length;
    showToast(`已勾选 ${n} 个分析失败的章 / 节`);
    setAnalyzeStatus(`已勾选 ${n} 个分析失败的项目，点「开始分析」只重跑它们。`);
  }

  function pickUnanalyzedSegments(task) {
    const segs = task.segments || [];
    const unitSegs = segs.filter((s) => segLevelOf(s) !== "merge");
    const todo = unitSegs.filter((s) => s.analyzed !== true);
    if (!todo.length) return;
    pendingUndoLabel = "全选未分析的章 / 节";
    todo.forEach((s) => {
      s.included = true;
    });
    saveState();
    renderSegments(task);
    renderTaskList();
    const doneCount = unitSegs.length - todo.length;
    showToast(`已勾选 ${todo.length} 个还没分析的章 / 节${doneCount ? `（已分析的 ${doneCount} 个保持原样）` : ""}`);
    setAnalyzeStatus(
      `已勾选 ${todo.length} 个还没分析完的章 / 节，点「开始分析」就会跑这些。${doneCount ? `另有 ${doneCount} 个已分析的保持原样。` : ""}`
    );
  }

  function clearSegmentPicks(task) {
    const segs = task.segments || [];
    if (!segs.length) return;
    pendingUndoLabel = "清空章 / 节的勾选";
    segs.forEach((s) => {
      s.included = false;
    });
    saveState();
    renderSegments(task);
    renderTaskList();
    showToast(`已清空选中：${segs.length} 个章 / 节这次都不分析`);
    setAnalyzeStatus("全部章 / 节都取消了勾选，这次不会分析任何内容。");
  }

  /* 全选：列表里所有章 / 节都勾上。
     和「全选未分析章/节」的区别：这一条连已经分析过的也一起勾
     ——都已经分析过、又有人把勾去掉了，用户点「全选」就是要全勾回来。 */
  function pickAllSegments(task) {
    const segs = (task && task.segments) || [];
    const unitSegs = segs.filter((s) => segLevelOf(s) !== "merge");
    if (!unitSegs.length) return;
    pendingUndoLabel = "全选章 / 节";
    unitSegs.forEach((s) => {
      s.included = true;
    });
    saveState();
    renderSegments(task);
    renderTaskList();
    showToast(`已勾选全部 ${unitSegs.length} 个章 / 节`);
    setAnalyzeStatus(`已勾选 ${unitSegs.length} 个章 / 节，点「开始分析」就会跑这些。`);
  }

  function updateSegPickButtons(task) {
    const allBtn = $("#seg-pick-all-btn");
    if (!allBtn) return;
    const segs = (task && task.segments) || [];
    const unitSegs = segs.filter((s) => segLevelOf(s) !== "merge");
    const has = unitSegs.length > 0;
    allBtn.hidden = !has;
    /* 只要列表里有章 / 节，这颗按钮就永远点得动：
       全勾着时它变成「取消全选」，只要还有没勾的就变回「全选」。
       （以前「都已分析过 + 一个都没勾」时按钮是灰的，用户点不掉也点不回来。） */
    const unchecked = unitSegs.filter((s) => s.included === false);
    const todoUnchecked = unchecked.filter((s) => s.analyzed !== true);
    const doneCount = unitSegs.length - unitSegs.filter((s) => s.analyzed !== true).length;
    allBtn.disabled = !has;
    allBtn.textContent = !unchecked.length ? "取消全选" : todoUnchecked.length ? "全选未分析章/节" : "全选";
    allBtn.title = has
      ? !unchecked.length
        ? `点一下＝把下面 ${unitSegs.length} 个章 / 节的勾选都去掉（这次先不分析它们）`
        : todoUnchecked.length
          ? `点一下＝把还没分析成功的 ${todoUnchecked.length} 个章 / 节勾上${doneCount ? `（已分析的 ${doneCount} 个保持原样）` : ""}`
          : `点一下＝把 ${unchecked.length} 个还没勾的章 / 节也勾上（都已分析过）`
      : "还没有识别到章节";
  }

  function renderSegments(task) {
    const box = $("#segment-list");
    const segs = task.segments || [];
    const rz = $("#seg-fold");
    if (rz) rz.hidden = !segs.length; // 没有章 / 节的时候不显示这条折叠条
    updateSegPickButtons(task);
    if (!segs.length) {
      // 说明走 title（程序自己的悬浮气泡）：以前那个 .hint-pop 会被面板裁掉
      box.innerHTML = `<p class="file-empty">没有识别到章节标题，将按文档逐个分析（顺序即文件列表顺序）。<span class="inline-help" tabindex="0" title="文件就是一整章时，让文件名带上章节名即可；识别章节时会用它当章节名。">？</span></p>`;
      return;
    }
    box.innerHTML = segs
      .map((s) => {
        const f = (task.files || []).find((x) => x.id === s.fileId);
        const isSection = s.level === "section";
        const isMerge = s.level === "merge";
        return `<div class="segment-item ${isMerge ? "is-merge" : isSection ? "is-section" : "is-chapter"}" data-seg-id="${esc(s.id)}">
          <input type="checkbox" class="seg-include" ${s.included === false ? "" : "checked"} title="参与分析" />
          <select class="seg-level" title="这一段是「章」还是「节」（节挂在上面那一章下）；识别错了就选「并入上一段」。">
            <option value="chapter" ${isSection || isMerge ? "" : "selected"}>章</option>
            <option value="section" ${isSection ? "selected" : ""}>节</option>
            <option value="merge" ${isMerge ? "selected" : ""}>并入上一段</option>
          </select>
          <input type="text" class="seg-label" value="${esc(s.label)}" />
          ${
            isMerge
              ? `<span class="seg-status merged" title="这段文字会接到上一段末尾，和上一段一起分析，不会单独成章 / 节">并入上一段</span>`
              : `${progressHtml(s.id, s, s.label)}<span class="seg-status ${unitAnalysisState(s)}" title="${esc(
                  s.lastError || ""
                )}">${SEG_STATE_LABEL[unitAnalysisState(s)]}</span>`
          }
          <span class="seg-meta">${esc(f ? f.name : "")} · ${s.end - s.start} 字</span>
          ${
            !isMerge && (s.failChunks || []).length
              ? `<button class="icon-btn seg-retry" data-agent="hard" title="只重新分析这一段，其余章 / 节不会重跑">重跑</button>`
              : ""
          }
          <button class="icon-btn seg-del" title="删除">×</button>
        </div>`;
      })
      .join("");
    box.querySelectorAll(".seg-include").forEach((cb) =>
      cb.addEventListener("change", () => {
        const s = segs.find((x) => x.id === cb.closest(".segment-item").dataset.segId);
        if (s) {
          const wasMerge = s.level === "merge";
          s.included = cb.checked;
          /* 勾 / 取消「章」时，这条章下面的「节」一起跟着变（用户 2026-10-17：
             「开始分析」应该只分析被勾选的章节 —— 只勾章、节还勾着的话会被误解）。 */
          if (segLevelOf(s) === "chapter") {
            let inChapter = false;
            fileSegments(task, s.fileId).forEach((x) => {
              if (x.id === s.id) {
                inChapter = true;
                return;
              }
              if (!inChapter) return;
              if (segLevelOf(x) === "chapter") {
                inChapter = false;
                return;
              }
              x.included = cb.checked;
            });
          }
          if (wasMerge) invalidateSegmentAnalysis(hostSegmentBefore(task, s));
          saveState();
          if (segLevelOf(s) === "chapter") renderSegments(task);
        }
      })
    );
    box.querySelectorAll(".seg-label").forEach((inp) =>
      inp.addEventListener("change", () => {
        const s = segs.find((x) => x.id === inp.closest(".segment-item").dataset.segId);
        if (s) {
          s.label = inp.value.trim() || "未分章";
          s.labelEdited = true; // 手动改过标题的分段，之后重新识别时不再覆盖
          saveState();
        }
      })
    );
    box.querySelectorAll(".seg-level").forEach((sel) =>
      sel.addEventListener("change", () => {
        const s = segs.find((x) => x.id === sel.closest(".segment-item").dataset.segId);
        if (!s) return;
        const wasMerge = s.level === "merge";
        let nextLevel = sel.value === "section" ? "section" : sel.value === "merge" ? "merge" : "chapter";
        if (nextLevel === "merge") {
          const prev = fileSegments(task, s.fileId).filter((x) => x.id !== s.id && x.start < s.start).pop();
          if (!prev) {
            showToast("这是这个文件的第一段，前面没有可并入的段落；这段会继续按「章」处理。");
            nextLevel = "chapter";
          }
        }
        s.level = nextLevel;
        s.levelEdited = true;
        if (nextLevel === "merge") invalidateSegmentAnalysis(s);
        // 从「并入」改成独立分段、或从独立分段改成「并入」，都会改变宿主段落的文本
        if (wasMerge || nextLevel === "merge") invalidateSegmentAnalysis(hostSegmentBefore(task, s));
        saveState();
        renderSegments(task);
      })
    );
    box.querySelectorAll(".seg-del").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.closest(".segment-item").dataset.segId;
        const seg = (task.segments || []).find((x) => x.id === id);
        if (seg) invalidateSegmentAnalysis(hostSegmentBefore(task, seg));
        task.segments = (task.segments || []).filter((x) => x.id !== id);
        saveState();
        renderSegments(task);
        renderTaskList();
      })
    );
    box.querySelectorAll(".seg-retry").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.closest(".segment-item").dataset.segId;
        analyzeTask("retry", { ids: new Set([id]) });
      })
    );
  }

  // 删除分析结果里的若干条（可撤销）：只动结果列表，不影响已经填进人物 / 事件 / 设定的内容
  function deleteAnalysisResults(task, idxs) {
    if (!task) return;
    const set = new Set((idxs || []).filter((i) => Number.isFinite(i)));
    if (!set.size) return;
    pendingUndoLabel = `删除 ${set.size} 条分析结果`;
    task.results = (task.results || []).filter((r, i) => !set.has(i));
    task.updatedAt = Date.now();
    saveState();
    renderTaskList();
    renderResultReview(task);
    showToast(`已删除 ${set.size} 条分析结果，可用「撤销」还原`);
  }

  /* ---------- 结果分栏：事件按「章 → 节」、设定条目按「设定类别」、人物关系按「关系种类」 ---------- */
  // 分栏折叠状态：只记内存（刷新回到展开），按任务 + 选项卡 + 分栏键存
  function resultGroupFoldedKey(task, type, key) {
    return `${(task && task.id) || ""}|${type}|${key}`;
  }
  function resultGroupIsFolded(task, type, key) {
    return !!resultGroupFolded[resultGroupFoldedKey(task, type, key)];
  }
  function setResultGroupFolded(task, type, key, folded) {
    const k = resultGroupFoldedKey(task, type, key);
    if (folded) resultGroupFolded[k] = true;
    else delete resultGroupFolded[k];
  }

  // 一条「事件」结果属于哪一章 / 哪一节：优先按现存章 / 节匹配，其次按出处的「章 · 节」，都没有就「未分章」
  function eventResultGroupOf(r) {
    const src = String(r.source || "").trim();
    const parts = src
      .split("·")
      .map((s) => s.trim())
      .filter(Boolean);
    let chLabel = parts.length >= 2 ? parts[0] : parts[0] || "";
    let secLabel = parts.length >= 2 ? parts[1] : "";
    const plc = src ? placeLookup(src, r.fileId) : { chapterId: "", sectionId: "" };
    const ch = plc && plc.chapterId ? getChapter(plc.chapterId) : null;
    const sr = plc && plc.sectionId ? getSection(plc.sectionId) : null;
    const chapterName = ch ? ch.title : chLabel || uiTextFor("未分章");
    const sectionName = sr ? sr.section.title : ch ? secLabel : "";
    return {
      chapterKey: ch ? ch.id : chLabel || "__none__",
      chapterName,
      sectionKey: sr ? sr.section.id : sectionName || "",
      sectionName,
    };
  }
  function settingResultGroupOf(r) {
    const cat = String(r.category || "").trim();
    return { key: cat || "__none__", name: cat || uiTextFor("其他") };
  }
  function relationResultGroupOf(r) {
    const kind = String(fieldValue(r, "类型") || "").trim();
    return { key: kind || "__none__", name: kind || uiTextFor("未指定") };
  }

  // 把当前选项卡的条目分好栏：返回 [{key,name,items,subs?}]（顺序＝正文顺序 / 条数）
  function groupResultItems(type, items) {
    const orderOf = (r, i) => (typeof r.seq === "number" ? r.seq : i);
    if (type === "event") {
      const chMap = new Map();
      items.forEach((r, i) => {
        const g = eventResultGroupOf(r);
        if (!chMap.has(g.chapterKey)) {
          chMap.set(g.chapterKey, { key: g.chapterKey, name: g.chapterName, items: [], subs: new Map(), order: orderOf(r, i) });
        }
        const ch = chMap.get(g.chapterKey);
        ch.order = Math.min(ch.order, orderOf(r, i));
        if (!g.sectionName) {
          ch.items.push(r);
          return;
        }
        if (!ch.subs.has(g.sectionKey)) {
          ch.subs.set(g.sectionKey, { key: g.sectionKey, name: g.sectionName, items: [], order: orderOf(r, i) });
        }
        const sub = ch.subs.get(g.sectionKey);
        sub.order = Math.min(sub.order, orderOf(r, i));
        sub.items.push(r);
      });
      return Array.from(chMap.values())
        .sort((a, b) => a.order - b.order)
        .map((ch) => {
          const subs = Array.from(ch.subs.values()).sort((a, b) => a.order - b.order);
          // 章里根本没有节（例如原文没分节）就别多一层，直接平铺在章下面
          return { key: ch.key, name: ch.name, items: ch.items, subs: subs.length ? subs : null };
        });
    }
    const of = type === "setting" ? settingResultGroupOf : type === "relation" ? relationResultGroupOf : null;
    if (!of) return [{ key: "__all__", name: "", items }];
    const map = new Map();
    items.forEach((r, i) => {
      const g = of(r);
      if (!map.has(g.key))
        map.set(g.key, { key: g.key, name: g.name, items: [], order: Number.MAX_SAFE_INTEGER, first: i });
      const rec = map.get(g.key);
      rec.items.push(r);
      rec.first = Math.min(rec.first, i);
    });
    return Array.from(map.values())
      .sort((a, b) => b.items.length - a.items.length || a.first - b.first)
      .map(({ key, name, items: its }) => ({ key, name, items: its, subs: null }));
  }

  // 一张结果卡片（勾选框 + 名字 + 标签 + 删除）
  function resultItemHtml(r, idx) {
    return `<label class="result-item">
            <input type="checkbox" data-ridx="${esc(idx)}" ${r.included === false ? "" : "checked"} />
            <span class="result-body">
              <span class="result-name">${esc(r.name || "未命名")}</span>
    ${r.applied ? `<span class="tag tag-applied" title="已经填入过；再点「填入设定档案」会按输入保护规则再填一遍">已填入</span>` : ""}
              ${r.type === "relation" ? relationEndpointsTag(r) : ""}
              ${r.category ? `<span class="tag">${esc(r.category)}</span>` : ""}
              ${
                r.source
                  ? `<span class="tag tag-source" title="出处：${esc(sourceWithRow(r.source, r.fileId))}">${esc(
                      sourceWithRow(r.source, r.fileId)
                    )}</span>`
                  : ""
              }
              ${(r.fields || []).filter((f) => f.label || f.value).slice(0, 3).map((f) => `<span class="result-field">${esc(f.label)}：${esc(f.value)}</span>`).join("")}
              ${r.summary ? `<span class="result-summary">${esc(r.summary)}</span>` : ""}
            </span>
            <button type="button" class="icon-btn result-del" data-ridx="${esc(
              idx
            )}" title="从分析结果里删除这一条（可撤销）">×</button>
          </label>`;
  }

  function resultGroupHeadHtml(task, type, key, name, count, depth) {
    const folded = resultGroupIsFolded(task, type, key);
    const pL = uiLanguage() === "en" ? " (" : "（";
    const pR = uiLanguage() === "en" ? ")" : "）";
    return `<div class="result-group-title${depth ? " sub" : ""}" data-group-key="${esc(key)}" data-group-depth="${
      depth || 0
    }" title="${folded ? "展开" : "折叠"}「${esc(name)}」这一栏（只影响显示）">
        <button type="button" class="icon-btn result-group-fold" data-group-key="${esc(key)}" data-group-depth="${
      depth || 0
    }" title="${folded ? "展开" : "折叠"}这一栏">${folded ? "▶" : "▼"}</button>
        <span class="result-group-name">${esc(name)}${pL}${count}${pR}</span>
      </div>`;
  }

  // 当前选项卡的条目 HTML：人物平铺，其它按分栏（事件多一层「章 → 节」）
  function resultTabItemsHtml(task, type, items, results) {
    const idxOf = (r) => results.indexOf(r);
    const grouped = groupResultItems(type, items);
    if (grouped.length === 1 && !grouped[0].name) {
      return `<div class="result-group-items">${items.map((r) => resultItemHtml(r, idxOf(r))).join("")}</div>`;
    }
    return grouped
      .map((g) => {
        const folded = resultGroupIsFolded(task, type, g.key);
        const total = g.items.length + (g.subs || []).reduce((n, s) => n + s.items.length, 0);
        let body = "";
        if (!folded) {
          const own = g.items.length ? `<div class="result-group-items">${g.items.map((r) => resultItemHtml(r, idxOf(r))).join("")}</div>` : "";
          const subs = (g.subs || [])
            .map((s) => {
              const sFolded = resultGroupIsFolded(task, type, g.key + "|" + s.key);
              return `<div class="result-group sub">${resultGroupHeadHtml(task, type, g.key + "|" + s.key, s.name, s.items.length, 1)}${
                sFolded ? "" : `<div class="result-group-items">${s.items.map((r) => resultItemHtml(r, idxOf(r))).join("")}</div>`
              }</div>`;
            })
            .join("");
          body = own + (subs ? `<div class="result-subgroups">${subs}</div>` : "");
        }
        return `<div class="result-group${g.subs && g.subs.length ? " has-subs" : ""}">${resultGroupHeadHtml(
          task,
          type,
          g.key,
          g.name,
          total,
          0
        )}${body}</div>`;
      })
      .join("");
  }

  function renderResultReview(task) {
    // 说明：当前选中哪个选项卡只记在内存里（刷新回到默认），不写进任务数据，免得污染版本历史
    const box = $("#result-review");
    const results = task.results || [];
    if (resultManualMerge && resultManualMerge.task && resultManualMerge.task.id !== task.id) resultManualMerge = null;
    resultViewTaskId = task.id;
    if (!results.length) {
      box.innerHTML = `<p class="result-empty">分析结果会显示在这里。导入文件后点击「开始分析」。</p>`;
      return;
    }
    /* 结果区按选项卡分栏：人物 / 事件 / 设定条目 / 人物关系。
       「身份合并」记录不再单独显示（它照旧参与「填入设定档案」的身份合并判断，只是不占一栏）。 */
    const groups = { character: "人物", event: "事件", setting: "设定条目", relation: "人物关系" };
    const groupOrder = Object.keys(groups);
    // 换任务时把搜索词清掉，免得以为是没数据
    if (resultSearchTask !== task.id) {
      resultSearchTask = task.id;
      resultSearch = "";
    }
    const kw = String(resultSearch || "").trim().toLowerCase();
    const thin = thinFilterFor(task);
    const shown = filterResultList(results, kw, thin);
    // 当前选中的选项卡：每个任务各记一份；没选过就落在第一个有结果的栏（都没有就落在人物）
    let activeType = resultTabView[task.id] || "";
    if (groupOrder.indexOf(activeType) < 0) activeType = "";
    if (!activeType) activeType = groupOrder.find((t) => shown.some((r) => r.type === t)) || groupOrder[0];
    resultTabView[task.id] = activeType;
    // 头部只在第一次建，之后只更新里面的文字 / 勾选状态：
    // 搜索框要是每次输入都被重建，中文输入法会完全打不进字
    /* 头部按功能分四组排：① 结果数 + 搜索　② 过滤　③ 勾选 / 显示　④ 标记 → 删除 / 填入。
       组间用一条细竖线分开，比原来一堆按钮平铺好读。 */
    const headHtml = `<div class="result-head" id="result-head-bar">
      <span class="rh-group rh-info">
        <span id="result-count-label"></span>
        <span class="result-search-wrap">
          <input type="text" id="result-search" placeholder="搜索名字 / 标题…" />
        </span>
      </span>
      <span class="rh-group rh-filter">
        <label class="thin-filter" title="勾上后：正文提及不足阈值的人物 / 设定不会填入（阈值可改）。">
          <input type="checkbox" id="fill-thin-filter" ${fillOpts.filterThin ? "checked" : ""} />
          过滤阈值
        </label>
        <span class="thin-filter-threshold" title="过滤阈值：正文提及不足这么多字的当作「只提了一句」过滤掉">
          :
          <input type="number" id="fill-thin-threshold" min="0" max="5000" step="10" value="${thinThreshold()}" ${
            fillOpts.filterThin ? "" : "disabled"
          } />
          字
        </span>
      </span>
      <span class="rh-group rh-pick">
        <label class="result-tab-all" title="${esc(
          uiTextFor("勾上＝把这一栏当前显示的结果全部勾选；取消＝全部不勾")
        )}"><input type="checkbox" id="result-tab-all-cb" />${esc(uiTextFor("本栏全选"))}</label>
        <button class="btn btn-sm" id="result-check-all" title="全选当前显示的结果；再点全不选（藏起的不选）">全选</button>
        <button class="btn btn-sm" id="result-only-unfilled" title="只看还没填进人物 / 事件 / 设定的结果（再点一下取消）">仅显示未填入</button>
      </span>
      <span class="rh-group rh-mark">
        <button class="btn btn-sm" id="result-mark-unfilled" title="去掉「已填入」标记（只作提示，不影响填入）">标为未填入</button>
        <button class="btn btn-sm" id="result-mark-filled" title="打上「已填入」标记（只作提示，不影响填入）">标为已填入</button>
      </span>
      <span class="rh-group rh-end">
        <button class="btn btn-sm" id="result-delete-selected" title="删除所有勾选的分析结果（可撤销）">删除选中</button>
        <button class="btn btn-sm" id="result-auto-merge" title="${esc(
          uiTextFor("按名字合并重复的人物 / 设定 / 关系，并保留各段的原文位置")
        )}">${esc(uiTextFor("合并同一条目"))}</button>
      </span>
    </div>`;
    const activeItems = shown.filter((r) => r.type === activeType);
    const allOn = activeItems.length > 0 && activeItems.every((r) => r.included !== false);
    const someOn = activeItems.some((r) => r.included !== false);
    // 条数的括号跟着界面语言：英文用半角（前面空一格），中日用全角
    const pL = uiLanguage() === "en" ? " (" : "（";
    const pR = uiLanguage() === "en" ? ")" : "）";
    // 选项卡条：每一栏显示「选中 / 本栏条数」（当前筛选之下）
    const tabsHtml =
      `<div class="view-tabs result-tabs" id="result-tabs">` +
      groupOrder
        .map((type) => {
          const mine = shown.filter((r) => r.type === type);
          const picked = mine.filter((r) => r.included !== false).length;
          return `<button type="button" class="view-tab result-tab${type === activeType ? " current" : ""}" data-type="${type}" title="${esc(
            uiTextFor("切换这一栏")
          )}">${esc(groups[type])}<span class="result-tab-num">${pL}${picked}/${mine.length}${pR}</span></button>`;
        })
        .join("") +
      `</div>`;
    const panelHtml = activeItems.length
      ? `<div class="result-tab-panel">${resultTabItemsHtml(task, activeType, activeItems, results)}</div>`
      : `<p class="result-empty">${esc(uiTextFor("这一栏没有符合条件的结果。"))}</p>`;
    const groupHtml = tabsHtml + panelHtml;
    const manualBarHtml = `<div class="result-manual-bar" id="result-manual-bar" hidden>
      <span id="result-manual-count"></span>
      <span class="spacer"></span>
      <button type="button" class="btn btn-sm btn-primary" id="result-manual-ok">确定</button>
      <button type="button" class="btn btn-sm" id="result-manual-cancel">取消</button>
    </div>`;
    // 头部（含搜索框、过滤开关、全选 / 全不选 / 删除 / 填入）建一次就够，之后只更新内容
    if (!box.querySelector("#result-head-bar")) {
      box.innerHTML = headHtml + manualBarHtml + `<div class="result-groups" id="result-groups"></div>`;
      bindResultHeadBar();
    }
    updateResultHeadBar(results, shown, kw);
    const groupsWrap = box.querySelector("#result-groups");
    if (groupsWrap) {
      // 勾选结果也会重画列表：保留滚动位置，别让列表上下跳
      const keepTop = groupsWrap.scrollTop;
      groupsWrap.innerHTML = groupHtml;
      if (keepTop && groupsWrap.scrollTop !== keepTop) groupsWrap.scrollTop = keepTop;
    }
    renderManualMergeBar(task);

    box.querySelectorAll(".result-item input[type=checkbox]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const r = results[parseInt(cb.dataset.ridx, 10)];
        if (resultManualMerge && resultManualMerge.task && resultManualMerge.task.id === task.id) {
          toggleManualResult(parseInt(cb.dataset.ridx, 10), {});
          return;
        }
        if (r) {
          r.included = cb.checked;
          // 重新勾上 = 允许再填一次（之前可能已经填过）
          r.applied = false;
          saveState();
          renderResultReview(task);
        }
      })
    );
    // 结果卡片：Shift＝连选区间、Ctrl/Cmd＝单独加减勾选（都只改勾选，不动「已填入」）
    box.querySelectorAll(".result-item").forEach((el) => {
      const cb = el.querySelector("input[type=checkbox]");
      if (!cb) return;
      const ridx = parseInt(cb.dataset.ridx, 10);
      el.addEventListener("click", (ev) => {
        if (ev.target.closest("input, button")) return;
        if (resultManualMerge && resultManualMerge.task && resultManualMerge.task.id === task.id) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleManualResult(ridx, ev);
          return;
        }
        if (ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          shiftClickCard(
            "result",
            ridx,
            visibleResultIdxForShortcut(),
            new Set(checkedResultIdx()),
            ev.ctrlKey || ev.metaKey
          );
        } else if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleClickCard("result", ridx, new Set(checkedResultIdx()));
          const r = results[ridx];
          if (r && r.included) r.applied = false; // 手动重新勾上 = 允许再填一次
          const t = resultViewTask();
          if (t) {
            saveState();
            renderResultReview(t);
          }
        } else {
          markShortcutAnchor("result", ridx);
        }
      });
    });
    // 切换选项卡（只影响显示，内容不动）
    box.querySelectorAll(".result-tab").forEach((b) =>
      b.addEventListener("click", () => {
        const type = b.dataset.type;
        const hadManual = !!(resultManualMerge && resultManualMerge.task && resultManualMerge.task.id === task.id);
        if (hadManual) resultManualMerge = null;
        if (!type || type === resultTabView[task.id]) {
          if (hadManual) renderResultReview(task);
          return;
        }
        resultTabView[task.id] = type;
        renderResultReview(task);
      })
    );
    // 分栏折叠 / 展开（只影响显示，刷新回到展开）
    box.querySelectorAll(".result-group-fold").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = b.dataset.groupKey;
        if (!key) return;
        const type = resultTabView[task.id] || activeType;
        setResultGroupFolded(task, type, key, !resultGroupIsFolded(task, type, key));
        renderResultReview(task);
      })
    );
    // 点分栏标题横条也能折叠 / 展开
    box.querySelectorAll(".result-group-title").forEach((el) =>
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".result-group-fold")) return;
        const key = el.dataset.groupKey;
        if (!key) return;
        const type = resultTabView[task.id] || activeType;
        setResultGroupFolded(task, type, key, !resultGroupIsFolded(task, type, key));
        renderResultReview(task);
      })
    );
    // 「本栏全选」在头部（跟着「全选」按钮）：这里只同步它的勾选 / 半选状态；
    // change 事件在 bindResultHeadBar 里只绑一次（它现在不随每栏重画而重建）。
    const tabAll = box.querySelector("#result-tab-all-cb");
    if (tabAll) {
      tabAll.checked = allOn;
      tabAll.indeterminate = someOn && !allOn; // 只勾了一部分 → 半选
    }
    // 单条删除
    box.querySelectorAll(".result-del").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        deleteAnalysisResults(task, [parseInt(b.dataset.ridx, 10)]);
      })
    );
    // （搜索框、全选 / 全不选、删除选中、填入、过滤开关的绑定在 bindResultHeadBar 里，只绑一次）
  }

  // 当前结果区显示的是哪个任务（换任务时以它为准）
  function resultViewTask() {
    const t = (state.analysis.tasks || []).find((x) => x.id === resultViewTaskId);
    return t || getSelectedTask();
  }

  // 一条「人物关系」记录的两端人物名字
  function relationEndpointsOf(r) {
    const a = String(fieldValue(r, "人物A") || fieldValue(r, "人物1") || fieldValue(r, "甲") || "").trim();
    const b = String(fieldValue(r, "人物B") || fieldValue(r, "人物2") || fieldValue(r, "乙") || "").trim();
    return { a, b };
  }

  // 关系卡片上的小标签：这条关系的两端人物，人物库里是不是已经有了
  function relationEndpointsTag(r) {
    const { a, b } = relationEndpointsOf(r);
    if (!a || !b) {
      return `<span class="tag tag-warn" title="这条关系没写清两端是谁，填入时会跳过：先建好这两个人再填一次。">⚠ 没写清两端人物</span>`;
    }
    const ca = findCharacterByName(a, []);
    const cb = findCharacterByName(b, []);
    if (ca && cb && ca.id === cb.id) {
      return `<span class="tag tag-warn" title="「${esc(
        a
      )}」和「${esc(b)}」现在指向同一个人物，这条关系会被跳过。给其中一方加个「别名」区分，或者把名字改对，再点一次「填入设定档案」。">⚠ 两端是同一个人</span>`;
    }
    const miss = [!ca ? a : "", !cb ? b : ""].filter(Boolean);
    if (miss.length) {
      return `<span class="tag tag-warn" title="人物库里还没有「${esc(
        miss.join("」「")
      )}」，这条关系填入时会被跳过。先把人建好（或让对应的人物结果一起填入），再点一次「填入设定档案」。">⚠ 还缺「${esc(
        miss.join("」「")
      )}」</span>`;
    }
    return `<span class="tag tag-ok" title="两端人物都在人物库里，点「填入设定档案」就能连出这条线">✓ 两端人物已有</span>`;
  }

  // 一条分析结果是否命中搜索词（只匹配标题 / 名字）
  function resultMatches(r, kw) {
    if (!kw) return true;
    const hay = String(r.name || "").toLowerCase();
    return hay.indexOf(kw) >= 0;
  }

  /* 结果区的「自动合并」：先按归一化名字把重复条目并成一条，再触发后处理。
     合并用 mergeResultRecords（比工作区合并多保留 fileId / segId / sourceRefs / seq），
     以后回原文核对、雷达依据和填入时都还能找到各段出处。 */
  function resultDuplicateGroups(task) {
    const exact = new Map();
    const keyOfName = (s) => normNameKey(s).replace(/·/g, "");
    ((task && task.results) || []).forEach((r) => {
      if (!r || !r.type || !r.name || r.type === "event") return;
      if (r.type === "relation") {
        const { a, b } = relationEndpointsOf(r);
        if (a && b) {
          const rawKind = fieldValue(r, "类型") || "";
          const label = fieldValue(r, "关系") || r.name || "";
          const kind =
            typeof pickRelKind === "function" ? pickRelKind(rawKind, label) : rawKind || label;
          const pair = [keyOfName(a), keyOfName(b)].sort().join("|");
          const key = "relation|" + pair + "|" + normNameKey(kind).replace(/·/g, "");
          if (!exact.has(key)) exact.set(key, []);
          exact.get(key).push(r);
          return;
        }
      }
      const cat = r.type === "setting" ? "|" + String(r.category || "").trim() : "";
      // 名字只差空格 / 各种间隔点时也算同一组（「甲·普利西法」vs「甲 普利西法」）
      const key = r.type + cat + "|" + keyOfName(r.name);
      if (!exact.has(key)) exact.set(key, []);
      exact.get(key).push(r);
    });
    // 「爱丽丝」⊂「爱丽丝·彼得堡」：短名后面紧跟间隔符 / 空格时，视为同一人的简称；
    // 不把「张三 / 张三丰」这种单段名字的前缀关系误合并。
    const shortOf = (a, b) => {
      const x = foldVariant(String(a || "")).toLowerCase().replace(/\s+/g, " ").trim();
      const y = foldVariant(String(b || "")).toLowerCase().replace(/\s+/g, " ").trim();
      if (!x || !y || x === y || x.length < 2) return false;
      const [s, l] = x.length <= y.length ? [x, y] : [y, x];
      return l.startsWith(s) && /^[\s·•・.\-—,，、:：]/.test(l.slice(s.length));
    };
    const merged = [];
    Array.from(exact.values()).forEach((g) => {
      const hit = merged.find((h) => {
        if (h[0].type !== g[0].type) return false;
        if (g[0].type === "relation" || h[0].type === "relation") return false;
        if (g[0].type === "setting" && String(h[0].category || "") !== String(g[0].category || "")) return false;
        return h.some((a) => g.some((b) => shortOf(a.name, b.name)));
      });
      if (hit) hit.push(...g);
      else merged.push(g.slice());
    });
    /* 别名字段也是同一人的证据：A 的「别名」里有 b，就能和名为 b 的条目并成一组。
       只做同类型 / 同设定类别的连接，避免把不同种类的东西串起来。 */
    const nameKey = (s) => normNameKey(s).replace(/·/g, "");
    const aliasesOf = (r) => {
      const out = [];
      try {
        if (typeof nameAliasesOf === "function") out.push(...nameAliasesOf(r));
      } catch (e) {
        /* ignore */
      }
      if (Array.isArray(r && r.aliases)) out.push(...r.aliases);
      return out.map((x) => String(x || "").trim()).filter(Boolean);
    };
    const strongAliasKeys = (r) =>
      aliasesOf(r)
        .filter((raw) => {
          const a = String(raw || "").trim();
          // 「假冒的 A」「A 的替身」「fake A」是描述 / 冒充关系，不是同一人的别名
          if (/假冒|假扮|冒充|冒牌|伪装|复制体|克隆体|替身|影武者|自称|所谓/.test(a)) return false;
          if (/的/.test(a) && String(r.name || "").trim() && a.includes(String(r.name || "").trim())) return false;
          if (/^(?:fake|false|impostor|imposter|another|copy|clone|evil|dark|alternate)\b/i.test(a)) return false;
          return true;
        })
        .map(nameKey)
        .filter((k) => {
          if (!k || k.length < 2) return false; // 单字 / 单字母别名不作为连接证据
          if (/^[a-z]{1,2}$/i.test(k)) return false; // 两字母缩写也不够具体
          try {
            if (typeof isTooGenericAlias === "function" && isTooGenericAlias(k)) return false;
          } catch (e) {
            /* ignore */
          }
          return true;
        });
    const keysOf = (g) => {
      const set = new Set();
      g.forEach((r) => {
        if (r && r.name) set.add(nameKey(r.name));
        strongAliasKeys(r).forEach((k) => set.add(k));
      });
      return set;
    };
    const clusters = merged.map((g) => ({ g: g.slice(), keys: keysOf(g) }));
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < clusters.length && !changed; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = clusters[i];
          const b = clusters[j];
          if (a.g[0].type !== b.g[0].type) continue;
          if (a.g[0].type === "relation") continue;
          if (
            a.g[0].type === "setting" &&
            String(a.g[0].category || "") !== String(b.g[0].category || "")
          )
            continue;
          const hit = Array.from(b.keys).some((k) => a.keys.has(k));
          if (!hit) continue;
          a.g.push(...b.g);
          b.keys.forEach((k) => a.keys.add(k));
          clusters.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
    return clusters.map((x) => x.g).filter((g) => g.length > 1);
  }

  function manualModeFor(task) {
    return resultManualMerge && resultManualMerge.task && resultManualMerge.task.id === task.id
      ? resultManualMerge
      : null;
  }

  function manualCompatibleIdx(task, mode, refIdx) {
    const ref = refIdx != null ? (task.results || [])[refIdx] : null;
    const cat = ref && ref.type === "setting" ? String(ref.category || "") : null;
    return visibleResultIdxForShortcut().filter((i) => {
      const r = (task.results || [])[i];
      if (!r || r.type !== mode.type) return false;
      if (cat != null && r.type === "setting" && String(r.category || "") !== cat) return false;
      return true;
    });
  }

  function renderManualMergeBar(task) {
    const box = $("#result-review");
    const bar = $("#result-manual-bar");
    const mode = manualModeFor(task);
    if (box) box.classList.toggle("manual-merge-mode", !!mode);
    if (bar) bar.hidden = !mode;
    if (mode) {
      const count = $("#result-manual-count");
      if (count) count.textContent = uiTextFor("已选 N 条").replace("N", mode.selected.size);
    }
    if (!box) return;
    box.querySelectorAll(".result-item").forEach((el) => {
      const cb = el.querySelector("input[type=checkbox]");
      const idx = cb ? parseInt(cb.dataset.ridx, 10) : -1;
      const on = !!(mode && mode.selected.has(idx));
      el.classList.toggle("manual-selected", on);
      if (cb && mode) cb.checked = on;
    });
  }

  function startResultManualMerge(task, type) {
    if (!task) return;
    closeModal("result-merge-modal");
    resultManualMerge = { task, type, selected: new Set(), anchor: null };
    resultTabView[task.id] = type;
    renderResultReview(task);
    showToast(uiTextFor("手动选择要合并的条目：Ctrl / Shift 多选，Enter 确定，Esc 取消。"));
  }

  function cancelResultManualMerge() {
    const mode = resultManualMerge;
    if (!mode) return;
    resultManualMerge = null;
    renderResultReview(mode.task);
  }

  function toggleManualResult(idx, ev) {
    const mode = resultManualMerge;
    if (!mode) return;
    const task = mode.task;
    const r = (task.results || [])[idx];
    if (!r || r.type !== mode.type) return;
    if (ev && ev.shiftKey && mode.anchor != null) {
      const list = manualCompatibleIdx(task, mode, mode.anchor);
      const a = list.indexOf(mode.anchor);
      const b = list.indexOf(idx);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) mode.selected.add(list[i]);
      }
    } else {
      if (mode.selected.has(idx)) mode.selected.delete(idx);
      else mode.selected.add(idx);
      mode.anchor = idx;
    }
    renderResultReview(task);
  }

  function selectAllManualMerge() {
    const mode = resultManualMerge;
    if (!mode) return;
    let ref = mode.selected.size ? mode.selected.values().next().value : null;
    if (ref == null && mode.type === "setting") {
      const list0 = manualCompatibleIdx(mode.task, mode, null);
      ref = list0.length ? list0[0] : null;
    }
    const list = manualCompatibleIdx(mode.task, mode, ref);
    const allOn = list.length && list.every((i) => mode.selected.has(i));
    list.forEach((i) => {
      if (allOn) mode.selected.delete(i);
      else mode.selected.add(i);
    });
    renderResultReview(mode.task);
  }

  /* 人物结果合并后，关系结果里的两端名字同步到保留的主名。
     这样结果卡片不会先显示“缺人物”，填入时也不会把关系落到旧名字上。 */
  function rewriteRelationEndpoints(task, nameMap) {
    if (!task || !nameMap || !nameMap.size) return;
    const labels = ["人物A", "人物B", "人物1", "人物2", "甲", "乙"];
    (task.results || []).forEach((r) => {
      if (!r || r.type !== "relation") return;
      (r.fields || []).forEach((f) => {
        const label = String((f && f.label) || "").trim();
        if (labels.indexOf(label) < 0) return;
        const key = normNameKey(f.value).replace(/·/g, "");
        if (nameMap.has(key)) f.value = nameMap.get(key);
      });
    });
  }

  function addMergedResultNames(nameMap, r, targetName) {
    if (!nameMap || !r || !targetName) return;
    const add = (n) => {
      const k = normNameKey(n).replace(/·/g, "");
      if (k) nameMap.set(k, targetName);
    };
    add(r.name);
    if (Array.isArray(r.aliases)) r.aliases.forEach(add);
    try {
      if (typeof nameAliasesOf === "function") nameAliasesOf(r).forEach(add);
    } catch (e) {
      /* ignore */
    }
  }

  function confirmResultManualMerge() {
    const mode = resultManualMerge;
    if (!mode) return;
    const task = mode.task;
    const picked = Array.from(mode.selected)
      .map((i) => ({ r: (task.results || [])[i], i }))
      .filter((x) => x.r);
    if (picked.length < 2) {
      showToast(uiTextFor("请至少选择两条要合并的重复项。"));
      return;
    }
    const first = picked[0].r;
    if (
      picked.some(
        (x) =>
          x.r.type !== first.type ||
          (first.type === "setting" && String(x.r.category || "") !== String(first.category || ""))
      )
    ) {
      showToast(uiTextFor("只能合并同一类别、同一种类型的条目。"));
      return;
    }
    const sorted = picked
      .map((x) => x.r)
      .sort(
        (a, b) =>
          (Number(b.mergedFrom) || 1) - (Number(a.mergedFrom) || 1) ||
          String((b.fields || []).map((f) => f.value).join("")).length -
            String((a.fields || []).map((f) => f.value).join("")).length
      );
    const keep = sorted[0];
    let next = keep;
    const nameMap = new Map();
    sorted.slice(1).forEach((r) => {
      next = mergeResultRecords(next, r);
      addMergedResultNames(nameMap, r, next.name);
    });
    next.pp = {};
    const indexes = picked
      .map((x) => x.i)
      .filter((i, pos, arr) => arr.indexOf(i) === pos)
      .sort((a, b) => b - a);
    const insertAt = Math.min.apply(null, indexes);
    indexes.forEach((i) => task.results.splice(i, 1));
    task.results.splice(insertAt, 0, next);
    addMergedResultNames(nameMap, next, next && next.name);
    rewriteRelationEndpoints(task, nameMap);
    pendingUndoLabel = "手动合并分析结果";
    resultManualMerge = null;
    saveState();
    renderResultReview(task);
    showToast(uiTextFor("已手动合并 M 条重复结果").replace("M", picked.length));
  }

  document.addEventListener(
    "keydown",
    (ev) => {
      if (!resultManualMerge) return;
      const tag = String((ev.target && ev.target.tagName) || "").toUpperCase();
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (ev.target && ev.target.isContentEditable);
      if (typing) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        cancelResultManualMerge();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        confirmResultManualMerge();
      } else if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === "a") {
        ev.preventDefault();
        ev.stopPropagation();
        selectAllManualMerge();
      }
    },
    true
  );

  const RESULT_MERGE_TYPES = [
    ["character", "人物"],
    ["setting", "设定条目"],
    ["relation", "人物关系"],
  ];

  function openResultMergeDialog() {
    const task = resultViewTask();
    if (!task) return;
    if (!(task.results || []).length) {
      showToast(uiTextFor("这个任务还没有分析结果。"));
      return;
    }
    const groups = resultDuplicateGroups(task);
    if (!groups.length) {
      /* 没有可自动归组的重复项时，直接进手动多选（用户 2026-10-17 要求）：
         先跟着当前结果选项卡；选项卡是事件之类不能合并的，就挑第一个有结果的可合并类型。 */
      const results = task.results || [];
      const hasMergeable = RESULT_MERGE_TYPES.some(([t]) => results.some((r) => r && r.type === t));
      if (!hasMergeable) {
        showToast(uiTextFor("没有发现可自动合并的重复条目。"));
        return;
      }
      const order = [resultTabView[task.id], "character", "setting", "relation"].filter(Boolean);
      let type = "character";
      for (const t of order) {
        if (
          RESULT_MERGE_TYPES.some(([k]) => k === t) &&
          results.some((r) => r && r.type === t)
        ) {
          type = t;
          break;
        }
      }
      startResultManualMerge(task, type);
      return;
    }
    resultMergeTask = task;
    resultMergeGroups = groups;
    resultMergeSelected = new Set(groups);
    resultMergeExcluded = new Map(groups.map((g) => [g, new Set()]));
    resultMergeTab = groups[0][0].type || "character";
    const title = $("#result-merge-title");
    if (title) title.textContent = uiTextFor("合并同一条目");
    renderResultMergeDialog();
    openModal("result-merge-modal");
    const allBtn = $("#result-merge-all");
    if (allBtn && !allBtn.__bound) {
      allBtn.__bound = true;
      allBtn.addEventListener("click", () => {
        const mine = resultMergeGroups.filter((g) => g[0] && g[0].type === resultMergeTab);
        const allOn = mine.length && mine.every((g) => resultMergeSelected.has(g));
        mine.forEach((g) => {
          if (allOn) resultMergeSelected.delete(g);
          else resultMergeSelected.add(g);
        });
        renderResultMergeDialog();
      });
    }
    const confirmBtn = $("#result-merge-confirm");
    if (confirmBtn && !confirmBtn.__bound) {
      confirmBtn.__bound = true;
      confirmBtn.addEventListener("click", mergeSelectedResultGroups);
    }
    const manualBtn = $("#result-merge-manual");
    if (manualBtn && !manualBtn.__bound) {
      manualBtn.__bound = true;
      manualBtn.addEventListener("click", () => {
        if (resultMergeTask) startResultManualMerge(resultMergeTask, resultMergeTab);
      });
    }
  }

  function renderResultMergeDialog() {
    const task = resultMergeTask;
    if (!task) return;
    const tabs = $("#result-merge-tabs");
    if (tabs) {
      tabs.innerHTML = RESULT_MERGE_TYPES.map(([type, key]) => {
        const n = resultMergeGroups.filter((g) => g[0] && g[0].type === type).length;
        return `<button type="button" class="view-tab result-merge-tab${
          type === resultMergeTab ? " current" : ""
        }" data-type="${type}">${esc(uiTextFor(key))}<span class="result-tab-num">（${n}）</span></button>`;
      }).join("");
    }
    const list = $("#result-merge-list");
    if (!list) return;
    const rows = [];
    resultMergeGroups.forEach((g, gi) => {
      if (!g[0] || g[0].type !== resultMergeTab) return;
      const excluded = resultMergeExcluded.get(g) || new Set();
      const active = g.filter((r) => !excluded.has(r));
      const canMerge = active.length >= 2;
      const cat = g[0].type === "setting" && g[0].category ? ` · ${g[0].category}` : "";
      rows.push(`<div class="merge-item" data-gi="${gi}">
        <input type="checkbox" class="merge-item-cb" data-gi="${gi}" ${
          resultMergeSelected.has(g) && canMerge ? "checked" : ""
        } ${canMerge ? "" : "disabled"} />
        <span class="merge-body">
          <span class="merge-keep"><span class="merge-picks">${g
            .map(
              (r, mi) =>
                `<span class="merge-pick ${excluded.has(r) ? "off" : ""}" data-gi="${gi}" data-mi="${mi}">${esc(
                  String(r.name || "").trim()
                )}</span>`
            )
            .join("")}</span></span>
          <span class="merge-drop">${active.length} 条${esc(cat)} · ${esc(
            canMerge ? uiTextFor("合并后保留一条，其余名字进别名") : uiTextFor("至少保留两条才能合并")
          )}</span>
        </span>
      </div>`);
    });
    list.innerHTML = rows.length
      ? rows.join("")
      : `<p class="result-empty">${esc(uiTextFor("这一栏没有可合并的重复项。"))}</p>`;
    const allBtn = $("#result-merge-all");
    if (allBtn) {
      const mine = resultMergeGroups.filter((g) => g[0] && g[0].type === resultMergeTab);
      allBtn.textContent =
        mine.length && mine.every((g) => resultMergeSelected.has(g)) ? uiTextFor("取消全选") : uiTextFor("全选");
    }
    if (!tabs || !tabs.__bound) {
      if (tabs)
        tabs.addEventListener("click", (ev) => {
          const b = ev.target.closest && ev.target.closest("[data-type]");
          if (!b) return;
          resultMergeTab = b.dataset.type;
          renderResultMergeDialog();
        });
      if (tabs) tabs.__bound = true;
    }
    list.querySelectorAll(".merge-item-cb").forEach((cb) =>
      cb.addEventListener("change", () => {
        const g = resultMergeGroups[parseInt(cb.dataset.gi, 10)];
        if (!g) return;
        if (cb.checked) resultMergeSelected.add(g);
        else resultMergeSelected.delete(g);
        renderResultMergeDialog();
      })
    );
    list.querySelectorAll(".merge-pick").forEach((pick) =>
      pick.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const gi = parseInt(pick.dataset.gi, 10);
        const mi = parseInt(pick.dataset.mi, 10);
        const g = resultMergeGroups[gi];
        if (!g || !g[mi]) return;
        const excluded = resultMergeExcluded.get(g) || new Set();
        resultMergeExcluded.set(g, excluded);
        if (excluded.has(g[mi])) {
          excluded.delete(g[mi]);
        } else {
          if (g.length - excluded.size <= 2) {
            showToast(uiTextFor("至少保留两条才能合并"));
            return;
          }
          excluded.add(g[mi]);
        }
        renderResultMergeDialog();
      })
    );
  }

  function mergeSelectedResultGroups() {
    const task = resultMergeTask;
    if (!task) return;
    const groups = resultMergeGroups.filter((g) => resultMergeSelected.has(g));
    if (!groups.length) {
      showToast(uiTextFor("请至少勾选一组要合并的重复项。"));
      return;
    }
    let merged = 0;
    const nameMap = new Map();
    pendingUndoLabel = "自动合并分析结果";
    groups.forEach((g) => {
      const excluded = resultMergeExcluded.get(g) || new Set();
      const active = g.filter((r) => !excluded.has(r));
      if (active.length < 2) return;
      const sorted = active
        .slice()
        .sort(
          (a, b) =>
            (Number(b.mergedFrom) || 1) - (Number(a.mergedFrom) || 1) ||
            String((b.fields || []).map((f) => f.value).join("")).length -
              String((a.fields || []).map((f) => f.value).join("")).length
        );
      const keep = sorted[0];
      let next = keep;
      sorted.slice(1).forEach((r) => {
        next = mergeResultRecords(next, r);
        const at = (task.results || []).indexOf(r);
        if (at >= 0) task.results.splice(at, 1);
        addMergedResultNames(nameMap, r, next.name);
        merged++;
      });
      next.pp = {};
      const idx = (task.results || []).indexOf(keep);
      if (idx >= 0) task.results[idx] = next;
      addMergedResultNames(nameMap, next, next && next.name);
    });
    rewriteRelationEndpoints(task, nameMap);
    saveState();
    renderResultReview(task);
    closeModal("result-merge-modal");
    showToast(
      uiTextFor("已自动合并 G 组 / M 条重复结果").replace("G", groups.length).replace("M", merged)
    );
    resultMergeTask = null;
    resultMergeGroups = [];
    resultMergeSelected = new Set();
    resultMergeExcluded = new Map();
  }

  // 结果区当前显示哪些：搜索词 + 「仅显示未填入」两个筛选
  // 「过滤阈值」开启时，低于阈值的人物 / 设定既不显示、也不填：所有过滤入口都用这一份
  function thinFilterFor(task) {
    if (!task) return null;
    loadFillOpts();
    if (!fillOpts.filterThin) return null;
    return { sentences: taskSentences(task), limit: thinThreshold() };
  }

  function filterResultList(list, kw, thin) {
    return (list || []).filter((r) => {
      if (kw && !resultMatches(r, kw)) return false;
      if (resultOnlyUnfilled && r.applied) return false;
      // 过滤阈值：低于阈值的条目直接不显示（勾选那边由 syncResultChecksToThinFilter 同步取消）
      if (thin && isThinResult(r, thin.sentences, thin.limit)) return false;
      return true;
    });
  }

  // 「只提了一句」判定：全文里提到这个名字（含别名）的句子加起来不到阈值。
  // 事件不受这个过滤影响（事件永远会填），所以这个判定只对人物 / 设定生效。
  function isThinResult(r, sentences, limit) {
    if (!r) return false;
    if (r.type !== "character" && r.type !== "setting") return false;
    return recordEvidenceChars(r, sentences) < limit;
  }

  // 勾上「过滤只提一句的人物 / 名词」时，下方卡片的勾选跟着同步．
  //   开启 → 会被过滤掉的那些取消勾选，其余勾上；关闭 → 全部恢复勾选。
  // 这样「界面上勾着的」永远等于「点『填入设定档案』真会填的」。
  function syncResultChecksToThinFilter(task) {
    const t = task || resultViewTask() || getSelectedTask();
    const results = (t && t.results) || [];
    if (!results.length) return 0;
    loadFillOpts();
    const on = !!fillOpts.filterThin;
    const sentences = on ? taskSentences(t) : [];
    const limit = thinThreshold();
    let changed = 0;
    results.forEach((r) => {
      const want = on ? !isThinResult(r, sentences, limit) : true;
      if ((r.included !== false) !== want) {
        r.included = want;
        changed++;
      }
    });
    return changed;
  }

  // 同步完只改已有卡片上的勾选框（不整块重画：上千条结果重画一次要一秒多）
  function applyResultChecksToDom() {
    const box = $("#result-review");
    const t = resultViewTask() || getSelectedTask();
    if (!box || !t) return;
    const results = t.results || [];
    box.querySelectorAll('.result-item input[type="checkbox"][data-ridx]').forEach((cb) => {
      const r = results[Number(cb.dataset.ridx)];
      if (!r) return;
      const want = r.included !== false;
      if (cb.checked !== want) cb.checked = want;
    });
  }

  // 头部里会随数据变的文字 / 勾选状态（不重建元素，搜索框才能正常输入中文）
  function updateResultHeadBar(results, shown, kw) {
    const box = $("#result-review");
    if (!box) return;
    // 头部钉住时，选项卡要正好贴在它下面 —— 量一下头部高度写进 CSS 变量
    const headBar = box.querySelector("#result-head-bar");
    if (headBar && headBar.offsetHeight) {
      box.style.setProperty("--result-head-h", headBar.offsetHeight + "px");
    }
    /* 钉住的落点是「滚动容器的内容盒」顶部，容器自己的上内边距会漏出一条缝（卡片从缝里露出来）。
       量出这条缝多高，写成变量让两行的底色往上出血盖住它。 */
    (function () {
      let n = box.parentElement;
      while (n && n !== document.body) {
        const c = getComputedStyle(n);
        if (c.overflowY === "auto" || c.overflowY === "scroll") {
          const pad = parseFloat(c.paddingTop) || 0;
          box.style.setProperty("--result-sticky-pad", pad + "px");
          return;
        }
        n = n.parentElement;
      }
    })();
    const label = box.querySelector("#result-count-label");
    if (label) {
      const only = resultOnlyUnfilled;
      // 左上角：选中（当前显示里勾上的）/ 总计（这个任务的全部结果）
      const chosen = shown.filter((r) => r.included !== false).length;
      const qual = [
        kw ? uiTextFor("搜索") : "",
        only ? uiTextFor("未填入") : "",
      ]
        .filter(Boolean)
        .join(" + ");
      label.textContent = `分析结果（${qual ? qual + "：" : ""}选中 ${chosen}/总计 ${results.length}）`;
    }
    const s = box.querySelector("#result-search");
    if (s && s.value !== resultSearch) s.value = resultSearch;
    const cb = box.querySelector("#fill-thin-filter");
    if (cb) cb.checked = !!fillOpts.filterThin;
    const num = box.querySelector("#fill-thin-threshold");
    if (num) {
      num.value = String(thinThreshold());
      num.disabled = !fillOpts.filterThin;
    }
    // 全选 / 全不选的范围：搜索时就只作用于搜出来的这些
    const scopeText = kw ? `搜索出来的 ${shown.length} 条（没搜到的保持原样）` : `全部 ${results.length} 条`;
    const allBtn = box.querySelector("#result-check-all");
    if (allBtn) {
      const allOn = shown.length > 0 && shown.every((r) => r.included !== false);
      allBtn.title = `点一下＝把${scopeText}全部勾选；再点一下＝全部不勾（只改勾选，不删结果，也不动已经填进人物 / 事件 / 设定的内容）`;
      allBtn.textContent = kw ? `全选（${shown.length}）` : "全选";
      allBtn.classList.toggle("btn-primary", allOn);
    }
    // 「仅显示未填入」的按钮状态
    const onlyBtn = box.querySelector("#result-only-unfilled");
    if (onlyBtn) {
      onlyBtn.classList.toggle("btn-primary", resultOnlyUnfilled);
      onlyBtn.textContent = resultOnlyUnfilled ? "已隐藏已填入（点一下取消）" : "仅显示未填入";
      onlyBtn.title = resultOnlyUnfilled
        ? "现在只显示还没填进去的结果；点一下恢复显示全部"
        : "只看还没填进人物 / 事件 / 设定的结果（再点一下取消）";
    }
  }

  // 结果区头部的交互只绑一次（搜索框、过滤开关、全选 / 全不选、删除选中、填入）
  // 批量改「已填入」标记（分析结果列表）：
  //   · 有勾选 → 只改勾选的这些（相当于多选标记）
  //   · 一条都没勾 → 改当前显示的那些（搜索 / 「仅显示未填入」过滤之后的）
  // 只动「已填入」标记，不动勾选状态（勾选＝下次填不填）
  function markResultsApplied(on) {
    const t = resultViewTask();
    if (!t) return;
    const all = t.results || [];
    if (!all.length) {
      showToast("这个任务还没有分析结果");
      return;
    }
    const checked = all.filter((r) => r.included !== false);
    // 只看当前显示出来的那些（搜索 / 「仅显示未填入」过滤之后）
    const shownNow = filterResultList(all, String(resultSearch || "").trim().toLowerCase(), thinFilterFor(t));
    const shownSet = new Set(shownNow);
    const checkedVisible = checked.filter((r) => shownSet.has(r));
    const scope = checkedVisible.length ? checkedVisible : shownNow;
    if (!scope.length) {
      showToast("没有可以改的结果");
      return;
    }
    const scopeLabel = checkedVisible.length
      ? `当前显示里勾选的 ${checkedVisible.length} 条`
      : `当前显示的 ${scope.length} 条`;
    let n = 0;
    scope.forEach((r) => {
      if (!!r.applied === !!on) return;
      r.applied = !!on;
      n++;
    });
    if (!n) {
      showToast(on ? `${scopeLabel}本来就都是「已填入」` : `${scopeLabel}本来就没有「已填入」标记`);
      return;
    }
    saveState();
    renderResultReview(t);
    showToast(
      on
        ? `已把${scopeLabel}标为「已填入」`
        : `已把${scopeLabel}标为「未填入」`
    );
  }

  function bindResultHeadBar() {
    const box = $("#result-review");
    if (!box) return;
    // 「本栏全选」（在「全选」按钮右边）：勾上＝把当前这一栏里当前显示的结果全部勾选；取消＝全部不勾。
    // 头部只建一次，所以这个监听也只绑一次。
    const tabAllCb = box.querySelector("#result-tab-all-cb");
    if (tabAllCb)
      tabAllCb.addEventListener("change", () => {
        const t = resultViewTask();
        if (!t) return;
        const type = resultTabView[t.id] || "";
        if (!type) return;
        const kwNow = String(resultSearch || "").trim().toLowerCase();
        const scope = filterResultList((t.results || []).filter((r) => r.type === type), kwNow, thinFilterFor(t));
        const on = tabAllCb.checked;
        if (!scope.length) return;
        scope.forEach((r) => {
          r.included = on;
        });
        saveState();
        renderResultReview(t);
        const name = { character: "人物", event: "事件", setting: "设定条目", relation: "人物关系" }[type] || type;
        showToast(on ? `已勾选「${name}」里的 ${scope.length} 条` : `已取消勾选「${name}」里的 ${scope.length} 条`);
      });
    const searchEl = box.querySelector("#result-search");
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        resultSearch = searchEl.value;
        scheduleFilterRender("result-search", () => {
          const t = resultViewTask();
          if (t) renderResultReview(t);
        });
      });
      searchEl.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        searchEl.value = "";
        resultSearch = "";
        const t = resultViewTask();
        if (t) renderResultReview(t);
      });
    }
    // 全选 / 全不选合成一个按钮：一下全勾，再点一下全不勾（只作用于当前显示的那些）
    const checkAllBtn = box.querySelector("#result-check-all");
    if (checkAllBtn)
      checkAllBtn.addEventListener("click", () => {
        const t = resultViewTask();
        if (!t) return;
        const all = t.results || [];
        const kwNow = String(resultSearch || "").trim().toLowerCase();
        const scope = filterResultList(all, kwNow, thinFilterFor(t));
        if (!scope.length) {
          showToast("当前没有显示出来的结果");
          return;
        }
        const allOn = scope.every((r) => r.included !== false);
        let n = 0;
        scope.forEach((r) => {
          const next = !allOn;
          if ((r.included !== false) === next) return;
          r.included = next;
          n++;
        });
        if (!n) {
          showToast(allOn ? "这些结果本来就是全选的" : "这些结果本来都没勾上");
          return;
        }
        saveState();
        renderResultReview(t);
        const label = `当前显示的 ${scope.length} 条`;
        showToast(allOn ? `已全部不勾（${label}）` : `已全选${label}`);
      });
    // 批量改「已填入」标记：勾了几条就改那几条；一条都没勾就改当前显示的全部
    const markUnfilled = box.querySelector("#result-mark-unfilled");
    if (markUnfilled) markUnfilled.addEventListener("click", () => markResultsApplied(false));
    const markFilled = box.querySelector("#result-mark-filled");
    if (markFilled) markFilled.addEventListener("click", () => markResultsApplied(true));
    // 「仅显示未填入」：点一下只看还没填进去的，再点一下取消
    const onlyUnfilledBtn = box.querySelector("#result-only-unfilled");
    if (onlyUnfilledBtn)
      onlyUnfilledBtn.addEventListener("click", () => {
        resultOnlyUnfilled = !resultOnlyUnfilled;
        const t = resultViewTask();
        if (t) renderResultReview(t);
        showToast(resultOnlyUnfilled ? "只显示还没填入的结果" : "显示全部结果");
      });
    const delSel = box.querySelector("#result-delete-selected");
    if (delSel) delSel.addEventListener("click", deleteCheckedResults);
    const autoMergeBtn = box.querySelector("#result-auto-merge");
    if (autoMergeBtn) autoMergeBtn.addEventListener("click", openResultMergeDialog);
    const manualOk = box.querySelector("#result-manual-ok");
    if (manualOk) manualOk.addEventListener("click", confirmResultManualMerge);
    const manualCancel = box.querySelector("#result-manual-cancel");
    if (manualCancel) manualCancel.addEventListener("click", cancelResultManualMerge);
    const thinCb = box.querySelector("#fill-thin-filter");
    const thinNum = box.querySelector("#fill-thin-threshold");
    if (thinCb)
      thinCb.addEventListener("change", () => {
        setFillOpts({ filterThin: thinCb.checked });
        if (thinNum) thinNum.disabled = !thinCb.checked;
        // 卡片勾选跟着同步：被过滤掉的那些取消勾选，其余的勾上
        const t = resultViewTask() || getSelectedTask();
        const n = syncResultChecksToThinFilter(t);
        if (t && n) {
          saveState();
          applyResultChecksToDom();
        }
        // 阈值过滤也影响显示：低于阈值的条目直接不显示（不只是取消勾选）
        if (t) renderResultReview(t);
        showToast(
          thinCb.checked
            ? `已开启过滤：提到不到 ${thinThreshold()} 字的人物 / 名词已取消勾选${n ? `（共 ${n} 条）` : ""}`
            : `已关闭过滤：短条目也会填入${n ? `（已重新勾上 ${n} 条）` : ""}`
        );
      });
    if (thinNum)
      thinNum.addEventListener("change", () => {
        const v = Math.max(0, Math.min(5000, Math.round(Number(thinNum.value) || 0)));
        thinNum.value = String(v);
        setFillOpts({ threshold: v });
        if (fillOpts.filterThin) {
          const t = resultViewTask() || getSelectedTask();
          const n = syncResultChecksToThinFilter(t);
          if (t && n) {
            saveState();
            applyResultChecksToDom();
          }
          if (t) renderResultReview(t); // 阈值变了：显示也跟着变（低于阈值的直接不显示）
          showToast(`过滤阈值改成 ${v} 字：卡片勾选已同步${n ? `（改了 ${n} 条）` : ""}`);
        } else {
          showToast(`过滤阈值已改成 ${v} 字（当前没开启过滤）`);
        }
      });
  }

  function createTask() {
    const n = state.analysis.tasks.length + 1;
    // 默认名按当前界面语言取（和「未分组」「我的小说」一个规矩）
    /* nameEdited＝用户自己改过任务名。没改过的话，第一次上传文档时
       会把这个任务名改成第一份文档的名字（见 importFiles）。 */
    const task = {
      id: uid(),
      name: uiSentence("taskDefaultName", n),
      nameEdited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      results: [],
    };
    state.analysis.tasks.push(task);
    selectedTaskId = task.id;
    saveState();
    renderTaskList();
    renderTaskDetail();
  }

  function importFiles(fileList) {
    const task = getSelectedTask();
    if (!task) {
      uiAlert("请先选择或新建一个分析任务。");
      return;
    }
    const arr = Array.from(fileList).filter(Boolean);
    if (!arr.length) return;
    const total = arr.length;
    let finished = 0;
    setAnalyzeStatus(`正在读取 ${total} 个文件…`);
    showProgress(0, `读取 0 / ${total}`);
    const jobs = arr.map((f) =>
      extractFileText(f)
        .then((res) => {
          const text = typeof res === "string" ? res : res.text; // 兼容老写法
          const pageOffsets = res && res.pageOffsets ? res.pageOffsets : null;
          // srcPath＝原文件在磁盘上的位置（安装版才有；浏览器里是空）。双击文件名可以用它打开原文
          return { ok: true, value: { id: uid(), name: f.name, size: f.size, text, pageOffsets, srcPath: f.path || "" } };
        })
        .catch((err) => ({ ok: false, error: err }))
        .then((r) => {
          finished++;
          showProgress((finished / total) * 100, `读取 ${finished} / ${total}`);
          return r;
        })
    );
    Promise.all(jobs).then((results) => {
      let ok = 0;
      let fail = 0;
      const added = [];
      results.forEach((res) => {
        if (res.ok) {
          added.push(res.value);
          ok++;
        } else {
          fail++;
        }
      });
      // 同一批导入的文档按「第X章」的章号排序（中文数字也认），再按文件名自然顺序
      pendingUndoLabel = "导入文本";
      /* 用户没自己起过任务名、而且这是这个任务的第一批文档：
         任务名就跟着第一份文档走（去扩展名），省得每次都手动改。
         之后再传、或用户改过名，都不动它。 */
      const taskWasEmpty = !(task.files || []).length;
      const firstPicked = added.length ? String(added[0].name || "") : "";
      added.sort(compareStoryFiles);
      added.forEach((f) => task.files.push(f));
      rebuildSegments(task);
      renumberResults(task);
      let renamedTo = "";
      if (taskWasEmpty && added.length && task.nameEdited !== true && firstPicked) {
        const nice = firstPicked.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim() || firstPicked;
        if (nice && nice !== task.name) {
          task.name = nice;
          renamedTo = nice;
        }
      }
      // 故事里还没有章节时，导入完直接按识别到的标题建章（导入 + 建章算一步，可整体撤销）
      let autoChapters = 0;
      if (!(state.chapters || []).length) {
        pendingUndoLabel = "导入文本并识别章节";
        autoChapters = buildChaptersFromSegments();
        if (autoChapters) {
          renderChapterRail();
          renderTimeline();
          renderMatrix();
        }
      }
      saveState();
      renderTaskDetail();
      renderTaskList();
      const chapterLike = (task.segments || []).filter((s) => s.label && !/未分章/.test(s.label)).length;
      setAnalyzeStatus(uiSentence("importedFiles", ok, fail, chapterLike, autoChapters));
      if (renamedTo) showToast(uiSentence("taskRenamedFromFile", renamedTo));
    });
  }

  async function extractFileText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "txt" || ext === "md" || ext === "markdown") return { text: await file.text() };
    if (ext === "docx") return { text: await extractDocx(file) };
    if (ext === "doc") throw new Error("旧版 .doc 暂不支持，请另存为 .docx 或 .txt");
    if (ext === "pdf") return await extractPdf(file);
    throw new Error("不支持的文件类型：" + ext);
  }

  async function extractDocx(file) {
    if (!window.JSZip) throw new Error("未加载 Word 解析库（需联网，请刷新后再试）");
    const zip = await JSZip.loadAsync(file);
    const doc = zip.file("word/document.xml");
    if (!doc) throw new Error("无法读取 docx 正文");
    const xml = await doc.async("string");
    const docEl = new DOMParser().parseFromString(xml, "application/xml");
    const paras = Array.from(docEl.getElementsByTagName("w:p"));
    return paras.map((p) => Array.from(p.getElementsByTagName("w:t")).map((t) => t.textContent).join("")).join("\n");
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error("未加载 PDF 解析库，请刷新后再试");
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    }
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    const pageOffsets = []; // 每一页的正文在 out 里的起始下标，用来做「页码 ↔ PDF 页」的核对
    for (let i = 1; i <= pdf.numPages; i++) {
      pageOffsets.push(out.length);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("");
      out += "\n";
    }
    return { text: out, pageOffsets, pageCount: pdf.numPages };
  }

  function loadAgentConfig() {
    try {
      return Object.assign(
        { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini", concurrency: 3, maxTokens: DEFAULT_MAX_TOKENS, reflect: true, chaptersPerCall: 1 },
        JSON.parse(localStorage.getItem(AGENT_KEY) || "{}")
      );
    } catch (e) {
      return { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini", concurrency: 3, maxTokens: DEFAULT_MAX_TOKENS, reflect: true, chaptersPerCall: 1 };
    }
  }

  function saveAgentConfig(cfg) {
    localStorage.setItem(AGENT_KEY, JSON.stringify(cfg));
  }

  /* ================= Agent 可用性（统一规则）
=================
     以后新增任何「要用 Agent」的功能，只要在那个按钮上写一个属性即可自动跟着这套规则走：
       data-agent="hard"  完全依赖 Agent —— 接不上就变灰、点不动
       data-agent="soft"  没有 Agent 也能用、只是效果打折 —— 点击时弹窗提醒会受影响
     「接不上」包括三种：用户手动禁用 / 没填 API Key 或模型
/ 最近一次连接测试失败。
     没禁用且信息齐全时，每个 1 小时自动测一次连接（失败的话 10 分钟后再试）。
*/
  const AGENT_DISABLED_KEY = "fiction_gui_agent_disabled_v1";
  const AGENT_STATUS_KEY = "fiction_gui_agent_status_v1";
  const AGENT_PROBE_INTERVAL = 60 * 60 * 1000; // 成功：1 小时一次
  const AGENT_PROBE_RETRY = 10 * 60 * 1000; // 失败：10 分钟后再试
  let agentDisabled = false;
  let agentStatus = { ok: false, at: 0, msg: "" };
  let agentProbeRunning = false;

  function loadAgentDisabled() {
    try {
      return localStorage.getItem(AGENT_DISABLED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function saveAgentDisabled(v) {
    try {
      localStorage.setItem(AGENT_DISABLED_KEY, v ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function loadAgentStatus() {
    try {
      return Object.assign({ ok: false, at: 0, msg: "" }, JSON.parse(localStorage.getItem(AGENT_STATUS_KEY) || "{}"));
    } catch (e) {
      return { ok: false, at: 0, msg: "" };
    }
  }

  function saveAgentStatus() {
    try {
      localStorage.setItem(AGENT_STATUS_KEY, JSON.stringify(agentStatus));
    } catch (e) {
      /* ignore */
    }
  }

  function agentUsable() {
    const cfg = loadAgentConfig();
    return !agentDisabled && !!(cfg.apiKey && cfg.model) && !!agentStatus.ok;
  }

  function agentOffReason(cfg) {
    if (agentDisabled) return "Agent 已被禁用（在「设置 → Agent」里点「恢复 Agent」就行）";
    const c = cfg || loadAgentConfig();
    if (!c.apiKey || !c.model) return "还没有填好 Agent 的 API Key / 模型";
    if (!agentStatus.ok) return "最近一次连接测试没成功" + (agentStatus.msg ? "：" + agentStatus.msg : "");
    return "";
  }

  function fmtAgentClock(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // 一次最小请求：确认 Key / 地址 / 模型都真的能用（不看状态码就完事，还要能拿到正文）
  async function probeAgent(cfg, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 20000);
    try {
      let resp;
      try {
        resp = await agentFetch(
          String(cfg.baseUrl || "").replace(/\/+$/, "") + "/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              model: cfg.model,
              max_tokens: 16,
              messages: [{ role: "user", content: "回复一个字：好" }],
            }),
          },
          timeoutMs || 20000
        );
      } catch (e) {
        if (controller.signal.aborted) throw new Error("超时（30 秒无响应）");
        throw new Error("连不上：" + ((e && e.message) || e));
      }
      const body = await resp.text();
      if (!resp.ok) throw new Error("接口返回 " + resp.status + "：" + body.replace(/\s+/g, " ").slice(0, 120));
      let data = null;
      try {
        data = JSON.parse(body);
      } catch (e) {
        throw new Error("返回的不是 JSON");
      }
      if (data.error) throw new Error(String(data.error.message || "接口返回错误").slice(0, 120));
      const choice = data.choices && data.choices[0];
      const content = pickMessageText(choice && choice.message ? choice.message.content : "");
      if (!content) throw new Error("能连上，但模型没返回正文");
      return { ok: true, msg: "连接正常" };
    } catch (e) {
      return { ok: false, msg: (e && e.message) || String(e) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshAgentAvailability(force) {
    if (agentDisabled || agentProbeRunning) return;
    const cfg = loadAgentConfig();
    if (!cfg.apiKey || !cfg.model) return;
    const age = Date.now() - (agentStatus.at || 0);
    const wait = agentStatus.ok ? AGENT_PROBE_INTERVAL : AGENT_PROBE_RETRY;
    if (!force && age < wait) return;
    agentProbeRunning = true;
    try {
      const res = await probeAgent(cfg, 20000);
      agentStatus = { ok: !!res.ok, at: Date.now(), msg: res.msg || "" };
      saveAgentStatus();
    } finally {
      agentProbeRunning = false;
      syncAgentUi();
    }
  }

  // 按当前可用性刷新所有相关按钮 + 「设置 → Agent」界面的状态
  // 说明：这里只「加上」禁用，不去解开程序自己的禁用（比如分析进行中按钮本来就是灰的）．
  // 所以记一下这个按钮被我们按住之前是不是本来就灰着，恢复时按原样还回去。
  function setAgentButtonBlocked(b, blocked) {
    if (blocked) {
      if (b.dataset.agentBlock !== "1") {
        b.dataset.agentBlock = "1";
        b.dataset.agentWasDisabled = b.disabled ? "1" : "0";
      }
      if (!b.disabled) b.disabled = true;
    } else if (b.dataset.agentBlock === "1") {
      delete b.dataset.agentBlock;
      const was = b.dataset.agentWasDisabled === "1";
      delete b.dataset.agentWasDisabled;
      if (!was && b.disabled) b.disabled = false;
    }
  }

  function syncAgentUi() {
    const cfg = loadAgentConfig();
    const usable = !agentDisabled && !!(cfg.apiKey && cfg.model) && !!agentStatus.ok;
    const reason = agentOffReason(cfg);
    /* 这几个词先按当前语言取好，后面拼出来的悬浮说明整句都是目标语言。
       ⚠️ reason 是**拼出来的**（「最近一次连接测试没成功」＋「：」＋报错正文），
       整句查表查不到 —— 30-i18n.js 里那条 `最近一次连接测试没成功：(.+)` 模板只换外层、
       内层那句「能连上，但模型没返回正文」会原样留中文（用户 2026-10-17 报的）。
       所以按「：」拆开、两半各自翻一遍（两半都是词条 / 模板里有的）。 */
    const reasonText = String(reason || "")
      .split("：")
      .map((s) => uiTrans(s.trim()))
      .join(uiLanguage() === "en" ? ": " : "：");
    const needTip = uiTextFor("需要在「设置 → Agent」中完成配置。");
    const suggestTip = uiTextFor("建议在「设置 → Agent」中完成配置。");
    // 「（原因，暂时不可用）」这一节：标点和连接词都跟着语言走，别留中文标点
    /* 原因和后半句之间的连接符按语言取：英文用破折号、日文用顿号、中日文其余用全角逗号
       （日文里塞中文的全角逗号「，」看着就是没翻干净） */
    const langNow = uiLanguage();
    const offNote = (word) =>
      uiFoldNote(reasonText + (langNow === "en" ? " — " : langNow === "ja" ? "、" : "，") + uiTextFor(word));
    /* 底稿：优先用按钮上写死的简体原文（data-agent-title）。
       JS 现场生成的按钮（#fill-results-btn、.seg-retry…）上没有这个属性，
       那就**第一次**见到它时把当时的 title 记进去当底稿 —— 否则每重拼一次
       （切语言、刷新可用性、点「禁用 / 恢复 Agent」）都会把
       「（…，功能会受影响）建议在…」再追加一遍，title 会长得没边。 */
    const baseOf = (b) => {
      if (!b.dataset.agentTitle) b.dataset.agentTitle = uiOrigTitleOf(b) || "";
      return uiTextFor(b.dataset.agentTitle);
    };
    $$('[data-agent="hard"]').forEach((b) => {
      /* 底稿固定，再按当前语言翻一次：这样每次重拼（切语言 / Agent 状态变化）
         都是整句同一种语言，也不会把上一次拼好的成品当成原文再拼一遍。 */
      const base = baseOf(b);
      setAgentButtonBlocked(b, !usable);
      if (b.classList.contains("agent-off") !== !usable) b.classList.toggle("agent-off", !usable);
      const t = usable ? base : base + offNote("暂时不可用") + "\n" + needTip;
      uiSetComposedTitle(b, t);
    });
    $$('[data-agent="soft"]').forEach((b) => {
      const base = baseOf(b);
      if (b.classList.contains("agent-off-soft") !== !usable) b.classList.toggle("agent-off-soft", !usable);
      const t = usable ? base : base + offNote("功能会受影响") + "\n" + suggestTip;
      uiSetComposedTitle(b, t);
    });
    const st = $("#agent-avail-status");
    if (st) {
      const text = agentDisabled
        ? "已禁用：所有用到 Agent 的功能都会变灰"
        : !cfg.apiKey || !cfg.model
        ? "还没填好 API Key / 模型"
        : agentStatus.ok
        ? `连接正常 · 上次检测 ${fmtAgentClock(agentStatus.at)}`
        : agentStatus.at
        ? `${uiTextFor("连接失败")} · ${uiTrans(agentStatus.msg)}`
        : "尚未检测连接";
      if (st.textContent !== text) st.textContent = text;
      const cls = "agent-avail-status " + (usable ? "ok" : "off");
      if (st.className !== cls) st.className = cls;
    }
    const db = $("#agent-disable-btn");
    if (db) {
      const label = agentDisabled ? "恢复 Agent" : "禁用 Agent";
      if (db.textContent !== label) db.textContent = label;
      const tip = agentDisabled
        ? "恢复后本程序会重新调用 Agent（没禁用且信息齐全时会每小时自动测一次连接）"
        : "禁用后不再调用 Agent：依赖 AI 的按钮会变灰；再点一次恢复";
      if (db.title !== tip) db.title = tip;
      if (db.classList.contains("btn-danger") !== !agentDisabled) db.classList.toggle("btn-danger", !agentDisabled);
    }
    const fields = $("#agent-fields");
    if (fields && fields.classList.contains("agent-off") !== agentDisabled) fields.classList.toggle("agent-off", agentDisabled);
  }

  function toggleAgentDisabled() {
    agentDisabled = !agentDisabled;
    saveAgentDisabled(agentDisabled);
    syncAgentUi();
    showToast(agentDisabled ? "已禁用 Agent：所有用到 AI 的功能暂时不可用" : "已恢复 Agent");
    if (!agentDisabled) refreshAgentAvailability(false);
  }

  // 没有 Agent 时点「软依赖」按钮：先提醒，用户确认后照常执行
  function bindAgentSoftGuard() {
    document.addEventListener(
      "click",
      (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-agent="soft"]') : null;
        if (!btn || agentUsable() || btn.dataset.agentGo === "1") return;
        ev.preventDefault();
        ev.stopPropagation();
        // 两个按钮居中排版：回车＝继续，Esc / 右上角 × / 点遮罩＝取消
        uiChoose(
          // 每一段先按当前语言取好，整句就是目标语言（识别用的模板匹配不到这种拼接）
          uiTextFor("未成功接入 agent，该功能将受到影响。") +
            "\n\n" +
            uiTextFor(agentOffReason()) +
            "\n" +
            uiTextFor("建议在「设置 → Agent」中完成配置。"),
          [
            { label: "继续", value: "go", primary: true },
            { label: "取消", value: "", cancel: true },
          ],
          "提示"
        ).then((v) => {
          if (v !== "go") return;
          btn.dataset.agentGo = "1";
          btn.click();
          delete btn.dataset.agentGo;
        });
      },
      true
    );
  }

  // 动态渲染出来的按钮（比如每个章 / 节的「重跑」）也自动套用规则
  function watchAgentButtons() {
    if (typeof MutationObserver !== "function") return;
    let pending = false;
    const obs = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        syncAgentUi();
      });
    });
    // 也盯一个 disabled 属性：程序自己把某个按钮重新启用时，我们（如果正在禁用 Agent）要再按住
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
  }

  function bindAgentAvailability() {
    agentDisabled = loadAgentDisabled();
    agentStatus = loadAgentStatus();
    const db = $("#agent-disable-btn");
    if (db) db.addEventListener("click", toggleAgentDisabled);
    bindAgentSoftGuard();
    watchAgentButtons();
    syncAgentUi();
    // 每 5 分钟看一眼「距上次检测是否超过 1 小时」，到了才真的发请求
    setInterval(() => refreshAgentAvailability(false), 5 * 60 * 1000);
    refreshAgentAvailability(false);
  }

  /* ================= 全局字段：每种卡片类型的字段清单 =================
     state.fieldSchemas = {
       char:  [ {key,label,custom,off,required} ],
       event: [ ... ],
       entry: { [categoryId]: [ ... ] },
     }
     · 内置字段：key 对应编辑器里的某个输入框，可以改名 / 隐藏（off），卡片数据不动
     · 自定义字段：用户自己加的，内容落在卡片的 fields 里（人物 / 事件 / 设定条目都有 fields）**/
  const FIELDSET_DEFS = {
    char: [
      // 这两个和文本分析绑定（识别 / 合并人物都靠它们），锁定不给改名或删除
      { key: "name", label: "姓名", required: true, locked: true },
      { key: "aliases", label: "别名 / 其他称呼", locked: true },
      { key: "gender", label: "性别" },
      { key: "age", label: "年龄" },
      { key: "role", label: "身份 / 职业" },
      { key: "appearance", label: "外貌" },
      { key: "personality", label: "性格" },
      { key: "background", label: "背景经历" },
      { key: "goal", label: "目标 / 动机" },
      { key: "relationships", label: "人际关系" },
      { key: "notes", label: "备注" },
    ],
    event: [
      // 这三个和文本分析绑定（事件靠它们归位 / 排序），锁定不给改名或删除
      { key: "title", label: "标题", required: true, locked: true },
      { key: "time", label: "时间", locked: true },
      { key: "place", label: "地点", locked: true },
      { key: "cause", label: "起因" },
      { key: "process", label: "经过" },
      { key: "result", label: "结果" },
      { key: "notes", label: "备注 / 伏笔" },
    ],
  };
  // 新项目落盘时用的字段清单：标签按当前界面语言取。
  // 上面 FIELDSET_DEFS 里的中文标签始终当作「认字用的原名」，
  // 识别回填时 schemaFieldValue 会拿中文原名再兜一次，所以改语言不会影响识别。
  function localizedFieldsetDefs(k) {
    return (FIELDSET_DEFS[k] || []).map((d) => {
      const o = Object.assign({}, d);
      const zh = String(d.label || "");
      const loc = uiTextFor(zh);
      if (loc && loc !== zh) o.label = loc;
      return o;
    });
  }
  // 设定档案按类别名给一份默认的自定义字段（可以随意改 / 删）
  const FIELDSET_ENTRY_CUSTOM = {
    物品: ["类型", "外观", "用途", "来历"],
    名词: ["含义", "由来"],
    地点: ["类型", "位置", "特征"],
    势力: ["类型", "立场", "控制区域"],
    纪年: ["时间", "事件", "影响"],
    其他: [],
  };
  // 兜底：按 kind 取上面那份默认字段（新项目的类别名可能是英文 / 日文）
  const FIELDSET_ENTRY_CUSTOM_BY_KIND = {
    item: FIELDSET_ENTRY_CUSTOM["物品"],
    term: FIELDSET_ENTRY_CUSTOM["名词"],
    place: FIELDSET_ENTRY_CUSTOM["地点"],
    faction: FIELDSET_ENTRY_CUSTOM["势力"],
    era: FIELDSET_ENTRY_CUSTOM["纪年"],
  };
  // 内置字段 → 编辑器里的输入框（用来改名 / 隐藏）
  const FIELDSET_SELECTORS = {
    char: {
      name: ["#c-name"],
      aliases: ["#c-aliases"],
      gender: ["#c-gender"],
      age: ["#c-age"],
      role: ["#c-role"],
      appearance: ["#c-appearance"],
      personality: ["#c-personality"],
      background: ["#c-background"],
      goal: ["#c-goal"],
      relationships: ["#c-relationships"],
      notes: ["#c-notes"],
    },
    event: {
      title: ["#e-title"],
      time: ["#e-time"],
      place: ["#e-place"],
      cause: ["#e-cause"],
      process: ["#e-process"],
      result: ["#e-result"],
      notes: ["#e-notes"],
    },
  };

