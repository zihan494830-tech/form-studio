import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

async function submitExerciseOne(request, key, suffix) {
  return request.post("/submit/exercise-1", {
    headers: { "Idempotency-Key": key },
    data: { formVersion: 1, values: { company_name: `公司${suffix}`, analysis_goal: `目標${suffix}`, target_market: "香港", budget_wan: "10", include_competitors: "false" } },
  });
}

test("首屏可试填草稿且不入库，发布后主行动打开正式填写页", async ({ context, page, request }) => {
  await resetStore(request);
  const health = await (await request.get("/api/health")).json();
  expect(health).toMatchObject({ productVersion: "1.0.0-alpha.1", schemaVersion: 3 });
  await page.goto("/?scenario=exercise-2");
  await expect(page.locator("#try-draft-btn")).toHaveCount(0);
  await expect(page.locator("#canvas-mode-preview")).toBeVisible();
  await expect(page.locator("#bind-btn")).toHaveText("發布");
  await expect(page.locator("#user-page-link")).toBeHidden();
  await expect(page.locator("#more-actions")).toBeVisible();
  await page.locator("#canvas-mode-preview").click();
  const preview = page.frameLocator('iframe[name="face"]');
  await expect(preview.locator("#customer_name")).toBeEnabled();
  await preview.locator("#customer_name").fill("草稿客戶");
  await expect(preview.locator("#agent-form button")).toBeDisabled();
  await expect(preview.locator("#agent-form button")).toContainText("草稿尚未發布");
  expect((await agentOf(request, "exercise-2")).inputBag).toHaveLength(0);

  await page.locator("#bind-btn").click();
  await page.locator("#publish-confirm").click();
  await expect(page.locator("#publish-receipt")).toContainText("v1.0");
  await expect(page.locator("#bind-btn")).toBeHidden();
  await expect(page.locator("#user-page-link")).toBeVisible();
  await expect(page.locator("#user-page-link")).toContainText("去填寫");
  await expect(page.locator("#more-actions")).toBeVisible();

  const draftLabel = page.locator('[data-inspector-change="field-label"]');
  await draftLabel.fill("客戶名稱（草稿）");
  await expect.poll(async () => (await agentOf(request, "exercise-2")).fields[0].label).toBe("客戶名稱（草稿）");
  await expect(page.locator("#bind-btn")).toHaveText("發布更新");
  await expect(page.locator("#bind-btn")).toBeVisible();
  await expect(page.locator("#user-page-link")).toContainText("去填寫目前線上版 v1.0");

  const face = await context.newPage();
  await face.goto("/a/exercise-2");
  await expect(face.locator(".form-meta")).toContainText("v1.0");
  await expect(face.locator("#customer_name")).toBeEnabled();
  await expect(face.locator("#submission-session")).toContainText("市場研究員林悅");
  await face.locator("#customer_name").fill("正式客戶");
  await face.locator("#contact_summary").fill("由首屏主流程完成的正式提交");
  await face.locator("#satisfaction_score").fill("9");
  await face.locator("#next_action").selectOption("安排會議");
  await face.locator('#agent-form [type="submit"]').click();
  await expect(face.locator("#receipt.show")).toContainText("提交已儲存");

  await page.locator("#view-submissions").click();
  await expect(page.locator(".bag-item")).toHaveCount(1);
  await page.locator(".bag-item").click();
  await expect(page.locator("#submission-detail")).toContainText("正式客戶");
  await expect(page.locator(".delivery-badge")).toHaveText("未配置");
  await expect(page.locator(".delivery-card")).toContainText("提交已保存於 Form Studio，尚未轉交 Agent");
});

test("提交數量在讀取完成前不冒充 0，失敗時保留舊數量", async ({ page, request }) => {
  await resetStore(request);
  expect((await submitExerciseOne(request, "c7e98ee5-4aed-48ab-8f6c-dff1ed017985", "甲")).ok()).toBeTruthy();
  expect((await submitExerciseOne(request, "d2b6b537-0e86-4ccf-81e5-bc116317ab6c", "乙")).ok()).toBeTruthy();

  let releaseFirstLoad;
  const firstLoad = new Promise((resolve) => { releaseFirstLoad = resolve; });
  await page.route("**/api/agents/exercise-1/submissions", async (route) => {
    await firstLoad;
    await route.continue();
  });
  await page.goto("/?scenario=exercise-1");
  await expect(page.locator("#view-record-count")).toHaveText("讀取中…");
  await expect(page.locator("#view-record-count")).not.toHaveText("0 筆");
  releaseFirstLoad();
  await expect(page.locator("#view-record-count")).toHaveText("2 筆");

  await page.unroute("**/api/agents/exercise-1/submissions");
  await page.route("**/api/agents/exercise-1/submissions", (route) => route.abort());
  await page.locator("#view-submissions").click();
  await expect(page.locator("#view-record-count")).toHaveText("2 筆 · 更新失敗");
  await expect(page.locator(".submission-refresh-warning")).toContainText("可能不是最新");
  await expect(page.locator(".bag-item")).toHaveCount(2);
});

