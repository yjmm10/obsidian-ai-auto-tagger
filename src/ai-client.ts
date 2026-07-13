import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { AISettings, FieldMapping } from "./types";
import { PROVIDERS, SdkProvider } from "./models";

export interface AICallResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** 校验 AI 基础配置是否完整，返回缺失项列表（空数组表示通过）。 */
export function validateSettings(s: AISettings): string[] {
  const errs: string[] = [];
  const info = PROVIDERS[s.provider];
  if (!info) errs.push("未知厂商：" + s.provider);
  if (info?.requiresKey && !s.apiKey.trim()) errs.push("API Key 为空");
  if (!s.model.trim()) errs.push("模型名为空");
  if (info?.sdk === "openai-compatible" && !getBaseUrl(s).trim())
    errs.push("Base URL 为空（openai-compatible 类厂商必填）");
  return errs;
}

/** 计算最终使用的 Base URL：优先用户填写，否则厂商默认。 */
export function getBaseUrl(s: AISettings): string {
  const base = (s.baseUrl || PROVIDERS[s.provider]?.defaultBaseUrl || "").trim();
  return base.replace(/\/+$/, "");
}

/**
 * 依据厂商构造 Vercel AI SDK 的语言模型。
 * 所有 OpenAI 兼容厂商(含国内厂商与本地 Ollama)走 createOpenAICompatible。
 */
export function buildModel(s: AISettings, modelOverride?: any): any {
  if (modelOverride) return modelOverride;
  const baseURL = getBaseUrl(s) || undefined;
  const sdk: SdkProvider = PROVIDERS[s.provider]?.sdk ?? "openai-compatible";
  const model = s.model.trim();
  const apiKey = s.apiKey.trim();
  switch (sdk) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL })(model);
    case "openai-compatible":
    default:
      return createOpenAICompatible({
        name: s.provider,
        baseURL: baseURL ?? "https://api.openai.com/v1",
        apiKey,
      })(model);
  }
}

/** 依据字段定义动态构建 zod schema，供 generateObject 做结构化输出。 */
export function buildSchema(fields: FieldMapping[]): z.ZodTypeAny {
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

/**
 * 组装请求参数（纯函数，便于测试）：system / user prompt / zod schema。
 */
export function buildRequestParams(
  settings: AISettings,
  fields: FieldMapping[],
  title: string,
  content: string
): { system: string; prompt: string; schema: z.ZodTypeAny } {
  const enabled = fields.filter((f) => f.enabled && f.name.trim().length > 0);
  const fieldSpec = enabled
    .map((f) => `- ${f.name}（类型：${f.type}）：${f.description}`)
    .join("\n");
  const system =
    `${settings.extraInstruction ? settings.extraInstruction + "\n" : ""}` +
    `根据用户提供的中文笔记，提取结构化元数据。\n` +
    `只输出一个 JSON 对象，键必须严格等于下列字段名，值必须符合对应类型：\n${fieldSpec}`;
  const prompt = `标题：${title}\n\n内容：\n${content}`;
  return { system, prompt, schema: buildSchema(enabled) };
}

/**
 * 把 AI 返回的数据按字段配置强转（纯函数）。
 * 防御 SDK 偶发的类型漂移，并保证写入 frontmatter 的值类型正确。
 */
export function coerceFields(
  data: Record<string, unknown> | undefined,
  fields: FieldMapping[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const f of fields) {
    if (!f.enabled) continue;
    const key = f.name.trim();
    if (!key) continue;
    const raw = data[key];
    if (raw === undefined || raw === null) continue;
    switch (f.type) {
      case "array": {
        if (Array.isArray(raw)) out[key] = raw.map((v) => String(v));
        else if (typeof raw === "string")
          out[key] = raw
            .split(/[,\n，、]/)
            .map((s) => s.trim())
            .filter(Boolean);
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isNaN(n)) out[key] = n;
        break;
      }
      case "boolean": {
        if (typeof raw === "boolean") out[key] = raw;
        else if (raw === "true" || raw === "false") out[key] = raw === "true";
        break;
      }
      case "string":
      default: {
        if (Array.isArray(raw)) out[key] = raw.map((v) => String(v)).join("、");
        else out[key] = String(raw);
        break;
      }
    }
  }
  return out;
}

/** 生成带超时的 AbortSignal，避免请求无限挂起。 */
function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), Math.max(1000, ms));
  return ctrl.signal;
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
 * modelOverride 仅用于测试（注入 mock 模型）。
 */
export async function callAI(
  settings: AISettings,
  fields: FieldMapping[],
  title: string,
  content: string,
  modelOverride?: any
): Promise<AICallResult> {
  const cfgErr = validateSettings(settings);
  if (cfgErr.length) return { ok: false, error: "配置无效：" + cfgErr.join("；") };

  const enabled = fields.filter((f) => f.enabled && f.name.trim().length > 0);
  if (enabled.length === 0) return { ok: false, error: "未启用任何字段" };

  const { system, prompt, schema } = buildRequestParams(
    settings,
    enabled,
    title,
    content
  );

  const model = buildModel(settings, modelOverride);
  try {
    const { object } = await generateObject({
      model,
      schema: schema as any,
      system,
      prompt,
      temperature: settings.temperature,
      topP: settings.topP,
      maxOutputTokens: settings.maxTokens,
      maxRetries: 0,
      abortSignal: timeoutSignal(settings.requestTimeout),
    });
    return { ok: true, data: coerceFields(object as Record<string, unknown>, enabled) };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/**
 * 验证当前配置是否可用：发送一个极小的请求探活端点/密钥/模型。
 * 不依赖结构化输出，规避部分本地模型对 JSON 模式的限制。
 */
export async function verifyConnection(
  settings: AISettings,
  modelOverride?: any
): Promise<AICallResult> {
  const cfgErr = validateSettings(settings);
  if (cfgErr.length) return { ok: false, error: "配置无效：" + cfgErr.join("；") };

  const model = buildModel(settings, modelOverride);
  try {
    const result = await generateText({
      model,
      prompt: "请只回复两个字：pong",
      maxOutputTokens: 32,
      temperature: 0,
      topP: settings.topP,
      maxRetries: 0,
      abortSignal: timeoutSignal(settings.requestTimeout),
    });
    const text = result.text ?? "";
    if (text.trim().length > 0) return { ok: true };
    const raw = result.response?.body
      ? JSON.stringify(result.response.body).slice(0, 800)
      : "(SDK 未提供原始响应)";
    return {
      ok: false,
      error: `模型返回为空。原始响应片段：${raw}`,
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
