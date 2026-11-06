-- Placeholder keys were `__draft_<fingerprint>`, which read as the Draft publish
-- status. They are `__unnamed_<fingerprint>` now. A row whose renamed key is
-- already taken in the same project keeps its old name: both prefixes are still
-- recognised as placeholders, so nothing is lost by leaving it.
UPDATE "I18nKey"
SET "key" = '__unnamed_' || substr("key", 9)
WHERE substr("key", 1, 8) = '__draft_'
  AND NOT EXISTS (
    SELECT 1 FROM "I18nKey" AS other
    WHERE other."project_id" = "I18nKey"."project_id"
      AND other."key" = '__unnamed_' || substr("I18nKey"."key", 9)
  );
