import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";
import { addField, selectWorkspace } from "../support/ui-actions.mjs";

test.describe("单画布作者流", () => {
  test("画布字段、grid 行列和格子驱动同一个上下文属性栏", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/?scenario=financial-grid-v027");
    const canvas = page.frameLocator('iframe[name="face"]');
    const inspector = page.locator("#property-inspector");

    await canvas.locator('[data-field-id="overall_rating"]').click();
    await expect(inspector.locator(".inspector-head h2")).toHaveText("整體評分");
    await expect(canvas.locator('[data-field-id="overall_rating"]')).toHaveAttribute("data-authoring-selected", "field");

    await canvas.locator('[data-field-id="history"] > legend').click();
    await expect(inspector.getByRole("tab", { name: "基本" })).toHaveAttribute("aria-selected", "true");
    await inspector.getByRole("tab", { name: "基本" }).focus();
    await inspector.getByRole("tab", { name: "基本" }).press("ArrowRight");
    await expect(inspector.getByRole("tab", { name: /行 4/ })).toHaveAttribute("aria-selected", "true");
    await inspector.getByRole("tab", { name: /行 4/ }).press("ArrowRight");
    await expect(inspector.getByRole("tab", { name: /列 3/ })).toHaveAttribute("aria-selected", "true");

    await canvas.locator('[data-grid-row-id="fy2023"]').focus();
    await canvas.locator('[data-grid-row-id="fy2023"]').press("Enter");
    await expect(inspector).toContainText("FY2023");
    await expect(canvas.locator('[data-grid-row-id="fy2023"]')).toHaveAttribute("data-authoring-selected", "row-header");

    await canvas.locator('[data-grid-column-id="cost"]').click();
    await expect(inspector.locator('[data-inspector-change="column-label"]')).toHaveValue("Cost (HK$)");
    await canvas.locator('[data-field-id="history"] tbody tr').first().locator("td").first().click();
    await expect(inspector.locator('[data-inspector-change="column-label"]')).toHaveValue("Revenue (HK$)");
  });

  test("保存、添加、删除和有损类型转换保持稳定选择", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    const canvas = page.frameLocator('iframe[name="face"]');
    const inspector = page.locator("#property-inspector");

    await canvas.locator('[data-field-id="company_name"]').click();
    const label = inspector.locator('[data-inspector-change="field-label"]');
    await label.fill("公司名稱");
    await label.press("Enter");
    await expect(canvas.locator('[data-field-id="company_name"]')).toHaveAttribute("data-authoring-selected", "field");
    expect((await agentOf(request, "exercise-1")).fields[0].label).toBe("公司名稱");

    await canvas.locator('[data-field-id="target_market"]').click();
    await inspector.locator('[data-inspector-change="field-control"]').selectOption("text");
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await page.locator("#confirm-dialog").getByRole("button", { name: "取消" }).click();
    await expect(inspector.locator('[data-inspector-change="field-control"]')).toHaveValue("select");
    expect((await agentOf(request, "exercise-1")).fields.find((field) => field.id === "target_market").control).toBe("select");

    await addField(page, "textarea");
    await expect(inspector.locator(".inspector-head h2")).toHaveText("欄位 6");
    await expect(canvas.locator('[data-field-id="f1"]')).toHaveAttribute("data-authoring-selected", "field");
    const selectedBox = await canvas.locator('[data-field-id="f1"]').boundingBox();
    expect(selectedBox.y).toBeGreaterThanOrEqual(0);
    expect(selectedBox.y).toBeLessThan(900);

    await inspector.locator('[data-inspector-action="delete-field"]').click();
    await page.locator("#confirm-accept").click();
    await expect(inspector.locator(".inspector-head h2")).toHaveText("包含競品對比");
    await expect(inspector.locator('[data-inspector-change="field-label"]')).toBeFocused();
  });

  test("修改 grid 行列 ID 只推进草稿，重新发布前公开版本不变", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/?scenario=financial-grid-v027");
    const canvas = page.frameLocator('iframe[name="face"]');
    const inspector = page.locator("#property-inspector");

    await canvas.locator('[data-grid-row-id="fy2022"]').click();
    await inspector.getByRole("button", { name: "查看接口資訊" }).click();
    const dialog = page.locator("#field-contract-dialog");
    let gridContract = dialog.locator(".field-contract-row");
    await gridContract.getByText("進階：修改草稿 ID").click();
    await gridContract.locator('[data-contract-action="edit"][data-kind="row"]').click();
    await gridContract.getByRole("textbox", { name: "新的穩定 ID" }).fill("fy22");
    await gridContract.locator('[data-contract-action="save"][data-kind="row"]').click();
    await dialog.getByRole("button", { name: "完成" }).click();
    await canvas.locator('[data-grid-column-id="revenue"]').click();
    await inspector.getByRole("button", { name: "查看接口資訊" }).click();
    gridContract = dialog.locator(".field-contract-row");
    await gridContract.getByText("進階：修改草稿 ID").click();
    await gridContract.locator('[data-contract-action="edit"][data-kind="column"]').click();
    await gridContract.getByRole("textbox", { name: "新的穩定 ID" }).fill("income");
    await gridContract.locator('[data-contract-action="save"][data-kind="column"]').click();

    const draft = await agentOf(request, "financial-grid-v027");
    const draftGrid = draft.fields.find((field) => field.id === "history").grid;
    const publishedGrid = draft.published.fields.find((field) => field.id === "history").grid;
    expect(draftGrid.rows[0].id).toBe("fy22");
    expect(draftGrid.columns[0].id).toBe("income");
    expect(publishedGrid.rows[0].id).toBe("fy2022");
    expect(publishedGrid.columns[0].id).toBe("revenue");
    expect(draft.fieldInterfaces.some((item) => item.id === "history_fy22_income")).toBe(true);
    expect((await request.get("/a/financial-grid-v027")).text()).resolves.toContain('name="history_fy2022_revenue"');
  });

  test("保存失败保留局部输入，Escape 恢复最后成功值", async ({ page, request }) => {
    await resetStore(request);
    await page.route("**/api/agents/exercise-1/fields", (route) => route.fulfill({
      status: 400, contentType: "application/json", body: JSON.stringify({ error: "simulated_save_failure" }),
    }));
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    const input = page.locator('[data-inspector-change="field-label"]');
    await input.fill("尚未保存的名稱");
    await input.press("Enter");
    await expect(page.locator(".inspector-control-error")).toContainText("未能儲存");
    await expect(input).toHaveValue("尚未保存的名稱");
    await input.press("Escape");
    await expect(page.locator('[data-inspector-change="field-label"]')).toHaveValue("公司或品牌");
  });

  test("空表可从 form 状态恢复，删空后回到页面属性", async ({ page, request }) => {
    await resetStore(request);
    expect((await request.put("/api/agents/exercise-2/fields", { data: { fields: [] } })).ok()).toBeTruthy();
    await page.goto("/");
    await selectWorkspace(page, "exercise-2");
    const inspector = page.locator("#property-inspector");
    const canvas = page.frameLocator('iframe[name="face"]');
    await expect(inspector).toContainText("0 個欄位");
    await expect(canvas.locator("[data-field-id]")).toHaveCount(0);
    await addField(page, "text");
    await expect(inspector.locator(".inspector-head h2")).toHaveText("欄位 1");
    await inspector.locator('[data-inspector-action="delete-field"]').click();
    await page.locator("#confirm-accept").click();
    await expect(inspector).toContainText("0 個欄位");
    await expect(canvas.locator("[data-field-id]")).toHaveCount(0);
  });

  test("画布加载失败显示可恢复状态", async ({ page, request }) => {
    await resetStore(request);
    await page.route("**/preview/exercise-2?*", (route) => route.abort());
    await page.goto("/");
    await selectWorkspace(page, "exercise-2");
    await expect(page.locator("#face-hint")).toContainText("畫布未能載入");
    await page.unroute("**/preview/exercise-2?*");
    await page.locator("#refresh-btn").click();
    await expect(page.frameLocator('iframe[name="face"]').locator(".form-shell")).toBeVisible();
  });
});
