# Adaa的小说工坊 · Adaa's Fiction Workshop

面向长篇小说的本地创作工具：人物档案、事件轴、设定档案与文本分析共用同一个工作区，边写边整理世界观与情节。

A local writing tool for long-form fiction. Character profiles, the storyboard, the setting library and text analysis share one workspace, so the world stays organized while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline

> 当前版本 / Version：**1.2.0** ｜ 更新时间 / Updated：**2026-10-14**

---

## 本版重点更新 / What's new in 1.2.0

### 新增：地图 / New: maps

地图位于设定档案的「地点」中，分为板块图与模拟图两类。

- **地图卡**：右键可编辑、复制、删除，双击打开编辑；地图类型在此选择。
- **板块图**：手绘或导入图片，程序自动识别封闭区域，每个区域对应一张地点卡。
- **模拟图**：上传图片作为底图，在图上放置地点图标，每个图标对应一张地点卡。
- **坐标与比例尺**：两种地图均可添加；可拖动，可设置颜色与尺寸。

Maps live under Places in the setting library, in two kinds.

- **Map cards**: right-click to edit, copy or delete; double-click to open. The map kind is chosen here.
- **Board maps**: draw by hand or import a picture; enclosed areas are detected automatically, and each one is linked to a place card.
- **Illustrated maps**: upload a picture as the base and place location icons on it; each icon is linked to a place card.
- **Coordinates and scale bar**: supported by both map kinds; both can be dragged, and their color and size can be set.

### 新增：装备 / New: equipment

设定档案新增默认类别「装备」，自带种类、外观、功能 / 用途、来历等字段，并支持雷达图。

- 装备雷达图的默认顶点为攻击、防御、耐久、稀有；名称、说明与顶点数量均可在设置中修改。
- 条目信息卡中勾选「雷达图」后才绘制，数值范围 0~10，可填小数；单个条目的顶点可增删、改名。
- 装备雷达图可在设置中整体禁用；禁用后装备信息卡不再显示，已填数值保留。

The setting library gains a built-in Equipment category with kind, appearance, function and origin fields, plus radar charts.

- The default gear radar axes are ATK, DEF, DUR and RARE; their names, descriptions and count are editable in Settings.
- A gear entry draws its radar only after “Radar chart” is ticked in its card. Values range from 0 to 10 and may be decimals; each entry's axes can be added, removed or renamed individually.
- The gear radar can be disabled as a whole in Settings. Gear cards then stop showing it, and existing values are kept.

### 设定档案：条目可换类别 / Library: entries can change category

条目可以整体挪到另一个类别，字段、关联人物、名称、图片与关联事件一并保留。

- 条目卡右键「移动到…」；批量条上先从「移动到…」下拉里选目标类别，再点「移动到」。
- 目标类别没有该条目所在的分组时，条目落到「未分组」。


Entries can be moved to another category as a whole; fields, linked characters, name, image and linked events are kept.

- Right-click an entry card and pick “Move to…”; in the batch bar, choose the target from the “Move to…” list and press “To category”.
- When the target category has no group of that name, the entry goes to Ungrouped.


### 新增：隐私设置 / New: privacy

设置新增「隐私设置」，可分别锁定**当前小说**或**整个工作区**。

- 锁定工作区后，启动程序需输入密码；锁定某本小说后，导入或打开该小说需输入密码。
- 密码长度至少 4 位，区分大小写。

Settings gains a Privacy pane that can lock **the current fiction** or **the whole workspace**.

- With the workspace locked, starting the app requires the password. With a fiction locked, importing or opening that fiction requires the password.
- Passwords are at least 4 characters long and are case-sensitive.

### 时间线：更完整的时间识别 / Chronology: broader time parsing

- 单击最左侧的时间格可修改该行的「时间」，同行事件一并修改。
- 「时间」支持中文数字、公元与公元前、年月日，以及简体中文、繁體中文、English、日本語的相对说法。
- 无法识别的「时间」仍单独成行，排在可识别时间的行之后，按其在正文中首次出现的顺序排列。
- 「恢复自动排序」更名为「自动排序」，说明中注明会清除手动调整。
- 在事件卡中修改时间后，时间线立即更新。

- Click the leftmost time cell to edit that row's time; all events on the row are updated together.
- Time parsing covers Chinese numerals, AD and BC, year-month-day, and relative wording in Simplified Chinese, Traditional Chinese, English and Japanese.
- Unrecognized values still get their own row, placed after rows with a definite time and ordered by their first appearance in the text.
- “Restore auto order” is renamed to “Auto sort”, and its tooltip states that manual adjustments are cleared.
- Editing a time in the event card updates the chronology immediately.

### 界面统一 / Interface consistency

- 下拉框、悬浮提示与右键菜单统一使用程序自带的面板。
- 主区选项卡、分析结果选项卡与各分析表格的美术统一，选项卡下方为一条细线。
- 输入框：**Enter 确认并移出光标，Ctrl+Enter 换行**。
- 顶栏新增页面缩放框（等同 Ctrl+滚轮）：可选档位或直接输入百分比，Ctrl+0 恢复 100%。
- 页面缩放作用于整个界面；悬浮提示、右键菜单与其他浮层始终贴着鼠标位置，不随缩放偏移。

