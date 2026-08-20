/** Form Studio 本地入口；HTTP 适配在 src/server。 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFormStudioServer } from "./src/server/create-server.mjs";
import { inMemoryAgentRepository } from "./src/infrastructure/in-memory-agent-repository.mjs";
import { createPofficesAgentDirectory } from "./src/infrastructure/poffices-agent-directory.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FORM_STUDIO_PORT || 4190);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FORM_STUDIO_PORT 非法");
const testMode = process.argv.includes("--test-mode");
const testRouteHandler = testMode
  ? (await import("./tests/support/test-route-handler.mjs")).createTestRouteHandler(ROOT)
  : null;
const identityDirectory = testMode
  ? (await import("./tests/support/test-owner-directory.mjs")).createTestOwnerDirectory()
  : createPofficesAgentDirectory();
const repository = testMode
  ? inMemoryAgentRepository
  : (await import("./src/infrastructure/sqlite-agent-repository.mjs")).createSqliteAgentRepository({
      databasePath: process.env.FORM_STUDIO_DB_PATH || join(ROOT, "data", "form-studio.sqlite"),
    });
const server = createFormStudioServer({
  root: ROOT,
  port: PORT,
  repository,
  identityDirectory,
  testRouteHandler,
});
server.on("close", () => repository.close?.());

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`form-studio http://127.0.0.1:${PORT}\n`);
});
