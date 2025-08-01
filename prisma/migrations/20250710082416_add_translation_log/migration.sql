/*
  Warnings:

  - You are about to drop the column `md5` on the `Translation` table. All the data in the column will be lost.
  - Added the required column `fingerprint` to the `Translation` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "TranslationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "fingerprint" TEXT,
    CONSTRAINT "TranslationLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TranslationLog_fingerprint_fkey" FOREIGN KEY ("fingerprint") REFERENCES "Translation" ("fingerprint") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "origin" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
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
INSERT INTO "new_Translation" ("created_at", "de", "en", "es", "fr", "id", "ja", "ko", "origin", "pt", "ru", "updated_at", "zh_cn", "zh_tw") SELECT "created_at", "de", "en", "es", "fr", "id", "ja", "ko", "origin", "pt", "ru", "updated_at", "zh_cn", "zh_tw" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_fingerprint_key" ON "Translation"("fingerprint");
CREATE INDEX "Translation_fingerprint_idx" ON "Translation"("fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
