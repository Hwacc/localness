-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PageSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "page_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    "prompt" TEXT DEFAULT '',
    CONSTRAINT "PageSettings_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PageSettings" ("created_at", "id", "ocr_engine", "ocr_language", "page_id", "prompt", "updated_at") SELECT "created_at", "id", "ocr_engine", "ocr_language", "page_id", "prompt", "updated_at" FROM "PageSettings";
DROP TABLE "PageSettings";
ALTER TABLE "new_PageSettings" RENAME TO "PageSettings";
CREATE UNIQUE INDEX "PageSettings_page_id_key" ON "PageSettings"("page_id");
CREATE TABLE "new_ProjectSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    "prompt" TEXT DEFAULT '',
    CONSTRAINT "ProjectSettings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectSettings" ("created_at", "id", "ocr_engine", "ocr_language", "project_id", "prompt", "updated_at") SELECT "created_at", "id", "ocr_engine", "ocr_language", "project_id", "prompt", "updated_at" FROM "ProjectSettings";
DROP TABLE "ProjectSettings";
ALTER TABLE "new_ProjectSettings" RENAME TO "ProjectSettings";
CREATE UNIQUE INDEX "ProjectSettings_project_id_key" ON "ProjectSettings"("project_id");
CREATE TABLE "new_TagSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "style" JSONB NOT NULL,
    "label_style" JSONB NOT NULL,
    "prompt" TEXT DEFAULT '',
    CONSTRAINT "TagSettings_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TagSettings" ("created_at", "id", "label_style", "locked", "prompt", "style", "tag_id", "updated_at") SELECT "created_at", "id", "label_style", "locked", "prompt", "style", "tag_id", "updated_at" FROM "TagSettings";
DROP TABLE "TagSettings";
ALTER TABLE "new_TagSettings" RENAME TO "TagSettings";
CREATE UNIQUE INDEX "TagSettings_tag_id_key" ON "TagSettings"("tag_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
