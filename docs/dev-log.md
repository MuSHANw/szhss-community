# 深圳高中生社区 - 开发日志
前言：本项目于2026-04-03开始开发，采取倒序记述

### 下一步计划
1. 第一阶段：核心功能补全（基础体验闭环）
  - [ ] 实现私信系统（用户间一对一发送消息，支持消息列表和对话视图）。  
  - [ ] 细化帖子/回复的编辑与删除权限（管理员可删除任何内容）。  
  - [ ] 实现举报通过后自动删除违规帖子/回复（目前仅改变状态）。  
  - [ ] 增加用户关注功能（关注/取关用户，关注列表，关注动态流）。  
  - [ ] 增加用户经验值与等级系统（发帖、回复、被点赞等行为获得经验，等级差异化展示）。  
  - [ ] 增加帖子推荐算法（基于点赞、评论、浏览量的热度排序，优化首页信息流）。  
2. 第二阶段：界面与体验优化（用户留存与口碑）
  - [ ] 优化首页信息流展示（增加热门帖子、推荐帖子、关注动态的切换标签）。  
  - [ ] 增强帖子编辑器（支持富文本或 Markdown 简易排版，图片上传及插入）。  
  - [ ] 优化个人主页（增加动态、互动统计、成就徽章等展示）。  
  - [ ] 增强搜索功能（支持按用户、圈子、标签多维度搜索，搜索结果高亮）。  
  - [ ] 移动端体验持续打磨（手势操作、下拉刷新、页面过渡动画）。  
  - [ ] 增加帖子草稿箱功能（自动保存编辑中的帖子）。  
3. 第三阶段：内容与运营工具（社区活跃度提升）
  - [ ] 增加社区任务/成就系统（如连续登录、首次发帖、获赞达人等勋章）。  
  - [ ] 实现帖子置顶、加精功能（管理员/圈主专用）。  
  - [ ] 增加数据统计仪表盘（用户可查看个人发帖、互动趋势图表）。  
  - [ ] 增加社区公告系统（管理员发布全站公告，首页顶部展示）。  
  - [ ] 增加举报与反馈处理状态的通知闭环（用户可追踪处理进度）。  
4. 第四阶段：技术优化与部署（稳定与安全）
  - [ ] 部署到公网（购买轻量云服务器，配置固定域名，替换 ngrok 临时方案）。  
  - [ ] 完成公安联网备案，网站底部悬挂备案号。  
  - [ ] 增加移动端 PWA 支持（manifest.json + Service Worker，支持离线浏览和添加到桌面）。  
  - [ ] 实现全站 HTTPS 加密访问。  
  - [ ] 实现接口限流与防刷机制（防止恶意请求和爬虫）。  
  - [ ] 实现数据定期备份机制（数据库自动备份至云端）。  
5. 第五阶段：生态扩展与未来展望（长期愿景）
  - [ ] 调研并制作微信小程序版本（降低用户使用门槛）。  
  - [ ] 调研跨平台框架（如 Flutter、React Native），开发手机 App 和电脑客户端。  
  - [ ] 实现学习资源库功能（笔记、试卷分享与下载，按学校/学科分类）。  
  - [ ] 实现升学指导板块（学长学姐经验分享、志愿填报信息聚合）。  
  - [ ] 对接学校社团、团委组织，增强线下联动能力。  
  - [ ] 条件成熟时，申请成立正式团支部或挂靠学校组织，获取政策背书。  


