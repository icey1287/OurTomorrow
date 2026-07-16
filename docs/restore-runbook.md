# OurTomorrow 备份与恢复手册

本手册覆盖当前 Docker Compose 部署：PostgreSQL 16、私有 `media_data` 卷，以及 `backup` 容器执行的 `pg_dump + Restic` 加密备份。恢复不是“备份命令成功”的同义词；阶段 5 上线前必须完整演练并保留证据。

## 1. 恢复目标与适用范围

当前基线：

- 自动备份：每天 03:00（`backup` 容器的 `TZ`）；容器首次启动也执行一次。
- 健康阈值：最近成功备份不超过 129600 秒（36 小时）。
- 保留：14 个日备份、8 个周备份、12 个月备份。
- 内容：PostgreSQL custom-format dump、校验和、格式元数据和 `/media`。
- 加密：Restic；密码来自 `BACKUP_ENCRYPTION_KEY`/容器内 `RESTIC_PASSWORD`。
- 建议服务目标：RPO 不超过 24 小时，RTO 4 小时。当前没有 WAL/PITR，因此不能承诺分钟级 RPO。

本手册用于：

1. 季度/发布前恢复演练；
2. 数据库误删或损坏；
3. 媒体卷损坏；
4. 主机丢失后在替代主机恢复；
5. 应用迁移失败需要从已知恢复点重建环境。

## 2. 重要警告

- **不要在原生产数据库上第一次测试恢复。** 先恢复到名称和端口都不同的隔离 Compose project。
- **不要执行 `down --volumes`、删除卷或清空媒体目录，除非已核对 project 名并保留故障现场。**
- 数据库与媒体优先从同一个 Restic snapshot 恢复。恢复较新数据库配较旧媒体会产生无法打开的引用。
- 恢复环境先阻断公网通知、WebSocket 外发和 worker；否则过期任务可能向真实设备补发通知。
- Restic 仓库密码与仓库本身必须分别保存。丢失密码无法恢复；只把密码放在故障主机也不算备份。
- 本地 `/backups/restic` 只适合开发。生产 `RESTIC_REPOSITORY` 必须指向异地仓库或有独立异地复制，否则主机/磁盘丢失会同时丢失应用和备份。

## 3. 备份内容与恢复路径

`infra/backup/backup.sh` 在每次快照中写入：

```text
/var/lib/backup/staging/postgres.dump
/var/lib/backup/staging/SHA256SUMS
/var/lib/backup/staging/metadata.json
/media/**
```

当前 `metadata.json` 格式为：

```json
{
  "format": "our-tomorrow-backup",
  "version": 1,
  "startedAt": "<UTC timestamp>",
  "postgresMajor": 16
}
```

它暂不记录应用镜像或 Prisma migration 版本。因此每次部署记录必须把“镜像 tag、Git commit、迁移版本、迁移前 snapshot ID”保存在运维日志中。恢复时先使用与快照匹配的代码版本，再按 expand/contract 迁移到目标版本。

Restic 排除 `/media/quarantine` 和 `/media/exports`：隔离上传和临时导出包不属于可恢复用户资产；所有 `READY` 且已绑定的媒体必须位于其他媒体路径。

## 4. 日常备份检查

以下示例假设工作目录为仓库根目录，生产环境文件为 `infra/.env`：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml ps
docker compose --env-file infra/.env -f infra/compose.yaml exec -T backup restic snapshots --tag automated
docker compose --env-file infra/.env -f infra/compose.yaml exec -T backup restic check
docker compose --env-file infra/.env -f infra/compose.yaml exec -T backup /usr/local/bin/backup-healthcheck.sh
```

检查 `backup` 日志：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml logs --since 48h backup
```

期望：

- 最近 36 小时内至少一个 `backup completed at ...`；
- `restic snapshots` 中存在带 `automated` tag 的近期快照；
- `restic check` 无 pack/index/data error；
- backup 容器为 healthy；
- 备份仓库和应用主机均有足够空间。

