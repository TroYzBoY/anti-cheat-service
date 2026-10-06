import Link from "next/link";

import { deleteExamAction, setExamStatusAction } from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Card, EmptyState, PageHeader, Pill, smallButton } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { EXAM_STATUS_LABELS, isExamStatus } from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_TONE = { DRAFT: "default", PUBLISHED: "good", CLOSED: "warn" } as const;

const dateFormat = new Intl.DateTimeFormat("mn-MN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ulaanbaatar",
});

export default async function AdminExamsPage() {
  await requireAdmin();
  const exams = await prisma.exam.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      durationMinutes: true,
      createdAt: true,
      _count: { select: { items: true, sessions: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Шалгалтууд"
        subtitle="Google Form шиг шалгалт бэлдэж, Excel/CSV-ээс импортлоод нийтэлнэ. Нийтэлсэн шалгалт л суралцагчдад харагдана."
        action={
          <Link
            href="/admin/exams/new"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            + Шинэ шалгалт
          </Link>
        }
      />

      {exams.length === 0 ? (
        <EmptyState
          title="Шалгалт алга байна"
          description="«Шинэ шалгалт» дээр дарж эхний шалгалтаа үүсгэнэ үү."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Нэр</th>
                  <th className="px-4 py-3 font-medium">Төлөв</th>
                  <th className="px-4 py-3 text-right font-medium">Асуулт</th>
                  <th className="px-4 py-3 text-right font-medium">Өгсөн</th>
                  <th className="px-4 py-3 font-medium">Үүсгэсэн</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => {
                  const status = isExamStatus(exam.status) ? exam.status : "DRAFT";
                  return (
                    <tr key={exam.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/exams/${exam.id}`}
                          className="font-medium text-white hover:text-violet-300 hover:underline"
                        >
                          {exam.title}
                        </Link>
                        <p className="text-[11px] text-white/45">{exam.durationMinutes} минут</p>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={STATUS_TONE[status]}>{EXAM_STATUS_LABELS[status]}</Pill>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{exam._count.items}</td>
                      <td className="px-4 py-3 text-right font-mono">{exam._count.sessions}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-white/55">
                        {dateFormat.format(exam.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Link href={`/admin/exams/${exam.id}/results`} className={smallButton}>
                            Үр дүн
                          </Link>
                          <Link href={`/admin/exams/${exam.id}`} className={smallButton}>
                            Засах
                          </Link>
                          <form action={setExamStatusAction} className="inline-flex">
                            <input type="hidden" name="examId" value={exam.id} />
                            {status === "PUBLISHED" ? (
                              <button
                                type="submit"
                                name="status"
                                value="CLOSED"
                                className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[12px] font-semibold text-amber-200 hover:bg-amber-500/20"
                              >
                                Хаах
                              </button>
                            ) : (
                              <button
                                type="submit"
                                name="status"
                                value="PUBLISHED"
                                disabled={exam._count.items === 0}
                                title={exam._count.items === 0 ? "Эхлээд асуулт нэмнэ үү" : "Суралцагчдад нээх"}
                                className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                              >
                                {status === "CLOSED" ? "Дахин нээх" : "Нийтлэх"}
                              </button>
                            )}
                          </form>
                          <form action={deleteExamAction} className="inline-flex">
                            <input type="hidden" name="examId" value={exam.id} />
                            <ConfirmSubmitButton
                              message={
                                exam._count.sessions > 0
                                  ? `«${exam.title}» болон түүний ${exam._count.sessions} оролцогчийн үр дүнг бүрмөсөн устгах уу?`
                                  : `«${exam.title}» шалгалтыг устгах уу?`
                              }
                              className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[12px] font-semibold text-rose-200 hover:bg-rose-500/20"
                            >
                              Устгах
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
