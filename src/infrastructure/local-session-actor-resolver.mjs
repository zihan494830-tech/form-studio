import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { FORM_AUTHOR, SUBMISSION_CREATE, SUBMISSION_MANAGE, SUBMISSION_READ } from "../domain/access/capabilities.mjs";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIES = Object.freeze({
  authoring: "form_studio_authoring_session",
  submission: "form_studio_submission_session",
});

function cookieValue(req, name) {
  const source = String(req.headers.cookie || "");
  for (const part of source.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function createLocalSessionActorResolver({ configPath }) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const profiles = new Map(config.profiles.map((profile) => [profile.id, profile]));
  const sessions = new Map();

  function capabilitiesFor(profile) {
    if (profile.role === "author") return [FORM_AUTHOR, SUBMISSION_READ, SUBMISSION_MANAGE];
    if (profile.role === "teacher") return [SUBMISSION_READ];
    if (profile.role === "student") return [SUBMISSION_CREATE];
    return [];
  }

  function actorFrom(profile) {
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      verifiedBy: "local-demo-session",
      capabilities: capabilitiesFor(profile),
      scope: { tenantId: config.tenantId, attributes: { classId: config.classId }, classId: config.classId },
    };
  }

  function audienceOf(value) {
    return value === "submission" ? "submission" : "authoring";
  }

  function allows(profile, audience) {
    const capabilities = capabilitiesFor(profile);
    return audience === "submission"
      ? capabilities.includes(SUBMISSION_CREATE)
      : capabilities.includes(FORM_AUTHOR) || capabilities.includes(SUBMISSION_READ);
  }

  function prune(at = Date.now()) {
    for (const [sessionId, session] of sessions) {
      if (session.expiresAt <= at) sessions.delete(sessionId);
    }
  }

  return {
    mode: "local-demo",
    resolve(req, { audience = "authoring" } = {}) {
      prune();
      const selectedAudience = audienceOf(audience);
      const sessionId = cookieValue(req, COOKIES[selectedAudience]);
      const profileId = sessionId ? sessions.get(sessionId)?.profileId : null;
      return profileId && profiles.has(profileId) ? actorFrom(profiles.get(profileId)) : null;
    },
    listProfiles({ audience = "authoring" } = {}) {
      const selectedAudience = audienceOf(audience);
      return [...profiles.values()]
        .filter((profile) => allows(profile, selectedAudience))
        .map(({ id, name, role }) => ({ id, name, role, capabilities: capabilitiesFor({ role }) }));
    },
    defaultProfileId({ audience = "authoring" } = {}) {
      const selectedAudience = audienceOf(audience);
      const configured = selectedAudience === "submission"
        ? config.defaults?.submissionProfileId
        : config.defaults?.authoringProfileId;
      if (configured && profiles.has(configured) && allows(profiles.get(configured), selectedAudience)) return configured;
      return [...profiles.values()].find((profile) => allows(profile, selectedAudience))?.id || null;
    },
    startSession(profileId, res, { audience = "authoring" } = {}) {
      prune();
      const selectedAudience = audienceOf(audience);
      const profile = profiles.get(String(profileId || ""));
      if (!profile || !allows(profile, selectedAudience)) return null;
      const sessionId = randomUUID();
      sessions.set(sessionId, { profileId: profile.id, expiresAt: Date.now() + SESSION_TTL_MS });
      res.setHeader("Set-Cookie", `${COOKIES[selectedAudience]}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return actorFrom(profile);
    },
    endSession(req, res, { audience = "authoring" } = {}) {
      const selectedAudience = audienceOf(audience);
      const sessionId = cookieValue(req, COOKIES[selectedAudience]);
      if (sessionId) sessions.delete(sessionId);
      res.setHeader("Set-Cookie", `${COOKIES[selectedAudience]}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
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
