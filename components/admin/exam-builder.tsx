"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { saveExamAction } from "@/app/admin/actions";
import { ImportPanel } from "@/components/admin/import-panel";
import {
  CHOICE_LABELS,
  describeDraftError,
  emptyQuestion,
  examDraftQuestionSchema,
  examDraftSchema,
  EXAM_STATUS_LABELS,
  EXAM_STATUSES,
  MAX_CHOICES,
  MAX_QUESTIONS,
  MIN_CHOICES,
  type ExamDraft,
  type ExamDraftQuestion,
  type ExamStatus,
} from "@/lib/exam-forms";

type BuilderQuestion = ExamDraftQuestion & { key: string };
type Meta = Omit<ExamDraft, "questions">;

function withKey(question: ExamDraftQuestion): BuilderQuestion {
  return { ...question, key: crypto.randomUUID() };
}

function isBlank(question: ExamDraftQuestion) {
  return (
    question.prompt.trim() === "" &&
    question.choices.every((choice) => choice.trim() === "")
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none";

export function ExamBuilder({
  examId,
  initialStatus,
  initialDraft,
  attemptCount,
}: {
  examId: string | null;
  initialStatus: ExamStatus;
  initialDraft: ExamDraft;
  attemptCount: number;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta>(() => ({
    title: initialDraft.title,
    description: initialDraft.description,
    durationMinutes: initialDraft.durationMinutes,
    passPercent: initialDraft.passPercent,
    shuffleQuestions: initialDraft.shuffleQuestions,
    shuffleChoices: initialDraft.shuffleChoices,
  }));
  const [questions, setQuestions] = useState<BuilderQuestion[]>(() =>
    (initialDraft.questions.length > 0
      ? initialDraft.questions
      : [emptyQuestion()]
    ).map(withKey),
  );
  const [status, setStatus] = useState<ExamStatus>(initialStatus);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setNotice(null);
  };

  const updateMeta = (patch: Partial<Meta>) => {
    setMeta((current) => ({ ...current, ...patch }));
    touch();
  };

  const updateQuestion = (
    key: string,
    update: (question: BuilderQuestion) => BuilderQuestion,
  ) => {
    setQuestions((current) =>
      current.map((question) => (question.key === key ? update(question) : question)),
    );
    touch();
  };

  const moveQuestion = (index: number, delta: -1 | 1) => {
    setQuestions((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    touch();
  };

  const duplicateQuestion = (index: number) => {
    setQuestions((current) => {
      if (current.length >= MAX_QUESTIONS) return current;
      const next = [...current];
      next.splice(index + 1, 0, withKey({ ...current[index], choices: [...current[index].choices] }));
      return next;
    });
    touch();
  };

  const removeQuestion = (key: string) => {
    setQuestions((current) => current.filter((question) => question.key !== key));
    touch();
  };

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((current) => [...current, withKey(emptyQuestion())]);
    touch();
  };

  const importQuestions = (imported: ExamDraftQuestion[], mode: "append" | "replace") => {
    setQuestions((current) => {
      const kept = mode === "replace" ? [] : current.filter((question) => !isBlank(question));
      return [...kept, ...imported.map(withKey)].slice(0, MAX_QUESTIONS);
    });
    setImportOpen(false);
    setDirty(true);
    setNotice({
      tone: "good",
      text: `${imported.length} асуулт нэмэгдлээ. «Хадгалах» дарж хадгална уу.`,
    });
  };

  const save = async () => {
    const draft: ExamDraft = {
      ...meta,
      questions: questions
        .filter((question) => !isBlank(question))
        .map(({ prompt, choices, correctIndex }) => ({ prompt, choices, correctIndex })),
    };
    const check = examDraftSchema.safeParse(draft);
    if (!check.success) {
      setNotice({ tone: "bad", text: describeDraftError(check.error) });
      return;
    }
    if (status === "PUBLISHED" && draft.questions.length === 0) {
      setNotice({ tone: "bad", text: "Нийтлэхийн тулд дор хаяж нэг асуулт нэмнэ үү." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const result = await saveExamAction({ examId, status, draft });
      if (!result.ok) {
        setNotice({ tone: "bad", text: result.error });
        return;
      }
      setDirty(false);
      setNotice({ tone: "good", text: "Хадгаллаа." });
      if (examId) router.refresh();
      else router.replace(`/admin/exams/${result.examId}`);
    } catch {
      setNotice({ tone: "bad", text: "Хадгалж чадсангүй. Дахин оролдоно уу." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {attemptCount > 0 ? (
        <p className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.07] p-4 text-sm text-sky-100">
          Энэ шалгалтыг {attemptCount} хүн эхлүүлсэн байна. Асуултыг өөрчилбөл зөвхөн шинээр
          эхлэх оролцогчдод нөлөөлнө — өмнөх үр дүн хэвээр үлдэнэ.
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 border-t-4 border-t-violet-500 bg-white/[0.03] p-5">
        <input
          value={meta.title}
          onChange={(event) => updateMeta({ title: event.target.value })}
          placeholder="Шалгалтын нэр"
          className="w-full border-b border-white/10 bg-transparent pb-2 text-2xl font-bold text-white placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
        />
        <textarea
          value={meta.description}
          onChange={(event) => updateMeta({ description: event.target.value })}
          placeholder="Тайлбар (заавал биш) — суралцагчид эхлэхээсээ өмнө харна"
          rows={2}
          className="mt-3 w-full resize-y border-b border-white/10 bg-transparent pb-2 text-white/80 placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none"
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-white/65">
            Хугацаа (минут)
            <input
              type="number"
              min={1}
              max={600}
              value={Number.isFinite(meta.durationMinutes) ? meta.durationMinutes : ""}
              onChange={(event) =>
                updateMeta({ durationMinutes: Number.parseInt(event.target.value, 10) })
              }
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm text-white/65">
            Тэнцэх хувь (%)
            <input
              type="number"
              min={0}
              max={100}
              value={Number.isFinite(meta.passPercent) ? meta.passPercent : ""}
              onChange={(event) =>
                updateMeta({ passPercent: Number.parseInt(event.target.value, 10) })
              }
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={meta.shuffleQuestions}
              onChange={(event) => updateMeta({ shuffleQuestions: event.target.checked })}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            Асуултын дарааллыг холих
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={meta.shuffleChoices}
              onChange={(event) => updateMeta({ shuffleChoices: event.target.checked })}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            Сонголтын дарааллыг холих
          </label>
        </div>
      </section>

      {questions.map((question, index) => {
        const check = isBlank(question)
          ? null
          : examDraftQuestionSchema.safeParse(question);
        const issue = check && !check.success ? check.error.issues[0]?.message : null;
        return (
          <section
            key={question.key}
            className={`rounded-2xl border bg-white/[0.03] p-5 ${
              issue ? "border-amber-400/30" : "border-white/10"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-2 w-7 shrink-0 text-right font-bold text-[#a78bfa]">
                {index + 1}.
              </span>
              <textarea
                value={question.prompt}
                onChange={(event) =>
                  updateQuestion(question.key, (current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                placeholder="Асуулт"
                rows={2}
                className={`resize-y ${inputClass}`}
              />
            </div>

            <div role="radiogroup" aria-label="Сонголтууд" className="mt-3 space-y-2 pl-10">
              {question.choices.map((choice, choiceIndex) => {
                const correct = question.correctIndex === choiceIndex;
                return (
                  <div key={choiceIndex} className="flex items-center gap-2">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={correct}
                      title="Зөв хариулт гэж тэмдэглэх"
                      onClick={() =>
                        updateQuestion(question.key, (current) => ({
                          ...current,
                          correctIndex: choiceIndex,
                        }))
                      }
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                        correct
                          ? "border-emerald-300 bg-emerald-500 text-white"
                          : "border-white/25 text-white/50 hover:border-emerald-300/60"
                      }`}
                    >
                      {correct ? "✓" : CHOICE_LABELS[choiceIndex]}
                    </button>
                    <input
                      value={choice}
                      onChange={(event) =>
                        updateQuestion(question.key, (current) => {
                          const choices = [...current.choices];
                          choices[choiceIndex] = event.target.value;
                          return { ...current, choices };
                        })
                      }
                      placeholder={`Сонголт ${CHOICE_LABELS[choiceIndex]}`}
                      className={`${inputClass} ${correct ? "border-emerald-400/40" : ""}`}
                    />
                    {question.choices.length > MIN_CHOICES ? (
                      <button
                        type="button"
                        aria-label="Сонголт устгах"
                        onClick={() =>
                          updateQuestion(question.key, (current) => ({
                            ...current,
                            choices: current.choices.filter((_, i) => i !== choiceIndex),
                            correctIndex:
                              current.correctIndex === choiceIndex
                                ? -1
                                : current.correctIndex > choiceIndex
                                  ? current.correctIndex - 1
                                  : current.correctIndex,
                          }))
                        }
                        className="shrink-0 rounded-lg px-2 py-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {question.choices.length < MAX_CHOICES ? (
                <button
                  type="button"
                  onClick={() =>
                    updateQuestion(question.key, (current) => ({
                      ...current,
                      choices: [...current.choices, ""],
                    }))
                  }
                  className="ml-8 text-sm text-[#a78bfa] hover:underline"
                >
                  + Сонголт нэмэх
                </button>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <p className={`text-xs ${issue ? "text-amber-200" : "text-white/40"}`}>
                {issue ??
                  (question.correctIndex >= 0
                    ? `Зөв хариулт: ${CHOICE_LABELS[question.correctIndex]}`
                    : "Дугуйг дарж зөв хариултыг сонгоно.")}
              </p>
              <div className="flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => moveQuestion(index, -1)}
                  disabled={index === 0}
                  className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  aria-label="Дээш"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(index, 1)}
                  disabled={index === questions.length - 1}
                  className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  aria-label="Доош"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => duplicateQuestion(index)}
                  className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/[0.06] hover:text-white"
                >
                  Хуулах
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(question.key)}
                  className="rounded-lg px-2 py-1 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
                >
                  Устгах
                </button>
              </div>
            </div>
          </section>
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={addQuestion}
          disabled={questions.length >= MAX_QUESTIONS}
          className="rounded-2xl border-2 border-dashed border-white/15 p-4 font-semibold text-white/75 hover:border-violet-400/40 hover:text-white disabled:opacity-40"
        >
          + Асуулт нэмэх
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-2xl border-2 border-dashed border-white/15 p-4 font-semibold text-white/75 hover:border-violet-400/40 hover:text-white"
        >
          ↑ Excel / CSV / текстээс импортлох
        </button>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0e18]/95 p-3 shadow-xl backdrop-blur">
        <span className="text-sm text-white/60">
          {questions.filter((question) => !isBlank(question)).length} асуулт
        </span>
        <label className="flex items-center gap-2 text-sm text-white/65">
          Төлөв
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ExamStatus);
              touch();
            }}
            className="rounded-lg border border-white/10 bg-[#11131f] px-2 py-1.5 text-white"
          >
            {EXAM_STATUSES.map((value) => (
              <option key={value} value={value}>
                {EXAM_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {notice ? (
          <span
            className={`text-sm ${notice.tone === "good" ? "text-emerald-300" : "text-rose-300"}`}
          >
            {notice.text}
          </span>
        ) : dirty ? (
          <span className="text-sm text-white/45">Хадгалаагүй өөрчлөлт байна</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {examId ? (
            <Link
              href={`/admin/exams/${examId}/results`}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.05]"
            >
              Үр дүн
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-[#7c3aed] px-5 py-2 text-sm font-bold text-white hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>
      </div>

      {importOpen ? (
        <ImportPanel onImport={importQuestions} onClose={() => setImportOpen(false)} />
      ) : null}
    </div>
  );
}
