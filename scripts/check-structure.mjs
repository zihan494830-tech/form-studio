import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REQUIRED = ["contracts", "data", "docs", "public", "scripts", "src", "tests"];
const FORBIDDEN_ROOT_LEGACY = ["engine", "face", "fixtures", "mocks", "runtime", "spec", "verify", "workbench"];
const ALLOWED_ROOT_MARKDOWN = new Set([
  "CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "DESIGN.md", "README.md", "SECURITY.md",
]);
const ALLOWED_COMMUNITY_MARKDOWN = new Set([".github/pull_request_template.md"]);
const ROOT_IGNORED = new Set([".git", ".learnings", "node_modules", "test-results"]);
const SPEC_PATTERN = /\.spec\.[cm]?js$/i;
const SOURCE_PATTERN = /\.[cm]?js$/i;

function normalized(root, file) {
  return relative(root, file).replaceAll("\\", "/");
}

function walk(root, directory, failures) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === root && ROOT_IGNORED.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "test-results") {
        failures.push(`测试输出目录只能在根级：${normalized(root, path)}`);
        continue;
      }
      files.push(...walk(root, path, failures));
    } else {
      files.push(path);
    }
  }
  return files;
}

function importsOf(source) {
  const imports = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function targetLayer(root, file, specifier) {
  if (!specifier.startsWith(".")) return specifier.startsWith("node:") ? "node" : "package";
  const target = normalized(root, resolve(dirname(file), specifier));
  return ["domain", "application", "infrastructure", "presentation", "server"]
    .find((layer) => target === `src/${layer}` || target.startsWith(`src/${layer}/`)) || "other";
}

function checkImportDirection(root, file, source, failures) {
  const rel = normalized(root, file);
  const layer = ["domain", "application", "infrastructure", "presentation", "server"]
    .find((name) => rel.startsWith(`src/${name}/`));
  if (!layer) return;
  const forbidden = {
    domain: new Set(["node", "application", "infrastructure", "presentation", "server"]),
    application: new Set(["presentation", "server"]),
    infrastructure: new Set(["application", "presentation", "server"]),
    presentation: new Set(["application", "infrastructure", "server"]),
    server: new Set(),
  }[layer];
  for (const specifier of importsOf(source)) {
    if (forbidden.has(targetLayer(root, file, specifier))) {
      failures.push(`依赖方向违规：${rel} -> ${specifier}`);
    }
  }
}

export function checkStructure(root = DEFAULT_ROOT) {
  root = resolve(root);
  const failures = [];
  for (const directory of REQUIRED) {
    try {
      if (!statSync(join(root, directory)).isDirectory()) failures.push(`缺目录：${directory}`);
    } catch {
      failures.push(`缺目录：${directory}`);
    }
  }
  for (const directory of FORBIDDEN_ROOT_LEGACY) {
    try {
      if (statSync(join(root, directory)).isDirectory()) failures.push(`旧目录不得恢复：${directory}`);
    } catch {
      // 不存在才是正确状态。
    }
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (extension === ".md" && !ALLOWED_ROOT_MARKDOWN.has(entry.name)) {
      failures.push(`根目录 Markdown 未归档：${entry.name}`);
    }
    if (extension === ".txt") failures.push(`根目录临时文本未归档：${entry.name}`);
  }

  for (const file of walk(root, root, failures)) {
    const rel = normalized(root, file);
    const extension = extname(file).toLowerCase();
    if (extension === ".md" && !rel.startsWith("docs/") &&
        !ALLOWED_ROOT_MARKDOWN.has(rel) && !ALLOWED_COMMUNITY_MARKDOWN.has(rel)) {
      failures.push(`Markdown 不在文档区：${rel}`);
    }
    if (SPEC_PATTERN.test(rel) && !/^tests\/(contract|runtime|e2e)\//i.test(rel)) {
      failures.push(`spec 未分类：${rel}`);
    }
    const source = SOURCE_PATTERN.test(rel) ? readFileSync(file, "utf8") : "";
    const lines = source ? source.split(/\r?\n/).length : 0;
    if (SPEC_PATTERN.test(rel) && lines > 300) failures.push(`测试文件超过 300 行：${rel} (${lines})`);
    if (/^(src|public)\//i.test(rel) && SOURCE_PATTERN.test(rel) && lines > 450) {
      failures.push(`源文件超过 450 行：${rel} (${lines})`);
    }
    if (source) checkImportDirection(root, file, source, failures);
  }
  return failures;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const failures = checkStructure();
  if (failures.length) {
    process.stderr.write(`${failures.map((item) => `- ${item}`).join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("structure ok\n");
  }
}
