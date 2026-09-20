-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_I18nKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STRING',
    "origin" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "git_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "I18nKey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_I18nKey" ("created_at", "description", "fingerprint", "id", "key", "origin", "project_id", "type", "updated_at") SELECT "created_at", "description", "fingerprint", "id", "key", "origin", "project_id", "type", "updated_at" FROM "I18nKey";
DROP TABLE "I18nKey";
ALTER TABLE "new_I18nKey" RENAME TO "I18nKey";
CREATE INDEX "I18nKey_fingerprint_idx" ON "I18nKey"("fingerprint");
CREATE UNIQUE INDEX "I18nKey_project_id_key_key" ON "I18nKey"("project_id", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
