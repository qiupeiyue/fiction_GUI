// electron-builder 的 afterPack 钩子：打包完成后给小说工坊.exe 写入自定义图标与版本信息。
// 为什么手动做：本机不是管理员、也没开开发者模式，winCodeSign 包里那几个 macOS 软链
// 会解压失败，所以把 electron-builder 的 signAndEditExecutable 关掉，改在这里用 rcedit 补上。
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// 从 app.js 的 __APP_BUILD__（如 "v1.0.0"）转成 Windows 四段版本号（1.0.0.0），
// 让 exe 文件属性里的版本和页面里的版本保持一致。
function buildVersion() {
  try {
    const src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    const m = src.match(/window\.__APP_BUILD__\s*=\s*"v(\d+\.\d+\.\d+)"/);
    if (m) return m[1] + ".0";
  } catch (e) { /* ignore */ }
  return "1.0.0.0";
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) return;

  const rcedit = path.join(__dirname, "build-tools", "rcedit-x64.exe");
  if (!fs.existsSync(rcedit)) {
    console.log("[afterPack] 找不到 rcedit，跳过图标 / 版本写入：", rcedit);
    return;
  }
  const icon = path.join(__dirname, "logo_adaa.ico");
  const ver = buildVersion();
  const args = [
    exePath,
    "--set-version-string", "FileDescription", "Adaa的小说工坊：多线剧情 · 人物档案 · 设定档案",
    "--set-version-string", "ProductName", "Adaa的小说工坊",
    "--set-version-string", "LegalCopyright", "Adaa",
    "--set-version-string", "CompanyName", "Adaa",
    "--set-version-string", "InternalName", "Adaa的小说工坊",
    "--set-file-version", ver,
    "--set-product-version", ver,
    "--set-icon", icon,
  ];
  execFileSync(rcedit, args, { stdio: "inherit" });
  console.log("[afterPack] 已写入图标与版本：", exePath);
};