仅在确认当前无备份任务运行时手动触发：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml exec -T backup /usr/local/bin/backup.sh
```

脚本使用目录锁；并发触发会安全跳过。数据库迁移前必须手动触发一次、记录新 snapshot ID，并等待完成后再迁移。

## 5. 隔离恢复演练

以下流程不会写生产 Compose project。示例使用 `our-tomorrow-drill-YYYYMMDD`、HTTP 端口 18080 和 HTTPS 端口 18443。演练机器应限制网络访问，并使用与快照匹配的独立代码 checkout。

### 5.1 准备

1. 从运维记录确定目标 snapshot 对应的 Git commit/镜像 tag。
2. 在独立目录 checkout 该版本；不要切换正在运行的生产工作树。
3. 复制 `infra/.env.example` 为 `infra/.env.restore`，填写**演练专用**数据库密码、备份凭据和端口：

```dotenv
APP_SITE_ADDRESS=http://localhost:18080
PUBLIC_APP_URL=http://localhost:18080
WEB_ORIGIN=http://localhost:18080
HTTP_PORT=18080
HTTPS_PORT=18443

POSTGRES_DB=our_tomorrow
POSTGRES_USER=our_tomorrow
POSTGRES_PASSWORD=<new drill-only password>
DATABASE_URL=postgresql://our_tomorrow:<url-encoded drill password>@postgres:5432/our_tomorrow?schema=public
BACKUP_DATABASE_URL=postgresql://our_tomorrow:<url-encoded drill password>@postgres:5432/our_tomorrow

# 指向真实备份仓库；只授予只读/恢复所需权限
RESTIC_REPOSITORY=<repository>
BACKUP_ENCRYPTION_KEY=<restic password>
```

4. 不把 `infra/.env.restore` 提交 Git；演练后销毁。
5. 构建能够读取 Restic 仓库的 backup 镜像：

```bash
docker compose \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  build backup
```

6. 设置变量：

```bash
export DRILL_PROJECT="our-tomorrow-drill-$(date +%Y%m%d)"
export DRILL_DIR="$(mktemp -d /var/tmp/our-tomorrow-restore.XXXXXX)"
export SNAPSHOT_ID="<restic snapshot id>"
```

确认变量不为空：

```bash
test -n "$DRILL_PROJECT"
test -n "$DRILL_DIR"
test -n "$SNAPSHOT_ID"
```

### 5.2 选择并提取快照

列出快照，不要盲目使用 `latest`：

```bash
docker compose \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  run --rm --no-deps backup restic snapshots --tag automated
```

把指定 snapshot 恢复到主机临时目录。`--user root` 只用于让一次性容器写入演练目录，不改变运行服务用户：

```bash
docker compose \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  run --rm --no-deps --user root \
  --volume "$DRILL_DIR:/restore" \
  backup restic restore "$SNAPSHOT_ID" --target /restore
```

期望文件：

```bash
test -f "$DRILL_DIR/var/lib/backup/staging/postgres.dump"
test -f "$DRILL_DIR/var/lib/backup/staging/SHA256SUMS"
test -f "$DRILL_DIR/var/lib/backup/staging/metadata.json"
test -d "$DRILL_DIR/media"
```

校验数据库 dump：

```bash
cd "$DRILL_DIR/var/lib/backup/staging"
expected="$(awk '{print $1}' SHA256SUMS)"
actual="$(sha256sum postgres.dump | awk '{print $1}')"
test "$expected" = "$actual"
```

检查 `metadata.json` 的 format/version/PostgreSQL major。major 不为 16 时不要直接继续，先准备兼容的 PostgreSQL 工具链。

### 5.3 建立独立数据库并恢复

回到仓库根目录，先只启动独立 PostgreSQL：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  up -d postgres
```

等待健康：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  ps postgres
```

把 custom dump 恢复到演练数据库：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  exec -T postgres sh -c \
  'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error' \
  < "$DRILL_DIR/var/lib/backup/staging/postgres.dump"
```

列出恢复后的表并记录核心数量：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --command "
    SELECT current_database(), version();
    SELECT '\''users'\'' AS table_name, count(*) FROM users
    UNION ALL SELECT '\''couples'\'', count(*) FROM couples
    UNION ALL SELECT '\''couple_members'\'', count(*) FROM couple_members
    UNION ALL SELECT '\''memories'\'', count(*) FROM memories
    UNION ALL SELECT '\''media_assets'\'', count(*) FROM media_assets
    UNION ALL SELECT '\''scheduled_events'\'', count(*) FROM scheduled_events;
  "'