## 2026-05-02
-  用户关注功能实现（前端 + 后端 + 数据库）  
  - 创建 `user_follows` 表，包含 `follower_id`、`followee_id`、`created_at`，并添加唯一约束和索引。  
  - 在 `users` 表中新增 `following_count` 和 `follower_count` 字段（默认0），用于快速展示关注/粉丝数量。  
  - 后端新增以下接口：  
    - `POST /api/users/:id/follow`：关注/取关用户（事务切换，同步更新计数器，关注时发送 `follow` 通知）。  
    - `GET /api/users/:id/following`：获取用户关注列表（分页，返回 `is_following` 状态）。  
    - `GET /api/users/:id/followers`：获取用户粉丝列表（分页，返回 `is_following` 状态）。  
    - `GET /api/following-posts`：获取已关注用户的帖子动态流（分页，按时间倒序）。  
  - 修改 `GET /api/me` 和 `GET /api/users/:id` 接口，增加 `following_count`、`follower_count` 和 `is_following` 字段。  
  - 修复 `follow` 通知发送失败问题（`source_id` 为 NULL → 改为传入 `followerId`）。  

-  前端页面全面适配关注功能  
  - 修改 `user-profile.html`（他人主页）：  
    - 用户信息卡片增加“关注/粉丝”数量显示及跳转链接，添加“关注/已关注”按钮（根据 `is_following` 动态渲染）。  
    - 绑定关注/取关事件，实时更新按钮状态和粉丝数。  
  - 修改 `profile.html`（个人主页）：增加关注/粉丝数量显示及跳转链接。  
  - 新建 `follow-list.html`：根据 URL 参数 `type`（`following`/`followers`）和 `uid` 展示用户列表，每项带关注/取关按钮，支持分页。  
  - 新建 `feed.html`（关注动态页）：展示已关注用户的帖子流，支持分页，未登录或无关注时显示引导提示。  
  - 修改 `notifications.html`：增加 `follow` 类型通知的渲染（图标 👤、文案“xxx 关注了你”），点击跳转到关注者个人主页。  
  - 全站侧边栏新增“动态”菜单入口（`<a href="feed.html">`），移动端底部导航同步添加。  

-  调试与修复关注状态保持问题  
  - 发现刷新后“已关注”变回“关注”的根本原因：后端 `GET /api/users/:id` 接口未正确解析当前登录用户 token，导致 `is_following` 始终为 `false`。  
  - 重写 `GET /api/users/:id` 接口，从请求头 `Authorization` 解析 `currentUserId`，并使用 `EXISTS` 子查询计算 `is_following`。  
  - 修复前端 `loadUserProfile` 函数中多余的无效 fetch 请求，确保 `user` 对象包含正确的 `is_following`。  
  - 最终确认关注状态在刷新后能够正确保持。  

### 遇到的问题与解决
1.  关注通知发送失败（`source_id` 违反 NOT NULL 约束）  
   - 原因：`createNotification(followeeId, 'follow', null, followerId)` 中第三个参数传 `null`，而 `notifications.source_id` 不允许为空。  
   - 解决：改为 `createNotification(followeeId, 'follow', followerId, followerId)`。  

2.  刷新后关注状态丢失  
   - 原因：后端 `GET /api/users/:id` 未返回 `is_following` 字段，且前端模板未正确初始化按钮状态。  
   - 解决：修改后端 SQL 增加 `is_following` 计算，前端删除多余的 fetch 请求，按钮状态完全依赖模板渲染。  

3.  通知页面点击 `follow` 类型通知报错 `notif is not defined`  
   - 原因：使用了不存在的变量 `notif`，应使用卡片数据集中的 `sourceUserId`。  
   - 解决：改为 `window.location.href = /user-profile.html?uid=${sourceUserId}`。  

### 备注
- 关注功能已形成完整闭环：用户可在任意页面关注他人，关注动态流独立展示，通知系统正常推送关注事件。  
- 本次新增 1 张数据库表、4 个后端接口、2 个全新前端页面，修改 4 个现有页面。  
- 关注功能为后续私信系统、内容推荐、用户等级奠定了基础。  


## 2026-05-01
-  首次公网内测启动与反馈收集  
  - 使用 ngrok 隧道将本地服务暴露至公网，生成临时域名，首次面向小范围内测用户开放访问。  
  - 编辑并发布内测公告（群公告 + 朋友圈），明确注册流程（验证码发至控制台、注册前需@群主确认在线）。  
  - 收到内测用户初步反馈，整体评价积极，部分用户提出建设性意见：  
    - 长期发展需考虑思想引领，建议未来对接学校团组织或党组织，增强政策背书与思想背书。  
    - 关注合规性问题，提醒内测也需办理备案手续。  

