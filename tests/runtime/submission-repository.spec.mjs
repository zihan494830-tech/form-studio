import { expect, test } from "@playwright/test";
import { createInMemoryAgentRepository } from "../../src/infrastructure/in-memory-agent-repository.mjs";
import { createInMemorySubmissionRepository } from "../../src/infrastructure/in-memory-submission-repository.mjs";
import { createSubmissionAwareAgentRepository } from "../../src/infrastructure/submission-aware-agent-repository.mjs";

const legacyEnvelope = {
  ownerAgent: "legacy-agent",
  formVersion: 1,
  submittedAt: "2026-08-20T09:00:00.000Z",
  submitterId: "student-old",
  values: { answer: "旧答案" },
};

function legacyAgent() {
  return {
    id: "legacy-agent",
    name: "旧练习",
    origin: "born-form",
    sourceSystem: "form-studio",
    formVersion: 1,
    fields: [],
    published: null,
    binding: null,
    inputBag: [legacyEnvelope],
  };
}

test("3A-A 历史 inputBag 幂等迁移为独立提交记录", () => {
  const agents = createInMemoryAgentRepository([legacyAgent()]);
  const submissions = createInMemorySubmissionRepository();
  let repository = createSubmissionAwareAgentRepository({
    agents,
    submissions,
    now: () => "2026-08-20T10:00:00.000Z",
  });

  expect(repository.listSubmissions({ ownerAgent: "legacy-agent" })).toEqual([
    expect.objectContaining({
      version: "submission-record/v1",
      id: "submission-1",
      ownerAgent: "legacy-agent",
      actor: null,
      scope: null,
      envelope: legacyEnvelope,
    }),
  ]);
  expect(repository.get("legacy-agent").inputBag).toEqual([legacyEnvelope]);
  expect(agents.get("legacy-agent")).toMatchObject({
    inputBag: [],
    submissionMigration: { version: "input-bag-to-submission-record/v1", count: 1 },
  });

  repository = createSubmissionAwareAgentRepository({ agents, submissions });
  expect(repository.listSubmissions({ ownerAgent: "legacy-agent" })).toHaveLength(1);
});

test("3A-A 新提交只写独立仓储，inputBag 保持逻辑兼容", () => {
  const agents = createInMemoryAgentRepository([{ ...legacyAgent(), inputBag: [] }]);
  const submissions = createInMemorySubmissionRepository();
  const repository = createSubmissionAwareAgentRepository({ agents, submissions });
  const nextEnvelope = { ...legacyEnvelope, submittedAt: "2026-08-20T11:00:00.000Z", values: { answer: "新答案" } };

  const updated = repository.appendEnvelope("legacy-agent", nextEnvelope);
  expect(updated.inputBag).toEqual([nextEnvelope]);
  expect(agents.get("legacy-agent").inputBag).toEqual([]);
  expect(repository.listSubmissions({ ownerAgent: "legacy-agent" })[0]).toMatchObject({
    id: "submission-1",
    envelope: nextEnvelope,
  });
});
