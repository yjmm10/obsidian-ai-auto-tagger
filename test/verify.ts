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
import { applyFields, isEmptyValue } from "../src/field-apply";

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
  systemPrompt: "",
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
  { enabled: true, name: "tags", type: "array", description: "标签", mode: "generate" },
  { enabled: true, name: "summary", type: "string", description: "摘要", mode: "generate" },
  { enabled: true, name: "count", type: "number", description: "数量", mode: "generate" },
  { enabled: true, name: "ok", type: "boolean", description: "是否", mode: "generate" },
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
    systemPrompt: "",
  };
  const tagFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", mode: "generate" },
    { enabled: true, name: "summary", type: "string", description: "摘要", mode: "generate" },
    { enabled: true, name: "category", type: "string", description: "分类", mode: "generate" },
    { enabled: true, name: "readCount", type: "number", description: "阅读数", mode: "generate" },
    { enabled: true, name: "published", type: "boolean", description: "是否发布", mode: "generate" },
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

  // buildRequestParams：字段「允许取值」应进入 system
  const constrainedFields: FieldMapping[] = [
    { enabled: true, name: "category", type: "string", description: "分类", constraints: "技术, 读书, 生活", mode: "generate" },
  ];
  const rpC = buildRequestParams(cfg, constrainedFields, "t", "c");
  check("buildRequestParams 注入允许取值", rpC.system.includes("技术, 读书, 生活"));

  // systemPrompt 为空时回退到默认系统提示词；自定义 systemPrompt 优先
  check("systemPrompt 为空时回退默认提示词", rp.system.includes("JSON 顶层键名"));
  const customCfg = { ...cfg, systemPrompt: "你是自定义助手。" };
  const rpCustom = buildRequestParams(customCfg, tagFields, "标题X", "内容Y");
  check("自定义 systemPrompt 生效", rpCustom.system.startsWith("你是自定义助手。"));

  // ---------- 7. 字段「允许取值」约束（coerceFields 过滤）----------
  console.log("\n[7] 字段允许取值约束");
  const cFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", constraints: "技术, 读书, 生活", mode: "generate" },
  ];
  const cData = { tags: ["技术", "美食", "读书", "运动"] };
  const cOut = coerceFields(cData, cFields);
  check(
    "数组字段仅保留允许取值",
    Array.isArray(cOut.tags) &&
      (cOut.tags as string[]).length === 2 &&
      (cOut.tags as string[]).includes("技术") &&
      (cOut.tags as string[]).includes("读书") &&
      !(cOut.tags as string[]).includes("美食")
  );
  // 全部越界时保留原值，避免清空
  const cData2 = { tags: ["美食", "运动"] };
  const cOut2 = coerceFields(cData2, cFields);
  check("全部越界时保留原值不清空", Array.isArray(cOut2.tags) && (cOut2.tags as string[]).length === 2);
  // 无约束时不过滤
  const noC: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", constraints: "" },
  ];
  const noCOut = coerceFields(cData, noC);
  check("无约束时不过滤", Array.isArray(noCOut.tags) && (noCOut.tags as string[]).length === 4);

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

  // ---------- 8. 字段生成模式（mode）：predefined / hybrid ----------
  console.log("\n[8] 字段生成模式 mode");
  const POOL = ["技术", "读书", "运动"];
  // predefined：仅保留池内值，严格过滤，越界不保留
  const pFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", constraints: "", mode: "predefined" },
  ];
  const pOut = coerceFields({ tags: ["技术", "美食", "读书", "运动"] }, pFields, { tags: POOL });
  check(
    "predefined 仅保留预定义池内标签",
    Array.isArray(pOut.tags) &&
      (pOut.tags as string[]).length === 3 &&
      (pOut.tags as string[]).includes("技术") &&
      (pOut.tags as string[]).includes("读书") &&
      (pOut.tags as string[]).includes("运动") &&
      !(pOut.tags as string[]).includes("美食")
  );
  // 全部越界时（predefined 严格）不写入该字段（避免写入空 tags）
  const pOut2 = coerceFields({ tags: ["美食", "旅行"] }, pFields, { tags: POOL });
  check(
    "predefined 全部越界时不写入字段",
    !("tags" in pOut2)
  );
  // hybrid：AI 自由生成 ∪ 预定义池（并集去重，含池内全部标签）
  const hFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", constraints: "", mode: "hybrid" },
  ];
  const hOut = coerceFields({ tags: ["美食", "学习"] }, hFields, { tags: POOL });
  check(
    "hybrid 并入预定义池（并集去重）",
    Array.isArray(hOut.tags) &&
      (hOut.tags as string[]).length === 5 &&
      (hOut.tags as string[]).includes("技术") &&
      (hOut.tags as string[]).includes("读书") &&
      (hOut.tags as string[]).includes("运动") &&
      (hOut.tags as string[]).includes("美食") &&
      (hOut.tags as string[]).includes("学习")
  );
  // predefined 模式下 buildRequestParams 将池注入 [允许取值]
  const rpP = buildRequestParams(cfg, pFields, "t", "c", { tags: POOL });
  check("predefined 模式在提示词注入预定义池", rpP.system.includes("技术, 读书, 运动"));

  // 字段级预定义池：不同字段使用各自独立的标签来源，互不串池
  const twoFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "标签", constraints: "", mode: "predefined" },
    { enabled: true, name: "mood", type: "array", description: "心情", constraints: "", mode: "predefined" },
  ];
  const twoMap = { tags: ["技术", "读书"], mood: ["开心", "平静"] };
  const twoOut = coerceFields(
    // 故意让 tags 含 mood 池的词、mood 含 tags 池的词，验证不会串池
    { tags: ["技术", "美食", "开心"], mood: ["开心", "愤怒", "读书"] },
    twoFields,
    twoMap
  );
  check(
    "字段级：tags 仅用自身池过滤(保留技术,剔除美食/开心)",
    Array.isArray(twoOut.tags) &&
      (twoOut.tags as string[]).length === 1 &&
      (twoOut.tags as string[]).includes("技术") &&
      !(twoOut.tags as string[]).includes("美食") &&
      !(twoOut.tags as string[]).includes("开心")
  );
  check(
    "字段级：mood 仅用自身池过滤(保留开心,剔除愤怒/读书)",
    Array.isArray(twoOut.mood) &&
      (twoOut.mood as string[]).length === 1 &&
      (twoOut.mood as string[]).includes("开心") &&
      !(twoOut.mood as string[]).includes("愤怒") &&
      !(twoOut.mood as string[]).includes("读书")
  );

  // ---------- 12. 实时补全：空字段 / 被删除字段始终写入（applyFields） ----------
  console.log("\n[12] 实时补全（applyFields 字段级策略）");
  const rtFields: FieldMapping[] = [
    { enabled: true, name: "tags", type: "array", description: "", constraints: "", mode: "generate" },
    { enabled: true, name: "summary", type: "string", description: "", constraints: "", mode: "generate" },
  ];

  // 空字段在 skip 下也实时补全（核心实时性：没有标签 / 删掉标签都要更新）
  const skipEmpty = applyFields({}, { tags: ["技术", "读书"], summary: "摘要" }, rtFields, "skip");
  check("skip 策略：缺失字段被实时补全(tags)", Array.isArray(skipEmpty.fm.tags) && (skipEmpty.fm.tags as string[]).length === 2);
  check("skip 策略：缺失字段被实时补全(summary)", skipEmpty.fm.summary === "摘要");
  check("skip 策略：有写入变更", skipEmpty.changed === true);

  // 被删除的字段（空数组）在 skip 下也实时补全
  const skipDeleted = applyFields({ tags: [] }, { tags: ["技术"] }, rtFields, "skip");
  check("skip 策略：被删除(空数组)的 tags 实时补全", Array.isArray(skipDeleted.fm.tags) && (skipDeleted.fm.tags as string[]).includes("技术"));

  // 非空字段在 skip 下保留（保护用户已喜欢的标签）
  const skipKeep = applyFields({ tags: ["旧标签"] }, { tags: ["新标签"] }, rtFields, "skip");
  check("skip 策略：非空 tags 被保留(不覆盖)", Array.isArray(skipKeep.fm.tags) && (skipKeep.fm.tags as string[]).includes("旧标签") && !(skipKeep.fm.tags as string[]).includes("新标签"));
  check("skip 策略：无变更则不写", skipKeep.changed === false);

  // merge：非空数组去重追加
  const mergeAdd = applyFields({ tags: ["旧标签"] }, { tags: ["新标签"] }, rtFields, "merge");
  check("merge 策略：保留旧 + 追加新", Array.isArray(mergeAdd.fm.tags) && (mergeAdd.fm.tags as string[]).length === 2 && (mergeAdd.fm.tags as string[]).includes("新标签"));

  // overwrite：全权覆盖
  const ow = applyFields({ tags: ["旧标签"] }, { tags: ["新标签"] }, rtFields, "overwrite");
  check("overwrite 策略：覆盖为 AI 值", Array.isArray(ow.fm.tags) && (ow.fm.tags as string[]).includes("新标签") && !(ow.fm.tags as string[]).includes("旧标签"));

  // AI 返回空数组时不写入（避免 tags: []）
  const emptyArr = applyFields({}, { tags: [] }, rtFields, "merge");
  check("AI 返回空数组不写入(不产生 tags: [])", !("tags" in emptyArr.fm) && emptyArr.changed === false);

  // 禁用字段不参与
  const disabled = applyFields({}, { tags: ["技术"] }, [{ ...rtFields[0], enabled: false }], "skip");
  check("禁用字段不参与实时补全", !("tags" in disabled.fm) && disabled.changed === false);

  // isEmptyValue 边界
  check("isEmptyValue: undefined 为空", isEmptyValue(undefined, "array") === true);
  check("isEmptyValue: 空数组为空(string 类型看处理)", isEmptyValue([], "array") === true);
  check("isEmptyValue: false 布尔非空", isEmptyValue(false, "boolean") === false);
  check("isEmptyValue: 空字符串为空", isEmptyValue("  ", "string") === true);

  console.log(`\n结果：通过 ${passed}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
})();
