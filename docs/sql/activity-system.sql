-- ==========================================
-- 活动/比赛系统 数据库迁移
-- 说明：新建 activities、activity_participants、activity_votes 三张表
-- 执行方式：psql -U postgres -h localhost -d szhss_community -f docs/sql/activity-system.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    cover_url TEXT,
    description TEXT,
    rules TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    config JSONB,
    reward_coins INT DEFAULT 0,
    reward_badge VARCHAR(100),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_participants (
    id SERIAL PRIMARY KEY,
    activity_id INT REFERENCES activities(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50),
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_votes (
    id SERIAL PRIMARY KEY,
    activity_id INT REFERENCES activities(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    option_id INT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(activity_id, user_id, option_id)
);

-- 索引：加速活动列表与参与统计查询
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_time ON activities(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_activity_participants_activity ON activity_participants(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_votes_activity ON activity_votes(activity_id);
