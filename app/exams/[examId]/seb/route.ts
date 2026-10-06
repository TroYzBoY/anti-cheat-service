import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The exam's .seb file; opening it starts Safe Exam Browser on the exam. */
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
  if (!exam?.sebConfigFile || (exam.status !== "PUBLISHED" && user.role !== "ADMIN")) {
    return jsonError("SEB тохиргооны файл олдсонгүй.", 404);
  }

  return new Response(Buffer.from(exam.sebConfigFile), {
    headers: {
      "Content-Type": "application/seb",
      "Content-Disposition": `attachment; filename="fenrir-${examId}.seb"`,
      "Cache-Control": "private, no-store",
    },
  });
}
