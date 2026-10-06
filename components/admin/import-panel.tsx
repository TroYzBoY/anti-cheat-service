"use client";

import { useState } from "react";

import { CHOICE_LABELS, type ExamDraftQuestion } from "@/lib/exam-forms";
import {
  EXAM_IMPORT_TEMPLATE_CSV,
  parseCsv,
  parseQuestionRows,
  parseQuestionText,
  type ImportResult,
} from "@/lib/exam-import";

type Tab = "file" | "text";

const TEXT_EXAMPLE = `1. Монгол Улсын нийслэл аль нь вэ?
А. Дархан
*Б. Улаанбаатар
В. Эрдэнэт

2. 2 + 2 = ?
А. 3
Б. 4
В. 5
Хариулт: Б`;

function downloadTemplate() {
  // The BOM makes Excel open the file as UTF-8 (Cyrillic intact).
  const blob = new Blob([`﻿${EXAM_IMPORT_TEMPLATE_CSV}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shalgalt-zagvar.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function parseFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return parseQuestionRows(await readSheet(file));
  }
  if (name.endsWith(".csv")) {
    return parseQuestionRows(parseCsv(await file.text()));
  }
  if (name.endsWith(".txt")) {
    return parseQuestionText(await file.text());
  }
  if (name.endsWith(".xls")) {
    return {
      questions: [],
      errors: ["Хуучин .xls формат дэмжигдэхгүй. Excel-ээс .xlsx эсвэл .csv болгож хадгална уу."],
    };
  }
  return {
    questions: [],
    errors: ["Зөвхөн .xlsx, .csv, .txt файл оруулна уу."],
  };
}

export function ImportPanel({
  onImport,
  onClose,
}: {
  onImport: (questions: ExamDraftQuestion[], mode: "append" | "replace") => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await parseFile(file));
    } catch {
      setResult({
        questions: [],
        errors: ["Файлыг уншиж чадсангүй. Файл эвдэрсэн эсвэл буруу форматтай байна."],
      });
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (value: Tab) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      tab === value
        ? "bg-violet-500/20 text-white ring-1 ring-violet-400/30"
        : "text-white/60 hover:text-white"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="Асуулт импортлох"
    >
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0d1020] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Асуулт импортлох</h2>
            <p className="mt-1 text-sm text-white/55">
              Файл таны компьютер дээр уншигдана. Шалгаад «Нэмэх» дарсны дараа л шалгалтад орно.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/[0.06] hover:text-white"
            aria-label="Хаах"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className={tabClass("file")} onClick={() => setTab("file")}>
            Excel / CSV файл
          </button>
          <button type="button" className={tabClass("text")} onClick={() => setTab("text")}>
            Текст буулгах
          </button>
        </div>

        {tab === "file" ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              <p>Мөр бүр нэг асуулт:</p>
              <p className="mt-2 font-mono text-[13px] text-white/85">
                Асуулт | Сонголт А | Сонголт Б | … | Зөв хариулт
              </p>
              <p className="mt-2">
                Зөв хариулт нь үсэг (А, Б, В… эсвэл A, B, C…), дугаар (1, 2, 3…) эсвэл сонголтын
                яг ижил текст байж болно. Эхний гарчиг мөр автоматаар алгасагдана.
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-[#a78bfa] hover:bg-white/[0.05]"
              >
                ↓ Загвар файл татах (.csv)
              </button>
            </div>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-white/70 hover:border-violet-400/40">
              <input
                type="file"
                accept=".xlsx,.csv,.txt"
                className="sr-only"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {busy ? "Уншиж байна…" : "Файл сонгох (.xlsx, .csv, .txt)"}
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={TEXT_EXAMPLE}
              rows={12}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 font-mono text-[13px] text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Сонголтыг «А.», «Б)» гэх мэтээр эхлүүлнэ. Зөв хариултын өмнө «*» тавих эсвэл
              сонголтуудын дараа «Хариулт: Б» гэж бичнэ.
            </p>
            <button
              type="button"
              onClick={() => setResult(parseQuestionText(text))}
              disabled={text.trim() === ""}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Шалгах
            </button>
          </div>
        )}

        {result ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-white">
              {result.questions.length} асуулт олдлоо
              {result.errors.length > 0 ? `, ${result.errors.length} алдаатай` : ""}.
            </p>
            {result.errors.length > 0 ? (
              <ul className="max-h-40 list-disc space-y-1 overflow-y-auto rounded-xl border border-amber-400/25 bg-amber-500/[0.07] py-3 pl-8 pr-3 text-[13px] text-amber-100">
                {result.errors.slice(0, 50).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            {result.questions.length > 0 ? (
              <ol className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[13px]">
                {result.questions.slice(0, 20).map((question, index) => (
                  <li key={index} className="text-white/80">
                    <span className="text-white/45">{index + 1}. </span>
                    {question.prompt}
                    <span className="ml-2 text-emerald-300">
                      ✓ {CHOICE_LABELS[question.correctIndex]}.{" "}
                      {question.choices[question.correctIndex]}
                    </span>
                  </li>
                ))}
                {result.questions.length > 20 ? (
                  <li className="text-white/45">… дахиад {result.questions.length - 20}</li>
                ) : null}
              </ol>
            ) : null}
            {result.questions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onImport(result.questions, "append")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                >
                  {result.questions.length} асуулт нэмэх
                </button>
                <button
                  type="button"
                  onClick={() => onImport(result.questions, "replace")}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.05]"
                >
                  Одоо байгаа асуултуудыг солих
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
