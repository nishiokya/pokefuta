-- Migration: Prefecture Badge System
-- Description: Adds a system to track badges for completing all manholes in each prefecture
-- This system supports outdating badges when new manholes are added

-- 1. Create prefecture master table
CREATE TABLE IF NOT EXISTS prefecture (
  id SERIAL PRIMARY KEY,
  code VARCHAR(2) UNIQUE NOT NULL,  -- e.g., "01" for Hokkaido
  name VARCHAR(10) NOT NULL UNIQUE, -- e.g., "北海道"
  name_en VARCHAR(50),              -- e.g., "Hokkaido"
  display_order INT NOT NULL,       -- Order for display (1-47)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create prefecture_badge table
-- Tracks user badges for each prefecture, with status to handle outdating
CREATE TABLE IF NOT EXISTS prefecture_badge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  prefecture_id INTEGER NOT NULL REFERENCES prefecture(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'outdated', 'completed')),
  -- 'active': Currently holds this badge
  -- 'outdated': Previously completed but new manholes were added to this prefecture
  -- 'completed': Marked as a completed achievement (for historical tracking)
  
  -- Timestamps for badge lifecycle
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outdated_at TIMESTAMPTZ,  -- When the badge was outdated (if applicable)
  
  -- Snapshot of completion data at the time of badge acquisition
  completion_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100,  -- 0-100
  manhole_count_at_completion INT NOT NULL DEFAULT 0,  -- How many total manholes existed at completion
  visited_manhole_count INT NOT NULL DEFAULT 0,  -- How many the user visited
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_prefecture_badge_user_id ON prefecture_badge(user_id);
CREATE INDEX IF NOT EXISTS idx_prefecture_badge_prefecture_id ON prefecture_badge(prefecture_id);
CREATE INDEX IF NOT EXISTS idx_prefecture_badge_status ON prefecture_badge(status);
CREATE INDEX IF NOT EXISTS idx_prefecture_badge_user_status ON prefecture_badge(user_id, status);
-- Partial unique index to ensure one active badge per user per prefecture
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_badge_per_user_prefecture 
  ON prefecture_badge(user_id, prefecture_id) WHERE status = 'active';

-- 4. Create view: prefecture_completion_tracker
-- Calculates current completion status for each user-prefecture combination
-- NOTE: manhole.prefecture is a TEXT column with prefecture name (e.g., '北海道')
-- We join via p.name to match the string value
CREATE OR REPLACE VIEW prefecture_completion_tracker AS
SELECT
  pb.id AS badge_id,
  pb.user_id,
  p.id AS prefecture_id,
  p.code,
  p.name,
  p.name_en,
  pb.status,
  
  -- Current statistics
  COUNT(DISTINCT m.id) AS total_manholes_now,
  COUNT(DISTINCT CASE WHEN v.id IS NOT NULL THEN m.id END) AS visited_manholes_count,
  
  -- Calculate current completion percentage
  ROUND(
    COUNT(DISTINCT CASE WHEN v.id IS NOT NULL THEN m.id END)::NUMERIC / 
    NULLIF(COUNT(DISTINCT m.id), 0) * 100,
    2
  ) AS current_completion_percentage,
  
  -- Badge history
  pb.acquired_at,
  pb.outdated_at,
  pb.manhole_count_at_completion,
  pb.visited_manhole_count,
  pb.completion_percentage,
  
  pb.created_at,
  pb.updated_at
FROM
  prefecture p
LEFT JOIN prefecture_badge pb ON p.id = pb.prefecture_id AND pb.status IN ('active', 'outdated')
LEFT JOIN manhole m ON p.name = m.prefecture  -- Join via prefecture name (string match)
LEFT JOIN visit v ON m.id = v.manhole_id AND v.user_id = pb.user_id
GROUP BY
  pb.id, pb.user_id, p.id, p.code, p.name, p.name_en, pb.status,
  pb.acquired_at, pb.outdated_at, pb.manhole_count_at_completion,
  pb.visited_manhole_count, pb.completion_percentage, pb.created_at, pb.updated_at
ORDER BY
  pb.user_id, p.display_order;

