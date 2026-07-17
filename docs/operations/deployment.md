# OurTomorrow 安全部署与回滚

本手册用于 `infra/compose.yaml` 的单机 Docker Compose 部署。发布脚本只编排当前主机；它不会配置 VPN、防火墙、上游访问代理、DNS、证书签发权限或异地 Restic 仓库，这些外部边界必须在第一次发布前独立完成并留证。

## 1. 先确定访问边界

角色选择不是认证。生产只允许以下两种入口形态：

| `ACCESS_BOUNDARY`       | Caddy 监听                                             | TLS                                            | 外部控制                                                               |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `upstream-access-proxy` | `CADDY_BIND_ADDRESS=127.0.0.1`、`APP_SITE_ADDRESS=:80` | 上游到浏览器必须为 HTTPS                       | 上游代理/VPN 只放行两人的设备；代理到本机 loopback                     |
| `private-interface`     | 绑定明确的私网/VPN 接口 IP，禁止 `0.0.0.0`             | Caddy 使用 `https://<private-name-or-address>` | 主机防火墙只允许指定私网/VPN；不得让相同端口从公网接口或普通局域网进入 |

无论选择哪一种：

- `PUBLIC_APP_URL` 和 `WEB_ORIGIN` 必须是同一个 HTTPS Origin；
- PostgreSQL 只绑定 `127.0.0.1`，`data` Docker 网络保持 `internal: true`；
- 不向应用增加密码、邀请码或 Session 来掩盖入口配置错误；
- `PRIVATE_ACCESS_ACKNOWLEDGED=true` 表示操作者已经从允许和不允许的网络各验证一次，而不是“准备以后再配置”；
- Caddy 端口禁止 wildcard bind。需要公网中继时，让受控上游代理连接 loopback，不直接公开 Caddy。

## 2. 主机与环境准备

主机至少需要 Docker Engine + Compose v2、Git、Curl 和 jq。部署用户需要读取仓库、使用 Docker、读取受控 `infra/.env` 和写入 `infra/releases/`；不需要把 Docker socket挂入任何应用容器。

从示例创建真实环境文件：

```bash
cp infra/.env.example infra/.env
chmod 600 infra/.env
```

必须替换所有示例秘密，并满足：

- `IMAGE_TAG` 是不可变发布标签（推荐日期 + Git SHA），不用 `local`/`latest`；
- `BACKUP_ENCRYPTION_KEY` 与 Restic 仓库分开保管；
- `RESTIC_REPOSITORY` 有独立主机/账号/版本策略，或本地仓库另有受监控异地副本；
- `BACKUP_OFFSITE_ACKNOWLEDGED=true` 只在实际验证异地副本和恢复凭据后设置；
- 数据库 URL 中的特殊字符做 URL 编码，`BACKUP_DATABASE_URL` 不附带 Prisma 的 `?schema=public` 参数；
- 上游代理不得记录正文、完整请求/响应体、角色内容或媒体签名 URL。

先运行只读检查：

```bash
infra/scripts/preflight.sh --env-file infra/.env
```

它会验证生产 HTTPS Origin、明确访问边界、示例秘密、Caddy/PostgreSQL 绑定、内部数据网络、只读根文件系统和 `no-new-privileges`。检查失败必须修配置，不能跳过。

## 3. 发布前门禁

1. 当前 `main` commit 已完成对应阶段测试并有不可变镜像标签；源码构建发布要求 tracked worktree 干净。
2. 最近自动备份健康，异地仓库容量正常，Restic 密码的独立恢复副本可用。
3. 没有正在进行的导出、恢复、备份或人工数据库操作。
4. 两位使用者知道维护窗口和预期影响。
5. 为这次发布确定 `RELEASE_ID`，例如 `20260717-stage5-<sha>`。

可先完整预演命令而不改变容器、数据库或远端仓库：

```bash
infra/scripts/deploy.sh \
  --env-file infra/.env \
  --image-tag 2026.07.17-abcdef123456 \
  --release-id 20260717-stage5-abcdef123456 \
  --dry-run
```

## 4. 分阶段发布

正式执行：

```bash
infra/scripts/deploy.sh \
  --env-file infra/.env \
  --image-tag 2026.07.17-abcdef123456 \
  --release-id 20260717-stage5-abcdef123456
```

固定顺序如下：

1. 再次执行生产 preflight；
2. `DEPLOY_IMAGE_MODE=build` 时构建 API/Web/backup，`pull` 时拉取不可变镜像；
3. 启动 PostgreSQL 并等待 `healthy`；
4. 启动 backup 并等待最近快照健康；
5. 以 `pre-migration` trigger 创建新快照，执行 `restic check` 并回读 snapshot ID；
6. 运行一次性 `prisma migrate deploy`；
7. 更新 API、worker、Web，分别等待 `healthy/running`；
8. 更新 Caddy，并通过外部 `PUBLIC_APP_URL` 运行 smoke；
9. 原子写入发布记录和 `current.env`。

