import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ExamBuilder } from "@/components/admin/exam-builder";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { appOriginFromHeaders } from "@/lib/env";
import { isExamStatus } from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  await requireAdmin();
  const { examId } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    omit: { sebConfigFile: true },
    include: {
      items: { orderBy: { position: "asc" } },
      _count: { select: { sessions: true } },
    },
  });
  if (!exam) notFound();
  const origin = appOriginFromHeaders(await headers());

  return (
    <>
      <Link href="/admin" className="text-sm text-white/55 hover:text-white">
        ← Шалгалтууд
      </Link>
      <PageHeader title="Шалгалт засах" subtitle={exam.title} />
      <ExamBuilder
        examId={exam.id}
        initialStatus={isExamStatus(exam.status) ? exam.status : "DRAFT"}
        initialDraft={{
          title: exam.title,
          description: exam.description,
          durationMinutes: exam.durationMinutes,
          passPercent: exam.passPercent,
          shuffleQuestions: exam.shuffleQuestions,
          shuffleChoices: exam.shuffleChoices,
          requireSeb: exam.requireSeb,
          sebConfigKeys: exam.sebConfigKeys,
          questions: exam.items.map((item) => ({
            prompt: item.prompt,
            choices: item.choices,
            correctIndex: item.correctIndex,
          })),
        }}
        attemptCount={exam._count.sessions}
        sebFileName={exam.sebConfigFileName}
        sebStartUrl={`${origin}/exams/${exam.id}`}
      />
    </>
  );
}
