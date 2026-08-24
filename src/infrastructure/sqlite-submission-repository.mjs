/** 独立提交记录仓储；原提交信封作为不可改写的 JSON 快照保存。 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeSubmissionRecord, makeSubmissionRecordV2 } from "../domain/submission/submission-record.mjs";
import { makeOutboxEvent } from "../domain/submission/outbox-event.mjs";
import { createSqliteSubmissionManagementStore } from "./sqlite-submission-management.mjs";

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
  const existingVersion = Number(database.prepare("PRAGMA user_version").get().user_version);
  if (existingVersion === 1 || existingVersion === 2) {
    database.close();
    throw new Error("提交仓储需要先执行 npm run data:migrate 升级到 schema v3");
  }
  if (![0, 3].includes(existingVersion)) {
    database.close();
    throw new Error(`不支持的提交仓储版本：${existingVersion}`);
  }
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS submissions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_agent TEXT NOT NULL,
      received_at TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      actor_verified_by TEXT,
      tenant_id TEXT,
      class_id TEXT,
      record_version TEXT NOT NULL DEFAULT 'submission-record/v1',
      scope_json TEXT,
      submission_intent_id TEXT,
      intent_fingerprint TEXT,
      envelope_json TEXT NOT NULL,
      legacy_key TEXT UNIQUE
    ) STRICT;
    CREATE INDEX IF NOT EXISTS submissions_owner_time
      ON submissions(owner_agent, received_at DESC);
    CREATE INDEX IF NOT EXISTS submissions_scope
      ON submissions(tenant_id, class_id, received_at DESC);
    CREATE TABLE IF NOT EXISTS agent_input_outbox (
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
    CREATE INDEX IF NOT EXISTS agent_input_outbox_status
      ON agent_input_outbox(status, sequence);
    CREATE TABLE IF NOT EXISTS submission_management (
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
    CREATE INDEX IF NOT EXISTS submission_management_filter
      ON submission_management(status, archived_at, updated_at);
    CREATE TABLE IF NOT EXISTS submission_corrections (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_sequence INTEGER NOT NULL REFERENCES submissions(sequence) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS submission_corrections_submission
      ON submission_corrections(submission_sequence, sequence);
    CREATE TABLE IF NOT EXISTS submission_management_audit (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_sequence INTEGER NOT NULL REFERENCES submissions(sequence) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      detail_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS submission_management_audit_submission
      ON submission_management_audit(submission_sequence, sequence);
  `);
  const submissionColumns = new Set(database.prepare("PRAGMA table_info(submissions)").all().map((column) => column.name));
  if (!submissionColumns.has("actor_name")) database.exec("ALTER TABLE submissions ADD COLUMN actor_name TEXT");
  if (!submissionColumns.has("record_version")) database.exec("ALTER TABLE submissions ADD COLUMN record_version TEXT NOT NULL DEFAULT 'submission-record/v1'");
  if (!submissionColumns.has("scope_json")) database.exec("ALTER TABLE submissions ADD COLUMN scope_json TEXT");
  if (!submissionColumns.has("submission_intent_id")) database.exec("ALTER TABLE submissions ADD COLUMN submission_intent_id TEXT");
  if (!submissionColumns.has("intent_fingerprint")) database.exec("ALTER TABLE submissions ADD COLUMN intent_fingerprint TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS submissions_intent
      ON submissions(owner_agent, actor_id, submission_intent_id)
      WHERE submission_intent_id IS NOT NULL;
  `);
  if (existingVersion === 0) database.exec("PRAGMA user_version = 3");

  const insert = database.prepare(`
    INSERT INTO submissions (
      owner_agent, received_at, actor_id, actor_name, actor_role, actor_verified_by,
      tenant_id, class_id, record_version, scope_json, submission_intent_id,
      intent_fingerprint, envelope_json, legacy_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLegacy = database.prepare(`
    INSERT OR IGNORE INTO submissions (
      owner_agent, received_at, actor_id, actor_role, actor_verified_by,
      tenant_id, class_id, envelope_json, legacy_key
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
  `);
  const bySequence = database.prepare("SELECT * FROM submissions WHERE sequence = ?");
  const byIntent = database.prepare(`
    SELECT * FROM submissions
    WHERE owner_agent = ? AND actor_id = ? AND submission_intent_id = ?
  `);
  const insertDelivery = database.prepare(`
    INSERT INTO agent_input_outbox (
      submission_sequence, owner_agent, status, created_at, updated_at, attempts,
      idempotency_key, target_json, profile_json, mapping_json, payload_json, last_error, receipt_json
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const deliveryBySequence = database.prepare("SELECT * FROM agent_input_outbox WHERE sequence = ?");
  const deliveryBySubmission = database.prepare("SELECT * FROM agent_input_outbox WHERE submission_sequence = ?");
  const claimDeliveryRow = database.prepare(`
    UPDATE agent_input_outbox
    SET status = 'delivering', attempts = attempts + 1, updated_at = ?, last_error = NULL
    WHERE sequence = ? AND status IN ('pending', 'failed', 'delivering')
  `);
  const finishDeliveryRow = database.prepare(`
    UPDATE agent_input_outbox
    SET status = ?, updated_at = ?, receipt_json = ?, last_error = ?
    WHERE sequence = ?
  `);

  function fromRow(row) {
    if (!row) return null;
    if (row.record_version === "submission-record/v2") {
      return makeSubmissionRecordV2({
        id: `submission-${row.sequence}`,
        ownerAgent: row.owner_agent,
        receivedAt: row.received_at,
        principal: {
          id: row.actor_id,
          ...(row.actor_name ? { displayName: row.actor_name } : {}),
          verifiedBy: row.actor_verified_by,
        },
        scope: decode(row.scope_json),
        submissionIntentId: row.submission_intent_id,
        envelope: decode(row.envelope_json),
      });
    }
    const actor = row.actor_id ? {
      id: row.actor_id,
      ...(row.actor_name ? { displayName: row.actor_name } : {}),
      role: row.actor_role,
      verifiedBy: row.actor_verified_by,
    } : null;
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
    const isV2 = Boolean(input.submissionIntentId && input.principal?.id);
    const principal = isV2 ? input.principal : input.actor;
    const fingerprint = isV2
      ? createHash("sha256").update(String(input.fingerprintSource || "")).digest("hex")
      : null;
    return [
      input.ownerAgent,
      input.receivedAt,
      principal?.id ?? null,
      principal?.displayName ?? null,
      isV2 ? null : input.actor?.role ?? null,
      principal?.verifiedBy ?? null,
      input.scope?.tenantId ?? null,
      input.scope?.attributes?.classId ?? input.scope?.classId ?? null,
      isV2 ? "submission-record/v2" : "submission-record/v1",
      isV2 ? encode(input.scope) : null,
      isV2 ? input.submissionIntentId : null,
      fingerprint,
      encode(input.envelope),
      legacyKey,
    ];
  }

  function deliveryFromRow(row) {
    if (!row) return null;
    return makeOutboxEvent({
      id: `outbox-${row.sequence}`,
      submissionId: `submission-${row.submission_sequence}`,
      ownerAgent: row.owner_agent,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attempts: row.attempts,
      idempotencyKey: row.idempotency_key,
      target: decode(row.target_json),
      profile: decode(row.profile_json),
      mapping: decode(row.mapping_json),
      payload: decode(row.payload_json),
      lastError: row.last_error,
      receipt: decode(row.receipt_json),
    });
  }


  function sequenceOf(id, prefix) {
    const match = new RegExp(`^${prefix}-([1-9][0-9]*)$`).exec(String(id));
    return match ? Number(match[1]) : null;
  }

  const managementStore = createSqliteSubmissionManagementStore(database, {
    encode,
    decode,
    sequenceOf,
    submissionExists: (sequence) => Boolean(bySequence.get(sequence)),
  });

  return {
    append(input) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const encoded = values(input);
        const intentId = input.submissionIntentId && input.principal?.id ? input.submissionIntentId : null;
        if (intentId) {
          const existing = byIntent.get(input.ownerAgent, input.principal.id, intentId);
          if (existing) {
            database.exec("COMMIT");
            return existing.intent_fingerprint === encoded[11]
              ? { record: fromRow(existing), replayed: true, conflict: false }
              : { record: null, replayed: false, conflict: true };
          }
        }
        const result = insert.run(...encoded);
        const submissionSequence = Number(result.lastInsertRowid);
        if (input.delivery) {
          const submissionId = `submission-${submissionSequence}`;
          const key = `agent-input:${submissionId}:profile-${input.delivery.profile.profileVersion}:form-${input.delivery.mapping.formVersion}`;
          insertDelivery.run(
            submissionSequence, input.ownerAgent, input.delivery.status || "pending", input.receivedAt, input.receivedAt, key,
            encode(input.delivery.target), encode(input.delivery.profile), encode(input.delivery.mapping), encode(input.delivery.payload),
            input.delivery.lastError || null,
          );
        }
        database.exec("COMMIT");
        return { record: fromRow(bySequence.get(submissionSequence)), replayed: false, conflict: false };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    importLegacy(ownerAgent, envelopes) {
      (envelopes || []).forEach((envelope) => makeSubmissionRecord({
        id: "submission-1",
        ownerAgent,
        receivedAt: envelope?.submittedAt,
        envelope,
      }));
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
      const sequence = sequenceOf(id, "submission");
      return sequence ? fromRow(bySequence.get(sequence)) : null;
    },
    ...managementStore,
    listDeliveries(query = {}) {
      const statuses = Array.isArray(query.statuses) ? query.statuses : query.status ? [query.status] : [];
      const clauses = [], params = [];
      if (statuses.length) {
        clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
      if (query.submissionId) {
        const sequence = sequenceOf(query.submissionId, "submission");
        if (!sequence) return [];
        clauses.push("submission_sequence = ?");
        params.push(sequence);
      }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const limit = Number.isInteger(query.limit) && query.limit > 0 ? ` LIMIT ${Math.min(query.limit, 100)}` : "";
      return database.prepare(`SELECT * FROM agent_input_outbox${where} ORDER BY sequence${limit}`).all(...params).map(deliveryFromRow);
    },
    getDeliveryForSubmission(submissionId) {
      const sequence = sequenceOf(submissionId, "submission");
      return sequence ? deliveryFromRow(deliveryBySubmission.get(sequence)) : null;
    },
    claimDelivery(id, at) {
      const sequence = sequenceOf(id, "outbox");
      if (!sequence || Number(claimDeliveryRow.run(at, sequence).changes) === 0) return null;
      return deliveryFromRow(deliveryBySequence.get(sequence));
    },
    finishDelivery(id, { status, at, receipt = null, error = null }) {
      if (!["delivered", "failed"].includes(status)) throw new TypeError("delivery 完成状态非法");
      const sequence = sequenceOf(id, "outbox");
      if (!sequence) return null;
      finishDeliveryRow.run(status, at, encode(receipt), error == null ? null : String(error), sequence);
      return deliveryFromRow(deliveryBySequence.get(sequence));
    },
    reset() {
      database.exec("BEGIN IMMEDIATE; DELETE FROM submission_management_audit; DELETE FROM submission_corrections; DELETE FROM submission_management; DELETE FROM agent_input_outbox; DELETE FROM submissions; DELETE FROM sqlite_sequence WHERE name IN ('submissions', 'agent_input_outbox', 'submission_corrections', 'submission_management_audit'); COMMIT;");
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
