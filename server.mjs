/** Form Studio 本地入口；HTTP 适配在 src/server。 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFormStudioServer } from "./src/server/create-server.mjs";
import { migrateAgentAccess } from "./src/application/migrate-agent-access.mjs";
import { migrateAgentInputConfigs } from "./src/application/migrate-agent-input-configs.mjs";
import { createAgentInputRelay } from "./src/application/relay-agent-input.mjs";
import { inMemoryAgentRepository } from "./src/infrastructure/in-memory-agent-repository.mjs";
import { createInMemorySubmissionRepository } from "./src/infrastructure/in-memory-submission-repository.mjs";
import { createPofficesAgentDirectory } from "./src/infrastructure/poffices-agent-directory.mjs";
import { createLocalSessionActorResolver } from "./src/infrastructure/local-session-actor-resolver.mjs";
import { createInMemoryAgentInputPort, createSqliteLocalAgentInputPort } from "./src/infrastructure/local-agent-input-port.mjs";
import { createSubmissionAwareAgentRepository } from "./src/infrastructure/submission-aware-agent-repository.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FORM_STUDIO_PORT || 4190);
const DATABASE_PATH = process.env.FORM_STUDIO_DB_PATH || join(ROOT, "data", "form-studio.sqlite");
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FORM_STUDIO_PORT 非法");
const testMode = process.argv.includes("--test-mode");
const testRouteHandler = testMode
  ? (await import("./tests/support/test-route-handler.mjs")).createTestRouteHandler(ROOT)
  : null;
const identityDirectory = testMode
  ? (await import("./tests/support/test-owner-directory.mjs")).createTestOwnerDirectory()
  : createPofficesAgentDirectory();
const actorResolver = testMode
  ? (await import("./tests/support/test-actor-resolver.mjs")).createTestActorResolver()
  : createLocalSessionActorResolver({ configPath: join(ROOT, "data", "local-classroom.json") });
const rawAgentRepository = testMode
  ? inMemoryAgentRepository
  : (await import("./src/infrastructure/sqlite-agent-repository.mjs")).createSqliteAgentRepository({
      databasePath: DATABASE_PATH,
    });
const submissionRepository = testMode
  ? createInMemorySubmissionRepository()
  : (await import("./src/infrastructure/sqlite-submission-repository.mjs")).createSqliteSubmissionRepository({
      databasePath: DATABASE_PATH,
    });
const repository = createSubmissionAwareAgentRepository({
  agents: rawAgentRepository,
  submissions: submissionRepository,
});
migrateAgentAccess(repository, actorResolver.defaultAgentAccess());
const inputMigration = migrateAgentInputConfigs(
  repository,
  JSON.parse(readFileSync(join(ROOT, "data", "local-agent-inputs.json"), "utf8")),
);
for (const failure of inputMigration.errors) {
  process.stderr.write(`agent input config 未启用 ${failure.ownerAgent}: ${failure.error}\n`);
}
const agentInputPort = testMode
  ? createInMemoryAgentInputPort()
  : createSqliteLocalAgentInputPort({ databasePath: DATABASE_PATH });
const deliveryRelay = createAgentInputRelay({ repository, port: agentInputPort });
const server = createFormStudioServer({
  root: ROOT,
  port: PORT,
  repository,
  identityDirectory,
  actorResolver,
  deliveryRelay,
  testRouteHandler,
});
const relayTimer = setInterval(() => deliveryRelay.runOnce().catch(() => {}), 750);
relayTimer.unref();
server.on("close", () => {
  clearInterval(relayTimer);
  agentInputPort.close?.();
  repository.close?.();
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`form-studio http://127.0.0.1:${PORT}\n`);
  deliveryRelay.runOnce().catch(() => {});
});
