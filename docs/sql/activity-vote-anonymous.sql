-- ========================================
-- 活动投票支持未登录（匿名投票 + IP 防刷）
--
-- 执行方式（服务器上）：
--   psql -U postgres -h localhost -d szhss_community -f docs/sql/activity-vote-anonymous.sql
--
-- 变更说明：
--   1. activity_votes.user_id 允许为 NULL（匿名投票）
--   2. 新增 ip_address 字段（记录匿名投票来源，用于防刷）
--   3. 删除旧的 UNIQUE(activity_id, user_id, option_id) 约束
--   4. 改为部分唯一索引：登录用户对同一活动只能投 1 票（不管选项）
--   5. 新增 (activity_id, ip_address, created_at) 索引，加速 IP 防刷统计
-- ========================================

-- 1. user_id 允许为 NULL（匿名投票）
ALTER TABLE activity_votes ALTER COLUMN user_id DROP NOT NULL;

-- 2. 新增 IP 地址字段（VARCHAR(45) 兼容 IPv4/IPv6）
ALTER TABLE activity_votes ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

-- 3. 删除旧的唯一约束（约束名随版本可能不同，动态查找删除）
DO $$
DECLARE cname text;
BEGIN
    FOR cname IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'activity_votes'
          AND con.contype = 'u'
          AND EXISTS (
              SELECT 1 FROM pg_attribute att
              WHERE att.attrelid = rel.oid AND att.attname = 'user_id'
                AND att.attnum = ANY(con.conkey)
          )
    LOOP
        EXECUTE 'ALTER TABLE activity_votes DROP CONSTRAINT IF EXISTS ' || quote_ident(cname);
    END LOOP;
END $$;

-- 4. 登录用户唯一约束：同一活动只能投 1 票（部分索引，user_id 为 NULL 的匿名投票不约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_user_unique
    ON activity_votes(activity_id, user_id)
    WHERE user_id IS NOT NULL;

-- 5. IP 防刷索引：加速"同一 IP 对同一活动 24 小时内票数"统计
CREATE INDEX IF NOT EXISTS idx_votes_ip_time
    ON activity_votes(activity_id, ip_address, created_at);
