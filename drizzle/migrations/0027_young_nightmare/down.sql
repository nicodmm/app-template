ALTER TABLE "meta_ads" DROP COLUMN IF EXISTS "public_name";
ALTER TABLE "meta_campaigns" DROP COLUMN IF EXISTS "public_name";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "client_summary_updated_at";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "client_summary";
DROP TABLE IF EXISTS "account_share_links";
