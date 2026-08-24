import { expect, test } from "@playwright/test";
import { agentOf, resetStore, saveAgentFields } from "../support/project-fixture.mjs";
import { openRecords, selectWorkspace, userFace, workspaceButton } from "../support/ui-actions.mjs";

test.describe("作者工作台布局与响应式", () => {
  test("统一 mock 来源公开版本身份并默认打开验收场景", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/?scenario=financial-grid-v027");
    await expect(page.locator("#demo-badge")).toContainText("TEST MOCK · 1.0.0-alpha.1 · mock-v0.27.1");
    await expect(page.locator("#stage-title")).toHaveText("財務矩陣示例");
    await expect(page.frameLocator('iframe[name="face"]').locator(".grid-table")).toBeVisible();
    await expect(page.locator("#property-inspector")).toContainText("表格");
    await expect(workspaceButton(page, "financial-grid-v027")).toHaveClass(/active/);

    const face = page.frameLocator('iframe[name="face"]');
    const matrixRhythm = await face.locator(".grid-table").evaluate((table) => {
      const input = table.querySelector('input[type="text"], input[type="number"], select');
      const columnHeader = table.querySelector("thead th[data-grid-column-id]");
      const rowHeader = table.querySelector("tbody th[data-grid-row-id]");
      return {
        inputHeight: input?.getBoundingClientRect().height || 0,
        inputWidth: input?.getBoundingClientRect().width || 0,
        columnHeaderAlign: columnHeader ? getComputedStyle(columnHeader).textAlign : "",
        rowHeaderWidth: rowHeader?.getBoundingClientRect().width || 0,
      };
    });
    expect(matrixRhythm.inputHeight).toBeLessThanOrEqual(44);
    expect(matrixRhythm.inputWidth).toBeLessThan(300);
    expect(matrixRhythm.columnHeaderAlign).toBe("center");
    expect(matrixRhythm.rowHeaderWidth).toBeGreaterThanOrEqual(90);
    expect(matrixRhythm.rowHeaderWidth).toBeLessThanOrEqual(110);
    await expect(face.locator(".field-radio")).toHaveCSS("border-top-style", "none");
  });

  test("旧身份选择地址回到统一工作区，页面资产不再暴露", async ({ page, request }) => {
    await page.goto("/session?next=/");
    await expect(page).toHaveURL(new RegExp(`^http://127\\.0\\.0\\.1:${process.env.FORM_STUDIO_TEST_PORT || 4191}/$`));
    await expect(page.getByText("選擇這次要體驗的身份")).toHaveCount(0);
    expect((await request.get("/session/main.js")).status()).toBe(404);
  });

  test("同一 agent 用两层页签切换输入表单与收到的提交", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");

    await expect(page.locator("#view-design")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#designer")).toBeVisible();
    await expect(page.locator("#preview-panel")).toBeVisible();
    await expect(page.locator("#records")).toBeHidden();

    await page.locator("#view-design").focus();
    await page.locator("#view-design").press("ArrowRight");
    await expect(page.locator("#view-submissions")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#records")).toBeVisible();
    await expect(page.locator("#designer")).toBeHidden();

    await page.locator("#view-submissions").press("ArrowLeft");
    await expect(page.locator("#view-design")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#designer")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      stage: document.querySelector(".stage").scrollWidth - document.querySelector(".stage").clientWidth,
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.stage).toBeLessThanOrEqual(0);
  });

  test("左侧可筛选页面，字段接口信息独立打开且不挤压设计区", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.locator('[data-list-filter="published"]').click();
    await expect(workspaceButton(page, "exercise-1")).toBeVisible();
    await expect(workspaceButton(page, "exercise-2")).toHaveCount(0);
    await page.locator('[data-list-filter="draft"]').click();
    await expect(workspaceButton(page, "exercise-2")).toBeVisible();
    await selectWorkspace(page, "exercise-2");
    const before = await page.locator(".design-surface").evaluate((element) => {
      const canvas = element.querySelector("#preview-panel").getBoundingClientRect();
      const inspector = element.querySelector("#property-inspector").getBoundingClientRect();
      return { canvasWidth: canvas.width, inspectorWidth: inspector.width };
    });
    const trigger = page.getByRole("button", { name: "高級：數據接口" });
    await trigger.click();
    const contractDialog = page.getByRole("dialog", { name: /接口資訊/ });
    await expect(contractDialog).toBeVisible();
    await expect(contractDialog.locator(".field-contract-row")).toHaveCount(1);
    await expect(contractDialog.locator(".field-contract-row").first()).toContainText("customer_name");
    await expect(contractDialog.getByRole("button", { name: "複製 ID" }).first()).toBeVisible();
    await expect(contractDialog.getByRole("button", { name: "查看全部欄位接口" })).toBeVisible();
    const after = await page.locator(".design-surface").evaluate((element) => {
      const canvas = element.querySelector("#preview-panel").getBoundingClientRect();
      const inspector = element.querySelector("#property-inspector").getBoundingClientRect();
      return { canvasWidth: canvas.width, inspectorWidth: inspector.width };
    });
    expect(after).toEqual(before);
    await contractDialog.getByRole("button", { name: "完成" }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(contractDialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("目录与标题区显示发布标签，不把内部 formVersion 当产品文案", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");

    const published = workspaceButton(page, "exercise-1");
    const unpublished = workspaceButton(page, "exercise-2");
    await expect(published.locator(".mini-status")).toHaveText("已發布 · v1.0");
    await expect(unpublished.locator(".mini-status")).toHaveText("未發布");

    await selectWorkspace(page, "exercise-1");
    await expect(page.locator("#publication-badge")).toHaveText("已發布 · v1.0");
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context .owner-popover")).toContainText("線上 v1.0");
    await page.locator("#more-actions > summary").click();
    const deactivate = page.getByRole("button", { name: "停用填寫頁" });
    await expect(deactivate).toBeVisible();
    await deactivate.click();
    await expect(page.locator("#confirm-dialog")).toContainText("草稿設計和歷史提交會保留");
    await expect(page.locator("#confirm-dialog")).not.toContainText(/綁定|inputBag/);
    await page.locator("#confirm-dialog").getByRole("button", { name: "取消" }).click();

    const agent = await agentOf(request, "exercise-1");
    await saveAgentFields(request, "exercise-1", [...agent.fields, { id: "next_step", label: "下一步", control: "text", required: false }]);
    await page.reload();
    await selectWorkspace(page, "exercise-1");
    await expect(workspaceButton(page, "exercise-1").locator(".mini-status")).toHaveText("線上 v1.0 · 草稿有更新");
    await expect(page.locator("#publication-badge")).toHaveText("線上 v1.0 · 草稿有更新");
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context .owner-popover")).toContainText("線上 v1.0 · 草稿有未發布更新");
  });

  test("字段接口信息默认只读，明确修改后只更新草稿 ID", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    await page.getByRole("button", { name: "高級：數據接口" }).click();
    const dialog = page.getByRole("dialog", { name: /接口資訊/ });
    const companyRow = dialog.locator(".field-contract-row").filter({ hasText: "公司或品牌" });
    await expect(companyRow).toContainText("company_name");
    await expect(companyRow.getByRole("textbox")).toHaveCount(0);
    await companyRow.getByText("進階：修改草稿 ID").click();
    await companyRow.getByRole("button", { name: "修改草稿 ID" }).click();
    await expect(companyRow).toContainText("修改只進入草稿");
    await companyRow.getByRole("textbox", { name: "新的穩定 ID" }).fill("company_key");
    await companyRow.getByRole("button", { name: "確認修改 ID" }).click();
    await expect(dialog.getByRole("status")).toContainText("草稿 ID 已更新為 company_key");
    const agent = await agentOf(request, "exercise-1");
    expect(agent.fields[0].id).toBe("company_key");
    expect(agent.published.fields[0].id).toBe("company_name");
  });

  test("宽屏为中央真实画布与右侧属性栏，窄屏改为无横溢出的属性抽屉", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    const face = await userFace(page);
    await expect(face.locator(".form-shell")).toBeVisible();
    await expect(page.locator("#face-mode")).toHaveText("已發布 · v1.0");
    await expect(face.locator(".preview-note")).toHaveCount(0);
    await expect(face.getByRole("button", { name: "設計模式不會提交" })).toBeDisabled();
    await page.locator("#canvas-mode-preview").click();
    await expect(face.getByRole("button", { name: "作者預覽不會提交" })).toBeDisabled();
    await expect(face.locator(".preview-submit-note")).toContainText("不會把測試內容加入正式收件箱");
    await page.locator("#canvas-mode-design").click();
    await expect(page.locator("#designer")).toBeVisible();

    const wide = await page.locator(".design-surface").evaluate((element) => {
      const canvas = element.querySelector("#preview-panel").getBoundingClientRect();
      const inspector = element.querySelector("#property-inspector").getBoundingClientRect();
      return {
        canvasRight: canvas.right,
        canvasWidth: canvas.width,
        inspectorLeft: inspector.left,
        inspectorWidth: inspector.width,
        oldEditorCount: element.querySelectorAll(".editor-pane, .design-row").length,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }; });
    expect(wide.inspectorLeft).toBeGreaterThanOrEqual(wide.canvasRight);
    expect(wide.canvasWidth).toBeGreaterThanOrEqual(620);
    expect(wide.inspectorWidth).toBeGreaterThanOrEqual(320);
    expect(wide.inspectorWidth).toBeLessThanOrEqual(360);
    expect(wide.oldEditorCount).toBe(0);
    expect(wide.pageOverflow).toBeLessThanOrEqual(0);
    const authorFormWidth = await face.locator("main").evaluate((element) => element.getBoundingClientRect().width);
    expect(authorFormWidth).toBeGreaterThanOrEqual(880);
    expect(authorFormWidth).toBeLessThanOrEqual(940);

    await page.setViewportSize({ width: 1180, height: 800 });
    await face.locator('[data-field-id="company_name"]').click();
    await expect(page.locator("#designer")).toHaveClass(/inspector-open/);
    await expect.poll(() => page.locator("#property-inspector").evaluate((element) => Math.round(element.getBoundingClientRect().right))).toBe(1180);
    const drawer = await page.locator("#property-inspector").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, right: rect.right, viewport: window.innerWidth };
    });
    expect(drawer.width).toBe(360);
    expect(drawer.right).toBe(drawer.viewport);

    await page.setViewportSize({ width: 920, height: 800 });
    await openRecords(page);
    const records = await page.locator(".records-layout").evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelOverflow: element.closest("#records").scrollWidth - element.closest("#records").clientWidth,
    }));
    expect(records.columns).toBe(1);
    expect(records.pageOverflow).toBeLessThanOrEqual(0);
    expect(records.panelOverflow).toBeLessThanOrEqual(0);
  });

  test("右侧预览支持按钮与 Ctrl 滚轮缩放，普通滚轮保留滚动语义", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    const face = await userFace(page);

    await expect(page.locator("#preview-zoom-value")).toHaveText("100%");
    await page.locator("#preview-zoom-in").click();
    await expect(page.locator("#preview-zoom-value")).toHaveText("110%");
    await expect.poll(() => face.locator("html").evaluate((element) => element.style.zoom)).toBe("1.1");

    await face.locator("body").evaluate((element) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
    });
    await expect(page.locator("#preview-zoom-value")).toHaveText("110%");

    await face.locator("body").evaluate((element) => {
      element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }));
    });
    await expect(page.locator("#preview-zoom-value")).toHaveText("120%");
    await page.locator("#preview-zoom-reset").click();
    await expect(page.locator("#preview-zoom-value")).toHaveText("100%");
  });

  test("390px 画布与全宽属性视图都没有页面级横向溢出", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?scenario=financial-grid-v027");
    const canvas = page.frameLocator('iframe[name="face"]');
    await canvas.locator('[data-grid-column-id="revenue"]').click();
    await expect(page.locator("#designer")).toHaveClass(/inspector-open/);
    await expect.poll(() => page.locator("#property-inspector").evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "← 返回畫布" }).click();
    await expect(page.locator("#inspector-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => canvas.locator('[data-grid-column-id="revenue"]').evaluate((element) => element === document.activeElement)).toBe(true);
    const gridOverflow = await canvas.locator(".grid-scroll").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(gridOverflow.scroll).toBeGreaterThan(gridOverflow.client);
    expect(await canvas.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
