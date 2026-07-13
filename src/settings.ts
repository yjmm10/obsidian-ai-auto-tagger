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

type TabId = "tag" | "ai";

export class AITaggerSettingTab extends PluginSettingTab {
  plugin: AITaggerPlugin;
  /** 当前激活的标签页；用实例字段记住，避免 display() 重渲染时丢失。 */
  private activeTab: TabId = "tag";

  constructor(app: App, plugin: AITaggerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ai-tagger-settings");

    // 吸顶头部容器：标题 + 标签导航 + 说明，滚动时固定不动
    const headerEl = containerEl.createDiv({ cls: "ai-tagger-header" });
    headerEl.createEl("h2", { text: "AI Auto Tagger" });

    // 顶部分段标签导航
    const tabs: { id: TabId; label: string; desc: string }[] = [
      {
        id: "tag",
        label: "🏷 AI 打标签",
        desc: "核心功能：定义提取字段、生效范围、触发与写入行为。",
      },
      {
        id: "ai",
        label: "⚙ AI 配置",
        desc: "选择厂商、模型、密钥与调用参数，并测试连接。",
      },
    ];

    const navEl = headerEl.createDiv({ cls: "ai-tagger-tab-nav" });
    tabs.forEach((tab) => {
      const btn = navEl.createEl("button", {
        text: tab.label,
        cls: "ai-tagger-tab-btn" + (this.activeTab === tab.id ? " is-active" : ""),
      });
      btn.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.display();
      });
    });

    const active = tabs.find((t) => t.id === this.activeTab)!;
    headerEl.createEl("p", {
      cls: "setting-item-description ai-tagger-tab-desc",
      text: active.desc,
    });

    const content = containerEl.createDiv({ cls: "ai-tagger-tab-content" });

    if (this.activeTab === "ai") {
      this.buildAISection(content);
    } else {
      this.buildFieldSection(content);
      this.buildScopeSection(content);
      this.buildBehaviorSection(content);
    }
  }

  /** 生成一个分区卡片，返回卡片容器（设置项挂在其下）。 */
  private card(
    parent: HTMLElement,
    title: string,
    sub?: string
  ): HTMLElement {
    const card = parent.createDiv({ cls: "ai-tagger-card" });
    const head = card.createDiv({ cls: "ai-tagger-card-head" });
    head.createEl("div", { cls: "ai-tagger-card-title", text: title });
    if (sub) head.createEl("div", { cls: "ai-tagger-card-sub", text: sub });
    return card;
  }

  // ============ AI 配置 ============
  private buildAISection(containerEl: HTMLElement): void {
    const card = this.card(
      containerEl,
      "AI 模型",
      "选择厂商、模型、API Key 与调用参数，然后测试连接。"
    );
    const ai = this.plugin.settings.ai;
    const info = PROVIDERS[ai.provider];

    // 厂商选择
    new Setting(card)
      .setName("厂商")
      .setDesc("选择 AI 服务商；OpenAI 兼容类厂商（含国内厂商与本地 Ollama）共用同一套接口。")
      .addDropdown((d) => {
        Object.values(PROVIDERS).forEach((p) => d.addOption(p.id, p.label));
        d.setValue(ai.provider).onChange(async (v) => {
          ai.provider = v as ProviderId;
          const next = PROVIDERS[ai.provider];
          ai.baseUrl = next.defaultBaseUrl ?? "";
          const first = modelsForProvider(ai.provider)[0];
          ai.model = first ? first.id : "";
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // 厂商说明 + 获取 Key 链接（提示框样式）
    const noteEl = card.createEl("p", {
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
    new Setting(card)
      .setName("API Key")
      .setDesc(
        info.requiresKey ? "鉴权令牌，仅保存在本地。" : "该厂商（本地模型）无需 Key。"
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
    new Setting(card)
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
    new Setting(card)
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
            } else {
              ai.model = v;
            }
            await this.plugin.saveSettings();
            this.display();
          }
        );
      });

    // 自定义模型名输入
    if (isCustom) {
      new Setting(card)
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
    new Setting(card)
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

    new Setting(card)
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

    new Setting(card)
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

    new Setting(card)
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

    new Setting(card)
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

    // 测试连接：整行 CTA
    const testBar = card.createDiv({ cls: "ai-tagger-testbar" });
    const btn = testBar.createEl("button", {
      text: "测试连接",
      cls: "ai-tagger-test-btn",
    });
    const status = testBar.createEl("span", {
      cls: "ai-tagger-test-status",
      text: "",
    });
    btn.addEventListener("click", async () => {
      btn.setAttribute("disabled", "");
      btn.textContent = "测试中…";
      status.textContent = "";
      status.className = "ai-tagger-test-status";
      const r = await verifyConnection(this.plugin.settings.ai);
      btn.removeAttribute("disabled");
      btn.textContent = "测试连接";
      if (r.ok) {
        status.textContent = "连接成功 ✓";
        status.className = "ai-tagger-test-status is-ok";
      } else {
        status.textContent = "连接失败 ✗\n" + r.error;
        status.className = "ai-tagger-test-status is-err";
        new Notice("AI Tagger：连接失败 ✗");
      }
    });
  }

  // ============ 提取字段 ============
  private buildFieldSection(containerEl: HTMLElement): void {
    const card = this.card(
      containerEl,
      "提取字段",
      "AI 将按下列字段返回 JSON 并写入笔记 frontmatter。键名即 JSON 键名（如 tags / summary / category）。"
    );

    const listEl = card.createDiv();
    this.renderFieldList(listEl);

    const addBtn = card.createEl("button", {
      text: "+ 添加字段",
      cls: "ai-tagger-add-btn",
    });
    addBtn.addEventListener("click", async () => {
      this.plugin.settings.fields.push({
        enabled: true,
        name: "",
        type: "string",
        description: "",
      });
      await this.plugin.saveSettings();
      this.renderFieldList(listEl);
    });
  }

  private renderFieldList(listEl: HTMLElement): void {
    listEl.empty();
    const fields = this.plugin.settings.fields;
    fields.forEach((field, idx) => {
      const card = listEl.createDiv({ cls: "ai-tagger-field-card" });

      // 卡片头：字段名 + 类型 + 删除
      const head = card.createDiv({ cls: "ai-tagger-field-head" });
      head.createEl("span", {
        cls: "ai-tagger-field-name",
        text: field.name ? field.name : "未命名字段",
      });
      head.createEl("span", { cls: "ai-tagger-field-type", text: field.type });
      const del = head.createEl("button", {
        text: "删除",
        cls: "ai-tagger-field-del",
      });
      del.addEventListener("click", async () => {
        fields.splice(idx, 1);
        await this.plugin.saveSettings();
        this.renderFieldList(listEl);
      });

      // 控件网格
      const grid = card.createDiv({ cls: "ai-tagger-field-grid" });

      new Setting(grid)
        .setName("启用")
        .setDesc("关闭则该字段不参与本次提取与写入。")
        .addToggle((t) =>
          t.setValue(field.enabled).onChange(async (v) => {
            field.enabled = v;
            await this.plugin.saveSettings();
          })
        );

      new Setting(grid)
        .setName("字段名")
        .setDesc("frontmatter 键名，亦为返回 JSON 的键名。")
        .addText((t) =>
          t
            .setPlaceholder("tags")
            .setValue(field.name)
            .onChange(async (v) => {
              field.name = v.trim();
              this.renderFieldList(listEl);
              await this.plugin.saveSettings();
            })
        );

      new Setting(grid)
        .setName("类型")
        .setDesc("决定写入 frontmatter 的值类型。")
        .addDropdown((d) => {
          const types: FieldType[] = ["string", "array", "number", "boolean"];
          types.forEach((tp) => d.addOption(tp, tp));
          d.setValue(field.type).onChange(async (v) => {
            field.type = v as FieldType;
            this.renderFieldList(listEl);
            await this.plugin.saveSettings();
          });
        });

      new Setting(grid)
        .setName("说明")
        .setDesc("描述该字段的含义与格式要求。")
        .addTextArea((t) =>
          t.setValue(field.description).onChange(async (v) => {
            field.description = v;
            await this.plugin.saveSettings();
          })
        )
        .setClass("ai-tagger-span2")
        .then((st) => {
          (st.components[0] as any).inputEl.rows = 2;
        });
    });
  }

  // ============ 生效范围 ============
  private buildScopeSection(containerEl: HTMLElement): void {
    const card = this.card(
      containerEl,
      "生效范围",
      "相对库根的路径，不含前置斜杠。留空「生效文件夹」表示全库生效；排除优先于包含。"
    );

    this.renderStringList(
      card,
      "生效文件夹",
      "如 Inbox / Articles/Read",
      this.plugin.settings.enabledFolders
    );
    this.renderStringList(
      card,
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
    new Setting(containerEl)
      .setName(title)
      .setDesc("输入时下方实时提示知识库中匹配的目录；方向键选择、回车或点击加入，也可手写任意路径。");

    const listEl = containerEl.createDiv({ cls: "ai-tagger-list" });
    const rerender = () => this.renderStringListItems(listEl, arr, rerender);
    rerender();

    // 输入行 + 联想下拉
    const row = containerEl.createDiv({ cls: "ai-tagger-add-row" });
    const inputWrap = row.createDiv({ cls: "ai-tagger-input-wrap" });
    const input = inputWrap.createEl("input", {
      type: "text",
      placeholder,
    });
    const suggest = inputWrap.createEl("div", {
      cls: "ai-tagger-suggest",
    });
    suggest.style.display = "none";

    /** 当前展示的联想项（用于键盘导航） */
    let suggestions: string[] = [];
    let activeIdx = -1;

    const setActive = (idx: number) => {
      const items = Array.from(suggest.children) as HTMLElement[];
      if (items.length === 0) return;
      activeIdx = (idx + items.length) % items.length;
      items.forEach((el, i) => el.toggleClass("is-active", i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: "nearest" });
    };

    const addPath = (path: string) => {
      const v = path.trim();
      if (v && !arr.includes(v)) {
        arr.push(v);
        void this.plugin.saveSettings();
      }
      input.value = "";
      suggestions = [];
      activeIdx = -1;
      suggest.style.display = "none";
      suggest.empty();
      rerender();
      input.focus();
    };

    const updateSuggest = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        suggestions = [];
        suggest.style.display = "none";
        suggest.empty();
        return;
      }
      const all = this.getVaultFolderPaths().filter(
        (p) =>
          p &&
          !arr.includes(p) &&
          (p.toLowerCase().includes(q) ||
            p.toLowerCase().replace(/\//g, "").includes(q))
      );
      if (all.length === 0) {
        suggestions = [];
        suggest.style.display = "none";
        suggest.empty();
        return;
      }
      suggestions = all.slice(0, 15);
      activeIdx = -1;
      suggest.empty();
      suggestions.forEach((path, i) => {
        const item = suggest.createDiv({ cls: "ai-tagger-suggest-item" });
        const span = item.createSpan({ text: path });
        // 高亮命中的子串（含斜杠折叠匹配）
        this.highlightMatch(span, path, input.value.trim());
        item.addEventListener("click", () => addPath(path));
        item.addEventListener("mouseenter", () => setActive(i));
      });
      suggest.style.display = "block";
    };

    input.addEventListener("input", updateSuggest);
    input.addEventListener("focus", updateSuggest);
    input.addEventListener("blur", () => {
      // 延迟关闭，确保点击建议项先触发
      window.setTimeout(() => {
        suggest.style.display = "none";
      }, 160);
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        if (suggest.style.display === "none") return;
        ev.preventDefault();
        setActive(activeIdx + 1);
        return;
      }
      if (ev.key === "ArrowUp") {
        if (suggest.style.display === "none") return;
        ev.preventDefault();
        setActive(activeIdx - 1);
        return;
      }
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (suggest.style.display !== "none" && suggestions.length > 0) {
          addPath(suggestions[activeIdx >= 0 ? activeIdx : 0]);
        } else {
          const v = input.value.trim();
          if (v) addPath(v);
        }
        return;
      }
      if (ev.key === "Escape") {
        suggest.style.display = "none";
      }
    });

    const addBtn = row.createEl("button", { text: "添加" });
    addBtn.addEventListener("click", () => {
      const v = input.value.trim();
      if (v) addPath(v);
    });
  }

  /** 读取知识库全部文件夹路径（排除根目录空串） */
  private getVaultFolderPaths(): string[] {
    return this.app.vault
      .getAllFolders()
      .map((f) => f.path)
      .filter((p) => p && p.length > 0);
  }

  /** 在容器内高亮与查询匹配的子串（含斜杠折叠） */
  private highlightMatch(span: HTMLElement, path: string, query: string): void {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const lower = path.toLowerCase();
    // 优先尝试原样匹配
    let start = lower.indexOf(q);
    let matched = q;
    if (start < 0) {
      // 斜杠折叠匹配：03/01 输入 0301
      const collapsed = lower.replace(/\//g, "");
      const cStart = collapsed.indexOf(q);
      if (cStart >= 0) {
        // 还原到真实 path 的偏移
        let real = 0;
        let seen = 0;
        while (real < path.length && seen < cStart) {
          if (path[real] !== "/") seen++;
          real++;
        }
        start = real;
        // 计算折叠匹配长度对应的真实长度
        let len = 0;
        let cnt = 0;
        while (start + len < path.length && cnt < q.length) {
          if (path[start + len] !== "/") cnt++;
          len++;
        }
        matched = path.substring(start, start + len);
      }
    }
    if (start < 0) return;
    const before = path.substring(0, start);
    const mid = matched;
    const after = path.substring(start + mid.length);
    span.textContent = "";
    if (before) span.createSpan({ text: before });
    span.createSpan({ text: mid, cls: "ai-tagger-mark" });
    if (after) span.createSpan({ text: after });
  }

  private renderStringListItems(
    listEl: HTMLElement,
    arr: string[],
    rerender: () => void
  ): void {
    listEl.empty();
    arr.forEach((item, idx) => {
      const chip = listEl.createDiv({ cls: "ai-tagger-chip" });
      chip.createSpan({ text: item });
      const del = chip.createEl("button", {
        text: "✕",
        cls: "ai-tagger-chip-del",
      });
      del.addEventListener("click", async () => {
        arr.splice(idx, 1);
        await this.plugin.saveSettings();
        rerender();
      });
    });
  }

  // ============ 触发与行为 ============
  private buildBehaviorSection(containerEl: HTMLElement): void {
    const card = this.card(
      containerEl,
      "触发与行为",
      "控制何时调用 AI、写入策略与性能参数。"
    );
    const s = this.plugin.settings;

    new Setting(card)
      .setName("新建文件自动打标")
      .setDesc("新建 .md 文件或网页剪藏生成文件时触发（防抖后）。")
      .addToggle((t) =>
        t.setValue(s.autoOnCreate).onChange(async (v) => {
          s.autoOnCreate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(card)
      .setName("内容新增自动打标")
      .setDesc("已有文件内容变化后触发（默认关闭，避免频繁调用产生费用）。")
      .addToggle((t) =>
        t.setValue(s.autoOnModify).onChange(async (v) => {
          s.autoOnModify = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(card)
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

    new Setting(card)
      .setName("覆盖已有字段")
      .setDesc("关闭时为「合并」：数组去重追加，标量仅当原值为空时写入。")
      .addToggle((t) =>
        t.setValue(s.overwrite).onChange(async (v) => {
          s.overwrite = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(card)
      .setName("已有标签则跳过")
      .setDesc("frontmatter 中已存在非空 tags 时整体跳过该文件。")
      .addToggle((t) =>
        t.setValue(s.skipIfHasTags).onChange(async (v) => {
          s.skipIfHasTags = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(card)
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

    new Setting(card)
      .setName("触发打标的最小正文字数")
      .setDesc(
        "正文不足该字数视为「内容不足」：新建空文件先挂起，待你写入达标后自动触发；不对此类文件发起 AI 调用，避免浪费。"
      )
      .addText((t) =>
        t
          .setPlaceholder("30")
          .setValue(String(s.minContentChars))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.minContentChars = isNaN(n) || n < 0 ? 0 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
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
