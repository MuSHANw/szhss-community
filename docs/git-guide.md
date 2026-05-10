## 📖 Git 使用说明（深圳高中生社区项目专属版）

### 一、第一次使用前的配置（仅需操作一次）

打开终端，输入以下两行（使用你自己的 GitHub 用户名和邮箱）：
```bash
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的GitHub注册邮箱"
```

---

### 二、核心三步：把修改后的代码上传到 GitHub

以后每次修改完代码，只需要按顺序执行这三步：

#### 1. 把所有修改放入待提交清单
```bash
git add .
```
> 通俗理解：像打包行李一样，把你要上传的文件全部放进箱子里。

#### 2. 提交到本地仓库（相当于在历史上盖了个章）
```bash
git commit -m "这里简要描述你修改了什么"
```
例如：
```bash
git commit -m "[修复] 解决了关注状态刷新后丢失的问题"
```
> 通俗理解：在这个箱子上贴张小纸条，告诉未来的自己和别人"这个箱子里装了什么"。

#### 3. 推送到远程 GitHub 仓库（让同学看到你的更新）
```bash
git push origin main
```
> 通俗理解：把箱子交给快递（网络），直接寄到学校公告栏（GitHub 仓库）上。

**如果一次没有成功，提示 `Updates were rejected`，执行：**
```bash
git pull origin main
```
然后再尝试 `git push origin main`。

---

### 三、日常使用的标准流程

1. 修改代码 → 2. 终端执行 `git add .` → 3. 执行 `git commit -m "你的说明"` → 4. 执行 `git push origin main`

---

### 四、常用辅助命令速查

| 命令 | 作用 |
|------|------|
| `git status` | 查看当前有哪些文件被修改了，哪些还没上传 |
| `git log --oneline` | 查看提交历史记录，一行一条，非常简洁 |
| `git pull origin main` | 把远程 GitHub 上最新的代码拉下来，同步到你的本地 |

---

### 五、常见问题与解决

**Q1：执行 `git push` 时，弹出窗口要求登录 GitHub？**
- 输入你的 GitHub 用户名，密码部分输入你之前生成的 **Personal Access Token**（不是你的 GitHub 登录密码）。

**Q2：忘记了创建 `.gitignore` 文件？**
- 在项目根目录下新建一个 `.gitignore` 文件，写入：
  ```
  node_modules/
  .env
  ```
  保存后重新执行 `git add .`、`git commit`、`git push`。

**Q3：`git commit` 时提示 `nothing to commit`？**
- 说明没有文件被修改过，不需要重复提交。

---

### 六、合作者（同学）的操作说明

你只需要做一次克隆：
```bash
git clone https://github.com/MuSHANw/szhss-community.git
```
之后每次你更新了代码，他执行 `git pull origin main` 就能拉取最新的修改。
