# Adaa的小说工坊 · Adaa's Fiction Workshop

面向长篇小说的本地创作工具：人物档案、事件轴、设定档案与文本分析共用同一个工作区，边写边整理世界观与情节。

A local writing tool for long-form fiction. Character profiles, the storyboard, the setting library and text analysis share one workspace, so the world stays organized while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线 · 文本编辑 · 生成小说
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline · text editor · novel export

> 当前版本 / Version：**1.3.0** ｜ 更新时间 / Updated：**2026-10-20**
>
> 许可证 / License：**GNU AGPL v3 or later** ｜ GitHub：[qiupeiyue/fiction_GUI](https://github.com/qiupeiyue/fiction_GUI)

---

## 本版重点更新 / What's new in 1.3.0

### 新增：文本编辑 / New: MyText

事件轴新增「文本编辑」。左栏是章节与事件列表，单击打开事件卡，双击进入正文编辑。切换事件、切换页签都会先保存。
文本编辑正文框 `Enter` 换行，不触发保存。

The Story group gains MyText. The left pane lists chapters and events: click to open a card, double-click to write. Switching events or tabs saves first.
Enter inserts a newline in the editor instead of saving.


### 新增：生成小说 / New: Generate novel

文本编辑顶栏新增「生成小说」。弹窗可填写保存文件名、保存路径和格式。支持 Markdown、Word（.docx）、Pages（.pages）、EPUB 和 PDF。

MyText gains a Generate novel button. The dialog accepts a file name, a save folder and a format (Markdown, Word, Pages, EPUB and PDF).


### 导出目录 / Export folder

导出的 JSON 和生成的小说放在 `文档\fiction_GUI\output\<当前小说名>\`；每个事件的 Markdown 正文放在它的子文件夹 `\{当前小说名}_MyText\`。

Exported JSON and generated novels live under `Documents\fiction_GUI\output\<fiction name>\`; each event’s Markdown text goes in the `\{fiction name}_MyText\` subfolder.

### 界面与修复 / Interface and fixes

二维事件图新增「兼容渲染」开关，闪屏时可关闭 GPU 合成；彻底关闭 GPU 需重启程序。

The Matrix gains a Compatibility rendering switch that disables GPU compositing when the view flickers; a full GPU-off restart is also available.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像与雷达图；人物卡可链接为同一角色的不同时期。
- **事件轴、时间线、二维事件图**：多线路、章节分带与事件集；时间线按事件实际发生的时间排列。
- **设定档案**：物品、地点、纪年、势力、装备、技能树、名词等类别；自定义字段、图片与关联人物；势力可分三级从属；类别可开启雷达图与树型拓扑。
- **文本分析**：导入 TXT、Word、PDF，自动识别人物、事件、设定与章节，确认后回填。
- **人物分析**：出场统计、势力分析、雷达分析、关系网与系谱。
- **界面**：四种界面语言；整页缩放。
- **隐私设置**：可锁定当前小说或整个工作区。

- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded into one character across eras.
- **Storyboard, Timeline, Matrix** — multiple storylines, chapter bands and event sets; the timeline orders events by when they actually happen.
- **Setting library** — items, places, eras, factions, equipment, skills and terms, with custom fields, images and linked characters; factions nest three levels deep; a category can enable radar charts and the tree layout.
- **Text analysis** — import TXT, Word or PDF, detect characters, events, settings and chapters, then write the results back after confirmation.
- **Character analysis** — appearance stats, faction view, radar view, the relation network and the pedigree.
- **Interface** — four interface languages, whole-page zoom.
- **Privacy** — lock the current fiction or the whole workspace.

---

## 安装说明 / Installation

- 安装包 `AdaaFictionGUI-Setup-1.3.0.exe` 在 Releases 页面下载，双击安装；默认安装到 `C:\Program Files\Adaa_Fiction_Workshop`，安装向导中可更改目录。
- 导出文件与历史版本默认保存在「文档」下的 `fiction_GUI\output` 与 `fiction_GUI\history`，不在安装目录内。
- Windows 可能提示未知发布者，选择继续即可；程序暂未进行数字签名。
- 卸载仅删除程序本身；导出文件与历史版本需手动清理，卸载时会提示这两个路径。

- Download `AdaaFictionGUI-Setup-1.3.0.exe` from the Releases page and double-click to install. It installs to `C:\Program Files\Adaa_Fiction_Workshop` by default; the wizard allows changing the folder.
- Export files and history are stored under `Documents\fiction_GUI\output` and `Documents\fiction_GUI\history`, outside the installation folder.
- Windows may warn about an unknown publisher; continuing is fine, as the app is not code-signed yet.
- Uninstalling removes the program only. Export files and history must be deleted manually; the uninstaller shows both paths.

---

## 从源码运行 / Run from source

环境要求：Windows 10/11、Node.js 20+、npm。

Requirements: Windows 10/11, Node.js 20+ and npm.

```powershell
cd wrap2exe
npm ci
cd ..
node tools/build.js --force
cd wrap2exe
npm start
```

`npm start` 会先从 `src/` 构建 `app.js`，再同步桌面版文件并启动 Electron。

`npm start` rebuilds `app.js` from `src/`, syncs desktop files and launches Electron.

打包 Windows 安装包 / Build the Windows installer:

```powershell
cd wrap2exe
npm run dist
```

发布到 GitHub Releases 需要设置 `GH_TOKEN`，或在本机放置 `wrap2exe/.release-token`。不要把凭据提交到仓库。

Publishing to GitHub Releases requires `GH_TOKEN`, or a local `wrap2exe/.release-token` file. Never commit credentials.

---

## 项目结构 / Project layout

```text
src/                     应用源码，按功能拆分
tools/build.js           把 src/ 拼接成 app.js
wrap2exe/                Electron 主进程、安装器与打包脚本
plugins/character-report/人物档案 PDF 插件
docs/                    设计规格归档
vendor/                  浏览器端第三方库
```

- `src/` 是唯一源码目录；修改后运行 `node tools/build.js --force`，不要直接改 `app.js`。
- `wrap2exe/` 中的 `app.js`、`index.html`、`styles.css`、`logo_adaa.ico`、`vendor/` 是同步生成的副本，不提交到 Git。
- `src/` is the source of truth. Run `node tools/build.js --force` after editing; do not edit `app.js` directly.
- The copies under `wrap2exe/` are generated by `wrap2exe/sync-src.js` and are not committed.

---

## 人物档案插件 / Character Report plugin

`plugins/character-report/` 是本地 PDF 插件，读取导出的 JSON，生成人物档案 PDF。它不调用 AI 接口，不消耗 token，也不会修改工作区。

The local PDF plugin under `plugins/character-report/` reads an exported JSON and creates a character report. It does not call an AI API, consume tokens or modify the workspace.

```powershell
cd wrap2exe
npm ci
```

然后在资源管理器中双击 `plugins\character-report\打开人物档案工具.bat`。

Then double-click `plugins\character-report\打开人物档案工具.bat` in File Explorer.

---

## 开发检查 / Development checks

```powershell
node tools/build.js --force
node --check app.js
node tools/check-radar-evidence.js
node --check plugins/character-report/main.js
node --check plugins/character-report/report.js
```

提交前请确认没有包含导出文件、API Key、`.release-token` 或其他本机凭据。

Before committing, make sure exported files, API keys, `.release-token` and other local credentials are not included.

---

## 贡献 / Contributing

问题、功能建议和 Pull Request 都欢迎。提交前请阅读 `CONTRIBUTING.md`。

Issues, feature requests and pull requests are welcome. Read `CONTRIBUTING.md` before submitting.

---

## 许可证与品牌 / License and branding

代码以 **GNU Affero General Public License v3.0 or later** 发布，完整文本见 `LICENSE`。

The code is licensed under the **GNU Affero General Public License v3.0 or later**. See `LICENSE` for the full text.

允许个人与商业使用、修改和分发；分发修改版或通过网络提供服务时，须遵守 AGPL 的源码开放要求。如需不受 AGPL 约束的闭源商业授权，请联系作者。

Personal and commercial use, modification and distribution are permitted. Distributing modified versions or providing network services requires compliance with the AGPL source-release terms. For a commercial license without AGPL obligations, contact the author.

项目名称、Logo 与图标属于作者品牌，不在代码许可证范围内；衍生项目请使用自己的名称与图标。

The project name, logo and icons are author branding and are not licensed with the code. Forks must use their own branding.

Email: 313744963@qq.com
