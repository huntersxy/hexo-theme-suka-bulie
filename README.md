# hexo-theme-suka-bulie

```text
 ███    *     *    ███     ████    *     *   █████ █
█   █   *     *   █   █    █   █   *     *     █   █
█     ***** ***** █████    ████  ***** *****   █   ████
█   █   *     *   █   █    █   █   *     *     █   █   █
 ███    *     *   █   █    ████    *     *     █   ████
```

> **с\*\*а б\*\*ть（苏卡不列）** —— 伪和谐了，懂的都懂；主题名捏的就是这个梗 😈

> 本项目是 [SukkaW/hexo-theme-suka](https://github.com/SukkaW/hexo-theme-suka) 的 **huntersxy 自用魔改 Fork**。
> 主要用于 [https://blog.xiey.work](https://blog.xiey.work)，相对上游改了很多个人化的功能与样式。

如果你只是想用原版 Suka，请前往上游仓库：[SukkaW/hexo-theme-suka](https://github.com/SukkaW/hexo-theme-suka)。

---

## 这个 Fork 改了什么

和上游 [SukkaW/hexo-theme-suka](https://github.com/SukkaW/hexo-theme-suka) 相比，主要差异：

- **新增右侧浮动工具栏**（`layout/_partial/right.ejs`）：包含返回顶部、菜单、评论、夜间模式/随机图片等按钮；显示/隐藏为上浮淡入动画，按钮入场级联浮现、悬浮弹性放大。
- **PJAX 无刷新加载**（`src/js/pjax.js`）：站内链接点击后通过 AJAX 局部刷新 `#pjax-container` 内容，URL 与前进/后退正常，带页面切换过渡动画（淡入淡出+轻微上移，尊重 `prefers-reduced-motion`）、TOC/锚点平滑滚动与文章链接预加载（悬停/触摸/键盘聚焦去抖预取、首屏可见文章链接自动预取），已适配畅言评论、本地搜索、Prism、vanilla-lazyload 与统计插件；可用 `_config.yml` 的 `pjax.enable: false` 关闭，或在链接上加 `data-pjax-ignore`、脚本上加 `data-pjax-skip` 单独跳过。
- **首页文章卡片**：点击整卡进入文章（卡片内链接/按钮照常）；悬浮轻微上浮动画 + 圆角，可在 `_config.yml` 的 `post_entry` 段调整（`card_click` / `raise` / `radius`）。
- **全站新增一些组件/效果**：jQuery、线条粒子背景、心知天气组件。
- **文章页引入右侧浮动工具栏**：原版没有这个侧边栏，现在在文章页等位置显示。
- **CDN 调整**：不蒜子等资源改用 `fastly.jsdelivr.net`。
- **搜索域名调整**：Google 搜索的 `sitesearch` 改为个人域名。
- **新增个人 `_config.yml`**：包含头像、菜单、评论（畅言）、搜索等个人配置。
- **样式细节调整**：滚动条、卡片阴影、字体等。
- **工程现代化**：构建工具从 Gulp 换成 esbuild + lightningcss，支持 Hexo 8 / Node.js 20+，并新增 GitHub Actions CI。

> 注意：这是个人自用主题，配置和功能不一定适合所有人；如要使用，请根据自己的博客修改 `_config.yml`。

---

## 安装到 Hexo

```bash
# 在 Hexo 站点根目录执行
git clone https://github.com/huntersxy/hexo-theme-suka-bulie.git themes/suka-bulie

# 将主题必需的站点配置追加到站点 _config.yml
cat themes/suka-bulie/site_config.yml >> _config.yml

# 安装主题依赖
cd themes/suka-bulie
npm i
cd ..
```

然后在站点 `_config.yml` 中设置：

```yaml
theme: suka-bulie
```

---

## 本地开发 / 构建

需要 Node.js `>=20.19.0`。

```bash
npm install
npm run build   # 使用 esbuild + lightningcss 重新生成 source 下的压缩资源
npm run lint    # EJS / CSS / JS 检查
```

---

## 更新主题

### 手动更新

```bash
cd themes/suka-bulie
git pull origin master
```

### 自动同步到博客（推送驱动）

博客仓库 [`huntersxy/blog`](https://github.com/huntersxy/blog) 的部署工作流 `.github/workflows/deply.yml` **在每次构建前自动拉取本仓库 `master` 的最新主题**，再编译部署 —— 无定时轮询，博客侧任何推送（发文章/改配置）都会带上最新主题。

本仓库还提供了 `.github/workflows/notify-blog.yml`，在推送本仓库后通过 `repository_dispatch` **即时**触发博客重新部署：

1. 在 GitHub 上创建一个 Personal Access Token（或者 Fine-grained token），授予对 `huntersxy/blog` 仓库的 **Contents 读写**权限（经典 token 勾选 `repo` 即可）。
2. 在本仓库 `Settings -> Secrets and variables -> Actions` 中新增 Secret，名称必须为 `BLOG_REPO_TOKEN`，值为上面创建的 Token。
3. 之后每次向本仓库 `master` 推送，Action 会向博客发送 `repository_dispatch` 事件，触发博客立即更新主题。

> 以后只需要维护本仓库（主题分支），不需要再手动更新博客里的主题。
> 博客同步提交到 `main` 后，会触发现有部署 Action，站点也会自动重新生成。

---

## 上游与 License

- 上游：[SukkaW/hexo-theme-suka](https://github.com/SukkaW/hexo-theme-suka)
- 主题文档：<https://theme-suka.skk.moe/docs/>
- License：本主题沿用上游的 [GPL-3.0](./LICENSE)。
