import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("作者后台 UI 管理回归", () => {
  test("新建流程解释实际作用，技术身份退到详情", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /创建新的 agent form/ }).click();
    const flow = page.locator("#born-flow");
    await expect(flow).toContainText("独立设计、发布和持续接收提交");
    await expect(flow).toContainText("不会创建、连接或修改 Poffices agent");
    await expect(flow).toContainText("不能改绑成已有 agent");
    await expect(flow).not.toContainText("ownerAgent");
    await page.locator("#new-name").fill("课堂练习入口");
    await page.getByRole("button", { name: "创建并开始设计" }).click();
    await expect(page.locator("#owner-context")).toContainText("Form Studio 新建");
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context")).toContainText("本地页面 ID:form-1");
  });

  test("2B-A Official 候选可创建隔离本地页面，且边界写清楚", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "你准备为谁设计用户页面？" })).toBeVisible();
    await expect(page.getByRole("button", { name: /给已有 Poffices agent 做页面/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /创建新的 agent form/ })).toBeVisible();
    await page.getByRole("button", { name: /给已有 Poffices agent 做页面/ }).click();
    await page.locator("#identity-id").fill("18");
    await page.getByRole("button", { name: "查找 agent" }).click();
    const card = page.locator("#identity-result");
    await expect(card).toContainText("Market Analysis");
    await expect(card).toContainText("Poffices agent ID:18");
    await expect(card).toContainText("Official · 只读来源");
    await expect(card).toContainText("可创建隔离的本地页面");
    await expect(card).toContainText("不会改动 Poffices");
    await expect(page.locator("#local-copy-step")).toBeVisible();
    await page.getByRole("button", { name: "创建本地页面" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Market Analysis" })).toBeVisible();
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context")).toContainText("Poffices agent ID:18");
    await expect(page.locator("#owner-context")).toContainText("Poffices");
    const local = await agentOf(request, "18");
    expect(local).toMatchObject({
      id: "18",
      ownerIdentity: { official: true, readOnly: true },
      authorization: { basis: "local-shadow-only" },
      published: null,
      binding: null,
    });
  });

  test("2B-B/C 只读身份可建本地绑定，已发布版本从旁路入口入袋", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /给已有 Poffices agent 做页面/ }).click();
    await page.locator("#identity-id").fill("42");
    await page.getByRole("button", { name: "查找 agent" }).click();
    await expect(page.locator("#identity-result")).toContainText("Research Sandbox");
    await page.getByRole("button", { name: "创建本地页面" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Research Sandbox" })).toBeVisible();
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context")).toContainText("Poffices agent ID:42");
    await expect(page.locator("#owner-context")).toContainText("Poffices");
    await page.getByRole("button", { name: "加栏" }).click();
    await page.getByRole("button", { name: "发布用户页面" }).click();
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
    const start = page.getByRole("button", { name: /给已有 Poffices agent 做页面/ });
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
    await page.getByRole("button", { name: /客户回访记录/ }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await expect(face.locator("#customer_name")).toBeVisible();
    await expect(face.getByText("当前是草稿预览")).toBeVisible();
    await expect(face.getByText("仅作者可见；发布后才会成为可填写、可提交的用户页面。")).toBeVisible();
    await expect(face.getByRole("button", { name: "发布后可提交" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "解除本地绑定" })).toBeHidden();
    await expect(page.getByRole("link", { name: "另开用户页面" })).toHaveAttribute("aria-disabled", "true");
    expect(await (await request.get("/a/exercise-2")).text()).toContain("empty-note");
  });

  test("覆盖例子先确认，取消不会改草稿", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    await page.getByRole("button", { name: "从例子复制" }).click();
    await expect(page.getByRole("dialog")).toContainText("覆盖当前字段");
    await page.getByRole("button", { name: "取消" }).click();
    expect((await agentOf(request)).fields.map((field) => field.id)).toEqual([
      "company_name", "analysis_goal", "target_market", "budget_wan", "include_competitors",
    ]);
  });

  test("历史信封按自己的 values[id] 展示", async ({ page, request }) => {
    await resetStore(request);
    await request.post("/submit/exercise-1", {
      data: { values: { company_name: "旧公司", analysis_goal: "旧目标", target_market: "香港" }, submitterId: "history-user" },
    });
    const agent = await agentOf(request);
    await request.put("/api/agents/exercise-1/fields", {
      data: { fields: agent.fields.filter((field) => field.id !== "company_name") },
    });
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    await page.getByRole("button", { name: "填写记录" }).click();
    await expect(page.locator(".bag-item")).toContainText("company_name 旧公司");
    await expect(page.locator(".bag-item")).toContainText("表 v1");
  });

  test("768 宽抽屉不挤压设计区，分隔条可键盘调整", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
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

  test("左侧可筛选页面，显示字段 ID 不改变设计区布局", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: "已发布", exact: true }).click();
    await expect(page.getByRole("button", { name: /市场分析需求/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /客户回访记录/ })).toHaveCount(0);
    await page.getByRole("button", { name: "草稿", exact: true }).click();
    await expect(page.getByRole("button", { name: /客户回访记录/ })).toBeVisible();
    await page.getByRole("button", { name: /客户回访记录/ }).click();
    const before = await page.locator("#designer").evaluate((element) => ({
      display: getComputedStyle(element).display,
      height: element.getBoundingClientRect().height,
      fieldTop: element.querySelector(".design-row").getBoundingClientRect().top,
      fieldHeight: element.querySelector(".design-row").getBoundingClientRect().height,
    }));
    await page.getByRole("checkbox", { name: /显示字段 ID/ }).check();
    await expect(page.locator(".id-line").first()).toBeVisible();
    const after = await page.locator("#designer").evaluate((element) => ({
      display: getComputedStyle(element).display,
      height: element.getBoundingClientRect().height,
      fieldTop: element.querySelector(".design-row").getBoundingClientRect().top,
      fieldHeight: element.querySelector(".design-row").getBoundingClientRect().height,
    }));
    expect(after.display).toBe(before.display);
    expect(after.height).toBe(before.height);
    expect(after.fieldTop).toBe(before.fieldTop);
    expect(after.fieldHeight).toBeGreaterThan(before.fieldHeight);
    expect(await page.locator("#field-list").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(900);
  });

  test("工作区按可用宽度在并排与上下布局间自适应", async ({ page, request }) => {
    await resetStore(request);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: /市场分析需求/ }).click();
    const wide = await page.locator("#split").evaluate((split) => {
      const designer = split.querySelector("#designer").getBoundingClientRect();
      const face = split.querySelector(".face-panel").getBoundingClientRect();
      return {
        display: getComputedStyle(split).display,
        designerLeft: designer.left,
        designerRight: designer.right,
        faceLeft: face.left,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(wide.display).toBe("grid");
    expect(wide.faceLeft).toBeGreaterThanOrEqual(wide.designerRight);
    expect(wide.pageOverflow).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 1100, height: 800 });
    const stacked = await page.locator("#split").evaluate((split) => {
      const designer = split.querySelector("#designer").getBoundingClientRect();
      const face = split.querySelector(".face-panel").getBoundingClientRect();
      return {
        display: getComputedStyle(split).display,
        designerBottom: designer.bottom,
        faceTop: face.top,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(stacked.display).toBe("flex");
    expect(stacked.faceTop).toBeGreaterThanOrEqual(stacked.designerBottom);
    expect(stacked.pageOverflow).toBeLessThanOrEqual(0);
  });
});
