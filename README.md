# Adaa的小说工坊 · Adaa's Fiction Workshop

面向长篇小说的本地创作工具：人物档案、事件轴、设定档案与文本分析共用同一个工作区，边写边整理世界观与情节。

A local writing tool for long-form fiction. Character profiles, the storyboard, the setting library and text analysis share one workspace, so the world stays organized while you write.

> 多线剧情 · 人物档案 · 设定档案 · 事件轴 · 时间线
>
> Multi-thread plotting · character profiles · setting library · storyboard · timeline

> 当前版本 / Version：**1.2.2** ｜ 更新时间 / Updated：**2026-10-17**

---

## 本版重点更新 / What's new in 1.2.2

### 新增：技能树与树型拓扑 / New: skill tree and tree layout

设定档案新增默认类别「技能树」，并提供可复用的「树型拓扑」追加功能。

The setting library gains a built-in Skill tree category and a reusable Tree layout add-on.

### 新增：系谱 / New: pedigree

人物分析新增「系谱」子页面，按家族绘制父母与子女的连线。结合线连接两位父级，世系线由其连向子级。
生成关系网时会读取系谱。自动写入不修改系谱本身。

Character analysis gains a Pedigree view that draws parents and children by family. A union line joins two parents and a descent line runs from it to a child.
The relation network reads the pedigree when it is generated. Automatic write-back never changes the pedigree itself.

### 设定条目的雷达图 / Radar charts for entries

雷达图改为类别级的追加功能，不再限于装备。

Radar charts are now a category-level add-on instead of an equipment-only feature.


### 势力：三级从属与韦恩图 / Factions: three levels and the Venn diagram

势力条目可分三级从属；势力分析可绘制韦恩图。

Faction entries can nest three levels deep, and the faction view draws a Venn diagram:.


## 1.2 版本要点 / Highlights in 1.2

### 新增：地图 / New: maps

地图位于设定档案的「地点」中，分为板块图与模拟图，两种都可添加坐标与比例尺。

Maps live under Places in the setting library, in two kinds, and both support coordinates and a scale bar. 

### 新增：装备 / New: equipment

设定档案新增默认类别「装备」，自带种类、外观、功能 / 用途、来历等字段与雷达图；雷达图可整体禁用，已填数值保留。

The setting library gains a built-in Equipment category with kind, appearance, function and origin fields plus a radar chart; the radar can be disabled as a whole, and existing values are kept.

### 设定档案：条目可换类别 / Library: entries can change category

条目可整体挪到另一个类别，字段、名称、图片、关联人物与关联事件一并保留。

An entry can be moved to another category as a whole, keeping its fields, name, image, linked characters and linked events.

### 新增：隐私设置 / New: privacy

设置新增「隐私设置」，可分别锁定当前小说或整个工作区。

Settings gains a Privacy pane that locks the current fiction or the whole workspace, asking for a password when it is opened.


### 修复 / Fixes

安装后可能提示「页面脚本版本不一致」：版本号改由发版流程统一写入，并在发版前自检，不一致时不打包。

The “page and script versions do not match” warning that could appear after installation: version numbers are written from a single source by the release process, which refuses to package when they disagree.

---

## 功能一览 / Features

- **人物**：卡片、分组、别名、势力、头像与雷达图；人物卡可链接。
- **事件轴、时间线、二维事件图**：多线路、章节分带与事件集；；时间线按事件实际发生的时间排列。
- **设定档案**：物品、地点、纪年、势力、装备、名词等类别；自定义字段、图片与关联人物；势力可分三级从属；类别可开启雷达图与树型拓扑。
- **文本分析**：导入 TXT、Word、PDF、Markdown，自动识别人物、事件、设定与章节。
- **人物分析**：出场统计、势力分析、雷达分析、关系网与系谱。
- **界面**：四种界面语言；整页缩放；长列表滚动时显示悬浮全局预览。
- **隐私设置**：可锁定当前小说或整个工作区，打开时需输入密码。

- **Characters** — cards, groups, aliases, factions, avatars and radar charts; cards can be bonded.
- **Storyboard, Timeline, Matrix** — multiple storylines, chapter bands and event sets; inserts; the timeline orders events by when they actually happen.
- **Setting library** — items, places, eras, factions, equipment and terms, with custom fields, images and linked characters; factions nest three levels deep; a category can enable radar charts and the tree layout.
- **Text analysis** — import TXT, Word , PDF, Markdown, detect characters, events, settings and chapters.
- **Character analysis** — appearance stats, faction, radar view, the relation network and the pedigree.
- **Interface** —  multiple languages support, whole-page zoom, and a floating overview while long lists scroll.
- **Privacy** — lock the current fiction or the whole workspace; opening it then requires the password.

---

## 安装说明 / Installation

- 安装包 `AdaaFictionGUI-Setup-1.2.2.exe` 在 Releases 页面下载，双击安装；默认安装到 `C:\Program Files\Adaa_Fiction_Workshop`，安装向导中可更改目录。
- 导出文件与历史版本默认保存在「文档」下的 `fiction_GUI\output` 与 `fiction_GUI\history`，不在安装目录内。
- Windows 可能提示未知发布者，选择继续即可；程序暂未进行数字签名。
- 卸载仅删除程序本身；导出文件与历史版本需手动清理，卸载时会提示这两个路径。

- Download `AdaaFictionGUI-Setup-1.2.2.exe` from the Releases page and double-click to install. It installs to `C:\Program Files\Adaa_Fiction_Workshop` by default; the wizard allows changing the folder.
- Export files and history are stored under `Documents\fiction_GUI\output` and `Documents\fiction_GUI\history`, outside the installation folder.
- Windows may warn about an unknown publisher; continuing is fine, as the app is not code-signed yet.
- Uninstalling removes the program only. Export files and history must be deleted manually; the uninstaller shows both paths.

---

## 版权 / Copyright

本软件的版权与最终解释权归作者 **Adaa** 所有。

Copyright and final interpretation rights belong to the author, **Adaa**.

Email: 313744963@qq.com
