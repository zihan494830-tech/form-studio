import { expect, test } from "@playwright/test";
import { resetStore } from "../support/project-fixture.mjs";
import { openRecords } from "../support/ui-actions.mjs";

test("寬屏收件箱左右獨立滾動，單列尺寸無頁面橫向溢出", async ({ page, request }) => {
  await resetStore(request);
  const values = { overall_rating: "5", remarks: "用於驗證長詳情的固定主從布局" };
  for (const year of ["fy2022", "fy2023", "fy2024", "fy2025"]) {
    values[`history_${year}_revenue`] = "100";
    values[`history_${year}_cost`] = "70";
    values[`history_${year}_market`] = "HK";
  }
  const submitted = await request.post("/submit/financial-grid-v027", {
    headers: { "Idempotency-Key": "8195413e-02d7-49ee-a1ae-7dbf33f32c02" },
    data: { formVersion: 1, values },
  });
  expect(submitted.ok()).toBeTruthy();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/?scenario=financial-grid-v027");
  await openRecords(page);
  await expect(page.locator(".bag-item")).toHaveCount(1);
  const before = await page.locator(".records-layout").evaluate((layout) => {
    const list = layout.querySelector(".submission-list-panel");
    const detail = layout.querySelector(".submission-detail-panel");
    return {
      columns: getComputedStyle(layout).gridTemplateColumns.split(" ").length,
      headingTop: list.querySelector(".panel-heading").getBoundingClientRect().top,
      selectedTop: list.querySelector('.bag-item[aria-current="true"]').getBoundingClientRect().top,
      detailClientHeight: detail.clientHeight,
      detailScrollHeight: detail.scrollHeight,
    };
  });
  expect(before.columns).toBe(2);
  expect(before.detailScrollHeight).toBeGreaterThan(before.detailClientHeight);
  await page.locator(".submission-detail-panel").evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
  await expect.poll(() => page.locator(".submission-detail-panel").evaluate((panel) => panel.scrollTop)).toBeGreaterThan(0);
  const after = await page.locator(".submission-list-panel").evaluate((list) => ({
    headingTop: list.querySelector(".panel-heading").getBoundingClientRect().top,
    selectedTop: list.querySelector('.bag-item[aria-current="true"]').getBoundingClientRect().top,
    headingVisible: list.querySelector(".panel-heading").getBoundingClientRect().top >= list.getBoundingClientRect().top,
  }));
  expect(Math.abs(after.headingTop - before.headingTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.selectedTop - before.selectedTop)).toBeLessThanOrEqual(1);
  expect(after.headingVisible).toBe(true);

  for (const viewport of [{ width: 920, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const compact = await page.locator(".records-layout").evaluate((layout) => ({
      columns: getComputedStyle(layout).gridTemplateColumns.split(" ").length,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(compact.columns).toBe(1);
    expect(compact.pageOverflow).toBeLessThanOrEqual(0);
  }
});
