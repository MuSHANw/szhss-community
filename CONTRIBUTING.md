```markdown
# 协作规范 (CONTRIBUTING.md)

欢迎参与深圳高中生社区的开发！本文档旨在帮助所有贡献者（无论是你自己还是你的同学）了解如何规范地进行协作，避免代码冲突，提高开发效率。

## 👥 团队成员与角色

| 成员 | 角色 | 主要职责 |
|------|------|----------|
| MuSHAN | 后端 & 全栈负责人 | 维护 `server.js`、数据库、API 接口、原生网页前端 |
| MING | 前端 & 跨平台开发 | 使用 HBuilder / uni-app 开发 App 和小程序端 |

## 🌿 分支策略

我们采用简单的分支管理，避免直接在 `main` 分支上开发：

| 分支名 | 用途 | 负责人 |
|--------|------|--------|
| `main` | 稳定版本，只接受经过验证的合并 | 共同维护 |
| `backend` | 后端新功能开发、Bug 修复 | MuSHAN |
| `frontend-web` | 原生网页前端优化 | MuSHAN |
| `frontend-app` | uni-app 跨平台客户端开发 | MING |

## 🔄 工作流程

### 1. 克隆项目（仅需一次）
```bash
git clone https://github.com/MuSHANw/szhss-community.git
cd szhss-community
```

### 2. 创建你的功能分支
```bash
# 从 main 分支切出一个新分支
git checkout main
git checkout -b 你的分支名
```
例如：
```bash
git checkout -b feat-private-message   # 新功能：私信系统
git checkout -b fix-follow-button      # 修复：关注按钮状态问题
```

### 3. 开发并测试
在你的分支上修改代码，本地测试通过后，提交：
```bash
git add .
git commit -m "[新增] 实现了用户私信接口"
```

### 4. 推送到 GitHub
```bash
git push origin 你的分支名
```

### 5. 创建 Pull Request（合并请求）
1. 打开 GitHub 仓库页面。
2. 点击 `Pull requests` → `New pull request`。
3. 选择你的分支 → `main`，填写标题和简要说明。
4. 点击 `Create pull request`。

### 6. 代码审核与合并
- 另一位同学查看 PR 中的改动，确认无误后点击 `Merge pull request`。
- 合并后，删除远程的功能分支（可选）。

### 7. 同步最新代码
合并后，及时更新你本地的 `main` 分支：
```bash
git checkout main
git pull origin main
```

## 📝 提交信息规范

使用中文或英文均可，但建议在开头加上类型标记，方便快速识别：

| 标记 | 含义 | 示例 |
|------|------|------|
| `[新增]` | 新功能 | `[新增] 实现帖子收藏功能` |
| `[修复]` | Bug 修复 | `[修复] 回复功能 500 错误` |
| `[优化]` | 性能或体验优化 | `[优化] 移动端侧边栏滑动流畅度` |
| `[文档]` | 文档更新 | `[文档] 补充 API 接口文档` |
| `[样式]` | 纯前端样式调整 | `[样式] 修改帖子卡片圆角` |

## 🤝 代码风格约定

- **后端**：保持与现有 `server.js` 一致的代码风格（使用 `const`、箭头函数、`async/await`）。
- **前端**：原生 HTML/CSS/JS，不引入额外框架；新增页面需同步适配移动端（引入 `mobile.css` 和 `mobile.js`）。
- **API 地址**：所有前端页面使用 `window.API_BASE = '/api'`，不要写死 `localhost`。
- **缩进**：统一使用 4 个空格（或保持文件原有缩进风格）。

## 📞 遇到问题？

- 如果是接口调用问题，先查阅 `docs/api-reference.md`。
- 如果是环境搭建问题，先看 `README.md` 或 `docs/onboarding.md`。
- 如果仍然解决不了，直接在群里 @ 讨论。

---

感谢你的贡献！每一行代码都在让深圳高中生社区变得更好 (๑•̀ㅂ•́)و✧
```