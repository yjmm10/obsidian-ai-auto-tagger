import { App, Notice, TFile } from "obsidian";
import { FieldMapping, PluginSettings, TagSource } from "./types";
import { callAI } from "./ai-client";
import { compileNote, splitFrontmatter } from "./frontmatter";
import { applyFields } from "./field-apply";

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
  predefinedTags: Record<string, string[]> = {},
  mode: "auto" | "manual" | "batch" = "manual"
): Promise<boolean> {
  if (!isInScope(file, settings)) {
    if (notice) new Notice(`AI Tagger: ${file.path} 不在生效范围内，已跳过`);
    return false;
  }

  const raw = await app.vault.read(file);
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm: Record<string, unknown> = frontmatter ?? {};

  const content = body.slice(0, settings.maxContentChars);
  const title = file.basename.trim();
  // 无可用信号（正文空且标题为空 / 泛化）时不发起 AI 调用，避免对空文件浪费
  if (content.trim().length === 0 && (title.length === 0 || isGenericTitle(title))) {
    if (notice && mode !== "auto")
      new Notice(`AI Tagger: ${file.path} 缺乏可读内容，已跳过`);
    return false;
  }

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
    return false;
  }

  // 字段级策略：空字段 / 被删除字段始终实时补全，非空字段按 tagPolicy 处理
  const { fm: newFm, changed } = applyFields(
    fm,
    res.data,
    settings.fields,
    settings.tagPolicy
  );
  if (!changed) {
    if (notice && mode !== "auto")
      new Notice(`AI Tagger: ${file.path} 无新增字段`);
    return false;
  }

  const out = compileNote(newFm, body);
  await app.vault.modify(file, out);
  if (notice) {
    const label = mode === "auto" ? "🏷️ 已自动更新" : "✅ 已写入";
    new Notice(`AI Tagger: ${label} ${file.path}`);
  }
  return true;
}
