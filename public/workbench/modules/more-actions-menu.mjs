/** Native details menu behavior that adds Escape, outside-click and close-after-action semantics. */
export function wireMoreActionsMenu(details, documentRoot = document) {
  details.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !details.open) return;
    event.preventDefault();
    details.open = false;
    details.querySelector("summary")?.focus();
  });
  details.addEventListener("click", (event) => {
    if (event.target.closest("button")) details.open = false;
  });
  documentRoot.addEventListener("pointerdown", (event) => {
    if (details.open && !details.contains(event.target)) details.open = false;
  });
}
