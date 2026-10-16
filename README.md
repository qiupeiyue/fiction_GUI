# Adaa的小说工坊 · Adaa's Fiction Workshop

面向长篇小说的本地创作工具：人物档案、事件轴、设定档案与文本分析共用同一个工作区，边写边整理世界观与情节。

A local writing tool for long-form fiction. Character profiles, the storyboard, the setting library and text analysis share one workspace, so the world stays organized while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline

> 当前版本 / Version：**1.2.1** ｜ 更新时间 / Updated：**2026-10-16**

---

## 本版重点更新 / What's new in 1.2.1

### 新增：技能树与树型拓扑 / New: skill tree and tree layout

设定档案新增默认类别「技能树」，并提供可复用的「树型拓扑」追加功能。

- 类别开启「追加功能：树型拓扑」后，条目区右侧出现拓扑栏：一行一个层级，F0 至 FN，层级不限。
- 拖卡片入树即建立节点与上下级关系；拖动节点连同其子树一起移动；双击节点打开该条目的信息卡。
- 一棵树使用同一色相，层级由浅到深；卡片图片可作为节点底图。
- 拓扑栏可折叠、可拖宽，支持多选与批量操作。

The setting library gains a built-in Skill tree category and a reusable Tree layout add-on.

- With “Add-on: tree layout” enabled for a category, a layout pane appears beside the entry list: one row per level, F0 to FN, with no level limit.
- Drag a card in to create a node and set its parent and child relations; drag a node to move it with its whole subtree; double-click a node to open that entry card.
- One tree uses one hue, lighter to darker by level; a card's image can serve as the node background.
- The pane folds and resizes, and supports multi-selection and batch actions.

### 新增：系谱 / New: pedigree

人物分析新增「系谱」子页面，按家族绘制父母与子女的连线。

- 一个画布可放置多个家族。结合线连接两位父级，世系线由结合线中点或单亲连向子级；子级可以悬空。
- 每次操作后自动整理横向位置，层级不因此改变。
- 抬头「重排」：树根回到 F0，夫妻并入同一代，子级落在父级下一代，并压缩空代。
- 画布随可用空间等比缩放，最小 64%；仍放不下时使用滚动条。
- 对象右键：编辑、结合、关联到上方 / 下方、左移、右移、删除；结合线与世系线可替换上端或下端。
- 已加入人物链的对象显示回形针，点击可替换为链中的其他人物卡。

Character analysis gains a Pedigree view that draws parents and children by family.

- One canvas holds several families. A union line joins two parents; a descent line runs from a union midpoint or a single parent to a child; a child can also float free.
- Horizontal positions are tidied after every operation; levels are not changed by it.
- The “Re-layout” button in the header returns roots to F0, merges partners into one generation, places children one generation below their parents and removes empty generations.
- The canvas scales uniformly to the available space, down to 64%; beyond that it scrolls.
- Right-click an object for Edit, Union, Link above / below, Move left, Move right and Delete; a union or descent line can have either end replaced.
- Objects that belong to a character chain show a paper clip; clicking it replaces the object with another card in the chain.

### 设定条目的雷达图 / Radar charts for entries

雷达图改为类别级的「追加功能」，不再限于装备。

- 任何类别都可以开启雷达图；顶点模板保存在类别上，可在设置中增删、改名与填写说明。
- 条目信息卡中勾选后绘制，数值范围 0~10，可填小数；单个条目的顶点可独立增删与改名。
- 条目移动到其他类别时，勾选状态、顶点与数值一并保留。

Radar charts are now a category-level add-on instead of an equipment-only feature.

- Any category can enable the radar; its axis template is stored on the category and can be edited in Settings.
- An entry draws its radar only after the box is ticked in its card; values range from 0 to 10 and may be decimals; a single entry's axes can be added, removed or renamed on their own.
- When an entry moves to another category, the tick, the axes and the values all move with it.

### 人物分析：系谱与关系网联动 / Character analysis: the pedigree feeds the relation network

- 「一键生成 / 更新关系网」会读取系谱：结合线记为恋爱，世系线记为亲属，共用父级或母级的两个对象记为兄弟姐妹。
- 文本分析的提示词包含系谱中的已知关系，识别结果与系谱保持一致。
- 系谱只作为信息来源，自动写入不修改系谱本身。

- “Generate” for the relation network also reads the pedigree: a union line becomes Romance, a descent line becomes Family, and two objects sharing a parent become Siblings.
- The text-analysis prompt includes the known relations from the pedigree, so the results agree with it.
- The pedigree only provides information; automatic write-back never changes the pedigree itself.

### 设定档案：类别选项卡 / Library: category tabs

- 类别改为顶部选项卡，可拖动排序，右键可新建、重命名、删除与合并。
- 条目与空白处右键提供「全部展开 / 全部折叠」，不影响列数。

- Categories are now tabs at the top; they can be reordered by dragging, and created, renamed, deleted or merged from the context menu.
- Right-clicking entries or blank space offers “Expand all / Fold all” without changing the column count.

### 时间线：时间列右键菜单 / Timeline: time-column menu

- 时间列右键提供：编辑、合并到上一条、合并到下一条、全部展开、全部折叠。
- 合并把这一行的事件的时间改为相邻行的时间，两行合为一行。

