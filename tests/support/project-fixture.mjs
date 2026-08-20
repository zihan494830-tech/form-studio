import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

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
