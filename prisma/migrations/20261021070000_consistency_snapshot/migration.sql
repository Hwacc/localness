-- CreateTable
CREATE TABLE "ConsistencySnapshot" (
    "project_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" TEXT NOT NULL,
    "source_locale" TEXT NOT NULL,
    "scanned_keys" INTEGER NOT NULL,
    "scanned_at" DATETIME NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    CONSTRAINT "ConsistencySnapshot_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencySnapshotFinding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "project_id" INTEGER NOT NULL,
    "rule_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "meta" TEXT,
    CONSTRAINT "ConsistencySnapshotFinding_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConsistencySnapshotFinding_project_id_rule_id_group_id_idx" ON "ConsistencySnapshotFinding"("project_id", "rule_id", "group_id");

-- CreateIndex
CREATE INDEX "Tag_i18n_key_id_idx" ON "Tag"("i18n_key_id");
