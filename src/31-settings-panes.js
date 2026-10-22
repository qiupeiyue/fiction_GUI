  function autoUpdateSupported() {
    const n = nativeApp();
    return !!(n && typeof n.getAutoUpdate === "function");
  }
  function renderAutoUpdatePane() {
    const cb = $("#auto-update-enabled");
    const btn = $("#auto-update-now");
    const st = $("#auto-update-status");
    const supported = autoUpdateSupported();
    if (cb) {
      cb.checked = supported ? !!nativeApp().getAutoUpdate() : false;
      cb.disabled = !supported;
    }
    if (btn) btn.disabled = !supported;
    if (st) {
      if (!supported) st.textContent = uiTextFor("浏览器版没有自动更新，安装版才有。");
      else {
        const n = nativeApp();
        const state = n && typeof n.getUpdateState === "function" ? n.getUpdateState() : null;
        if (state) renderUpdateState(state);
        else st.textContent = cb && cb.checked ? uiSentence("updateIdle") : uiSentence("updateDisabled");
      }
    }
  }

  function renderUpdateState(state) {
    const st = $("#auto-update-status");
    const bar = $("#auto-update-progress");
    const fill = $("#auto-update-progress-fill");
    if (!st) return;
    const s = state || {};
    const status = String(s.status || "");
    const ver = String(s.version || s.current || "");
    const pct = Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)));
    let text = "";
    if (status === "checking") text = uiSentence("updateChecking");
    else if (status === "latest") text = uiSentence("updateLatest", ver || String((s.current || "")));
    else if (status === "available") text = uiSentence("updateAvailable", ver);
    else if (status === "downloading") text = uiSentence("updateDownloading", ver, pct);
    else if (status === "ready") text = uiSentence("updateReady", ver);
    else if (status === "disabled") text = uiSentence("updateDisabled");
    else if (status === "error") text = uiSentence("updateError", String(s.error || ""));
    else text = uiSentence("updateIdle");
    st.textContent = text;
    if (bar && fill) {
      const show = status === "downloading" || status === "ready";
      bar.hidden = !show;
      fill.style.width = show ? `${status === "ready" ? 100 : pct}%` : "0%";
    }
  }
  // 点「保存」时把开关推给主进程（它写进自己的配置文件，并立刻调整更新策略）
  function applyAutoUpdateFromUi() {
    const cb = $("#auto-update-enabled");
    const n = nativeApp();
    if (!cb || !n || typeof n.setAutoUpdate !== "function") return;
    n.setAutoUpdate(!!cb.checked);
  }
  function bindAutoUpdatePane() {
    const cb = $("#auto-update-enabled");
    const btn = $("#auto-update-now");
    const st = $("#auto-update-status");
    if (cb)
      cb.addEventListener("change", () => {
        // 和设置里其它项一样：点「保存」才真正生效；保存后主进程会立刻检查 / 下载。
        if (st) st.textContent = cb.checked ? uiTextFor("已开启（保存后生效）") : uiTextFor("已关闭（保存后生效）");
      });
    if (btn)
      btn.addEventListener("click", async () => {
        const n = nativeApp();
        if (!n || typeof n.checkUpdateNow !== "function") {
          if (st) st.textContent = "浏览器版没有自动更新，安装版才有。";
          return;
        }
        if (st) st.textContent = "正在检查…";
        try {
          const r = await n.checkUpdateNow();
          if (st) st.textContent = updateResultText(r);
        } catch (e) {
          if (st) st.textContent = "检查失败";
        }
      });
    renderAutoUpdatePane();
    bindUpdateStatus();
    bindUpdateReadyDialog();
  }

  // 更新检查的结果文案：主进程只回结果码，这里按界面语言拼（程序设成什么语言就显示什么语言）
  function updateResultText(r) {
    const code = String((r && r.code) || "");
    if (code === "latest") return uiSentence("updateLatest", String((r && r.cur) || ""));
    if (code === "found") return uiSentence("updateAvailable", String((r && r.latest) || ""));
    if (code === "downloading")
      return uiSentence("updateDownloading", String((r && r.version) || ""), Math.round(Number((r && r.percent) || 0)));
    if (code === "ready") return uiSentence("updateReady", String((r && r.version) || ""));
    if (code === "dev") return uiTextFor("开发模式下不检查更新");
    if (code === "error") return uiSentence("updateError", String((r && r.error) || ""));
    if (r && r.text) return String(r.text);
    return uiTextFor("检查完成");
  }

  function bindUpdateStatus() {
    if (bindUpdateStatus.done) return;
    const n = nativeApp();
    if (!n || typeof n.onUpdateStatus !== "function") return;
    bindUpdateStatus.done = true;
    n.onUpdateStatus((state) => renderUpdateState(state));
  }

  // 新版下载完：按当前界面语言问一句（主进程那边不再弹它自带的英文通知）
  function bindUpdateReadyDialog() {
    if (bindUpdateReadyDialog.done) return;
    const n = nativeApp();
    if (!n || typeof n.onUpdateReady !== "function") return;
    bindUpdateReadyDialog.done = true;
    n.onUpdateReady((info) => {
      const v = String((info && info.version) || "");
      uiConfirm(`新版本 v${v} 已经下载好了。\n\n现在重启并安装吗？（选「取消」就等退出程序时自动安装）`).then((ok) => {
        if (ok && typeof n.installUpdate === "function") n.installUpdate();
      });
    });
  }

  function collectPathInputs() {
    const inputs = { import: "#path-import-dir", export: "#path-export-dir", history: "#path-history-dir" };
    let changed = false;
    PATH_KINDS.forEach((kind) => {
      const el = $(inputs[kind]);
      if (!el) return;
      const val = String(el.value || "").trim();
      if (pathPrefs[kind + "Dir"] !== val) {
        pathPrefs[kind + "Dir"] = val;
        changed = true;
      }
    });
    const rule = $("#path-export-rule");
    if (rule) {
      const val = String(rule.value || "").trim();
      if (val && pathPrefs.exportName !== val) {
        pathPrefs.exportName = val;
        changed = true;
      }
    }
    if (changed) savePathPrefs();
  }

  function renderPathsPane() {
    const inputs = { import: "#path-import-dir", export: "#path-export-dir", history: "#path-history-dir" };
    PATH_KINDS.forEach((kind) => {
      const el = $(inputs[kind]);
      if (el && document.activeElement !== el) {
        // 浏览器版没有真实路径：默认位置写「文档 / output / history」这几个名字（跟着界面语言）
        el.value =
          String(pathPrefs[kind + "Dir"] || "") ||
          (nativeApp() ? "" : uiTextFor(BROWSER_PATH_DEFAULT[kind] || ""));
      }
    });
    const rule = $("#path-export-rule");
    if (rule && document.activeElement !== rule) rule.value = pathPrefs.exportName || PATHS_DEF.exportName;
    const prev = $("#path-preview");
    if (prev) prev.textContent = exportFileNameOf((getActiveProject() || {}).title || uiTextFor("我的小说"));
    const hh = $("#path-history-hint");
    if (hh) {
      hh.textContent = pathPrefs.historyDir
        ? uiTextFor("每存一版历史都会往这个文件夹写一份 JSON，删版本时文件一起删。")
        : uiTextFor("现在只存在应用里。");
    }
    const gh = $("#path-global-hint");
    if (gh) {
      if (nativeApp()) {
        gh.hidden = true;
        gh.textContent = "";
      } else {
        gh.hidden = false;
        gh.textContent = fsaSaveSupported()
          ? uiTextFor("当前环境不能静默写文件夹：「导出 / 导入」走系统窗口，只有历史版本静默写入。")
          : uiTextFor("当前环境没有文件系统访问接口：导入 / 导出退回下载 / 选文件。");
      }
    }
  }

  function bindPathsPane() {
    const inputs = { import: "#path-import-dir", export: "#path-export-dir", history: "#path-history-dir" };
    PATH_KINDS.forEach((kind) => {
      const el = $(inputs[kind]);
      if (!el) return;
      // 输入框里回车＝把光标移出（等同于确认输入），不要触发「回车关闭设置」
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          el.blur();
        }
      });
    });
    const rule = $("#path-export-rule");
    if (rule)
      rule.addEventListener("input", () => {
        pathPrefs.exportName = rule.value;
        savePathPrefs();
        const prev = $("#path-preview");
        if (prev) prev.textContent = exportFileNameOf((getActiveProject() || {}).title || uiTextFor("我的小说"));
      });
  }

  // 只刷新当前子界面的动态内容（和切子界面时做的事一样，但不动 Agent 表单里正在填的内容）
  function renderActiveSettingsPane() {
    if (settingsPane === "chars") {
      renderManageGroups();
      renderManageRelKinds();
      renderRadarSettings();
      renderFieldsetPanel("char");
      renderRulePanes();
    } else if (settingsPane === "events") {
      renderManageLines();
      renderFieldsetPanel("event");
    } else if (settingsPane === "entries") {
      fillFieldsetScopeSelect();
      renderManageCats();
      renderFieldsetPanel("entry");
      renderRulePanes();
    } else if (settingsPane === "history") {
      renderHistory();
      syncAutoSaveUi();
    } else if (settingsPane === "privacy") {
      bindPrivacyPane();
      renderPrivacyPane(true);
    } else if (settingsPane === "paths") {
      renderPathsPane();
    }
    // 输入保护现在分散在三个子界面里：切界面 / 重画设置时都跟着刷新一遍
    renderFillProtect();
  }