- Dropdowns, hover tips and context menus use the app's own panels.
- Main tabs, result tabs and analysis tables share the same styling, with a thin rule below the tabs.
- Input fields: **Enter confirms and leaves the field; Ctrl+Enter inserts a newline**.
- A page-zoom box in the top bar (equivalent to Ctrl+wheel): choose a preset or type a percentage and Ctrl+0 restores 100%.
- Page zoom scales the whole interface; hover tips, context menus and other floating panels stay at the pointer and do not drift with zoom.

### 快捷键与选择 / Shortcuts and selection

- **Ctrl+A 仅作用于当前界面**：全选鼠标所在的列表——雷达分析为待绘制雷达的人物，文本分析的章 / 节列表为章与节，设定档案为条目。
- **Ctrl+S 统一为「保存」**：主界面保存整个工作区；卡片与设置弹窗仅保存，不关闭。

- **Ctrl+A affects the current view only**: it selects the list under the pointer — characters to chart in the radar view, chapters and sections in the text-analysis list, entries in the setting library.
- **Ctrl+S saves everywhere**: it saves the whole workspace from the main window, and saves without closing in card and settings dialogs.


### 修复 / Fixes

- 修复安装后可能提示「页面脚本版本不一致」的问题：版本号改由发版流程统一写入，页面与脚本始终一致；发版前也会自检，不一致时不打包。
- 输入保护条目随「全局字段」与「雷达图」的增删、隐藏与启用状态实时增减。

- Fixed the “page and script versions do not match” warning that could appear after installation: version numbers are now written from a single source by the release process, so the page and script always agree, and the build is blocked when they do not.
- Input-protection rows follow the global fields and radar settings in real time — added, removed, hidden or disabled items appear and disappear accordingly.

---

## 1.1 版本要点 / Highlights in 1.1

- **章节划分**：空章 / 空节分界线上下的插入落点正确；章节线拖入缝隙的落点与提示一致；事件拖到分界线上按其原本所处一侧归属。
- **界面与分析结果**：章节边栏、设定类别边栏、分析任务边栏与人物关系网左栏统一美术。
- **「链接」**：同一角色在不同时期、不同身份的人物卡可链接而非合并。
- **多语言**：界面与文本分析均支持简体中文、繁體中文、English 与 日本語。

- **Chapter editing**: inserting above or below an empty chapter / section divider lands correctly;a chapter line dropped into a gap lands where the hint indicates; an event dropped onto a divider joins the side it came from.
- **Interface and results**: the chapter rail, category rail, analysis-task rail and the relation pickers share one style. 
- **“Bond”**: cards for one character across periods or identities can be bonded instead of merged.
- **Multilingual**: both the interface and text analysis support Simplified Chinese, Traditional Chinese, English and Japanese.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像与雷达图；人物卡可链接为同一角色的不同时期。
- **事件轴、时间线、二维事件图**：多线路、章节分带、事件集与拖拽排序；时间线按事件实际发生的时间排列，并识别中文数字与四种语言的时间表述。
- **设定档案**：物品、地点、纪年、势力、装备、名词等类别，支持自定义字段、图片与关联人物；条目可在类别间移动；装备条目支持雷达图；地点内嵌地图。
- **文本分析**：导入 TXT、Word、PDF，自动识别人物、事件、设定与章节，确认后回填。
- **人物分析**：出场统计、势力分析、雷达分析与关系网。
- **界面**：四种界面语言；顶栏缩放框可调整整页缩放，等同 Ctrl+滚轮。
- **隐私设置**：可锁定当前小说或整个工作区，打开时需输入密码。

- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded into one character across eras.
- **Storyboard, Timeline, Matrix** — multiple storylines, chapter bands, event sets and drag-to-reorder; the timeline orders events by when they actually happen and recognizes Chinese numerals and time wording in four languages.
- **Setting library** — items, places, eras, factions, equipment and terms, with custom fields, images and linked characters; entries can move between categories; equipment entries support radar charts, and places include maps.
- **Text analysis** — import TXT, Word or PDF, detect characters, events, settings and chapters, then write the results back after confirmation.
- **Character analysis** — appearance stats, faction view, radar view and the relation network.
- **Interface** — four interface languages, with a top-bar zoom box for the whole page, equivalent to Ctrl+wheel.
- **Privacy** — lock the current fiction or the whole workspace; opening it then requires the password.

---

## 安装说明 / Installation

- 安装包 `AdaaFictionGUI-Setup-1.2.0.exe` 在 Releases 页面下载，双击安装；默认安装到 `C:\Program Files\Adaa_Fiction_Workshop`，安装向导中可更改目录。
- 导出文件与历史版本默认保存在「文档」下的 `fiction_GUI\output` 与 `fiction_GUI\history`，不在安装目录内。
- Windows 可能提示未知发布者，选择继续即可；程序暂未进行数字签名。
- 卸载仅删除程序本身；导出文件与历史版本需手动清理，卸载时会提示这两个路径。

- Download `AdaaFictionGUI-Setup-1.2.0.exe` from the Releases page and double-click to install. It installs to `C:\Program Files\Adaa_Fiction_Workshop` by default; the wizard allows changing the folder.
- Export files and history are stored under `Documents\fiction_GUI\output` and `Documents\fiction_GUI\history`, outside the installation folder.
- Windows may warn about an unknown publisher; continuing is fine, as the app is not code-signed yet.
- Uninstalling removes the program only. Export files and history must be deleted manually; the uninstaller shows both paths.

---

## 版权 / Copyright

本软件的版权与最终解释权归作者 **Adaa** 所有。

Copyright and final interpretation rights belong to the author, **Adaa**.

Email: 313744963@qq.com
