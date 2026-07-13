# MEMORY.md - AI Auto Tagger 插件项目长期笔记

## 项目路径关系
- 源码工程：`E:\Project\CC\obsidian-plugin`（manifest.json / src / main.js 那套）
- 测试库（联调）：`E:\Notes\plugin_test`（Obsidian vault，插件装到 `.obsidian/plugins/ai-auto-tagger/`）
- 工作流：工程改代码 → watch.mjs 自动部署到测试库 → Obsidian reload 插件

## 插件标识（manifest.json）
- id: `ai-auto-tagger`，name: `AI Auto Tagger`
- **author: `lusca`**（用户要求署名 lusca，勿改回 WorkBuddy）
- version: 1.1.0，minAppVersion: 1.4.0
- 部署时勿覆盖 `data.json`（用户配置）

## 自动部署
- `npm run watch` 后台运行 watch.mjs（轮询 mtime 700ms，默认生产构建；`--dev` 带 sourcemap）
- 进程偶发退出，需 `npm run watch` 重启

## Obsidian API 注意
- 本版 `vault.getAllFolders()` 返回 `TFolder[]`，需 `.map(f=>f.path)`；`vault.getFolders()` 不存在

## 插件"检索不到"排查（Obsidian 端）
- 文件层正常时大概率是：① 安全模式未关；② 改 manifest 后未重启 vault；③ 在"社区市场"搜本地插件（应看"已安装插件"列表）；④ Obsidian 版本 < 1.4.0
