import { makeSubmissionRecord } from "../domain/submission/submission-record.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInMemorySubmissionRepository(seed = []) {
  let records = clone(seed);
  let nextSequence = records.reduce((max, item) => Math.max(max, Number(item.id?.split("-")[1]) || 0), 0) + 1;
  const legacyKeys = new Set();

  function matches(record, query) {
    if (query.ownerAgent && record.ownerAgent !== query.ownerAgent) return false;
    if (query.actorId && record.actor?.id !== query.actorId) return false;
    if (query.tenantId && record.scope?.tenantId !== query.tenantId) return false;
    if (query.classId && record.scope?.classId !== query.classId) return false;
    if (query.from && record.receivedAt < query.from) return false;
    if (query.to && record.receivedAt > query.to) return false;
    return true;
  }

  function append(input) {
    const record = makeSubmissionRecord({ ...input, id: `submission-${nextSequence++}` });
    records.push(record);
    return clone(record);
  }

  return {
    append,
    importLegacy(ownerAgent, envelopes) {
      const imported = [];
      (envelopes || []).forEach((envelope, index) => {
        const key = `legacy:${ownerAgent}:${index}`;
        if (legacyKeys.has(key)) return;
        legacyKeys.add(key);
        imported.push(append({
          ownerAgent,
          envelope,
          receivedAt: envelope.submittedAt,
          actor: null,
          scope: null,
        }));
      });
      return imported;
    },
    list(query = {}) {
      return records.filter((record) => matches(record, query)).map(clone);
    },
    get(id) {
      const found = records.find((record) => record.id === id);
      return found ? clone(found) : null;
    },
    reset() {
      records = clone(seed);
      nextSequence = records.reduce((max, item) => Math.max(max, Number(item.id?.split("-")[1]) || 0), 0) + 1;
      legacyKeys.clear();
      return this.list();
    },
    close() {},
  };
}
