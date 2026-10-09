import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  csvDownload,
  examAnswersCsv,
  examLogCsv,
  examSummaryCsv,
  isExamExportKind,
} from "@/lib/exam-exports";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BUILDERS = {
  summary: examSummaryCsv,
  answers: examAnswersCsv,
  log: examLogCsv,
};

/**
 * One exam's results as a CSV that opens in Excel: `?kind=summary` (default,
 * one row per learner), `answers` (every learner's pick per question) or
 * `log` (every logged action of every attempt).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Нэвтэрнэ үү.", 401);
    if (user.role !== "ADMIN") return jsonError("Зөвхөн админ.", 403);

    const { examId } = await params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true },
    });
    if (!exam) return jsonError("Шалгалт олдсонгүй.", 404);

    const requested = request.nextUrl.searchParams.get("kind") ?? "summary";
    if (!isExamExportKind(requested)) return jsonError("Буруу төрөл.", 400);

    const csv = await BUILDERS[requested](exam.id);
    const today = new Date().toISOString().slice(0, 10);
    const fileName =
      requested === "summary"
        ? `exam-results-${exam.id}-${today}.csv`
        : `exam-${requested}-${exam.id}-${today}.csv`;
    return csvDownload(csv, fileName, exam.title);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return jsonError("Database unavailable.", 503);
    throw error;
  }
}
