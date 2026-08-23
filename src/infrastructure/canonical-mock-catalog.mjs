/**
 * 唯一开发 mock 内容源。demo SQLite 与 test 内存都只从这里读取 catalog。
 *
 * 依据：
 * - Django fixtures: https://docs.djangoproject.com/en/5.2/howto/initial-data/
 * - Flyway one source of truth: https://documentation.red-gate.com/flyway/deploying-database-changes-using-flyway/rolling-out-updates-from-a-single-schema-to-multiple-production-databases
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CANONICAL_MOCK_PATH = join(ROOT, "data", "mock-agents.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} 必填`);
  return text;
}

export function loadCanonicalMockCatalog({ path = CANONICAL_MOCK_PATH } = {}) {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed?.schema !== "form-studio-mock-catalog/v1") {
    throw new TypeError("canonical mock catalog schema 非法");
  }
  const datasetRevision = nonEmpty(parsed.datasetRevision, "datasetRevision");
  const defaultScenario = nonEmpty(parsed.defaultScenario, "defaultScenario");
  if (!Array.isArray(parsed.agents) || !parsed.agents.length) {
    throw new TypeError("canonical mock catalog agents 必须是非空数组");
  }
  const ids = new Set();
  for (const agent of parsed.agents) {
    const id = nonEmpty(agent?.id, "agent.id");
    if (ids.has(id)) throw new TypeError(`canonical mock agent id 重复：${id}`);
    ids.add(id);
  }
  if (!ids.has(defaultScenario)) {
    throw new TypeError(`defaultScenario 不存在：${defaultScenario}`);
  }
  return {
    schema: parsed.schema,
    datasetRevision,
    datasetChecksum: createHash("sha256").update(raw).digest("hex"),
    defaultScenario,
    agents: clone(parsed.agents),
  };
}
