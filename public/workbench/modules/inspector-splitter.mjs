const MIN = 280;
const MAX = 520;
const DEFAULT = 340;
const STEP = 16;
const STORAGE_KEY = "form-studio:property-width";

function clamp(value) {
  return Math.min(MAX, Math.max(MIN, Math.round(value)));
}

export function createInspectorSplitter({ root = document.documentElement, splitter }) {
  const desktop = window.matchMedia("(min-width: 1280px)");
  let width = DEFAULT;
  try { width = clamp(Number(localStorage.getItem(STORAGE_KEY)) || DEFAULT); } catch { /* storage is optional */ }

  function apply(next, { persist = true } = {}) {
    width = clamp(next);
    root.style.setProperty("--property-width", `${width}px`);
    splitter.setAttribute("aria-valuenow", String(width));
    if (persist) try { localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* storage is optional */ }
  }

  function reset() {
    apply(DEFAULT);
  }

  splitter.addEventListener("pointerdown", (event) => {
    if (!desktop.matches || event.button !== 0) return;
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
  });
  splitter.addEventListener("pointermove", (event) => {
    if (!desktop.matches || !splitter.hasPointerCapture(event.pointerId)) return;
    apply(window.innerWidth - event.clientX);
  });
  splitter.addEventListener("pointerup", (event) => {
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  });
  splitter.addEventListener("dblclick", reset);
  splitter.addEventListener("keydown", (event) => {
    if (!desktop.matches || !["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") apply(MIN);
    else if (event.key === "End") apply(MAX);
    else if (event.key === "Enter") reset();
    else apply(width + (event.key === "ArrowLeft" ? STEP : -STEP));
  });
  desktop.addEventListener("change", () => splitter.setAttribute("aria-hidden", String(!desktop.matches)));
  splitter.setAttribute("aria-hidden", String(!desktop.matches));
  apply(width, { persist: false });
  return { reset, get width() { return width; } };
}
