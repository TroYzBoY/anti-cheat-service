import Link from "next/link";
import { notFound } from "next/navigation";

import { resetAttemptAction } from "@/app/admin/actions";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import {
  Card,
  EmptyState,
  PageHeader,
  Pill,
  smallButton,
  StatCard,
} from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { EXAM_STATUS_LABELS, isExamStatus } from "@/lib/exam-forms";
import { loadExamResults, VIOLATION_LABELS } from "@/lib/exam-results";
import { MAX_FOCUS_LOSSES } from "@/lib/policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("mn-MN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ulaanbaatar",
});

function focusClass(count: number) {
  if (count >= MAX_FOCUS_LOSSES) return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  if (count > 0) return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-white/60";
}

export default async function ExamResultsPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  await requireAdmin();
  const { examId } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      status: true,
      passPercent: true,
      durationMinutes: true,
      _count: { select: { items: true } },
    },
  });
  if (!exam) notFound();

  const { rows, stats } = await loadExamResults(exam.id, new Date().getTime());
  const status = isExamStatus(exam.status) ? exam.status : "DRAFT";

  return (
    <>
      {stats.running > 0 ? <AutoRefresh intervalMs={15_000} /> : null}
      <Link href="/admin" className="text-sm text-white/55 hover:text-white">
        ← Шалгалтууд
      </Link>
      <PageHeader
        title={exam.title}
        subtitle={`${EXAM_STATUS_LABELS[status]} · ${exam._count.items} асуулт · ${exam.durationMinutes} минут · тэнцэх ${exam.passPercent}%`}
        action={
          <>
            <Link
              href={`/admin/exams/${exam.id}`}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/[0.08] hover:text-white"
            >
              Засах
            </Link>
            <a
              href={`/api/admin/exams/${exam.id}/export`}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/[0.08] hover:text-white"
            >
              ↓ Excel (CSV)
            </a>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Оролцогч" value={stats.participants} />
        <StatCard label="Одоо өгч байна" value={stats.running} tone="info" />
        <StatCard label="Дууссан" value={stats.submitted} />
        <StatCard label="Тэнцсэн" value={stats.passed} tone="good" />
        <StatCard label="Хасагдсан" value={stats.banned} tone="bad" />
        <StatCard
          label="Дундаж оноо"
          value={stats.averageScore === null ? "—" : `${stats.averageScore}%`}
          tone="violet"
        />
      </section>

      {stats.running > 0 ? (
        <p className="text-[13px] text-white/45">
          Шалгалт явагдаж байгаа тул хуудас 15 секунд тутам шинэчлэгдэнэ.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Одоогоор хэн ч өгөөгүй байна"
          description={
            status === "PUBLISHED"
              ? "Суралцагчид шалгалтаа эхлүүлмэгц энд харагдана."
              : "Шалгалтыг нийтэлсний дараа суралцагчид өгөх боломжтой болно."
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Оролцогч</th>
                  <th className="px-4 py-3 font-medium">Төлөв</th>
                  <th className="px-4 py-3 text-right font-medium">Оноо</th>
                  <th className="px-4 py-3 font-medium">Focus алдсан</th>
                  <th className="px-4 py-3 font-medium">Бусад зөрчил</th>
                  <th className="px-4 py-3 font-medium">Эхэлсэн</th>
                  <th className="px-4 py-3 font-medium">Дууссан</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const other = Object.entries(row.otherViolations);
                  return (
                    <tr
                      key={row.sessionId}
                      className="border-t border-white/[0.06] align-top hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{row.fullName}</p>
                        <p className="truncate text-[11px] text-white/45">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={row.statusTone}>{row.statusLabel}</Pill>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {row.status === "SUBMITTED" && row.scorePercent !== null ? (
                          <>
                            <span className="font-mono text-base font-bold text-white">
                              {row.scorePercent}%
                            </span>
                            <p className="text-[11px] text-white/45">
                              {row.correct}/{row.total} зөв
                            </p>
                          </>
                        ) : row.status === "TERMINATED" ? (
                          <span className="font-mono text-rose-300">0%</span>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg border px-2 py-0.5 font-mono font-semibold ${focusClass(row.focusLosses)}`}
                        >
                          {row.focusLosses}/{MAX_FOCUS_LOSSES}
                        </span>
                        {row.fullscreenExits > 0 ? (
                          <p className="mt-1 text-[11px] text-white/50">
                            Fullscreen-ээс гарсан: {row.fullscreenExits}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-white/65">
                        {other.length === 0 ? (
                          <span className="text-white/30">—</span>
                        ) : (
                          other.map(([type, count]) => (
                            <p key={type}>
                              {VIOLATION_LABELS[type] ?? type}: {count}
                            </p>
                          ))
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-white/55">
                        {dateFormat.format(row.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-white/55">
                        {row.submittedAt ? dateFormat.format(row.submittedAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link href={`/admin/sessions/${row.sessionId}`} className={smallButton}>
                            Дэлгэрэнгүй
                          </Link>
                          <form action={resetAttemptAction} className="inline-flex">
                            <input type="hidden" name="sessionId" value={row.sessionId} />
                            <ConfirmSubmitButton
                              message={`${row.fullName}-ийн оролдлогыг устгаж, шалгалтыг дахин өгөх боломж олгох уу? Одоогийн үр дүн нь устна.`}
                              className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[12px] font-semibold text-amber-200 hover:bg-amber-500/20"
                            >
                              Дахин өгүүлэх
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
