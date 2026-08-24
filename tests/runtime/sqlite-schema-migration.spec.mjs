import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { migrateSqliteSchema } from "../../src/infrastructure/migrate-sqlite-schema.mjs";
import { createSqliteSubmissionRepository } from "../../src/infrastructure/sqlite-submission-repository.mjs";

function createV1(databasePath, { managed = true } = {}) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA user_version = 1;
    CREATE TABLE submissions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_agent TEXT NOT NULL,
      received_at TEXT NOT NULL,
      actor_id TEXT,
      actor_role TEXT,
      actor_verified_by TEXT,
      tenant_id TEXT,
      class_id TEXT,
      envelope_json TEXT NOT NULL,
      legacy_key TEXT UNIQUE
    ) STRICT;
    CREATE TABLE agent_input_outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_sequence INTEGER NOT NULL UNIQUE REFERENCES submissions(sequence) ON DELETE CASCADE,
      owner_agent TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'delivering', 'delivered', 'failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      target_json TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      last_error TEXT,
      receipt_json TEXT
    ) STRICT;
    CREATE TABLE form_studio_runtime_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  `);
  if (managed) database.prepare("INSERT INTO form_studio_runtime_meta (key, value) VALUES ('dataset_revision', 'mock-v0.27.1')").run();
  const envelope = JSON.stringify({
    ownerAgent: "legacy-1",
    formVersion: 1,
    submittedAt: "2026-08-20T00:00:00.000Z",
    submitterId: "legacy-user",
    values: { answer: "kept" },
  });
  database.prepare(`
    INSERT INTO submissions (
      owner_agent, received_at, actor_id, actor_role, actor_verified_by,
      tenant_id, class_id, envelope_json, legacy_key
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `).run("legacy-1", "2026-08-20T00:00:00.000Z", envelope, "legacy:legacy-1:0");
  database.close();
}

function createV2(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA user_version = 2;
    CREATE TABLE submissions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, owner_agent TEXT NOT NULL,
      received_at TEXT NOT NULL, actor_id TEXT, actor_name TEXT, actor_role TEXT,
      actor_verified_by TEXT, tenant_id TEXT, class_id TEXT,
      record_version TEXT NOT NULL DEFAULT 'submission-record/v1', scope_json TEXT,
      submission_intent_id TEXT, intent_fingerprint TEXT, envelope_json TEXT NOT NULL,
      legacy_key TEXT UNIQUE
    ) STRICT;
    CREATE TABLE form_studio_runtime_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    INSERT INTO form_studio_runtime_meta VALUES ('dataset_revision', 'mock-v0.27.1');
  `);
  const envelope = JSON.stringify({ ownerAgent: "v2-agent", formVersion: 9,
    submittedAt: "2026-08-24T00:00:00.000Z", submitterId: "submitter-1", values: { answer: "kept" } });
  database.prepare("INSERT INTO submissions (owner_agent, received_at, envelope_json) VALUES (?, ?, ?)")
    .run("v2-agent", "2026-08-24T00:00:00.000Z", envelope);
  database.close();
}

test("受管 mock SQLite v1 先备份再迁移到 v3，历史 envelope 不改写且可重启读取", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-schema-v3-"));
  const databasePath = join(directory, "studio.sqlite");
  const backupPath = join(directory, "backups", "studio-v1.sqlite");
  try {
    createV1(databasePath);
    const result = migrateSqliteSchema({ databasePath, backupPath });
    expect(result).toMatchObject({
      changed: true,
      version: 3,
      before: { submissionCount: 1 },
      after: { submissionCount: 1 },
    });
    expect(result.before.envelopeHash).toBe(result.after.envelopeHash);
    expect(existsSync(backupPath)).toBe(true);

    const backup = new DatabaseSync(backupPath, { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get().user_version).toBe(1);
    backup.close();

    const repository = createSqliteSubmissionRepository({ databasePath });
    expect(repository.list()).toEqual([expect.objectContaining({
      version: "submission-record/v1",
      envelope: expect.objectContaining({ values: { answer: "kept" } }),
    })]);
    repository.close();
    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    expect(migrated.prepare("PRAGMA user_version").get().user_version).toBe(3);
    expect(migrated.prepare("SELECT record_version FROM submissions").get().record_version).toBe("submission-record/v1");
    expect(migrated.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='submission_management'").get().name).toBe("submission_management");
    migrated.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("未受管 SQLite 停止迁移且不生成备份", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-schema-unmanaged-"));
  const databasePath = join(directory, "studio.sqlite");
  const backupPath = join(directory, "studio-v1.sqlite");
  try {
    createV1(databasePath, { managed: false });
    expect(() => migrateSqliteSchema({ databasePath, backupPath })).toThrow(/未受 canonical mock 管理/);
    expect(existsSync(backupPath)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("受管 schema v2 备份后升到 v3，提交数量与 envelope hash 不变", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-schema-v2-to-v3-"));
  const databasePath = join(directory, "studio.sqlite");
  const backupPath = join(directory, "form-studio-schema-v2.sqlite");
  try {
    createV2(databasePath);
    const result = migrateSqliteSchema({ databasePath, backupPath });
    expect(result).toMatchObject({ changed: true, fromVersion: 2, version: 3,
      before: { submissionCount: 1 }, after: { submissionCount: 1 } });
    expect(result.before.envelopeHash).toBe(result.after.envelopeHash);
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get().user_version).toBe(2);
    backup.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