-  合规性研究与备案规划  
  - 梳理 ICP 备案与公安备案的区别与要求，确认：使用境外服务器可省去 ICP 备案，但公安备案仍为法定义务。  
  - 分析短期内测期间的合规风险：小范围内测、无商业化、内容合法前提下，直接处罚风险极低；但仍需做好内容管控和备案启动准备。  
  - 制定备案“分期”计划：先注册 `beian.mps.gov.cn` 账号并完成实人认证；待考试结束后再提交完整备案材料。  
  - 回应“未来是否成立团支部”的建议：当前为个人发起、高中生自发组织阶段，条件成熟后考虑对接学校团组织。  

-  公网部署细节处理  
  - 统一全站 API 地址为相对路径 `/api`，解决手机端通过 ngrok 域名访问时请求 `localhost` 导致登录失败的问题。  
  - 处理浏览器请求 `/favicon.ico` 返回 404 的问题（非关键，不影响功能）。  
  - 确认长时间运行开发机的稳定性：关闭系统自动休眠/睡眠，确保内测期间服务不中断。  

### 遇到的问题与解决
1.  手机端无法登录  
   - 原因：前端 API 地址仍为 `http://localhost:3000/api`，手机端无法访问该内网地址。  
   - 解决：将所有页面的 `window.API_BASE` 改为相对路径 `/api`。  

2.  备案时间与内测时间冲突  
   - 原因：公安备案审核周期长（10-15个工作日），无法在5天内测期内完成。  
   - 解决：采取“先启动、后完成”策略，先行注册账号并完成实人认证，内测结束再补充后续材料；内测期间严格限制范围和内容管控。  

3.  用户提出合规性质疑  
   - 应对：明确告知当前处于短期技术内测阶段，正式上线前将完成全部合规手续；同时查阅相关法规，回应用户关于备案、团支部等建议。  

### 备注
- 本次内测为项目首次面向真实用户的公开测试，具有里程碑意义。  
- 用户反馈表明项目具备实际需求与潜在价值，同时也提醒团队需重视合规建设与长远规划。  
- 服务器（开发机）长时间运行表现稳定，ngrok 隧道在免费版下偶有波动，后续正式上线需考虑独立服务器或固定域名方案。  


## 2026-04-30
-  移动端适配（全站）  
  - 新建 `public/css/mobile.css`，使用媒体查询 `@media screen and (max-width: 768px)` 对移动端进行全局样式覆盖，不影响 PC 端原有布局。  
  - 新建 `public/js/mobile.js`，在屏幕宽度 ≤ 768px 时动态注入底部导航栏（首页、圈子、发帖、通知、我的），并创建侧边栏遮罩层，实现侧边栏滑动弹出与关闭。  
  - 移动端下隐藏 PC 端右侧面板、浮动发布按钮，将顶部“深圳高中生社区”标题缩小字号并允许换行，搜索框仅保留图标。  
  - 所有页面（`index.html`、`learning.html`、`circles.html`、`post-detail.html` 等）引入 `mobile.css` 和 `mobile.js`，实现全站统一的移动端体验。  

-  移动端交互修复  
  - 修复侧边栏菜单项点击无响应的问题：在 `mobile.js` 中使用 `cloneNode` 替换原有按钮并重新绑定事件，强制内部 `<a>` 标签的 `href` 跳转。  
  - 修复底部导航中间加号按钮变形及原有浮动按钮未隐藏的问题：在 CSS 中精确控制 `.mobile-nav .fab` 样式，并隐藏 PC 端 `.fab`。  
  - 修复点击导航按钮时图标与文字切换显示异常的问题：统一使用 `flex-direction: column` 并移除冲突样式。  

