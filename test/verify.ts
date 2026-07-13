/**
 * 本地验证脚本（不依赖 Obsidian GUI / 真实网络）。
 * 用 stub 的 global.fetch 让真实的 Vercel AI SDK 解析假响应，
 * 端到端验证 callAI / verifyConnection 链路，并覆盖纯函数逻辑。
 *
 * 运行：npx tsx test/verify.ts
 */
import {
  PROVIDERS,
  BUILTIN_MODELS,
  modelsForProvider,
  CUSTOM_MODEL_ID,
} from "../src/models";
import {
  validateSettings,
  getBaseUrl,
  buildSchema,
  buildModel,
  buildRequestParams,
  coerceFields,
  callAI,
  verifyConnection,
} from "../src/ai-client";
import type { AISettings, FieldMapping } from "../src/types";
import { isContentSufficient } from "../src/text";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

// ---------- 1. 模型注册表数据完整性 ----------
console.log("\n[1] 模型注册表数据完整性");
const providerIds = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];
check("PROVIDERS 数量 >= 10", providerIds.length >= 10);
for (const id of providerIds) {
  const p = PROVIDERS[id];
  check(
    `provider ${id} 字段完整`,
    !!p.label && !!p.sdk && typeof p.requiresKey === "boolean" && !!p.note
  );
}
const validProviderKeys = new Set(providerIds);
check(
  "BUILTIN_MODELS 的 provider 都合法",
  BUILTIN_MODELS.every((m) => validProviderKeys.has(m.provider))
);
check(
  "每个 provider 至少有 1 个内置模型",
  providerIds.every((id) => modelsForProvider(id).length >= 1)
);
check("CUSTOM_MODEL_ID 不在内置列表", !BUILTIN_MODELS.some((m) => m.id === CUSTOM_MODEL_ID));

// ---------- 2. validateSettings ----------
console.log("\n[2] 配置校验 validateSettings");
const baseOpenAI: AISettings = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.3,
  topP: 1,
  maxTokens: 800,
  requestTimeout: 30000,
  extraInstruction: "",
};
check("openai 缺 key → 报错", validateSettings(baseOpenAI).some((e) => /Key/.test(e)));
check(
  "openai 有 key → 通过",
  validateSettings({ ...baseOpenAI, apiKey: "sk-x" }).length === 0
);
const ollama: AISettings = {
  ...baseOpenAI,
  provider: "ollama",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
  model: "llama3.1",
};
check("ollama 无 key → 通过(requiresKey=false)", validateSettings(ollama).length === 0);
const zhipuNoUrl: AISettings = {
  ...baseOpenAI,
  provider: "zhipu",
  baseUrl: "",
  apiKey: "x",
  model: "glm-4-plus",
};
check(
  "zhipu 空 baseUrl 自动回退厂商默认",
  getBaseUrl(zhipuNoUrl) === "https://open.bigmodel.cn/api/paas/v4"
);
check(
  "zhipu 空 baseUrl 不报错(走默认)",
  validateSettings(zhipuNoUrl).length === 0
);

// ---------- 3. buildSchema ----------
console.log("\n[3] 动态 zod schema buildSchema");
const fields: FieldMapping[] = [
  { enabled: true, name: "tags", type: "array", description: "标签" },
  { enabled: true, name: "summary", type: "string", description: "摘要" },
  { enabled: true, name: "count", type: "number", description: "数量" },
  { enabled: true, name: "ok", type: "boolean", description: "是否" },
];
const schema = buildSchema(fields) as any;
const parsed = schema.safeParse({
  tags: ["a", "b"],
  summary: "s",
  count: 3,
  ok: true,
});
check("schema 解析合法对象通过", parsed.success === true);
const parsedBad = schema.safeParse({ tags: "not-array", summary: 1, count: "x", ok: "y" });
check(
  "schema 拒绝类型不符对象",
  parsedBad.success === false
);

