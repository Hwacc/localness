-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "read_at" DATETIME,
    "acted_at" DATETIME,
    "action" TEXT NOT NULL DEFAULT 'none',
    CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Notification_user_id_action_idx" ON "Notification"("user_id", "action");

-- CreateIndex
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at");
