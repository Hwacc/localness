-- CreateTable
CREATE TABLE "TeamInviteCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME,
    "created_by" INTEGER NOT NULL,
    "revoked_at" DATETIME,
    CONSTRAINT "TeamInviteCode_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamInviteCode_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamInviteCode_code_key" ON "TeamInviteCode"("code");

-- CreateIndex
CREATE INDEX "TeamInviteCode_team_id_revoked_at_idx" ON "TeamInviteCode"("team_id", "revoked_at");
