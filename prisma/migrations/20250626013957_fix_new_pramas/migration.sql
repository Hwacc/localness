/*
  Warnings:

  - You are about to drop the column `fill` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `stroke` on the `Tag` table. All the data in the column will be lost.
  - Added the required column `style` to the `Tag` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tag_id` to the `Tag` table without a default value. This is not possible if the table is not empty.

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
    "editable" BOOLEAN NOT NULL,
    "style" JSONB NOT NULL,
    "i18n_key" TEXT,
    "content" TEXT,
    "page_id" INTEGER NOT NULL,
    "translation_id" INTEGER,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tag_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("class_name", "content", "created_at", "editable", "height", "i18n_key", "id", "page_id", "translation_id", "updated_at", "width", "x", "y") SELECT "class_name", "content", "created_at", "editable", "height", "i18n_key", "id", "page_id", "translation_id", "updated_at", "width", "x", "y" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_i18n_key_key" ON "Tag"("i18n_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
