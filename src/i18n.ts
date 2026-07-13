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
  tabTagLabel: "🏷 AI 打标签",
  tabTagDesc: "核心功能：定义提取字段、生效范围、触发与写入行为。",
  tabAiLabel: "⚙ AI 配置",
  tabAiDesc: "选择厂商、模型、密钥与调用参数，并测试连接。",
  langName: "语言",

  // ---------- AI 配置 ----------
  aiCardTitle: "AI 模型",
  aiCardSub: "选择厂商、模型、API Key 与调用参数，然后测试连接。",
  providerName: "厂商",
  providerDesc:
    "选择 AI 服务商；OpenAI 兼容类厂商（含国内厂商与本地 Ollama）共用同一套接口。",
  apiKeyName: "API Key",
  apiKeyDescReq: "鉴权令牌，仅保存在本地。",
  apiKeyDescNoKey: "该厂商（本地模型）无需 Key。",
  apiKeyPhReq: "sk-... / 你的密钥",
  apiKeyPhNoKey: "（本地模型无需）",
  baseUrlName: "Base URL",
  baseUrlDescOpenai:
    "OpenAI 兼容接口地址；已自动填入厂商默认，可改（如 coding 套餐需改路径）。",
  baseUrlDescOther: "anthropic / google 一般留空走官方；如需代理可填。",
  baseUrlPh: "（留空走官方）",
  modelName: "模型",
  modelDesc:
    "从内置清单选择，或选「自定义模型…」手动输入（如你的私有/微调模型）。",
  customModelLabel: "自定义模型…",
  customModelName: "自定义模型名",
  customModelDesc: "填写传给 API 的模型标识，例如 glm-5.2、my-finetune-01。",
  tempName: "温度 (temperature)",
  tempDesc: "0 更确定，1 更发散。标注任务建议 0.2–0.4。",
  topPName: "核采样 (top_p)",
  topPDesc: "0–1，与温度配合控制多样性；一般 0.9–1。",
  maxTokensName: "最大输出 token",
  maxTokensDesc: "单次返回上限，影响可写字段数量与长度。",
  timeoutName: "请求超时（毫秒）",
  timeoutDesc: "超时未响应则放弃，避免卡死。",
  resetParams: "重置参数",
  resetParamsNotice: "AI Tagger：已重置模型参数",
  sysPromptName: "自定义 system 提示前缀",
  sysPromptDesc: "追加在字段说明前的额外指令，用于约束输出风格/语言等。",
  testConn: "测试连接",
  testing: "测试中…",
  testOk: "连接成功 ✓",
  testFail: "连接失败 ✗",
  testFailNotice: "AI Tagger：连接失败 ✗",

  // ---------- 提取字段 ----------
  fieldCardTitle: "提取字段",
  fieldCardSub:
    "AI 将按下列字段返回 JSON 并写入笔记 frontmatter。键名即 JSON 键名（如 tags / summary / category）。",
  restoreFields: "恢复默认字段",
  restoreFieldsNotice: "AI Tagger：已恢复默认字段",
  addField: "+ 添加字段",
  unnamed: "未命名字段",
  fEnabledName: "启用",
  fEnabledDesc: "关闭则该字段不参与本次提取与写入。",
  fNameName: "字段名",
  fNameDesc: "frontmatter 键名，亦为返回 JSON 的键名。",
  fTypeName: "类型",
  fTypeDesc: "决定写入 frontmatter 的值类型。",
  fDescName: "说明",
  fDescDesc: "描述该字段的含义与格式要求。",
  fConstraintsName: "允许取值",
  fConstraintsDesc:
    "可选。限定该字段的取值范围，如「技术, 读书, 生活」或与词表一致。AI 仅可从中选择，数组字段回落时也会过滤越界值。",
  fDelete: "删除",
  collapse: "折叠/展开该字段",
  expand: "展开该字段",

  // ---------- 生效范围 ----------
  scopeCardTitle: "生效范围",
  scopeCardSub:
    "相对库根的路径，不含前置斜杠。留空「生效文件夹」表示全库生效；排除优先于包含。",
  enabledFoldersName: "生效文件夹",
  enabledFoldersDesc:
    "输入时下方实时提示知识库中匹配的目录；方向键选择、回车或点击加入，也可手写任意路径。",
  enabledFoldersPh: "如 Inbox / Articles/Read",
  excludedFoldersPh: "如 Templates / _private",
  excludedFoldersName: "排除文件夹",
  recursiveName: "包含子文件夹（递归）",
  recursiveDesc:
    "开启：生效文件夹下所有层级的子文件夹都生效。关闭：仅该文件夹内的直接文件生效，子文件夹中的文件不处理。",

  // ---------- 触发与行为 ----------
  behaviorCardTitle: "触发与行为",
  behaviorCardSub: "控制何时调用 AI、写入策略与性能参数。",
  autoCreateName: "新建文件自动打标",
  autoCreateDesc: "新建 .md 文件或网页剪藏生成文件时触发（防抖后）。",
  autoModifyName: "内容新增自动打标",
  autoModifyDesc: "已有文件内容变化后触发（默认关闭，避免频繁调用产生费用）。",
  debounceName: "防抖时间（毫秒）",
  debounceDesc: "停止输入/写入后等待多久再调用 AI。",
  tagPolicyName: "已有标签处理策略",
  tagPolicyDesc:
    "保护（默认）：笔记已有标签则整篇跳过，绝不改动你喜欢的标签；合并：保留已有值，AI 仅补充新标签/字段；覆盖：AI 全权重写所有目标字段。",
  tagPolicySkip: "保护已有（有标签则跳过）",
  tagPolicyMerge: "合并（保留原有 + AI 补充）",
  tagPolicyOverwrite: "覆盖（AI 全权）",
  maxContentName: "送入 AI 的最大字符数",
  maxContentDesc: "截断正文以控制 token 消耗与费用。",
  minContentName: "触发打标的最小正文字数",
  minContentDesc:
    "正文不足该字数视为「内容不足」：新建空文件先挂起，待你写入达标后自动触发；不对此类文件发起 AI 调用，避免浪费。",
  concurrencyName: "批量并发数",
  concurrencyDesc: "批量处理时的最大并发请求数。",

  // ---------- 恢复配置 ----------
  resetCardTitle: "恢复配置",
  resetCardSub:
    "把本插件的所有设置恢复为出厂默认值（含 AI 配置、字段、范围与行为）。此操作不可撤销。",
  restoreAll: "恢复全部默认配置",
  confirmReset: "确认恢复？再次点击将清空当前配置",
  restoreAllNotice: "AI Tagger：已恢复全部默认配置",

  // ---------- 杂项 ----------
  addBtn: "添加",
};

