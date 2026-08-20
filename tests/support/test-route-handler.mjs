import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decorateAgent } from "../../src/application/agent-view.mjs";
import { injectGoldFixture } from "../../src/presentation/form/inject-gold-fixture.mjs";
import { send, sendJson } from "../../src/server/http-utils.mjs";

export function createTestRouteHandler(root) {
  return async function testRouteHandler({ res, pathname, method, repository }) {
    if (method === "GET" && pathname === "/fixture/exercise-1") {
      const agent = repository.get("exercise-1") || { id: "exercise-1", name: "练习一" };
      const fixture = readFileSync(join(root, "tests", "fixtures", "exercise-1", "form.html"), "utf8");
      send(res, 200, injectGoldFixture(fixture, { agentId: agent.id, agentName: agent.name }), {
        "Content-Type": "text/html; charset=utf-8",
      });
      return true;
    }
    if (method === "POST" && pathname === "/api/test/reset") {
      sendJson(res, 200, repository.reset().map(decorateAgent));
      return true;
    }
    return false;
  };
}
