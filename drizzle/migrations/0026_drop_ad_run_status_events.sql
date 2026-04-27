-- Remove the noisy Meta lifecycle review events that were never actionable.
-- Meta fires `update_ad_run_status` on each ad's review pipeline
-- (pending_processing → pending_review → active), which flooded the
-- "Cambios de Meta" timeline with one row per state per ad.
-- Going forward, sync-changes.ts no longer ingests these (event type
-- mapping was removed in the same change). This statement cleans up the
-- existing rows so the timeline reflects only actionable changes.
DELETE FROM "meta_change_events" WHERE "event_type" = 'ad_run_status_change';
