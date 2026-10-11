# Adaa的小说工坊 · Adaa's Fiction Workshop

一款面向长篇小说作者的本地创作工具：把**人物档案**、**事件轴**、**设定档案**与**文本分析**放在同一个工作区里，边写边整理世界观与情节。

A local writing tool for novelists. Characters, the storyboard, the setting library and text analysis live in one workspace, so you can build the world while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline

> 当前版本 / Version：**1.1.0** ｜ 更新时间 / Updated：**2026-10-11**

---

## 本版重点更新 / What's new in 1.1.0

### 新增「链接」功能 / New: “Bond”

> “我已不再是十年前的我了！”

同一个角色的不同身份、不同时期，现在可以**链接**起来，而不必把人物卡合并成一张。链接后：

- 人物卡右上角出现回形针；点它就能把别的人物并进这条链。
- 人物信息顶部出现这条链的选项卡，点一下就能在几张卡之间切换。
- 人物链上的几张卡可以把雷达图叠在一起比较数值。
- 关系网里用虚线连接同链人物。
- 搜索框可匹配识别同链人物。

The same character across different identities or eras can now be **bonded** without merging their cards:

- A paperclip appears on the card; click it to add someone to the bond.
- Tabs for the whole bond sit in the character window for one-click switching.
- Their radar charts can be overlaid for comparison.
- Bonded characters are drawn as dashed links.
- Search boxes can match and identify characters in the same bond.

### 界面多语言 / Multilingual interface

- 简体中文 · 繁體中文 · English · 日本語
- Simplified Chinese · Traditional Chinese · English · Japanese 

### 文本分析多语言 / Multilingual text analysis

- 支持分析：简体中文、繁体中文、英文、日文的小说文本。
- 自动区分文本语言、分句、字数统计；繁简 / 异体字归一，英日文用各自的匹配规则。
- Analysis works on Simplified Chinese, Traditional Chinese, English and Japanese text. The language is detected automatically for splitting, measuring and matching.


### 其它更新 / Other changes

- 修复了弹窗里 **Enter 无法确认**的问题：Enter＝保存并关闭，Ctrl+S＝只保存不关，Esc / ×＝不保存关闭。
- Fixed the issue where Enter couldn't confirm a dialog: Enter saves and closes, Ctrl+S saves without closing, Esc / × closes without saving.
- **把所有界面的文案都补上了四种语言**：右键菜单、悬浮提示、弹窗、字幕（提示条）、空状态、占位符、设置里的每一栏，全部跟着语言设置走。
- **Every string in the app now follows the language setting** — context menus, tooltips, dialogs, toasts, empty states, placeholders and every settings pane.
- 登场人物 / 关联人物：按分组选择，支持拖拽与多选，默认折叠、点开即选。
- Cast / linked characters: grouped pickers with drag and multi-select.
- 输入保护、自定义合并规则、关系类型、事件集、章节管理等多处 Bug 修复与界面打磨。
- Input protection, custom merge rules, relation types, event sets and chapter management were polished, and several bugs were fixed.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像、雷达图；人物卡可以「链接」成同一个人。
- **事件轴 / 时间线 / 二维事件图**：多线路、章/节分带、事件集、拖拽排序。
- **设定档案**：物品 / 地点 / 纪年 / 势力 / 名词等类别，支持字段、图片、关联人物。
- **文本分析**：导入 TXT / Word / PDF，自动识别人物、事件、设定与章节，一键回填。
- **人物分析**：出场统计、势力分析、雷达分析、关系网。
- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded into one identity.
- **Storyboard / Timeline / Matrix** — multiple storylines, chapter/section bands and event sets.
- **Setting library** — items, places, eras, factions, terms with fields, images and linked characters.
- **Text analysis** — import TXT / Word / PDF; auto-detect characters, events, settings and chapters; write results back.
- **Character analysis** — appearance stats, faction view, radar view and the relation network.

---

## 安装说明 / Installation

- 安装包：`AdaaFictionGUI-Setup-1.1.0.exe`（在 Releases 页下载，双击即可安装）。
- 安装包默认安装到 `C:\Program Files\Adaa_Fiction_Workshop`，安装向导里可以改目录。
- 导出文件与历史版本默认放在 `文档\fiction_GUI\output` 和 `文档\fiction_GUI\history`，不随安装目录删除。
- Windows 可能提示「未知发布者 / SmartScreen」：点「更多信息 → 仍要运行」即可。这是因为程序尚未做数字签名。
- 卸载只会删除程序本身；导出文件与历史版本需要你手动清理。

- Installer: `AdaaFictionGUI-Setup-1.1.0.exe` — download it from the Releases page and double-click to install.
- The installer defaults to `C:\Program Files\Adaa_Fiction_Workshop`; the path can be changed in the wizard.
- Exports and history are saved under `Documents\fiction_GUI\output` and `Documents\fiction_GUI\history`, outside the install folder.
- Windows may warn about an unknown publisher (SmartScreen): choose “More info → Run anyway”. The app is not code-signed yet.
- Uninstalling removes only the program; exports and history must be cleaned up manually.

---

## 版权 / Copyright

本软件的版权及最终解释权归作者 **Adaa** 所有。

Email: 313744963@qq.com

Copyright and final interpretation rights belong to the author, **Adaa**.

Email: 313744963@qq.com
