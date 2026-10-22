  /* ================= 历史版本 / 回退 ================= */
  function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* 历史版本那一行的小字：老存档里存的是当时的界面语言（可能不是现在这门外语），
     显示时再翻一遍；「撤销：」这个前缀在「历史版本」列表里没有意义，去掉。 */
  function historyLabelText(raw) {
    const s = String(raw == null ? "" : raw)
      .trim()
      .replace(/^撤销\s*[:：]\s*/, "");
    return uiTrans(s || "自动保存");
  }

  function renderHistory() {
    const list = $("#history-list");
    if (!list) return;
    const p = getActiveProject();
    const log = (p && p.log) || [];
    if (!log.length) {
      list.innerHTML = `<p class="empty-tip small">还没有历史版本。改动会自动记录，也可以点「保存当前版本」手动留档。</p>`;
      return;
    }
    list.innerHTML = log
      .slice()
      .reverse()
      .map(
        (e) => `<div class="history-item">
          <div class="history-item-meta"><span class="history-time">${esc(fmtTime(e.time))}</span><span class="history-label">${esc(
            historyLabelText(e.label)
          )}</span></div>
          <button class="btn btn-sm history-rollback" data-log-id="${esc(e.id)}">回退</button>
          <button class="btn btn-sm btn-danger history-del" data-log-id="${esc(e.id)}" title="删除这一版历史存档（正文数据不受影响）">删除</button>
        </div>`
      )
      .join("");
    list.querySelectorAll(".history-rollback").forEach((b) => b.addEventListener("click", () => rollbackTo(b.dataset.logId)));
    list.querySelectorAll(".history-del").forEach((b) =>
      b.addEventListener("click", () => deleteHistoryVersion(b.dataset.logId))
    );
  }

  function deleteHistoryVersion(logId) {
    const p = getActiveProject();
    if (!p || !Array.isArray(p.log)) return;
    const hit = p.log.find((x) => x.id === logId);
    if (!hit) return;
    p.log = p.log.filter((x) => x.id !== logId);
    dropHistoryMirror(logId);
    saveState();
    renderHistory();
    showToast(`已删除版本「${historyLabelText(hit.label)}」`);
  }

  async function clearAllHistory() {
    const p = getActiveProject();
    if (!p || !Array.isArray(p.log) || !p.log.length) {
      showToast("还没有历史版本");
      return;
    }
    const n = p.log.length;
    const v = await uiChoose(
      `清空全部 ${n} 个历史版本？\n\n只删历史存档，小说正文、人物、事件、设定这些数据都不受影响。`,
      [
        { label: "确认", value: "ok", primary: true },
        { label: "取消", value: "", cancel: true },
      ],
      "清空所有历史版本"
    );
    if (v !== "ok") return;
    dropHistoryMirror(p.log.map((x) => x.id));
    p.log = [];
    suppressAutoSnapshot = true;
    saveState(); // 只落盘，不顺手补一版自动存案
    suppressAutoSnapshot = false;
    autoSaveDirty = false;
    renderHistory();
    showToast(`已清空 ${n} 个历史版本`);
  }

  function saveVersion() {
    return doSaveVersion();
  }

  // 手动保存：最多留 HISTORY_MAX 版，已经满了就先问一句
  async function doSaveVersion() {
    const p = getActiveProject();
    if (!p) return false;
    // 默认名按当前界面语言取（和「未分组」「我的小说」这类默认名一个规矩）；
    // 作者自己填的名字原样保存，不动
    const label = ($("#history-label").value || "").trim() || uiTextFor("手动版本");
    if (!Array.isArray(p.log)) p.log = [];
    if (p.log.length >= HISTORY_MAX) {
      const oldest = p.log[0];
      const ok = await uiChoose(
        `历史版本最多保留 ${HISTORY_MAX} 版，已满。\n\n继续保存会先清掉最早的一版「${
          (oldest && oldest.label) || "自动保存"
        }」（${oldest ? fmtTime(oldest.time) : ""}）。`,
        [
          { label: "确认", value: "ok", primary: true },
          { label: "取消", value: "", cancel: true },
        ],
        "历史版本已满"
      );
      if (ok !== "ok") {
        showToast("已取消：当前版本没有保存");
        return false;
      }
    }
    // 手动保存一定要留一版（哪怕内容和上一版一样），并给出提示．
    // 否则点了按钮什么反应都没有，会以为坏了
    logSnapshot(label, true);
    $("#history-label").value = "";
    saveState();
    renderHistory();
    const n = ((getActiveProject() || {}).log || []).length;
    showToast(`已保存版本「${label}」（共 ${n} 版）`);
    return true;
  }

  async function rollbackTo(logId) {
    const p = getActiveProject();
    const entry = (p.log || []).find((x) => x.id === logId);
    if (!entry) return;
    if (!(await uiConfirm("回退到这个版本？\n\n当前内容会被这个版本覆盖（回退操作本身也可以再次撤销）。"))) return;
    logSnapshot("回退前的状态");
    p.data = JSON.parse(JSON.stringify(entry.data));
    state = p.data;
    lineFilterClear();
    selectedCategoryId = null;
    selectedTaskId = null;
    relCheckedIds = null;
    relCheckedSeeded = false;
    relSeenIds = new Set();
    mergeSelectMode = false;
    mergeSelected = new Set();
    entryBatchMode = false;
    entryBatchSel = new Set();
    batchMode = false;
    batchSelected = new Set();
    charPoolSel.clear();
    poolCollapsed = null;
    hideMergeUndoBar();
    hideRelUndoBar();
    ensureData();
    saveState();
    renderAll();
    closeModal("settings-modal");
  }

