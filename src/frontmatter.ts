import { parseYaml, stringifyYaml } from "obsidian";

export interface ParsedNote {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 将笔记拆分为 frontmatter 对象与正文。无 frontmatter 时返回 null。 */
export function splitFrontmatter(content: string): ParsedNote {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === "object") {
      fm = parsed as Record<string, unknown>;
    }
  } catch (e) {
    // 解析失败时当作无 frontmatter，保留正文
    console.warn("AI Tagger: 解析 frontmatter 失败，已忽略", e);
    return { frontmatter: null, body: content };
  }
  const body = content.slice(match[0].length);
  return { frontmatter: fm, body };
}

/** 将 frontmatter 对象与正文重新组合成完整笔记文本。 */
export function compileNote(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  let yaml: string;
  try {
    yaml = stringifyYaml(frontmatter).trimEnd();
  } catch (e) {
    console.warn("AI Tagger: 序列化 frontmatter 失败", e);
    yaml = "";
  }
  if (!yaml) {
    return body;
  }
  // 保证正文前有空行分隔
  const needsBlank = body.length > 0 && !body.startsWith("\n");
  return `---\n${yaml}\n---\n${needsBlank ? "\n" : ""}${body}`;
}
