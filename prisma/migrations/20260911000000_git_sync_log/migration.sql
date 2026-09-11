-- CreateTable
CREATE TABLE "GitSyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "preview_id" INTEGER,
    "commit_sha" TEXT NOT NULL DEFAULT '',
    "detail" JSONB,
    "user_id" INTEGER,
    CONSTRAINT "GitSyncLog_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GitSyncLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GitSyncLog_project_id_created_at_idx" ON "GitSyncLog"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "GitSyncLog_user_id_idx" ON "GitSyncLog"("user_id");
