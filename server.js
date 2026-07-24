require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QUIZ_ANSWERS = require('./quiz-bank-data.js');

// 获取北京时间日期字符串 (YYYY-MM-DD)
function getBeijingDate() {
    const now = new Date();
    const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
    return beijingTime.toISOString().slice(0, 10);
}

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ 数据库连接失败:', err);
    else console.log('✅ 数据库连接成功，服务器时间:', res.rows[0].now);
});

// ---------- 邮件配置 ----------
const transporter = nodemailer.createTransport({
    service: 'qq',
    auth: {
        user: process.env.EMAIL_USER || 'your_email@qq.com',
        pass: process.env.EMAIL_PASS || 'your_authorization_code',
    },
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this';

// ---------- 辅助函数：创建通知 ----------
async function createNotification(userId, type, sourceId, sourceUserId = null, content = null) {
    try {
        await pool.query(
            `INSERT INTO notifications (user_id, type, source_id, source_user_id, content)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, type, sourceId, sourceUserId, content]
        );
    } catch (err) {
        console.error('创建通知失败:', err);
    }
}

// ---------- 经验值系统 ----------
const EXP_RULES = {
    post: { exp: 10, dailyMax: 50 },
    reply: { exp: 3, dailyMax: 30 },
    liked: { exp: 2, dailyMax: 40 },
    favorited: { exp: 5, dailyMax: 50 },
    replied: { exp: 1, dailyMax: 20 },
    login: { exp: 5, dailyMax: 5 },
    followed: { exp: 3, dailyMax: 30 },
    report_accepted: { exp: 10, dailyMax: 0 }
};

async function addExp(userId, actionType) {
    const rule = EXP_RULES[actionType];
    if (!rule) return;

    const today = getBeijingDate();

    try {
        if (rule.dailyMax > 0) {
            const limitCheck = await pool.query(
                `SELECT count FROM daily_exp_limits
                 WHERE user_id = $1 AND action_type = $2 AND date = $3`,
                [userId, actionType, today]
            );

            const currentCount = limitCheck.rows.length > 0
                ? parseInt(limitCheck.rows[0].count)
                : 0;

            if (currentCount >= rule.dailyMax) return;

            if (limitCheck.rows.length > 0) {
                await pool.query(
                    `UPDATE daily_exp_limits SET count = count + 1
                     WHERE user_id = $1 AND action_type = $2 AND date = $3`,
                    [userId, actionType, today]
                );
            } else {
                await pool.query(
                    `INSERT INTO daily_exp_limits (user_id, action_type, date, count)
                     VALUES ($1, $2, $3, 1)`,
                    [userId, actionType, today]
                );
            }
        }

        await pool.query('UPDATE users SET exp = exp + $1 WHERE id = $2',
            [rule.exp, userId]);

    } catch (err) {
        console.error('增加经验值失败:', err);
    }
}

// ---------- 中间件 ----------
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: '未提供令牌' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: '无效令牌' });
    }
};

const adminMiddleware = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未授权' });
    try {
        const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '权限验证失败' });
    }
};

// 图片视频上传权限检查（需通过第二级考试）
const mediaUploadRequired = async (req, res, next) => {
    try {
        const result = await pool.query('SELECT can_upload_media FROM users WHERE id = $1', [req.user.userId]);
        if (!result.rows[0]?.can_upload_media) {
            return res.status(403).json({
                error: '请先通过第二级入站考试',
                quiz_required: true,
                level: 2,
                quiz_url: '/quiz.html?level=2'
            });
        }
        next();
    } catch (err) { next(err); }
};

// LV0 权限检查（未通过答题的用户不能进行互动操作）
const quizRequired = async (req, res, next) => {
    try {
        const result = await pool.query('SELECT has_passed_quiz FROM users WHERE id = $1', [req.user.userId]);
        if (result.rows.length === 0 || !result.rows[0].has_passed_quiz) {
            return res.status(403).json({
                error: '请先通过入站答题',
                quiz_required: true,
                quiz_url: '/quiz.html'
            });
        }
        next();
    } catch (err) {
        next(err);
    }
};

// ---------- 头像上传配置 ----------
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// ---------- 用户相关 API ----------
app.post('/api/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '邮箱不能为空' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    try {
        await pool.query('DELETE FROM email_verifications WHERE email = $1', [email]);
        await pool.query('INSERT INTO email_verifications (email, code, expires_at) VALUES ($1, $2, $3)', [email, code, expiresAt]);
        console.log(`📧 验证码 for ${email}: ${code}`);
        res.json({ message: '验证码已发送（开发模式：请查看控制台）' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '发送失败' });
    }
});

app.post('/api/register', async (req, res) => {
    const { email, code, password, nickname } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: '请填写完整信息' });
    try {
        const verifyRes = await pool.query('SELECT * FROM email_verifications WHERE email = $1 AND code = $2 AND expires_at > NOW()', [email, code]);
        if (verifyRes.rows.length === 0) return res.status(400).json({ error: '验证码无效或已过期' });
        const userExist = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExist.rows.length > 0) return res.status(400).json({ error: '该邮箱已注册' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id', [email, hashedPassword, nickname || email.split('@')[0]]);
        const userId = result.rows[0].id;
        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
        await pool.query('DELETE FROM email_verifications WHERE email = $1', [email]);
        res.json({ token, user: { id: userId, email, nickname: nickname || email.split('@')[0] } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '注册失败' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
    try {
        const result = await pool.query('SELECT id, email, password_hash, nickname FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: '邮箱或密码错误' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: '邮箱或密码错误' });
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        addExp(user.id, 'login');
        res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '登录失败' });
    }
});

// 用户搜索 API（必须放在 /api/users/:id 之前）
app.get('/api/users/search', async (req, res) => {
    console.log('>>> 用户搜索被调用，req.query =', req.query);
    const q = req.query.q?.trim();
    if (!q) {
        console.log('缺少 q 参数');
        return res.status(400).json({ error: '请输入搜索关键词' });
    }
    const limit = parseInt(req.query.limit) || 10;
    const searchPattern = `%${q}%`;
    try {
        const query = `
            SELECT id, nickname, email, avatar_url
            FROM users
            WHERE nickname ILIKE $1 OR email ILIKE $1
            ORDER BY nickname
            LIMIT $2
        `;
        const result = await pool.query(query, [searchPattern, limit]);
        console.log(`搜索到 ${result.rows.length} 个用户`);
        res.json(result.rows);
    } catch (err) {
        console.error('搜索用户失败:', err);
        res.status(500).json({ error: '搜索用户失败' });
    }
});

app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, nickname, school, district, hobby, avatar_url, is_admin, nickname_last_updated,
                    show_activity, show_replies, show_favorites, allow_messages, u.exp, u.has_passed_quiz,
                    (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count,
                    (SELECT COUNT(*) FROM user_follows WHERE followee_id = u.id) as follower_count
             FROM users u WHERE u.id = $1`,
            [req.user.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

app.put('/api/me/profile', authMiddleware, async (req, res) => {
    const { nickname, school, district, hobby, show_activity, show_replies, show_favorites, allow_messages } = req.body;
    const userId = req.user.userId;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT nickname, nickname_last_updated FROM users WHERE id = $1', [userId]);
        const currentNickname = userRes.rows[0].nickname;
        const currentNicknameLastUpdated = userRes.rows[0].nickname_last_updated;

        if (nickname !== undefined && nickname !== currentNickname) {
            const now = new Date();
            if (currentNicknameLastUpdated) {
                const lastUpdated = new Date(currentNicknameLastUpdated);
                const diffDays = (now - lastUpdated) / (1000 * 60 * 60 * 24);
                if (diffDays < 7) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '昵称7天内只能修改一次' });
                }
            }
            await client.query('UPDATE users SET nickname = $1, nickname_last_updated = NOW() WHERE id = $2', [nickname, userId]);
        }

        const updateFields = [];
        const updateValues = [];
        if (school !== undefined) { updateFields.push(`school = $${updateValues.length + 1}`); updateValues.push(school); }
        if (district !== undefined) { updateFields.push(`district = $${updateValues.length + 1}`); updateValues.push(district); }
        if (hobby !== undefined) { updateFields.push(`hobby = $${updateValues.length + 1}`); updateValues.push(hobby); }
        if (allow_messages !== undefined) { updateFields.push(`allow_messages = $${updateValues.length + 1}`); updateValues.push(allow_messages); }
        if (show_activity !== undefined) { updateFields.push(`show_activity = $${updateValues.length + 1}`); updateValues.push(show_activity); }
        if (show_replies !== undefined) { updateFields.push(`show_replies = $${updateValues.length + 1}`); updateValues.push(show_replies); }
        if (show_favorites !== undefined) { updateFields.push(`show_favorites = $${updateValues.length + 1}`); updateValues.push(show_favorites); }
        if (updateFields.length > 0) {
            console.log('🔍 保存隐私设置:', { updateFields, updateValues });
            updateValues.push(userId);
            const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`;
            await client.query(query, updateValues);
        }

        await client.query('COMMIT');
        res.json({ message: '更新成功' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '更新失败' });
    } finally {
        client.release();
    }
});

app.post('/api/me/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    try {
        await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.userId]);
        res.json({ avatar_url: avatarUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '上传失败' });
    }
});

// ---------- 通用文件上传（图片/视频）----------
const generalUpload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB（图片/视频通用）
});

app.post('/api/upload/file', authMiddleware, mediaUploadRequired, generalUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// 获取当前用户的帖子列表
app.get('/api/my-posts', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const query = `
            SELECT id, title, content, category, tags, view_count, created_at,
                   (SELECT COUNT(*) FROM replies WHERE post_id = posts.id) as reply_count
            FROM posts
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM posts WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取我的帖子失败' });
    }
});

app.get('/api/my-replies', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const query = `
            SELECT r.id, r.content, r.created_at, r.post_id,
                   p.title as post_title
            FROM replies r
            JOIN posts p ON r.post_id = p.id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM replies WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            replies: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取我的回复失败' });
    }
});

app.get('/api/my-favorites', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const query = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at,
                   u.nickname, u.id as user_id,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM post_favorites f
            JOIN posts p ON f.post_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM post_favorites WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取收藏失败' });
    }
});

// 关注或取消关注用户 (切换)
app.post('/api/users/:id/follow', authMiddleware, quizRequired, async (req, res) => {
    const followerId = req.user.userId;
    const followeeId = parseInt(req.params.id);

    if (isNaN(followeeId)) return res.status(400).json({ error: '无效的用户ID' });
    if (followerId === followeeId) return res.status(400).json({ error: '不能关注自己' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT id FROM user_follows WHERE follower_id = $1 AND followee_id = $2',
            [followerId, followeeId]
        );

        let isFollowing;
        if (existing.rows.length > 0) {
            // 已关注：取消关注
            await client.query(
                'DELETE FROM user_follows WHERE follower_id = $1 AND followee_id = $2',
                [followerId, followeeId]
            );
            await client.query(
                'UPDATE users SET following_count = following_count - 1 WHERE id = $1',
                [followerId]
            );
            await client.query(
                'UPDATE users SET follower_count = follower_count - 1 WHERE id = $1',
                [followeeId]
            );
            isFollowing = false;
        } else {
            // 未关注：添加关注
            await client.query(
                'INSERT INTO user_follows (follower_id, followee_id) VALUES ($1, $2)',
                [followerId, followeeId]
            );
            await client.query(
                'UPDATE users SET following_count = following_count + 1 WHERE id = $1',
                [followerId]
            );
            await client.query(
                'UPDATE users SET follower_count = follower_count + 1 WHERE id = $1',
                [followeeId]
            );
            isFollowing = true;

            // 发送关注通知
            await createNotification(followeeId, 'follow', followerId, followerId);
            addExp(followeeId, 'followed');
        }

        await client.query('COMMIT');
        res.json({ following: isFollowing });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '操作失败' });
    } finally {
        client.release();
    }
});

app.get('/api/users/:id/following', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 尝试解析当前登录用户（如果有 token）
    let currentUserId = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            currentUserId = decoded.userId;
        } catch (e) { }
    }

    try {
        const query = `
            SELECT u.id, u.nickname, u.avatar_url,
                   EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $3 AND followee_id = u.id) as is_following
            FROM user_follows f
            JOIN users u ON f.followee_id = u.id
            WHERE f.follower_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const countQuery = `SELECT COUNT(*) as total FROM user_follows WHERE follower_id = $1`;

        const result = await pool.query(query, [userId, limit, offset]);
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            users: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取关注列表失败' });
    }
});

