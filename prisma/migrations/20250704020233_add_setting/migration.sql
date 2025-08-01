/*
  Warnings:

  - You are about to drop the column `i18n_key` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `Tag` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ProjectSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "ProjectSetting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "page_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "PageSetting_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tag_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "class_name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "style" JSONB NOT NULL,
    "page_id" INTEGER NOT NULL,
    "translation_id" INTEGER,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tag_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("class_name", "created_at", "height", "id", "locked", "page_id", "style", "tag_id", "translation_id", "updated_at", "width", "x", "y") SELECT "class_name", "created_at", "height", "id", "locked", "page_id", "style", "tag_id", "translation_id", "updated_at", "width", "x", "y" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSetting_project_id_key" ON "ProjectSetting"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "PageSetting_page_id_key" ON "PageSetting"("page_id");

-- CreateIndex
CREATE INDEX "Translation_i18n_key_idx" ON "Translation"("i18n_key");

-- CreateIndex
CREATE INDEX "Translation_origin_idx" ON "Translation"("origin");
