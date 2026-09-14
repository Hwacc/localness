-- AlterTable
ALTER TABLE "User" ADD COLUMN "password_set_at" DATETIME;

-- Existing local accounts already chose a password.
UPDATE "User" SET "password_set_at" = CURRENT_TIMESTAMP WHERE "password_set_at" IS NULL;

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "AuthIdentity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_provider_account_id_key" ON "AuthIdentity"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_user_id_provider_key" ON "AuthIdentity"("user_id", "provider");

-- CreateIndex
CREATE INDEX "AuthIdentity_user_id_idx" ON "AuthIdentity"("user_id");
