#!/usr/bin/env node
// 一键发版：自动加版本号 → 同步源码 → 打包 → 发布到 GitHub Releases。
// 用法：npm run release（或 node release.js）
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const readline = require("readline");

const wrapDir = __dirname; // wrap2exe
const srcDir = path.join(wrapDir, ".."); // fiction_GUI

// 自动把 package.json 的 patch 版本 +1（26.10.9 → 26.10.10），保证每次发版版本递增
function currentPackageVersion() {
  const pkgFile = path.join(wrapDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  return String(pkg.version || "0.0.0");
}

// 让用户选择这次发版是主版本 / 次版本 / 修订版
function askBumpType(currentVer) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n当前版本：${currentVer}`);
    console.log("请选择这次升级类型：");
    console.log("  0 = 不升版本：用当前版本号重新打包上传（覆盖 GitHub 上的同名安装包）");
    console.log("  1 = 主版本（大改动，如 1.0.0 → 2.0.0）");
    console.log("  2 = 次版本（新增功能，如 1.0.0 → 1.1.0）");
    console.log("  3 = 修订版（小修 / 修复，如 1.0.0 → 1.0.1）");
    rl.question("输入 0 / 1 / 2 / 3，直接回车默认 3：", (answer) => {
      rl.close();
      const a = String(answer || "").trim();
      if (a === "0") resolve("same");
      else if (a === "1") resolve("major");
      else if (a === "2") resolve("minor");
      else resolve("patch");
    });
  });
}

function bumpPackageVersion(bumpType, dryRun) {
  const pkgFile = path.join(wrapDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  if (bumpType === "same") return String(pkg.version || "0.0.0"); // 不升版本：原样重发
  const parts = String(pkg.version || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  if (bumpType === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (bumpType === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  pkg.version = parts.join(".");
  if (!dryRun) fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  return pkg.version;
}

/* 版本号只认「src/44-boot.js」里那一个 __APP_BUILD__：
   改这里 → 重新拼 app.js（index.html 的 ?v= 会跟着对齐）→ 页面自检和安装包版本才永远一致。
   以前是直接改 index.html / app.js 里的版本号，app.js 又是拼出来的，一重建就退回旧版本，
   于是出现过「页面 v1.1.0、脚本 v1.1.1」这种混版包（用户会看到版本不一致的报错）。 */
function bumpSourceVersion(pkgVer, opts) {
  const bootFile = path.join(srcDir, "src", "44-boot.js");
  if (!fs.existsSync(bootFile)) {
    console.warn("  没找到 src/44-boot.js，跳过源码版本号更新");
    return false;
  }
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  let s = fs.readFileSync(bootFile, "utf8");
  const before = s;
  const oldVer = (s.match(/window\.__APP_BUILD__\s*=\s*"v?([^"]+)"/) || [])[1] || "?";
  s = s.replace(/(window\.__APP_BUILD__\s*=\s*"v?)[^"]+(")/, "$1" + pkgVer + "$2");
  s = s.replace(/(window\.__APP_RELEASE_DATE__\s*=\s*")[^"]+(")/, "$1" + today + "$2");
  if (s === before) {
    console.warn("  源码里的版本号没变化（已经是 " + pkgVer + "？）");
    return false;
  }
  if (!opts.dryRun) fs.writeFileSync(bootFile, s, "utf8");
  console.log(`源码版本号：v${oldVer} → v${pkgVer}　发布日期：${today}`);
  return true;
}

// 发版前的自检：页面里的 ?v= 和 app.js 里的 __APP_BUILD__ 必须一模一样
function verifyVersions() {
  const page = (fs.readFileSync(path.join(srcDir, "index.html"), "utf8").match(/app\.js\?v=([^&"']+)/) || [])[1] || "";
  const script = (fs.readFileSync(path.join(srcDir, "app.js"), "utf8").match(/window\.__APP_BUILD__\s*=\s*"v?([^"]+)"/) || [])[1] || "";
  return { page, script, ok: !!page && page === script };
}

function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const f = path.join(wrapDir, ".release-token");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  return null;
}

// 把 README 里的安装包文件名版本号换成新版本
function updateReadme(oldVer, newVer, dryRun) {
  const readmeFile = path.join(srcDir, "README.md");
  if (!fs.existsSync(readmeFile)) {
    console.warn("未找到 README.md，跳过 README 版本更新。");
    return;
  }
  let s = fs.readFileSync(readmeFile, "utf8");
  const oldArtifact = `AdaaFictionGUI-Setup-${oldVer}.exe`;
  const newArtifact = `AdaaFictionGUI-Setup-${newVer}.exe`;
  let changed = false;
  if (s.includes(oldArtifact)) {
    s = s.split(oldArtifact).join(newArtifact);
    changed = true;
    console.log(`README 版本已更新：${oldArtifact} → ${newArtifact}`);
  } else {
    console.warn(`README 里没找到「${oldArtifact}」，跳过替换（不影响发版）。`);
  }
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // README 那行是中英双语的（> 当前版本 / Version：**x** ｜ 更新时间 / Updated：**y**）
  const metaRe = /> 当前版本(?: \/ Version)?：\*\*.*?\*\* ｜ 更新时间(?: \/ Updated)?：\*\*.*?\*\*/;
  const newMeta = `> 当前版本 / Version：**${newVer}** ｜ 更新时间 / Updated：**${today}**`;
  if (metaRe.test(s)) {
    const next = s.replace(metaRe, newMeta);
    if (next !== s) {
      s = next;
      changed = true;
      console.log(`README 版本与日期已更新：v${newVer} · ${today}`);
    }
  } else {
    console.warn("README 里没找到「当前版本 / 更新时间」那行，跳过日期更新。");
  }
  if (changed && !dryRun) fs.writeFileSync(readmeFile, s, "utf8");
}

// 把最新的 README 上传到 GitHub 仓库根目录
function uploadReadme(token) {
  const readmeFile = path.join(srcDir, "README.md");
  if (!fs.existsSync(readmeFile)) return;
  const content = fs.readFileSync(readmeFile, "utf8");

  // 从 package.json 的 publish 配置里读 owner / repo
  const pkg = JSON.parse(fs.readFileSync(path.join(wrapDir, "package.json"), "utf8"));
  const pub = (pkg.build && pkg.build.publish) || {};
  const owner = pub.owner || "qiupeiyue";
  const repo = pub.repo || "fiction_GUI";
  const filePath = "README.md";

  function req(method, url, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = body ? JSON.stringify(body) : null;
      const r = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method,
          headers: {
            Authorization: "Bearer " + token,
            "User-Agent": "fiction-gui",
            Accept: "application/vnd.github+json",
            ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
          },
        },
        (res) => {
          let b = "";
          res.on("data", (c) => (b += c));
          res.on("end", () => resolve({ status: res.statusCode, body: b }));
        }
      );
      r.on("error", reject);
      if (data) r.write(data);
      r.end();
    });
  }

  (async () => {
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const existing = await req("GET", getUrl);
    let sha = null;
    if (existing.status === 200) {
      sha = JSON.parse(existing.body).sha;
    }
    const body = {
      message: `docs: 更新 README 至 v${pkg.version}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    };
    const put = await req("PUT", getUrl, body);
    if (put.status === 200 || put.status === 201) {
      console.log("README 已同步到 GitHub。");
    } else {
      console.warn("README 上传失败（HTTP " + put.status + "），不影响安装包发布。");
      console.warn(put.body.slice(0, 400));
    }
  })().catch((e) => console.warn("README 上传出错：", e && e.message));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const oldPkgVer = currentPackageVersion();
  const bumpType = await askBumpType(oldPkgVer);
  const pkgVer = bumpPackageVersion(bumpType, dryRun);
  console.log(bumpType === "same" ? `重新发布当前版本：${pkgVer}（安装包会覆盖 GitHub 上的同名文件）` : `发布版本：${pkgVer}`);

  // 版本号只改源码那一处，再重新拼 app.js（index.html 的 ?v= 会自动对齐）
  bumpSourceVersion(pkgVer, { dryRun });
  if (dryRun) {
    console.log("（--dry-run：到这里为止，不改文件、不打包）");
    return;
  }
  execSync("node tools/build.js --force", { cwd: srcDir, stdio: "inherit" });
  const v = verifyVersions();
  if (!v.ok) {
    console.error(`\n版本自检没通过：页面 v${v.page || "?"} / 脚本 v${v.script || "?"} —— 两边必须一样，先别发版。`);
    process.exit(1);
  }
  console.log(`版本自检：页面 v${v.page} / 脚本 v${v.script} —— 一致 ✓`);
  updateReadme(oldPkgVer, pkgVer, dryRun);

  const token = readToken();
  if (!token) {
    console.error("\n没有找到 GitHub Token。\n请二选一：\n  1) 设置环境变量 GH_TOKEN；\n  2) 在 wrap2exe 下放一个 .release-token 文件（内容就是 token）。");
    process.exit(1);
  }
  process.env.GH_TOKEN = token;

  console.log("同步源码 → 打包 → 发布 GitHub Releases…");
  try {
    execSync("npm run dist -- --publish always", { cwd: wrapDir, stdio: "inherit", env: process.env });
    console.log(`\n发布完成！版本 ${pkgVer} 已上传到 GitHub。`);
    uploadReadme(token);
  } catch (err) {
    const msg = String((err && err.stdout) || "") + String((err && err.stderr) || "");
    if (msg.includes("403") || msg.includes("Resource not accessible")) {
      console.error("\n发布失败：Token 没有权限访问这个仓库的 Releases。");
      console.error("请到 GitHub 改这个 fine-grained token 的权限：");
      console.error("  · Repository access → 授权 qiupeiyue/fiction_GUI");
      console.error("  · Permissions → Contents → Read and write");
      console.error("改好后重新跑 npm run release。");
    } else {
      console.error("\n发布失败：", msg.slice(-800));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("发版脚本出错：", err);
  process.exit(1);
});
