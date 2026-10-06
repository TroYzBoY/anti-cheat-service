-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "requireSeb" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebConfigFile" BYTEA,
ADD COLUMN     "sebConfigFileName" TEXT,
ADD COLUMN     "sebConfigKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

