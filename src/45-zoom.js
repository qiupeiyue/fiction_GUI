  /* ================= 界面缩放：Ctrl+滚轮 / Ctrl+0 ================= */
  // 类似浏览器：Ctrl+滚轮整页缩放，Ctrl+0 回到 100%。用 CSS zoom，布局会跟着重排，
  // 浏览器和打包后的 Electron（Chromium）都能用；缩放比例记在 localStorage。
  const UI_ZOOM_KEY = "fiction_gui_ui_zoom_v1";
  const UI_ZOOM_MIN = 0.5;
  const UI_ZOOM_MAX = 2.0;
  const UI_ZOOM_STEP = 0.05;
  let uiZoom = 1.0;
  let uiZoomWheelAccum = 0;

  function clampUiZoom(v) {
    return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Math.round(v * 100) / 100));
  }

  function applyUiZoom(v, notify) {
    uiZoom = clampUiZoom(v);
    window.__APP_UI_ZOOM__ = uiZoom;
    document.documentElement.style.zoom = String(uiZoom);
    try { localStorage.setItem(UI_ZOOM_KEY, String(uiZoom)); } catch (e) { /* ignore */ }
    /* 缩放一变，贴着鼠标 / 元素的浮层（悬浮气泡、右键菜单、下拉面板、人名说明、拖拽幽灵…）
       全都要按新比例重放位置，否则它们会停在旧位置上、离鼠标很远（用户 2026-10-16 报的） */
    uiReflowFloatingLayers();
    syncUiZoomInput(); // 顶栏那个框跟着变（Ctrl+滚轮走的是同一个函数，两边永远一致）
    if (notify) showToast(`界面缩放 ${Math.round(uiZoom * 100)}%`);
  }

  /* 顶栏的缩放框：显示当前比例；用户正在里面输入时别去打断他 */
  function syncUiZoomInput() {
    const el = document.getElementById("ui-zoom-input");
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = Math.round(uiZoom * 100) + "%";
    el.placeholder = Math.round(uiZoom * 100) + "%";
  }

  /* 输入框里那个数字怎么读——只有这一套换算，读出来照样交给上面的 applyUiZoom（和 Ctrl+滚轮同一个入口）：
       带 % 的按百分比（"80%"→0.8）；不带 % 的，≤3 当比例（"0.8"→0.8、"1"→1、"1.5"→1.5），
       >3 当百分比（"80"→0.8、"120"→1.2）。读不出正数就返回 null（保持原样不动）。 */
  function zoomFromText(txt) {
    const raw = String(txt == null ? "" : txt).trim();
    const n = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return clampUiZoom(raw.indexOf("%") >= 0 || n > 3 ? n / 100 : n);
  }

  function initUiZoomInput() {
    const el = document.getElementById("ui-zoom-input");
    if (!el) return;
    el.title = uiTextFor("界面缩放（和 Ctrl + 滚轮同一个功能）：输入百分比，回车确定，Esc 取消");
    // 下拉档位：每 25% 一档（也能直接敲数字）
    const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200];
    syncUiZoomInput();
    /* 下拉用程序自己的小面板（.ui-select-panel：10.5px 小字、宽度跟着内容走），
       不用浏览器自带的 datalist —— 那个又宽、字又大。 */
    let panel = null;
    let cur = -1;
    function onDocDown(ev) {
      if (panel && !panel.contains(ev.target) && ev.target !== el) closePanel();
    }
    function closePanel() {
      if (panel) {
        panel.remove();
        panel = null;
      }
      document.removeEventListener("mousedown", onDocDown, true);
    }
    function placePanel() {
      if (!panel || !el.isConnected) return;
      const r = uiVisualRect(el);
      panel.style.left = uiZoomPx(r.left);
      panel.style.minWidth = uiZoomPx(r.width);
      const ph = uiVisualRect(panel).height;
      const below = r.bottom + 4 + ph < window.innerHeight - 6;
      panel.style.top = uiZoomPx(below ? r.bottom + 4 : Math.max(6, r.top - ph - 4));
    }
    uiOnZoomReflow(placePanel);
    const paint = () => {
      if (panel) Array.from(panel.children).forEach((x, i) => x.classList.toggle("current", i === cur));
    };
    const pick = (i) => {
      const p = ZOOM_STEPS[i];
      closePanel();
      if (p != null) {
        applyUiZoom(p / 100, true); // 和 Ctrl+滚轮同一个入口
        el.value = p + "%";
        el.blur(); // 选完就收工（失焦时会再对一次显示）
      }
    };
    const openPanel = () => {
      closePanel();
      const now = Math.round(uiZoom * 100);
      panel = document.createElement("div");
      panel.className = "ui-select-panel";
      panel.innerHTML = ZOOM_STEPS.map(
        (p) => `<div class="ui-select-item${p === now ? " current" : ""}" data-p="${p}">${p}%</div>`
      ).join("");
      document.body.appendChild(panel);
      cur = Math.max(0, ZOOM_STEPS.indexOf(now));
      placePanel();
      paint();
      Array.from(panel.children).forEach((x) =>
        x.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          pick(ZOOM_STEPS.indexOf(parseInt(x.dataset.p, 10)));
        })
      );
      document.addEventListener("mousedown", onDocDown, true);
    };
    el.addEventListener("focus", () => {
      el.select(); // 选好当前的百分比，直接敲数字就会替换掉
      openPanel();
    });
    el.addEventListener("input", () => closePanel()); // 开始打字就把面板收起来
    const commit = () => {
      const v = zoomFromText(el.value);
      if (v === null) syncUiZoomInput(); // 没写数字：退回当前比例
      else applyUiZoom(v, true); // 和 Ctrl+滚轮同一个入口
      el.blur();
    };
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!panel) return openPanel();
        cur = Math.max(0, Math.min(ZOOM_STEPS.length - 1, cur + (ev.key === "ArrowDown" ? 1 : -1)));
        return paint();
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        if (panel) return pick(cur); // 面板开着＝按选中的那一档
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        if (panel) closePanel();
        syncUiZoomInput(); // 先退回当前值再失焦，失焦触发的 change 读到的就是原值
        el.blur();
      }
    });
    // 从下拉里选一项 / 失焦，都走同一套换算
    el.addEventListener("change", commit);
    el.addEventListener("blur", () => {
      closePanel();
      syncUiZoomInput();
    });
  }

  function initUiZoom() {
    initUiZoomInput();
    try {
      const v = parseFloat(localStorage.getItem(UI_ZOOM_KEY));
      if (Number.isFinite(v)) uiZoom = clampUiZoom(v);
    } catch (e) { /* ignore */ }
    window.__APP_UI_ZOOM__ = uiZoom;
    document.documentElement.style.zoom = String(uiZoom);
    syncUiZoomInput(); // 存的比例要显示在框里

    // capture 阶段拦截 Ctrl+滚轮，避免同时把下方内容滚走
    window.addEventListener(
      "wheel",
      (ev) => {
        if (!ev.ctrlKey && !ev.metaKey) {
          uiZoomWheelAccum = 0;
          return;
        }
        ev.preventDefault();
        uiZoomWheelAccum += ev.deltaY;
        // 一档鼠标滚轮约 ±100：攒够一档才改一次，触控板也能平滑累计
        while (uiZoomWheelAccum <= -100) {
          uiZoomWheelAccum += 100;
          applyUiZoom(uiZoom + UI_ZOOM_STEP, true);
        }
        while (uiZoomWheelAccum >= 100) {
          uiZoomWheelAccum -= 100;
          applyUiZoom(uiZoom - UI_ZOOM_STEP, true);
        }
      },
      { passive: false, capture: true }
    );

    window.addEventListener("keydown", (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const key = String(ev.key || "").toLowerCase();
      if (key === "0") {
        ev.preventDefault();
        applyUiZoom(1, true);
      }
    });
  }

  (async function boot() {
    // 兜底：万一初始化中途出错，界面不能一直藏着
    setTimeout(() => {
      try {
        document.documentElement.removeAttribute("data-i18n-pending");
      } catch (e) {
        /* ignore */
      }
    }, 1500);
    try {
      initUiZoom();
      loadFillOpts(); // 「过滤只提一句的人物 / 名词」的开关与阈值，读回上次的选择
      loadAutoSaveOpts(); // 自动保存开关与间隔，读回上次的选择
      loadPathPrefs(); // 「设置 → 路径」：导入 / 导出 / 历史版本的默认位置
      // 界面语言：安装向导里选的 / 上次在设置里选的
      document.documentElement.lang = uiLanguage();
      uiFoldInlineHints(); // 「?」的小气泡折成 title（气泡走程序自己的，不会被面板裁掉）
      bindUiLanguageObserver();
      applyUiLanguage();
      await loadApp();
      await loadPathHandles(); // 上次授权过的文件夹句柄
      bindUI();
      renderAll();
      /* 启动时不再静默把人物卡转成设定条目（用户 2026-10-17）：
         设定档案只接受「填入设定档案」写进来的分析结果和用户手动编辑；
         除非用户点「自动更新」，不从人物 / 事件等别处回填。 */
      await restoreUiStateAndTab();
      // 页签高亮：全新打开（本地还没有界面存档）时 restoreUiStateAndTab 会直接返回，
      // 没人调过 syncViewTabs，于是界面明明在事件轴，上面的「事件轴」页签却没点亮。
      syncViewTabs(currentTab);
      // 隐私锁：工作区 / 当前小说锁着的话，先要密码（盖一层毛玻璃，别的一概不能动）
      await privacyBootGate();
    } catch (e) {
      console.error(e);
      try {
        document.documentElement.removeAttribute("data-i18n-pending");
      } catch (err) {
        /* ignore */
      }
      showBootError(bootErrorText(e && e.message ? e.message : e));
    }
  })();
})();

