import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function receiptFor(event, receivedAt, duplicate) {
  return {
    version: "local-agent-input-receipt/v1",
    target: event.target.target,
    idempotencyKey: event.idempotencyKey,
    submissionId: event.submissionId,
    receivedAt,
    duplicate,
  };
}

export function createInMemoryAgentInputPort({ now = () => new Date().toISOString(), fail = null } = {}) {
  const received = new Map();
  return {
    async deliver(event) {
      if (fail) throw new Error(typeof fail === "function" ? fail(event) : String(fail));
      const previous = received.get(event.idempotencyKey);
      if (previous) return receiptFor(event, previous.receivedAt, true);
      const item = { event: structuredClone(event), receivedAt: now() };
      received.set(event.idempotencyKey, item);
      return receiptFor(event, item.receivedAt, false);
    },
    list() {
      return [...received.values()].map((item) => structuredClone(item));
    },
    close() {},
  };
}

export function createSqliteLocalAgentInputPort({ databasePath, now = () => new Date().toISOString() }) {
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  let closed = false;
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS local_agent_inputs (
      idempotency_key TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      owner_agent TEXT NOT NULL,
      target TEXT NOT NULL,
      received_at TEXT NOT NULL,
      event_json TEXT NOT NULL
    ) STRICT;
  `);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO local_agent_inputs
      (idempotency_key, submission_id, owner_agent, target, received_at, event_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const get = database.prepare("SELECT * FROM local_agent_inputs WHERE idempotency_key = ?");
  const list = database.prepare("SELECT * FROM local_agent_inputs ORDER BY received_at, idempotency_key");

  return {
    async deliver(event) {
      if (event.target?.kind !== "local-recording") throw new Error("本地端口不支持这个 transport");
      const receivedAt = now();
      const result = insert.run(
        event.idempotencyKey, event.submissionId, event.ownerAgent,
        event.target.target, receivedAt, JSON.stringify(event),
      );
      const row = get.get(event.idempotencyKey);
      return receiptFor(event, row.received_at, Number(result.changes) === 0);
    },
    list() {
      return list.all().map((row) => ({ event: JSON.parse(row.event_json), receivedAt: row.received_at }));
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