```

若目标阶段尚未创建某张表，按该快照的 migration 版本调整核对清单；不能把“表不存在”忽略为成功。

### 5.4 恢复媒体卷

先构建/取得与快照匹配的 API 镜像，再用一次性容器写入**演练 project** 的 `media_data` 卷：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  build api

docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  run --rm --no-deps --user root --entrypoint sh \
  --volume "$DRILL_DIR/media:/restore-media:ro" \
  api -c 'cp -a /restore-media/. /data/media/'
```

核对：

- 恢复目录文件数和总字节数；
- 从数据库随机抽取至少 10 个 `READY` MediaAsset，对应原图/缩略图均存在；
- 用图片解码工具抽查文件有效，不只检查路径；
- 不应恢复 `/media/quarantine` 和 `/media/exports`。

### 5.5 启动匹配版本并验证

先不要启动 worker 和 backup。启动 `api`、`web`、`caddy`；`api` 会等待一次性 `migrate` 服务完成：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  up -d api web caddy
```

健康检查：

```bash
curl --fail --silent --show-error http://127.0.0.1:18080/api/v1/health/live
curl --fail --silent --show-error http://127.0.0.1:18080/api/v1/health/ready
curl --fail --silent --show-error http://127.0.0.1:18080/healthz
```

用浏览器在受控环境完成必须验证：

1. 分别选择“我是男生”和“我是女生”，确认两个角色进入同一个 Couple；“甲/乙”仅为恢复后的默认称呼；
2. 首页双方昵称、在一起天数和时区正确；
3. 打开至少三条不同年份回忆和其缩略图/原图；
4. 检查一条双方视角、便利贴和已揭晓日记；
5. 检查未解锁胶囊仍不返回正文；
6. 检查已完成/已转换愿望的来源关系；
7. 回收站、导出任务和计划事件数量与预期相符；
8. 确认演练环境没有向真实设备发送通知。

若要验证 worker，先禁用真实通知适配器，再启动并观察一小批任务：

```bash
docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  up -d worker
```

验证任务幂等、失败重试和最老任务延迟后停止 worker。

### 5.6 记录与清理

在清理前记录：

- 演练日期、操作者、Git commit/镜像 tag；
- snapshot ID、备份开始时间、metadata 版本；
- dump checksum、核心表数量、媒体总数和抽样结果；
- 恢复开始/结束时间（实际 RTO）；
- 双角色、共同空间和隐私状态验证结果；
- 失败、修复和后续负责人。

再次核对 project 名包含 `drill`，再销毁演练容器和卷：

```bash
case "$DRILL_PROJECT" in
  *drill*) ;;
  *) echo "Refusing to remove non-drill project"; exit 1 ;;
esac

docker compose \
  -p "$DRILL_PROJECT" \
  --env-file infra/.env.restore \
  -f infra/compose.yaml \
  down --volumes --remove-orphans
```

最后安全删除演练目录和 `.env.restore`。因为它们含私人数据与秘密，普通“拖进废纸篓”不足以成为组织控制；优先使用加密临时卷并销毁卷密钥。

## 6. 生产灾难恢复

### 6.1 先控制现场

1. 宣布维护，停止 Caddy 接收写入；若只读模式未经过测试，直接停止 API/worker。
2. 记录故障时间、最后已知成功请求、部署版本和现象。
3. 不删除旧卷。若磁盘仍可读，对 PostgreSQL 数据目录、媒体卷和日志做只读快照或块级副本。
4. 若怀疑入侵，隔离主机并轮换外部访问代理、数据库、S3、Restic 和部署凭据；恢复不能替代事件处置。
5. 确认两位成员可接受的恢复点，说明可能丢失的时间窗口。

停止应用但保留数据库/备份（在确认 Compose project 后执行）：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml stop caddy web api worker
```

### 6.2 选择恢复点

从已知干净的机器读取异地仓库：

```bash
docker compose --env-file infra/.env -f infra/compose.yaml run --rm --no-deps backup restic snapshots --tag automated
docker compose --env-file infra/.env -f infra/compose.yaml run --rm --no-deps backup restic check
```

选择故障/误操作发生前的 snapshot，并从部署记录找到匹配 Git commit。若最新快照本身包含误删除或攻击者修改，向前选择，不能只按“最近”恢复。

### 6.3 在新 project/主机重建

使用第 5 节相同的提取、checksum、PostgreSQL 和媒体恢复步骤，但设置新的生产 project 名和新秘密。先在仅运维可访问的地址验证，绝不直接覆盖旧卷。

