DROP INDEX IF EXISTS "tasks_parent_idx";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_parent_task_id_tasks_id_fk";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "parent_task_id";
