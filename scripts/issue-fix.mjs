#!/usr/bin/env node
/**
 * issue-fix.mjs —— 根据 GitHub Issue 自动需求分析并生成修复补丁
 *
 * 流程：
 *   1. 用 GitHub REST API 拉取 issue（标题/正文/评论），公开库无需 token
 *   2. 拉取仓库文件树，交给 LLM 做需求分析（rootCause / 需修改文件 / 方案）
 *   3. 读取相关文件全文，让 LLM 产出统一 diff（git 格式）
 *   4. git apply（失败自动重试一次），创建 issue-<n> 分支并提交
 *   5. 若有 GITHUB_TOKEN：自动 push 并开 PR；否则打印手动开 PR 指引
 *
 * AI 配置（OpenAI 兼容端点）优先级：
 *   环境变量 ISSUE_FIX_API_KEY / ISSUE_FIX_BASE_URL / ISSUE_FIX_MODEL
 *   → 否则尝试自动读取插件 data.json（AI_AUTO_TAGGER_DATA 或常见路径）
 *   → 缺省 baseUrl=https://api.openai.com/v1，model=gpt-4o-mini
 *
 * 用法：
 *   node scripts/issue-fix.mjs <issue号> [--repo owner/name] [--dry-run] [--no-pr]
 *                              [--model x] [--base-url u] [--api-key k] [--data-json p]
 *
 * 示例：
 *   node scripts/issue-fix.mjs 42
 *   node scripts/issue-fix.mjs 42 --dry-run            # 只跑分析+diff，不改仓库
 *   GITHUB_TOKEN=ghp_xxx node scripts/issue-fix.mjs 42 # 自动开 PR
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------- 模块级状态（由 main 初始化，import 时不触发）----------
let REPO_ROOT = "";
let issueNumber = "";
const opt = { dryRun: false, noPr: false, repo: null, model: null, baseUrl: null, apiKey: null, dataJson: null };

// ---------- 小工具 ----------
const log = (...x) => console.log(...x);
const sep = (t) => log(`\n========== ${t} ==========`);
function sh(cmd, silent = false) {
  if (!silent) log("  $ " + cmd);
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", stdio: silent ? "pipe" : "inherit" });
}
function shOut(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }).trim();
}

// ---------- GitHub REST ----------
const GH_TOKEN = process.env.GITHUB_TOKEN || "";
const UA = { "User-Agent": "issue-fix-script", Accept: "application/vnd.github+json" };
async function ghGet(apiPath) {
  const headers = { ...UA };
  if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;
  const res = await fetch(`https://api.github.com${apiPath}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} ${apiPath}\n${body.slice(0, 500)}`);
  }
  return res.json();
}

async function resolveRepo() {
  if (opt.repo) return opt.repo;
  try {
    const url = shOut("git remote get-url origin");
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch {}
  return "yjmm10/obsidian-plugin";
}

async function fetchIssue(repo, n) {
  const issue = await ghGet(`/repos/${repo}/issues/${n}`);
  let comments = [];
  if (issue.comments > 0) {
    comments = await ghGet(`/repos/${repo}/issues/${n}/comments`);
  }
  const parts = [`# ${issue.title}`, "", issue.body || "(无正文)"];
  if (comments.length) {
    parts.push("", "## 评论");
    for (const c of comments) parts.push(`- ${c.user?.login}: ${c.body || ""}`);
  }
  return { title: issue.title, body: parts.join("\n"), labels: (issue.labels || []).map((l) => l.name).join(",") };
}

async function fetchTree(repo) {
  const info = await ghGet(`/repos/${repo}`);
  const branch = info.default_branch || "main";
  const tree = await ghGet(`/repos/${repo}/git/trees/${branch}?recursive=1`);
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".md"];
  const skip = ["node_modules", ".git", "dist", "build", "manifest.json", "versions.json"];
  return tree.tree
    .filter((t) => t.type === "blob")
    .map((t) => t.path)
    .filter((p) => exts.some((e) => p.endsWith(e)))
    .filter((p) => !skip.some((s) => p === s || p.includes("/" + s + "/")))
    .filter((p) => !p.startsWith("test/") && p !== "main.js");
}

// ---------- AI 配置 ----------
function findDataJson() {
  const cands = [];
  if (opt.dataJson) cands.push(opt.dataJson);
  if (process.env.AI_AUTO_TAGGER_DATA) cands.push(process.env.AI_AUTO_TAGGER_DATA);
  cands.push("E:/Notes/plugin_test/.obsidian/plugins/ai-auto-tagger/data.json");
  cands.push("/e/Notes/plugin_test/.obsidian/plugins/ai-auto-tagger/data.json");
  cands.push(path.join(os.homedir(), "Notes/plugin_test/.obsidian/plugins/ai-auto-tagger/data.json"));
  for (const c of cands) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}
function loadConfig() {
  const cfg = {
    apiKey: opt.apiKey || process.env.ISSUE_FIX_API_KEY || "",
    baseUrl: opt.baseUrl || process.env.ISSUE_FIX_BASE_URL || "",
    model: opt.model || process.env.ISSUE_FIX_MODEL || "",
  };
  if (!cfg.apiKey || !cfg.model) {
    const f = findDataJson();
    if (f) {
      try {
        const d = JSON.parse(fs.readFileSync(f, "utf8"));
        const ai = d.ai || {};
        cfg.apiKey = cfg.apiKey || ai.apiKey || "";
        cfg.baseUrl = cfg.baseUrl || ai.baseUrl || "";
        cfg.model = cfg.model || ai.model || "";
      } catch {}
    }
  }
  cfg.baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  if (!cfg.apiKey) {
    console.error("✗ 缺少 API Key：请设置环境变量 ISSUE_FIX_API_KEY，或用 --api-key，或在插件 data.json 中已配置。");
    process.exit(1);
  }
  if (!cfg.model) cfg.model = "gpt-4o-mini";
  return cfg;
}

// ---------- LLM 调用（OpenAI 兼容）----------
let CFG;
async function chat(messages, { json = false } = {}) {
  const url = `${CFG.baseUrl}/chat/completions`;
  const body = { model: CFG.model, messages, temperature: 0.2 };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CFG.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM API ${res.status}\n${t.slice(0, 600)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content || "";
}
async function chatJson(messages) {
  try {
    const txt = await chat(messages, { json: true });
    return JSON.parse(txt);
  } catch (e) {
    // 退化：从文本中抽取第一个 JSON 对象
    const txt = await chat(messages, { json: false });
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw e;
  }
}

// ---------- Prompt ----------
function analyzeMessages(issue, tree) {
  return [
    {
      role: "system",
      content:
        "你是资深软件工程师。根据 GitHub issue 与仓库文件树做需求分析：定位根因、列出必须修改的文件（相对仓库根的路径）、给出修复方案。只列出真正需要改的文件。用中文回答。仅输出 JSON，格式：{\"summary\":\"一句话总结\",\"rootCause\":\"根因\",\"files\":[\"src/x.ts\"],\"approach\":\"修复思路\"}。",
    },
    {
      role: "user",
      content: `## Issue\n${issue.body}\n\n## 仓库文件树（候选）\n${tree.join("\n")}`,
    },
  ];
}
function patchMessages(issue, analysis, files) {
  const fileBlocks = files
    .map((f) => `### 文件：${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
  return [
    {
      role: "system",
      content:
        "你是资深软件工程师，正在修复 bug。你会拿到 issue、需求分析、以及待修改文件的当前全文。请产出实现修复的【统一 git diff】。规则：路径相对仓库根并带 a/ b/ 前缀（如 `diff --git a/src/x.ts b/src/x.ts`）；保留上下文行；只修改提供的文件；整段放在一个 ```diff 代码块内；不要解释、不要修改未提供的文件。",
    },
    {
      role: "user",
      content: `## Issue\n${issue.body}\n\n## 需求分析\n${JSON.stringify(analysis, null, 2)}\n\n## 待修改文件当前内容\n${fileBlocks}`,
    },
  ];
}

// ---------- 读取文件 ----------
function readFiles(paths, capLines = 6000) {
  const out = [];
  for (const p of paths) {
    const full = path.join(REPO_ROOT, p);
    if (!fs.existsSync(full)) continue;
    let lines = fs.readFileSync(full, "utf8").split("\n");
    if (lines.length > capLines) lines = lines.slice(0, capLines).concat(["... (truncated)"]);
    out.push({ path: p, content: lines.join("\n") });
  }
  return out;
}

// ---------- 解析 diff ----------
function extractDiff(text) {
  const blocks = [...text.matchAll(/```diff\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  if (blocks.length) return blocks.join("\n");
  // 退化：整段当作 diff
  if (text.includes("diff --git")) return text.trim();
  return "";
}

// ---------- 应用 diff ----------
function applyDiff(diff) {
  const tmp = path.join(os.tmpdir(), `issue-fix-${Date.now()}.diff`);
  fs.writeFileSync(tmp, diff);
  try {
    execSync(`git apply --whitespace=nowarn "${tmp}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    return { ok: true };
  } catch (e1) {
    try {
      execSync(`git apply --3way "${tmp}"`, { cwd: REPO_ROOT, stdio: "pipe" });
      return { ok: true, method: "3way" };
    } catch (e2) {
      try {
        execSync(`patch -p1 < "${tmp}"`, { cwd: REPO_ROOT, stdio: "pipe" });
        return { ok: true, method: "patch" };
      } catch (e3) {
        return { ok: false, error: String(e3.stderr || e3).slice(0, 800) };
      }
    }
  }
}

// ---------- 开 PR ----------
async function createPR(repo, branch, n, analysis) {
  if (!GH_TOKEN) {
    log(`\n⚠️ 未设置 GITHUB_TOKEN，跳过自动开 PR。请手动执行：`);
    log(`   git push -u origin ${branch}`);
    log(`   然后在 GitHub 打开 PR：https://github.com/${repo}/pull/new/${branch}`);
    return null;
  }
  const info = await ghGet(`/repos/${repo}`);
  const base = info.default_branch || "main";
  const body = `## 自动修复（issue #${n}）\n\n${analysis.summary}\n\n**根因**：${analysis.rootCause}\n\n**方案**：${analysis.approach}\n\n---\n由 issue-fix 工具基于 #${n} 自动生成，请 review。`;
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GH_TOKEN}`, ...UA },
    body: JSON.stringify({ title: `fix: #${n} ${analysis.summary}`, head: branch, base, body }),
  });
  if (!res.ok) {
    log(`\n⚠️ 开 PR 失败 (${res.status})：${(await res.text()).slice(0, 300)}`);
    log(`请手动 push 并开 PR：git push -u origin ${branch}`);
    return null;
  }
  const pr = await res.json();
  return pr.html_url;
}

// ---------- 主流程 ----------
async function main() {
  // 仓库根目录（必须在运行期解析，避免被 import 时执行）
  try {
    REPO_ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    REPO_ROOT = process.cwd();
  }

  // 参数解析
  const argv = process.argv.slice(2);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opt.dryRun = true;
    else if (a === "--no-pr") opt.noPr = true;
    else if (a === "--repo") opt.repo = argv[++i];
    else if (a === "--model") opt.model = argv[++i];
    else if (a === "--base-url") opt.baseUrl = argv[++i];
    else if (a === "--api-key") opt.apiKey = argv[++i];
    else if (a === "--data-json") opt.dataJson = argv[++i];
    else if (a.startsWith("--")) {
      console.error(`未知参数: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }
  issueNumber = positional[0];
  if (!issueNumber || !/^\d+$/.test(issueNumber)) {
    console.error("用法: node scripts/issue-fix.mjs <issue号> [--repo owner/name] [--dry-run] [--no-pr]");
    process.exit(1);
  }

  sep("解析仓库");
  const repo = await resolveRepo();
  log("repo =", repo, "| issue =", issueNumber, "| root =", REPO_ROOT);

  CFG = loadConfig();
  log("LLM =", CFG.model, "@", CFG.baseUrl);

  sep("拉取 Issue");
  const issue = await fetchIssue(repo, issueNumber);
  log("标题：", issue.title, issue.labels ? `（${issue.labels}）` : "");

  sep("拉取文件树");
  const tree = await fetchTree(repo);
  log(`候选文件 ${tree.length} 个`);

  sep("Phase A · 需求分析");
  const analysis = await chatJson(analyzeMessages(issue, tree));
  log(JSON.stringify(analysis, null, 2));

  const files = (analysis.files || []).filter((p) => typeof p === "string");
  if (!files.length) {
    console.error("✗ 分析未返回需修改文件，终止。");
    process.exit(1);
  }
  sep("读取待修改文件");
  const contents = readFiles(files);
  log(`读取 ${contents.length}/${files.length} 个文件`);

  sep("Phase B · 生成补丁");
  let diff = extractDiff(await chat(patchMessages(issue, analysis, contents)));
  if (!diff) {
    console.error("✗ 未解析出 diff，终止。");
    process.exit(1);
  }

  if (opt.dryRun) {
    sep("DRY-RUN · 生成 diff（未改动仓库）");
    log(diff);
    return;
  }

  sep("应用补丁");
  let r = applyDiff(diff);
  if (!r.ok) {
    log("首次应用失败，将错误回喂 LLM 重试一次…");
    log(r.error);
    const retry = await chat([
      ...patchMessages(issue, analysis, contents),
      { role: "assistant", content: "```diff\n" + diff + "\n```" },
      { role: "user", content: `应用失败，报错：\n${r.error}\n请修正 diff（路径与上下文必须匹配当前文件）后重新输出。` },
    ]);
    diff = extractDiff(retry);
    r = diff ? applyDiff(diff) : { ok: false, error: "重试未产出 diff" };
  }
  if (!r.ok) {
    console.error("✗ 补丁应用失败：\n" + r.error);
    process.exit(1);
  }
  log(`✓ 已应用（${r.method || "git apply"}）`);

  sep("提交 & PR");
  const branch = `issue-${issueNumber}`;
  sh(`git checkout -b ${branch}`);
  sh(`git add -A`);
  sh(`git commit -m "fix: #${issueNumber} ${analysis.summary}\n\nCloses #${issueNumber}"`, true);
  log(`✓ 已提交到分支 ${branch}`);

  if (opt.noPr) {
    log("（--no-pr）未推送/开 PR。手动：git push -u origin " + branch);
    return;
  }
  const url = await createPR(repo, branch, issueNumber, analysis);
  if (url) log("✓ PR 已创建：", url);
}

export { resolveRepo, fetchIssue, fetchTree, ghGet, extractDiff, applyDiff };

// 仅在直接运行（而非被 import）时启动主流程
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error("\n✗ 失败：", e.message || e);
    process.exit(1);
  });
}