恢复顺序：

```text
匹配版本镜像
  → 空 PostgreSQL
  → pg_restore
  → 同 snapshot 媒体
  → 匹配版本 API/Web（worker 关闭）
  → 数据/隐私/双角色共同空间验证
  → 逐版本 migrate deploy
  → 再次验证
  → 切换流量
  → 最后启动 worker 和 backup
```

升级到当前版本时，每个迁移阶段都先备份恢复环境。若 migration 失败，保留该环境，重新从已知快照创建另一个 project；不要在部分迁移的数据库上反复手工修表。

### 6.4 切换与恢复服务

满足以下条件后才能切流量：

- `/health/live`、`/health/ready`、Web `/healthz` 通过；
- boy/girl 两种角色选择和核心内容抽查通过，且 Couple ID 相同；
- 未揭晓日记/未解锁胶囊仍保密；
- 数据库核心计数和媒体抽样通过；
- 新生产秘密已设置，示例值不存在；
- Caddy TLS、外部私有访问边界、CSP 和开放端口复核通过；
- 通知适配器指向正确生产配置。

切流量后先观察只读请求，再允许写入。最后启动 worker，监控 scheduled/outbox backlog；大量过期提醒应分批处理并遵守幂等/限流。确认第一份新备份成功后，才关闭恢复事件。

## 7. 局部恢复策略

### 7.1 仅数据库损坏

优先把数据库和媒体从同一 snapshot 恢复到新 project。若保留当前媒体卷，数据库回退后媒体可能包含“多余但未引用”的新文件，这是可清理状态；反过来使用旧媒体配新数据库会导致缺失文件，不可接受。切换前运行引用完整性抽查。

### 7.2 仅媒体损坏

不要覆盖现有媒体卷。把 snapshot 媒体恢复到新卷，按 `MediaAsset` 抽查后切换卷。若数据库在 snapshot 后新增媒体，需要从其他副本补齐；只恢复旧 snapshot 会缺失新增对象。

### 7.3 单条误删除

当前系统没有从 Restic 直接在线“恢复一行”的安全入口。流程是：

1. 将删除前 snapshot 恢复到隔离环境；
2. 确认目标资源及其子资源、媒体、来源关系和修订记录；
3. 优先使用产品回收站恢复；
4. 若已物理清理，编写一次性、经评审的领域级导入/修复脚本；
5. 在事务内恢复并写审计，禁止直接复制一张表造成跨空间或外键错误。

### 7.4 Restic 仓库损坏或密码丢失

- 仓库损坏：从异地镜像仓库恢复，执行 `restic check`，不要在唯一副本上贸然 prune/rebuild-index。
- 密码丢失：Restic 无后门；只能使用独立保存的恢复密钥副本。若不存在，视为备份不可恢复并立即建立新策略。

## 8. 恢复验收清单

- [ ] 选定 snapshot 与故障时间、Git commit、migration 版本匹配。
- [ ] `restic check` 通过，dump SHA-256 匹配。
- [ ] PostgreSQL 16 成功 `pg_restore --exit-on-error`。
- [ ] 核心表数量记录并与备份前证据/产品预期对比。
- [ ] 至少 10 个 READY 媒体原图和缩略图存在且可解码。
- [ ] boy/girl 均可选择，返回不同固定成员且 Couple ID 相同。
- [ ] 回忆、视角、日记、愿望、纪念日、胶囊和转换关系抽查通过。
- [ ] 未揭晓/未解锁内容仍不由 API 返回。
- [ ] 健康检查、CSP、TLS、外部访问边界和网络端口符合生产要求。
- [ ] worker 在通知受控条件下处理持久任务且无重复副作用。
- [ ] 新环境完成一份加密备份并可列出 snapshot。
- [ ] 恢复记录含 RPO、RTO、问题、责任人和下次演练日期。

## 9. 演练频率

- 每季度至少一次完整数据库 + 媒体 + 双角色应用验证恢复；
- 每次破坏性/高风险数据库迁移前做手动快照，迁移后做关键抽查；
- 更换 Restic 仓库、密码、PostgreSQL 大版本或媒体后端后立即演练；
- 每月至少执行一次 `restic check`，每日监控 backup health；
- 阶段 5 首次上线前必须有一份完整成功记录，不能以本文档代替实际执行。
