-- Projects with no ProjectOwner row would have nobody who can configure Git
-- after Team Owner stops being an implicit steward. Fill those only.
INSERT INTO "ProjectOwner" ("user_id", "project_id")
SELECT ut."user_id", p."id"
FROM "Project" p
INNER JOIN "UserTeam" ut ON ut."team_id" = p."team_id" AND ut."role" = 'OWNER'
WHERE NOT EXISTS (
  SELECT 1 FROM "ProjectOwner" po WHERE po."project_id" = p."id"
);
