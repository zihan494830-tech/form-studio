/** Single-flight submission list loading with explicit unknown, stale and error states. */
export function createSubmissionLoader({ records, states, getSelectedId, onStateChange, t, fetchImpl = fetch }) {
  function stateFor(id) {
    if (!states.has(id)) states.set(id, { status: "idle", requestId: 0, promise: null, error: "" });
    return states.get(id);
  }

  return function loadSubmissions(id, { force = false } = {}) {
    if (!id) return Promise.resolve(false);
    const state = stateFor(id);
    if (state.promise) return state.promise;
    if (!force && state.status === "fresh") return Promise.resolve(true);
    state.status = records.has(id) ? "refreshing" : "loading";
    state.error = "";
    const requestId = ++state.requestId;
    if (getSelectedId() === id) onStateChange();
    const task = (async () => {
      const response = await fetchImpl(`/api/agents/${encodeURIComponent(id)}/submissions`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t("ui.workbench.submissions_refresh_failed"));
      if (state.requestId !== requestId) return false;
      records.set(id, result.records || []);
      Object.assign(state, { status: "fresh", error: "", loadedAt: Date.now() });
      if (getSelectedId() === id) onStateChange();
      return true;
    })().catch((error) => {
      if (state.requestId === requestId) {
        Object.assign(state, { status: "error", error: error.message || t("ui.workbench.submissions_refresh_failed") });
        if (getSelectedId() === id) onStateChange();
      }
      return false;
    }).finally(() => {
      if (state.requestId === requestId) state.promise = null;
    });
    state.promise = task;
    return task;
  };
}
