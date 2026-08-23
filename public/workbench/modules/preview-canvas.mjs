/** Same-origin authoring bridge for the real rendered form. No second canvas renderer. */
export function createPreviewCanvas({ frame, getMode, getSelection, onSelect }) {
  let documentRef = null;

  function fieldNode(fieldId) {
    return [...(documentRef?.querySelectorAll("[data-field-id]") || [])]
      .find((node) => node.dataset.fieldId === fieldId) || null;
  }

  function selectionFromElement(element) {
    const target = element?.closest ? element : element?.parentElement || null;
    if (!target) return null;
    const grid = target.closest("[data-grid][data-field-id]");
    const rowHeader = target.closest("[data-grid-row-id]");
    if (grid && rowHeader) {
      return { kind: "grid-row", fieldId: grid.dataset.fieldId, rowId: rowHeader.dataset.gridRowId };
    }
    const columnHeader = target.closest("[data-grid-column-id]");
    if (grid && columnHeader) {
      return { kind: "grid-column", fieldId: grid.dataset.fieldId, columnId: columnHeader.dataset.gridColumnId };
    }
    const cell = target.closest("td");
    if (grid && cell) {
      const header = grid.querySelector(`thead tr > :nth-child(${cell.cellIndex + 1})[data-grid-column-id]`);
      if (header) return { kind: "grid-column", fieldId: grid.dataset.fieldId, columnId: header.dataset.gridColumnId };
    }
    const field = target.closest("[data-field-id]");
    return field ? { kind: "field", fieldId: field.dataset.fieldId } : null;
  }

  function clearSelection() {
    documentRef?.querySelectorAll("[data-authoring-selected]").forEach((node) => node.removeAttribute("data-authoring-selected"));
  }

  function applySelection(selection = getSelection()) {
    if (!documentRef || getMode() !== "design") return;
    clearSelection();
    if (!selection || selection.kind === "form") return;
    const field = fieldNode(selection.fieldId);
    if (!field) return;
    let reveal = field;
    field.setAttribute("data-authoring-selected", selection.kind === "field" ? "field" : "grid");
    if (selection.kind === "grid-row") {
      const header = [...field.querySelectorAll("[data-grid-row-id]")]
        .find((node) => node.dataset.gridRowId === selection.rowId);
      header?.setAttribute("data-authoring-selected", "row-header");
      header?.closest("tr")?.setAttribute("data-authoring-selected", "row");
      reveal = header || field;
    }
    if (selection.kind === "grid-column") {
      const header = [...field.querySelectorAll("[data-grid-column-id]")]
        .find((node) => node.dataset.gridColumnId === selection.columnId);
      if (!header) return;
      header.setAttribute("data-authoring-selected", "column-header");
      reveal = header;
      const index = header.cellIndex + 1;
      field.querySelectorAll(`tr > :nth-child(${index})`).forEach((node) => node.setAttribute("data-authoring-selected", "column"));
    }
    reveal.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function focusSelection() {
    if (!documentRef || getMode() !== "design") return;
    const selection = getSelection();
    let target = selection?.kind === "form" ? null : fieldNode(selection?.fieldId);
    if (selection?.kind === "grid-row") {
      target = [...(target?.querySelectorAll("[data-grid-row-id]") || [])]
        .find((node) => node.dataset.gridRowId === selection.rowId) || target;
    }
    if (selection?.kind === "grid-column") {
      target = [...(target?.querySelectorAll("[data-grid-column-id]") || [])]
        .find((node) => node.dataset.gridColumnId === selection.columnId) || target;
    }
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function attach() {
    try {
      documentRef = frame.contentDocument;
    } catch {
      documentRef = null;
    }
    if (!documentRef?.querySelector(".form-shell")) return false;
    const designMode = getMode() === "design";
    documentRef.body.dataset.authoringMode = designMode ? "design" : "preview";
    if (!designMode) {
      clearSelection();
      return true;
    }
    documentRef.querySelectorAll("[data-field-id], [data-grid-row-id], [data-grid-column-id]").forEach((node) => {
      node.tabIndex = 0;
    });
    documentRef.querySelectorAll("input, textarea, select, button").forEach((node) => {
      node.tabIndex = -1;
      node.setAttribute("aria-disabled", "true");
    });
    documentRef.addEventListener("click", (event) => {
      const selection = selectionFromElement(event.target);
      if (!selection) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(selection, { source: "canvas" });
    }, true);
    documentRef.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const selection = selectionFromElement(event.target);
      if (!selection) return;
      event.preventDefault();
      onSelect(selection, { source: "canvas" });
    });
    applySelection();
    return true;
  }

  return { attach, applySelection, focusSelection };
}
