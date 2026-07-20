/**
 * 设置界面多语言字典（中文 / 英文）。
 *
 * 用法：t(locale, key, vars?)
 *  - vars 内的占位符 {name} 会被替换为对应值。
 *  - 找不到 key 时回退到中文；中文也没有则返回 key 本身（便于排查）。
 */

export type Locale = "zh" | "en";

const zh: Record<string, string> = {
  // ---------- 头部 / 标签页 ----------
  tabTagLabel: "🏷️ AI 打标签",
  tabTagDesc: "定义字段、范围与触发",
  tabAiLabel: "⚙️ AI 配置",
  tabAiDesc: "厂商、模型、密钥与测试",
  tabAboutLabel: "👤 关于",
  tabAboutDesc: "作者与版本",
  langName: "语言",
  titleSub: "智能提取字段 · 自动整理你的笔记 🤖",

  // ---------- AI 配置 ----------
  aiCardTitle: "🤖 AI 模型",
  aiCardSub: "厂商、模型、密钥与测试连接。",
  providerName: "🏢 厂商",
  apiKeyName: "🔑 API Key",
  apiKeyDescReq: "仅本地保存",
  apiKeyDescNoKey: "本地模型无需",
  apiKeyPhReq: "sk-... / 你的密钥",
  apiKeyPhNoKey: "（本地模型无需）",
  baseUrlName: "🌐 Base URL",
  baseUrlDescOpenai: "OpenAI 兼容地址，已填默认，可改",
  baseUrlDescOther: "官方一般留空，代理再填",
  baseUrlPh: "（留空走官方）",
  modelName: "🧠 模型",
  customModelLabel: "自定义模型…",
  customModelName: "自定义模型名",
  tempName: "🌡️ 温度",
  tempDesc: "0 确定 · 1 发散",
  topPName: "🎯 核采样",
  topPDesc: "控制多样性",
  maxTokensName: "📏 最大输出 token",
  maxTokensDesc: "字段 JSON 上限",
  maxTokensNote: "仅限制生成结果，不含系统提示词",
  timeoutName: "⏱️ 请求超时（毫秒）",
  timeoutDesc: "超时放弃",
  resetParams: "🔄 重置参数",
  resetParamsNotice: "AI Tagger：已重置模型参数",
  sysPromptName: "📝 系统提示词",
  sysPromptDesc:
    "自定义 system prompt；留空时使用插件内置优化版本。字段定义会自动追加在下方。",
  sysPromptReset: "🔄 恢复默认系统提示词",
  sysPromptResetNotice: "AI Tagger：已恢复默认系统提示词",
  testConn: "🔌 测试连接",
  testing: "测试中…",
  testOk: "连接成功 ✓",
  testFail: "连接失败 ✗",
  testOkNotice: "AI Tagger：连接成功 ✓",
  testFailNotice: "AI Tagger：连接失败 ✗",

  // ---------- 提取字段 ----------
  fieldCardTitle: "🏷️ 提取字段",
  fieldCardSub:
    "AI 按字段返回 JSON 写入 frontmatter；键名即 JSON 键（如 tags / summary）。",
  fieldMasterName: "✅ 启用全部字段",
  fieldMasterDesc: "关闭后所有字段不参与提取，但配置仍保留。",
  restoreFields: "🔄 恢复默认字段",
  restoreFieldsNotice: "AI Tagger：已恢复默认字段",
  addField: "➕ 添加字段",
  unnamed: "未命名字段",
  noFields: "还没有字段，点击「➕ 添加字段」开始配置。",
  fEnabledName: "✅ 启用",
  fEnabledDesc: "参与提取与写入",
  fNameName: "🔖 字段名",
  fTypeName: "🧩 类型",
  fModeName: "🎭 生成模式",
  fModeGenerate: "直接生成",
  fModePredefined: "使用预定标签",
  fModeHybrid: "混合（生成 + 预定义）",
  fDelete: "删除",
  collapse: "折叠/展开该字段",
  expand: "展开该字段",
  fTagSourceName: "🏷️ 标签来源",
  fTagFilePathName: "📄 标签文件路径",
  fPredefinedTypeNote:
    "⚠️ 数值 / 布尔字段无标签池概念，其值由 AI 直接生成。",

  // ---------- 预定义标签池 ----------
  predCardTitle: "🏷️ 预定义标签池",
  predCardSub:
    "为字段的「使用预定标签 / 混合」模式提供词表来源：可读取一个标签文件，或自动扫描库内所有笔记的 tags，或二者并集。",
  tagSourceName: "标签来源",
  tagSourceDesc: "预定义标签取自何处。",
  tagSourceFile: "标签文件",
  tagSourceVault: "自动检索库",
  tagSourceBoth: "两者（文件 + 库）",
  tagFilePathName: "标签文件路径",
  tagFilePathDesc: "相对库根的路径，如 tags.md；每行一个标签，或 YAML `tags:` 列表。",

  // ---------- 触发说明 ----------
  triggerNote:
    "新建/剪藏、保存/更新自动触发；手动命令始终可用。字段缺失即实时补全；全部存在且正文<{min}字则暂缓。",
  realtimeNote:
    "⚡ 空/被删字段立即补全，不受字数限制；停止编辑约 {debounce} 毫秒后调用。",

  // ---------- 生效范围 ----------
  scopeCardTitle: "📁 生效范围",
  scopeCardSub: "留空=全库；排除优先于包含。",
  enabledFoldersName: "生效文件夹",
  enabledFoldersPh: "如 Inbox / Articles/Read",
  excludedFoldersPh: "如 Templates / _private",
  excludedFoldersName: "排除文件夹",
  recursiveName: "📂 包含子文件夹（递归）",

  // ---------- 触发与行为 ----------
  behaviorCardTitle: "🚀 触发与行为",
  behaviorCardSub: "何时调用 AI、写入策略与性能参数。",
  autoCreateName: "🆕 新建 / 剪藏自动打标",
  autoModifyName: "📝 保存 / 更新自动打标",
  debounceName: "⏳ 防抖时间（毫秒）",
  tagPolicyName: "🛡️ 已有标签处理策略",
  tagPolicySkip: "保护已有（有标签则跳过）",
  tagPolicyMerge: "合并（保留原有 + AI 补充）",
  tagPolicyOverwrite: "覆盖（AI 全权）",
  maxContentName: "📄 送入 AI 的最大字符数",
  minContentName: "📏 触发打标最小正文字数",
  concurrencyName: "🔀 批量并发数",

  // ---------- 执行日志 ----------
  logCardTitle: "📜 执行日志",
  logCardSub: "记录插件的打标过程到库内日志文件，便于排查问题。",
  logEnabledName: "📜 启用执行日志",
  logEnabledDesc: "开启后，每次打标（开始 / 跳过 / 成功 / 失败）都会追加写入日志文件；同时镜像到浏览器控制台。",
  logPathName: "📄 日志文件路径",
  logPathDesc: "相对库根的路径，如 ai-auto-tagger.log；日志以追加方式写入，文件超过 1MB 自动轮转。",

  // ---------- 恢复配置 ----------
  resetCardTitle: "⚠️ 恢复配置",
  resetCardSub: "恢复全部设置为出厂默认（不可撤销）。",
  restoreAll: "恢复全部默认配置",
  confirmReset: "确认恢复？再次点击将清空当前配置",
  restoreAllNotice: "AI Tagger：已恢复全部默认配置",

  // ---------- 关于 ----------
  aboutCardTitle: "👤 关于 AI Auto Tagger",
  aboutCardSub: "作者、版本与感谢支持。",
  aboutVersion: "🔖 版本：v{version}",
  aboutAuthor: "👤 作者：{author}",
  aboutLicense: "📜 许可证：MIT",
  aboutIntro:
    "你好！我是 lusca，AI Auto Tagger 的开发者。这个插件诞生于我对「笔记自动整理」的执念：希望把繁琐的标签、摘要和分类工作交给 AI，让知识库自己长出一副好用的骨架。如果你也觉得它帮你节省了时间，欢迎请我喝杯咖啡 ☕。",
  aboutThanks:
    "感谢每一位使用、反馈和提出建议的朋友。你们的问题和想法，让这个小工具一步步变得更顺手、更可靠。🙏",
  aboutSupport: "☕ 觉得有用？扫码请我喝杯咖啡吧：",
  aboutQrCaption: "微信支付收款码",
  aboutTagline: "让 AI 自动为你的笔记提取标签、摘要与分类 🤖",

  // ---------- 捐赠 / 支持 ----------
  donationCardTitle: "☕ 支持作者",
  donationCardSub: "如果这个插件帮你节省了时间，欢迎请我喝杯咖啡 ☕：微信扫码，或点击下方链接。",
  donationWechatCaption: "微信支付收款码",
  donationBmc: "☕ Buy Me a Coffee",
  donationAfdian: "💗 爱发电",

  // ---------- 杂项 ----------
  addBtn: "添加",
};

