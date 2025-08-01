/*
  Warnings:

  - You are about to drop the `PageSetting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectSetting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PageSetting";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProjectSetting";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProjectSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "ProjectSettings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "page_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    CONSTRAINT "PageSettings_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSettings_project_id_key" ON "ProjectSettings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "PageSettings_page_id_key" ON "PageSettings"("page_id");
