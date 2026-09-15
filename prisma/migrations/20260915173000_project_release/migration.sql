-- CreateTable
CREATE TABLE "ProjectRelease" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectRelease_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageRelease" (
    "page_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,

    PRIMARY KEY ("page_id", "release_id"),
    CONSTRAINT "PageRelease_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageRelease_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "ProjectRelease" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "I18nKeyRelease" (
    "i18n_key_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,

    PRIMARY KEY ("i18n_key_id", "release_id"),
    CONSTRAINT "I18nKeyRelease_i18n_key_id_fkey" FOREIGN KEY ("i18n_key_id") REFERENCES "I18nKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "I18nKeyRelease_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "ProjectRelease" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectRelease_project_id_idx" ON "ProjectRelease"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRelease_project_id_name_key" ON "ProjectRelease"("project_id", "name");

-- CreateIndex
CREATE INDEX "PageRelease_release_id_idx" ON "PageRelease"("release_id");

-- CreateIndex
CREATE INDEX "I18nKeyRelease_release_id_idx" ON "I18nKeyRelease"("release_id");

-- Release labels only ever point at content that already exists, so there is
-- nothing to backfill: zero Release rows means every Page and I18nKey is
-- "Unassigned", and the All view is unchanged from before this migration.