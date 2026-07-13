import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import AITaggerPlugin from "./main";
import { FieldMapping, FieldType, AIProvider } from "./types";
import { verifyConnection } from "./ai-client";

export class AITaggerSettingTab extends PluginSettingTab {
  plugin: AITaggerPlugin;

  constructor(app: App, plugin: AITaggerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "AI Auto Tagger 设置" });

    this.buildAISection(containerEl);
    this.buildFieldSection(containerEl);
    this.buildScopeSection(containerEl);
    this.buildBehaviorSection(containerEl);
  }

  private buildAISection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "一、AI 接口（多厂商 / OpenAI 兼容）" });
    const s = this.plugin.settings;
    const ai = s.ai;

    new Setting(containerEl)
      .setName("厂商 / 接口类型")
      .setDesc(
        "openai-compatible 兼容任意 OpenAI 协议端点（OpenAI / DeepSeek / 通义 / 智谱 / 豆包 / 本地 Ollama 等）；anthropic 为原生 Claude；google 为原生 Gemini。"
      )
      .addDropdown((d) => {
        const map: Record<AIProvider, string> = {
          "openai-compatible": "OpenAI 兼容（含 DeepSeek/通义/智谱/豆包/Ollama）",
          anthropic: "Anthropic（Claude）",
          google: "Google（Gemini）",
        };
        (Object.keys(map) as AIProvider[]).forEach((k) =>
          d.addOption(k, map[k])
        );
        d.setValue(ai.provider).onChange(async (v) => {
          ai.provider = v as AIProvider;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc(
        "openai-compatible 模式必填（如 https://api.openai.com/v1）；anthropic / google 模式可留空或用代理地址。"
      )
      .addText((t) =>
        t
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(ai.baseUrl)
          .onChange(async (v) => {
            ai.baseUrl = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("鉴权令牌，保存在本地 data.json 中。")
      .addText((t) =>
        t
          .setPlaceholder("sk-...")
          .setValue(ai.apiKey)
          .onChange(async (v) => {
            ai.apiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("模型名")
      .setDesc("如 gpt-4o-mini / deepseek-chat / claude-3-5-sonnet / gemini-1.5-flash 等。")
      .addText((t) =>
        t
          .setPlaceholder("gpt-4o-mini")
          .setValue(ai.model)
          .onChange(async (v) => {
            ai.model = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("温度")
      .setDesc("0 更确定，1 更发散。")
      .addSlider((t) =>
        t
          .setLimits(0, 1, 0.05)
          .setValue(ai.temperature)
          .setDynamicTooltip()
          .onChange(async (v) => {
            ai.temperature = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("最大输出 token")
      .addText((t) =>
        t
          .setPlaceholder("800")
          .setValue(String(ai.maxTokens))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            ai.maxTokens = isNaN(n) ? 800 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("请求超时（毫秒）")
      .addText((t) =>
        t
          .setPlaceholder("30000")
          .setValue(String(ai.requestTimeout))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            ai.requestTimeout = isNaN(n) ? 30000 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自定义 system 提示前缀")
      .setDesc("追加在字段说明之前的额外指令。")
          .addTextArea((t) =>
            t
              .setValue(this.plugin.settings.ai.extraInstruction)
              .onChange(async (v) => {
                this.plugin.settings.ai.extraInstruction = v;
                await this.plugin.saveSettings();
              })
          )
      .then((st) => {
        (st.components[0] as any).inputEl.rows = 3;
      });

    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("用当前 Base URL / Key / 模型发送一次最小请求，验证配置是否可用。")
      .addButton((b) =>
        b.setButtonText("测试连接").onClick(async () => {
          b.setDisabled(true);
          b.setButtonText("测试中…");
          const r = await verifyConnection(this.plugin.settings.ai);
          b.setDisabled(false);
          b.setButtonText("测试连接");
          if (r.ok) new Notice("AI Tagger: 连接成功 ✓");
          else new Notice("AI Tagger: 连接失败 ✗ " + r.error);
        })
      );
  }

  private buildFieldSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "二、提取字段（灵活字段映射）" });
    containerEl.createEl("p", {
      text: "AI 将按下列字段返回 JSON，并写入笔记 frontmatter。键名即 JSON 键名。",
    });

    const listEl = containerEl.createDiv();
    this.renderFieldList(listEl);

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("+ 添加字段")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.fields.push({
            enabled: true,
            name: "",
            type: "string",
            description: "",
          });
          await this.plugin.saveSettings();
          this.renderFieldList(listEl);
        })
    );
  }

  private renderFieldList(listEl: HTMLElement): void {
    listEl.empty();
    const fields = this.plugin.settings.fields;
    fields.forEach((field, idx) => {
      const row = listEl.createDiv({ cls: "ai-tagger-field-row" });

      new Setting(row)
        .setName("启用")
        .addToggle((t) =>
          t.setValue(field.enabled).onChange(async (v) => {
            field.enabled = v;
            await this.plugin.saveSettings();
          })
        );

      new Setting(row)
        .setName("字段名 (frontmatter 键)")
        .addText((t) =>
          t
            .setPlaceholder("tags")
            .setValue(field.name)
            .onChange(async (v) => {
              field.name = v.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(row)
        .setName("类型")
        .addDropdown((d) => {
          const types: FieldType[] = [
            "string",
            "array",
            "number",
            "boolean",
          ];
          types.forEach((tp) => d.addOption(tp, tp));
          d.setValue(field.type).onChange(async (v) => {
            field.type = v as FieldType;
            await this.plugin.saveSettings();
          });
        });

      new Setting(row)
        .setName("给 AI 的说明")
        .addTextArea((t) =>
          t.setValue(field.description).onChange(async (v) => {
            field.description = v;
            await this.plugin.saveSettings();
          })
        )
        .then((st) => {
          (st.components[0] as any).inputEl.rows = 2;
        });

      new Setting(row).addButton((b) =>
        b
          .setButtonText("删除")
          .setWarning()
          .onClick(async () => {
            fields.splice(idx, 1);
            await this.plugin.saveSettings();
            this.renderFieldList(listEl);
          })
      );
    });
  }

  private buildScopeSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "三、生效范围（文件夹）" });
    containerEl.createEl("p", {
      text: "相对库根的路径，不含前置斜杠。留空「生效文件夹」表示全库生效；排除优先于包含。",
    });

    this.renderStringList(
      containerEl,
      "生效文件夹",
      "如 Inbox / Articles/Read",
      this.plugin.settings.enabledFolders
    );
    this.renderStringList(
      containerEl,
      "排除文件夹",
      "如 Templates / _private",
      this.plugin.settings.excludedFolders
    );
  }

  private renderStringList(
    containerEl: HTMLElement,
    title: string,
    placeholder: string,
    arr: string[]
  ): void {
    const listEl = containerEl.createDiv();
    const rerender = () => this.renderStringListItems(listEl, arr, placeholder, rerender);
    rerender();

    new Setting(containerEl)
      .setName(title)
      .addText((t) => {
        t.setPlaceholder(placeholder);
        t.inputEl.addEventListener("keydown", async (ev) => {
          if (ev.key === "Enter") {
            const v = t.getValue().trim();
            if (v && !arr.includes(v)) {
              arr.push(v);
              await this.plugin.saveSettings();
              t.setValue("");
              rerender();
            }
          }
        });
      })
      .addButton((b) =>
        b.setButtonText("添加").onClick(async () => {
          const input = (b as any).buttonEl
            .closest(".setting-item")
            ?.querySelector("input") as HTMLInputElement | null;
          const v = input?.value.trim();
          if (v && !arr.includes(v)) {
            arr.push(v);
            await this.plugin.saveSettings();
            if (input) input.value = "";
            rerender();
          }
        })
      );
  }

  private renderStringListItems(
    listEl: HTMLElement,
    arr: string[],
    _placeholder: string,
    rerender: () => void
  ): void {
    listEl.empty();
    arr.forEach((item, idx) => {
      const row = listEl.createDiv({ cls: "ai-tagger-list-item" });
      row.createSpan({ text: item });
      const del = row.createEl("button", { text: "✕" });
      del.addEventListener("click", async () => {
        arr.splice(idx, 1);
        await this.plugin.saveSettings();
        rerender();
      });
    });
  }

  private buildBehaviorSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "四、触发与行为" });
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("新建文件自动打标")
      .setDesc("新建 .md 文件或网页剪藏生成文件时触发（防抖后）。")
      .addToggle((t) =>
        t.setValue(s.autoOnCreate).onChange(async (v) => {
          s.autoOnCreate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("内容新增自动打标")
      .setDesc("已有文件内容变化后触发（默认关闭，避免频繁调用）。")
      .addToggle((t) =>
        t.setValue(s.autoOnModify).onChange(async (v) => {
          s.autoOnModify = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("防抖时间（毫秒）")
      .addText((t) =>
        t
          .setPlaceholder("3000")
          .setValue(String(s.debounceMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.debounceMs = isNaN(n) ? 3000 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("覆盖已有字段")
      .setDesc("关闭时为「合并」：数组去重追加，标量仅当原值为空时写入。")
      .addToggle((t) =>
        t.setValue(s.overwrite).onChange(async (v) => {
          s.overwrite = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("已有标签则跳过")
      .setDesc("frontmatter 中已存在非空 tags 时整体跳过该文件。")
      .addToggle((t) =>
        t.setValue(s.skipIfHasTags).onChange(async (v) => {
          s.skipIfHasTags = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("送入 AI 的最大字符数")
      .addText((t) =>
        t
          .setPlaceholder("8000")
          .setValue(String(s.maxContentChars))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.maxContentChars = isNaN(n) ? 8000 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("批量并发数")
      .addText((t) =>
        t
          .setPlaceholder("3")
          .setValue(String(s.concurrency))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.concurrency = isNaN(n) || n < 1 ? 1 : n;
            await this.plugin.saveSettings();
          })
      );
  }
}
