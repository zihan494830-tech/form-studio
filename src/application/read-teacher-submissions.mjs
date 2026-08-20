import { authorizeAgentAction } from "../domain/access/agent-access.mjs";
import { activePublishedBinding } from "../domain/agent/owner-agent-binding.mjs";

function fieldProjection(agent, values) {
  const fields = new Map((agent.published?.fields || []).map((field) => [field.id, field]));
  return Object.entries(values || {}).map(([id, value]) => {
    const field = fields.get(id);
    const raw = String(value ?? "");
    return {
      id,
      label: field?.label || id,
      value: raw,
      displayValue: field?.control === "checkbox" ? (raw === "true" ? "是" : "否") : raw,
    };
  });
}

function authorize(repository, ownerAgent, actor) {
  const agent = repository.get(ownerAgent);
  if (!agent) return { status: 404, error: "没有这个用户页面" };
  const decision = authorizeAgentAction(agent, actor, "teach");
  return decision.allowed ? { agent } : decision;
}

function visibleRecord(record, agent, actor) {
  return record.ownerAgent === agent.id
    && record.scope?.tenantId === agent.access.tenantId
    && record.scope?.classId === agent.access.classId
    && record.scope.tenantId === actor.scope.tenantId
    && record.scope.classId === actor.scope.classId;
}

export function createTeacherSubmissionReader(repository) {
  return {
    listAgents(actor) {
      const agents = repository.list().filter((agent) => activePublishedBinding(agent)
        && authorizeAgentAction(agent, actor, "teach").allowed);
      return agents.map((agent) => ({
        ownerAgent: agent.id,
        name: agent.name,
        formVersion: agent.published.formVersion,
        submissionCount: repository.listSubmissions({
          ownerAgent: agent.id,
          tenantId: actor.scope.tenantId,
          classId: actor.scope.classId,
        }).filter((record) => visibleRecord(record, agent, actor)).length,
      }));
    },

    list(ownerAgent, actor, { actorId = "" } = {}) {
      const access = authorize(repository, ownerAgent, actor);
      if (!access.agent) return access;
      const { agent } = access;
      const records = repository.listSubmissions({
        ownerAgent: agent.id,
        actorId: String(actorId || "").trim() || undefined,
        tenantId: actor.scope.tenantId,
        classId: actor.scope.classId,
      }).filter((record) => visibleRecord(record, agent, actor));
      return {
        status: 200,
        page: { ownerAgent: agent.id, name: agent.name, formVersion: agent.published.formVersion },
        records: records.map((record) => ({
          id: record.id,
          receivedAt: record.receivedAt,
          actorId: record.actor.id,
          actorName: record.actor.displayName || record.actor.id,
          fieldCount: Object.keys(record.envelope.values || {}).length,
        })),
      };
    },

    get(recordId, actor) {
      const record = repository.getSubmission(recordId);
      if (!record) return { status: 404, error: "没有这条提交记录" };
      const access = authorize(repository, record.ownerAgent, actor);
      if (!access.agent) return access;
      if (!visibleRecord(record, access.agent, actor)) {
        return { status: 403, error: "无权访问其他班级或租户的数据" };
      }
      const delivery = repository.getDeliveryForSubmission?.(record.id) || null;
      return {
        status: 200,
        record: {
          id: record.id,
          ownerAgent: record.ownerAgent,
          pageName: access.agent.name,
          receivedAt: record.receivedAt,
          actorId: record.actor.id,
          actorName: record.actor.displayName || record.actor.id,
          formVersion: record.envelope.formVersion,
          fields: fieldProjection(access.agent, record.envelope.values),
          delivery: delivery ? {
            status: delivery.status,
            target: delivery.target.target,
            transport: delivery.target.kind,
            attempts: delivery.attempts,
            receipt: delivery.receipt,
            lastError: delivery.lastError,
          } : { status: "not_configured" },
        },
      };
    },
  };
}
