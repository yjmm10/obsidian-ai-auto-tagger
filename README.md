# AI Auto Tagger

> [!note]
> 用统一的多厂商 AI 接口，为 Obsidian 笔记自动生成标签与任意自定义字段，并写入 `frontmatter`。
> 兼容 OpenAI 协议端点（OpenAI / DeepSeek / 智谱 / 通义 / 豆包 / Kimi / Ollama 等），亦支持 Anthropic 与 Google 原生模型。

---

## 项目信息

| 项目 | 值 | 说明 |
|---|---|---|
| 插件 ID | `ai-auto-tagger` | 仓库名 / 插件目录名（小写中划线） |
| 插件名称 | **AI Auto Tagger** | 设置页与命令面板显示名（首字母大写） |
| 版本 | `1.0.0` | 语义化版本，遵循 `manifest.json` |
| 最低 Obsidian 版本 | `1.4.0` | `minAppVersion` |
| 许可证 | MIT | 见 `LICENSE` |

> [!info]
> 命名遵循 Obsidian 规范：`id` 使用 `kebab-case`，作为 `.obsidian/plugins/<id>/` 目录名；
> `name` 使用自然语言标题，作为插件在列表中的展示名。二者需保持一致并贯穿 `manifest.json` 与本文档。

---

## 功能特性

