-- GUEST is removed. Existing guest accounts become ordinary USER accounts.
UPDATE "User" SET "role" = 'USER' WHERE "role" = 'GUEST';
