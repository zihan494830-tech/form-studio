import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const required = ["contracts", "data", "docs", "public", "scripts", "src", "tests"];
const forbiddenLegacy = ["engine", "face", "fixtures", "mocks", "runtime", "spec", "verify", "workbench"];
const allowedRootMarkdown = new Set(["DESIGN.md", "README.md"]);

for (const directory of required) {
  try { if (!statSync(join(ROOT, directory)).isDirectory()) failures.push(`缺目录：${directory}`); }
  catch { failures.push(`缺目录：${directory}`); }
}
for (const directory of forbiddenLegacy) {
  try { if (statSync(join(ROOT, directory)).isDirectory()) failures.push(`旧目录不得恢复：${directory}`); }
  catch { /* 不存在才是正确状态。 */ }
}

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.isFile() && extname(entry.name).toLowerCase() === ".md" && !allowedRootMarkdown.has(entry.name)) {
    failures.push(`根目录 Markdown 未归档：${entry.name}`);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "test-results"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (rel.endsWith(".spec.mjs") && !/^tests\/(contract|runtime|e2e)\//.test(rel)) {
    failures.push(`spec 未分类：${rel}`);
  }
  const lines = readFileSync(file, "utf8").split(/\r?\n/).length;
  if (rel.endsWith(".spec.mjs") && lines > 300) failures.push(`测试文件超过 300 行：${rel} (${lines})`);
  if (/^(src|public)\/.*\.(m?js)$/.test(rel) && lines > 450) failures.push(`源文件超过 450 行：${rel} (${lines})`);
}

if (failures.length) {
  process.stderr.write(`${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("structure ok\n");
}
