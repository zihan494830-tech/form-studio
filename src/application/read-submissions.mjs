import { SUBMISSION_READ } from "../domain/access/capabilities.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";
import { expandFields } from "../domain/form/expand-fields.mjs";
import { currentReleaseVersion, publishedDefinitionForVersion, releaseVersionForFormVersion } from "../domain/form/published-definition.mjs";
import { problem } from "../domain/problem.mjs";

function denied(status = 403, errorCode = "submission_read_denied", parameters = {}) {
  return { allowed: false, ...problem(errorCode, status, parameters) };
}

function fieldProjection(agent, envelope) {
  const definition = publishedDefinitionForVersion(agent, envelope?.formVersion);
  const expanded = expandFields(definition?.fields || []);
  const fields = new Map(expanded.errorCode ? [] : expanded.fields.map((field) => [field.id, field]));
  return {
    definitionAvailable: Boolean(definition) && !expanded.errorCode,
    fields: Object.entries(envelope?.values || {}).map(([id, value]) => {
      const field = fields.get(id);
      const raw = String(value ?? "");
      return {
        id,
        label: field?.label || id,
        control: field?.control || null,
        value: raw,
        ...(field?.grid ? { grid: field.grid } : {}),
      };
    }),
  };
}

function deliveryProjection(repository, record) {
  const delivery = repository.getDeliveryForSubmission?.(record.id) || null;
  return delivery ? {
    status: delivery.status,
    target: delivery.target.target,
    transport: delivery.target.kind,
    attempts: delivery.attempts,
    receipt: delivery.receipt,
    lastError: delivery.lastError,
  } : { status: "not_configured" };
}

function latestKnownFormVersion(agent) {
  if (Number.isInteger(agent?.published?.formVersion)) return agent.published.formVersion;
  const definitions = Array.isArray(agent?.publishedDefinitions) ? agent.publishedDefinitions : [];
  return definitions.reduce((latest, definition) => Math.max(latest, Number(definition?.formVersion) || 0), 0) || null;
}

function recordPrincipal(record) {
  return record?.principal || record?.actor || null;
}

/**
 * Application port for reading submission projections.
 * Authorization is injected and evaluated for both the owner resource and every returned record.
 */
export function createSubmissionReader(repository, { authorizeRead } = {}) {
  function authorize(principal, ownerAgent, scope = null) {
    if (typeof authorizeRead !== "function") return denied();
    const decision = authorizeRead({
      principal,
      capability: SUBMISSION_READ,
      resource: { ownerAgent, scope },
    });
    return decision?.allowed
      ? decision
      : denied(decision?.status, decision?.errorCode, decision?.parameters);
  }

  function visibleRecord(record, principal) {
    return record?.ownerAgent
      && authorize(principal, record.ownerAgent, record.scope || null).allowed;
  }

  function loadAuthorized(ownerAgent, principal) {
    const agent = repository.get(ownerAgent);
    if (!agent) return problem("user_page_not_found", 404);
    const decision = authorize(principal, agent.id);
    return decision.allowed ? { agent } : decision;
  }

  return {
    listSources(principal) {
      return repository.list()
        .filter((agent) => activePublishedBinding(agent) && authorize(principal, agent.id).allowed)
        .map((agent) => ({
          ownerAgent: agent.id,
          name: agent.name,
          formVersion: agent.published.formVersion,
          releaseVersion: currentReleaseVersion(agent),
          submissionCount: repository.listSubmissions({ ownerAgent: agent.id })
            .filter((record) => visibleRecord(record, principal)).length,
        }));
    },

    list(ownerAgent, principal, { actorId = "", includeFields = false } = {}) {
      const access = loadAuthorized(ownerAgent, principal);
      if (!access.agent) return access;
      const { agent } = access;
      const allRecords = repository.listSubmissions({ ownerAgent: agent.id })
        .filter((record) => visibleRecord(record, principal));
      const requestedActor = String(actorId || "").trim();
      const records = requestedActor
        ? allRecords.filter((record) => recordPrincipal(record)?.id === requestedActor)
        : allRecords;
      const submissionNumbers = new Map(allRecords.map((record, index) => [record.id, index + 1]));
      return {
        status: 200,
        page: {
          ownerAgent: agent.id,
          name: agent.name,
          formVersion: latestKnownFormVersion(agent),
          releaseVersion: currentReleaseVersion(agent),
        },
        records: records.map((record) => {
          const projection = fieldProjection(agent, record.envelope);
          const management = repository.getSubmissionManagement?.(record.id) || null;
          return ({
            id: record.id,
            ownerAgent: record.ownerAgent,
            submissionNumber: submissionNumbers.get(record.id),
            receivedAt: record.receivedAt,
            actorId: recordPrincipal(record)?.id || null,
            actorName: recordPrincipal(record)?.displayName || recordPrincipal(record)?.id || null,
            fieldCount: Object.keys(record.envelope.values || {}).length,
            management: management ? {
              status: management.status,
              tags: management.tags,
              assignee: management.assignee,
              archivedAt: management.archivedAt,
              revision: management.revision,
            } : {
              status: "new",
              tags: [],
              assignee: null,
              archivedAt: null,
              revision: 1,
            },
            ...(includeFields ? {
              formVersion: record.envelope.formVersion,
              releaseVersion: releaseVersionForFormVersion(agent, record.envelope.formVersion),
              fields: projection.fields,
              formDefinitionAvailable: projection.definitionAvailable,
              delivery: deliveryProjection(repository, record),
            } : {}),
          });
        }),
      };
    },

    get(recordId, principal) {
      const record = repository.getSubmission(recordId);
      if (!record) return problem("submission_not_found", 404);
      const access = loadAuthorized(record.ownerAgent, principal);
      if (!access.agent) return access;
      const decision = authorize(principal, record.ownerAgent, record.scope || null);
      if (!decision.allowed) return decision;
      const projection = fieldProjection(access.agent, record.envelope);
      return {
        status: 200,
        record: {
          id: record.id,
          ownerAgent: record.ownerAgent,
          pageName: access.agent.name,
          receivedAt: record.receivedAt,
          actorId: recordPrincipal(record)?.id || null,
          actorName: recordPrincipal(record)?.displayName || recordPrincipal(record)?.id || null,
          formVersion: record.envelope.formVersion,
          releaseVersion: releaseVersionForFormVersion(access.agent, record.envelope.formVersion),
          fields: projection.fields,
          formDefinitionAvailable: projection.definitionAvailable,
          delivery: deliveryProjection(repository, record),
        },
      };
    },
  };
}
