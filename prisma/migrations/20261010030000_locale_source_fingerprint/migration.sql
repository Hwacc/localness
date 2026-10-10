-- A translation remembers which source sentence it was written against.
-- Existing rows are stamped with the key's current fingerprint so the
-- catalog does not all look outdated on the day this lands.
ALTER TABLE "LocaleValue" ADD COLUMN "source_fingerprint" TEXT NOT NULL DEFAULT '';

UPDATE "LocaleValue"
SET "source_fingerprint" = COALESCE(
  (
    SELECT k."fingerprint"
    FROM "I18nKey" k
    WHERE k."id" = "LocaleValue"."i18n_key_id"
  ),
  ''
)
WHERE "locale" != COALESCE(
  (
    SELECT ps."locale_fallback"
    FROM "ProjectSettings" ps
    JOIN "I18nKey" k ON k."project_id" = ps."project_id"
    WHERE k."id" = "LocaleValue"."i18n_key_id"
  ),
  'en'
)
AND (
  COALESCE("draft_text", '') != ''
  OR COALESCE("published_text", '') != ''
);
