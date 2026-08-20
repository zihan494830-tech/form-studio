/** 独立提交记录仓储；原提交信封作为不可改写的 JSON 快照保存。 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeSubmissionRecord } from "../domain/submission/submission-record.mjs";

function encode(value) {
  return value == null ? null : JSON.stringify(value);
}

function decode(value) {
  return value == null ? null : JSON.parse(value);
}

export function createSqliteSubmissionRepository({ databasePath }) {
  if (!databasePath) throw new TypeError("databasePath 必填");
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  let closed = false;
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS submissions (
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
    CREATE INDEX IF NOT EXISTS submissions_owner_time
      ON submissions(owner_agent, received_at DESC);
    CREATE INDEX IF NOT EXISTS submissions_scope
      ON submissions(tenant_id, class_id, received_at DESC);
  `);

  const insert = database.prepare(`
    INSERT INTO submissions (
      owner_agent, received_at, actor_id, actor_role, actor_verified_by,
      tenant_id, class_id, envelope_json, legacy_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLegacy = database.prepare(`
    INSERT OR IGNORE INTO submissions (
      owner_agent, received_at, actor_id, actor_role, actor_verified_by,
      tenant_id, class_id, envelope_json, legacy_key
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `);
  const bySequence = database.prepare("SELECT * FROM submissions WHERE sequence = ?");

  function fromRow(row) {
    if (!row) return null;
    const actor = row.actor_id ? { id: row.actor_id, role: row.actor_role, verifiedBy: row.actor_verified_by } : null;
    const scope = row.tenant_id ? { tenantId: row.tenant_id, classId: row.class_id } : null;
    return makeSubmissionRecord({
      id: `submission-${row.sequence}`,
      ownerAgent: row.owner_agent,
      receivedAt: row.received_at,
      actor,
      scope,
      envelope: decode(row.envelope_json),
    });
  }

  function values(input, legacyKey = null) {
    return [
      input.ownerAgent,
      input.receivedAt,
      input.actor?.id ?? null,
      input.actor?.role ?? null,
      input.actor?.verifiedBy ?? null,
      input.scope?.tenantId ?? null,
      input.scope?.classId ?? null,
      encode(input.envelope),
      legacyKey,
    ];
  }

  return {
    append(input) {
      const result = insert.run(...values(input));
      return fromRow(bySequence.get(result.lastInsertRowid));
    },
    importLegacy(ownerAgent, envelopes) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const imported = [];
        (envelopes || []).forEach((envelope, index) => {
          const key = `legacy:${ownerAgent}:${index}`;
          const result = insertLegacy.run(ownerAgent, envelope.submittedAt, encode(envelope), key);
          if (Number(result.changes) > 0) imported.push(fromRow(bySequence.get(result.lastInsertRowid)));
        });
        database.exec("COMMIT");
        return imported;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    list(query = {}) {
      const clauses = [], params = [];
      const add = (clause, value) => { if (value) { clauses.push(clause); params.push(value); } };
      add("owner_agent = ?", query.ownerAgent);
      add("actor_id = ?", query.actorId);
      add("tenant_id = ?", query.tenantId);
      add("class_id = ?", query.classId);
      add("received_at >= ?", query.from);
      add("received_at <= ?", query.to);
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      return database.prepare(`SELECT * FROM submissions${where} ORDER BY received_at, sequence`).all(...params).map(fromRow);
    },
    get(id) {
      const match = /^submission-([1-9][0-9]*)$/.exec(String(id));
      return match ? fromRow(bySequence.get(Number(match[1]))) : null;
    },
    reset() {
      database.exec("BEGIN IMMEDIATE; DELETE FROM submissions; DELETE FROM sqlite_sequence WHERE name = 'submissions'; COMMIT;");
      return [];
    },
    close() {
      if (!closed) {
        database.close();
        closed = true;
      }
    },
    databasePath: path,
  };
}
