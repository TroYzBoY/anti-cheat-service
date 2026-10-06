"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import {
  describeDraftError,
  examDraftSchema,
  isExamStatus,
  type ExamDraft,
  type ExamStatus,
} from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export type SaveExamResult =
  | { ok: true; examId: string }
  | { ok: false; error: string };

function revalidateExam(examId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/exams/${examId}`);
  revalidatePath(`/admin/exams/${examId}/results`);
  revalidatePath("/exams");
}

/**
 * Create or overwrite an exam from the builder. Questions are replaced
 * wholesale; sessions already started keep their own frozen copy.
 */
const MAX_SEB_FILE_BYTES = 512 * 1024;

export async function saveExamAction(input: {
  examId: string | null;
  status: ExamStatus;
  draft: ExamDraft;
  /** New .seb file (base64), null to remove it, undefined to keep it. */
  sebConfigFile?: { name: string; base64: string } | null;
}): Promise<SaveExamResult> {
  const admin = await requireAdmin();

  let sebFile: {
    sebConfigFile: Uint8Array<ArrayBuffer> | null;
    sebConfigFileName: string | null;
  } | null = null;
  if (input.sebConfigFile === null) {
    sebFile = { sebConfigFile: null, sebConfigFileName: null };
  } else if (input.sebConfigFile) {
    const bytes = Buffer.from(input.sebConfigFile.base64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_SEB_FILE_BYTES) {
      return { ok: false, error: ".seb файл хоосон эсвэл 512KB-аас том байна." };
    }
    sebFile = {
      sebConfigFile: new Uint8Array(bytes),
      sebConfigFileName: input.sebConfigFile.name.slice(0, 200),
    };
  }

  const parsed = examDraftSchema.safeParse(input.draft);
  if (!parsed.success) {
    return { ok: false, error: describeDraftError(parsed.error) };
  }
  if (!isExamStatus(input.status)) {
    return { ok: false, error: "Буруу төлөв." };
  }
  const draft = parsed.data;
  if (input.status === "PUBLISHED" && draft.questions.length === 0) {
    return { ok: false, error: "Нийтлэхийн тулд дор хаяж нэг асуулт нэмнэ үү." };
  }

  const data = {
    title: draft.title,
    description: draft.description,
    durationMinutes: draft.durationMinutes,
    passPercent: draft.passPercent,
    shuffleQuestions: draft.shuffleQuestions,
    shuffleChoices: draft.shuffleChoices,
    requireSeb: draft.requireSeb,
    sebConfigKeys: draft.sebConfigKeys,
    status: input.status,
    ...sebFile,
  };
  const items = draft.questions.map((question, position) => ({
    position,
    prompt: question.prompt,
    choices: question.choices,
    correctIndex: question.correctIndex,
  }));

  let examId: string;
  if (input.examId) {
    const id = input.examId;
    const existing = await prisma.exam.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return { ok: false, error: "Шалгалт олдсонгүй. Устгагдсан байж магадгүй." };
    }
    await prisma.$transaction([
      prisma.exam.update({ where: { id }, data }),
      prisma.examItem.deleteMany({ where: { examId: id } }),
      prisma.examItem.createMany({ data: items.map((item) => ({ ...item, examId: id })) }),
    ]);
    examId = id;
  } else {
    const created = await prisma.exam.create({
      data: { ...data, createdById: admin.id, items: { create: items } },
      select: { id: true },
    });
    examId = created.id;
  }

  logEvent(input.examId ? "admin_exam_updated" : "admin_exam_created", {
    actorId: admin.id,
    examId,
    status: input.status,
    questionCount: items.length,
  });
  revalidateExam(examId);
  return { ok: true, examId };
}

const statusSchema = z.object({
  examId: z.string().min(1),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
});

export async function setExamStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const { examId, status } = statusSchema.parse({
    examId: formData.get("examId"),
    status: formData.get("status"),
  });
  if (status === "PUBLISHED" && (await prisma.examItem.count({ where: { examId } })) === 0) {
    throw new Error("Асуултгүй шалгалтыг нийтлэх боломжгүй.");
  }
  await prisma.exam.update({ where: { id: examId }, data: { status } });
  logEvent("admin_exam_status_changed", { actorId: admin.id, examId, status });
  revalidateExam(examId);
}

export async function deleteExamAction(formData: FormData) {
  const admin = await requireAdmin();
  const examId = z.string().min(1).parse(formData.get("examId"));
  // Cascades to every session and integrity event of this exam.
  const deleted = await prisma.exam.delete({
    where: { id: examId },
    select: { title: true, _count: { select: { sessions: true } } },
  });
  logEvent("admin_exam_deleted", {
    actorId: admin.id,
    examId,
    title: deleted.title,
    sessionsDeleted: deleted._count.sessions,
  });
  revalidatePath("/admin");
  revalidatePath("/exams");
  redirect("/admin");
}

/**
 * Delete one learner's attempt so they can take the exam again (one attempt
 * per learner is otherwise final, including bans).
 */
export async function resetAttemptAction(formData: FormData) {
  const admin = await requireAdmin();
  const sessionId = z.string().min(1).parse(formData.get("sessionId"));
  const session = await prisma.examSession.delete({
    where: { id: sessionId },
    select: { userId: true, examId: true, status: true, outcome: true, scorePercent: true },
  });
  logEvent("admin_attempt_reset", {
    actorId: admin.id,
    sessionId,
    ...session,
  });
  revalidateExam(session.examId);
}
