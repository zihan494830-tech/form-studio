export function createConfirmationDialog({ dialog, title, body, accept, t }) {
  let pending = null;
  return function confirmAction({ title: heading, body: message, confirmLabel = t("ui.common.confirm") }) {
    if (pending) return Promise.resolve(false);
    title.textContent = heading;
    body.textContent = message;
    accept.textContent = confirmLabel;
    dialog.returnValue = "cancel";
    dialog.showModal();
    pending = new Promise((resolve) => dialog.addEventListener("close", () => {
      const accepted = dialog.returnValue === "confirm";
      pending = null;
      resolve(accepted);
    }, { once: true }));
    return pending;
  };
}
