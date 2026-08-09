# 深圳高中生社区 · 移动端（uni-app）开发指导文档

> 本文档面向 uni-app 移动端开发者 **MING**，帮助你从零开发「深圳高中生社区」的手机 App。
> 后端 API 已全部就绪，你只需专注移动端 UI 与交互开发，无需修改任何后端代码。
> 文档同步维护于 GitHub 仓库：https://github.com/MuSHANw/szhss-community

---

## 目录

1. [项目概述](#一项目概述)
2. [数据库核心表结构](#二数据库核心表结构)
3. [API 接口完整文档](#三api-接口完整文档)
4. [Web 端功能对照表](#四web-端功能对照表)
5. [移动端开发优先级](#五移动端开发优先级)
6. [开发建议](#六开发建议)
7. [注意事项](#七注意事项)

---

## 一、项目概述

### 技术栈与架构

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Node.js + Express + PostgreSQL 14 | 所有 API 集中在 `server.js`（约 120 个接口） |
| Web 前端 | 原生 HTML/CSS/JS | 全部位于 `public/` 目录（33 个页面） |
| 移动端 | uni-app（待开发） | 由你负责，可一套代码编译 Android / iOS / H5 |
| 图标库 | Font Awesome 6（CDN） | Web 端使用，移动端可改用图标字体或图片 |
| 富文本 | Quill.js（CDN） | Web 端编辑器，移动端建议用 uni-app `editor` 组件 |
| 图表 | Chart.js（CDN） | 管理员后台/个人数据仪表盘使用 |

### 部署信息

| 项目 | 值 |
|------|-----|
| API 基础地址 | `https://szhss-community.top/api` |
| 服务器 | 阿里云轻量应用服务器（新加坡节点，2核1G） |
| 操作系统 | Ubuntu 22.04 |
| 反向代理 | Nginx（3000 端口 → 80/443） |
| 数据库 | PostgreSQL 14，库名 `szhss_community` |
| 时区 | 后端统一使用北京时间（`AT TIME ZONE 'Asia/Shanghai'`） |
| 免备案 | 新加坡节点无需 ICP 备案，但需公安联网备案 |

### 认证方式（重要）

- **JWT**：登录/注册成功返回 `token`，有效期 **7 天**
- 所有需要登录的接口，请求头必须携带：
  ```
  Authorization: Bearer <token>
  ```
- uni-app 中建议将 token 存入本地缓存：
  ```js
  uni.setStorageSync('token', token);
  uni.setStorageSync('user', user);
  ```
- 每次请求封装时自动带上 token，401 时跳转登录页

### 图片/视频 URL 拼接（重要）

后端 API 返回的图片/视频 URL 是**相对路径**（如 `/uploads/xxx.jpg`），移动端展示时需拼接完整域名：

```js
function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return 'https://szhss-community.top' + url;
}
```

---

## 二、数据库核心表结构

> 共 **31 张表**。下表字段说明已合并各历史 SQL 变更（`docs/sql/` 目录），可直接作为移动端数据建模依据。

### 2.1 用户相关

#### users — 用户表（核心）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键，自增 |
| email | varchar(255) | 邮箱（登录账号，唯一） |
| password_hash | varchar(255) | bcrypt 加密后的密码 |
| nickname | varchar(100) | 昵称（2-12 字符，7 天内只能改一次） |
| school | varchar(100) | 学校 |
| district | varchar(50) | 行政区 |
| hobby | text | 爱好 |
| avatar_url | text | 头像 URL（相对路径） |
| is_admin | boolean | 是否管理员 |
| exp | int | 经验值 |
| has_passed_quiz | boolean | 是否通过一级入站答题（解锁发帖/回复） |
| can_upload_media | boolean | 是否通过二级考试（解锁图片/视频上传） |
| coins | int | 鹏城币余额 |
| following_count | int | 关注数（冗余计数） |
| follower_count | int | 粉丝数（冗余计数） |
| total_likes_received | int | 累计收到的点赞（成就统计） |
| total_favorites_received | int | 累计收到的收藏（成就统计） |
| total_replies_received | int | 累计收到的回复（成就统计） |
| allow_messages | boolean | 是否允许私信（默认 false，防骚扰） |
| show_activity | boolean | 隐私：是否公开活跃度日历 |
| show_replies | boolean | 隐私：是否公开回复列表 |
| show_favorites | boolean | 隐私：是否公开收藏列表 |
| show_stats | boolean | 隐私：是否公开数据统计仪表盘 |
| nickname_last_updated | timestamp | 昵称上次修改时间 |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### email_verifications — 邮箱验证码

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| email | varchar(255) | 邮箱 |
| code | varchar(6) | 验证码（注册 6 位 / 重置 token） |
| expires_at | timestamp | 过期时间（注册验证码 10 分钟 / 重置 token 30 分钟） |
| type | varchar(50) | 类型：`register` / `password_reset` |
| created_at | timestamp | 创建时间 |

#### user_follows — 用户关注关系

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| follower_id | int | 关注者 |
| followee_id | int | 被关注者 |
| created_at | timestamp | 关注时间 |

### 2.2 帖子相关

#### posts — 帖子表（核心）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 作者 ID |
| title | varchar(200) | 标题 |
| content | text | 正文（富文本 HTML，Quill 生成） |
| category | varchar(50) | 分类（学习/生活/社团/升学/综合…） |
| tags | text[] | 标签数组 |
| images | text[] | 图片 URL 数组（相对路径） |
| videos | text[] | 视频 URL 数组（相对路径） |
| view_count | int | 浏览量 |
| likes | int | 点赞数 |
| circle_id | int | 所属圈子 ID（null 表示普通帖子） |
| is_pinned | boolean | 是否置顶 |
| pinned_at | timestamp | 置顶时间 |
| is_essence | boolean | 是否精华（圈子帖） |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### post_media — 帖子媒体表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| post_id | int | 帖子 ID（级联删除） |
| media_url | text | 媒体 URL |
| media_type | varchar(10) | `image` / `video` |
| created_at | timestamp | 创建时间 |

#### replies — 回复表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| post_id | int | 所属帖子 |
| user_id | int | 回复者 |
| content | text | 回复内容 |
| parent_id | int | 父回复 ID（null 为楼中楼顶层，支持嵌套评论） |
| created_at | timestamp | 回复时间 |

#### post_likes — 帖子点赞表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 点赞者 |
| post_id | int | 帖子 ID |
| created_at | timestamp | 点赞时间 |

#### post_favorites — 帖子收藏表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 收藏者 |
| post_id | int | 帖子 ID |
| created_at | timestamp | 收藏时间 |

### 2.3 举报与反馈

#### reports — 举报表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| reporter_id | int | 举报人 |
| target_type | varchar(20) | 举报对象：`post` / `reply` / `user` |
| target_id | int | 被举报对象 ID |
| reason_type | varchar(50) | 举报原因类型 |
| reason | text | 补充说明 |
| status | varchar(20) | `pending` / `resolved` / `rejected` |
| resolved_by | int | 处理人（管理员） |
| resolved_at | timestamp | 处理时间 |
| created_at | timestamp | 举报时间 |

#### feedbacks — 反馈表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 提交人 |
| content | text | 反馈内容 |
| status | varchar(20) | `pending` / `resolved` / `read` |
| reply | text | 管理员回复 |
| resolved_by | int | 处理人 |
| resolved_at | timestamp | 处理时间 |
| created_at | timestamp | 提交时间 |

### 2.4 通知

#### notifications — 通知表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 通知接收者 |
| type | varchar(50) | 类型：`like`/`favorite`/`reply`/`follow`/`circle_invite`/`circle_event`/`circle_application`/`circle_approved`/`circle_rejected`/`message`/`report_resolved`/`cheer` 等 |
| source_id | int | 来源对象 ID（如帖子/回复 ID） |
| source_user_id | int | 触发者用户 ID |
| content | text | 通知内容 |
| is_read | boolean | 是否已读 |
| created_at | timestamp | 通知时间 |

### 2.5 圈子相关

#### circles — 圈子表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| name | varchar(50) | 圈子名称 |
| description | text | 简介 |
| icon_url | varchar(255) | 图标（相对路径） |
| banner_url | varchar(255) | 封面横幅（相对路径） |
| creator_id | int | 圈主 |
| member_count | int | 成员数（冗余计数） |
| post_count | int | 帖子数（冗余计数） |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### circle_members — 圈子成员表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| circle_id | int | 圈子 ID |
| user_id | int | 成员 ID |
| role | varchar(20) | 角色：`creator` / `admin` / `member` |
| joined_at | timestamp | 加入时间 |

#### circle_creation_applications — 圈子创建申请

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| name | varchar(50) | 申请圈子名称 |
| description | text | 简介 |
| initiator_id | int | 发起人 |
| icon_url / banner_url | varchar(255) | 图标 / 封面 |
| status | text | `pending_members`（成员确认中）→ `pending`（待管理员审核）→ `approved` / `rejected` |
| confirmed_count | int | 已确认人数 |
| approver_id | int | 审核管理员 |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### circle_creation_participants — 圈子创建参与者

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| application_id | int | 申请 ID |
| user_id | int | 参与者 |
| status | varchar(20) | `pending` / `confirmed` |
| confirmed_at | timestamp | 确认时间 |
| joined_at | timestamp | 参与时间 |

#### circle_application_confirms — 圈子申请确认记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| application_id | int | 申请 ID |
| user_id | int | 确认者 |
| confirmed_at | timestamp | 确认时间 |

#### circle_announcements — 圈子公告

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| circle_id | int | 圈子 ID（级联删除） |
| content | text | 公告内容 |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### circle_events — 圈子活动

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| circle_id | int | 圈子 ID |
| title | varchar(200) | 活动标题 |
| description | text | 活动详情 |
| location | varchar(200) | 地点 |
| start_time / end_time | timestamp | 开始 / 结束时间 |
| signup_deadline | timestamp | 报名截止 |
| max_participants | int | 人数上限 |
| created_by | int | 创建者 |
| created_at | timestamp | 创建时间 |

#### event_participants — 活动报名表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| event_id | int | 活动 ID（级联删除） |
| user_id | int | 报名者（级联删除） |
| joined_at | timestamp | 报名时间 |

### 2.6 自习室相关

#### study_rooms — 自习室表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| name | varchar(100) | 自习室名称 |
| description | text | 简介 |
| room_type | varchar(20) | `district`（区域自习室）/ `personal`（个人自习室） |
| district_code | varchar(50) | 行政区代码（区域自习室用） |
| max_members | int | 最大人数（默认 8，个人可选 4/6/8/10） |
| creator_id | int | 创建者 |
| is_active | boolean | 是否活跃（个人自习室删除后为 false） |
| created_at / updated_at | timestamp | 创建 / 更新时间 |

#### study_room_members — 自习室成员（在线状态）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| room_id | int | 自习室 ID |
| user_id | int | 用户 ID |
| status | varchar(20) | `idle` / `studying` / `resting` |
| session_start | timestamptz | 本次专注会话开始时间 |
| focus_duration | int | 番茄钟专注时长（默认 25 分钟） |
| rest_duration | int | 番茄钟休息时长（默认 5 分钟） |
| study_goal | varchar(100) | 学习目标 |
| cheers_today | int | 今日收到加油数 |
| cheers_last_date | date | 上次加油日期 |
| joined_at | timestamp | 加入时间 |

#### study_records / study_stats — 自习记录与统计

| 表 | 字段 | 说明 |
|----|------|------|
| study_records | id, user_id, room_id, duration, created_at | 历史自习时长记录 |
| study_stats | id, user_id, room_id, focus_minutes, completed_at | 每次完成专注的分钟数（排行榜数据源） |

### 2.7 私信

#### messages — 私信表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| sender_id | int | 发送者（级联删除） |
| receiver_id | int | 接收者（级联删除） |
| content | text | 消息内容 |
| read_at | timestamp | 已读时间（null 为未读） |
| created_at | timestamp | 发送时间 |

### 2.8 金币与任务

#### coin_transactions — 金币流水

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 用户（级联删除） |
| amount | int | 变动金额（正=获得，负=消费） |
| type | varchar(50) | `earn` / `spend` |
| source | varchar(100) | 来源（`daily_login` 签到 / `daily_task` 任务 / `report_accepted` 举报奖励等） |
| description | text | 描述 |
| created_at | timestamp | 时间 |

#### task_completions — 任务完成记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 用户（级联删除） |
| task_id | varchar(100) | 任务标识 |
| completed_at | timestamp | 完成时间 |

### 2.9 入站答题

#### quiz_questions — 题库

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| question | text | 题干 |
| option_a ~ option_d | varchar(200) | 四个选项 |
| correct_answer | char(1) | 正确答案（A/B/C/D） |
| category | varchar(50) | 分类：`community_rules` / `shenzhen_knowledge` / `internet_etiquette` |
| created_at | timestamp | 创建时间 |

> 注：题库实际由前端 JS 文件管理（`quiz-bank-data.js`），后端数据库仅存 10 道预设题作为兜底。

#### quiz_attempts — 答题记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 用户（级联删除） |
| level | int | 考试等级（1 社区规则 / 2 进阶） |
| quiz_type | varchar(50) | 二级考试类型：`shenzhen` / `subjects` / `tech` / `general` |
| score | int | 得分 |
| passed | boolean | 是否通过（一级≥60，二级≥70） |
| total_questions | int | 总题数 |
| created_at | timestamp | 考试时间 |

#### daily_exp_limits — 每日经验/次数限额

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 用户（级联删除） |
| action_type | varchar(50) | 动作类型（如 `quiz_attempt`） |
| date | date | 日期（按北京时间） |
| count | int | 当日次数 |

### 2.10 公告

#### announcements — 社区公告

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| title | varchar(200) | 公告标题 |
| content | text | 公告内容（富文本） |
| created_by | int | 发布管理员 |
| created_at / updated_at | timestamp | 发布 / 更新时间 |

#### announcement_confirmations — 公告确认

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| announcement_id | int | 公告 ID（级联删除） |
| user_id | int | 确认用户（级联删除） |
| confirmed_at | timestamp | 确认时间 |

---

## 三、API 接口完整文档

> 约定：
> - 基础路径：`https://szhss-community.top/api`（下文省略 `/api` 前缀）
> - 🔒 = 需要登录（携带 `Authorization: Bearer <token>`）
> - 📝 = 需要先通过一级入站答题
> - 📁 = 需要先通过二级考试（可上传图片/视频）
> - 🛡️ = 需要管理员权限
> - 所有时间字段均为**北京时间**
> - 返回的图片/视频 URL 为**相对路径**，需拼接 `https://szhss-community.top` 前缀

### 3.1 用户系统

#### POST /register — 用户注册
- **认证**：无需
- **Body**：`email`(string 必填)、`code`(string 必填，邮箱验证码)、`password`(string 必填，≥6位)、`nickname`(string 可选，缺省用邮箱前缀)
- **返回**：
  ```json
  { "token": "eyJ...", "user": { "id": 1, "email": "a@b.com", "nickname": "小明" } }
  ```
- **说明**：先调 `/send-code` 获取验证码（10 分钟有效），注册成功即自动登录（token 有效 7 天）

#### POST /send-code — 发送注册验证码
- **认证**：无需
- **Body**：`email`(string 必填)
- **返回**：`{ "message": "验证码已发送，请查收邮箱" }`
- **说明**：6 位数字验证码，10 分钟有效

#### POST /login — 用户登录
- **认证**：无需
- **Body**：`email`、`password`
- **返回**：
  ```json
  { "token": "eyJ...", "user": { "id": 1, "email": "a@b.com", "nickname": "小明" } }
  ```
- **说明**：登录成功加登录经验；token 有效期 7 天

#### POST /forgot-password — 申请重置密码
- **认证**：无需
- **Body**：`email`
- **返回**：`{ "message": "如果该邮箱已注册，重置链接已发送至你的邮箱" }`
- **说明**：无论邮箱是否存在都返回相同文案（防用户枚举）；重置 token 30 分钟有效

#### POST /reset-password — 执行重置密码
- **认证**：无需
- **Body**：`email`、`token`、`password`(≥6位)
- **返回**：`{ "message": "密码重置成功，请返回登录" }`
- **说明**：token 来自重置链接 URL 参数

#### GET /me — 获取当前登录用户
- **认证**：🔒
- **返回**：
  ```json
  {
    "id": 1, "email": "a@b.com", "nickname": "小明",
    "school": "深圳中学", "district": "罗湖区", "hobby": "编程",
    "avatar_url": "/uploads/xxx.jpg",
    "is_admin": false, "exp": 120, "has_passed_quiz": true, "coins": 35,
    "show_activity": true, "show_replies": true, "show_favorites": true,
    "show_stats": true, "allow_messages": false,
    "following_count": 3, "follower_count": 5
  }
  ```

#### PUT /me/profile — 更新个人资料 / 隐私设置
- **认证**：🔒
- **Body**（均可选）：`nickname`、`school`、`district`、`hobby`、`show_activity`(bool)、`show_replies`(bool)、`show_favorites`(bool)、`show_stats`(bool)、`allow_messages`(bool)
- **返回**：`{ "message": "更新成功" }`
- **说明**：昵称 7 天内只能改一次

#### PUT /me/password — 修改密码
- **认证**：🔒
- **Body**：`oldPassword`、`newPassword`(≥6位)
- **返回**：`{ "message": "密码修改成功" }`

#### POST /me/avatar — 上传头像
- **认证**：🔒
- **Body**：multipart/form-data 文件字段 `avatar`（图片 ≤2MB）
- **返回**：`{ "avatar_url": "/uploads/xxx.jpg" }`

#### POST /upload/file — 通用图片/视频上传
- **认证**：🔒 📁（需通过二级考试）
- **Body**：multipart/form-data 文件字段 `file`（图片或视频 ≤200MB）
- **返回**：`{ "url": "/uploads/xxx" }`
- **说明**：发帖图片/视频、编辑内容插图都走此接口

### 3.2 帖子系统

#### GET /posts — 帖子列表
- **认证**：无需
- **Query**：`page`(默认1)、`limit`(默认10)、`category`(可选)、`sort`(`recommended`默认/`hot`/`replied`)
- **返回**：
  ```json
  {
    "posts": [{
      "id": 1, "title": "标题", "content": "内容", "category": "学习",
      "tags": ["#物理"], "images": ["/uploads/a.jpg"], "videos": [],
      "view_count": 10, "likes": 3, "created_at": "2026-08-09T10:00:00",
      "is_pinned": false, "is_essence": false,
      "nickname": "小明", "user_id": 1, "avatar_url": "/uploads/xx.jpg",
      "exp": 120, "has_passed_quiz": true, "reply_count": 5
    }],
    "page": 1, "limit": 10, "total": 100, "totalPages": 10
  }
  ```
- **说明**：置顶帖始终排最前；`category=learning` 有特殊过滤逻辑

#### POST /posts — 发布帖子
- **认证**：🔒 📝
- **Body**：`title`(必填)、`content`(必填，富文本 HTML)、`category`(可选默认`综合`)、`tags`(数组)、`circle_id`(可选)、`images`(URL数组)、`videos`(URL数组)
- **返回**：`{ "id": 1, "message": "发布成功" }`
- **说明**：图片/视频 URL 来自 `/upload/file` 的返回

#### GET /posts/banner — 首页轮播横幅
- **认证**：无需
- **返回**：`{ "posts": [ { id, title, content, category, is_pinned, is_essence, created_at, images, nickname, avatar_url } ] }`
- **说明**：置顶帖最多 3 条 + 精华帖最多 3 条，共 ≤6 条

#### GET /posts/:id — 帖子详情 + 全部回复
- **认证**：无需
- **Path**：`id`
- **返回**：
  ```json
  {
    "post": { "id": 1, "title": "...", "content": "...", "category": "...",
      "tags": [], "images": [], "videos": [], "view_count": 10, "likes": 2,
      "nickname": "小明", "avatar_url": "...", "user_id": 1, "exp": 120,
      "has_passed_quiz": true, "created_at": "..." },
    "replies": [{
      "id": 1, "post_id": 1, "user_id": 2, "content": "回复内容",
      "parent_id": null, "created_at": "...",
      "nickname": "小红", "avatar_url": "...", "parent_nickname": null
    }]
  }
  ```
- **说明**：回复按创建时间升序，`parent_id` 用于嵌套评论展示

#### PUT /posts/:id/view — 浏览量 +1
- **认证**：无需
- **返回**：`{ "view_count": 11 }`
- **说明**：帖子详情页进入时调用

#### PUT /posts/:id — 编辑帖子
- **认证**：🔒（作者/管理员）
- **Body**：同发布帖子
- **返回**：`{ "message": "更新成功" }`

#### DELETE /posts/:id — 删除帖子
- **认证**：🔒（作者/管理员）
- **返回**：`{ "message": "删除成功" }`

#### PATCH /posts/:id/essence — 切换精华
- **认证**：🔒（管理员/圈主）
- **返回**：`{ "is_essence": true, "message": "已设为精华" }`

#### PATCH /posts/:id/pin — 切换置顶
- **认证**：🔒（管理员/圈主）
- **返回**：`{ "is_pinned": true, "message": "已置顶" }`

### 3.3 回复系统

#### POST /posts/:id/replies — 发表回复
- **认证**：🔒 📝
- **Path**：`id`
- **Body**：`content`(必填)、`parent_id`(可选，嵌套回复时传父回复 ID)
- **返回**：`{ "id": 1, "message": "回复成功" }`
- **说明**：回复帖子通知帖主；回复评论则通知父评论作者

#### DELETE /replies/:id — 删除回复
- **认证**：🔒（作者/管理员）
- **返回**：`{ "message": "删除成功" }`

### 3.4 点赞 / 收藏

#### POST /posts/:id/like — 点赞 / 取消点赞
- **认证**：🔒 📝
- **Path**：`id`
- **返回**：`{ "liked": true, "likes": 4 }`（切换操作）

#### GET /posts/likes/status?ids=1,2,3 — 批量查询点赞状态
- **认证**：🔒
- **Query**：`ids`(逗号分隔帖子 ID)
- **返回**：`{ "1": true, "2": false, "3": true }`

#### POST /posts/:id/favorite — 收藏 / 取消收藏
- **认证**：🔒 📝
- **Path**：`id`
- **返回**：`{ "favorited": true }`（切换操作）

#### GET /posts/favorites/status?ids=1,2,3 — 批量查询收藏状态
- **认证**：🔒
- **Query**：`ids`
- **返回**：`{ "1": true, "2": false }`

### 3.5 关注系统

#### POST /users/:id/follow — 关注 / 取消关注
- **认证**：🔒 📝
- **Path**：`id`（目标用户）
- **返回**：`{ "following": true }`（切换操作；true=已关注，false=已取消）

#### GET /users/:id/following — 某用户的关注列表
- **认证**：无需（带 token 可额外返回 is_following）
- **Path**：`id`
- **Query**：`page`、`limit`(默认20)
- **返回**：`{ "users": [{ id, nickname, avatar_url, is_following }], "page", "limit", "total", "totalPages" }`

#### GET /users/:id/followers — 某用户的粉丝列表
- **认证**：无需（带 token 可额外返回 is_following）
- **返回**：同上结构

#### GET /following-posts — 关注动态流
- **认证**：🔒
- **Query**：`page`、`limit`(默认10)
- **返回**：`{ "posts": [ ...同 GET /posts 帖子结构... ], "page", "limit", "total", "totalPages" }`
- **说明**：我关注的人发布的帖子流

### 3.6 用户主页 / 个人中心

#### GET /users/:id — 他人主页完整信息
- **认证**：无需（带 token 可返回 is_following）
- **返回**：
  ```json
  {
    "id": 2, "nickname": "小红", "school": "...", "district": "...", "hobby": "...",
    "avatar_url": "/uploads/xx.jpg", "exp": 80, "coins": 10, "has_passed_quiz": true,
    "created_at": "2026-01-01T00:00:00",
    "total_likes_received": 5, "total_favorites_received": 2, "total_replies_received": 8,
    "following_count": 3, "follower_count": 5, "is_following": false,
    "stats": { "posts_count": 2, "replies_count": 8, "likes_received": 5, "favorites_received": 2, "replies_received": 8, "following_count": 3, "follower_count": 5 },
    "achievements": [ { "id": "early_member", "name": "内测成员", "icon": "🚀", "description": "..." } ],
    "recent_activities": [ { "type": "post", "id": 1, "target_title": "...", "created_at": "..." } ]
  }
  ```
- **说明**：`achievements` 为成就徽章数组；`recent_activities` 为最近动态（发帖+回复）

#### GET /users/:id/activity — 活跃度日历数据
- **认证**：无需
- **Path**：`id`
- **返回**：`{ "hidden": false, "activity": [ { "date": "2026-08-01", "count": 3, "level": 2 } ] }`
- **说明**：最近 365 天 GitHub 风格贡献图；用户关闭隐私时 `hidden: true`

#### GET /users/:id/stats — 数据仪表盘统计
- **认证**：无需
- **Path**：`id`
- **返回**：
  ```json
  {
    "overview": { "posts": 2, "replies": 8, "likes": 5, "favorites": 2, "following": 3, "followers": 5 },
    "monthlyPosts": [ { "month": "2026-03", "count": 1 } ],
    "monthlyReplies": [ { "month": "2026-03", "count": 4 } ],
    "hourlyActivity": [ { "hour": 20, "total": 3 } ]
  }
  ```
- **说明**：`monthlyPosts`/`monthlyReplies` 为最近 6 个月；`hourlyActivity` 为 0-23 点活跃分布（图表用）

#### GET /users/:id/posts — 某用户的帖子
- **认证**：无需
- **Query**：`page`、`limit`
- **返回**：`{ "posts": [...], "page", "limit", "total", "totalPages" }`

#### GET /users/:id/replies — 某用户的回复
- **认证**：无需（受 `show_replies` 隐私控制）
- **返回**：`{ "replies": [{ id, content, created_at, post_id, post_title }], "hidden": false, ... }`

#### GET /users/:id/favorites — 某用户的收藏
- **认证**：无需（受 `show_favorites` 隐私控制）
- **返回**：`{ "posts": [...], "hidden": false, ... }`

#### GET /my-posts / /my-replies / /my-favorites — 我的帖子/回复/收藏
- **认证**：🔒
- **Query**：`page`、`limit`(默认10)
- **返回**：`{ "posts"/"replies": [...], "page", "limit", "total", "totalPages" }`

### 3.7 搜索

#### GET /search/all — 多维度搜索（推荐）
- **认证**：无需
- **Query**：`q`(必填)、`type`(`posts`默认/`users`/`circles`)、`page`、`limit`
- **返回**：
  - type=posts：`{ "results": [{ id, title, content, category, tags, images, videos, view_count, created_at, nickname, user_id, avatar_url, reply_count }], ... }`
  - type=users：`{ "results": [{ id, nickname, email, avatar_url, school, district }], ... }`
  - type=circles：`{ "results": [{ id, name, description, icon_url, member_count, post_count, creator_nickname }], ... }`

#### GET /search — 仅帖子搜索（旧接口）
- **认证**：无需
- **Query**：`q`、`page`、`limit`
- **返回**：`{ "posts": [...], "page", "limit", "total", "totalPages" }`

#### GET /users/search — 搜索用户（创建圈子选人用）
- **认证**：无需
- **Query**：`q`、`limit`(默认10)
- **返回**：`[ { "id": 1, "nickname": "小明", "email": "...", "avatar_url": "..." } ]`

### 3.8 举报与反馈

#### POST /reports — 提交举报
- **认证**：🔒
- **Body**：`target_type`(`post`/`reply`/`user`)、`target_id`、`reason_type`(举报原因)、`reason`(补充说明，可选)
- **返回**：`{ "message": "举报已提交，感谢您的反馈" }`

#### GET /my-reports — 我的举报记录
- **认证**：🔒
- **返回**：`[ { id, target_type, target_id, reason_type, reason, status, created_at, resolved_at } ]`

#### POST /feedbacks — 提交反馈
- **认证**：🔒
- **Body**：`content`(必填)
- **返回**：`{ "message": "反馈已提交，感谢您的建议" }`

#### GET /my-feedbacks — 我的反馈记录
- **认证**：🔒
- **返回**：`[ { id, content, status, reply, created_at, resolved_at } ]`

### 3.9 通知系统

#### GET /notifications — 通知列表
- **认证**：🔒
- **Query**：`page`、`limit`(默认20)
- **返回**：
  ```json
  {
    "notifications": [{
      "id": 1, "type": "like", "source_id": 10, "source_user_id": 2,
      "content": "小红 赞了你的帖子", "is_read": false, "created_at": "...",
      "source_nickname": "小红"
    }],
    "unreadCount": 3, "page": 1, "totalPages": 1
  }
  ```

#### PUT /notifications/:id/read — 标记单条已读
- **认证**：🔒
- **返回**：`{ "message": "已标记为已读" }`

#### PUT /notifications/read-all — 全部标记已读
- **认证**：🔒
- **返回**：`{ "message": "全部已读" }`

### 3.10 管理员接口

> 以下接口均需 🛡️ 管理员权限，移动端仅「管理员后台」页面需要。

#### GET /admin/stats — 后台总览统计
- **返回**：`{ "totalUsers": 100, "totalPosts": 200, "totalReplies": 500, "totalLikes": 800, "totalFavorites": 120, "newUsersToday": 3, "newPostsToday": 5 }`

#### GET /admin/daily-stats — 近 30 天趋势图数据
- **返回**：
  ```json
  {
    "dates": ["2026-07-11", "..."],
    "dau": [3, 5, ...], "posts": [2, 4, ...], "reports": [1, 0, ...]
  }
  ```

#### GET /admin/reports — 全部举报
- **返回**：`{ "reports": [{ id, reporter_id, target_type, target_id, reason_type, reason, status, reporter_nickname, resolver_nickname, created_at, resolved_at }] }`

#### PUT /admin/reports/:id — 处理举报
- **Body**：`action`(`resolve`通过 / `reject`驳回)
- **说明**：通过后自动删除被举报的帖子/回复，并奖励举报人 20 金币

#### GET /admin/feedbacks — 全部反馈
- **返回**：`{ "feedbacks": [{ id, user_id, content, status, reply, user_nickname, created_at, resolved_at }] }`

#### PUT /admin/feedbacks/:id — 处理反馈
- **Body**：`reply`(回复内容)、`action`(`resolve`/`read`)
- **说明**：resolve 时奖励反馈用户 30 金币

### 3.11 公开统计

#### GET /public/stats — 社区汇总数据（落地页）
- **认证**：无需
- **返回**：`{ "totalUsers": 100, "totalPosts": 200, "totalReplies": 500, "totalLikes": 800, "totalCircles": 5 }`

### 3.12 圈子系统

#### GET /circles — 圈子广场列表
- **认证**：无需
- **Query**：`page`、`limit`(默认20)、`search`、`sort`(`member_count`默认/`post_count`/`created_at`)
- **返回**：
  ```json
  {
    "circles": [{
      "id": 1, "name": "深圳中学联盟", "description": "...",
      "icon_url": "/uploads/circles/x.png", "banner_url": "...",
      "creator_id": 1, "member_count": 12, "post_count": 8,
      "creator_nickname": "小明", "creator_avatar": "...", "created_at": "..."
    }],
    "recent_activities": [{ "circle_id": 1, "circle_name": "...", "circle_icon": "...", "activity_type": "event", "activity_title": "...", "created_at": "..." }],
    "page": 1, "limit": 20, "total": 5, "totalPages": 1
  }
  ```
- **说明**：`recent_activities` 为圈子动态流（活动/精华/新圈子）

#### GET /circles/:id — 圈子详情
- **认证**：无需（带 token 返回加入状态）
- **返回**：
  ```json
  {
    "circle": { "id": 1, "name": "...", "description": "...", "icon_url": "...", "banner_url": "...", "creator_id": 1, "member_count": 12, "post_count": 8, "creator_nickname": "...", "creator_avatar": "..." },
    "members": [ { "circle_id": 1, "user_id": 2, "role": "member", "joined_at": "...", "nickname": "...", "avatar_url": "...", "post_count": 3 } ],
    "isJoined": true, "userRole": "member"
  }
  ```
- **说明**：`members` 为前 20 名；`userRole` 取值 `creator`/`admin`/`member`/null

#### GET /circles/:id/posts — 圈子内帖子
- **认证**：无需
- **Query**：`page`、`limit`、`sort`(`latest`默认/`hot`/`essence`)
- **返回**：`{ "posts": [...同 GET /posts 结构...], "page", "limit", "total", "totalPages" }`

#### POST /circles/:id/join — 加入圈子
- **认证**：🔒
- **返回**：`{ "message": "加入成功" }`

#### POST /circles/:id/leave — 退出圈子
- **认证**：🔒
- **返回**：`{ "message": "退出成功" }`（圈主不可退出）

#### POST /circles — 发帖到圈子（见 3.2 POST /posts，传 `circle_id`）

#### POST /circles/:id/announcements — 发布圈子公告
- **认证**：🔒（圈主/管理员）
- **Body**：`content`(必填)
- **说明**：单条覆盖式（发布新公告会删除旧公告）

#### GET /circles/:id/announcements — 获取圈子公告
- **认证**：无需
- **返回**：`{ "announcement": { id, circle_id, content, created_at, updated_at } }` 或 `null`

#### POST /circles/:id/events — 创建圈子活动
- **认证**：🔒（圈主/管理员）
- **Body**：`title`、`description`、`location`(可选)、`start_time`、`end_time`、`signup_deadline`(可选)、`max_participants`(可选)
- **返回**：`{ "id": 1, "message": "活动创建成功，已向成员发送通知" }`

#### GET /circles/:id/events — 活动列表
- **认证**：无需
- **Query**：`page`、`limit`
- **返回**：
  ```json
  {
    "events": [{
      "id": 1, "circle_id": 1, "title": "...", "description": "...", "location": "...",
      "start_time": "...", "end_time": "...", "signup_deadline": "...",
      "max_participants": 20, "creator_nickname": "...", "creator_avatar": "...",
      "participant_count": 3, "is_joined": true
    }], "page": 1, "limit": 10, "total": 2, "totalPages": 1
  }
  ```

#### POST /events/:id/join — 报名活动
- **认证**：🔒
- **返回**：`{ "message": "报名成功" }`

#### POST /events/:id/leave — 取消报名
- **认证**：🔒
- **返回**：`{ "message": "已取消报名" }`

#### DELETE /events/:id — 删除活动
- **认证**：🔒（活动创建者/圈主）

#### GET /circles/:id/members — 成员列表
- **认证**：无需
- **Query**：`page`、`limit`(默认30)、`search`
- **返回**：`{ "members": [{ circle_id, user_id, role, joined_at, nickname, avatar_url, post_count }], ... }`

#### PATCH /circles/:id/members/:userId — 成员管理（圈主）
- **认证**：🔒（仅圈主）
- **Body**：`action`(`promote`升管理员 / `demote`降级 / `remove`踢出 / `transfer`转让圈主)
- **返回**：`{ "message": "已设为管理员" }` 等

#### PUT /circles/:id — 编辑圈子信息
- **认证**：🔒（圈主/管理员）
- **Body**（均可选）：`name`、`description`、`icon_url`、`banner_url`

### 3.13 圈子创建申请（5 人联合）

#### POST /circle-applications — 提交创建圈子申请
- **认证**：🔒
- **Body**：`name`(2-20字符)、`description`(必填)、`participant_ids`(数组，联合创建者)、`icon_url`、`banner_url`
- **返回**：`{ "message": "申请已创建，已向成员发送确认邀请", "applicationId": 1 }`
- **说明**：参与者去重后（含发起人）必须 ≥5 人才可申请；申请进入 `pending_members` 状态

#### PUT /circle-applications/:id/confirm — 成员确认申请
- **认证**：🔒（申请参与者）
- **返回**：`{ "message": "确认成功", "confirmed_count": 5, "total_participants": 5, "status": "pending" }`
- **说明**：全部成员确认后申请进入 `pending` 状态，通知管理员审核

#### GET /my-circle-applications — 我发起的/参与的申请
- **认证**：🔒
- **返回**：`[ { id, name, description, initiator_id, icon_url, banner_url, status, confirmed_count, participant_count, user_confirmed, created_at, updated_at } ]`

#### GET /admin/circle-applications — 管理员审核列表（🛡️）
- **返回**：`{ "applications": [{ id, name, description, initiator_nickname, participant_count, confirmed_count, participants: [{id, nickname, avatar_url}] }] }`

#### PUT /admin/circle-applications/:id — 管理员审核（🛡️）
- **Body**：`action`(`approve`通过/`reject`拒绝)
- **说明**：通过后自动创建圈子并加入所有成员

### 3.14 自习室系统

#### GET /study-rooms — 自习室广场列表
- **认证**：无需
- **Query**：`type`(`district`区域 / `personal`个人 / 缺省混合)、`search`、`page`、`limit`(默认20)
- **返回**：
  ```json
  {
    "rooms": [{
      "id": 1, "name": "南山区自习室", "description": "...", "room_type": "district",
      "district_code": "nanshan", "max_members": 8, "creator_id": null,
      "creator_nickname": "...", "creator_avatar": "...",
      "online_count": 5, "studying_count": 3, "created_at": "..."
    }],
    "page": 1, "limit": 20, "total": 11, "totalPages": 1
  }
  ```
- **说明**：区域自习室优先展示，再按在线人数、创建时间排序

#### POST /study-rooms — 创建个人自习室
- **认证**：🔒 📝
- **Body**：`name`(2-20字符，不可重名)、`description`(可选)、`max_members`(可选，仅 4/6/8/10)
- **返回**：`{ "id": 1, "message": "自习室创建成功" }`

#### GET /study-rooms/:id — 自习室详情 + 成员列表
- **认证**：无需（带 token 返回 isJoined）
- **返回**：
  ```json
  {
    "room": { "id": 1, "name": "...", "description": "...", "room_type": "district", "max_members": 8, "creator_nickname": "...", "creator_avatar": "..." },
    "members": [{
      "user_id": 2, "status": "studying", "session_start": "...", "joined_at": "...",
      "focus_duration": 25, "rest_duration": 5, "study_goal": "刷数学题",
      "cheers_today": 1, "nickname": "小红", "avatar_url": "...", "exp": 80, "focus_today": 25
    }],
    "isJoined": true
  }
  ```
- **说明**：`focus_today` 为该成员今日专注分钟数；前端应**轮询**此接口同步成员状态

#### POST /study-rooms/:id/join — 加入自习室
- **认证**：🔒 📝
- **返回**：`{ "message": "加入成功" }`
- **说明**：一个用户同时只能在一个自习室（加入新房间会自动离开旧房间）

#### POST /study-rooms/:id/leave — 退出自习室
- **认证**：🔒
- **返回**：`{ "message": "已退出自习室" }`

#### PATCH /study-rooms/:id/status — 更新专注状态（番茄钟同步核心）
- **认证**：🔒
- **Body**：`status`(`idle`/`studying`/`resting`)、`session_start`(ISO时间)、`focus_duration`、`rest_duration`、`study_goal`
- **返回**：`{ "message": "状态更新成功" }`
- **说明**：前端番茄钟开始/停止时调用；从 `studying` 切到 `idle` 且时长 ≥1 分钟会记录专注并奖励金币

#### POST /study-rooms/:id/cheer — 给成员加油
- **认证**：🔒
- **Body**：`target_user_id`(被加油用户)
- **返回**：`{ "message": "加油已发送！", "cheers_remaining": 2 }`
- **说明**：每人每日限 3 次；不能给自己加油

#### GET /study-leaderboard — 专注排行榜
- **认证**：无需
- **Query**：`period`(`week`默认 / `month`)
- **返回**：
  ```json
  { "period": "week", "leaderboard": [ { "rank": 1, "id": 2, "nickname": "小红", "avatar_url": "...", "total_minutes": 300, "total_hours": "5.0" } ] }
  ```

#### GET /study-stats/my — 我的自习统计
- **认证**：🔒
- **返回**：`{ "today_minutes": 50, "week_minutes": 200, "month_minutes": 500, "total_hours": 8.3, "week_rank": 3 }`

### 3.15 金币与任务

#### GET /user/coins — 我的金币
- **认证**：🔒
- **返回**：
  ```json
  {
    "coins": 35, "today_coins": 5, "checked_in_today": true,
    "recent_transactions": [ { "amount": 5, "source": "daily_login", "description": "每日签到", "created_at": "..." } ]
  }
  ```

#### GET /tasks — 任务列表
- **认证**：🔒
- **返回**：
  ```json
  {
    "dailyTasks": [ { "type": "post", "description": "发布帖子", "reward": 3, "current": 1, "max": 3 } ],
    "achievements": [ { "id": "first_post", "description": "首次发帖", "reward": 5, "completed": true, "progress": 100, "progressText": "已完成" } ]
  }
  ```

#### POST /daily-checkin — 每日签到
- **认证**：🔒
- **返回**：`{ "message": "签到成功！+5 鹏城币" }`（今日已签返回 400）

#### POST /user/redeem — 兑换中心（预留）
- **认证**：🔒
- **说明**：当前固定返回 400「兑换中心即将上线，敬请期待」，移动端可不实现

### 3.16 入站答题

> 题目由**前端题库**提供（`quiz-bank-data.js`），后端只负责次数限制与判分。移动端需自带题库数据。

#### GET /quiz/status — 答题状态
- **认证**：🔒
- **Query**：`level`(默认1)
- **返回**：
  ```json
  {
    "level1_passed": true, "level2_passed": false, "exp": 120,
    "today_attempts": 1, "max_attempts": 3, "remaining": 2,
    "recent_attempts": [ { "score": 40, "passed": false, "total_questions": 10, "quiz_type": "basic", "level": 1, "created_at": "..." } ]
  }
  ```

#### GET /quiz/questions — 获取答题资格与剩余次数
- **认证**：🔒
- **Query**：`level`(1/2)、`type`(level2 时必填：`shenzhen`/`subjects`/`tech`/`general`)
- **返回**：`{ "message": "题目已由前端题库提供", "level": 1, "type": "basic", "remaining": 2, "maxAttempts": 3 }`
- **说明**：每日限 3 次；超限返回 403

#### POST /quiz/submit — 提交答案
- **认证**：🔒
- **Body**：`level`(1/2)、`type`(level2 必填)、`answers`(`[{ "question_id": 1, "answer": "B" }]`)
- **返回**：
  ```json
  { "score": 60, "maxScore": 100, "passed": true, "message": "...", "totalQuestions": 10 }
  ```
- **说明**：一级每题 5 分、通过线 60；二级每题 10 分、通过线 70。通过一级解锁发帖（`has_passed_quiz`），通过二级解锁图片/视频上传（`can_upload_media`）

### 3.17 私信系统

#### GET /messages/conversations — 对话列表
- **认证**：🔒
- **返回**：
  ```json
  {
    "conversations": [{
      "other_user_id": 2, "other_nickname": "小红", "other_avatar": "...",
      "last_msg_content": "在吗", "last_msg_time": "...", "unread_count": 2
    }]
  }
  ```

#### GET /messages/:userId — 与某人的聊天记录
- **认证**：🔒
- **Path**：`userId`
- **Query**：`page`(默认1)、`limit`(默认50)
- **返回**：`{ "messages": [ { id, sender_id, receiver_id, content, read_at, created_at, sender_nickname, sender_avatar } ] }`

#### POST /messages — 发送消息
- **认证**：🔒 📝
- **Body**：`receiver_id`、`content`
- **返回**：`{ "id": 1, "created_at": "...", "message": "发送成功", "receiver_has_not_replied": false }`
- **说明**：对方未开启私信（`allow_messages=false`）返回 403；防骚扰限制：对方从未回复过你时，你只能先发一条

#### PUT /messages/read/:userId — 标记对方消息已读
- **认证**：🔒
- **Path**：`userId`
- **返回**：`{ "message": "已标记为已读" }`
- **说明**：进入聊天页时调用；新消息用**轮询**（Web 端 8 秒一次）获取

### 3.18 社区公告

#### GET /announcements/latest — 最新一条公告（首页提示条）
- **认证**：无需（带 token 返回 `is_confirmed`）
- **返回**：
  ```json
  {
    "announcement": {
      "id": 1, "title": "社区公约更新", "content": "...",
      "created_by": 1, "creator_nickname": "管理员",
      "confirm_count": 5, "is_confirmed": false, "created_at": "..."
    }
  }
  ```
  - 无公告时返回 `{ "announcement": null }`

#### GET /announcements — 公告列表
- **认证**：无需
- **Query**：`page`、`limit`(默认10)
- **返回**：`{ "announcements": [...同 latest 结构...], "page", "limit", "total", "totalPages" }`

#### GET /announcements/:id — 公告详情
- **认证**：无需（带 token 返回 `is_confirmed`）
- **返回**：`{ "announcement": { id, title, content, creator_nickname, confirm_count, is_confirmed, created_at } }`

#### POST /announcements/:id/confirm — 确认收到公告
- **认证**：🔒
- **返回**：`{ "message": "确认收到" }`

---

## 四、Web 端功能对照表

> `public/` 目录下共 **33 个页面**。移动端开发前，建议先阅读对应 Web 页面的 HTML 源码，理解现有 API 调用逻辑与交互细节。

### 4.1 核心页面

| 文件 | 页面名称 | 调用 API | 核心功能 |
|------|---------|---------|---------|
| index.html | 首页 | `/posts`、`/posts/banner`、`/announcements/latest`、`/circles`、`/me`、`/notifications`、`/user/coins`、`/tasks`、`/daily-checkin`、`/quiz/status`、`/posts/:id/like`、`/posts/:id/favorite`、`/posts/likes/status`、`/posts/favorites/status` | 侧边栏导航、日期/高考倒计时/每日诗句、分类筛选、轮播横幅、公告提示条、帖子流（推荐/最新/最热 + 分页）、点赞收藏、右侧栏（热门圈子/公告/任务/金币） |
| login.html | 登录 | `/login`、`/me` | 邮箱+密码登录、记住我、忘记密码入口 |
| register.html | 注册 | `/send-code`、`/register` | 邮箱验证码注册、密码+可选昵称、条款勾选 |
| forgot-password.html | 找回密码 | `/forgot-password` | 输入邮箱申请重置链接 |
| reset-password.html | 重置密码 | `/reset-password` | 设置新密码 |
| post.html | 发布新帖 | `/upload/file`、`/posts`、`/me` | Quill 富文本编辑器、图片/视频上传、分类+标签、localStorage 草稿自动保存 |
| edit-post.html | 编辑帖子 | `/posts/:id`(GET+PUT)、`/upload/file` | 按 `?id=` 加载并编辑已有帖子 |
| post-detail.html | 帖子详情 | `/posts/:id`、`/posts/:id/view`、`/posts/:id/replies`、`/replies/:id`、`/posts/:id/like`、`/posts/:id/favorite`、`/reports`、`/posts/:id/pin`、`/posts/:id/essence`、`/posts` | 富文本正文、嵌套回复（parent_id）、点赞/收藏、浏览量、举报模态框、管理员置顶/精华/删除、相关推荐 |
| search.html | 搜索 | `/search/all` | 帖子/用户/圈子多维度搜索、分页 |
| feed.html | 关注动态 | `/following-posts` | 关注的人发布的帖子流 |
| notifications.html | 通知中心 | `/notifications`、`/notifications/:id/read`、`/notifications/read-all`、`/circle-applications/:id/respond` | 通知分类、未读红点、圈子申请审批 |

### 4.2 个人与设置

| 文件 | 页面名称 | 调用 API | 核心功能 |
|------|---------|---------|---------|
| profile.html | 个人主页（本人） | `/me`、`/my-posts`、`/my-replies`、`/my-favorites`、`/user/coins`、`/users/:id`、`/users/:id/stats`、`/users/:id/activity` | 头像/等级/经验条/鹏城币、关注粉丝、成就徽章、活跃度日历、金币流水、数据仪表盘（3 图表）、Tab 切换我的帖子/回复/收藏 |
| user-profile.html | 用户主页（他人） | `/users/:id`、`/users/:id/activity`、`/users/:id/stats`、`/users/:id/posts`、`/users/:id/replies`、`/users/:id/favorites`、`/users/:id/follow`、`/reports` | 关注/取关、互动统计图表、活跃日历、帖子/回复/收藏 Tab、举报 |
| settings.html | 设置 | `/me`、`/me/avatar`、`/me/profile`、`/me/password`、`/quiz/status` | 个人资料（头像上传/昵称/学校/行政区/爱好）、账号安全（改密码）、隐私设置（4 项开关+私信开关+上传权限） |
| follow-list.html | 关注/粉丝列表 | `/users/:id/followers`、`/users/:id/following`、`/users/:id/follow` | 粉丝/关注 Tab、用户卡片、关注切换 |

### 4.3 圈子相关

| 文件 | 页面名称 | 调用 API | 核心功能 |
|------|---------|---------|---------|
| circles.html | 圈子广场 | `/circles` | 圈子轮播、动态流、分类 Tab、排序、搜索、圈子卡片网格、创建入口 |
| circle-detail.html | 圈子详情 | `/circles/:id`、`/circles/:id/posts`、`/circles/:id/join`、`/circles/:id/leave`、`/circles/:id/announcements`、`/circles/:id/events`、`/circles/:id/members`、`/circles/:id/members/:userId`、`/posts`、`/posts/:id/essence`、`/posts/:id/pin`、`/events/:id/join`、`/events/:id/leave`、`/events/:id`、`/upload/file` | Hero 横幅、圈子公告、内嵌发帖、帖子流（排序/精华/置顶管理）、活动列表与报名、成员管理（踢人/转让/升管理员）、管理面板 |
| create-circle.html | 创建圈子 | `/users/search`、`/upload/circle-image`、`/circle-applications` | 5 人联合申请、名称/简介/图标/封面、添加联合申请人 |

### 4.4 自习室与学习

| 文件 | 页面名称 | 调用 API | 核心功能 |
|------|---------|---------|---------|
| study.html | 自习室 | `/study-rooms`、`/study-rooms/:id`、`/study-rooms/:id/join`、`/study-rooms/:id/leave`、`/study-rooms/:id/status`、`/study-rooms/:id/cheer`、`/study-leaderboard`、`/study-stats/my` | 房间列表（区域/个人 Tab）、创建房间、座位网格+成员状态、番茄钟（25+5）+时长设置、白噪音、加油互动、排行榜 |
| learning.html | 学习板块 | `/posts?category=learning`、`/posts/:id/like`、`/posts/:id/favorite` | 学习帖子流（排序/分页）、点赞收藏、右侧信息栏（日期/倒计时/诗句） |
| life.html | 校园生活 | `/posts?category=生活` | 生活分类帖子流（全部/校园趣事/好物/闲置/美食 Tab） |
| gaokao.html | 升学板块 | `/posts?category=升学` | 高考倒计时、快捷入口、升学资讯流、FAQ、资源推荐 |
| quiz.html | 入站答题 | `/quiz/status`、`/quiz/questions`、`/quiz/submit` | 两级题库答题、每日 3 次、通过解锁发帖/上传权限 |

### 4.5 私信与辅助

| 文件 | 页面名称 | 调用 API | 核心功能 |
|------|---------|---------|---------|
| chat.html | 单聊 | `/users/:id`、`/messages/:userId`、`/messages`、`/messages/read/:userId` | 消息气泡、分页加载历史、8 秒轮询新消息、私信开关状态提示 |
| messages.html | 私信列表 | `/messages/conversations` | 会话列表、未读数、进入单聊 |
| admin.html | 管理员后台 | `/admin/stats`、`/admin/daily-stats`、`/admin/reports`、`/admin/feedbacks`、`/admin/circle-applications`、`/announcements` | 统计概览、3 张趋势图（DAU/发帖/举报）、举报/反馈受理、圈子审批、公告管理（发布/删除/确认墙） |
| announcement.html | 公告详情 | `/announcements/:id`、`/announcements/:id/confirm`、`/announcements/:id/confirmations` | 公告内容、确认收到、管理员查看确认用户 |
| feedback.html | 反馈与举报中心 | `/my-reports`、`/my-feedbacks`、`/feedbacks` | 提交反馈、我的举报/反馈历史 |
| drafts.html | 草稿箱 | 无（localStorage `post_drafts`） | 本地草稿列表、继续编辑、删除 |
| rules.html | 社区公约 | 无 | 静态公约正文（八章） |
| splash.html | 欢迎页 | 无 | 全屏欢迎页 |
| landing.html | 落地页 | `/public/stats` | 项目介绍、社区数据展示 |
| about.html | 关于我们 | 无 | 静态团队/历程介绍 |

> **通用约定**：所有带侧边栏的页面都会调用 `/me`（用户信息）和 `/notifications`（未读红点），且通知红点约 30 秒轮询一次。

---

## 五、移动端开发优先级

> 按「核心闭环 → 重要功能 → 增值功能 → 辅助功能」四批推进，**每批完成后再进入下一批**。

### 第一批：核心闭环（先跑通「能登录 → 能刷帖 → 能看详情 → 能发帖」）

| # | 页面 | 对应 Web 文件 | 关键接口 | 说明 |
|---|------|--------------|---------|------|
| 1 | 登录 / 注册 / 忘记密码 | login / register / forgot-password / reset-password | `/send-code`、`/register`、`/login`、`/forgot-password`、`/reset-password`、`/me` | 实现 token 缓存与全局请求封装；未登录拦截 |
| 2 | 首页（底部导航 + 帖子流） | index | `/posts`、`/posts/banner`、`/announcements/latest`、`/user/coins`、`/daily-checkin` | 推荐/最新/最热 Tab、分页加载、轮播横幅、公告提示条、每日签到 |
| 3 | 底部导航栏 | — | — | 首页 / 圈子 / 自习室 / 通知 / 我的（5 个 Tab 推荐） |
| 4 | 帖子详情页（含嵌套评论） | post-detail | `/posts/:id`、`/posts/:id/view`、`/posts/:id/replies`、`/replies/:id`、`/posts/:id/like`、`/posts/:id/favorite`、`/reports` | 富文本渲染、parent_id 嵌套评论、点赞收藏、举报 |
| 5 | 发帖页（富文本 + 上传） | post / edit-post | `/upload/file`、`/posts` | 建议用 uni-app `editor` 组件；图片/视频先传 `/upload/file` 拿 URL 再随表单提交 |

### 第二批：重要功能

| # | 页面 | 对应 Web 文件 | 关键接口 | 说明 |
|---|------|--------------|---------|------|
| 1 | 个人主页（本人） | profile | `/my-posts`、`/my-replies`、`/my-favorites`、`/users/:id/stats`、`/users/:id/activity`、`/user/coins` | 活跃度日历、数据仪表盘、我的帖子/回复/收藏 Tab |
| 2 | 自习室 | study | `/study-rooms`、`/study-rooms/:id/status`、`/study-rooms/:id/cheer`、`/study-leaderboard` | 区域+个人自习室、自定义番茄钟、白噪音、加油、排行榜；**成员状态需轮询** |
| 3 | 圈子列表 + 圈子详情 | circles / circle-detail | `/circles`、`/circles/:id`、`/circles/:id/posts`、`/circles/:id/join`、`/circles/:id/announcements`、`/circles/:id/events` | 公告、活动、精华、成员管理 |
| 4 | 通知中心 | notifications | `/notifications`、`/notifications/:id/read`、`/notifications/read-all` | 通知分类、红点 |

### 第三批：增值功能

| # | 页面 | 对应 Web 文件 | 关键接口 | 说明 |
|---|------|--------------|---------|------|
| 1 | 搜索 | search | `/search/all` | 帖子/用户/圈子多维度 |
| 2 | 私信 | messages / chat | `/messages/conversations`、`/messages/:userId`、`/messages`、`/messages/read/:userId` | 对话列表、聊天、8 秒轮询新消息 |
| 3 | 设置 | settings | `/me/profile`、`/me/avatar`、`/me/password` | 个人资料、隐私、账号安全、私信开关 |
| 4 | 入站答题 | quiz | `/quiz/status`、`/quiz/questions`、`/quiz/submit` | 需自带题库数据（`quiz-bank-data.js`） |
| 5 | 关注动态流 | feed | `/following-posts` | 关注的人发帖动态 |
| 6 | 他人主页 | user-profile | `/users/:id`、`/users/:id/posts`、`/users/:id/follow`、`/reports` | 关注/取关、举报 |

### 第四批：辅助功能

| # | 页面 | 对应 Web 文件 | 关键接口 | 说明 |
|---|------|--------------|---------|------|
| 1 | 公告详情页 | announcement | `/announcements/:id`、`/announcements/:id/confirm` | 确认收到 |
| 2 | 管理员后台 | admin | `/admin/stats`、`/admin/daily-stats`、`/admin/reports`、`/admin/feedbacks`、`/admin/circle-applications` | 统计、举报/反馈受理、圈子审批、公告管理 |
| 3 | 任务中心 | index 右侧栏 | `/tasks`、`/user/coins` | 金币/每日任务/成就展示 |
| 4 | 草稿箱 | drafts / post | 无（本地存储） | 用 uni-app `uni.setStorage` 实现 |

---

## 六、开发建议

### 6.1 如何高效使用智能体（AI 助手）分工

建议同时使用两个智能体角色，分工明确：

| 角色 | 职责 | 使用场景 |
|------|------|---------|
| **方案设计师助手** | 负责整体架构、页面跳转关系、数据流设计、组件划分 | 每批开发前：先让它阅读对应 Web 页面，输出移动端页面结构方案、组件拆分、状态管理设计 |
| **社区 App 开发助手** | 负责具体页面编码、API 对接、样式调整、bug 修复 | 方案确定后：让它按方案逐页实现，每页完成后让它自查自测 |

**工作流程**：
1. 方案设计师助手先读 Web 端源码 → 产出该批次页面方案（页面结构、需要调用的接口、组件清单）
2. 你确认方案后 → 社区 App 开发助手按方案写代码
3. 写完一页 → 立即在开发者工具/真机测试 → 有问题让开发助手修复

### 6.2 开发流程建议

1. **开发前先读 Web 源码**：每批开发前，让智能体先读取 `public/` 下对应的 HTML 文件，理解现有 API 调用参数和交互逻辑，避免凭猜开发
2. **每页一测**：每完成一个页面就测试，不要攒到最后一起测。重点测：token 过期（401）处理、空数据展示、图片加载失败兜底
3. **分批提交**：每批开发完成后 `git push` 一次，形成独立提交记录，方便回溯
4. **统一请求封装**：建议封装 `request.js`，统一处理 baseURL、token 注入、401 跳登录、错误提示
5. **媒体 URL 统一处理**：封装 `resolveUrl()` 函数，所有图片/视频展示前拼接域名前缀

### 6.3 通用实现要点

- **token 管理**：登录成功后存 `uni.setStorageSync('token', ...)`，请求拦截器统一带上 `Authorization: Bearer`
- **分页列表**：统一实现「下拉刷新 + 触底加载更多」组件，配合 `page/limit/total/totalPages` 字段
- **空态设计**：所有列表页都要有「暂无数据」空态
- **错误处理**：401 跳登录页；403 提示「需要先通过入站答题」等权限提示；网络错误统一 toast
- **时间展示**：后端返回 ISO 时间，前端需格式化为「刚刚 / x 分钟前 / x 小时前 / 日期」

---

## 七、注意事项

1. **后端 API 已全部就绪**，你**不需要修改任何后端代码**，只开发移动端即可
2. 如果确实需要**新接口**，请联系 **MuSHAN**（仓库作者），由后端添加后再对接
3. 移动端**不需要考虑 SEO**，也不需要考虑 PC 端布局，所有页面只需适配手机屏幕
4. **图片/视频上传**统一使用 `POST /api/upload/file` 接口（需先通过二级考试获得上传权限），上传成功拿到 URL 后再随帖子内容提交
5. **富文本编辑器**建议优先使用 uni-app 自带的 `editor` 组件；若需与 Web 端完全一致的格式兼容，可引入 Quill.js
6. **题库数据**（入站答题）由前端管理，需将 `quiz-bank-data.js` 的题库复制进移动端项目，后端不返回题目内容
7. 后端返回的**相对路径媒体 URL** 必须拼接 `https://szhss-community.top` 前缀后才能正常显示
8. **所有需要登录的接口**必须在请求头携带 `Authorization: Bearer <token>`，否则返回 401
9. 入站答题**每日限 3 次**，未通过前发帖/回复/关注/私信等操作会被拦截（403 且返回 `quiz_required: true`），前端需引导用户去答题
10. 前端每次进入首页等页面都会调用 `/me` 和 `/notifications`，注意**避免高频轮询**浪费流量（Web 端通知红点约 30 秒一次，移动端可适当放宽）

---

*本文档由「深圳高中生社区」项目自动生成，随仓库同步更新。如有疑问请联系项目作者 MuSHAN。*
