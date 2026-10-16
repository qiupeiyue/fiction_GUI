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

设定档案新增默认类别「技能树」，并提供可复用的「树型拓扑」追加功能：条目按层级排成 F0 至 FN，层级不限，一棵树使用同一色相。

The setting library gains a built-in Skill tree category and a reusable Tree layout add-on: entries are arranged in levels from F0 to FN with no level limit, and one tree uses one hue.

### 新增：系谱 / New: pedigree

人物分析新增「系谱」子页面，按家族绘制父母与子女的连线。结合线连接两位父级，世系线由其连向子级，子级可以悬空；抬头「重排」把树根归到 F0、夫妻并入同一代并压缩空代。画布随可用空间等比缩放，最小 64%，再放不下时使用滚动条。

Character analysis gains a Pedigree view that draws parents and children by family. A union line joins two parents and a descent line runs from it to a child, which may also float free; “Re-layout” in the header returns roots to F0, merges partners into one generation and removes empty generations. The canvas scales with the available space down to 64% and scrolls beyond that.

### 设定条目的雷达图 / Radar charts for entries

雷达图改为类别级的追加功能，不再限于装备：顶点模板保存在类别上，条目的数值范围 0~10，条目换类别时勾选、顶点与数值一并保留。

Radar charts are now a category-level add-on instead of an equipment-only feature: the axis template is stored on the category, entry values range from 0 to 10, and the tick, axes and values all move with an entry that changes category.

### 人物分析：系谱与关系网联动 / Character analysis: the pedigree feeds the relation network

生成关系网时会读取系谱：结合线记为恋爱，世系线记为亲属，共用父级或母级的两个对象记为兄弟姐妹。系谱同时是文本分析提示词中的已知关系，而自动写入不修改系谱本身。

The relation network reads the pedigree when it is generated: a union line becomes Romance, a descent line becomes Family, and two objects sharing a parent become Siblings. The pedigree also supplies the known relations given to text analysis, and automatic write-back never changes the pedigree itself.

### 势力：三级从属与韦恩图 / Factions: three levels and the Venn diagram

势力条目可分三级从属；势力分析可绘制韦恩图，父子关系画成包含，共同成员画在交叠区。

Faction entries can nest three levels deep, and the faction view draws a Venn diagram: a parent-child pair becomes nesting, and shared members appear in the overlap.

### 设定档案：类别选项卡 / Library: category tabs

类别改为顶部选项卡，可拖动排序；条目区提供「全部展开 / 全部折叠」。

Categories are now tabs at the top and can be reordered by dragging; the entry area offers “Expand all / Fold all”.

### 时间线：时间列菜单 / Timeline: time-column menu

时间列可编辑这一行的时间，也可与上下相邻行合并、全部展开或全部折叠。

A time cell can edit the time of its row, and can merge that row with the one above or below, or expand and fold all rows.

### 二维事件图：表头 / Matrix: header

左上角表头改为「章节 ＼ 事件 ＼ 人物」：纵向为章节与事件，横向为人物。

The top-left header now reads “Chapter ＼ Event ＼ Characters”: chapters and events run down, characters across.

### 界面与交互 / Interface and interaction

长列表滚动时在右下角显示悬浮全局预览；人物分析的第一个子页签更名为「关系网」。

Long lists show a floating overview at the bottom right while they scroll; the first tab under Character analysis is renamed to Relations.

### 修复 / Fixes

- 拖动系谱对象中途停止跟随鼠标 → 现在全程跟随。
- 拖卡片进系谱的落点偏移一代 → 现在落在正确的代。
- 时间线的行折叠状态与全部展开 / 折叠不一致 → 现在共用同一套行标识。

- Dragging a pedigree object stopped following the pointer → it now follows throughout.
- A card dropped into the pedigree landed one generation off → it now lands on the right generation.
- A folded timeline row disagreed with Expand all and Fold all → they now share one row key.

---

## 1.2 版本要点 / Highlights in 1.2

### 新增：地图 / New: maps

