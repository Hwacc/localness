-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'read';