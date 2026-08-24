/** Registers beforeunload only while local edits are unsafe to leave behind. */
export function createUnsavedGuard(targetWindow = window) {
  let active = false;
  function warn(event) {
    event.preventDefault();
    event.returnValue = "";
  }
  return {
    update(shouldWarn) {
      if (Boolean(shouldWarn) === active) return;
      active = Boolean(shouldWarn);
      targetWindow[active ? "addEventListener" : "removeEventListener"]("beforeunload", warn);
    },
  };
}
