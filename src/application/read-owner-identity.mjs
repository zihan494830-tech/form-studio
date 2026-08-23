import { AgentDirectoryError } from "../domain/agent/agent-directory-error.mjs";
import { problem } from "../domain/problem.mjs";

/** 2A 用例：读取一个候选主人；不保存、不绑定、不发布。 */
export async function readOwnerIdentity(directory, id) {
  if (!directory) {
    return problem("identity_not_configured", 503);
  }
  try {
    return { status: 200, identity: await directory.getById(id) };
  } catch (error) {
    if (error instanceof AgentDirectoryError) {
      return problem(error.code, error.status);
    }
    return problem("upstream_error", 502);
  }
}
