/** Contextual editor for the currently selected field or grid axis. */
import { CONTROLS, controlLabel, escapeHtml } from "/workbench/modules/form-model.js";
import { applyGridEdit, defaultGrid } from "/workbench/modules/grid-editor.mjs";

const COLUMN_CONTROLS = CONTROLS.filter((item) => item.value !== "grid");

export function createPropertyInspector({
  root, getAgent, getSelection, setSelection, saveFields, settleSaves,
  confirmAction, showError, openContract, onClose, t,
}) {
  const optionsHtml = (items, selected) => items.map((item) =>
    `<option value="${item.value}"${item.value === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("");

  function selectedField(agent = getAgent(), selection = getSelection()) {
    return (agent?.fields || []).find((field) => field.id === selection?.fieldId) || null;
  }

  function interfaceSummary(id) {
    return `<div class="inspector-interface"><span>${escapeHtml(t("ui.workbench.inspector_stable_id"))}</span><code>${escapeHtml(id)}</code><button type="button" data-inspector-action="open-contract">${escapeHtml(t("ui.workbench.inspector_interface_action"))}</button></div>`;
  }

  function header(kicker, title) {
    return `<header class="inspector-head"><div><span>${escapeHtml(kicker)}</span><h2>${escapeHtml(title)}</h2></div><button type="button" class="inspector-close" data-inspector-action="close">${escapeHtml(t("ui.workbench.inspector_back_canvas"))}</button></header>`;
  }

  function fieldControls(field) {
    const options = field.control === "select" || field.control === "radio"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_options"))}</span><input data-inspector-change="field-options" value="${escapeHtml((field.options || []).join(", "))}" /></label>` : "";
    const decimals = field.control === "number"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_decimals"))}</span><input data-inspector-change="field-decimals" type="number" min="0" max="6" value="${field.decimals ?? ""}" placeholder="0" /></label>` : "";
    const required = field.control === "grid" ? ""
      : `<label class="inspector-check"><input data-inspector-change="field-required" type="checkbox"${field.required ? " checked" : ""} /><span>${escapeHtml(t("ui.workbench.required"))}</span></label>`;
    return `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_label"))}</span><input data-inspector-change="field-label" value="${escapeHtml(field.label)}" /></label>
      <label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_control"))}</span><select data-inspector-change="field-control">${optionsHtml(CONTROLS, field.control)}</select></label>
      ${required}${options}${decimals}`;
  }

  function gridTabs(field, active) {
    return `<div class="inspector-tabs" role="tablist" aria-label="${escapeHtml(t("ui.workbench.inspector_grid_sections"))}">
      <button id="inspector-tab-basic" type="button" role="tab" aria-controls="inspector-tab-panel" aria-selected="${active === "basic"}" tabindex="${active === "basic" ? 0 : -1}" data-inspector-tab="basic">${escapeHtml(t("ui.workbench.inspector_basic"))}</button>
      <button id="inspector-tab-rows" type="button" role="tab" aria-controls="inspector-tab-panel" aria-selected="${active === "rows"}" tabindex="${active === "rows" ? 0 : -1}" data-inspector-tab="rows">${escapeHtml(t("ui.workbench.inspector_rows", { count: field.grid.rows.length }))}</button>
      <button id="inspector-tab-columns" type="button" role="tab" aria-controls="inspector-tab-panel" aria-selected="${active === "columns"}" tabindex="${active === "columns" ? 0 : -1}" data-inspector-tab="columns">${escapeHtml(t("ui.workbench.inspector_columns", { count: field.grid.columns.length }))}</button>
    </div>`;
  }

  function rowPanel(field, selection) {
    const selected = field.grid.rows.find((row) => row.id === selection.rowId) || field.grid.rows[0];
    const items = field.grid.rows.map((row) => `<button type="button" class="inspector-item${row.id === selected?.id ? " active" : ""}" data-select-row="${escapeHtml(row.id)}"><span>${escapeHtml(row.label)}</span><code>${escapeHtml(row.id)}</code></button>`).join("");
    return `<div class="inspector-list-head"><strong>${escapeHtml(t("ui.workbench.inspector_row_list"))}</strong><button type="button" data-inspector-action="add-row">${escapeHtml(t("ui.workbench.grid_add_row"))}</button></div>
      <div class="inspector-item-list">${items}</div>
      ${selected ? `<div class="inspector-section"><h3>${escapeHtml(t("ui.workbench.inspector_selected_row"))}</h3>
        <label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_label"))}</span><input data-inspector-change="row-label" value="${escapeHtml(selected.label)}" /></label>
        ${interfaceSummary(selected.id)}
        <button type="button" class="danger-action" data-inspector-action="delete-row">${escapeHtml(t("ui.workbench.inspector_delete_row"))}</button>
      </div>` : ""}`;
  }

  function columnPanel(field, selection) {
    const selected = field.grid.columns.find((column) => column.id === selection.columnId) || field.grid.columns[0];
    const items = field.grid.columns.map((column) => `<button type="button" class="inspector-item${column.id === selected?.id ? " active" : ""}" data-select-column="${escapeHtml(column.id)}"><span>${escapeHtml(column.label)}<small>${escapeHtml(controlLabel(column.control))}${column.required ? ` · ${escapeHtml(t("ui.workbench.required"))}` : ""}</small></span><code>${escapeHtml(column.id)}</code></button>`).join("");
    const options = selected?.control === "select" || selected?.control === "radio"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_options"))}</span><input data-inspector-change="column-options" value="${escapeHtml((selected.options || []).join(", "))}" /></label>` : "";
    const decimals = selected?.control === "number"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_decimals"))}</span><input data-inspector-change="column-decimals" type="number" min="0" max="6" value="${selected.decimals ?? ""}" placeholder="0" /></label>` : "";
    return `<div class="inspector-list-head"><strong>${escapeHtml(t("ui.workbench.inspector_column_list"))}</strong><button type="button" data-inspector-action="add-column">${escapeHtml(t("ui.workbench.grid_add_column"))}</button></div>
      <div class="inspector-item-list">${items}</div>
      ${selected ? `<div class="inspector-section"><h3>${escapeHtml(t("ui.workbench.inspector_selected_column"))}</h3>
        <label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_label"))}</span><input data-inspector-change="column-label" value="${escapeHtml(selected.label)}" /></label>
        <label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_control"))}</span><select data-inspector-change="column-control">${optionsHtml(COLUMN_CONTROLS, selected.control)}</select></label>
        <label class="inspector-check"><input data-inspector-change="column-required" type="checkbox"${selected.required ? " checked" : ""} /><span>${escapeHtml(t("ui.workbench.required"))}</span></label>
        ${options}${decimals}${interfaceSummary(selected.id)}
        <button type="button" class="danger-action" data-inspector-action="delete-column">${escapeHtml(t("ui.workbench.inspector_delete_column"))}</button>
      </div>` : ""}`;
  }

  function render() {
    const agent = getAgent();
    const selection = getSelection();
    if (!agent) {
      root.innerHTML = `${header(t("ui.workbench.inspector_context"), t("ui.workbench.inspector_none"))}<p class="empty-state">${escapeHtml(t("ui.workbench.inspector_choose_page"))}</p>`;
      return;
    }
    const field = selectedField(agent, selection);
    if (!field) {
      root.innerHTML = `${header(t("ui.workbench.inspector_page"), agent.name)}<div class="inspector-summary"><span>${escapeHtml(t("ui.workbench.inspector_field_count", { count: (agent.fields || []).length }))}</span><code>ownerAgent ${escapeHtml(agent.id)}</code></div><p class="inspector-hint">${escapeHtml(t("ui.workbench.inspector_choose_field"))}</p><button type="button" class="secondary-wide" data-inspector-action="open-contract">${escapeHtml(t("ui.workbench.field_contract_title"))}</button>`;
      return;
    }
    if (field.control !== "grid") {
      root.innerHTML = `${header(t("ui.workbench.inspector_field"), field.label)}<div class="inspector-body">${fieldControls(field)}${interfaceSummary(field.id)}<div class="inspector-danger"><strong>${escapeHtml(t("ui.workbench.inspector_danger"))}</strong><button type="button" class="danger-action" data-inspector-action="delete-field">${escapeHtml(t("ui.workbench.inspector_delete_field"))}</button></div></div>`;
      return;
    }
    const active = selection.kind === "grid-row" ? "rows" : selection.kind === "grid-column" ? "columns" : "basic";
    const content = active === "rows" ? rowPanel(field, selection)
      : active === "columns" ? columnPanel(field, selection)
        : `<div class="inspector-body">${fieldControls(field)}<div class="inspector-summary"><span>${escapeHtml(t("ui.workbench.inspector_grid_size", { rows: field.grid.rows.length, columns: field.grid.columns.length }))}</span></div>${interfaceSummary(field.id)}<div class="inspector-danger"><strong>${escapeHtml(t("ui.workbench.inspector_danger"))}</strong><button type="button" class="danger-action" data-inspector-action="delete-field">${escapeHtml(t("ui.workbench.inspector_delete_grid"))}</button></div></div>`;
    root.innerHTML = `${header(t("ui.workbench.inspector_grid"), field.label)}${gridTabs(field, active)}<div id="inspector-tab-panel" class="inspector-tab-panel" role="tabpanel" aria-labelledby="inspector-tab-${active}">${content}</div>`;
  }

  async function replaceField(fieldId, updater, selectionAfterSave = getSelection()) {
    const agent = getAgent();
    const index = agent?.fields?.findIndex((field) => field.id === fieldId) ?? -1;
    if (index < 0) return false;
    const fields = agent.fields.map((field, fieldIndex) => fieldIndex === index ? updater(field) : field);
    return saveFields(fields, { selectionAfterSave });
  }

  function typeSpecificLoss(control, nextControl) {
    if (control === "grid" && nextControl !== "grid") return t("ui.workbench.inspector_loss_grid");
    if ((control === "select" || control === "radio") && nextControl !== "select" && nextControl !== "radio") return t("ui.workbench.inspector_loss_options");
    if (control === "number" && nextControl !== "number") return t("ui.workbench.inspector_loss_decimals");
    return "";
  }

  async function changeFieldControl(field, control) {
    if (field.control === control) return;
    const loss = typeSpecificLoss(field.control, control);
    if (loss) {
      const confirmed = await confirmAction({ title: t("ui.workbench.inspector_change_type_title"), body: loss, confirmLabel: t("ui.workbench.inspector_change_type_confirm") });
      if (!confirmed) return render();
    }
    const next = { id: field.id, label: field.label, control, required: control === "grid" ? false : Boolean(field.required) };
    if (control === "grid") next.grid = defaultGrid();
    if (control === "select" || control === "radio") next.options = (field.options || [t("ui.workbench.option_one"), t("ui.workbench.option_two")]);
    if (control === "number" && field.decimals !== undefined) next.decimals = field.decimals;
    await replaceField(field.id, () => next, { kind: "field", fieldId: field.id });
  }

  async function changeColumnControl(field, columnId, control) {
    const column = field.grid.columns.find((item) => item.id === columnId);
    if (!column || column.control === control) return;
    const loss = typeSpecificLoss(column.control, control);
    if (loss) {
      const confirmed = await confirmAction({ title: t("ui.workbench.inspector_change_type_title"), body: loss, confirmLabel: t("ui.workbench.inspector_change_type_confirm") });
      if (!confirmed) return render();
    }
    await replaceField(field.id, (current) => ({ ...current, grid: { ...current.grid, columns: current.grid.columns.map((item) => {
      if (item.id !== columnId) return item;
      const next = { id: item.id, label: item.label, control, required: Boolean(item.required) };
      if (control === "select" || control === "radio") next.options = item.options || [t("ui.workbench.option_one"), t("ui.workbench.option_two")];
      if (control === "number" && item.decimals !== undefined) next.decimals = item.decimals;
      return next;
    }) } }), getSelection());
  }

  async function persistControl(target, task) {
    const saved = await task;
    if (saved !== false || !target.isConnected) return saved;
    const control = target.closest(".inspector-control, .inspector-check") || target;
    control.querySelector?.(".inspector-control-error")?.remove();
    control.insertAdjacentHTML("beforeend", `<span class="inspector-control-error" role="alert">${escapeHtml(t("ui.workbench.inspector_save_error"))}</span>`);
    return false;
  }

  root.addEventListener("input", (event) => {
    event.target.closest(".inspector-control, .inspector-check")?.querySelector(".inspector-control-error")?.remove();
  });

  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-inspector-tab]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tabs = [...root.querySelectorAll("[data-inspector-tab]")];
      const current = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      const nextName = tabs[next].dataset.inspectorTab;
      tabs[next].click();
      queueMicrotask(() => root.querySelector(`[data-inspector-tab="${nextName}"]`)?.focus());
      return;
    }
    if (!event.target.matches("input") || (event.key !== "Escape" && event.key !== "Enter")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      render();
      return;
    }
    event.preventDefault();
    event.target.blur();
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.inspectorAction === "close") return onClose();
    if (button.dataset.inspectorAction === "open-contract") return openContract(button);
    const agent = getAgent();
    let selection = getSelection();
    let field = selectedField(agent, selection);
    if (button.dataset.inspectorTab && field?.control === "grid") {
      if (button.dataset.inspectorTab === "basic") return setSelection({ kind: "field", fieldId: field.id }, { source: "inspector" });
      if (button.dataset.inspectorTab === "rows") return setSelection({ kind: "grid-row", fieldId: field.id, rowId: field.grid.rows[0].id }, { source: "inspector" });
      return setSelection({ kind: "grid-column", fieldId: field.id, columnId: field.grid.columns[0].id }, { source: "inspector" });
    }
    if (button.dataset.selectRow && field) return setSelection({ kind: "grid-row", fieldId: field.id, rowId: button.dataset.selectRow }, { source: "inspector" });
    if (button.dataset.selectColumn && field) return setSelection({ kind: "grid-column", fieldId: field.id, columnId: button.dataset.selectColumn }, { source: "inspector" });
    const action = button.dataset.inspectorAction;
    if (!action || !field) return;
    if (["add-row", "add-column", "delete-row", "delete-column", "delete-field"].includes(action)) {
      await settleSaves();
      selection = getSelection(); field = selectedField(getAgent(), selection);
      if (!field) return;
    }
    if (action === "add-row" || action === "add-column") {
      const index = getAgent().fields.findIndex((item) => item.id === field.id);
      const fields = applyGridEdit(getAgent().fields, index, action === "add-row" ? "add-row" : "add-col");
      const item = action === "add-row" ? fields[index].grid.rows.at(-1) : fields[index].grid.columns.at(-1);
      const nextSelection = action === "add-row"
        ? { kind: "grid-row", fieldId: field.id, rowId: item.id }
        : { kind: "grid-column", fieldId: field.id, columnId: item.id };
      const saved = await saveFields(fields, { selectionAfterSave: nextSelection });
      if (saved) root.querySelector(action === "add-row" ? '[data-inspector-change="row-label"]' : '[data-inspector-change="column-label"]')?.focus();
      return saved;
    }
    if (action === "delete-row" || action === "delete-column") {
      const items = action === "delete-row" ? field.grid.rows : field.grid.columns;
      if (items.length <= 1) return showError(t(action === "delete-row" ? "ui.workbench.grid_minimum_row" : "ui.workbench.grid_minimum_column"));
      const itemId = action === "delete-row" ? selection.rowId : selection.columnId;
      const itemIndex = items.findIndex((item) => item.id === itemId);
      const item = items[itemIndex];
      const kind = t(action === "delete-row" ? "ui.workbench.grid_row" : "ui.workbench.grid_column");
      const confirmed = await confirmAction({ title: t("ui.workbench.grid_delete_title", { kind, label: item.label }), body: t("ui.workbench.grid_delete_body", { kind }), confirmLabel: t("ui.workbench.delete") });
      if (!confirmed) return;
      const fieldIndex = getAgent().fields.findIndex((current) => current.id === field.id);
      const fields = applyGridEdit(getAgent().fields, fieldIndex, action === "delete-row" ? "del-row" : "del-col", itemIndex);
      const remaining = action === "delete-row" ? fields[fieldIndex].grid.rows : fields[fieldIndex].grid.columns;
      const next = remaining[Math.min(itemIndex, remaining.length - 1)];
      const saved = await saveFields(fields, { selectionAfterSave: action === "delete-row"
        ? { kind: "grid-row", fieldId: field.id, rowId: next.id }
        : { kind: "grid-column", fieldId: field.id, columnId: next.id } });
      if (saved) root.querySelector(action === "delete-row" ? '[data-inspector-change="row-label"]' : '[data-inspector-change="column-label"]')?.focus();
      return saved;
    }
    if (action === "delete-field") {
      const fields = getAgent().fields;
      const index = fields.findIndex((item) => item.id === field.id);
      const confirmed = await confirmAction({ title: t("ui.workbench.inspector_delete_title", { label: field.label }), body: t("ui.workbench.inspector_delete_body", { id: field.id }), confirmLabel: t("ui.workbench.delete") });
      if (!confirmed) return;
      const nextFields = fields.filter((item) => item.id !== field.id);
      const next = nextFields[Math.min(index, nextFields.length - 1)];
      const saved = await saveFields(nextFields, { selectionAfterSave: next ? { kind: "field", fieldId: next.id } : { kind: "form" } });
      if (saved) root.querySelector('[data-inspector-change="field-label"], [data-inspector-action="open-contract"]')?.focus();
      return saved;
    }
  });

  root.addEventListener("change", async (event) => {
    const change = event.target.dataset.inspectorChange;
    if (!change) return;
    const target = event.target;
    const value = target.value;
    const checked = target.checked;
    await settleSaves();
    const selection = getSelection();
    const field = selectedField(getAgent(), selection);
    if (!field) return;
    if (change === "field-control") return persistControl(target, changeFieldControl(field, value));
    if (change === "column-control") return persistControl(target, changeColumnControl(field, selection.columnId, value));
    if (change.startsWith("field-")) {
      return persistControl(target, replaceField(field.id, (current) => {
        const next = { ...current };
        if (change === "field-label") next.label = value.trim();
        if (change === "field-required") next.required = checked;
        if (change === "field-options") next.options = value;
        if (change === "field-decimals") {
          if (value === "") delete next.decimals; else next.decimals = Number(value);
        }
        return next;
      }, selection));
    }
    if (change === "row-label") {
      return persistControl(target, replaceField(field.id, (current) => ({ ...current, grid: { ...current.grid, rows: current.grid.rows.map((row) => row.id === selection.rowId ? { ...row, label: value.trim() } : row) } }), selection));
    }
    if (change.startsWith("column-")) {
      return persistControl(target, replaceField(field.id, (current) => ({ ...current, grid: { ...current.grid, columns: current.grid.columns.map((column) => {
        if (column.id !== selection.columnId) return column;
        const next = { ...column };
        if (change === "column-label") next.label = value.trim();
        if (change === "column-required") next.required = checked;
        if (change === "column-options") next.options = value;
        if (change === "column-decimals") {
          if (value === "") delete next.decimals; else next.decimals = Number(value);
        }
        return next;
      }) } }), selection));
    }
  });

  return { render };
}
