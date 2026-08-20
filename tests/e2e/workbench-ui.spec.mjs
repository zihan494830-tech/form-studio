import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("作者后台 UI 管理回归", () => {
  test("未发布字段只进草稿预览，不能提交", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /练习二/ }).click();
    await page.getByRole("button", { name: "加栏" }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await expect(face.locator("#f1")).toBeVisible();
    await expect(face.getByText("作者草稿预览")).toBeVisible();
    await expect(face.getByRole("button", { name: "预览不可提交" })).toBeDisabled();
    expect(await (await request.get("/a/exercise-2")).text()).toContain("empty-note");
  });

  test("覆盖例子先确认，取消不会改草稿", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /练习一/ }).click();
    await page.getByRole("button", { name: "从例子复制" }).click();
    await expect(page.getByRole("dialog")).toContainText("覆盖当前字段");
    await page.getByRole("button", { name: "取消" }).click();
    expect((await agentOf(request)).fields.map((field) => field.id)).toEqual(["q1", "n1", "a1"]);
  });

  test("历史信封按自己的 values[id] 展示", async ({ page, request }) => {
    await resetStore(request);
    await request.post("/submit/exercise-1", {
      data: { values: { q1: "旧题", n1: "88", a1: "旧答案" }, submitterId: "history-user" },
    });
    const agent = await agentOf(request);
    await request.put("/api/agents/exercise-1/fields", {
      data: { fields: agent.fields.filter((field) => field.id !== "q1") },
    });
    await page.goto("/");
    await page.getByRole("button", { name: /练习一/ }).click();
    await page.getByRole("button", { name: "填写记录" }).click();
    await expect(page.locator(".bag-item")).toContainText("q1 旧题");
    await expect(page.locator(".bag-item")).toContainText("表 v1");
  });

  test("768 宽抽屉不挤压设计区，分隔条可键盘调整", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: /练习一/ }).click();
    const splitter = page.getByRole("separator", { name: "调整设计区高度" });
    await splitter.focus();
    const before = Number(await splitter.getAttribute("aria-valuenow"));
    await splitter.press("ArrowDown");
    expect(Number(await splitter.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
    await page.getByRole("button", { name: "填写记录" }).click();
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      stage: document.querySelector(".stage").scrollWidth - document.querySelector(".stage").clientWidth,
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.stage).toBeLessThanOrEqual(0);
  });
});
