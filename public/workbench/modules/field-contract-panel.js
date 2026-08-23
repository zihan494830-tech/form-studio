import { escapeHtml } from "/workbench/modules/form-model.js";

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("copy_failed");
}

export function createFieldContractPanel({ dialog, openButton, list, status, getAgent, getSelection, saveFields, t }) {
  let editingTarget = null;
  let showAll = false;
  let returnFocusEl = openButton || null;
  const title = dialog.querySelector("#field-contract-title");
  const description = dialog.querySelector("#field-contract-description");

  function setStatus(message = "", state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function identityEditor({ kind, fieldIndex, itemIndex = -1, id, label = "", warning }) {
    const key = `${kind}:${fieldIndex}:${itemIndex}`;
    const attributes = `data-kind="${kind}" data-index="${fieldIndex}" data-item-index="${itemIndex}"`;
    const labelHtml = label ? `<span class="contract-axis-label">${escapeHtml(label)}</span>` : "";
    if (editingTarget === key) return `<div class="contract-id-editor contract-axis-editor">${labelHtml}
      <label>${escapeHtml(t("ui.workbench.field_contract_new_id"))}<input class="contract-id-input" data-contract-input="${key}" value="${escapeHtml(id)}" autocomplete="off" spellcheck="false" /></label>
      <p>${escapeHtml(warning)}</p>
      <div class="contract-edit-actions"><button type="button" data-contract-action="cancel">${escapeHtml(t("ui.common.cancel"))}</button><button type="button" class="primary" data-contract-action="save" ${attributes}>${escapeHtml(t("ui.workbench.field_contract_save_id"))}</button></div>
    </div>`;
    return `<div class="contract-id-value contract-axis-id">${labelHtml}<code>${escapeHtml(id)}</code>
      <div class="contract-row-actions"><button type="button" data-contract-action="copy" ${attributes}>${escapeHtml(t("ui.workbench.field_contract_copy"))}</button></div>
      <details class="contract-advanced"><summary>${escapeHtml(t("ui.workbench.field_contract_advanced_edit"))}</summary><button type="button" data-contract-action="edit" ${attributes}>${escapeHtml(t("ui.workbench.field_contract_edit"))}</button></details>
    </div>`;
  }

  function targetFromSelection(agent) {
    const fields = agent?.fields || [];
    if (!fields.length) return null;
    const selection = getSelection?.() || { kind: "form" };
    const selectedIndex = fields.findIndex((field) => field.id === selection.fieldId);
    const fieldIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const field = fields[fieldIndex];
    if (selection.kind === "grid-row" && field.control === "grid") {
      const itemIndex = field.grid.rows.findIndex((row) => row.id === selection.rowId);
      if (itemIndex >= 0) return { kind: "row", field, fieldIndex, item: field.grid.rows[itemIndex], itemIndex };
    }
    if (selection.kind === "grid-column" && field.control === "grid") {
      const itemIndex = field.grid.columns.findIndex((column) => column.id === selection.columnId);
      if (itemIndex >= 0) return { kind: "column", field, fieldIndex, item: field.grid.columns[itemIndex], itemIndex };
    }
    return { kind: "field", field, fieldIndex, item: field, itemIndex: -1 };
  }

  function publishedState(agent, field) {
    const published = (agent?.published?.fields || []).find((item) => item.id === field.id);
    return JSON.stringify(published) === JSON.stringify(field)
      ? t("ui.workbench.field_contract_published")
      : t("ui.workbench.field_contract_draft");
  }

  function cellsFor(agent, target) {
    if (target.field.control !== "grid") return [];
    return (agent?.fieldInterfaces || []).filter((item) => item.grid?.fieldId === target.field.id
      && (target.kind !== "row" || item.grid.rowId === target.item.id)
      && (target.kind !== "column" || item.grid.columnId === target.item.id));
  }

  function cellDisclosure(cells) {
    if (!cells.length) return "";
    return `<details class="contract-cells"><summary>${escapeHtml(t("ui.workbench.field_contract_show_cells", { count: cells.length }))}</summary>
      <div class="contract-cell-list">${cells.map((cell) => `<span class="contract-cell"><code>${escapeHtml(cell.id)}</code><button type="button" data-contract-action="copy-cell" data-cell-id="${escapeHtml(cell.id)}">${escapeHtml(t("ui.workbench.field_contract_copy"))}</button></span>`).join("")}</div>
    </details>`;
  }

  function targetCard(agent, target) {
    const contextKey = target.kind === "row" ? "current_row"
      : target.kind === "column" ? "current_column"
        : target.field.control === "grid" ? "current_grid" : "current_field";
    const state = publishedState(agent, target.field);
    const warning = target.kind === "field"
      ? (state === t("ui.workbench.field_contract_published")
          ? t("ui.workbench.field_contract_published_warning")
          : t("ui.workbench.field_contract_draft_warning"))
      : t("ui.workbench.field_contract_axis_warning", { kind: t(`ui.workbench.grid_${target.kind}`) });
    const summary = target.kind === "field" && target.field.control === "grid"
      ? `<p class="contract-grid-summary">${escapeHtml(t("ui.workbench.field_contract_grid_summary", { rows: target.field.grid.rows.length, columns: target.field.grid.columns.length }))}</p>`
      : "";
    return `<section class="field-contract-row contract-current"><div class="contract-field-meta">
      <span>${escapeHtml(t(`ui.workbench.field_contract_${contextKey}`))}</span>
      <strong>${escapeHtml(target.item.label)}</strong><small>${escapeHtml(state)}</small>
    </div>${identityEditor({ kind: target.kind, fieldIndex: target.fieldIndex, itemIndex: target.itemIndex, id: target.item.id, warning })}${summary}${cellDisclosure(cellsFor(agent, target))}</section>`;
  }

  function fullFieldCard(agent, field, fieldIndex) {
    const state = publishedState(agent, field);
    const warning = state === t("ui.workbench.field_contract_published")
      ? t("ui.workbench.field_contract_published_warning") : t("ui.workbench.field_contract_draft_warning");
    const gridIds = field.control === "grid" ? `<div class="contract-grid-identities">
      <section><h4>${escapeHtml(t("ui.workbench.field_contract_rows"))}</h4>${field.grid.rows.map((row, itemIndex) => identityEditor({ kind: "row", fieldIndex, itemIndex, id: row.id, label: row.label, warning: t("ui.workbench.field_contract_axis_warning", { kind: t("ui.workbench.grid_row") }) })).join("")}</section>
      <section><h4>${escapeHtml(t("ui.workbench.field_contract_columns"))}</h4>${field.grid.columns.map((column, itemIndex) => identityEditor({ kind: "column", fieldIndex, itemIndex, id: column.id, label: column.label, warning: t("ui.workbench.field_contract_axis_warning", { kind: t("ui.workbench.grid_column") }) })).join("")}</section>
    </div>` : "";
    const cells = field.control === "grid"
      ? (agent.fieldInterfaces || []).filter((item) => item.grid?.fieldId === field.id) : [];
    return `<section class="field-contract-row"><div class="contract-field-meta"><span>${escapeHtml(t("ui.workbench.field_contract_field", { index: fieldIndex + 1 }))}</span><strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(state)}</small></div>
      ${identityEditor({ kind: "field", fieldIndex, id: field.id, warning })}${gridIds}${cellDisclosure(cells)}</section>`;
  }

  function render() {
    const agent = getAgent();
    const fields = agent?.fields || [];
    if (!fields.length) {
      title.textContent = t("ui.workbench.field_contract_title");
      list.innerHTML = `<p class="empty-state">${escapeHtml(t("ui.workbench.field_contract_empty"))}</p>`;
      return;
    }
    const target = targetFromSelection(agent);
    description.textContent = t("ui.workbench.field_contract_current_description");
    if (showAll) {
      title.textContent = t("ui.workbench.field_contract_title");
      list.innerHTML = `<div class="contract-view-actions"><button type="button" data-contract-action="back-current">${escapeHtml(t("ui.workbench.field_contract_back_current"))}</button></div>
        ${fields.map((field, fieldIndex) => fullFieldCard(agent, field, fieldIndex)).join("")}`;
      return;
    }
    title.textContent = t("ui.workbench.field_contract_current_title", { label: target.item.label });
    const revealLabel = target.field.control === "grid"
      ? t("ui.workbench.field_contract_show_all") : t("ui.workbench.field_contract_show_form");
    list.innerHTML = `${targetCard(agent, target)}<div class="contract-view-actions"><button type="button" data-contract-action="show-all">${escapeHtml(revealLabel)}</button></div>`;
  }

  function open(trigger = openButton) {
    editingTarget = null;
    showAll = false;
    returnFocusEl = trigger || returnFocusEl;
    setStatus();
    render();
    dialog.showModal();
  }

  openButton?.addEventListener("click", () => open(openButton));
  dialog.querySelectorAll("[data-contract-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("close", () => {
    editingTarget = null;
    showAll = false;
    returnFocusEl?.focus();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dialog.close();
  });
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-contract-action]");
    if (!button) return;
    const action = button.dataset.contractAction;
    if (action === "show-all" || action === "back-current") {
      showAll = action === "show-all";
      editingTarget = null;
      setStatus();
      render();
      return;
    }
    if (action === "copy-cell") {
      const cellId = button.dataset.cellId || "";
      try {
        await copyText(cellId);
        setStatus(t("ui.workbench.field_contract_copied", { id: cellId }), "success");
      } catch {
        setStatus(t("ui.workbench.field_contract_copy_failed"), "error");
      }
      return;
    }
    const index = Number(button.dataset.index);
    const itemIndex = Number(button.dataset.itemIndex);
    const kind = button.dataset.kind || "field";
    const agent = getAgent();
    const field = agent?.fields?.[index];
    if (action === "cancel") {
      editingTarget = null; setStatus(); render(); return;
    }
    if (!field) return;
    const item = kind === "row" ? field.grid?.rows?.[itemIndex]
      : kind === "column" ? field.grid?.columns?.[itemIndex] : field;
    if (!item) return;
    if (action === "copy") {
      try {
        await copyText(item.id);
        setStatus(t("ui.workbench.field_contract_copied", { id: item.id }), "success");
      } catch {
        setStatus(t("ui.workbench.field_contract_copy_failed"), "error");
      }
      return;
    }
    if (action === "edit") {
      editingTarget = `${kind}:${index}:${itemIndex}`; setStatus(); render();
      list.querySelector(`[data-contract-input="${editingTarget}"]`)?.focus();
      return;
    }
    if (action === "save") {
      const input = list.querySelector(`[data-contract-input="${kind}:${index}:${itemIndex}"]`);
      const nextId = input?.value.trim() || "";
      if (nextId === item.id) {
        editingTarget = null; setStatus(); render(); return;
      }
      setStatus(t("ui.workbench.saving"), "saving");
      const fields = agent.fields.map((current, fieldIndex) => {
        if (fieldIndex !== index) return current;
        if (kind === "field") return { ...current, id: nextId };
        const axis = kind === "row" ? "rows" : "columns";
        return { ...current, grid: { ...current.grid, [axis]: current.grid[axis].map((axisItem, axisIndex) => axisIndex === itemIndex ? { ...axisItem, id: nextId } : axisItem) } };
      });
      const selection = getSelection?.();
      let selectionAfterSave = selection;
      if (kind === "field" && selection?.fieldId === field.id) selectionAfterSave = { ...selection, fieldId: nextId };
      if (kind === "row" && selection?.kind === "grid-row" && selection.rowId === item.id) selectionAfterSave = { ...selection, rowId: nextId };
      if (kind === "column" && selection?.kind === "grid-column" && selection.columnId === item.id) selectionAfterSave = { ...selection, columnId: nextId };
      const saved = await saveFields(fields, { selectionAfterSave });
      if (!saved) {
        setStatus(t("ui.workbench.field_contract_save_failed"), "error");
        return;
      }
      editingTarget = null;
      render();
      setStatus(t("ui.workbench.field_contract_saved", { id: nextId }), "success");
    }
  });

  return { open, render };
}
