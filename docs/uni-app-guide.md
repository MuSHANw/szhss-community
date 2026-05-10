```markdown
# HBuilder (uni-app) 跨平台开发指南

欢迎加入深圳高中生社区的客户端开发！本文档将引导你使用 HBuilderX 和 uni-app，把现有的网页功能迁移成可以发布到应用商店的 App，同时保持与后端接口的无缝对接。

## 📖 什么是 HBuilder 和 uni-app？

- **HBuilderX**：DCloud 公司出品的前端开发工具，专门为 uni-app 优化，内置了代码提示、实时预览和打包功能。
- **uni-app**：一个基于 Vue.js 的跨平台框架，你用 **一套代码** 就能同时生成 Android App、iOS App、微信小程序、H5 网页等。

简单说：你写一个 `.vue` 文件，uni-app 帮你把它变成各大平台的原生应用。

## 🧰 环境准备

1. 下载并安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（选择「App开发版」）。
2. 安装 [Android Studio](https://developer.android.com/studio)（仅用于打包时提供安卓环境，日常开发不需要打开）。
3. 克隆项目并确认后端已能正常运行（参照 `README.md` 或 `onboarding.md`）。

## 🚀 创建你的第一个 uni-app 项目

1. 打开 HBuilderX，点击 **文件 → 新建 → 项目**。
2. 选择 **uni-app**，模板选 **默认模板**，命名如 `szhss-app`，点击创建。
3. 项目创建后，你会看到熟悉的目录结构，里面已经有一个 `pages/index/index.vue` 示例文件。

## 📁 项目目录结构速览

```
szhss-app/
├── pages/            # 页面（每个页面一个文件夹）
│   ├── index/        # 首页
│   └── login/        # 登录页
├── static/           # 静态资源（图片等）
├── App.vue           # 应用入口
├── main.js           # 全局配置
├── manifest.json     # App 打包配置
└── pages.json        # 页面路由和导航栏配置
```

## 🔗 对接后端 API

我们所有的后端接口都以 `/api` 开头（例如 `/api/login`）。为了让 uni-app 能找到你的服务器，需要统一设置基础地址。

1. 在 `src`（或项目根）下新建文件夹 `common`，再新建文件 `api.js`：
   ```javascript
   // common/api.js
   const BASE_URL = 'http://localhost:3000/api'; // 本地调试时
   // 正式上线后改为你的公网地址，比如 'https://your-domain.com/api'

   export const request = (options) => {
       return new Promise((resolve, reject) => {
           const token = uni.getStorageSync('token');
           uni.request({
               url: BASE_URL + options.url,
               method: options.method || 'GET',
               data: options.data || {},
               header: {
                   'Content-Type': 'application/json',
                   'Authorization': token ? `Bearer ${token}` : ''
               },
               success: (res) => {
                   if (res.statusCode === 401) {
                       // token 过期，跳转登录
                       uni.removeStorageSync('token');
                       uni.reLaunch({ url: '/pages/login/login' });
                   }
                   resolve(res.data);
               },
               fail: (err) => reject(err)
           });
       });
   };
   ```
   这个封装会自动携带 JWT token，并处理 401 跳转登录。

2. 在页面中调用示例（以登录为例）：
   ```javascript
   import { request } from '@/common/api.js';

   export default {
       methods: {
           async handleLogin() {
               const res = await request({
                   url: '/login',
                   method: 'POST',
                   data: { email: this.email, password: this.password }
               });
               if (res.token) {
                   uni.setStorageSync('token', res.token);
                   uni.switchTab({ url: '/pages/index/index' });
               }
           }
       }
   }
   ```

## 🎨 迁移现有页面

由于现有前端是原生 HTML，而 uni-app 使用 Vue 语法，你需要**重写界面**，但逻辑和样式可以大量复用。

**建议按以下顺序迁移：**
1. 登录/注册页（最基础）
2. 首页帖子列表（核心展示）
3. 个人中心（我的页面）
4. 其他功能页面（通知、圈子等）

在编写界面时，使用 uni-app 内置组件（如 `<view>` 代替 `<div>`，`<image>` 代替 `<img>`），样式直接写在 `.vue` 文件的 `<style>` 中。

## 📱 本地真机调试

1. 用数据线连接手机，开启 **开发者模式** 和 **USB 调试**。
2. 在 HBuilderX 中点击 **运行 → 运行到手机或模拟器**，选择你的设备。
3. 应用会自动安装到手机上，修改代码保存后会热更新。

## 📦 打包 Android APK

1. 在 HBuilderX 中选择 **发行 → 原生 App-云打包**。
2. 使用 HBuilderX 的云端证书（或自备签名文件），点击打包。
3. 等待几分钟，下载 apk 文件发给同学测试。

## ⚠️ 常见问题

1. **API 请求失败**：检查 `BASE_URL` 是否正确，手机是否能访问你的电脑 IP。
2. **跨域问题**：真机运行时不经过浏览器，不存在跨域限制；如果是 H5 端，需要后端配置 CORS（我们已经配好了）。
3. **打包后白屏**：可能路由模式不对，在 `pages.json` 中确认 `globalStyle` 的 `navigationStyle` 和 `rpx` 换算。
4. **图标/图片不显示**：使用 `image` 组件，将图片放入 `static` 目录。

## 📚 参考资源

- [uni-app 官方文档](https://uniapp.dcloud.net.cn/)
- [uni-app 组件手册](https://uniapp.dcloud.net.cn/component/)
- [HBuilderX 使用指南](https://hx.dcloud.net.cn/)

```
