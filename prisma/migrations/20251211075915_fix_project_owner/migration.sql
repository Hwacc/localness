-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_username" TEXT,
    "owner_id" INTEGER,
    CONSTRAINT "Project_owner_username_owner_id_fkey" FOREIGN KEY ("owner_username", "owner_id") REFERENCES "User" ("username", "id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("created_at", "description", "id", "name", "owner_id", "owner_username", "updated_at") SELECT "created_at", "description", "id", "name", "owner_id", "owner_username", "updated_at" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
