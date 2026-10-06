-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "role" TEXT NOT NULL DEFAULT 'LEARNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "email" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleChoices" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamItem" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT[],
    "correctIndex" INTEGER NOT NULL,

    CONSTRAINT "ExamItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "outcome" TEXT,
    "terminationReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "passPercent" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "answerKey" INTEGER[],
    "answers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "correctCount" INTEGER,
    "scorePercent" INTEGER,
    "passed" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamIntegrityEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamIntegrityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "Exam_status_createdAt_idx" ON "Exam"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExamItem_examId_position_idx" ON "ExamItem"("examId", "position");

-- CreateIndex
CREATE INDEX "ExamSession_userId_idx" ON "ExamSession"("userId");

-- CreateIndex
CREATE INDEX "ExamSession_status_idx" ON "ExamSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_examId_userId_key" ON "ExamSession"("examId", "userId");

-- CreateIndex
CREATE INDEX "ExamIntegrityEvent_sessionId_type_idx" ON "ExamIntegrityEvent"("sessionId", "type");

-- CreateIndex
CREATE INDEX "ExamIntegrityEvent_sessionId_createdAt_idx" ON "ExamIntegrityEvent"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExamItem" ADD CONSTRAINT "ExamItem_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamIntegrityEvent" ADD CONSTRAINT "ExamIntegrityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

