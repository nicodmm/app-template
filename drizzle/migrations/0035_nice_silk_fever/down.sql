ALTER TABLE "tasks" DROP COLUMN IF EXISTS "is_public";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sort_order";
DROP TABLE IF EXISTS "notifications";
DROP TABLE IF EXISTS "task_attachments";
DROP TABLE IF EXISTS "task_comment_mentions";
DROP TABLE IF EXISTS "task_comments";
DROP TABLE IF EXISTS "task_meeting_mentions";
