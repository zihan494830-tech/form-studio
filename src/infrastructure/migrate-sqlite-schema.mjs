/** Explicit, backed-up migration to SQLite schema v3 without rewriting envelopes. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const TARGET_VERSION = 3;

function hasTable(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function columns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function addColumn(database, known, name, declaration) {
  if (!known.has(name)) database.exec(`ALTER TABLE submissions ADD COLUMN ${name} ${declaration}`);
}

function snapshot(database) {
  const count = hasTable(database, "submissions")
    ? Number(database.prepare("SELECT COUNT(*) AS count FROM submissions").get().count)
    : 0;
  const hash = createHash("sha256");
  if (hasTable(database, "submissions")) {
    for (const row of database.prepare("SELECT sequence, envelope_json FROM submissions ORDER BY sequence").all()) {
      hash.update(`${row.sequence}\u0000${row.envelope_json}\n`);
    }
  }
  return { submissionCount: count, envelopeHash: hash.digest("hex") };
}

function managedDataset(database) {
  if (!hasTable(database, "form_studio_runtime_meta")) return null;
  return database.prepare("SELECT value FROM form_studio_runtime_meta WHERE key = 'dataset_revision'").get()?.value || null;
}

export function migrateSqliteSchema({ databasePath, backupPath, requireManaged = true }) {
  const source = resolve(databasePath);
  const backup = resolve(backupPath);
  if (source === backup) throw new TypeError("备份路径不能与数据库相同");
  if (!existsSync(source)) throw new Error(`数据库不存在：${source}`);
  if (existsSync(backup)) throw new Error(`备份已存在：${backup}`);
  mkdirSync(dirname(backup), { recursive: true });

  const database = new DatabaseSync(source);
  try {
    database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    const version = Number(database.prepare("PRAGMA user_version").get().user_version);
    if (version === TARGET_VERSION) {
      return { changed: false, version, backupPath: null, before: snapshot(database), after: snapshot(database) };
    }
    if (![1, 2].includes(version)) throw new Error(`只支持从 schema v1/v2 升级，当前为 v${version}`);
    const datasetRevision = managedDataset(database);
    if (requireManaged && !datasetRevision) throw new Error("拒绝迁移未受 canonical mock 管理的数据库");

    const before = snapshot(database);
    database.prepare("VACUUM INTO ?").run(backup);
    database.exec("BEGIN IMMEDIATE");
    try {
      if (!hasTable(database, "submissions")) throw new Error(`schema v${version} 缺少 submissions 表`);
      if (version === 1) {
        const known = columns(database, "submissions");
        addColumn(database, known, "actor_name", "TEXT");
        addColumn(database, known, "record_version", "TEXT NOT NULL DEFAULT 'submission-record/v1'");
        addColumn(database, known, "scope_json", "TEXT");
        addColumn(database, known, "submission_intent_id", "TEXT");
        addColumn(database, known, "intent_fingerprint", "TEXT");
      }
      if (version === 1 && hasTable(database, "agent_input_outbox")) {
        database.exec(`
          CREATE TABLE agent_input_outbox_v2 (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_sequence INTEGER NOT NULL UNIQUE REFERENCES submissions(sequence) ON DELETE CASCADE,
            owner_agent TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'delivering', 'delivered', 'failed', 'mapping_review_required')),
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
          INSERT INTO agent_input_outbox_v2 SELECT * FROM agent_input_outbox;
          DROP TABLE agent_input_outbox;
          ALTER TABLE agent_input_outbox_v2 RENAME TO agent_input_outbox;
          CREATE INDEX agent_input_outbox_status ON agent_input_outbox(status, sequence);
        `);
      }
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS submissions_intent
          ON submissions(owner_agent, actor_id, submission_intent_id)
          WHERE submission_intent_id IS NOT NULL;
        CREATE TABLE submission_management (
          submission_sequence INTEGER PRIMARY KEY REFERENCES submissions(sequence) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('new', 'in_review', 'processed')),
          note TEXT NOT NULL DEFAULT '',
          tags_json TEXT NOT NULL DEFAULT '[]',
          assignee TEXT,
          archived_at TEXT,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_at TEXT,
          updated_by TEXT
        ) STRICT;
        CREATE INDEX submission_management_filter
          ON submission_management(status, archived_at, updated_at);
        CREATE TABLE submission_corrections (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_sequence INTEGER NOT NULL REFERENCES submissions(sequence) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          changes_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL
        ) STRICT;
        CREATE INDEX submission_corrections_submission
          ON submission_corrections(submission_sequence, sequence);
        CREATE TABLE submission_management_audit (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          submission_sequence INTEGER NOT NULL REFERENCES submissions(sequence) ON DELETE CASCADE,
          revision INTEGER NOT NULL,
          action TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          detail_json TEXT NOT NULL
        ) STRICT;
        CREATE INDEX submission_management_audit_submission
          ON submission_management_audit(submission_sequence, sequence);
        PRAGMA user_version = 3;
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    const after = snapshot(database);
    if (before.submissionCount !== after.submissionCount || before.envelopeHash !== after.envelopeHash) {
      throw new Error("迁移后提交记录校验失败；请使用备份恢复");
    }
    return { changed: true, fromVersion: version, version: TARGET_VERSION, datasetRevision, backupPath: backup, before, after };
  } finally {
    database.close();
  }
}

export const SQLITE_SCHEMA_VERSION = TARGET_VERSION;
