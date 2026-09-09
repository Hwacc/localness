-- v2: Team + I18nKey. Copies data from owner/UserProject/Translation then drops legacy tables.
PRAGMA foreign_keys=OFF;

-- Team
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL
);

CREATE TABLE "UserTeam" (
    "user_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "team_id"),
    CONSTRAINT "UserTeam_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTeam_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserTeam_team_id_idx" ON "UserTeam"("team_id");

INSERT INTO "Team" ("name", "created_at", "updated_at")
SELECT DISTINCT u."username" || '-team', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project" p
INNER JOIN "User" u ON u."id" = p."owner_id"
WHERE p."owner_id" IS NOT NULL;

INSERT INTO "Team" ("name", "created_at", "updated_at")
SELECT 'legacy-team', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Project" WHERE "owner_id" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "Team" WHERE "name" = 'legacy-team');

INSERT INTO "UserTeam" ("user_id", "team_id", "role")
SELECT DISTINCT p."owner_id", t."id", 'OWNER'
FROM "Project" p
INNER JOIN "User" u ON u."id" = p."owner_id"
INNER JOIN "Team" t ON t."name" = u."username" || '-team'
WHERE p."owner_id" IS NOT NULL;

INSERT OR IGNORE INTO "UserTeam" ("user_id", "team_id", "role")
SELECT up."user_id", t."id", 'MEMBER'
FROM "UserProject" up
INNER JOIN "Project" p ON p."id" = up."project_id"
INNER JOIN "User" u ON u."id" = p."owner_id"
INNER JOIN "Team" t ON t."name" = u."username" || '-team'
WHERE p."owner_id" IS NOT NULL
  AND up."user_id" != p."owner_id";

INSERT OR IGNORE INTO "UserTeam" ("user_id", "team_id", "role")
SELECT (
    SELECT u."id" FROM "User" u
    WHERE u."role" = 'ADMIN' OR u."id" = (SELECT MIN("id") FROM "User")
    ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 ELSE 1 END, u."id"
    LIMIT 1
  ),
  t."id",
  'OWNER'
FROM "Team" t
WHERE t."name" = 'legacy-team'
  AND (
    SELECT u."id" FROM "User" u
    WHERE u."role" = 'ADMIN' OR u."id" = (SELECT MIN("id") FROM "User")
    ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 ELSE 1 END, u."id"
    LIMIT 1
  ) IS NOT NULL;

CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "team_id" INTEGER NOT NULL,
    CONSTRAINT "Project_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Project" ("id", "created_at", "updated_at", "name", "description", "team_id")
SELECT
  p."id",
  p."created_at",
  p."updated_at",
  p."name",
  p."description",
  COALESCE(
    (
      SELECT t."id" FROM "Team" t
      INNER JOIN "User" u ON t."name" = u."username" || '-team'
      WHERE u."id" = p."owner_id"
    ),
    (SELECT t."id" FROM "Team" t WHERE t."name" = 'legacy-team' LIMIT 1)
  )
FROM "Project" p;

-- If any project still has no team (empty db edge), skip; COALESCE null would fail NOT NULL.
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_team_id_idx" ON "Project"("team_id");

CREATE TABLE "new_ProjectSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    "prompt" TEXT DEFAULT '',
    "locales" JSONB NOT NULL DEFAULT '["en","zh_cn","zh_tw","ja","ko","ru","fr","de","es","pt"]',
    "locale_fallback" TEXT NOT NULL DEFAULT 'en',
    CONSTRAINT "ProjectSettings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProjectSettings" ("id", "created_at", "updated_at", "project_id", "ocr_language", "ocr_engine", "prompt")
SELECT "id", "created_at", "updated_at", "project_id", "ocr_language", "ocr_engine", "prompt"
FROM "ProjectSettings";

DROP TABLE "ProjectSettings";
ALTER TABLE "new_ProjectSettings" RENAME TO "ProjectSettings";
CREATE UNIQUE INDEX "ProjectSettings_project_id_key" ON "ProjectSettings"("project_id");

CREATE TABLE "I18nKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STRING',
    "origin" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    CONSTRAINT "I18nKey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "I18nKey_project_id_key_key" ON "I18nKey"("project_id", "key");
CREATE INDEX "I18nKey_fingerprint_idx" ON "I18nKey"("fingerprint");

INSERT INTO "I18nKey" ("created_at", "updated_at", "project_id", "key", "type", "origin", "fingerprint")
SELECT
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  pg."project_id",
  t."i18n_key",
  'STRING',
  COALESCE(MIN(tr."origin"), ''),
  COALESCE(MIN(tr."fingerprint"), '')
FROM "Tag" t
INNER JOIN "Page" pg ON pg."id" = t."page_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
WHERE t."i18n_key" IS NOT NULL AND t."i18n_key" != '' AND pg."project_id" IS NOT NULL
GROUP BY pg."project_id", t."i18n_key";

CREATE TABLE "LocaleValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "i18n_key_id" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "draft_text" TEXT,
    "published_text" TEXT,
    CONSTRAINT "LocaleValue_i18n_key_id_fkey" FOREIGN KEY ("i18n_key_id") REFERENCES "I18nKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LocaleValue_i18n_key_id_locale_key" ON "LocaleValue"("i18n_key_id", "locale");

CREATE TABLE "I18nMigrateConflict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "vue_text" TEXT,
    "react_text" TEXT,
    "tag_ids" TEXT NOT NULL
);