const en: Record<string, string> = {
  // ---------- Header / tabs ----------
  tabTagLabel: "🏷️ AI Tagging",
  tabTagDesc: "Define fields, scope and triggers",
  tabAiLabel: "⚙️ AI Config",
  tabAiDesc: "Provider, model, key and test",
  tabAboutLabel: "👤 About",
  tabAboutDesc: "Author and version",
  langName: "Language",
  titleSub: "Auto-extract fields · tidy up your notes 🤖",

  // ---------- AI config ----------
  aiCardTitle: "🤖 AI Model",
  aiCardSub: "Provider, model, key and test connection.",
  providerName: "🏢 Provider",
  apiKeyName: "🔑 API Key",
  apiKeyDescReq: "Stored locally only",
  apiKeyDescNoKey: "Local model needs no key",
  apiKeyPhReq: "sk-... / your key",
  apiKeyPhNoKey: "(local model: not needed)",
  baseUrlName: "🌐 Base URL",
  baseUrlDescOpenai: "OpenAI-compatible endpoint, pre-filled; editable",
  baseUrlDescOther: "Usually blank; fill only for a proxy",
  baseUrlPh: "(blank = official)",
  modelName: "🧠 Model",
  customModelLabel: "Custom model…",
  customModelName: "Custom model name",
  tempName: "🌡️ Temperature",
  tempDesc: "0 = strict · 1 = diverse",
  topPName: "🎯 Top-p",
  topPDesc: "Controls diversity",
  maxTokensName: "📏 Max output tokens",
  maxTokensDesc: "Generated-field JSON cap",
  maxTokensNote: "Limits output only; excludes the system prompt",
  timeoutName: "⏱️ Request timeout (ms)",
  timeoutDesc: "Give up if no response in time",
  resetParams: "🔄 Reset params",
  resetParamsNotice: "AI Tagger: model params reset",
  sysPromptName: "📝 System prompt",
  sysPromptDesc: "Blank = built-in default; field defs appended.",
  sysPromptReset: "🔄 Restore default system prompt",
  sysPromptResetNotice: "AI Tagger: default system prompt restored",
  testConn: "🔌 Test connection",
  testing: "Testing…",
  testOk: "Connected ✓",
  testFail: "Failed ✗",
  testOkNotice: "AI Tagger: connected ✓",
  testFailNotice: "AI Tagger: connection failed ✗",

  // ---------- Extraction fields ----------
  fieldCardTitle: "🏷️ Extraction fields",
  fieldCardSub:
    "AI returns JSON per the fields below and writes them into note frontmatter. The key is the JSON key (e.g. tags / summary / category).",
  fieldMasterName: "✅ Enable all fields",
  fieldMasterDesc: "When off, all fields are skipped but their config remains.",
  restoreFields: "🔄 Restore default fields",
  restoreFieldsNotice: "AI Tagger: default fields restored",
  addField: "➕ Add field",
  unnamed: "Unnamed field",
  noFields: "No fields yet. Click '➕ Add field' to get started.",
  fEnabledName: "✅ Enabled",
  fEnabledDesc: "Take part in extraction and writing",
  fNameName: "🔖 Field name",
  fTypeName: "🧩 Type",
  fModeName: "🎭 Generation mode",
  fModeGenerate: "Generate directly",
  fModePredefined: "Use predefined tags",
  fModeHybrid: "Hybrid (generate + predefined)",
  fDelete: "Delete",
  collapse: "Collapse / expand this field",
  expand: "Expand this field",
  fTagSourceName: "🏷️ Tag source",
  fTagFilePathName: "📄 Tag file path",
  fPredefinedTypeNote:
    "⚠️ Numeric / boolean fields have no tag pool; the AI generates the value directly.",

  // ---------- Predefined tag pool ----------
  predCardTitle: "🏷️ Predefined tag pool",
  predCardSub:
    "Source of the vocabulary for a field's 'Use predefined / Hybrid' mode: read a tag file, or auto-scan all notes' tags in the vault, or both.",
  tagSourceName: "Tag source",
  tagSourceDesc: "Where predefined tags come from.",
  tagSourceFile: "Tag file",
  tagSourceVault: "Scan vault",
  tagSourceBoth: "Both (file + vault)",
  tagFilePathName: "Tag file path",
  tagFilePathDesc:
    "Path relative to vault root, e.g. tags.md; one tag per line, or a YAML 'tags:' list.",

  // ---------- Trigger note ----------
  triggerNote:
    "New/clip and save/update auto-trigger; manual command always works. Missing field = real-time fill; all present and body < {min} chars = defer.",
  realtimeNote:
    "⚡ Empty/deleted fields fill immediately, no char limit; AI called ~{debounce} ms after you stop.",

  // ---------- Scope ----------
  scopeCardTitle: "📁 Scope",
  scopeCardSub: "Blank = whole vault; exclusion overrides inclusion.",
  enabledFoldersName: "Enabled folders",
  enabledFoldersPh: "e.g. Inbox / Articles/Read",
  excludedFoldersPh: "e.g. Templates / _private",
  excludedFoldersName: "Excluded folders",
  recursiveName: "📂 Include subfolders (recursive)",

  // ---------- Triggers & behavior ----------
  behaviorCardTitle: "🚀 Triggers & behavior",
  behaviorCardSub: "When AI runs, write policy and performance.",
  autoCreateName: "🆕 Auto-tag on new / clip",
  autoModifyName: "📝 Auto-tag on save / update",
  debounceName: "⏳ Debounce (ms)",
  tagPolicyName: "🛡️ Existing-tag policy",
  tagPolicySkip: "Protect (skip if tagged)",
  tagPolicyMerge: "Merge (keep + AI adds)",
  tagPolicyOverwrite: "Overwrite (AI takes over)",
  maxContentName: "📄 Max chars sent to AI",
  minContentName: "📏 Min chars to trigger",
  concurrencyName: "🔀 Batch concurrency",

  // ---------- Execution log ----------
  logCardTitle: "📜 Execution log",
  logCardSub: "Record the plugin's tagging process to a log file in the vault for troubleshooting.",
  logEnabledName: "📜 Enable execution log",
  logEnabledDesc: "When on, each tagging run (start / skip / success / failure) is appended to the log file and mirrored to the browser console.",
  logPathName: "📄 Log file path",
  logPathDesc: "Path relative to vault root, e.g. ai-auto-tagger.log; appended on each run, auto-rotated when larger than 1MB.",

  // ---------- Reset config ----------
  resetCardTitle: "⚠️ Reset config",
  resetCardSub: "Restore all settings to factory defaults (cannot be undone).",
  restoreAll: "Reset all to defaults",
  confirmReset: "Confirm reset? Click again to wipe current config",
  restoreAllNotice: "AI Tagger: all settings reset",

  // ---------- About ----------
  aboutCardTitle: "👤 About AI Auto Tagger",
  aboutCardSub: "Author, version and a way to say thanks.",
  aboutVersion: "🔖 Version: v{version}",
  aboutAuthor: "👤 Author: {author}",
  aboutLicense: "📜 License: MIT",
  aboutIntro:
    "Hi! I'm lusca, the developer of AI Auto Tagger. This plugin was born from my obsession with 'automatic note organization': let AI handle the tedious tagging, summarizing and categorizing so your knowledge base grows its own useful skeleton. If it saves you time, feel free to buy me a coffee ☕.",
  aboutThanks:
    "Thanks to everyone who uses it, reports issues and shares ideas. Your feedback makes this little tool better and more reliable.🙏",
  aboutSupport: "☕ Find it useful? Scan the QR code to buy me a coffee:",
  aboutQrCaption: "WeChat Pay QR code",
  aboutTagline: "Let AI auto-extract tags, summaries and categories for your notes 🤖",

  // ---------- Donation / Support ----------
  donationCardTitle: "☕ Support the author",
  donationCardSub: "If this plugin saves you time, feel free to buy me a coffee ☕: scan the WeChat QR code, or use the links below.",
  donationWechatCaption: "WeChat Pay QR code",
  donationBmc: "☕ Buy Me a Coffee",
  donationAfdian: "💗 Afdian",

  // ---------- Misc ----------
  addBtn: "Add",
};

export const I18N: Record<Locale, Record<string, string>> = { zh, en };

/** 取翻译文本，支持 {var} 占位替换；缺失 key 回退到中文，再回退到 key 本身。 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = I18N[locale] ?? I18N.zh;
  let s = dict[key] ?? I18N.zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
