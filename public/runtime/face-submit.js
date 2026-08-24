/**
 * 正式填写页：独立填写会话、稳定 submission intent、版本冲突恢复和 single-flight 提交。
 * 作者预览不会加载本模块；成功结果只由收件箱 API 读取，不跨窗口 postMessage。
 */
import { t } from "/presentation/messages/zh-HK.mjs";

(() => {
  const form = document.getElementById("agent-form");
  if (!form) return;

  const agentId = form.dataset.ownerAgent;
  const agentName = form.dataset.agentName || agentId;
  const formVersion = Number(form.dataset.formVersion || "0");
  const intentId = form.dataset.submissionIntentId || "";
  const demoMode = form.dataset.demoMode === "true";
  const receipt = document.getElementById("receipt");
  const errorSummary = document.getElementById("form-errors");
  const sessionPanel = document.getElementById("submission-session");
  const submitButton = form.querySelector("[type=submit]");
  const anotherButton = document.getElementById("submit-another");
  const draftKey = `form-studio:stale-draft:${agentId}`;
  let submitting = false;
  let submissionActor = null;

  function showReceipt(message, { error = false } = {}) {
    if (!receipt) return;
    receipt.textContent = message;
    receipt.classList.toggle("error", error);
    receipt.classList.add("show");
  }

  function hideReceipt() {
    if (!receipt) return;
    receipt.classList.remove("show", "error");
    receipt.textContent = "";
  }

  function setControlsDisabled(disabled) {
    for (const control of form.elements) {
      if (control === anotherButton) continue;
      control.disabled = disabled;
    }
    form.setAttribute("aria-busy", disabled && submitting ? "true" : "false");
  }

  function labelFor(control) {
    const radioLegend = control.closest(".field-radio")?.querySelector("legend");
    if (radioLegend) return radioLegend.textContent.replace(/\s*\*\s*/g, " ").trim();
    const labelledBy = (control.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    if (labelledBy.length) {
      return labelledBy.map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" / ").replace(/\s*\*\s*/g, " ").trim();
    }
    const legend = control.closest("fieldset")?.querySelector("legend");
    const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    return (legend?.textContent || label?.textContent || control.name).replace(/\s*\*\s*/g, " ").trim();
  }

  function messageFor(control) {
    const label = labelFor(control);
    if (control.validity.stepMismatch) return t("ui.face.error_step", { label });
    if (control.validity.badInput || control.validity.typeMismatch) return t("ui.face.error_number", { label });
    return t("ui.face.error_required", { label });
  }

  function clearValidation() {
    form.querySelectorAll("[aria-invalid=true]").forEach((control) => {
      control.removeAttribute("aria-invalid");
      const previous = control.dataset.previousDescribedBy;
      if (previous) control.setAttribute("aria-describedby", previous);
      else control.removeAttribute("aria-describedby");
      delete control.dataset.previousDescribedBy;
    });
    form.querySelectorAll("[data-error-for]").forEach((node) => { node.textContent = ""; });
    if (errorSummary) {
      errorSummary.hidden = true;
      errorSummary.replaceChildren();
    }
  }

  function showValidation() {
    clearValidation();
    const invalid = [];
    const seen = new Set();
    for (const control of form.elements) {
      if (!control.name || control.type === "submit" || control.validity.valid || seen.has(control.name)) continue;
      seen.add(control.name);
      invalid.push({ control, message: messageFor(control) });
    }
    if (!invalid.length) return true;
    for (const item of invalid) {
      const controls = [...form.elements].filter((control) => control.name === item.control.name);
      controls.forEach((control) => {
        control.dataset.previousDescribedBy = control.getAttribute("aria-describedby") || "";
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", `error-${item.control.name}`);
      });
      const local = [...form.querySelectorAll("[data-error-for]")].find((node) => node.dataset.errorFor === item.control.name);
      if (local) local.textContent = item.message;
    }
    if (errorSummary) {
      const title = document.createElement("h2");
      title.textContent = t("ui.face.error_summary_title");
      const list = document.createElement("ul");
      invalid.forEach(({ control, message }) => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${control.id}`;
        link.textContent = message;
        item.append(link);
        list.append(item);
      });
      errorSummary.append(title, list);
      errorSummary.hidden = false;
      errorSummary.focus();
    }
    invalid[0].control.focus({ preventScroll: false });
    return false;
  }

  function collectValues() {
    const values = {};
    for (const el of form.elements) {
      if (!el.name || el.type === "submit" || el === anotherButton) continue;
      if (el.type === "checkbox") values[el.name] = el.checked ? "true" : "false";
      else if (el.type === "radio") {
        if (el.checked) values[el.name] = String(el.value ?? "");
      } else values[el.name] = String(el.value ?? "");
    }
    return values;
  }

  function restoreCompatibleDraft() {
    let stored;
    try {
      stored = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      sessionStorage.removeItem(draftKey);
    } catch {
      stored = null;
    }
    if (!stored?.values || typeof stored.values !== "object") return;
    let restored = 0;
    for (const [name, raw] of Object.entries(stored.values)) {
      const controls = [...form.elements].filter((control) => control.name === name);
      if (!controls.length) continue;
      const value = String(raw ?? "");
      const first = controls[0];
      if (first.type === "checkbox") first.checked = value === "true";
      else if (first.type === "radio") {
        const match = controls.find((control) => control.value === value);
        if (!match) continue;
        match.checked = true;
      } else if (first.tagName === "SELECT") {
        if (![...first.options].some((option) => option.value === value)) continue;
        first.value = value;
      } else first.value = value;
      if (!first.validity.valid) {
        if (first.type === "checkbox" || first.type === "radio") controls.forEach((control) => { control.checked = false; });
        else first.value = "";
        continue;
      }
      restored += 1;
    }
    if (restored) showReceipt(t("ui.face.draft_restored", { count: restored }));
  }

  async function responseBody(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { error: `${t("ui.common.request_failed")} (${response.status})` }; }
  }

  function renderActor(actor) {
    submissionActor = actor;
    setControlsDisabled(!actor);
    if (!sessionPanel) return;
    sessionPanel.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = t("ui.face.current_submitter");
    const detail = document.createElement("p");
    detail.textContent = actor ? actor.name : t("ui.face.submitter_required");
    sessionPanel.append(heading, detail);
    if (actor && demoMode) {
      const options = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = t("ui.face.change_demo_identity");
      const change = document.createElement("button");
      change.type = "button";
      change.textContent = t("ui.face.choose_submitter");
      change.addEventListener("click", async () => {
        change.disabled = true;
        await fetch("/api/session?audience=submission", { method: "DELETE" }).catch(() => null);
        await chooseDemoActor({ forceChoice: true });
      });
      options.append(summary, change);
      sessionPanel.append(options);
    }
    sessionPanel.hidden = false;
  }

  async function chooseDemoActor({ forceChoice = false } = {}) {
    const response = await fetch("/api/session/profiles?audience=submission", { headers: { Accept: "application/json" } });
    const body = await responseBody(response);
    if (!response.ok) throw new Error(body.error || t("ui.common.request_failed"));
    if (body.defaultProfileId && !forceChoice) {
      const selected = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ audience: "submission", profileId: body.defaultProfileId }),
      });
      const result = await responseBody(selected);
      if (!selected.ok || !result.actor) throw new Error(result.error || t("ui.face.identity_unavailable"));
      renderActor(result.actor);
      return;
    }
    if (!sessionPanel) return;
    sessionPanel.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = t("ui.face.choose_submitter");
    const detail = document.createElement("p");
    detail.textContent = t("ui.face.choose_submitter_help");
    const select = document.createElement("select");
    select.setAttribute("aria-label", t("ui.face.choose_submitter"));
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = t("ui.face.select");
    select.append(blank);
    for (const profile of body.profiles || []) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      select.append(option);
    }
    const choose = document.createElement("button");
    choose.type = "button";
    choose.textContent = t("ui.face.confirm_submitter");
    choose.addEventListener("click", async () => {
      if (!select.value || choose.disabled) return;
      choose.disabled = true;
      choose.setAttribute("aria-busy", "true");
      try {
        const selected = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ audience: "submission", profileId: select.value }),
        });
        const result = await responseBody(selected);
        if (!selected.ok) throw new Error(result.error || t("ui.common.request_failed"));
        renderActor(result.actor);
      } catch (error) {
        showReceipt(error.message || t("ui.face.network_error"), { error: true });
        choose.disabled = false;
        choose.removeAttribute("aria-busy");
      }
    });
    sessionPanel.append(heading, detail, select, choose);
    sessionPanel.hidden = false;
    setControlsDisabled(true);
  }

  async function initializeIdentity() {
    setControlsDisabled(true);
    try {
      const response = await fetch("/api/session?audience=submission", { headers: { Accept: "application/json" } });
      const body = await responseBody(response);
      if (!response.ok) {
        showReceipt(body.error || t("ui.face.identity_unavailable"), { error: true });
        return;
      }
      if (body.actor) renderActor(body.actor);
      else if (demoMode) await chooseDemoActor();
      else showReceipt(t("ui.face.submitter_required"), { error: true });
    } catch {
      showReceipt(t("ui.face.network_error"), { error: true });
    }
  }

  function offerReloadLatest(values) {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ formVersion, values })); } catch { /* storage may be unavailable */ }
    setControlsDisabled(true);
    if (anotherButton) {
      anotherButton.hidden = false;
      anotherButton.textContent = t("ui.face.load_latest");
      anotherButton.disabled = false;
      anotherButton.focus();
    }
  }

  form.addEventListener("input", clearValidation);
  form.addEventListener("change", clearValidation);
  anotherButton?.addEventListener("click", () => location.reload());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || form.dataset.submitted === "true" || !submissionActor) return;
    if (!showValidation()) return;
    submitting = true;
    setControlsDisabled(true);
    if (submitButton) submitButton.textContent = t("ui.face.submitting");
    hideReceipt();
    const values = collectValues();

    try {
      const response = await fetch(`/submit/${encodeURIComponent(agentId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Idempotency-Key": intentId,
        },
        body: JSON.stringify({ values, formVersion }),
      });
      const result = await responseBody(response);
      if (!response.ok) {
        showReceipt(result.error || t("ui.face.submit_failed"), { error: true });
        if (response.status === 409 && result.errorCode === "form_version_conflict") {
          offerReloadLatest(values);
          return;
        }
        return;
      }
      form.dataset.submitted = "true";
      showReceipt(result.delivery?.status === "pending"
        ? t("ui.face.saved_pending", { agent: agentName })
        : t("ui.face.saved", { agent: agentName }));
      if (anotherButton) {
        anotherButton.hidden = false;
        anotherButton.textContent = t("ui.face.submit_another");
        anotherButton.disabled = false;
      }
    } catch {
      showReceipt(t("ui.face.network_error"), { error: true });
    } finally {
      submitting = false;
      form.removeAttribute("aria-busy");
      if (form.dataset.submitted !== "true" && anotherButton?.hidden !== false) setControlsDisabled(false);
      if (submitButton) submitButton.textContent = t("ui.face.submit");
    }
  });

  restoreCompatibleDraft();
  initializeIdentity();
})();
