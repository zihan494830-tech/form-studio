import { expect, test } from "@playwright/test";
import { resetStore } from "../support/project-fixture.mjs";

const validValues = {
  company_name: "星海科技",
  analysis_goal: "比较东南亚竞争格局",
  target_market: "東南亞",
  budget_wan: "12",
  include_competitors: "true",
};

test.beforeEach(async ({ request }) => resetStore(request));

test("老师在获授权视图看到学生提交和字段详情", async ({ browser, request }) => {
  await request.post("/submit/exercise-1", {
    headers: { "x-form-studio-test-actor": "student-2" },
    data: { values: validValues },
  });
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-form-studio-test-actor": "teacher-1" },
  });
  const page = await context.newPage();
  await page.goto("/classroom");

  await expect(page.getByRole("heading", { name: "市場分析需求" })).toBeVisible();
  await expect(page.getByRole("button", { name: /student-2/ })).toBeVisible();
  await page.getByRole("button", { name: /student-2/ }).click();
  await expect(page.locator("#submission-detail")).toContainText("星海科技");
  await expect(page.locator("#submission-detail")).toContainText("company_name");
  await context.close();
});

test("空态和窄屏仍可理解且没有横向溢出", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-form-studio-test-actor": "teacher-1" },
  });
  const page = await context.newPage();
  await page.goto("/classroom");
  await expect(page.locator("#submission-list .state.empty")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await context.close();
});
