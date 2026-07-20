import { FieldMapping } from "./types";

/**
 * 纯函数模块：把 AI 返回值按字段类型强转 + 按策略合并进现有 frontmatter。
 * 不依赖 Obsidian API，便于单元测试与复用。
 */

/** 按字段类型把 AI 返回值强转为目标类型。 */
export function coerce(value: unknown, type: FieldMapping["type"]): unknown {
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

/** 判断一个值对其声明类型是否为「空」（空字段 / 被删除字段应视为空，需实时补全）。 */
export function isEmptyValue(v: unknown, type: FieldMapping["type"]): boolean {
  if (v === undefined || v === null) return true;
  switch (type) {
    case "array":
      if (!Array.isArray(v) || v.length === 0) return true;
      // 空标签不能算是有标签：所有元素为空字符串/空白时也算空
      return v.every((item) => String(item).trim() === "");
    case "string":
      return String(v).trim() === "";
    case "number":
      return Number.isNaN(Number(v));
    case "boolean":
      return false; // false 是合法布尔值，不算空
    default:
      return false;
  }
}

/**
 * 按字段策略把 AI 结果合并进现有 frontmatter。
 * 核心规则：
 *  - 空字段 / 被删除的字段（isEmptyValue 为真）始终写入 —— 这是「实时补全」的保障，不受 tagPolicy 影响。
 *  - 非空字段按 tagPolicy 处理：skip=保留已有；merge=数组去重追加；overwrite=全权覆盖。
 */
export function applyFields(
  current: Record<string, unknown>,
  aiData: Record<string, unknown>,
  fields: FieldMapping[],
  policy: "skip" | "merge" | "overwrite"
): { fm: Record<string, unknown>; changed: boolean; writtenKeys: string[] } {
  const fm: Record<string, unknown> = { ...current };
  let changed = false;
  const writtenKeys: string[] = [];
  const overwrite = policy === "overwrite";
  for (const field of fields) {
    if (!field.enabled || !field.name.trim()) continue;
    const key = field.name.trim();
    if (!(key in aiData)) continue;
    const coerced = coerce(aiData[key], field.type);
    if (isEmptyValue(coerced, field.type)) continue; // AI 未产出有效值，跳过该字段
    const existing = fm[key];
    if (isEmptyValue(existing, field.type)) {
      fm[key] = coerced; // 实时补全空 / 被删除字段
      changed = true;
      writtenKeys.push(key);
    } else if (overwrite) {
      if (JSON.stringify(existing) !== JSON.stringify(coerced)) {
        fm[key] = coerced;
        changed = true;
        writtenKeys.push(key);
      }
    } else if (policy === "merge" && field.type === "array") {
      const ex = Array.isArray(existing) ? existing.map(String) : [];
      const merged = Array.from(
        new Set([...ex, ...(coerced as unknown[]).map(String)])
      );
      if (merged.length > ex.length) {
        fm[key] = merged;
        changed = true;
        writtenKeys.push(key);
      }
    }
    // skip 且非空：保留已有值（保护用户已喜欢的标签）
  }
  return { fm, changed, writtenKeys };
}
