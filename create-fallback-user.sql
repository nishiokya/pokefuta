-- Create fallback user for testing
-- Run this in your Supabase SQL editor

INSERT INTO app_user (auth_uid, display_name, created_at, updated_at)
VALUES ('nishiokya', 'Demo User (nishiokya)', NOW(), NOW())
ON CONFLICT (auth_uid) DO NOTHING;

-- Verify the user was created
SELECT id, auth_uid, display_name, created_at FROM app_user WHERE auth_uid = 'nishiokya';
