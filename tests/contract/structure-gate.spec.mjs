import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkStructure } from "../../scripts/check-structure.mjs";

const REQUIRED = ["contracts", "data", "docs", "public", "scripts", "src", "tests"];
const roots = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "form-studio-structure-"));
  roots.push(root);
  for (const directory of REQUIRED) mkdirSync(join(root, directory), { recursive: true });
  return root;
}

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("大小写或 .spec.js 不能绕过测试分类", () => {
  const root = fixtureRoot();
  writeFileSync(join(root, "loose.SPEC.MJS"), "export {};\n");
  writeFileSync(join(root, "loose.spec.js"), "export {};\n");
  const failures = checkStructure(root);
  expect(failures.filter((item) => item.startsWith("spec 未分类"))).toHaveLength(2);
});

test("嵌套 test-results 与源码区 Markdown 不能隐身", () => {
  const root = fixtureRoot();
  mkdirSync(join(root, "src", "hidden", "test-results"), { recursive: true });
  writeFileSync(join(root, "src", "note.md"), "duplicate design\n");
  const failures = checkStructure(root);
  expect(failures).toContain("测试输出目录只能在根级：src/hidden/test-results");
  expect(failures).toContain("Markdown 不在文档区：src/note.md");
});

test("标准开源社区 Markdown 可位于根目录和 GitHub 配置区", () => {
  const root = fixtureRoot();
  for (const file of ["CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "SECURITY.md"]) {
    writeFileSync(join(root, file), `${file}\n`);
  }
  mkdirSync(join(root, ".github"), { recursive: true });
  writeFileSync(join(root, ".github", "pull_request_template.md"), "evidence\n");
  expect(checkStructure(root)).toEqual([]);
});

test("domain 和 application 的反向 import 会被拦住", () => {
  const root = fixtureRoot();
  mkdirSync(join(root, "src", "domain"), { recursive: true });
  mkdirSync(join(root, "src", "application"), { recursive: true });
  writeFileSync(join(root, "src", "domain", "bad.mjs"), 'import http from "node:http";\n');
  writeFileSync(join(root, "src", "application", "bad.mjs"), 'export { x } from "../server/x.mjs";\n');
  const failures = checkStructure(root);
  expect(failures).toContain("依赖方向违规：src/domain/bad.mjs -> node:http");
  expect(failures).toContain("依赖方向违规：src/application/bad.mjs -> ../server/x.mjs");
});
