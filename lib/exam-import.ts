/**
 * Turns spreadsheets and pasted text into exam-builder questions. Pure
 * functions: the builder runs them in the browser, so an imported file never
 * reaches the server until the admin reviews it and presses Save.
 *
 * Table layout (Excel / CSV), one question per row:
 *
 *   Асуулт | Сонголт А | Сонголт Б | … | Зөв хариулт
 *
 * The last filled cell is the answer: the exact text of a choice, a letter
 * (А/Б/В… or A/B/C…) or a number (1, 2, 3…). Alternatively mark the correct
 * choice with a leading `*` and leave the answer column out.
 *
 * Text layout (pasted from Word / Notepad):
 *
 *   1. Монгол Улсын нийслэл аль нь вэ?
 *   А. Дархан
 *   *Б. Улаанбаатар
 *   В. Эрдэнэт
 *
 * or put `Хариулт: Б` on the line after the choices.
 */
import {
  examDraftQuestionSchema,
  MAX_CHOICES,
  type ExamDraftQuestion,
} from "@/lib/exam-forms";

export type ImportResult = {
  questions: ExamDraftQuestion[];
  errors: string[];
};

const CYRILLIC_LABELS = "АБВГДЕЖЗ";
const LATIN_LABELS = "ABCDEFGH";
/** Cyrillic look-alikes of Latin labels that are not Cyrillic labels themselves. */
const CYRILLIC_HOMOGLYPHS: Record<string, number> = { С: 2 };

export const EXAM_IMPORT_TEMPLATE_CSV = [
  "Асуулт,Сонголт А,Сонголт Б,Сонголт В,Сонголт Г,Зөв хариулт",
  "Монгол Улсын нийслэл аль нь вэ?,Дархан,Улаанбаатар,Эрдэнэт,Чойбалсан,Б",
  "2 + 2 = ?,3,4,5,22,Б",
  '"Аль нь сондгой тоо вэ? (таслалтай текстийг хашилтад бичнэ)",2,4,7,10,В',
].join("\r\n");

/** "Б", "b", "2", "(2)" → 1. Null when the token isn't a choice label. */
export function answerTokenToIndex(
  token: string,
  choiceCount: number,
): number | null {
  const cleaned = token
    .trim()
    .replace(/^[([]+/, "")
    .replace(/[.)\]:]+$/, "")
    .trim();
  let index: number | null = null;

  if (/^\d+$/.test(cleaned)) {
    index = Number(cleaned) - 1;
  } else if (cleaned.length === 1) {
    const upper = cleaned.toUpperCase();
    const cyrillic = CYRILLIC_LABELS.indexOf(upper);
    const latin = LATIN_LABELS.indexOf(upper);
    if (cyrillic !== -1) index = cyrillic;
    else if (latin !== -1) index = latin;
    else if (upper in CYRILLIC_HOMOGLYPHS) index = CYRILLIC_HOMOGLYPHS[upper];
  }

  return index !== null && index >= 0 && index < choiceCount ? index : null;
}

/** Exact choice text first (so a choice literally named "4" wins), then a label. */
function resolveAnswer(answer: string, choices: string[]): number | null {
  const wanted = answer.trim().toLowerCase();
  const byText = choices.findIndex(
    (choice) => choice.trim().toLowerCase() === wanted,
  );
  if (byText !== -1) return byText;
  return answerTokenToIndex(answer, choices.length);
}

const CORRECT_SUFFIX = /\s*(?:\*|✓|✔|\((?:зөв|correct)\)|\[x\])\s*$/i;

/** Strips a leading `*` or a trailing `*` / ✓ / (зөв) marker. */
function extractCorrectMark(text: string): { text: string; marked: boolean } {
  let value = text.trim();
  let marked = false;
  if (value.startsWith("*")) {
    value = value.slice(1).trim();
    marked = true;
  }
  if (CORRECT_SUFFIX.test(value)) {
    value = value.replace(CORRECT_SUFFIX, "").trim();
    marked = true;
  }
  return { text: value, marked };
}

/** Validates one candidate and returns either the question or an error. */
function finishQuestion(
  candidate: { prompt: string; choices: string[]; correctIndex: number | null },
  label: string,
): { question: ExamDraftQuestion } | { error: string } {
  if (candidate.choices.length > MAX_CHOICES) {
    return { error: `${label}: ${MAX_CHOICES}-аас олон сонголттой байна.` };
  }
  if (candidate.correctIndex === null) {
    return { error: `${label}: зөв хариулт тодорхойгүй байна.` };
  }
  const parsed = examDraftQuestionSchema.safeParse(candidate);
  if (!parsed.success) {
    return { error: `${label}: ${parsed.error.issues[0]?.message ?? "буруу өгөгдөл."}` };
  }
  return { question: parsed.data };
}

// ── Tables (CSV / Excel) ──────────────────────────────────────────────────

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).replace(/ /g, " ").trim();
}

