```markdown
# 深圳高中生社区 (szhss-community)

## 📖 项目简介
一个由深圳高中生独立设计与开发的校园社区平台，旨在为深圳地区的高中生提供一个安全、健康、有活力的学习与生活交流空间。

## 🛠️ 技术栈
*   **后端**: Node.js + Express
*   **数据库**: PostgreSQL
*   **前端**: 原生 HTML/CSS/JS (位于 `public/` 目录)
*   **跨平台**: 由 [你同学的名字] 使用 HBuilder / uni-app 进行 App 和小程序端开发

## 🚀 如何从零开始运行这个项目

### 1. 准备工作
确保你的电脑已经安装了以下软件：
*   [Node.js](https://nodejs.org/) (推荐 v18 或以上)
*   [PostgreSQL](https://www.postgresql.com/download/) (推荐 v12 或以上)
*   [Git](https://git-scm.com/) (用于代码管理)

### 2. 克隆项目
打开终端，执行：
```bash
git clone https://github.com/MuSHANw/szhss-community.git
cd szhss-community
```

### 3. 安装依赖
```bash
npm install
```

### 4. 创建并配置数据库
1.  打开 pgAdmin 或命令行，**创建一个新的数据库**：
    ```sql
    CREATE DATABASE szhss_community;
    ```
2.  **执行建表语句**：
    项目 `schema.sql` 文件包含了全部表结构，在命令行执行：
    ```bash
    psql -U postgres -d szhss_community -f schema.sql
    ```
    *(如果你有了备份文件，就替换掉 schema.sql 文件名)*

### 5. 配置环境变量
在项目根目录下新建一个 `.env` 文件，写入你的配置：
```
DATABASE_URL=postgresql://postgres:你的数据库密码@localhost:5432/szhss_community
JWT_SECRET=你随意设置的一串长字符串，用来加密
PORT=3000
```

### 6. 启动项目
```bash
node server.js
```
看到 "🚀 服务器运行在 http://localhost:3000" 就证明成功了！在浏览器里打开它吧。
```