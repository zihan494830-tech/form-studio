import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

test.describe("提交信封与封闭控件词表", () => {
  test("空提交停在表上，inputBag 保持为空", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/fixture/exercise-1");
    expect(await page.locator("#agent-form").evaluate((form) => form.checkValidity())).toBe(false);
    await page.getByRole("button", { name: "提交" }).click();
    expect((await agentOf(request)).inputBag).toHaveLength(0);
  });

  test("非法 number 不得入袋", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/fixture/exercise-1");
    await page.locator("#q1").fill("第一题");
    await page.locator("#a1").fill("学生作答");
    await page.locator("#n1").evaluate((element) => { element.value = "abc"; });
    await page.getByRole("button", { name: "提交" }).click();
    expect((await agentOf(request)).inputBag).toHaveLength(0);
  });

  test("成功提交按 values[id] 追加信封", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/fixture/exercise-1");
    await page.locator("#q1").fill("第一题");
    await page.locator("#n1").fill("90");
    await page.locator("#a1").fill("学生作答");
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.locator("#receipt")).toContainText("已交给");
    const envelope = (await agentOf(request)).inputBag[0];
    expect(envelope).toMatchObject({
      ownerAgent: "exercise-1", formVersion: 1, submitterId: "student-mock-1",
      values: { q1: "第一题", n1: "90", a1: "学生作答" },
    });
    expect(envelope.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("重复提交只追加，不覆盖旧信封", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/fixture/exercise-1");
    await page.locator("#q1").fill("第一题");
    await page.locator("#n1").fill("90");
    await page.locator("#a1").fill("第一次");
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.locator("#receipt")).toContainText("已交给");
    await page.locator("#a1").fill("第二次");
    await page.getByRole("button", { name: "提交" }).click();
    const bag = (await agentOf(request)).inputBag;
    expect(bag).toHaveLength(2);
    expect(bag.map((item) => item.values.a1)).toEqual(["第一次", "第二次"]);
  });

  test("五种控件能入袋，file 被拒绝", async ({ page, request }) => {
    await resetStore(request);
    const fields = [
      { id: "text1", label: "单行", control: "text", required: true },
      { id: "memo1", label: "多行", control: "textarea", required: true },
      { id: "num1", label: "数字", control: "number", required: true },
      { id: "choice1", label: "选择", control: "select", required: true, options: ["甲", "乙"] },
      { id: "agree1", label: "同意", control: "checkbox", required: true },
    ];
    expect((await request.put("/api/agents/exercise-2/fields", { data: { fields } })).ok()).toBeTruthy();
    expect((await request.post("/api/agents/exercise-2/publish")).ok()).toBeTruthy();
    await page.goto("/a/exercise-2");
    await page.locator("#text1").fill("文字");
    await page.locator("#memo1").fill("长答案");
    await page.locator("#num1").fill("7");
    await page.locator("#choice1").selectOption("甲");
    await page.locator("#agree1").check();
    await page.getByRole("button", { name: "提交" }).click();
    await expect(page.locator("#receipt")).toContainText("已交给");
    expect((await agentOf(request, "exercise-2")).inputBag[0].values).toEqual({
      text1: "文字", memo1: "长答案", num1: "7", choice1: "甲", agree1: "true",
    });
    const rejected = await request.put("/api/agents/exercise-2/fields", {
      data: { fields: [{ id: "upload1", label: "上传", control: "file", required: true }] },
    });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).error).toContain("非法控件：file");
  });
});
