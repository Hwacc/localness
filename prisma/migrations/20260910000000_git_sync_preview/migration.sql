-- CreateTable
CREATE TABLE "GitSyncPreview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "commit_sha" TEXT NOT NULL DEFAULT '',
    "candidates" JSONB NOT NULL,
    "result" JSONB,
    "created_by" TEXT NOT NULL DEFAULT '',
    "expires_at" DATETIME NOT NULL,
    CONSTRAINT "GitSyncPreview_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GitSyncPreview_project_id_kind_status_idx" ON "GitSyncPreview"("project_id", "kind", "status");
