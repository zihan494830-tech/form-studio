import { t } from "/presentation/messages/zh-HK.mjs";

async function startDemoAuthor() {
  const profilesResponse = await fetch("/api/session/profiles?audience=authoring");
  const profiles = await profilesResponse.json().catch(() => ({}));
  const profile = profiles.profiles?.find((item) => item.id === profiles.defaultProfileId)
    || profiles.profiles?.find((item) => item.capabilities?.includes("form:author"));
  if (!profilesResponse.ok || !profile) return null;
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audience: "authoring", profileId: profile.id }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok ? result.actor : null;
}

export async function requireAuthorSession() {
  const response = await fetch("/api/session?audience=authoring");
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || t("ui.session.read_failed"));
  }
  const session = await response.json();
  if (session.mode === "local-demo" && !session.actor?.capabilities?.includes("form:author")) {
    session.actor = await startDemoAuthor();
  }
  if (!session.actor) throw new Error(t("error.identity_required"));
  if (!session.actor.capabilities?.includes("form:author")) throw new Error(t("error.capability_required", { capability: "form:author" }));
  return session;
}
