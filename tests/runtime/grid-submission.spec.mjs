import { expect, test } from "@playwright/test";
import { createInMemoryAgentRepository } from "../../src/infrastructure/in-memory-agent-repository.mjs";
import { submitToAgent } from "../../src/application/submit-to-agent.mjs";
import { attachAgentInputConfig, deliveryForEnvelope } from "../../src/domain/agent/agent-input-config.mjs";
import { agentOf, resetStore } from "../support/project-fixture.mjs";
import { submitFace } from "../support/ui-actions.mjs";
import { SUBMISSION_CREATE } from "../../src/domain/access/capabilities.mjs";

const GRID_FIELDS = [
  { id: "rating", label: "整體評分", control: "radio", required: true, options: ["1", "2", "3"] },
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
      ],
    },
  },
  { id: "remark", label: "Remarks", control: "textarea", required: false },
];

const studentActor = {
  id: "student-mock-1",
  name: "测试学生",
  role: "student",
  verifiedBy: "grid-submission-test",
  capabilities: [SUBMISSION_CREATE],
  scope: { tenantId: "test-tenant", attributes: { classId: "class-1" }, classId: "class-1" },
};

function seedGridAgent() {
  return [{
    id: "matrix-1",
    name: "財務矩陣",
    origin: "retrofit",
    sourceSystem: "local-fixture",
    authorization: { basis: "local-fixture", confirmedAt: null },
    access: { version: "agent-access/v1", tenantId: "test-tenant", classId: "class-1", authorIds: ["author-1"], teacherIds: ["teacher-1"] },
    formVersion: 1,
    fields: GRID_FIELDS,
    published: { formVersion: 1, fields: GRID_FIELDS, submit: { label: "提交", to: "agent-input" } },
    binding: {
      version: "owner-agent-binding/v1", ownerAgent: "matrix-1", sourceSystem: "local-fixture",
      formId: "matrix-1", publishedFormVersion: 1, entryMode: "form-studio-sidecar",
      status: "published", authorization: { basis: "local-fixture", confirmedAt: null },
    },
    inputBag: [],
  }];
}

