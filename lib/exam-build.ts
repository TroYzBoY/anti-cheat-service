/**
 * Freezing an exam into one session's questions, and grading the answers.
 * Pure functions so they are trivially testable.
 */

export type ExamSourceItem = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
};

/** What the browser receives — never the answer. */
export type SessionQuestion = { id: string; prompt: string; choices: string[] };

export type BuiltSession = {
  questions: SessionQuestion[];
  /** Correct choice index per question, in session order. */
  answerKey: number[];
};

export const UNANSWERED = -1;

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32), seeded per session. */
function createRng(seed: string): () => number {
  let t = hashSeed(seed) + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * Copy the exam's items (already in builder order) into a session,
 * optionally shuffling question and choice order per session.
 */
export function buildExamSession(
  items: ExamSourceItem[],
  seed: string,
  options: { shuffleQuestions: boolean; shuffleChoices: boolean },
): BuiltSession {
  if (items.length === 0) throw new Error("This exam has no questions.");

  const rng = createRng(seed);
  const ordered = [...items];
  if (options.shuffleQuestions) shuffleInPlace(ordered, rng);

  const questions: SessionQuestion[] = [];
  const answerKey: number[] = [];
  for (const item of ordered) {
    const order = item.choices.map((_, index) => index);
    if (options.shuffleChoices) shuffleInPlace(order, rng);
    questions.push({
      id: item.id,
      prompt: item.prompt,
      choices: order.map((index) => item.choices[index]),
    });
    answerKey.push(order.indexOf(item.correctIndex));
  }
  return { questions, answerKey };
}

export function gradeAnswers(
  answerKey: number[],
  answers: number[],
): { correct: number; total: number; scorePercent: number } {
  const total = answerKey.length;
  const correct = answerKey.filter((key, index) => answers[index] === key).length;
  const scorePercent = total === 0 ? 0 : Math.round((correct * 100) / total);
  return { correct, total, scorePercent };
}
