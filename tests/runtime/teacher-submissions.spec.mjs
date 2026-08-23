import { expect, test } from "@playwright/test";
import { resetStore } from "../support/project-fixture.mjs";

const actor = (id) => ({ "x-form-studio-test-actor": id });
const values = {
  company_name: "星海科技",
  analysis_goal: "课堂分析",
  target_market: "香港",
  budget_wan: "12",
  include_competitors: "true",
};

test.describe("3A-C 老师查询端口", () => {
  test.beforeEach(async ({ request }) => resetStore(request));

  test("获授权老师能按页面、学生和字段 ID 查看提交", async ({ request }) => {
    const submitted = await request.post("/submit/exercise-1", {
      headers: actor("student-2"), data: { values },
    });
    expect(submitted.ok()).toBeTruthy();

    const pages = await request.get("/api/teacher/agents", { headers: actor("teacher-1") });
    const visibleAgents = (await pages.json()).agents;
    expect(visibleAgents.find((agent) => agent.ownerAgent === "exercise-1")).toMatchObject({
      ownerAgent: "exercise-1",
      submissionCount: 1,
    });

    const list = await request.get("/api/teacher/agents/exercise-1/submissions?actorId=student-2", {
      headers: actor("teacher-1"),
    });
    const listBody = await list.json();
    expect(listBody.records).toHaveLength(1);
    expect(listBody.records[0]).toMatchObject({ actorId: "student-2", fieldCount: 5 });

    const detail = await request.get(`/api/teacher/submissions/${listBody.records[0].id}`, {
      headers: actor("teacher-1"),
    });
    expect(await detail.json()).toMatchObject({
      record: {
        ownerAgent: "exercise-1",
        actorId: "student-2",
        fields: expect.arrayContaining([
          { id: "company_name", label: "公司或品牌", control: "text", value: "星海科技" },
        ]),
      },
    });
    await expect.poll(async () => {
      const latest = await request.get(`/api/teacher/submissions/${listBody.records[0].id}`, {
        headers: actor("teacher-1"),
      });
      return (await latest.json()).record.delivery;
    }).toMatchObject({ status: "delivered", target: "market-analysis-local", transport: "local-recording" });
  });

  test("学生、其他老师和其他班级默认不能读取", async ({ request }) => {
    await request.post("/submit/exercise-1", { headers: actor("student-mock-1"), data: { values } });
    const list = await request.get("/api/teacher/agents/exercise-1/submissions", { headers: actor("teacher-1") });
    const id = (await list.json()).records[0].id;

    expect((await request.get("/api/teacher/agents", { headers: actor("student-mock-1") })).status()).toBe(403);
    expect((await request.get("/api/teacher/agents/exercise-1/submissions", { headers: actor("teacher-other") })).status()).toBe(403);
    expect((await request.get(`/api/teacher/submissions/${id}`, { headers: actor("teacher-other") })).status()).toBe(403);
  });
});
