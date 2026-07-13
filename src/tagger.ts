import { App, Notice, TFile } from "obsidian";
import { FieldMapping, PluginSettings, TagSource } from "./types";
import { callAI } from "./ai-client";
import { compileNote, splitFrontmatter } from "./frontmatter";

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

/** 按字段类型把 AI 返回值强转为目标类型。 */
function coerce(value: unknown, type: FieldMapping["type"]): unknown {
  switch (type) {
    case "array":
      return Array.isArray(value)
        ? value.map((v) => String(v).trim()).filter(Boolean)
        : value != null && value !== ""
        ? [String(value).trim()]
        : [];
    case "number":
      return Number(value);
    case "boolean":
      return Boolean(value);
    case "string":
    default:
      return value == null ? "" : String(value);
  }
}

/**
 * 对单个文件执行 AI 标记并写回 frontmatter。
 * @param notice 是否弹出 Notice 提示（批量时通常设为 false）
 * @returns 是否成功写入
 */
export async function tagFile(
  app: App,
  file: TFile,
  settings: PluginSettings,
  notice = true,
  predefinedTags: Record<string, string[]> = {}
): Promise<boolean> {
  if (!isInScope(file, settings)) {
    if (notice)
      new Notice(`AI Tagger: ${file.path} 不在生效范围内，已跳过`);
    return false;
  }

  const raw = await app.vault.read(file);
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm: Record<string, unknown> = frontmatter ?? {};

  if (
    settings.tagPolicy === "skip" &&
    Array.isArray(fm.tags) &&
    (fm.tags as unknown[]).length > 0
  ) {
    if (notice) new Notice(`AI Tagger: ${file.path} 已有标签，已跳过（保护模式）`);
    return false;
  }

  const content = body.slice(0, settings.maxContentChars);
  if (content.trim().length === 0 && file.basename.trim().length === 0) {
    if (notice) new Notice(`AI Tagger: ${file.path} 内容为空，已跳过`);
    return false;
  }

  const res = await callAI(
    settings.ai,
    settings.fields,
    file.basename,
    content,
    undefined,
    predefinedTags
  );
  if (!res.ok || !res.data) {
    if (notice)
      new Notice(`AI Tagger: 调用失败 - ${res.error ?? "未知错误"}`);
    return false;
  }

  const newFm: Record<string, unknown> = { ...fm };
  let changed = false;
  const overwrite = settings.tagPolicy === "overwrite";

  for (const field of settings.fields) {
    if (!field.enabled || !field.name.trim()) continue;
    const key = field.name.trim();
    if (!(key in res.data)) continue;
    const coerced = coerce(res.data[key], field.type);

    if (overwrite) {
      // 覆盖模式：AI 全权，任何差异都写入
      if (JSON.stringify(newFm[key]) !== JSON.stringify(coerced)) {
        newFm[key] = coerced;
        changed = true;
      }
    } else {
      // 保护 / 合并模式：保留已有值，AI 仅补充
      if (field.type === "array") {
        const existing = Array.isArray(newFm[key])
          ? (newFm[key] as unknown[])
          : [];
        const merged = Array.from(
          new Set([...existing, ...(coerced as unknown[])].map(String))
        );
        if (merged.length !== existing.length) {
          newFm[key] = merged;
          changed = true;
        }
      } else if (
        newFm[key] === undefined ||
        newFm[key] === null ||
        newFm[key] === ""
      ) {
        newFm[key] = coerced;
        changed = true;
      }
    }
  }

  if (!changed) {
    if (notice) new Notice(`AI Tagger: ${file.path} 无新增字段`);
    return false;
  }

  const out = compileNote(newFm, body);
  await app.vault.modify(file, out);
  if (notice) new Notice(`AI Tagger: 已为 ${file.path} 写入字段`);
  return true;
}
