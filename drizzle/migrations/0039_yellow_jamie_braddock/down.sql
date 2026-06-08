DROP INDEX IF EXISTS "tasks_project_idx";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_id_task_projects_id_fk";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "project_id";
ALTER TABLE "tasks" ALTER COLUMN "account_id" SET NOT NULL;
DROP TABLE IF EXISTS "task_project_members";
DROP TABLE IF EXISTS "task_projects";
