# 贡献指南 / Contributing

感谢提交问题、建议或代码。参与贡献即表示同意以本项目的 AGPL-3.0-or-later 许可证发布你的贡献。

Thanks for reporting issues, suggesting features or contributing code. By contributing, you agree that your contribution is licensed under this project's AGPL-3.0-or-later license.

## 开发流程 / Workflow

1. Fork 仓库并创建独立分支。
2. 修改 `src/`，不要直接编辑生成的 `app.js`。
3. 运行构建和检查。
4. 提交 Pull Request，说明改动范围、用户可见行为和测试方式。

1. Fork the repository and create a topic branch.
2. Edit `src/`. Do not edit the generated `app.js`.
3. Run the build and checks.
4. Open a pull request describing the change, user-visible behavior and test steps.

## 必跑检查 / Required checks

```powershell
node tools/build.js --force
node --check app.js
node tools/check-radar-evidence.js
node --check plugins/character-report/main.js
node --check plugins/character-report/report.js
```

涉及桌面版时，再运行：

For desktop changes, also run:

```powershell
cd wrap2exe
npm ci
npm start
```

## 不要提交 / Do not commit

- `node_modules/`、`wrap2exe/dist/`、`wrap2exe/build/`
- `wrap2exe/app.js`、`index.html`、`styles.css`、`logo_adaa.ico`、`vendor/`
- `.release-token`、`.npmrc`、API Key、私钥或其他凭据
- 用户导出文件、历史版本、生成的小说或 PDF
- `AGENTS.md`、`HANDOFF.md` 等内部交接文件

## 界面约定 / UI conventions

- 新功能必须补齐简体中文、繁體中文、English、日本語。
- 使用应用自己的面板、按钮、下拉框、气泡和右键菜单，不要使用浏览器原生控件外观。
- 说明文字从简；不要静默合并或覆盖用户数据。
- 修改弹窗时检查 Enter 确认、Esc 取消和输入框快捷键。

## 相关文档 / Related docs

- 源码构建：`tools/README.md`
- 人物档案插件：`plugins/character-report/README.md`
- 许可证：`LICENSE`
