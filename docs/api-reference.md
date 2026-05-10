# API 接口文档

> 本文档面向跨平台客户端（uni-app）开发者及所有需要调用后端接口的人员。
> 所有接口的基础路径为 `/api`，例如 `/api/login`。

## 用户相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| POST | `/api/register` | 用户注册 | 否 |
| POST | `/api/login` | 用户登录 | 否 |
| GET | `/api/me` | 获取当前用户信息 | 是 |
| PUT | `/api/me/profile` | 更新个人资料 | 是 |
| POST | `/api/me/avatar` | 上传头像 | 是 |

## 帖子相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| GET | `/api/posts` | 获取帖子列表（支持分页、分类、排序） | 否 |
| GET | `/api/posts/:id` | 获取帖子详情及回复 | 否 |
| POST | `/api/posts` | 发布新帖 | 是 |
| PUT | `/api/posts/:id` | 编辑帖子 | 是（作者/管理员） |
| DELETE | `/api/posts/:id` | 删除帖子 | 是（作者/管理员） |

## 回复相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| POST | `/api/posts/:id/replies` | 发表回复 | 是 |
| DELETE | `/api/replies/:id` | 删除回复 | 是（作者/管理员） |

## 互动相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| POST | `/api/posts/:id/like` | 点赞/取消点赞 | 是 |
| POST | `/api/posts/:id/favorite` | 收藏/取消收藏 | 是 |

## 关注相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| POST | `/api/users/:id/follow` | 关注/取关用户 | 是 |
| GET | `/api/users/:id/following` | 获取某用户的关注列表 | 否 |
| GET | `/api/users/:id/followers` | 获取某用户的粉丝列表 | 否 |
| GET | `/api/following-posts` | 获取关注用户的帖子动态 | 是 |

## 圈子相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| GET | `/api/circles` | 获取圈子列表 | 否 |
| GET | `/api/circles/:id` | 获取圈子详情 | 否 |
| POST | `/api/circles/:id/join` | 加入圈子 | 是 |
| POST | `/api/circles/:id/leave` | 退出圈子 | 是 |
| GET | `/api/circles/:id/posts` | 获取圈子内帖子 | 否 |

## 通知相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| GET | `/api/notifications` | 获取通知列表 | 是 |
| PUT | `/api/notifications/:id/read` | 标记单条已读 | 是 |
| PUT | `/api/notifications/read-all` | 全部标记已读 | 是 |

## 搜索相关
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| GET | `/api/search` | 搜索帖子 | 否 |
| GET | `/api/users/search` | 搜索用户 | 否 |

## 其他
| 方法 | 路径 | 说明 | 需要登录 |
|------|------|------|----------|
| POST | `/api/reports` | 提交举报 | 是 |
| POST | `/api/feedbacks` | 提交反馈 | 是 |
| GET | `/api/my-reports` | 我的举报记录 | 是 |
| GET | `/api/my-feedbacks` | 我的反馈记录 | 是 |