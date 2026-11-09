-- AlterTable
ALTER TABLE "ProjectSettings" ADD COLUMN "ai_translate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectSettings" ADD COLUMN "ai_daily_limit" INTEGER;

-- AlterTable
ALTER TABLE "TranslationLog" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "TranslationLog" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "TranslationLog" ADD COLUMN "model" TEXT;

-- CreateIndex
CREATE INDEX "TranslationLog_batch_id_idx" ON "TranslationLog"("batch_id");
