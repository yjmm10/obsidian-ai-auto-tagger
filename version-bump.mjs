import { readFileSync, writeFileSync } from "fs";

// npm version <patch|minor|major> 会先更新 package.json，再触发本脚本
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("未获取到 npm_package_version，请使用 `npm version patch/minor/major`");
  process.exit(1);
}

// 同步 manifest.json 的 version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// 追加到 versions.json： {版本: 最低 Obsidian 版本}
let versions = {};
try {
  versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch (e) {
  console.log("versions.json 不存在，创建新文件");
}
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`已同步版本 ${targetVersion}（minAppVersion=${minAppVersion}）到 manifest.json 与 versions.json`);
