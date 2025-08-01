/*
  Warnings:

  - A unique constraint covering the columns `[md5]` on the table `Translation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Translation_md5_key" ON "Translation"("md5");
