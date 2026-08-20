import { AgentDirectoryError } from "../domain/agent/agent-directory-error.mjs";

/** 2A 用例：读取一个候选主人；不保存、不绑定、不发布。 */
export async function readOwnerIdentity(directory, id) {
  if (!directory) {
    return { status: 503, error: "identity_not_configured", message: "真实身份读取器未配置" };
  }
  try {
    return { status: 200, identity: await directory.getById(id) };
  } catch (error) {
    if (error instanceof AgentDirectoryError) {
      return { status: error.status, error: error.code, message: error.message };
    }
    return { status: 502, error: "upstream_error", message: "真实身份读取失败" };
  }
}
