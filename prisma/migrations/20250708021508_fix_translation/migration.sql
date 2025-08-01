-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "i18n_key" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "origin" TEXT NOT NULL,
    "en" TEXT,
    "zh" TEXT
);
INSERT INTO "new_Translation" ("created_at", "en", "i18n_key", "id", "origin", "updated_at", "zh") SELECT "created_at", "en", "i18n_key", "id", "origin", "updated_at", "zh" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_i18n_key_key" ON "Translation"("i18n_key");
CREATE INDEX "Translation_i18n_key_idx" ON "Translation"("i18n_key");
CREATE INDEX "Translation_origin_idx" ON "Translation"("origin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
