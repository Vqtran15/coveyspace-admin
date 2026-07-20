ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS scheduled_delete_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scheduled_delete_at TIMESTAMPTZ;
