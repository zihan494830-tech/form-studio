import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

const actorHeader = (id) => ({ "x-form-studio-test-actor": id });
const validValues = {
  company_name: "星海科技",
  analysis_goal: "课堂分析",
  target_market: "香港",
  budget_wan: "10",
  include_competitors: "false",
};

test.describe("3A-B 服务端身份与范围", () => {
  test("提交者来自已验证 actor，忽略 body 伪造身份", async ({ request }) => {
    await resetStore(request);
    const response = await request.post("/submit/exercise-1", {
      headers: actorHeader("student-2"),
      data: { submitterId: "teacher-1", values: validValues },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.envelope.submitterId).toBe("student-2");
    expect((await agentOf(request)).inputBag[0].submitterId).toBe("student-2");
    const authorInbox = await request.get("/api/agents/exercise-1/submissions");
    expect(authorInbox.status()).toBe(200);
    expect(await authorInbox.json()).toMatchObject({
      records: [{ actorId: "student-2", actorName: "市場研究員陳凱", formVersion: 1 }],
    });
    expect((await request.get("/api/agents/exercise-1/submissions", {
      headers: actorHeader("student-2"),
    })).status()).toBe(403);
  });

  test("未验证、错角色和跨班级请求默认拒绝", async ({ request }) => {
    await resetStore(request);
    expect((await request.get("/api/agents", { headers: actorHeader("anonymous") })).status()).toBe(401);
    expect((await request.get("/api/agents", { headers: actorHeader("student-2") })).status()).toBe(403);
    const crossClass = await request.post("/submit/exercise-1", {
      headers: actorHeader("student-other"),
      data: { values: validValues },
    });
    expect(crossClass.status()).toBe(403);
    expect(await crossClass.json()).toMatchObject({ errorCode: "cross_scope_forbidden" });
    expect((await agentOf(request)).inputBag).toHaveLength(0);
  });

  test("绕过浏览器也不能提交非法数字或未声明的 select 选项", async ({ request }) => {
    await resetStore(request);
    const response = await request.post("/submit/exercise-1", {
      data: { values: { ...validValues, budget_wan: "1.5", target_market: "月球" } },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ invalid: ["target_market", "budget_wan"] });
    expect((await agentOf(request)).inputBag).toHaveLength(0);
  });
});
