export function createCanvasModeTabs({
  tabs,
  tablist,
  panel,
  flushPending,
  hasFields,
  showEmptyError,
  applyMode,
  onChange,
}) {
  async function setMode(mode, { focus = false } = {}) {
    if (!["design", "preview"].includes(mode)) return false;
    if (mode === "preview" && !hasFields()) {
      showEmptyError();
      return false;
    }
    if (!await flushPending()) return false;
    onChange(mode);
    for (const tab of tabs) {
      const selected = tab.dataset.canvasMode === mode;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", `canvas-mode-${mode}`);
    applyMode(mode);
    if (focus) tabs.find((tab) => tab.dataset.canvasMode === mode)?.focus();
    return true;
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.canvasMode)));
  tablist.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, tabs.indexOf(document.activeElement));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setMode(tabs[next].dataset.canvasMode, { focus: true });
  });
  return { setMode };
}