// ---------- 4. coerceFields（防御性强转） ----------
console.log("\n[4] 字段强转 coerceFields");
const weird: Record<string, unknown> = {
  tags: "技术, obsidian",
  summary: ["第", "一句"],
  count: "12",
  ok: "true",
  extra: "忽略",
};
const coerced = coerceFields(weird, fields);
check("string→array 拆分并去空格", Array.isArray(coerced.tags) && coerced.tags.length === 2 && coerced.tags[0] === "技术");
check("array→string 用、连接", coerced.summary === "第、一句");
check("string→number 转换", coerced.count === 12 && typeof coerced.count === "number");
check("string→boolean 转换", coerced.ok === true);
check("未定义字段不写入", !("extra" in coerced));

// ---------- 5. buildModel 不抛错 ----------
console.log("\n[5] 各厂商 buildModel 构造");
for (const id of providerIds) {
  try {
    const m = buildModel({
      ...baseOpenAI,
      provider: id,
      baseUrl: PROVIDERS[id].defaultBaseUrl ?? "",
      apiKey: "fake-key",
      model: modelsForProvider(id)[0]?.id ?? "model",
    });
    check(`buildModel(${id}) 返回非空`, !!m);
  } catch (e) {
    check(`buildModel(${id}) 不抛错`, false, String(e));
  }
}

// ---------- 6. fetch-mock 端到端 ----------
console.log("\n[6] fetch-mock 端到端 callAI / verifyConnection");
const FETCH_OK = (content: string) =>
  new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

const JSON_CONTENT = JSON.stringify({
  tags: ["技术", "obsidian"],
  summary: "一篇关于插件的笔记",
  category: "技术",
  readCount: 12,
  published: true,
});

(globalThis as any).fetch = async (input: any, init?: any) => {
  let body: any = {};
  try {
    body = init?.body ? JSON.parse(init.body) : {};
  } catch {
    /* ignore */
  }
  const txt = JSON.stringify(body?.messages ?? "");
  if (txt.includes("pong")) return FETCH_OK("pong");
  return FETCH_OK(JSON_CONTENT);
};

(async () => {
  const cfg: AISettings = {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "fake",
    model: "gpt-4o-mini",
    temperature: 0.3,
    topP: 1,
    maxTokens: 800,
    requestTimeout: 30000,
    extraInstruction: "",
  };
  const tagFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签" },
    { enabled: true, name: "summary", type: "string", description: "摘要" },
    { enabled: true, name: "category", type: "string", description: "分类" },
    { enabled: true, name: "readCount", type: "number", description: "阅读数" },
    { enabled: true, name: "published", type: "boolean", description: "是否发布" },
  ];

  const r = await callAI(cfg, tagFields, "测试标题", "这是正文内容");
  check("callAI 返回 ok", r.ok === true, r.error ?? "");
  if (r.ok) {
    check("callAI 解析出 tags 数组", Array.isArray(r.data!.tags) && (r.data!.tags as any[]).length === 2);
    check("callAI 解析出 summary 字符串", typeof r.data!.summary === "string");
    check("callAI 解析出 number 字段", r.data!.readCount === 12);
    check("callAI 解析出 boolean 字段", r.data!.published === true);
  }

  const v = await verifyConnection(cfg);
  check("verifyConnection 返回 ok", v.ok === true, v.error ?? "");

  // buildRequestParams 检查
  const rp = buildRequestParams(cfg, tagFields, "标题X", "内容Y");
  check("buildRequestParams 含 system 与 prompt", !!rp.system && !!rp.prompt);
  check("buildRequestParams schema 为 zod", typeof (rp.schema as any)?.safeParse === "function");

  // ---------- 5. 内容达标门控（isContentSufficient）----------
  console.log("\n[5] 内容达标门控 isContentSufficient");
  check("空文件不达标", isContentSufficient("", 30) === false);
  check("仅空白不达标", isContentSufficient("   \n\n  ", 30) === false);
  check("frontmatter 不计入字数", isContentSufficient("---\ntags: [a,b]\n---\n", 10) === false);
  check("正文达标", isContentSufficient("今天学习了一个新的算法，收获很多。", 10) === true);
  check("带 frontmatter 的正文达标", isContentSufficient("---\ntags: [a]\n---\n这是一段足够长的正文内容用于测试门控逻辑。", 10) === true);
  check("阈值=0 始终达标", isContentSufficient("", 0) === true);
  check("刚好达阈值", isContentSufficient("一二三四五六七八九十", 10) === true);
  check("差一个字不达标", isContentSufficient("一二三四五六七八九", 10) === false);

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
})();
