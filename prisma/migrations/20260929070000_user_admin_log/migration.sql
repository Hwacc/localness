-- CreateTable
CREATE TABLE "UserAdminLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "after_data" JSONB,
    "actor_id" INTEGER,
    "target_id" INTEGER,
    CONSTRAINT "UserAdminLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UserAdminLog_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserAdminLog_actor_id_idx" ON "UserAdminLog"("actor_id");

-- CreateIndex
CREATE INDEX "UserAdminLog_target_id_idx" ON "UserAdminLog"("target_id");

-- CreateIndex
CREATE INDEX "UserAdminLog_created_at_idx" ON "UserAdminLog"("created_at");
