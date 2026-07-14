-- 成就徽章系统 - 数据库变更
-- 为 users 表增加统计计数器字段

ALTER TABLE users ADD COLUMN IF NOT EXISTS total_likes_received INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_favorites_received INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_replies_received INT DEFAULT 0;
