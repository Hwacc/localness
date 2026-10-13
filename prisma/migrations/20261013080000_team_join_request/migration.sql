-- CreateTable
CREATE TABLE "TeamJoinRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_at" DATETIME,
    "decided_by" INTEGER,
    CONSTRAINT "TeamJoinRequest_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamJoinRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeamJoinRequest_user_id_idx" ON "TeamJoinRequest"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TeamJoinRequest_team_id_user_id_key" ON "TeamJoinRequest"("team_id", "user_id");
