  /* ================= 隐私设置：给「当前小说」或「整个工作区」加一把锁 =================
     说清楚一件事：这是界面级的锁（挡住操作、看不见内容），不是加密 ——
     存档文件本身还是能被懂行的人打开看。密码只存散列 + 盐，不存明文。

     小说这把锁跟着小说存档走（state.privacy，导出 / 换电脑都跟着走），
     工作区这把锁跟着程序走（本机 localStorage）。 */
  // WS_PRIVACY_KEY 定义在 02-store.js（设置那边也要用，先定义免得 TDZ）
  const PRIVACY_MIN_LEN = 4;

  /* 盐 + 多轮 FNV-1a：挡住「顺手翻一下存档」的人，不指望抗算力破解 */
  function privacyHash(pw, salt) {
    const s = String(salt || "") + "|" + String(pw == null ? "" : pw);
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let round = 0; round < 64; round++) {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i) + round;
        h1 = ((h1 ^ c) * 16777619) >>> 0;
        h2 = ((h2 + c * 31) ^ (h1 >>> 7)) >>> 0;
      }
    }
    return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
  }
  function privacyNewSalt() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function privacyNorm(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    if (!o.lock) return null;
    const hash = String(o.hash || "");
    if (!hash) return null;
    /* on＝这把锁现在开没开。取消勾选「锁定」只是把它关掉（密码留着，
       勾回来就恢复），要彻底删掉密码走「删除」。老存档没有 on → 当开着。 */
    return { lock: true, on: o.on !== false, user: String(o.user || ""), salt: String(o.salt || ""), hash };
  }
  // 这把锁现在真的在挡人吗（设过密码 + 开着）
  function privacyActive(info) {
    return !!info && info.on !== false;
  }
  // 当前小说那把锁（state 为空 / 没锁 → null）
  function novelPrivacy() {
    return state ? privacyNorm(state.privacy) : null;
  }
  // 工作区那把锁（存在本机）
  function workspacePrivacy() {
    try {
      return privacyNorm(JSON.parse(localStorage.getItem(WS_PRIVACY_KEY) || "null"));
    } catch (e) {
      return null;
    }
  }
  function privacyOf(kind) {
    return kind === "workspace" ? workspacePrivacy() : novelPrivacy();
  }
  function setPrivacyOf(kind, next) {
    if (kind === "workspace") {
      try {
        if (next) localStorage.setItem(WS_PRIVACY_KEY, JSON.stringify(next));
        else localStorage.removeItem(WS_PRIVACY_KEY);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    if (!state) return;
    if (next) state.privacy = next;
    else delete state.privacy;
  }
  function privacyVerify(info, pw) {
    return !!info && privacyHash(pw, info.salt) === info.hash;
  }
  function privacyPwOk(pw) {
    return String(pw == null ? "" : pw).length >= PRIVACY_MIN_LEN;
  }
  // 数据里的那把锁：每次读都规整一遍（坏数据当没锁）
  function ensurePrivacy() {
    if (!state) return;
    const p = privacyNorm(state.privacy);
    if (!p) delete state.privacy;
    else state.privacy = p;
  }

  /* ---- 锁定界面：整个程序盖一层毛玻璃，什么都点不了 ---- */
  let privacyAsk = null; // 正在问的那一次（同一时间只允许一个）
  let privacyLockedNow = false; // 现在是不是锁着（键盘也要让路）

  function privacyLocked() {
    return privacyLockedNow;
  }

  // 眼睛：密码框右上角那个小按钮，点一下在明 / 暗之间切换
  const PW_EYE_SVG_ON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5c4.4 0 7.6 3.2 9 6.5-1.4 3.3-4.6 6.5-9 6.5S4.4 15.3 3 12c1.4-3.3 4.6-6.5 9-6.5Zm0 2.2A4.3 4.3 0 1 0 16.3 12 4.3 4.3 0 0 0 12 7.7Zm0 2.2A2.1 2.1 0 1 1 9.9 12 2.1 2.1 0 0 1 12 9.9Z"/></svg>';
  const PW_EYE_SVG_OFF =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 4.4 4.6 3l16.4 16.4-1.4 1.4-3-3A10.6 10.6 0 0 1 12 18.5C7.6 18.5 4.4 15.3 3 12a11.4 11.4 0 0 1 3.4-4.4Zm4.3 5.7A4.3 4.3 0 0 0 12 16.3a4.2 4.2 0 0 0 1.8-.4l-1.6-1.6a2.1 2.1 0 0 1-2.5-2.5Zm4.5-4.7c4.4 0 7.6 3.2 9 6.5a11.6 11.6 0 0 1-2.6 3.7l-1.6-1.6a9.6 9.6 0 0 0 1.7-2.1c-1.3-2.6-3.8-4.4-6.5-4.4a6.9 6.9 0 0 0-2 .3L8.8 5.7A10.4 10.4 0 0 1 12 5.4Z"/></svg>';

  function pwEyeSet(btn, input, shown) {
    if (!btn || !input) return;
    input.type = shown ? "text" : "password";
    btn.innerHTML = shown ? PW_EYE_SVG_ON : PW_EYE_SVG_OFF;
    const key = shown ? "隐藏密码" : "显示密码";
    uiSetComposedTitle(btn, uiTextFor(key) || key);
  }
  // 给一个范围里所有 .pw-eye 接上「显示 / 隐藏」；放在弹窗打开时调一次就够
  function bindPwEyes(scope) {
    const root = scope || document;
    root.querySelectorAll(".pw-eye").forEach((btn) => {
      const input = root.querySelector("#" + btn.dataset.pwEye) || document.getElementById(btn.dataset.pwEye);
      if (!input) return;
      pwEyeSet(btn, input, false);
      if (btn.__pwBound) return;
      btn.__pwBound = true;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const shown = input.type === "text";
        pwEyeSet(btn, input, !shown);
        try {
          input.focus();
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  /* 问密码：mode="lock"＝解不开就一直盖着（Esc 不管用）；mode="verify"＝可以取消。
     返回 Promise<true|false>。 */
  function privacyAskPassword(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const box = $("#privacy-lock");
      const info = o.info || null;
      if (!box || !info) {
        resolve(false);
        return;
      }
      if (privacyAsk) privacyAsk(false); // 上一次先收掉
      const titleEl = $("#privacy-lock-title");
      const subEl = $("#privacy-lock-sub");
      const pw = $("#privacy-lock-pw");
      const errEl = $("#privacy-lock-err");
      const okBtn = $("#privacy-lock-ok");
      const cancelBtn = $("#privacy-lock-cancel");
      const soft = o.mode === "verify";
      titleEl.textContent = o.title || uiTextFor("请输入密码");
      subEl.textContent = "";
      subEl.hidden = true;
      pw.value = "";
      pw.type = "password";
      pw.placeholder = uiTextFor("密码");
      errEl.hidden = true;
      errEl.textContent = "";
      cancelBtn.hidden = !soft;
      okBtn.textContent = o.okText || uiTextFor("确定");
      bindPwEyes(box);
      box.hidden = false;
      privacyLockedNow = true; // 键盘全部让路（除非焦点在锁屏自己的输入框里）
      document.body.classList.add("privacy-locking");
      const finish = (ok) => {
        if (!privacyAsk) return;
        privacyAsk = null;
        box.hidden = true;
        privacyLockedNow = false;
        document.body.classList.remove("privacy-locking");
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("wheel", onWheel, true);
        resolve(ok);
      };
      const wrong = () => {
        errEl.textContent = uiTextFor("密码不正确");
        errEl.hidden = false;
        box.querySelector(".lock-card").classList.add("shake");
        setTimeout(() => box.querySelector(".lock-card").classList.remove("shake"), 500);
        pw.select();
      };
      const submit = () => {
        const v = String(pw.value || "");
        if (!v) {
          errEl.textContent = uiTextFor("请输入密码");
          errEl.hidden = false;
          return;
        }
        if (!privacyVerify(info, v)) {
          wrong();
          return;
        }
        finish(true);
      };
      // 锁屏自己的回车 / Esc：capture 先占住，免得被界面上的别的快捷键抢走
      function onKey(ev) {
        const inside = box.contains(ev.target);
        if (ev.key === "Enter" && (inside || !soft)) {
          ev.preventDefault();
          ev.stopPropagation();
          if (inside || document.activeElement === pw) submit();
          return;
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          if (soft) finish(false);
          return;
        }
        if (!inside) {
          // 锁着的时候，键盘快捷键一律不听（除了锁屏自己的输入框）
          ev.stopPropagation();
          if ((ev.ctrlKey || ev.metaKey) && ev.key !== "F5") ev.preventDefault();
        }
      }
      document.addEventListener("keydown", onKey, true);
      // 锁着的时候滚轮（含 Ctrl+滚轮缩放）也别听：界面在毛玻璃底下
      function onWheel(ev) {
        if (box.contains(ev.target)) return;
        ev.stopPropagation();
        if (ev.ctrlKey) ev.preventDefault();
      }
      document.addEventListener("wheel", onWheel, { capture: true, passive: false });
      okBtn.onclick = submit;
      cancelBtn.onclick = () => finish(false);
      setTimeout(() => {
        try {
          pw.focus();
        } catch (e) {
          /* ignore */
        }
      }, 30);
      privacyAsk = finish;
    });
  }

  /* 进入某本小说要过的那道锁（没锁＝直接放行）。
     soft＝可以点「取消」退出来（换小说时用：取消了就还在原来那本，
     不然用户碰到一本不知道密码的小说就出不来了）。 */
  async function requireNovelAccess(p, soft) {
    const info = privacyNorm(p && p.data && p.data.privacy);
    if (!privacyActive(info)) return true;
    return privacyAskPassword({
      info,
      mode: soft ? "verify" : "lock",
      title: uiSentence("privacyNovelLocked", String((p && p.title) || uiTextFor("我的小说"))),
    });
  }
  // 打开工作区要过的那道锁
  async function requireWorkspaceAccess() {
    const info = workspacePrivacy();
    if (!privacyActive(info)) return true;
    return privacyAskPassword({ info, mode: "lock", title: uiTextFor("工作区已锁定") });
  }
  // 打开界面时：先过工作区，再过当前这本小说
  async function privacyBootGate() {
    if (!(await requireWorkspaceAccess())) return;
    await requireNovelAccess(getActiveProject());
  }

  /* ---- 设置 → 隐私设置 ---- */
  const PRIVACY_COLS = [
    { key: "novel", prefix: "priv-novel", kind: "novel" },
    { key: "workspace", prefix: "priv-work", kind: "workspace" },
  ];
  // 界面上「锁定」勾成什么样（还没点「应用」）：null＝没动过，照存档里的来
  const privacyDraft = { novel: null, workspace: null };

  /* 句子里的名词：中文说「当前小说 / 工作区」，英文这些小写更顺
     （「已给当前小说加锁」/「Locked this fiction」） */
  const PRIVACY_WHAT = {
    "zh-CN": { novel: "当前小说", workspace: "工作区" },
    "zh-TW": { novel: "目前小說", workspace: "工作區" },
    en: { novel: "this fiction", workspace: "the workspace" },
    ja: { novel: "この小説", workspace: "ワークスペース" },
  };
  function privacyWhat(kind) {
    const m = PRIVACY_WHAT[uiLanguage()] || PRIVACY_WHAT["zh-CN"];
    return m[kind === "workspace" ? "workspace" : "novel"];
  }
  function privacyAskCurrentTitle(kind) {
    return uiSentence(kind === "workspace" ? "privacyAskCurrentWork" : "privacyAskCurrentNovel");
  }

  /* 密码框那套「暗文 / 眼睛」的状态：渲染、打字、清空都用它算一遍 */
  function privacySyncEye(c, pw, eye, wrap) {
    const info = privacyOf(c.kind);
    const hide = !!info && !String(pw.value || ""); // 已经有密码、又空着 → 只显示那串点
    if (eye) {
      eye.hidden = hide;
      eye.disabled = pw.disabled;
    }
    if (wrap) wrap.classList.toggle("no-eye", hide);
    if (hide && pw.type !== "password") pw.type = "password";
  }

  function renderPrivacyPane(reset) {
    if (reset) {
      privacyDraft.novel = null;
      privacyDraft.workspace = null;
    }
    const me = $("#priv-novel-name");
    const p = getActiveProject();
    if (me) me.textContent = p ? String(p.title || "") : "";
    PRIVACY_COLS.forEach((c) => {
      const info = privacyOf(c.kind);
      const box = $('[data-privacy-col="' + c.key + '"]');
      const lock = $("#" + c.prefix + "-lock");
      const pw = $("#" + c.prefix + "-pw");
      if (!box || !lock || !pw) return;
      const locked = !!info;
      const active = privacyActive(info);
      /* 勾选框＝这把锁现在开没开（设过密码的话，勾 / 取消勾是立刻生效的开关）。
         还没设过密码时，勾上只是「让这一栏能填」，等点了「应用」才真的有锁。 */
      const want = info ? active : privacyDraft[c.key] == null ? false : privacyDraft[c.key];
      if (reset) {
        pw.value = "";
        pw.type = "password";
      }
      lock.checked = want;
      /* 已经有密码时：输入框只显示一串「点」的暗文，眼睛也收起来（不能把已设的密码显示成明文）；
         还没设过密码 / 正在输新密码时，才给眼睛，方便看清自己输的是什么。 */
      pw.placeholder = locked ? "••••••••" : uiTextFor("密码（至少 4 位）");
      box.classList.toggle("privacy-off", !want);
      lock.disabled = false;
      pw.disabled = !want;
      const eye = $("#" + c.prefix + "-eye");
      const wrap = pw.closest(".pw-wrap");
      if (!pw.__privacyKeyBound) {
        pw.__privacyKeyBound = true;
        pw.addEventListener("input", () => privacySyncEye(c, pw, eye, pw.closest(".pw-wrap")));
        /* 密码框的快捷键（和程序其它地方统一）：
           Enter＝应用（并移出光标）；Esc＝不采用（清空重来、移出光标）。 */
        pw.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            pw.blur();
            applyPrivacyCol(c.key, "apply");
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            pw.value = "";
            privacySyncEye(c, pw, eye, pw.closest(".pw-wrap"));
            pw.blur();
          }
        });
      }
      privacySyncEye(c, pw, eye, wrap);
      const note = $("#" + c.prefix + "-note");
      if (note) {
        note.hidden = !locked;
        if (locked)
          note.textContent = uiTextFor(
            active
              ? "已设置密码；留空＝不改，输入＝换新密码。"
              : "锁定已关闭（密码还留着）：勾上「锁定」就能重新打开。"
          );
      }
      const a1 = $("#" + c.prefix + "-apply");
      const a2 = $("#" + c.prefix + "-del");
      if (a1) a1.disabled = !want;
      // 「删除」＝真的解除锁定（要先输当前密码）：没勾锁定、或本来就没锁，都灰着
      if (a2) a2.disabled = !want || !locked;
      const stateEl = $("#" + c.prefix + "-state");
      if (stateEl) {
        stateEl.textContent = uiTextFor(active ? "已锁定" : "未锁定");
        stateEl.classList.toggle("on", active);
      }
    });
    bindPwEyes($("#settings-modal") || document);
  }

  // 应用 / 删除：已经锁着的话，先让人输一遍当前密码
  async function applyPrivacyCol(colKey, action) {
    const c = PRIVACY_COLS.find((x) => x.key === colKey);
    if (!c) return;
    const cur = privacyOf(c.kind);
    const isNovel = c.kind === "novel";
    const who = privacyWhat(c.kind);
    const pwEl = $("#" + c.prefix + "-pw");
    if (!pwEl) return;
    const wantPw = String(pwEl.value || "");
    // 没通过（密码不对 / 太短 / 取消）＝不采用：把输入框清干净，别留一串奇怪的点
    const dropInput = () => {
      pwEl.value = "";
      privacySyncEye(c, pwEl, $("#" + c.prefix + "-eye"), pwEl.closest(".pw-wrap"));
    };
    // 已经有一把锁：改密码 / 删掉它都得先验证当前密码
    if (cur) {
      const ok = await privacyAskPassword({
        info: cur,
        mode: "verify",
        title: privacyAskCurrentTitle(c.kind),
      });
      if (!ok) {
        dropInput();
        return;
      }
    }
    if (action === "delete") {
      if (!cur) return;
      setPrivacyOf(c.kind, null);
      pendingUndoLabel = uiSentence("privacyRemoved", who);
      if (isNovel) saveState();
      renderPrivacyPane(true);
      showToast(uiSentence("privacyRemoved", who));
      return;
    }
    // 首次加锁：密码必填；改锁：留空＝不改密码
    let pw = wantPw;
    if (!pw && !cur) {
      showToast(uiTextFor("请先输入密码（至少 4 位）"));
      dropInput();
      return;
    }
    if (pw && !privacyPwOk(pw)) {
      showToast(uiTextFor("密码至少 4 位"));
      dropInput();
      return;
    }
    const next = {
      lock: true,
      on: true, // 点「应用」＝这把锁开着
      user: "",
      salt: cur && !pw ? cur.salt : privacyNewSalt(),
      hash: cur && !pw ? cur.hash : "",
    };
    if (pw) next.hash = privacyHash(pw, next.salt);
    setPrivacyOf(c.kind, next);
    pendingUndoLabel = uiSentence(cur ? "privacyChanged" : "privacyAdded", who);
    if (isNovel) saveState();
    renderPrivacyPane(true);
    showToast(uiSentence(cur ? "privacyChanged" : "privacyAdded", who));
  }

  function bindPrivacyPane() {
    const modal = $("#settings-modal");
    if (!modal || modal.__privacyBound) return;
    modal.__privacyBound = true;
    PRIVACY_COLS.forEach((c) => {
      const lock = $("#" + c.prefix + "-lock");
      if (lock)
        lock.addEventListener("change", () => {
          const info = privacyOf(c.kind);
          const active = privacyActive(info);
          const who = privacyWhat(c.kind);
          const after = (label) => {
            pendingUndoLabel = label;
            if (c.kind === "novel") saveState();
            renderPrivacyPane(true);
            showToast(label);
          };
          // ① 关掉这把锁：要输一次当前密码（密码留着，没删）
          if (info && active && !lock.checked) {
            lock.checked = true; // 先放回勾上，密码对了再真正关掉
            renderPrivacyPane();
            (async () => {
              const ok = await privacyAskPassword({ info, mode: "verify", title: privacyAskCurrentTitle(c.kind) });
              if (!ok) return;
              setPrivacyOf(c.kind, Object.assign({}, info, { on: false }));
              after(uiSentence("privacyLockOff", who));
            })();
            return;
          }
          // ② 重新打开（密码还留着）：不用再输一遍
          if (info && !active && lock.checked) {
            setPrivacyOf(c.kind, Object.assign({}, info, { on: true }));
            after(uiSentence("privacyLockOn", who));
            return;
          }
          // ③ 还没设过密码：这里只是让这一栏能填，等「应用」才真的有锁
          privacyDraft[c.key] = lock.checked;
          renderPrivacyPane();
        });
      const a1 = $("#" + c.prefix + "-apply");
      if (a1) a1.addEventListener("click", () => applyPrivacyCol(c.key, "apply"));
      const a2 = $("#" + c.prefix + "-del");
      if (a2) a2.addEventListener("click", () => applyPrivacyCol(c.key, "delete"));
    });
    bindPwEyes(modal);
  }