-- Merge Vue/React wide tables into LocaleValue. Conflicts keep Vue as draft.
INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'en', MIN(v."en"), MIN(r."en"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."en") IS NOT NULL AND MIN(r."en") IS NOT NULL AND MIN(v."en") != MIN(r."en");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'en', COALESCE(MIN(v."en"), MIN(r."en")), COALESCE(MIN(v."en"), MIN(r."en"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."en"), MIN(r."en")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'zh_cn', MIN(v."zh_cn"), MIN(r."zh_cn"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."zh_cn") IS NOT NULL AND MIN(r."zh_cn") IS NOT NULL AND MIN(v."zh_cn") != MIN(r."zh_cn");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'zh_cn', COALESCE(MIN(v."zh_cn"), MIN(r."zh_cn")), COALESCE(MIN(v."zh_cn"), MIN(r."zh_cn"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."zh_cn"), MIN(r."zh_cn")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'zh_tw', MIN(v."zh_tw"), MIN(r."zh_tw"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."zh_tw") IS NOT NULL AND MIN(r."zh_tw") IS NOT NULL AND MIN(v."zh_tw") != MIN(r."zh_tw");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'zh_tw', COALESCE(MIN(v."zh_tw"), MIN(r."zh_tw")), COALESCE(MIN(v."zh_tw"), MIN(r."zh_tw"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."zh_tw"), MIN(r."zh_tw")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'ja', MIN(v."ja"), MIN(r."ja"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."ja") IS NOT NULL AND MIN(r."ja") IS NOT NULL AND MIN(v."ja") != MIN(r."ja");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'ja', COALESCE(MIN(v."ja"), MIN(r."ja")), COALESCE(MIN(v."ja"), MIN(r."ja"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."ja"), MIN(r."ja")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'ko', MIN(v."ko"), MIN(r."ko"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."ko") IS NOT NULL AND MIN(r."ko") IS NOT NULL AND MIN(v."ko") != MIN(r."ko");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'ko', COALESCE(MIN(v."ko"), MIN(r."ko")), COALESCE(MIN(v."ko"), MIN(r."ko"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."ko"), MIN(r."ko")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'ru', MIN(v."ru"), MIN(r."ru"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."ru") IS NOT NULL AND MIN(r."ru") IS NOT NULL AND MIN(v."ru") != MIN(r."ru");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'ru', COALESCE(MIN(v."ru"), MIN(r."ru")), COALESCE(MIN(v."ru"), MIN(r."ru"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."ru"), MIN(r."ru")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'fr', MIN(v."fr"), MIN(r."fr"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."fr") IS NOT NULL AND MIN(r."fr") IS NOT NULL AND MIN(v."fr") != MIN(r."fr");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'fr', COALESCE(MIN(v."fr"), MIN(r."fr")), COALESCE(MIN(v."fr"), MIN(r."fr"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."fr"), MIN(r."fr")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'de', MIN(v."de"), MIN(r."de"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."de") IS NOT NULL AND MIN(r."de") IS NOT NULL AND MIN(v."de") != MIN(r."de");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'de', COALESCE(MIN(v."de"), MIN(r."de")), COALESCE(MIN(v."de"), MIN(r."de"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."de"), MIN(r."de")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'es', MIN(v."es"), MIN(r."es"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."es") IS NOT NULL AND MIN(r."es") IS NOT NULL AND MIN(v."es") != MIN(r."es");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'es', COALESCE(MIN(v."es"), MIN(r."es")), COALESCE(MIN(v."es"), MIN(r."es"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."es"), MIN(r."es")) IS NOT NULL;

INSERT INTO "I18nMigrateConflict" ("created_at", "project_id", "key", "locale", "vue_text", "react_text", "tag_ids")
SELECT CURRENT_TIMESTAMP, ik."project_id", ik."key", 'pt', MIN(v."pt"), MIN(r."pt"), GROUP_CONCAT(DISTINCT t."id")
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING MIN(v."pt") IS NOT NULL AND MIN(r."pt") IS NOT NULL AND MIN(v."pt") != MIN(r."pt");
INSERT INTO "LocaleValue" ("created_at", "updated_at", "i18n_key_id", "locale", "draft_text", "published_text")
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ik."id", 'pt', COALESCE(MIN(v."pt"), MIN(r."pt")), COALESCE(MIN(v."pt"), MIN(r."pt"))
FROM "I18nKey" ik
INNER JOIN "Tag" t ON t."i18n_key" = ik."key"
INNER JOIN "Page" pg ON pg."id" = t."page_id" AND pg."project_id" = ik."project_id"
LEFT JOIN "Translation" tr ON tr."id" = t."translation_id"
LEFT JOIN "TranslationVue" v ON v."translation_id" = tr."id"
LEFT JOIN "TranslationReact" r ON r."translation_id" = tr."id"
GROUP BY ik."id" HAVING COALESCE(MIN(v."pt"), MIN(r."pt")) IS NOT NULL;

CREATE TABLE "new_Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tag_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "class_name" TEXT NOT NULL,
    "page_id" INTEGER NOT NULL,
    "i18n_key_id" INTEGER,
    "i18n_key" TEXT,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tag_i18n_key_id_fkey" FOREIGN KEY ("i18n_key_id") REFERENCES "I18nKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Tag" ("id", "tag_id", "created_at", "updated_at", "x", "y", "width", "height", "class_name", "page_id", "i18n_key", "i18n_key_id")
SELECT
  t."id",
  t."tag_id",
  t."created_at",
  t."updated_at",
  t."x",
  t."y",
  t."width",
  t."height",
  t."class_name",
  t."page_id",
  t."i18n_key",
  (
    SELECT ik."id" FROM "I18nKey" ik
    INNER JOIN "Page" pg ON pg."id" = t."page_id"
    WHERE ik."project_id" = pg."project_id" AND ik."key" = t."i18n_key"
  )
FROM "Tag" t;

DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";

CREATE TABLE "new_TranslationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "i18n_key_id" INTEGER,
    "fingerprint" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    CONSTRAINT "TranslationLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TranslationLog_i18n_key_id_fkey" FOREIGN KEY ("i18n_key_id") REFERENCES "I18nKey" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

INSERT INTO "new_TranslationLog" ("id", "action", "status", "created_at", "user_id", "fingerprint", "before_data", "after_data")
SELECT "id", "action", "status", "created_at", "user_id", "fingerprint", "before_data", "after_data"
FROM "TranslationLog";

DROP TABLE "TranslationLog";
ALTER TABLE "new_TranslationLog" RENAME TO "TranslationLog";
CREATE INDEX "TranslationLog_user_id_idx" ON "TranslationLog"("user_id");
CREATE INDEX "TranslationLog_created_at_idx" ON "TranslationLog"("created_at");

DROP TABLE "UserProject";
DROP TABLE "TranslationVue";
DROP TABLE "TranslationReact";
DROP TABLE "Translation";

DROP TRIGGER IF EXISTS "Translation_FTS_AfterInsert";
DROP TRIGGER IF EXISTS "Translation_FTS_AfterUpdate";
DROP TRIGGER IF EXISTS "Translation_FTS_AfterDelete";
DROP TABLE IF EXISTS "Translation_FTS";
DROP TABLE IF EXISTS "Translation_FTS_data";
DROP TABLE IF EXISTS "Translation_FTS_config";
DROP TABLE IF EXISTS "Translation_FTS_docsize";
DROP TABLE IF EXISTS "Translation_FTS_idx";

PRAGMA foreign_keys=ON;