test("提交詳情清楚展示六種 Agent 投遞狀態", async ({ page, request }) => {
  await resetStore(request);
  expect((await submitExerciseOne(request, "6df48e99-858b-42f3-a773-e787432e9bd7", "投遞")).ok()).toBeTruthy();
  let delivery = { status: "not_configured" };
  await page.route("**/api/agents/exercise-1/submissions/*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.submission.delivery = delivery;
    await route.fulfill({ response, json: result });
  });
  await page.goto("/?scenario=exercise-1");
  await page.locator("#view-submissions").click();
  const item = page.locator(".bag-item").first();
  const cases = [
    [{ status: "not_configured" }, "未配置"],
    [{ status: "pending", target: "agent-42", transport: "poffices-invoke", attempts: 0 }, "待投遞"],
    [{ status: "delivering", target: { target: "agent-42", kind: "poffices-invoke" }, attempts: 1 }, "投遞中"],
    [{ status: "delivered", target: "agent-42", transport: "poffices-invoke", attempts: 1, receipt: { receivedAt: "2026-08-24T03:00:00.000Z" } }, "已送達"],
    [{ status: "failed", target: "agent-42", transport: "poffices-invoke", attempts: 2, lastError: "upstream unavailable" }, "失敗"],
    [{ status: "mapping_review_required", target: "agent-42", transport: "poffices-invoke", attempts: 0 }, "mapping 需復核"],
  ];
  for (const [next, label] of cases) {
    delivery = next;
    await item.click();
    await expect(page.locator(".delivery-badge")).toHaveText(label);
  }
});

test("桌面 splitter 支持鼠标语义、键盘边界、恢复和本地记忆", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/?scenario=financial-grid-v027");
  const splitter = page.locator("#property-splitter");
  await expect(splitter).toBeVisible();
  await expect(splitter).toHaveAttribute("aria-valuenow", "340");
  const box = await splitter.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x - 32, box.y + 80);
  await page.mouse.up();
  expect(Number(await splitter.getAttribute("aria-valuenow"))).toBeGreaterThan(340);
  const draggedWidth = await splitter.getAttribute("aria-valuenow");
  await page.reload();
  await expect(splitter).toHaveAttribute("aria-valuenow", draggedWidth);
  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(Number(draggedWidth) + 16);
  await splitter.focus();
  await page.keyboard.press("Home");
  await expect(splitter).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("End");
  await expect(splitter).toHaveAttribute("aria-valuenow", "520");
  await page.keyboard.press("Enter");
  await expect(splitter).toHaveAttribute("aria-valuenow", "340");

  await page.setViewportSize({ width: 1279, height: 800 });
  await expect(splitter).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("提交管理可保存状态并以确认流程修正，原始答案仍可查看", async ({ page, request }) => {
  await resetStore(request);
  const submitted = await request.post("/submit/exercise-1", {
    headers: { "Idempotency-Key": "9b44fd3d-a064-4f8a-8df2-2303fb4c05aa" },
    data: { formVersion: 1, values: { company_name: "原公司", analysis_goal: "原目标", target_market: "香港", budget_wan: "10", include_competitors: "false" } },
  });
  expect(submitted.ok()).toBeTruthy();
  let releaseManagement;
  const managementGate = new Promise((resolve) => { releaseManagement = resolve; });
  await page.route("**/api/agents/exercise-1/submissions/*/management", async (route) => {
    await managementGate;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.goto("/?scenario=exercise-1");
  await page.locator("#view-submissions").click();
  await expect(page.locator(".bag-item")).toHaveCount(1);
  await page.locator(".bag-item").click();
  await expect(page.locator("#submission-detail")).toContainText("原公司");
  await page.locator('#submission-management-form [name="status"]').selectOption("in_review");
  await page.locator('#submission-management-form [name="tags"]').fill("重要\n本週");
  await expect(page.getByRole("button", { name: "歸檔提交" })).toHaveClass(/secondary-management/);
  await page.getByRole("button", { name: "儲存管理資料" }).click();
  await expect(page.locator("#submission-detail")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "歸檔提交" })).toBeDisabled();
  releaseManagement();
  await expect(page.locator("#submission-detail")).toContainText("重要");
  await expect(page.locator(".management-feedback")).toContainText("管理資料已儲存");

  await page.getByText("修正答案").click();
  await page.locator('[data-correction-id="company_name"]').fill("修正公司");
  await page.locator('#submission-correction-form [name="reason"]').fill("電話確認");
  await page.getByRole("button", { name: "檢查並確認修正" }).click();
  await expect(page.locator("#confirm-dialog")).toBeVisible();
  await page.locator("#confirm-accept").click();
  await expect(page.locator("#submission-detail")).toContainText("修正公司");
  await expect(page.locator("#submission-detail")).toContainText("已修正 · 原值：原公司");
  await expect(page.locator("#submission-detail")).toContainText("電話確認");
});
