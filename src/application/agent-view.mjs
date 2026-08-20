/** 把仓储对象投影成作者面可读状态；不改变 agent 本体。 */
export function ledgerFromFields(agent, fields, status) {
  return {
    version: "form-ledger/v1",
    ownerAgent: agent.id,
    formVersion: agent.formVersion || 1,
    status,
    fields: (fields || []).map((field) => {
      const item = { id: field.id, label: field.label, control: field.control, required: Boolean(field.required) };
      if (field.control === "select") item.options = field.options || [];
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
  return { ...agent, origin: agent.origin || "retrofit", fields, ledger };
}
