# Adaa的小说工坊 · Adaa's Fiction Workshop

面向长篇小说的本地创作工具：人物档案、事件轴、设定档案与文本分析共用同一个工作区，边写边整理世界观与情节。

A local writing tool for long-form fiction. Character profiles, the storyboard, the setting library and text analysis share one workspace, so the world stays organized while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线 · 文本编辑 · 生成小说
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline · text editor · novel export

> 当前版本 / Version：**1.3.0** ｜ 更新时间 / Updated：**2026-10-20**

---

## 本版重点更新 / What's new in 1.3.0

### 新增：文本编辑 / New: MyText

事件轴新增「文本编辑」。左栏是章节与事件列表，单击打开事件卡，双击进入正文编辑。切换事件、切换页签都会先保存。
文本编辑正文框 `Enter` 换行，不触发保存。

The Story group gains MyText. The left pane lists chapters and events: click to open a card, double-click to write. Switching events or tabs saves first.
Enter inserts a newline in the editor instead of saving.


### 新增：生成小说 / New: Generate novel

文本编辑顶栏新增「生成小说」。弹窗可填写保存文件名、保存路径和格式。支持 Markdown、Word（.docx）、Pages（.pages）、EPUB 和 PDF。

MyText gains a Generate novel button. The dialog accepts a file name, a save folder and a format(Markdown, Word, Pages, EPUB and PDF).


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
- **界面**：四种界面语言；整页缩放；。
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

## 版权 / Copyright

本软件的版权与最终解释权归作者 **Adaa** 所有。

Copyright and final interpretation rights belong to the author, **Adaa**.

Email: 313744963@qq.com
