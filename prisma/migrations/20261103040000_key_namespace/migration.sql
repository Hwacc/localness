-- CreateTable
CREATE TABLE "KeyNamespace" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "KeyNamespace_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KeyNamespace_project_id_idx" ON "KeyNamespace"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "KeyNamespace_project_id_name_key" ON "KeyNamespace"("project_id", "name");

-- Seed one namespace per project from the first segment of its key prefix, so
-- the keys the AI has been naming are grouped from day one instead of every
-- project opening on a list that is all Ungrouped. The boundary set is the one
-- `namespaceOf` uses (_ . - : /); a segment with anything but letters and
-- digits is skipped, since it could not be declared by hand either.
INSERT INTO "KeyNamespace" ("project_id", "name", "sort", "created_at", "updated_at")
SELECT "project_id", "segment", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT
    "project_id",
    CASE
      WHEN instr("normalized", '_') > 0
        THEN substr("key_prefix", 1, instr("normalized", '_') - 1)
      ELSE "key_prefix"
    END AS "segment"
  FROM (
    SELECT
      "project_id",
      "key_prefix",
      replace(replace(replace(replace("key_prefix", '.', '_'), '-', '_'), ':', '_'), '/', '_') AS "normalized"
    FROM "ProjectSettings"
  )
)
WHERE "segment" != '' AND "segment" NOT GLOB '*[^A-Za-z0-9]*';
