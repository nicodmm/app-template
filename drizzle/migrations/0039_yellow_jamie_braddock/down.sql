DROP INDEX IF EXISTS "tasks_project_idx";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_id_task_projects_id_fk";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "project_id";
-- Las tareas de proyecto/sueltas tienen account_id NULL y no pueden existir en el
-- esquema previo (account_id era NOT NULL). El rollback las elimina para poder
-- restaurar la restricción. ATENCIÓN: esto descarta esas tareas.
DELETE FROM "tasks" WHERE "account_id" IS NULL;
ALTER TABLE "tasks" ALTER COLUMN "account_id" SET NOT NULL;
DROP TABLE IF EXISTS "task_project_members";
DROP TABLE IF EXISTS "task_projects";
