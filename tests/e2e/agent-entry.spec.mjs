import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("改装 agent 的独占用户入口", () => {
  test("已发布 agent 只显示金稿表，没有聊天框", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/a/exercise-1");
    await expect(page.locator("#q1")).toBeVisible();
    await expect(page.locator("#n1")).toBeVisible();
    await expect(page.locator("#a1")).toBeVisible();
    await expect(page.locator('[data-chat], textarea:not(#a1)')).toHaveCount(0);
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
    await page.getByRole("button", { name: /练习一/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#q1").fill("第一题");
    await face.locator("#n1").fill("90");
    await face.locator("#a1").fill("学生作答");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("q1 第一题");
    await expect(page.locator(".bag-item")).toContainText("n1 90");
    await expect(page.locator(".bag-item")).toContainText("a1 学生作答");
  });

  test("解绑回到空态，但 inputBag 历史保留", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /练习一/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#q1").fill("第一题");
    await face.locator("#n1").fill("90");
    await face.locator("#a1").fill("留下");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("留下");
    await page.getByRole("button", { name: "解绑首页" }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await expect(face.getByText("作者草稿预览")).toBeVisible();
    expect(await (await request.get("/a/exercise-1")).text()).toContain("empty-note");
    const agent = await agentOf(request);
    expect(agent.formId).toBeNull();
    expect(agent.inputBag).toHaveLength(1);
  });

  test("解绑后重新发布，inputBag 继续追加", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /练习一/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#q1").fill("第一题");
    await face.locator("#n1").fill("90");
    await face.locator("#a1").fill("第一次");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toContainText("第一次");
    await page.getByRole("button", { name: "解绑首页" }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await page.getByRole("button", { name: "发布为用户页面" }).click();
    await expect(face.getByText("请填完后提交")).toBeVisible();
    await face.locator("#q1").fill("第一题");
    await face.locator("#n1").fill("91");
    await face.locator("#a1").fill("第二次");
    await face.getByRole("button", { name: "提交" }).click();
    await expect(page.locator(".bag-item")).toHaveCount(2);
    expect((await agentOf(request)).inputBag).toHaveLength(2);
  });
});
