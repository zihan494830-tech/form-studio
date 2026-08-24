import { problem } from "../domain/problem.mjs";

export function revisionEtag(prefix, revision) {
  return `"${prefix}-${Number(revision) || 1}"`;
}

export function readIfMatchRevision(req, prefix) {
  const raw = req.headers["if-match"];
  if (!raw) return problem("precondition_required", 428);
  const match = new RegExp(`^"${prefix}-(\\d+)"$`).exec(String(raw).trim());
  return match ? { revision: Number(match[1]) } : problem("if_match_invalid", 400);
}
