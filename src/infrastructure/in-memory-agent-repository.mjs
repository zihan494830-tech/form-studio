import { loadCanonicalMockCatalog } from "./canonical-mock-catalog.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(agent) {
  return agent ? { ...clone(agent), revision: Number.isInteger(agent.revision) && agent.revision > 0 ? agent.revision : 1 } : null;
}

function defaultSeed() {
  return loadCanonicalMockCatalog().agents;
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
      return agents.map(normalize);
    },
    get(id) {
      const found = agents.find((agent) => agent.id === id);
      return normalize(found);
    },
    save(agent, { expectedRevision } = {}) {
      const index = agents.findIndex((item) => item.id === agent.id);
      if (index >= 0 && expectedRevision != null && normalize(agents[index]).revision !== expectedRevision) return null;
      if (index < 0) agents.push(clone(agent));
      else agents[index] = clone(agent);
      return normalize(agent);
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
