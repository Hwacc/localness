-- AlterTable
ALTER TABLE "PageSettings" ADD COLUMN "prompt" TEXT;

-- AlterTable
ALTER TABLE "ProjectSettings" ADD COLUMN "prompt" TEXT;

-- CreateTable
CREATE TABLE "TagSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "style" JSONB NOT NULL,
    "label_style" JSONB NOT NULL,
    "prompt" TEXT,
    CONSTRAINT "TagSettings_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Translation_FTS" (
    "origin" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "TagSettings_tag_id_key" ON "TagSettings"("tag_id");