app.get('/api/users/:id/followers', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let currentUserId = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            currentUserId = decoded.userId;
        } catch (e) { }
    }

    try {
        const query = `
            SELECT u.id, u.nickname, u.avatar_url,
                   EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $3 AND followee_id = u.id) as is_following
            FROM user_follows f
            JOIN users u ON f.follower_id = u.id
            WHERE f.followee_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const countQuery = `SELECT COUNT(*) as total FROM user_follows WHERE followee_id = $1`;

        const result = await pool.query(query, [userId, limit, offset]);
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            users: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取粉丝列表失败' });
    }
});

app.get('/api/following-posts', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at, p.likes,
                   u.nickname, u.id as user_id, u.avatar_url, u.exp, u.has_passed_quiz,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id IN (SELECT followee_id FROM user_follows WHERE follower_id = $1)
            ORDER BY p.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const countQuery = `
            SELECT COUNT(*) as total
            FROM posts
            WHERE user_id IN (SELECT followee_id FROM user_follows WHERE follower_id = $1)
        `;

        const result = await pool.query(query, [userId, limit, offset]);
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取动态失败' });
    }
});

// ---------- 他人个人主页相关 API ----------
app.get('/api/users/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

    // 从请求头中解析当前登录用户的 ID
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            currentUserId = decoded.userId;
        } catch (e) {
            // token 无效，currentUserId 保持 null
        }
    }

    try {
        const query = `
            SELECT id, email, nickname, school, district, hobby, avatar_url, allow_messages,
                   exp, has_passed_quiz, created_at,
                   total_likes_received, total_favorites_received, total_replies_received,
                   (SELECT COUNT(*) FROM user_follows WHERE follower_id = $1) as following_count,
                   (SELECT COUNT(*) FROM user_follows WHERE followee_id = $1) as follower_count,
                   EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $2 AND followee_id = $1) as is_following
            FROM users WHERE id = $1
        `;
        const result = await pool.query(query, [userId, currentUserId || 0]);
        if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

        const user = result.rows[0];

        // ---- 统计数据 ----
        const postsCountRes = await pool.query('SELECT COUNT(*) FROM posts WHERE user_id = $1', [userId]);
        const repliesCountRes = await pool.query('SELECT COUNT(*) FROM replies WHERE user_id = $1', [userId]);
        const stats = {
            posts_count: parseInt(postsCountRes.rows[0].count),
            replies_count: parseInt(repliesCountRes.rows[0].count),
            likes_received: user.total_likes_received || 0,
            favorites_received: user.total_favorites_received || 0,
            replies_received: user.total_replies_received || 0,
            following_count: user.following_count || 0,
            follower_count: user.follower_count || 0
        };

        // ---- 成就徽章计算 ----
        const achievements = [];
        const exp = user.exp || 0;
        const hasPassedQuiz = user.has_passed_quiz;
        const createdAt = user.created_at;

        // 内测成员：在2026年7月12日前注册的用户
        const betaCutoff = new Date('2026-07-12');
        if (new Date(createdAt) < betaCutoff) {
            achievements.push({ id: 'beta', name: '内测成员', icon: '\uD83D\uDD2C', description: '社区内测阶段的早期成员' });
        }
        // 初来乍到
        achievements.push({ id: 'newcomer', name: '初来乍到', icon: '\uD83C\uDD95', description: '加入深圳高中生社区' });
        // 答题达人
        if (hasPassedQuiz) {
            achievements.push({ id: 'quiz_master', name: '答题达人', icon: '\u2705', description: '通过入站答题' });
        }
        // 首次发帖
        if (stats.posts_count >= 1) {
            achievements.push({ id: 'first_post', name: '首次发帖', icon: '\uD83D\uDCDD', description: '发布第一篇帖子' });
        }
        // 高产作者
        if (stats.posts_count >= 10) {
            achievements.push({ id: 'prolific', name: '高产作者', icon: '\u270D\uFE0F', description: '发布10篇帖子' });
        }
        // 创作大师
        if (stats.posts_count >= 50) {
            achievements.push({ id: 'master', name: '创作大师', icon: '\uD83D\uDCDA', description: '发布50篇帖子' });
        }
        // 话题制造者：帖子获得50条回复
        if (stats.replies_received >= 50) {
            achievements.push({ id: 'topic_maker', name: '话题制造者', icon: '\uD83D\uDCAC', description: '帖子累计获得50条回复' });
        }
        // 百赞达人
        if (stats.likes_received >= 100) {
            achievements.push({ id: 'hundred_likes', name: '百赞达人', icon: '\u2764\uFE0F', description: '累计获得100个赞' });
        }
        // 收藏家
        const favCountRes = await pool.query('SELECT COUNT(*) FROM post_favorites WHERE user_id = $1', [userId]);
        const favCount = parseInt(favCountRes.rows[0].count);
        if (favCount >= 10) {
            achievements.push({ id: 'collector', name: '收藏家', icon: '\u2B50', description: '收藏10篇帖子' });
        }
        // 社交达人
        if (stats.following_count >= 10) {
            achievements.push({ id: 'social', name: '社交达人', icon: '\uD83D\uDC65', description: '关注10位用户' });
        }
        // 人气之星
        if (stats.follower_count >= 10) {
            achievements.push({ id: 'popular', name: '人气之星', icon: '\uD83C\uDF1F', description: '被10位用户关注' });
        }
        // 圈主
        const circleCountRes = await pool.query('SELECT COUNT(*) FROM circles WHERE creator_id = $1', [userId]);
        if (parseInt(circleCountRes.rows[0].count) >= 1) {
            achievements.push({ id: 'circle_owner', name: '圈主', icon: '\uD83C\uDFE0', description: '创建了一个圈子' });
        }
        // 自习达人
        try {
            const studyRes = await pool.query(
                'SELECT COALESCE(SUM(duration), 0) as total_seconds FROM study_records WHERE user_id = $1',
                [userId]
            );
            const totalHours = parseInt(studyRes.rows[0].total_seconds) / 3600;
            if (totalHours >= 10) {
                achievements.push({ id: 'study_master', name: '自习达人', icon: '\u23F1\uFE0F', description: '累计自习10小时' });
            }
        } catch (e) {
            // study_records 表可能不存在，忽略
        }
        // 经验大师：达到LV3（exp >= 400）
        if (exp >= 400) {
            achievements.push({ id: 'exp_master', name: '经验大师', icon: '\uD83D\uDCC8', description: '达到LV3活跃分子' });
        }
        // 传说级存在：达到LV7（exp >= 9000）
        if (exp >= 9000) {
            achievements.push({ id: 'legend', name: '传说级存在', icon: '\uD83D\uDC51', description: '达到LV7传说级存在' });
        }
        // Bug猎人
        const feedbackRes = await pool.query(
            "SELECT COUNT(*) FROM feedbacks WHERE user_id = $1 AND status = 'resolved'",
            [userId]
        );
        if (parseInt(feedbackRes.rows[0].count) >= 1) {
            achievements.push({ id: 'bug_hunter', name: 'Bug猎人', icon: '\uD83D\uDC1B', description: '提交1条被采纳的反馈' });
        }
        // 正义使者
        const reportRes = await pool.query(
            "SELECT COUNT(*) FROM reports WHERE reporter_id = $1 AND status = 'resolved'",
            [userId]
        );
        if (parseInt(reportRes.rows[0].count) >= 1) {
            achievements.push({ id: 'justice', name: '正义使者', icon: '\uD83D\uDEE1\uFE0F', description: '提交1条被采纳的举报' });
        }

        // ---- 最近动态 ----
        const activitiesRes = await pool.query(
            `SELECT 'post' as type, id, title as target_title, created_at
             FROM posts WHERE user_id = $1
             UNION ALL
             SELECT 'reply' as type, r.id, p.title as target_title, r.created_at
             FROM replies r JOIN posts p ON r.post_id = p.id
             WHERE r.user_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [userId]
        );

        res.json({
            ...user,
            stats,
            achievements,
            recent_activities: activitiesRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

app.get('/api/users/:id/posts', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const query = `
            SELECT id, title, content, category, tags, view_count, created_at,
                   (SELECT COUNT(*) FROM replies WHERE post_id = posts.id) as reply_count
            FROM posts
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM posts WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取用户帖子失败' });
    }
});

app.get('/api/users/:id/activity', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

    try {
        // 检查隐私设置
        const priv = await pool.query('SELECT show_activity FROM users WHERE id = $1', [userId]);
        if (!priv.rows[0]?.show_activity) return res.json({ hidden: true, activity: [] });

        // 查询最近365天的活跃数据
        const refDate = getBeijingDate();
        const result = await pool.query(
            `SELECT date, SUM(count) as total_count
             FROM daily_exp_limits
             WHERE user_id = $1 AND date >= $2::date - INTERVAL '364 days'
             GROUP BY date
             ORDER BY date`,
            [userId, refDate]
        );

        // 构建日期到次数的映射——直接用本地时间，避免 toISOString 的 UTC 偏移
        const activityMap = {};
        result.rows.forEach(row => {
            const d = row.date;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            activityMap[y + '-' + m + '-' + dd] = parseInt(row.total_count);
        });

        // 生成365天数据
        const activity = [];
        const [y0, m0, d0] = refDate.split('-').map(Number);
        for (let i = 0; i < 365; i++) {
            const dt = new Date(y0, m0 - 1, d0 - 364 + i);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            const dateStr = y + '-' + m + '-' + dd;
            const count = activityMap[dateStr] || 0;
            const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
            activity.push({ date: dateStr, count, level });
        }

        res.json({ hidden: false, activity });
    } catch (err) {
        console.error('获取活跃度失败:', err);
        res.status(500).json({ error: '获取活跃度失败' });
    }
});

app.get('/api/users/:id/replies', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const priv = await pool.query('SELECT show_replies FROM users WHERE id = $1', [userId]);
        if (!priv.rows[0]?.show_replies) return res.json({ hidden: true, replies: [], totalPages: 0 });
        const query = `
            SELECT r.id, r.content, r.created_at, r.post_id,
                   p.title as post_title
            FROM replies r
            JOIN posts p ON r.post_id = p.id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM replies WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            replies: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hidden: false
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取回复失败' });
    }
});

