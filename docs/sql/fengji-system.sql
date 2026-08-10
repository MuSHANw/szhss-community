-- ============================================================
-- 风纪广场系统 数据库变更 SQL
-- 使用方式：psql -U postgres -h localhost -d szhss_community -f docs/sql/fengji-system.sql
-- ============================================================

-- 1. 风纪委员申请表
CREATE TABLE IF NOT EXISTS fengji_applications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by INT REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fengji_app_user ON fengji_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_fengji_app_status ON fengji_applications(status);

-- 2. 风纪委员投票表（同一用户对同一案件只能投一票）
CREATE TABLE IF NOT EXISTS fengji_votes (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES reports(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    vote_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(report_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_fengji_votes_report ON fengji_votes(report_id);

-- 3. 风纪委员身份标记（users 表增加 is_fengji）
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_fengji BOOLEAN DEFAULT false;

-- 4. 帖子隐藏标记（posts 表增加 is_hidden，违纪票达标后自动隐藏）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- 5. 回复隐藏标记（replies 表增加 is_hidden，违纪票达标后隐藏违规回复）
ALTER TABLE replies ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
