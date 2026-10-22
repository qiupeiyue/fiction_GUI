  /* ================= 数据 ================= */
  function defaultState() {
    return {
      groups: [],
      characters: [],
      lines: [],
      events: [],
      eventSets: [],
      order: [],
      chapters: [],
      relations: [],
      settings: { categories: [], entries: [], seeded: false },
      analysis: { tasks: [] },
      mergeRules: { chars: [], entries: [] },
    };
  }

  /* 程序自带的五个类别带 kind：识别（时间 / 地点 / 势力）和「固定类别」都按 kind 判断。
     名字按「新建时的界面语言」生成，这样英文用户拿到的就是英文类别名。 */
  const CAT_KIND_BY_NAME = { 物品: "item", 名词: "term", 地点: "place", 纪年: "era", 势力: "faction", 装备: "gear", 技能树: "skill" };
  // 取「这个中文默认词」在当前语言下的写法（没有收录就原样返回）；语言切换时清缓存
  const uiTextCache = new Map();
  function uiTextFor(zh) {
    const key = String(zh == null ? "" : zh);
    if (!key) return key;
    if (uiTextCache.has(key)) return uiTextCache.get(key);
    let out = key;
    try {
      const id = uiLanguage();
      // 先查「默认数据名」表（类别 / 分组 / 默认字段名…），再查界面词条表（品牌名这类）
      const v =
        id === "zh-CN"
          ? null
          : (UI_DEFAULT_DICT[id] && UI_DEFAULT_DICT[id][key]) || (UI_DICT[id] && UI_DICT[id][key]);
      if (v && v !== key) out = v;
    } catch (e) {
      /* 语言表还没准备好就用原文 */
    }
    uiTextCache.set(key, out);
    return out;
  }
  function forgetUiTextCache() {
    uiTextCache.clear();
  }
  function catDefaultName(zh) {
    return uiTextFor(zh);
  }

  /* 类别 / 分组名「显示」用：
     程序自带的默认名字（物品 / 名词 / 地点 / 纪年 / 势力 / 未分组 / 龙套）不管存档里存的是
     哪种语言，显示时都跟着当前界面语言走；用户自己起的名字原样显示。
     （要拿数据、做判断的地方继续用 cat.name，别用这个。） */
  const BUILTIN_CAT_ZH = ["物品", "名词", "地点", "纪年", "势力", "装备", "未分组", "龙套"];
  function builtinZhNameOf(raw) {
    const n = String(raw == null ? "" : raw).trim();
    if (!n) return "";
    if (BUILTIN_CAT_ZH.indexOf(n) >= 0) return n;
    for (let i = 0; i < UI_LANGS.length; i++) {
      const dict = UI_DICT[UI_LANGS[i]];
      if (!dict) continue;
      for (const zh of BUILTIN_CAT_ZH) if (dict[zh] === n) return zh;
    }
    // 类别 / 分组名的译文在「默认数据名」表（UI_DEFAULT_TERMS）里，上面那张界面词条表查不到，
    // 所以还要按默认名反查一次：在英文界面下建出来的「Equipment / Places」要能显示回「装备 / 地点」。
    const owner = uiDefaultOwner(n);
    if (owner && BUILTIN_CAT_ZH.indexOf(owner) >= 0) return owner;
    return "";
  }

  function catDisplayName(cat) {
    if (!cat) return "";
    const zh = builtinZhNameOf(cat.name);
    return zh ? uiTextFor(zh) : String(cat.name || "");
  }

  // 拿「这一类的中文默认名」：给按中文名索引的表（比如各类别的默认字段）用
  function catZhName(cat) {
    return builtinZhNameOf(cat && cat.name) || String((cat && cat.name) || "");
  }

  function groupDisplayName(g) {
    if (!g) return uiTextFor("未分组");
    if (g.special === "extra") return uiTextFor("龙套");
    if (g.special) return uiTextFor("未分组");
    return String(g.name || "");
  }

  /* 线路名显示用：程序自带的「主线 / 暗线 / 明线」跟着界面语言走，用户自己改过的名字原样显示 */
  const BUILTIN_LINE_ZH = ["主线", "暗线", "明线"];
  function lineDisplayName(l) {
    if (!l) return "";
    const raw = String(l.name || "");
    const n = raw.trim();
    if (!n) return raw;
    if (BUILTIN_LINE_ZH.indexOf(n) >= 0) return uiTextFor(n);
    for (let i = 0; i < UI_LANGS.length; i++) {
      const dict = UI_DICT[UI_LANGS[i]];
      if (!dict) continue;
      for (const zh of BUILTIN_LINE_ZH) if (dict[zh] === n) return uiTextFor(zh);
    }
    return raw;
  }
  // 新建章 / 节时的默认标题：跟着界面语言
  function chapterDefaultTitle(n) {
    const lang = uiLanguage();
    if (lang === "en") return `Chapter ${n}`;
    if (lang === "ja") return `第${n}章`;
    return `第 ${n} 章`;
  }
  function sectionDefaultTitle(n) {
    const lang = uiLanguage();
    if (lang === "en") return `Section ${n}`;
    if (lang === "ja") return `第${n}節`;
    return `第 ${n} 节`;
  }
  // 拼「折叠「某某」」这类说明时用的引号：英文用弯引号，中日文用直角引号
  function uiQuote(s) {
    const t = String(s == null ? "" : s);
    return uiLanguage() === "en" ? "\u201C" + t + "\u201D" : "\u300C" + t + "\u300D";
  }
  /* 程序自带的「默认名」（字段名、类别名、几条默认线路名…）在界面上要跟着语言走，
     作者自己改过的名字原样保留。
     反过来也认：老项目是在别的语言下建的，落盘的标签是那个语言的写法，
     这里先把它翻回简体原文，再按当前语言取一次，所以两种项目都不会串语言。
     注意：只在「显示」的时候用，绝不写回数据 —— 存档里的字段名一个字都不动。 */
  let uiDefaultOwnerMap = null;
  function uiDefaultOwner(word) {
    const lb = String(word == null ? "" : word).trim();
    if (!lb) return "";
    if (!uiDefaultOwnerMap) {
      uiDefaultOwnerMap = new Map();
      UI_DEFAULT_TERMS.forEach((row) => {
        const zh = String(row[0] || "").trim();
        if (zh) uiDefaultOwnerMap.set(zh, zh);
      });
      UI_LANGS.forEach((id) => {
        const dict = id === "zh-CN" ? null : UI_DEFAULT_DICT[id];
        if (!dict) return;
        Object.keys(dict).forEach((zh) => {
          const v = String(dict[zh] || "").trim();
          if (v && !uiDefaultOwnerMap.has(v)) uiDefaultOwnerMap.set(v, zh);
        });
      });
      /* 界面词条表里也有一部分「默认数据名」：「事件」这种一个字既当界面词、
         又是纪年类别的默认字段名。老项目在别的语言下建出来时落盘的是外语写法
         （Events / Time…），这里一并认回简体原文，否则切回中文会露外语。
         只认短词（整句提示、带标点的不参与），并且默认名表已经占了的写法不覆盖。 */
      UI_TERMS.forEach((row) => {
        const zh = String((row && row[0]) || "").trim();
        if (!zh || zh.length > 12 || /[。！？\n]/.test(zh)) return;
        UI_LANGS.forEach((id, i) => {
          if (id === "zh-CN") return;
          const v = String((row && row[i]) || "").trim();
          if (v && v !== zh && !uiDefaultOwnerMap.has(v)) uiDefaultOwnerMap.set(v, zh);
        });
      });
    }
    return uiDefaultOwnerMap.get(lb) || "";
  }
  function uiDefaultLabel(word) {
    const lb = String(word == null ? "" : word).trim();
    if (!lb) return "";
    const out = uiTextFor(uiDefaultOwner(lb) || lb);
    return out || lb;
  }
  // 英文用半角括号、破折号，中日文用全角（拼「（原因，暂时不可用）」这类后缀时用）
  function uiFoldNote(text) {
    return uiLanguage() === "en" ? " (" + text + ")" : "（" + text + "）";
  }
  /* ---- 程序自己拼的短句（后面接着人名 / 数字）----
     这些整句查表查不到（中间夹着数据），所以在代码里拼：静态部分按语言取，数据原样。 */
  // 合并原因后面那半句：并入 N 条 / 不合并 / 只剩一条
  function uiMergeTail(n, opt) {
    const o = opt || {};
    const lang = uiLanguage();
    if (n > 0) {
      if (lang === "en") return n + " merged" + (o.kept ? " (the rest kept)" : "");
      if (lang === "ja") return " " + n + " 件を統合" + (o.kept ? "（残りはそのまま）" : "");
      if (lang === "zh-TW") return "併入 " + n + " 條" + (o.kept ? "（其餘不合）" : "");
      return "并入 " + n + " 条" + (o.kept ? "（其余不合）" : "");
    }
    return uiTextFor(o.onlyOne ? "只剩一条，这次不合并" : "不合并");
  }
  // 带数字的短句：涉及 N 个事件 / 提到 N 字 / 被提到 N 字 / 出场 N 个事件…
  function uiCountPhrase(kind, n) {
    const lang = uiLanguage();
    if (kind === "events")
      return lang === "en" ? n + " events" : lang === "ja" ? "イベント " + n + " 件" : lang === "zh-TW" ? "涉及 " + n + " 個事件" : "涉及 " + n + " 个事件";
    if (kind === "mentioned")
      return lang === "en" ? n + " characters mentioned" : lang === "ja" ? n + " 文字で言及" : lang === "zh-TW" ? "提到 " + n + " 字" : "提到 " + n + " 字";
    if (kind === "evidence")
      return lang === "en" ? "mentioned in " + n + " characters" : lang === "ja" ? n + " 文字で言及" : lang === "zh-TW" ? "被提到 " + n + " 字" : "被提到 " + n + " 字";
    return String(n);
  }
  // 圆括号跟着语言走（拼「（别名：…）」这种）
  function uiParens(text) {
    return uiLanguage() === "en" ? " (" + text + ")" : "（" + text + "）";
  }
  // 「标签：内容」这种（英文冒号后面留一个空格）
  function uiLabelColon(labelZh) {
    return uiTextFor(labelZh) + (uiLanguage() === "en" ? ": " : "：");
  }
  // 合并理由：「假名 / 罗马字写法「A」＝「B」」；英文要在标签和引号之间、引号和连接号之间留空格
  function uiNameReason(labelZh, a, b, joiner) {
    const en = uiLanguage() === "en";
    const label = uiTextFor(labelZh);
    const mark = joiner === "＝" ? (en ? " = " : "＝") : " " + joiner + " ";
    return label + (en ? " " : "") + uiQuote(a) + mark + uiQuote(b);
  }
  /* 更长的整句（中间夹着人名 / 数量，查表查不到）：按语言各写一份，代码里取当前语言那一份。 */
  const UI_SENTENCES = {
    novelWordCount: {
      "zh-CN": (n) => `${n} 字`,
      "zh-TW": (n) => `${n} 字`,
      en: (n) => `${n} chars`,
      ja: (n) => `${n} 字`,
    },
    novelProgress: {
      "zh-CN": (w, t) => `已写 ${w} / ${t}`,
      "zh-TW": (w, t) => `已寫 ${w} / ${t}`,
      en: (w, t) => `${w} / ${t} written`,
      ja: (w, t) => `執筆済み ${w} / ${t}`,
    },
    novelDeleteEventWithFile: {
      "zh-CN": (title) => `「${title}」链接了正文文件，删除事件会一起删除这个 .md。确定删除吗？`,
      "zh-TW": (title) => `「${title}」連結了正文檔案，刪除事件會一起刪除這個 .md。確定刪除嗎？`,
      en: (title) => `“${title}” has a linked .md file. Deleting the event will delete that file too. Continue?`,
      ja: (title) => `「${title}」には本文ファイルがリンクされています。イベントを削除するとこの .md も削除されます。削除しますか？`,
    },
    novelDeleteEventsWithFile: {
      "zh-CN": (linked, total) => `要删除的 ${total} 个事件里有 ${linked} 个链接了正文文件，删除事件会一起删除这些 .md。确定删除吗？`,
      "zh-TW": (linked, total) => `要刪除的 ${total} 個事件裡有 ${linked} 個連結了正文檔案，刪除事件會一起刪除這些 .md。確定刪除嗎？`,
      en: (linked, total) => `${linked} of the ${total} events to delete have linked .md files. Deleting them will delete those files too. Continue?`,
      ja: (linked, total) => `削除する ${total} 件のイベントのうち ${linked} 件に本文ファイルがリンクされています。削除するとこれらの .md も削除されます。削除しますか？`,
    },
    novelSourceTruncated: {
      "zh-CN": (n) => `原文较长，已截取前 ${n} 字。`,
      "zh-TW": (n) => `原文較長，已截取前 ${n} 字。`,
      en: (n) => `The original text is long; only the first ${n} characters were filled.`,
      ja: (n) => `原文が長いため、先頭 ${n} 字だけを入れました。`,
    },
    novelFormatGuide: {
      "zh-CN": () =>
        [
          "Markdown 行内格式：",
          "",
          "**粗体** → 粗体",
          "*斜体* → 斜体",
          "***粗斜体*** → 粗体 + 斜体",
          "~~删除线~~ → 删除线",
          "`行内代码` → 等宽代码样式（正文一般不用）",
          "[文字](网址) → 链接",
          "\\*星号\\* → 显示原样的星号",
          "颜色：Markdown 本身不支持；可试 <span style=\"color:#e06c75\">红字</span>（取决于阅读器）",
          "",
          "示例：她**终于**抬起头，*轻声*说：“\\*别怕\\*。”",
        ].join("\n"),
      "zh-TW": () =>
        [
          "Markdown 行內格式：",
          "",
          "**粗體** → 粗體",
          "*斜體* → 斜體",
          "***粗斜體*** → 粗體 + 斜體",
          "~~刪除線~~ → 刪除線",
          "`行內程式碼` → 等寬程式碼樣式（正文一般不用）",
          "[文字](網址) → 連結",
          "\\*星號\\* → 顯示原樣的星號",
          "顏色：Markdown 本身不支援；可試 <span style=\"color:#e06c75\">紅字</span>（取決於閱讀器）",
          "",
          "範例：她**終於**抬起頭，*輕聲*說：「\\*別怕\\*。」",
        ].join("\n"),
      en: () =>
        [
          "Markdown inline formatting:",
          "",
          "**bold** → bold",
          "*italic* → italic",
          "***bold italic*** → bold + italic",
          "~~strikethrough~~ → strikethrough",
          "`inline code` → monospace code style (rarely needed in prose)",
          "[text](url) → link",
          "\\*asterisks\\* → literal asterisks",
          "Color: not supported by Markdown itself; try <span style=\"color:#e06c75\">red text</span> (depends on the reader)",
          "",
          "Example: She **finally** looked up and said *softly*, “\\*Don't be afraid.\\*”",
        ].join("\n"),
      ja: () =>
        [
          "Markdown のインライン書式：",
          "",
          "**太字** → 太字",
          "*斜体* → 斜体",
          "***太字＋斜体*** → 太字＋斜体",
          "~~取り消し線~~ → 取り消し線",
          "`インラインコード` → 等幅コード表示（本文では通常不要）",
          "[文字](URL) → リンク",
          "\\*アスタリスク\\* → そのままのアスタリスク",
          "色：Markdown 自体は非対応。HTML の <span style=\"color:#e06c75\">赤い文字</span> は閲覧ソフト次第です",
          "",
          "例：彼女は**ようやく**顔を上げ、*小さな声で*「\\*怖がらないで\\*」と言った。",
        ].join("\n"),
    },
    novelBookMeta: {
      "zh-CN": (chapters, sections, events) => `共 ${chapters} 章 · ${sections} 节 · ${events} 个事件`,
      "zh-TW": (chapters, sections, events) => `共 ${chapters} 章 · ${sections} 節 · ${events} 個事件`,
      en: (chapters, sections, events) =>
        `${chapters} ${chapters === 1 ? "chapter" : "chapters"} · ${
          sections === 1 ? "1 section" : sections + " sections"
        } · ${events === 1 ? "1 event" : events + " events"}`,
      ja: (chapters, sections, events) => `全 ${chapters} 章 ・ ${sections} 節 ・ ${events} イベント`,
    },
    novelBookGeneratedAt: {
      "zh-CN": (date) => `生成于 ${date}`,
      "zh-TW": (date) => `生成於 ${date}`,
      en: (date) => `Generated ${date}`,
      ja: (date) => `${date} に生成`,
    },
    novelGenerated: {
      "zh-CN": (path) => `已生成：${path}`,
      "zh-TW": (path) => `已生成：${path}`,
      en: (path) => `Generated: ${path}`,
      ja: (path) => `生成しました：${path}`,
    },
    novelGenerateFailed: {
      "zh-CN": (msg) => `生成失败：${msg}`,
      "zh-TW": (msg) => `生成失敗：${msg}`,
      en: (msg) => `Generation failed: ${msg}`,
      ja: (msg) => `生成に失敗しました：${msg}`,
    },
    updateChecking: {
      "zh-CN": () => "正在检查更新…",
      "zh-TW": () => "正在檢查更新…",
      en: () => "Checking for updates…",
      ja: () => "更新を確認しています…",
    },
    updateLatest: {
      "zh-CN": (v) => `已经是最新版本（v${v}）`,
      "zh-TW": (v) => `已經是最新版本（v${v}）`,
      en: (v) => `Already up to date (v${v})`,
      ja: (v) => `最新バージョンです（v${v}）`,
    },
    updateAvailable: {
      "zh-CN": (v) => `发现新版本 v${v}`,
      "zh-TW": (v) => `發現新版本 v${v}`,
      en: (v) => `New version v${v} found`,
      ja: (v) => `新しいバージョン v${v} を検出`,
    },
    updateDownloading: {
      "zh-CN": (v, pct) => `正在下载 v${v}：${pct}%`,
      "zh-TW": (v, pct) => `正在下載 v${v}：${pct}%`,
      en: (v, pct) => `Downloading v${v}: ${pct}%`,
      ja: (v, pct) => `v${v} をダウンロード中：${pct}%`,
    },
    updateReady: {
      "zh-CN": (v) => `v${v} 已下载完成，等待重启安装`,
      "zh-TW": (v) => `v${v} 已下載完成，等待重新啟動安裝`,
      en: (v) => `v${v} downloaded; restart to install`,
      ja: (v) => `v${v} のダウンロード完了。再起動でインストールできます`,
    },
    updateDisabled: {
      "zh-CN": () => "自动更新已关闭",
      "zh-TW": () => "自動更新已關閉",
      en: () => "Auto update is off",
      ja: () => "自動更新はオフです",
    },
    updateIdle: {
      "zh-CN": () => "自动更新已开启",
      "zh-TW": () => "自動更新已開啟",
      en: () => "Auto update is on",
      ja: () => "自動更新はオンです",
    },
    updateError: {
      "zh-CN": (msg) => `自动更新失败：${msg}`,
      "zh-TW": (msg) => `自動更新失敗：${msg}`,
      en: (msg) => `Auto update failed: ${msg}`,
      ja: (msg) => `自動更新に失敗しました：${msg}`,
    },
    novelNoPermission: {
      "zh-CN": (dir) => `这个位置没有写入权限：${dir}（可在「设置 → 路径设置」里换一个目录）`,
      "zh-TW": (dir) => `這個位置沒有寫入權限：${dir}（可在「設定 → 路徑設定」裡換一個目錄）`,
      en: (dir) => `No write permission here: ${dir} (choose another folder in Settings → Paths)`,
      ja: (dir) => `この場所に書き込み権限がありません：${dir}（「設定 → パス設定」で別のフォルダを選んでください）`,
    },
    novelWriteFailed: {
      "zh-CN": (msg) => `写入失败：${msg}`,
      "zh-TW": (msg) => `寫入失敗：${msg}`,
      en: (msg) => `Write failed: ${msg}`,
      ja: (msg) => `書き込みに失敗しました：${msg}`,
    },
    // 设置里「字段设置 → 生效」的两个提示 + 撤销悬浮里的同一句（都带「人物 / 事件 / 设定」这个词）
    fieldsetAppliedAll: {
      "zh-CN": (kind, n) => `字段设置已应用到所有${uiFieldsetWhat(kind)}${n ? `（同步了 ${n} 张卡片）` : ""}`,
      "zh-TW": (kind, n) => `欄位設定已套用到所有${uiFieldsetWhat(kind)}${n ? `（同步了 ${n} 張卡片）` : ""}`,
      en: (kind, n) => `Field settings applied to all ${uiFieldsetWhat(kind)}${n ? ` (${n} cards synced)` : ""}`,
      ja: (kind, n) => `項目設定をすべての${uiFieldsetWhat(kind)}に適用しました${n ? `（${n} 件を同期）` : ""}`,
    },
    fieldsetSavedDefault: {
      "zh-CN": (kind) => `字段设置已设为新建${uiFieldsetWhat(kind)}的默认`,
      "zh-TW": (kind) => `欄位設定已設為新增${uiFieldsetWhat(kind)}的預設`,
      en: (kind) => `Field settings saved as the default for new ${uiFieldsetWhat(kind)}`,
      ja: (kind) => `項目設定を新しい${uiFieldsetWhat(kind)}の既定にしました`,
    },
    fieldsetUndoAll: {
      "zh-CN": (kind) => `应用字段设置到所有${uiFieldsetWhat(kind)}`,
      "zh-TW": (kind) => `套用欄位設定到所有${uiFieldsetWhat(kind)}`,
      en: (kind) => `Apply field settings to all ${uiFieldsetWhat(kind)}`,
      ja: (kind) => `すべての${uiFieldsetWhat(kind)}に項目設定を適用`,
    },
    fieldsetUndoSaved: {
      "zh-CN": (kind) => `字段设置设为新建${uiFieldsetWhat(kind)}的默认`,
      "zh-TW": (kind) => `欄位設定設為新增${uiFieldsetWhat(kind)}的預設`,
      en: (kind) => `Save field settings as the default for new ${uiFieldsetWhat(kind)}`,
      ja: (kind) => `新しい${uiFieldsetWhat(kind)}の既定として項目設定を保存`,
    },
    // 新建分析任务的默认名
    taskDefaultName: {
      "zh-CN": (n) => `分析任务 ${n}`,
      "zh-TW": (n) => `分析任務 ${n}`,
      en: (n) => `Task ${n}`,
      ja: (n) => `解析タスク ${n}`,
    },
    /* ---- 树型拓扑（技能树等）---- */
    /* 拖拽时跟着鼠标的小气泡（15-drag.js）：**拼出来的句子**必须走这里，不能直接把中文拼进去
       （英文 / 日文界面下会漏中文——2026-10-16 用户抓到的「角色：乙」就是这么来的） */
    dragGhostChar: {
      "zh-CN": (name) => `角色：${name}`,
      "zh-TW": (name) => `角色：${name}`,
      en: (name) => `Character: ${name}`,
      ja: (name) => `人物：${name}`,
    },
    dragGhostChars: {
      "zh-CN": (n) => `批量：${n} 位人物`,
      "zh-TW": (n) => `批次：${n} 位人物`,
      en: (n) => `${n} characters`,
      ja: (n) => `まとめて ${n} 人`,
    },
    dragGhostEvent: {
      "zh-CN": (title) => `事件：${title}`,
      "zh-TW": (title) => `事件：${title}`,
      en: (title) => `Event: ${title}`,
      ja: (title) => `イベント：${title}`,
    },
    dragGhostEventGroup: {
      "zh-CN": (n) => `整组 ${n} 个事件 · 拖到目标时间行（左右位置决定线路）`,
      "zh-TW": (n) => `整組 ${n} 個事件 · 拖到目標時間行（左右位置決定線路）`,
      en: (n) => `Group of ${n} · drop on a time row (left / right picks the line)`,
      ja: (n) => `${n} 件まとめて · 時間行へドロップ（左右でラインが決まります）`,
    },
    dragGhostEventSet: {
      "zh-CN": (name) => `事件集：${name} · 拖动整集`,
      "zh-TW": (name) => `事件集：${name} · 拖動整集`,
      en: (name) => `Event set: ${name} · dragging the whole set`,
      ja: (name) => `イベント集合：${name} · まとめて移動`,
    },
    moveEventSetUndo: {
      "zh-CN": (name) => `移动事件集「${name}」`,
      "zh-TW": (name) => `移動事件集「${name}」`,
      en: (name) => `Move the event set “${name}”`,
      ja: (name) => `イベント集合「${name}」を移動`,
    },
    moveEventSetToast: {
      "zh-CN": (name) => `已移动事件集「${name}」`,
      "zh-TW": (name) => `已移動事件集「${name}」`,
      en: (name) => `Moved the event set “${name}”`,
      ja: (name) => `イベント集合「${name}」を移動しました`,
    },
    /* ---- 人物分析：系谱（1.2.2）---- */
    pedNodeMenuTitle: {
      "zh-CN": (name) => `对象「${name}」`,
      "zh-TW": (name) => `對象「${name}」`,
      en: (name) => `Object “${name}”`,
      ja: (name) => `オブジェクト「${name}」`,
    },
    pedAddUndo: {
      "zh-CN": (name) => `新增对象「${name}」`,
      "zh-TW": (name) => `新增對象「${name}」`,
      en: (name) => `Add “${name}” to the pedigree`,
      ja: (name) => `「${name}」を系譜に追加`,
    },
    pedAddUndoN: {
      "zh-CN": (n) => `新增 ${n} 个对象`,
      "zh-TW": (n) => `新增 ${n} 個對象`,
      en: (n) => `Add ${n} objects`,
      ja: (n) => `${n} 件を系譜に追加`,
    },
    pedRowUndo: {
      "zh-CN": (name, row) => `将「${name}」移至 ${row}`,
      "zh-TW": (name, row) => `將「${name}」移至 ${row}`,
      en: (name, row) => `Move “${name}” to ${row}`,
      ja: (name, row) => `「${name}」を ${row} へ移動`,
    },
    pedUnionUndo: {
      "zh-CN": (a, b) => `将「${a}」与「${b}」建立结合线`,
      "zh-TW": (a, b) => `將「${a}」與「${b}」建立結合線`,
      en: (a, b) => `Link “${a}” — “${b}”`,
      ja: (a, b) => `「${a}」と「${b}」を結合線でつなぐ`,
    },
    pedDescentUndo: {
      "zh-CN": (child, who) => `将「${child}」置为「${who}」的子级`,
      "zh-TW": (child, who) => `將「${child}」置為「${who}」的子級`,
      en: (child, who) => `Set “${child}” as a child of ${who}`,
      ja: (child, who) => `「${child}」を「${who}」の子に`,
    },
    pedDescentReplaceUndo: {
      "zh-CN": (child, who) => `将「${child}」的父级改为「${who}」`,
      "zh-TW": (child, who) => `將「${child}」的父級改為「${who}」`,
      en: (child, who) => `Re-parent “${child}” to ${who}`,
      ja: (child, who) => `「${child}」の親を「${who}」に変更`,
    },
    pedDelUndo: {
      "zh-CN": (name) => `删除对象「${name}」`,
      "zh-TW": (name) => `刪除對象「${name}」`,
      en: (name) => `Delete “${name}”`,
      ja: (name) => `對象「${name}」を削除`,
    },
    pedDelUndoWires: {
      "zh-CN": (name, n) => `删除对象「${name}」（连同 ${n} 条线）`,
      "zh-TW": (name, n) => `刪除對象「${name}」（連同 ${n} 條線）`,
      en: (name, n) => `Delete “${name}” (and ${n} line(s))`,
      ja: (name, n) => `對象「${name}」を削除（線 ${n} 本も）`,
    },
    pedDelUndoN: {
      "zh-CN": (n) => `删除 ${n} 个对象`,
      "zh-TW": (n) => `刪除 ${n} 個對象`,
      en: (n) => `Delete ${n} objects`,
      ja: (n) => `${n} 個の對象を削除`,
    },
    pedDelUndoNWires: {
      "zh-CN": (n, m) => `删除 ${n} 个对象（连同 ${m} 条线）`,
      "zh-TW": (n, m) => `刪除 ${n} 個對象（連同 ${m} 條線）`,
      en: (n, m) => `Delete ${n} objects (and ${m} line(s))`,
      ja: (n, m) => `${n} 個の對象を削除（線 ${m} 本も）`,
    },
    pedUnionDelUndo: {
      "zh-CN": (a, b) => `删除「${a}」与「${b}」的结合线`,
      "zh-TW": (a, b) => `刪除「${a}」與「${b}」的結合線`,
      en: (a, b) => `Delete the union line of “${a}” and “${b}”`,
      ja: (a, b) => `「${a}」と「${b}」の結合線を削除`,
    },
    pedUnionDelUndoWires: {
      "zh-CN": (a, b, n) => `删除「${a}」与「${b}」的结合线（其下 ${n} 条世系线一并移除，子级置为悬空）`,
      "zh-TW": (a, b, n) => `刪除「${a}」與「${b}」的結合線（其下 ${n} 條世系線一併移除，子級設為懸空）`,
      en: (a, b, n) => `Delete the union line of “${a}” and “${b}” (${n} descent line(s) removed, the children float)`,
      ja: (a, b, n) => `「${a}」と「${b}」の結合線を削除（世系線 ${n} 本も切れ、子は宙ぶらりんに）`,
    },
    pedUnionEditUndo: {
      "zh-CN": (oldName, newName) => `将结合线的「${oldName}」替换为「${newName}」`,
      "zh-TW": (oldName, newName) => `將結合線的「${oldName}」替換為「${newName}」`,
      en: (oldName, newName) => `Replace “${oldName}” with “${newName}” on the union line`,
      ja: (oldName, newName) => `結合線の「${oldName}」を「${newName}」に`,
    },
    pedReplaceEnd: {
      "zh-CN": (name) => `替换「${name}」…`,
      "zh-TW": (name) => `替換「${name}」…`,
      en: (name) => `Replace “${name}”…`,
      ja: (name) => `「${name}」を差し替え…`,
    },
    pedDescentChildUndo: {
      "zh-CN": (name) => `将该世系线的子级替换为「${name}」`,
      "zh-TW": (name) => `將該世系線的子級替換為「${name}」`,
      en: (name) => `Point the descent line at “${name}”`,
      ja: (name) => `世系線の子を「${name}」に`,
    },
    pedDescentTopUndo: {
      "zh-CN": (name) => `替换「${name}」的世系线上端锚点`,
      "zh-TW": (name) => `替換「${name}」的世系線上端錨點`,
      en: (name) => `Change the top anchor of the descent line of “${name}”`,
      ja: (name) => `「${name}」の世系線の上端を変更`,
    },
    pedDescentDelUndo: {
      "zh-CN": (name) => `删除「${name}」的世系线`,
      "zh-TW": (name) => `刪除「${name}」的世系線`,
      en: (name) => `Delete the descent line of “${name}”`,
      ja: (name) => `「${name}」の世系線を削除`,
    },
    /* 系谱：用人物链里的另一张卡替换这个对象（回形针面板） */
    pedSwapUndo: {
      "zh-CN": (oldName, newName) => `将对象「${oldName}」替换为「${newName}」`,
      "zh-TW": (oldName, newName) => `將對象「${oldName}」替換為「${newName}」`,
      en: (oldName, newName) => `Replace “${oldName}” with “${newName}”`,
      ja: (oldName, newName) => `オブジェクト「${oldName}」を「${newName}」に`,
    },
    pedSwapToast: {
      "zh-CN": (newName) => `已替换为「${newName}」（连线保持不变）`,
      "zh-TW": (newName) => `已替換為「${newName}」（連線保持不變）`,
      en: (newName) => `Replaced with “${newName}” (lines unchanged)`,
      ja: (newName) => `「${newName}」に差し替えました（線もそのまま）`,
    },
    /* 系谱：整个家族（连通拓扑）左移 / 右移（和相邻那块换位） */
    pedMoveLeftUndo: {
      "zh-CN": (name) => `将「${name}」所在的家族左移`,
      "zh-TW": (name) => `將「${name}」所在的家族左移`,
      en: (name) => `Move the family of “${name}” left`,
      ja: (name) => `「${name}」の一族を左へ`,
    },
    pedMoveRightUndo: {
      "zh-CN": (name) => `将「${name}」所在的家族右移`,
      "zh-TW": (name) => `將「${name}」所在的家族右移`,
      en: (name) => `Move the family of “${name}” right`,
      ja: (name) => `「${name}」の一族を右へ`,
    },
    /* 系谱图（左边栏）：新建 / 改名 / 删除 */
    pedChartNewUndo: {
      "zh-CN": (name) => `新建系谱图「${name}」`,
      "zh-TW": (name) => `新增系譜圖「${name}」`,
      en: (name) => `New pedigree “${name}”`,
      ja: (name) => `系譜図「${name}」を新規作成`,
    },
    pedChartRenameUndo: {
      "zh-CN": (name) => `将系谱图改名为「${name}」`,
      "zh-TW": (name) => `將系譜圖改名為「${name}」`,
      en: (name) => `Rename the pedigree to “${name}”`,
      ja: (name) => `系譜図の名前を「${name}」に変更`,
    },
    pedChartDelUndo: {
      "zh-CN": (name) => `删除系谱图「${name}」`,
      "zh-TW": (name) => `刪除系譜圖「${name}」`,
      en: (name) => `Delete the pedigree “${name}”`,
      ja: (name) => `系譜図「${name}」を削除`,
    },
    pedChartClearUndo: {
      "zh-CN": (name) => `清空系谱图「${name}」`,
      "zh-TW": (name) => `清空系譜圖「${name}」`,
      en: (name) => `Clear the pedigree “${name}”`,
      ja: (name) => `系譜図「${name}」を空にする`,
    },
    pedChartOrderUndo: {
      "zh-CN": () => `调整系谱图顺序`,
      "zh-TW": () => `調整系譜圖順序`,
      en: () => `Reorder the pedigrees`,
      ja: () => `系譜図の並び順を変更`,
    },
    /* 系谱图：「整理重排」（只对当前这张图：树根顶到 F0、压掉空行、横向再自动整理） */
    pedRelayoutUndo: {
      "zh-CN": (name) => `整理重排系谱图「${name}」`,
      "zh-TW": (name) => `整理重排系譜圖「${name}」`,
      en: (name) => `Tidy up the pedigree “${name}”`,
      ja: (name) => `系譜図「${name}」を整理して再配置`,
    },
    treeAddNodeUndo: {
      "zh-CN": (name) => `把「${name}」放进拓扑`,
      "zh-TW": (name) => `把「${name}」放進拓撲`,
      en: (name) => `Add “${name}” to the tree`,
      ja: (name) => `「${name}」をツリーに追加`,
    },
    treeAddNodeUndoN: {
      "zh-CN": (n) => `把 ${n} 张卡放进拓扑`,
      "zh-TW": (n) => `把 ${n} 張卡放進拓撲`,
      en: (n) => `Add ${n} cards to the tree`,
      ja: (n) => `${n} 件をツリーに追加`,
    },
    treeAddNodeChild: {
      "zh-CN": (n, parent) => `已把 ${n} 个节点挂到「${parent}」下面`,
      "zh-TW": (n, parent) => `已把 ${n} 個節點掛到「${parent}」下面`,
      en: (n, parent) => `${n} node(s) placed under “${parent}”`,
      ja: (n, parent) => `${n} 個を「${parent}」の下に置きました`,
    },
    treeAddNodeRow: {
      "zh-CN": (n, row) => `已在 ${row} 放好 ${n} 个节点`,
      "zh-TW": (n, row) => `已在 ${row} 放好 ${n} 個節點`,
      en: (n, row) => `${n} node(s) placed at ${row}`,
      ja: (n, row) => `${row} に ${n} 個を置きました`,
    },
    treeLinkUndo: {
      "zh-CN": (child, parent) => `把「${child}」挂到「${parent}」下面`,
      "zh-TW": (child, parent) => `把「${child}」掛到「${parent}」下面`,
      en: (child, parent) => `Link “${child}” under “${parent}”`,
      ja: (child, parent) => `「${child}」を「${parent}」の下に接続`,
    },
    treeUnlinkUndo: {
      "zh-CN": (id) => `把「${id}」设为悬空`,
      "zh-TW": (id) => `把「${id}」設為懸空`,
      en: (id) => `Set “${id}” as floating`,
      ja: (id) => `「${id}」を宙ぶらりんにする`,
    },
    treeMoveRowUndo: {
      "zh-CN": (id, row) => `把「${id}」移到 ${row}`,
      "zh-TW": (id, row) => `把「${id}」移到 ${row}`,
      en: (id, row) => `Move “${id}” to ${row}`,
      ja: (id, row) => `「${id}」を ${row} へ移動`,
    },
    /* 树型拓扑：和相邻的那棵树换显示位置（只换横向摆位，不动拓扑） */
    treeMoveLeftUndo: {
      "zh-CN": (name) => `把「${name}」这棵树移到左边`,
      "zh-TW": (name) => `把「${name}」這棵樹移到左邊`,
      en: (name) => `Move the tree of “${name}” left`,
      ja: (name) => `「${name}」のツリーを左へ移動`,
    },
    treeMoveRightUndo: {
      "zh-CN": (name) => `把「${name}」这棵树移到右边`,
      "zh-TW": (name) => `把「${name}」這棵樹移到右邊`,
      en: (name) => `Move the tree of “${name}” right`,
      ja: (name) => `「${name}」のツリーを右へ移動`,
    },
    /* 树型拓扑：「整理重排」（整栏一次：树根回 F0、子级紧贴父级、压掉空行；不动拓扑） */
    treeTidyUndo: {
      "zh-CN": (name) => `整理重排「${name}」的树型拓扑`,
      "zh-TW": (name) => `整理重排「${name}」的樹型拓撲`,
      en: (name) => `Tidy up the tree of “${name}”`,
      ja: (name) => `「${name}」のツリーを整理して再配置`,
    },
    /* 一轮分析结束时报一下 token 账：缓存命中没命中，用户一眼能看见 */
    tokenCacheStat: {
      "zh-CN": (p, c, pc) => `本轮输入 ${p} token，其中缓存命中 ${c}（${pc}%）`,
      "zh-TW": (p, c, pc) => `本輪輸入 ${p} token，其中快取命中 ${c}（${pc}%）`,
      en: (p, c, pc) => `Input ${p} tokens this run — ${c} from cache (${pc}%)`,
      ja: (p, c, pc) => `今回の入力 ${p} token（うちキャッシュ命中 ${c}、${pc}%）`,
    },
    /* 悬空（批量）：和上级的拓扑关系去掉，节点 / 卡片都留着 */
    treeUnlinkManyUndo: {
      "zh-CN": (n) => `把 ${n} 个节点设为悬空`,
      "zh-TW": (n) => `把 ${n} 個節點設為懸空`,
      en: (n) => `Set ${n} node(s) as floating`,
      ja: (n) => `${n} 個のノードを宙ぶらりんにする`,
    },
    treeLinkManyUndo: {
      "zh-CN": (n, parent) => `把 ${n} 个节点挂到「${parent}」下面`,
      "zh-TW": (n, parent) => `把 ${n} 個節點掛到「${parent}」下面`,
      en: (n, parent) => `Link ${n} nodes under “${parent}”`,
      ja: (n, parent) => `${n} 個を「${parent}」の下に接続`,
    },
    treeLinkManyToast: {
      "zh-CN": (n, parent) => `已把 ${n} 个节点挂到「${parent}」下面`,
      "zh-TW": (n, parent) => `已把 ${n} 個節點掛到「${parent}」下面`,
      en: (n, parent) => `${n} node(s) linked under “${parent}”`,
      ja: (n, parent) => `${n} 個を「${parent}」の下に接続しました`,
    },
    treeDeleteUndo: {
      "zh-CN": (n) => `从拓扑里删掉 ${n} 个节点`,
      "zh-TW": (n) => `從拓撲裡刪掉 ${n} 個節點`,
      en: (n) => `Remove ${n} node(s) from the tree`,
      ja: (n) => `ツリーから ${n} 個のノードを削除`,
    },
    treeDeleteToast: {
      "zh-CN": (n) => `已从拓扑里删掉 ${n} 个节点（卡片还在）`,
      "zh-TW": (n) => `已從拓撲裡刪掉 ${n} 個節點（卡片還在）`,
      en: (n) => `${n} node(s) removed from the tree (cards kept)`,
      ja: (n) => `${n} 個のノードを削除しました（カードは残っています）`,
    },
    treeReplaceUndo: {
      "zh-CN": (a, b) => `把节点「${a}」换成「${b}」`,
      "zh-TW": (a, b) => `把節點「${a}」換成「${b}」`,
      en: (a, b) => `Replace node “${a}” with “${b}”`,
      ja: (a, b) => `ノード「${a}」を「${b}」に置き換え`,
    },
    treeNodeMenuTitle: {
      "zh-CN": (name) => `节点「${name}」`,
      "zh-TW": (name) => `節點「${name}」`,
      en: (name) => `Node “${name}”`,
      ja: (name) => `ノード「${name}」`,
    },
    treeSelectAllToast: {
      "zh-CN": (n) => `已全选树上的 ${n} 个节点`,
      "zh-TW": (n) => `已全選樹上的 ${n} 個節點`,
      en: (n) => `Selected all ${n} nodes in the tree`,
      ja: (n) => `ツリー上の ${n} 個のノードを全選択しました`,
    },
    /* 设定档案类别选项卡的悬浮：里面有多少个条目（选项卡上不再写 (N)） */
    catTabTipCount: {
      "zh-CN": (n) => `${n} 个条目`,
      "zh-TW": (n) => `${n} 個條目`,
      en: (n) => `${n} entries`,
      ja: (n) => `${n} 件`,
    },
    /* 树型拓扑：给一整棵树换配色 */
    treeColorUndo: {
      "zh-CN": (name) => `改「${name}」这棵树的配色`,
      "zh-TW": (name) => `改「${name}」這棵樹的配色`,
      en: (name) => `Recolor the tree of “${name}”`,
      ja: (name) => `「${name}」のツリーの配色を変更`,
    },
    treeColorToast: {
      "zh-CN": (name) => `已换「${name}」这棵树的配色`,
      "zh-TW": (name) => `已換「${name}」這棵樹的配色`,
      en: (name) => `Recolored the tree of “${name}”`,
      ja: (name) => `「${name}」のツリーの配色を変更しました`,
    },
    treeSelectNoneToast: {
      "zh-CN": () => "已取消全选",
      "zh-TW": () => "已取消全選",
      en: () => "Selection cleared",
      ja: () => "全選択を解除しました",
    },
    taskRenamedFromFile: {
      "zh-CN": (name) => `任务名已改为「${name}」——双击任务卡可以自己改`,
      "zh-TW": (name) => `任務名已改為「${name}」——雙擊任務卡可以自己改`,
      en: (name) => `Task renamed to “${name}” — double-click the task tab to change it`,
      ja: (name) => `タスク名を「${name}」に変更しました（タスクをダブルクリックで変更できます）`,
    },
    /* ---- 地图（设定档案 → 地点）---- */
    mapDefaultName: {
      "zh-CN": (n) => `地图 ${n}`,
      "zh-TW": (n) => `地圖 ${n}`,
      en: (n) => `Map ${n}`,
      ja: (n) => `地図 ${n}`,
    },
    mapCreateUndo: {
      "zh-CN": (name) => `新建地图：「${name}」`,
      "zh-TW": (name) => `新增地圖：「${name}」`,
      en: (name) => `New map: “${name}”`,
      ja: (name) => `マップを作成：「${name}」`,
    },
    mapRenameUndo: {
      "zh-CN": (a, b) => `重命名地图：「${a}」→「${b}」`,
      "zh-TW": (a, b) => `地圖改名：「${a}」→「${b}」`,
      en: (a, b) => `Rename the map: “${a}” → “${b}”`,
      ja: (a, b) => `マップ名を変更：「${a}」→「${b}」`,
    },
    mapAspectUndo: {
      "zh-CN": (name, ratio) => `「${name}」画布比例改成 ${ratio}`,
      "zh-TW": (name, ratio) => `「${name}」畫布比例改成 ${ratio}`,
      en: (name, ratio) => `“${name}” canvas aspect is now ${ratio}`,
      ja: (name, ratio) => `「${name}」のキャンバス比率を ${ratio} に変更`,
    },
    mapCopyName: {
      "zh-CN": (name) => `${name} 副本`,
      "zh-TW": (name) => `${name} 副本`,
      en: (name) => `${name} copy`,
      ja: (name) => `${name} のコピー`,
    },
    // 出场统计顶部那一行概览（搜索框左边）
    statsSummary: {
      "zh-CN": (all, main, avg) => `人物总数：${all}，非龙套人数：${main}，人均出场事件：${avg}`,
      "zh-TW": (all, main, avg) => `人物總數：${all}，非龍套人數：${main}，人均出場事件：${avg}`,
      en: (all, main, avg) => `Characters: ${all} · Non-extras: ${main} · Events per character: ${avg}`,
      ja: (all, main, avg) => `人物総数：${all}・端役以外：${main}・一人あたりの登場イベント：${avg}`,
    },
    // 人物 / 条目卡片上那圈悬浮说明（悬停才出现，普通语言扫描看不到）
    recordTipTitle: {
      "zh-CN": (tag, name) => `【${tag}】${name}`,
      "zh-TW": (tag, name) => `【${tag}】${name}`,
      en: (tag, name) => `[${tag}] ${name}`,
      ja: (tag, name) => `【${tag}】${name}`,
    },
    recordTipAssoc: {
      "zh-CN": (ne, ns) => `关联：${ne} 个事件　${ns} 个设定条目`,
      "zh-TW": (ne, ns) => `關聯：${ne} 個事件　${ns} 個設定項目`,
      en: (ne, ns) => `Linked: ${ne} event(s) · ${ns} entr(y/ies)`,
      ja: (ne, ns) => `関連：イベント ${ne} 件・設定項目 ${ns} 件`,
    },
    recordTipAssocEntry: {
      "zh-CN": (nc, ne) => `关联：${nc} 位人物　${ne} 个事件`,
      "zh-TW": (nc, ne) => `關聯：${nc} 位人物　${ne} 個事件`,
      en: (nc, ne) => `Linked: ${nc} character(s) · ${ne} event(s)`,
      ja: (nc, ne) => `関連：人物 ${nc} 人・イベント ${ne} 件`,
    },
    mapCopyUndo: {
      "zh-CN": (name) => `复制地图：「${name}」`,
      "zh-TW": (name) => `複製地圖：「${name}」`,
      en: (name) => `Copy the map “${name}”`,
      ja: (name) => `マップ「${name}」を複製`,
    },
    mapDeleteUndo: {
      "zh-CN": (name) => `删除地图：「${name}」`,
      "zh-TW": (name) => `刪除地圖：「${name}」`,
      en: (name) => `Delete the map “${name}”`,
      ja: (name) => `マップ「${name}」を削除`,
    },
    // 删地图的二次确认：短句，别写成一段话
    mapDeleteConfirm: {
      "zh-CN": (name) => `删除地图「${name}」？区域 / 图标一起删（可撤销）`,
      "zh-TW": (name) => `刪除地圖「${name}」？區域 / 圖示一起刪（可復原）`,
      en: (name) => `Delete map “${name}”? Regions/pins go too (undoable)`,
      ja: (name) => `マップ「${name}」を削除？区域 / ピンも一緒に消えます（取り消し可）`,
    },
    mapLinkUndo: {
      "zh-CN": (name) => `地图关联地点：「${name}」`,
      "zh-TW": (name) => `地圖關聯地點：「${name}」`,
      en: (name) => `Link the map region to “${name}”`,
      ja: (name) => `マップと場所「${name}」を関連付け`,
    },
    mapLinkedTo: {
      "zh-CN": (name) => `已把这块区域关联到「${name}」`,
      "zh-TW": (name) => `已把這塊區域關聯到「${name}」`,
      en: (name) => `Linked this region to “${name}”`,
      ja: (name) => `この区域を「${name}」に関連付けました`,
    },
    mapUnlinkUndo: {
      "zh-CN": (name) => `地图取消关联：「${name}」`,
      "zh-TW": (name) => `地圖取消關聯：「${name}」`,
      en: (name) => `Unlink “${name}” from the map`,
      ja: (name) => `マップから「${name}」の関連を解除`,
    },
    mapNoPlaceMatch: {
      "zh-CN": (input) => `没有匹配到地点「${input}」：从下拉里选一个，或者先去「设定档案 → 地点」建好这个地点。`,
      "zh-TW": (input) => `沒有符合的地點「${input}」：從下拉裡選一個，或者先去「設定檔案 → 地點」建立這個地點。`,
      en: (input) => `No place matches “${input}”. Pick one from the list, or create it under Library → Places first.`,
      ja: (input) => `「${input}」に一致する場所がありません。一覧から選ぶか、先に「設定資料 → 場所」で作成してください。`,
    },
    mapIconAddUndo: {
      "zh-CN": (name) => `在地图上放地点图标：「${name}」`,
      "zh-TW": (name) => `在地圖上放地點圖示：「${name}」`,
      en: (name) => `Add a map pin for “${name}”`,
      ja: (name) => `マップに「${name}」のピンを追加`,
    },
    mapIconChangeUndo: {
      "zh-CN": (name) => `地图上的图标改成：「${name}」`,
      "zh-TW": (name) => `地圖上的圖示改成：「${name}」`,
      en: (name) => `Change the map pin to “${name}”`,
      ja: (name) => `マップのピンを「${name}」に変更`,
    },
    // 人物卡拖到地图上「已关联地点」的区域 / 图标：把人物加进那张地点卡
    mapCharLinkUndo: {
      "zh-CN": (n, name) => `把 ${n} 位人物加进地点卡「${name}」`,
      "zh-TW": (n, name) => `把 ${n} 位人物加進地點卡「${name}」`,
      en: (n, name) => `Add ${n} character(s) to the place “${name}”`,
      ja: (n, name) => `場所「${name}」に人物 ${n} 人を追加`,
    },
    mapCharsLinkUndo: {
      "zh-CN": (n, name) => `把 ${n} 位人物加进地点卡「${name}」`,
      "zh-TW": (n, name) => `把 ${n} 位人物加進地點卡「${name}」`,
      en: (n, name) => `Add ${n} characters to the place “${name}”`,
      ja: (n, name) => `場所「${name}」に人物 ${n} 人を追加`,
    },
    mapCharsLinked: {
      "zh-CN": (n, name) => `已把 ${n} 位人物加进地点卡「${name}」`,
      "zh-TW": (n, name) => `已把 ${n} 位人物加進地點卡「${name}」`,
      en: (n, name) => `Added ${n} character(s) to the place “${name}”`,
      ja: (n, name) => `場所「${name}」に人物 ${n} 人を追加しました`,
    },
    mapIconDeleteUndo: {
      "zh-CN": (name) => `删除地图上的地点图标：「${name}」`,
      "zh-TW": (name) => `刪除地圖上的地點圖示：「${name}」`,
      en: (name) => `Delete the map pin for “${name}”`,
      ja: (name) => `「${name}」のピンを削除`,
    },
    mapIconToneDarkUndo: {
      "zh-CN": (name) => `地图图标字体改成黑色：「${name}」`,
      "zh-TW": (name) => `地圖圖示字體改成黑色：「${name}」`,
      en: (name) => `Map pin label in black: “${name}”`,
      ja: (name) => `マップ ピンのラベルを黒に：「${name}」`,
    },
    mapIconToneLightUndo: {
      "zh-CN": (name) => `地图图标字体改成白色：「${name}」`,
      "zh-TW": (name) => `地圖圖示字體改成白色：「${name}」`,
      en: (name) => `Map pin label in white: “${name}”`,
      ja: (name) => `マップ ピンのラベルを白に：「${name}」`,
    },
    mapVectorDone: {
      "zh-CN": (kind) => (kind === "board" ? "图片已转成矢量：一块块区域都画好了，点一下就能关联地点。" : "图片已转成矢量图：双击空白处放地点图标，或把地点卡拖进来。"),
      "zh-TW": (kind) => (kind === "board" ? "圖片已轉成向量：一塊塊區域都畫好了，點一下就能關聯地點。" : "圖片已轉成向量圖：雙擊空白處放地點圖示，或把地點卡拖進來。"),
      en: (kind) => (kind === "board" ? "Image turned into vector regions — click one to link a place." : "Image turned into a vector map — double-click an empty spot to drop a pin, or drag a place card in."),
      ja: (kind) => (kind === "board" ? "画像をベクター化しました。区域をクリックして場所を関連付けてください。" : "画像をベクター化しました。余白をダブルクリックするか、場所カードをドラッグしてピンを置けます。"),
    },
    // 自动找出被围住的空隙
    mapClosedFound: {
      "zh-CN": (n) => `找到了 ${n} 块封闭区域`,
      "zh-TW": (n) => `找到了 ${n} 塊封閉區域`,
      en: (n) => `Found ${n} enclosed area(s)`,
      ja: (n) => `閉じた区域を ${n} 件検出しました`,
    },
    mapEraseUndo: {
      "zh-CN": (name) => `擦掉地图区域：「${name}」`,
      "zh-TW": (name) => `擦掉地圖區域：「${name}」`,
      en: (name) => `Erase the map region “${name}”`,
      ja: (name) => `マップ区域「${name}」を消す`,
    },
    // 橡皮一划擦掉好几块：整划算一步撤销，标签用这句
    mapEraseUndoMany: {
      "zh-CN": (n) => `擦掉 ${n} 块地图区域`,
      "zh-TW": (n) => `擦掉 ${n} 塊地圖區域`,
      en: (n) => `Erase ${n} map regions`,
      ja: (n) => `マップ区域を ${n} 件消す`,
    },
    mapEraseStrokeUndoMany: {
      "zh-CN": (n) => `擦掉地图上画的 ${n} 笔`,
      "zh-TW": (n) => `擦掉地圖上畫的 ${n} 筆`,
      en: (n) => `Erase ${n} drawn lines`,
      ja: (n) => `描いた線を ${n} 本消す`,
    },
    mapEraseMixedUndo: {
      "zh-CN": (r, s) => `擦掉地图上的 ${r} 块区域、${s} 笔线`,
      "zh-TW": (r, s) => `擦掉地圖上的 ${r} 塊區域、${s} 筆線`,
      en: (r, s) => `Erase ${r} region(s) and ${s} drawn line(s)`,
      ja: (r, s) => `マップの区域 ${r} 件と線 ${s} 本を消す`,
    },
    // 导入文件之后那行状态
    importedFiles: {
      "zh-CN": (ok, fail, chapterLike, autoChapters) =>
        (fail ? `已导入 ${ok} 个，失败 ${fail} 个。` : `已导入 ${ok} 个文件。`) +
        (chapterLike ? ` 识别出 ${chapterLike} 个章节（文件名和正文里的标题都能作为依据）` : "") +
        (autoChapters ? `，并已自动建立 ${autoChapters} 个章节。` : chapterLike ? "。" : ""),
      "zh-TW": (ok, fail, chapterLike, autoChapters) =>
        (fail ? `已匯入 ${ok} 個，失敗 ${fail} 個。` : `已匯入 ${ok} 個檔案。`) +
        (chapterLike ? ` 識別出 ${chapterLike} 個章節（檔案名和正文裡的標題都能作為依據）` : "") +
        (autoChapters ? `，並已自動建立 ${autoChapters} 個章節。` : chapterLike ? "。" : ""),
      en: (ok, fail, chapterLike, autoChapters) =>
        (fail ? `${ok} imported, ${fail} failed.` : `${ok} file(s) imported.`) +
        (chapterLike ? ` Detected ${chapterLike} chapters (file names and headings both count).` : "") +
        (autoChapters ? ` Built ${autoChapters} chapters automatically.` : ""),
      ja: (ok, fail, chapterLike, autoChapters) =>
        (fail ? `${ok} 件を取り込み、${fail} 件失敗。` : `${ok} 件のファイルを取り込みました。`) +
        (chapterLike ? ` 章 / 節を ${chapterLike} 件検出（ファイル名と本文の見出しが根拠）。` : "") +
        (autoChapters ? ` 章を ${autoChapters} 件自動で作成しました。` : ""),
    },
    // 合并清单：合并后叫什么名字
    mergeName: {
      "zh-CN": (name, note) => `合并后词条名：「${name}」（${note}，其余写法记进「别名」）`,
      "zh-TW": (name, note) => `合併後詞條名：「${name}」（${note}，其餘寫法記進「別名」）`,
      en: (name, note) => `Merged name: “${name}” (${note}; other spellings go to “Aliases”)`,
      ja: (name, note) => `統合後の項目名：「${name}」（${note}。他の表記は「別名」に記録されます）`,
    },
    // 合并清单：哪一条是关键词条
    mergeKey: {
      "zh-CN": (name, src, tail) => `关键词条（字段以它为先）：${name}${src ? "（" + src + "）" : ""}${tail}`,
      "zh-TW": (name, src, tail) => `關鍵詞條（欄位以它為先）：${name}${src ? "（" + src + "）" : ""}${tail}`,
      en: (name, src, tail) => `Main entry (its fields come first): ${name}${src ? " (" + src + ")" : ""}${tail}`,
      ja: (name, src, tail) => `主要な項目（欄位を優先）：${name}${src ? "（" + src + "）" : ""}${tail}`,
    },
    // 关键词条后面那句解释
    mergeKeyCharTail: {
      "zh-CN": () => "（它的身份 / 外貌 / 性格 / 背景 / 目标等排在最前面，被合并进来的内容接在后面，不会丢）",
      "zh-TW": () => "（它的身分 / 外貌 / 性格 / 背景 / 目標等排在最前面，被合併進來的內容接在後面，不會丟）",
      en: () => " — its role, looks, personality, background and goals stay at the front; merged-in text is appended, nothing is lost",
      ja: () => "（役割・外見・性格・経歴・目的などが先頭に残り、統合された内容は後ろに追加されます）",
    },
    mergeKeyEntryTail: {
      "zh-CN": () => "（自动优先字段更全、带关联的那条，内容不会丢）",
      "zh-TW": () => "（自動優先欄位更全、帶關聯的那條，內容不會丟）",
      en: () => " — the record with more fields and links is preferred, so nothing is lost",
      ja: () => "（欄位が多く関連のある項目を優先します。内容は失われません）",
    },
    // 合并清单：这条记录会导入哪些信息
    mergeImports: {
      "zh-CN": (txt) => "会导入这些信息：" + txt,
      "zh-TW": (txt) => "會匯入這些資訊：" + txt,
      en: (txt) => "Imports: " + txt,
      ja: (txt) => "取り込む情報：" + txt,
    },
    mergeNoExtra: {
      "zh-CN": () => "这条记录没有额外字段",
      "zh-TW": () => "這條記錄沒有額外欄位",
      en: () => "This record has no extra fields",
      ja: () => "追加の欄位はありません",
    },
    mergeAliases: {
      "zh-CN": (txt) => "别名：" + txt,
      "zh-TW": (txt) => "別名：" + txt,
      en: (txt) => "Aliases: " + txt,
      ja: (txt) => "別名：" + txt,
    },
    mergeNote: {
      "zh-CN": (txt) => "备注：" + txt,
      "zh-TW": (txt) => "備註：" + txt,
      en: (txt) => "Notes: " + txt,
      ja: (txt) => "メモ：" + txt,
    },
    mergeSubjectNote: {
      "zh-CN": () => "\n（合并后字段以它为先，其余作为补充并进来）",
      "zh-TW": () => "\n（合併後欄位以它為先，其餘作為補充併進來）",
      en: () => "\n(its fields come first after merging; the rest are appended)",
      ja: () => "\n（統合後はこの項目の欄位が優先され、残りは補足として追加されます）",
    },
    // 人物链：串起来 / 并进旧链 / 取消链接
    chainLinked: {
      "zh-CN": (n) => `已把 ${n} 个人物串成一条人物链（可撤销）`,
      "zh-TW": (n) => `已把 ${n} 個人物串成一條人物鏈（可復原）`,
      en: (n) => `Bonded ${n} characters into one chain (undoable)`,
      ja: (n) => `${n} 人を人物チェーンにつなぎました（取り消し可）`,
    },
    chainMergedInto: {
      "zh-CN": (n) => `已把勾选的人物与原有的人物链并成一条链（共 ${n} 人，可撤销）`,
      "zh-TW": (n) => `已把勾選的人物與原有的人物鏈併成一條鏈（共 ${n} 人，可復原）`,
      en: (n) => `Merged the picked characters into the existing chain (${n} in total, undoable)`,
      ja: (n) => `選択した人物を既存の人物チェーンに統合しました（合計 ${n} 人、取り消し可）`,
    },
    chainUnlinked: {
      "zh-CN": (n) => `已取消链接：${n} 个人物恢复各自独立（可撤销）`,
      "zh-TW": (n) => `已取消連結：${n} 個人物回復各自獨立（可復原）`,
      en: (n) => `Unbonded ${n} characters — each card is on its own again (undoable)`,
      ja: (n) => `${n} 人のリンクを解除しました（各自が独立に戻ります。取り消し可）`,
    },
    chainAdded: {
      "zh-CN": (name, n) => `已把「${name}」并进人物链（共 ${n} 人，可撤销）`,
      "zh-TW": (name, n) => `已把「${name}」併進人物鏈（共 ${n} 人，可復原）`,
      en: (name, n) => `Added “${name}” to the chain (${n} in total, undoable)`,
      ja: (name, n) => `「${name}」を人物チェーンに追加しました（合計 ${n} 人、取り消し可）`,
    },
    // 关系网：图例按钮的悬浮说明 / 右键菜单标题（都夹着类型名，查表查不到）
    relKindTip: {
      "zh-CN": (name) => `只看「${name}」的连线与连线两头的人物（可多选，再点一下取消）；右键可以改颜色 / 重命名 / 删除这个类型`,
      "zh-TW": (name) => `只看「${name}」的連線與連線兩頭的人物（可多選，再點一下取消）；右鍵可以改顏色 / 重新命名 / 刪除這個類型`,
      en: (name) => `Show only “${name}” links and their characters (multi-select; click again to clear). Right-click to recolour, rename or delete this type`,
      ja: (name) => `「${name}」の線と両端の人物のみ表示（複数選択可、もう一度で解除）。右クリックで色の変更 / 改名 / 削除`,
    },
    relKindMenuTitle: {
      "zh-CN": (name) => `关系类型「${name}」`,
      "zh-TW": (name) => `關係類型「${name}」`,
      en: (name) => `Relation type “${name}”`,
      ja: (name) => `関係タイプ「${name}」`,
    },
    // 雷达图顶点数量上限的悬浮说明
    radarAxisLimit: {
      "zh-CN": (n) => `最多 ${n} 个顶点`,
      "zh-TW": (n) => `最多 ${n} 個頂點`,
      en: (n) => `At most ${n} axes`,
      ja: (n) => `軸は最大 ${n} 個`,
    },
    // 「编辑条目」弹窗的抬头：按类别叫「纪年信息」「势力信息」…
    entryInfo: {
      "zh-CN": (name) => `${name}信息`,
      "zh-TW": (name) => `${name}資訊`,
      en: (name) => `${name} info`,
      ja: (name) => `${name}の情報`,
    },
    // 二维事件图：点亮 / 点灭某个事件的登场人物（这条也会出现在「撤销」按钮的悬浮里）
    matrixCastOn: {
      "zh-CN": (title, name) => `加入登场：「${title}」${name}`,
      "zh-TW": (title, name) => `加入登場：「${title}」${name}`,
      en: (title, name) => `Added ${name} to the cast of “${title}”`,
      ja: (title, name) => `「${title}」の登場人物に ${name} を追加`,
    },
    matrixCastOff: {
      "zh-CN": (title, name) => `取消登场：「${title}」${name}`,
      "zh-TW": (title, name) => `取消登場：「${title}」${name}`,
      en: (title, name) => `Removed ${name} from the cast of “${title}”`,
      ja: (title, name) => `「${title}」の登場人物から ${name} を削除`,
    },
    // 二维事件图「兼容渲染」诊断开关（用户 2026-10-20）
    matrixCompatOn: {
      "zh-CN": () => "已开启兼容渲染；重启程序后彻底关闭 GPU 加速。",
      "zh-TW": () => "已開啟相容轉譯；重新啟動程式後完全關閉 GPU 加速。",
      en: () => "Compatibility rendering on; restart to fully disable GPU acceleration.",
      ja: () => "互換描画を有効にしました。再起動後に GPU アクセラレーションを完全に無効化します。",
    },
    matrixCompatOff: {
      "zh-CN": () => "已关闭兼容渲染。",
      "zh-TW": () => "已關閉相容轉譯。",
      en: () => "Compatibility rendering off.",
      ja: () => "互換描画を無効にしました。",
    },
    // 时间线：单击时间列改这一行的时间文字（这一行的事件一起改，行位置不变）
    chronoTimeEdited: {
      "zh-CN": (n, text) => `已把 ${n} 个事件的时间改成「${text}」`,
      "zh-TW": (n, text) => `已把 ${n} 個事件的時間改成「${text}」`,
      en: (n, text) => `Set the time of ${n} event(s) to “${text}”`,
      ja: (n, text) => `${n} 件のイベントの時間を「${text}」に変更しました`,
    },
    /* ---- 隐私设置 ---- */
    privacyNovelLocked: {
      "zh-CN": (name) => `小说「${name}」已锁定`,
      "zh-TW": (name) => `小說「${name}」已鎖定`,
      en: (name) => `“${name}” is locked`,
      ja: (name) => `「${name}」はロックされています`,
    },
    privacyAskCurrentNovel: {
      "zh-CN": () => `请输入这本小说当前的密码`,
      "zh-TW": () => `請輸入這本小說目前的密碼`,
      en: () => `Enter the current password for this fiction`,
      ja: () => `この小説の現在のパスワードを入力してください`,
    },
    privacyAskCurrentWork: {
      "zh-CN": () => `请输入工作区当前的密码`,
      "zh-TW": () => `請輸入工作區目前的密碼`,
      en: () => `Enter the current password for the workspace`,
      ja: () => `ワークスペースの現在のパスワードを入力してください`,
    },
    privacyAdded: {
      "zh-CN": (who) => `已给${who}加锁`,
      "zh-TW": (who) => `已給${who}加鎖`,
      en: (who) => `Locked ${who}`,
      ja: (who) => `${who}をロックしました`,
    },
    privacyChanged: {
      "zh-CN": (who) => `已修改${who}的密码`,
      "zh-TW": (who) => `已修改${who}的密碼`,
      en: (who) => `Password updated for ${who}`,
      ja: (who) => `${who}のパスワードを変更しました`,
    },
    privacyRemoved: {
      "zh-CN": (who) => `已解除${who}的锁定`,
      "zh-TW": (who) => `已解除${who}的鎖定`,
      en: (who) => `Removed the lock from ${who}`,
      ja: (who) => `${who}のロックを解除しました`,
    },
    privacyLockOff: {
      "zh-CN": (who) => `已关闭${who}的锁定（密码留着，勾上「锁定」就能恢复）`,
      "zh-TW": (who) => `已關閉${who}的鎖定（密碼留著，勾上「鎖定」就能恢復）`,
      en: (who) => `Lock switched off for ${who} (the password is kept — tick Lock to turn it back on)`,
      ja: (who) => `${who}のロックを切りました（パスワードは残っています。「ロック」にチェックで戻せます）`,
    },
    privacyLockOn: {
      "zh-CN": (who) => `已重新打开${who}的锁定`,
      "zh-TW": (who) => `已重新開啟${who}的鎖定`,
      en: (who) => `Turned the lock back on for ${who}`,
      ja: (who) => `${who}のロックを再び有効にしました`,
    },
  };
  function uiSentence(key) {
    const row = UI_SENTENCES[key];
    if (!row) return "";
    const fn = row[uiLanguage()] || row["zh-CN"];
    if (typeof fn !== "function") return "";
    return fn.apply(null, Array.prototype.slice.call(arguments, 1));
  }
  /* 设置里「字段设置」那几句话里的名词：中文说「这一类设定」，英文得说 entries */
  const UI_FIELDSET_WHAT = {
    "zh-CN": { char: "人物", event: "事件", entry: "这一类设定" },
    "zh-TW": { char: "人物", event: "事件", entry: "這一類設定" },
    en: { char: "characters", event: "events", entry: "entries" },
    ja: { char: "人物", event: "イベント", entry: "項目" },
  };
  function uiFieldsetWhat(kind) {
    const m = UI_FIELDSET_WHAT[uiLanguage()] || UI_FIELDSET_WHAT["zh-CN"];
    return m[kind] || m.entry;
  }
  // 窗口标题＝当前语言下的品牌名 + 版本号
  function setWindowTitle() {
    try {
      const brand = uiTextFor("Adaa的小说工坊");
      const build = String(window.__APP_BUILD__ || "");
      document.title = build ? brand + " " + build : brand;
    } catch (e) {
      /* ignore */
    }
  }
  function catDefaultFields(list) {
    return list.map(catDefaultName);
  }
  function defaultCategories() {
    return [
      { id: uid(), kind: "item", name: catDefaultName("物品"), icon: "📦", color: CAT_COLORS[0], layout: "grid", fieldTemplate: catDefaultFields(["类别", "外观", "功能 / 用途", "来历"]) },
      { id: uid(), kind: "skill", name: catDefaultName("技能树"), icon: "🔧", color: CAT_COLORS[6] || CAT_COLORS[0], layout: "grid", fieldTemplate: catDefaultFields(["类型", "对象", "效果", "前置条件", "简介"]) },
      { id: uid(), kind: "term", name: catDefaultName("名词"), icon: "📖", color: CAT_COLORS[1], layout: "grid", fieldTemplate: catDefaultFields(["类型", "定义", "出处", "首次出现"]) },
      { id: uid(), kind: "place", name: catDefaultName("地点"), icon: "🗺", color: CAT_COLORS[4], layout: "grid", fieldTemplate: catDefaultFields(["类型", "位置", "归属 / 控制者", "气候 / 地貌", "重要事件", "简介"]) },
      { id: uid(), kind: "era", name: catDefaultName("纪年"), icon: "⏳", color: CAT_COLORS[2], layout: "list", fieldTemplate: catDefaultFields(["年代", "事件", "结果 / 影响"]) },
      { id: uid(), kind: "faction", name: catDefaultName("势力"), icon: "🏛", color: CAT_COLORS[3], layout: "grid", fieldTemplate: catDefaultFields(["类型", "立场", "控制区域", "领袖", "简介"]) },
      { id: uid(), kind: "gear", name: catDefaultName("装备"), icon: "⚔", color: CAT_COLORS[5] || CAT_COLORS[0], layout: "grid", fieldTemplate: catDefaultFields(["种类", "外观", "功能 / 用途", "来历"]) },
    ];
  }

  /* 「纪年 / 地点 / 势力」是文本识别专用的固定类别：
     改名 / 删除 / 换位都会让识别（时间、地点、势力归属）对不上，所以锁起来不给动。
     判断一律走 kind；老项目里没有 kind 的，按（各语言下的）默认名字反查一次。 */
  const LOCKED_CAT_KINDS = ["era", "place", "faction"];

  function catKindByName(name) {
    const n = String(name || "").trim();
    if (!n) return "";
    if (CAT_KIND_BY_NAME[n]) return CAT_KIND_BY_NAME[n];
    for (let i = 0; i < UI_LANGS.length; i++) {
      const dict = UI_DICT[UI_LANGS[i]];
      if (!dict) continue;
      for (const zh of Object.keys(CAT_KIND_BY_NAME)) {
        if (dict[zh] === n) return CAT_KIND_BY_NAME[zh];
      }
    }
    return "";
  }

  function catKind(cat) {
    if (!cat) return "";
    return String(cat.kind || "") || catKindByName(cat.name);
  }

  function findCatByKind(kind) {
    const cats = (state.settings && state.settings.categories) || [];
    return cats.find((c) => catKind(c) === kind) || null;
  }

  function catIsLocked(cat) {
    if (!cat) return false;
    return LOCKED_CAT_KINDS.indexOf(catKind(cat)) >= 0;
  }

  function catLockTip(cat) {
    return `「${catDisplayName(cat)}」是文本识别专用的固定类别，不能改名、删除或换位`;
  }

  /* 主题去金色：老项目里线路 / 分组 / 类别 / 人物的颜色是存在文件里的，
     这里在载入时把旧的金色、暖色一次性换成新配色的对应色（只做一次，颜色纯装饰）。 */
  const WARM_TO_NEW_COLOR = {
    // 最初的金色系 → 现在的学术冷调
    "#c9a25b": "#8DA0CB",
    "#d6ab61": "#A9BEE4",
    "#e0a458": "#4E669E",
    "#d89a6c": "#86A5D6",
    "#d8a86c": "#86A5D6",
    // 中间那版薄荷青 → 现在的学术冷调
    "#49bfb1": "#8DA0CB",
    "#57ccbe": "#A9BEE4",
    "#3fb3a6": "#4E669E",
    "#4cc4b6": "#8DA0CB",
    "#5aa9c9": "#86A5D6",
  };
  function migrateWarmColors() {
    if (state.colorMigrated === "sci1") return;
    const conv = (v) => {
      const k = String(v || "").trim().toLowerCase();
      return WARM_TO_NEW_COLOR[k] || v;
    };
    (state.lines || []).forEach((l) => {
      if (l) l.color = conv(l.color);
    });
    (state.groups || []).forEach((g) => {
      if (g) g.color = conv(g.color);
    });
    ((state.settings && state.settings.categories) || []).forEach((c) => {
      if (c) c.color = conv(c.color);
    });
    (state.characters || []).forEach((c) => {
      if (c) c.color = conv(c.color);
    });
    ((state.settings && state.settings.entries) || []).forEach((e) => {
      if (e && e.color) e.color = conv(e.color);
    });
    (state.relKinds || []).forEach((k) => {
      if (k) k.color = conv(k.color);
    });
    state.colorMigrated = "sci1";
  }

  // 这三个固定类别永远排在设定类别列表最前面，顺序固定：纪年 → 地点 → 势力
  function normalizeCatOrder() {
    const cats = (state.settings && state.settings.categories) || [];
    if (!Array.isArray(cats) || cats.length < 2) return;
    // 固定排在最前面的顺序：纪年 → 地点 → 势力 → 装备（其余类别保持用户自己的顺序）
    const fixed = LOCKED_CAT_KINDS.concat(["gear"]).map((k) => cats.find((c) => c && catKind(c) === k)).filter(Boolean);
    if (!fixed.length) return;
    const next = fixed.concat(cats.filter((c) => fixed.indexOf(c) < 0));
    const same = next.length === cats.length && next.every((c, i) => c === cats[i]);
    if (!same) state.settings.categories = next;
  }

  function getActiveProject() {
    return projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  }

  /* ---- IndexedDB：容量比 localStorage 大，作为工作区主存储 ---- */
  let idbPromise = null;
  function idbOpen() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
      reject(new Error("当前环境不支持 IndexedDB"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB 打开失败"));
    });
    return idbPromise;
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB 读取失败"));
    });
  }

  async function idbSet(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB 写入失败"));
    });
  }

  function projectsPayload() {
    return { projects, activeProjectId };
  }

  let idbSaveTimer = null;
  function scheduleIdbProjectsSave() {
    if (idbSaveTimer) clearTimeout(idbSaveTimer);
    idbSaveTimer = setTimeout(() => {
      idbSaveTimer = null;
      idbSet(IDB_PROJECTS_KEY, projectsPayload()).catch((e) => console.warn("IndexedDB 自动保存失败：", e));
    }, 300);
  }

  async function flushIdbProjectsSave() {
    if (idbSaveTimer) {
      clearTimeout(idbSaveTimer);
      idbSaveTimer = null;
    }
    await idbSet(IDB_PROJECTS_KEY, projectsPayload());
  }

  let localSaveTimer = null;
  function persistProjectsLocalNow() {
    try {
      // localStorage 只有几 MB：作品 + 历史快照装不下时直接跳过（数据仍然完整地存在 IndexedDB 里）
      const p = getActiveProject();
      const logBytes = p && Array.isArray(p.log) ? p.log.reduce((s, e) => s + (e.size || 0), 0) : 0;
      if (lastProjectDataSize && lastProjectDataSize + logBytes > 4 * 1024 * 1024) return false;
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projectsPayload()));
      return true;
    } catch (e) {
      console.warn("localStorage 保存失败（可能空间不足）：", e);
      return false;
    }
  }
  // 同步写（手动保存 / 需要立刻落盘的地方用）
  function persistProjectsLocal() {
    return persistProjectsLocalNow();
  }
  // 自动保存用：和 IndexedDB 一样延迟合并写，避免每次改动都同步 JSON.stringify + setItem 卡界面
  function scheduleLocalSave() {
    if (localSaveTimer) clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => {
      localSaveTimer = null;
      persistProjectsLocalNow();
    }, 300);
  }

  function loadLegacy() {
    for (const k of LEGACY_KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.characters) && Array.isArray(d.events)) return d;
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  /* 清掉「雷达说明：另见radar与radarWhy」这类给 Agent 看的内部备注（用户 2026-10-17）：
     字段里剔除、人物 / 条目备注里整行删掉。只认明确指向 radar 内部键的值，不误伤正文。 */
  function cleanInternalRadarJunk(d) {
    if (!d || typeof d !== "object") return;
    const cleanFields = (obj) => {
      if (!obj || !Array.isArray(obj.fields)) return;
      const next = stripInternalRadarFields(obj.fields);
      if (next.length !== obj.fields.length) obj.fields = next;
    };
    (d.characters || []).forEach((c) => {
      cleanFields(c);
      if (c && c.notes != null) c.notes = stripInternalRadarNoteLines(c.notes);
    });
    ((d.settings && d.settings.entries) || []).forEach((en) => {
      cleanFields(en);
      if (en && en.notes != null) en.notes = stripInternalRadarNoteLines(en.notes);
    });
    (((d.analysis && d.analysis.tasks) || [])).forEach((t) => {
      (t.results || []).forEach((r) => cleanFields(r));
    });
  }

  async function loadApp() {
    let parsed = null;
    try {
      const fromIdb = await idbGet(IDB_PROJECTS_KEY);
      if (fromIdb && Array.isArray(fromIdb.projects)) parsed = fromIdb;
    } catch (e) {
      console.warn("IndexedDB 读取失败，回退 localStorage：", e);
    }
    try {
      if (!parsed) {
        const raw = localStorage.getItem(PROJECTS_KEY);
        if (raw) parsed = JSON.parse(raw);
      }
    } catch (e) {
      /* ignore */
    }
    projects = parsed && Array.isArray(parsed.projects) ? parsed.projects : [];
    activeProjectId = parsed ? parsed.activeProjectId : null;
    projects.forEach((p) => {
      if (!Array.isArray(p.log)) p.log = [];
    });

    if (projects.length === 0) {
      const legacy = loadLegacy();
      const data = legacy || defaultState();
      const p = { id: uid(), title: uiTextFor("我的小说"), createdAt: Date.now(), updatedAt: Date.now(), data, log: [] };
      projects = [p];
      activeProjectId = p.id;
    }
    if (!projects.find((p) => p.id === activeProjectId)) {
      activeProjectId = projects[0].id;
    }
    state = getActiveProject().data;
    selectedTaskId = null;
    ensureData();
    /* 老存档 / 老结果里可能残留「雷达说明：另见radar与radarWhy」这类给程序看的备注
       （用户 2026-10-17 要求清掉）：载入时从人物卡 / 条目卡 / 分析结果的字段里剔除，
       人物 / 条目备注里的整行也删掉。运行时新写回的那几处也会过滤，这里只是清历史。 */
    projects.forEach((p) => {
      try {
        if (p && p.data) cleanInternalRadarJunk(p.data);
      } catch (e) {
        /* ignore */
      }
    });
    saveState(); // 把一次性的数据迁移（例如结果顺序号）落盘
    // 第一次迁移 / 旧 localStorage 数据：立刻补写一份到 IndexedDB
    flushIdbProjectsSave().catch((e) => console.warn("IndexedDB 初始化保存失败：", e));
    resetUndoHistory();
  }

  let stateDataRev = 0;
  let autoSaveDirty = false; // 有改动还没进历史版本

  // 批量改动（例如「填入设定档案」连着一口气新建几十个人物）中间不会调用 saveState()，
  // 而 lookupIndexes / charNamesOverlap 这些缓存都是按 stateDataRev 失效的。
  // 数据改完手动撞一下版本号，免得后面 getChar() 读到过期索引
  // （合并弹窗曾经因此什么都列不出来，看着就像「静默合并」）。
  function bumpStateRev() {
    stateDataRev++;
  }

  function saveState(opts) {
    normalizeGroupOrder(); // 「龙套」始终排在最后
    pruneCharChains(); // 人物链里被删掉 / 合并掉的成员：不足两人的链顺手散掉
    stateDataRev++;
    const p = getActiveProject();
    if (p) p.updatedAt = Date.now();
    autoSaveDirty = true;
    autoLogSnapshot();
    scheduleLocalSave();
    scheduleIdbProjectsSave();
    /* opts.noUndo：批量分析中途落盘但不单独记一步（整轮分析只留开头那一步）；
       opts.forceUndo：开头没有内容变化也强行记一步（「分析结果」整体可一次撤销）。 */
    if (!(opts && opts.noUndo)) recordUndoStep(!!(opts && opts.forceUndo));
  }

  // 每个小说保存历史版本（数据快照），用于版本回退
  function logSnapshot(label, force) {
    const p = getActiveProject();
    if (!p) return;
    if (!Array.isArray(p.log)) p.log = [];
    const data = JSON.stringify(p.data);
    lastProjectDataSize = data.length;
    const last = p.log[p.log.length - 1];
    if (!force && last && JSON.stringify(last.data) === data) return; // 内容没变就不重复记录
    const entry = { id: uid(), time: Date.now(), label: label || "自动保存", data: JSON.parse(data), size: data.length };
    p.log.push(entry);
    // 最多留 HISTORY_MAX 版，超了就把最早的那版丢掉
    if (p.log.length > HISTORY_MAX) {
      const dropped = p.log.slice(0, p.log.length - HISTORY_MAX);
      p.log = p.log.slice(-HISTORY_MAX);
      dropHistoryMirror(dropped.map((x) => x.id)); // 被挤掉的那版，磁盘上的镜像也一起删
    }
    // 「设置 → 路径」里指定了历史版本文件夹：顺手在那里也留一份
    mirrorHistoryToDisk(p, entry);
  }

  const HISTORY_MAX = 10;
  let lastProjectDataSize = 0;
  let suppressAutoSnapshot = false;

  // 自动保存（历史版本快照）的开关与间隔（单位：分钟）：在「设置 → 历史版本」里改，存在本地
  const AUTOSAVE_KEY = "fiction_gui_autosave_v1";
  const AUTOSAVE_DEF = { enabled: true, minutes: 30 };
  const AUTOSAVE_MIN_MINUTES = 1;
  const AUTOSAVE_MAX_MINUTES = 1440;
  let autoSaveOpts = { enabled: AUTOSAVE_DEF.enabled, minutes: AUTOSAVE_DEF.minutes };

  function clampAutoSaveMinutes(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < AUTOSAVE_MIN_MINUTES) return AUTOSAVE_DEF.minutes;
    return Math.min(AUTOSAVE_MAX_MINUTES, n);
  }

  function loadAutoSaveOpts() {
    try {
      const o = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "{}") || {};
      // 兼容上一版按「秒」存的旧设置
      const legacySec = Number(o.seconds);
      autoSaveOpts = {
        enabled: o.enabled === undefined ? AUTOSAVE_DEF.enabled : !!o.enabled,
        minutes:
          o.minutes !== undefined
            ? clampAutoSaveMinutes(o.minutes)
            : Number.isFinite(legacySec) && legacySec > 0
            ? clampAutoSaveMinutes(Math.max(1, Math.round(legacySec / 60)))
            : AUTOSAVE_DEF.minutes,
      };
    } catch (e) {
      autoSaveOpts = { enabled: AUTOSAVE_DEF.enabled, minutes: AUTOSAVE_DEF.minutes };
    }
    return autoSaveOpts;
  }

  function setAutoSaveOpts(patch) {
    autoSaveOpts = Object.assign({}, autoSaveOpts, patch || {});
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autoSaveOpts));
    } catch (e) {
      /* ignore */
    }
    syncAutoSaveUi();
    return autoSaveOpts;
  }

  function syncAutoSaveUi() {
    const cb = $("#autosave-enabled");
    if (cb) cb.checked = !!autoSaveOpts.enabled;
    const num = $("#autosave-interval");
    if (num) {
      num.value = String(autoSaveOpts.minutes);
      num.disabled = !autoSaveOpts.enabled;
    }
    const hint = $("#autosave-hint");
    if (hint) {
      hint.textContent = autoSaveOpts.enabled
        ? `开着：改动后最多每 ${autoSaveOpts.minutes} 分钟留一版存档。`
        : "已关闭：只有点「保存当前版本」才会留档。";
    }
  }

  function autoLogSnapshot() {
    const p = getActiveProject();
    if (!p) return;
    if (suppressAutoSnapshot) return; // 「清空所有历史版本」之后不要马上又补一版
    if (!autoSaveOpts.enabled) return; // 用户关了自动保存
    const last = p.log && p.log.length ? p.log[p.log.length - 1] : null;
    const gapMs = Math.max(AUTOSAVE_MIN_MINUTES, Number(autoSaveOpts.minutes) || AUTOSAVE_DEF.minutes) * 60 * 1000;
    if (last && Date.now() - last.time < gapMs) return; // 没到间隔就跳过
    autoSaveDirty = false;
    logSnapshot("自动保存");
  }

  /* ================= 设置 → 路径：导入 / 导出 / 历史版本的默认位置 =================
     浏览器不让网页直接往任意磁盘路径静默写文件，能做的只有两件事：
     ① 把系统「打开 / 保存」对话框的初始位置指到你选的文件夹（导入、导出用）；
     ② 拿到「文件夹授权」句柄之后静默往里写（历史版本用）。
     所以这里存一份偏好（well-known 名字或 custom），文件夹句柄另外存进 IndexedDB。 */
  const PATHS_KEY = "fiction_gui_paths_v1";
  // 隐私设置里「工作区」那把锁（跟程序走，不跟小说走）
  const WS_PRIVACY_KEY = "fiction_gui_workspace_privacy_v1";
  const PATHS_DEF = {
    importDir: "",
    exportDir: "",
    historyDir: "",
    exportName: "{Name}",
    historyFiles: {},
  };
  const PATH_KINDS = ["import", "export", "history"];
  const PATH_WELL_KNOWN = { downloads: "下载", desktop: "桌面", documents: "文档" };
  const BROWSER_PATH_DEFAULT = { import: "文档", export: "output", history: "history" };
  let pathPrefs = Object.assign({}, PATHS_DEF);
  const pathHandles = { import: null, export: null, history: null };

  // 打包后的 Electron 会通过 preload 暴露文件读写与默认路径；浏览器里没有就为 null
  function nativeApp() {
    return typeof window !== "undefined" && window.appNative && window.appNative.isElectron ? window.appNative : null;
  }

  function nativeDefaultPaths() {
    const n = nativeApp();
    if (!n || typeof n.getDefaultPaths !== "function") return null;
    try {
      const d = n.getDefaultPaths();
      return d && typeof d === "object" ? d : null;
    } catch (e) {
      return null;
    }
  }

  // 安装向导里选好的导出 / 历史版本路径与语言（只有打包版有）
  function installPrefsFromInstaller() {
    const n = nativeApp();
    if (!n || typeof n.getInstallPrefs !== "function") return {};
    try {
      const p = n.getInstallPrefs();
      return p && typeof p === "object" ? p : {};
    } catch (e) {
      return {};
    }
  }

  function isAbsoluteNativePath(s) {
    const t = String(s || "").trim();
    return /^[A-Za-z]:[\\/]/.test(t) || /^\\\\/.test(t) || /^\//.test(t);
  }

  // Agent 请求统一入口：打包后走主进程 net.fetch（绕过 file:// 的 CORS 限制），浏览器里退回普通 fetch。
  function agentFetch(url, opts, timeoutMs) {
    const n = nativeApp();
    if (!n || typeof n.agentFetch !== "function") return fetch(url, opts);
    return n
      .agentFetch({
        url: String(url || ""),
        method: (opts && opts.method) || "GET",
        headers: (opts && opts.headers) || {},
        body: opts && opts.body,
        timeoutMs: timeoutMs || 300000,
      })
      .then((r) => {
        const rawHeaders = (r && r.headers) || {};
        return {
          ok: !!(r && r.status >= 200 && r.status < 300),
          status: (r && r.status) || 0,
          statusText: (r && r.statusText) || "",
          headers: {
            get(key) {
              const lk = String(key || "").toLowerCase();
              return Object.keys(rawHeaders)
                .filter((k) => k.toLowerCase() === lk)
                .map((k) => rawHeaders[k])
                .join(", ") || null;
            },
          },
          text: async () => String((r && r.body == null ? "" : r.body) || ""),
        };
      });
  }

  function loadPathPrefs() {
    try {
      const o = JSON.parse(localStorage.getItem(PATHS_KEY) || "{}");
      pathPrefs = Object.assign({}, PATHS_DEF, o && typeof o === "object" ? o : {});
    } catch (e) {
      pathPrefs = Object.assign({}, PATHS_DEF);
    }
    // 打包版：安装向导里让用户选好的导出 / 历史版本路径与语言（装一次用一辈子，
    // 只有重装 / 换版本后安装向导里的选择变了才重新生效；用户自己在设置里改过的值不覆盖）。
    if (nativeApp()) {
      const ins = installPrefsFromInstaller();
      const sig = JSON.stringify([ins.exportDir || "", ins.historyDir || "", ins.language || ""]);
      const applied = pathPrefs.__installApplied && typeof pathPrefs.__installApplied === "object" ? pathPrefs.__installApplied : null;
      // 老版本只存过一个 true 标记：那也算「装过」，别再拿安装向导的值覆盖用户改过的设置
      const hadApplied = "__installApplied" in pathPrefs || "__installSeen" in pathPrefs;
      if (sig !== '["","",""]' && sig !== String(pathPrefs.__installSeen || "")) {
        // 第一次跑 / 还没设置过 → 用安装时选的；还留着上次安装写的值 → 跟着新选择走；用户改过 → 保留
        const pick = (cur, oldVal, val) => {
          const c = String(cur == null ? "" : cur).trim();
          if (!val) return c;
          if (!c || !hadApplied) return val;
          if (oldVal && c === String(oldVal)) return val;
          return c;
        };
        pathPrefs.exportDir = pick(pathPrefs.exportDir, applied && applied.exportDir, ins.exportDir);
        pathPrefs.historyDir = pick(pathPrefs.historyDir, applied && applied.historyDir, ins.historyDir);
        if (ins.language && !localStorage.getItem(UI_LANG_CHOSEN_KEY)) setUiLanguage(ins.language);
        pathPrefs.__installApplied = { exportDir: ins.exportDir || "", historyDir: ins.historyDir || "", language: ins.language || "" };
        pathPrefs.__installSeen = sig;
        savePathPrefs();
      }
    }
    if (!pathPrefs.historyFiles || typeof pathPrefs.historyFiles !== "object") pathPrefs.historyFiles = {};
    if (!String(pathPrefs.exportName || "").trim()) pathPrefs.exportName = PATHS_DEF.exportName;
    // 导出文件名规则：只把旧版中文占位符换成等价的英文占位符，保留用户有没有日期的选择。
    if (String(pathPrefs.exportName || "").trim() === "{小说名}_{日期}") {
      pathPrefs.exportName = "{Name}_{Date}";
      savePathPrefs();
    }
    // 打包后默认位置是真实路径：导入＝文档；导出＝文档\fiction_GUI\output；历史＝文档\fiction_GUI\history。
    // 旧的「documents / exe-output / exe-history / custom」这类占位值直接迁移成实际路径。
    if (nativeApp()) {
      const defs = nativeDefaultPaths() || {};
      const keyMap = { import: "documents", export: "output", history: "history" };
      const exeKeyMap = { export: "exeOutput", history: "exeHistory" };
      let changed = false;
      PATH_KINDS.forEach((kind) => {
        const cur = String(pathPrefs[kind + "Dir"] || "").trim();
        const want = String(defs[keyMap[kind]] || "");
        if (!isAbsoluteNativePath(cur)) {
          pathPrefs[kind + "Dir"] = want;
          changed = true;
          return;
        }
        // 早期版本把导出 / 历史默认写在安装目录下（装到 Program Files 时那个位置写不进去，
        // 旧版会直接报 EPERM）。现在默认改到「文档\fiction_GUI」：老默认值一并挪过去。
        const legacy = exeKeyMap[kind] ? String(defs[exeKeyMap[kind]] || "").trim() : "";
        if (legacy && want && cur.toLowerCase() === legacy.toLowerCase() && want.toLowerCase() !== legacy.toLowerCase()) {
          pathPrefs[kind + "Dir"] = want;
          changed = true;
        }
      });
      if (changed) savePathPrefs();
    }
    return pathPrefs;
  }

  function savePathPrefs() {
    try {
      localStorage.setItem(PATHS_KEY, JSON.stringify(pathPrefs));
    } catch (e) {
      /* ignore */
    }
    // 打包后：把「当前导出 / 历史版本目录」写给主进程存一份（卸载提示要显示这两个位置）
    const n = nativeApp();
    if (n && typeof n.savePathHint === "function") {
      try {
        n.savePathHint(String(pathPrefs.exportDir || ""), String(pathPrefs.historyDir || ""));
      } catch (e) {
        /* 存不上不影响任何功能 */
      }
    }
  }

  async function loadPathHandles() {
    for (const k of PATH_KINDS) {
      try {
        const h = await idbGet("path_dir_" + k);
        if (h && typeof h.getFileHandle === "function") pathHandles[k] = h;
      } catch (e) {
        /* 句柄读不出来不影响其它功能 */
      }
    }
  }

  function fsaSaveSupported() {
    return typeof window.showSaveFilePicker === "function";
  }
  function fsaOpenSupported() {
    return typeof window.showOpenFilePicker === "function";
  }
  // 句柄的权限：浏览器可能重启后要重新授权，这里按需问一次
  async function ensureDirPermission(handle, mode) {
    if (!handle) return false;
    try {
      if (typeof handle.queryPermission !== "function") return true;
      let st = await handle.queryPermission({ mode });
      if (st === "granted") return true;
      if (typeof handle.requestPermission === "function") st = await handle.requestPermission({ mode });
      return st === "granted";
    } catch (e) {
      return false;
    }
  }

  // 拼一个原生绝对路径（渲染进程里没有 Node 的 path 模块，这里做最小实现）
  function joinNativePath(dir, name) {
    const d = String(dir || "").replace(/[\\/]+$/, "");
    return d ? `${d}\\${String(name || "")}` : String(name || "");
  }

  // 给 showOpenFilePicker / showSaveFilePicker 的 startIn：well-known 名字直接用，自定义要查授权
  async function pathStartIn(kind) {
    const pref = pathPrefs[kind + "Dir"];
    if (!pref) return undefined;
    if (pref === "custom") {
      const h = pathHandles[kind];
      if (!h) return undefined;
      const ok = await ensureDirPermission(h, kind === "history" ? "readwrite" : "read");
      return ok ? h : undefined;
    }
    if (PATH_WELL_KNOWN[pref]) return pref;
    const cn = Object.keys(PATH_WELL_KNOWN).find((k) => PATH_WELL_KNOWN[k] === pref);
    return cn || undefined;
  }

  /* ---- 导出文件名规则 ---- */
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function safeFileName(s, fallback) {
    const t = String(s == null ? "" : s)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return t || fallback || "未命名";
  }

  function exportNameTokens(title) {
    const d = new Date();
    const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const hm = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    return {
      "{小说名}": safeFileName(title, "小说"),
      "{书名}": safeFileName(title, "小说"),
      "{标题}": safeFileName(title, "小说"),
      "{日期}": day,
      "{时间}": hm,
      "{日期时间}": `${day}_${hm}`,
      "{时间戳}": String(Math.floor(d.getTime() / 1000)),
      // 英文写法（默认规则用的就是它；中文写法照样认，老设置不用改）
      "{Name}": safeFileName(title, "小说"),
      "{Title}": safeFileName(title, "小说"),
      "{Date}": day,
      "{Time}": hm,
      "{DateTime}": `${day}_${hm}`,
      "{Timestamp}": String(Math.floor(d.getTime() / 1000)),
    };
  }

  function exportFileBaseName(title) {
    const tokens = exportNameTokens(title);
    const rule = String(pathPrefs.exportName || "").trim() || PATHS_DEF.exportName;
    let out = rule;
    Object.keys(tokens).forEach((k) => {
      out = out.split(k).join(tokens[k]);
    });
    out = safeFileName(out, "").replace(/\.json$/i, "");
    if (!out) out = `${tokens["{Name}"]}_${tokens["{Date}"]}`;
    return out;
  }

  function exportFileNameOf(title) {
    return exportFileBaseName(title) + ".json";
  }

  /* ---- 往文件夹句柄里写 / 删 ---- */
  async function writeTextToFolder(handle, name, text) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  async function deleteFileFromFolder(handle, name) {
    try {
      await handle.removeEntry(name);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---- 历史版本的磁盘镜像 ---- */
  function historyFileNameOf(title, entry) {
    const d = new Date(entry && entry.time ? entry.time : Date.now());
    const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const label = safeFileName((entry && entry.label) || "自动保存", "自动保存");
    return `${safeFileName(title, "小说")}_版本_${stamp}_${label}.json`;
  }

  function historySnapshotText(p, entry) {
    return JSON.stringify(
      {
        app: "fiction-gui",
        version: 2,
        kind: "history-snapshot",
        title: (p && p.title) || uiTextFor("我的小说"),
        savedAt: entry && entry.time,
        label: (entry && entry.label) || "",
        data: entry && entry.data,
      },
      null,
      2
    );
  }

  // 存一版历史时，顺手在「设置 → 路径」指定的文件夹里也留一份（没设文件夹就不写）
  function mirrorHistoryToDisk(p, entry) {
    if (!pathPrefs.historyDir || !entry || !entry.id) return;
    // 打包后默认直接写到「设置 → 路径」里填的 history 目录
    if (nativeApp()) {
      const name = historyFileNameOf(p.title, entry);
      nativeApp()
        .writeFileAbs(joinNativePath(pathPrefs.historyDir, name), historySnapshotText(p, entry))
        .then(() => {
          pathPrefs.historyFiles[entry.id] = name;
          const keys = Object.keys(pathPrefs.historyFiles);
          if (keys.length > 80) keys.slice(0, keys.length - 80).forEach((k) => delete pathPrefs.historyFiles[k]);
          savePathPrefs();
        })
        .catch((e) => console.warn("历史版本写入磁盘失败：", e));
      return;
    }
    ensureDirPermission(pathHandles.history, "readwrite")
      .then((ok) => {
        if (!ok) return null;
        const name = historyFileNameOf(p.title, entry);
        return writeTextToFolder(pathHandles.history, name, historySnapshotText(p, entry)).then(() => {
          pathPrefs.historyFiles[entry.id] = name;
          const keys = Object.keys(pathPrefs.historyFiles);
          if (keys.length > 80) keys.slice(0, keys.length - 80).forEach((k) => delete pathPrefs.historyFiles[k]);
          savePathPrefs();
        });
      })
      .catch((e) => console.warn("历史版本写入文件夹失败：", e));
  }

  function dropHistoryMirror(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    const names = list.map((id) => pathPrefs.historyFiles[id]).filter(Boolean);
    if (!names.length) return;
    list.forEach((id) => delete pathPrefs.historyFiles[id]);
    savePathPrefs();
    if (nativeApp()) {
      Promise.all(names.map((n) => nativeApp().deleteFileAbs(joinNativePath(pathPrefs.historyDir, n)))).catch(() => {});
      return;
    }
    ensureDirPermission(pathHandles.history, "readwrite")
      .then((ok) => {
        if (!ok) return null;
        return Promise.all(names.map((n) => deleteFileFromFolder(pathHandles.history, n)));
      })
      .catch(() => {});
  }

  function uiStatePayload() {
    return {
      projectId: activeProjectId,
      tab: currentTab,
      categoryId: selectedCategoryId,
      taskId: selectedTaskId,
      pane: lastPaneTag,
      pedigreeId: typeof pedActiveChartId === "string" ? pedActiveChartId : "",
    };
  }

  async function saveUiState() {
    const ui = uiStatePayload();
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify(ui));
    } catch (e) {
      /* localStorage 存不上不影响主数据保存 */
    }
    try {
      await idbSet(IDB_UI_KEY, ui);
    } catch (e) {
      console.warn("界面状态写入 IndexedDB 失败：", e);
    }
  }

  async function restoreUiStateAndTab() {
    let ui = null;
    try {
      ui = await idbGet(IDB_UI_KEY);
    } catch (e) {
      ui = null;
    }
    try {
      if (!ui) ui = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null");
    } catch (e) {
      if (!ui) ui = null;
    }
    if (!ui || ui.projectId !== activeProjectId) return;
    if (ui.categoryId && getCat(ui.categoryId)) selectedCategoryId = ui.categoryId;
    if (ui.taskId && (state.analysis.tasks || []).some((t) => t.id === ui.taskId)) selectedTaskId = ui.taskId;
    /* 系谱：上次打开的是哪张图（界面状态，存在数据里的那张已经在 pedCharts 里搬过） */
    if (ui.pedigreeId && typeof pedActiveChartId === "string") pedActiveChartId = ui.pedigreeId;
    if (ui.pane) lastPaneTag = ui.pane;
    /* 「上次在哪个界面」的合法性**跟着页面走**：真有 #view-<tab> 这个界面才恢复它。
       以前这里手写了一个数组，里面漏了 radar —— 在「雷达分析」里刷新 / 重开就会掉回事件轴
       （2026-10-16 修；以后再加子页面也不用回来改这里）。 */
    const knownTab = !!(ui.tab && document.getElementById("view-" + ui.tab));
    switchTab(knownTab ? ui.tab : "timeline");
  }

  async function saveWorkspaceNow() {
    try {
      if (typeof novelBeforeLeave === "function") await novelBeforeLeave();
      logSnapshot("手动保存", true);
      saveState(); // 把刚写入的「手动保存」日志一起落盘
      const localOk = persistProjectsLocal();
      let idbOk = false;
      try {
        await flushIdbProjectsSave();
        idbOk = true;
      } catch (e) {
        console.warn("IndexedDB 手动保存失败：", e);
      }
    if (!localOk && !idbOk) throw new Error("本地存储写入失败（可能空间不足）");
      await saveUiState();
      uiAlert("已保存当前工作区。");
    } catch (e) {
      console.warn(e);
      uiAlert("保存失败：" + (e && e.message ? e.message : e));
    }
  }

