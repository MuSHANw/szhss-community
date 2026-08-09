-- ========================================
-- 社区公告系统
-- ========================================

CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_confirmations (
    id SERIAL PRIMARY KEY,
    announcement_id INT REFERENCES announcements(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    confirmed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(announcement_id, user_id)
);
