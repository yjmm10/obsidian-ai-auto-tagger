import { App, Modal, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings } from "./types";
import { AITaggerSettingTab } from "./settings";
import { isInScope, tagFile } from "./tagger";

export default class AITaggerPlugin extends Plugin {
  settings: PluginSettings;
  private debounceTimers: Map<string, number> = new Map();
  /** 程序写回期间忽略 modify 事件，避免自触发循环 */
  private writingPaths: Set<string> = new Set();

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
        this.writingPaths.add(file.path);
        try {
          await tagFile(this.app, file, this.settings, true);
        } finally {
          this.writingPaths.delete(file.path);
        }
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
  }

  onunload(): void {
    this.debounceTimers.forEach((t) => window.clearTimeout(t));
    this.debounceTimers.clear();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginSettings> | null;
    const base = structuredClone(DEFAULT_SETTINGS);
    this.settings = deepMerge(base, data ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 防抖调度自动打标（用于 create / modify 触发） */
  private scheduleAuto(file: TFile): void {
    const prev = this.debounceTimers.get(file.path);
    if (prev) window.clearTimeout(prev);
    const timer = window.setTimeout(async () => {
      this.debounceTimers.delete(file.path);
      if (!isInScope(file, this.settings)) return;
      this.writingPaths.add(file.path);
      try {
        await tagFile(this.app, file, this.settings, false);
      } finally {
        this.writingPaths.delete(file.path);
      }
    }, this.settings.debounceMs);
    this.debounceTimers.set(file.path, timer);
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
    await this.runPool(files, async (file) => {
      this.writingPaths.add(file.path);
      try {
        const r = await tagFile(this.app, file, this.settings, false);
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
