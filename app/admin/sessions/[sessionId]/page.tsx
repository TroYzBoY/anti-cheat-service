import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, PageHeader, Pill, StatCard } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { UNANSWERED, type SessionQuestion } from "@/lib/exam-build";
import { CHOICE_LABELS, describeAttempt } from "@/lib/exam-forms";
import { VIOLATION_LABELS } from "@/lib/exam-results";
import { MAX_FOCUS_LOSSES } from "@/lib/policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("mn-MN", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Ulaanbaatar",
});

const EVENT_LABELS: Record<string, string> = {
  ...VIOLATION_LABELS,
  "focus-loss": "Цонхноос гарсан (focus)",
  "fullscreen-exit": "Fullscreen-ээс гарсан",
};

const REASON_LABELS: Record<string, string> = {
  "focus-loss-limit": `Цонхноос ${MAX_FOCUS_LOSSES} удаа гарсан`,
  "fullscreen-exit-limit": "Fullscreen-ээс хэт олон удаа гарсан",
  devtools: "Developer tools нээсэн",
  "duplicate-tab": "Давхар tab нээсэн",
  "fetch-mitm": "Сүлжээний API өөрчилсөн",
  "overlay-tampered": "Хуудсанд overlay/өөрчлөлт илэрсэн",
  screenshot: "Print Screen дарсан (дэлгэцийн зураг)",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireAdmin();
  const { sessionId } = await params;
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { fullName: true, email: true } },
      exam: { select: { id: true, title: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) notFound();

  const view = describeAttempt(session, new Date().getTime());
  const questions = session.questions as SessionQuestion[];
  const focusLosses = session.events.filter((event) => event.type === "focus-loss").length;

  return (
    <>
      <Link
        href={`/admin/exams/${session.exam.id}/results`}
        className="text-sm text-white/55 hover:text-white"
      >
        ← {session.exam.title} — үр дүн
      </Link>
      <PageHeader title={session.user.fullName} subtitle={session.user.email} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Төлөв</p>
          <div className="mt-3">
            <Pill tone={view.tone}>{view.label}</Pill>
          </div>
          {session.terminationReason ? (
            <p className="mt-2 text-[13px] text-rose-200">
              {REASON_LABELS[session.terminationReason] ?? session.terminationReason}
            </p>
          ) : null}
        </div>
        <StatCard
          label="Оноо"
          value={session.scorePercent === null ? "—" : `${session.scorePercent}%`}
          tone="violet"
        />
        <StatCard
          label="Зөв"
          value={session.correctCount === null ? "—" : `${session.correctCount}/${questions.length}`}
        />
        <StatCard
          label="Focus алдсан"
          value={`${focusLosses}/${MAX_FOCUS_LOSSES}`}
          tone={focusLosses >= MAX_FOCUS_LOSSES ? "bad" : focusLosses > 0 ? "warn" : "default"}
        />
      </section>

      <p className="text-[13px] text-white/50">
        Эхэлсэн: {timeFormat.format(session.startedAt)} · Дууссан:{" "}
        {session.submittedAt ? timeFormat.format(session.submittedAt) : "—"}
      </p>

      <h2 className="pt-2 text-lg font-semibold text-white">Зөрчлийн түүх</h2>
      <Card>
        {session.events.length === 0 ? (
          <p className="p-4 text-sm text-white/50">Зөрчил бүртгэгдээгүй.</p>
        ) : (
          <ol className="divide-y divide-white/[0.06]">
            {session.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-[12px] text-white/50">
                  {timeFormat.format(event.createdAt)}
                </span>
                <span className="font-medium text-white">{EVENT_LABELS[event.type] ?? event.type}</span>
                {event.metadata ? (
                  <span className="font-mono text-[11px] text-white/40">
                    {JSON.stringify(event.metadata)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <h2 className="pt-2 text-lg font-semibold text-white">Хариултууд</h2>
      <div className="space-y-3">
        {questions.map((question, index) => {
          const given = session.answers[index] ?? UNANSWERED;
          const correct = session.answerKey[index];
          return (
            <Card key={question.id}>
              <div className="p-4">
                <p className="whitespace-pre-wrap font-medium text-white">
                  <span className="mr-2 text-violet-300">{index + 1}.</span>
                  {question.prompt}
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {question.choices.map((choice, choiceIndex) => {
                    const isCorrect = choiceIndex === correct;
                    const isGiven = choiceIndex === given;
                    return (
                      <li
                        key={choiceIndex}
                        className={`rounded-lg px-3 py-1.5 ${
                          isCorrect
                            ? "bg-emerald-500/10 text-emerald-200"
                            : isGiven
                              ? "bg-rose-500/10 text-rose-200"
                              : "text-white/65"
                        }`}
                      >
                        {CHOICE_LABELS[choiceIndex]}. {choice}
                        {isGiven ? " ← сонгосон" : ""}
                        {isCorrect ? " ✓" : ""}
                      </li>
                    );
                  })}
                </ul>
                {session.status === "SUBMITTED" && given === UNANSWERED ? (
                  <p className="mt-2 text-xs text-amber-200">Хариулаагүй</p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