app.get('/api/users/:id/favorites', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    try {
        const priv = await pool.query('SELECT show_favorites FROM users WHERE id = $1', [userId]);
        if (!priv.rows[0]?.show_favorites) return res.json({ hidden: true, posts: [], totalPages: 0 });
        const query = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at,
                   u.nickname, u.id as user_id,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM post_favorites f
            JOIN posts p ON f.post_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countQuery = `SELECT COUNT(*) as total FROM post_favorites WHERE user_id = $1`;
        const countResult = await pool.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hidden: false
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取收藏失败' });
    }
});

// ---------- 帖子相关 API ----------
app.post('/api/posts', authMiddleware, quizRequired, async (req, res) => {
    const { title, content, category, tags, circle_id } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    try {
        const result = await pool.query(
            'INSERT INTO posts (user_id, title, content, category, tags, circle_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [req.user.userId, title, content, category || '综合', tags || [], circle_id || null]
        );
        if (circle_id) {
            await pool.query('UPDATE circles SET post_count = post_count + 1 WHERE id = $1', [circle_id]);
        }
        addExp(req.user.userId, 'post');
        res.json({ id: result.rows[0].id, message: '发布成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '发布失败' });
    }
});

app.get('/api/posts', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const category = req.query.category;
    const sort = req.query.sort || 'recommended';
    const isLearning = (category === 'learning');

    try {
        let whereClauses = [];
        let params = [];
        if (isLearning) {
            whereClauses.push(`(p.category = '学习' OR p.title ILIKE '%学习%' OR p.content ILIKE '%学习%' OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE '%学习%'))`);
        } else if (category) {
            whereClauses.push(`p.category = $${params.length + 1}`);
            params.push(category);
        }
        const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

        let listQuery = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at, p.likes,
                   u.nickname, u.id as user_id, u.avatar_url, u.exp, u.has_passed_quiz,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ${whereSql}
        `;
        switch (sort) {
            case 'recommended':
                listQuery += ` ORDER BY (
                    (p.likes * 3 + (SELECT COUNT(*) FROM replies WHERE post_id = p.id) * 2 + p.view_count * 1)
                    / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5)
                ) DESC`;
                break;
            case 'hot':
                listQuery += ` ORDER BY (p.likes * 3 + p.view_count * 1 + (SELECT COUNT(*) FROM replies WHERE post_id = p.id) * 2) DESC`;
                break;
            case 'replied':
                listQuery += ` ORDER BY COALESCE((SELECT MAX(created_at) FROM replies WHERE post_id = p.id), p.created_at) DESC`;
                break;
            default:
                listQuery += ` ORDER BY p.created_at DESC`;
        }
        listQuery += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const listParams = [...params, limit, offset];
        const result = await pool.query(listQuery, listParams);

        let countQuery = `SELECT COUNT(*) as total FROM posts p ${whereSql}`;
        const countParams = [...params];
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({ posts: result.rows, page, limit, total, totalPages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取帖子失败' });
    }
});

app.get('/api/posts/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: '无效的帖子ID' });
    try {
        const postResult = await pool.query(
            `SELECT p.*, u.nickname, u.avatar_url, u.id as user_id, u.exp, u.has_passed_quiz
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1`,
            [id]
        );
        if (postResult.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        const post = postResult.rows[0];
        const repliesResult = await pool.query(
            `SELECT r.*, u.nickname, u.avatar_url, u.exp, u.has_passed_quiz
             FROM replies r
             JOIN users u ON r.user_id = u.id
             WHERE r.post_id = $1
             ORDER BY r.created_at ASC`,
            [id]
        );
        res.json({ post, replies: repliesResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取详情失败' });
    }
});

app.put('/api/posts/:id/view', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: '无效的帖子ID' });
    try {
        const result = await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        res.json({ view_count: result.rows[0].view_count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新浏览量失败' });
    }
});

app.put('/api/posts/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: '无效的帖子ID' });
    const { title, content, category, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    try {
        const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
        if (postCheck.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        const post = postCheck.rows[0];
        const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        const isAdmin = userCheck.rows[0]?.is_admin || false;
        if (post.user_id !== req.user.userId && !isAdmin) return res.status(403).json({ error: '无权编辑此帖子' });
        await pool.query(
            'UPDATE posts SET title = $1, content = $2, category = $3, tags = $4, updated_at = NOW() WHERE id = $5',
            [title, content, category || '综合', tags || [], id]
        );
        res.json({ message: '更新成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '编辑失败' });
    }
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: '无效的帖子ID' });
    try {
        const postCheck = await pool.query('SELECT user_id, circle_id FROM posts WHERE id = $1', [id]);
        if (postCheck.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        const post = postCheck.rows[0];
        const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        const isAdmin = userCheck.rows[0]?.is_admin || false;
        if (post.user_id !== req.user.userId && !isAdmin) return res.status(403).json({ error: '无权删除此帖子' });
        await pool.query('DELETE FROM posts WHERE id = $1', [id]);
        if (post.circle_id) {
            await pool.query('UPDATE circles SET post_count = post_count - 1 WHERE id = $1', [post.circle_id]);
        }
        res.json({ message: '删除成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '删除失败' });
    }
});

// ---------- 回复 API ----------
app.post('/api/posts/:id/replies', authMiddleware, quizRequired, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const { content, parent_id } = req.body;
    if (!content) return res.status(400).json({ error: '回复内容不能为空' });
    try {
        const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
        if (postCheck.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        const result = await pool.query(
            'INSERT INTO replies (post_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [postId, req.user.userId, content, parent_id || null]
        );
        const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const ownerId = postOwner.rows[0].user_id;
        if (ownerId !== req.user.userId) {
            await createNotification(ownerId, 'reply', postId, req.user.userId);
            addExp(ownerId, 'replied');
        }
        addExp(req.user.userId, 'reply');
        // 更新帖子作者的被回复计数器
        if (ownerId !== req.user.userId) {
            await pool.query('UPDATE users SET total_replies_received = total_replies_received + 1 WHERE id = $1', [ownerId]);
        }
        res.json({ id: result.rows[0].id, message: '回复成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '回复失败' });
    }
});

app.delete('/api/replies/:id', authMiddleware, async (req, res) => {
    const replyId = parseInt(req.params.id);
    if (isNaN(replyId)) return res.status(400).json({ error: '无效的回复ID' });
    const userId = req.user.userId;
    try {
        const replyResult = await pool.query('SELECT user_id, post_id FROM replies WHERE id = $1', [replyId]);
        if (replyResult.rows.length === 0) return res.status(404).json({ error: '回复不存在' });
        const reply = replyResult.rows[0];
        const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
        const isAdmin = userCheck.rows[0]?.is_admin || false;
        if (reply.user_id !== userId && !isAdmin) return res.status(403).json({ error: '无权删除此回复' });
        await pool.query('DELETE FROM replies WHERE id = $1', [replyId]);
        res.json({ message: '删除成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '删除失败' });
    }
});

// ---------- 点赞系统 ----------
app.post('/api/posts/:id/like', authMiddleware, quizRequired, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const userId = req.user.userId;
    try {
        const existing = await pool.query('SELECT id FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        // 获取帖子作者
        const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const ownerId = postOwner.rows[0].user_id;

        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            await pool.query('UPDATE posts SET likes = likes - 1 WHERE id = $1', [postId]);
            await pool.query('UPDATE users SET total_likes_received = GREATEST(total_likes_received - 1, 0) WHERE id = $1', [ownerId]);
            const likesResult = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
            res.json({ liked: false, likes: likesResult.rows[0].likes });
        } else {
            await pool.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            await pool.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [postId]);
            await pool.query('UPDATE users SET total_likes_received = total_likes_received + 1 WHERE id = $1', [ownerId]);
            const likesResult = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
            res.json({ liked: true, likes: likesResult.rows[0].likes });
            if (ownerId !== userId) {
                await createNotification(ownerId, 'like', postId, userId);
            }
            addExp(ownerId, 'liked');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失败' });
    }
});

app.get('/api/posts/likes/status', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const postIds = req.query.ids ? req.query.ids.split(',').map(Number) : [];
    if (!postIds.length) return res.json({});
    try {
        const result = await pool.query('SELECT post_id FROM post_likes WHERE user_id = $1 AND post_id = ANY($2)', [userId, postIds]);
        const likedSet = new Set(result.rows.map(r => r.post_id));
        const status = {};
        postIds.forEach(id => { status[id] = likedSet.has(id); });
        res.json(status);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取点赞状态失败' });
    }
});

// ---------- 收藏系统 ----------
app.post('/api/posts/:id/favorite', authMiddleware, quizRequired, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const userId = req.user.userId;
    try {
        const existing = await pool.query('SELECT id FROM post_favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        // 获取帖子作者
        const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        const ownerId = postOwner.rows[0].user_id;

        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM post_favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            await pool.query('UPDATE users SET total_favorites_received = GREATEST(total_favorites_received - 1, 0) WHERE id = $1', [ownerId]);
            res.json({ favorited: false });
        } else {
            await pool.query('INSERT INTO post_favorites (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            await pool.query('UPDATE users SET total_favorites_received = total_favorites_received + 1 WHERE id = $1', [ownerId]);
            res.json({ favorited: true });
            if (ownerId !== userId) {
                await createNotification(ownerId, 'favorite', postId, userId);
                addExp(ownerId, 'favorited');
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失败' });
    }
});

app.get('/api/posts/favorites/status', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const postIds = req.query.ids ? req.query.ids.split(',').map(Number) : [];
    if (!postIds.length) return res.json({});
    try {
        const result = await pool.query('SELECT post_id FROM post_favorites WHERE user_id = $1 AND post_id = ANY($2)', [userId, postIds]);
        const favoritedSet = new Set(result.rows.map(r => r.post_id));
        const status = {};
        postIds.forEach(id => { status[id] = favoritedSet.has(id); });
        res.json(status);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取收藏状态失败' });
    }
});

// ---------- 举报系统 ----------
app.post('/api/reports', authMiddleware, async (req, res) => {
    const { target_type, target_id, reason_type, reason } = req.body;
    if (!target_type || !target_id || !reason_type) return res.status(400).json({ error: '缺少必要参数' });
    if (!['post', 'reply', 'user'].includes(target_type)) return res.status(400).json({ error: '无效的举报目标类型' });
    try {
        await pool.query(
            `INSERT INTO reports (reporter_id, target_type, target_id, reason_type, reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.userId, target_type, target_id, reason_type, reason || '']
        );
        res.json({ message: '举报已提交，感谢您的反馈' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '提交举报失败' });
    }
});

