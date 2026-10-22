// 打包前把上一层（fiction_GUI）里最新的源码同步过来，保证 exe 用的是你刚改过的版本。
// vendor 也统一从根目录同步，避免维护两份完全相同的第三方文件。
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..");
const files = [
  "index.html",
  "app.js",
  "styles.css",
  "logo_adaa.ico",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARK.md",
];

for (const f of files) {
  fs.copyFileSync(path.join(srcDir, f), path.join(__dirname, f));
}

const vendorSrc = path.join(srcDir, "vendor");
const vendorDest = path.join(__dirname, "vendor");
fs.mkdirSync(vendorDest, { recursive: true });
for (const entry of fs.readdirSync(vendorSrc, { withFileTypes: true })) {
  if (entry.isFile()) {
    fs.copyFileSync(path.join(vendorSrc, entry.name), path.join(vendorDest, entry.name));
  }
}

console.log("已从上一层同步源码、许可证与 vendor");
