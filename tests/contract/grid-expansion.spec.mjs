import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { normalizeFields } from "../../src/domain/form/field-contract.mjs";
import { expandFields } from "../../src/domain/form/expand-fields.mjs";
import { extractFromHtml } from "../../src/domain/ledger/extract-from-html.mjs";
import { renderFormHtml } from "../../src/presentation/form/render-html.mjs";
import { ROOT } from "../support/project-fixture.mjs";

const FINANCIAL_GRID = {
  id: "history",
  label: "歷史收支",
  control: "grid",
  required: false,
  grid: {
    rows: [
      { id: "fy2022", label: "FY2022" },
      { id: "fy2023", label: "FY2023" },
    ],
    columns: [
      { id: "revenue", label: "Total Revenue (HK$)", control: "number", required: true, decimals: 2 },
      { id: "cost", label: "Total Cost of Sales (HK$)", control: "number", required: true },
      { id: "remark", label: "Remarks", control: "text", required: false },
    ],
  },
};

test.describe("grid 展开合同", () => {
  test("grid 展开成 row × column 个扁平格子，id 为 gridId_rowId_colId", () => {
    const normalized = normalizeFields([FINANCIAL_GRID]);
    expect(normalized.errorCode).toBeUndefined();
    const result = expandFields(normalized.fields);
    expect(result.errorCode).toBeUndefined();
    expect(result.fields.map((field) => field.id)).toEqual([
      "history_fy2022_revenue",
      "history_fy2022_cost",
      "history_fy2022_remark",
      "history_fy2023_revenue",
      "history_fy2023_cost",
      "history_fy2023_remark",
    ]);
  });

  test("格子继承列控件、必填、小数位并携带 grid 元数据", () => {
    const normalized = normalizeFields([FINANCIAL_GRID]);
    const [cell] = expandFields(normalized.fields).fields;
    expect(cell).toMatchObject({
      id: "history_fy2022_revenue",
      label: "FY2022 · Total Revenue (HK$)",
      control: "number",
      required: true,
      decimals: 2,
      grid: { fieldId: "history", rowId: "fy2022", columnId: "revenue" },
    });
  });

  test("非 grid 字段原样通过且不带 grid 元数据", () => {
    const normalized = normalizeFields([
      { id: "q1", label: "題目", control: "text", required: true },
      FINANCIAL_GRID,
    ]);
    const result = expandFields(normalized.fields);
    expect(result.fields[0]).toMatchObject({ id: "q1", control: "text", required: true });
    expect(result.fields[0].grid).toBeUndefined();
    expect(result.fields).toHaveLength(7);
  });

  test("展开格子 id 与兄弟字段冲突时拒绝", () => {
    const result = expandFields([
      { id: "history_fy2022_revenue", label: "撞名", control: "text", required: false },
      FINANCIAL_GRID,
    ]);
    expect(result).toMatchObject({
      errorCode: "grid_cell_id_conflict",
      parameters: { id: "history_fy2022_revenue", grid: "history" },
    });
  });

  test("grid 行列必填、id 合法、列控件封闭", () => {
    expect(normalizeFields([{ ...FINANCIAL_GRID, required: true }]).fields[0].required).toBe(false);
    expect(normalizeFields([{ ...FINANCIAL_GRID, grid: { rows: [], columns: FINANCIAL_GRID.grid.columns } }]))
      .toMatchObject({ errorCode: "grid_rows_required" });
    expect(normalizeFields([{ ...FINANCIAL_GRID, grid: { rows: FINANCIAL_GRID.grid.rows, columns: [] } }]))
      .toMatchObject({ errorCode: "grid_columns_required" });
    expect(
      normalizeFields([
        { ...FINANCIAL_GRID, grid: { rows: [{ id: "9x", label: "坏" }], columns: FINANCIAL_GRID.grid.columns } },
      ]),
    ).toMatchObject({ errorCode: "grid_row_id_invalid" });
    expect(
      normalizeFields([
        {
          ...FINANCIAL_GRID,
          grid: { rows: FINANCIAL_GRID.grid.rows, columns: [{ id: "c1", label: "x", control: "file", required: false }] },
        },
      ]),
    ).toMatchObject({ errorCode: "grid_column_control_invalid" });
    expect(
      normalizeFields([
        {
          ...FINANCIAL_GRID,
          grid: {
            rows: FINANCIAL_GRID.grid.rows,
            columns: [{ id: "c1", label: "x", control: "select", required: false, options: [] }],
          },
        },
      ]),
    ).toMatchObject({ errorCode: "grid_column_options_required" });
  });

  test("radio 字段必须显式提供 options，且是封闭词表成员", () => {
    const ok = normalizeFields([{ id: "rating", label: "評分", control: "radio", required: true, options: ["1", "2", "3"] }]);
    expect(ok.errorCode).toBeUndefined();
    expect(ok.fields[0].options).toEqual(["1", "2", "3"]);
    expect(normalizeFields([{ id: "rating", label: "評分", control: "radio", required: true }]))
      .toMatchObject({ errorCode: "radio_options_required", parameters: { id: "rating" } });
  });

  test("number decimals 只在 0–6，缺省保持整数语义", () => {
    expect(normalizeFields([{ id: "amount", label: "金額", control: "number", required: false, decimals: 2 }]).fields[0].decimals).toBe(2);
    expect(normalizeFields([{ id: "amount", label: "金額", control: "number", required: false }]).fields[0].decimals).toBeUndefined();
    expect(normalizeFields([{ id: "amount", label: "金額", control: "number", required: false, decimals: 7 }]))
      .toMatchObject({ errorCode: "decimals_invalid", parameters: { id: "amount" } });
  });
});