迁移前快照不是“命令已启动”即成功：`backup-now.sh` 必须得到与本次 `RELEASE_ID` 匹配的 `last-success.json`，且 Restic 能按 ID 重新列出快照。强制 `flock` 会让定时与人工备份互斥；人工命令若撞上正在运行的备份，只有在匹配的成功记录出现后部署才能继续。

## 5. 上线 smoke 的判定

`infra/scripts/smoke.sh` 不读取或打印私人正文，只验证：

- Web `/healthz`、API `/health/live` 与 `/health/ready` 返回 200；
- HTTPS 证书由 Curl 正常验证，最低 TLS 1.2；
- CSP 含 `default-src 'self'` 与 `frame-ancestors 'none'`；
- Permissions Policy、Referrer Policy、nosniff、DENY 和 HTTPS HSTS 存在；
- `POST /identity/select` 分别选择 `boy` 和 `girl`；
- 两者用户 ID 不同、成员恰含 boy/girl、Couple ID 相同；
- 当前 Couple 端点在两个角色下仍返回同一空间；
- 身份响应没有 token/session 字段，也没有 `Set-Cookie`。

本地恢复演练只有在明确传入 `--allow-http` 且目标是 localhost 时才能跳过 TLS/HSTS；生产烟测不提供该豁免。

## 6. 发布记录

脚本在 `DEPLOY_RECORD_DIR`（默认 `infra/releases/`，Git 忽略）写入权限 `0600` 的 JSON：

- release ID、状态、开始/结束时间、操作者；
- Git commit、镜像标签和 build/pull 模式；
- 迁移前 Restic snapshot ID；
- 是否已经执行迁移；
- 前一发布及镜像标签；
- public URL 与访问边界类型。

JSON 是机器证据，不替代人工记录。每次发布另按 [`release-checklist.md`](release-checklist.md) 保存测试结果、迁移清单、外部访问边界验证、容量、异常和决定。记录不得包含 `.env`、数据库 URL、Restic 密码、私人正文、完整响应或媒体地址。

## 7. 失败与回滚

脚本失败后停止后续步骤、保存 `status=failed` 记录，并输出前一镜像和迁移前 snapshot。不要让“自动回滚”掩盖迁移已经发生的事实。

### 7.1 迁移前失败

数据库未迁移时，可以修复镜像/配置后重跑同一 release ID，或显式用前一不可变标签恢复应用服务：

```bash
IMAGE_TAG=<previous-image-tag> \
docker compose --env-file infra/.env -f infra/compose.yaml \
  up -d --no-deps api worker web
```

随后等待健康并重新运行 `smoke.sh`。Caddy/数据服务没有必要时不要重建。

### 7.2 迁移后、切流量前失败

默认迁移策略是 expand/contract，优先修复前向代码并部署兼容镜像。旧镜像只有在明确兼容新 schema 时才能使用。禁止对生产数据库手工执行向下 SQL 或反复修改迁移表。

如果迁移破坏数据或新旧代码均不可运行：

1. 停止 Caddy、API 和 worker，保留现场；
2. 使用发布记录里的迁移前 snapshot；
3. 按 [`../restore-runbook.md`](../restore-runbook.md) 恢复到新的 Compose project/主机；
4. 用匹配旧 commit 的镜像完成双角色和数据抽查；
5. 切换私有入口；原生产卷在复盘完成前不删除。

### 7.3 smoke 失败

- 健康失败：先看服务状态和清理后的结构化日志；
- TLS/安全头失败：保持入口关闭，修 Caddy/上游代理；
- boy/girl 不同 Couple 或出现 Cookie/token：立即停止上线，视为身份契约回归；
- 外部访问边界失败：即使应用 smoke 全绿也不能上线。

## 8. 健康、日志与日常检查

```bash
docker compose --env-file infra/.env -f infra/compose.yaml ps
docker compose --env-file infra/.env -f infra/compose.yaml logs --since 30m api worker caddy
docker compose --env-file infra/.env -f infra/compose.yaml exec -T backup /usr/local/bin/backup-healthcheck.sh
```

日志只允许请求 ID、路由模板、状态码、耗时、服务/任务/备份状态和清理后的错误类别。不要把排障改成记录 body、日记/胶囊正文、数据库 URL、签名媒体 URL、精确位置或备份秘密。

最低告警：API readiness、backup 年龄、最近失败备份、Restic check、PostgreSQL/媒体/备份容量、worker 最老任务延迟与持续重试。每月至少完整 `restic check`，每季度执行一次隔离恢复；高风险迁移和备份仓库变更后立即演练。
