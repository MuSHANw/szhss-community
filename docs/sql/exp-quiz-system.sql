-- ============================================================
-- 经验值与等级系统 + 入站答题 数据库变更 SQL
-- 使用方式：在 psql 或 pgAdmin 中执行以下语句
-- ============================================================

-- 1. 修改 users 表
ALTER TABLE users ADD COLUMN exp INT DEFAULT 0;
ALTER TABLE users ADD COLUMN has_passed_quiz BOOLEAN DEFAULT false;

-- 2. 创建每日经验上限表
CREATE TABLE IF NOT EXISTS daily_exp_limits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    count INT DEFAULT 0,
    UNIQUE(user_id, action_type, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_exp_user_date ON daily_exp_limits(user_id, date);

-- 3. 创建题库表
CREATE TABLE IF NOT EXISTS quiz_questions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    option_a VARCHAR(200) NOT NULL,
    option_b VARCHAR(200) NOT NULL,
    option_c VARCHAR(200) NOT NULL,
    option_d VARCHAR(200) NOT NULL,
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
    category VARCHAR(50) DEFAULT 'community_rules',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 创建答题记录表
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    score INT NOT NULL,
    passed BOOLEAN DEFAULT false,
    total_questions INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);

-- 5. 插入预设题目（10道）
INSERT INTO quiz_questions (question, option_a, option_b, option_c, option_d, correct_answer, category) VALUES
('深圳高中生社区禁止以下哪种行为？', '分享学习资料', '人身攻击', '讨论升学', '发布活动', 'B', 'community_rules'),
('在社区中，未经他人同意公开其真实姓名和学校，属于什么行为？', '正常交流', '侵犯隐私', '热心帮助', '友好互动', 'B', 'community_rules'),
('以下哪个是深圳的行政区？', '天河区', '南山区', '朝阳区', '浦东新区', 'B', 'shenzhen_knowledge'),
('发现违规内容，你应该怎么做？', '跟帖辱骂', '无视不管', '点击举报按钮', '截图发朋友圈', 'C', 'community_rules'),
('社区自习室使用番茄钟时，专注时长默认是多少分钟？', '10分钟', '15分钟', '25分钟', '60分钟', 'C', 'community_rules'),
('在社区发布帖子时，以下哪种标签格式是正确的？', '#学习', '学习#', '@学习', '学习', 'A', 'community_rules'),
('以下哪个不是深圳的行政区？', '龙岗区', '宝安区', '南沙区', '龙华区', 'C', 'shenzhen_knowledge'),
('深圳高中生社区中，创建圈子需要至少多少人联合申请？', '2人', '3人', '5人', '10人', 'C', 'community_rules'),
('收到不友善的私信时，最合适的做法是？', '骂回去', '截图发给朋友嘲笑', '通过反馈功能举报', '注销账号', 'C', 'internet_etiquette'),
('以下哪种行为属于网络暴力？', '理性讨论不同观点', '在他人帖子下发表侮辱性言论', '给喜欢的帖子点赞', '收藏有用的学习资料', 'B', 'internet_etiquette');
