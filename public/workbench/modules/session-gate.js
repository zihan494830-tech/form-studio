export async function requireAuthorSession() {
  const response = await fetch("/api/session");
  if (!response.ok) throw new Error("无法读取当前身份");
  const session = await response.json();
  if (!session.actor) {
    location.assign("/session?next=/");
    return null;
  }
  if (session.actor.role === "teacher") {
    location.assign("/classroom");
    return null;
  }
  if (session.actor.role !== "author") {
    location.assign("/session?next=/");
    return null;
  }
  return session;
}
