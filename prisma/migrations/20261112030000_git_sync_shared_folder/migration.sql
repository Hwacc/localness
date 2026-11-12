-- AlterTable
ALTER TABLE "GitSyncBinding" ADD COLUMN "folder_mode" TEXT NOT NULL DEFAULT 'exclusive';
ALTER TABLE "GitSyncBinding" ADD COLUMN "batch_tag" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GitSyncBinding" ADD COLUMN "owns_untagged" BOOLEAN NOT NULL DEFAULT true;

-- Every existing binding gets its tag now, so its next LILT push is already tagged.
UPDATE "GitSyncBinding" SET "batch_tag" = lower(hex(randomblob(4))) WHERE "batch_tag" = '';

-- DropIndex
DROP INDEX "GitSyncBinding_adapter_remote_url_product_key";

-- CreateIndex
CREATE UNIQUE INDEX "GitSyncBinding_adapter_remote_url_product_batch_tag_key" ON "GitSyncBinding"("adapter", "remote_url", "product", "batch_tag");
