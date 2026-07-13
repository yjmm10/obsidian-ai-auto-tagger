import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import AITaggerPlugin from "./main";
import { FieldMapping, FieldType } from "./types";
import {
  PROVIDERS,
  modelsForProvider,
  CUSTOM_MODEL_ID,
  ProviderId,
} from "./models";
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
    containerEl.addClass("ai-tagger-settings");

    containerEl.createEl("h2", { text: "AI Auto Tagger 设置" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "用 AI 为笔记自动生成标签与自定义字段，写入 frontmatter。支持多厂商、多文件夹、创建/剪藏/手动触发。",
    });

    this.buildAISection(containerEl);
    this.buildFieldSection(containerEl);
    this.buildScopeSection(containerEl);
    this.buildBehaviorSection(containerEl);
  }

  // ============ 一、AI 模型 ============
  private buildAISection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "一、AI 模型" });
    const ai = this.plugin.settings.ai;
    const info = PROVIDERS[ai.provider];

    // 厂商选择
    new Setting(containerEl)
      .setName("厂商")
      .setDesc("选择 AI 服务商；OpenAI 兼容类厂商（含国内厂商与本地 Ollama）共用同一套接口。")
      .addDropdown((d) => {
        Object.values(PROVIDERS).forEach((p) =>
          d.addOption(p.id, p.label)
        );
        d.setValue(ai.provider).onChange(async (v) => {
          ai.provider = v as ProviderId;
          // 切换厂商时自动填充默认 Base URL 与该厂商首个模型
          const next = PROVIDERS[ai.provider];
          ai.baseUrl = next.defaultBaseUrl ?? "";
          const first = modelsForProvider(ai.provider)[0];
          ai.model = first ? first.id : "";
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // 厂商说明 + 获取 Key 链接
    const noteEl = containerEl.createEl("p", {
      cls: "setting-item-description ai-tagger-provider-note",
      text: info.note,
    });
    if (info.apiKeyUrl) {
      noteEl.createEl("br");
      const link = noteEl.createEl("a", {
        text: "获取 API Key ↗",
        href: info.apiKeyUrl,
      });
      link.setAttr("target", "_blank");
    }

    // API Key
    new Setting(containerEl)
      .setName("API Key")
      .setDesc(
        info.requiresKey
          ? "鉴权令牌，仅保存在本地。"
          : "该厂商（本地模型）无需 Key。"
      )
      .addText((t) => {
        t.setPlaceholder(info.requiresKey ? "sk-... / 你的密钥" : "（本地模型无需）")
          .setValue(ai.apiKey)
          .onChange(async (v) => {
            ai.apiKey = v.trim();
            await this.plugin.saveSettings();
          });
        t.inputEl.type = "password";
      })
      .setDisabled(!info.requiresKey);

    // Base URL
    new Setting(containerEl)
      .setName("Base URL")
      .setDesc(
        info.sdk === "openai-compatible"
          ? "OpenAI 兼容接口地址；已自动填入厂商默认，可改（如 coding 套餐需改路径）。"
          : "anthropic / google 一般留空走官方；如需代理可填。"
      )
      .addText((t) =>
        t
          .setPlaceholder(info.defaultBaseUrl ?? "（留空走官方）")
          .setValue(ai.baseUrl)
          .onChange(async (v) => {
            ai.baseUrl = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // 模型选择（内置 + 自定义）
    const builtin = modelsForProvider(ai.provider);
    const isCustom = !builtin.some((m) => m.id === ai.model);
    new Setting(containerEl)
      .setName("模型")
      .setDesc("从内置清单选择，或选「自定义模型…」手动输入（如你的私有/微调模型）。")
      .addDropdown((d) => {
        builtin.forEach((m) =>
          d.addOption(m.id, m.label + (m.description ? `（${m.description}）` : ""))
        );
        d.addOption(CUSTOM_MODEL_ID, "自定义模型…");
        d.setValue(isCustom ? CUSTOM_MODEL_ID : ai.model).onChange(
          async (v) => {
            if (v === CUSTOM_MODEL_ID) {
              ai.model = "";
              await this.plugin.saveSettings();
              this.display();
            } else {
              ai.model = v;
              await this.plugin.saveSettings();
              this.display();
            }
          }
        );
      });

    // 自定义模型名输入
    if (isCustom) {
      new Setting(containerEl)
        .setName("自定义模型名")
        .setDesc("填写传给 API 的模型标识，例如 glm-5.2、my-finetune-01。")
        .addText((t) =>
          t
            .setPlaceholder("glm-5.2")
            .setValue(ai.model)
            .onChange(async (v) => {
              ai.model = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    // 参数
    containerEl.createEl("h4", { text: "参数" });
    new Setting(containerEl)
      .setName("温度 (temperature)")
      .setDesc("0 更确定，1 更发散。标注任务建议 0.2–0.4。")
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
      .setName("核采样 (top_p)")
      .setDesc("0–1，与温度配合控制多样性；一般 0.9–1。")
      .addSlider((t) =>
        t
          .setLimits(0, 1, 0.05)
          .setValue(ai.topP)
          .setDynamicTooltip()
          .onChange(async (v) => {
            ai.topP = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("最大输出 token")
      .setDesc("单次返回上限，影响可写字段数量与长度。")
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
      .setDesc("超时未响应则放弃，避免卡死。")
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
      .setDesc("追加在字段说明前的额外指令，用于约束输出风格/语言等。")
      .addTextArea((t) =>
        t.setValue(ai.extraInstruction).onChange(async (v) => {
          ai.extraInstruction = v;
          await this.plugin.saveSettings();
        })
      )
      .then((st) => {
        (st.components[0] as any).inputEl.rows = 3;
      });

    // 测试连接（醒目 CTA）
    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("用当前配置发送一次最小请求，验证 Base URL / Key / 模型是否可用。")
      .addButton((b) =>
        b
          .setButtonText("测试连接")
          .setCta()
          .onClick(async () => {
            b.setDisabled(true);
            b.setButtonText("测试中…");
            const r = await verifyConnection(this.plugin.settings.ai);
            b.setDisabled(false);
            b.setButtonText("测试连接");
            if (r.ok) new Notice("AI Tagger：连接成功 ✓");
            else new Notice("AI Tagger：连接失败 ✗\n" + r.error);
          })
      );
  }

  // ============ 二、提取字段 ============
  private buildFieldSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "二、提取字段（灵活字段映射）" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "AI 将按下列字段返回 JSON，并写入笔记 frontmatter。键名即 JSON 键名（如 tags / summary / category）。",
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
        .setDesc("关闭则该字段不参与本次提取与写入。")
        .addToggle((t) =>
          t.setValue(field.enabled).onChange(async (v) => {
            field.enabled = v;
            await this.plugin.saveSettings();
          })
        );

      new Setting(row)
        .setName("字段名")
        .setDesc("frontmatter 键名，亦为返回 JSON 的键名。")
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
        .setDesc("决定写入 frontmatter 的值类型。")
        .addDropdown((d) => {
          const types: FieldType[] = ["string", "array", "number", "boolean"];
          types.forEach((tp) => d.addOption(tp, tp));
          d.setValue(field.type).onChange(async (v) => {
            field.type = v as FieldType;
            await this.plugin.saveSettings();
          });
        });

      new Setting(row)
        .setName("给 AI 的说明")
        .setDesc("描述该字段的含义与格式要求。")
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

  // ============ 三、生效范围 ============
  private buildScopeSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "三、生效范围（文件夹）" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
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
    const rerender = () =>
      this.renderStringListItems(listEl, arr, placeholder, rerender);
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

  // ============ 四、触发与行为 ============
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
      .setDesc("已有文件内容变化后触发（默认关闭，避免频繁调用产生费用）。")
      .addToggle((t) =>
        t.setValue(s.autoOnModify).onChange(async (v) => {
          s.autoOnModify = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("防抖时间（毫秒）")
      .setDesc("停止输入/写入后等待多久再调用 AI。")
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
      .setDesc("截断正文以控制 token 消耗与费用。")
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
      .setDesc("批量处理时的最大并发请求数。")
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