app.get('/api/my-reports', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const result = await pool.query(
            `SELECT id, target_type, target_id, reason_type, reason, status, created_at, resolved_at
             FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取举报记录失败' });
    }
});

// ---------- 反馈系统 ----------
app.post('/api/feedbacks', authMiddleware, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '反馈内容不能为空' });
    try {
        await pool.query(
            `INSERT INTO feedbacks (user_id, content) VALUES ($1, $2)`,
            [req.user.userId, content]
        );
        res.json({ message: '反馈已提交，感谢您的建议' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '提交反馈失败' });
    }
});

app.get('/api/my-feedbacks', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const result = await pool.query(
            `SELECT id, content, status, reply, created_at, resolved_at
             FROM feedbacks WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取反馈记录失败' });
    }
});

// ---------- 通知系统 API ----------
app.get('/api/notifications', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    try {
        const query = `
            SELECT n.*, u.nickname as source_nickname
            FROM notifications n
            LEFT JOIN users u ON n.source_user_id = u.id
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [userId, limit, offset]);
        const countRes = await pool.query('SELECT COUNT(*) as total FROM notifications WHERE user_id = $1 AND is_read = false', [userId]);
        const unreadCount = parseInt(countRes.rows[0].total);
        res.json({
            notifications: result.rows,
            unreadCount,
            page,
            totalPages: Math.ceil(unreadCount / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取通知失败' });
    }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) return res.status(400).json({ error: '无效的通知ID' });
    const userId = req.user.userId;
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [notificationId, userId]);
        res.json({ message: '已标记为已读' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失败' });
    }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
        res.json({ message: '全部已读' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失败' });
    }
});

// ---------- 公开统计 API（供宣传页使用）----------
app.get('/api/public/stats', async (req, res) => {
    try {
        const userCount = await pool.query('SELECT COUNT(*) as total FROM users');
        const postCount = await pool.query('SELECT COUNT(*) as total FROM posts');
        const replyCount = await pool.query('SELECT COUNT(*) as total FROM replies');
        const likeCount = await pool.query('SELECT SUM(likes) as total FROM posts');
        const circleCount = await pool.query('SELECT COUNT(*) as total FROM circles');

        res.json({
            totalUsers: parseInt(userCount.rows[0].total),
            totalPosts: parseInt(postCount.rows[0].total),
            totalReplies: parseInt(replyCount.rows[0].total),
            totalLikes: parseInt(likeCount.rows[0].total) || 0,
            totalCircles: parseInt(circleCount.rows[0].total)
        });
    } catch (err) {
        console.error('获取公开统计数据失败:', err);
        res.status(500).json({ error: '获取数据失败' });
    }
});

// ---------- 管理员 API ----------
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userCountRes = await pool.query('SELECT COUNT(*) as total FROM users');
        const totalUsers = parseInt(userCountRes.rows[0].total);
        const postCountRes = await pool.query('SELECT COUNT(*) as total FROM posts');
        const totalPosts = parseInt(postCountRes.rows[0].total);
        const replyCountRes = await pool.query('SELECT COUNT(*) as total FROM replies');
        const totalReplies = parseInt(replyCountRes.rows[0].total);
        const likeCountRes = await pool.query('SELECT SUM(likes) as total FROM posts');
        const totalLikes = parseInt(likeCountRes.rows[0].total) || 0;
        const favCountRes = await pool.query('SELECT COUNT(*) as total FROM post_favorites');
        const totalFavorites = parseInt(favCountRes.rows[0].total);
        const today = getBeijingDate();
        const newUsersRes = await pool.query('SELECT COUNT(*) as total FROM users WHERE (created_at AT TIME ZONE \'Asia/Shanghai\')::date = $1', [today]);
        const newUsersToday = parseInt(newUsersRes.rows[0].total);
        const newPostsRes = await pool.query('SELECT COUNT(*) as total FROM posts WHERE (created_at AT TIME ZONE \'Asia/Shanghai\')::date = $1', [today]);
        const newPostsToday = parseInt(newPostsRes.rows[0].total);
        res.json({ totalUsers, totalPosts, totalReplies, totalLikes, totalFavorites, newUsersToday, newPostsToday });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取统计数据失败' });
    }
});

app.get('/api/admin/reports', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u1.nickname as reporter_nickname, u2.nickname as resolver_nickname
            FROM reports r
            LEFT JOIN users u1 ON r.reporter_id = u1.id
            LEFT JOIN users u2 ON r.resolved_by = u2.id
            ORDER BY r.created_at DESC
        `);
        res.json({ reports: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取举报列表失败' });
    }
});

app.put('/api/admin/reports/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) return res.status(400).json({ error: '无效的举报ID' });
    const { action } = req.body;
    if (!['resolve', 'reject'].includes(action)) return res.status(400).json({ error: '无效的操作' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 先查询举报详情
        const reportResult = await client.query(
            'SELECT target_type, target_id, reporter_id FROM reports WHERE id = $1',
            [reportId]
        );
        if (reportResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '举报不存在' });
        }
        const report = reportResult.rows[0];

        if (action === 'resolve') {
            // 根据 target_type 自动删除违规内容
            if (report.target_type === 'post') {
                await client.query('DELETE FROM posts WHERE id = $1', [report.target_id]);
            } else if (report.target_type === 'reply') {
                await client.query('DELETE FROM replies WHERE id = $1', [report.target_id]);
            }
            // target_type === 'user' 暂不处理

            // 更新举报状态
            await client.query(
                `UPDATE reports SET status = 'resolved', resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
                [req.user.userId, reportId]
            );

            const content = `您的举报已通过处理，违规${report.target_type === 'post' ? '帖子' : report.target_type === 'reply' ? '回复' : '内容'}已被删除。`;
            await createNotification(report.reporter_id, 'report_resolved', reportId, null, content);

            await client.query('COMMIT');
            res.json({ message: content });
        } else {
            // reject：仅更新状态，不删除内容
            await client.query(
                `UPDATE reports SET status = 'rejected', resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
                [req.user.userId, reportId]
            );

            const content = '您的举报已被驳回。';
            await createNotification(report.reporter_id, 'report_resolved', reportId, null, content);

            await client.query('COMMIT');
            res.json({ message: '举报已驳回' });
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '处理失败' });
    } finally {
        client.release();
    }
});

app.get('/api/admin/feedbacks', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.*, u.nickname as user_nickname
            FROM feedbacks f
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
        `);
        res.json({ feedbacks: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取反馈列表失败' });
    }
});

app.put('/api/admin/feedbacks/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const feedbackId = parseInt(req.params.id);
    if (isNaN(feedbackId)) return res.status(400).json({ error: '无效的反馈ID' });
    const { reply, action } = req.body;
    if (!reply && action !== 'read') return res.status(400).json({ error: '回复内容不能为空' });
    const status = action === 'resolve' ? 'resolved' : 'read';
    try {
        await pool.query(
            `UPDATE feedbacks SET status = $1, reply = $2, resolved_at = NOW(), resolved_by = $3 WHERE id = $4`,
            [status, reply || null, req.user.userId, feedbackId]
        );
        res.json({ message: '反馈已处理' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '处理失败' });
    }
});

app.get('/api/admin/daily-stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const days = 30;
        const dates = [];
        const todayStr = getBeijingDate();
        const [y, m, dd] = todayStr.split('-').map(Number);
        for (let i = 0; i < days; i++) {
            const d = new Date(y, m - 1, dd - (days - 1) + i);
            const ys = d.getFullYear();
            const ms = String(d.getMonth() + 1).padStart(2, '0');
            const ds = String(d.getDate()).padStart(2, '0');
            dates.push(ys + '-' + ms + '-' + ds);
        }
        const dauQuery = `
            WITH daily_users AS (
                SELECT DISTINCT user_id, (created_at AT TIME ZONE 'Asia/Shanghai')::date as date FROM posts
                UNION
                SELECT DISTINCT user_id, (created_at AT TIME ZONE 'Asia/Shanghai')::date as date FROM replies
            )
            SELECT date, COUNT(DISTINCT user_id) as dau
            FROM daily_users
            WHERE date >= $1::date - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const dauResult = await pool.query(dauQuery, [todayStr]);
        const dauMap = {};
        dauResult.rows.forEach(row => { dauMap[(function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(row.date)] = parseInt(row.dau); });
        const postsQuery = `
            SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date as date, COUNT(*) as count
            FROM posts
            WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date >= $1::date - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const postsResult = await pool.query(postsQuery, [todayStr]);
        const postsMap = {};
        postsResult.rows.forEach(row => { postsMap[(function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(row.date)] = parseInt(row.count); });
        const reportsQuery = `
            SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date as date, COUNT(*) as count
            FROM reports
            WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date >= $1::date - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const reportsResult = await pool.query(reportsQuery, [todayStr]);
        const reportsMap = {};
        reportsResult.rows.forEach(row => { reportsMap[(function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(row.date)] = parseInt(row.count); });
        const dau = dates.map(d => dauMap[d] || 0);
        const posts = dates.map(d => postsMap[d] || 0);
        const reports = dates.map(d => reportsMap[d] || 0);
        res.json({ dates, dau, posts, reports });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取每日统计数据失败' });
    }
});

