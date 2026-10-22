  /* ================= 应用内对话框（替代浏览器原生 prompt / confirm / alert） ================= */
  let uiPromptResolve = null;
  let uiConfirmResolve = null;
  let uiChoiceActive = false; // 多选确认框（uiChoose）正开着：它的回车自己处理
  let uiPromptSuggestReflow = null;
  const uiAttachSuggestReflows = new Set();
  uiOnZoomReflow(() => {
    if (uiPromptSuggestReflow) uiPromptSuggestReflow();
    uiAttachSuggestReflows.forEach((fn) => fn());
  });

  // opts.options：给一个「下拉 + 手输」二合一的候选列表（用 datalist）
  function uiPrompt(message, defaultValue, title, opts) {
    return new Promise((resolve) => {
      const modal = $("#ui-prompt-modal");
      if (!modal) {
        resolve(window.prompt(message, defaultValue));
        return;
      }
      if (uiPromptResolve) {
        uiPromptResolve(null);
        uiPromptResolve = null;
      }
      $("#ui-prompt-title").textContent = title || "输入";
      const msgEl = $("#ui-prompt-message");
      msgEl.textContent = message == null ? "" : String(message);
      msgEl.hidden = !String(msgEl.textContent).trim(); // 没话要说就把这行收起来，弹窗矮一点
      const input = $("#ui-prompt-input");
      /* opts.tones：[{key,label}] 这一排小按钮（地图上「坐标 / 比例尺」填名字时用，只有白 / 黑）。
         opts.tone：当前值；opts.onTone(key)：点了立刻回调，不用等「确定」。 */
      const colorRow = $("#ui-prompt-colors");
      if (colorRow) {
        const tones = opts && Array.isArray(opts.tones) ? opts.tones : [];
        colorRow.hidden = !tones.length;
        colorRow.innerHTML = tones.length
          ? `<span class="ui-prompt-colors-label">${esc(uiTextFor("图例"))}</span>` +
            tones
              .map(
                (t) =>
                  `<button type="button" class="btn btn-sm ui-tone-btn${
                    t.key === (opts && opts.tone) ? " selected" : ""
                  }" data-tone="${esc(t.key)}">${esc(t.label)}</button>`
              )
              .join("")
          : "";
        if (tones.length) {
          colorRow.querySelectorAll(".ui-tone-btn").forEach((b) =>
            b.addEventListener("click", () => {
              colorRow.querySelectorAll(".ui-tone-btn").forEach((n) => n.classList.toggle("selected", n === b));
              if (opts && typeof opts.onTone === "function") opts.onTone(b.dataset.tone);
            })
          );
        }
      }
      const dl = $("#ui-prompt-options");
      if (dl) dl.innerHTML = ""; // 不用浏览器自带的下拉（缩放 / 定位都不听话），下面自己做
      /* 候选列表：自己做一个小面板，贴在输入框正下方（宽度和输入框一样），
         和界面其它菜单一个样子。输入时就过滤，点（或回车）就填进输入框。 */
      const panel = $("#ui-prompt-suggest");
        /* 候选可以给纯字符串，也可以给 { value, label }（label 是显示出来的字，比如分级缩进过的
           「　→A2」；value 是真正填进输入框的值）；还可以给一个**函数**——
           那就每次画候选时现算（势力「所属」要这样：选了 A1 之后当场把 A1 的子级也列出来）。 */
        const optionsOf = () => {
          const raw = typeof (opts && opts.options) === "function" ? opts.options(input.value) : opts && opts.options;
          return (Array.isArray(raw) ? raw : [])
            .map((v) =>
              v && typeof v === "object"
                ? { value: String(v.value == null ? "" : v.value), label: String(v.label == null ? v.value : v.label) }
                : { value: String(v), label: String(v) }
            )
            // 允许 value 为空串（「无」这一项＝清掉选择），只要有 label 就留着
            .filter((o) => o.value || o.label);
        };
      input.removeAttribute("list");
      let sugCur = -1;
        /* 点完一条候选之后不要马上收起来：势力「所属」要能接着往下钻（A1 → A2 → A3），
           这里给一个短暂的「保持打开」窗口，避开点击引起的 blur 关闭。 */
        let keepOpenUntil = 0;
      const closeSug = () => {
        if (panel) {
          panel.hidden = true;
          panel.innerHTML = "";
        }
        sugCur = -1;
      };
      const drawSug = () => {
          if (!panel) return closeSug();
        const q = foldVariant(String(input.value || "").trim()).toLowerCase();
          const hits = optionsOf()
            .filter((o) => !q || foldVariant(o.label).toLowerCase().includes(q) || foldVariant(o.value).toLowerCase().includes(q))
            .slice(0, 40);
        if (!hits.length) return closeSug();
        panel.innerHTML = hits
            .map(
              (o, i) =>
                `<div class="ui-suggest-item${i === sugCur ? " current" : ""}" data-v="${esc(o.value)}">${esc(
                  o.label
                )}</div>`
            )
          .join("");
        /* 挂到 body 上、用 fixed 定位：弹窗自己带滚动条（.modal-body 是 overflow:auto），
           贴在输入框下面的候选会被裁掉一半（「更改地点」就是），伸到外面才看得全 */
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = false;
        const ir = uiVisualRect(input);
        panel.style.left = uiZoomPx(ir.left);
        panel.style.top = uiZoomPx(ir.bottom + 4);
        panel.style.width = uiZoomPx(ir.width);
        panel.querySelectorAll(".ui-suggest-item").forEach((el) =>
          el.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            input.value = el.dataset.v;
              keepOpenUntil = Date.now() + 400;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              drawSug();
          })
        );
      };
      input.addEventListener("input", () => {
        sugCur = -1;
        drawSug();
      });
      uiPromptSuggestReflow = () => {
        if (!panel || panel.hidden || !input.isConnected) return;
        if (!input.closest(".modal-overlay:not([hidden])")) return;
        drawSug();
      };
      input.addEventListener("focus", drawSug);
        input.addEventListener("blur", () => {
          if (Date.now() < keepOpenUntil) return; // 刚点完候选：留着让用户继续往下选
          setTimeout(closeSug, 120);
        });
      input.addEventListener("keydown", (ev) => {
        if (!panel || panel.hidden) return;
        const items = Array.from(panel.querySelectorAll(".ui-suggest-item"));
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          sugCur = (sugCur + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items.forEach((el, i) => el.classList.toggle("current", i === sugCur));
        } else if (ev.key === "Enter" && sugCur >= 0 && items[sugCur]) {
          ev.preventDefault();
          input.value = items[sugCur].dataset.v;
          closeSug();
        } else if (ev.key === "Escape") {
          closeSug();
        }
      });
      input.value = defaultValue == null ? "" : String(defaultValue);
      uiPromptResolve = resolve;
      openModal("ui-prompt-modal");
      setTimeout(() => {
        input.focus();
        try {
          input.select();
        } catch (e) {
          /* ignore */
        }
      }, 30);
    });
  }

  /* 给任意输入框挂一个「程序自己的候选面板」（和 uiPrompt 里那套完全一样的外观）：
     贴在输入框正下方、宽度跟着输入框、输入就过滤；↑↓ 选、Enter 填、Esc 收、点一下也填。
     getOptions 可以是数组（[{value,label}] 或字符串）或函数（每次现算）。 */
  function uiAttachSuggest(input, getOptions) {
    if (!input || input.__uiSuggestBound) return null;
    input.__uiSuggestBound = true;
    const panel = document.createElement("div");
    panel.className = "ui-suggest";
    panel.hidden = true;
    document.body.appendChild(panel);
    let cur = -1;
    let keepOpenUntil = 0; // 同上：点完候选留着面板，方便分级往下选
    const close = () => {
      panel.hidden = true;
      panel.innerHTML = "";
      cur = -1;
    };
    const norm = (list) =>
      (list || [])
        .map((o) => (typeof o === "string" ? { value: o, label: o } : o))
        .filter((o) => o && (o.value || o.label)) // 同上：「无」的空 value 也要留着
        .slice(0, 60);
    const draw = () => {
      const options = norm(typeof getOptions === "function" ? getOptions(input) : getOptions);
      if (!options.length) return close();
      const q = foldVariant(String(input.value || "").trim()).toLowerCase();
      const hits = options.filter((o) => !q || foldVariant(o.value).toLowerCase().includes(q)).slice(0, 40);
      if (!hits.length) return close();
      panel.innerHTML = hits
        .map(
          (o, i) =>
            `<div class="ui-suggest-item${i === cur ? " current" : ""}" data-v="${esc(o.value)}">${esc(
              o.label || o.value
            )}</div>`
        )
        .join("");
      panel.hidden = false;
      const r = uiVisualRect(input);
      panel.style.left = uiZoomPx(r.left);
      panel.style.top = uiZoomPx(r.bottom + 4);
      panel.style.width = uiZoomPx(r.width);
      panel.querySelectorAll(".ui-suggest-item").forEach((el) =>
        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          input.value = el.dataset.v;
          keepOpenUntil = Date.now() + 400;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          draw();
        })
      );
    };
    uiAttachSuggestReflows.add(() => {
      if (!panel.hidden && input.isConnected) draw();
    });
    input.addEventListener("input", () => {
      cur = -1;
      draw();
    });
    input.addEventListener("focus", draw);
    input.addEventListener("blur", () => {
      if (Date.now() < keepOpenUntil) return;
      setTimeout(close, 120);
    });
    input.addEventListener("keydown", (ev) => {
      if (panel.hidden) return;
      const items = Array.from(panel.querySelectorAll(".ui-suggest-item"));
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        cur = (cur + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle("current", i === cur));
      } else if (ev.key === "Enter" && cur >= 0 && items[cur]) {
        /* 候选面板开着时，回车只是「选这一条」：别让它继续冒泡到
           「弹窗里回车＝保存并关闭」，不然在信息卡里选个人名就把卡片关了 */
        ev.preventDefault();
        ev.stopPropagation();
        input.value = items[cur].dataset.v;
        close();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation(); // 只收候选面板这一层，别把整个弹窗也取消掉
        close();
      }
    });
    return { close: close, redraw: draw };
  }

  function uiConfirm(message, title) {
    return new Promise((resolve) => {
      const modal = $("#ui-confirm-modal");
      if (!modal) {
        resolve(window.confirm(message));
        return;
      }
      if (uiConfirmResolve) {
        uiConfirmResolve(false);
        uiConfirmResolve = null;
      }
      $("#ui-confirm-title").textContent = title || "确认";
      $("#ui-confirm-message").textContent = message == null ? "" : String(message);
      uiConfirmResolve = resolve;
      openModal("ui-confirm-modal");
    });
  }

  let uiAlertResolve = null;
  let uiAlertQueue = Promise.resolve();

  // 多选项确认框（清空工作区用的三选一）：返回被选中项的 value；
  // 回车＝第一项（默认推荐），Esc＝标记 cancel 的那一项。
  function uiChoose(message, options, title, opts) {
    return new Promise((resolve) => {
      const modal = $("#ui-confirm-modal");
      const list = (options || []).filter(Boolean);
      if (!modal || !list.length) {
        const fallback = list.length ? list[0].value : null;
        const fields =
          opts && Array.isArray(opts.inputs)
            ? opts.inputs
            : opts && opts.input && typeof opts.input === "object"
            ? [opts.input]
            : [];
        if (fields.length) {
          const values = {};
          fields.forEach((f, i) => {
            values[f.key || String(i)] = String((f && f.value) || "");
          });
          resolve({ choice: fallback, values });
        } else {
          resolve(fallback);
        }
        return;
      }
      const foot = modal.querySelector(".modal-foot");
      const bodyEl = modal.querySelector(".modal-body");
      uiChoiceActive = true;
      $("#ui-confirm-title").textContent = title || "请选择";
      const msgEl = $("#ui-confirm-message");
      msgEl.textContent = message == null ? "" : String(message);
      msgEl.hidden = !String(msgEl.textContent).trim(); // 没话要说就把正文整块收起来
      // 按钮不放弹窗底部，而是摆在弹窗正中间（所以整条底栏先收起来）
      const footWasHidden = foot ? foot.hidden : true;
      if (foot) foot.hidden = true;
      const cancelValue = (list.find((o) => o.cancel) || {}).value;
      const inputOpts =
        opts && Array.isArray(opts.inputs)
          ? opts.inputs.filter(Boolean)
          : opts && opts.input && typeof opts.input === "object"
          ? [opts.input]
          : [];
      const inputWraps = [];
      const inputEls = [];
      inputOpts.forEach((inputOpt, i) => {
        const inputWrap = document.createElement("label");
        inputWrap.className = "ui-choice-input-wrap";
        const label = document.createElement("span");
        label.className = "ui-choice-input-label";
        label.textContent = inputOpt.label || uiTextFor("保存文件名");
        const inputEl = document.createElement(inputOpt.type === "select" ? "select" : "input");
        if (inputOpt.type === "select") {
          inputEl.className = "ui-choice-select ui-enter-confirm";
          (inputOpt.options || []).forEach((o) => {
            const opt = document.createElement("option");
            opt.value = String(o.value == null ? "" : o.value);
            opt.textContent = String(o.label == null ? o.value : o.label);
            inputEl.appendChild(opt);
          });
          const has = Array.from(inputEl.options).some((o) => o.value === String(inputOpt.value == null ? "" : inputOpt.value));
          inputEl.value = has ? String(inputOpt.value) : (inputEl.options[0] && inputEl.options[0].value) || "";
        } else {
          inputEl.type = "text";
          inputEl.className = "ui-choice-input";
          inputEl.value = inputOpt.value == null ? "" : String(inputOpt.value);
        }
        inputEl.placeholder = inputOpt.placeholder == null ? "" : String(inputOpt.placeholder);
        if (inputOpt.tip) inputEl.title = inputOpt.tip;
        const controlRow = document.createElement("div");
        controlRow.className = "ui-choice-input-row";
        controlRow.appendChild(inputEl);
        if (inputOpt.button) {
          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "btn btn-sm ui-choice-input-btn";
          pick.textContent = String(inputOpt.button);
          pick.addEventListener("click", async () => {
            if (typeof inputOpt.onButton !== "function") return;
            pick.disabled = true;
            try {
              const value = await inputOpt.onButton(inputEl);
              if (value != null) inputEl.value = String(value);
            } finally {
              pick.disabled = false;
            }
          });
          controlRow.appendChild(pick);
        }
        inputWrap.appendChild(label);
        inputWrap.appendChild(controlRow);
        if (bodyEl) bodyEl.appendChild(inputWrap);
        else if (foot) foot.appendChild(inputWrap);
        inputWraps.push(inputWrap);
        inputEls.push(inputEl);
      });
      // 排一行的（四个选项）：弹窗放宽一点，名字才放得下
      const added = [];
      const row = document.createElement("div");
      // opts.row＝四个选项排一行（删「链接」关系那种）；名字太长就用 … 收尾
      row.className = "ui-choice-row" + (opts && opts.row ? " one-row" : "");
      const box = modal.querySelector(".modal");
      const oneRow = !!(opts && opts.row);
      const wider = oneRow && !!(opts && opts.wider);
      // 注意 .modal-small 的选择器权重比 .modal-wide 高，得一起换掉才真的变宽
      if (box) {
        box.classList.toggle("modal-wide", oneRow && !wider);
        box.classList.toggle("modal-wider", wider);
        box.classList.toggle("modal-small", !oneRow);
      }
      if (bodyEl) bodyEl.appendChild(row);
      else if (foot) foot.appendChild(row);
      if (row)
        list.forEach((o) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className =
            "btn ws-choice-btn" +
            (o.primary ? " btn-primary" : "") +
            (o.danger ? " btn-danger" : "") +
            (o.cancel ? " ui-cancel" : "");
          b.textContent = o.label;
          if (o.tip) b.title = o.tip;
          b.addEventListener("click", () => finish(o.value));
          row.appendChild(b);
          added.push(b);
        });
      let done = false;
      const head = modal.querySelector(".modal-head .ui-cancel");
      const onHeadClose = () => finish(cancelValue);
      const onMask = (e) => {
        if (e.target !== modal) return;
        if (Date.now() - modalOpenedAt < 300) return;
        finish(cancelValue);
      };
      const finish = (v) => {
        if (done) return;
        done = true;
        const values = {};
        inputOpts.forEach((f, i) => {
          values[f.key || String(i)] = inputEls[i] ? inputEls[i].value : "";
        });
        uiChoiceActive = false;
        document.removeEventListener("keydown", onKey, true);
        modal.removeEventListener("mousedown", onMask);
        if (head) head.removeEventListener("click", onHeadClose);
        added.forEach((b) => b.remove());
        inputWraps.forEach((w) => w.remove());
        msgEl.hidden = false;
        row.remove();
        if (foot) foot.hidden = footWasHidden;
        modal.hidden = true;
        // 复原成确认框本来的宽度，别的弹窗（uiConfirm / uiAlert）还要用
        if (box) {
          box.classList.remove("modal-wide");
          box.classList.remove("modal-wider");
          box.classList.add("modal-small");
        }
        resolve(inputEls.length ? { choice: v, values } : v);
      };
      const onKey = (ev) => {
        if (document.querySelector(".ui-select-panel")) return; // 下拉面板开着时，回车 / Esc 先归它
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          finish(list[0].value);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          finish(cancelValue === undefined ? null : cancelValue);
        }
      };
      document.addEventListener("keydown", onKey, true);
      modal.addEventListener("mousedown", onMask);
      if (head) head.addEventListener("click", onHeadClose);
      openModal("ui-confirm-modal");
      // 多选框：焦点给第一项（推荐项），回车就是它
      if (inputEls[0]) {
        try {
          inputEls[0].focus({ preventScroll: true });
          inputEls[0].select();
        } catch (e) {
          /* ignore */
        }
      } else if (added[0]) {
        try {
          added[0].focus({ preventScroll: true });
        } catch (e) {
          /* ignore */
        }
      }
    });
  }
  function uiAlert(message, title) {
    uiAlertQueue = uiAlertQueue.then(
      () =>
        new Promise((resolve) => {
          const modal = $("#ui-alert-modal");
          if (!modal) {
            window.alert(message);
            resolve();
            return;
          }
          $("#ui-alert-title").textContent = title || "提示";
          $("#ui-alert-message").textContent = message == null ? "" : String(message);
          uiAlertResolve = () => {
            uiAlertResolve = null;
            closeModal("ui-alert-modal");
            resolve();
          };
          openModal("ui-alert-modal");
        })
    );
    return uiAlertQueue;
  }

  function bindUiDialogs() {
    const promptInput = $("#ui-prompt-input");
    const promptOk = $("#ui-prompt-ok");
    if (promptOk) {
      promptOk.addEventListener("click", () => {
        if (!uiPromptResolve) return;
        const value = promptInput ? promptInput.value : "";
        const done = uiPromptResolve;
        uiPromptResolve = null;
        uiPromptSuggestReflow = null;
        closeModal("ui-prompt-modal");
        done(value);
      });
    }
    if (promptInput) {
      promptInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (promptOk) promptOk.click();
        }
      });
    }
    $$("#ui-prompt-modal .ui-cancel").forEach((b) =>
      b.addEventListener("click", () => {
        if (!uiPromptResolve) return;
        const done = uiPromptResolve;
        uiPromptResolve = null;
        uiPromptSuggestReflow = null;
        closeModal("ui-prompt-modal");
        done(null);
      })
    );
    const confirmOk = $("#ui-confirm-ok");
    if (confirmOk) {
      confirmOk.addEventListener("click", () => {
        if (!uiConfirmResolve) return;
        const done = uiConfirmResolve;
        uiConfirmResolve = null;
        closeModal("ui-confirm-modal");
        done(true);
      });
    }
    $$("#ui-confirm-modal .ui-cancel").forEach((b) =>
      b.addEventListener("click", () => {
        if (!uiConfirmResolve) return;
        const done = uiConfirmResolve;
        uiConfirmResolve = null;
        closeModal("ui-confirm-modal");
        done(false);
      })
    );
    const alertOk = $("#ui-alert-ok");
    if (alertOk) alertOk.addEventListener("click", () => uiAlertResolve && uiAlertResolve());
    $$("#ui-alert-modal .ui-ok-close").forEach((b) =>
      b.addEventListener("click", () => uiAlertResolve && uiAlertResolve())
    );
    // Esc 关闭当前的应用内对话框
    document.addEventListener("keydown", (ev) => {
      // 回车＝确定（确认框；提示框、多选框各自处理自己的回车）
      if (
        ev.key === "Enter" &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        !ev.altKey &&
        uiConfirmResolve &&
        !uiChoiceActive &&
        !$("#ui-confirm-modal").hidden
      ) {
        const t = ev.target;
        const tag = String((t && t.tagName) || "").toUpperCase();
        // 弹窗里的按钮自己认回车；焦点留在弹窗外面的按钮上时也要能确认
        const inDlg = !!(t && t.closest && t.closest(".modal-overlay:not([hidden])"));
        if (tag !== "TEXTAREA" && !(tag === "BUTTON" && inDlg) && !document.querySelector(".context-menu:not([hidden])")) {
          ev.preventDefault();
          const ok = $("#ui-confirm-ok");
          if (ok) ok.click();
          return;
        }
      }
      if (ev.key !== "Escape") return;
      if (uiAlertResolve && $("#ui-alert-modal") && !$("#ui-alert-modal").hidden) {
        ev.preventDefault();
        ev.stopImmediatePropagation(); // 别让「Esc 退出批量」这条全局快捷键再跑一遍
        uiAlertResolve();
        return;
      }
      if (uiConfirmResolve && $("#ui-confirm-modal") && !$("#ui-confirm-modal").hidden) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const done = uiConfirmResolve;
        uiConfirmResolve = null;
        closeModal("ui-confirm-modal");
        done(false);
        return;
      }
      if (uiPromptResolve && $("#ui-prompt-modal") && !$("#ui-prompt-modal").hidden) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const done = uiPromptResolve;
        uiPromptResolve = null;
        closeModal("ui-prompt-modal");
        done(null);
      }
    });
  }

  function uniqueProjectTitle(title) {
    const base = title || uiTextFor("我的小说");
    if (!projects.some((p) => p.title === base)) return base;
    let i = 2;
    while (projects.some((p) => p.title === base + " (" + i + ")")) i++;
    return base + " (" + i + ")";
  }

  function renderProjectSelect() {
    const sel = $("#project-select");
    sel.innerHTML = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
    sel.value = activeProjectId || "";
  }

  async function setActiveProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (typeof novelBeforeLeave === "function") await novelBeforeLeave();
    if (typeof novelResetForProject === "function") novelResetForProject();
    activeProjectId = id;
    state = p.data;
    lineFilterClear();
    selectedCategoryId = null;
    entrySortDir = "asc";
    selectedTaskId = null;
    ensureData();
    saveState();
    resetUndoHistory();
    renderAll();
  }

  /* ================= 清空工作区 =================
     顶栏「清空工作区」：二次确认，三个选项——
     仅清空工作区（保留文本分析结果）/ 清空全部内容（连分析结果一起清）/ 取消。
     回车＝第一个选项，Esc＝取消；清空本身也能用 Ctrl+Z 撤销。 */
  async function clearWorkspaceFlow() {
    const choice = await uiChoose(
      "", // 正文不写字：要清什么、能不能撤销，都放在每个按钮的悬停提示里
      [
        {
          label: "仅清空工作区",
          value: "workspace",
          primary: true,
          tip: uiTextFor("仅清空工作区：只清人物、设定、事件，文本分析结果保留"),
        },
        {
          label: "清空全部内容",
          value: "all",
          danger: true,
          tip: uiTextFor("清空全部内容：人物、设定、事件，以及文本分析结果都清掉"),
        },
        { label: "取消", value: "cancel", cancel: true, tip: uiTextFor("什么都不做，工作区保持原样") },
      ],
      "清空工作区"
    );
    if (!choice || choice === "cancel") return;
    clearWorkspace(choice === "all");
  }

  function clearWorkspace(includeAnalysis) {
    pendingUndoLabel = includeAnalysis ? "清空全部内容" : "清空工作区";
    // 工作区内容：人物 / 分组 / 关系 / 事件 / 章 / 节 / 线路 / 设定档案
    state.characters = [];
    state.groups = [];
    state.relations = [];
    state.events = [];
    state.order = [];
    state.chapters = [];
    state.lines = [];
    state.settings = { categories: [], entries: [], groups: [], seeded: false };
    // 文本分析：只有「清空全部内容」才连结果一起清
    if (includeAnalysis) state.analysis = { tasks: [] };
  // 保留分析结果时，「已填入」标记也要一起清掉：工作区已经空了，
  // 这些结果理应能重新填一遍（否则会出现「填过一次就再也填不进去」）。
  else {
    (state.analysis.tasks || []).forEach((t) => {
      (t.results || []).forEach((r) => {
        r.applied = false;
      });
    });
  }
    // 各种界面状态复位
    selectedCategoryId = null;
    lineFilterClear();
    mergeSelectMode = false;
    mergeSelected = new Set();
    collapsedEventCards = new Set();
    expandedEventSets = new Set();
    expandedSetMembers = new Set();
    relFocusIds = new Set();
    relKindFilters = new Set();
    if (includeAnalysis) selectedTaskId = null;
    ensureData(); // 补回默认线路 / 龙套分组 / 默认设定类别
    if (typeof novelResetForProject === "function") novelResetForProject();
    saveState();
    renderAll();
    showToast(
      includeAnalysis
        ? "已清空全部内容：人物 / 设定 / 事件 + 文本分析结果（可 Ctrl+Z 撤销）"
        : "已清空工作区：人物 / 设定 / 事件（文本分析结果保留，可 Ctrl+Z 撤销）"
    );
    if (typeof novelSyncFilesToState === "function") novelSyncFilesToState("clear");
  }

  async function createProject() {
    const title = await uiPrompt("新小说的名称？");
    if (!title || !title.trim()) return;
    const p = {
      id: uid(),
      title: uniqueProjectTitle(title.trim()),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: defaultState(),
      log: [],
    };
    projects.push(p);
    await setActiveProject(p.id);
  }

  async function renameProject() {
    const p = getActiveProject();
    if (!p) return;
    const t = await uiPrompt("重命名小说？", p.title);
    if (t === null || !t.trim()) return;
    p.title = t.trim();
    saveState();
    renderProjectSelect();
  }

  // 复制到新小说：整本复制一份（名字叫「原名_副本」），复制完自动打开副本
  async function duplicateProject() {
    const p = getActiveProject();
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = uid();
    copy.title = uniqueProjectTitle(`${p.title}_副本`);
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    // 版本历史不跟着复制（存档里可能有很多整本快照，复制一份很占地方）；副本从空白历史开始
    copy.log = [];
    // 正文 .md 跟事件卡一一对应：副本不能继续指向原小说的文件，否则两本会互相覆盖。
    delete copy.novelDir;
    delete copy.novelOutputs;
    delete copy.lastExportAbs;
    delete copy.lastExportName;
    (copy.data && copy.data.events ? copy.data.events : []).forEach((e) => {
      if (e) delete e.novelFile;
    });
    projects.push(copy);
    // setActiveProject 里会 saveState + renderAll，所以副本会被存下来并立刻打开
    await setActiveProject(copy.id);
    showToast(`已复制为「${copy.title}」，并已打开`);
  }

  async function deleteProject() {
    const p = getActiveProject();
    if (!p) return;
    if (
      !(await uiConfirm(
        `删除小说「${p.title}」？\n\n删掉就找不回来了（不在「撤销」范围内），建议先「导出」备份。`
      ))
    )
      return;
    projects = projects.filter((x) => x.id !== p.id);
    if (projects.length === 0) {
      projects = [{ id: uid(), title: uiTextFor("我的小说"), createdAt: Date.now(), updatedAt: Date.now(), data: defaultState(), log: [] }];
    }
    activeProjectId = projects[0].id;
    state = getActiveProject().data;
    lineFilterClear();
    selectedCategoryId = null;
    selectedTaskId = null;
    ensureData();
    if (typeof novelResetForProject === "function") novelResetForProject();
    saveState();
    renderAll();
  }

  // 「龙套」是文本分析专用的固定分组：永远排在分组列表最后，不允许改名 / 移动
  function normalizeGroupOrder() {
    if (!Array.isArray(state.groups)) return;
    const extraId = extraGroupIdOf();
    if (!extraId) return;
    const i = state.groups.findIndex((g) => g && g.id === extraId);
    if (i >= 0 && i !== state.groups.length - 1) state.groups.push(state.groups.splice(i, 1)[0]);
  }

  /* 装备雷达图：全局的「默认顶点模板」（设置 → 全局字段 → 装备 → 雷达图 里编辑）。
     每张装备卡勾上「雷达图」时照这份模板初始化，之后各卡独立改名 / 增删顶点，互不影响。 */
  function defaultGearRadarAxes() {
    return [
      { key: "atk", label: uiTextFor("攻击"), desc: "" },
      { key: "def", label: uiTextFor("防御"), desc: "" },
      { key: "dur", label: uiTextFor("耐久"), desc: "" },
      { key: "rare", label: uiTextFor("稀有"), desc: "" },
    ];
  }

  function ensureGearRadar() {
    if (!state.gearRadar || typeof state.gearRadar !== "object" || Array.isArray(state.gearRadar)) state.gearRadar = {};
    const r = state.gearRadar;
    // 默认是「启用」（老存档没有这个字段，不能因为补了这个开关就把雷达图关掉）
    if (typeof r.enabled !== "boolean") r.enabled = true;
    if (!Array.isArray(r.axes) || !r.axes.length) r.axes = defaultGearRadarAxes();
    r.axes = r.axes
      .filter((a) => a && typeof a === "object")
      .map((a, i) => ({
        key: String(a.key || "g" + i),
        label: String(a.label == null ? "" : a.label),
        desc: String(a.desc == null ? "" : a.desc),
      }));
  }

  /* ================= 类别的「追加功能」（目前只有雷达图这一项） =================
     cat.radar = {
       feature: 设置里「追加功能 → 雷达图」勾没勾（勾了才有这一栏 / 输入保护那一行 / 卡片那一栏）,
       enabled: 雷达图栏里那个「启用 / 禁用」（禁用＝卡片里不显示，数值留着）,
       axes:    这个类别的默认顶点模板（每张卡可以各自改）
     }
     装备沿用老存档的 state.gearRadar（载入时搬一次到装备类别上），之后一律读 cat.radar。 */
  function defaultRadarAxesFor(cat) {
    if (cat && catKind(cat) === "gear") return defaultGearRadarAxes();
    // 其它类别给一组通用的顶点名：维度1 / 维度2（英文界面就是 Axis1 / Axis2）
    return [1, 2].map((i) => ({ key: "ax" + i, label: uiTextFor("维度") + i, desc: "" }));
  }
  function ensureCatRadar(cat) {
    if (!cat) return null;
    if (!cat.radar || typeof cat.radar !== "object" || Array.isArray(cat.radar)) cat.radar = {};
    const r = cat.radar;
    if (typeof r.feature !== "boolean") r.feature = catKind(cat) === "gear"; // 装备默认就带这个功能
    if (typeof r.enabled !== "boolean") r.enabled = true;
    if (!Array.isArray(r.axes) || !r.axes.length) r.axes = defaultRadarAxesFor(cat);
    r.axes = r.axes
      .filter((a) => a && typeof a === "object")
      .map((a, i) => ({
        key: String(a.key || "ax" + i),
        label: String(a.label == null ? "" : a.label),
        desc: String(a.desc == null ? "" : a.desc),
      }));
    return r;
  }
  /* 这一类能不能加雷达图（纪年那种按时间读的列表类别不提供） */
  function catSupportsRadar(cat) {
    return !!cat && catKind(cat) !== "era";
  }
  function catRadarFeatureOn(cat) {
    const r = ensureCatRadar(cat);
    return !!(r && r.feature);
  }
  /* 「这个类别的雷达图现在开着吗」＝追加功能勾了、顶点也不是空的
     （「启用 / 禁用」那个按钮已经去掉：勾选本身就是开关） */
  function catRadarOn(cat) {
    const r = ensureCatRadar(cat);
    return !!(r && r.feature && r.axes.length);
  }
  function catRadarAxes(cat) {
    const r = ensureCatRadar(cat);
    return r ? r.axes : [];
  }
  /* 输入保护里雷达图那一行的 key（按类别分，装备读一次老的 gear:radar） */
  function catRadarProtectKey(catId) {
    return "entry:" + catId + ":radar";
  }

  function ensureData() {
    if (!Array.isArray(state.groups)) state.groups = [];
    if (!Array.isArray(state.characters)) state.characters = [];
    if (!Array.isArray(state.charChains)) state.charChains = []; // 人物链（同一个人不同时期 / 另一个身份，不合并）
    if (!Array.isArray(state.lines)) state.lines = [];
    if (!Array.isArray(state.events)) state.events = [];
    if (!Array.isArray(state.order)) state.order = [];
    if (!state.fieldSchemas || typeof state.fieldSchemas !== "object") state.fieldSchemas = {};
    // 字段清单：没落过盘的项目按当前界面语言落一份（存下来，之后切语言不再变；
    // 锁定的那几个字段另外走 schemaFieldValue 的中文原名兜底，识别照旧对得上）
    if (!state.fieldSchemas.char) state.fieldSchemas.char = localizedFieldsetDefs("char");
    if (!state.fieldSchemas.event) state.fieldSchemas.event = localizedFieldsetDefs("event");
    if (!state.fieldSchemas.entry || typeof state.fieldSchemas.entry !== "object") state.fieldSchemas.entry = {};
    ensureRadar();
    ensureGearRadar(); // 装备雷达图的老存档（state.gearRadar）：只在迁移时读一次
    /* 老存档的装备雷达图搬进「装备」类别的 cat.radar（没搬过才搬） */
    {
      const cats = (state.settings && state.settings.categories) || [];
      const gearCat = cats.find((c) => c && catKind(c) === "gear");
      if (gearCat && (!gearCat.radar || typeof gearCat.radar !== "object")) {
        gearCat.radar = {
          feature: true,
          enabled: state.gearRadar.enabled !== false,
          axes: JSON.parse(JSON.stringify(state.gearRadar.axes || [])),
        };
      }
      cats.forEach((c) => ensureCatRadar(c));
      cats.forEach((c) => ensureCatTree(c)); // 「树型拓扑」追加功能（技能树那一类默认带着）
    }
    ensurePedigree(); // 人物分析的「系谱」（自己一份数据，不碰人物卡）
    if (!state.settings || typeof state.settings !== "object") state.settings = { categories: [], entries: [], seeded: false };
    if (!Array.isArray(state.settings.categories)) state.settings.categories = [];
    if (!Array.isArray(state.settings.entries)) state.settings.entries = [];
    if (!state.analysis || typeof state.analysis !== "object") state.analysis = { tasks: [] };
    /* 雷达打分依据（radarWhy）是**给 Agent 看的内部材料**，不是人物 / 条目信息（用户 2026-10-17）：
       它只该留在文本分析的 results 里、跟着分析任务走（删掉任务就一起没了）。
       老版本曾经抄到人物卡 / 条目卡上，这里一次性清掉。 */
    (state.characters || []).forEach((c) => {
      if (c && Object.prototype.hasOwnProperty.call(c, "radarWhy")) delete c.radarWhy;
    });
    (state.settings.entries || []).forEach((en) => {
      if (en && Object.prototype.hasOwnProperty.call(en, "radarWhy")) delete en.radarWhy;
    });
    // 清理历史遗留的宽泛别名（「父亲」「学生」「我」…）：它们会让自动合并把不同的人并成一个
    (state.characters || []).forEach((c) => {
      if (!Array.isArray(c.aliases) || !c.aliases.length) return;
      const kept = c.aliases.filter((a) => !isTooGenericAlias(a));
      if (kept.length !== c.aliases.length) c.aliases = kept;
    });
    initFillProtect(); // 文本分析的「输入保护」设置
    ensurePrivacy(); // 隐私设置：小说那把锁（存坏了的当没锁）
    ensureMergeRules(); // 「自定义识别合并规则」（人物 / 设定档案）
    pruneCharChains(); // 人物链：成员被删掉 / 合并掉之后，不足两人的链自动散掉
    prunePedigree(); // 系谱：人物被删掉之后，对象清掉、结合线清掉、子对象悬空
    /* 默认字段里这几项和条目自带的「关联人物」重复，不再要了：
       物品 → 持有者、纪年 / 势力 → 相关人物。老项目里也一并清掉
       （只清这几个类别里这几条默认字段，用户自己另加的同名字段不动）。 */
    const DUP_FIELDS_BY_KIND = { item: ["持有者"], era: ["相关人物"], faction: ["相关人物"] };
    (state.settings.categories || []).forEach((c) => {
      const drop = DUP_FIELDS_BY_KIND[catKindByName(c && c.name)];
      if (!drop) return;
      if (Array.isArray(c.fieldTemplate)) {
        const kept = c.fieldTemplate.filter((f) => drop.indexOf(String(f == null ? "" : f).trim()) < 0);
        if (kept.length !== c.fieldTemplate.length) c.fieldTemplate = kept;
      }
    });
    (state.settings.entries || []).forEach((en) => {
      const cat = en && en.categoryId ? getCat(en.categoryId) : null;
      const drop = cat ? DUP_FIELDS_BY_KIND[catKindByName(cat && cat.name)] : null;
      if (!drop) return;
      if (Array.isArray(en.fields)) {
        const kept = en.fields.filter((f) => !f || drop.indexOf(String(f.label == null ? "" : f.label).trim()) < 0);
        if (kept.length !== en.fields.length) en.fields = kept;
      }
    });
    if (!Array.isArray(state.analysis.tasks)) state.analysis.tasks = [];
    state.analysis.tasks.forEach((t) => {
      if (!Array.isArray(t.files)) t.files = [];
      if (!Array.isArray(t.results)) t.results = [];
      if (!Array.isArray(t.segments)) t.segments = [];
      // 老数据没有这个标记：当作「没自己改过名」（有文件的任务不会再被自动改名）
      if (typeof t.nameEdited !== "boolean") t.nameEdited = false;
      // 老数据的结果顺序号按「文件顺序 → 章节顺序」重新编号一次
      renumberResults(t);
      // 章 / 节标题里的排版假空格（PDF 取字常见：「第 一 章  风 的 脚 步」）统一整理
      t.segments.forEach((s) => {
        if (s && s.label) s.label = normalizeSegLabel(s.label);
      });
    });

    if (!state.settings.seeded) {
      state.settings.categories = state.settings.categories.concat(defaultCategories());
      state.settings.seeded = true;
    }
    // 老项目补上「势力」类别（只补一次，之后删掉不会再自动出现）
    if (!state.settings.factionSeeded) {
      if (!state.settings.categories.some((c) => catKind(c) === "faction")) {
        state.settings.categories.push({
          id: uid(),
          kind: "faction",
          name: catDefaultName("势力"),
          icon: "🏛",
          color: CAT_COLORS[3],
          fieldTemplate: catDefaultFields(["类型", "立场", "控制区域", "领袖", "简介"]),
        });
      }
      state.settings.factionSeeded = true;
    }
    // 老项目补上「地点」类别（只补一次，之后删掉不会再自动出现）
    if (!state.settings.placeSeeded) {
      if (!state.settings.categories.some((c) => catKind(c) === "place")) {
        state.settings.categories.splice(Math.min(2, state.settings.categories.length), 0, {
          id: uid(),
          kind: "place",
          name: catDefaultName("地点"),
          icon: "🗺",
          color: CAT_COLORS[4],
          fieldTemplate: catDefaultFields(["类型", "位置", "归属 / 控制者", "气候 / 地貌", "重要事件", "简介"]),
        });
      }
      state.settings.placeSeeded = true;
    }
    // 老项目补上「装备」类别（只补一次，之后删掉不会再自动出现）
    if (!state.settings.gearSeeded) {
      if (!state.settings.categories.some((c) => catKind(c) === "gear")) {
        state.settings.categories.push({
          id: uid(),
          kind: "gear",
          name: catDefaultName("装备"),
          icon: "⚔",
          color: CAT_COLORS[5] || CAT_COLORS[0],
          layout: "grid",
          fieldTemplate: catDefaultFields(["种类", "外观", "功能 / 用途", "来历"]),
        });
      }
      state.settings.gearSeeded = true;
    }
    // 设定条目的分组（物品 / 名词 / 地点 / 势力 / 其他…都可以分组）
    state.settings.categories.forEach((c) => {
      if (c.layout !== "list" && c.layout !== "grid") c.layout = catKind(c) === "era" ? "list" : "grid";
    });
    normalizeCatOrder(); // 「纪年 / 地点 / 势力」固定在设定类别最前面
    migrateWarmColors(); // 主题去金色：老项目里存着的金色 / 暖色一次性换成新配色
    if (!Array.isArray(state.settings.groups)) state.settings.groups = [];
    const settingGroupIds = new Set(state.settings.groups.map((g) => g.id));
    state.settings.entries.forEach((en) => {
      if (typeof en.groupId !== "string") en.groupId = "";
      if (en.groupId && !settingGroupIds.has(en.groupId)) en.groupId = "";
      if (Array.isArray(en.tags)) en.tags = en.tags.map((t) => (t === "AI 识别" || t === "AI 識別" ? "AI" : t));
    });

    if (state.lines.length === 0) {
      state.lines.push({ id: uid(), code: "A", name: uiTextFor("主线"), kind: "明线", parentId: null, color: LINE_COLORS[0], note: "" });
    }

    // 龙套分组：自动创建（用于收纳路人 / 士兵 / 侍者等次要角色）
    const hasExtraGroup =
      state.groups.some((g) => g.special === "extra") ||
      state.groups.some((g) => g.name === "龙套" || g.name === uiTextFor("龙套"));
    if (!hasExtraGroup) {
      state.groups.push({ id: uid(), name: uiTextFor("龙套"), color: "#6b6480", special: "extra" });
    }
    // 「未分组」也在这里建出来（特殊分组，不能删；名字跟着新建时的语言）
    ensureUngroupedGroup();
    state.groups.forEach((g) => {
      if (typeof g.collapsed !== "boolean") g.collapsed = false;
    });
    ensureUngroupedGroup();
    normalizeGroupOrder();
    if (typeof state.ungroupedCollapsed !== "boolean") state.ungroupedCollapsed = false;

    state.characters.forEach((c) => {
      // 分析写回时打的标签统一成「AI」这种和语言无关的写法（老数据里存的是「AI 识别」）
      if (Array.isArray(c.tags)) c.tags = c.tags.map((t) => (t === "AI 识别" || t === "AI 識別" ? "AI" : t));
      if (c.groupId === undefined) c.groupId = "";
      if (c.groupId && !getGroup(c.groupId)) c.groupId = "";
      if (!c.color) c.color = CHAR_COLORS[0];
      if (!Array.isArray(c.aliases)) c.aliases = [];
      if (!Array.isArray(c.factionIds)) c.factionIds = [];
    });
    // 清理指向已不存在势力条目的关联
    const factionCat = findCatByKind("faction");
    const factionIds = new Set(
      factionCat ? state.settings.entries.filter((en) => en.categoryId === factionCat.id).map((en) => en.id) : []
    );
    state.characters.forEach((c) => {
      c.factionIds = c.factionIds.filter((id) => factionIds.has(id));
    });
      /* 势力层级兜底（plan.md 第 4 条：老存档不动，默认全是一级）：
         parentId 指向不存在 / 成环 / 算出层级超过三级 → 一律清成一级。 */
      if (factionCat) sanitizeFactionParents();
      // 老存档里可能有人同时挂在一级和它的子级上：只留最下层那条（边栏里不重复出现）
      if (factionCat) pruneCharacterFactionIds();
    state.events.forEach((e) => {
      if (!Array.isArray(e.characterIds)) e.characterIds = [];
    });
    state.lines.forEach((l) => {
      if (!l.color) l.color = LINE_COLORS[0];
      if (l.parentId && !getLine(l.parentId)) l.parentId = null;
    });

    const map = new Map(state.events.map((e) => [e.id, e]));
    state.order = state.order.filter((id) => map.has(id));
    state.events.forEach((e) => {
      if (!state.order.includes(e.id)) state.order.push(e.id);
    });
    const narIndex = new Map(state.order.map((id, i) => [id, i]));
    state.events.forEach((e) => {
      if (typeof e.storyIndex !== "number" || isNaN(e.storyIndex)) e.storyIndex = narIndex.get(e.id) ?? state.events.length;
      e.narrative = normNarrative(e.narrative);
      // 线路：迁移为集合，支持一个事件属于多条线路
      let ids = Array.isArray(e.lineIds) ? e.lineIds.filter((id) => getLine(id)) : [];
      if (!ids.length && e.lineId && getLine(e.lineId)) ids = [e.lineId];
      if (!ids.length) ids = [state.lines[0].id];
      e.lineIds = ids;
      delete e.lineId;
    });
    // 并行分析可能让两个事件落到同一个 storyIndex（同列挤两行、章 / 节范围算错）．
    // 载入时统一按当前顺序规整成唯一整数
    normalizeStoryIndexes();

    // 章 / 节
    if (!Array.isArray(state.chapters)) state.chapters = [];
    if (!Array.isArray(state.eventSets)) state.eventSets = [];
    state.chapters.forEach((c) => {
      if (!Array.isArray(c.sections)) c.sections = [];
      if (typeof c.collapsed !== "boolean") c.collapsed = false;
      if (c.title) c.title = normalizeSegLabel(c.title);
      c.sections.forEach((s) => {
        if (typeof s.collapsed !== "boolean") s.collapsed = false;
        if (s.title) s.title = normalizeSegLabel(s.title);
      });
    });
    state.events.forEach((e) => {
      if (typeof e.chapterId !== "string") e.chapterId = "";
      if (typeof e.sectionId !== "string") e.sectionId = "";
      if (!e.eventSetAssign || typeof e.eventSetAssign !== "object" || Array.isArray(e.eventSetAssign)) e.eventSetAssign = {};
      if (e.chapterId && !getChapter(e.chapterId)) e.chapterId = "";
      if (e.sectionId && !getSection(e.sectionId)) e.sectionId = "";
    });
    // 人物关系
    if (!Array.isArray(state.relations)) state.relations = [];
    state.relations = state.relations.filter(
      (r) => r && getChar(r.fromId) && getChar(r.toId) && r.fromId !== r.toId
    );
    // 关系类型：内置几种之外，用户还可以自己新建（名字 + 颜色）
    ensureRelKinds();

    if (!selectedCategoryId || !getCat(selectedCategoryId)) {
      selectedCategoryId = state.settings.categories.length ? state.settings.categories[0].id : null;
    }
    // 载入 / 规整数据后，把历史遗留的章 / 节空洞、冲突和回退顺序修一遍。
    orderedByStoryCache.rev = -1;
    axisRowsCache.rev = -1;
    repairChapterContinuity();
    repairSectionContinuity();
  }

  // 按 id 建索引：getChar / getEvent / getLine 这类会被渲染时成千上万次调用，
  // 原来每次都是 O(n) 的 find，事件一多整屏重画就卡。按数据版本缓存成 Map，查一次 O(1)。
  let lookupIndexCache = { rev: -1 };
  function lookupIndexes() {
    if (lookupIndexCache.rev === stateDataRev && lookupIndexCache.char) return lookupIndexCache;
    const section = new Map();
    (state.chapters || []).forEach((c) =>
      (c.sections || []).forEach((s) => section.set(s.id, { chapter: c, section: s }))
    );
    lookupIndexCache = {
      rev: stateDataRev,
      char: new Map((state.characters || []).map((c) => [c.id, c])),
      event: new Map((state.events || []).map((e) => [e.id, e])),
      eventSet: new Map((state.eventSets || []).map((s) => [s.id, s])),
      line: new Map((state.lines || []).map((l) => [l.id, l])),
      group: new Map((state.groups || []).map((g) => [g.id, g])),
      cat: new Map(((state.settings && state.settings.categories) || []).map((c) => [c.id, c])),
      entry: new Map(((state.settings && state.settings.entries) || []).map((e) => [e.id, e])),
      chapter: new Map((state.chapters || []).map((c) => [c.id, c])),
      section,
    };
    return lookupIndexCache;
  }
  function getChar(id) {
    return id == null ? undefined : lookupIndexes().char.get(id);
  }
  function getEvent(id) {
    return id == null ? undefined : lookupIndexes().event.get(id);
  }
  function getEventSet(id) {
    return id == null ? null : lookupIndexes().eventSet.get(id) || null;
  }
  function getLine(id) {
    return id == null ? undefined : lookupIndexes().line.get(id);
  }
  function getGroup(id) {
    return id == null ? undefined : lookupIndexes().group.get(id);
  }
  function getCat(id) {
    return id == null ? undefined : lookupIndexes().cat.get(id);
  }
  function getEntry(id) {
    return id == null ? undefined : lookupIndexes().entry.get(id);
  }

  function extraGroupIdOf() {
    const g = state.groups.find((x) => x.special === "extra") || state.groups.find((x) => x.name === "龙套");
    return g ? g.id : null;
  }

  /* ---- 程序自带的「未分组」：可以改名 / 拖动 / 删除 ----
     它就是一个普通分组（special === "none"），没有归组的人物挂在它下面。
     万一被删掉，人物会临时落到一个虚拟的「未分组」桶里，重新载入时会再建一个。 */
  const UNGROUPED_SPECIAL = "none";
  function ungroupedGroupOf() {
    return (state.groups || []).find((g) => g && g.special === UNGROUPED_SPECIAL) || null;
  }
  function ungroupedId() {
    const g = ungroupedGroupOf();
    return g ? g.id : "";
  }
  function isUngroupedGid(gid) {
    const ug = ungroupedId();
    return !gid || (ug && gid === ug);
  }
  // 人物归到哪个分组桶：没归组、或归到一个已经不存在 / 被删掉的分组 → 落到「未分组」
  function charBucketIdOf(c) {
    const gid = (c && c.groupId) || "";
    return isUngroupedGid(gid) || !getGroup(gid) ? ungroupedId() : gid;
  }
  // 新建分组 / 建「未分组」时的落点：用户分组之后、「未分组」之前、「龙套」之前
  function insertGroupBeforeUngrouped(g) {
    const un = ungroupedGroupOf();
    if (un) {
      state.groups.splice(state.groups.indexOf(un), 0, g);
      return;
    }
    const extraId = extraGroupIdOf();
    const i = extraId ? state.groups.findIndex((x) => x && x.id === extraId) : -1;
    state.groups.splice(i >= 0 ? i : state.groups.length, 0, g);
  }
  function ensureUngroupedGroup() {
    let g = ungroupedGroupOf();
    if (g) return g;
    g = { id: uid(), name: uiTextFor("未分组"), color: "#6b6480", special: UNGROUPED_SPECIAL, collapsed: false };
    insertGroupBeforeUngrouped(g);
    return g;
  }

  function getChapter(id) {
    return id == null ? null : lookupIndexes().chapter.get(id) || null;
  }

  function getSection(id) {
    return id == null ? null : lookupIndexes().section.get(id) || null;
  }

  function isExtraChar(c) {
    const gid = extraGroupIdOf();
    return !!gid && (c.groupId || "") === gid;
  }

  // 人物分组的统一显示顺序：普通分组（按用户顺序）→ 未分组 → 龙套（永远排在最后）
  function charGroupBucketsOrder() {
    const extraId = extraGroupIdOf();
    const out = [];
    let hasUngrouped = false;
    (state.groups || []).forEach((g) => {
      if (!g || g.id === extraId) return;
      if (g.special === UNGROUPED_SPECIAL) hasUngrouped = true;
      out.push({ id: g.id, group: g });
    });
    // 「未分组」被删掉时兜一个虚拟桶，人物不会没地方显示
    if (!hasUngrouped) out.push({ id: "", group: null });
    if (extraId) {
      const eg = getGroup(extraId);
      if (eg) out.push({ id: eg.id, group: eg });
    }
    return out;
  }

  // 分组下拉框：顺序和人物栏完全一致（普通分组 → 未分组 → 龙套）
  // withNew = true 时在最后加一项「＋ 新建…」（批量移动用）
  function charGroupOptionsHtml(withNew) {
    return (
      charGroupBucketsOrder()
      .map(({ id, group: g }) => `<option value="${esc(id)}">${esc(g ? groupDisplayName(g) : uiTextFor("未分组"))}</option>`)
        .join("") + (withNew ? `<option value="__new__">＋ 新建…</option>` : "")
    );
  }

  function orderedEvents() {
    const map = new Map(state.events.map((e) => [e.id, e]));
    const ordered = state.order.map((id) => map.get(id)).filter(Boolean);
    const known = new Set(ordered.map((e) => e.id));
    state.events.forEach((e) => {
      if (!known.has(e.id)) ordered.push(e);
    });
    return ordered;
  }

  function visibleEvents() {
    const evs = orderedEvents();
    if (!lineFilterOn()) return evs;
    return evs.filter(lineFilterHitsEvent);
  }

  // 按「故事时间」排序，并且只留下线路筛选选中的（二维事件图 / 时间线用）
  function storyEventsShown() {
    const all = orderedByStory();
    if (!lineFilterOn()) return all;
    return all.filter(lineFilterHitsEvent);
  }

  // 按「故事时间」排序（同时间再按叙述顺序）。
  // 事件多了以后（几百个）这个排序会被反复调用（选卡、拖拽、事件集…），按 state 数据版本缓存。
  let orderedByStoryCache = { rev: -1, val: null };
  function orderedByStory() {
    if (orderedByStoryCache.rev === stateDataRev && orderedByStoryCache.val) return orderedByStoryCache.val;
    const nar = new Map(state.order.map((id, i) => [id, i]));
    const val = state.events
      .slice()
      .sort((a, b) => (a.storyIndex || 0) - (b.storyIndex || 0) || (nar.get(a.id) ?? 0) - (nar.get(b.id) ?? 0));
    orderedByStoryCache = { rev: stateDataRev, val };
    return val;
  }

  // 把 storyIndex 规整成唯一、递增的整数，保持当前显示顺序不变。
  // 并行分析曾给不同事件算出同一个 storyIndex，导致它们挤进同一行。
  // 章 / 节的 (#N:M) 也跟着算错；载入和批量填入后各规整一次。
  function normalizeStoryIndexes() {
    const evs = orderedByStory();
    let changed = 0;
    evs.forEach((e, i) => {
      if (e.storyIndex !== i) {
        e.storyIndex = i;
        changed++;
      }
    });
    state.order = evs.map((e) => e.id);
    return changed;
  }

  /* 落点定下来之后调一次：只有真的产生了小数行号（插到两行之间 / 挤占下移会取中点）
     才规整成连续整数。顺序、章节、事件集、空章锚点都不受影响（锚点实测看不出来），
     好处是存档里永远是干净整数，「同一条缝反复插入」也不会把区间对半缩到浮点精度极限。
     成本＝一次 N log N 排序 + 一次赋值（几百到几千个事件都是亚毫秒级），
     而且这里只改数据、不触发重画，最后的渲染照旧只做一次。 */
  function normalizeStoryIndexesIfFractional() {
    const hasFraction = state.events.some((e) => !Number.isInteger(Number(e.storyIndex) || 0));
    if (!hasFraction) return false;
    const n = normalizeStoryIndexes();
    if (n) {
      orderedByStoryCache.rev = -1;
      axisRowsCache.rev = -1;
      bumpStateRev();
    }
    return !!n;
  }

  function isNonlinear(e) {
    return !!e.narrative && e.narrative !== "顺叙";
  }

  // 叙述方式只有「顺叙」和「插叙」两种：旧的「倒叙 / 倒序」一律并入「插叙」
  function normNarrative(v) {
    const s = String(v == null ? "" : v).trim();
    if (s === "倒叙" || s === "倒序") return "插叙";
    return s;
  }

  // 取一组事件里出现最多的某个字段值（用于判断这一行属于哪章 / 哪节）
  function dominantField(evs, key) {
    const tally = new Map();
    (evs || []).forEach((e) => {
      const v = e[key] || "";
      if (!v) return;
      tally.set(v, (tally.get(v) || 0) + 1);
    });
    let best = "";
    let bestN = 0;
    tally.forEach((n, v) => {
      if (n > bestN) {
        bestN = n;
        best = v;
      }
    });
    return best;
  }

  // 每一行的章节 / 节归属；空白行沿用上一行，避免把同一章切成带
  function rowDominants(rowEvents, key) {
    const out = [];
    let last = "";
    (rowEvents || []).forEach((evs) => {
      // 空白行沿用上一行的归属；有事件的行以它自己为准（可能是「未分章」）
      if (!evs || !evs.length) {
        out.push(last);
        return;
      }
      const v = dominantField(evs, key);
      last = v;
      out.push(v);
    });
    return out;
  }

  // 把「每行归属哪个章 / 节」压成连续的区间（区间用 0 起的行下标）
  function segsFromRowIds(rowEvents, rowIds, field) {
    const segs = [];
    (rowEvents || []).forEach((evs, r) => {
      const id = rowIds[r] || "";
      const last = segs[segs.length - 1];
      if (last && last[field] === id) last.endRow = r;
      else segs.push({ [field]: id, startRow: r, endRow: r });
    });
    return segs;
  }

  // 事件轴里各章 / 各节各自占哪些行（行号从 1 开始显示）。
  // 事件轴的分段带和章节栏共用它，所以两边的「（#N:M）」永远一致。
  // #N 是事件自己的属性：一律按**全量行**算，线路筛选（只看某几条线）不参与，
  // 否则一筛线，所有章节的（#N:M）就会跟着变。
  function axisBandRanges() {
    const rowEvents = axisRows().map((row) => row.items || []);
    return {
      chapterSegs: segsFromRowIds(rowEvents, rowDominants(rowEvents, "chapterId"), "chapterId"),
      sectionSegs: segsFromRowIds(rowEvents, rowDominants(rowEvents, "sectionId"), "sectionId"),
    };
  }

  // 事件所属的全部线路（兼容旧的单线路字段）
  function linesOf(e) {
    if (Array.isArray(e.lineIds) && e.lineIds.length) {
      const ids = e.lineIds.filter((id) => getLine(id));
      if (ids.length) return ids;
    }
    if (e.lineId && getLine(e.lineId)) return [e.lineId];
    return state.lines[0] ? [state.lines[0].id] : [];
  }

  function setEventLines(e, ids) {
    const clean = Array.from(new Set((ids || []).filter((id) => getLine(id))));
    e.lineIds = clean.length ? clean : [state.lines[0].id];
    delete e.lineId;
    // 事件还在事件集里时，换线后要把 eventSetAssign 一起迁到新线路上；
    // 否则集合卡 / 展开逻辑仍按旧线路找它，拖到别的线路就会看起来“丢了”。
    const setId = eventSetIdForEvent(e);
    if (setId) assignEventToSetAllLines(e, setId);
  }

  /* 换线路 / 新建之后：如果某个事件和**同一行**里别的卡片共用一条线路，两张卡会挤在同一格上。
     处理：把被操作的事件挪到「下一行」（这一行与下一行之间新开一行），章 / 节保持原样 ——
     不重算章节，免得顺手掉进下一章。返回挪了几个。 */
  function avoidLaneCollision(ids) {
    const list = Array.from(new Set((ids || []).filter(Boolean)));
    if (!list.length) return 0;
    let moved = 0;
    list.forEach((id) => {
      const e = getEvent(id);
      if (!e) return;
      // 事件集成员也照样要查：同一行**同一条线路**的成员就是叠在一起，必须顶下去；
      // 不同线路的成员共处一行是允许的（下面的 clash 判断只看线路交集，不会误伤）。
      const v = Number(e.storyIndex) || 0;
      const mine = linesOf(e);
      if (!mine.length) return;
      const clash = state.events.some((o) => {
        if (!o || o.id === e.id) return false;
        if ((Number(o.storyIndex) || 0) !== v) return false;
        return linesOf(o).some((L) => mine.includes(L));
      });
      if (!clash) return;
      // 下一行的值：这一行与下一行之间取中点（已经是最后一行就 +1）
      const vals = Array.from(new Set(state.events.map((x) => Number(x.storyIndex) || 0))).sort((a, b) => a - b);
      const r = vals.indexOf(v);
      if (r < 0) return;
      const nv = r >= vals.length - 1 ? v + 1 : (vals[r] + vals[r + 1]) / 2;
      if (!Number.isFinite(nv) || nv === v) return;
      e.storyIndex = nv;
      moved++;
    });
    if (moved) {
      // 「挪到下一行」是取中点：顺手把行号归整回连续整数
      normalizeStoryIndexesIfFractional();
      bumpStateRev();
    }
    return moved;
  }

  // 拖拽时按「列」决定线路：列没变就不动原有线路（多线事件也能保住其它线路）；
  // 列变了才换到落点线路；按住 Shift 则追加落点线路。
  function applyLaneChange(e, laneId, appendLines) {
    if (!e || !laneId) return false;
    const cur = linesOf(e);
    if (appendLines) {
      if (!cur.includes(laneId)) {
        setEventLines(e, cur.concat(laneId));
        return true;
      }
      return false;
    }
    if (!cur.includes(laneId)) {
      setEventLines(e, [laneId]);
      return true;
    }
    return false;
  }

  function lineTree() {
    const childrenOf = new Map();
    state.lines.forEach((l) => {
      const pid = l.parentId && getLine(l.parentId) ? l.parentId : null;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(l);
    });
    const roots = childrenOf.get(null) || [];
    roots.sort((a, b) => (a.kind === "明线" ? 0 : 1) - (b.kind === "明线" ? 0 : 1) || state.lines.indexOf(a) - state.lines.indexOf(b));
    const flat = [];
    const walk = (items, depth) => {
      items.forEach((l) => {
        flat.push({ line: l, depth });
        walk((childrenOf.get(l.id) || []).filter((k) => k.parentId === l.id), depth + 1);
      });
    };
    walk(roots, 0);
    return flat;
  }

