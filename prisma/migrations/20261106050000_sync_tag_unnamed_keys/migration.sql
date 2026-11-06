-- `Tag.i18n_key` is a denormalised copy of `I18nKey.key` that the editor renders
-- from. The previous rename only touched `I18nKey`, so tags still showed the
-- `__draft_` name. Re-copy the key for every tag bound to a renamed row.
UPDATE "Tag"
SET "i18n_key" = (
  SELECT "I18nKey"."key" FROM "I18nKey" WHERE "I18nKey"."id" = "Tag"."i18n_key_id"
)
WHERE "i18n_key_id" IS NOT NULL
  AND substr("i18n_key", 1, 8) = '__draft_'
  AND EXISTS (
    SELECT 1 FROM "I18nKey"
    WHERE "I18nKey"."id" = "Tag"."i18n_key_id"
      AND "I18nKey"."key" <> "Tag"."i18n_key"
  );
