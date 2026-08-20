import { expect, test } from "@playwright/test";
import { resetStore } from "../support/project-fixture.mjs";

test("3C 学生提交、老师查看、本地 AgentInputPort 收件走同一故事", async ({ browser, request }) => {
  await resetStore(request);
  const studentContext = await browser.newContext({
    extraHTTPHeaders: { "x-form-studio-test-actor": "student-2" },
  });
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/a/exercise-1");
  await studentPage.getByRole("textbox", { name: "公司或品牌 *" }).fill("星海科技");
  await studentPage.getByRole("textbox", { name: "分析目标 *" }).fill("比较东南亚市场进入机会");
  await studentPage.getByRole("combobox", { name: "目标市场 *" }).selectOption("东南亚");
  await studentPage.getByRole("spinbutton", { name: "预算（万元）" }).fill("12");
  await studentPage.getByRole("checkbox", { name: "包含竞品对比" }).check();
  await studentPage.getByRole("button", { name: "提交" }).click();
  await expect(studentPage.locator("#receipt")).toContainText("提交已保存，正在交给");
  await studentContext.close();

  const teacherContext = await browser.newContext({
    extraHTTPHeaders: { "x-form-studio-test-actor": "teacher-1" },
  });
  const teacherPage = await teacherContext.newPage();
  await teacherPage.goto("/classroom");
  const record = teacherPage.getByRole("button", { name: /student-2/ });
  await expect(record).toBeVisible();
  await record.click();
  await expect(teacherPage.locator("#submission-detail")).toContainText("星海科技");
  await expect(teacherPage.locator("#submission-detail")).toContainText("company_name");
  await expect(teacherPage.locator("#submission-detail")).toContainText("已送达本地 AgentInputPort");
  await expect(teacherPage.locator("#submission-detail")).toContainText("market-analysis-local");
  await teacherContext.close();
});
