-- The original text of a key is the project's source language's `draftText`, so
-- `I18nKey.origin` is gone. Backfilled by
-- `scripts/migrate-origin-to-source-locale.ts`, which must have run before this
-- migration is applied.
--
-- The FTS index went with it: it indexed `origin`, nothing has called
-- `/api/translation/search` for a long time, and the triggers would only block
-- the column from being dropped.

DROP TRIGGER IF EXISTS "I18nKey_FTS_AfterInsert";
DROP TRIGGER IF EXISTS "I18nKey_FTS_AfterUpdate";
DROP TRIGGER IF EXISTS "I18nKey_FTS_AfterDelete";

DROP TABLE IF EXISTS "I18nKey_FTS";

ALTER TABLE "I18nKey" DROP COLUMN "origin";
