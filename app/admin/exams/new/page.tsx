import Link from "next/link";

import { ExamBuilder } from "@/components/admin/exam-builder";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewExamPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/admin" className="text-sm text-white/55 hover:text-white">
        ← Шалгалтууд
      </Link>
      <PageHeader
        title="Шинэ шалгалт"
        subtitle="Асуултаа нэг нэгээр нэмэх эсвэл Excel/CSV/текстээс импортлоно. Ноорог төлөвтэй хадгалбал суралцагчдад харагдахгүй."
      />
      <ExamBuilder
        examId={null}
        initialStatus="DRAFT"
        initialDraft={{
          title: "",
          description: "",
          durationMinutes: 30,
          passPercent: 60,
          shuffleQuestions: false,
          shuffleChoices: false,
          questions: [],
        }}
        attemptCount={0}
      />
    </>
  );
}
