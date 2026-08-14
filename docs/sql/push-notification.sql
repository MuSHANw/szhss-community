-- 用户推送设备标识表（App 端推送通知用）
CREATE TABLE IF NOT EXISTS user_push_cid (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  cid VARCHAR(100) NOT NULL,
  platform VARCHAR(20) DEFAULT 'android',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
