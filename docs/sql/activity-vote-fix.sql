-- ==========================================
-- 活动投票系统修复：投票改为单人单票
-- 说明：将 activity_votes 的唯一约束从 (activity_id, user_id, option_id)
--       改为 (activity_id, user_id)，保证一个用户对一个活动只能投一票
-- 执行方式：psql -U postgres -h localhost -d szhss_community -f docs/sql/activity-vote-fix.sql
-- ==========================================

-- 删除旧的三字段唯一约束
ALTER TABLE activity_votes DROP CONSTRAINT IF EXISTS activity_votes_activity_id_user_id_option_id_key;

-- 新增单人单票唯一约束（同一活动同一用户只能有一条投票记录）
ALTER TABLE activity_votes ADD CONSTRAINT activity_votes_activity_id_user_id_key UNIQUE(activity_id, user_id);
