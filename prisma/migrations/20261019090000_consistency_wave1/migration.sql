-- CreateTable
CREATE TABLE "ConsistencyIgnore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" INTEGER NOT NULL,
    "rule_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "key_ids" JSONB NOT NULL,
    CONSTRAINT "ConsistencyIgnore_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsistencyIgnore_project_id_rule_id_group_id_key" ON "ConsistencyIgnore"("project_id", "rule_id", "group_id");

-- AddColumn: hand-quoted JSON default — Prisma's SQLite diff emits `DEFAULT {}`
-- unquoted, which is not valid SQL.
ALTER TABLE "ProjectSettings" ADD COLUMN "lint_rules" JSONB NOT NULL DEFAULT '{}';
