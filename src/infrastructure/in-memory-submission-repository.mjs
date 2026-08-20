import { makeSubmissionRecord } from "../domain/submission/submission-record.mjs";
import { makeOutboxEvent } from "../domain/submission/outbox-event.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInMemorySubmissionRepository(seed = []) {
  let records = clone(seed);
  let deliveries = [];
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
    const sequence = Number(record.id.slice("submission-".length));
    const delivery = input.delivery ? makeOutboxEvent({
      id: `outbox-${sequence}`,
      submissionId: record.id,
      ownerAgent: record.ownerAgent,
      createdAt: record.receivedAt,
      idempotencyKey: `agent-input:${record.id}:profile-${input.delivery.profile.profileVersion}:form-${input.delivery.mapping.formVersion}`,
      ...input.delivery,
    }) : null;
    records.push(record);
    if (delivery) deliveries.push(delivery);
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
    listDeliveries(query = {}) {
      return deliveries.filter((item) => {
        if (query.status && item.status !== query.status) return false;
        if (query.statuses && !query.statuses.includes(item.status)) return false;
        if (query.submissionId && item.submissionId !== query.submissionId) return false;
        return true;
      }).slice(0, query.limit || deliveries.length).map(clone);
    },
    getDeliveryForSubmission(submissionId) {
      const found = deliveries.find((item) => item.submissionId === submissionId);
      return found ? clone(found) : null;
    },
    claimDelivery(id, at) {
      const found = deliveries.find((item) => item.id === id);
      if (!found || !["pending", "failed", "delivering"].includes(found.status)) return null;
      found.status = "delivering";
      found.attempts += 1;
      found.updatedAt = at;
      found.lastError = null;
      return clone(found);
    },
    finishDelivery(id, { status, at, receipt = null, error = null }) {
      const found = deliveries.find((item) => item.id === id);
      if (!found || !["delivered", "failed"].includes(status)) return null;
      found.status = status;
      found.updatedAt = at;
      found.receipt = clone(receipt);
      found.lastError = error == null ? null : String(error);
      return clone(found);
    },
    reset() {
      records = clone(seed);
      deliveries = [];
      nextSequence = records.reduce((max, item) => Math.max(max, Number(item.id?.split("-")[1]) || 0), 0) + 1;
      legacyKeys.clear();
      return this.list();
    },
    close() {},
  };
}
