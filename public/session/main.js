const profileList = document.getElementById("profile-list");
const errorEl = document.getElementById("session-error");
const currentEl = document.getElementById("current-session");
const params = new URLSearchParams(location.search);
const requestedNext = params.get("next") || "";

const roleText = { author: "作者", teacher: "老师", student: "学生" };
const roleDescription = {
  author: "设计、预览并发布用户页面",
  teacher: "查看获授权页面收到的学生提交",
  student: "填写老师提供的已发布用户页面",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[char]);
}

function safeNext(actor) {
  if (requestedNext.startsWith("/a/") && actor.role === "student") return requestedNext;
  if (actor.role === "author") return "/";
  if (actor.role === "teacher") return "/classroom";
  return "";
}

function showCurrent(actor) {
  if (!actor) return;
  currentEl.hidden = false;
  currentEl.innerHTML = `当前是 <strong>${escapeHtml(actor.name || actor.id)}</strong>（${escapeHtml(roleText[actor.role] || actor.role)}）`;
}

async function choose(profileId, button) {
  errorEl.hidden = true;
  button.disabled = true;
  button.textContent = "正在切换…";
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "无法选择身份");
    const next = safeNext(result.actor);
    if (next) location.assign(next);
    else {
      showCurrent(result.actor);
      errorEl.textContent = "学生身份已就绪。请打开老师提供的已发布用户页面链接。";
      errorEl.className = "error info";
      errorEl.hidden = false;
      button.disabled = false;
      button.textContent = "已选择";
    }
  } catch (error) {
    errorEl.className = "error";
    errorEl.textContent = error.message || "切换失败，请重试。";
    errorEl.hidden = false;
    button.disabled = false;
    button.textContent = "选择";
  }
}

async function init() {
  try {
    const [sessionResponse, profilesResponse] = await Promise.all([
      fetch("/api/session"), fetch("/api/session/profiles"),
    ]);
    const session = await sessionResponse.json();
    const profiles = await profilesResponse.json();
    showCurrent(session.actor);
    if (!profilesResponse.ok || !profiles.profiles?.length) throw new Error("没有可用的本地演示身份");
    profileList.innerHTML = profiles.profiles.map((profile) => `
      <article class="profile">
        <div><span>${escapeHtml(roleText[profile.role] || profile.role)}</span>
          <strong>${escapeHtml(profile.name)}</strong>
          <p>${escapeHtml(roleDescription[profile.role] || "进入对应本地流程")}</p></div>
        <button type="button" data-profile-id="${escapeHtml(profile.id)}">选择</button>
      </article>`).join("");
  } catch (error) {
    profileList.innerHTML = `<p class="state error">${escapeHtml(error.message || "读取失败，请刷新重试。")}</p>`;
  }
}

profileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile-id]");
  if (button) choose(button.dataset.profileId, button);
});

init();