const MIXED_FIELDS = [
  { id: "rating", label: "評分", control: "radio", required: true, options: ["1", "2", "3"] },
  {
    id: "history",
    label: "歷史收支",
    control: "grid",
    required: false,
    grid: {
      rows: [
        { id: "fy2022", label: "FY2022" },
        { id: "fy2023", label: "FY2023" },
      ],
      columns: [
        { id: "revenue", label: "Total Revenue (HK$)", control: "number", required: true, decimals: 2 },
        { id: "market", label: "Market", control: "select", required: false, options: ["CN", "HK"] },
        { id: "ok", label: "Confirmed", control: "checkbox", required: false },
      ],
    },
  },
  { id: "remark", label: "Remarks", control: "textarea", required: false },
];

test.describe("grid 渲染与抽取同构", () => {
  test("渲染出 radio 组与 grid 表格，抽取回同一份字段声明", () => {
    const normalized = normalizeFields(MIXED_FIELDS);
    const html = renderFormHtml({ id: "matrix-1", name: "財務矩陣", formVersion: 2 }, normalized.fields, { formVersion: 2 });
    expect(html).toContain('data-field-id="history"');
    expect(html).not.toMatch(/data-grid=["']\{/);
    expect(html).toContain('data-grid-column-id="revenue"');
    expect(html).toContain('name="history_fy2022_revenue"');
    const ledger = extractFromHtml(html);
    expect(ledger.ownerAgent).toBe("matrix-1");
    expect(ledger.formVersion).toBe(2);
    expect(ledger.fields).toEqual(normalized.fields);
  });

  test("手写 grid 基准夹具可抽出同一份声明（独立 Oracle）", () => {
    const html = readFileSync(join(ROOT, "tests", "fixtures", "grid-sample", "form.html"), "utf8");
    const expected = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "grid-sample", "ledger.expected.json"), "utf8"));
    expect(extractFromHtml(html)).toEqual(expected);
  });

  test("grid 格与声明不符时抽取失败，不发明栏", () => {
    const html = renderFormHtml({ id: "bad-1", name: "壞表", formVersion: 1 }, normalizeFields(MIXED_FIELDS).fields, { formVersion: 1 })
      .replace('type="number" required step="0.01"', 'type="text" required step="0.01"');
    expect(() => extractFromHtml(html)).toThrow(/控件类型不符/);
  });
});
