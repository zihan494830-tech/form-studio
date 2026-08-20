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
    expect((await crossClass.json()).error).toContain("其他班级或租户");
    expect((await agentOf(request)).inputBag).toHaveLength(0);
  });
});
