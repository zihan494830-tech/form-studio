/** Form Studio 本地入口；HTTP 适配在 src/server。 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFormStudioServer } from "./src/server/create-server.mjs";
import { migrateAgentAccess } from "./src/application/migrate-agent-access.mjs";
import { migrateAgentInputConfigs } from "./src/application/migrate-agent-input-configs.mjs";
import { createAgentInputRelay } from "./src/application/relay-agent-input.mjs";
import { createInMemoryAgentRepository } from "./src/infrastructure/in-memory-agent-repository.mjs";
import { createInMemorySubmissionRepository } from "./src/infrastructure/in-memory-submission-repository.mjs";
import { createPofficesAgentDirectory } from "./src/infrastructure/poffices-agent-directory.mjs";
import { createLocalSessionActorResolver } from "./src/infrastructure/local-session-actor-resolver.mjs";
import { createInMemoryAgentInputPort, createSqliteLocalAgentInputPort } from "./src/infrastructure/local-agent-input-port.mjs";
import { createSubmissionAwareAgentRepository } from "./src/infrastructure/submission-aware-agent-repository.mjs";
import { loadCanonicalMockCatalog } from "./src/infrastructure/canonical-mock-catalog.mjs";
import { synchronizeDemoDataset } from "./src/infrastructure/synchronize-demo-dataset.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FORM_STUDIO_PORT || 4190);
const DATABASE_PATH = process.env.FORM_STUDIO_DB_PATH || join(ROOT, "data", "form-studio.sqlite");
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FORM_STUDIO_PORT 非法");
const testMode = process.argv.includes("--test-mode");
const demoMode = process.argv.includes("--demo-mode");
const mode = testMode ? "test" : demoMode ? "demo" : String(process.env.FORM_STUDIO_MODE || "product");
if (!["product", "demo", "test"].includes(mode)) throw new Error("FORM_STUDIO_MODE 非法");
const productVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const mockCatalog = mode === "demo" || mode === "test" ? loadCanonicalMockCatalog() : null;
const dataSource = mockCatalog ? {
  kind: "canonical-mock",
  schema: mockCatalog.schema,
  datasetRevision: mockCatalog.datasetRevision,
  datasetChecksum: mockCatalog.datasetChecksum,
  defaultScenario: mockCatalog.defaultScenario,
} : null;
const testRouteHandler = testMode
  ? (await import("./tests/support/test-route-handler.mjs")).createTestRouteHandler(ROOT)
  : null;
const identityDirectory = testMode
  ? (await import("./tests/support/test-owner-directory.mjs")).createTestOwnerDirectory()
  : createPofficesAgentDirectory();
const actorResolver = testMode
  ? (await import("./tests/support/test-actor-resolver.mjs")).createTestActorResolver()
  : demoMode || mode === "demo"
    ? createLocalSessionActorResolver({ configPath: join(ROOT, "data", "local-classroom.json") })
    : null;
const rawAgentRepository = testMode
  ? createInMemoryAgentRepository(mockCatalog.agents)
  : (await import("./src/infrastructure/sqlite-agent-repository.mjs")).createSqliteAgentRepository({
      databasePath: DATABASE_PATH,
      seed: mode === "demo" ? mockCatalog.agents : [],
    });
const submissionRepository = testMode
  ? createInMemorySubmissionRepository()
  : (await import("./src/infrastructure/sqlite-submission-repository.mjs")).createSqliteSubmissionRepository({
      databasePath: DATABASE_PATH,
    });
const agentInputPort = testMode
  ? createInMemoryAgentInputPort()
  : createSqliteLocalAgentInputPort({ databasePath: DATABASE_PATH });
if (mode === "demo") {
  const sync = synchronizeDemoDataset({ databasePath: DATABASE_PATH, catalog: mockCatalog });
  if (sync.changed) {
    process.stdout.write(`demo dataset ${sync.previousRevision || "unmanaged"} -> ${sync.datasetRevision}\n`);
  }
}
const repository = createSubmissionAwareAgentRepository({
  agents: rawAgentRepository,
  submissions: submissionRepository,
});
if (actorResolver?.defaultAgentAccess) migrateAgentAccess(repository, actorResolver.defaultAgentAccess());
const inputMigration = migrateAgentInputConfigs(
  repository,
  JSON.parse(readFileSync(join(ROOT, "data", "local-agent-inputs.json"), "utf8")),
);
for (const failure of inputMigration.errors) {
  process.stderr.write(`agent input config 未启用 ${failure.ownerAgent}: ${failure.error}\n`);
}
const deliveryRelay = createAgentInputRelay({ repository, port: agentInputPort });
const server = createFormStudioServer({
  root: ROOT,
  port: PORT,
  mode,
  repository,
  identityDirectory,
  actorResolver,
  deliveryRelay,
  testRouteHandler,
  productVersion,
  dataSource,
  runtimeRevision: process.env.FORM_STUDIO_RUNTIME_REVISION || "development",
});
const relayTimer = setInterval(() => deliveryRelay.runOnce().catch(() => {}), 750);
relayTimer.unref();
server.on("close", () => {
  clearInterval(relayTimer);
  agentInputPort.close?.();
  repository.close?.();
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`form-studio (${mode}) http://127.0.0.1:${PORT}\n`);
  deliveryRelay.runOnce().catch(() => {});
});
