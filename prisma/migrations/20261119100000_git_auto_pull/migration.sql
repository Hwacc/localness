-- AlterTable
ALTER TABLE "GitSyncBinding" ADD COLUMN "auto_pull" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GitSyncBinding" ADD COLUMN "last_remote_sha" TEXT NOT NULL DEFAULT '';
