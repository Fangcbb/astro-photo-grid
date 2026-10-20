# 验证记录

验证日期：2026-10-20。环境：Linux、Node 24.19.0、pnpm 12.12.1、Directus 11.17.4、PostgreSQL 16.10、Nginx 1.28.0、Chromium。

已通过：

- 冻结锁文件重新安装依赖。
- `pnpm test`：14 项测试，包括目录/日期校验、分页、鉴权失败、草稿过滤、配置优先级、HTTP IP 发布网址，以及图片方向、EXIF 移除、缓存损坏修复。
- `pnpm check`：Astro 类型诊断零错误、零警告；Biome 检查通过。
- `pnpm build`：本地示例生成 52 个静态页面。
- `pnpm test:e2e`：桌面和手机共 8 项 Chromium 测试，覆盖图片响应、无横向溢出、灯箱与 Escape 关闭、相册与详情导航、翻页、404。
- Docker 中的真实 Directus：管理员浏览器登录、照片编辑表单、重复初始化数据模型、上传、只读构建账号禁止写入、私有原图匿名请求被拒绝。
- `tests/cms.integration.mjs`：真实后台的已发布作品能构建为静态页面；草稿照片、未发布相册的照片不进入页面；标题转义；空作品集正常构建。
- Nginx 实际请求：首页、相册、作品、关于、站点地图返回成功，WebP 缓存头生效，未知路由和隐藏文件访问被拒绝。
- 原子发布：重复发布成功；故意传入无效数据源时发布失败，当前版本链接不变，发布锁被清理。
- 腾讯云 COS Compose 覆盖配置通过语法及变量展开校验；检查了所用 Directus S3 驱动对 endpoint、region、虚拟主机风格寻址的支持。

没有验证：你的真实服务器、域名解析、HTTPS 证书、COS 网络访问与实际凭据、COS 上传/下载/删除和备份恢复。完成 `deploy/README.md` 中的实际配置后，必须再执行上传、发布和公网访问检查。

测试后台使用临时数据库和测试照片，不包含真实作品或生产账号。浏览器测试在构建后运行；本云机器使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:e2e`，普通开发机可先执行 `pnpm exec playwright install chromium`。
