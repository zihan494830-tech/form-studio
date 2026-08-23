/**
 * Form Studio 单机持久仓储。
 * 只保存领域对象，不解释字段、绑定或提交语义。
 *
 * 依据：
 * - Node.js node:sqlite: https://nodejs.org/api/sqlite.html
 * - SQLite atomic commit: https://www.sqlite.org/atomiccommit.html
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadCanonicalMockCatalog } from "./canonical-mock-catalog.mjs";
const SCHEMA_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultSeed() {
  return loadCanonicalMockCatalog().agents;
}

function assertAgent(agent) {
  if (!agent?.id || typeof agent.id !== "string") {
    throw new TypeError("持久仓储只能保存带字符串 id 的 agent");
  }
}

function decodeAgent(row) {
  if (!row) return null;
  const agent = JSON.parse(row.payload);
  assertAgent(agent);
  if (agent.id !== row.id) throw new Error(`持久记录 id 不一致：${row.id}`);
  return agent;
}

function transaction(database, work) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createSqliteAgentRepository({ databasePath, seed = defaultSeed() }) {
  if (!databasePath) throw new TypeError("databasePath 必填");
  const path = resolve(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  let closed = false;
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      ordinal INTEGER NOT NULL
    ) STRICT;
  `);

  const version = Number(database.prepare("PRAGMA user_version").get().user_version);
  if (version === 0) database.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  else if (version !== SCHEMA_VERSION) {
    database.close();
    throw new Error(`不支持的持久仓储版本：${version}`);
  }

  const listRows = database.prepare("SELECT id, payload FROM agents ORDER BY ordinal, id");
  const getRow = database.prepare("SELECT id, payload FROM agents WHERE id = ?");
  const countRows = database.prepare("SELECT COUNT(*) AS count FROM agents");
  const nextOrdinal = database.prepare("SELECT COALESCE(MAX(ordinal), -1) + 1 AS value FROM agents");
  const insertAgent = database.prepare("INSERT INTO agents (id, payload, ordinal) VALUES (?, ?, ?)");
  const saveAgent = database.prepare(`
    INSERT INTO agents (id, payload, ordinal) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
  `);
  const updateAgent = database.prepare("UPDATE agents SET payload = ? WHERE id = ?");

  function insertSeed(items) {
    items.forEach((agent, index) => {
      assertAgent(agent);
      insertAgent.run(agent.id, JSON.stringify(agent), index);
    });
  }

  const initial = clone(seed);
  if (Number(countRows.get().count) === 0) {
    transaction(database, () => insertSeed(initial));
  }

  return {
    reset() {
      return transaction(database, () => {
        database.exec("DELETE FROM agents");
        insertSeed(initial);
        return this.list();
      });
    },
    list() {
      return listRows.all().map(decodeAgent).map(clone);
    },
    get(id) {
      const agent = decodeAgent(getRow.get(String(id)));
      return agent ? clone(agent) : null;
    },
    save(agent) {
      assertAgent(agent);
      const ordinal = Number(nextOrdinal.get().value);
      saveAgent.run(agent.id, JSON.stringify(agent), ordinal);
      return clone(agent);
    },
    appendEnvelope(agentId, envelope) {
      return transaction(database, () => {
        const agent = decodeAgent(getRow.get(String(agentId)));
        if (!agent) return null;
        agent.inputBag = Array.isArray(agent.inputBag) ? agent.inputBag : [];
        agent.inputBag.push(clone(envelope));
        updateAgent.run(JSON.stringify(agent), agent.id);
        return clone(agent);
      });
    },
    nextBornFormId() {
      const used = new Set(listRows.all().map((row) => row.id));
      let n = 1;
      while (used.has(`form-${n}`)) n += 1;
      return `form-${n}`;
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
