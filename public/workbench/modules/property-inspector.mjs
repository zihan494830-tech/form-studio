/** Contextual editor for the currently selected field or grid axis. */
import { CONTROLS, controlLabel, escapeHtml } from "/workbench/modules/form-model.js";
import { applyGridEdit, defaultGrid, moveItem } from "/workbench/modules/grid-editor.mjs";

const COLUMN_CONTROLS = CONTROLS.filter((item) => item.value !== "grid");
const AUTOSAVE_DELAY = 700;
export function createPropertyInspector({
  root, getAgent, getSelection, setSelection, saveFields, settleSaves,
  confirmAction, showError, openContract, onClose, onEditState, t,
}) {
  let dirtyTarget = null;
  let commitPromise = null;
  let blockingError = false;
  let editVersion = 0;
  let autosaveTimer = null;
  let autosaveTarget = null;
  const optionsHtml = (items, selected) => items.map((item) =>
    `<option value="${item.value}"${item.value === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("");

  function selectedField(agent = getAgent(), selection = getSelection()) {
    return (agent?.fields || []).find((field) => field.id === selection?.fieldId) || null;
  }

  function interfaceSummary(id) {
    return `<div class="inspector-interface"><button type="button" data-inspector-action="open-contract" data-interface-id="${escapeHtml(id)}">${escapeHtml(t("ui.workbench.inspector_interface_advanced"))}</button></div>`;
  }

  function moveControls(prefix, index, length) {
    return `<div class="inspector-move" role="group" aria-label="${escapeHtml(t("ui.workbench.inspector_order"))}">
      <button type="button" data-inspector-action="move-${prefix}-up"${index <= 0 ? " disabled" : ""}>${escapeHtml(t("ui.workbench.move_up"))}</button>
      <button type="button" data-inspector-action="move-${prefix}-down"${index >= length - 1 ? " disabled" : ""}>${escapeHtml(t("ui.workbench.move_down"))}</button>
    </div>`;
  }

  function header(kicker, title) {
    return `<header class="inspector-head"><div><span>${escapeHtml(kicker)}</span><h2>${escapeHtml(title)}</h2></div><button type="button" class="inspector-close" data-inspector-action="close">${escapeHtml(t("ui.workbench.inspector_back_canvas"))}</button></header>`;
  }

  function fieldControls(field) {
    const agent = getAgent();
    const index = agent?.fields?.findIndex((item) => item.id === field.id) ?? -1;
    const options = field.control === "select" || field.control === "radio"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_options_lines"))}</span><textarea rows="4" data-inspector-change="field-options">${escapeHtml((field.options || []).join("\n"))}</textarea></label>` : "";
    const decimals = field.control === "number"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_decimals"))}</span><input data-inspector-change="field-decimals" type="number" min="0" max="6" value="${field.decimals ?? ""}" placeholder="0" /></label>` : "";
    const required = field.control === "grid" ? ""
      : `<label class="inspector-check"><input data-inspector-change="field-required" type="checkbox"${field.required ? " checked" : ""} /><span>${escapeHtml(t("ui.workbench.required"))}</span></label>`;
    return `${moveControls("field", index, agent?.fields?.length || 0)}<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_label"))}</span><input data-inspector-change="field-label" value="${escapeHtml(field.label)}" /></label>
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
    const selectedIndex = field.grid.rows.findIndex((row) => row.id === selected?.id);
    const items = field.grid.rows.map((row) => `<button type="button" class="inspector-item${row.id === selected?.id ? " active" : ""}" data-select-row="${escapeHtml(row.id)}"><span>${escapeHtml(row.label)}</span></button>`).join("");
    return `<div class="inspector-list-head"><strong>${escapeHtml(t("ui.workbench.inspector_row_list"))}</strong><button type="button" data-inspector-action="add-row">${escapeHtml(t("ui.workbench.grid_add_row"))}</button></div>
      <div class="inspector-item-list">${items}</div>
      ${selected ? `<div class="inspector-section"><h3>${escapeHtml(t("ui.workbench.inspector_selected_row"))}</h3>
        ${moveControls("row", selectedIndex, field.grid.rows.length)}
        <label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_label"))}</span><input data-inspector-change="row-label" value="${escapeHtml(selected.label)}" /></label>
        ${interfaceSummary(selected.id)}
        <button type="button" class="danger-action" data-inspector-action="delete-row">${escapeHtml(t("ui.workbench.inspector_delete_row"))}</button>
      </div>` : ""}`;
  }

  function columnPanel(field, selection) {
    const selected = field.grid.columns.find((column) => column.id === selection.columnId) || field.grid.columns[0];
    const selectedIndex = field.grid.columns.findIndex((column) => column.id === selected?.id);
    const items = field.grid.columns.map((column) => `<button type="button" class="inspector-item${column.id === selected?.id ? " active" : ""}" data-select-column="${escapeHtml(column.id)}"><span>${escapeHtml(column.label)}<small>${escapeHtml(controlLabel(column.control))}${column.required ? ` · ${escapeHtml(t("ui.workbench.required"))}` : ""}</small></span></button>`).join("");
    const options = selected?.control === "select" || selected?.control === "radio"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_options_lines"))}</span><textarea rows="4" data-inspector-change="column-options">${escapeHtml((selected.options || []).join("\n"))}</textarea></label>` : "";
    const decimals = selected?.control === "number"
      ? `<label class="inspector-control"><span>${escapeHtml(t("ui.workbench.inspector_decimals"))}</span><input data-inspector-change="column-decimals" type="number" min="0" max="6" value="${selected.decimals ?? ""}" placeholder="0" /></label>` : "";
    return `<div class="inspector-list-head"><strong>${escapeHtml(t("ui.workbench.inspector_column_list"))}</strong><button type="button" data-inspector-action="add-column">${escapeHtml(t("ui.workbench.grid_add_column"))}</button></div>
      <div class="inspector-item-list">${items}</div>
      ${selected ? `<div class="inspector-section"><h3>${escapeHtml(t("ui.workbench.inspector_selected_column"))}</h3>
        ${moveControls("column", selectedIndex, field.grid.columns.length)}
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
      root.innerHTML = `${header(t("ui.workbench.inspector_page"), agent.name)}<div class="inspector-summary"><span>${escapeHtml(t("ui.workbench.inspector_field_count", { count: (agent.fields || []).length }))}</span></div><p class="inspector-hint">${escapeHtml(t("ui.workbench.inspector_choose_field"))}</p><button type="button" class="secondary-wide" data-inspector-action="open-contract">${escapeHtml(t("ui.workbench.inspector_interface_advanced"))}</button>`;
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

  async function replaceField(fieldId, updater, selectionAfterSave = getSelection(), { refreshInspector = true } = {}) {
    const agent = getAgent();
    const index = agent?.fields?.findIndex((field) => field.id === fieldId) ?? -1;
    if (index < 0) return false;
    const fields = agent.fields.map((field, fieldIndex) => fieldIndex === index ? updater(field) : field);
    return saveFields(fields, { selectionAfterSave, refreshInspector });
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

  async function persistControl(target, task, committedSnapshot) {
    const saved = await task;
    if (saved !== false) {
      if (!dirtyTarget || (dirtyTarget.element === target && dirtyTarget.version === committedSnapshot.version)) {
        dirtyTarget = null;
        blockingError = false;
        onEditState?.("clean");
      }
      return saved;
    }
    if (!dirtyTarget || dirtyTarget.element === target) dirtyTarget = snapshotTarget(target);
    blockingError = true;
    onEditState?.("error");
    if (target.isConnected) {
      const control = target.closest(".inspector-control, .inspector-check") || target;
      control.querySelector?.(".inspector-control-error")?.remove();
      control.insertAdjacentHTML("beforeend", `<span class="inspector-control-error" role="alert">${escapeHtml(t("ui.workbench.inspector_save_error"))}</span>`);
    }
    return false;
  }

  function snapshotTarget(target) {
    return {
      element: target,
      change: target.dataset.inspectorChange,
      value: target.value,
      checked: target.checked,
      selection: JSON.parse(JSON.stringify(getSelection() || { kind: "form" })),
      version: editVersion,
    };
  }

  function markDirty(target) {
    editVersion += 1;
    dirtyTarget = snapshotTarget(target);
    blockingError = false;
    target.closest(".inspector-control, .inspector-check")?.querySelector(".inspector-control-error")?.remove();
    onEditState?.("dirty");
  }

  function localInvalid(target, message) {
    blockingError = true;
    dirtyTarget = { ...snapshotTarget(target), ...dirtyTarget };
    onEditState?.("error");
    const control = target.closest(".inspector-control, .inspector-check") || target;
    control.querySelector?.(".inspector-control-error")?.remove();
    control.insertAdjacentHTML("beforeend", `<span class="inspector-control-error" role="alert">${escapeHtml(message)}</span>`);
    target.focus();
    return false;
  }

  function normalizedLines(value) {
    return String(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  async function applyTarget(snapshot) {
    const target = snapshot.element;
    const { change, value, checked, selection } = snapshot;
    if (!change) return true;
    await settleSaves();
    const field = selectedField(getAgent(), selection);
    if (!field) return false;
    if ((change === "field-label" || change === "row-label" || change === "column-label") && !value.trim()) {
      const code = change === "field-label" ? "error.field_label_required"
        : change === "row-label" ? "error.grid_row_label_required" : "error.grid_column_label_required";
      return localInvalid(target, t(code, { id: field.id, grid: field.id, row: 0, column: 0 }));
    }
    if (change.endsWith("decimals") && value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 6)) {
      const code = change === "field-decimals" ? "error.decimals_invalid" : "error.grid_column_decimals_invalid";
      return localInvalid(target, t(code, { id: field.id, grid: field.id, column: 0 }));
    }
    if (change.endsWith("options") && normalizedLines(value).length === 0) {
      const code = change === "field-options" && field.control === "radio" ? "error.radio_options_required"
        : change === "field-options" ? "error.select_options_required" : "error.grid_column_options_required";
      return localInvalid(target, t(code, { id: field.id, grid: field.id, column: 0 }));
    }
    if (change === "field-control") return persistControl(target, changeFieldControl(field, value), snapshot);
    if (change === "column-control") return persistControl(target, changeColumnControl(field, selection.columnId, value), snapshot);
    if (change.startsWith("field-")) {
      return persistControl(target, replaceField(field.id, (current) => {
        const next = { ...current };
        if (change === "field-label") next.label = value.trim();
        if (change === "field-required") next.required = checked;
        if (change === "field-options") next.options = normalizedLines(value);
        if (change === "field-decimals") {
          if (value === "") delete next.decimals; else next.decimals = Number(value);
        }
        return next;
      }, selection, { refreshInspector: false }), snapshot);
    }
    if (change === "row-label") {
      return persistControl(target, replaceField(field.id, (current) => ({ ...current, grid: { ...current.grid, rows: current.grid.rows.map((row) => row.id === selection.rowId ? { ...row, label: value.trim() } : row) } }), selection, { refreshInspector: false }), snapshot);
    }
    if (change.startsWith("column-")) {
      return persistControl(target, replaceField(field.id, (current) => ({ ...current, grid: { ...current.grid, columns: current.grid.columns.map((column) => {
        if (column.id !== selection.columnId) return column;
        const next = { ...column };
        if (change === "column-label") next.label = value.trim();
        if (change === "column-required") next.required = checked;
        if (change === "column-options") next.options = normalizedLines(value);
        if (change === "column-decimals") {
          if (value === "") delete next.decimals; else next.decimals = Number(value);
        }
        return next;
      }) } }), selection, { refreshInspector: false }), snapshot);
    }
    return true;
  }

  function clearAutosave(target = null) {
    if (target && autosaveTarget !== target) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
    autosaveTarget = null;
  }

  function scheduleAutosave(target) {
    clearAutosave();
    autosaveTarget = target;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      autosaveTarget = null;
      if (target.isConnected && dirtyTarget?.element === target) commitTarget(target);
    }, AUTOSAVE_DELAY);
  }

  function commitTarget(target) {
    if (!target?.dataset.inspectorChange) return Promise.resolve(true);
    clearAutosave(target);
    const snapshot = dirtyTarget?.element === target ? dirtyTarget : snapshotTarget(target);
    if (commitPromise?.target === target && commitPromise.version === snapshot.version) return commitPromise.task;
    const previous = commitPromise?.task || Promise.resolve(true);
    const task = previous.then(() => applyTarget(snapshot)).finally(() => {
      if (commitPromise?.task === task) commitPromise = null;
    });
    commitPromise = { target, task, version: snapshot.version };
    return task;
  }

  async function flushPending() {
    clearAutosave();
    const saved = dirtyTarget?.element?.isConnected
      ? await commitTarget(dirtyTarget.element)
      : commitPromise ? await commitPromise.task : true;
    await settleSaves();
    return saved !== false && !blockingError;
  }

  function discardPending() {
    clearAutosave();
    dirtyTarget = null;
    blockingError = false;
    onEditState?.("clean", { discarded: true });
    render();
  }

  root.addEventListener("input", (event) => {
    if (!event.target.dataset.inspectorChange || event.target.matches("select, [type=checkbox]")) return;
    markDirty(event.target);
    scheduleAutosave(event.target);
  });

  root.addEventListener("focusout", (event) => {
    if (event.target === dirtyTarget?.element) commitTarget(event.target);
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
    if (!event.target.matches("[data-inspector-change]") || (event.key !== "Escape" && event.key !== "Enter")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      discardPending();
      return;
    }
    if (!event.target.matches("input:not([type=checkbox])")) return;
    event.preventDefault();
    commitTarget(event.target);
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
    if (["add-row", "add-column", "delete-row", "delete-column", "delete-field"].includes(action) || action.startsWith("move-")) {
      if (!await flushPending()) return false;
      selection = getSelection(); field = selectedField(getAgent(), selection);
      if (!field) return;
    }
    if (action.startsWith("move-")) {
      const offset = action.endsWith("-up") ? -1 : 1;
      if (action.startsWith("move-field-")) {
        const index = getAgent().fields.findIndex((item) => item.id === field.id);
        return saveFields(moveItem(getAgent().fields, index, offset), { selectionAfterSave: selection });
      }
      const fieldIndex = getAgent().fields.findIndex((item) => item.id === field.id);
      const axis = action.startsWith("move-row-") ? "rows" : "columns";
      const selectedId = axis === "rows" ? selection.rowId : selection.columnId;
      const itemIndex = field.grid[axis].findIndex((item) => item.id === selectedId);
      const fields = getAgent().fields.map((item, index) => index === fieldIndex
        ? { ...item, grid: { ...item.grid, [axis]: moveItem(item.grid[axis], itemIndex, offset) } }
        : item);
      return saveFields(fields, { selectionAfterSave: selection });
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

  root.addEventListener("change", (event) => {
    if (!event.target.dataset.inspectorChange) return;
    if (event.target.matches("select, [type=checkbox]")) markDirty(event.target);
    commitTarget(event.target);
  });

  async function retryPending() {
    if (!dirtyTarget?.element?.isConnected) return false;
    blockingError = false;
    onEditState?.("dirty");
    return commitTarget(dirtyTarget.element);
  }

  return { render, flushPending, discardPending, retryPending };
}