// ---------- 搜索 API ----------
app.get('/api/search', async (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.status(400).json({ error: '请提供搜索关键词' });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchPattern = `%${q}%`;
    try {
        const query = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at,
                   u.nickname, u.id as user_id, u.avatar_url, u.exp, u.has_passed_quiz,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.title ILIKE $1
                OR p.content ILIKE $1
                OR p.category ILIKE $1
                OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
            ORDER BY p.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [searchPattern, limit, offset]);
        const countQuery = `
            SELECT COUNT(*) as total
            FROM posts p
            WHERE p.title ILIKE $1
               OR p.content ILIKE $1
               OR p.category ILIKE $1
               OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
        `;
        const countResult = await pool.query(countQuery, [searchPattern]);
        const total = parseInt(countResult.rows[0].total);
        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '搜索失败' });
    }
});

// ---------- 统一搜索 API（支持帖子/用户/圈子多维度）----------
app.get('/api/search/all', async (req, res) => {
    const q = req.query.q?.trim();
    if (!q) return res.status(400).json({ error: '请提供搜索关键词' });

    const searchPattern = `%${q}%`;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type || 'posts';
    const offset = (page - 1) * limit;

    try {
        if (type === 'posts') {
            const query = `
                SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at,
                       u.nickname, u.id as user_id, u.avatar_url,
                       (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
                FROM posts p
                JOIN users u ON p.user_id = u.id
                WHERE p.title ILIKE $1 OR p.content ILIKE $1 OR p.category ILIKE $1
                   OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
                ORDER BY p.created_at DESC
                LIMIT $2 OFFSET $3
            `;
            const countQuery = `
                SELECT COUNT(*) as total FROM posts p
                WHERE p.title ILIKE $1 OR p.content ILIKE $1 OR p.category ILIKE $1
                   OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
            `;
            const result = await pool.query(query, [searchPattern, limit, offset]);
            const countResult = await pool.query(countQuery, [searchPattern]);
            const total = parseInt(countResult.rows[0].total);
            res.json({ type: 'posts', results: result.rows, page, limit, total, totalPages: Math.ceil(total / limit) });

        } else if (type === 'users') {
            const query = `
                SELECT id, nickname, email, avatar_url, school, district
                FROM users
                WHERE nickname ILIKE $1 OR email ILIKE $1 OR school ILIKE $1
                ORDER BY CASE WHEN nickname ILIKE $1 THEN 0 ELSE 1 END, nickname
                LIMIT $2 OFFSET $3
            `;
            const countQuery = `
                SELECT COUNT(*) as total FROM users
                WHERE nickname ILIKE $1 OR email ILIKE $1 OR school ILIKE $1
            `;
            const result = await pool.query(query, [searchPattern, limit, offset]);
            const countResult = await pool.query(countQuery, [searchPattern]);
            const total = parseInt(countResult.rows[0].total);
            res.json({ type: 'users', results: result.rows, page, limit, total, totalPages: Math.ceil(total / limit) });

        } else if (type === 'circles') {
            const query = `
                SELECT c.id, c.name, c.description, c.icon_url, c.member_count, c.post_count,
                       u.nickname as creator_nickname
                FROM circles c
                LEFT JOIN users u ON c.creator_id = u.id
                WHERE c.name ILIKE $1 OR c.description ILIKE $1
                ORDER BY c.member_count DESC
                LIMIT $2 OFFSET $3
            `;
            const countQuery = `
                SELECT COUNT(*) as total FROM circles
                WHERE name ILIKE $1 OR description ILIKE $1
            `;
            const result = await pool.query(query, [searchPattern, limit, offset]);
            const countResult = await pool.query(countQuery, [searchPattern]);
            const total = parseInt(countResult.rows[0].total);
            res.json({ type: 'circles', results: result.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
        } else {
            return res.status(400).json({ error: '无效的搜索类型，支持 posts/users/circles' });
        }
    } catch (err) {
        console.error('统一搜索失败:', err);
        res.status(500).json({ error: '搜索失败' });
    }
});

// ---------- 圈子图片上传配置 ----------
const circleUploadDir = path.join(__dirname, 'public/uploads/circles');
if (!fs.existsSync(circleUploadDir)) fs.mkdirSync(circleUploadDir, { recursive: true });

const circleStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, circleUploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'circle_' + unique + path.extname(file.originalname));
    }
});
const circleUpload = multer({ storage: circleStorage, limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/upload/circle-image', authMiddleware, circleUpload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const imageUrl = `/uploads/circles/${req.file.filename}`;
    res.json({ url: imageUrl });
});

// ---------- 自习室 API ----------

// 获取自习室列表（广场）
app.get('/api/study-rooms', async (req, res) => {
    const { type, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    // 类型筛选
    if (type === 'district') {
        conditions.push(`r.room_type = 'district'`);
    } else if (type === 'personal') {
        conditions.push(`r.room_type = 'personal'`);
        conditions.push(`r.is_active = true`);  // 只显示活跃的个人自习室
    } else {
        // 混合：个人自习室过滤掉非活跃的
        conditions.push(`(r.room_type = 'district' OR (r.room_type = 'personal' AND r.is_active = true))`);
    }

    // 标题搜索
    if (search && search.trim()) {
        // 搜索名称和描述
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern);
        conditions.push(`(r.name ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        const query = `
            SELECT r.id, r.name, r.description, r.room_type, r.district_code, r.max_members, r.creator_id, r.created_at,
                   u.nickname as creator_nickname, u.avatar_url as creator_avatar,
                   COUNT(m.id) as online_count,
                   COUNT(CASE WHEN m.status = 'studying' THEN 1 END) as studying_count
            FROM study_rooms r
            LEFT JOIN users u ON r.creator_id = u.id
            LEFT JOIN study_room_members m ON r.id = m.room_id
            ${whereClause}
            GROUP BY r.id, u.nickname, u.avatar_url
            ORDER BY 
                CASE WHEN r.room_type = 'district' THEN 0 ELSE 1 END,
                online_count DESC,
                r.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const countQuery = `
            SELECT COUNT(*) as total FROM study_rooms r ${whereClause}
        `;

        const result = await pool.query(query, [...params, parseInt(limit), offset]);
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            rooms: result.rows,
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('获取自习室列表失败:', err);
        res.status(500).json({ error: '获取自习室列表失败' });
    }
});

// 创建个人自习室
app.post('/api/study-rooms', authMiddleware, quizRequired, async (req, res) => {
    const { name, description, max_members } = req.body;
    const userId = req.user.userId;

    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: '自习室名称不能为空' });
    }
    if (name.trim().length < 2 || name.trim().length > 20) {
        return res.status(400).json({ error: '名称长度需在2-20字符之间' });
    }

    // 检查名称是否和已有自习室（包括区域自习室）重复
    const nameCheck = await pool.query('SELECT id FROM study_rooms WHERE name = $1', [name.trim()]);
    if (nameCheck.rows.length > 0) {
        return res.status(400).json({ error: '该名称已被使用' });
    }

    const validMax = [4, 6, 8, 10].includes(parseInt(max_members)) ? parseInt(max_members) : 6;

    try {
        const result = await pool.query(
            'INSERT INTO study_rooms (name, description, room_type, max_members, creator_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name.trim(), description || '', 'personal', validMax, userId]
        );
        res.json({
            id: result.rows[0].id,
            message: '自习室创建成功'
        });
    } catch (err) {
        console.error('创建自习室失败:', err);
        res.status(500).json({ error: '创建自习室失败' });
    }
});

// 获取单个自习室详情（含成员状态）
app.get('/api/study-rooms/:id', async (req, res) => {
    const roomId = parseInt(req.params.id);
    if (isNaN(roomId)) return res.status(400).json({ error: '无效的自习室ID' });

    try {
        // 房间基本信息
        const roomQuery = `
            SELECT r.*, u.nickname as creator_nickname, u.avatar_url as creator_avatar
            FROM study_rooms r
            LEFT JOIN users u ON r.creator_id = u.id
            WHERE r.id = $1
        `;
        const roomResult = await pool.query(roomQuery, [roomId]);
        if (roomResult.rows.length === 0) return res.status(404).json({ error: '自习室不存在' });
        const room = roomResult.rows[0];

        // 成员列表（含状态）
        const membersQuery = `
            SELECT m.user_id, m.status, m.session_start, m.joined_at,
                   u.nickname, u.avatar_url
            FROM study_room_members m
            JOIN users u ON m.user_id = u.id
            WHERE m.room_id = $1
            ORDER BY m.joined_at ASC
        `;
        const membersResult = await pool.query(membersQuery, [roomId]);

        // 判断当前用户是否已加入
        let isJoined = false;
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const memberCheck = await pool.query(
                    'SELECT id FROM study_room_members WHERE room_id = $1 AND user_id = $2',
                    [roomId, decoded.userId]
                );
                if (memberCheck.rows.length > 0) isJoined = true;
            } catch (e) { /* token 无效，忽略 */ }
        }

        res.json({
            room,
            members: membersResult.rows,
            isJoined
        });
    } catch (err) {
        console.error('获取自习室详情失败:', err);
        res.status(500).json({ error: '获取自习室详情失败' });
    }
});