-  移动端信息栏（首页和学习页）  
  - 在 `index.html` 和 `learning.html` 的帖子列表上方新增 `.mobile-info-bar`，用于在移动端显示今日日期、高考倒计时和每日诗句。  
  - 对应 JavaScript 函数（`updateDate`、`updateGaokaoCountdown`、`updateDailyPoem`）中增加更新移动端元素的逻辑。  
  - PC 端保持原有右侧面板不变，移动端信息栏仅在屏幕 ≤ 768px 时显示。  

-  公网部署与 API 地址修正  
  - 配置 ngrok 隧道，将本地 3000 端口暴露到公网，生成 `https://xxxx.ngrok-free.app` 域名。  
  - 全部页面中的 `window.API_BASE` 由绝对路径 `http://localhost:3000/api` 改为相对路径 `/api`，确保手机端通过 ngrok 域名时能正常调用后端接口。  

### 遇到的问题与解决
1.  移动端侧边栏无法跳转页面  
   - 原因：PC 端原有事件监听器在捕获阶段拦截了点击，且侧边栏内部的 `click` 事件被 `stopPropagation` 阻止。  
   - 解决：通过 `cloneNode` 替换菜单按钮，在移动端脚本中重新绑定事件，并对侧边栏内所有 `<a>` 标签强制设置 `window.location.href`。  

2.  底部导航加号按钮变形且右下角浮动按钮未消失  
   - 原因：CSS 冲突，原有的 `.fab` 样式影响移动端底部加号，且在 CSS 中未正确隐藏 PC 端浮动按钮。  
   - 解决：在 `mobile.css` 中使用 `.fab:not(.mobile-nav .fab) { display: none; }` 隐藏 PC 端按钮，并单独设置 `.mobile-nav .fab` 的固定宽高、`flex` 等属性。  

3.  手机端登录失败（API 请求 404/401）  
   - 原因：前端 API 地址仍为 `http://localhost:3000/api`，手机端无法访问该内网地址。  
   - 解决：将全部页面的 `window.API_BASE` 改为相对路径 `/api`，使请求自动适配当前域名。  

4.  顶部标题显示为省略号或换行错乱  
   - 原因：移动端 `.logo` 字号过大，且 `white-space: nowrap` 导致溢出。  
   - 解决：在 `mobile.css` 中设置 `.logo { font-size: 0.75rem; white-space: normal; word-break: break-word; }` 允许两行显示。  

### 备注
- 本次移动端适配完全通过 CSS 媒体查询和独立 JS 文件实现，未修改任何原有 PC 端 HTML 结构或业务逻辑。  
- 移动端体验已接近主流社区类 APP，底部导航、侧边滑出菜单、信息栏一应俱全。  
- 公网部署后，内测用户可通过手机浏览器直接访问 ngrok 域名进行测试。  


## 2026-04-18
-  圈子创建申请流程重构（参与者确认机制）  
  - 新增 `circle_application_confirms` 表，用于记录每个参与者对圈子申请的确认状态。  
  - `circle_creation_applications` 表增加 `confirmed_count` 字段（默认0），并将 `status` 字段改为 `TEXT` 类型，支持 `'pending_members'`（等待成员确认）和 `'pending'`（待管理员审核）状态。  
  - 修改 `POST /api/circle-applications` 接口：创建申请时状态设为 `pending_members`，发起人自动确认，向其他参与者发送类型为 `circle_invite` 的通知。  
  - 新增 `PUT /api/circle-applications/:id/confirm` 和 `PUT /api/circle-applications/:id/respond` 接口：参与者确认参与，更新确认计数；当确认人数达到总人数且至少5人时，自动将申请状态改为 `pending`，并通知所有管理员。  
  - 修改 `GET /api/my-circle-applications` 接口，返回当前用户是否已确认等信息。  
  - 更新 `create-circle.html`：提交按钮文案改为“提交申请，邀请成员确认”，提交后提示等待成员确认，而非直接等待管理员审核。  
  - 更新 `notifications.html`：增加对 `type: 'circle_invite'` 的渲染，显示“xxx 邀请你共同创建圈子‘yyy’”，并添加“确认参与”按钮，点击调用 `/api/circle-applications/:id/respond`。  
  - 修复 `server.js` 中多处语法错误（如 `catch (13)`）以及字段不存在错误（`confirmed` → `confirmed_at`）。  

