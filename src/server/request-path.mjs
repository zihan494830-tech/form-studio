export class InvalidPathEncodingError extends Error {}

export function decodePathComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InvalidPathEncodingError("URL 路径编码无效");
  }
}

export function agentIdFrom(pathname, suffix) {
  return decodePathComponent(pathname.slice("/api/agents/".length, pathname.length - suffix.length));
}
