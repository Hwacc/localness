-- AlterTable
ALTER TABLE "GitSyncBinding" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GitSyncBinding" ADD COLUMN "lease_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GitSyncBinding" ADD COLUMN "lease_owner" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GitSyncBinding" ADD COLUMN "lease_until" DATETIME;
