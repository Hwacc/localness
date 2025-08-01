-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PageSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "page_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "PageSetting_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PageSetting" ("created_at", "id", "ocr_engine", "ocr_language", "page_id", "updated_at") SELECT "created_at", "id", "ocr_engine", "ocr_language", "page_id", "updated_at" FROM "PageSetting";
DROP TABLE "PageSetting";
ALTER TABLE "new_PageSetting" RENAME TO "PageSetting";
CREATE UNIQUE INDEX "PageSetting_page_id_key" ON "PageSetting"("page_id");
CREATE TABLE "new_ProjectSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "ProjectSetting_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectSetting" ("created_at", "id", "ocr_engine", "ocr_language", "project_id", "updated_at") SELECT "created_at", "id", "ocr_engine", "ocr_language", "project_id", "updated_at" FROM "ProjectSetting";
DROP TABLE "ProjectSetting";
ALTER TABLE "new_ProjectSetting" RENAME TO "ProjectSetting";
CREATE UNIQUE INDEX "ProjectSetting_project_id_key" ON "ProjectSetting"("project_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
