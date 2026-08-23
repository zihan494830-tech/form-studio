import { t } from "/presentation/messages/zh-HK.mjs";

async function startDemoAuthor() {
  const profilesResponse = await fetch("/api/session/profiles");
  const profiles = await profilesResponse.json().catch(() => ({}));
  const author = profiles.profiles?.find((profile) => profile.role === "author");
  if (!profilesResponse.ok || !author) return null;
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: author.id }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok ? result.actor : null;
}

export async function requireAuthorSession() {
  const response = await fetch("/api/session");
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || t("ui.session.read_failed"));
  }
  const session = await response.json();
  if (session.mode === "local-demo" && session.actor?.role !== "author") {
    session.actor = await startDemoAuthor();
  }
  if (!session.actor) throw new Error(t("error.identity_required"));
  if (session.actor.role !== "author") throw new Error(t("error.role_required", { role: t("ui.session.role_author") }));
  return session;
}