-  用户搜索 API 修复  
  - 确保 `/api/users/search` 路由在 `/api/users/:id` 之前定义，避免被动态路由拦截。  
  - 优化参数校验，增加调试日志，解决前端搜索返回 400 的问题。  

-  其他修复  
  - 修复 `circle_application_confirms` 表创建时的字段错误，统一使用 `application_id` 和 `user_id`。  
  - 修复参与者确认接口路径不匹配问题，同时支持 `/confirm` 和 `/respond`。  

### 遇到的问题与解决
1.  参与者确认后状态未变更  
   - 原因：`circle_application_confirms` 表不存在或字段名错误，且 `status` 枚举类型未包含 `pending_members`。  
   - 解决：执行完整的表结构迁移，将 `status` 改为 `TEXT` 类型，并新增 `confirmed_count` 字段；修复插入语句中的字段名。  

2.  用户搜索 400 错误  
   - 原因：`/api/users/search` 被 `/api/users/:id` 拦截，且 `req.query.q` 为空。  
   - 解决：调整路由顺序，将静态路由放在动态路由之前，并增加参数存在性校验。  

3.  参与者确认接口 404  
   - 原因：前端调用 `/api/circle-applications/:id/respond`，但后端只有 `/confirm` 路由。  
   - 解决：新增 `/respond` 路由，与 `/confirm` 共用同一处理函数。  

### 备注
- 圈子创建流程已完全支持参与者确认，有效防止恶意邀请。  
- 通知页面已能正确处理圈子邀请，用户可在通知中心一键确认参与。  
- 本次开发涉及数据库结构调整，需同步执行迁移 SQL（见 `server.js` 注释或独立迁移文件）。  
- 所有主要页面（包括 `create-circle.html` 和 `notifications.html`）已适配新流程。  

## 2026-04-12
-  全局页面布局统一与侧边栏重构  
  - 将所有页面的头部导航栏统一为 `top-bar-container` 结构，包含菜单按钮、Logo、搜索框。  
  - 为所有主要页面（`index.html`、`learning.html`、`profile.html`、`user-profile.html`、`settings.html`、`admin.html`、`feedback.html`、`rules.html`、`search.html`、`splash.html`、`post.html`、`edit-post.html`、`post-detail.html`）添加统一的左侧导航栏 `#sidebar`。  
  - 侧边栏包含用户信息卡片（头像、昵称、邮箱）、导航菜单（首页、学习、生活、社团、升学、个人主页、设置、管理后台、通知）、退出登录按钮。  
  - 侧边栏支持展开/收起（宽度 260px ↔ 70px），状态通过 `localStorage` 记忆，收起时仅显示图标，鼠标悬停显示文字提示。  
  - 移动端适配：侧边栏默认隐藏，通过菜单按钮滑出显示。  
  - 移除原有分散的头部导航链接和独立菜单按钮，统一由侧边栏承载主要导航功能。  

-  首页右侧信息面板增强  
  - 在 `index.html` 和 `learning.html` 的右侧固定面板（`right-sidebar`）中新增：  
    - 今日日期显示：动态展示当前年月日和星期。  
    - 高考倒计时：基于每年6月7日自动计算剩余天数。  
    - 每日诗句：内置8首励志古诗词库，根据日期哈希值每日轮换。  
  - 面板使用 `position: sticky` 固定在右侧，随页面滚动保持可见。  

-  背景装饰统一  
  - 为所有页面添加与 `index.html` 一致的背景装饰（波浪 SVG + 三个半透明圆圈），提升整体视觉一致性。  

