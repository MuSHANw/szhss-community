-- 自习室系统深度优化
-- 使用说明：psql -U postgres -h localhost -d szhss_community -f docs/sql/study-upgrade.sql

ALTER TABLE study_room_members ADD COLUMN IF NOT EXISTS focus_duration INT DEFAULT 25;
ALTER TABLE study_room_members ADD COLUMN IF NOT EXISTS rest_duration INT DEFAULT 5;
ALTER TABLE study_room_members ADD COLUMN IF NOT EXISTS study_goal VARCHAR(100);
ALTER TABLE study_room_members ADD COLUMN IF NOT EXISTS cheers_today INT DEFAULT 0;
ALTER TABLE study_room_members ADD COLUMN IF NOT EXISTS cheers_last_date DATE;

CREATE TABLE IF NOT EXISTS study_stats (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    room_id INT REFERENCES study_rooms(id) ON DELETE CASCADE,
    focus_minutes INT NOT NULL,
    completed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_stats_user ON study_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_study_stats_completed ON study_stats(completed_at);

-- 修复 session_start 时区问题：改为带时区类型
-- 执行前建议先清空进行中的自习记录：DELETE FROM study_room_members;
ALTER TABLE study_room_members
ALTER COLUMN session_start TYPE TIMESTAMPTZ
USING session_start AT TIME ZONE 'UTC';
