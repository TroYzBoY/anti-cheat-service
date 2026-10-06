import { describe, expect, it } from "vitest";

import {
  answerTokenToIndex,
  EXAM_IMPORT_TEMPLATE_CSV,
  parseCsv,
  parseQuestionRows,
  parseQuestionText,
} from "./exam-import";

describe("answerTokenToIndex", () => {
  it("reads Cyrillic, Latin and numeric labels", () => {
    expect(answerTokenToIndex("Б", 4)).toBe(1);
    expect(answerTokenToIndex("в", 4)).toBe(2);
    expect(answerTokenToIndex("B", 4)).toBe(1);
    expect(answerTokenToIndex("c)", 4)).toBe(2);
    expect(answerTokenToIndex("(4)", 4)).toBe(3);
    // Cyrillic С typed for a Latin C.
    expect(answerTokenToIndex("С", 4)).toBe(2);
  });

  it("rejects labels outside the choice range", () => {
    expect(answerTokenToIndex("Д", 4)).toBeNull();
    expect(answerTokenToIndex("5", 4)).toBeNull();
    expect(answerTokenToIndex("0", 4)).toBeNull();
    expect(answerTokenToIndex("maybe", 4)).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quotes, embedded commas and newlines", () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n"x\ny",z')).toEqual([
      ["a", "b, c", 'd "q"'],
      ["x\ny", "z"],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the Excel UTF-8 BOM", () => {
    expect(parseCsv("﻿Асуулт,Б")).toEqual([["Асуулт", "Б"]]);
  });
});

describe("parseQuestionRows", () => {
  it("imports the downloadable template", () => {
    const result = parseQuestionRows(parseCsv(EXAM_IMPORT_TEMPLATE_CSV));
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]).toEqual({
      prompt: "Монгол Улсын нийслэл аль нь вэ?",
      choices: ["Дархан", "Улаанбаатар", "Эрдэнэт", "Чойбалсан"],
      correctIndex: 1,
    });
    expect(result.questions[2].prompt).toContain("таслалтай");
  });

  it("prefers an exact choice match over a numeric label", () => {
    const result = parseQuestionRows([["2 x 2?", "1", "2", "4", "8", "4"]]);
    expect(result.questions[0].correctIndex).toBe(2);
  });

  it("accepts a starred choice without an answer column", () => {
    const result = parseQuestionRows([["Q?", "a", "*b", "c"]]);
    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toEqual({
      prompt: "Q?",
      choices: ["a", "b", "c"],
      correctIndex: 1,
    });
  });

  it("keeps Excel cell types and skips empty rows", () => {
    const result = parseQuestionRows([
      ["Question", "A", "B", "Answer"],
      [],
      ["10 / 4?", 2.5, 3, 1],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.questions).toEqual([
      { prompt: "10 / 4?", choices: ["2.5", "3"], correctIndex: 0 },
    ]);
  });

  it("reports rows it cannot use and keeps the rest", () => {
    const result = parseQuestionRows([
      ["Ok?", "yes", "no", "А"],
      ["No answer?", "yes", "no", "maybe"],
      ["Too short?", "yes"],
      ["Dup?", "same", "Same", "А"],
    ]);
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toMatch(/^2-р мөр/);
  });
});

describe("parseQuestionText", () => {
  it("reads numbered questions with starred and answer-line answers", () => {
    const result = parseQuestionText(`
1. Монгол Улсын нийслэл аль нь вэ?
А. Дархан
*Б. Улаанбаатар
В. Эрдэнэт

2) Д.Сүхбаатар хэдэн онд төрсөн бэ?
A) 1893
B) 1894
C) 1921
Хариулт: A
`);
    expect(result.errors).toEqual([]);
    expect(result.questions).toEqual([
      {
        prompt: "Монгол Улсын нийслэл аль нь вэ?",
        choices: ["Дархан", "Улаанбаатар", "Эрдэнэт"],
        correctIndex: 1,
      },
      {
        prompt: "Д.Сүхбаатар хэдэн онд төрсөн бэ?",
        choices: ["1893", "1894", "1921"],
        correctIndex: 0,
      },
    ]);
  });

  it("supports unnumbered questions, bullets and trailing markers", () => {
    const result = parseQuestionText(
      [
        "Аль нь өнгө вэ?",
        "- ширээ",
        "- улаан (зөв)",
        "Дараагийн асуулт",
        "үргэлжилсэн мөр?",
        "a. нэг",
        "b. хоёр ✓",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toEqual({
      prompt: "Аль нь өнгө вэ?",
      choices: ["ширээ", "улаан"],
      correctIndex: 1,
    });
    expect(result.questions[1]).toEqual({
      prompt: "Дараагийн асуулт\nүргэлжилсэн мөр?",
      choices: ["нэг", "хоёр"],
      correctIndex: 1,
    });
  });

  it("reports questions without a correct answer", () => {
    const result = parseQuestionText("1. Q?\nА. a\nБ. b\n2. R?\nА. x\n*Б. y");
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toEqual([
      "1-р асуулт (1-р мөр): зөв хариулт тодорхойгүй байна.",
    ]);
  });
});
