-- AlterTable
ALTER TABLE "ExamSession" ADD COLUMN     "draftAnswers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExamActivity" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "questionIndex" INTEGER,
    "choiceIndex" INTEGER,
    "previousIndex" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamActivity_sessionId_createdAt_idx" ON "ExamActivity"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExamActivity" ADD CONSTRAINT "ExamActivity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

