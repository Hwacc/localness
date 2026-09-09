-- Git sync binding, three-way base snapshots, and per-key conflicts
CREATE TABLE "GitSyncBinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT 1,
    "adapter" TEXT NOT NULL DEFAULT 'lilt-swbu',
    "remote_url" TEXT NOT NULL DEFAULT '',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "product" TEXT NOT NULL,
    "credential_kind" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "locale_map" JSON,
    "last_pulled_at" DATETIME,
    "last_pushed_at" DATETIME,
    CONSTRAINT "GitSyncBinding_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GitSyncBinding_project_id_key" ON "GitSyncBinding"("project_id");
CREATE UNIQUE INDEX "GitSyncBinding_adapter_remote_url_product_key" ON "GitSyncBinding"("adapter", "remote_url", "product");

CREATE TABLE "GitSyncBase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "base_text" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "GitSyncBase_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GitSyncBase_project_id_key_locale_key" ON "GitSyncBase"("project_id", "key", "locale");
CREATE INDEX "GitSyncBase_project_id_idx" ON "GitSyncBase"("project_id");

CREATE TABLE "GitSyncConflict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "base_text" TEXT NOT NULL DEFAULT '',
    "ours_text" TEXT NOT NULL,
    "theirs_text" TEXT NOT NULL,
    "published_text" TEXT,
    "merged_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    CONSTRAINT "GitSyncConflict_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GitSyncConflict_project_id_key_locale_key" ON "GitSyncConflict"("project_id", "key", "locale");
CREATE INDEX "GitSyncConflict_project_id_status_idx" ON "GitSyncConflict"("project_id", "status");
