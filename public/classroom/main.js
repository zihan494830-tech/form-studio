const pageList = document.getElementById("page-list");
const submissionList = document.getElementById("submission-list");
const detailEl = document.getElementById("submission-detail");
const recordsTitle = document.getElementById("records-title");
const actorFilter = document.getElementById("actor-filter");
let selectedAgent = "";
let selectedRecord = "";
let loadSequence = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[char]);
}

function timeText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || "")
    : date.toLocaleString("zh-CN", { hour12: false });
}

async function json(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) {
    location.assign(`/session?next=${encodeURIComponent("/classroom")}`);
    throw new Error("需要老师身份");
  }
  if (!response.ok) throw new Error(body.error || "读取失败，请重试。");
  return body;
}

function setActive(selector, id) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button.dataset.id === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function loadDetail(id) {
  selectedRecord = id;
  setActive(".submission-button", id);
  detailEl.innerHTML = `<p class="state">正在读取提交详情…</p>`;
  try {
    const { record } = await json(`/api/teacher/submissions/${encodeURIComponent(id)}`);
    if (selectedRecord !== id) return;
    const deliveryLabels = {
      pending: "等待投递", delivering: "正在投递", delivered: "已送达本地 AgentInputPort",
      failed: "投递失败，将重试", not_configured: "未配置 agent 输入端口",
    };
    detailEl.innerHTML = `<div class="detail-meta">
      <strong>${escapeHtml(record.actorName)}${record.actorName === record.actorId ? "" : ` <code>${escapeHtml(record.actorId)}</code>`}</strong>
      <time datetime="${escapeHtml(record.receivedAt)}">${escapeHtml(timeText(record.receivedAt))}</time>
      <span>${escapeHtml(record.pageName)} · 表 v${escapeHtml(record.formVersion)}</span>
      <span class="delivery-status ${escapeHtml(record.delivery.status)}">${escapeHtml(deliveryLabels[record.delivery.status] || record.delivery.status)}${record.delivery.target ? ` · ${escapeHtml(record.delivery.target)}` : ""}</span>
    </div><dl>${record.fields.map((field) => `<div><dt>${escapeHtml(field.label)}<code>${escapeHtml(field.id)}</code></dt><dd>${escapeHtml(field.displayValue) || "（空）"}</dd></div>`).join("")}</dl>`;
  } catch (error) {
    detailEl.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadSubmissions(agentId) {
  const sequence = ++loadSequence;
  selectedAgent = agentId;
  selectedRecord = "";
  setActive(".page-button", agentId);
  actorFilter.disabled = false;
  submissionList.innerHTML = `<p class="state">正在读取提交…</p>`;
  detailEl.innerHTML = `<p class="state">选择一条提交查看按字段 ID 对齐的内容。</p>`;
  const query = actorFilter.value.trim();
  try {
    const result = await json(`/api/teacher/agents/${encodeURIComponent(agentId)}/submissions${query ? `?actorId=${encodeURIComponent(query)}` : ""}`);
    if (sequence !== loadSequence) return;
    recordsTitle.textContent = result.page.name;
    document.getElementById("records-context").textContent = `${result.records.length} 条提交 · ownerAgent ${result.page.ownerAgent} · 已发布 v${result.page.formVersion}`;
    submissionList.innerHTML = result.records.length ? result.records.map((record) => `
      <button class="submission-button" type="button" data-id="${escapeHtml(record.id)}" aria-pressed="false">
        <span><strong>${escapeHtml(record.actorName)}</strong><small>${record.actorName === record.actorId ? "" : `${escapeHtml(record.actorId)} · `}${escapeHtml(record.id)} · ${escapeHtml(record.fieldCount)} 个字段</small></span>
        <time datetime="${escapeHtml(record.receivedAt)}">${escapeHtml(timeText(record.receivedAt))}</time>
      </button>`).join("") : `<p class="state empty">${query ? "没有这个学生的提交。" : "这个页面还没有学生提交。"}</p>`;
  } catch (error) {
    if (sequence === loadSequence) submissionList.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

async function init() {
  try {
    const session = await json("/api/session");
    if (session.actor?.role !== "teacher") return location.assign("/session?next=/classroom");
    document.getElementById("actor-name").textContent = session.actor.name || session.actor.id;
    document.getElementById("classroom-name").textContent = session.classroom?.name || session.actor.scope.classId;
    const { agents } = await json("/api/teacher/agents");
    document.getElementById("page-count").textContent = `${agents.length} 个`;
    pageList.innerHTML = agents.length ? agents.map((agent) => `
      <button class="page-button" type="button" data-id="${escapeHtml(agent.ownerAgent)}" aria-pressed="false">
        <span><strong>${escapeHtml(agent.name)}</strong><small>ownerAgent ${escapeHtml(agent.ownerAgent)} · v${escapeHtml(agent.formVersion)}</small></span>
        <b>${escapeHtml(agent.submissionCount)}</b>
      </button>`).join("") : `<p class="state empty">当前班级还没有已发布且授权给你的用户页面。</p>`;
    if (agents[0]) loadSubmissions(agents[0].ownerAgent);
  } catch (error) {
    pageList.innerHTML = `<p class="state error">${escapeHtml(error.message)}</p>`;
  }
}

pageList.addEventListener("click", (event) => {
  const button = event.target.closest(".page-button");
  if (button) loadSubmissions(button.dataset.id);
});
submissionList.addEventListener("click", (event) => {
  const button = event.target.closest(".submission-button");
  if (button) loadDetail(button.dataset.id);
});
actorFilter.addEventListener("input", () => {
  clearTimeout(actorFilter._timer);
  actorFilter._timer = setTimeout(() => selectedAgent && loadSubmissions(selectedAgent), 220);
});

init();