- **多厂商统一接口**：底层使用开源 [Vercel AI SDK](https://github.com/vercel/ai)（MIT），内置 12 家厂商注册表，切换即生效，无需为每个模型手写适配。
  - OpenAI、Anthropic、Google、Ollama、DeepSeek、智谱、通义、豆包、Kimi、OpenRouter、Groq、Mistral
  - OpenAI 兼容类（含国内厂商与本地 Ollama）共用同一套 Base URL + Key + 模型名接口
- **连接验证**：设置页「测试连接」按钮，用当前配置发送一次最小请求探活；失败时回显原始响应片段与 `finish_reason`，便于定位（如 reasoning 模型 `token` 不足被截断）。
- **灵活字段映射**：自定义任意 `frontmatter` 字段（`tags` / `summary` / `category` / `keywords` / `language` …），每个字段可设：
  - 类型：`string` / `array` / `number` / `boolean`
  - 说明：给 AI 的格式与含义要求
  - **允许取值**：限定取值范围（如 `技术, 读书, 生活`）；AI 仅可从中选择，数组字段回落时会过滤越界值
- **多文件夹范围**：可指定「生效文件夹」与「排除文件夹」，留空生效文件夹即全库生效；排除优先于包含。
- **多种触发**：
  - 新建文件 / 网页剪藏生成文件（防抖后自动打标）
  - 命令面板手动：当前文件 / 批量某文件夹 / 批量全部已启用文件夹
  - 可选「内容新增自动打标」（默认关闭，避免频繁调用）
- **内容达标门控**：正文不足设定字数视为「内容不足」，新建空文件先挂起，**不发起 AI 调用**；待你写入达标后自动触发，避免浪费。
- **写入策略**：覆盖 / 合并（数组去重追加、标量仅填空时写入）；已有非空 `tags` 可整体跳过。
- **易用设置页**：
  - 顶部**吸顶标签页**，滚动时长置顶端（「🏷 AI 打标签」核心功能 / 「⚙ AI 配置」）
  - 生效范围输入框**实时联想**知识库目录（如输入 `0301` 显示匹配路径）
  - 三类重置：重置参数 / 恢复默认字段 / 恢复全部默认配置

---

## 安装

### 方式一：BRAT（推荐，适合 Beta 版）

1. 在 Obsidian 社区插件市场安装 **BRAT**（Beta Reviewer's Auto-update Tool）。
2. 打开 BRAT 设置 → `Add Beta plugin`，填入本仓库地址：
   ```
   https://github.com/<你的用户名>/ai-auto-tagger
   ```
3. 启用 **AI Auto Tagger**，进入设置填写 AI 接口即可使用。

### 方式二：手动安装

1. 克隆本仓库并执行构建：
   ```bash
   npm install
   npm run build
   ```
   得到 `main.js`、`manifest.json`、`styles.css`。
2. 将这三个文件复制到你的库：
   ```
   你的库/.obsidian/plugins/ai-auto-tagger/
   ```
3. 在 Obsidian `设置 → 第三方插件` 中启用本插件。

> [!warning]
> 手动安装时请勿改动 `manifest.json` 中的 `id`，否则 Obsidian 无法识别插件目录。

---

## 设置说明

打开 `设置 → AI Auto Tagger`，分两个标签页：

### 🏷 AI 打标签（核心功能）

- **提取字段**：定义要写入 `frontmatter` 的字段。默认含 `tags`(数组)、`summary`(字符串)、`category`(字符串)。
  - 每个字段可设类型、说明、**允许取值**（文本框），并支持「恢复默认字段」。
- **生效范围**：「生效文件夹」「排除文件夹」，输入时实时联想库内目录。
- **触发与行为**：自动触发开关、防抖时间、覆盖/合并、已有标签跳过、字符上限、并发数。
- **恢复配置**：「恢复全部默认配置」（二次确认，防误清）。

### ⚙ AI 配置

- **厂商**：12 家内置厂商，切换后自动填入默认 Base URL 与首个模型。
- **API Key / Base URL / 模型**：模型名可从内置清单选择，或选「自定义模型…」手填。
- **参数**：温度、核采样 `top_p`、最大输出 token、请求超时。
- **测试连接**：探活当前配置。
- **重置参数**：仅复位温度 / `top_p` / 最大输出 / 超时，不动厂商、Key、模型。

### 默认参数

| 参数 | 默认值 | 含义 |
|---|---|---|
| 最大输出 token | `100` | 单次 AI 返回上限 |
| 送入 AI 最大字符 | `1000` | 截断正文以控制 token / 费用 |
| 触发达标最小字数 | `300` | 正文低于此值不触发（防空文件浪费） |
| 批量并发数 | `5` | 批量处理最大并发 |
| 温度 | `0.3` | 越低越确定 |
| 核采样 top_p | `1` | 与温度配合控制多样性 |
| 防抖时间 | `3000` ms | 停止写入后等待再调用 |
| 新建自动打标 | 开 | 新建 / 剪藏自动触发 |
| 内容新增自动打标 | 关 | 已有文件改动后触发（默认关以省费用） |

---

## 命令

命令面板（`Ctrl/Cmd + P`）中搜索 **AI Auto Tagger**：

- `AI Auto Tagger: 为当前文件生成标签 / 字段`
- `AI Auto Tagger: 批量处理文件夹（按路径）`
- `AI Auto Tagger: 批量处理所有已启用文件夹`

---

## 工作原理

1. 读取笔记正文（截断到「送入 AI 最大字符」），组装 `system` / `user` 提示词。
   - `system` 明确角色与硬性约束：键名完全一致、类型严格匹配、允许取值限制、纯 JSON 输出。
2. 通过 Vercel AI SDK 的 `generateObject` 发起请求，由 SDK 按所选厂商自动处理鉴权、结构化输出与错误类型，要求返回严格字段名的 JSON。
3. 解析结果，按字段类型强转；若字段设了「允许取值」，数组字段回落时过滤越界值。
4. 写入 / 合并到 `frontmatter`。写回时加锁，避免 `modify` 事件造成自触发循环。
5. 内容不足时挂起，待正文达标后由常驻监听自动补触发。

---

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 监听模式，输出 main.js
npm run build      # 类型检查 (tsc) + 生产构建 (esbuild)
npm test           # 本地桩验证（不依赖 Obsidian / 真实网络）
```

> [!note]
> 测试用 `tsx` 驱动，以 `global.fetch` 桩让真实 Vercel AI SDK 解析假响应，端到端验证 `callAI` / `verifyConnection`，并覆盖字段强转、内容门控、允许取值约束等纯函数逻辑。

### 发布新版本

发布由 **GitHub Actions 自动完成**：打一个与 `manifest.json` 版本一致的 Git tag 并推送，`.github/workflows/release.yml` 会云端构建并创建 Release（上传 `main.js`、`manifest.json`、`styles.css`）。**本地无需安装 `gh`**。

**首次发布**（当前 `manifest.json` 已是 `1.0.0`）：

```bash
git tag 1.0.0
git push --tags
```

**后续发布**（自动 bump 版本并打 tag）：

```bash
npm version patch     # 或 minor / major；自动更新 manifest.json + versions.json 并提交、打 tag
git push && git push --tags
```

> [!warning]
> tag 名必须与 `manifest.json` 的 `version` 完全一致，否则 `release.yml` 会在校验步骤失败。
> `main.js` 被 `.gitignore` 忽略，由 CI 在云端 `npm run build` 生成，请勿手动提交。

### 加入社区插件列表

在 [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 提交 PR，
按官方要求提供插件信息、仓库地址与上述三个构建产物。

---

## 许可证

[MIT](./LICENSE)
