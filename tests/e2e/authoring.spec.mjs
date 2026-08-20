import { expect, test } from "@playwright/test";
import { agentOf, expectedLedger, resetStore } from "../support/project-fixture.mjs";

test.describe("第 1b 段作者设计与新生", () => {
  test("改装对象加字段后发布，打开能填能入袋", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.getByRole("button", { name: /练习二/ }).click();
    await page.getByRole("button", { name: "加栏" }).click();
    await page.getByRole("button", { name: "发布为用户页面" }).click();
    const face = page.frameLocator('iframe[name="face"]');
    await expect(face.getByText("请填完后提交")).toBeVisible();
    await face.locator("#f1").fill("hello");
    await face.getByRole("button", { name: "提交" }).click();
    expect((await agentOf(request, "exercise-2")).inputBag[0].values).toEqual({ f1: "hello" });
  });

  test("新建 agent form 后打开就是刚画的表", async ({ page, request }) => {
    await resetStore(request);
    await page.goto("/");
    await page.locator("#new-name").fill("登记表");
    await page.getByRole("button", { name: "新建 agent form" }).click();
    await page.getByRole("button", { name: "加栏" }).click();
    await page.getByRole("button", { name: "发布为用户页面" }).click();
    const list = await (await request.get("/api/agents")).json();
    const born = list.find((item) => item.origin === "born-form");
    expect(born).toMatchObject({ name: "登记表", formId: born.id });
    await page.goto(`/a/${born.id}`);
    await expect(page.locator("#f1")).toBeVisible();
  });

  test("草稿不撞使用面，重新发布后才切换", async ({ page, request }) => {
    await resetStore(request);
    const fields = [...expectedLedger.fields, { id: "draft1", label: "草稿栏", control: "text", required: true }];
    const draft = await request.put("/api/agents/exercise-1/fields", { data: { fields } });
    expect((await draft.json()).ledger.status).toBe("draft");
    await page.goto("/a/exercise-1");
    await expect(page.locator("#draft1")).toHaveCount(0);
    const published = await request.post("/api/agents/exercise-1/bind");
    expect((await published.json()).ledger.status).toBe("published");
    await page.reload();
    await expect(page.locator("#draft1")).toBeVisible();
  });

  test("新生未发布和下架后不可打开，inputBag 保留", async ({ request }) => {
    await resetStore(request);
    const created = await (await request.post("/api/agents", { data: { name: "下架测试" } })).json();
    expect((await request.get(`/a/${created.id}`)).status()).toBe(404);
    await request.put(`/api/agents/${created.id}/fields`, {
      data: { fields: [{ id: "f1", label: "内容", control: "text", required: true }] },
    });
    await request.post(`/api/agents/${created.id}/bind`);
    await request.post(`/submit/${created.id}`, {
      data: { values: { f1: "留下" }, submitterId: "student-mock-1" },
    });
    await request.post(`/api/agents/${created.id}/unbind`);
    expect((await request.get(`/a/${created.id}`)).status()).toBe(404);
    expect((await agentOf(request, created.id)).inputBag[0].values).toEqual({ f1: "留下" });
  });
});
