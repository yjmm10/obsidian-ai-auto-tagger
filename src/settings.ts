import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import AITaggerPlugin from "./main";
import { FieldMapping, FieldType, DEFAULT_SETTINGS, PluginSettings } from "./types";
import {
  PROVIDERS,
  modelsForProvider,
  CUSTOM_MODEL_ID,
  ProviderId,
} from "./models";
import { verifyConnection } from "./ai-client";
import { t, Locale } from "./i18n";
import { QR_CODE_BASE64 } from "./assets";

type TabId = "tag" | "ai" | "about";

export class AITaggerSettingTab extends PluginSettingTab {
  plugin: AITaggerPlugin;
  /** 当前激活的标签页；用实例字段记住，避免 display() 重渲染时丢失。 */
  private activeTab: TabId = "tag";
  /** 折叠的字段（按对象引用记录，避免索引漂移导致错乱） */
  private collapsedFields = new Set<FieldMapping>();

  constructor(app: App, plugin: AITaggerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** 当前语言 */
  private get locale(): Locale {
    return this.plugin.settings.locale;
  }
  /** 翻译快捷方法 */
  private tr(key: string, vars?: Record<string, string | number>): string {
    return t(this.locale, key, vars);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ai-tagger-settings");

    // 吸顶头部容器：标题 + 语言切换 + 标签导航 + 说明
    const headerEl = containerEl.createDiv({ cls: "ai-tagger-header" });

    // 顶部行：标题（左） + 语言切换（右）
    const topRow = headerEl.createDiv({ cls: "ai-tagger-header-top" });
    topRow.createEl("h2", { text: "AI Auto Tagger" });
    this.buildLangSwitch(topRow);

    // 顶部分段标签导航
    const tabs: { id: TabId; labelKey: string; descKey: string }[] = [
      { id: "tag", labelKey: "tabTagLabel", descKey: "tabTagDesc" },
      { id: "ai", labelKey: "tabAiLabel", descKey: "tabAiDesc" },
      { id: "about", labelKey: "tabAboutLabel", descKey: "tabAboutDesc" },
    ];

    const navEl = headerEl.createDiv({ cls: "ai-tagger-tab-nav" });
    tabs.forEach((tab) => {
      const btn = navEl.createEl("button", {
        text: this.tr(tab.labelKey),
        cls: "ai-tagger-tab-btn" + (this.activeTab === tab.id ? " is-active" : ""),
      });
      btn.addEventListener("click", () => {
        if (this.activeTab === tab.id) return;
        this.activeTab = tab.id;
        this.display();
      });
    });

    const active = tabs.find((t2) => t2.id === this.activeTab)!;
    headerEl.createEl("p", {
      cls: "setting-item-description ai-tagger-tab-desc",
      text: this.tr(active.descKey),
    });

    const content = containerEl.createDiv({ cls: "ai-tagger-tab-content" });

    if (this.activeTab === "ai") {
      this.buildAISection(content);
    } else if (this.activeTab === "about") {
      this.buildAboutSection(content);
    } else {
      this.buildFieldSection(content);
      this.buildScopeSection(content);
      this.buildPredefinedSection(content);
      this.buildBehaviorSection(content);
      this.buildResetSection(content);
    }
  }

  /** 头部右上角的语言切换（中 / EN） */
  private buildLangSwitch(parent: HTMLElement): void {
    const wrap = parent.createDiv({ cls: "ai-tagger-lang" });
    (["zh", "en"] as Locale[]).forEach((lc) => {
      const btn = wrap.createEl("button", {
        text: lc === "zh" ? "中" : "EN",
        cls:
          "ai-tagger-lang-btn" +
          (this.plugin.settings.locale === lc ? " is-active" : ""),
        title: this.tr("langName"),
      });
      btn.addEventListener("click", async () => {
        if (this.plugin.settings.locale === lc) return;
        this.plugin.settings.locale = lc;
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }

  /** 生成一个分区卡片，返回卡片容器（设置项挂在其下）。 */
  private card(
    parent: HTMLElement,
    titleKey: string,
    subKey?: string,
    actions?: (container: HTMLElement) => void
  ): HTMLElement {
    const card = parent.createDiv({ cls: "ai-tagger-card" });
    const head = card.createDiv({ cls: "ai-tagger-card-head" });
    const text = head.createDiv({ cls: "ai-tagger-card-head-text" });
    text.createEl("div", { cls: "ai-tagger-card-title", text: this.tr(titleKey) });
    if (subKey) text.createEl("div", { cls: "ai-tagger-card-sub", text: this.tr(subKey) });
    if (actions) {
      const actionsEl = head.createDiv({ cls: "ai-tagger-card-actions" });
      actions(actionsEl);
    }
    return card;
  }

  // ============ AI 配置 ============
  private buildAISection(containerEl: HTMLElement): void {
    const card = this.card(containerEl, "aiCardTitle", "aiCardSub");
    const ai = this.plugin.settings.ai;
    const info = PROVIDERS[ai.provider];
    const note = this.locale === "en" ? info.noteEn : info.note;

    // 厂商选择
    new Setting(card)
      .setName(this.tr("providerName"))
      .setDesc(this.tr("providerDesc"))
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
      text: note,
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
      .setName(this.tr("apiKeyName"))
      .setDesc(
        info.requiresKey ? this.tr("apiKeyDescReq") : this.tr("apiKeyDescNoKey")
      )
      .addText((t2) => {
        t2
          .setPlaceholder(
            info.requiresKey ? this.tr("apiKeyPhReq") : this.tr("apiKeyPhNoKey")
          )
          .setValue(ai.apiKey)
          .onChange(async (v) => {
            ai.apiKey = v.trim();
            await this.plugin.saveSettings();
          });
        t2.inputEl.type = "password";
      })
      .setDisabled(!info.requiresKey);

    // Base URL
    new Setting(card)
      .setName(this.tr("baseUrlName"))
      .setDesc(
        info.sdk === "openai-compatible"
          ? this.tr("baseUrlDescOpenai")
          : this.tr("baseUrlDescOther")
      )
      .addText((t2) =>
        t2
          .setPlaceholder(this.tr("baseUrlPh"))
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
      .setName(this.tr("modelName"))
      .setDesc(this.tr("modelDesc"))
      .addDropdown((d) => {
        builtin.forEach((m) =>
          d.addOption(m.id, m.label + (m.description ? `（${m.description}）` : ""))
        );
        d.addOption(CUSTOM_MODEL_ID, this.tr("customModelLabel"));
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
        .setName(this.tr("customModelName"))
        .setDesc(this.tr("customModelDesc"))
        .addText((t2) =>
          t2
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
      .setName(this.tr("tempName"))
      .setDesc(this.tr("tempDesc"))
      .addSlider((t2) =>
        t2
          .setLimits(0, 1, 0.05)
          .setValue(ai.temperature)
          .setDynamicTooltip()
          .onChange(async (v) => {
            ai.temperature = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("topPName"))
      .setDesc(this.tr("topPDesc"))
      .addSlider((t2) =>
        t2
          .setLimits(0, 1, 0.05)
          .setValue(ai.topP)
          .setDynamicTooltip()
          .onChange(async (v) => {
            ai.topP = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("maxTokensName"))
      .setDesc(this.tr("maxTokensDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("100")
          .setValue(String(ai.maxTokens))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            ai.maxTokens = isNaN(n) ? 100 : n;
            await this.plugin.saveSettings();
          })
      );

    card.createEl("p", {
      cls: "setting-item-description ai-tagger-info-note",
      text: this.tr("maxTokensNote"),
    });

    new Setting(card)
      .setName(this.tr("timeoutName"))
      .setDesc(this.tr("timeoutDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("30000")
          .setValue(String(ai.requestTimeout))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            ai.requestTimeout = isNaN(n) ? 30000 : n;
            await this.plugin.saveSettings();
          })
      );

    // 重置参数（仅重置可调节项：温度 / top_p / 最大输出 / 超时；不动厂商、Key、模型）
    const paramResetRow = card.createDiv({ cls: "ai-tagger-row-end" });
    const resetParamsBtn = paramResetRow.createEl("button", {
      text: this.tr("resetParams"),
      cls: "ai-tagger-ghost-btn",
    });
    resetParamsBtn.addEventListener("click", async () => {
      const d = DEFAULT_SETTINGS.ai;
      ai.temperature = d.temperature;
      ai.topP = d.topP;
      ai.maxTokens = d.maxTokens;
      ai.requestTimeout = d.requestTimeout;
      await this.plugin.saveSettings();
      this.display();
      new Notice(this.tr("resetParamsNotice"));
    });

    new Setting(card)
      .setName(this.tr("sysPromptName"))
      .setDesc(this.tr("sysPromptDesc"))
      .addTextArea((t2) =>
        t2.setValue(ai.systemPrompt).onChange(async (v) => {
          ai.systemPrompt = v;
          await this.plugin.saveSettings();
        })
      )
      .then((st) => {
        (st.components[0] as any).inputEl.rows = 4;
      });

    // 重置系统提示词
    const sysResetRow = card.createDiv({ cls: "ai-tagger-row-end" });
    const resetSysBtn = sysResetRow.createEl("button", {
      text: this.tr("sysPromptReset"),
      cls: "ai-tagger-ghost-btn",
    });
    resetSysBtn.addEventListener("click", async () => {
      ai.systemPrompt = DEFAULT_SETTINGS.ai.systemPrompt;
      await this.plugin.saveSettings();
      this.display();
      new Notice(this.tr("sysPromptResetNotice"));
    });

    // 测试连接：整行 CTA
    const testBar = card.createDiv({ cls: "ai-tagger-testbar" });
    const btn = testBar.createEl("button", {
      text: this.tr("testConn"),
      cls: "ai-tagger-test-btn",
    });
    const status = testBar.createEl("span", {
      cls: "ai-tagger-test-status",
      text: "",
    });
    btn.addEventListener("click", async () => {
      btn.setAttribute("disabled", "");
      btn.textContent = this.tr("testing");
      status.textContent = "";
      status.className = "ai-tagger-test-status";
      const r = await verifyConnection(this.plugin.settings.ai);
      btn.removeAttribute("disabled");
      btn.textContent = this.tr("testConn");
      if (r.ok) {
        status.textContent = this.tr("testOk");
        status.className = "ai-tagger-test-status is-ok";
      } else {
        status.textContent = this.tr("testFail") + "\n" + r.error;
        status.className = "ai-tagger-test-status is-err";
        new Notice(this.tr("testFailNotice"));
      }
    });
  }

  // ============ 提取字段 ============
  private buildFieldSection(containerEl: HTMLElement): void {
    const card = this.card(
      containerEl,
      "fieldCardTitle",
      "fieldCardSub",
      (actions) => {
        const master = actions.createEl("label", {
          cls: "ai-tagger-master-toggle",
        });
        const masterCheck = master.createEl("input", { type: "checkbox" });
        masterCheck.checked = this.plugin.settings.fields.some(
          (f) => f.enabled
        );
        master.appendText(" " + this.tr("fieldMasterName"));
        masterCheck.addEventListener("change", async () => {
          const target = masterCheck.checked;
          this.plugin.settings.fields.forEach((f) => (f.enabled = target));
          await this.plugin.saveSettings();
          this.display();
        });
      }
    );

    const listEl = card.createDiv({ cls: "ai-tagger-field-list" });
    this.renderFieldList(listEl);

    const addBtn = card.createEl("button", {
      text: this.tr("addField"),
      cls: "ai-tagger-add-btn",
    });
    addBtn.addEventListener("click", async () => {
      this.plugin.settings.fields.push({
        enabled: true,
        name: "",
        type: "string",
        description: "",
        constraints: "",
        mode: "generate",
      });
      await this.plugin.saveSettings();
      this.renderFieldList(listEl);
    });
  }

  private renderFieldList(listEl: HTMLElement): void {
    listEl.empty();
    const fields = this.plugin.settings.fields;

    const modeLabel = (mode: FieldMapping["mode"]) => {
      const key =
        mode === "generate"
          ? "fModeGenerate"
          : mode === "predefined"
          ? "fModePredefined"
          : "fModeHybrid";
      return this.tr(key);
    };

    if (fields.length === 0) {
      listEl.createEl("p", {
        cls: "setting-item-description",
        text: this.tr("noFields"),
      });
      return;
    }

    fields.forEach((field, idx) => {
      const collapsed = this.collapsedFields.has(field);
      const card = listEl.createDiv({
        cls:
          "ai-tagger-field-card" + (field.enabled ? "" : " is-disabled"),
      });

      // 卡片头：折叠箭头 + 字段元信息 + 启用开关 + 删除
      const head = card.createDiv({ cls: "ai-tagger-field-head" });
      const toggle = head.createEl("button", {
        cls: "ai-tagger-field-toggle",
        text: collapsed ? "▸" : "▾",
        title: this.tr(collapsed ? "expand" : "collapse"),
      });
      const meta = head.createDiv({ cls: "ai-tagger-field-meta" });
      meta.createEl("span", {
        cls: "ai-tagger-field-name",
        text: field.name ? field.name : this.tr("unnamed"),
      });
      meta.createEl("span", {
        cls: "ai-tagger-field-type",
        text: field.type,
      });
      if (field.mode !== "generate") {
        meta.createEl("span", {
          cls: "ai-tagger-field-mode",
          text: modeLabel(field.mode),
        });
      }

      const enableWrap = head.createEl("label", {
        cls: "ai-tagger-field-enable",
        title: this.tr("fEnabledDesc"),
      });
      const enableCheck = enableWrap.createEl("input", { type: "checkbox" });
      enableCheck.checked = field.enabled;

      const del = head.createEl("button", {
        text: "🗑",
        cls: "ai-tagger-field-del",
        title: this.tr("fDelete"),
      });

      // 控件网格（折叠时隐藏）
      const grid = card.createDiv({ cls: "ai-tagger-field-grid" });
      if (collapsed) grid.style.display = "none";

      const setCollapsed = (val: boolean) => {
        if (val) {
          this.collapsedFields.add(field);
          grid.style.display = "none";
          toggle.textContent = "▸";
          toggle.title = this.tr("expand");
        } else {
          this.collapsedFields.delete(field);
          grid.style.display = "";
          toggle.textContent = "▾";
          toggle.title = this.tr("collapse");
        }
      };

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        setCollapsed(!this.collapsedFields.has(field));
      });
      head.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (
          target === head ||
          target === meta ||
          target.classList.contains("ai-tagger-field-name")
        ) {
          setCollapsed(!this.collapsedFields.has(field));
        }
      });
      enableCheck.addEventListener("change", async () => {
        field.enabled = enableCheck.checked;
        card.toggleClass("is-disabled", !field.enabled);
        await this.plugin.saveSettings();
      });
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        fields.splice(idx, 1);
        this.collapsedFields.delete(field);
        await this.plugin.saveSettings();
        this.renderFieldList(listEl);
      });

      new Setting(grid)
        .setName(this.tr("fNameName"))
        .setDesc(this.tr("fNameDesc"))
        .addText((t2) =>
          t2
            .setPlaceholder("tags")
            .setValue(field.name)
            .onChange(async (v) => {
              field.name = v.trim();
              const nameSpan = head.querySelector(
                ".ai-tagger-field-name"
              ) as HTMLElement | null;
              if (nameSpan)
                nameSpan.textContent = field.name
                  ? field.name
                  : this.tr("unnamed");
              await this.plugin.saveSettings();
            })
        );

      new Setting(grid)
        .setName(this.tr("fTypeName"))
        .setDesc(this.tr("fTypeDesc"))
        .addDropdown((d) => {
          const types: FieldType[] = ["string", "array", "number", "boolean"];
          types.forEach((tp) => d.addOption(tp, tp));
          d.setValue(field.type).onChange(async (v) => {
            field.type = v as FieldType;
            const typeSpan = head.querySelector(
              ".ai-tagger-field-type"
            ) as HTMLElement | null;
            if (typeSpan) typeSpan.textContent = field.type;
            await this.plugin.saveSettings();
          });
        });

      new Setting(grid)
        .setName(this.tr("fModeName"))
        .setDesc(this.tr("fModeDesc"))
        .addDropdown((d) => {
          d.addOption("generate", this.tr("fModeGenerate"));
          d.addOption("predefined", this.tr("fModePredefined"));
          d.addOption("hybrid", this.tr("fModeHybrid"));
          d.setValue(field.mode).onChange(async (v) => {
            field.mode = v as FieldMapping["mode"];
            const modeSpan = head.querySelector(
              ".ai-tagger-field-mode"
            ) as HTMLElement | null;
            if (modeSpan) {
              modeSpan.textContent =
                field.mode === "generate" ? "" : modeLabel(field.mode);
              modeSpan.style.display =
                field.mode === "generate" ? "none" : "";
            }
            await this.plugin.saveSettings();
          });
        });

      new Setting(grid)
        .setName(this.tr("fDescName"))
        .setDesc(this.tr("fDescDesc"))
        .addTextArea((t2) =>
          t2.setValue(field.description).onChange(async (v) => {
            field.description = v;
            await this.plugin.saveSettings();
          })
        )
        .setClass("ai-tagger-span2")
        .then((st) => {
          (st.components[0] as any).inputEl.rows = 2;
        });

      new Setting(grid)
        .setName(this.tr("fConstraintsName"))
        .setDesc(this.tr("fConstraintsDesc"))
        .addTextArea((t2) =>
          t2.setValue(field.constraints).onChange(async (v) => {
            field.constraints = v;
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
    const card = this.card(containerEl, "scopeCardTitle", "scopeCardSub");

    this.renderStringList(
      card,
      "enabledFoldersName",
      "enabledFoldersDesc",
      "enabledFoldersPh",
      this.plugin.settings.enabledFolders
    );
    this.renderStringList(
      card,
      "excludedFoldersName",
      "excludedFoldersDesc",
      "excludedFoldersPh",
      this.plugin.settings.excludedFolders
    );

    const s = this.plugin.settings;
    new Setting(card)
      .setName(this.tr("recursiveName"))
      .setDesc(this.tr("recursiveDesc"))
      .addToggle((t2) =>
        t2.setValue(s.recursiveScope).onChange(async (v) => {
          s.recursiveScope = v;
          await this.plugin.saveSettings();
        })
      );
  }

  // ============ 预定义标签池 ============
  private buildPredefinedSection(containerEl: HTMLElement): void {
    const card = this.card(containerEl, "predCardTitle", "predCardSub");
    const s = this.plugin.settings;

    new Setting(card)
      .setName(this.tr("tagSourceName"))
      .setDesc(this.tr("tagSourceDesc"))
      .addDropdown((d) => {
        d.addOption("file", this.tr("tagSourceFile"));
        d.addOption("vault", this.tr("tagSourceVault"));
        d.addOption("both", this.tr("tagSourceBoth"));
        d.setValue(s.tagSource).onChange(async (v) => {
          s.tagSource = v as PluginSettings["tagSource"];
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (s.tagSource === "file" || s.tagSource === "both") {
      new Setting(card)
        .setName(this.tr("tagFilePathName"))
        .setDesc(this.tr("tagFilePathDesc"))
        .addText((t2) =>
          t2
            .setPlaceholder("tags.md")
            .setValue(s.tagFilePath)
            .onChange(async (v) => {
              s.tagFilePath = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }
  }

  private renderStringList(
    containerEl: HTMLElement,
    nameKey: string,
    descKey: string,
    phKey: string,
    arr: string[]
  ): void {
    new Setting(containerEl)
      .setName(this.tr(nameKey))
      .setDesc(this.tr(descKey));

    const listEl = containerEl.createDiv({ cls: "ai-tagger-list" });
    const rerender = () => this.renderStringListItems(listEl, arr, rerender);
    rerender();

    // 输入行 + 联想下拉
    const row = containerEl.createDiv({ cls: "ai-tagger-add-row" });
    const inputWrap = row.createDiv({ cls: "ai-tagger-input-wrap" });
    const input = inputWrap.createEl("input", {
      type: "text",
      placeholder: this.tr(phKey),
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

    const addBtn = row.createEl("button", { text: this.tr("addBtn") });
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
    const card = this.card(containerEl, "behaviorCardTitle", "behaviorCardSub");
    const s = this.plugin.settings;

    new Setting(card)
      .setName(this.tr("autoCreateName"))
      .setDesc(this.tr("autoCreateDesc"))
      .addToggle((t2) =>
        t2.setValue(s.autoOnCreate).onChange(async (v) => {
          s.autoOnCreate = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(card)
      .setName(this.tr("autoModifyName"))
      .setDesc(this.tr("autoModifyDesc"))
      .addToggle((t2) =>
        t2.setValue(s.autoOnModify).onChange(async (v) => {
          s.autoOnModify = v;
          await this.plugin.saveSettings();
        })
      );

    // 触发说明提示框（剪藏/新建/保存/更新/手动 的对应关系 + 300 字门控）
    card.createEl("p", {
      cls: "ai-tagger-info-note",
      text: this.tr("triggerNote", { min: s.minContentChars }),
    });

    new Setting(card)
      .setName(this.tr("debounceName"))
      .setDesc(this.tr("debounceDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("3000")
          .setValue(String(s.debounceMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.debounceMs = isNaN(n) ? 3000 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("tagPolicyName"))
      .setDesc(this.tr("tagPolicyDesc"))
      .addDropdown((dd) =>
        dd
          .addOption("skip", this.tr("tagPolicySkip"))
          .addOption("merge", this.tr("tagPolicyMerge"))
          .addOption("overwrite", this.tr("tagPolicyOverwrite"))
          .setValue(s.tagPolicy)
          .onChange(async (v) => {
            s.tagPolicy = v as PluginSettings["tagPolicy"];
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("maxContentName"))
      .setDesc(this.tr("maxContentDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("1000")
          .setValue(String(s.maxContentChars))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.maxContentChars = isNaN(n) ? 1000 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("minContentName"))
      .setDesc(this.tr("minContentDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("300")
          .setValue(String(s.minContentChars))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.minContentChars = isNaN(n) || n < 0 ? 0 : n;
            await this.plugin.saveSettings();
          })
      );

    new Setting(card)
      .setName(this.tr("concurrencyName"))
      .setDesc(this.tr("concurrencyDesc"))
      .addText((t2) =>
        t2
          .setPlaceholder("5")
          .setValue(String(s.concurrency))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.concurrency = isNaN(n) || n < 1 ? 1 : n;
            await this.plugin.saveSettings();
          })
      );
  }

  // ============ 恢复配置（两个恢复：字段 + 全部） ============
  private buildResetSection(containerEl: HTMLElement): void {
    const card = this.card(containerEl, "resetCardTitle", "resetCardSub");
    const row = card.createDiv({ cls: "ai-tagger-reset-row" });

    // 1) 恢复默认字段
    const resetFieldsBtn = row.createEl("button", {
      text: this.tr("restoreFields"),
      cls: "ai-tagger-ghost-btn",
    });
    resetFieldsBtn.addEventListener("click", async () => {
      this.plugin.settings.fields = DEFAULT_SETTINGS.fields.map((f) => ({
        ...f,
      }));
      await this.plugin.saveSettings();
      this.display();
      new Notice(this.tr("restoreFieldsNotice"));
    });

    // 2) 恢复全部默认配置（二次确认防误清）
    const resetAllBtn = row.createEl("button", {
      text: this.tr("restoreAll"),
      cls: "ai-tagger-danger-btn",
    });
    let armed = false;
    let timer: number | undefined;
    resetAllBtn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        resetAllBtn.textContent = this.tr("confirmReset");
        resetAllBtn.addClass("is-armed");
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          armed = false;
          resetAllBtn.textContent = this.tr("restoreAll");
          resetAllBtn.removeClass("is-armed");
        }, 4000);
        return;
      }
      if (timer) window.clearTimeout(timer);
      const fresh: PluginSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this.plugin.settings = fresh;
      await this.plugin.saveSettings();
      this.display();
      new Notice(this.tr("restoreAllNotice"));
    });
  }

  // ============ 关于插件 ============
  private buildAboutSection(containerEl: HTMLElement): void {
    const card = this.card(containerEl, "aboutCardTitle", "aboutCardSub");

    const info = card.createDiv({ cls: "ai-tagger-about" });
    info.createEl("p", {
      cls: "ai-tagger-about-line",
      text: this.tr("aboutVersion", { version: this.plugin.manifest.version }),
    });
    info.createEl("p", {
      cls: "ai-tagger-about-line",
      text: this.tr("aboutAuthor", { author: this.plugin.manifest.author || "lusca" }),
    });
    info.createEl("p", {
      cls: "ai-tagger-about-line",
      text: this.tr("aboutLicense"),
    });

    info.createEl("p", {
      cls: "ai-tagger-about-intro",
      text: this.tr("aboutIntro"),
    });
    info.createEl("p", {
      cls: "ai-tagger-about-intro",
      text: this.tr("aboutThanks"),
    });

    const support = info.createEl("p", {
      cls: "ai-tagger-about-support",
      text: this.tr("aboutSupport"),
    });

    const qr = support.createEl("img", {
      cls: "ai-tagger-about-qr",
    });
    qr.src = `data:image/png;base64,${QR_CODE_BASE64}`;
    qr.alt = this.tr("aboutQrCaption");

    info.createEl("p", {
      cls: "ai-tagger-about-caption",
      text: this.tr("aboutQrCaption"),
    });
  }
}