-- 5. Extend app_user table to track all-prefecture completion
ALTER TABLE app_user 
ADD COLUMN IF NOT EXISTS all_prefectures_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS all_prefectures_outdated_at TIMESTAMPTZ;

-- 6. Create function to check and update prefecture badge status
-- This function is called when a new manhole is added to a prefecture
-- NOTE: manhole.prefecture is a TEXT column, so we need to match by name
CREATE OR REPLACE FUNCTION update_prefecture_badges_on_manhole_add()
RETURNS TRIGGER AS $$
DECLARE
  v_prefecture_id INTEGER;
BEGIN
  -- Find the prefecture ID by matching the prefecture name
  SELECT p.id INTO v_prefecture_id
  FROM prefecture p
  WHERE p.name = NEW.prefecture;
  
  -- If prefecture not found, just return (new prefecture not in master table)
  IF v_prefecture_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Mark all active badges for this prefecture as outdated
  UPDATE prefecture_badge
  SET
    status = 'outdated',
    outdated_at = NOW(),
    updated_at = NOW()
  WHERE
    prefecture_id = v_prefecture_id
    AND status = 'active';
  
  -- Clear the global all_prefectures_completed_at if any user had it
  -- (since a prefecture badge is now outdated)
  UPDATE app_user
  SET
    all_prefectures_outdated_at = NOW(),
    updated_at = NOW()
  WHERE
    id IN (
      SELECT user_id FROM prefecture_badge
      WHERE prefecture_id = v_prefecture_id AND status = 'outdated'
    );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for when a new manhole is added
-- NOTE: This trigger needs to be attached to the manhole table's INSERT
-- We need to reference prefecture by ID, so first we'll check if manhole has prefecture_id
-- If it only has prefecture (string), we'll need to handle that differently

-- First, let's create the trigger (it will be activated when manhole INSERT happens)
DROP TRIGGER IF EXISTS trigger_update_badges_on_manhole_add ON manhole;
CREATE TRIGGER trigger_update_badges_on_manhole_add
AFTER INSERT ON manhole
FOR EACH ROW
EXECUTE FUNCTION update_prefecture_badges_on_manhole_add();

