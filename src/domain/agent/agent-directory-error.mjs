/** 标准化外部 agent 目录失败；provider 细节不得泄漏进账本或提交信封。 */
export class AgentDirectoryError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "AgentDirectoryError";
    this.code = code;
    this.status = status;
  }
}
