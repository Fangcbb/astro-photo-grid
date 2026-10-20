# 光影之间 · Photography Portfolio

基于 Astro 的静态摄影作品集，支持本地内容和 Directus 后台；可将后台原片存储在腾讯云 COS。首页、相册、作品详情、关于页均为静态页面，后台下线不会影响已发布网站。

## 本地开发

需要 Node >=24.14.0、pnpm 12.12.1。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
ASTRO_TELEMETRY_DISABLED=1 pnpm dev
```

首次启动会处理模板自带的 48 张示例照片。开发模式下修改内容或替换照片后，重新运行 `pnpm dev`，或运行 `pnpm portfolio:prepare` 后刷新页面。

- `content/site.json`：站点名称、作者、简介、邮箱、社交链接和版权信息。
- `content/portfolio.json`：本地相册及照片元数据，`file` 相对于 `src/images/`。
- `src/images/`：本地源图片；支持 JPEG、PNG、WebP、AVIF。
- `.env`：站点域名和数据源。`.env.build`：后台生成的只读构建凭据，优先于 `.env` 的同名变量；进程环境变量优先于两者。

相册、照片的 `slug` 必须唯一且只包含小写英文字母、数字和连字符。`title`、`alt` 和相册归属必填。日期格式为 `YYYY-MM-DD`。源码使用示例作品描述，正式发布前请逐张替换。不要把版权不属于自己的示例图当作自己的作品。

```sh
pnpm test       # 数据校验、API 分页与鉴权、草稿隔离、图片处理测试
ASTRO_TELEMETRY_DISABLED=1 pnpm check
ASTRO_TELEMETRY_DISABLED=1 pnpm build
pnpm preview
# 浏览器回归测试（先构建，首次运行安装 Chromium）
pnpm exec playwright install chromium
pnpm test:e2e
```

## 图片与隐私

准备阶段在服务器读取原图，自动旋转、移除 EXIF（包含 GPS），生成宽度不超过 640/1280/2400px 的 WebP。小图不会放大。页面使用响应式图片、延迟加载、灯箱和独立作品链接；灯箱只访问展示图。生成内容位于忽略的 `.portfolio/`、`public/media/`，不要手工放文件到这两个目录。准备时按内容哈希复用已校验的展示图，缓存损坏则重新编码；首次处理大图库需要预留时间和磁盘空间。

原图和 COS 密钥不会打包到静态网站。公开的展示图可以被下载，前端无法防止截图或二次保存。缓存和历史发布版本需要一并处理，才能撤回已经公开的作品。

## 后台与服务器部署

完整步骤见 [部署指南](deploy/README.md)，本次执行结果见 [验证记录](deploy/VALIDATION.md)。提供：

- Directus 11.17.4 + PostgreSQL 16 + Nginx 的 Docker Compose 配置。
- 幂等的相册/作品数据模型初始化脚本。
- 只读构建用户：只读取已发布内容，无后台登录或写入权限。
- 腾讯云 COS 的 S3 存储覆盖配置，默认私有桶。
- 构建成功后切换静态发布目录；构建失败保留当前网站。

日常流程：后台上传作品 → 选择相册、填写作品信息 → 将相册和照片都设为已发布 → 在服务器运行 `pnpm site:publish`。上传并不会自动更新线上网站。可在私有 CI 中调用此发布命令；仓库没有开放匿名构建 Webhook。

尚未接入你的实际 COS 桶和域名。Directus 的使用需遵守其当前许可证，正式商用前请确认适用条件。

## 致谢

模板基于 Astro Photo Grid，示例照片来自 [Unsplash](https://unsplash.com/)，灯箱由 [Fancybox](https://fancyapps.com/fancybox/) 提供。使用相应资源前请确认其许可证适用于你的用途。
