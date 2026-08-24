import { expect, test } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createAgentAccess } from "../../src/domain/access/agent-access.mjs";
import { ownerIdentity } from "../../src/domain/agent/owner-identity.mjs";
import { makeOutboxEvent } from "../../src/domain/submission/outbox-event.mjs";
import { makeSubmissionRecord, makeSubmissionRecordV2 } from "../../src/domain/submission/submission-record.mjs";
import { decorateAgent } from "../../src/application/agent-view.mjs";
import { loadCanonicalMockCatalog } from "../../src/infrastructure/canonical-mock-catalog.mjs";

const ROOT = process.cwd();
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const filename of readdirSync(join(ROOT, "contracts")).filter((name) => name.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(ROOT, "contracts", filename), "utf8")));
}

const now = "2026-08-24T08:00:00.000Z";
const envelope = {
  ownerAgent: "exercise-1",
  formVersion: 1,
  submittedAt: now,
  submitterId: "principal-1",
  values: { company_name: "Example" },
};
const catalog = loadCanonicalMockCatalog();
const agent = catalog.agents.find((item) => item.id === "exercise-1");
const inputConfig = JSON.parse(readFileSync(join(ROOT, "data", "local-agent-inputs.json"), "utf8"))[0];

const productionObjects = new Map([
  ["agent-access/v1", createAgentAccess({ tenantId: "tenant-1", classId: "class-1", authorIds: ["author-1"], teacherIds: ["teacher-1"] })],
  ["agent-input-profile/v1", inputConfig.profile],
  ["agent-input-mapping/v1", inputConfig.mapping],
  ["agent-input-outbox-event/v1", makeOutboxEvent({
    id: "outbox-1",
    submissionId: "submission-1",
    ownerAgent: "exercise-1",
    createdAt: now,
    idempotencyKey: "agent-input:submission-1",
    target: inputConfig.profile.transport,
    profile: inputConfig.profile,
    mapping: inputConfig.mapping,
    payload: { companyName: "Example" },
  })],
  ["form-ledger/v1", decorateAgent(agent).ledger],
  ["owner-agent-binding/v1", agent.binding],
  ["owner-agent-identity/v1", ownerIdentity({
    sourceSystem: "poffices",
    externalId: "18",
    name: "Example agent",
    official: false,
    observedAt: now,
  })],
  ["submission-record/v1", makeSubmissionRecord({
    id: "submission-1",
    ownerAgent: "exercise-1",
    receivedAt: now,
    actor: { id: "principal-1", displayName: "Example", role: "student", verifiedBy: "legacy-demo" },
    scope: { tenantId: "tenant-1", classId: "class-1" },
    envelope,
  })],
  ["submission-record/v2", makeSubmissionRecordV2({
    id: "submission-2",
    ownerAgent: "exercise-1",
    receivedAt: now,
    principal: { id: "principal-1", displayName: "Example", verifiedBy: "external-idp" },
    scope: { tenantId: "tenant-1", attributes: { accountId: "account-1" } },
    submissionIntentId: "a5a9e9f6-b690-4d8c-93d8-f645e53fe085",
    envelope,
  })],
]);

test("全部 JSON Schema 都能编译，并各自接受生产对象、拒绝非法对象", () => {
  expect(productionObjects.size).toBe(readdirSync(join(ROOT, "contracts")).filter((name) => name.endsWith(".schema.json")).length);
  for (const [id, value] of productionObjects) {
    const validate = ajv.getSchema(id);
    expect(validate, `${id} 应已编译`).toBeTruthy();
    expect(validate(value), `${id}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    const invalid = { ...value, version: "invalid-contract-version" };
    expect(validate(invalid), `${id} 必须拒绝非法版本`).toBe(false);
  }
});
