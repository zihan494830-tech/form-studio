export function submissionSearchText(item) {
  return JSON.stringify({
    id: item.id,
    submissionNumber: item.submissionNumber,
    receivedAt: item.receivedAt || item.submittedAt,
    formVersion: item.formVersion,
    fields: item.fields,
    values: item.values,
  });
}

export function submissionReference(item, translate) {
  return Number.isInteger(item.submissionNumber)
    ? translate("ui.workbench.submission_number", { number: item.submissionNumber })
    : translate("ui.workbench.submission_record");
}

export function createSubmissionView({
  ledgerEl, bagEl, recordCountEl, viewRecordCountEl, recordsSearchEl,
  getAgent, submissionRecords, controlLabel, escapeHtml, locale, t,
}) {
  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString(locale, { hour12: false });
  }

  function gridTableHtml(fieldId, cells) {
    const orderedCells = [...cells].sort((left, right) =>
      (left.grid.rowIndex - right.grid.rowIndex) || (left.grid.columnIndex - right.grid.columnIndex));
    const rowMap = new Map(), columnMap = new Map(), values = new Map();
    for (const cell of orderedCells) {
      if (!rowMap.has(cell.grid.rowId)) rowMap.set(cell.grid.rowId, { id: cell.grid.rowId, label: cell.grid.rowLabel, index: cell.grid.rowIndex });
      if (!columnMap.has(cell.grid.columnId)) columnMap.set(cell.grid.columnId, { id: cell.grid.columnId, label: cell.grid.columnLabel, index: cell.grid.columnIndex });
      values.set(`${cell.grid.rowId}|${cell.grid.columnId}`, cell.value);
    }
    const rows = [...rowMap.values()].sort((left, right) => left.index - right.index);
    const columns = [...columnMap.values()].sort((left, right) => left.index - right.index);
    const headers = columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("");
    const body = rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${columns.map((column) => `<td>${escapeHtml(values.get(`${row.id}|${column.id}`) ?? "")}</td>`).join("")}</tr>`).join("");
    const label = orderedCells[0]?.grid?.fieldLabel || fieldId;
    return `<section class="mini-grid-group"><h4>${escapeHtml(label)}</h4><div class="mini-grid-wrap"><table class="mini-grid"><thead><tr><th scope="col" aria-hidden="true"></th>${headers}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }

  function render() {
    const agent = getAgent();
    if (!agent) {
      ledgerEl.innerHTML = `<span class="muted">${t("ui.workbench.not_selected")}</span>`; bagEl.innerHTML = ""; recordCountEl.textContent = "";
      viewRecordCountEl.textContent = t("ui.workbench.record_count", { count: 0 }); return;
    }
    if (!agent.ledger) ledgerEl.innerHTML = `<span class="muted">${t("ui.workbench.no_ledger_fields")}</span>`;
    else ledgerEl.innerHTML = `<div class="ledger-meta"><code>${escapeHtml(agent.ledger.ownerAgent)}</code><span>${escapeHtml(agent.ledger.status === "published" ? t("ui.workbench.published") : t("ui.workbench.draft"))} · ${escapeHtml(t("ui.workbench.form_version", { version: agent.ledger.formVersion }))}</span></div>${agent.ledger.fields.map((field) =>
      `<div class="field-row"><div><strong>${escapeHtml(field.label)}</strong><code>${escapeHtml(field.id)}</code></div><span>${escapeHtml(controlLabel(field.control))}${field.required ? ` · ${t("ui.workbench.required")}` : ""}</span></div>`).join("")}`;
    const projected = submissionRecords.get(agent.id);
    const all = projected ? [...projected].reverse() : [...(agent.inputBag || [])].reverse();
    viewRecordCountEl.textContent = t("ui.workbench.record_count", { count: all.length });
    const query = recordsSearchEl.value.trim().toLocaleLowerCase(locale);
    const bag = all.filter((item) => !query || submissionSearchText(item).toLocaleLowerCase(locale).includes(query));
    recordCountEl.textContent = query ? `${bag.length}/${all.length}` : t("ui.workbench.record_count", { count: all.length });
    if (!bag.length) {
      bagEl.innerHTML = `<p class="empty-state">${all.length ? t("ui.workbench.no_matching_records") : t("ui.workbench.no_submissions")}</p>`; return;
    }
    bagEl.innerHTML = bag.map((item) => {
      const fields = item.fields || Object.entries(item.values || {}).map(([id, value]) => ({ id, value }));
      const gridGroups = new Map(), flat = [];
      for (const field of fields) {
        if (field.grid?.fieldId) {
          if (!gridGroups.has(field.grid.fieldId)) gridGroups.set(field.grid.fieldId, []);
          gridGroups.get(field.grid.fieldId).push(field);
        } else flat.push(field);
      }
      const values = [...gridGroups.entries()].map(([fieldId, cells]) => gridTableHtml(fieldId, cells)).join("")
        + flat.map(({ id, value }) => `<div class="value-row"><code>${escapeHtml(id)}</code> <span>${escapeHtml(String(value))}</span></div>`).join("");
      const reference = submissionReference(item, t), submittedAt = item.receivedAt || item.submittedAt;
      return `<section class="bag-item"><div class="bag-head"><strong>${escapeHtml(reference)}</strong><time datetime="${escapeHtml(submittedAt || "")}">${escapeHtml(formatTime(submittedAt))}</time></div>
        <div class="envelope-meta">${t("ui.workbench.envelope_meta", { ownerAgent: `<code>${escapeHtml(item.ownerAgent || agent.id)}</code>`, version: escapeHtml(item.formVersion || "?") })}</div>${item.formDefinitionAvailable === false ? `<p class="projection-warning">${escapeHtml(t("ui.workbench.form_definition_unavailable"))}</p>` : ""}${values}</section>`;
    }).join("");
  }

  return { render };
}
