import { App, Notice, TFile } from "obsidian";
import { FieldMapping, PluginSettings, TagSource } from "./types";
import { callAI } from "./ai-client";
import { compileNote, splitFrontmatter } from "./frontmatter";
import { applyFields } from "./field-apply";
import { jsonForLog, Logger, truncate } from "./logger";

/**
 * 收集「预定义标签池」（按字段独立配置来源）：
 * - file  : 读取 tagFilePath 指向的文件（每行一个标签 / YAML `tags:` 列表 / 行内 `#标签`）。
 * - vault : 扫描库内所有 .md 笔记 frontmatter 的 tags，去重合并。
 * - both  : 二者并集（默认）。
 * 结果去重（大小写不敏感），保留首次出现的规范写法。
 */
export async function collectPredefinedTags(
  app: App,
  tagSource: TagSource,
  tagFilePath: string
): Promise<string[]> {
  const map = new Map<string, string>();
  const add = (vals: string[]): void => {
    for (const v of vals) {
      const t = String(v).trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (!map.has(k)) map.set(k, t);
    }
  };
  if (tagSource === "file" || tagSource === "both") {
    const path = (tagFilePath || "").trim();
    if (path) {
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) {
        try {
          const txt = await app.vault.read(f);
          add(parseTagFile(txt));
        } catch {
          /* 文件不存在或读取失败：忽略 */
        }
      }
    }
  }
  if (tagSource === "vault" || tagSource === "both") {
    for (const file of app.vault.getMarkdownFiles()) {
      try {
        const raw = await app.vault.read(file);
        const { frontmatter } = splitFrontmatter(raw);
        const tags = (frontmatter as Record<string, unknown> | undefined)?.tags;
        if (Array.isArray(tags)) add(tags.map(String));
        else if (typeof tags === "string") add([tags]);
      } catch {
        /* 单文件读取失败：跳过 */
      }
    }
  }
  return Array.from(map.values());
}

