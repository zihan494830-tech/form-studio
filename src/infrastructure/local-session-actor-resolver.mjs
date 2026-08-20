import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const COOKIE = "form_studio_session";

function cookieValue(req, name) {
  const source = String(req.headers.cookie || "");
  for (const part of source.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function createLocalSessionActorResolver({ configPath }) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const profiles = new Map(config.profiles.map((profile) => [profile.id, profile]));
  const sessions = new Map();

  function actorFrom(profile) {
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      verifiedBy: "local-demo-session",
      scope: { tenantId: config.tenantId, classId: config.classId },
    };
  }

  return {
    mode: "local-demo",
    resolve(req) {
      const sessionId = cookieValue(req, COOKIE);
      const profileId = sessionId ? sessions.get(sessionId) : null;
      return profileId && profiles.has(profileId) ? actorFrom(profiles.get(profileId)) : null;
    },
    listProfiles() {
      return [...profiles.values()].map(({ id, name, role }) => ({ id, name, role }));
    },
    startSession(profileId, res) {
      const profile = profiles.get(String(profileId || ""));
      if (!profile) return null;
      const sessionId = randomUUID();
      sessions.set(sessionId, profile.id);
      res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return actorFrom(profile);
    },
    endSession(req, res) {
      const sessionId = cookieValue(req, COOKIE);
      if (sessionId) sessions.delete(sessionId);
      res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    },
    defaultAgentAccess() {
      return {
        tenantId: config.tenantId,
        classId: config.classId,
        authorIds: [...profiles.values()].filter((item) => item.role === "author").map((item) => item.id),
        teacherIds: [...profiles.values()].filter((item) => item.role === "teacher").map((item) => item.id),
      };
    },
    classroom: { tenantId: config.tenantId, classId: config.classId, name: config.className },
  };
}
