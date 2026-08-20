import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("作者后台 UI 管理回归", () => {
  test("2B-A 起始页只呈现改装/新生，Official 候选不与工作区假绑定", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "你准备为谁设计用户页面？" })).toBeVisible();
    await expect(page.getByRole("button", { name: /改已有 agent/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /新建 agent form/ })).toBeVisible();
    await page.getByRole("button", { name: /改已有 agent/ }).click();
    await page.locator("#identity-id").fill("18");
    await page.getByRole("button", { name: "查找 agent" }).click();
    const card = page.locator("#identity-result");
    await expect(card).toContainText("Market Analysis");
    await expect(card).toContainText("ownerAgent:18");
    await expect(card).toContainText("Official · 不可绑定");
    await expect(page.locator("#authorization-step")).toBeHidden();
    await expect(page.locator("#workspace")).toBeHidden();
  });

  test("2B-B/C 获授权 sandbox 可建本地绑定，金稿从旁路入口入袋", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /改已有 agent/ }).click();
    await page.locator("#identity-id").fill("42");
    await page.getByRole("button", { name: "查找 agent" }).click();
    await expect(page.locator("#identity-result")).toContainText("Research Sandbox");
    await page.getByRole("checkbox", { name: /我确认自己拥有/ }).check();
    await page.getByRole("button", { name: "在本地开始设计" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Research Sandbox" })).toBeVisible();
    await expect(page.locator("#owner-context")).toContainText("ownerAgent:42");
    await expect(page.locator("#owner-context")).toContainText("Poffices");
    await page.getByRole("button", { name: "加栏" }).click();
    await page.getByRole("button", { name: "发布本地金稿" }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await face.locator("#f1").fill("真实主人的输入");
    await face.getByRole("button", { name: "提交" }).click();
    const agent = await agentOf(request, "42");
    expect(agent.binding).toMatchObject({
      version: "owner-agent-binding/v1", ownerAgent: "42", entryMode: "form-studio-sidecar", status: "published",
    });
    expect(agent.inputBag[0].values).toEqual({ f1: "真实主人的输入" });
  });

  test("改装主路径有加载/失败状态，键盘和窄屏可用", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.route("**/api/owner-identities/poffices/42", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: 200,
          identity: {
            version: "owner-agent-identity/v1", ownerAgent: "42", name: "Research Sandbox",
            origin: "retrofit", sourceSystem: "poffices", externalId: "42", agentType: "agent",
            official: false, updatedAt: null, observedAt: "2026-08-20T08:00:00.000Z", readOnly: true,
          },
        }),
      });
    });
    await page.goto("/");
    const start = page.getByRole("button", { name: /改已有 agent/ });
    await start.focus();
    await start.press("Enter");
    await page.locator("#identity-id").fill("42");
    await page.locator("#identity-id").press("Enter");
    await expect(page.locator("#identity-result")).toHaveText("正在只读查找 agent…");
    await expect(page.locator("#identity-result")).toContainText("Research Sandbox");
    await page.locator("#identity-id").fill("999");
    await page.locator("#identity-id").press("Enter");
    await expect(page.locator("#identity-result")).toContainText("没有这个测试 agent");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

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
