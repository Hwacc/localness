-- AddColumn: hand-quoted JSON default — Prisma's SQLite diff emits `DEFAULT {}`
-- unquoted, which is not valid SQL.
ALTER TABLE "ProjectSettings" ADD COLUMN "i18n_dialect" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "ProjectSettings" ADD COLUMN "rule_severity" JSONB NOT NULL DEFAULT '{}';