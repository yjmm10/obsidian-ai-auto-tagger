/**
 * 纯文本工具（不依赖 Obsidian，便于在 Node 环境下单元测试）。
 */

/** 匹配 YAML frontmatter 块：--- 开头，--- 结尾，之后为正文。 */
export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface StrippedNote {
  /** 是否存在 frontmatter 块 */
  hasFm: boolean;
  /** 去除 frontmatter 后的正文 */
  body: string;
}

/** 去除 frontmatter 块，返回正文（无 frontmatter 时返回原文）。 */
export function stripFrontmatter(content: string): StrippedNote {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { hasFm: false, body: content };
  return { hasFm: true, body: content.slice(match[0].length) };
}

/**
 * 判断笔记正文是否达到「可打标」的最小字数。
 * 去除 frontmatter 后取正文 trim 长度；frontmatter 本身不计入。
 */
export function isContentSufficient(
  content: string,
  minContentChars: number
): boolean {
  const { body } = stripFrontmatter(content);
  return body.trim().length >= minContentChars;
}
