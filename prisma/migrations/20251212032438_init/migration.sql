-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "avatar" TEXT
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_username" TEXT,
    "owner_id" INTEGER,
    CONSTRAINT "Project_owner_username_owner_id_fkey" FOREIGN KEY ("owner_username", "owner_id") REFERENCES "User" ("username", "id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "project_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    "prompt" TEXT DEFAULT '',
    CONSTRAINT "ProjectSettings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProject" (
    "user_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "project_id"),
    CONSTRAINT "UserProject_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserProject_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_data" JSONB,
    "after_data" JSONB,
    "project_id" INTEGER,
    "user_id" INTEGER,
    CONSTRAINT "ProjectLog_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "ProjectLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Page" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "project_id" INTEGER,
    CONSTRAINT "Page_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "page_id" INTEGER NOT NULL,
    "ocr_language" TEXT NOT NULL,
    "ocr_engine" INTEGER NOT NULL,
    "prompt" TEXT DEFAULT '',
    CONSTRAINT "PageSettings_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_data" JSONB,
    "after_data" JSONB,
    "page_id" INTEGER,
    "user_id" INTEGER,
    CONSTRAINT "PageLog_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "PageLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
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
    "translation_id" INTEGER,
    "i18n_key" TEXT,
    CONSTRAINT "Tag_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Tag_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TagSettings" (
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

-- CreateTable
CREATE TABLE "TagLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_data" JSONB,
    "after_data" JSONB,
    "tag_id" INTEGER,
    "user_id" INTEGER,
    CONSTRAINT "TagLog_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "TagLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "origin" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TranslationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "translation_id" INTEGER,
    "fingerprint" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    CONSTRAINT "TranslationLog_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "TranslationLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationVue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "en" TEXT,
    "zh_cn" TEXT,
    "zh_tw" TEXT,
    "ja" TEXT,
    "ko" TEXT,
    "ru" TEXT,
    "fr" TEXT,
    "de" TEXT,
    "es" TEXT,
    "pt" TEXT,
    "translation_id" INTEGER NOT NULL,
    CONSTRAINT "TranslationVue_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationReact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "en" TEXT,
    "zh_cn" TEXT,
    "zh_tw" TEXT,
    "ja" TEXT,
    "ko" TEXT,
    "ru" TEXT,
    "fr" TEXT,
    "de" TEXT,
    "es" TEXT,
    "pt" TEXT,
    "translation_id" INTEGER NOT NULL,
    CONSTRAINT "TranslationReact_translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_id_key" ON "User"("username", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSettings_project_id_key" ON "ProjectSettings"("project_id");

-- CreateIndex
CREATE INDEX "ProjectLog_user_id_idx" ON "ProjectLog"("user_id");

-- CreateIndex
CREATE INDEX "ProjectLog_created_at_idx" ON "ProjectLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PageSettings_page_id_key" ON "PageSettings"("page_id");

-- CreateIndex
CREATE INDEX "PageLog_user_id_idx" ON "PageLog"("user_id");

-- CreateIndex
CREATE INDEX "PageLog_created_at_idx" ON "PageLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "TagSettings_tag_id_key" ON "TagSettings"("tag_id");

-- CreateIndex
CREATE INDEX "TagLog_user_id_idx" ON "TagLog"("user_id");

-- CreateIndex
CREATE INDEX "TagLog_created_at_idx" ON "TagLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_fingerprint_key" ON "Translation"("fingerprint");

-- CreateIndex
CREATE INDEX "Translation_fingerprint_idx" ON "Translation"("fingerprint");

-- CreateIndex
CREATE INDEX "TranslationLog_user_id_idx" ON "TranslationLog"("user_id");

-- CreateIndex
CREATE INDEX "TranslationLog_created_at_idx" ON "TranslationLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationVue_translation_id_key" ON "TranslationVue"("translation_id");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationReact_translation_id_key" ON "TranslationReact"("translation_id");
