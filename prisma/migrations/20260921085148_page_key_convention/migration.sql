-- A page's key naming convention, inherited from the project until it is set.
--
-- All four columns are nullable with no default, and that is load-bearing: the
-- empty string is a meaningful prefix value ("no prefix"), so it cannot also
-- mean "inherit". NULL is the only value that can carry that meaning, which is
-- also why they are plain ADD COLUMNs — no table rewrite, so nothing existing
-- is touched.
ALTER TABLE "PageSettings" ADD COLUMN "key_max_depth" INTEGER;
ALTER TABLE "PageSettings" ADD COLUMN "key_prefix" TEXT;
ALTER TABLE "PageSettings" ADD COLUMN "key_separator" TEXT;
ALTER TABLE "PageSettings" ADD COLUMN "key_style" TEXT;