// 加入自习室
app.post('/api/study-rooms/:id/join', authMiddleware, quizRequired, async (req, res) => {
    const roomId = parseInt(req.params.id);
    const userId = req.user.userId;
    if (isNaN(roomId)) return res.status(400).json({ error: '无效的自习室ID' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 检查自习室是否存在且可用
        const roomCheck = await client.query(
            'SELECT * FROM study_rooms WHERE id = $1',
            [roomId]
        );
        if (roomCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '自习室不存在' });
        }
        const room = roomCheck.rows[0];
        if (room.room_type === 'personal' && !room.is_active) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '该自习室已关闭' });
        }

        // 检查人数上限
        const countResult = await client.query(
            'SELECT COUNT(*) as cnt FROM study_room_members WHERE room_id = $1',
            [roomId]
        );
        const count = parseInt(countResult.rows[0].cnt);
        if (count >= room.max_members) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '自习室已满，请稍后再试' });
        }

        // 确保一个用户同时只能在一个自习室：先退出所有旧自习室
        await client.query('DELETE FROM study_room_members WHERE user_id = $1', [userId]);

        // 加入新自习室
        await client.query(
            'INSERT INTO study_room_members (room_id, user_id, status) VALUES ($1, $2, $3)',
            [roomId, userId, 'idle']
        );

        await client.query('COMMIT');
        res.json({ message: '加入成功' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('加入自习室失败:', err);
        res.status(500).json({ error: '加入自习室失败' });
    } finally {
        client.release();
    }
});

// 退出自习室
app.post('/api/study-rooms/:id/leave', authMiddleware, async (req, res) => {
    const roomId = parseInt(req.params.id);
    const userId = req.user.userId;
    if (isNaN(roomId)) return res.status(400).json({ error: '无效的自习室ID' });

    try {
        const result = await pool.query(
            'DELETE FROM study_room_members WHERE room_id = $1 AND user_id = $2 RETURNING id',
            [roomId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ error: '你未在该自习室中' });
        }
        res.json({ message: '已退出自习室' });
    } catch (err) {
        console.error('退出自习室失败:', err);
        res.status(500).json({ error: '退出自习室失败' });
    }
});

// 更新自身状态（含番茄钟计时）
app.patch('/api/study-rooms/:id/status', authMiddleware, async (req, res) => {
    const roomId = parseInt(req.params.id);
    const userId = req.user.userId;
    const { status, session_start } = req.body;  // status: 'idle' | 'studying' | 'resting'

    if (isNaN(roomId)) return res.status(400).json({ error: '无效的自习室ID' });
    if (!['idle', 'studying', 'resting'].includes(status)) {
        return res.status(400).json({ error: '无效的状态值' });
    }

    try {
        // 确认用户在该自习室内
        const memberCheck = await pool.query(
            'SELECT id FROM study_room_members WHERE room_id = $1 AND user_id = $2',
            [roomId, userId]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(400).json({ error: '你未加入该自习室' });
        }

        // 更新状态
        const sessionStartVal = session_start ? new Date(session_start).toISOString() : null;
        await pool.query(
            'UPDATE study_room_members SET status = $1, session_start = $2 WHERE room_id = $3 AND user_id = $4',
            [status, sessionStartVal, roomId, userId]
        );

        // 如果状态变为 idle 或 resting，并且之前是 studying，可以在这里插入一条学习记录（可选）
        // 为将来统计做准备，简单起见 Phase 1 先不做

        res.json({ message: '状态更新成功' });
    } catch (err) {
        console.error('更新自习状态失败:', err);
        res.status(500).json({ error: '更新状态失败' });
    }
});

// 关闭/删除个人自习室（仅创建者）
app.delete('/api/study-rooms/:id', authMiddleware, async (req, res) => {
    const roomId = parseInt(req.params.id);
    const userId = req.user.userId;
    if (isNaN(roomId)) return res.status(400).json({ error: '无效的自习室ID' });

    try {
        const roomCheck = await pool.query('SELECT * FROM study_rooms WHERE id = $1', [roomId]);
        if (roomCheck.rows.length === 0) {
            return res.status(404).json({ error: '自习室不存在' });
        }
        const room = roomCheck.rows[0];
        if (room.room_type !== 'personal') {
            return res.status(400).json({ error: '不能删除区域自习室' });
        }
        if (room.creator_id !== userId) {
            // 管理员也可以删除
            const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
            if (!userCheck.rows[0]?.is_admin) {
                return res.status(403).json({ error: '无权删除该自习室' });
            }
        }

        // 软删除：设置为不活跃，或者直接删除记录（由于有 ON DELETE CASCADE，直接删也行）
        // 这里采用软删除以便保留数据
        await pool.query('UPDATE study_rooms SET is_active = false, updated_at = NOW() WHERE id = $1', [roomId]);
        // 同时清除该房间内的所有成员
        await pool.query('DELETE FROM study_room_members WHERE room_id = $1', [roomId]);

        res.json({ message: '自习室已关闭' });
    } catch (err) {
        console.error('关闭自习室失败:', err);
        res.status(500).json({ error: '关闭自习室失败' });
    }
});

// ---------- 自习室 API 结束 ----------

// ---------- 题库 API（重构版）----------

const MAX_DAILY_ATTEMPTS = 3;

// 获取题目信息（次数检查等，题目由前端提供）
app.get('/api/quiz/questions', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const level = parseInt(req.query.level) || 1;
    const type = req.query.type;

    try {
        if (level === 1) {
            const userRes = await pool.query('SELECT has_passed_quiz FROM users WHERE id = $1', [userId]);
            if (userRes.rows[0]?.has_passed_quiz) {
                return res.status(400).json({ error: '你已经通过了第一级考试，无需再考' });
            }
        } else if (level === 2) {
            const userRes = await pool.query('SELECT can_upload_media FROM users WHERE id = $1', [userId]);
            if (userRes.rows[0]?.can_upload_media) {
                return res.status(400).json({ error: '你已经通过了第二级考试，无需再考' });
            }
            if (!type || !['shenzhen', 'subjects', 'tech', 'general'].includes(type)) {
                return res.status(400).json({ error: '请选择有效的考试类型' });
            }
        }

        const todayStart = getBeijingDate();
        const countRes = await pool.query(
            'SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = $1 AND level = $2 AND created_at >= $3::date',
            [userId, level, todayStart]
        );
        const todayCount = parseInt(countRes.rows[0].cnt);

        if (todayCount >= MAX_DAILY_ATTEMPTS) {
            return res.status(403).json({
                error: '今日答题次数已用完（' + MAX_DAILY_ATTEMPTS + '/' + MAX_DAILY_ATTEMPTS + '），请明天再来',
                remaining: 0,
                maxAttempts: MAX_DAILY_ATTEMPTS
            });
        }

        res.json({
            message: '题目已由前端题库提供',
            level: level,
            type: type || 'basic',
            remaining: MAX_DAILY_ATTEMPTS - todayCount,
            maxAttempts: MAX_DAILY_ATTEMPTS
        });
    } catch (err) {
        console.error('获取题目失败:', err);
        res.status(500).json({ error: '获取题目失败' });
    }
});

// 提交答案
app.post('/api/quiz/submit', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { level, type, answers } = req.body;

    if (!level || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: '参数错误' });
    }

    try {
        if (level === 1) {
            const userRes = await pool.query('SELECT has_passed_quiz FROM users WHERE id = $1', [userId]);
            if (userRes.rows[0]?.has_passed_quiz) {
                return res.status(400).json({ error: '已通过第一级' });
            }
        } else if (level === 2) {
            const userRes = await pool.query('SELECT can_upload_media FROM users WHERE id = $1', [userId]);
            if (userRes.rows[0]?.can_upload_media) {
                return res.status(400).json({ error: '已通过第二级' });
            }
        }

        // 检查今日答题次数
        const todayStart = getBeijingDate();
        const countRes = await pool.query(
            'SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = $1 AND level = $2 AND created_at >= $3::date',
            [userId, level, todayStart]
        );
        const todayCount = parseInt(countRes.rows[0].cnt);
        if (todayCount >= MAX_DAILY_ATTEMPTS) {
            return res.status(403).json({
                error: '今日答题次数已用完（' + MAX_DAILY_ATTEMPTS + '/' + MAX_DAILY_ATTEMPTS + '），请明天再来'
            });
        }

        let correctMap;
        if (level === 1) {
            correctMap = QUIZ_ANSWERS.level1;
        } else if (level === 2 && type) {
            correctMap = QUIZ_ANSWERS.level2[type];
        } else {
            return res.status(400).json({ error: '参数错误' });
        }

        let score = 0;
        const totalQuestions = answers.length;
        answers.forEach(function(a) {
            var correctAnswer = correctMap[a.question_id];
            if (correctAnswer !== undefined && correctAnswer === a.answer) {
                score += (level === 1) ? 5 : 10;
            }
        });

        const maxScore = totalQuestions * ((level === 1) ? 5 : 10);
        const passLine = level === 1 ? 60 : 70;
        const passed = score >= passLine;

        // 兼容旧表结构：先尝试带新字段的 INSERT，失败则回退到基本 INSERT
        try {
            await pool.query(
                'INSERT INTO quiz_attempts (user_id, score, passed, total_questions, level, quiz_type) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, score, passed, totalQuestions, level, type || 'basic']
            );
        } catch (e) {
            await pool.query(
                'INSERT INTO quiz_attempts (user_id, score, passed) VALUES ($1, $2, $3)',
                [userId, score, passed]
            );
        }

        if (passed) {
            if (level === 1) {
                await pool.query('UPDATE users SET has_passed_quiz = true WHERE id = $1', [userId]);
            } else if (level === 2) {
                await pool.query('UPDATE users SET can_upload_media = true WHERE id = $1', [userId]);
            }
        }

        res.json({
            score: score,
            maxScore: maxScore,
            passed: passed,
            message: passed ? ('恭喜通过考试！（' + score + '/' + maxScore + '分）') : ('未通过（' + score + '/' + maxScore + '分，需要' + passLine + '分）'),
            totalQuestions: totalQuestions
        });
    } catch (err) {
        console.error('提交答题失败:', err);
        res.status(500).json({ error: '提交答题失败' });
    }
});

