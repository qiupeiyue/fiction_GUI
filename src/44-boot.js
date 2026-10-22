  /* ================= 启动 ================= */
  function showBootError(msg) {
    const bar = document.getElementById("boot-error");
    if (!bar) return;
    bar.hidden = false;
    bar.setAttribute("data-boot-init", "1"); // 让页面里那条「版本自检」提示别盖掉这条更具体的错
    bar.textContent = msg;
  }

  /* 初始化失败的提示：这时候程序里的词条表可能还没跑起来，所以这里自带四语言 */
  function bootErrorText(err) {
    let lang = "";
    try {
      lang = localStorage.getItem("fiction_gui_ui_language_v1") || "";
    } catch (e) {
      /* ignore */
    }
    if (!/^(zh-CN|zh-TW|en|ja)$/.test(lang)) {
      const n = String((navigator && navigator.language) || "").toLowerCase();
      lang =
        n.indexOf("zh-hant") === 0 || n.indexOf("zh-tw") === 0 || n.indexOf("zh-hk") === 0
          ? "zh-TW"
          : n.indexOf("ja") === 0
          ? "ja"
          : n.indexOf("zh") === 0
          ? "zh-CN"
          : "en";
    }
    if (lang === "zh-TW") return `初始化出錯：${err}　→ 請按 Ctrl + Shift + R 強制重新整理；若仍報錯，請把這句話發給我。`;
    if (lang === "ja") return `初期化に失敗しました：${err}　→ Ctrl + Shift + R で強制再読み込みしてください。それでも直らない場合は、この文面を送ってください。`;
    if (lang === "en") return `Failed to start: ${err}　→ Press Ctrl + Shift + R to force reload; if it keeps failing, please send me this message.`;
    return `初始化出错了：${err}　→ 请按 Ctrl + Shift + R 强制刷新；若仍报错，请把这句话发给我。`;
  }

window.__APP_BUILD__ = "v1.3.1";
window.__APP_RELEASE_DATE__ = "2026-10-23";
// 当前这次构建的编号（从 app.js?v=… 里取）：用来确认「页面到底跑的是不是最新代码」
window.__APP_DEV__ = (function () {
  try {
    const s = document.querySelector('script[src*="app.js"]');
    const m = s && /\?v=([^"&]+)/.exec(String(s.getAttribute("src") || ""));
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
})();
  setWindowTitle();
// 使用说明里显示版本号与更新日期
(function fillHelpMeta() {
  try {
    const v = document.getElementById("help-version");
    const d = document.getElementById("help-date");
    // 正式发版时构建号＝版本号，就不再重复显示「· 构建 …」；开发中（d227 这种）才显示出来
    const dev = String(window.__APP_DEV__ || "");
    const buildNo = String(window.__APP_BUILD__ || "").replace(/^v/, "");
    if (v) v.textContent = (window.__APP_BUILD__ || "") + (dev && dev !== buildNo ? " · 构建 " + dev : "");
    if (d) d.textContent = window.__APP_RELEASE_DATE__ || "";
  } catch (e) { /* ignore */ }
})();

