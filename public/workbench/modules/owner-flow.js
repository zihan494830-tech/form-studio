import { escapeHtml } from "/workbench/modules/form-model.js";

const $ = (id) => document.getElementById(id);

export function createOwnerFlow({ onCreated }) {
  const choice = $("path-choice"), retrofit = $("retrofit-flow"), born = $("born-flow");
  const retrofitStart = $("retrofit-start"), bornStart = $("born-start");
  const identityId = $("identity-id"), identityButton = $("identity-check-btn");
  const identityResult = $("identity-result"), authorizationStep = $("authorization-step");
  const authorizationConfirm = $("authorization-confirm"), createRetrofit = $("create-retrofit-btn");
  const newName = $("new-name"), createBorn = $("create-btn"), bornStatus = $("born-status");
  let verifiedIdentity = null;

  function setPanel(panel) {
    choice.hidden = panel !== "choice";
    retrofit.hidden = panel !== "retrofit";
    born.hidden = panel !== "born";
    retrofitStart.setAttribute("aria-expanded", String(panel === "retrofit"));
    bornStart.setAttribute("aria-expanded", String(panel === "born"));
    const target = panel === "retrofit" ? identityId : panel === "born" ? newName : retrofitStart;
    queueMicrotask(() => target.focus());
  }

  function resetIdentity() {
    verifiedIdentity = null;
    identityResult.dataset.state = "idle";
    identityResult.textContent = "";
    authorizationStep.hidden = true;
    authorizationConfirm.checked = false;
    createRetrofit.disabled = true;
  }

  function showChoice() {
    resetIdentity();
    bornStatus.textContent = "";
    setPanel("choice");
  }

  function renderIdentity(identity) {
    verifiedIdentity = identity;
    const blocked = identity.official;
    identityResult.dataset.state = blocked ? "blocked" : "verified";
    identityResult.innerHTML = `<div class="identity-card">
      <div><span class="context-label">候选主人</span><strong>${escapeHtml(identity.name)}</strong></div>
      <span class="identity-state ${blocked ? "blocked" : "eligible"}">${blocked ? "Official · 仅可核对" : "可继续确认权限"}</span>
      <dl><div><dt>ownerAgent:</dt><dd>${escapeHtml(identity.ownerAgent)}</dd></div>
      <div><dt>来源:</dt><dd>Poffices · 只读</dd></div></dl>
      ${blocked ? "<p><strong>身份信息已读取完整。</strong>但这是 Poffices 官方 agent，当前没有可验证的改装授权，所以 Form Studio 不会创建本地绑定。</p>" : ""}
    </div>`;
    authorizationStep.hidden = blocked;
    if (!blocked) authorizationConfirm.focus();
  }

  async function checkIdentity() {
    const id = identityId.value.trim();
    resetIdentity();
    identityButton.disabled = true;
    identityResult.dataset.state = "loading";
    identityResult.textContent = "正在只读查找 agent…";
    try {
      const response = await fetch(`/api/owner-identities/poffices/${encodeURIComponent(id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "无法核对这个 agent");
      renderIdentity(result.identity);
    } catch (error) {
      identityResult.dataset.state = "error";
      identityResult.textContent = error.message || "无法核对这个 agent";
    } finally {
      identityButton.disabled = false;
    }
  }

  async function createRetrofitWorkspace() {
    if (!verifiedIdentity || !authorizationConfirm.checked) return;
    createRetrofit.disabled = true;
    identityResult.dataset.state = "loading";
    identityResult.textContent = "正在创建本地设计工作区…";
    try {
      const response = await fetch("/api/retrofits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAgent: verifiedIdentity.ownerAgent, authorizationConfirmed: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || "无法创建本地工作区");
      onCreated(result);
    } catch (error) {
      identityResult.dataset.state = "error";
      identityResult.textContent = error.message || "无法创建本地工作区";
      createRetrofit.disabled = false;
    }
  }

  async function createBornWorkspace() {
    createBorn.disabled = true;
    bornStatus.textContent = "正在创建…";
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "无法新建 agent form");
      newName.value = "";
      bornStatus.textContent = "";
      onCreated(result);
    } catch (error) {
      bornStatus.textContent = error.message || "无法新建 agent form";
    } finally {
      createBorn.disabled = false;
    }
  }

  retrofitStart.addEventListener("click", () => setPanel("retrofit"));
  bornStart.addEventListener("click", () => setPanel("born"));
  document.querySelectorAll("[data-back-to-paths]").forEach((button) => button.addEventListener("click", showChoice));
  identityButton.addEventListener("click", checkIdentity);
  identityId.addEventListener("keydown", (event) => { if (event.key === "Enter") checkIdentity(); });
  authorizationConfirm.addEventListener("change", () => {
    createRetrofit.disabled = !authorizationConfirm.checked || !verifiedIdentity;
  });
  createRetrofit.addEventListener("click", createRetrofitWorkspace);
  createBorn.addEventListener("click", createBornWorkspace);
  newName.addEventListener("keydown", (event) => { if (event.key === "Enter") createBornWorkspace(); });

  return { showChoice };
}
