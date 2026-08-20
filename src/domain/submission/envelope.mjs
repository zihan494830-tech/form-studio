/**
 * 把表上的值封成交接信封。键是字段 id，不是中文标签。
 */
export function makeEnvelope({ ownerAgent, formVersion, submitterId, values, now = () => new Date().toISOString() }) {
  if (!submitterId) throw new TypeError("提交信封缺少已验证填写人");
  return {
    ownerAgent,
    formVersion: Number(formVersion) || 1,
    submittedAt: now(),
    submitterId: String(submitterId),
    values: { ...values },
  };
}