-  后端接口参数校验增强  
  - 在 `server.js` 中为所有接收动态 ID 参数（如 `/api/users/:id`、`/api/posts/:id`）的路由增加 `isNaN` 校验，避免前端传递非数字 ID 时导致 PostgreSQL 报错 “invalid input syntax for type integer”。  

-  其他细节修复  
  - 修复 `settings.html` 中菜单按钮鼠标悬停变色的问题（移除了多余的 hover 样式）。  
  - 修复 `user-profile.html` 中默认头像 404 问题，统一使用 `/uploads/default-avatar.png` 占位。  
  - 修复 `splash.html` 在未登录状态下点击侧边栏头像跳转登录页的逻辑。  
  - 修复 `rules.html` 中搜索框与菜单按钮的样式对齐问题。  

### 遇到的问题与解决
1.  侧边栏与原有页面布局冲突  
   - 原因：部分页面（如 `rules.html`、`search.html`）原本使用不同的头部结构，直接添加侧边栏会导致样式错乱。  
   - 解决：逐一重构所有页面，统一使用 `top-bar-container` + `#sidebar` + `body` 的 `margin-left` 布局方案，并确保移动端适配。  

2.  PostgreSQL 参数类型错误（`NaN` 传入 integer 字段）  
   - 原因：前端访问 `/api/users/abc/posts` 等 URL 时，`parseInt('abc')` 返回 `NaN`，直接作为 SQL 参数导致数据库报错。  
   - 解决：在所有相关路由中添加 `if (isNaN(id)) return res.status(400).json({ error: '无效的ID' })` 进行前置校验。  

3.  高考倒计时跨年逻辑  
   - 解决：判断当前日期是否已过当年6月7日，若已过则计算至次年6月7日的天数。  

### 备注
- 本次重构涉及 14 个 HTML 文件，统一了全站的导航体验和视觉风格。  
- 所有页面均已集成通知小红点、用户信息实时更新、搜索跳转等基础功能。  
- 项目布局已完全稳定，后续可专注于功能迭代和内容运营。  


## 2026-04-05
-  站内通知系统（完整实现）   
  - 创建 `notifications` 表，支持点赞、收藏、回复、举报处理等事件触发通知。  
  - 后端实现通知 API：`GET /api/notifications`、`PUT /api/notifications/:id/read`、`PUT /api/notifications/read-all`。  
  - 在所有页面（`index.html`, `learning.html`, `post-detail.html`, `profile.html`, `user-profile.html`, `settings.html`, `feedback.html`, `admin.html`, `rules.html`, `post.html` 等）集成铃铛图标和通知下拉菜单。  
  - 统一使用 `window.API_BASE` 全局变量，解决 `API_BASE` 重复声明导致的报错。  
  - 修复通知按钮错位问题（确保铃铛在左，头像在右，垂直对齐）。

-  管理员仪表盘增强（数据统计与可视化）   
  - 新增 `/api/admin/daily-stats` 接口，返回最近30天的每日活跃用户（DAU）、发帖数、举报数。  
  - 前端 `admin.html` 集成 Chart.js，展示三个折线图（DAU、发帖趋势、举报趋势）。  
  - 举报和反馈受理列表保留，支持管理员处理举报（通过/驳回）和回复反馈。

-  学校选择模态框优化（普高/中职分类）   
  - 重新整理深圳普高（含民办）和中职学校数据，分别存入 `HIGH_SCHOOLS_DATA` 和 `VOCATIONAL_SCHOOLS_DATA`。  
  - 在 `settings.html` 的学校选择模态框中增加“普通高中”和“中等职业学校”切换按钮，支持按类型筛选学校。  
  - 保留行政区筛选和搜索功能。

-  反馈与举报页面完善   
  - 修复 `feedback.html` 中标签页切换失效的问题，现在“我的举报”和“我的反馈”可正常切换显示。  
  - 用户提交反馈后自动跳转到反馈页面，并刷新列表。  
  - 管理员回复反馈后，用户可在反馈页面看到回复内容。

