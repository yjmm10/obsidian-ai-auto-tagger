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
  /** 追加在字段说明之前的自定义 system 提示前缀 */
  extraInstruction: string;
}

export type FieldType = "string" | "array" | "number" | "boolean";

export interface FieldMapping {
  enabled: boolean;
  /** frontmatter 键名，同时作为 AI 返回的 JSON 键名 */
  name: string;
  type: FieldType;
  /** 给 AI 的字段说明，例如「3-6 个中文标签，单个标签不含空格」 */
  description: string;
}

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
  /** 自动触发防抖时间（毫秒） */
  debounceMs: number;
  /** true=覆盖已有字段，false=合并（数组去重、标量仅填空时写入） */
  overwrite: boolean;
  /** 若 frontmatter 中已存在非空 tags 则整体跳过 */
  skipIfHasTags: boolean;
  /** 送入 AI 的正文最大字符数 */
  maxContentChars: number;
  /** 批量处理并发数 */
  concurrency: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  ai: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    topP: 1,
    maxTokens: 800,
    requestTimeout: 30000,
    extraInstruction:
      "你是一名中文笔记标注助手，输出必须严谨符合给定字段的类型要求。",
  },
  fields: [
    {
      enabled: true,
      name: "tags",
      type: "array",
      description:
        "3-6 个简洁的中文标签，描述笔记主题；单个标签不含空格，可用连字符。",
    },
    {
      enabled: true,
      name: "summary",
      type: "string",
      description: "一句话中文摘要，不超过 40 字。",
    },
    {
      enabled: true,
      name: "category",
      type: "string",
      description: "笔记所属分类或领域，单个词，如「技术」「读书」「生活」。",
    },
  ],
  enabledFolders: [],
  excludedFolders: [],
  autoOnCreate: true,
  autoOnModify: false,
  debounceMs: 3000,
  overwrite: false,
  skipIfHasTags: true,
  maxContentChars: 8000,
  concurrency: 3,
};
