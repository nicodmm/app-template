-- Deduplicate previously-imported Drive files, keeping the oldest row per file.
-- Concurrent "Sincronizar ahora" clicks before the unique index existed
-- allowed the same google_drive_file_id to be inserted multiple times.

DELETE FROM "transcripts" t1
USING "transcripts" t2
WHERE t1.google_drive_file_id IS NOT NULL
  AND t1.google_drive_file_id = t2.google_drive_file_id
  AND (t1.created_at, t1.id) > (t2.created_at, t2.id);
--> statement-breakpoint

DELETE FROM "context_documents" c1
USING "context_documents" c2
WHERE c1.google_drive_file_id IS NOT NULL
  AND c1.google_drive_file_id = c2.google_drive_file_id
  AND (c1.created_at, c1.id) > (c2.created_at, c2.id);
--> statement-breakpoint

-- Replace the non-unique indexes with partial unique indexes so the database
-- itself rejects duplicate imports (our onConflictDoNothing relies on this).

DROP INDEX IF EXISTS "transcripts_drive_file_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "context_documents_drive_file_idx";
--> statement-breakpoint

CREATE UNIQUE INDEX "transcripts_drive_file_unique_idx"
  ON "transcripts" ("google_drive_file_id")
  WHERE "google_drive_file_id" IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "context_documents_drive_file_unique_idx"
  ON "context_documents" ("google_drive_file_id")
  WHERE "google_drive_file_id" IS NOT NULL;
