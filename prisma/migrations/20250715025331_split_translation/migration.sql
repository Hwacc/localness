/*
  Warnings:

  - You are about to drop the column `de` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `en` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `es` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `fr` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `ja` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `ko` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `pt` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `ru` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `zh_cn` on the `Translation` table. All the data in the column will be lost.
  - You are about to drop the column `zh_tw` on the `Translation` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TranslationVue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "en" TEXT,
    "zh_cn" TEXT,
    "zh_tw" TEXT,
    "ja" TEXT,
    "ko" TEXT,
    "ru" TEXT,
    "fr" TEXT,
    "de" TEXT,
    "es" TEXT,
    "pt" TEXT,
    "translation_id" INTEGER NOT NULL,
    CONSTRAINT "TranslationVue_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationReact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "en" TEXT,
    "zh_cn" TEXT,
    "zh_tw" TEXT,
    "ja" TEXT,
    "ko" TEXT,
    "ru" TEXT,
    "fr" TEXT,
    "de" TEXT,
    "es" TEXT,
    "pt" TEXT,
    "translation_id" INTEGER NOT NULL,
    CONSTRAINT "TranslationReact_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "origin" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL
);
INSERT INTO "new_Translation" ("created_at", "fingerprint", "id", "origin", "updated_at") SELECT "created_at", "fingerprint", "id", "origin", "updated_at" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_fingerprint_key" ON "Translation"("fingerprint");
CREATE INDEX "Translation_fingerprint_idx" ON "Translation"("fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TranslationVue_translation_id_key" ON "TranslationVue"("translation_id");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationReact_translation_id_key" ON "TranslationReact"("translation_id");