const en: Record<string, string> = {
  // ---------- Header / tabs ----------
  tabTagLabel: "🏷 AI Tagging",
  tabTagDesc:
    "Core feature: define extraction fields, scope, triggers and write behavior.",
  tabAiLabel: "⚙ AI Config",
  tabAiDesc:
    "Pick provider, model, API key and call params; test the connection.",
  langName: "Language",

  // ---------- AI config ----------
  aiCardTitle: "AI Model",
  aiCardSub:
    "Select provider, model, API key and call params, then test the connection.",
  providerName: "Provider",
  providerDesc:
    "Choose the AI vendor. OpenAI-compatible vendors (incl. domestic vendors and local Ollama) share one interface.",
  apiKeyName: "API Key",
  apiKeyDescReq: "Auth token, stored locally only.",
  apiKeyDescNoKey: "This vendor (local model) needs no key.",
  apiKeyPhReq: "sk-... / your key",
  apiKeyPhNoKey: "(local model: not needed)",
  baseUrlName: "Base URL",
  baseUrlDescOpenai:
    "OpenAI-compatible endpoint; pre-filled with the provider default, editable (e.g. coding plan needs a different path).",
  baseUrlDescOther:
    "anthropic / google usually leave blank for the official endpoint; fill if using a proxy.",
  baseUrlPh: "(blank = official)",
  modelName: "Model",
  modelDesc:
    "Pick from the built-in list, or choose 'Custom model…' to type one (e.g. your private/finetuned model).",
  customModelLabel: "Custom model…",
  customModelName: "Custom model name",
  customModelDesc:
    "The model id sent to the API, e.g. glm-5.2, my-finetune-01.",
  tempName: "Temperature",
  tempDesc: "0 = deterministic, 1 = diverse. For tagging, 0.2–0.4 is recommended.",
  topPName: "Top-p",
  topPDesc:
    "0–1, controls diversity together with temperature; usually 0.9–1.",
  maxTokensName: "Max output tokens",
  maxTokensDesc: "Per-call output cap; affects how many fields and how long.",
  timeoutName: "Request timeout (ms)",
  timeoutDesc: "Give up if no response in time, to avoid hanging.",
  resetParams: "Reset params",
  resetParamsNotice: "AI Tagger: model params reset",
  sysPromptName: "Custom system prompt prefix",
  sysPromptDesc:
    "Extra instruction prepended before field descriptions, to constrain output style/language.",
  testConn: "Test connection",
  testing: "Testing…",
  testOk: "Connected ✓",
  testFail: "Failed ✗",
  testFailNotice: "AI Tagger: connection failed ✗",

  // ---------- Extraction fields ----------
  fieldCardTitle: "Extraction fields",
  fieldCardSub:
    "AI returns JSON per the fields below and writes them into note frontmatter. The key is the JSON key (e.g. tags / summary / category).",
  restoreFields: "Restore default fields",
  restoreFieldsNotice: "AI Tagger: default fields restored",
  addField: "+ Add field",
  unnamed: "Unnamed field",
  fEnabledName: "Enabled",
  fEnabledDesc: "When off, this field is skipped in extraction and writing.",
  fNameName: "Field name",
  fNameDesc: "frontmatter key, also the JSON key returned.",
  fTypeName: "Type",
  fTypeDesc: "Determines the value type written to frontmatter.",
  fDescName: "Description",
  fDescDesc: "Describe the field's meaning and format requirements.",
  fConstraintsName: "Allowed values",
  fConstraintsDesc:
    "Optional. Restrict the allowed values, e.g. 'tech, reading, life'. AI may only choose from them; array fields are also filtered on fallback.",
  fDelete: "Delete",
  collapse: "Collapse / expand this field",
  expand: "Expand this field",

  // ---------- Scope ----------
  scopeCardTitle: "Scope",
  scopeCardSub:
    "Paths relative to vault root, no leading slash. Empty 'Enabled folders' = whole vault; exclusion overrides inclusion.",
  enabledFoldersName: "Enabled folders",
  enabledFoldersDesc:
    "Matching vault folders appear as you type; arrow keys + Enter or click to add; or type any path.",
  enabledFoldersPh: "e.g. Inbox / Articles/Read",
  excludedFoldersPh: "e.g. Templates / _private",
  excludedFoldersName: "Excluded folders",
  recursiveName: "Include subfolders (recursive)",
  recursiveDesc:
    "On: all subfolder levels under the enabled folder apply. Off: only direct files in that folder apply; subfolders are ignored.",

  // ---------- Triggers & behavior ----------
  behaviorCardTitle: "Triggers & behavior",
  behaviorCardSub: "Control when AI is called, write policy and performance params.",
  autoCreateName: "Auto-tag new files",
  autoCreateDesc:
    "Triggers when a new .md file is created or clipped from web (after debounce).",
  autoModifyName: "Auto-tag on content change",
  autoModifyDesc:
    "Triggers after existing file content changes (off by default to avoid frequent paid calls).",
  debounceName: "Debounce (ms)",
  debounceDesc: "Wait this long after typing/writing stops before calling AI.",
  tagPolicyName: "Existing-tag policy",
  tagPolicyDesc:
    "Protect (default): if a note already has tags, skip it entirely — never change tags you like. Merge: keep existing, AI only adds. Overwrite: AI rewrites all target fields.",
  tagPolicySkip: "Protect (skip if tagged)",
  tagPolicyMerge: "Merge (keep + AI adds)",
  tagPolicyOverwrite: "Overwrite (AI takes over)",
  maxContentName: "Max chars sent to AI",
  maxContentDesc: "Truncate the body to control token cost.",
  minContentName: "Min chars to trigger",
  minContentDesc:
    "Below this, content is 'insufficient': new empty files are deferred until you write enough; no AI call is made to avoid waste.",
  concurrencyName: "Batch concurrency",
  concurrencyDesc: "Max concurrent requests during batch processing.",

  // ---------- Reset config ----------
  resetCardTitle: "Reset config",
  resetCardSub:
    "Restore all plugin settings to factory defaults (AI config, fields, scope and behavior). This cannot be undone.",
  restoreAll: "Reset all to defaults",
  confirmReset: "Confirm reset? Click again to wipe current config",
  restoreAllNotice: "AI Tagger: all settings reset",

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
