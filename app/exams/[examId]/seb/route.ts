import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { examSebSettings, sebConfigFile } from "@/lib/seb-config";

export const dynamic = "force-dynamic";

/**
 * The exam's .seb file; opening it starts Safe Exam Browser on the exam. An
 * admin's own uploaded file wins over the generated one.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError("Нэвтэрнэ үү.", 401);

  const { examId } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { status: true, sebConfigFile: true },
  });
  if (!exam || (exam.status !== "PUBLISHED" && user.role !== "ADMIN")) {
    return jsonError("Шалгалт олдсонгүй.", 404);
  }

  const file = exam.sebConfigFile
    ? Buffer.from(exam.sebConfigFile)
    : sebConfigFile(examSebSettings(appOrigin(request.url), examId));
  return new Response(file, {
    headers: {
      "Content-Type": "application/seb",
      "Content-Disposition": `attachment; filename="fenrir-${examId}.seb"`,
      "Cache-Control": "private, no-store",
    },
  });
}
