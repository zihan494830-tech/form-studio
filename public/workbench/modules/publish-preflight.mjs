/** Pure publish counts/warnings plus the explicit confirmation boundary. */
const DEFAULT_FIELD = /^欄位\s*\d+$/;
const DEFAULT_ROW = /^第\s*\d+\s*行$/;
const DEFAULT_COLUMN = /^第\s*\d+\s*列$/;
const DEFAULT_OPTION = /^選項(?:\s*\d+|[一二三四五六七八九十]+)$/;

export function publishFacts(agent, t) {
  const fields = agent?.fields || [];
  let required = 0;
  const warnings = [];
  for (const field of fields) {
    if (field.control !== "grid") {
      if (field.required) required += 1;
      if (DEFAULT_FIELD.test(field.label)) warnings.push(t("ui.workbench.publish_warning_field", { label: field.label }));
      for (const option of field.options || []) {
        if (DEFAULT_OPTION.test(option)) warnings.push(t("ui.workbench.publish_warning_option", { field: field.label, label: option }));
      }
      continue;
    }
    const rows = field.grid?.rows || [];
    const columns = field.grid?.columns || [];
    required += rows.length * columns.filter((column) => column.required).length;
    if (DEFAULT_FIELD.test(field.label)) warnings.push(t("ui.workbench.publish_warning_field", { label: field.label }));
    rows.forEach((row) => {
      if (DEFAULT_ROW.test(row.label)) warnings.push(t("ui.workbench.publish_warning_row", { field: field.label, label: row.label }));
    });
    columns.forEach((column) => {
      if (DEFAULT_COLUMN.test(column.label)) warnings.push(t("ui.workbench.publish_warning_column", { field: field.label, label: column.label }));
      (column.options || []).forEach((option) => {
        if (DEFAULT_OPTION.test(option)) warnings.push(t("ui.workbench.publish_warning_option", { field: `${field.label} / ${column.label}`, label: option }));
      });
    });
  }
  const mappingBlocked = agent?.agentInputReadiness?.status === "blocked";
  for (const reason of agent?.agentInputReadiness?.reasons || []) {
    warnings.push(t("ui.workbench.publish_mapping_issue", {
      fieldId: reason.fieldId || "—",
      targetKey: reason.targetKey || "—",
      reason: reason.code || reason.message || "mapping_contract_invalid",
    }));
  }
  return { fieldCount: fields.length, requiredCount: required, warnings, mappingBlocked };
}

export function createPublishPreflight({ dialog, summary, warnings, confirmButton, escapeHtml, t }) {
  let pending = null;
  function open(agent) {
    if (pending) return pending;
    const facts = publishFacts(agent, t);
    const publishedVersion = agent.published?.formVersion || agent.binding?.formVersion;
    const versionLine = publishedVersion
      ? t("ui.workbench.publish_replacement", { published: publishedVersion, draft: agent.formVersion })
      : t("ui.workbench.publish_first", { draft: agent.formVersion });
    summary.innerHTML = `<p class="publish-version-line">${escapeHtml(versionLine)}</p><dl>
      <div><dt>${escapeHtml(t("ui.workbench.publish_agent"))}</dt><dd>${escapeHtml(agent.name)} <small>${escapeHtml(agent.id)}</small></dd></div>
      <div><dt>${escapeHtml(t("ui.workbench.publish_draft_version"))}</dt><dd>${escapeHtml(agent.formVersion)}</dd></div>
      <div><dt>${escapeHtml(t("ui.workbench.publish_field_count"))}</dt><dd>${facts.fieldCount}</dd></div>
      <div><dt>${escapeHtml(t("ui.workbench.publish_required_count"))}</dt><dd>${facts.requiredCount}</dd></div>
    </dl>`;
    warnings.hidden = !facts.warnings.length;
    warnings.innerHTML = facts.warnings.length
      ? `<strong>${escapeHtml(t("ui.workbench.publish_warning_title"))}</strong><ul>${facts.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : "";
    confirmButton.textContent = t("ui.workbench.publish_confirm", { version: agent.formVersion });
    confirmButton.disabled = facts.mappingBlocked;
    dialog.returnValue = "cancel";
    dialog.showModal();
    pending = new Promise((resolve) => dialog.addEventListener("close", () => {
      const accepted = dialog.returnValue === "confirm";
      pending = null;
      resolve(accepted);
    }, { once: true }));
    return pending;
  }
  return { open };
}
