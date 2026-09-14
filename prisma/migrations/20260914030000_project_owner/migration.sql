-- CreateTable
CREATE TABLE "ProjectOwner" (
    "user_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "project_id"),
    CONSTRAINT "ProjectOwner_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectOwner_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectOwner_project_id_idx" ON "ProjectOwner"("project_id");
