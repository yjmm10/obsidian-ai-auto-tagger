import type { ProviderId } from "./models";

export interface AISettings {
  /** 厂商（OpenAI / Anthropic / Google / 智谱 / DeepSeek / Ollama …），见 src/models.ts */
  provider: ProviderId;
  /** Base URL。留空时自动使用厂商默认值（Ollama 为本地地址，anthropic/google 留空走官方） */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  /** 核采样概率（0-1），与 temperature 配合控制多样性 */
  topP: number;
  maxTokens: number;
  /** 单次请求超时（毫秒） */
  requestTimeout: number;
  /** 系统提示词（system prompt）。留空时使用插件内置的优化提示词。 */
  systemPrompt: string;
  /** @deprecated 旧版自定义 system 提示前缀，已合并进 systemPrompt。保留以兼容旧数据。 */
  extraInstruction?: string;
}

export type FieldType = "string" | "array" | "number" | "boolean";

/**
 * 字段值的「生成模式」（决定该字段的值如何产生）：
 * - "generate"   : 直接生成。AI 按说明直接产出字段值（受 constraints 限制仍叠加）。默认。
 * - "predefined" : 使用预定标签。AI 仅从「预定义标签池」（标签文件 / 库扫描）中选择，
 *                  绝不引入池外新值；非数组字段退化为受 constraints 约束的生成。
 * - "hybrid"     : 混合。AI 自由生成新值，并始终并入「预定义标签池」中的全部标签。
 */
export type FieldMode = "generate" | "predefined" | "hybrid";

export interface FieldMapping {
  enabled: boolean;
  /** frontmatter 键名，同时作为 AI 返回的 JSON 键名 */
  name: string;
  type: FieldType;
  /** 给 AI 的字段说明，例如「3-6 个中文标签，单个标签不含空格」 */
  description: string;
  /** 允许取值限制（自由文本，如「技术, 读书, 生活」）。
   *  非空时：① 提示词约束 AI 仅从范围内选择；② 数组字段回落时过滤越界值。
   *  在 predefined 模式下与「预定义标签池」取交集；在 generate/hybrid 模式下作为额外约束。 */
  constraints: string;
  /** 字段生成模式，见 FieldMode。默认 "generate"。 */
  mode: FieldMode;
  /** 预定义标签来源（仅当 mode 为 predefined/hybrid 时生效）：
   *  file=指定标签文件；vault=扫描库内所有笔记的 tags；both=二者并集（默认）。 */
  tagSource?: TagSource;
  /** 标签文件路径（相对库根，如 tags.md）。tagSource 含 file 时生效。 */
  tagFilePath?: string;
}

/** 预定义标签池的来源：标签文件 / 自动检索库中所有笔记的 tags / 两者并集。 */
export type TagSource = "file" | "vault" | "both";

export interface PluginSettings {
  ai: AISettings;
  fields: FieldMapping[];
  /** 生效文件夹（相对库根，不含前置 /）。为空表示全库生效 */
  enabledFolders: string[];
  /** 排除文件夹，优先级高于 enabledFolders */
  excludedFolders: string[];
  /** 新建文件（含网页剪藏）自动打标 */
  autoOnCreate: boolean;
  /** 已有文件内容新增后自动打标（默认关闭） */
  autoOnModify: boolean;
  /** 自动触发防抖时间（毫秒）：停止编辑后多久发起 AI 打标，兼顾实时与省调用。 */
  debounceMs: number;
  /** 生效文件夹是否递归包含其下所有子文件夹（默认 true）。
   *  false=仅该文件夹内的直接文件生效，子文件夹中的文件不生效。 */
  recursiveScope: boolean;
  /** 已有「非空」字段的处理策略（空字段 / 被删除的字段始终实时补全，不受此策略影响）：
   *  - "skip"      : 保留现有非空值，绝不改动你喜欢的标签（最保护）。
   *  - "merge"     : 保留已有值，AI 仅补充新值（数组去重追加，标量仅当原值为空时写入）。默认。
   *  - "overwrite" : AI 全权覆盖所有目标字段。 */
  tagPolicy: "skip" | "merge" | "overwrite";
  /** 送入 AI 的正文最大字符数 */
  maxContentChars: number;
  /** 触发自动打标所需的最小正文长度（字符）。仅当「所有字段都已存在且内容不足」时挂起，
   *  等待后续写入达标；若某字段缺失 / 被删除，则不受此限制，立即实时补全。 */
  minContentChars: number;
  /** 批量处理并发数 */
  concurrency: number;
  /** 设置界面语言：zh=中文（默认），en=英文 */
  locale: "zh" | "en";
  /** 是否启用执行日志：将每次打标的过程（开始/跳过/成功/失败）写入库内日志文件。 */
  logEnabled: boolean;
  /** 日志文件路径（相对库根，如 ai-auto-tagger.log）；logEnabled 为 true 时生效。 */
  logPath: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  ai: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    topP: 1,
    maxTokens: 512,
    requestTimeout: 60000,
    systemPrompt:
      "你是一名严谨的中文笔记元数据提取助手。\n" +
      "请根据用户提供的笔记（标题 + 正文），提取下方定义的字段，并只输出一个 JSON 对象。\n\n" +
      "严格要求：\n" +
      "1. JSON 顶层键名必须与字段定义中的名称完全一致，不得增删、改写或翻译。\n" +
      "2. 每个字段的值必须严格符合其声明类型（string=字符串；array=字符串数组；number=数字；boolean=true/false）。\n" +
      "3. 若字段标注了「允许取值」，则只能从该范围内挑选，不得自创新值。\n" +
      "4. 不要输出任何解释、Markdown 代码块标记或多余文字，直接输出 JSON。",
  },
  fields: [
    {
      enabled: true,
      name: "tags",
      type: "array",
      description:
        "3-6 个简洁的中文标签，描述笔记主题；单个标签不含空格，可用连字符；如需限定词表请在「允许取值」中填写。",
      constraints: "",
      mode: "generate",
      tagSource: "both",
      tagFilePath: "tags.md",
    },
    {
      enabled: true,
      name: "summary",
      type: "string",
      description: "一句话中文摘要，不超过 40 字。",
      constraints: "",
      mode: "generate",
      tagSource: "both",
      tagFilePath: "tags.md",
    },
    {
      enabled: true,
      name: "category",
      type: "string",
      description: "笔记所属分类或领域，单个词。",
      constraints: "",
      mode: "generate",
      tagSource: "both",
      tagFilePath: "tags.md",
    },
  ],
  enabledFolders: [],
  excludedFolders: [],
  autoOnCreate: true,
  autoOnModify: true,
  debounceMs: 2000,
  recursiveScope: true,
  tagPolicy: "merge",
  maxContentChars: 1000,
  minContentChars: 300,
  concurrency: 5,
  locale: "zh",
  logEnabled: false,
  logPath: "ai-auto-tagger.log",
};