/** 解析标签文件文本为标签数组（支持 YAML 列表 / 每行一个 / 行内 #标签 或逗号分隔）。 */
function parseTagFile(txt: string): string[] {
  const out: string[] = [];
  const yamlMatch = txt.match(/tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/);
  if (yamlMatch) {
    yamlMatch[1].split(/\r?\n/).forEach((l) => {
      const m = l.match(/^\s*-\s*(.+)$/);
      if (m) out.push(m[1].trim().replace(/^["']|["']$/g, ""));
    });
    return out;
  }
  txt.split(/\r?\n/).forEach((l) => {
    let s = l.trim();
    if (!s) return;
    if (s.startsWith("#")) s = s.slice(1);
    s = s.replace(/^["']|["']$/g, "").trim();
    s.split(/[,\uff0c]/).forEach((x) => {
      const t = x.trim();
      if (t) out.push(t);
    });
  });
  return out;
}

/** 判断文件是否落在生效范围内（排除优先于包含）。 */
export function isInScope(file: TFile, settings: PluginSettings): boolean {
  const p = file.path;
  for (const ex of settings.excludedFolders) {
    const e = ex.trim();
    if (e && (p === e || p.startsWith(e + "/"))) return false;
  }
  if (settings.enabledFolders.length === 0) return true;
  for (const f of settings.enabledFolders) {
    const e = f.trim();
    if (!e) continue;
    if (p === e) return true;
    if (settings.recursiveScope) {
      // 递归：该文件夹下任意深度的文件都生效
      if (p.startsWith(e + "/")) return true;
    } else {
      // 非递归：仅该文件夹下的「直接文件」生效（不含子文件夹）
      const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      if (parent === e) return true;
    }
  }
  return false;
}

/** 泛化标题（如 Untitled / 未命名）：无正文时不应据此发起 AI 调用。 */
function isGenericTitle(t: string): boolean {
  return /^(untitled|new\s+(note|file)|未命名|新建\s*(笔记|文件)?|无标题)$/i.test(
    t.trim()
  );
}

function poolSizes(predefinedTags: Record<string, string[]>): string {
  const keys = Object.keys(predefinedTags);
  if (keys.length === 0) return "{}";
  return jsonForLog(
    Object.fromEntries(keys.map((k) => [k, predefinedTags[k]?.length ?? 0])),
    500
  );
}

function formatMeta(meta: NonNullable<Awaited<ReturnType<typeof callAI>>["meta"]>): string {
  return [
    `provider=${meta.provider}`,
    `model=${meta.model}`,
    `baseUrl=${meta.baseUrl}`,
    `timeoutMs=${meta.timeoutMs}`,
    `maxTokens=${meta.maxTokens}`,
    `temperature=${meta.temperature}`,
    `topP=${meta.topP}`,
    `durationMs=${meta.durationMs}`,
    `enabledFields=[${meta.enabledFields.join(",")}]`,
    `title=${JSON.stringify(meta.title)}`,
    `contentChars=${meta.contentChars}`,
  ].join(" ");
}

/**
 * 对单个文件执行 AI 标记并写回 frontmatter。
 * @param notice 是否弹出 Notice 提示
 * @returns 是否成功写入
 */
export async function tagFile(
  app: App,
  file: TFile,
  settings: PluginSettings,
  notice = true,
  predefinedTags: Record<string, string[]> = {},
  mode: "auto" | "manual" | "batch" = "manual"
): Promise<boolean> {
  const logger = new Logger(app, settings);
  if (!isInScope(file, settings)) {
    void logger.warn(`skip ${file.path}: out of scope (mode=${mode})`);
    return false;
  }

  const raw = await app.vault.read(file);
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm: Record<string, unknown> = frontmatter ?? {};

  const content = body.slice(0, settings.maxContentChars);
  const title = file.basename.trim();
  // 无可用信号（正文空且标题为空 / 泛化）时不发起 AI 调用，避免对空文件浪费
  if (content.trim().length === 0 && (title.length === 0 || isGenericTitle(title))) {
    void logger.warn(
      `skip ${file.path}: no readable content (mode=${mode}, title=${JSON.stringify(title)}, bodyChars=${body.trim().length})`
    );
    return false;
  }

  const enabledNames = settings.fields
    .filter((f: FieldMapping) => f.enabled && f.name.trim())
    .map((f) => f.name.trim());
  void logger.info(
    `start ${file.path} (mode=${mode}, title=${JSON.stringify(title)}, contentChars=${content.length}, contentPreview=${JSON.stringify(truncate(content, 200))}, enabledFields=[${enabledNames.join(",")}], tagPolicy=${settings.tagPolicy}, poolSizes=${poolSizes(predefinedTags)})`
  );

  const res = await callAI(
    settings.ai,
    settings.fields,
    title,
    content,
    undefined,
    predefinedTags
  );
  if (!res.ok || !res.data) {
    if (notice)
      new Notice(`AI Tagger: 调用失败 - ${res.error ?? "未知错误"}`);
    const metaPart = res.meta ? ` ${formatMeta(res.meta)}` : "";
    void logger.error(
      `fail ${file.path}: ${res.error ?? "unknown error"}${metaPart}`
    );
    return false;
  }

  void logger.info(
    `ai-ok ${file.path}: ${formatMeta(res.meta!)} data=${jsonForLog(res.data)}`
  );

  // 字段级策略：空字段 / 被删除字段始终实时补全，非空字段按 tagPolicy 处理
  const { fm: newFm, changed, writtenKeys } = applyFields(
    fm,
    res.data,
    settings.fields,
    settings.tagPolicy
  );
  if (!changed) {
    const related: Record<string, unknown> = {};
    for (const k of enabledNames) related[k] = fm[k];
    void logger.info(
      `skip ${file.path}: no new fields written (policy=${settings.tagPolicy}, aiData=${jsonForLog(res.data)}, existingFm=${jsonForLog(related, 1000)})`
    );
    return false;
  }

  const out = compileNote(newFm, body);
  await app.vault.modify(file, out);
  const writtenSnapshot: Record<string, unknown> = {};
  for (const k of writtenKeys) writtenSnapshot[k] = newFm[k];
  void logger.info(
    `updated ${file.path}: writtenKeys=[${writtenKeys.join(", ")}] values=${jsonForLog(writtenSnapshot)}`
  );
  return true;
}