-- 8. Create function to handle badge completion
-- Called when a user has visited all manholes in a prefecture
-- Accepts prefecture_id as parameter
CREATE OR REPLACE FUNCTION create_prefecture_badge(
  p_user_id UUID,
  p_prefecture_id INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_badge_id UUID;
  v_prefecture_name TEXT;
  v_total_manholes INT;
  v_visited_count INT;
BEGIN
  -- Get prefecture name for matching with manhole.prefecture
  SELECT name INTO v_prefecture_name
  FROM prefecture
  WHERE id = p_prefecture_id;
  
  IF v_prefecture_name IS NULL THEN
    RETURN NULL;  -- Prefecture not found
  END IF;
  
  -- Count total manholes in prefecture (match by string)
  SELECT COUNT(*) INTO v_total_manholes
  FROM manhole m
  WHERE m.prefecture = v_prefecture_name;
  
  -- Count visited distinct manholes by user
  SELECT COUNT(DISTINCT v.manhole_id) INTO v_visited_count
  FROM visit v
  INNER JOIN manhole m ON v.manhole_id = m.id
  WHERE v.user_id = p_user_id AND m.prefecture = v_prefecture_name;
  
  -- Only create badge if all manholes visited
  IF v_visited_count >= v_total_manholes AND v_total_manholes > 0 THEN
    -- Insert new badge
    INSERT INTO prefecture_badge (
      user_id,
      prefecture_id,
      status,
      completion_percentage,
      manhole_count_at_completion,
      visited_manhole_count
    ) VALUES (
      p_user_id,
      p_prefecture_id,
      'active',
      100,
      v_total_manholes,
      v_visited_count
    )
    RETURNING id INTO v_badge_id;
    
    -- Check if user has completed all prefectures
    PERFORM check_and_update_all_prefectures_completion(p_user_id);
    
    RETURN v_badge_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to check if user has completed all prefectures
CREATE OR REPLACE FUNCTION check_and_update_all_prefectures_completion(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_completed_prefectures INT;
  v_total_prefectures INT;
BEGIN
  -- Count active badges
  SELECT COUNT(*) INTO v_completed_prefectures
  FROM prefecture_badge
  WHERE user_id = p_user_id AND status = 'active';
  
  -- Count total prefectures
  SELECT COUNT(*) INTO v_total_prefectures
  FROM prefecture;
  
  -- If user has completed all prefectures, update the flag
  IF v_completed_prefectures = v_total_prefectures THEN
    UPDATE app_user
    SET
      all_prefectures_completed_at = NOW(),
      all_prefectures_outdated_at = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. Initial data: Insert all 47 prefectures
INSERT INTO prefecture (code, name, name_en, display_order) VALUES
  ('01', '北海道', 'Hokkaido', 1),
  ('02', '青森県', 'Aomori', 2),
  ('03', '岩手県', 'Iwate', 3),
  ('04', '宮城県', 'Miyagi', 4),
  ('05', '秋田県', 'Akita', 5),
  ('06', '山形県', 'Yamagata', 6),
  ('07', '福島県', 'Fukushima', 7),
  ('08', '茨城県', 'Ibaraki', 8),
  ('09', '栃木県', 'Tochigi', 9),
  ('10', '群馬県', 'Gunma', 10),
  ('11', '埼玉県', 'Saitama', 11),
  ('12', '千葉県', 'Chiba', 12),
  ('13', '東京都', 'Tokyo', 13),
  ('14', '神奈川県', 'Kanagawa', 14),
  ('15', '新潟県', 'Niigata', 15),
  ('16', '富山県', 'Toyama', 16),
  ('17', '石川県', 'Ishikawa', 17),
  ('18', '福井県', 'Fukui', 18),
  ('19', '山梨県', 'Yamanashi', 19),
  ('20', '長野県', 'Nagano', 20),
  ('21', '岐阜県', 'Gifu', 21),
  ('22', '静岡県', 'Shizuoka', 22),
  ('23', '愛知県', 'Aichi', 23),
  ('24', '三重県', 'Mie', 24),
  ('25', '滋賀県', 'Shiga', 25),
  ('26', '京都府', 'Kyoto', 26),
  ('27', '大阪府', 'Osaka', 27),
  ('28', '兵庫県', 'Hyogo', 28),
  ('29', '奈良県', 'Nara', 29),
  ('30', '和歌山県', 'Wakayama', 30),
  ('31', '鳥取県', 'Tottori', 31),
  ('32', '島根県', 'Shimane', 32),
  ('33', '岡山県', 'Okayama', 33),
  ('34', '広島県', 'Hiroshima', 34),
  ('35', '山口県', 'Yamaguchi', 35),
  ('36', '徳島県', 'Tokushima', 36),
  ('37', '香川県', 'Kagawa', 37),
  ('38', '愛媛県', 'Ehime', 38),
  ('39', '高知県', 'Kochi', 39),
  ('40', '福岡県', 'Fukuoka', 40),
  ('41', '佐賀県', 'Saga', 41),
  ('42', '長崎県', 'Nagasaki', 42),
  ('43', '熊本県', 'Kumamoto', 43),
  ('44', '大分県', 'Oita', 44),
  ('45', '宮崎県', 'Miyazaki', 45),
  ('46', '鹿児島県', 'Kagoshima', 46),
  ('47', '沖縄県', 'Okinawa', 47)
ON CONFLICT (code) DO NOTHING;

-- 11. Create RLS policies for prefecture_badge
ALTER TABLE prefecture_badge ENABLE ROW LEVEL SECURITY;

-- Users can view their own badges
CREATE POLICY prefecture_badge_users_select_own ON prefecture_badge
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own badges (though typically done via functions)
CREATE POLICY prefecture_badge_users_insert_own ON prefecture_badge
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow updates only for the same user (status changes, etc.)
CREATE POLICY prefecture_badge_users_update_own ON prefecture_badge
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 12. Grant permissions
GRANT SELECT ON prefecture TO authenticated;
GRANT SELECT ON prefecture_badge TO authenticated;
GRANT INSERT, UPDATE ON prefecture_badge TO authenticated;
GRANT EXECUTE ON FUNCTION create_prefecture_badge TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_update_all_prefectures_completion TO authenticated;
