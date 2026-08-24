export function submissionSearchText(item) {
  return JSON.stringify({ id: item.id, submissionNumber: item.submissionNumber,
    receivedAt: item.receivedAt || item.submittedAt, releaseVersion: item.releaseVersion,
    fields: item.fields, management: item.management });
}

export function submissionReference(item, translate) {
  return Number.isInteger(item.submissionNumber)
    ? translate("ui.workbench.submission_number", { number: item.submissionNumber })
    : translate("ui.workbench.submission_record");
}

export function createSubmissionView({
  ledgerEl, bagEl, detailEl, recordCountEl, viewRecordCountEl, recordsSearchEl,
  statusFilterEl, archivedFilterEl, getAgent, submissionRecords, submissionLoadStates, refreshSubmissions, controlLabel,
  escapeHtml, locale, t, showError, confirmAction,
}) {
  let selectedId = null;
  let loadingId = null;
  let saving = false;
  const feedbackById = new Map();

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString(locale, { hour12: false });
  }
  async function body(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { error: `${t("ui.common.request_failed")} (${response.status})` }; }
  }
  function renderLedger(agent) {
    if (!agent?.ledger) {
      ledgerEl.innerHTML = `<span class="muted">${t("ui.workbench.no_ledger_fields")}</span>`;
      return;
    }
    ledgerEl.innerHTML = `<div class="ledger-meta"><code>${escapeHtml(agent.ledger.ownerAgent)}</code><span>${escapeHtml(agent.releaseVersion || t("ui.face.version_unavailable"))}</span></div>${agent.ledger.fields.map((field) =>
      `<div class="field-row"><div><strong>${escapeHtml(field.label)}</strong><code>${escapeHtml(field.id)}</code></div><span>${escapeHtml(controlLabel(field.control))}${field.required ? ` · ${t("ui.workbench.required")}` : ""}</span></div>`).join("")}`;
  }
  function filteredRecords(agent) {
    const all = submissionRecords.get(agent.id) || [];
    const query = recordsSearchEl.value.trim().toLocaleLowerCase(locale);
    const status = statusFilterEl.value;
    const includeArchived = archivedFilterEl.checked;
    return all.filter((item) => {
      if (!includeArchived && item.management?.archivedAt) return false;
      if (status && item.management?.status !== status) return false;
      return !query || submissionSearchText(item).toLocaleLowerCase(locale).includes(query);
    });
  }
  function statusLabel(status) {
    return ({ new: "新提交", in_review: "處理中", processed: "已處理" })[status] || status;
  }
  function loadState(agentId) {
    return submissionLoadStates.get(agentId) || { status: "idle", error: "" };
  }
  function countLabel(agentId, count) {
    const state = loadState(agentId);
    const hasSnapshot = submissionRecords.has(agentId);
    if (!hasSnapshot && (state.status === "idle" || state.status === "loading")) return t("ui.workbench.submissions_loading");
    if (!hasSnapshot && state.status === "error") return t("ui.workbench.submissions_update_failed");
    if (state.status === "error") return t("ui.workbench.record_count_stale", { count });
    if (state.status === "refreshing") return t("ui.workbench.record_count_refreshing", { count });
    return t("ui.workbench.record_count", { count });
  }
  function bindRetry(agentId) {
    bagEl.querySelector("[data-retry-submissions]")?.addEventListener("click", () => refreshSubmissions(agentId, { force: true }));
  }
  function renderList() {
    const agent = getAgent();
    if (!agent) {
      renderLedger(null); bagEl.innerHTML = ""; detailEl.innerHTML = ""; recordCountEl.textContent = "";
      viewRecordCountEl.textContent = "—";
      return;
    }
    renderLedger(agent);
    const all = submissionRecords.get(agent.id) || [];
    const records = filteredRecords(agent);
    const state = loadState(agent.id);
    const hasSnapshot = submissionRecords.has(agent.id);
    const currentCount = countLabel(agent.id, all.length);
    viewRecordCountEl.textContent = currentCount;
    recordCountEl.textContent = records.length === all.length ? currentCount : `${records.length}/${all.length}`;
    if (!hasSnapshot && (state.status === "idle" || state.status === "loading")) {
      selectedId = null;
      bagEl.innerHTML = `<div class="empty-state submission-loading-state" role="status"><span class="spinner" aria-hidden="true"></span><p>${escapeHtml(t("ui.workbench.submissions_loading_long"))}</p></div>`;
      detailEl.innerHTML = `<div class="submission-detail-empty"><h2>${escapeHtml(t("ui.workbench.submissions_loading"))}</h2><p>${escapeHtml(t("ui.workbench.submissions_loading_long"))}</p></div>`;
      return;
    }
    if (!hasSnapshot && state.status === "error") {
      selectedId = null;
      bagEl.innerHTML = `<div class="empty-state submission-load-error" role="alert"><p>${escapeHtml(t("ui.workbench.submissions_update_failed_long"))}</p><button type="button" data-retry-submissions>${escapeHtml(t("ui.common.retry"))}</button></div>`;
      detailEl.innerHTML = `<div class="submission-detail-empty"><h2>${escapeHtml(t("ui.workbench.submissions_update_failed"))}</h2><p>${escapeHtml(state.error || t("ui.workbench.submissions_update_failed_long"))}</p></div>`;
      bindRetry(agent.id);
      return;
    }
    if (!records.length) {
      selectedId = null;
      bagEl.innerHTML = `<div class="empty-state"><p>${escapeHtml(all.length ? t("ui.workbench.no_matching_records") : t("ui.workbench.no_submissions"))}</p>${agent.binding ? `<a class="primary-action" href="/a/${encodeURIComponent(agent.id)}" target="_blank" rel="noopener">打開填寫頁測試提交</a>` : ""}</div>`;
      detailEl.innerHTML = `<div class="submission-detail-empty"><h2>尚未選擇提交</h2><p>收到提交後，可在這裡管理狀態、備註和修正。</p></div>`;
      return;
    }
    if (!records.some((item) => item.id === selectedId)) selectedId = records[records.length - 1].id;
    const warning = state.status === "error" ? `<p class="submission-refresh-warning" role="status">${escapeHtml(t("ui.workbench.submissions_stale_warning"))}<button type="button" data-retry-submissions>${escapeHtml(t("ui.common.retry"))}</button></p>` : "";
    bagEl.innerHTML = warning + [...records].reverse().map((item) => `<button class="bag-item" type="button" data-submission-id="${escapeHtml(item.id)}" aria-current="${item.id === selectedId}">
      <span class="bag-head"><strong>${escapeHtml(submissionReference(item, t))}</strong><time datetime="${escapeHtml(item.receivedAt || "")}">${escapeHtml(formatTime(item.receivedAt))}</time></span>
      <span class="envelope-meta">${escapeHtml(item.actorName || t("ui.workbench.unknown_submitter"))} · ${escapeHtml(item.releaseVersion || t("ui.face.version_unavailable"))}</span>
      <span class="submission-status">${escapeHtml(statusLabel(item.management?.status || "new"))}${item.management?.archivedAt ? " · 已歸檔" : ""}</span>
    </button>`).join("");
    bindRetry(agent.id);
    bagEl.querySelectorAll("[data-submission-id]").forEach((button) => button.addEventListener("click", () => select(button.dataset.submissionId)));
    select(selectedId);
  }
  function answerRows(submission) {
    return submission.effectiveFields.map((field) => {
      const original = String(submission.originalValues[field.id] ?? "");
      const effective = String(field.value ?? "");
      const corrected = original !== effective;
      return `<div class="answer-row${corrected ? " corrected" : ""}"><strong>${escapeHtml(field.label)}</strong><code>${escapeHtml(field.id)}</code><span>${escapeHtml(effective || "—")}</span>${corrected ? `<small class="corrected-label">已修正 · 原值：${escapeHtml(original || "—")}</small>` : ""}</div>`;
    }).join("");
  }
  function correctionInput(field) {
    const value = escapeHtml(String(field.value ?? ""));
    if (field.control === "checkbox") return `<select data-correction-id="${escapeHtml(field.id)}"><option value="false"${value === "false" ? " selected" : ""}>否</option><option value="true"${value === "true" ? " selected" : ""}>是</option></select>`;
    if ((field.control === "select" || field.control === "radio") && field.options) {
      return `<select data-correction-id="${escapeHtml(field.id)}">${["", ...field.options].map((option) => `<option value="${escapeHtml(option)}"${String(option) === String(field.value) ? " selected" : ""}>${escapeHtml(option || "請選擇")}</option>`).join("")}</select>`;
    }
    const type = field.control === "number" ? "number" : "text";
    const step = field.control === "number" ? ` step="${10 ** -(field.decimals || 0)}"` : "";
    return `<input data-correction-id="${escapeHtml(field.id)}" type="${type}" value="${value}"${step} />`;
  }
  function renderDelivery(delivery) {
    const normalized = delivery || { status: "not_configured" };
    const status = normalized.status || "not_configured";
    const messages = {
      not_configured: [t("ui.workbench.delivery_not_configured"), t("ui.workbench.delivery_not_configured_help")],
      pending: [t("ui.workbench.delivery_pending"), t("ui.workbench.delivery_pending_help")],
      delivering: [t("ui.workbench.delivery_delivering"), t("ui.workbench.delivery_delivering_help")],
      delivered: [t("ui.workbench.delivery_delivered"), t("ui.workbench.delivery_delivered_help")],
      failed: [t("ui.workbench.delivery_failed"), t("ui.workbench.delivery_failed_help")],
      mapping_review_required: [t("ui.workbench.delivery_mapping_review"), t("ui.workbench.delivery_mapping_review_help")],
    };
    const [label, help] = messages[status] || [status, t("ui.workbench.delivery_unknown_help")];
    const target = typeof normalized.target === "object" ? normalized.target?.target : normalized.target;
    const transport = normalized.transport || (typeof normalized.target === "object" ? normalized.target?.kind : "");
    const receivedAt = normalized.receipt?.receivedAt;
    const meta = [
      target ? `<span><b>${escapeHtml(t("ui.workbench.delivery_target"))}</b>${escapeHtml(target)}</span>` : "",
      transport ? `<span><b>${escapeHtml(t("ui.workbench.delivery_transport"))}</b>${escapeHtml(transport)}</span>` : "",
      Number.isInteger(normalized.attempts) ? `<span><b>${escapeHtml(t("ui.workbench.delivery_attempts"))}</b>${normalized.attempts}</span>` : "",
      receivedAt ? `<span><b>${escapeHtml(t("ui.workbench.delivery_received_at"))}</b>${escapeHtml(formatTime(receivedAt))}</span>` : "",
    ].filter(Boolean).join("");
    return `<section class="delivery-card delivery-${escapeHtml(status)}" aria-labelledby="delivery-title"><div class="delivery-card-head"><div><div class="pane-label">Agent 投遞</div><h3 id="delivery-title">${escapeHtml(t("ui.workbench.delivery_title"))}</h3></div><span class="delivery-badge">${escapeHtml(label)}</span></div><p>${escapeHtml(help)}</p>${meta ? `<div class="delivery-meta">${meta}</div>` : ""}${normalized.lastError ? `<p class="delivery-error">${escapeHtml(normalized.lastError)}</p>` : ""}</section>`;
  }
  function renderDetail(submission) {
    const management = submission.management;
    const feedback = feedbackById.get(submission.id) || "";
    detailEl.innerHTML = `<div class="submission-detail-head"><div><div class="pane-label">提交詳情</div><h2>${escapeHtml(submission.id)}</h2><p>${escapeHtml(submission.releaseVersion || t("ui.face.version_unavailable"))} · ${escapeHtml(formatTime(submission.receivedAt))}</p></div></div>
      <section class="submission-detail-grid" aria-label="目前有效答案">${answerRows(submission)}</section>
      <details><summary>原始答案（永不覆蓋）</summary><pre>${escapeHtml(JSON.stringify(submission.originalValues, null, 2))}</pre></details>
      ${renderDelivery(submission.delivery)}
      <form id="submission-management-form" class="management-form"><h3>管理</h3>
        <label>狀態<select name="status"><option value="new">新提交</option><option value="in_review">處理中</option><option value="processed">已處理</option></select></label>
        <label>標籤（每行一個）<textarea name="tags">${escapeHtml((management.tags || []).join("\n"))}</textarea></label>
        <label>負責人（可選）<input name="assignee" value="${escapeHtml(management.assignee || "")}" /></label>
        <label>內部備註<textarea name="note" maxlength="4000">${escapeHtml(management.note || "")}</textarea></label>
        <div class="management-actions"><button class="primary" type="submit">儲存管理資料</button><button class="secondary-management" name="archive" type="button">${management.archivedAt ? "恢復提交" : "歸檔提交"}</button></div>${feedback ? `<p class="management-feedback" role="status">${escapeHtml(feedback)}</p>` : ""}</form>
      <details class="management-form"><summary>修正答案</summary><p>原始答案不會改寫；修正會保留原因與前後值。</p><form id="submission-correction-form">${submission.effectiveFields.map((field) => `<label>${escapeHtml(field.label)}${correctionInput(field)}</label>`).join("")}<label>修正原因<textarea name="reason" minlength="1" maxlength="500" required></textarea></label><button class="primary" type="submit">檢查並確認修正</button></form></details>
      <section class="correction-history"><h3>修正歷史</h3>${submission.corrections.length ? `<ol>${submission.corrections.map((item) => `<li><strong>${escapeHtml(item.reason)}</strong><span>${escapeHtml(formatTime(item.createdAt))} · ${escapeHtml(item.actorName)}</span><pre>${escapeHtml(JSON.stringify(item.changes, null, 2))}</pre></li>`).join("")}</ol>` : "<p class=\"muted\">尚無修正。</p>"}</section>`;
    detailEl.querySelector('[name="status"]').value = management.status;
    detailEl.querySelector("#submission-management-form").addEventListener("submit", (event) => saveManagement(event, submission));
    detailEl.querySelector('[name="archive"]').addEventListener("click", () => toggleArchive(submission));
    detailEl.querySelector("#submission-correction-form").addEventListener("submit", (event) => saveCorrection(event, submission));
  }
  async function select(id) {
    selectedId = id;
    bagEl.querySelectorAll("[data-submission-id]").forEach((button) => button.setAttribute("aria-current", String(button.dataset.submissionId === id)));
    if (loadingId === id) return;
    const agent = getAgent();
    if (!agent) return;
    loadingId = id;
    detailEl.innerHTML = `<p class="empty-state">正在讀取提交…</p>`;
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/submissions/${encodeURIComponent(id)}`);
      const result = await body(response);
      if (!response.ok) throw new Error(result.error || t("ui.common.read_failed"));
      if (selectedId === id) renderDetail(result.submission);
    } catch (error) {
      if (selectedId === id) detailEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message || t("ui.common.read_failed"))}</p>`;
    } finally { if (loadingId === id) loadingId = null; }
  }
  function setManagementBusy(busy) {
    detailEl.setAttribute("aria-busy", String(busy));
    detailEl.querySelectorAll("#submission-management-form button, #submission-management-form input, #submission-management-form select, #submission-management-form textarea, #submission-correction-form button, #submission-correction-form input, #submission-correction-form select, #submission-correction-form textarea")
      .forEach((control) => { control.disabled = busy; });
  }
  async function managementRequest(submission, path, options) {
    if (saving) return null;
    saving = true;
    setManagementBusy(true);
    showError("");
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(submission.ownerAgent)}/submissions/${encodeURIComponent(submission.id)}/${path}`, {
        ...options, headers: { "Content-Type": "application/json", "If-Match": `"submission-management-${submission.management.revision}"` },
      });
      const result = await body(response);
      if (!response.ok) throw new Error(result.error || t("ui.common.request_failed"));
      return result;
    } catch (error) {
      showError(error.message || t("ui.common.request_failed"));
      return null;
    } finally { saving = false; setManagementBusy(false); }
  }
  async function saveManagement(event, submission) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await managementRequest(submission, "management", { method: "PATCH", body: JSON.stringify({
      status: data.get("status"), note: data.get("note"), assignee: data.get("assignee"),
      tags: String(data.get("tags") || "").split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean),
    }) });
    if (result) {
      feedbackById.set(submission.id, t("ui.workbench.management_saved"));
      await refreshAfterChange(submission.ownerAgent, submission.id);
    }
  }
  async function toggleArchive(submission) {
    const result = await managementRequest(submission, "management", { method: "PATCH", body: JSON.stringify({ archived: !submission.management.archivedAt }) });
    if (result) {
      feedbackById.set(submission.id, t(submission.management.archivedAt ? "ui.workbench.submission_restored" : "ui.workbench.submission_archived"));
      await refreshAfterChange(submission.ownerAgent, submission.id);
    }
  }
  async function saveCorrection(event, submission) {
    event.preventDefault();
    const form = event.currentTarget;
    const changes = Object.fromEntries([...form.querySelectorAll("[data-correction-id]")]
      .map((input) => [input.dataset.correctionId, input.value])
      .filter(([id, value]) => String(submission.effectiveValues[id] ?? "") !== value));
    const reason = new FormData(form).get("reason");
    if (!Object.keys(changes).length) return showError("至少修改一個答案。");
    const confirmed = await confirmAction({ title: "確認修正答案？", body: `將修正 ${Object.keys(changes).length} 個欄位。原始答案仍會保留。`, confirmLabel: "確認修正" });
    if (!confirmed) return;
    const result = await managementRequest(submission, "corrections", { method: "POST", body: JSON.stringify({ reason, changes }) });
    if (result) {
      feedbackById.set(submission.id, t("ui.workbench.correction_saved"));
      await refreshAfterChange(submission.ownerAgent, submission.id);
    }
  }
  async function refreshAfterChange(ownerAgent, submissionId) {
    await refreshSubmissions(ownerAgent, { force: true });
    renderList();
    if (submissionId && filteredRecords(getAgent()).some((item) => item.id === submissionId)) await select(submissionId);
  }
  recordsSearchEl.addEventListener("input", renderList);
  statusFilterEl.addEventListener("change", renderList);
  archivedFilterEl.addEventListener("change", renderList);
  return { render: renderList, select };
}
