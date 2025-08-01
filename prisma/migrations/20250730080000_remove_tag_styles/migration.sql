/*
  Warnings:

  - You are about to drop the column `label_style` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `locked` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `style` on the `Tag` table. All the data in the column will be lost.

*/
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
    "page_id" INTEGER NOT NULL,
    "translation_id" INTEGER,
    "i18n_key" TEXT,
    CONSTRAINT "Tag_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("class_name", "created_at", "height", "i18n_key", "id", "page_id", "tag_id", "translation_id", "updated_at", "width", "x", "y") SELECT "class_name", "created_at", "height", "i18n_key", "id", "page_id", "tag_id", "translation_id", "updated_at", "width", "x", "y" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
