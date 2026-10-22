/* 把 src/*.js 按 src/manifest.json 的顺序拼回 app.js。
   覆盖前检查 app.js 是不是「上次拼出来的那一份」——如果有人直接改了 app.js（没改 src），
   这里会拦下来，除非显式加 --force。 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const appFile = path.join(root, "app.js");
const stampFile = path.join(__dirname, ".buildhash");
const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, "manifest.json"), "utf8"));
const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");
const force = process.argv.includes("--force");

if (fs.existsSync(appFile) && fs.existsSync(stampFile)) {
  const now = sha1(fs.readFileSync(appFile, "utf8"));
  const last = String(fs.readFileSync(stampFile, "utf8")).trim();
  if (now !== last && !force) {
    console.log("** app.js 和上次拼出来的不一样：可能有人直接改了 app.js（而不是改 src/）。");
    console.log("   上次拼出的 sha1：" + last);
    console.log("   现在 app.js 的 sha1：" + now);
    console.log("   要丢掉 app.js 里这些改动就加 --force 再跑一次：node tools/build.js --force");
    process.exit(1);
  }
}

const parts = manifest.map((m) => fs.readFileSync(path.join(srcDir, m.file), "utf8"));
const out = parts.join("");
fs.writeFileSync(appFile, out, "utf8");
fs.writeFileSync(stampFile, sha1(out), "utf8");

/* 顺手换掉 index.html 里的缓存钥匙：
   <script src="app.js?v=1.1.1"> 这种地址在版本号不变时，浏览器会一直拿缓存里的旧 app.js
   （我们开发时没改版本号，改了代码页面却还是旧的，非常费解）。
   给 app.js / styles.css 的地址后面挂一个「内容指纹」，内容一变地址就变，浏览器自然会重新取。
   版本校验那段读的是 ?v=…（`&` 之前），所以这里加的 &b=… 不影响它。 */
const htmlFile = path.join(root, "index.html");
if (fs.existsSync(htmlFile)) {
  /* 版本号只有 src/44-boot.js 里那一个（window.__APP_BUILD__）。index.html 里 app.js?v=…
     是页面自检用的「期望版本」，两边必须一模一样：这里顺手把它们对齐，
     免得出现「页面 v1.1.0、脚本 v1.1.1」这种混版包（用户会看到版本不一致的报错）。 */
  const buildNo = (out.match(/window\.__APP_BUILD__\s*=\s*"(v?[\d.]+[^"]*)"/) || [])[1] || "";
  const ver = buildNo.replace(/^v/, "");
  const fp = sha1(out).slice(0, 8) + sha1(fs.readFileSync(path.join(root, "styles.css"), "utf8")).slice(0, 4);
  let html = fs.readFileSync(htmlFile, "utf8");
  const before = html;
  if (ver) {
    const stale = [];
    html = html.replace(/((?:app\.js|styles\.css)\?v=)([^&"']+)/g, (all, head, cur) => {
      if (cur === ver || !/^[\dA-Za-z.]+$/.test(cur)) return all; // 注释里那种「…」不动
      stale.push(cur + " → " + ver);
      return head + ver;
    });
    if (stale.length) console.log("index.html 版本号已对齐到 " + buildNo + "：" + stale.join("，"));
  }
  const stamp = (src) =>
    html.replace(new RegExp("(" + src + '\\?v=[^&"\']+)(&b=[0-9a-f]+)?', "g"), "$1&b=" + fp);
  html = stamp("app\\.js");
  html = stamp("styles\\.css");
  if (html !== before) fs.writeFileSync(htmlFile, html, "utf8");
  console.log("index.html 缓存钥匙：" + fp);
}

const sha = (s) => sha1(s).slice(0, 12);
console.log("已拼好 app.js：" + manifest.length + " 个模块 / " + out.split("\n").length + " 行 / sha1 " + sha(out));
