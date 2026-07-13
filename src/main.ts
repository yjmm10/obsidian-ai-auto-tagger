import { App, Modal, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { AITaggerSettingTab } from "./settings";
import { collectPredefinedTags, isInScope, tagFile } from "./tagger";
import { isEmptyValue } from "./field-apply";
import { splitFrontmatter } from "./frontmatter";
import { isContentSufficient } from "./text";

export default class AITaggerPlugin extends Plugin {
  settings: PluginSettings;
  private debounceTimers: Map<string, number> = new Map();
  /** 程序写回文件后一段时间内的 modify 事件忽略，避免自触发循环 */
  private lastWritten: Map<string, number> = new Map();
  /** 自写宽限期：在此窗口内的 modify 视为插件自身写回，忽略 */
  private static GRACE_MS = 4000;
  /** 内容不足而挂起、等待后续写入达标的文件（新建空文件场景） */
  private pendingCreate: Set<string> = new Set();
  /** 预定义标签池缓存（按字段来源的 tagSource+tagFilePath 签名失效），键为字段名 */
  private predefinedMapCache: Record<string, string[]> | null = null;
  private poolSig = "";

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new AITaggerSettingTab(this.app, this));

    this.addCommand({
      id: "tag-current-file",
      name: "为当前文件生成标签 / 字段",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !(file instanceof TFile)) {
          new Notice("AI Tagger: 当前没有打开的 Markdown 文件");
          return;
        }
        await this.runTag(file, "manual");
      },
    });

    this.addCommand({
      id: "batch-folder",
      name: "批量处理文件夹（按路径）",
      callback: () => this.batchByFolder(),
    });

    this.addCommand({
      id: "batch-all-enabled",
      name: "批量处理所有已启用文件夹",
      callback: () => this.batchAllEnabled(),
    });

    if (this.settings.autoOnCreate) {
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          this.invalidatePredefined();
          if (file instanceof TFile && file.extension === "md") {
            this.scheduleAuto(file);
          }
        })
      );
    }

    // 统一监听 modify：自动触发 + 挂起文件达标后触发；自写宽限内忽略，防循环。
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const last = this.lastWritten.get(file.path) ?? 0;
        if (Date.now() - last < AITaggerPlugin.GRACE_MS) return;
        if (this.pendingCreate.has(file.path) || this.settings.autoOnModify) {
          this.scheduleAuto(file);
        }
      })
    );

    // 文件删除时清理挂起状态，避免内存泄漏
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.pendingCreate.delete(file.path);
        this.debounceTimers.delete(file.path);
        this.invalidatePredefined();
      })
    );
  }

  onunload(): void {
    this.debounceTimers.forEach((t) => window.clearTimeout(t));
    this.debounceTimers.clear();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    const base = structuredClone(DEFAULT_SETTINGS);
    this.settings = deepMerge(base, data ?? {});

    // 兼容旧配置：将 extraInstruction 迁移到新的 systemPrompt
    if (
      !this.settings.ai.systemPrompt &&
      (data as any)?.ai?.extraInstruction
    ) {
      this.settings.ai.systemPrompt = (data as any).ai.extraInstruction;
    }

    // 兼容旧配置：将全局 tagSource/tagFilePath 迁移到各字段（v1.5.0 起改为字段级）
    const raw = data as any;
    const legacySource = raw?.tagSource as
      | "file"
      | "vault"
      | "both"
      | undefined;
    const legacyPath = raw?.tagFilePath as string | undefined;
    if (legacySource || legacyPath) {
      this.settings.fields.forEach((f) => {
        if (!f.tagSource) f.tagSource = legacySource ?? "both";
        if (!f.tagFilePath) f.tagFilePath = legacyPath ?? "tags.md";
      });
    }
    // 保证每个字段都有预定义标签来源默认值
    this.settings.fields.forEach((f) => {
      if (!f.tagSource) f.tagSource = "both";
      if (!f.tagFilePath) f.tagFilePath = "tags.md";
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 取各字段的预定义标签池（键为字段名；带签名缓存：字段来源或库结构变动时自动失效）。 */
  async getPredefinedTags(): Promise<Record<string, string[]>> {
    const relevant = this.settings.fields.filter(
      (f) =>
        f.enabled &&
        f.name.trim().length > 0 &&
        f.type === "array" &&
        (f.mode === "predefined" || f.mode === "hybrid")
    );
    const sig = relevant
      .map((f) => `${f.name}:${f.tagSource ?? "both"}:${f.tagFilePath ?? "tags.md"}`)
      .join("|");
    if (this.predefinedMapCache && this.poolSig === sig)
      return this.predefinedMapCache;
    const map: Record<string, string[]> = {};
    for (const f of relevant) {
      map[f.name.trim()] = await collectPredefinedTags(
        this.app,
        f.tagSource ?? "both",
        f.tagFilePath ?? "tags.md"
      );
    }
    this.predefinedMapCache = map;
    this.poolSig = sig;
    return map;
  }

  /** 库结构变动（新建/删除笔记）时清空预定义池缓存，下次按需重算。 */
  private invalidatePredefined(): void {
    this.predefinedMapCache = null;
  }

  /**
   * 防抖调度自动打标（用于 create / modify 触发）。
   * 到点后由 runTag 执行「内容达标」门控：不足则挂起，不发起 AI 调用。
   */
  private scheduleAuto(file: TFile): void {
    const prev = this.debounceTimers.get(file.path);
    if (prev) window.clearTimeout(prev);
    const timer = window.setTimeout(async () => {
      this.debounceTimers.delete(file.path);
      await this.runTag(file, "auto");
    }, this.settings.debounceMs);
    this.debounceTimers.set(file.path, timer);
  }

  /**
   * 执行单次打标，带「内容达标 / 空字段实时补全」门控。
   * @param mode
   *  - "auto"：自动触发。内容不足且无空字段 → 挂起等待后续写入（不调用 AI）。
   *  - "manual"：手动命令。内容不足且无空字段 → 提示并跳过。
   *  - "batch"：批量。内容不足且无空字段 → 静默跳过。
   */
  private async runTag(
    file: TFile,
    mode: "auto" | "manual" | "batch",
    predefinedTags?: Record<string, string[]>
  ): Promise<boolean> {
    if (!isInScope(file, this.settings)) {
      if (mode === "manual")
        new Notice(`AI Tagger: ${file.path} 不在生效范围内`);
      return false;
    }

    const raw = await this.app.vault.read(file);
    const { frontmatter } = splitFrontmatter(raw);
    const fm = (frontmatter ?? {}) as Record<string, unknown>;
    // 是否存在「缺失或为空」的已启用字段（需要实时补全，不受字数门槛阻挡）
    const needsFill = this.anyEnabledFieldEmpty(fm);
    const sufficient = isContentSufficient(raw, this.settings.minContentChars);

    if (!sufficient && !needsFill) {
      if (mode === "auto") {
        // 内容不足且无空字段：挂起，等后续 modify 写够再触发（不浪费 AI 调用）
        this.pendingCreate.add(file.path);
      } else if (mode === "manual") {
        const len = splitFrontmatter(raw).body.trim().length;
        new Notice(
          `AI Tagger: 内容过少（${len} 字），未达 ${this.settings.minContentChars} 字阈值，已跳过`
        );
      }
      // batch 模式静默跳过
      return false;
    }

    this.pendingCreate.delete(file.path);
    try {
      const pool =
        predefinedTags ?? (await this.getPredefinedTags());
      return await tagFile(
        this.app,
        file,
        this.settings,
        mode !== "auto",
        pool,
        mode
      );
    } finally {
      // 记录写回时间，宽限窗口内忽略自身触发的 modify，避免循环
      this.lastWritten.set(file.path, Date.now());
    }
  }

  /** 是否存在已启用、但 frontmatter 中缺失或为空的目标字段（需实时补全）。 */
  private anyEnabledFieldEmpty(fm: Record<string, unknown>): boolean {
    return this.settings.fields.some((f) => {
      if (!f.enabled || !f.name.trim()) return false;
      return isEmptyValue(fm[f.name.trim()], f.type);
    });
  }

  private batchByFolder(): void {
    new FolderInputModal(this.app, (folder) => {
      const target = folder.trim();
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => {
          if (target) {
            if (f.path !== target && !f.path.startsWith(target + "/"))
              return false;
          }
          return isInScope(f, this.settings);
        });
      this.runBatch(files);
    }).open();
  }

  private async batchAllEnabled(): Promise<void> {
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => isInScope(f, this.settings));
    await this.runBatch(files);
  }

  private async runBatch(files: TFile[]): Promise<void> {
    if (files.length === 0) {
      new Notice("AI Tagger: 没有符合条件的文件");
      return;
    }
    new Notice(`AI Tagger: 开始批量处理 ${files.length} 个文件`);
    let ok = 0;
    let fail = 0;
    const pool = await this.getPredefinedTags();
    await this.runPool(files, async (file) => {
      try {
        const r = await this.runTag(file, "batch", pool);
        if (r) ok++;
        else fail++;
      } catch (e) {
        fail++;
        console.error("AI Tagger 批量处理失败:", file.path, e);
      }
    });
    new Notice(
      `AI Tagger: 批量完成（成功 ${ok} / 跳过或失败 ${fail}）`
    );
  }

  /** 简易并发池 */
  private async runPool(
    files: TFile[],
    task: (f: TFile) => Promise<void>
  ): Promise<void> {
    const conc = Math.max(1, this.settings.concurrency);
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < files.length) {
        const idx = i++;
        await task(files[idx]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(conc, files.length) }, worker)
    );
  }
}

/** 批量文件夹输入弹窗（替代 app.prompt，兼容更多 Obsidian 版本） */
class FolderInputModal extends Modal {
  private onSubmit: (value: string) => void;

  constructor(app: App, onSubmit: (value: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "批量处理文件夹" });
    contentEl.createEl("p", {
      text: "输入文件夹路径（相对库根，不含前置 /），留空表示全库。",
    });
    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "如 Articles/Read",
    });
    input.style.width = "100%";
    input.focus();

    const confirm = (): void => {
      this.close();
      this.onSubmit(input.value.trim());
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirm();
    });

    const btn = contentEl.createEl("button", { text: "开始处理" });
    btn.style.marginTop = "8px";
    btn.addEventListener("click", confirm);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 深合并默认值与用户数据（处理嵌套 ai / fields 数组） */
function deepMerge<T>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(override as object)) {
    const v = (override as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object") {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
