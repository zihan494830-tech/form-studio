import { expect, test } from "@playwright/test";
import { agentOf, resetStore } from "../support/project-fixture.mjs";

const validValues = {
  company_name: "星海科技",
  analysis_goal: "评估香港市场",
  target_market: "香港",
  budget_wan: "10",
  include_competitors: "false",
};

async function submit(request, key, values = validValues, formVersion = 1) {
  return request.post("/submit/exercise-1", {
    headers: { "Idempotency-Key": key },
    data: { formVersion, values },
  });
}

test("旧发布页返回 409 且零写入", async ({ request }) => {
  await resetStore(request);
  const response = await submit(request, "1800ce68-f29d-4765-8707-c53df0074ed0", validValues, 99);
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({
    errorCode: "form_version_conflict",
    parameters: { submittedVersion: 99, currentVersion: 1 },
  });
  expect((await agentOf(request)).inputBag).toHaveLength(0);
});

test("同一 submission intent 并发重试只写一份，不同内容返回冲突", async ({ request }) => {
  await resetStore(request);
  const key = "73805ac3-8099-4444-9ad4-320345f12c20";
  const [first, second] = await Promise.all([submit(request, key), submit(request, key)]);
  expect([first.status(), second.status()]).toEqual([200, 200]);
  const bodies = await Promise.all([first.json(), second.json()]);
  expect(new Set(bodies.map((body) => body.submissionId)).size).toBe(1);
  expect(bodies.filter((body) => body.replayed)).toHaveLength(1);
  expect(new Set(bodies.map((body) => body.delivery.eventId)).size).toBe(1);
  expect((await agentOf(request)).inputBag).toHaveLength(1);

  const conflict = await submit(request, key, { ...validValues, analysis_goal: "另一项工作" });
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({ errorCode: "submission_intent_conflict" });
  expect((await agentOf(request)).inputBag).toHaveLength(1);
});

test("提交响应不返回 agent 或其他提交者的 inputBag", async ({ request }) => {
  await resetStore(request);
  const firstValues = { ...validValues, company_name: "第一位提交者的私密公司" };
  const first = await submit(request, "4f2c36e3-6d07-4f13-8271-f18a4c87824f", firstValues);
  expect(first.status()).toBe(200);

  const second = await request.post("/submit/exercise-1", {
    headers: {
      "Idempotency-Key": "dd37aee7-8dd6-4bcf-90f5-0c4f66d761ba",
      "x-form-studio-test-actor": "student-2",
    },
    data: { formVersion: 1, values: { ...validValues, company_name: "第二位提交者的公司" } },
  });
  expect(second.status()).toBe(200);
  const body = await second.json();
  expect(body).not.toHaveProperty("agent");
  expect(JSON.stringify(body)).not.toContain(firstValues.company_name);
  expect((await agentOf(request)).inputBag).toHaveLength(2);
});

test("提交拒绝对象值、未知字段、错误 Content-Type 与超大 JSON", async ({ request }) => {
  await resetStore(request);
  const objectValue = await submit(request, "9155471a-9587-408f-b53a-a83fd8536460", {
    ...validValues,
    company_name: { injected: true },
  });
  expect(objectValue.status()).toBe(400);
  expect(await objectValue.json()).toMatchObject({ errorCode: "field_values_invalid", invalid: ["company_name"] });

  const unknown = await submit(request, "d03d9dca-7ad0-4a1d-84b4-6fa5304f734e", { ...validValues, hidden: "x" });
  expect(unknown.status()).toBe(400);
  expect(await unknown.json()).toMatchObject({ errorCode: "field_values_invalid", invalid: ["hidden"] });

  const media = await request.post("/submit/exercise-1", {
    headers: { "Content-Type": "text/plain", "Idempotency-Key": "f73d5c4d-e0b0-4a68-a373-052628621766" },
    data: JSON.stringify({ formVersion: 1, values: validValues }),
  });
  expect(media.status()).toBe(415);
  expect(await media.json()).toMatchObject({ errorCode: "unsupported_media_type" });

  const jsonLikeMedia = await request.post("/submit/exercise-1", {
    headers: { "Content-Type": "application/jsonp", "Idempotency-Key": "c9846031-44c8-4d91-9011-6eae6f15d84c" },
    data: JSON.stringify({ formVersion: 1, values: validValues }),
  });
  expect(jsonLikeMedia.status()).toBe(415);
  expect(await jsonLikeMedia.json()).toMatchObject({ errorCode: "unsupported_media_type" });

  const large = await request.post("/submit/exercise-1", {
    headers: { "Content-Type": "application/json", "Idempotency-Key": "ab28f663-b553-4345-a973-0b26bbb2d386" },
    data: JSON.stringify({ formVersion: 1, values: { company_name: "x".repeat(1024 * 1024) } }),
  });
  expect(large.status()).toBe(413);
  expect(await large.json()).toMatchObject({ errorCode: "payload_too_large" });
  expect((await agentOf(request)).inputBag).toHaveLength(0);
});

test("作者变更必须带 If-Match，两个 stale revision 只有一个成功", async ({ request }) => {
  await resetStore(request);
  const initial = await agentOf(request, "exercise-2");
  const fieldsA = [{ id: "answer", label: "A", control: "text", required: false }];
  const fieldsB = [{ id: "answer", label: "B", control: "text", required: false }];

  const missing = await request.put("/api/agents/exercise-2/fields", { data: { fields: fieldsA } });
  expect(missing.status()).toBe(428);

  const headers = { "If-Match": `"agent-${initial.revision}"` };
  const [first, second] = await Promise.all([
    request.put("/api/agents/exercise-2/fields", { headers, data: { fields: fieldsA } }),
    request.put("/api/agents/exercise-2/fields", { headers, data: { fields: fieldsB } }),
  ]);
  expect([first.status(), second.status()].sort()).toEqual([200, 412]);
  expect((await agentOf(request, "exercise-2")).revision).toBe(initial.revision + 1);
});
