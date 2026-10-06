import { describe, expect, it } from "vitest";

import { buildExamSession, gradeAnswers, UNANSWERED } from "./exam-build";
import { describeAttempt, examDraftQuestionSchema } from "./exam-forms";

const items = Array.from({ length: 12 }, (_, i) => ({
  id: `item-${i}`,
  prompt: `Question ${i}`,
  choices: ["a", "b", "c", "d", "e"].map((letter) => `${letter}${i}`),
  correctIndex: i % 5,
}));

describe("buildExamSession", () => {
  it("keeps builder order and answers when nothing is shuffled", () => {
    const built = buildExamSession(items, "session-1", {
      shuffleQuestions: false,
      shuffleChoices: false,
    });
    expect(built.questions.map((q) => q.id)).toEqual(items.map((item) => item.id));
    expect(built.answerKey).toEqual(items.map((item) => item.correctIndex));
    expect(JSON.stringify(built.questions)).not.toContain("correctIndex");
  });

  it("shuffles per session but the key still points at the right choice", () => {
    const built = buildExamSession(items, "session-2", {
      shuffleQuestions: true,
      shuffleChoices: true,
    });
    expect(built.questions.map((q) => q.id)).not.toEqual(items.map((item) => item.id));
    built.questions.forEach((question, index) => {
      const source = items.find((item) => item.id === question.id)!;
      expect(question.choices[built.answerKey[index]]).toBe(
        source.choices[source.correctIndex],
      );
      expect([...question.choices].sort()).toEqual([...source.choices].sort());
    });
    expect(gradeAnswers(built.answerKey, built.answerKey).scorePercent).toBe(100);
    const blank = built.answerKey.map(() => UNANSWERED);
    expect(gradeAnswers(built.answerKey, blank)).toEqual({
      correct: 0,
      total: 12,
      scorePercent: 0,
    });
  });

  it("is deterministic per seed and refuses an empty exam", () => {
    const options = { shuffleQuestions: true, shuffleChoices: true };
    expect(buildExamSession(items, "same", options)).toEqual(
      buildExamSession(items, "same", options),
    );
    expect(() => buildExamSession([], "s", options)).toThrow();
  });
});

describe("gradeAnswers", () => {
  it("rounds the percentage and treats missing answers as wrong", () => {
    expect(gradeAnswers([1, 1, 2], [1, UNANSWERED, 2])).toEqual({
      correct: 2,
      total: 3,
      scorePercent: 67,
    });
    expect(gradeAnswers([0, 0], [])).toMatchObject({ correct: 0 });
  });
});

describe("examDraftQuestionSchema", () => {
  it("requires a chosen, in-range answer and distinct choices", () => {
    const base = { prompt: "Q?", choices: ["a", "b"], correctIndex: 1 };
    expect(examDraftQuestionSchema.safeParse(base).success).toBe(true);
    expect(examDraftQuestionSchema.safeParse({ ...base, correctIndex: -1 }).success).toBe(false);
    expect(examDraftQuestionSchema.safeParse({ ...base, correctIndex: 2 }).success).toBe(false);
    expect(
      examDraftQuestionSchema.safeParse({ ...base, choices: ["a", " A "] }).success,
    ).toBe(false);
    expect(examDraftQuestionSchema.safeParse({ ...base, choices: ["a"] }).success).toBe(false);
  });
});

describe("describeAttempt", () => {
  const expiresAt = new Date("2026-01-01T10:00:00Z");
  const before = expiresAt.getTime() - 1000;
  const after = expiresAt.getTime() + 1000;

  it("labels every attempt state", () => {
    const base = { passed: null, expiresAt, outcome: null };
    expect(describeAttempt({ ...base, status: "ACTIVE" }, before)).toMatchObject({
      running: true,
      tone: "info",
    });
    expect(describeAttempt({ ...base, status: "ACTIVE" }, after)).toMatchObject({
      running: false,
      label: "Хугацаа дууссан",
    });
    expect(
      describeAttempt({ ...base, status: "SUBMITTED", passed: true }, after).label,
    ).toBe("Тэнцсэн");
    expect(
      describeAttempt({ ...base, status: "TERMINATED", outcome: "BANNED" }, after),
    ).toMatchObject({ label: "Хасагдсан (ban)", tone: "bad" });
  });
});
