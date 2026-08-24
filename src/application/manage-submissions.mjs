import { publishedDefinitionForVersion, releaseVersionForFormVersion } from "../domain/form/published-definition.mjs";
import {
  applySubmissionCorrections,
  defaultSubmissionManagement,
  normalizeCorrection,
  normalizeSubmissionManagement,
} from "../domain/submission/submission-management.mjs";
import { problem } from "../domain/problem.mjs";
import { validateSubmissionValues } from "./submit-to-agent.mjs";

function principalOf(record) {
  return record?.principal || record?.actor || null;
}

function fieldsFor(definition, values) {
  const definitions = new Map((definition?.fields || []).flatMap((field) => {
    if (field.control !== "grid") return [[field.id, field]];
    return (field.grid?.rows || []).flatMap((row) => (field.grid?.columns || []).map((column) => [
      `${field.id}_${row.id}_${column.id}`,
      { ...column, id: `${field.id}_${row.id}_${column.id}`, label: `${field.label} / ${row.label} / ${column.label}` },
    ]));
  }));
  return Object.entries(values || {}).map(([id, value]) => ({
    id,
    label: definitions.get(id)?.label || id,
    control: definitions.get(id)?.control || null,
    ...(definitions.get(id)?.options ? { options: definitions.get(id).options } : {}),
    ...(Number.isInteger(definitions.get(id)?.decimals) ? { decimals: definitions.get(id).decimals } : {}),
    value,
  }));
}

export function createSubmissionManager(repository, { now = () => new Date().toISOString() } = {}) {
  function load(ownerAgent, submissionId) {
    const agent = repository.get(ownerAgent);
    if (!agent) return problem("user_page_not_found", 404);
    const record = repository.getSubmission(submissionId);
    if (!record || record.ownerAgent !== ownerAgent) return problem("submission_not_found", 404);
    return { agent, record };
  }

  function detail(ownerAgent, submissionId) {
    const loaded = load(ownerAgent, submissionId);
    if (!loaded.record) return loaded;
    const { agent, record } = loaded;
    const definition = publishedDefinitionForVersion(agent, record.envelope.formVersion);
    const corrections = repository.listSubmissionCorrections?.(record.id) || [];
    const management = repository.getSubmissionManagement?.(record.id)
      || defaultSubmissionManagement(record.id);
    const originalValues = { ...(record.envelope.values || {}) };
    const effectiveValues = applySubmissionCorrections(originalValues, corrections);
    return {
      status: 200,
      submission: {
        id: record.id,
        ownerAgent: record.ownerAgent,
        submittedAt: record.envelope.submittedAt,
        receivedAt: record.receivedAt,
        submitter: principalOf(record),
        formVersion: record.envelope.formVersion,
        releaseVersion: releaseVersionForFormVersion(agent, record.envelope.formVersion),
        submissionIntentId: record.submissionIntentId || null,
        definitionAvailable: Boolean(definition),
        originalValues,
        effectiveValues,
        originalFields: fieldsFor(definition, originalValues),
        effectiveFields: fieldsFor(definition, effectiveValues),
        corrections,
        management,
        delivery: repository.getDeliveryForSubmission?.(record.id) || null,
      },
    };
  }

  function updateManagement(ownerAgent, submissionId, patch, { expectedRevision, actor }) {
    const loaded = load(ownerAgent, submissionId);
    if (!loaded.record) return loaded;
    const current = repository.getSubmissionManagement?.(submissionId)
      || defaultSubmissionManagement(submissionId);
    const normalized = normalizeSubmissionManagement(current, {
      ...patch,
      ...(Object.hasOwn(patch || {}, "archived") && patch.archived ? { archivedAt: now() } : {}),
    });
    if (normalized.errorCode) return normalized;
    const result = repository.updateSubmissionManagement(submissionId, normalized.management, {
      expectedRevision,
      actorId: actor.id,
      at: now(),
    });
    if (result?.preconditionFailed) return problem("precondition_failed", 412, { currentRevision: result.currentRevision });
    return { status: 200, management: result };
  }

  function addCorrection(ownerAgent, submissionId, payload, { expectedRevision, actor }) {
    const loaded = load(ownerAgent, submissionId);
    if (!loaded.record) return loaded;
    const normalized = normalizeCorrection(payload);
    if (normalized.errorCode) return normalized;
    const { agent, record } = loaded;
    const definition = publishedDefinitionForVersion(agent, record.envelope.formVersion);
    if (!definition) return problem("form_definition_unavailable", 409);
    const previous = applySubmissionCorrections(
      record.envelope.values,
      repository.listSubmissionCorrections?.(record.id) || [],
    );
    const candidate = { ...previous, ...normalized.correction.changes };
    const validated = validateSubmissionValues(definition.fields, candidate);
    if (validated.errorCode) return validated;
    const changes = Object.fromEntries(Object.entries(normalized.correction.changes)
      .filter(([id]) => validated.values[id] !== previous[id])
      .map(([id]) => [id, validated.values[id]]));
    if (!Object.keys(changes).length) return problem("submission_correction_no_change", 400);
    const result = repository.appendSubmissionCorrection(record.id, {
      reason: normalized.correction.reason,
      changes,
      actorId: actor.id,
      actorName: actor.name || actor.id,
      createdAt: now(),
    }, { expectedRevision });
    if (result?.preconditionFailed) return problem("precondition_failed", 412, { currentRevision: result.currentRevision });
    return { status: 201, correction: result.correction, management: result.management };
  }

  return { detail, updateManagement, addCorrection };
}
