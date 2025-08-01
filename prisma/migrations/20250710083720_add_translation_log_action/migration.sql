/*
  Warnings:

  - Added the required column `action` to the `TranslationLog` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TranslationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "origin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "fingerprint" TEXT,
    CONSTRAINT "TranslationLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TranslationLog_fingerprint_fkey" FOREIGN KEY ("fingerprint") REFERENCES "Translation" ("fingerprint") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TranslationLog" ("created_at", "fingerprint", "id", "origin", "status", "user_id") SELECT "created_at", "fingerprint", "id", "origin", "status", "user_id" FROM "TranslationLog";
DROP TABLE "TranslationLog";
ALTER TABLE "new_TranslationLog" RENAME TO "TranslationLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
