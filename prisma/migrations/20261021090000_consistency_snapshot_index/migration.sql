-- Report filter/sort/page columns, written from `findingIndex` at scan time,
-- and the whitelist flag. Existing rows keep the defaults until the next scan:
-- SNAPSHOT_FORMAT 2 marks every older snapshot outdated, so the page rescans.
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "severity_rank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "rule_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "sort_key" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "locales" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ConsistencySnapshotFinding" ADD COLUMN "ignored" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ConsistencySnapshotFinding_project_id_ignored_category_severity_rank_rule_order_sort_key_idx" ON "ConsistencySnapshotFinding"("project_id", "ignored", "category", "severity_rank", "rule_order", "sort_key");