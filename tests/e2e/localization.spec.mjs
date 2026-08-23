import { expect, test } from "@playwright/test";
import { locale, t } from "../../src/presentation/messages/zh-HK.mjs";
import { resetStore } from "../support/project-fixture.mjs";
import { startRetrofitFlow } from "../support/ui-actions.mjs";

test.describe("zh-HK 展示与可访问名称", () => {
  test("产品页和发布页声明目标语言并呈现目录消息", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    await startRetrofitFlow(page);
    await page.locator("#identity-id").fill("999");
    await page.locator("#identity-id").press("Enter");
    await expect(page.locator("#identity-result")).toHaveAttribute("data-state", "error");
    await expect(page.locator("#identity-result")).toHaveText(t("error.not_found"));

    await page.goto("/a/exercise-1");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator(".lead")).toHaveText(t("ui.face.lead"));
    await expect(page.getByRole("button", { name: t("ui.face.submit") })).toBeVisible();
  });

  test("参考课堂空态使用同一目标语言资源", async ({ browser, request }) => {
    await resetStore(request);
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-form-studio-test-actor": "teacher-1" },
    });
    const page = await context.newPage();
    await page.goto("/classroom");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("#submission-list .state.empty"))
      .toHaveText(t("ui.classroom.no_submissions"));
    await context.close();
  });
});
