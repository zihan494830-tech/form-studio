import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const expectedLedger = JSON.parse(
  readFileSync(join(ROOT, "tests", "fixtures", "exercise-1", "ledger.expected.json"), "utf8"),
);

export async function resetStore(request) {
  const response = await request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
}

export async function agentOf(request, id = "exercise-1") {
  const response = await request.get(`/api/agents/${id}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function saveAgentFields(request, id, fields) {
  const agent = await agentOf(request, id);
  return request.put(`/api/agents/${id}/fields`, {
    headers: { "If-Match": `"agent-${agent.revision}"` },
    data: { fields },
  });
}

export async function publishAgent(request, id) {
  const agent = await agentOf(request, id);
  return request.post(`/api/agents/${id}/publish`, {
    headers: { "If-Match": `"agent-${agent.revision}"` },
  });
}

export async function unpublishAgent(request, id) {
  const agent = await agentOf(request, id);
  return request.post(`/api/agents/${id}/unpublish`, {
    headers: { "If-Match": `"agent-${agent.revision}"` },
  });
}

export async function submitAgent(request, id, values, formVersion = null) {
  const agent = await agentOf(request, id);
  return request.post(`/submit/${id}`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { formVersion: formVersion || agent.published?.formVersion, values },
  });
}
