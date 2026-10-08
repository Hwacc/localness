-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "figma_node_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tag_page_id_figma_node_id_key" ON "Tag"("page_id", "figma_node_id");