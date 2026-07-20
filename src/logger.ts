import { App } from "obsidian";
import { PluginSettings } from "./types";

type LogLevel = "INFO" | "WARN" | "ERROR";

/** 超长截断并标注原始长度，便于日志排查。 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(${s.length} chars)`;
}

/** 安全序列化对象并截断，失败时回退为 String。 */
export function jsonForLog(v: unknown, max = 2000): string {
  try {
    return truncate(JSON.stringify(v), max);
  } catch {
    return truncate(String(v), max);
  }
}

/**
 * 插件执行日志器。
 *
 * 设计要点：
 * - 持有 app 与 settings 引用，每次写盘前实时读取 logEnabled / logPath，
 *   因此设置变更无需重建实例即可生效。
 * - 仅在 logEnabled=true 时写盘；同时把日志镜像到浏览器控制台（DevTools），
 *   便于「仅看控制台」的轻量排查场景。
 * - 写入采用追加（append）；文件超过 1MB 自动轮转，避免单次日志文件无限膨胀。
 * - 任何日志写入异常都被吞掉（不影响主流程打标），保证「日志功能本身永不阻断业务」。
 */
export class Logger {
  constructor(
    private app: App,
    private settings: PluginSettings
  ) {}

  private enabled(): boolean {
    return !!this.settings.logEnabled;
  }

  private path(): string {
    return (this.settings.logPath || "ai-auto-tagger.log").trim() || "ai-auto-tagger.log";
  }

  private async write(level: LogLevel, msg: string): Promise<void> {
    if (!this.enabled()) return;
    const ts = new Date().toISOString();
    const line = `${ts} [${level}] ${msg}\n`;
    // 镜像到控制台（ERROR→error，其余→log），方便无日志文件时仍能看
    if (level === "ERROR") console.error(`[AI Tagger] ${msg}`);
    else console.log(`[AI Tagger] ${msg}`);

    try {
      const adapter = this.app.vault.adapter;
      const p = this.path();
      const stat = await adapter.stat(p);
      // 超过 1MB 自动轮转：以本次行作为文件开头
      if (stat && typeof stat.size === "number" && stat.size > 1_000_000) {
        await adapter.write(p, line);
        return;
      }
      if (!stat) {
        await adapter.write(p, line);
      } else {
        await adapter.append(p, line);
      }
    } catch {
      /* 日志写盘失败：静默忽略，绝不中断打标主流程 */
    }
  }

  /** 普通信息：打标开始、跳过、成功写入等。 */
  info(msg: string): Promise<void> {
    return this.write("INFO", msg);
  }

  /** 警告：内容不足暂缓、无新增字段等不致命的情况。 */
  warn(msg: string): Promise<void> {
    return this.write("WARN", msg);
  }

  /** 错误：AI 调用失败、连接错误等。 */
  error(msg: string): Promise<void> {
    return this.write("ERROR", msg);
  }
}
