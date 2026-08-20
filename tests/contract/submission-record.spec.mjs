import { expect, test } from "@playwright/test";
import { makeSubmissionRecord } from "../../src/domain/submission/submission-record.mjs";

const envelope = {
  ownerAgent: "exercise-1",
  formVersion: 2,
  submittedAt: "2026-08-20T10:00:00.000Z",
  submitterId: "student-1",
  values: { answer: "甲" },
};

test("submission-record/v1 原样包住提交信封", () => {
  const record = makeSubmissionRecord({
    id: "submission-1",
    ownerAgent: "exercise-1",
    receivedAt: "2026-08-20T10:00:01.000Z",
    envelope,
  });
  expect(record).toEqual({
    version: "submission-record/v1",
    id: "submission-1",
    ownerAgent: "exercise-1",
    receivedAt: "2026-08-20T10:00:01.000Z",
    actor: null,
    scope: null,
    envelope,
  });
});

test("submission record 拒绝主人和信封错配", () => {
  expect(() => makeSubmissionRecord({
    id: "submission-1",
    ownerAgent: "exercise-2",
    receivedAt: "2026-08-20T10:00:01.000Z",
    envelope,
  })).toThrow("主人与信封不一致");
});
