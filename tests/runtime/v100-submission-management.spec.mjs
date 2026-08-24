import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteSubmissionRepository } from "../../src/infrastructure/sqlite-submission-repository.mjs";
import { resetStore, submitAgent } from "../support/project-fixture.mjs";

const values = {
  company_name: "星海科技",
  analysis_goal: "評估香港市場",
  target_market: "香港",
  budget_wan: "10",
  include_competitors: "false",
};

async function createSubmission(request) {
  const submitted = await submitAgent(request, "exercise-1", values);
  expect(submitted.ok()).toBeTruthy();
  return (await submitted.json()).submissionId;
}

test("管理状态、备注、标签、归档和恢复使用独立 ETag", async ({ request }) => {
  await resetStore(request);
  const id = await createSubmission(request);
  const detail = await request.get(`/api/agents/exercise-1/submissions/${id}`);
  expect(detail.ok()).toBeTruthy();
  expect(detail.headers().etag).toBe('"submission-management-1"');

  const missing = await request.patch(`/api/agents/exercise-1/submissions/${id}/management`, { data: { status: "in_review" } });
  expect(missing.status()).toBe(428);
  const saved = await request.patch(`/api/agents/exercise-1/submissions/${id}/management`, {
    headers: { "If-Match": '"submission-management-1"' },
    data: { status: "in_review", note: "跟進", tags: ["重要"], assignee: "林悅", archived: true },
  });
  expect(saved.ok()).toBeTruthy();
  expect(await saved.json()).toMatchObject({ management: { revision: 2, status: "in_review", tags: ["重要"], archivedAt: expect.any(String) } });

  const stale = await request.patch(`/api/agents/exercise-1/submissions/${id}/management`, {
    headers: { "If-Match": '"submission-management-1"' }, data: { status: "processed" },
  });
  expect(stale.status()).toBe(412);
  const restored = await request.patch(`/api/agents/exercise-1/submissions/${id}/management`, {
    headers: { "If-Match": '"submission-management-2"' }, data: { archived: false },
  });
  expect(await restored.json()).toMatchObject({ management: { revision: 3, archivedAt: null } });
});

test("修正保留原 envelope、intent 和 delivery，并按原定义校验", async ({ request }) => {
  await resetStore(request);
  const id = await createSubmission(request);
  const before = await (await request.get(`/api/agents/exercise-1/submissions/${id}`)).json();
  const corrected = await request.post(`/api/agents/exercise-1/submissions/${id}/corrections`, {
    headers: { "If-Match": '"submission-management-1"' },
    data: { reason: "填寫人確認公司名稱", changes: { company_name: "星海科技有限公司" } },
  });
  expect(corrected.status()).toBe(201);

  const after = await (await request.get(`/api/agents/exercise-1/submissions/${id}`)).json();
  expect(after.submission.originalValues).toEqual(before.submission.originalValues);
  expect(after.submission.effectiveValues.company_name).toBe("星海科技有限公司");
  expect(after.submission.submissionIntentId).toBe(before.submission.submissionIntentId);
  expect(after.submission.delivery).toEqual(before.submission.delivery);
  expect(after.submission.corrections).toHaveLength(1);

  const invalid = await request.post(`/api/agents/exercise-1/submissions/${id}/corrections`, {
    headers: { "If-Match": '"submission-management-2"' },
    data: { reason: "錯誤測試", changes: { unknown: "x" } },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({ errorCode: "field_values_invalid" });
});

test("无 manage capability 默认拒绝", async ({ request }) => {
  await resetStore(request);
  const id = await createSubmission(request);
  const denied = await request.patch(`/api/agents/exercise-1/submissions/${id}/management`, {
    headers: { "If-Match": '"submission-management-1"', "x-form-studio-test-actor": "teacher-1" },
    data: { status: "processed" },
  });
  expect(denied.status()).toBe(403);
});

test("SQLite 管理状态和修正跨重启保存", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-management-"));
  const databasePath = join(directory, "studio.sqlite");
  try {
    let repository = createSqliteSubmissionRepository({ databasePath });
    const record = repository.append({
      ownerAgent: "agent-1", receivedAt: "2026-08-24T00:00:00.000Z",
      principal: { id: "person-1", displayName: "Person", verifiedBy: "test" },
      scope: { tenantId: "tenant-1", attributes: {} },
      submissionIntentId: "4247729e-522b-4574-bba6-f1f7003e5d14",
      fingerprintSource: "stable",
      envelope: { ownerAgent: "agent-1", formVersion: 1, submittedAt: "2026-08-24T00:00:00.000Z", submitterId: "person-1", values: { answer: "old" } },
    }).record;
    repository.updateManagement(record.id, { ...repository.getManagement(record.id), status: "in_review", tags: ["keep"] },
      { expectedRevision: 1, actorId: "author-1", at: "2026-08-24T01:00:00.000Z" });
    repository.appendCorrection(record.id, { reason: "confirmed", changes: { answer: "new" }, actorId: "author-1", actorName: "Author", createdAt: "2026-08-24T02:00:00.000Z" }, { expectedRevision: 2 });
    repository.close();

    repository = createSqliteSubmissionRepository({ databasePath });
    expect(repository.getManagement(record.id)).toMatchObject({ revision: 3, status: "in_review", tags: ["keep"] });
    expect(repository.listCorrections(record.id)).toEqual([expect.objectContaining({ reason: "confirmed", changes: { answer: "new" } })]);
    expect(repository.listManagementAudit(record.id)).toHaveLength(2);
    repository.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
