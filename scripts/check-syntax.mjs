/** Cross-platform JavaScript syntax gate used locally and in CI. */
import { readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["src", "public", "scripts", "tests"];
const ROOT_FILES = ["server.mjs", "playwright.config.mjs"];
const EXTENSIONS = new Set([".js", ".mjs"]);

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = [
  ...ROOT_FILES.map((file) => join(ROOT, file)),
  ...SOURCE_ROOTS.flatMap((directory) => collect(join(ROOT, directory))),
].sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push({ file, output: `${result.stdout || ""}${result.stderr || ""}`.trim() });
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`${failure.file}\n${failure.output}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`syntax ok (${files.length} files)\n`);
}
