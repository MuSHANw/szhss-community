-- ========================================
-- 数据仪表盘 + 设置页细化升级
-- 新增 show_stats 隐私设置字段
-- ========================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS show_stats BOOLEAN DEFAULT true;
