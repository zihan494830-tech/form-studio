/**
 * 把表上的值封成交接信封。键是字段 id，不是中文标签。
 */
export function makeEnvelope({ ownerAgent, formVersion, submitterId, values }) {
  return {
    ownerAgent,
    formVersion: Number(formVersion) || 1,
    submittedAt: new Date().toISOString(),
    submitterId: submitterId || "student-mock-1",
    values: { ...values },
  };
}
