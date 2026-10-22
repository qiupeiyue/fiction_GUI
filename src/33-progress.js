  function setAnalyzeStatus(msg) {
    const el = $("#analyze-status");
    if (!el) return;
    // 别的任务正在跑：这一栏只显示「被占用」，不显示那个任务的进度文案
    const owner = runningTaskInfo();
    if (owner && owner.id !== selectedTaskId) {
      el.textContent = `当前任务分析被「${owner.name}」占用`;
      el.title = `当前任务分析被「${owner.name}」占用。等它跑完，或切到那个任务点「终止」，才能分析这个任务。`;
      return;
    }
    el.classList.remove("status-with-progress");
    el.textContent = msg;
    el.title = msg; // 完整原因挂在悬停提示上，太长也不会把界面撑破
  }

  // 综合汇总这类“静默长任务”：状态文字后面跟一条细进度条 + 百分比（同一行）
  function setAnalyzeStatusProgress(msg, done, total) {
    const el = $("#analyze-status");
    if (!el) return;
    const owner = runningTaskInfo();
    if (owner && owner.id !== selectedTaskId) {
      el.classList.remove("status-with-progress");
      el.textContent = `当前任务分析被「${owner.name}」占用`;
      el.title = `当前任务分析被「${owner.name}」占用。等它跑完，或切到那个任务点「终止」，才能分析这个任务。`;
      return;
    }
    const n = Math.max(0, Math.floor(Number(done) || 0));
    const all = Math.max(0, Math.floor(Number(total) || 0));
    const pct = all ? Math.max(0, Math.min(100, Math.round((n / all) * 100))) : 0;
    el.textContent = "";
    el.classList.add("status-with-progress");
    const text = document.createElement("span");
    text.textContent = msg;
    const bar = document.createElement("span");
    bar.className = "status-progress-bar";
    const fill = document.createElement("i");
    fill.className = "status-progress-fill";
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    const pctEl = document.createElement("span");
    pctEl.className = "status-progress-pct";
    pctEl.textContent = pct + "%";
    el.appendChild(text);
    el.appendChild(bar);
    el.appendChild(pctEl);
    el.title = `${msg} ${n}/${all}`;
  }

  // 正在跑分析的那个任务（含名字），没有就返回 null
  function runningTaskInfo() {
    if (!(analysisRun && !analysisRun.finished)) return null;
    const t = (state.analysis.tasks || []).find((x) => x.id === analysisRun.taskId);
    return { id: analysisRun.taskId, name: (t && t.name) || "另一个任务" };
  }

  // 进度条只属于「正在分析的那个任务」：看别的任务时不该看到别人的进度
  let progressRaf = 0;
  let progressTarget = 0;
  let progressShown = 0; // 当前实际显示到哪儿（做平滑用）
  function showProgress(pct, label) {
    const wrap = $("#progress-wrap");
    if (!wrap) return;
    const v = Math.max(0, Math.min(100, pct));
    if (analysisRun) {
      analysisRun.pct = v; // 记下来，切回这个任务时能立刻恢复显示
      analysisRun.pctLabel = label || "";
    }
    const owner = runningTaskInfo();
    if (owner && owner.id !== selectedTaskId) return; // 正在看别的任务：不动它的进度条
    wrap.hidden = false;
    // 并发分析时 completed 是「一次涨好几个」的，这里用时间缓动把进度条匀到 ~0.6 秒里走完，
    // 并且只前进不后退（不会出现半路跳一格又退回去）。
    progressTarget = Math.max(progressShown, v);
    const from = progressShown;
    const t0 = performance.now();
    const DUR = 600;
    if (progressRaf) cancelAnimationFrame(progressRaf);
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / DUR);
      const eased = 1 - Math.pow(1 - k, 3);
      progressShown = from + (progressTarget - from) * eased;
      const fill = $("#progress-fill");
      if (fill) fill.style.width = progressShown + "%";
      const lab = $("#progress-label");
      if (lab) {
        const num = Math.round(progressShown) + "%";
        lab.textContent = label ? `${label} · ${num}` : num;
      }
      if (k < 1) progressRaf = requestAnimationFrame(step);
      else {
        progressShown = progressTarget;
        progressRaf = 0;
      }
    };
    progressRaf = requestAnimationFrame(step);
  }

  function hideProgress() {
    const wrap = $("#progress-wrap");
    if (!wrap) return;
    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
      progressRaf = 0;
    }
    progressTarget = 0;
    progressShown = 0;
    wrap.hidden = true;
    $("#progress-fill").style.width = "0%";
    $("#progress-label").textContent = "";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function stopWaiting() {
    if (waitTimer) {
      clearInterval(waitTimer);
      waitTimer = null;
    }
  }

  function updateRunButtons() {
    const running = analysisRun && !analysisRun.finished;
    const owner = runningTaskInfo();
    const mineRunning = !!(owner && owner.id === selectedTaskId);
    const lockedBy = owner && !mineRunning ? owner.name : "";
    const pauseBtn = $("#pause-btn");
    const stopBtn = $("#stop-btn");
    if (pauseBtn) {
      pauseBtn.textContent = analysisRun && analysisRun.paused ? "继续" : "暂停";
      pauseBtn.disabled = !running;
    }
    if (stopBtn) stopBtn.disabled = !running;
    ["#analyze-btn", "#retry-failed-btn"].forEach((sel) => {
      const btn = $(sel);
      if (!btn) return;
      if (btn.dataset.tip === undefined) btn.dataset.tip = btn.title || "";
      btn.disabled = !!running;
      btn.title = lockedBy ? `当前任务分析被「${lockedBy}」占用` : btn.dataset.tip;
    });
    updateRetryButton();
  }

  function togglePause() {
    if (!analysisRun || analysisRun.finished) return;
    analysisRun.paused = !analysisRun.paused;
    updateRunButtons();
    if (analysisRun.paused) {
      // 后处理（汇总 / 雷达 / 反思）里正在跑的请求立刻掐断；继续后会重新排队重发
      if (typeof abortPostProcessing === "function") abortPostProcessing();
      setAnalyzeStatus(uiTextFor("已暂停，点击「继续」恢复。"));
    }
    else setAnalyzeStatus(uiTextFor("继续分析…"));
  }

  function stopAnalysis() {
    if (!analysisRun || analysisRun.finished) return;
    analysisRun.stopped = true;
    analysisRun.paused = false;
    stopWaiting();
    if (typeof abortPostProcessing === "function") abortPostProcessing();
    if (analysisRun.controller) analysisRun.controller.abort();
    updateRunButtons();
    setAnalyzeStatus("正在终止…");
  }

  const BREAK_SENT = /[。！？!?…]/;
  // 只有超过这个字数的章 / 节才会被切开；切的时候只在自然段落 / 句子边界切
  // 找出所有「章 / 节」标题所在的行首位置
