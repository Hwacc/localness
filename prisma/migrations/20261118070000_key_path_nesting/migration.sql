-- Namespace names and page key paths become relative to the project's key
-- prefix: key = project prefix + page path + generated tail, and a key is
-- grouped by what follows the project prefix. Projects with an empty prefix are
-- untouched by every statement here. Boundaries are the ones `namespaceOf`
-- uses: _ . - : /

-- A namespace equal to the prefix, or to a leading run of it, held every key.
DELETE FROM "KeyNamespace"
WHERE EXISTS (
  SELECT 1 FROM "ProjectSettings" ps
  WHERE ps."project_id" = "KeyNamespace"."project_id"
    AND ps."key_prefix" != ''
    AND (
      ps."key_prefix" = "KeyNamespace"."name"
      OR (
        substr(ps."key_prefix", 1, length("KeyNamespace"."name")) = "KeyNamespace"."name"
        AND substr(ps."key_prefix", length("KeyNamespace"."name") + 1, 1) IN ('_', '.', '-', ':', '/')
      )
    )
);

-- `shop_login` becomes `login`, unless the project already declares that name.
UPDATE "KeyNamespace"
SET "name" = substr("name", (
  SELECT length(ps."key_prefix") + 2 FROM "ProjectSettings" ps
  WHERE ps."project_id" = "KeyNamespace"."project_id"
))
WHERE EXISTS (
  SELECT 1 FROM "ProjectSettings" ps
  WHERE ps."project_id" = "KeyNamespace"."project_id"
    AND ps."key_prefix" != ''
    AND length("KeyNamespace"."name") > length(ps."key_prefix") + 1
    AND substr("KeyNamespace"."name", 1, length(ps."key_prefix")) = ps."key_prefix"
    AND substr("KeyNamespace"."name", length(ps."key_prefix") + 1, 1) IN ('_', '.', '-', ':', '/')
    AND NOT EXISTS (
      SELECT 1 FROM "KeyNamespace" other
      WHERE other."project_id" = "KeyNamespace"."project_id"
        AND other."name" = substr("KeyNamespace"."name", length(ps."key_prefix") + 2)
    )
);

-- A page's own prefix used to replace the project's; it now follows it.
ALTER TABLE "PageSettings" RENAME COLUMN "key_prefix" TO "key_path";

UPDATE "PageSettings"
SET "key_path" = (
  SELECT CASE
    WHEN "PageSettings"."key_path" = '' THEN NULL
    WHEN ps."key_prefix" IS NULL OR ps."key_prefix" = '' THEN "PageSettings"."key_path"
    WHEN "PageSettings"."key_path" = ps."key_prefix" THEN NULL
    WHEN length("PageSettings"."key_path") > length(ps."key_prefix") + 1
      AND substr("PageSettings"."key_path", 1, length(ps."key_prefix")) = ps."key_prefix"
      AND substr("PageSettings"."key_path", length(ps."key_prefix") + 1, 1) IN ('_', '.', '-', ':', '/')
      THEN substr("PageSettings"."key_path", length(ps."key_prefix") + 2)
    ELSE "PageSettings"."key_path"
  END
  FROM "Page" p
  LEFT JOIN "ProjectSettings" ps ON ps."project_id" = p."project_id"
  WHERE p."id" = "PageSettings"."page_id"
)
WHERE "key_path" IS NOT NULL;

ALTER TABLE "PageSettings" DROP COLUMN "key_separator";
ALTER TABLE "PageSettings" DROP COLUMN "key_style";
ALTER TABLE "PageSettings" DROP COLUMN "key_max_depth";
