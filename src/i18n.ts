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
  tabTagDesc: "核心功能：定义提取字段、生效范围、触发与写入行为。",
  tabAiLabel: "⚙️ AI 配置",
  tabAiDesc: "选择厂商、模型、密钥与调用参数，并测试连接。",
  tabAboutLabel: "👤 关于",
  tabAboutDesc: "作者介绍、版本信息以及一杯咖啡的支持方式。",
  langName: "语言",

  // ---------- AI 配置 ----------
  aiCardTitle: "🤖 AI 模型",
  aiCardSub: "选择厂商、模型、API Key 与调用参数，然后测试连接。",
  providerName: "🏢 厂商",
  providerDesc:
    "选择 AI 服务商；OpenAI 兼容类厂商（含国内厂商与本地 Ollama）共用同一套接口。",
  apiKeyName: "🔑 API Key",
  apiKeyDescReq: "鉴权令牌，仅保存在本地。",
  apiKeyDescNoKey: "该厂商（本地模型）无需 Key。",
  apiKeyPhReq: "sk-... / 你的密钥",
  apiKeyPhNoKey: "（本地模型无需）",
  baseUrlName: "🌐 Base URL",
  baseUrlDescOpenai:
    "OpenAI 兼容接口地址；已自动填入厂商默认，可改（如 coding 套餐需改路径）。",
  baseUrlDescOther: "anthropic / google 一般留空走官方；如需代理可填。",
  baseUrlPh: "（留空走官方）",
  modelName: "🧠 模型",
  modelDesc:
    "从内置清单选择，或选「自定义模型…」手动输入（如你的私有/微调模型）。",
  customModelLabel: "自定义模型…",
  customModelName: "自定义模型名",
  customModelDesc: "填写传给 API 的模型标识，例如 glm-5.2、my-finetune-01。",
  tempName: "🌡️ 温度 (temperature)",
  tempDesc: "0 更确定，1 更发散。标注任务建议 0.2–0.4。",
  topPName: "🎯 核采样 (top_p)",
  topPDesc: "0–1，与温度配合控制多样性；一般 0.9–1。",
  maxTokensName: "📏 最大输出 token",
  maxTokensDesc: "单次返回的字段 JSON 上限，系统提示词不计入该限制。",
  maxTokensNote:
    "💡 该上限只限制 AI 生成的字段结果，不包含系统提示词、标题与正文。",
  timeoutName: "⏱️ 请求超时（毫秒）",
  timeoutDesc: "超时未响应则放弃，避免卡死。",
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
  testFailNotice: "AI Tagger：连接失败 ✗",

  // ---------- 提取字段 ----------
  fieldCardTitle: "🏷️ 提取字段",
  fieldCardSub:
    "AI 将按下列字段返回 JSON 并写入笔记 frontmatter。键名即 JSON 键名（如 tags / summary / category）。",
  fieldMasterName: "✅ 启用全部字段",
  fieldMasterDesc: "关闭后所有字段不参与提取，但配置仍保留。",
  restoreFields: "🔄 恢复默认字段",
  restoreFieldsNotice: "AI Tagger：已恢复默认字段",
  addField: "➕ 添加字段",
  unnamed: "未命名字段",
  noFields: "还没有字段，点击「➕ 添加字段」开始配置。",
  fEnabledName: "✅ 启用",
  fEnabledDesc: "该字段是否参与本次提取与写入。",
  fNameName: "🔖 字段名",
  fNameDesc: "frontmatter 键名，亦为返回 JSON 的键名。",
  fTypeName: "🧩 类型",
  fTypeDesc: "决定写入 frontmatter 的值类型。",
  fDescName: "📝 说明",
  fDescDesc: "描述该字段的含义与格式要求。",
  fConstraintsName: "🎨 允许取值",
  fConstraintsDesc:
    "可选。限定该字段的取值范围，如「技术, 读书, 生活」或与词表一致。AI 仅可从中选择，数组字段回落时也会过滤越界值。",
  fModeName: "🎭 生成模式",
  fModeDesc:
    "该字段的值如何产生：直接生成=AI 自由产出；使用预定标签=仅从预定义标签池中选择；混合=AI 生成 + 始终并入预定义标签池。",
  fModeGenerate: "直接生成",
  fModePredefined: "使用预定标签",
  fModeHybrid: "混合（生成 + 预定义）",
  fDelete: "删除",
  collapse: "折叠/展开该字段",
  expand: "展开该字段",

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
    "触发说明：新建 / 网页剪藏（同属「新建自动打标」）；保存 / 更新（同属「内容变更自动打标」）；手动命令始终可用。默认自动触发，正文满 {min} 字自动更新，不足 {min} 字仅可手动触发。",

  // ---------- 生效范围 ----------
  scopeCardTitle: "📁 生效范围",
  scopeCardSub:
    "相对库根的路径，不含前置斜杠。留空「生效文件夹」表示全库生效；排除优先于包含。",
  enabledFoldersName: "生效文件夹",
  enabledFoldersDesc:
    "输入时下方实时提示知识库中匹配的目录；方向键选择、回车或点击加入，也可手写任意路径。",
  enabledFoldersPh: "如 Inbox / Articles/Read",
  excludedFoldersPh: "如 Templates / _private",
  excludedFoldersName: "排除文件夹",
  recursiveName: "📂 包含子文件夹（递归）",
  recursiveDesc:
    "开启：生效文件夹下所有层级的子文件夹都生效。关闭：仅该文件夹内的直接文件生效，子文件夹中的文件不处理。",

  // ---------- 触发与行为 ----------
  behaviorCardTitle: "🚀 触发与行为",
  behaviorCardSub: "控制何时调用 AI、写入策略与性能参数。",
  autoCreateName: "🆕 新建 / 剪藏自动打标",
  autoCreateDesc: "新建 .md 文件或网页剪藏生成文件时触发（防抖后）。默认开启。",
  autoModifyName: "📝 保存 / 更新自动打标",
  autoModifyDesc:
    "已有文件内容新增或保存后触发（防抖后）。默认开启；关闭则仅手动命令可打标。",
  debounceName: "⏳ 防抖时间（毫秒）",
  debounceDesc: "停止输入/写入后等待多久再调用 AI。",
  tagPolicyName: "🛡️ 已有标签处理策略",
  tagPolicyDesc:
    "保护（默认）：笔记已有标签则整篇跳过，绝不改动你喜欢的标签；合并：保留已有值，AI 仅补充新标签/字段；覆盖：AI 全权重写所有目标字段。",
  tagPolicySkip: "保护已有（有标签则跳过）",
  tagPolicyMerge: "合并（保留原有 + AI 补充）",
  tagPolicyOverwrite: "覆盖（AI 全权）",
  maxContentName: "📄 送入 AI 的最大字符数",
  maxContentDesc: "截断正文以控制 token 消耗与费用。",
  minContentName: "📏 触发打标的最小正文字数",
  minContentDesc:
    "正文不足该字数视为「内容不足」：新建空文件先挂起，待你写入达标后自动触发；不对此类文件发起 AI 调用，避免浪费。",
  concurrencyName: "🔀 批量并发数",
  concurrencyDesc: "批量处理时的最大并发请求数。",

  // ---------- 恢复配置 ----------
  resetCardTitle: "⚠️ 恢复配置",
  resetCardSub:
    "把本插件的所有设置恢复为出厂默认值（含 AI 配置、字段、范围与行为）。此操作不可撤销。",
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

  // ---------- 杂项 ----------
  addBtn: "添加",
};