-  全局头像同步彻底修复   
  - 所有页面统一使用 `updateGlobalAvatar()` 函数从 `/api/me` 获取最新头像并更新右上角。  
  - 修复 `post-detail.html`、`user-profile.html`、`rules.html` 等页面中头像容器缺少 `id` 或未调用函数的问题。

-  搜索功能增强（支持分类搜索）   
  - 后端 `/api/search` 接口增加对 `category` 字段的模糊匹配，现在可以搜索“社团”等分类名称。  
  - 前端 `search.html` 增加分页和标签二次搜索功能。

-  其他 Bug 修复与优化   
  - 修复 `learning.html` 中 `sort=replied` 导致 500 错误的问题（修改 SQL 排序逻辑）。  
  - 修复回复内容过长溢出的样式问题（添加 `word-wrap: break-word`）。  
  - 修复个人主页中编辑资料按钮跳转至 `/settings.html`。  
  - 修复 `user-profile.html` 中活跃度日历报 `day.date.getDay is not a function` 错误（转换日期字符串为 Date 对象）。  
  - 统一所有页面头部下拉菜单（添加“管理后台”入口，仅管理员可见）。

### 遇到的问题与解决
1.  `API_BASE` 重复声明导致页面报错   
   - 原因：每个页面都定义了 `const API_BASE`，而 `notifications.js` 中也定义了同名常量。  
   - 解决：改用 `window.API_BASE` 全局变量，并在各页面开头兜底赋值。

2.  通知按钮错位（铃铛跑到头像上方）   
   - 原因：`.user-area` 的 Flex 布局未正确对齐，且铃铛和头像的 HTML 顺序导致换行。  
   - 解决：将铃铛放在头像之前，添加 `display: flex; align-items: center;`，并为 `.avatar img` 固定宽高。

3.  管理员页面举报/反馈列表为空   
   - 原因：原 `server.js` 中有一个假的占位路由返回空数组，后来添加的真实路由未被调用。  
   - 解决：删除假的占位路由，只保留真实查询实现。

4.  学校数据不完整，缺少中职学校   
   - 解决：爬取深圳本地宝和职教网数据，整理普高（116所）和中职学校，分别存入两个对象，并在模态框中增加切换按钮。

5.  `learning.html` 中 `sort=replied` 排序 SQL 错误   
   - 原因：子查询别名 `last_reply_time` 在 `ORDER BY` 中不可直接使用。  
   - 解决：改为内联子查询 `COALESCE((SELECT MAX(created_at) FROM replies WHERE post_id = p.id), p.created_at)`。

### 备注

- 所有页面均已集成通知系统，铃铛显示未读数量，点击下拉显示通知列表，点击通知跳转到对应内容并标记已读。  
- 管理员仪表盘图表基于最近30天数据，若数据不足则显示0。  
- 学校数据已覆盖深圳全部行政区（含深汕特别合作区），普高+中职共约160+所学校。  
- 本次开发耗时约一整天，项目功能已基本完善，进入内测准备阶段。


## 2026-04-04（晚间）
-  用户资料编辑与隐私设置   
  - 修复后端 `PUT /api/me/profile` 接口，解决了昵称、学校、行政区、爱好无法保存的问题。  
  - 增加昵称7天内只能修改一次的限制（数据库添加 `nickname_last_updated` 字段）。  
  - 实现隐私设置（公开活跃度、回复、收藏），用户可在设置页面自行开关。  
  - 创建完整的 `settings.html` 页面，包含侧边栏导航、个人资料编辑、头像上传、隐私选项。  
  - 集成深圳高中和行政区数据（外部 `schools.js` 和 `districts.js`），支持按行政区分类选择学校，包含深汕特别合作区。

-  全局头像同步   
  - 在所有页面（`index.html`、`learning.html`、`profile.html`、`post-detail.html`、`search.html`）添加 `updateGlobalAvatar` 函数，并在页面加载时调用。  
  - 修复 `post-detail.html` 中头像容器缺少 `id="userAvatar"` 导致无法更新的问题。  
  - 统一将右上角头像从 `<i>` 图标替换为 `<img>` 标签，实现动态加载。

