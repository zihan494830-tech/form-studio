import { expect, test } from "@playwright/test";
import { agentOf, resetStore, saveAgentFields } from "../support/project-fixture.mjs";
import { openPublishedFace, publishWorkspace, selectWorkspace, submitFace } from "../support/ui-actions.mjs";

test.describe("工作台表格字段编辑（v0.27）", () => {
  test("在畫布與屬性欄改行列及小數位、發布後用戶頁出真表格並入袋", async ({ page, context, request }) => {
    await resetStore(request);
    const seeded = [{
      id: "history", label: "歷史收支", control: "grid", required: false,
      grid: {
        rows: [{ id: "r1", label: "第 1 行" }],
        columns: [
          { id: "c1", label: "第 1 列", control: "text", required: true },
          { id: "c2", label: "第 2 列", control: "text", required: false },
        ],
      },
    }];
    expect((await saveAgentFields(request, "exercise-2", seeded)).ok()).toBeTruthy();

    await page.goto("/");
    await selectWorkspace(page, "exercise-2");
    const canvas = page.frameLocator('iframe[name="face"]');
    const inspector = page.locator("#property-inspector");
    await expect(inspector).toContainText("表格");
    await expect(inspector.locator('[data-inspector-change="field-required"]')).toHaveCount(0);

    // composite grid 没有含糊的顶层必填；删到最后一行会给出可见反馈。
    await canvas.locator('[data-grid-row-id="r1"]').click();
    await expect(inspector).toContainText("目前行");
    await inspector.locator('[data-inspector-action="delete-row"]').click();
    await expect(page.locator("#action-error")).toContainText("至少要保留一行");

    await inspector.locator('[data-inspector-change="row-label"]').fill("FY2022");
    await inspector.locator('[data-inspector-change="row-label"]').press("Enter");
    await inspector.getByRole("button", { name: "高級：數據接口" }).click();
    const dialog = page.locator("#field-contract-dialog");
    let gridContract = dialog.locator(".field-contract-row");
    await expect(gridContract).toContainText("目前行");
    await gridContract.getByText("進階：修改草稿 ID").click();
    await gridContract.locator('[data-contract-action="edit"][data-kind="row"]').click();
    await gridContract.getByRole("textbox", { name: "新的穩定 ID" }).fill("fy2022");
    await gridContract.locator('[data-contract-action="save"][data-kind="row"]').click();
    await dialog.getByRole("button", { name: "完成" }).click();

    await canvas.locator('[data-grid-column-id="c1"]').click();
    await expect(inspector).toContainText("目前列");
    await inspector.locator('[data-inspector-change="column-label"]').fill("Total Revenue (HK$)");
    await inspector.locator('[data-inspector-change="column-label"]').press("Enter");
    await inspector.locator('[data-inspector-change="column-control"]').selectOption("number");
    await expect(inspector.locator('[data-inspector-change="column-decimals"]')).toHaveCount(1);
    await inspector.locator('[data-inspector-change="column-decimals"]').fill("2");
    await inspector.locator('[data-inspector-change="column-decimals"]').press("Enter");
    await inspector.getByRole("button", { name: "高級：數據接口" }).click();
    gridContract = dialog.locator(".field-contract-row");
    await expect(gridContract).toContainText("目前列");
    await gridContract.getByText("進階：修改草稿 ID").click();
    await gridContract.locator('[data-contract-action="edit"][data-kind="column"]').click();
    await gridContract.getByRole("textbox", { name: "新的穩定 ID" }).fill("revenue");
    await gridContract.locator('[data-contract-action="save"][data-kind="column"]').click();
    await dialog.getByRole("button", { name: "完成" }).click();

    // 加一列再刪掉：行列按钮可往返
    await inspector.locator('[data-inspector-action="add-column"]').click();
    await expect(inspector.locator(".inspector-item")).toHaveCount(3);
    await inspector.locator('[data-inspector-action="delete-column"]').click();
    await page.locator("#confirm-accept").click();
    await expect(inspector.locator(".inspector-item")).toHaveCount(2);

    await publishWorkspace(page);
    const face = await openPublishedFace(context, "exercise-2");
    await expect(face.locator(".grid-table")).toBeVisible();
    await expect(face.locator('[name="history_fy2022_revenue"]')).toHaveCount(1);
    await expect(face.getByRole("spinbutton", { name: /歷史收支 FY2022 Total Revenue/ })).toBeVisible();
    await face.setViewportSize({ width: 390, height: 844 });
    const gridSizing = await face.locator(".grid-scroll").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(gridSizing.scrollWidth).toBeGreaterThan(gridSizing.clientWidth);
    expect(await face.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await face.locator('[name="history_fy2022_revenue"]').fill("12.34");
    await submitFace(face);
    await expect(face.locator("#receipt")).toHaveClass(/show/);

    const values = (await agentOf(request, "exercise-2")).inputBag[0].values;
    expect(values.history_fy2022_revenue).toBe("12.34");
    expect(values.history).toBeUndefined();

    // 收件箱详情按原定义还原 grid 格标签和值
    await page.locator("#view-submissions").click();
    await page.locator(".bag-item").click();
    await expect(page.locator("#submission-detail")).toContainText("12.34");
    await expect(page.locator("#submission-detail")).toContainText("FY2022");
  });

  test("欄位接口資訊面板為表格列出并可复制格子 ID", async ({ page, context, request }) => {
    await resetStore(request);
    const fields = [{
      id: "history", label: "歷史收支", control: "grid", required: false,
      grid: {
        rows: [{ id: "fy2022", label: "FY2022" }],
        columns: [
          { id: "revenue", label: "Revenue", control: "number", required: true, decimals: 2 },
          { id: "cost", label: "Cost", control: "number", required: true },
        ],
      },
    }];
    expect((await saveAgentFields(request, "exercise-2", fields)).ok()).toBeTruthy();
    await page.goto("/");
    await selectWorkspace(page, "exercise-2");
    await page.getByRole("button", { name: "高級：數據接口" }).click();
    const dialog = page.locator("#field-contract-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".field-contract-row")).toHaveCount(1);
    await dialog.getByText("查看 2 個派生格子 ID").click();
    await expect(dialog.locator(".contract-cells code")).toHaveText(["history_fy2022_revenue", "history_fy2022_cost"]);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog.locator('[data-contract-action="copy-cell"]').first().click();
    await expect(dialog.getByRole("status")).toContainText("history_fy2022_revenue");
  });
});
