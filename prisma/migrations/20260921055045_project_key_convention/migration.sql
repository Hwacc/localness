-- Project-level i18n key naming convention.
--
-- Written as ADD COLUMN rather than the table redefine `prisma migrate diff`
-- emits. That redefine rewrites every column, and on Prisma 7.10 + SQLite it
-- renders the `locales` Json default without its quotes -- SQLite then reads
-- ["en","zh_cn",...] as a bracketed identifier and stores `"en","zh_cn",...`,
-- silently dropping the brackets. Adding columns one by one leaves the
-- existing defaults, and the data, untouched.
ALTER TABLE "ProjectSettings" ADD COLUMN "key_prefix" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProjectSettings" ADD COLUMN "key_separator" TEXT NOT NULL DEFAULT '_';
ALTER TABLE "ProjectSettings" ADD COLUMN "key_style" TEXT NOT NULL DEFAULT 'snake_case';
ALTER TABLE "ProjectSettings" ADD COLUMN "key_max_depth" INTEGER NOT NULL DEFAULT 4;
