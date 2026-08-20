/** Form Studio 本地入口；HTTP 适配在 src/server。 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createFormStudioServer } from "./src/server/create-server.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 4190;
const testMode = process.argv.includes("--test-mode");
const testRouteHandler = testMode
  ? (await import("./tests/support/test-route-handler.mjs")).createTestRouteHandler(ROOT)
  : null;
const server = createFormStudioServer({ root: ROOT, port: PORT, testRouteHandler });

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`form-studio http://127.0.0.1:${PORT}\n`);
});
