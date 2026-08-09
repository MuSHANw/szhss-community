-- ========================================
-- 帖子置顶功能升级
-- 新增 is_pinned 和 pinned_at 字段
-- ========================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;
