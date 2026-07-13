import { App, Notice, TFile } from "obsidian";
import { FieldMapping, PluginSettings } from "./types";
import { callAI } from "./ai-client";
import { compileNote, splitFrontmatter } from "./frontmatter";

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
    if (e && (p === e || p.startsWith(e + "/"))) return true;
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
  notice = true
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
    settings.skipIfHasTags &&
    Array.isArray(fm.tags) &&
    (fm.tags as unknown[]).length > 0
  ) {
    if (notice) new Notice(`AI Tagger: ${file.path} 已有标签，已跳过`);
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
    content
  );
  if (!res.ok || !res.data) {
    if (notice)
      new Notice(`AI Tagger: 调用失败 - ${res.error ?? "未知错误"}`);
    return false;
  }

  const newFm: Record<string, unknown> = { ...fm };
  let changed = false;

  for (const field of settings.fields) {
    if (!field.enabled || !field.name.trim()) continue;
    const key = field.name.trim();
    if (!(key in res.data)) continue;
    const coerced = coerce(res.data[key], field.type);

    if (settings.overwrite) {
      if (JSON.stringify(newFm[key]) !== JSON.stringify(coerced)) {
        newFm[key] = coerced;
        changed = true;
      }
    } else {
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
