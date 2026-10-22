# 人物档案 PDF 插件

读取小说工坊导出的 JSON，生成人物档案 PDF。插件只读 JSON，不修改工作区、正文或导出文件。

## 打开工具

双击：

```text
plugins\character-report\打开人物档案工具.bat
```

窗口里依次选择：

1. 小说 JSON
2. 输出 PDF 位置
3. 报告语言
4. 要包含的内容

点「生成 PDF」。完成后可点「打开所在文件夹」。

## 报告内容

- 基本信息：人物字段、自定义字段、分组、势力、标签、别名
- 人物关系
- 人物小传：先列人生轨迹，再按阶段归纳成连续叙述，最后给出总体评价
- 雷达评分，以及按维度综合成段的评分理由、推理过程和结论
- 文本分析摘要并入基本信息，不另列重复记录
- 目录

基本信息和雷达评分表不显示来源列；雷达依据只保留评分理由和原文线索。

## 命令行

高级用法仍保留：

```powershell
node plugins/character-report/run.js "C:\path\to\你的小说.json"
node plugins/character-report/run.js "C:\path\to\你的小说.json" --out "D:\报告.pdf" --lang zh-CN
node plugins/character-report/run.js "C:\path\to\你的小说.json" --ui
```

默认输出到 JSON 同目录：

```text
你的小说_人物档案.pdf
```

`--lang` 支持 `zh-CN` / `zh-TW` / `en` / `ja`，默认 `zh-CN`。

只包含部分内容：

```powershell
node plugins/character-report/run.js input.json --include fields,relations,trajectory
node plugins/character-report/run.js input.json --include fields,radar,analysis
node plugins/character-report/run.js input.json --no-relations --no-analysis --no-toc
```

`--include all` 表示全部。`--no-toc` 去掉目录。
