import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { extractFromHtml } from "../../src/domain/ledger/extract-from-html.mjs";
import { renderFormHtml } from "../../src/presentation/form/render-html.mjs";
import { expectedLedger, ROOT } from "../support/project-fixture.mjs";

test.describe("form-ledger 合同", () => {
  test("金稿可抽出 ownerAgent，字段 id 不是中文标签", () => {
    const html = readFileSync(join(ROOT, "tests", "fixtures", "exercise-1", "form.html"), "utf8");
    expect(extractFromHtml(html)).toEqual(expectedLedger);
  });

  test("设计面渲染能抽出与字段一致的账本", () => {
    const html = renderFormHtml(
      { id: "exercise-1", name: "练习一", formVersion: 1 },
      expectedLedger.fields,
      { formVersion: 1 },
    );
    expect(extractFromHtml(html)).toEqual(expectedLedger);
  });

  test("空字段渲染不发明金稿栏", () => {
    const html = renderFormHtml({ id: "form-empty", name: "空表", formVersion: 1 }, [], { formVersion: 1 });
    const ledger = extractFromHtml(html);
    expect(ledger.ownerAgent).toBe("form-empty");
    expect(ledger.fields).toEqual([]);
    expect(html).not.toContain('name="q1"');
    expect(html).not.toContain('name="n1"');
    expect(html).not.toContain('name="a1"');
  });
});
