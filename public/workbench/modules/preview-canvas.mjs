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

  function setMode(mode = getMode()) {
    if (!documentRef) return false;
    const designMode = mode === "design";
    documentRef.body.dataset.authoringMode = designMode ? "design" : "preview";
    documentRef.querySelectorAll("[data-field-id], [data-grid-row-id], [data-grid-column-id]").forEach((node) => {
      if (designMode) node.tabIndex = 0;
      else node.removeAttribute("tabindex");
    });
    documentRef.querySelectorAll("input, textarea, select").forEach((node) => {
      node.disabled = designMode;
      if (designMode) {
        node.tabIndex = -1;
        node.setAttribute("aria-disabled", "true");
      } else {
        node.removeAttribute("tabindex");
        node.removeAttribute("aria-disabled");
      }
    });
    documentRef.querySelectorAll("[data-design-text][data-preview-text]").forEach((node) => {
      node.textContent = designMode ? node.dataset.designText : node.dataset.previewText;
    });
    if (designMode) applySelection(); else clearSelection();
    return true;
  }

  function attach() {
    try {
      documentRef = frame.contentDocument;
    } catch {
      documentRef = null;
    }
    if (!documentRef?.querySelector(".form-shell")) return false;
    if (documentRef.body.dataset.authoringBridge !== "ready") documentRef.addEventListener("click", (event) => {
      if (getMode() !== "design") return;
      const selection = selectionFromElement(event.target);
      if (!selection) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(selection, { source: "canvas" });
    }, true);
    if (documentRef.body.dataset.authoringBridge !== "ready") documentRef.addEventListener("keydown", (event) => {
      if (getMode() !== "design") return;
      if (event.key !== "Enter" && event.key !== " ") return;
      const selection = selectionFromElement(event.target);
      if (!selection) return;
      event.preventDefault();
      onSelect(selection, { source: "canvas" });
    });
    documentRef.body.dataset.authoringBridge = "ready";
    return setMode();
  }

  return { attach, setMode, applySelection, focusSelection };
}
