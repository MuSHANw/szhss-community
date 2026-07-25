-- 为 email_verifications 表增加 type 字段（支持注册验证和密码重置两种类型）
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'register';

-- 如果表中有 UNIQUE(email) 约束影响操作，可执行以下语句解除：
-- ALTER TABLE email_verifications DROP CONSTRAINT IF EXISTS email_verifications_email_key;
