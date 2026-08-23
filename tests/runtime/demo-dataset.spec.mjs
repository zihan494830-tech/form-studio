import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { loadCanonicalMockCatalog } from "../../src/infrastructure/canonical-mock-catalog.mjs";
import { createSqliteAgentRepository } from "../../src/infrastructure/sqlite-agent-repository.mjs";
import { createSqliteLocalAgentInputPort } from "../../src/infrastructure/local-agent-input-port.mjs";
import { createSqliteSubmissionRepository } from "../../src/infrastructure/sqlite-submission-repository.mjs";
import { synchronizeDemoDataset } from "../../src/infrastructure/synchronize-demo-dataset.mjs";

function legacyAgent() {
  return {
    id: "old-mock",
    name: "旧 Mock",
    origin: "born-form",
    sourceSystem: "form-studio",
    formVersion: 1,
    fields: [],
    published: null,
    binding: null,
    inputBag: [],
  };
}

test("demo 按 dataset revision 整体替换旧 mock，同版重启保留编辑且允许显式恢复", async () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-demo-data-"));
  const databasePath = join(directory, "studio.sqlite");
  const agents = createSqliteAgentRepository({ databasePath, seed: [legacyAgent()] });
  const submissions = createSqliteSubmissionRepository({ databasePath });
  const inputPort = createSqliteLocalAgentInputPort({ databasePath, now: () => "2026-08-23T00:00:00.000Z" });
  const catalog = loadCanonicalMockCatalog();

  try {
    submissions.append({
      ownerAgent: "old-mock",
      receivedAt: "2026-08-22T00:00:00.000Z",
      envelope: { ownerAgent: "old-mock", formVersion: 1, submittedAt: "2026-08-22T00:00:00.000Z", values: {} },
    });
    await inputPort.deliver({
      idempotencyKey: "old-input",
      submissionId: "submission-1",
      ownerAgent: "old-mock",
      target: { kind: "local-recording", target: "old-mock" },
    });

    const first = synchronizeDemoDataset({
      databasePath,
      catalog,
      now: () => "2026-08-23T01:00:00.000Z",
    });
    expect(first).toMatchObject({ changed: true, previousRevision: null, datasetRevision: catalog.datasetRevision });
    expect(agents.list().map((agent) => agent.id)).toEqual(catalog.agents.map((agent) => agent.id));
    expect(submissions.list()).toEqual([]);
    expect(inputPort.list()).toEqual([]);

    const edited = { ...agents.get(catalog.defaultScenario), name: "本次开发编辑" };
    agents.save(edited);
    expect(synchronizeDemoDataset({ databasePath, catalog }).changed).toBe(false);
    expect(agents.get(catalog.defaultScenario).name).toBe("本次开发编辑");

    const reset = synchronizeDemoDataset({ databasePath, catalog, force: true });
    expect(reset).toMatchObject({ changed: true, forced: true, datasetRevision: catalog.datasetRevision });
    expect(agents.get(catalog.defaultScenario).name).toBe("財務矩陣示例");

    expect(() => synchronizeDemoDataset({
      databasePath,
      catalog: { ...catalog, datasetChecksum: "0".repeat(64) },
    })).toThrow(/递增 datasetRevision/);

    const nextCatalog = {
      ...catalog,
      datasetRevision: "mock-v0.27.2",
      datasetChecksum: "1".repeat(64),
    };
    expect(synchronizeDemoDataset({ databasePath, catalog: nextCatalog }).changed).toBe(true);
    expect(agents.get(catalog.defaultScenario).name).toBe("財務矩陣示例");

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const metadata = new Map(database.prepare("SELECT key, value FROM form_studio_runtime_meta").all().map((row) => [row.key, row.value]));
    database.close();
    expect(metadata.get("dataset_revision")).toBe("mock-v0.27.2");
  } finally {
    inputPort.close();
    submissions.close();
    agents.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("显式恢复拒绝未受 canonical mock 管理的数据库", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-unmanaged-data-"));
  const databasePath = join(directory, "studio.sqlite");
  const agents = createSqliteAgentRepository({ databasePath, seed: [legacyAgent()] });
  const submissions = createSqliteSubmissionRepository({ databasePath });
  const inputPort = createSqliteLocalAgentInputPort({ databasePath });
  try {
    expect(() => synchronizeDemoDataset({
      databasePath,
      catalog: loadCanonicalMockCatalog(),
      force: true,
    })).toThrow(/未受 canonical mock 管理/);
    expect(agents.list().map((agent) => agent.id)).toEqual(["old-mock"]);
  } finally {
    inputPort.close();
    submissions.close();
    agents.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
