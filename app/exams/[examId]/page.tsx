import type { Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ExamRunner } from "@/components/exam-runner";
import { requireUser } from "@/lib/auth";
import { describeAttempt } from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Pinch-zoom is a known way to read hidden notes on mobile during exams. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const user = await requireUser(`/exams/${examId}`);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      durationMinutes: true,
      passPercent: true,
      requireSeb: true,
      sebConfigFileName: true,
      _count: { select: { items: true } },
      sessions: {
        where: { userId: user.id },
        select: {
          status: true,
          outcome: true,
          passed: true,
          scorePercent: true,
          expiresAt: true,
        },
      },
    },
  });
  // Admins can open drafts to try them; learners only see published exams.
  if (!exam || (exam.status !== "PUBLISHED" && user.role !== "ADMIN")) {
    notFound();
  }

  const attempt = exam.sessions[0];
  const view = attempt ? describeAttempt(attempt, new Date().getTime()) : null;

  if (attempt && view && !view.running) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-300">
            {view.label}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">{exam.title}</h1>
          {attempt.status === "SUBMITTED" && attempt.scorePercent !== null ? (
            <p className="mt-4 text-white/75">
              Таны оноо:{" "}
              <span className="text-3xl font-black text-white">{attempt.scorePercent}%</span>
            </p>
          ) : null}
          <p className="mt-4 text-sm text-white/55">
            Та энэ шалгалтыг өгсөн тул дахин өгөх боломжгүй.
          </p>
          <Link
            href="/exams"
            className="mt-6 inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
          >
            ← Шалгалтын жагсаалт руу буцах
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ExamRunner
      exam={{
        id: exam.id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        passPercent: exam.passPercent,
        questionCount: exam._count.items,
      }}
      seb={{ required: exam.requireSeb, hasConfigFile: Boolean(exam.sebConfigFileName) }}
      resumable={Boolean(view?.running)}
    />
  );
}
