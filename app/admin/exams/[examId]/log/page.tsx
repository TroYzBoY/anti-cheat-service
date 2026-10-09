import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/admin/auto-refresh";
import { LogTable } from "@/components/admin/log-table";
import { Card, headerButton, PageHeader, StatCard } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import {
  describeEntry,
  formatDuration,
  isLogCategory,
  LOG_CATEGORIES,
  LOG_CATEGORY_LABELS,
} from "@/lib/exam-activity";
import type { SessionQuestion } from "@/lib/exam-build";
import { loadLog } from "@/lib/exam-log";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Lines shown on the page; the CSV export has all of them. */
const PAGE_LIMIT = 1000;

const selectClass =
  "rounded-lg border border-white/10 bg-[#11131f] px-3 py-2 text-sm text-white focus:border-violet-400/60 focus:outline-none";

/** Every learner's log for one exam, newest first, filterable by learner and kind. */
export default async function ExamLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ session?: string | string[]; category?: string | string[] }>;
}) {
  await requireAdmin();
  const { examId } = await params;
  const query = await searchParams;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true },
  });
  if (!exam) notFound();

  const sessions = await prisma.examSession.findMany({
    where: { examId },
    orderBy: { user: { fullName: "asc" } },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      startedAt: true,
      questions: true,
      answerKey: true,
      user: { select: { fullName: true, email: true } },
    },
  });
  const selected = sessions.find((session) => session.id === query.session) ?? null;
  const category = isLogCategory(query.category) ? query.category : undefined;

  const [{ entries, truncated }, activityCounts, violationCount] = await Promise.all([
    loadLog({
      sessionWhere: selected ? { id: selected.id } : { examId },
      category,
      limit: PAGE_LIMIT,
    }),
    prisma.examActivity.groupBy({
      by: ["type"],
      where: { session: { examId } },
      _count: { _all: true },
    }),
    prisma.examIntegrityEvent.count({ where: { session: { examId } } }),
  ]);
  const countOf = (type: string) =>
    activityCounts.find((row) => row.type === type)?._count._all ?? 0;
  const totalLines =
    activityCounts.reduce((sum, row) => sum + row._count._all, 0) + violationCount;

  const bySession = new Map(sessions.map((session) => [session.id, session]));
  const lines = [...entries].reverse().map((entry) => {
    const session = bySession.get(entry.sessionId);
    return {
      entry,
      described: describeEntry(
        entry,
        session
          ? { questions: session.questions as SessionQuestion[], answerKey: session.answerKey }
          : null,
      ),
      offset: session ? formatDuration(entry.at.getTime() - session.startedAt.getTime()) : null,
      learner: session ? { name: session.user.fullName, sessionId: session.id } : undefined,
    };
  });

  const nowMs = new Date().getTime();
  const running = sessions.some(
    (session) => session.status === "ACTIVE" && session.expiresAt.getTime() >= nowMs,
  );

  return (
    <>
      {running ? <AutoRefresh intervalMs={15_000} /> : null}
      <Link href={`/admin/exams/${exam.id}/results`} className="text-sm text-white/55 hover:text-white">
        ← {exam.title} — үр дүн
      </Link>
      <PageHeader
        title="Шалгалтын лог"
        subtitle={`${exam.title} · оролцогч бүрийн шалгалт эхлүүлсэн, хариулт сонгосон, өөрчилсөн, зөрчил гаргасан, интернэт тасарсан, илгээсэн бүх үйлдэл цаг хугацааны дарааллаар.`}
        action={
          <a href={`/api/admin/exams/${exam.id}/export?kind=log`} className={headerButton}>
            ↓ Бүрэн лог (CSV)
          </a>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Нийт бүртгэл" value={totalLines} />
        <StatCard label="Хариулт сонгосон" value={countOf("answer")} tone="violet" />
        <StatCard label="Зөрчил" value={violationCount} tone={violationCount > 0 ? "bad" : "default"} />
        <StatCard label="Дахин нээсэн" value={countOf("resumed")} tone="warn" />
        <StatCard label="Интернэт тасарсан" value={countOf("offline")} tone="warn" />
        <StatCard label="Илгээсэн" value={countOf("submitted")} tone="good" />
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-white/50">
          Оролцогч
          <select name="session" defaultValue={selected?.id ?? ""} className={selectClass}>
            <option value="">Бүх оролцогч ({sessions.length})</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.user.fullName} — {session.user.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-white/50">
          Ангилал
          <select name="category" defaultValue={category ?? ""} className={selectClass}>
            <option value="">Бүгд</option>
            {LOG_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {LOG_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Шүүх
        </button>
        {selected || category ? (
          <Link href={`/admin/exams/${exam.id}/log`} className="py-2 text-sm text-white/55 hover:text-white">
            Цэвэрлэх
          </Link>
        ) : null}
        {selected ? (
          <Link
            href={`/admin/sessions/${selected.id}`}
            className="ml-auto py-2 text-sm font-semibold text-violet-300 hover:underline"
          >
            {selected.user.fullName}-ийн дэлгэрэнгүй →
          </Link>
        ) : null}
      </form>

      {truncated ? (
        <p className="text-[13px] text-amber-200/80">
          Сүүлийн {PAGE_LIMIT} бүртгэлийг харуулж байна. Бүгдийг нь «Бүрэн лог (CSV)»-оор татна уу.
        </p>
      ) : null}

      <Card>
        <LogTable
          lines={lines}
          empty={
            sessions.length === 0
              ? "Одоогоор хэн ч шалгалт өгөөгүй байна."
              : "Энэ шүүлтүүрт тохирох бүртгэл алга."
          }
        />
      </Card>
    </>
  );
}
