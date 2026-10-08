-- API tokens become personal access tokens: a token belongs to a person and
-- lists which Projects it may address, instead of naming exactly one.
--
-- One migration, three steps in a forced order. This cannot be left to
-- `migrate diff`, whose script creates the table and then redefines `ApiToken`:
-- the new set has to be filled from `ApiToken.project_id` *while that column
-- still exists*, so the backfill has to sit between the two.
--
-- There is no dual-write window because there is nothing to bridge: Prisma
-- applies every pending migration before the process starts, so the code that
-- reads `ApiTokenProject` is the same image that dropped the column.

-- CreateTable
CREATE TABLE "ApiTokenProject" (
    "token_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,

    PRIMARY KEY ("token_id", "project_id"),
    CONSTRAINT "ApiTokenProject_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "ApiToken" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiTokenProject_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ApiTokenProject_project_id_idx" ON "ApiTokenProject"("project_id");

-- Backfill: every existing token named exactly one project, which is now a set
-- with one row. Nothing is inferred — the column is copied verbatim.
INSERT INTO "ApiTokenProject" ("token_id", "project_id")
SELECT "id", "project_id" FROM "ApiToken";

-- RedefineTables
-- `project_id` is a child column of a foreign key, and SQLite cannot drop a
-- constraint, so DROP COLUMN is not available here: the table is rebuilt. The
-- pragma pair is what makes it safe — the join table created above references
-- `ApiToken` by name, and the rename below re-establishes that name.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read',
    "revoked_at" DATETIME,
    "last_used_at" DATETIME,
    CONSTRAINT "ApiToken_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApiToken" ("created_at", "created_by", "id", "last_used_at", "name", "prefix", "revoked_at", "scope", "token_hash", "updated_at") SELECT "created_at", "created_by", "id", "last_used_at", "name", "prefix", "revoked_at", "scope", "token_hash", "updated_at" FROM "ApiToken";
DROP TABLE "ApiToken";
ALTER TABLE "new_ApiToken" RENAME TO "ApiToken";
CREATE UNIQUE INDEX "ApiToken_token_hash_key" ON "ApiToken"("token_hash");
CREATE INDEX "ApiToken_created_by_idx" ON "ApiToken"("created_by");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;