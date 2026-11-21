# Eureka for Firekylin

由 [Hugo Eureka](https://github.com/wangchucheng/hugo-eureka) 移植到 Firekylin 的主题。

## 功能

- 响应式顶部导航、自定义标题和顶部搜索框
- 首页最新文章、最近回复、友情链接和管理侧栏
- 自动/手动暗色模式（首次访问跟随系统）
- 文章评论数、原始 Markdown 下载、字数、阅读时长和分类元信息
- 陈旧内容提醒、后台编辑入口和作者信息
- 文章目录、分类、标签、归档、搜索和评论
- Firekylin 后台可配置强调色、页脚、文章版权、自定义 CSS 和 JavaScript

在 Firekylin 后台的“主题”页面启用 `eureka` 即可。

原主题采用 Apache License 2.0，本移植保留相同许可证。

### 碎语轻评论

自定义页面 `template/says.eta` 通过主题 Widget 读取公开评论、评论数和点赞数，页面地址由 Firekylin 的自定义页面规则决定。评论正文以纯文本展示，回复按 Waline 的楼主和被回复者关系排列。其他页面的 Waline 客户端不受影响。

浏览器只在需要时使用 Firekylin 原生接口检查会话、发表或回复、点赞。评论继续遵循 Say 的审核规则，待审核评论不会进入公开列表。发表后只更新同一张卡片的评论和计数，不修改页面永久链接。

游客可以先写，登录返回时继续编辑原评论或回复。草稿按卡片和回复对象保存在当前浏览器中，提交成功（含待审核）才清除；登录后可用 Ctrl+Enter 发送，Enter 仍然换行。

在站点项目根目录执行 `node --test themes/eureka/test/say-comments.test.js` 验证 Widget 和 Eta 输出；修改 `assets` 中的脚本或样式时，记得同步 `res`。
