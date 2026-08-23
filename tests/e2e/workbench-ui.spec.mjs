import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";
import {
  addField,
  createRetrofitWorkspace,
  lookupOwner,
  openPublishedFace,
  openRecords,
  publishWorkspace,
  selectWorkspace,
  startBornFlow,
  startRetrofitFlow,
  submitFace,
  userFace,
} from "../support/ui-actions.mjs";

test.describe("作者后台 UI 管理回归", () => {
  test("新建流程解释实际作用，技术身份退到详情", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await startBornFlow(page);
    const flow = page.locator("#born-flow");
    await expect(flow).toContainText("獨立設計、發布和持續接收提交");
    await expect(flow).toContainText("不會建立、連接或修改 Poffices agent");
    await expect(flow).toContainText("不能改綁成已有 agent");
    await expect(flow).not.toContainText("ownerAgent");
    await page.locator("#new-name").fill("课堂练习入口");
    await page.locator("#create-btn").click();
    await expect(page.locator("#owner-context")).toContainText("Form Studio 新增");
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context")).toContainText("本地頁面 ID:form-1");
  });

  test("2B-A Official 候选可创建隔离本地页面，且边界写清楚", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "你準備為誰設計用戶頁面？" })).toBeVisible();
    await expect(page.getByRole("button", { name: /給已有 Poffices agent 做頁面/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /建立新的 agent form/ })).toBeVisible();
    await startRetrofitFlow(page);
    await page.locator("#identity-id").fill("18");
    await lookupOwner(page);
    const card = page.locator("#identity-result");
    await expect(card).toContainText("Market Analysis");
    await expect(card).toContainText("Poffices agent ID:18");
    await expect(card).toContainText("Official · 只讀來源");
    await expect(card).toContainText("可建立隔離的本地頁面");
    await expect(card).toContainText("不會改動 Poffices");
    await expect(page.locator("#local-copy-step")).toBeVisible();
    await createRetrofitWorkspace(page);
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

  test("2B-B/C 只读身份可建本地绑定，已发布版本从旁路入口入袋", async ({ page, context, request }) => {
    await resetStore(request);
    await page.goto("/");
    await startRetrofitFlow(page);
    await page.locator("#identity-id").fill("42");
    await lookupOwner(page);
    await expect(page.locator("#identity-result")).toContainText("Research Sandbox");
    await createRetrofitWorkspace(page);
    await expect(page.getByRole("heading", { level: 1, name: "Research Sandbox" })).toBeVisible();
    await page.locator("#owner-context summary").click();
    await expect(page.locator("#owner-context")).toContainText("Poffices agent ID:42");
    await expect(page.locator("#owner-context")).toContainText("Poffices");
    await addField(page);
    await publishWorkspace(page);
    const face = await openPublishedFace(context, "42");
    await face.locator("#f1").fill("真实主人的输入");
    await submitFace(face);
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
    const start = page.getByRole("button", { name: /給已有 Poffices agent 做頁面/ });
    await start.focus();
    await start.press("Enter");
    await page.locator("#identity-id").fill("42");
    await page.locator("#identity-id").press("Enter");
    await expect(page.locator("#identity-result")).toHaveText("正在只讀查找 agent…");
    await expect(page.locator("#identity-result")).toContainText("Research Sandbox");
    await page.locator("#identity-id").fill("999");
    await page.locator("#identity-id").press("Enter");
    await expect(page.locator("#identity-result")).toHaveAttribute("data-state", "error");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("未发布字段只进草稿预览，不能提交", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await selectWorkspace(page, "exercise-2");
    const face = await userFace(page);
    await expect(face.locator("#customer_name")).toBeVisible();
    await expect(page.locator("#face-mode")).toHaveText("草稿 · 尚未對外更新");
    await expect(face.locator(".preview-note")).toHaveCount(0);
    await expect(face.locator("#customer_name")).toHaveAttribute("aria-disabled", "true");
    await expect(face.getByRole("button", { name: "設計模式不會提交" })).toBeDisabled();
    await page.locator("#canvas-mode-preview").click();
    await expect(face.locator("#customer_name")).not.toHaveAttribute("aria-disabled", "true");
    await face.locator("#customer_name").fill("只在預覽中試填");
    await expect(face.locator("#customer_name")).toHaveValue("只在預覽中試填");
    await expect(face.getByRole("button", { name: "草稿尚未發布" })).toBeDisabled();
    await expect(face.locator(".preview-submit-note")).toContainText("不會新增正式提交");
    expect((await agentOf(request, "exercise-2")).inputBag).toHaveLength(0);
    await expect(page.getByRole("button", { name: "停用用戶頁面" })).toBeHidden();
    await expect(page.getByRole("link", { name: "另開用戶頁面" })).toHaveAttribute("aria-disabled", "true");
    expect(await (await request.get("/a/exercise-2")).text()).toContain("empty-note");
  });

  test("覆盖例子先确认，取消不会改草稿", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    await page.getByRole("button", { name: "從例子複製" }).click();
    await expect(page.getByRole("dialog")).toContainText("覆蓋目前欄位");
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
    await request.post("/submit/exercise-1", {
      data: { values: { company_name: "新公司", analysis_goal: "新目标", target_market: "香港" } },
    });
    const agent = await agentOf(request);
    await request.put("/api/agents/exercise-1/fields", {
      data: { fields: agent.fields.filter((field) => field.id !== "company_name") },
    });
    await page.goto("/");
    await selectWorkspace(page, "exercise-1");
    await openRecords(page);
    await expect(page.locator(".bag-head strong")).toHaveText(["提交 #2", "提交 #1"]);
    await expect(page.locator("#bag")).not.toContainText("市場研究員");
    await expect(page.locator("#bag")).not.toContainText("student-mock-1");
    const firstSubmission = page.locator(".bag-item").filter({ hasText: "提交 #1" });
    await expect(firstSubmission).toContainText("company_name 旧公司");
    await expect(firstSubmission).toContainText("表單版本 1");
  });

});
