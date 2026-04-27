-- No-op: deleted lifecycle events cannot be restored — Meta won't replay
-- old activity feed entries beyond its 90-day window. If sync-changes.ts is
-- re-introduced for `ad_run_status_change` and a fresh sync is run, recent
-- events will repopulate naturally.
SELECT 1;
