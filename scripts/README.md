# issue-fix —— 根据 GitHub Issue 自动需求分析并修复代码

读取仓库的某个 GitHub Issue，做需求分析、定位相关代码、生成修复补丁，并开 PR 供 review。

## 用法

```bash
# 修复当前仓库的 issue #42（自动从 git remote 推断 owner/repo）
npm run issue-fix -- 42

# 只跑分析 + 生成 diff，不改动仓库（推荐先 dry-run 看效果）
npm run issue-fix -- 42 --dry-run

# 自动 push 并开 PR（需要 GITHUB_TOKEN 环境变量）
GITHUB_TOKEN=ghp_xxx npm run issue-fix -- 42

# 指定仓库 / 自定义配置
npm run issue-fix -- 42 --repo owner/repo --model gpt-4o
```

## AI 配置（OpenAI 兼容端点，优先级从高到低）

1. 命令行参数：`--api-key` / `--base-url` / `--model`
2. 环境变量：`ISSUE_FIX_API_KEY` / `ISSUE_FIX_BASE_URL` / `ISSUE_FIX_MODEL`
3. 插件 `data.json`：自动探测（或 `AI_AUTO_TAGGER_DATA` 指定路径），复用已在 Obsidian 插件里配好的 Key
4. 缺省：`baseUrl=https://api.openai.com/v1`，`model=gpt-4o-mini`

> 脚本按 OpenAI Chat Completions 格式调用。若你的 provider 是 Anthropic/Google 直连，请将其 Base URL 设为兼容代理。

## 流程

1. GitHub REST API 拉取 issue（标题/正文/评论）—— 公开库无需 token
2. 拉取仓库文件树 → LLM 需求分析（根因 / 需改文件 / 方案），输出 JSON
3. 读取相关文件全文 → LLM 产出统一 diff → `git apply`（失败自动重试一次）
4. 创建 `issue-<n>` 分支并提交
5. 有 `GITHUB_TOKEN`：自动 push + 开 PR；否则打印手动开 PR 指引

## 说明

- 不依赖 `gh` CLI（直接用 REST API）。
- 所有改动都在独立分支，绝不直推 `main`，天然可 review / 可回退。
- 这是开发期工具，不参与插件打包（`main.js` 不受影响）。
