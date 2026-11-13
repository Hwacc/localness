-- AlterTable
ALTER TABLE "ProjectSkill" ADD COLUMN "agents" JSONB NOT NULL DEFAULT '{"ids":[],"custom":[]}';
