# AIO 独立 Host 旁路预览边界

本文说明如何把 Form Studio 作为单实例 Alpha demo 放到独立 Host 的可信 nginx 后面。它只为 AIO 旁路预览准备运行边界，不是公网产品发布，也不实现 WordPress/SSO、生产 `actorResolver`、`/form-studio/` basePath 或 Poffices invoke 适配器。

## 固定边界

- 使用独立 Host，例如 `form-studio.example`。Form Studio 的 `/api/*` 只存在于该 Host，禁止占用 AIO 站点根 Host 的 `/api/`。
- 默认仍监听 `127.0.0.1:4190`。只有容器内或受控反向代理拓扑才显式设置 `FORM_STUDIO_HOST=0.0.0.0`。
- demo 身份只允许在外层访问控制之后使用，应用端口不得对公网或不可信局域网开放。
- product 模式没有身份提供方时继续返回 `503 identity_provider_unconfigured`，不得回退到 demo profile。
- SQLite 数据写入卷，不进入镜像。当前 demo session 保存在进程内存中，因此只运行一个实例，重启后需要重新选择 demo 身份。

## 运行时变量

| 变量 | 默认值 | 约束 |
|---|---|---|
| `FORM_STUDIO_HOST` | `127.0.0.1` | 只允许 `127.0.0.1` 或 `0.0.0.0` |
| `FORM_STUDIO_PORT` | `4190` | 1–65535 的整数 |
| `FORM_STUDIO_DB_PATH` | 仓库 `data/form-studio.sqlite` | 容器使用 `/data/form-studio.sqlite` |
| `FORM_STUDIO_MODE` | `product` | 只允许 `product`、`demo`、`test` |
| `FORM_STUDIO_TRUST_PROXY` | `false` | 只允许 `true`、`false`；直连端口受限时才开启 |
| `FORM_STUDIO_PUBLIC_ORIGIN` | 空 | 只接受纯 `http(s)` origin，不接受路径、query、fragment 或凭据 |
| `FORM_STUDIO_RUNTIME_REVISION` | `development` | 可选诊断指纹，不是身份或发布凭据 |

设置 `FORM_STUDIO_TRUST_PROXY=true` 后，应用只为 Cookie 的安全属性读取直接上游覆盖后的 `X-Forwarded-Proto`。它不从 `X-Forwarded-Host` 猜公开地址，也不把 `X-Forwarded-For` 当身份或授权依据。配置 HTTPS `FORM_STUDIO_PUBLIC_ORIGIN` 时，demo session Cookie 同样带 `Secure`。

## 交接包与空卷硬门槛

- 每次从干净目录重新生成交接包，不要把两次上传覆盖到同一个 `_incoming`。交接包内不得出现 `*.sqlite*`、`*.bak`、`.env`、密钥或其他本机运行数据。
- 仓库 `data/` 中被 Git 忽略的 SQLite 是本机 demo 物化结果，不是部署输入；不要为了制作交接包删除本机数据库，也不要把它复制到 AIO。
- AIO 第一次启动 demo 前，目标 `/mnt/data/form-studio` 必须是新的空目录，且 `form-studio.sqlite` 必须不存在，而不是预建一个空文件。应用只会在数据库原本不存在时从 `data/mock-agents.json` 初始化 canonical mock。
- 同一 `datasetRevision` 的既有受管数据库会保留已有交互状态；无 canonical ownership metadata 的既有数据库会 fail closed。因此“已有库再覆盖代码”不能替代空卷首启。

可在 AIO 启动前做只读预检；第一条不应输出任何文件，第二条应成功：

```bash
find /path/to/_incoming -type f \( -name '*.sqlite*' -o -name '*.bak' -o -name '.env' \) -print
test ! -e /mnt/data/form-studio/form-studio.sqlite
```

这里的 `/path/to/_incoming` 只是占位符，必须替换成经确认的实际交接目录。预检不负责删除文件；发现命中项时应重新生成干净交接包或先确认远端数据处置方案。

