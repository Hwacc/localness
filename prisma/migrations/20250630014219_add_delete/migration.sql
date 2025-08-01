/*
  Warnings:

  - You are about to drop the `_ProjectToUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `content` on the `Tag` table. All the data in the column will be lost.
  - You are about to drop the column `editable` on the `Tag` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "_ProjectToUser_B_index";

-- DropIndex
DROP INDEX "_ProjectToUser_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ProjectToUser";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "UserProject" (
    "user_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "project_id"),
    CONSTRAINT "UserProject_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserProject_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "project_id" INTEGER,
    CONSTRAINT "Page_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("created_at", "id", "image", "name", "project_id", "updated_at") SELECT "created_at", "id", "image", "name", "project_id", "updated_at" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
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
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "style" JSONB NOT NULL,
    "i18n_key" TEXT,
    "text" TEXT,
    "page_id" INTEGER NOT NULL,
    "translation_id" INTEGER,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tag_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("class_name", "created_at", "height", "i18n_key", "id", "page_id", "style", "tag_id", "translation_id", "updated_at", "width", "x", "y") SELECT "class_name", "created_at", "height", "i18n_key", "id", "page_id", "style", "tag_id", "translation_id", "updated_at", "width", "x", "y" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_i18n_key_key" ON "Tag"("i18n_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