- Right-click a time cell for Edit, Merge into the row above, Merge into the row below, Expand all and Fold all.
- Merging gives the events of the row the time of the neighbouring row, so the two rows become one.

### 二维事件图：表头 / Matrix: header

- 左上角表头改为「章节 ＼ 事件 ＼ 人物」：纵向为章节与事件，横向为人物。
- 表头与原先的「事件」格合并为一格。

- The top-left header now reads “Chapter ＼ Event ＼ Characters”: chapters and events run down, characters across.
- The header and the former “事件” cell are merged into one cell.

### 界面与交互 / Interface and interaction

- 边栏与长列表滚动时，在右下角显示悬浮全局预览，标出当前可见范围。
- 人物分析的第一个子页签更名为「关系网」，与顶层「人物分析」区分。

- While a sidebar or long list scrolls, a floating overview appears at the bottom right and marks the visible range.
- The first tab under Character analysis is renamed to Relations, so it no longer shares its name with the top-level Characters tab.

### 修复 / Fixes

- 系谱对象拖动中途停止跟随鼠标 → 拖动期间只更新被拖节点与连线，松手后完整重绘。
- 系谱对象拖入画布的落点偏移一代 → 落点改用画布坐标换算，缩放后仍落在同一代。
- 时间线的行折叠状态与展开 / 折叠不同步 → 折叠状态统一使用同一套行标识。

- Dragging a pedigree object stopped following the pointer → while dragging, only the dragged node and the lines are updated, and a full redraw happens on release.
- A card dropped into the pedigree landed one generation off → the drop point is converted through canvas coordinates, so it lands on the same generation at any zoom.
- A folded timeline row disagreed with Expand all and Fold all → the folded state now uses one shared row key.

---

## 1.2 版本要点 / Highlights in 1.2

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

### 修复 / Fixes

- 修复安装后可能提示「页面脚本版本不一致」的问题：版本号改由发版流程统一写入，页面与脚本始终一致；发版前也会自检，不一致时不打包。
- 输入保护条目随「全局字段」与「雷达图」的增删、隐藏与启用状态实时增减。

- Fixed the “page and script versions do not match” warning that could appear after installation: version numbers are now written from a single source by the release process, so the page and script always agree, and the build is blocked when they do not.
- Input-protection rows follow the global fields and radar settings in real time — added, removed, hidden or disabled items appear and disappear accordingly.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像与雷达图；人物卡可链接为同一角色的不同时期。
- **事件轴、时间线、二维事件图**：多线路、章节分带与事件集；空章 / 空节与章节线的插入、拖放按上下侧归属；时间线按事件实际发生的时间排列。
- **设定档案**：物品、地点、纪年、势力、装备、名词等类别，支持自定义字段、图片与关联人物；类别可开启雷达图与树型拓扑。
- **文本分析**：导入 TXT、Word、PDF，自动识别人物、事件、设定与章节，确认后回填。
- **人物分析**：出场统计、势力分析、雷达分析、关系网与系谱。
- **界面**：四种界面语言；整页缩放；各边栏与关系网左栏美术统一；长列表滚动时显示悬浮全局预览。
- **隐私设置**：可锁定当前小说或整个工作区，打开时需输入密码。

- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded into one character across eras.
- **Storyboard, Timeline, Matrix** — multiple storylines, chapter bands and event sets; inserts and drops near empty chapters or dividers follow the side they belong to; the timeline orders events by when they actually happen.
- **Setting library** — items, places, eras, factions, equipment and terms, with custom fields, images and linked characters; a category can enable radar charts and the tree layout.
- **Text analysis** — import TXT, Word or PDF, detect characters, events, settings and chapters, then write the results back after confirmation.
- **Character analysis** — appearance stats, faction view, radar view, the relation network and the pedigree.
- **Interface** — four interface languages, whole-page zoom, one shared style for the sidebars and the relation pickers, and a floating overview while long lists scroll.
- **Privacy** — lock the current fiction or the whole workspace; opening it then requires the password.

---

## 安装说明 / Installation

- 安装包 `AdaaFictionGUI-Setup-1.2.1.exe` 在 Releases 页面下载，双击安装；默认安装到 `C:\Program Files\Adaa_Fiction_Workshop`，安装向导中可更改目录。
- 导出文件与历史版本默认保存在「文档」下的 `fiction_GUI\output` 与 `fiction_GUI\history`，不在安装目录内。
- Windows 可能提示未知发布者，选择继续即可；程序暂未进行数字签名。
- 卸载仅删除程序本身；导出文件与历史版本需手动清理，卸载时会提示这两个路径。

- Download `AdaaFictionGUI-Setup-1.2.1.exe` from the Releases page and double-click to install. It installs to `C:\Program Files\Adaa_Fiction_Workshop` by default; the wizard allows changing the folder.
- Export files and history are stored under `Documents\fiction_GUI\output` and `Documents\fiction_GUI\history`, outside the installation folder.
- Windows may warn about an unknown publisher; continuing is fine, as the app is not code-signed yet.
- Uninstalling removes the program only. Export files and history must be deleted manually; the uninstaller shows both paths.

---

## 版权 / Copyright

本软件的版权与最终解释权归作者 **Adaa** 所有。

Copyright and final interpretation rights belong to the author, **Adaa**.

Email: 313744963@qq.com