-  搜索功能增强   
  - 修改后端 `/api/search` 接口，增加对 `category`（分类）字段的模糊匹配。  
  - 重写前端 `search.html`，支持分页、显示标签、标签点击二次搜索。  
  - 搜索结果页与首页风格统一，展示分类、标签、作者、浏览量、回复数。

-  个人主页与用户主页完善   
  - 修复 `profile.html` 中“编辑资料”按钮跳转到 `/settings.html`。  
  - 确保 `user-profile.html` 能根据隐私设置显示/隐藏活跃度、回复、收藏模块。  
  - 所有帖子列表中的作者昵称改为可点击链接，跳转到对应用户的公开主页。

-  点赞与收藏功能   
  - 在首页、学习页、帖子详情页均实现点赞和收藏按钮，状态实时更新。  
  - 后端实现点赞/取消点赞、收藏/取消收藏接口，并批量获取状态。  
  - 个人主页增加“我的收藏”标签页，分页显示收藏的帖子。

### 遇到的问题与解决

1.  用户资料更新失败（数据消失）   
   - 原因：`PUT /api/me/profile` 接口中使用了未定义的变量 `currentNickname` 和 `currentNicknameLastUpdated`，且事务处理混乱。  
   - 解决：重写接口，明确获取当前用户信息，动态构建 UPDATE 语句，正确处理昵称7天限制。

2.  右上角头像不更新   
   - 原因：多个页面缺少 `updateGlobalAvatar` 调用，且 `post-detail.html` 中头像容器没有 `id`。  
   - 解决：在所有页面加载时调用该函数，并统一容器 `id="userAvatar"`。

3.  搜索无法匹配分类   
   - 原因：后端搜索 SQL 未包含 `category` 字段。  
   - 解决：在 `WHERE` 子句中增加 `p.category ILIKE $1`，同时更新 `countQuery`。

4.  学校列表不完整   
   - 解决：手动整理深圳各行政区主要高中和职校（含深汕），放入 `schools.js`，并支持 `optgroup` 分组显示。



## 2026-04-04(上午)
-  发帖功能   
  - 后端实现 `POST /api/posts` 接口，支持标题、内容、分类、标签（存储为 PostgreSQL 数组）。  
  - 前端 `post.html` 增加标签输入框，支持空格/逗号分割，自动添加 `#` 前缀。  
  - 首页增加浮动发布按钮（修复了按钮居中对齐问题）。

-  帖子详情页   
  - 新建 `post-detail.html`，展示帖子完整内容、分类、标签、作者、发布时间、阅读数。  
  - 展示回复列表（按时间正序），并实现回复表单（仅登录用户可见）。  
  - 后端实现 `GET /api/posts/:id` 接口（联查帖子+回复）。  
  - 后端实现 `POST /api/posts/:id/replies` 接口，用于提交回复。

-  数据库升级   
  - 为 `posts` 表增加 `tags` 列（`TEXT[]` 类型）。  
  - 创建 `replies` 表，关联 `posts` 和 `users`。  
  - 添加相关索引（`GIN` 索引用于标签搜索，`idx_replies_post_id` 用于回复查询）。

-  Bug 修复   
  - 修复首页浮动按钮 `+` 号与圆形背景错位的问题（改用 Flex 布局并清除内外边距）。  
  - 修复回复内容过长导致溢出的问题（为 `.reply-content` 和 `.post-content` 添加 `overflow-wrap: break-word`）。



## 2026-04-03
- 初始化 Node.js 项目，安装 express、pg、bcrypt、jsonwebtoken 等依赖。
- 配置 PostgreSQL 数据库（本地），建 users 和 email_verifications 表。
- 实现注册、登录、发送验证码（开发版控制台打印）、获取个人信息接口。
- 用 Thunder Client 测试全部接口通过。
- 进行项目调研。