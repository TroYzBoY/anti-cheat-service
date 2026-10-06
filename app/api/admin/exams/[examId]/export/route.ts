import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { loadExamResults, VIOLATION_LABELS } from "@/lib/exam-results";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Нэр",
  "Имэйл",
  "Төлөв",
  "Оноо (%)",
  "Зөв",
  "Нийт асуулт",
  "Focus алдсан",
  "Fullscreen-ээс гарсан",
  "Бусад зөрчил",
  "Эхэлсэн",
  "Дууссан",
] as const;

/** One exam's results as a CSV that opens in Excel. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Нэвтэрнэ үү.", 401);
    if (user.role !== "ADMIN") return jsonError("Зөвхөн админ.", 403);

    const { examId } = await params;
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) return jsonError("Шалгалт олдсонгүй.", 404);

    const { rows } = await loadExamResults(exam.id, Date.now());
    const csv = buildCsv(
      HEADERS,
      rows.map((row) => [
        row.fullName,
        row.email,
        row.statusLabel,
        row.status === "SUBMITTED" ? row.scorePercent : row.outcome ? 0 : "",
        row.correct ?? "",
        row.total,
        row.focusLosses,
        row.fullscreenExits,
        Object.entries(row.otherViolations)
          .map(([type, count]) => `${VIOLATION_LABELS[type] ?? type}: ${count}`)
          .join("; "),
        row.startedAt,
        row.submittedAt,
      ]),
    );

    const today = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="exam-results-${exam.id}-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return jsonError("Database unavailable.", 503);
    throw error;
  }
}