地图位于设定档案的「地点」中，分为板块图与模拟图，两种都可添加坐标与比例尺。板块图自动识别封闭区域，每个区域对应一张地点卡；模拟图以图片为底图，在图上放置地点图标。

Maps live under Places in the setting library, in two kinds, and both support coordinates and a scale bar. A board map detects enclosed areas automatically, each linked to a place card; an illustrated map uses a picture as the base and places location icons on it.

### 新增：装备 / New: equipment

设定档案新增默认类别「装备」，自带种类、外观、功能 / 用途、来历等字段与雷达图；雷达图可整体禁用，已填数值保留。

The setting library gains a built-in Equipment category with kind, appearance, function and origin fields plus a radar chart; the radar can be disabled as a whole, and existing values are kept.

### 设定档案：条目可换类别 / Library: entries can change category

条目可整体挪到另一个类别，字段、名称、图片、关联人物与关联事件一并保留；目标类别没有同名分组时落到「未分组」。

An entry can be moved to another category as a whole, keeping its fields, name, image, linked characters and linked events; when the target category has no group of that name, it goes to Ungrouped.

### 新增：隐私设置 / New: privacy

设置新增「隐私设置」，可分别锁定当前小说或整个工作区，打开时需输入密码；密码至少 4 位，区分大小写。

Settings gains a Privacy pane that locks the current fiction or the whole workspace, asking for a password when it is opened; passwords are at least 4 characters and case-sensitive.

### 时间线：更完整的时间识别 / Chronology: broader time parsing

时间支持中文数字、公元与公元前、年月日，以及简体中文、繁體中文、English、日本語的相对说法；无法识别的时间仍单独成行，排在可识别时间之后。

Time parsing covers Chinese numerals, AD and BC, year-month-day and relative wording in Simplified Chinese, Traditional Chinese, English and Japanese; unrecognized values still get their own row, placed after rows with a definite time.

### 界面统一 / Interface consistency

下拉框、悬浮提示与右键菜单统一使用程序自带的面板；主区、分析结果与各分析表格的选项卡美术统一；输入框回车确认、Ctrl+Enter 换行；顶栏缩放框可调整整页缩放。

Dropdowns, hover tips and context menus use the app's own panels; the main tabs, result tabs and analysis tables share one style; Enter confirms in input fields and Ctrl+Enter inserts a newline; a top-bar box adjusts whole-page zoom.

### 修复 / Fixes

安装后可能提示「页面脚本版本不一致」：版本号改由发版流程统一写入，并在发版前自检，不一致时不打包。

The “page and script versions do not match” warning that could appear after installation: version numbers are written from a single source by the release process, which refuses to package when they disagree.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像与雷达图；人物卡可链接为同一角色的不同时期。
- **事件轴、时间线、二维事件图**：多线路、章节分带与事件集；空章 / 空节与章节线的插入、拖放按上下侧归属；时间线按事件实际发生的时间排列。
- **设定档案**：物品、地点、纪年、势力、装备、名词等类别；自定义字段、图片与关联人物；势力可分三级从属；类别可开启雷达图与树型拓扑。
- **文本分析**：导入 TXT、Word、PDF，自动识别人物、事件、设定与章节，确认后回填。
- **人物分析**：出场统计、势力分析（可画韦恩图）、雷达分析、关系网与系谱。
- **界面**：四种界面语言；整页缩放；各边栏与关系网左栏美术统一；长列表滚动时显示悬浮全局预览。
- **隐私设置**：可锁定当前小说或整个工作区，打开时需输入密码。

- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded into one character across eras.
- **Storyboard, Timeline, Matrix** — multiple storylines, chapter bands and event sets; inserts and drops near empty chapters or dividers follow the side they belong to; the timeline orders events by when they actually happen.
- **Setting library** — items, places, eras, factions, equipment and terms, with custom fields, images and linked characters; factions nest three levels deep; a category can enable radar charts and the tree layout.
- **Text analysis** — import TXT, Word or PDF, detect characters, events, settings and chapters, then write the results back after confirmation.
- **Character analysis** — appearance stats, faction view with a Venn diagram, radar view, the relation network and the pedigree.
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
