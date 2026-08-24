/** 把仓储对象投影成作者面可读状态；不改变 agent 本体。 */
import { agentInputReadiness } from "../domain/agent/agent-input-config.mjs";
import { expandFields } from "../domain/form/expand-fields.mjs";
import { currentReleaseVersion, releaseHistory } from "../domain/form/published-definition.mjs";

export function ledgerFromFields(agent, fields, status) {
  return {
    version: "form-ledger/v1",
    ownerAgent: agent.id,
    formVersion: agent.formVersion || 1,
    status,
    fields: (fields || []).map((field) => {
      const item = { id: field.id, label: field.label, control: field.control, required: Boolean(field.required) };
      if (field.control === "select" || field.control === "radio") item.options = field.options || [];
      if (field.control === "number" && Number.isInteger(field.decimals)) item.decimals = field.decimals;
      if (field.control === "grid") {
        item.grid = field.grid;
      }
      return item;
    }),
    submit: { label: "提交", to: "agent-input" },
  };
}

export function decorateAgent(agent) {
  if (!agent) return null;
  const fields = agent.fields || [];
  const publishedMatchesDraft = Boolean(agent.binding && agent.published &&
    JSON.stringify(fields) === JSON.stringify(agent.published.fields || []));
  const ledger = fields.length
    ? ledgerFromFields(agent, fields, publishedMatchesDraft ? "published" : "draft")
    : null;
  const expanded = expandFields(fields);
  const fieldInterfaces = expanded.errorCode ? [] : expanded.fields.map((field) => ({
    id: field.id,
    label: field.label,
    control: field.control,
    required: Boolean(field.required),
    ...(field.grid ? { grid: field.grid } : {}),
  }));
  return {
    ...agent,
    revision: Number.isInteger(agent.revision) && agent.revision > 0 ? agent.revision : 1,
    origin: agent.origin || "retrofit",
    fields,
    ledger,
    fieldInterfaces,
    releaseVersion: currentReleaseVersion(agent),
    releaseHistory: releaseHistory(agent),
    agentInputReadiness: agentInputReadiness(agent, fields, agent.formVersion || 1),
  };
}