## Docker 本地启动

仓库的 Compose 只把应用映射到宿主机 loopback：

```powershell
$env:FORM_STUDIO_PUBLIC_ORIGIN = "http://form-studio.local.test:8080"
docker compose build
docker compose up -d
docker compose ps
```

本地卷为 `./data-runtime:/data`，目录已由 `.gitignore` 和 `.dockerignore` 排除。AIO 可在自己的、另行审核的 Compose 中改为 `/mnt/data/form-studio:/data`；不要修改或覆盖平台的 `/usr/local/poffices/docker-compose.yml`。Linux 主机应预先创建目录并确保容器非 root 用户（UID/GID 1000）可写，然后再启动服务。备份时同时保留 SQLite 主文件和同目录 WAL 状态，或先停止单实例后复制完整数据目录。

若不使用 Compose，`docker run` 必须显式传入 `FORM_STUDIO_HOST=0.0.0.0`，并仍只发布到宿主机 loopback：

```bash
docker run --rm \
  -e FORM_STUDIO_HOST=0.0.0.0 \
  -e FORM_STUDIO_DB_PATH=/data/form-studio.sqlite \
  -e FORM_STUDIO_MODE=demo \
  -p 127.0.0.1:4190:4190 \
  -v /mnt/data/form-studio:/data \
  <reviewed-form-studio-image>
```

镜像名必须替换为实际审核过的构建产物。AIO 的 `restart: unless-stopped` 属于平台 Compose；建议先在无自动重启下完成健康检查、外层认证和日志验收，再加入该策略。

## 用本地 nginx 接过网关

1. 在本机 hosts 文件增加 `127.0.0.1 form-studio.local.test`。
2. 把 `docs/nginx-form-studio-host.example.conf` 加入本地 nginx 的 `http` 配置。
3. 执行 `nginx -t`，确认配置无误后 reload。
4. 通过独立 Host 检查，而不是直接访问应用端口：

```powershell
curl.exe -i http://form-studio.local.test:8080/api/health
curl.exe -s -D - -o NUL http://form-studio.local.test:8080/session
```

浏览器打开 `http://form-studio.local.test:8080/`，应能选择 demo 身份并进入工作台。健康检查应返回 200，`/session` 应跳回配置的公开 origin。该本地配置没有 TLS 和外层认证，所以只能监听 loopback，不能复制成公网配置。

## AIO nginx 交接条件

- 独立 `server_name` 和证书，不与 WordPress、Portal `/api/`、`/aio/` 或招生系统 `/mae/` 共用路由前缀。
- upstream 指向宿主机 `127.0.0.1:4190`，并由 nginx 覆盖 `Host`、`X-Forwarded-Host`、`X-Forwarded-Proto`。
- 仅 `location = /api/health` 可免登录；其余 `location /` 全部经过 WordPress 管理员 `auth_request`。绝不能为整个 `/api/` 关闭认证。
- AIO 侧另行验收 TLS、管理员访问控制、日志、限流、备份与恢复；这些能力不在本仓实现，也不能用本地 nginx 冒烟结果代替。

## 回退

停止并移除 Form Studio 容器即可撤掉旁路服务；数据卷目录保留。删除新增的独立 Host nginx 配置并 reload 即可回退网关，不影响 AIO 已有根 Host 路由。未设置新环境变量时，仓库仍按原行为监听 `127.0.0.1:4190`。

## 参考依据

- Node.js 显式监听 host：https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback
- Node.js LTS 发布周期：https://nodejs.org/en/about/previous-releases
- nginx 代理头与 `proxy_pass`：https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- nginx `auth_request`：https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
- Cookie `Secure` 属性：https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.2.5
- Docker loopback 端口发布：https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/
- Docker bind mount 边界：https://docs.docker.com/engine/storage/bind-mounts/
- Node 官方镜像非 root 与 PID 1 建议：https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
