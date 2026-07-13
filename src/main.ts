import { App, Modal, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { AITaggerSettingTab } from "./settings";
import { collectPredefinedTags, isInScope, tagFile } from "./tagger";
import { splitFrontmatter } from "./frontmatter";
import { isContentSufficient } from "./text";

export default class AITaggerPlugin extends Plugin {
  settings: PluginSettings;
  private debounceTimers: Map<string, number> = new Map();
  /** 程序写回期间忽略 modify 事件，避免自触发循环 */
  private writingPaths: Set<string> = new Set();
  /** 内容不足而挂起、等待后续写入达标的文件（新建空文件场景） */
  private pendingCreate: Set<string> = new Set();
  /** 预定义标签池缓存（按 tagSource+tagFilePath 签名失效） */
  private predefinedCache: string[] | null = null;
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

    if (this.settings.autoOnModify) {
      this.registerEvent(
        this.app.vault.on("modify", (file) => {
          if (this.writingPaths.has(file.path)) return;
          if (file instanceof TFile && file.extension === "md") {
            this.scheduleAuto(file);
          }
        })
      );
    }

    // 待定文件监听：新建空文件内容不足时挂起，此处在内容写够后自动触发。
    // 该监听始终注册，与 autoOnModify 开关无关，保证「先建空文件、后补内容」也能自动打标。
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.writingPaths.has(file.path)) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.pendingCreate.has(file.path)) {
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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 取预定义标签池（带签名缓存：tagSource/tagFilePath 变化或库结构变动时自动失效）。 */
  async getPredefinedTags(): Promise<string[]> {
    const sig = `${this.settings.tagSource}|${this.settings.tagFilePath}`;
    if (this.predefinedCache && this.poolSig === sig) return this.predefinedCache;
    const pool = await collectPredefinedTags(this.app, this.settings);
    this.predefinedCache = pool;
    this.poolSig = sig;
    return pool;
  }

  /** 库结构变动（新建/删除笔记）时清空预定义池缓存，下次按需重算。 */
  private invalidatePredefined(): void {
    this.predefinedCache = null;
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
   * 执行单次打标，带「内容达标」门控。
   * @param mode
   *  - "auto"：自动触发。内容不足 → 挂起等待后续写入（不调用 AI）。
   *  - "manual"：手动命令。内容不足 → 提示并跳过。
   *  - "batch"：批量。内容不足 → 静默跳过。
   */
  private async runTag(
    file: TFile,
    mode: "auto" | "manual" | "batch",
    predefinedTags?: string[]
  ): Promise<boolean> {
    if (!isInScope(file, this.settings)) {
      if (mode === "manual")
        new Notice(`AI Tagger: ${file.path} 不在生效范围内`);
      return false;
    }

    const raw = await this.app.vault.read(file);
    if (!isContentSufficient(raw, this.settings.minContentChars)) {
      if (mode === "auto") {
        // 内容不足：挂起，等后续 modify 写够再触发（不浪费 AI 调用）
        this.pendingCreate.add(file.path);
      } else if (mode === "manual") {
        const len = (splitFrontmatter(raw).body.trim().length);
        new Notice(
          `AI Tagger: 内容过少（${len} 字），未达 ${this.settings.minContentChars} 字阈值，已跳过`
        );
      }
      // batch 模式静默跳过
      return false;
    }

    this.pendingCreate.delete(file.path);
    this.writingPaths.add(file.path);
    try {
      const pool =
        predefinedTags ?? (await this.getPredefinedTags());
      return await tagFile(this.app, file, this.settings, mode !== "auto", pool);
    } finally {
      this.writingPaths.delete(file.path);
    }
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
      this.writingPaths.add(file.path);
      try {
        const r = await this.runTag(file, "batch", pool);
        if (r) ok++;
        else fail++;
      } catch (e) {
        fail++;
        console.error("AI Tagger 批量处理失败:", file.path, e);
      } finally {
        this.writingPaths.delete(file.path);
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
