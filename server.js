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

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
                    show_activity, show_replies, show_favorites,
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
    const { nickname, school, district, hobby, show_activity, show_replies, show_favorites } = req.body;
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
        if (show_activity !== undefined) { updateFields.push(`show_activity = $${updateValues.length + 1}`); updateValues.push(show_activity); }
        if (show_replies !== undefined) { updateFields.push(`show_replies = $${updateValues.length + 1}`); updateValues.push(show_replies); }
        if (show_favorites !== undefined) { updateFields.push(`show_favorites = $${updateValues.length + 1}`); updateValues.push(show_favorites); }
        if (updateFields.length > 0) {
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
app.post('/api/users/:id/follow', authMiddleware, async (req, res) => {
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
                   u.nickname, u.id as user_id, u.avatar_url,
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
            SELECT id, email, nickname, school, district, hobby, avatar_url, created_at,
                   (SELECT COUNT(*) FROM user_follows WHERE follower_id = $1) as following_count,
                   (SELECT COUNT(*) FROM user_follows WHERE followee_id = $1) as follower_count,
                   EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $2 AND followee_id = $1) as is_following
            FROM users WHERE id = $1
        `;
        const result = await pool.query(query, [userId, currentUserId || 0]);
        if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        res.json(result.rows[0]);
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
        const priv = await pool.query('SELECT show_activity FROM users WHERE id = $1', [userId]);
        if (!priv.rows[0]?.show_activity) return res.json({ hidden: true, activity: [] });
        const activity = [];
        const today = new Date();
        for (let i = 364; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const level = Math.floor(Math.random() * 5);
            activity.push({ date, level });
        }
        res.json({ hidden: false, activity });
    } catch (err) {
        console.error(err);
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
app.post('/api/posts', authMiddleware, async (req, res) => {
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
    const sort = req.query.sort || 'latest';
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
                   u.nickname, u.id as user_id, u.avatar_url,
                   (SELECT COUNT(*) FROM replies WHERE post_id = p.id) as reply_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ${whereSql}
        `;
        switch (sort) {
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
            `SELECT p.*, u.nickname, u.avatar_url, u.id as user_id
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1`,
            [id]
        );
        if (postResult.rows.length === 0) return res.status(404).json({ error: '帖子不存在' });
        const post = postResult.rows[0];
        const repliesResult = await pool.query(
            `SELECT r.*, u.nickname, u.avatar_url
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
app.post('/api/posts/:id/replies', authMiddleware, async (req, res) => {
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
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const userId = req.user.userId;
    try {
        const existing = await pool.query('SELECT id FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            await pool.query('UPDATE posts SET likes = likes - 1 WHERE id = $1', [postId]);
            const likesResult = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
            res.json({ liked: false, likes: likesResult.rows[0].likes });
        } else {
            await pool.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            await pool.query('UPDATE posts SET likes = likes + 1 WHERE id = $1', [postId]);
            const likesResult = await pool.query('SELECT likes FROM posts WHERE id = $1', [postId]);
            res.json({ liked: true, likes: likesResult.rows[0].likes });
            const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
            const ownerId = postOwner.rows[0].user_id;
            if (ownerId !== userId) {
                await createNotification(ownerId, 'like', postId, userId);
            }
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
app.post('/api/posts/:id/favorite', authMiddleware, async (req, res) => {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: '无效的帖子ID' });
    const userId = req.user.userId;
    try {
        const existing = await pool.query('SELECT id FROM post_favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM post_favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            res.json({ favorited: false });
        } else {
            await pool.query('INSERT INTO post_favorites (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            res.json({ favorited: true });
            const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
            const ownerId = postOwner.rows[0].user_id;
            if (ownerId !== userId) {
                await createNotification(ownerId, 'favorite', postId, userId);
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
        const today = new Date().toISOString().slice(0, 10);
        const newUsersRes = await pool.query('SELECT COUNT(*) as total FROM users WHERE created_at::date = $1', [today]);
        const newUsersToday = parseInt(newUsersRes.rows[0].total);
        const newPostsRes = await pool.query('SELECT COUNT(*) as total FROM posts WHERE created_at::date = $1', [today]);
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
    const status = action === 'resolve' ? 'resolved' : 'rejected';
    try {
        await pool.query(
            `UPDATE reports SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3`,
            [status, req.user.userId, reportId]
        );
        const reportRes = await pool.query('SELECT reporter_id FROM reports WHERE id = $1', [reportId]);
        const reporterId = reportRes.rows[0].reporter_id;
        const content = action === 'resolve' ? '您的举报已通过处理，违规内容已被删除。' : '您的举报已被驳回。';
        await createNotification(reporterId, 'report_resolved', reportId, null, content);
        res.json({ message: '举报已处理' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '处理失败' });
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
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }
        const dauQuery = `
            WITH daily_users AS (
                SELECT DISTINCT user_id, created_at::date as date FROM posts
                UNION
                SELECT DISTINCT user_id, created_at::date FROM replies
            )
            SELECT date, COUNT(DISTINCT user_id) as dau
            FROM daily_users
            WHERE date >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const dauResult = await pool.query(dauQuery);
        const dauMap = {};
        dauResult.rows.forEach(row => { dauMap[row.date.toISOString().slice(0, 10)] = parseInt(row.dau); });
        const postsQuery = `
            SELECT created_at::date as date, COUNT(*) as count
            FROM posts
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const postsResult = await pool.query(postsQuery);
        const postsMap = {};
        postsResult.rows.forEach(row => { postsMap[row.date.toISOString().slice(0, 10)] = parseInt(row.count); });
        const reportsQuery = `
            SELECT created_at::date as date, COUNT(*) as count
            FROM reports
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY date
            ORDER BY date
        `;
        const reportsResult = await pool.query(reportsQuery);
        const reportsMap = {};
        reportsResult.rows.forEach(row => { reportsMap[row.date.toISOString().slice(0, 10)] = parseInt(row.count); });
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
                   u.nickname, u.id as user_id, u.avatar_url,
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
app.post('/api/study-rooms', authMiddleware, async (req, res) => {
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
app.post('/api/study-rooms/:id/join', authMiddleware, async (req, res) => {
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
                   u.nickname, u.id as user_id, u.avatar_url,
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