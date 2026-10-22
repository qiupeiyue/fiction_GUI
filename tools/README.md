# tools

`src/` 是唯一源码目录，`app.js` 由构建脚本拼接生成。不要直接修改 `app.js`。

## 常用命令

| 操作 | 命令 |
| --- | --- |
| 修改代码 | 编辑 `src/*.js`，模块清单见 `src/manifest.json` |
| 生成 `app.js` | `node tools/build.js --force` |
| 检查雷达证据 | `node tools/check-radar-evidence.js` |
| 生成雷达报告 | `node tools/radar-report.js <导出的 JSON>` |
| 启动桌面版 | `cd wrap2exe && npm start` |
| 打包 Windows 安装包 | `cd wrap2exe && npm run dist` |

## 构建规则

- `tools/build.js` 按 `src/manifest.json` 的顺序拼接模块，并同步更新 `index.html` 的缓存指纹与版本号。
- 构建前会检查 `app.js` 是否仍是上次生成的内容；如果直接改过 `app.js`，脚本会拒绝覆盖，除非显式加 `--force`。
- `tools/.buildhash` 是本地构建状态文件，不提交到 Git。
- `wrap2exe/index.html`、`app.js`、`styles.css`、`logo_adaa.ico`、`vendor/`、`LICENSE`、
  `THIRD_PARTY_NOTICES.md`、`TRADEMARK.md` 都由 `wrap2exe/sync-src.js` 从根目录同步，不提交。

## 回归

提交前至少运行：

```powershell
node tools/build.js --force
node --check app.js
node tools/check-radar-evidence.js
node --check plugins/character-report/main.js
node --check plugins/character-report/report.js
```

桌面版完整回归依赖 Electron / Playwright 环境，详见 `CONTRIBUTING.md`。
