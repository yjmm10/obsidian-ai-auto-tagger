import { generateObject, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { AISettings, FieldMapping, FieldMode } from "./types";
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

/**
 * 把「允许取值」自由文本（或已有标签池数组）解析为归一化（去空格、保留大小写）的候选集合。
 * 保留原始大小写，便于把 AI 的输出映射回规范写法（如 "tech"→"Tech"）。
 */
function normalizeList(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,\n，、;；]/);
  return raw.map((s) => String(s).trim()).filter((s) => s.length > 0);
}

/** 大小写不敏感相等比较（用于标签去重/过滤）。 */
function equiv(a: string, b: string): boolean {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * 解析单字段的「生成模式」策略，得到：
 * - allowed    : 约束 AI 取值的规范词表（用于提示词 [允许取值] 与回落过滤）。
 * - strict     : true 表示 allowed 来自预定义池，回落时严格过滤，不保留越界原值。
 * - union      : 混合模式需并入的预定义标签池（始终添加，与 AI 输出取并集去重）。
 *
 * 规则：
 * - generate  : allowed = 手动 constraints（若有），union 空。
 * - predefined: 仅能选预定义池中的值；与手动 constraints 取交集；池空时回退到 constraints。
 * - hybrid    : AI 自由生成（allowed = 手动 constraints），union = 预定义池（始终并入）。
 * 预定义池只对数组（tags）类字段有意义；其它类型字段池为空，predefined/hybrid 退化为约束生成。
 */
function resolveFieldPolicy(
  field: FieldMapping,
  predefinedTags: string[]
): { allowed?: string[]; strict: boolean; union?: string[] } {
  const manual = normalizeList(field.constraints);
  const pool =
    field.type === "array" ? normalizeList(predefinedTags) : [];
  if (field.mode === "predefined") {
    let allowed = pool.length ? pool.slice() : manual.slice();
    if (manual.length) allowed = allowed.filter((v) => manual.some((m) => equiv(v, m)));
    return {
      allowed: allowed.length ? allowed : manual.length ? manual : undefined,
      strict: true,
      union: undefined,
    };
  }
  if (field.mode === "hybrid") {
    return {
      allowed: manual.length ? manual : undefined,
      strict: false,
      union: pool,
    };
  }
  // generate
  return { allowed: manual.length ? manual : undefined, strict: false, union: undefined };
}

/** 内置默认 system prompt（不含动态字段定义，字段定义会由 buildRequestParams 自动追加）。 */
const DEFAULT_SYSTEM_PROMPT =
  "你是一名严谨的中文笔记元数据提取助手。\n" +
  "请根据用户提供的笔记（标题 + 正文），提取下方定义的字段，并只输出一个 JSON 对象。\n\n" +
  "严格要求：\n" +
  "1. JSON 顶层键名必须与字段定义中的名称完全一致，不得增删、改写或翻译。\n" +
  "2. 每个字段的值必须严格符合其声明类型（string=字符串；array=字符串数组；number=数字；boolean=true/false）。\n" +
  "3. 若字段标注了「允许取值」，则只能从该范围内挑选，不得自创新值。\n" +
  "4. 不要输出任何解释、Markdown 代码块标记或多余文字，直接输出 JSON。";

/** 把 AI 返回的数组值按 allowed 规范过滤；命中时映射回规范写法。
 *  strict=false 且全部越界时保留原值（避免误清空）。 */
function filterAllowed(
  arr: string[],
  allowed: string[] | undefined,
  strict: boolean
): string[] {
  if (!allowed || allowed.length === 0) return arr;
  const out: string[] = [];
  for (const v of arr) {
    const hit = allowed.find((a) => equiv(a, v));
    if (hit) out.push(hit);
  }
  if (out.length === 0 && !strict) return arr; // 全部越界：保留原值（手动约束的容错）
  return out;
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
 * system 提示词经过优化：明确角色、严格约束键名/类型/取值，并按字段「生成模式」嵌入
 * 预定义标签池（predefined 模式作为唯一可选项；generate/hybrid 模式叠加手动约束）。
 */
export function buildRequestParams(
  settings: AISettings,
  fields: FieldMapping[],
  title: string,
  content: string,
  predefinedTags: string[] = []
): { system: string; prompt: string; schema: z.ZodTypeAny } {
  const enabled = fields.filter((f) => f.enabled && f.name.trim().length > 0);
  const fieldSpec = enabled
    .map((f) => {
      const pol = resolveFieldPolicy(f, predefinedTags);
      const allowedStr = pol.allowed && pol.allowed.length ? pol.allowed.join(", ") : "";
      const cPart = allowedStr ? ` [允许取值：${allowedStr}]` : "";
      const modeHint =
        f.mode === "predefined"
          ? "（仅可从上述允许取值中选择，不得自创新值）"
          : f.mode === "hybrid"
          ? "（生成后可并入预定义标签池）"
          : "";
      return `- ${f.name}（类型：${f.type}）${cPart}：${f.description}${modeHint}`;
    })
    .join("\n");
  const systemPrompt = (settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
  const system = `${systemPrompt}\n\n字段定义：\n${fieldSpec}`;
  const prompt = `标题：${title}\n\n内容：\n${content}`;
  return { system, prompt, schema: buildSchema(enabled) };
}

/**
 * 把 AI 返回的数据按字段配置强转（纯函数）。
 * 防御 SDK 偶发的类型漂移，并保证写入 frontmatter 的值类型正确；
 * 同时按字段「生成模式」施加预定义标签池约束（predefined 严格过滤 / hybrid 并集并入）。
 */
export function coerceFields(
  data: Record<string, unknown> | undefined,
  fields: FieldMapping[],
  predefinedTags: string[] = []
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const f of fields) {
    if (!f.enabled) continue;
    const key = f.name.trim();
    if (!key) continue;
    const raw = data[key];
    if (raw === undefined || raw === null) continue;
    const pol = resolveFieldPolicy(f, predefinedTags);
    switch (f.type) {
      case "array": {
        let arr: string[] = [];
        if (Array.isArray(raw))
          arr = raw.map((v) => String(v).trim()).filter(Boolean);
        else if (typeof raw === "string")
          arr = raw
            .split(/[,\n，、]/)
            .map((s) => s.trim())
            .filter(Boolean);
        // 按字段模式过滤：predefined 严格限定在池内；generate/hybrid 受手动约束。
        arr = filterAllowed(arr, pol.allowed, pol.strict);
        // 混合模式：始终并入预定义标签池（去重，保留大小写）。
        if (pol.union && pol.union.length) {
          const set = new Map<string, string>();
          for (const v of [...arr, ...pol.union]) {
            const t = v.trim();
            if (!t) continue;
            const k = t.toLowerCase();
            if (!set.has(k)) set.set(k, t);
          }
          arr = Array.from(set.values());
        }
        if (arr.length) out[key] = arr;
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
  modelOverride?: any,
  predefinedTags: string[] = []
): Promise<AICallResult> {
  const cfgErr = validateSettings(settings);
  if (cfgErr.length) return { ok: false, error: "配置无效：" + cfgErr.join("；") };

  const enabled = fields.filter((f) => f.enabled && f.name.trim().length > 0);
  if (enabled.length === 0) return { ok: false, error: "未启用任何字段" };

  const { system, prompt, schema } = buildRequestParams(
    settings,
    enabled,
    title,
    content,
    predefinedTags
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
    return {
      ok: true,
      data: coerceFields(object as Record<string, unknown>, enabled, predefinedTags),
    };
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
      prompt: "ping",
      system: "You are a helpful assistant. Reply with a single word: pong.",
      maxOutputTokens: 256,
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
    const finishReason = (result.response?.headers as any)?.["x-finish-reason"]
      || (result.response?.body as any)?.choices?.[0]?.finish_reason
      || "";
    if (finishReason === "length") {
      return {
        ok: false,
        error: `模型因 token 不足被截断（finish_reason=length）。原始响应片段：${raw}`,
      };
    }
    return {
      ok: false,
      error: `模型返回为空。原始响应片段：${raw}`,
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
