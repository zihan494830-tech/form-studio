import { createHash } from "node:crypto";
import { makeSubmissionRecord, makeSubmissionRecordV2 } from "../domain/submission/submission-record.mjs";
import { makeOutboxEvent } from "../domain/submission/outbox-event.mjs";
import { defaultSubmissionManagement } from "../domain/submission/submission-management.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInMemorySubmissionRepository(seed = []) {
  let records = clone(seed);
  let deliveries = [];
  let nextSequence = records.reduce((max, item) => Math.max(max, Number(item.id?.split("-")[1]) || 0), 0) + 1;
  const legacyKeys = new Set();
  const intents = new Map();
  const management = new Map();
  const corrections = new Map();
  const managementAudit = [];
  let nextCorrectionSequence = 1;

  function matches(record, query) {
    if (query.ownerAgent && record.ownerAgent !== query.ownerAgent) return false;
    if (query.actorId && (record.principal?.id || record.actor?.id) !== query.actorId) return false;
    if (query.tenantId && record.scope?.tenantId !== query.tenantId) return false;
    if (query.classId && record.scope?.classId !== query.classId) return false;
    if (query.from && record.receivedAt < query.from) return false;
    if (query.to && record.receivedAt > query.to) return false;
    return true;
  }

  function append(input) {
    const intentKey = input.submissionIntentId && input.principal?.id
      ? `${input.ownerAgent}\u0000${input.principal.id}\u0000${input.submissionIntentId}`
      : null;
    const fingerprint = intentKey
      ? createHash("sha256").update(String(input.fingerprintSource || "")).digest("hex")
      : null;
    if (intentKey && intents.has(intentKey)) {
      const existing = intents.get(intentKey);
      return existing.fingerprint === fingerprint
        ? { record: clone(existing.record), replayed: true, conflict: false }
        : { record: null, replayed: false, conflict: true };
    }
    const id = `submission-${nextSequence++}`;
    const record = intentKey
      ? makeSubmissionRecordV2({ ...input, id })
      : makeSubmissionRecord({ ...input, id });
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
    if (intentKey) intents.set(intentKey, { fingerprint, record: clone(record) });
    return { record: clone(record), replayed: false, conflict: false };
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
        }).record);
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
    getManagement(submissionId) {
      return clone(management.get(submissionId) || defaultSubmissionManagement(submissionId));
    },
    updateManagement(submissionId, next, { expectedRevision, actorId, at }) {
      if (!records.some((record) => record.id === submissionId)) return null;
      const current = management.get(submissionId) || defaultSubmissionManagement(submissionId);
      if (current.revision !== expectedRevision) {
        return { preconditionFailed: true, currentRevision: current.revision };
      }
      const saved = {
        ...clone(next),
        submissionId,
        revision: current.revision + 1,
        updatedAt: at,
        updatedBy: actorId,
      };
      management.set(submissionId, saved);
      managementAudit.push({ submissionId, revision: saved.revision, action: "management_updated", actorId, at, detail: clone(saved) });
      return clone(saved);
    },
    listCorrections(submissionId) {
      return clone(corrections.get(submissionId) || []);
    },
    appendCorrection(submissionId, correction, { expectedRevision }) {
      if (!records.some((record) => record.id === submissionId)) return null;
      const current = management.get(submissionId) || defaultSubmissionManagement(submissionId);
      if (current.revision !== expectedRevision) {
        return { preconditionFailed: true, currentRevision: current.revision };
      }
      const item = { id: `correction-${nextCorrectionSequence++}`, ...clone(correction) };
      const list = corrections.get(submissionId) || [];
      list.push(item);
      corrections.set(submissionId, list);
      const next = {
        ...current,
        revision: current.revision + 1,
        updatedAt: correction.createdAt,
        updatedBy: correction.actorId,
      };
      management.set(submissionId, next);
      managementAudit.push({ submissionId, revision: next.revision, action: "correction_added", actorId: correction.actorId, at: correction.createdAt, detail: { correctionId: item.id } });
      return { correction: clone(item), management: clone(next) };
    },
    listManagementAudit(submissionId) {
      return clone(managementAudit.filter((item) => item.submissionId === submissionId));
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
      intents.clear();
      management.clear();
      corrections.clear();
      managementAudit.length = 0;
      nextCorrectionSequence = 1;
      return this.list();
    },
    close() {},
  };
}
