-- ============================================================
-- 私信系统数据库变更 SQL
-- 使用方式: 在 psql 或 pgAdmin 中执行以下语句
-- ============================================================

-- 1. 修改 users 表，增加私信开关（默认关闭，防骚扰）
ALTER TABLE users ADD COLUMN allow_messages BOOLEAN DEFAULT false;

-- 2. 创建私信表
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);

-- 3. 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at
);
