/**
 * 模型注册表（参考 Obsidian Copilot 的「模型表」设计）。
 *
 * 思路：
 * - 每个厂商(Provider)有默认 Base URL、获取 Key 的链接、是否需要 Key。
 * - 内置一份常用模型清单，按厂商分组，减少用户手填模型名导致的错误。
 * - 用户仍可「自定义模型」：只填模型名，Base URL 自动继承厂商默认值，可改。
 *
 * provider 在底层统一映射到 Vercel AI SDK 的三类实现：
 *   "openai-compatible" | "anthropic" | "google"
 * 国内厂商(DeepSeek/智谱/通义/豆包/…)与本地 Ollama 均走 openai-compatible。
 */

/** 底层 SDK 类型（用于 ai-client 构造模型）。 */
export type SdkProvider = "openai-compatible" | "anthropic" | "google";

/** 用户在设置里选择的厂商。 */
export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "deepseek"
  | "zhipu"
  | "qwen"
  | "doubao"
  | "moonshot"
  | "openrouter"
  | "groq"
  | "mistral";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** 映射到 Vercel AI SDK 的底层实现 */
  sdk: SdkProvider;
  /** 该厂商默认 Base URL（openai-compatible 类必填；anthropic/google 可空走官方） */
  defaultBaseUrl?: string;
  /** 获取 API Key 的官方地址 */
  apiKeyUrl?: string;
  /** 是否需要 API Key（本地 Ollama 无需） */
  requiresKey: boolean;
  /** 设置面板里的说明文字 */
  note: string;
}

export interface BuiltinModel {
  /** 传给 API 的模型名（即用户之前手填的 glm-5.2 这类字符串） */
  id: string;
  /** 设置里显示的名称 */
  label: string;
  provider: ProviderId;
  /** 该模型的能力说明 */
  description?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    requiresKey: true,
    note: "官方 API。Base URL 一般不用改。",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    sdk: "anthropic",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    requiresKey: true,
    note: "原生 Claude 接口，模型名形如 claude-3-5-sonnet-latest。",
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    sdk: "google",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    requiresKey: true,
    note: "原生 Gemini 接口，模型名形如 gemini-1.5-flash。",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (本地)",
    sdk: "openai-compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    note: "本地模型，无需 Key。需先启动 Ollama 并开启开放端口。",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    requiresKey: true,
    note: "OpenAI 兼容，模型如 deepseek-chat / deepseek-reasoner。",
  },
  zhipu: {
    id: "zhipu",
    label: "智谱 GLM",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    requiresKey: true,
    note:
      "OpenAI 兼容。标准地址如上；coding 套餐请把 Base URL 改为 .../api/coding/paas/v4。",
  },
  qwen: {
    id: "qwen",
    label: "通义千问 (阿里)",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
    requiresKey: true,
    note: "OpenAI 兼容模式地址如上，模型如 qwen-max / qwen-plus。",
  },
  doubao: {
    id: "doubao",
    label: "豆包 (字节)",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyUrl: "https://console.volcengine.com/ark",
    requiresKey: true,
    note: "火山方舟兼容地址如上，模型为 Ark 推理接入点 ID。",
  },
  moonshot: {
    id: "moonshot",
    label: "Kimi (月之暗面)",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    requiresKey: true,
    note: "OpenAI 兼容，模型如 moonshot-v1-8k/32k/128k。",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyUrl: "https://openrouter.ai/keys",
    requiresKey: true,
    note: "聚合多家开源/闭源模型，模型名带前缀如 openai/gpt-4o。",
  },
  groq: {
    id: "groq",
    label: "Groq",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyUrl: "https://console.groq.com/keys",
    requiresKey: true,
    note: "极速推理，模型如 llama-3.1-70b-versatile。",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    sdk: "openai-compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    apiKeyUrl: "https://console.mistral.ai/api-keys/",
    requiresKey: true,
    note: "模型如 mistral-large-latest。",
  },
};

/** 内置模型清单（按厂商分组，可扩展）。 */
export const BUILTIN_MODELS: BuiltinModel[] = [
  // OpenAI
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", description: "旗舰多模态" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai", description: "轻量高性价比" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", provider: "openai" },
  { id: "o1", label: "o1", provider: "openai", description: "推理增强" },
  { id: "o1-mini", label: "o1-mini", provider: "openai", description: "轻量推理" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", provider: "openai" },

  // Anthropic
  { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "claude-3-opus-latest", label: "Claude 3 Opus", provider: "anthropic" },

  // Google
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "google" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },

  // Ollama（本地）
  { id: "llama3.1", label: "Llama 3.1", provider: "ollama" },
  { id: "qwen2.5", label: "Qwen 2.5", provider: "ollama" },
  { id: "mistral", label: "Mistral", provider: "ollama" },
  { id: "deepseek-r1", label: "DeepSeek-R1", provider: "ollama" },

  // DeepSeek
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
  { id: "deepseek-coder", label: "DeepSeek Coder", provider: "deepseek" },
  { id: "deepseek-reasoner", label: "DeepSeek Reasoner", provider: "deepseek", description: "推理模型" },

  // 智谱 GLM
  { id: "glm-4-plus", label: "GLM-4-Plus", provider: "zhipu" },
  { id: "glm-4-flash", label: "GLM-4-Flash", provider: "zhipu", description: "免费/低价，适合测试" },
  { id: "glm-4-air", label: "GLM-4-Air", provider: "zhipu" },
  { id: "glm-4-airx", label: "GLM-4-AirX", provider: "zhipu" },
  { id: "glm-4", label: "GLM-4", provider: "zhipu" },
  { id: "glm-3-turbo", label: "GLM-3-Turbo", provider: "zhipu" },

  // 通义千问
  { id: "qwen-max", label: "Qwen-Max", provider: "qwen" },
  { id: "qwen-plus", label: "Qwen-Plus", provider: "qwen" },
  { id: "qwen-turbo", label: "Qwen-Turbo", provider: "qwen" },
  { id: "qwen-long", label: "Qwen-Long", provider: "qwen", description: "长上下文" },
  { id: "qwen2.5-72b-instruct", label: "Qwen2.5-72B", provider: "qwen" },

  // 豆包
  { id: "doubao-pro-32k", label: "Doubao-Pro-32k", provider: "doubao" },
  { id: "doubao-pro-128k", label: "Doubao-Pro-128k", provider: "doubao" },
  { id: "doubao-lite-32k", label: "Doubao-Lite-32k", provider: "doubao" },

  // Kimi
  { id: "moonshot-v1-8k", label: "Moonshot v1 8K", provider: "moonshot" },
  { id: "moonshot-v1-32k", label: "Moonshot v1 32K", provider: "moonshot" },
  { id: "moonshot-v1-128k", label: "Moonshot v1 128K", provider: "moonshot" },

  // OpenRouter
  { id: "openai/gpt-4o", label: "GPT-4o (via OpenRouter)", provider: "openrouter" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 (via OpenRouter)", provider: "openrouter" },

  // Groq
  { id: "llama-3.1-70b-versatile", label: "Llama 3.1 70B", provider: "groq" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", provider: "groq" },

  // Mistral
  { id: "mistral-large-latest", label: "Mistral Large", provider: "mistral" },
  { id: "mistral-small-latest", label: "Mistral Small", provider: "mistral" },
];

/** 取某厂商的内置模型列表。 */
export function modelsForProvider(p: ProviderId): BuiltinModel[] {
  return BUILTIN_MODELS.filter((m) => m.provider === p);
}

/** 特殊项：自定义模型（设置面板下拉末尾的“手动输入”）。 */
export const CUSTOM_MODEL_ID = "__custom__";
