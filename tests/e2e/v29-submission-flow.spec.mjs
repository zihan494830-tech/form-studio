import { expect, test } from "@playwright/test";
import { agentOf, publishAgent, resetStore, saveAgentFields } from "../support/project-fixture.mjs";
import { startBornFlow } from "../support/ui-actions.mjs";

async function fillPublishedForm(page, goal = "评估香港市场") {
  await page.locator("#company_name").fill("星海科技");
  await page.locator("#analysis_goal").fill(goal);
  await page.locator("#target_market").selectOption("香港");
  await page.locator("#budget_wan").fill("10");
}

test("同一浏览器的设计工作台与填写页身份并存，提交后锁定并以新 intent 再填", async ({ context, page, request }) => {
  await resetStore(request);
  await page.goto("/?scenario=exercise-1");
  await expect(page.locator("#actor-name")).toContainText("測試帳號");

  const face = await context.newPage();
  await face.goto("/a/exercise-1");
  await expect(face.locator("#submission-session")).toContainText("目前填寫者");
  await expect(face.locator("#submission-session")).toContainText("市場研究員林悅");
  const firstIntent = await face.locator("#agent-form").getAttribute("data-submission-intent-id");
  await fillPublishedForm(face);
  await face.locator('#agent-form [type="submit"]').click();
  await expect(face.locator("#receipt")).toHaveClass(/show/);
  await expect(face.locator("#company_name")).toBeDisabled();
  await expect(face.getByRole("button", { name: "再填一份" })).toBeVisible();

  await face.getByRole("button", { name: "再填一份" }).click();
  await expect(face.locator("#company_name")).toBeEnabled();
  const secondIntent = await face.locator("#agent-form").getAttribute("data-submission-intent-id");
  expect(secondIntent).not.toBe(firstIntent);
  await expect(page.locator("#actor-name")).toContainText("測試帳號");
  expect((await agentOf(request)).inputBag).toHaveLength(1);
});

test("旧页面 409 后只恢复新版仍存在且合法的答案，并要求重新提交", async ({ page, request }) => {
  await resetStore(request);
  await page.goto("/a/exercise-1");
  await fillPublishedForm(page, "旧页答案");

  const agent = await agentOf(request);
  await saveAgentFields(request, "exercise-1", [
    ...agent.fields,
    { id: "optional_note", label: "新版备注", control: "text", required: false },
  ]);
  await publishAgent(request, "exercise-1");

  await page.locator('#agent-form [type="submit"]').click();
  await expect(page.locator("#receipt")).toContainText("表單已更新");
  await page.getByRole("button", { name: "載入最新版" }).click();
  await expect(page.locator("#optional_note")).toBeVisible();
  await expect(page.locator("#company_name")).toHaveValue("星海科技");
  await expect(page.locator("#analysis_goal")).toHaveValue("旧页答案");
  await expect(page.locator('#agent-form [type="submit"]')).toBeEnabled();
  expect((await agentOf(request)).inputBag).toHaveLength(0);
});

test("Enter 连击只创建一个工作区，预览始终没有正式提交能力", async ({ page, request }) => {
  await resetStore(request);
  let createRequests = 0;
  page.on("request", (call) => {
    if (call.method() === "POST" && new URL(call.url()).pathname === "/api/agents") createRequests += 1;
  });
  await page.goto("/");
  await startBornFlow(page);
  await page.locator("#new-name").fill("单次创建");
  await page.locator("#new-name").dispatchEvent("keydown", { key: "Enter" });
  await page.locator("#new-name").dispatchEvent("keydown", { key: "Enter" });
  await expect.poll(() => createRequests).toBe(1);
  await expect.poll(async () => (await (await request.get("/api/agents")).json()).filter((agent) => agent.name === "单次创建").length).toBe(1);

  const frame = page.frameLocator('iframe[name="face"]');
  await expect(frame.locator('#agent-form [type="submit"]')).toHaveCount(0);
  const runtimeSource = await (await request.get("/runtime/face-submit.js")).text();
  expect(runtimeSource).not.toContain("postMessage(");
});