// 获取用户考试状态
app.get('/api/quiz/status', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const level = parseInt(req.query.level) || 1;

    try {
        let canUploadMedia = false;
        try {
            const r = await pool.query('SELECT can_upload_media FROM users WHERE id = $1', [userId]);
            canUploadMedia = r.rows[0]?.can_upload_media || false;
        } catch (e) { /* 旧表没有 can_upload_media 列 */ }

        const userRes = await pool.query('SELECT has_passed_quiz, exp FROM users WHERE id = $1', [userId]);
        const todayStart = getBeijingDate();

        let todayCount = 0;
        try {
            const countRes = await pool.query(
                'SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = $1 AND level = $2 AND created_at >= $3::date',
                [userId, level, todayStart]
            );
            todayCount = parseInt(countRes.rows[0].cnt);
        } catch (e) {
            const countRes = await pool.query(
                'SELECT COUNT(*) as cnt FROM quiz_attempts WHERE user_id = $1 AND created_at >= $2::date',
                [userId, todayStart]
            );
            todayCount = parseInt(countRes.rows[0].cnt);
        }

        let recentAttempts = [];
        try {
            const attemptsRes = await pool.query(
                'SELECT score, passed, total_questions, quiz_type, level, created_at FROM quiz_attempts WHERE user_id = $1 AND level = $2 ORDER BY created_at DESC LIMIT 5',
                [userId, level]
            );
            recentAttempts = attemptsRes.rows;
        } catch (e) {
            const attemptsRes = await pool.query(
                'SELECT score, passed, created_at FROM quiz_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
                [userId]
            );
            recentAttempts = attemptsRes.rows;
        }

        res.json({
            level1_passed: userRes.rows[0]?.has_passed_quiz || false,
            level2_passed: canUploadMedia,
            exp: userRes.rows[0]?.exp || 0,
            today_attempts: todayCount,
            max_attempts: MAX_DAILY_ATTEMPTS,
            remaining: Math.max(0, MAX_DAILY_ATTEMPTS - todayCount),
            recent_attempts: recentAttempts
        });
    } catch (err) {
        console.error('获取考试状态失败:', err);
        res.status(500).json({ error: '获取考试状态失败' });
    }
});

// ---------- 题库 API 结束 ----------

// ---------- 私信 API ----------

// 获取私信对话列表
app.get('/api/messages/conversations', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const query = `
            SELECT
                other_user_id,
                u.nickname as other_nickname,
                u.avatar_url as other_avatar,
                last_msg_content,
                last_msg_time,
                unread_count
            FROM (
                SELECT DISTINCT ON (
                    CASE
                        WHEN sender_id = $1 THEN receiver_id
                        ELSE sender_id
                    END
                )
                    CASE
                        WHEN sender_id = $1 THEN receiver_id
                        ELSE sender_id
                    END AS other_user_id,
                    content AS last_msg_content,
                    created_at AS last_msg_time,
                    (SELECT COUNT(*) FROM messages m2
                     WHERE m2.receiver_id = $1
                       AND m2.sender_id = (
                           CASE
                               WHEN messages.sender_id = $1 THEN messages.receiver_id
                               ELSE messages.sender_id
                           END
                       )
                       AND m2.read_at IS NULL) AS unread_count
                FROM messages
                WHERE sender_id = $1 OR receiver_id = $1
                ORDER BY
                    CASE
                        WHEN sender_id = $1 THEN receiver_id
                        ELSE sender_id
                    END,
                    created_at DESC
            ) sub
            JOIN users u ON sub.other_user_id = u.id
            ORDER BY sub.last_msg_time DESC
        `;
        const result = await pool.query(query, [userId]);
        res.json({ conversations: result.rows });
    } catch (err) {
        console.error('获取对话列表失败:', err);
        res.status(500).json({ error: '获取对话列表失败' });
    }
});

// 获取与指定用户的聊天记录
app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
    const myId = req.user.userId;
    const otherId = parseInt(req.params.userId);
    if (isNaN(otherId)) return res.status(400).json({ error: '无效的用户ID' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    try {
        const query = `
            SELECT m.*,
                   u.nickname as sender_nickname,
                   u.avatar_url as sender_avatar
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
            LIMIT $3 OFFSET $4
        `;
        const result = await pool.query(query, [myId, otherId, limit, offset]);
        res.json({ messages: result.rows });
    } catch (err) {
        console.error('获取聊天记录失败:', err);
        res.status(500).json({ error: '获取聊天记录失败' });
    }
});

// 发送私信
app.post('/api/messages', authMiddleware, quizRequired, async (req, res) => {
    const senderId = req.user.userId;
    const { receiver_id, content } = req.body;

    if (!receiver_id || !content || content.trim().length === 0) {
        return res.status(400).json({ error: '接收者ID和消息内容不能为空' });
    }

    try {
        // 检查接收者是否存在且开启了私信
        const userCheck = await pool.query(
            'SELECT id, nickname, allow_messages FROM users WHERE id = $1',
            [receiver_id]
        );
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        console.log('🔍 allow_messages 调试:', { receiver_id, allow_messages: userCheck.rows[0].allow_messages, type: typeof userCheck.rows[0].allow_messages });
        if (!userCheck.rows[0].allow_messages) {
            return res.status(403).json({ error: '对方未开启私信功能' });
        }

        // 防骚扰：检查对方是否曾回复过我
        const hasReplied = await pool.query(
            `SELECT 1 FROM messages
             WHERE sender_id = $1 AND receiver_id = $2 LIMIT 1`,
            [receiver_id, senderId]
        );

        if (hasReplied.rows.length === 0) {
            // 对方从未回复，检查我是否已经发过
            const alreadySent = await pool.query(
                `SELECT 1 FROM messages
                 WHERE sender_id = $1 AND receiver_id = $2 LIMIT 1`,
                [senderId, receiver_id]
            );
            if (alreadySent.rows.length > 0) {
                return res.status(403).json({
                    error: '对方尚未回复，你只能发送一条消息，请耐心等待。'
                });
            }
        }

        // 插入消息
        const result = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING id, created_at',
            [senderId, receiver_id, content.trim()]
        );

        res.json({
            id: result.rows[0].id,
            created_at: result.rows[0].created_at,
            message: '发送成功'
        });
    } catch (err) {
        console.error('发送私信失败:', err);
        res.status(500).json({ error: '发送私信失败' });
    }
});

// 标记已读
app.put('/api/messages/read/:userId', authMiddleware, async (req, res) => {
    const myId = req.user.userId;
    const otherId = parseInt(req.params.userId);
    if (isNaN(otherId)) return res.status(400).json({ error: '无效的用户ID' });

    try {
        await pool.query(
            `UPDATE messages SET read_at = NOW()
             WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL`,
            [otherId, myId]
        );
        res.json({ message: '已标记为已读' });
    } catch (err) {
        console.error('标记已读失败:', err);
        res.status(500).json({ error: '标记已读失败' });
    }
});

// ---------- 私信 API 结束 ----------

// ---------- 圈子相关 API ----------

