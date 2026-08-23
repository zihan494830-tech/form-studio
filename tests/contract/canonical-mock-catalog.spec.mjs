import { expect, test } from "@playwright/test";
import { expandFields } from "../../src/domain/form/expand-fields.mjs";
import { normalizeFields } from "../../src/domain/form/field-contract.mjs";
import { loadCanonicalMockCatalog } from "../../src/infrastructure/canonical-mock-catalog.mjs";

test("canonical mock catalog 是 demo/test 的唯一版本化内容源", () => {
  const catalog = loadCanonicalMockCatalog();
  expect(catalog).toMatchObject({
    schema: "form-studio-mock-catalog/v1",
    datasetRevision: "mock-v0.27.1",
    defaultScenario: "financial-grid-v027",
  });
  expect(catalog.datasetChecksum).toMatch(/^[a-f0-9]{64}$/);
  expect(new Set(catalog.agents.map((agent) => agent.id)).size).toBe(catalog.agents.length);
});

test("默认验收场景同时证明 radio、grid、decimals 与 12 个稳定格子 ID", () => {
  const catalog = loadCanonicalMockCatalog();
  const scenario = catalog.agents.find((agent) => agent.id === catalog.defaultScenario);
  const normalized = normalizeFields(scenario.fields);
  expect(normalized.errorCode).toBeUndefined();
  expect(normalized.fields.find((field) => field.control === "radio")?.options).toEqual(["1", "2", "3", "4", "5"]);

  const grid = normalized.fields.find((field) => field.control === "grid");
  const cells = expandFields([grid]).fields;
  expect(cells).toHaveLength(12);
  expect(cells.map((cell) => cell.id)).toContain("history_fy2025_market");
  expect(cells.find((cell) => cell.id === "history_fy2022_revenue")).toMatchObject({
    control: "number",
    required: true,
    decimals: 2,
  });
  expect(scenario.publishedDefinitions).toEqual([scenario.published]);
});
