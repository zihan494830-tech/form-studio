import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createAgentAuthoring } from "../../src/application/author-agent.mjs";
import { newBornFormAgent } from "../../src/domain/agent/form-agent.mjs";
import { createSqliteAgentRepository } from "../../src/infrastructure/sqlite-agent-repository.mjs";

test("两个 SQLite 连接撞到同一 born-form id 时重试而不覆盖", () => {
  const directory = mkdtempSync(join(tmpdir(), "form-studio-born-id-"));
  const databasePath = join(directory, "studio.sqlite");
  const firstConnection = createSqliteAgentRepository({ databasePath, seed: [] });
  const secondConnection = createSqliteAgentRepository({ databasePath, seed: [] });
  const nextId = secondConnection.nextBornFormId.bind(secondConnection);
  let injectedCollision = false;
  const collidingRepository = {
    ...secondConnection,
    nextBornFormId() {
      if (injectedCollision) return nextId();
      injectedCollision = true;
      const collidedId = nextId();
      firstConnection.save(newBornFormAgent({ id: collidedId, name: "先写入" }), { expectedRevision: 0 });
      return collidedId;
    },
  };

  try {
    const authoring = createAgentAuthoring(collidingRepository, { now: () => "2026-08-24T00:00:00.000Z" });
    const created = authoring.createAgent("后创建");
    expect(created.id).toBe("form-2");
    expect(firstConnection.get("form-1").name).toBe("先写入");
    expect(firstConnection.get("form-2").name).toBe("后创建");
    expect(firstConnection.list()).toHaveLength(2);
  } finally {
    secondConnection.close();
    firstConnection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
