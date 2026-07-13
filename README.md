# AI Auto Tagger

一个 Obsidian 插件：用**统一的多厂商 AI 接口**为笔记自动生成标签与任意自定义字段（写入 frontmatter）。支持多文件夹范围、创建/剪藏/手动触发，字段映射灵活可配。

## 功能特性

- **多 AI 厂商 + 兼容 OpenAI 协议**：底层使用开源的 [Vercel AI SDK](https://github.com/vercel/ai)（MIT）统一接口，
  通过「厂商 / 接口类型」下拉切换：
  - `openai-compatible`：兼容任意 OpenAI 协议端点 —— OpenAI / DeepSeek / 通义千问 / 智谱 / 豆包 / 本地 Ollama 等
  - `anthropic`：原生 Claude
  - `google`：原生 Gemini
  无需为每个模型单独写适配代码，由 SDK 统一处理鉴权、结构化输出与错误类型。
- **连接验证**：设置页提供「测试连接」按钮，用当前配置发送一次最小请求探活，失败时回显 HTTP 状态与原因（`401` 密钥错、`ECONNREFUSED` 地址错等）。
- **灵活字段映射**：自定义任意 frontmatter 字段（如 `tags` / `summary` / `category` / `keywords` / `language`），
  每个字段可设类型（字符串 / 数组 / 数字 / 布尔）与给 AI 的说明。
- **多文件夹范围**：可指定「生效文件夹」与「排除文件夹」，留空生效文件夹即全库生效；排除优先。
- **多种触发**：
  - 新建文件 / 网页剪藏生成文件（剪藏本质也是新建文件）→ 自动防抖打标
  - 命令面板手动：当前文件 / 批量某文件夹 / 批量全部已启用文件夹
  - 可选「内容新增自动打标」（默认关闭，避免频繁调用）
- **写入策略**：覆盖 / 合并（数组去重追加、标量仅填空时写入）；已有标签可跳过。

## 安装

### 方式一：BRAT（推荐）
1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件。
2. 在 BRAT 设置中添加 Beta 仓库：`你的用户名/ai-auto-tagger`。
3. 启用本插件并到设置中填写 AI 接口。

### 方式二：手动
1. 在本仓库执行 `npm install && npm run build`，得到 `main.js`。
2. 将 `main.js`、`manifest.json`、`styles.css` 复制到你的库：
   `你的库/.obsidian/plugins/ai-auto-tagger/`
3. 在 Obsidian 设置 → 第三方插件中启用。

## 配置

打开 设置 → AI Auto Tagger：

**一、AI 接口**
| 项 | 说明 | 示例 |
|---|---|---|
| 厂商 / 接口类型 | 切换底层 provider | `openai-compatible` / `anthropic` / `google` |
| Base URL | openai-compatible 模式必填；anthropic/google 可留空或填代理 | `https://api.openai.com/v1` |
| API Key | 鉴权令牌 | `sk-...` |
| 模型名 | 具体模型 | `gpt-4o-mini` / `deepseek-chat` / `claude-3-5-sonnet` / `gemini-1.5-flash` |

**二、提取字段**
默认包含 `tags`(数组)、`summary`(字符串)、`category`(字符串)。
可任意增删，例如新增 `keywords`(数组)、`language`(字符串)。

**三、生效范围**
- 生效文件夹：`Inbox`、`Articles/Read`（留空=全库）
- 排除文件夹：`Templates`、`_private`

**四、触发与行为**
- 新建文件自动打标（默认开）
- 内容新增自动打标（默认关）
- 防抖时间、覆盖/合并、已有标签跳过、送入 AI 的最大字符数、批量并发数

## 命令

- `AI Auto Tagger: 为当前文件生成标签 / 字段`
- `AI Auto Tagger: 批量处理文件夹（按路径）`
- `AI Auto Tagger: 批量处理所有已启用文件夹`

## 工作原理

1. 读取笔记正文（截断到最大字符数），组装 system / user prompt。
2. 通过 Vercel AI SDK 的 `generateObject` 发起请求（按所选 provider 自动处理鉴权、结构化输出与错误类型），要求返回严格字段名的 JSON。
3. 解析结果，按字段类型强转，写入/合并到 frontmatter。
4. 写回时加锁，避免 `modify` 事件造成自触发循环。
5. 配置页「测试连接」会用当前配置发送一次最小请求探活，失败时回显 HTTP 状态与原因。

## 开发

```bash
npm install
npm run dev      # 监听模式，输出 main.js
npm run build    # 类型检查 + 生产构建
```

## 许可

MIT
