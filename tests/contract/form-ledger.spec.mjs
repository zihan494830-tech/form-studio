import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import { normalizeFields } from "../../src/domain/form/field-contract.mjs";
import { extractFromHtml } from "../../src/domain/ledger/extract-from-html.mjs";
import { renderFormHtml } from "../../src/presentation/form/render-html.mjs";
import { expectedLedger, ROOT } from "../support/project-fixture.mjs";

const schema = JSON.parse(readFileSync(join(ROOT, "contracts", "form-ledger.v1.schema.json"), "utf8"));
// Ajv's draft-2020 entry point is the executable proof for the declared schema dialect:
// https://ajv.js.org/json-schema.html
const validateLedger = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

test.describe("form-ledger 合同", () => {
  test("select 必须显式提供非空 options[]", () => {
    const result = normalizeFields([
      { id: "choice", label: "选择", control: "select", required: true, options: [] },
    ]);
    expect(result).toMatchObject({ errorCode: "select_options_required", parameters: { id: "choice" } });
  });

  test("数组选项保留英文逗号，不再按逗号拆分", () => {
    const result = normalizeFields([
      { id: "region", label: "地区", control: "select", required: false, options: ["香港, 九龍", "新界"] },
    ]);
    expect(result.fields[0].options).toEqual(["香港, 九龍", "新界"]);
  });

  test("已发布示例可抽出 ownerAgent，字段 id 不是中文标签", () => {
    const html = readFileSync(join(ROOT, "tests", "fixtures", "exercise-1", "form.html"), "utf8");
    expect(extractFromHtml(html)).toEqual(expectedLedger);
  });

  test("设计面渲染能抽出与字段一致的账本", () => {
    const html = renderFormHtml(
      { id: "exercise-1", name: "市场分析需求", formVersion: 1 },
      expectedLedger.fields,
      { formVersion: 1 },
    );
    expect(extractFromHtml(html)).toEqual(expectedLedger);
  });

  test("真实 JSON Schema 接受规范账本并拒绝控件属性串用", () => {
    expect(validateLedger(expectedLedger), JSON.stringify(validateLedger.errors)).toBe(true);
    const invalid = structuredClone(expectedLedger);
    invalid.fields[0].options = ["不应存在"];
    expect(validateLedger(invalid)).toBe(false);
  });

  test("grid 账本通过 schema，且 composite required 必须为 false", () => {
    const html = readFileSync(join(ROOT, "tests", "fixtures", "grid-sample", "form.html"), "utf8");
    const ledger = extractFromHtml(html);
    expect(validateLedger(ledger), JSON.stringify(validateLedger.errors)).toBe(true);
    ledger.fields.find((field) => field.control === "grid").required = true;
    expect(validateLedger(ledger)).toBe(false);
  });

  test("空字段渲染不发明示例栏", () => {
    const html = renderFormHtml({ id: "form-empty", name: "空表", formVersion: 1 }, [], { formVersion: 1 });
    const ledger = extractFromHtml(html);
    expect(ledger.ownerAgent).toBe("form-empty");
    expect(ledger.fields).toEqual([]);
    expect(html).not.toContain('name="company_name"');
    expect(html).not.toContain('name="analysis_goal"');
    expect(html).not.toContain('name="target_market"');
  });

  test("HTML 抽取器与 schema 共用字段不变量：选项去重，空选项和非法 ID 拒绝", () => {
    const duplicate = extractFromHtml(`<form data-owner-agent="a1" data-form-version="1">
      <label for="choice">选择</label><select id="choice" name="choice"><option value="A">A</option><option value="A">A2</option></select>
      <button type="submit">提交</button></form>`);
    expect(duplicate.fields[0].options).toEqual(["A"]);
    expect(validateLedger(duplicate), JSON.stringify(validateLedger.errors)).toBe(true);

    expect(() => extractFromHtml(`<form data-owner-agent="a1"><label><input type="radio" name="choice" value="" />空</label></form>`))
      .toThrow(/radio_options_required/);
    expect(() => extractFromHtml(`<form data-owner-agent="a1"><label for="9bad">坏 ID</label><input id="9bad" name="9bad" /></form>`))
      .toThrow(/field_id_invalid/);
  });
});
