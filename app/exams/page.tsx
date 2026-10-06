import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { describeAttempt, type AttemptTone } from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Шалгалтууд" };

const TONE_CLASSES: Record<AttemptTone, string> = {
  info: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  good: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  warn: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  bad: "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

export default async function ExamListPage() {
  const user = await requireUser("/exams");
  const exams = await prisma.exam.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      passPercent: true,
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
  const now = new Date().getTime();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold text-white">Шалгалтууд</h1>
      <p className="mt-2 text-white/65">
        Шалгалт бүрийг зөвхөн нэг удаа өгөх боломжтой. Эхлэхээс өмнө дүрмийг сайн уншаарай.
      </p>

      {exams.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-white/60">
          Одоогоор нээлттэй шалгалт алга байна.
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {exams.map((exam) => {
            const attempt = exam.sessions[0];
            const view = attempt ? describeAttempt(attempt, now) : null;
            const canEnter = !attempt || view?.running;
            return (
              <li
                key={exam.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-white">{exam.title}</h2>
                  {view ? (
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[view.tone]}`}
                    >
                      {view.label}
                    </span>
                  ) : null}
                </div>
                {exam.description ? (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-white/65">
                    {exam.description}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-white/55">
                  {exam._count.items} асуулт · {exam.durationMinutes} минут · Тэнцэх{" "}
                  {exam.passPercent}%
                </p>
                <div className="mt-auto pt-4">
                  {canEnter ? (
                    <Link
                      href={`/exams/${exam.id}`}
                      className="inline-flex w-full justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 font-bold text-white hover:brightness-110"
                    >
                      {attempt ? "Үргэлжлүүлэх" : "Эхлэх"}
                    </Link>
                  ) : attempt?.status === "SUBMITTED" && attempt.scorePercent !== null ? (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center text-sm text-white/75">
                      Таны оноо:{" "}
                      <span className="font-bold text-white">{attempt.scorePercent}%</span>
                    </p>
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center text-sm text-white/55">
                      Дахин өгөх боломжгүй
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
