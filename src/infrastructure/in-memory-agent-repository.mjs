import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOCKS_PATH = join(ROOT, "data", "mock-agents.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultSeed() {
  return JSON.parse(readFileSync(MOCKS_PATH, "utf8"));
}

export function createInMemoryAgentRepository(seed = defaultSeed()) {
  const initial = clone(seed);
  let agents = clone(initial);
  return {
    reset() {
      agents = clone(initial);
      return this.list();
    },
    list() {
      return clone(agents);
    },
    get(id) {
      const found = agents.find((agent) => agent.id === id);
      return found ? clone(found) : null;
    },
    save(agent) {
      const index = agents.findIndex((item) => item.id === agent.id);
      if (index < 0) agents.push(clone(agent));
      else agents[index] = clone(agent);
      return clone(agent);
    },
    appendEnvelope(agentId, envelope) {
      const found = agents.find((agent) => agent.id === agentId);
      if (!found) return null;
      found.inputBag.push(clone(envelope));
      return clone(found);
    },
    nextBornFormId() {
      const used = new Set(agents.map((agent) => agent.id));
      let n = 1;
      while (used.has(`form-${n}`)) n += 1;
      return `form-${n}`;
    },
  };
}

export const inMemoryAgentRepository = createInMemoryAgentRepository();
