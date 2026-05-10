```markdown
# 新人上手指南 (Onboarding)

欢迎加入深圳高中生社区的开发团队！这份文档将帮助你从零开始搭建本地开发环境，并在半小时内将项目运行起来。

---

## 🧰 你需要准备的软件

请先在你的电脑上完成以下软件的安装，全部免费：

- **[Node.js](https://nodejs.org/)** (推荐 v18 或更高版本)
- **[PostgreSQL](https://www.postgresql.com/download/)** (推荐 v12 或更高版本)
- **[Git](https://git-scm.com/)** (用于代码管理)

安装时选择默认选项即可，过程中记住你设置的 **PostgreSQL 密码**，后面会用到。

---

## 🚀 分步操作指南

### 1. 克隆项目到本地
打开终端（Windows 用户：按 `Win + R`，输入 `cmd` 回车），执行：
```bash
git clone https://github.com/MuSHANw/szhss-community.git
cd szhss-community
```
这样项目代码就会下载到 `szhss-community` 文件夹里。

### 2. 安装项目依赖
在项目根目录下执行：
```bash
npm install
```
这会自动读取 `package.json` 并安装所有需要的库（如 express, pg, bcrypt 等）。

### 3. 创建数据库
#### 方式 A：使用命令行
打开另一个终端（或直接在之前的终端中操作），登录 PostgreSQL：
```bash
psql -U postgres
```
输入你安装时设置的密码，然后执行：
```sql
CREATE DATABASE szhss_community;
\q
```
退出后，导入项目自带的表结构文件（假设根目录下有 `schema.sql`）：
```bash
psql -U postgres -d szhss_community -f schema.sql
```
询问 MuSHAN 确认是否已有备份文件，有的话也可以直接用。
#### 方式 B：使用 pgAdmin（图形化工具）
打开 pgAdmin，右键 “Databases” → “Create” → “New Database”，输入 `szhss_community` 创建。  
然后在该数据库上右键 → “Restore”，选择项目中的 SQL 文件导入。

### 4. 配置环境变量
在项目根目录下新建一个 `.env` 文件（注意，文件名就是 `.env`，没有后缀），用记事本打开，写入：
```
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/szhss_community
JWT_SECRET=你随意设置的一串长字符串，用来加密
PORT=3000
```
`你的密码` 替换为 PostgreSQL 的登录密码，`JWT_SECRET` 可以随机写一串字母数字。

### 5. 启动后端服务
在终端中执行：
```bash
node server.js
```
看到 `🚀 服务器运行在 http://localhost:3000` 和 `✅ 数据库连接成功` 即表示一切就绪。

### 6. 在浏览器里打开
打开浏览器，输入 `http://localhost:3000`，你应该能看到社区首页。

---

## 👥 日常开发流程

### 更新代码
每次开始工作前，先拉取最新代码，避免冲突：
```bash
git pull origin main
```

### 创建你的功能分支
不要在 `main` 分支上直接修改，先创建一个属于自己的分支：
```bash
git checkout -b 你的分支名
```
例如：
```bash
git checkout -b feat-private-message
```

### 提交代码
修改完代码后，在终端执行：
```bash
git add .
git commit -m "描述你做了什么修改"
git push origin 你的分支名
```

### 请求合并到主分支
1. 打开 GitHub 仓库页面。
2. 点击 `Pull requests` → `New pull request`。
3. 选择你的分支 → `main`，填写标题和简要说明。
4. 点击 `Create pull request`，等待 MuSHAN 审核并合并。

---

## 📚 你需要知道的关键文件

| 文件/目录 | 说明 |
|----------|------|
| `server.js` | 所有后端 API 都在这一个文件里 |
| `public/` | 前端页面（HTML/CSS/JS） |
| `docs/api-reference.md` | 全部接口的清单和使用说明 |
| `docs/architecture.md` | 项目整体架构和数据流 |
| `docs/todo.md` | 待办功能清单，你可以在里面认领任务 |
| `.env` | 环境配置（数据库密码等，不推送到 GitHub） |
| `.gitignore` | 哪些文件不需要上传（如 `node_modules`） |

---

## ❓ 遇到问题怎么办？

- **环境报错**：检查 Node.js 和 PostgreSQL 是否正确安装，密码是否正确。
- **接口报错**：打开浏览器 F12 控制台，查看 Network 标签下的错误信息。
- **数据库错误**：确认 `schema.sql` 是否导入成功，可以在 pgAdmin 中查看表是否存在。
- **还解决不了**：直接在群里 @MuSHAN，或者把报错截图发出来。

---

祝你开发顺利！有任何建议也欢迎随时补充完善这份文档 (๑•̀ㅂ•́)و✧
```