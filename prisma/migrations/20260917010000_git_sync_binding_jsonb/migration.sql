-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GitSyncBinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "adapter" TEXT NOT NULL DEFAULT 'lilt-swbu',
    "remote_url" TEXT NOT NULL DEFAULT '',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "product" TEXT NOT NULL,
    "credential_kind" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "locale_map" JSONB,
    "seen_files" JSONB,
    "last_pulled_at" DATETIME,
    "last_pushed_at" DATETIME,
    CONSTRAINT "GitSyncBinding_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GitSyncBinding" ("adapter", "branch", "created_at", "credential_kind", "enabled", "id", "last_pulled_at", "last_pushed_at", "locale_map", "product", "project_id", "remote_url", "seen_files", "token", "updated_at") SELECT "adapter", "branch", "created_at", "credential_kind", "enabled", "id", "last_pulled_at", "last_pushed_at", "locale_map", "product", "project_id", "remote_url", "seen_files", "token", "updated_at" FROM "GitSyncBinding";
DROP TABLE "GitSyncBinding";
ALTER TABLE "new_GitSyncBinding" RENAME TO "GitSyncBinding";
CREATE UNIQUE INDEX "GitSyncBinding_project_id_key" ON "GitSyncBinding"("project_id");
CREATE UNIQUE INDEX "GitSyncBinding_adapter_remote_url_product_key" ON "GitSyncBinding"("adapter", "remote_url", "product");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
