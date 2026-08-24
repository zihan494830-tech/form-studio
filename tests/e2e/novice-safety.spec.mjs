import { expect, test } from "@playwright/test";
import { agentOf, publishAgent, resetStore, saveAgentFields } from "../support/project-fixture.mjs";
import { addField, selectWorkspace } from "../support/ui-actions.mjs";

test.describe("v0.28 新手安全閉環", () => {
  test("空表提供三步引導，新字段與 grid 列預設選填，示例不覆蓋已有字段", async ({ page, request }) => {
    await resetStore(request);
    await saveAgentFields(request, "exercise-2", []);
    await page.goto("/?scenario=exercise-2");
    const guide = page.locator("#empty-guide");
    await expect(guide).toBeVisible();
    await expect(page.locator("#face-wrap #empty-guide")).toHaveCount(0);
    await expect(page.locator("#copy-example")).toBeVisible();
    await guide.getByRole("button", { name: "關閉新手引導" }).click();
    await expect(guide).toBeHidden();
    await expect(page.locator("#add-field")).toBeFocused();

    await addField(page, "text");
    let agent = await agentOf(request, "exercise-2");
    expect(agent.fields[0].required).toBe(false);
    await expect(page.locator("#copy-example")).toBeHidden();

    await addField(page, "grid");
    agent = await agentOf(request, "exercise-2");
    expect(agent.fields[1].grid.columns).toHaveLength(2);
    expect(agent.fields[1].grid.columns.every((column) => column.required === false)).toBe(true);
  });

  test("表單可從左側安全移除並恢復，取消不發請求且歷史版本保留", async ({ page, request }) => {
    await resetStore(request);
    let archiveRequests = 0;
    page.on("request", (call) => {
      if (call.method() === "POST" && new URL(call.url()).pathname === "/api/agents/exercise-1/archive") archiveRequests += 1;
    });
    const before = await agentOf(request, "exercise-1");
    await page.goto("/?scenario=exercise-1");

    await page.locator("#more-actions > summary").click();
    await page.locator("#archive-btn").click();
    const dialog = page.locator("#confirm-dialog");
    await expect(dialog).toContainText("發布歷史");
    await expect(dialog).toContainText("可在「已移除」中恢復");
    await dialog.getByRole("button", { name: "取消" }).click();
    expect(archiveRequests).toBe(0);
    await expect(page.locator("#stage-title")).toHaveText("市場分析需求");

    await page.locator("#more-actions > summary").click();
    await page.locator("#archive-btn").click();
    await dialog.getByRole("button", { name: "確認移除" }).click();
    await expect(page.locator("#onboarding")).toBeVisible();
    await expect(page.locator("#onboarding-status")).toContainText("已移除");
    expect(archiveRequests).toBe(1);

    const archived = await agentOf(request, "exercise-1");
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.binding).toBeNull();
    expect(archived.published).toBeNull();
    expect(archived.publishedDefinitions).toEqual(before.publishedDefinitions);

    await page.getByRole("button", { name: "已移除", exact: true }).click();
    const archivedRow = page.locator(".archived-agent").filter({ hasText: "市場分析需求" });
    await expect(archivedRow).toBeVisible();
    await archivedRow.getByRole("button", { name: "恢復 市場分析需求" }).click();
    await expect(page.locator("#stage-title")).toHaveText("市場分析需求");
    await expect(page.locator("#save-status")).toContainText("已恢復");
    const restored = await agentOf(request, "exercise-1");
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.published).toBeNull();
    expect(restored.publishedDefinitions).toEqual(before.publishedDefinitions);
  });

  test("輸入在切換字段與預覽前提交，模式切換沿用同一 iframe", async ({ page, request }) => {
    await resetStore(request);
    let previewRequests = 0;
    page.on("request", (call) => {
      if (new URL(call.url()).pathname === "/preview/exercise-1") previewRequests += 1;
    });
    await page.goto("/?scenario=exercise-1");
    const inspector = page.locator("#property-inspector");
    const input = inspector.locator('[data-inspector-change="field-label"]');
    await input.fill("切換前保存");
    await expect(page.locator("#save-status")).toContainText("未儲存");
    await page.frameLocator('iframe[name="face"]').locator('[data-field-id="target_market"]').click();
    await expect.poll(async () => (await agentOf(request, "exercise-1")).fields[0].label).toBe("切換前保存");

    const before = previewRequests;
    await page.locator("#canvas-mode-preview").click();
    await expect(page.frameLocator('iframe[name="face"]').locator("#company_name")).toBeEnabled();
    await page.locator("#canvas-mode-design").click();
    await expect(page.frameLocator('iframe[name="face"]').locator("#company_name")).toBeDisabled();
    expect(previewRequests).toBe(before);
  });

  test("文字停頓 700ms 後自動保存，dirty 期間才啟用離頁警告", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/?scenario=exercise-1");
    const input = page.locator('[data-inspector-change="field-label"]');
    const before = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(before).toBe(false);

    await input.fill("停頓後自動保存");
    await expect(input).toBeFocused();
    const during = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(during).toBe(true);
    await expect.poll(async () => (await agentOf(request, "exercise-1")).fields[0].label, { timeout: 3000 }).toBe("停頓後自動保存");
    await expect(page.locator("#save-status")).toContainText("已儲存");
    const after = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(after).toBe(false);
  });

  test("連續屬性修改按保存隊列串行執行", async ({ page, request }) => {
    await resetStore(request);
    let active = 0, maxActive = 0, calls = 0;
    await page.route("**/api/agents/exercise-1/fields", async (route) => {
      active += 1; calls += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const response = await route.fetch();
      await route.fulfill({ response });
      active -= 1;
    });
    await page.goto("/?scenario=exercise-1");
    const inspector = page.locator("#property-inspector");
    await inspector.locator('[data-inspector-change="field-label"]').fill("串行保存");
    await inspector.locator('[data-inspector-change="field-label"]').press("Enter");
    await inspector.locator('[data-inspector-change="field-required"]').uncheck();
    await expect.poll(async () => (await agentOf(request, "exercise-1")).fields[0]).toMatchObject({ label: "串行保存", required: false });
    expect(calls).toBe(2);
    expect(maxActive).toBe(1);
    await expect(page.locator("#save-status")).toContainText("已儲存");
  });

  test("字段、行與列上下移只保存一次並保持穩定 ID", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/?scenario=financial-grid-v027");
    const canvas = page.frameLocator('iframe[name="face"]');
    const inspector = page.locator("#property-inspector");

    await canvas.locator('[data-field-id="overall_rating"]').click();
    const fieldBefore = await agentOf(request, "financial-grid-v027");
    await expect(inspector.locator('[data-inspector-action="move-field-up"]')).toBeDisabled();
    await inspector.locator('[data-inspector-action="move-field-down"]').click();
    let current = await agentOf(request, "financial-grid-v027");
    expect(current.formVersion).toBe(fieldBefore.formVersion + 1);
    expect(current.fields[1].id).toBe("overall_rating");
    await expect(inspector.locator('[data-inspector-change="field-label"]')).toHaveValue("整體評分");

    await canvas.locator('[data-grid-row-id="fy2022"]').click();
    const rowBefore = current.formVersion;
    await expect(inspector.locator('[data-inspector-action="move-row-up"]')).toBeDisabled();
    await inspector.locator('[data-inspector-action="move-row-down"]').click();
    current = await agentOf(request, "financial-grid-v027");
    expect(current.formVersion).toBe(rowBefore + 1);
    expect(current.fields.find((field) => field.id === "history").grid.rows[1].id).toBe("fy2022");

    await canvas.locator('[data-grid-column-id="revenue"]').click();
    const columnBefore = current.formVersion;
    await expect(inspector.locator('[data-inspector-action="move-column-up"]')).toBeDisabled();
    await inspector.locator('[data-inspector-action="move-column-down"]').click();
    current = await agentOf(request, "financial-grid-v027");
    expect(current.formVersion).toBe(columnBefore + 1);
    expect(current.fields.find((field) => field.id === "history").grid.columns[1].id).toBe("revenue");
    expect(current.published.fields.find((field) => field.id === "history").grid.rows[0].id).toBe("fy2022");
  });

  test("發布檢查列出範圍與預設內容，取消零請求、確認單次請求", async ({ page, request }) => {
    await resetStore(request);
    const fields = [
      { id: "f1", label: "欄位 1", control: "select", required: true, options: ["選項一", "正式值"] },
      { id: "g1", label: "歷史", control: "grid", required: false, grid: {
        rows: [{ id: "r1", label: "第 1 行" }],
        columns: [{ id: "c1", label: "第 1 列", control: "text", required: true }],
      } },
    ];
    await saveAgentFields(request, "exercise-2", fields);
    let publishRequests = 0;
    page.on("request", (call) => {
      if (call.method() === "POST" && new URL(call.url()).pathname === "/api/agents/exercise-2/publish") publishRequests += 1;
    });
    await page.goto("/?scenario=exercise-2");
    await page.locator("#bind-btn").click();
    const dialog = page.locator("#publish-dialog");
    await expect(dialog).toContainText("只發布到 Form Studio，不修改 Poffices");
    await expect(dialog).toContainText("必填格子數");
    await expect(dialog).toContainText("2");
    await expect(dialog.locator("#publish-warnings li")).toHaveCount(4);
    await dialog.getByRole("button", { name: "返回修改" }).click();
    expect(publishRequests).toBe(0);
    const label = page.locator('[data-inspector-change="field-label"]');
    await label.fill("正式字段");
    await expect(page.locator("#save-status")).toContainText("未儲存");
    await page.locator("#bind-btn").click();
    await expect.poll(async () => (await agentOf(request, "exercise-2")).fields[0].label).toBe("正式字段");
    await page.locator("#publish-confirm").click();
    await expect(page.locator("#publish-receipt")).toBeVisible();
    expect(publishRequests).toBe(1);
  });

  test("scenario 刷新恢復工作區，非法 ID 回到可理解的選擇狀態", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/?scenario=exercise-1");
    await expect(page.locator("#stage-title")).toHaveText("市場分析需求");
    await page.reload();
    await expect(page.locator("#stage-title")).toHaveText("市場分析需求");

    await page.goto("/?scenario=missing-agent");
    await expect(page.locator("#onboarding")).toBeVisible();
    await expect(page.locator("#onboarding-status")).toContainText("找不到或無權");
    await expect(page.locator("#workspace")).toBeHidden();
  });

  test("390px 填寫頁以繁體摘要指出 grid 的準確行列", async ({ page, request }) => {
    await resetStore(request);
    const fields = [{ id: "history", label: "歷史收支", control: "grid", required: false, grid: {
      rows: [{ id: "fy2024", label: "FY2024" }],
      columns: [{ id: "revenue", label: "收入", control: "number", required: true, decimals: 2 }],
    } }, { id: "rating", label: "整體評分", control: "radio", required: true, options: ["1", "2"] }];
    await saveAgentFields(request, "exercise-2", fields);
    await publishAgent(request, "exercise-2");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/a/exercise-2");
    await page.locator("#agent-form [type=submit]").click();
    await expect(page.locator("#form-errors")).toContainText("請檢查以下欄位");
    await expect(page.locator("#form-errors")).toContainText("歷史收支 / FY2024 / 收入");
    await expect(page.locator("#form-errors")).toContainText("請填寫「整體評分」。");
    await expect(page.locator("#form-errors")).not.toContainText("整體評分 / 1");
    const cell = page.locator('[name="history_fy2024_revenue"]');
    await expect(cell).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('[data-error-for="history_fy2024_revenue"]')).toContainText("FY2024");
    await expect(cell).toBeFocused();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