const en: Record<string, string> = {
  // ---------- Header / tabs ----------
  tabTagLabel: "🏷️ AI Tagging",
  tabTagDesc:
    "Core feature: define extraction fields, scope, triggers and write behavior.",
  tabAiLabel: "⚙️ AI Config",
  tabAiDesc:
    "Pick provider, model, API key and call params; test the connection.",
  tabAboutLabel: "👤 About",
  tabAboutDesc: "Author, version info and a way to buy the author a coffee.",
  langName: "Language",

  // ---------- AI config ----------
  aiCardTitle: "🤖 AI Model",
  aiCardSub:
    "Select provider, model, API key and call params, then test the connection.",
  providerName: "🏢 Provider",
  providerDesc:
    "Choose the AI vendor. OpenAI-compatible vendors (incl. domestic vendors and local Ollama) share one interface.",
  apiKeyName: "🔑 API Key",
  apiKeyDescReq: "Auth token, stored locally only.",
  apiKeyDescNoKey: "This vendor (local model) needs no key.",
  apiKeyPhReq: "sk-... / your key",
  apiKeyPhNoKey: "(local model: not needed)",
  baseUrlName: "🌐 Base URL",
  baseUrlDescOpenai:
    "OpenAI-compatible endpoint; pre-filled with the provider default, editable (e.g. coding plan needs a different path).",
  baseUrlDescOther:
    "anthropic / google usually leave blank for the official endpoint; fill if using a proxy.",
  baseUrlPh: "(blank = official)",
  modelName: "🧠 Model",
  modelDesc:
    "Pick from the built-in list, or choose 'Custom model…' to type one (e.g. your private/finetuned model).",
  customModelLabel: "Custom model…",
  customModelName: "Custom model name",
  customModelDesc:
    "The model id sent to the API, e.g. glm-5.2, my-finetune-01.",
  tempName: "🌡️ Temperature",
  tempDesc: "0 = deterministic, 1 = diverse. For tagging, 0.2–0.4 is recommended.",
  topPName: "🎯 Top-p",
  topPDesc:
    "0–1, controls diversity together with temperature; usually 0.9–1.",
  maxTokensName: "📏 Max output tokens",
  maxTokensDesc: "Per-call generated-field JSON cap; system prompt is not counted.",
  maxTokensNote:
    "💡 This cap only limits the generated field JSON; it does not include the system prompt, title or body.",
  timeoutName: "⏱️ Request timeout (ms)",
  timeoutDesc: "Give up if no response in time, to avoid hanging.",
  resetParams: "🔄 Reset params",
  resetParamsNotice: "AI Tagger: model params reset",
  sysPromptName: "📝 System prompt",
  sysPromptDesc:
    "Custom system prompt; leave blank to use the built-in optimized version. Field definitions are appended automatically.",
  sysPromptReset: "🔄 Restore default system prompt",
  sysPromptResetNotice: "AI Tagger: default system prompt restored",
  testConn: "🔌 Test connection",
  testing: "Testing…",
  testOk: "Connected ✓",
  testFail: "Failed ✗",
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
  fEnabledDesc: "Whether this field takes part in extraction and writing.",
  fNameName: "🔖 Field name",
  fNameDesc: "frontmatter key, also the JSON key returned.",
  fTypeName: "🧩 Type",
  fTypeDesc: "Determines the value type written to frontmatter.",
  fDescName: "📝 Description",
  fDescDesc: "Describe the field's meaning and format requirements.",
  fConstraintsName: "🎨 Allowed values",
  fConstraintsDesc:
    "Optional. Restrict the allowed values, e.g. 'tech, reading, life'. AI may only choose from them; array fields are also filtered on fallback.",
  fModeName: "🎭 Generation mode",
  fModeDesc:
    "How this field's value is produced: Generate=AI free output; Use predefined=only pick from the predefined tag pool; Hybrid=AI generates + always merge the predefined pool.",
  fModeGenerate: "Generate directly",
  fModePredefined: "Use predefined tags",
  fModeHybrid: "Hybrid (generate + predefined)",
  fDelete: "Delete",
  collapse: "Collapse / expand this field",
  expand: "Expand this field",

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
    "Triggers: new file / web clip (both are 'Auto-tag on create'); save / update (both are 'Auto-tag on change'); the manual command is always available. Auto is on by default; notes with at least {min} chars auto-update, shorter ones can only be tagged manually.",

  // ---------- Scope ----------
  scopeCardTitle: "📁 Scope",
  scopeCardSub:
    "Paths relative to vault root, no leading slash. Empty 'Enabled folders' = whole vault; exclusion overrides inclusion.",
  enabledFoldersName: "Enabled folders",
  enabledFoldersDesc:
    "Matching vault folders appear as you type; arrow keys + Enter or click to add; or type any path.",
  enabledFoldersPh: "e.g. Inbox / Articles/Read",
  excludedFoldersPh: "e.g. Templates / _private",
  excludedFoldersName: "Excluded folders",
  recursiveName: "📂 Include subfolders (recursive)",
  recursiveDesc:
    "On: all subfolder levels under the enabled folder apply. Off: only direct files in that folder apply; subfolders are ignored.",

  // ---------- Triggers & behavior ----------
  behaviorCardTitle: "🚀 Triggers & behavior",
  behaviorCardSub: "Control when AI is called, write policy and performance params.",
  autoCreateName: "🆕 Auto-tag on new / clip",
  autoCreateDesc:
    "Triggers when a new .md file is created or clipped from web (after debounce). On by default.",
  autoModifyName: "📝 Auto-tag on save / update",
  autoModifyDesc:
    "Triggers after existing file content changes or is saved (after debounce). On by default; turn off to allow manual tagging only.",
  debounceName: "⏳ Debounce (ms)",
  debounceDesc: "Wait this long after typing/writing stops before calling AI.",
  tagPolicyName: "🛡️ Existing-tag policy",
  tagPolicyDesc:
    "Protect (default): if a note already has tags, skip it entirely — never change tags you like. Merge: keep existing, AI only adds. Overwrite: AI rewrites all target fields.",
  tagPolicySkip: "Protect (skip if tagged)",
  tagPolicyMerge: "Merge (keep + AI adds)",
  tagPolicyOverwrite: "Overwrite (AI takes over)",
  maxContentName: "📄 Max chars sent to AI",
  maxContentDesc: "Truncate the body to control token cost.",
  minContentName: "📏 Min chars to trigger",
  minContentDesc:
    "Below this, content is 'insufficient': new empty files are deferred until you write enough; no AI call is made to avoid waste.",
  concurrencyName: "🔀 Batch concurrency",
  concurrencyDesc: "Max concurrent requests during batch processing.",

  // ---------- Reset config ----------
  resetCardTitle: "⚠️ Reset config",
  resetCardSub:
    "Restore all plugin settings to factory defaults (AI config, fields, scope and behavior). This cannot be undone.",
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
