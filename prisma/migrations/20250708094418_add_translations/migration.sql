/*
  Warnings:

  - You are about to drop the column `zh` on the `Translation` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "origin" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "en" TEXT,
    "zh_cn" TEXT,
    "zh_tw" TEXT,
    "ja" TEXT,
    "ko" TEXT,
    "ru" TEXT,
    "fr" TEXT,
    "de" TEXT,
    "es" TEXT,
    "pt" TEXT
);
INSERT INTO "new_Translation" ("created_at", "en", "id", "md5", "origin", "updated_at") SELECT "created_at", "en", "id", "md5", "origin", "updated_at" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_md5_key" ON "Translation"("md5");
CREATE INDEX "Translation_md5_idx" ON "Translation"("md5");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
