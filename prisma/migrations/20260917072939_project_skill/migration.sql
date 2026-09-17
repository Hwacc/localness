-- CreateTable
CREATE TABLE "ProjectSkill" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    CONSTRAINT "ProjectSkill_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSkill_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectSkill_project_id_idx" ON "ProjectSkill"("project_id");

-- CreateIndex
CREATE INDEX "ProjectSkill_created_by_idx" ON "ProjectSkill"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSkill_project_id_name_key" ON "ProjectSkill"("project_id", "name");
