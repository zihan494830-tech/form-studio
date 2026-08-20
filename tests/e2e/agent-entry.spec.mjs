import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("改装 agent 的独占用户入口", () => {
  test("已发布 agent 只显示已发布表，没有聊天框", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/a/exercise-1");
    await expect(page.locator("#company_name")).toBeVisible();
    await expect(page.locator("#analysis_goal")).toBeVisible();
    await expect(page.locator("#target_market")).toBeVisible();
    await expect(page.locator('[data-chat]')).toHaveCount(0);
  });

  test("未绑定改装 agent 走空态", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/a/exercise-2");
    await expect(page.locator("#empty-note")).toBeVisible();
    await expect(page.locator("#agent-form")).toHaveCount(0);
  });

  test("工作台提交后能看见 values[id]", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#company_name").fill("星海科技");
    await face.locator("#analysis_goal").fill("评估香港市场进入机会");
    await face.locator("#target_market").selectOption("香港");
    await face.locator("#budget_wan").fill("20");
    await face.locator("#include_competitors").check();
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("company_name 星海科技");
    await expect(page.locator(".bag-item")).toContainText("target_market 香港");
    await expect(page.locator(".bag-item")).toContainText("include_competitors true");
  });

  test("解绑回到空态，但 inputBag 历史保留", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#company_name").fill("星海科技");
    await face.locator("#analysis_goal").fill("这条提交需要保留");
    await face.locator("#target_market").selectOption("香港");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("这条提交需要保留");
    await page.getByRole("button", { name: "解除本地绑定" }).click();
    await page.getByRole("button", { name: "确认解除本地绑定" }).click();
    await expect(face.getByText("当前是草稿预览")).toBeVisible();
    expect(await (await request.get("/a/exercise-1")).text()).toContain("empty-note");
    const agent = await agentOf(request);
    expect(agent.binding).toBeNull();
    expect(agent.inputBag).toHaveLength(1);
  });

  test("解绑后重新发布，inputBag 继续追加", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#company_name").fill("第一次提交");
    await face.locator("#analysis_goal").fill("测试重新发布");
    await face.locator("#target_market").selectOption("香港");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("第一次提交");
    await page.getByRole("button", { name: "解除本地绑定" }).click();
    await page.getByRole("button", { name: "确认解除本地绑定" }).click();
    await page.getByRole("button", { name: "发布用户页面" }).click();
    await expect(face.getByText("请填完后提交")).toBeVisible();
    await face.locator("#company_name").fill("第二次提交");
    await face.locator("#analysis_goal").fill("测试历史追加");
    await face.locator("#target_market").selectOption("北美");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toHaveCount(2);
    expect((await agentOf(request)).inputBag).toHaveLength(2);
  });
});
