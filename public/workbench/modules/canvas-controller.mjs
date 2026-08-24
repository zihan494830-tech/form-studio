/** Keeps one rendered iframe document alive across design/preview mode changes. */
export function createCanvasController({
  frame, hint, wrap, loading, faceMode, userPageLink, refreshButton,
  zoomOut, zoomReset, zoomIn, zoomValue, previewCanvas,
  getAgent, getMode, isDirty, escapeHtml, t,
}) {
  const MIN = 0.6, MAX = 1.4, STEP = 0.1;
  let zoom = 1;
  let currentPath = null;
  let loadSequence = 0;
  let lastLoadFailed = false;

  function pathFor(agent) {
    return `/preview/${encodeURIComponent(agent.id)}?mode=preview`;
  }

  function setBusy(busy) {
    wrap.setAttribute("aria-busy", String(busy));
    loading.hidden = !busy;
    loading.setAttribute("aria-hidden", String(!busy));
  }

  function setZoom(next) {
    zoom = Math.min(MAX, Math.max(MIN, Math.round(next * 10) / 10));
    zoomValue.value = `${Math.round(zoom * 100)}%`;
    zoomValue.textContent = zoomValue.value;
    zoomOut.disabled = zoom <= MIN;
    zoomIn.disabled = zoom >= MAX;
    try {
      frame.contentDocument.documentElement.style.zoom = String(zoom);
    } catch {
      // Same-origin today; a future external renderer must not break the toolbar.
    }
  }

  function attachZoom() {
    setZoom(zoom);
    frame.contentDocument?.addEventListener("wheel", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? STEP : -STEP));
    }, { passive: false });
  }

  function updateLinks(agent) {
    const draft = !agent.binding || isDirty(agent);
    faceMode.textContent = draft
      ? agent.binding ? `草稿試填 · 線上 ${agent.releaseVersion || "v1.x"}` : "草稿試填"
      : `已發布 · ${agent.releaseVersion || "v1.x"}`;
    faceMode.className = `face-mode ${draft ? "draft" : "published"}`;
    userPageLink.href = `/a/${encodeURIComponent(agent.id)}`;
    const unavailable = !agent.binding;
    userPageLink.setAttribute("aria-disabled", String(unavailable));
    userPageLink.tabIndex = unavailable ? -1 : 0;
  }

  function load(agent, { force = true } = {}) {
    if (!agent) return;
    const path = pathFor(agent);
    currentPath = path;
    hint.hidden = true;
    updateLinks(agent);
    if (!force) {
      frame.hidden = false;
      previewCanvas.setMode(getMode());
      return;
    }
    lastLoadFailed = false;
    refreshButton.hidden = true;
    refreshButton.disabled = true;
    setBusy(true);
    const sequence = ++loadSequence;
    const timeout = setTimeout(() => {
      if (sequence !== loadSequence) return;
      frame.hidden = true;
      hint.hidden = false;
      hint.innerHTML = `<p>${escapeHtml(t("ui.workbench.canvas_load_failed"))}</p>`;
      lastLoadFailed = true;
      refreshButton.hidden = false;
      refreshButton.disabled = false;
      setBusy(false);
    }, 8000);
    frame.addEventListener("load", () => {
      if (currentPath !== path || sequence !== loadSequence) return;
      clearTimeout(timeout);
      const ready = previewCanvas.attach();
      frame.hidden = !ready;
      hint.hidden = ready;
      if (!ready) {
        hint.innerHTML = `<p>${escapeHtml(t("ui.workbench.canvas_load_failed"))}</p>`;
        lastLoadFailed = true;
        refreshButton.hidden = false;
        refreshButton.disabled = false;
      }
      else {
        lastLoadFailed = false;
        refreshButton.hidden = true;
        attachZoom();
        requestAnimationFrame(() => previewCanvas.applySelection());
      }
      setBusy(false);
    }, { once: true });
    frame.src = `${path}&r=${Date.now()}`;
  }

  function ensure(agent, { force = false } = {}) {
    if (!agent) return;
    load(agent, { force: force || lastLoadFailed || currentPath !== pathFor(agent) });
  }

  zoomOut.addEventListener("click", () => setZoom(zoom - STEP));
  zoomReset.addEventListener("click", () => setZoom(1));
  zoomIn.addEventListener("click", () => setZoom(zoom + STEP));
  refreshButton.addEventListener("click", () => load(getAgent(), { force: true }));
  userPageLink.addEventListener("click", (event) => {
    if (userPageLink.getAttribute("aria-disabled") === "true") event.preventDefault();
  });

  return { ensure, load, setMode: (mode) => previewCanvas.setMode(mode), get currentPath() { return currentPath; } };
}
