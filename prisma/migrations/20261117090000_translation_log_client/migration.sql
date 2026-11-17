-- AlterTable
ALTER TABLE "TranslationLog" ADD COLUMN "client" TEXT;
ALTER TABLE "TranslationLog" ADD COLUMN "agent" BOOLEAN NOT NULL DEFAULT false;
