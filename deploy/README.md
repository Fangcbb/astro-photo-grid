# 部署到自己的服务器（腾讯云 COS）

需要：Docker Engine + Compose、Node >=24.14.0、pnpm 12.12.1，以及两个域名（例如作品集和 CMS）。仓库根目录执行前台命令，`deploy/` 内执行 Compose 命令。所有示例域名和邮箱都需替换。

## 1. 后台配置

```sh
cd deploy
cp .env.example .env
# 编辑 .env，填写数据库密码、Directus SECRET、管理员邮箱及密码。
# SECRET 和密码应分别生成；例如 openssl rand -hex 32。
# 邮箱需使用格式有效的实际地址。初始化凭据仅在空数据库首次创建时生效。
docker compose up -d --wait database directus
```

后台仅绑定服务器 `127.0.0.1:8055`，数据库不暴露宿主机端口。使用服务器已有的 Nginx/Caddy 配置 HTTPS 反向代理，将 `cms.example.com` 转发到 `127.0.0.1:8055`，设置上传大小 80MB、上传读取超时至少 120s，并转发 Host、X-Forwarded-Proto 和 X-Forwarded-For。`CMS_PUBLIC_URL` 填写真实 HTTPS 后台地址。未配置 HTTPS 前请用 SSH 端口转发管理后台。

如果健康检查失败，先查看 `docker compose logs --tail 100 directus`，以及管理员是否成功创建。`/server/ping` 应返回 `pong`；`/server/health` 可能要求管理员鉴权。健康检查并不替代登录与实际上传测试。

## 2. 接入腾讯云 COS

在 `deploy/.env` 填写：

```dotenv
COS_SECRET_ID=从腾讯云子账号获取
COS_SECRET_KEY=从腾讯云子账号获取
COS_BUCKET=你的桶名-APPID
COS_REGION=ap-shanghai
COS_ENDPOINT=https://cos.ap-shanghai.myqcloud.com
```

地域按你的桶调整。桶使用**私有读写**；Endpoint 是地域 API 地址，不是带桶名的访问域名、CDN 地址或控制台地址。使用仅能访问该桶的 CAM 子账号密钥，按需要授予列举、读取、上传、删除对象及分片上传权限。不要使用腾讯云主账号密钥。SDK 通过 S3 协议签名请求，使用虚拟主机风格路径。

```sh
docker compose -f compose.yaml -f compose.cos.yaml up -d --wait database directus
```

后续所有 Compose 命令保持相同的两个 `-f` 参数，包括重启和发布站点服务，避免恢复到本地存储配置。COS 是默认上传位置，`local` 保留用于读取切换前的历史文件，已有照片不会自动迁移。

在 Directus 文件库选择 COS 位置上传一张照片，确认文件库能显示缩略图、下载和删除测试照片；在 COS 控制台核对对象确实存在。前台不会直接访问 COS，浏览器上传经过后台，因此无需给网站开放 COS CORS，也无需把原片桶设为公开。实际联网和 COS 鉴权必须在填写真实凭据后验证。

## 3. 初始化作品模型

回到仓库根目录：

```sh
cd ..
pnpm install --frozen-lockfile
cp .env.example .env
```

在 `.env` 设置真实的 `SITE_URL=https://photos.example.com`、`DIRECTUS_URL=http://127.0.0.1:8055`。登录后台后，在管理员用户详情中生成临时静态 Token，将其写入 `.env` 的 `DIRECTUS_ADMIN_TOKEN`，不要通过聊天或 Git 传递。

```sh
pnpm cms:init
pnpm cms:token
```

`cms:init` 创建 `albums` 和 `photos` 集合及关联，可重复执行；不覆盖已有字段配置，发现不兼容字段会停止。已有同名集合请先备份并审查，不要删除生产数据来解决冲突。

`cms:token` 创建专用只读用户和策略，写入权限为 0600 的 `.env.build`，不向终端输出密钥。已有文件时拒绝覆盖。此凭据能读取所有后台文件和已发布作品，应只交给可信构建进程。公众策略不添加权限，原图保持私有。完成后撤销管理员临时 Token，并从 `.env` 删除 `DIRECTUS_ADMIN_TOKEN`。

打开后台的内容管理：

1. 创建相册，填写标题、slug、说明，状态设置为 `published`。
2. 创建作品，上传图片，填写标题、slug、画面描述，选择相册，可填地点和日期。
3. 状态默认为 `draft`，发布作品时改为 `published`。
4. 用排序视图拖动作品/相册，改变展示顺序。

只有相册和作品都发布才会进入网站。空相册不展示。没有已发布作品时显示空状态，不会偷偷回退到示例照片。错误配置、鉴权失败、损坏图片、缺失信息会阻止发布，保留当前网站。

## 4. 发布网站

先编辑 `content/site.json` 中的站点介绍，再执行：

```sh
pnpm site:publish
cd deploy
# 使用 COS 时：
docker compose -f compose.yaml -f compose.cos.yaml --profile site up -d --wait
# 若只使用本地后台存储则使用 docker compose --profile site up -d --wait
```

发布脚本先准备图片、类型检查、构建，再原子切换 `.publish/current` 符号链接。Nginx 挂载整个 `.publish`，不需要每次重启。前台默认绑定 `127.0.0.1:8080`，由现有 HTTPS 反向代理对外提供服务。请将作品集域名转发到该端口。

发布后检查：首页、相册、作品详情、手机布局、灯箱、图片请求、站点地图与错误页面。刷新后台作品后再次运行 `pnpm site:publish`。

仅运行 `pnpm build` 生成预览用 `dist/`，不会修改已经发布的网站。`SITE_URL` 缺失时本地构建使用 localhost 且不生成 sitemap；正式发布支持 HTTPS 域名，或带实际端口的 HTTP IPv4 地址（例如 `http://203.0.113.10:8080`）。

## 5. 运维、备份和回滚

- 定期备份 PostgreSQL（例如 `docker compose exec -T database pg_dump -U portfolio portfolio > backup.sql`），同时备份 uploads/extensions 卷、COS 对象和私密环境文件。备份含敏感信息，需要加密及权限保护，并演练恢复。
- COS 开启版本控制/合理的生命周期规则；不要删除 Directus 仍在引用的对象。
- `.publish/releases/` 保留发布历史。回滚时在 `.publish` 内创建指向旧 `releases/<版本>` 的临时相对符号链接，再用 `mv -Tf` 原子替换 `current`；确认目标目录存在。只删除已确认不再使用的旧版本。
- 不要执行 `docker compose down -v`，它会删除数据库和本地照片卷。
- 构建发布有文件锁防止并发。如果进程被强制终止，确认没有其他发布进程后再删除 `.publish/publish.lock` / `.publish/next`。
- 静态展示图使用长缓存。更换图片会产生新 URL；撤回图片不会清除浏览器缓存、COS 历史或旧发布版本，按你的隐私要求另行清理。
- 更新依赖、数据库或 Directus 前先备份，在测试环境升级并复验。容器版本固定，升级由你明确执行。
