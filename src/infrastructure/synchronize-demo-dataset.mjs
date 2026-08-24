/**
 * 在 demo 服务监听前，把 canonical mock catalog 物化到 SQLite。
 * 同一 revision 的 checksum 不允许漂移；升级 revision 时整体替换开发 mock 状态。
 *
 * 依据：
 * - Flyway schema history/checksum: https://documentation.red-gate.com/flyway/flyway-concepts/migrations/flyway-schema-history-table
 * - EF Core seeding initialization boundary: https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding
 */
import { DatabaseSync } from "node:sqlite";

const META_TABLE = "form_studio_runtime_meta";

function encode(value) {
  return JSON.stringify(value);
}

function metadata(database) {
  const rows = database.prepare(`SELECT key, value FROM ${META_TABLE}`).all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

function replaceAll(database, catalog, appliedAt) {
  const insertAgent = database.prepare("INSERT INTO agents (id, payload, ordinal) VALUES (?, ?, ?)");
  const putMeta = database.prepare(`
    INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      DELETE FROM agent_input_outbox;
      DELETE FROM submissions;
      DELETE FROM local_agent_inputs;
      DELETE FROM agents;
      DELETE FROM sqlite_sequence WHERE name IN ('submissions', 'agent_input_outbox');
    `);
    catalog.agents.forEach((agent, index) => insertAgent.run(agent.id, encode(agent), index));
    putMeta.run("dataset_revision", catalog.datasetRevision);
    putMeta.run("dataset_checksum", catalog.datasetChecksum);
    putMeta.run("dataset_applied_at", appliedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function synchronizeDemoDataset({
  databasePath,
  catalog,
  now = () => new Date().toISOString(),
  force = false,
  allowInitialize = false,
}) {
  if (!databasePath) throw new TypeError("databasePath 必填");
  if (!catalog?.datasetRevision || !catalog?.datasetChecksum || !Array.isArray(catalog.agents)) {
    throw new TypeError("canonical mock catalog 不完整");
  }
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `);
    const current = metadata(database);
    const currentRevision = current.get("dataset_revision") || null;
    const currentChecksum = current.get("dataset_checksum") || null;
    if (!currentRevision) {
      if (force || !allowInitialize) {
        throw new Error("拒绝替换未受 canonical mock 管理的数据库");
      }
    } else if (currentRevision === catalog.datasetRevision) {
      if (currentChecksum !== catalog.datasetChecksum) {
        throw new Error(`canonical mock ${catalog.datasetRevision} 内容已改变；请递增 datasetRevision`);
      }
      if (!force) return { changed: false, datasetRevision: currentRevision, datasetChecksum: currentChecksum };
    }
    const appliedAt = now();
    replaceAll(database, catalog, appliedAt);
    return {
      changed: true,
      forced: force,
      previousRevision: currentRevision,
      datasetRevision: catalog.datasetRevision,
      datasetChecksum: catalog.datasetChecksum,
      appliedAt,
    };
  } finally {
    database.close();
  }
}