test.describe("grid / radio 提交校验与输入映射", () => {
  test("缺必填格与越界选项逐格 fail closed，信封平铺格子 id", () => {
    const repository = createInMemoryAgentRepository(seedGridAgent());

    const missing = submitToAgent(repository, "matrix-1", {
      formVersion: 1,
      values: { rating: "2", history_fy2022_revenue: "1.20", history_fy2022_market: "CN" },
    }, { actor: studentActor });
    expect(missing).toMatchObject({ status: 400, missing: ["history_fy2023_revenue"] });
    expect(repository.get("matrix-1").inputBag).toHaveLength(0);

    const invalid = submitToAgent(repository, "matrix-1", {
      formVersion: 1,
      values: {
        rating: "9", history_fy2022_revenue: "1.20", history_fy2022_market: "CN",
        history_fy2023_revenue: "2.00", history_fy2023_market: "HK",
      },
    }, { actor: studentActor });
    expect(invalid).toMatchObject({ status: 400, invalid: ["rating"] });

    const badDecimals = submitToAgent(repository, "matrix-1", {
      formVersion: 1,
      values: {
        rating: "1", history_fy2022_revenue: "1.234", history_fy2022_market: "CN",
        history_fy2023_revenue: "2.00", history_fy2023_market: "HK",
      },
    }, { actor: studentActor });
    expect(badDecimals).toMatchObject({ status: 400, invalid: ["history_fy2022_revenue"] });

    const ok = submitToAgent(repository, "matrix-1", {
      formVersion: 1,
      values: {
        rating: "1", history_fy2022_revenue: "1.20", history_fy2022_market: "CN",
        history_fy2023_revenue: "2.00", history_fy2023_market: "HK", remark: "填好",
      },
    }, { actor: studentActor });
    expect(ok.status).toBe(200);
    expect(ok.envelope.values).toEqual({
      rating: "1",
      history_fy2022_revenue: "1.20", history_fy2022_market: "CN",
      history_fy2023_revenue: "2.00", history_fy2023_market: "HK",
      remark: "填好",
    });
    expect(ok.envelope.values.history).toBeUndefined();
  });

  test("服务端 number 采用与浏览器 step 相同的数值语义", () => {
    const repository = createInMemoryAgentRepository(seedGridAgent());
    const values = {
      rating: "1", history_fy2022_revenue: "1.230", history_fy2022_market: "CN",
      history_fy2023_revenue: "2.00", history_fy2023_market: "HK", remark: "",
    };
    expect(submitToAgent(repository, "matrix-1", { formVersion: 1, values }, { actor: studentActor }).status).toBe(200);
    expect(submitToAgent(repository, "matrix-1", {
      formVersion: 1,
      values: { ...values, history_fy2022_revenue: "1e-7" },
    }, { actor: studentActor })).toMatchObject({ status: 400, invalid: ["history_fy2022_revenue"] });
  });

  test("agent 输入映射可引用格子 id，grid 本身不可映射", () => {
    const agent = { id: "matrix-1", fields: GRID_FIELDS, published: { formVersion: 1, fields: GRID_FIELDS } };
    const profile = {
      version: "agent-input-profile/v1", ownerAgent: "matrix-1", profileVersion: 1,
      skillId: "market-analysis", inputMode: "structured",
      transport: { kind: "local-recording", target: "matrix-local" },
    };
    const mapping = {
      version: "agent-input-mapping/v1", ownerAgent: "matrix-1", profileVersion: 1,
      inputMode: "structured", formVersion: 1,
      fields: [
        { fieldId: "history_fy2022_revenue", targetKey: "fy2022Revenue", transform: "number", required: true },
        { fieldId: "rating", targetKey: "rating", transform: "string", required: false },
      ],
    };
    const configured = attachAgentInputConfig(agent, { profile, mapping });
    const delivery = deliveryForEnvelope(configured, {
      ownerAgent: "matrix-1", formVersion: 1,
      values: { history_fy2022_revenue: "12.34", rating: "2" },
    });
    expect(delivery).toMatchObject({ payload: { fy2022Revenue: 12.34, rating: "2" } });

    expect(() => attachAgentInputConfig(agent, {
      profile,
      mapping: { ...mapping, fields: [{ fieldId: "history", targetKey: "grid", transform: "string", required: true }] },
    })).toThrow("未知字段");
  });

  test("浏览器端 radio / grid 整表提交入袋", async ({ page, request }) => {
    await resetStore(request);
    const initial = await agentOf(request, "exercise-2");
    const saved = await request.put("/api/agents/exercise-2/fields", {
      headers: { "If-Match": `"agent-${initial.revision}"` }, data: { fields: GRID_FIELDS },
    });
    expect(saved.ok()).toBeTruthy();
    const savedAgent = await saved.json();
    expect((await request.post("/api/agents/exercise-2/publish", {
      headers: { "If-Match": `"agent-${savedAgent.revision}"` },
    })).ok()).toBeTruthy();
    await page.goto("/a/exercise-2");
    await page.locator('input[name="rating"][value="2"]').check();
    await page.locator("#history_fy2022_revenue").fill("12.34");
    await page.locator("#history_fy2022_market").selectOption("CN");
    await page.locator("#history_fy2023_revenue").fill("1.234");
    await page.locator("#history_fy2023_market").selectOption("HK");
    expect(await page.locator("#agent-form").evaluate((form) => form.checkValidity())).toBe(false);
    await submitFace(page);
    expect((await agentOf(request, "exercise-2")).inputBag).toHaveLength(0);

    await page.locator("#history_fy2023_revenue").fill("1.230");
    expect(await page.locator("#agent-form").evaluate((form) => form.checkValidity())).toBe(true);
    await page.locator("#history_fy2023_revenue").fill("1e-7");
    expect(await page.locator("#agent-form").evaluate((form) => form.checkValidity())).toBe(false);
    await page.locator("#history_fy2023_revenue").fill("56.78");
    await page.locator("#remark").fill("填好");
    await submitFace(page);
    await expect(page.locator("#receipt")).toHaveClass(/show/);
    const envelope = (await agentOf(request, "exercise-2")).inputBag[0];
    expect(envelope.values).toEqual({
      rating: "2",
      history_fy2022_revenue: "12.34", history_fy2022_market: "CN",
      history_fy2023_revenue: "56.78", history_fy2023_market: "HK",
      remark: "填好",
    });
  });
});
