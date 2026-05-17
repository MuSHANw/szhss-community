# Cherry Studio + AI 辅助开发指南

> 本文档面向深圳高中生社区开发者，介绍如何使用 Cherry Studio 配置 AI 编程助手，实现模块化、低成本的 AI 辅助开发。
> 适用时间：2026年5月起

---

## 一、为什么用 Cherry Studio？

本项目的 AI 辅助开发采用 **双通道模式**：

| 工具 | 用途 | 擅长 |
|------|------|------|
| **Claude Code**（终端） | 代码读写、git 操作、shell 命令 | 编辑文件、跑命令、项目级重构 |
| **Cherry Studio + DeepSeek**（桌面） | 对话式协作、模块开发 | 理解项目上下文、生成代码方案、排查问题 |

Cherry Studio 作为图形化客户端，优势在于：
- 独立于终端的对话界面，操作直观
- 支持分对话管理，每个模块一个对话，上下文不打架
- 对话历史可回溯，方便找回之前的讨论

---

## 二、安装与配置

### 2.1 安装 Cherry Studio

从 [Cherry Studio 官网](https://cherry-ai.com/) 或 GitHub Releases 下载安装包，安装完成后启动。

### 2.2 配置 DeepSeek API

1. 打开 Cherry Studio → 设置 → 模型服务
2. 添加模型提供商 → 选择 **DeepSeek**
3. 填入你的 API Key（从 DeepSeek 开放平台获取）
4. API 地址：`https://api.deepseek.com`
5. 模型选择：`deepseek-chat`（或最新可用模型）

### 2.3 创建智能体

建议创建一个专属智能体来承载所有项目对话：

1. 左侧栏 → 智能体 → 创建智能体
2. 名称：`szhss-community`（或你喜欢的名字）
3. 系统提示词（必填）：

```
你是深圳高中生社区（szhss-community）的全栈开发助手。

## 项目概况
一个面向深圳高中生的社区平台，后端 Node.js/Express/PostgreSQL，前端原生 HTML/CSS/JS。

## 核心约定
- 所有 API 集中在 server.js（不拆分路由）
- 前端用 window.API_BASE = '/api' 作为 API 基地址
- 移动端适配通过 public/css/mobile.css + public/js/mobile.js 实现
- 变量命名使用驼峰，函数命名语义化
- 修改 server.js 后需重启服务
- 涉及数据库变更时需给出完整 SQL 语句

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

4. 模型选择 → 选择你配好的 DeepSeek 模型
5. 上下文数量设为 **10**（后续可按对话单独调整）
6. 保存

---

## 三、分模块对话管理（核心开发逻辑）

### 3.1 为什么要分模块对话？

同一个智能体下可以创建**多个对话**，每个对话只负责一个功能模块。

**对比一下：**

| 方式 | token 消耗 | 上下文纯净度 | 心智负担 |
|------|-----------|-------------|---------|
| ❌ 一个对话全包 | 很快膨胀到几万 token | 改帖子时混入自习室逻辑 | 高 |
| ✅ 分模块对话 | 每个对话几千 token | 纯净 | 低 |

### 3.2 创建模块对话

1. 在智能体列表中找到 `szhss-community`
2. 右键（或点 "+"）→ **新建对话**
3. 重复 5 次，创建以下 5 个对话
4. **每个对话在新建后，点对话顶部设置 → 粘贴对应的提示词 → 上下文数量设为 6~8**

下面给出 5 个对话的详细说明和提示词。

---

### 对话 1：用户与权限系统

**负责范围：** 注册/登录/验证码/JWT/个人资料/头像上传/隐私设置/管理员权限

**使用场景：** 改登录页样式、修注册流程、加新权限、调头像上传

**上下文数量建议：** 6

**对话提示词：**
```
你是深圳高中生社区的用户系统开发助手。

## 技术栈
后端：Node.js + Express，所有 API 集中在 server.js
前端：原生 HTML/CSS/JS，位于 public/
数据库：PostgreSQL

## 你负责的模块
用户注册/登录、邮箱验证码、JWT 鉴权（7天过期）、个人资料编辑、头像上传（multer，限制2MB）、隐私设置（公开活跃度/回复/收藏）、管理后台权限（adminMiddleware）

## 关键文件
server.js（第88~242行：用户API段）
public/login.html、public/register.html、public/settings.html

## 约束
- 密码用 bcrypt 加密
- JWT_SECRET 从 process.env 读取
- 昵称7天内只能修改一次

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

---

### 对话 2：内容系统（最常用）

**负责范围：** 帖子 CRUD/分类标签/排序/搜索/回复/点赞/收藏

**使用场景：** 新增帖子功能、改排序逻辑、修搜索 bug、优化帖子列表

**上下文数量建议：** 8

**对话提示词：**
```
你是深圳高中生社区的内容系统开发助手。

## 技术栈
后端：Node.js + Express，所有 API 集中 server.js
前端：原生 HTML/CSS/JS，位于 public/
数据库：PostgreSQL

## 你负责的模块
帖子发布/编辑/删除（作者或管理员），分类+标签，排序（最热/最新/最新回复）
回复发表/删除，点赞/取消点赞，收藏/取消收藏
搜索（标题/内容/分类/标签模糊匹配，分页，标签二次搜索）

## 关键文件
server.js（第704~992行：帖子API段）
public/post.html、public/post-detail.html、public/edit-post.html、public/search.html

## 约束
- tags 字段在 PostgreSQL 中存 TEXT[] 类型
- 搜索用 ILIKE 模糊匹配
- 浏览计数用单独的 PUT /api/posts/:id/view 接口

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

---

### 对话 3：社区与通知系统

**负责范围：** 圈子/关注/通知/举报反馈

**使用场景：** 改圈子创建流程、修通知红点、加新通知类型、处理举报逻辑

**上下文数量建议：** 6

**对话提示词：**
```
你是深圳高中生社区的社交互动开发助手。

## 技术栈
后端：Node.js + Express，所有 API 集中 server.js
前端：原生 HTML/CSS/JS，位于 public/
数据库：PostgreSQL

## 你负责的模块
圈子系统（创建申请+5人确认机制、加入/退出、圈子内帖子）
关注系统（关注/取关、关注动态流、关注/粉丝列表）
通知系统（点赞/收藏/回复/关注/圈子邀请触发、小红点、已读/全部已读）
举报与反馈（提交举报/反馈、管理员受理）

## 关键文件
server.js（用户关注段、圈子段、通知段、举报反馈段）
public/circles.html、public/circle-detail.html、public/create-circle.html
public/notifications.html、public/feed.html、public/follow-list.html
public/feedback.html、public/js/notifications.js

## 约束
- 圈子创建需至少5人确认后才提交管理员审核
- 通知 type 包括：like/favorite/reply/follow/circle_invite/report_handled/feedback_replied

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

---

### 对话 4：自习室

**负责范围：** 自习室/番茄钟/学习记录

**使用场景：** 修自习室 bug、调番茄钟逻辑、改轮询频率、加新功能

**上下文数量建议：** 6

**对话提示词：**
```
你是深圳高中生社区的自习室开发助手。

## 技术栈
后端：Node.js + Express，所有 API 集中 server.js
前端：原生 HTML/CSS/JS，位于 public/
数据库：PostgreSQL

## 你负责的模块
自习室系统（11个行政区区域自习室 + 个人创建自习室）
番茄钟（25分钟专注 + 5分钟休息，状态同步）
成员状态轮询（每8秒刷新）

## 关键文件
server.js（第1350~1658行：自习室API段）
public/study.html
public/js/mobile.js（移动端导航）

## 约束
- 自习室分区域（room_type='district'）和个人（room_type='personal'）两种
- 成员状态：idle（空闲）/studying（学习中）/resting（休息中）
- 加入自习室时自动退出旧自习室
- 删除自习室仅创建者或管理员可操作

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

---

### 对话 5：前端 UI 与全局

**负责范围：** 侧边栏/移动端适配/全局样式/新页面创建

**使用场景：** 改全站样式、新建页面、调移动端适配、修公共 JS

**上下文数量建议：** 8（因为涉及文件较多）

**对话提示词：**
```
你是深圳高中生社区的前端 UI 开发助手。

## 技术栈
原生 HTML/CSS/JS，零框架
后端 API 地址统一用 window.API_BASE = '/api'

## 你负责的模块
全局 UI 统一（侧边栏260px/70px 展开收起、右侧信息面板、背景装饰）
移动端适配（mobile.css 媒体查询 + mobile.js 底部导航）
新页面创建（保持与现有页面一致的侧边栏、顶栏、样式）
公共 JS（api.js 封装 fetch、auth.js 登录检查、common.js 工具函数）

## 关键文件
public/css/style.css、public/css/mobile.css
public/js/api.js、public/js/auth.js、public/js/common.js、public/js/mobile.js
所有 public/*.html（共24个页面）

## 约束
- 移动端适配通过 CSS 媒体查询 @media (max-width: 768px) 实现，不改 PC 端代码
- 新页面必须：引入 style.css + mobile.css、包含侧边栏结构、调用 checkAuth()、引入 mobile.js
- API 请求走 api.js 封装的 request 函数，不直接 fetch

## 重要：语言要求
所有内部思考和推理过程必须全程使用中文，禁止使用英文思考。
```

---

## 四、日常使用流程

### 4.1 开始一天的工作

```
1. 打开 Cherry Studio → 进入 szhss-community 智能体
2. 看今天要做什么：
   - 改帖子相关 → 进「内容系统」对话
   - 改样式 → 进「前端 UI」对话
   - 修 bug 不知道哪的 → 先进「内容系统」，解决不了再换
3. 完成工作后，顺手更新 docs/dev-log.md
```

### 4.2 换模块时

**不要**在同一个对话里聊不同模块的事。比如修完帖子 bug，想改自习室：
- ✅ 切到「自习室」对话，开新话题
- ❌ 在「内容系统」对话里接着聊自习室（会把历史搞混，token 浪费）

### 4.3 需要 Claude Code 配合时

Claude Code 在终端里操作，适合：
- 直接编辑 server.js、HTML 文件
- 运行 `git add/commit/push`
- 执行 `npm install`
- 重启服务 `node server.js`

工作流示例：
```
你在 Cherry Studio 里：
  "帮我写一个私信系统的 API 设计"

AI 给出方案和代码后 →
你切到终端运行 claude：
  "把上面这段代码贴进 server.js"

Claude Code 负责精准编辑文件
```

---

## 五、省 token 技巧（省钱必看）

| 技巧 | 说明 |
|------|------|
| **上下文数量设为 6~8** | 默认可能是 20+，直接改成 6~8，省 60% |
| **分模块对话** | 上面设计的 5 个对话，互不干扰 |
| **大任务开新对话** | 如果某个对话已经聊了几十轮，历史太多就新建一个 |
| **让 AI 只读关键代码** | 不要说"读 server.js"，而是"看第 700~800 行的帖子相关 API" |
| **定期清理旧对话** | 完成的功能对话，确认没问题后可以删除 |

### DeepSeek API 费用估算

```
一轮对话（6条消息，上下文 3000 token）≈ 不到 1 分钱
一天 50 轮对话 ≈ 几毛钱
一个月 ≈ 一杯奶茶钱
```

比直接买各种付费 AI 会员划算得多。

---

## 六、注意事项

1. **提示词要稳定**：不要频繁修改对话的系统提示词，改完后生效范围可能不明确
2. **行号可能过时**：server.js 的行号随修改会变，如果发现 AI 引用的行号不对，告诉它新的行号范围
3. **AI 会犯错**：生成的代码要 review，尤其是数据库操作和权限校验
4. **敏感信息不要发**：API Key、数据库密码、JWT_SECRET 等不要粘贴到对话中
5. **定期更新此文档**：如果模块划分有调整，记得同步更新本文档

---

> 祝你开发愉快！有 AI 加持，一个人也能撑起一个社区 (๑•̀ㅂ•́)و✧
