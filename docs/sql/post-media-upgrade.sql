-- ========================================
-- 帖子媒体独立存储升级
-- 在 posts 表中增加 images/videos 数组字段，
-- 并创建 post_media 表用于存储媒体 URL
-- ========================================

-- 1. 给 posts 表增加数组字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS videos TEXT[] DEFAULT '{}';

-- 2. 创建 post_media 表
CREATE TABLE IF NOT EXISTS post_media (
    id SERIAL PRIMARY KEY,
    post_id INT REFERENCES posts(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(10) NOT NULL DEFAULT 'image',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id);
