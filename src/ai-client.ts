import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { AISettings, AIProvider, FieldMapping } from "./types";

export interface AICallResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** 校验 AI 基础配置是否完整，返回缺失项列表（空数组表示通过）。 */
export function validateSettings(s: AISettings): string[] {
  const errs: string[] = [];
  if (!s.apiKey.trim()) errs.push("API Key 为空");
  if (!s.model.trim()) errs.push("模型名为空");
  if (s.provider === "openai-compatible" && !s.baseUrl.trim())
    errs.push("Base URL 为空（openai-compatible 模式必填）");
  return errs;
}

/**
 * 依据厂商类型构造 Vercel AI SDK 的语言模型。
 * - openai-compatible：兼容任意 OpenAI 协议端点（OpenAI / DeepSeek / 通义 / 智谱 / 豆包 / Ollama 等）
 * - anthropic：原生 Claude
 * - google：原生 Gemini
 */
function buildModel(s: AISettings): any {
  const baseURL = s.baseUrl.replace(/\/+$/, "") || undefined;
  switch (s.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: s.apiKey.trim(), baseURL })(s.model.trim());
    case "google":
      return createGoogleGenerativeAI({ apiKey: s.apiKey.trim(), baseURL })(
        s.model.trim()
      );
    case "openai-compatible":
    default:
      return createOpenAICompatible({
        name: "compatible",
        baseURL: baseURL ?? "https://api.openai.com/v1",
        apiKey: s.apiKey.trim(),
      })(s.model.trim());
  }
}

/** 生成带超时的 AbortSignal，避免请求无限挂起。 */
function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), Math.max(1000, ms));
  return ctrl.signal;
}

/** 依据字段定义动态构建 zod schema，供 generateObject 做结构化输出。 */
function buildSchema(fields: FieldMapping[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const key = f.name.trim();
    if (!key) continue;
    switch (f.type) {
      case "array":
        shape[key] = z.array(z.string());
        break;
      case "number":
        shape[key] = z.number();
        break;
      case "boolean":
        shape[key] = z.boolean();
        break;
      case "string":
      default:
        shape[key] = z.string();
        break;
    }
  }
  return z.object(shape);
}

/** 把 Vercel AI SDK 抛出的错误转换为可读信息。 */
function describeError(e: unknown): string {
  const err = e as {
    statusCode?: number;
    status?: number;
    message?: string;
    response?: { status?: number };
    name?: string;
  };
  const status = err?.statusCode ?? err?.status ?? err?.response?.status;
  const msg = err?.message ?? String(e);
  if (status) return `HTTP ${status}: ${msg}`;
  if (/(ECONN|fetch|network|abort|timeout)/i.test(msg))
    return `连接/超时失败：${msg}`;
  return msg;
}

/**
 * 调用 AI，按字段定义产出结构化结果。
 * 使用 Vercel AI SDK 的 generateObject，由 SDK 统一处理各厂商的结构化输出（JSON 模式 / 工具调用）。
 */
export async function callAI(
  settings: AISettings,
  fields: FieldMapping[],
  title: string,
  content: string
): Promise<AICallResult> {
  const cfgErr = validateSettings(settings);
  if (cfgErr.length) return { ok: false, error: "配置无效：" + cfgErr.join("；") };

  const enabled = fields.filter((f) => f.enabled && f.name.trim().length > 0);
  if (enabled.length === 0) return { ok: false, error: "未启用任何字段" };

  const fieldSpec = enabled
    .map((f) => `- ${f.name}（类型：${f.type}）：${f.description}`)
    .join("\n");

  const system =
    `${settings.extraInstruction ? settings.extraInstruction + "\n" : ""}` +
    `根据用户提供的中文笔记，提取结构化元数据。\n` +
    `只输出一个 JSON 对象，键必须严格等于下列字段名，值必须符合对应类型：\n${fieldSpec}`;

  const prompt = `标题：${title}\n\n内容：\n${content}`;

  const model = buildModel(settings);
  const schema = buildSchema(enabled);
  try {
    const { object } = await generateObject({
      model,
      schema: schema as any,
      system,
      prompt,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxTokens,
      maxRetries: 0,
      abortSignal: timeoutSignal(settings.requestTimeout),
    });
    return { ok: true, data: object as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/**
 * 验证当前配置是否可用：发送一个极小的请求探活端点/密钥/模型。
 * 不依赖结构化输出，规避部分本地模型对 JSON 模式的限制。
 */
export async function verifyConnection(settings: AISettings): Promise<AICallResult> {
  const cfgErr = validateSettings(settings);
  if (cfgErr.length) return { ok: false, error: "配置无效：" + cfgErr.join("；") };

  const model = buildModel(settings);
  try {
    const { text } = await generateText({
      model,
      prompt: "请只回复两个字：pong",
      maxOutputTokens: 8,
      temperature: 0,
      maxRetries: 0,
      abortSignal: timeoutSignal(settings.requestTimeout),
    });
    return text && text.trim().length > 0
      ? { ok: true }
      : { ok: false, error: "模型返回为空，请检查模型名或端点" };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