const HEADER_FIRST_CELL = /^(?:асуулт(?:ын текст|ууд)?|question(?:s)?|№|#)$/i;
const HEADER_LAST_CELL =
  /^(?:зөв(?: хариулт)?|хариулт|answer|correct(?: answer)?)$/i;

export function parseQuestionRows(rows: readonly (readonly unknown[])[]): ImportResult {
  const questions: ExamDraftQuestion[] = [];
  const errors: string[] = [];
  let sawContent = false;

  rows.forEach((row, rowIndex) => {
    const cells = row.map(cellToString).filter((cell) => cell !== "");
    if (cells.length === 0) return;

    const isFirstContentRow = !sawContent;
    sawContent = true;
    if (
      isFirstContentRow &&
      (HEADER_FIRST_CELL.test(cells[0]) ||
        HEADER_LAST_CELL.test(cells[cells.length - 1]))
    ) {
      return;
    }

    const label = `${rowIndex + 1}-р мөр`;
    const [prompt, ...rest] = cells;
    const marks = rest.map(extractCorrectMark);
    const markedIndexes = marks.flatMap((mark, index) => (mark.marked ? [index] : []));

    let choices: string[];
    let correctIndex: number | null;
    if (markedIndexes.length > 1) {
      errors.push(`${label}: нэгээс олон зөв хариулт тэмдэглэгдсэн байна.`);
      return;
    } else if (markedIndexes.length === 1) {
      choices = marks.map((mark) => mark.text);
      correctIndex = markedIndexes[0];
    } else {
      if (rest.length < 3) {
        errors.push(`${label}: сонголт эсвэл зөв хариулт дутуу байна.`);
        return;
      }
      choices = rest.slice(0, -1);
      correctIndex = resolveAnswer(rest[rest.length - 1], choices);
    }

    const result = finishQuestion({ prompt, choices, correctIndex }, label);
    if ("error" in result) errors.push(result.error);
    else questions.push(result.question);
  });

  return { questions, errors };
}

function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "\n") break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ",";
  for (const [delimiter, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = delimiter;
  }
  return best;
}

/** RFC 4180 CSV with `,`, `;` (European Excel) or tab, auto-detected. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── Pasted text ───────────────────────────────────────────────────────────

const NUMBERED_QUESTION = /^(?:\d+\s*[.)]|(?:асуулт|question)\s*\d*\s*[:.)])\s*(.*)$/i;
const LETTERED_OPTION =
  /^(\*?)\s*([A-Ha-hА-За-з])\s*(?:\.\s+|\)\s*)(.*)$/;
const BULLET_OPTION = /^[-•–]\s+(.*)$/;
const ANSWER_LINE =
  /^(?:зөв\s*хариулт|хариулт|answer|correct(?:\s*answer)?|ans)\s*[:：=–-]\s*(.+)$/i;

type TextCandidate = {
  promptLines: string[];
  choices: string[];
  marked: number[];
  answer: string | null;
  line: number;
};

export function parseQuestionText(text: string): ImportResult {
  const questions: ExamDraftQuestion[] = [];
  const errors: string[] = [];
  let current: TextCandidate | null = null;

  const flush = () => {
    if (!current) return;
    const candidate = current;
    current = null;
    const label = `${questions.length + errors.length + 1}-р асуулт (${candidate.line}-р мөр)`;
    const prompt = candidate.promptLines.join("\n").trim();

    let correctIndex: number | null = null;
    if (candidate.marked.length > 1) {
      errors.push(`${label}: нэгээс олон зөв хариулт тэмдэглэгдсэн байна.`);
      return;
    } else if (candidate.marked.length === 1) {
      correctIndex = candidate.marked[0];
    } else if (candidate.answer !== null) {
      correctIndex = resolveAnswer(candidate.answer, candidate.choices);
    }

    if (candidate.choices.length === 0) {
      errors.push(`${label}: сонголт олдсонгүй.`);
      return;
    }
    const result = finishQuestion(
      { prompt, choices: candidate.choices, correctIndex },
      label,
    );
    if ("error" in result) errors.push(result.error);
    else questions.push(result.question);
  };

  const start = (promptLine: string, line: number) => {
    flush();
    current = { promptLines: [promptLine], choices: [], marked: [], answer: null, line };
  };

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/ /g, " ").trim();
    const lineNumber = index + 1;
    if (line === "") return;

    const answer = ANSWER_LINE.exec(line);
    if (answer && current) {
      current.answer = answer[1].trim();
      return;
    }

    const numbered = NUMBERED_QUESTION.exec(line);
    if (numbered) {
      start(numbered[1], lineNumber);
      return;
    }

    if (current && current.promptLines.join("").trim() !== "") {
      const lettered = LETTERED_OPTION.exec(line);
      const bullet = lettered ? null : BULLET_OPTION.exec(line);
      if (lettered || bullet) {
        const raw = lettered ? `${lettered[1]}${lettered[3]}` : bullet![1];
        const mark = extractCorrectMark(raw);
        if (mark.marked) current.marked.push(current.choices.length);
        current.choices.push(mark.text);
        return;
      }
      if (current.choices.length === 0) {
        current.promptLines.push(line);
        return;
      }
    }

    if (current && current.promptLines.join("").trim() === "") {
      current.promptLines.push(line);
      return;
    }
    start(line, lineNumber);
  });
  flush();

  return { questions, errors };
}
