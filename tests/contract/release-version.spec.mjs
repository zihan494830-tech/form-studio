import { expect, test } from "@playwright/test";
import { changeFields, newBornFormAgent, publishForm, unpublishForm } from "../../src/domain/agent/form-agent.mjs";
import { currentReleaseVersion, releaseHistory, releaseVersionForFormVersion } from "../../src/domain/form/published-definition.mjs";

function agent(versions, current = versions.at(-1)) {
  return {
    publishedDefinitions: versions.map((formVersion) => ({ formVersion, fields: [{ id: "answer", label: String(formVersion), control: "text", required: false }] })),
    published: current ? { formVersion: current, fields: [{ id: "answer", label: String(current), control: "text", required: false }] } : null,
  };
}

test("发布展示版本只按可证明的不同定义递增", () => {
  expect(releaseHistory(agent([1, 9]))).toEqual([
    { formVersion: 1, releaseVersion: "v1.0" },
    { formVersion: 9, releaseVersion: "v1.1" },
  ]);
  expect(currentReleaseVersion(agent([1, 9]))).toBe("v1.1");
});

test("v1.9 后得到 v1.10，同定义重发不增加标签", () => {
  const history = releaseHistory(agent([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]));
  expect(history.at(-1)).toEqual({ formVersion: 21, releaseVersion: "v1.10" });
  expect(releaseVersionForFormVersion(agent([1, 9, 9]), 9)).toBe("v1.1");
});

test("未知历史定义不猜测发布标签", () => {
  expect(releaseVersionForFormVersion(agent([7, 9]), 8)).toBeNull();
});

test("下架后原样重发不升级，新定义成功发布才升级", () => {
  let current = newBornFormAgent({ id: "release-proof", name: "发布证明" });
  current = changeFields(current, [
    { id: "answer", label: "答案", control: "text", required: false },
  ]).agent;
  current = publishForm(current).agent;
  expect(currentReleaseVersion(current)).toBe("v1.0");

  current = unpublishForm(current).agent;
  current = publishForm(current).agent;
  expect(releaseHistory(current)).toHaveLength(1);
  expect(currentReleaseVersion(current)).toBe("v1.0");

  current = changeFields(current, [
    { id: "answer", label: "更新后的答案", control: "text", required: false },
  ]).agent;
  current = publishForm(current).agent;
  expect(currentReleaseVersion(current)).toBe("v1.1");
});