// 获取所有圈子（支持分页、搜索、排序）
app.get('/api/circles', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sort = req.query.sort || 'member_count';

    try {
        let whereClause = '';
        let params = [];
        if (search) {
            whereClause = 'WHERE name ILIKE $1 OR description ILIKE $1';
            params.push(search);
        }

        let orderBy = 'ORDER BY member_count DESC';
        if (sort === 'post_count') orderBy = 'ORDER BY post_count DESC';
        if (sort === 'created_at') orderBy = 'ORDER BY created_at DESC';

        const query = `
            SELECT c.*, u.nickname as creator_nickname, u.avatar_url as creator_avatar
            FROM circles c
            LEFT JOIN users u ON c.creator_id = u.id
            ${whereClause}
            ${orderBy}
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const countQuery = `SELECT COUNT(*) as total FROM circles c ${whereClause}`;

        const result = await pool.query(query, [...params, limit, offset]);
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            circles: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取圈子列表失败' });
    }
});

// 获取单个圈子详情
app.get('/api/circles/:id', async (req, res) => {
    const circleId = parseInt(req.params.id);
    if (isNaN(circleId)) return res.status(400).json({ error: '无效的圈子ID' });

    try {
        const circleQuery = `
            SELECT c.*, u.nickname as creator_nickname, u.avatar_url as creator_avatar
            FROM circles c
            LEFT JOIN users u ON c.creator_id = u.id
            WHERE c.id = $1
        `;
        const circleResult = await pool.query(circleQuery, [circleId]);
        if (circleResult.rows.length === 0) return res.status(404).json({ error: '圈子不存在' });
        const circle = circleResult.rows[0];

        const membersQuery = `
            SELECT cm.*, u.nickname, u.avatar_url
            FROM circle_members cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.circle_id = $1
            ORDER BY cm.joined_at ASC
            LIMIT 20
        `;
        const membersResult = await pool.query(membersQuery, [circleId]);

        let isJoined = false;
        let userRole = null;
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const memberCheck = await pool.query(
                    'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
                    [circleId, decoded.userId]
                );
                if (memberCheck.rows.length > 0) {
                    isJoined = true;
                    userRole = memberCheck.rows[0].role;
                }
            } catch (e) { }
        }

        res.json({ circle, members: membersResult.rows, isJoined, userRole });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取圈子详情失败' });
    }
});

// 获取圈子内的帖子
app.get('/api/circles/:id/posts', async (req, res) => {
    const circleId = parseInt(req.params.id);
    if (isNaN(circleId)) return res.status(400).json({ error: '无效的圈子ID' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const sort = req.query.sort || 'latest';

    try {
        let orderBy = 'ORDER BY p.created_at DESC';
        if (sort === 'hot') {
            orderBy = 'ORDER BY (p.likes * 3 + p.view_count * 1 + (SELECT COUNT(*) FROM replies WHERE post_id = p.id) * 2) DESC';
        }

        const query = `
            SELECT p.id, p.title, p.content, p.category, p.tags, p.view_count, p.created_at, p.likes,
                   u.nickname, u.id as user_id, u.avatar_url, u.exp, u.has_passed_quiz,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.circle_id = $1
            ${orderBy}
            LIMIT $2 OFFSET $3
        `;
        const countQuery = `SELECT COUNT(*) as total FROM posts WHERE circle_id = $1`;

        const result = await pool.query(query, [circleId, limit, offset]);
        const countResult = await pool.query(countQuery, [circleId]);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            posts: result.rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取圈子帖子失败' });
    }
});

// 加入圈子
app.post('/api/circles/:id/join', authMiddleware, async (req, res) => {
    const circleId = parseInt(req.params.id);
    const userId = req.user.userId;

    if (isNaN(circleId)) return res.status(400).json({ error: '无效的圈子ID' });

    try {
        const circleCheck = await pool.query('SELECT id FROM circles WHERE id = $1', [circleId]);
        if (circleCheck.rows.length === 0) {
            return res.status(404).json({ error: '圈子不存在' });
        }

        const memberCheck = await pool.query(
            'SELECT id FROM circle_members WHERE circle_id = $1 AND user_id = $2',
            [circleId, userId]
        );
        if (memberCheck.rows.length > 0) {
            return res.status(400).json({ error: '您已经加入该圈子' });
        }

        await pool.query(
            'INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, $3)',
            [circleId, userId, 'member']
        );
        await pool.query('UPDATE circles SET member_count = member_count + 1 WHERE id = $1', [circleId]);

        res.json({ message: '加入成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '加入失败' });
    }
});

// 退出圈子
app.post('/api/circles/:id/leave', authMiddleware, async (req, res) => {
    const circleId = parseInt(req.params.id);
    const userId = req.user.userId;

    if (isNaN(circleId)) return res.status(400).json({ error: '无效的圈子ID' });

    try {
        const circleCheck = await pool.query('SELECT creator_id FROM circles WHERE id = $1', [circleId]);
        if (circleCheck.rows.length === 0) {
            return res.status(404).json({ error: '圈子不存在' });
        }
        if (circleCheck.rows[0].creator_id === userId) {
            return res.status(400).json({ error: '创建者不能退出圈子，请先转让圈主或解散圈子' });
        }

        const result = await pool.query(
            'DELETE FROM circle_members WHERE circle_id = $1 AND user_id = $2 RETURNING id',
            [circleId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(400).json({ error: '您尚未加入该圈子' });
        }

        await pool.query('UPDATE circles SET member_count = member_count - 1 WHERE id = $1', [circleId]);

        res.json({ message: '退出成功' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '退出失败' });
    }
});

// ---------- 圈子申请 API ----------

// 创建圈子申请（初始状态为 pending_members，等待参与者确认）
app.post('/api/circle-applications', authMiddleware, async (req, res) => {
    const { name, description, participant_ids, icon_url, banner_url } = req.body;
    const userId = req.user.userId;

    if (!name || !description) {
        return res.status(400).json({ error: '圈子名称和简介不能为空' });
    }
    if (name.length < 2 || name.length > 20) {
        return res.status(400).json({ error: '圈子名称长度需在2-20字符之间' });
    }

    const uniqueParticipants = [...new Set([...(participant_ids || []), userId])];
    if (uniqueParticipants.length < 5) {
        return res.status(400).json({ error: '创建圈子需要至少5人联合申请' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const nameCheck = await client.query('SELECT id FROM circles WHERE name = $1', [name]);
        if (nameCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '该圈子名称已存在' });
        }

        const appCheck = await client.query(
            "SELECT id FROM circle_creation_applications WHERE name = $1 AND status IN ('pending_members', 'pending')",
            [name]
        );
        if (appCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '该圈子名称已有正在进行的申请' });
        }

        const userCheck = await client.query(
            'SELECT id FROM users WHERE id = ANY($1::int[])',
            [uniqueParticipants]
        );
        if (userCheck.rows.length !== uniqueParticipants.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '部分参与者不存在' });
        }

        const appResult = await client.query(
            `INSERT INTO circle_creation_applications (name, description, initiator_id, icon_url, banner_url, status, confirmed_count)
             VALUES ($1, $2, $3, $4, $5, 'pending_members', 1) RETURNING id`,
            [name, description, userId, icon_url || null, banner_url || null]
        );
        const applicationId = appResult.rows[0].id;

        await client.query(
            'INSERT INTO circle_creation_participants (application_id, user_id) VALUES ($1, $2)',
            [applicationId, userId]
        );

        await client.query(
            'INSERT INTO circle_application_confirms (application_id, user_id) VALUES ($1, $2)',
            [applicationId, userId]
        );

        for (const pid of uniqueParticipants) {
            if (pid === userId) continue;
            await client.query(
                'INSERT INTO circle_creation_participants (application_id, user_id) VALUES ($1, $2)',
                [applicationId, pid]
            );
        }

        await client.query('COMMIT');

        const initiatorRes = await client.query('SELECT nickname FROM users WHERE id = $1', [userId]);
        const initiatorNickname = initiatorRes.rows[0].nickname;
        for (const pid of uniqueParticipants) {
            if (pid === userId) continue;
            await createNotification(
                pid,
                'circle_invite',
                applicationId,
                userId,
                `${initiatorNickname} 邀请你共同创建圈子“${name}”`
            );
        }

        res.json({ message: '申请已创建，已向成员发送确认邀请', applicationId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '提交申请失败' });
    } finally {
        client.release();
    }
});

// 参与者确认参与申请（confirm 和 respond 两个路由）
const handleConfirmApplication = async (req, res) => {
    const applicationId = parseInt(req.params.id);
    const userId = req.user.userId;

    if (isNaN(applicationId)) return res.status(400).json({ error: '无效的申请ID' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const appResult = await client.query(
            'SELECT * FROM circle_creation_applications WHERE id = $1 AND status = $2',
            [applicationId, 'pending_members']
        );
        if (appResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '申请不存在或已结束' });
        }
        const app = appResult.rows[0];

        const participantCheck = await client.query(
            'SELECT id FROM circle_creation_participants WHERE application_id = $1 AND user_id = $2',
            [applicationId, userId]
        );
        if (participantCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '您不是该申请的参与者' });
        }

        const confirmCheck = await client.query(
            'SELECT id FROM circle_application_confirms WHERE application_id = $1 AND user_id = $2',
            [applicationId, userId]
        );
        if (confirmCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '您已经确认过该申请' });
        }

        await client.query(
            'INSERT INTO circle_application_confirms (application_id, user_id) VALUES ($1, $2)',
            [applicationId, userId]
        );

        const updateResult = await client.query(
            'UPDATE circle_creation_applications SET confirmed_count = confirmed_count + 1 WHERE id = $1 RETURNING confirmed_count',
            [applicationId]
        );
        const newCount = updateResult.rows[0].confirmed_count;

        const totalResult = await client.query(
            'SELECT COUNT(*) as total FROM circle_creation_participants WHERE application_id = $1',
            [applicationId]
        );
        const totalParticipants = parseInt(totalResult.rows[0].total);

        if (newCount >= totalParticipants && newCount >= 5) {
            await client.query(
                'UPDATE circle_creation_applications SET status = $1, updated_at = NOW() WHERE id = $2',
                ['pending', applicationId]
            );

            const adminResult = await client.query('SELECT id FROM users WHERE is_admin = true');
            for (const admin of adminResult.rows) {
                await createNotification(
                    admin.id,
                    'circle_application',
                    applicationId,
                    app.initiator_id,
                    `新圈子申请：${app.name}（已集齐5人确认）`
                );
            }
        }

        await client.query('COMMIT');

        res.json({
            message: '确认成功',
            confirmed_count: newCount,
            total_participants: totalParticipants,
            status: newCount >= totalParticipants ? 'pending' : 'pending_members'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '确认操作失败' });
    } finally {
        client.release();
    }
};

app.put('/api/circle-applications/:id/confirm', authMiddleware, handleConfirmApplication);
app.put('/api/circle-applications/:id/respond', authMiddleware, handleConfirmApplication);
app.post('/api/circle-applications/:id/respond', authMiddleware, handleConfirmApplication); // 新增支持 POST

// 获取用户的圈子申请记录
app.get('/api/my-circle-applications', authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const query = `
            SELECT a.*,
                   (SELECT COUNT(*) FROM circle_creation_participants WHERE application_id = a.id) as participant_count,
                   (SELECT COUNT(*) FROM circle_application_confirms WHERE application_id = a.id) as confirmed_count,
                   (SELECT EXISTS(SELECT 1 FROM circle_application_confirms WHERE application_id = a.id AND user_id = $1)) as user_confirmed
            FROM circle_creation_applications a
            WHERE a.initiator_id = $1
               OR a.id IN (SELECT application_id FROM circle_creation_participants WHERE user_id = $1)
            ORDER BY a.created_at DESC
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取申请记录失败' });
    }
});

// ---------- 管理员 API：圈子申请处理 ----------
app.get('/api/admin/circle-applications', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const query = `
            SELECT a.*, u.nickname as initiator_nickname,
                   (SELECT COUNT(*) FROM circle_creation_participants WHERE application_id = a.id) as participant_count,
                   (SELECT COUNT(*) FROM circle_application_confirms WHERE application_id = a.id) as confirmed_count,
                   (SELECT json_agg(json_build_object('id', u2.id, 'nickname', u2.nickname, 'avatar_url', u2.avatar_url))
                    FROM circle_creation_participants p
                    JOIN users u2 ON p.user_id = u2.id
                    WHERE p.application_id = a.id) as participants
            FROM circle_creation_applications a
            JOIN users u ON a.initiator_id = u.id
            WHERE a.status = 'pending'
            ORDER BY a.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ applications: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取申请列表失败' });
    }
});

app.put('/api/admin/circle-applications/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const applicationId = parseInt(req.params.id);
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: '无效的操作' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const appResult = await client.query(
            'SELECT * FROM circle_creation_applications WHERE id = $1 AND status = $2',
            [applicationId, 'pending']
        );
        if (appResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '申请不存在或已处理' });
        }
        const app = appResult.rows[0];

        if (action === 'approve') {
            const circleResult = await client.query(
                `INSERT INTO circles (name, description, creator_id, icon_url, banner_url, member_count)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [app.name, app.description, app.initiator_id, app.icon_url, app.banner_url, 0]
            );
            const circleId = circleResult.rows[0].id;

            const participantsResult = await client.query(
                'SELECT user_id FROM circle_creation_participants WHERE application_id = $1',
                [applicationId]
            );
            const participantIds = participantsResult.rows.map(r => r.user_id);

            for (const pid of participantIds) {
                const role = (pid === app.initiator_id) ? 'creator' : 'member';
                await client.query(
                    'INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, $3)',
                    [circleId, pid, role]
                );
            }

            await client.query('UPDATE circles SET member_count = $1 WHERE id = $2', [participantIds.length, circleId]);
            await client.query(
                `UPDATE circle_creation_applications SET status = 'approved', approver_id = $1, updated_at = NOW() WHERE id = $2`,
                [req.user.userId, applicationId]
            );

            for (const pid of participantIds) {
                await createNotification(pid, 'circle_approved', circleId, null, `您参与的圈子 "${app.name}" 已通过审核`);
            }
        } else {
            await client.query(
                `UPDATE circle_creation_applications SET status = 'rejected', approver_id = $1, updated_at = NOW() WHERE id = $2`,
                [req.user.userId, applicationId]
            );
            await createNotification(app.initiator_id, 'circle_rejected', null, null, `您的圈子申请 "${app.name}" 已被拒绝`);
        }

        await client.query('COMMIT');
        res.json({ message: action === 'approve' ? '圈子创建成功' : '已拒绝申请' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: '处理失败' });
    } finally {
        client.release();
    }
});

// ---------- 启动 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});