# OurTomorrow 开发指南

本文说明如何在本地运行、按阶段提交、扩展领域、编写迁移与测试，以及把阶段 0–6 安全交付到 `main`。产品范围见 `product.md`，架构边界见 `architecture.md`，接口与安全分别见 `api.md`、`security.md`。

## 1. 工具链

必需：

| 工具       | 版本/要求                                       |
| ---------- | ----------------------------------------------- |
| Node.js    | 22 或更高（CI 使用 22）                         |
| pnpm       | 10.33.0，由根 `packageManager` 固定             |
| Docker     | 支持 Docker Compose v2                          |
| PostgreSQL | 本地推荐使用 Compose 的 16-alpine，不需主机安装 |
| Git        | 支持常规分支、提交与 worktree                   |

推荐编辑器启用 EditorConfig、TypeScript、Vue、Prisma、Tailwind CSS 和 Prettier。仓库统一 UTF-8、LF、2 空格、文件末尾换行。

安装 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm --version
```

## 2. 首次本地启动

在仓库根目录：

```bash
pnpm install
cp .env.example apps/api/.env
docker compose -f infra/compose.yaml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

阶段 1 起无需创建账号、设置密码、运行邀请流程或建立 Session。首次在 Web 输入真名：`示例用户甲` 映射到 `boy`，`示例用户乙` 映射到 `girl`；也可以直接调用身份选择端点。任一路径都会幂等建立固定两名成员和共同空间；“甲/乙”是默认称呼：

```bash
curl -sS \
  -H 'content-type: application/json' \
  -d '{"role":"boy"}' \
  http://localhost:3001/api/v1/identity/select
```

后续 API 请求显式发送 `X-Our-Tomorrow-Role: boy` 或 `girl`。该值只是本地界面选择，不是登录凭据。

默认地址：

- Web：<http://localhost:5173>
- API：<http://localhost:3001/api/v1>
- OpenAPI UI：<http://localhost:3001/api/v1/docs>
- OpenAPI JSON：<http://localhost:3001/api/v1/openapi.json>

根 `pnpm dev` 并行启动 Web、API 和持久化 Worker。定时便利贴、冷静信箱解锁和提醒等后台任务无需再另开终端。

固定身份映射为 `boy/甲/slot 1` 与 `girl/乙/slot 2`，两者始终属于同一个确定性 Couple。初始化不依赖成员凭据或配对流程。能访问站点的人可以切换两个角色，因此对公网部署前必须在应用之外配置只允许两个人访问的网络边界。

### 2.1 分别启动应用

```bash
pnpm --filter @our-tomorrow/api dev
pnpm --filter @our-tomorrow/api dev:worker
pnpm --filter @our-tomorrow/web dev
```

Vite 把 `/api` 代理到 `VITE_DEV_API_TARGET`，默认 `http://localhost:3001`。开发仍应使用相对 `/api/v1`，不要在组件中硬编码主机名。

### 2.2 完整 Compose 验证

本地开发日常只需 PostgreSQL；验证生产拓扑时使用：

```bash
cp infra/.env.example infra/.env
docker compose --env-file infra/.env -f infra/compose.yaml config --quiet
docker compose --env-file infra/.env -f infra/compose.yaml up --build
```

Compose 会先运行 `migrate`，再启动 `api`/`worker`，Web 由 Nginx 提供，Caddy 统一入口。开发示例配置只允许本机使用；公开部署前必须替换所有密码和 `APP_SITE_ADDRESS`。

## 3. 环境变量

`apps/api/.env` 用于本地 API、Worker 与 Prisma CLI，`infra/.env` 用于 Compose。真实文件不提交 Git。

| 变量                       | 作用                                         | 本地提示                | 生产要求                          |
| -------------------------- | -------------------------------------------- | ----------------------- | --------------------------------- |
| `NODE_ENV`                 | development/test/production                  | `development`           | `production`                      |
| `AMAP_WEB_SERVICE_KEY`     | 高德地点搜索、坐标转换、逆地理编码与静态地图 | 仅写入 `apps/api/.env`  | 只注入 API，不进入 Web 包         |
| `API_PORT`                 | Nest 端口                                    | `3001`                  | 容器内仍由 Compose 显式使用 3000  |
| `DATABASE_URL`             | Prisma PostgreSQL URL                        | localhost Compose DB    | URL encode 密码；不公开数据库端口 |
| `WEB_ORIGIN`               | 唯一允许的 Web Origin                        | `http://localhost:5173` | 与实际 HTTPS 同源一致             |
| `PUBLIC_APP_URL`           | Web/API 绝对 URL 基址                        | Web 地址                | HTTPS 正式域名                    |
| `MEDIA_STORAGE_PATH`       | 私有媒体根目录                               | `./storage`             | 独立持久卷，不能由 Web 静态暴露   |
| `MEDIA_MAX_BYTES`          | 单文件上限                                   | 默认 15 MiB             | 同时限制像素/解码资源             |
| `MEDIA_MAX_PIXELS`         | 图片解码像素上限                             | 默认 4000 万            | 防止像素炸弹与异常内存占用        |
| `MEDIA_UPLOAD_TTL_SECONDS` | 上传意图有效期                               | 默认 900 秒             | 过期隔离文件不可完成或读取        |
| `WORKER_POLL_INTERVAL_MS`  | Worker 轮询间隔                              | 默认 2000               | 结合任务延迟监控                  |
| `WORKER_BATCH_SIZE`        | 每次认领量                                   | 默认 20                 | 不超过 100                        |
| `TRUST_PROXY`              | 信任反代头                                   | 直连 API 时 false       | 仅在已知 Caddy 拓扑下 true        |
| `APP_VERSION`              | 健康/日志版本                                | `0.1.0`                 | 设置为镜像或发布版本              |
| `TZ`                       | 进程/备份默认时区                            | `Asia/Shanghai`         | 业务日历仍以 Couple.timezone 为准 |

Compose 额外需要 PostgreSQL、Restic/S3、端口和镜像 tag 变量，见 `infra/.env.example`。Web 的 `VITE_*` 会进入浏览器包，绝不放秘密。
备份容器使用不含 Prisma 专用 `?schema=` 参数的 `BACKUP_DATABASE_URL`；它与应用的 `DATABASE_URL` 指向同一数据库，但必须保持为 libpq/`pg_dump` 可识别的连接串。

## 4. 常用命令

| 命令                | 作用                                                        |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | 并行启动 Web、API 与持久化 Worker 开发进程                  |
| `pnpm build`        | 构建所有 workspace                                          |
| `pnpm test`         | 运行各 workspace 测试                                       |
| `pnpm test:unit`    | 单元测试基线                                                |
| `pnpm test:openapi` | 正式构建 API，启动临时进程并验证 OpenAPI JSON 与阶段 3 路径 |
| `pnpm test:e2e`     | Playwright 双角色端到端测试                                 |
| `pnpm lint`         | 当前以严格 TypeScript/Vue 检查为基础                        |
| `pnpm typecheck`    | 全 workspace 类型检查                                       |
| `pnpm format`       | Prettier 写入格式                                           |
| `pnpm format:check` | CI 格式验证                                                 |
| `pnpm db:generate`  | 生成 Prisma Client                                          |
| `pnpm db:migrate`   | 本地创建/应用 Prisma migration                              |
| `pnpm db:seed`      | 可选开发夹具；固定身份本身由 `/identity/select` 幂等初始化  |
| `pnpm db:studio`    | 本地数据库检查；禁止直接改生产                              |

提交前最小门槛：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

涉及数据库、权限、定时任务、转换或用户路径时，还必须运行对应集成测试和 `pnpm test:e2e`。

## 5. 仓库与依赖规则

### 5.1 Workspace

- `apps/web`：Vue UI；可依赖 `packages/contracts`，不能依赖 API 源码或 Prisma。
- `apps/api`：Nest/Prisma；可依赖 `packages/contracts` 的稳定基础类型。
- `packages/contracts`：无浏览器/Nest/Prisma 副作用，保持可独立 typecheck/build。
- `infra`：部署资源；不能成为应用运行时 import。
- `docs`：规范与运维证据入口。

添加 workspace 依赖：

```bash
pnpm --filter @our-tomorrow/web add <package>
pnpm --filter @our-tomorrow/api add <package>
pnpm --filter @our-tomorrow/api add -D <dev-package>
```

不要在子目录用 npm/yarn 生成第二个 lockfile。依赖升级需提交 `pnpm-lock.yaml`，说明升级原因，并运行受影响测试。

### 5.2 导入方向

Web：

```text
features → shared components/api/utils
layouts/router → features + shared
shared 不反向依赖具体 feature
```

API：

```text
controller/gateway → application use case → domain policy → repository port
Prisma/media/notification adapter → repository/adapter port
```

一个领域不能直接改另一个领域拥有的 Prisma 表；使用对方应用服务、事务协调器或 Outbox。详细边界见 `architecture.md`。

## 6. 按阶段在 main 提交

用户要求按阶段在 `main` 形成可验证提交。每阶段可包含多个小提交，但阶段收口提交必须满足全部门槛，且 `main` 在每个提交点都可构建、可迁移、可回滚。推荐提交格式：

```text
feat(stage-0): establish product, visual and runtime foundations
feat(stage-1): bind two members into one private space
feat(stage-2): deliver shared memories and media
feat(stage-3): deliver low-friction daily connection
feat(stage-4): close the tomorrow-to-memory loop
chore(stage-5): harden production, export and recovery
feat(stage-6): add private romantic enhancements
```

每个阶段的工作顺序：

1. 从 `product.md` 提取验收场景和权限规则；
2. 先更新 Prisma/OpenAPI/领域状态机与测试，明确迁移影响；
3. 实现一个贯穿 UI→API→DB 的最小纵向切片；
4. 扩充同领域能力，保持每个提交通过已有测试；
5. 运行双角色、内容策略、重启/重试和视觉状态验证；
6. 更新文档、示例环境和恢复/部署说明；
7. 在 `main` 提交阶段收口，并记录验证命令与结果。

禁止用“后续再补安全”收口功能阶段：阶段 2 的媒体必须私有，阶段 3 的日记必须不泄露，阶段 4 的胶囊必须服务端解锁。阶段 5 是系统级加固，不是第一次加入基本授权。

## 7. 阶段 0–6 开发门槛

### 阶段 0：产品与视觉基础

交付：七份基础文档、Vue 路由壳与设计系统、Nest API/worker、完整 Prisma 领域基线、共享契约、初始 migration/seed、Compose/Caddy/backup 和 CI。

验证：

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm test:unit
pnpm build
docker compose -f infra/compose.yaml config --quiet
docker compose -f infra/compose.yaml build api web backup
```

另验证 `/identity/select` 在空库、重复调用、并发调用和 API 重启后都只保留固定两名用户、一个 Couple 和两条成员关系。CI/生产不得隐式写入虚构内容 seed。

还需人工检查 320 px、桌面、深色和减少动效的基础页面。

### 阶段 1：固定双人身份与共同空间

测试至少覆盖：`boy`/`girl` 选择、缺失/非法角色 header、并发幂等初始化、确定性两名成员与单一 Couple、显式角色切换、个人资料与 Couple 乐观版本冲突，以及 Today 的服务端时区。

### 阶段 2：记录

先完成一条完整路径：创建回忆 → 上传私有图片 → A 视角 → B 视角 → 时间线找回。随后添加标签、地点、评论、回应和随机回忆。媒体测试必须含 MIME 欺骗、EXIF 清理、跨空间读取和删除保留期。

### 阶段 3：日常

使用可控 Clock 和真实 PostgreSQL 测定时便利贴与状态过期。交换日记的两个用户并发提交测试必须证明提交前没有任何端点/事件泄露对方答案。worker 重启后任务继续。

### 阶段 4：明天

状态迁移使用动作端点而非任意 PATCH。愿望、计划、纪念日、时间胶囊和便利贴跨时间转换必须形成完整闭环；愿望和胶囊转回忆以 `Idempotency-Key`、Serializable transaction 与数据库唯一约束保证一次。

阶段 4 至少测试：情侣空间时区重排、两种闰日策略、DST、计划提醒重复 poll、浏览器时间篡改、封存后不可写、共同胶囊并发确认、每成员独立 open、`TO_SELF` 404、原图/缩略图及“媒体重新绑定洗白”均被拒、愿望或关联计划完成后持久排程胶囊、并发转换只生成一条 Memory、`/today/upcoming` 不含正文或附件元数据。Web 的所有阶段 4 query key 必须包含当前 `boy`/`girl`，`capsule.hidden` 实时事件要立即移除列表和详情缓存。

### 阶段 5：安全与上线

完成内容权限矩阵、回收站、导出、生产访问边界/CSP/TLS、日志脱敏、备份监控和完整恢复演练。把 `restore-runbook.md` 的实际证据（不含秘密/正文）存入受控运维记录。

### 阶段 6：浪漫增强

当前阶段 6 的已实现范围是：固定 kind 抱抱、Couple 每日盲盒、第一次博物馆、足迹/未来双状态地图、冷静信箱、年度回忆书、私密 PWA 和阶段 6 导出扩展。

- Touch 请求不含自由文本；服务端以 Serializable 事务执行发送者 30 秒冷却和滚动一小时 12 次上限。在线事件和离线通知只传固定 kind。
- CalmLetter 到期只进入 AVAILABLE；收件人显式 open 前，列表、详情、通知、实时事件和导出都不能出现正文。
- MemoryResurface 依赖 `(coupleId, localDate)` 唯一约束；boy/girl 必须读取同一盲盒，open/dismiss 并发仍只有一个最终状态。`/memories/first-times` 只返回 PUBLISHED、非未来、未删除回忆。
- Place 同时维护历史/未来状态。此刻贴纸只在用户点击按钮后读取一次浏览器 GPS，由 API 转换坐标并通过高德逆地理编码返回附近建筑；静态地图也由 API 代理，Key 只保存在服务端。应用不持续定位、不保存轨迹。完成愿望/计划时地点迁移和业务状态处于同一事务。
- AnnualReview 的 READY 状态允许再次 request 并重算统计，PUBLISHED 后冻结；`media-options` 和更新校验只接受对应年份 PUBLISHED 回忆中的 READY 图片。
- PWA 只缓存 shell/manifest/icon/hashed assets。切换角色或应用进入后台时清理私密内存状态；前台恢复要重新读取当前角色后才移除隐私幕。抱抱到达浮层可在设置中关闭。
- 导出新增地点双状态、TouchEvent、CalmLetter、MemoryResurface 和 AnnualReview，并继续按当前角色可见性裁剪正文、memoryId 与媒体 ID。

今日一件小事、未来来信、简单共同日历和月度合集尚未实现；开发与测试不得把占位文案或既有日历摘要当成这些功能已经交付。

## 8. Prisma 与数据库迁移

### 8.1 修改流程

1. 在 `apps/api/prisma/schema.prisma` 修改模型/索引/约束。
2. 评审空间隔离、作者关系、软删除、时间类型和唯一不变量。
3. 生成命名明确的 migration：

```bash
pnpm --filter @our-tomorrow/api prisma migrate dev --name <short_description>
```

4. 查看生成 SQL；不要只看 schema diff。
5. 更新 seed、领域代码、OpenAPI/共享枚举和测试。
6. 在全新数据库运行 `prisma migrate deploy`，并测试从上一阶段数据库升级。

### 8.2 规则

- 瞬时点用 `timestamptz`，本地纪念日期用 `date` + Couple.timezone。
- 共享资源显式带 `coupleId` 或有不可绕过的同空间关联；高频查询建立包含 couple/status/time 的索引。
- 状态枚举变更视为协议变更；数据库、TypeScript、OpenAPI 和 UI 映射同提交更新。
- 删除默认使用 `deletedAt`；物理清理交给有保留期的 worker。
- 新非空字段先 nullable/默认并回填，再收紧；大表变更采用 expand/contract。
- 生产只运行 `prisma migrate deploy`，不运行 `migrate dev`、`db push` 或 Studio 修改。
- 迁移前执行加密备份并记录 snapshot ID；高风险迁移按 `restore-runbook.md` 演练。

### 8.3 Seed

Seed 必须可重复运行且只生成虚构业务内容。固定身份由 `/identity/select` 初始化，不依赖 seed。不要把真实照片、日记、私人地点或生产 ID 放入仓库；production 环境拒绝执行开发内容 seed。

## 9. API 契约工作流

1. 在 `api.md` 确认动作、状态和保密字段边界。
2. 编写 DTO、验证规则、Swagger metadata 和稳定错误码。
3. 添加 Controller 契约测试与授权/秘密状态测试。
4. 生成 `/api/v1/openapi.json`，生成/更新 Web 客户端。
5. CI 检查生成结果无漂移。
6. 页面只使用生成客户端，不手写重复响应类型。

共享 `packages/contracts` 当前可保存 `API_PREFIX`、稳定枚举、错误/分页等基础类型。随着 OpenAPI 生成建立，完整资源 DTO 应由生成物承担；不要让手写类型和服务端响应长期双轨。

接口设计原则：

- 状态迁移使用 `/submit`、`/seal`、`/complete`、`/convert-to-memory` 等命令端点；
- 每个角色相关请求显式验证 `X-Our-Tomorrow-Role`；跨时间转换、上传完成和导出支持幂等键；
- 共享编辑使用 version/ETag；
- 列表使用游标分页；
- 保密字段不可见时省略，不返回占位正文；
- 错误含 request ID，不含内部 SQL/路径/正文。

## 10. API 模块开发模板

推荐目录（按模块实际复杂度调整）：

```text
src/modules/memories/
  memories.module.ts
  memories.controller.ts
  application/
    create-memory.use-case.ts
    update-memory.use-case.ts
  domain/
    memory-policy.ts
    memory-errors.ts
  infrastructure/
    prisma-memory.repository.ts
  dto/
  tests/
```

实现顺序：

1. 写授权和状态不变量测试；
2. 写纯领域策略；
3. 写 Prisma repository，查询从一开始包含 actor.coupleId；
4. 在应用服务建立事务/幂等/Outbox 边界；
5. 最后添加 Controller/Swagger 映射；
6. 使用两个空间和两个成员做集成测试。

Controller 不读取请求体 `coupleId`，不直接调用其他模块 Prisma 模型，也不返回 Prisma entity。

## 11. Web 开发规范

### 11.1 数据所有权

- Vue Query 管服务器实体、分页、刷新和 mutation；
- Pinia 管短期 UI 状态；身份相关本地数据只允许保存 `boy`/`girl`，禁止持久化正文、媒体和 Couple/API 实体；
- 不把完整 API 数据复制到 Pinia；
- 切换角色、清除身份选择或页面锁定时清空所有私密 Query cache 和 object URL；
- WebSocket 事件使精确查询失效，再通过 REST 读取事实。

### 11.2 路由

路由只区分“尚未选择本地角色”和“已选择 `boy`/`girl`”。角色守卫用于体验与缓存隔离，不是认证或安全边界；固定空间由 API 根据显式 header 映射。

新增页面：

- 放入 `src/features/<domain>` 并路由懒加载；
- 使用 `PageHeader`、`SurfaceCard`、`BaseButton`、`AsyncState` 等基础组件；
- 使用 `brand.md` token，不在页面复制任意 hex/阴影；
- 完成 loading/empty/error/offline/permission/locked 状态；
- 手机 320 px 和桌面同时验证。

### 11.3 表单与时间

表单区分本地草稿、正在保存、已由服务端保存和冲突。服务器响应是状态事实；客户端 `new Date()` 只用于展示，不决定在一起天数、日记日期、便利贴显示或胶囊解锁。所有相关响应带情侣空间日历日期/时区。

## 12. 时间、Worker 与测试时钟

- 领域代码注入 `Clock`，测试使用固定/可推进时钟；禁止散落 `new Date()` 参与业务判断。
- ScheduledEvent 写入数据库，worker 以原子批量认领、锁超时和重试状态执行。
- 处理器以 event/resource ID 幂等；重复执行不会重复通知、转换或打开。
- 测试“进程在任务到期前退出 → 重启 → 任务仍执行”。
- 测试情侣空间 IANA 时区、UTC 日期边界、DST（即使默认时区无 DST）和 2 月 29 日。
- Worker 日志只含 event ID/type/attempt，不含 payload 中的正文。

## 13. 媒体开发

本地媒体目录必须在 Git ignore 中。测试媒体使用小型、可公开的生成夹具，覆盖：

- JPEG/PNG/WebP 正常路径；
- 扩展名与魔数不一致；
- SVG/未知格式拒绝；
- 超大小/像素、损坏解码；
- EXIF GPS 移除；
- 缩略图生成；
- 跨空间、缺失角色和非法角色读取；
- 未解锁胶囊附件；
- 删除、回收站恢复和延迟清理。

阶段 2 的本地适配器使用 `/uploads/presign → PUT /uploads/:id/content → /uploads/complete`；原始字节只进入隔离区，完成后才原子移动到私有对象目录。存储通过 adapter 接口访问，业务代码不拼接用户提供的磁盘路径或 S3 URL。测试使用临时目录并在测试结束清理。

当前阶段优先防止误删，因此过期上传、失败隔离文件和未绑定成品仍会保留。开发环境可手动清理专用测试目录；生产自动保留期清理、清理审计与容量告警在阶段 5 完成。

## 14. 测试策略

### 14.1 单元测试

纯函数/策略：在一起天数、纪念日、时区、状态迁移、胶囊解锁、日记揭晓、权限、随机回忆去重、导出 manifest。单元测试不依赖真实网络或系统时钟。

### 14.2 集成测试

使用 PostgreSQL 16 和真实 Prisma migration，验证唯一约束、事务、固定身份并发初始化、跨空间查询、ScheduledEvent/Outbox、媒体适配器和导出。空间隔离测试可直接建立额外数据库夹具；产品 UI 仍只暴露固定共同空间。

阶段 6 额外覆盖：Touch 并发限流与固定伴侣推导、离线通知固定 kind；CalmLetter 到期/open 竞争和正文查询边界；两角色并发创建同一每日盲盒；first-times 隔离；地点双状态和愿望/计划完成迁移；年度书 READY 重算、PUBLISHED 冻结、年度媒体白名单；阶段 6 导出字段与内容裁剪。

### 14.3 E2E

Playwright 使用两个独立浏览器 context，分别输入 `示例用户甲` 和 `示例用户乙`：

```text
示例用户甲匹配 boy → 示例用户乙匹配 girl → 确认看到同一空间
→ 甲创建回忆/上传图片 → 乙补视角
→ 双方提交交换日记并同时揭晓
→ 创建未到期胶囊，确认 API/UI 不泄露
→ 愿望完成并转回忆
→ 首页双方看到结果
```

E2E 同时覆盖 320 px 移动视口、桌面、深色、键盘关键路径和减少动效。不要只依赖截图；对权限和状态查询 API/DOM 语义断言。

阶段 6 的双 context 场景继续覆盖：一方发送固定 Touch、另一方在线看到可关闭浮层且离线通知保留 kind；冷静信到期后仍需显式 open；两角色看到同一盲盒并可 open/dismiss；第一次博物馆分页；足迹/未来地图的 SVG 与等价列表；READY 年度书重算、选图和发布冻结。PWA 用 production build/preview 验证，断言 Service Worker 不缓存 API、Socket、媒体或导出，并验证后台隐私幕与前台角色恢复。

阶段 3 起，涉及日记、心情和定时任务的 Playwright 用例只允许重置显式指定的隔离数据库。数据库名必须包含 `test` 或 `e2e`，并同时设置 `E2E_RESET_DATABASE=true`：

```bash
docker compose -p our-tomorrow-integration-test \
  -f apps/api/test/compose.postgres.yaml up -d

DATABASE_URL='postgresql://our_tomorrow:integration-test-password@127.0.0.1:55432/our_tomorrow_integration_test?schema=public' \
  pnpm --filter @our-tomorrow/api exec prisma migrate deploy --schema prisma/schema.prisma

E2E_DATABASE_URL='postgresql://our_tomorrow:integration-test-password@127.0.0.1:55432/our_tomorrow_integration_test?schema=public' \
E2E_RESET_DATABASE=true \
  pnpm test:e2e
```

设置 `E2E_DATABASE_URL` 时 Playwright 不复用已经运行的本地 API/Web，而是在独立端口启动 API、Web 和持久 worker，避免误连其他服务或普通开发数据库。

### 14.4 恢复测试

备份和恢复是产品测试，不是可选运维。按 `restore-runbook.md` 恢复数据库/媒体，分别选择 boy 和 girl 并确认进入同一空间后抽查内容，记录实际 RPO/RTO。

## 15. CI

`.github/workflows/ci.yml` 当前包含：

1. pnpm frozen install；
2. Prettier、lint、typecheck、unit test、workspace build；
3. PostgreSQL 16 上生成 Prisma Client、应用 migrations 和 API 测试；
4. Compose model、Caddy 配置和 API/Web/backup 镜像构建。

当前 CI 在 workspace build 后运行 `pnpm test:openapi`，用正式构建产物启动 API 并读取 `/api/v1/openapi.json`，防止装饰器元数据、Swagger 初始化或阶段 3 路径回归。后续阶段继续加入生成客户端 drift、双角色 Playwright、媒体恶意样本、依赖/镜像扫描和恢复演练状态检查。CI 日志不得输出 `.env`、数据库 URL 密码、测试日记正文、媒体或导出包。

## 16. Code review 清单

### 通用

- [ ] 变更对应产品阶段和验收场景，没有扩大成公开社交/评分产品。
- [ ] 类型严格，无无说明的 `any`、非空断言或吞错。
- [ ] loading/error/空状态和可访问性完整。
- [ ] 测试覆盖成功、失败、并发、重试和边界，而不只 happy path。
- [ ] 文档、环境示例、OpenAPI 和迁移同步。

### 数据与安全

- [ ] 每个资源查询从一开始带 actor.coupleId。
- [ ] 作者、共同编辑、封存/揭晓/解锁规则在服务端。
- [ ] DTO 拒绝未知字段并限制长度、数组、时间和文件。
- [ ] 日志、事件、错误、通知和缓存不含秘密正文/令牌。
- [ ] 角色 header 只用于选择成员且不可被请求体覆盖；可重试命令幂等。
- [ ] 删除可恢复或明确二次确认；媒体引用/备份影响已考虑。

### 数据库/Worker

- [ ] migration 在空库和上一版本数据上验证。
- [ ] 状态/唯一约束尽量由数据库共同保证。
- [ ] Scheduled/Outbox 处理器可重复执行，进程崩溃后可恢复。
- [ ] 生产迁移前备份和回滚/前滚计划明确。

## 17. 阶段完成定义

一个阶段只有在以下全部满足时才可提交收口：

1. `product.md` 对应交付和验收场景可由真实运行证明；
2. 数据模型、迁移、API、Web 和 worker（若涉及）形成完整纵向能力；
3. 权限/隐私不变量有自动测试，两个空间越权测试通过；
4. build、typecheck、unit、integration、相关 E2E 通过；
5. 视觉状态、移动/桌面、dark、reduced motion 通过人工或视觉回归；
6. Compose/部署/健康/备份影响已验证；
7. 文档和示例配置更新，无真实秘密或真实私人内容；
8. `main` 的阶段提交可从干净 clone 按本指南启动。

“代码已写”“页面能打开”或“当前测试没有失败”均不足以单独证明阶段完成。

## 18. 常见问题

### Prisma Client 与 schema 不一致

```bash
pnpm db:generate
pnpm typecheck
```

若 migration 缺失，不使用 `db push` 掩盖；生成并提交 migration。

### Web 请求 `IDENTITY_REQUIRED`

确认本地已选择 boy 或 girl，并且请求发送完全匹配的 `X-Our-Tomorrow-Role`。不要伪造 `coupleId` 或把显示昵称当作角色值。切换角色后应清空 Vue Query 私密缓存并重新请求 `/identity/me`。

### CORS 在 Compose 不工作

生产优先通过 Caddy 同域访问，不直接暴露 API 端口。核对 `WEB_ORIGIN`、`PUBLIC_APP_URL`、`APP_SITE_ADDRESS` 和可信代理设置。

### Worker 没有触发

检查 worker 进程、数据库连接、ScheduledEvent 状态/runAt/锁、服务器时钟和日志 request/event ID。不要添加进程内 `setTimeout` 作为修复。

### 备份 healthy 但不确定可用

运行 `restic check` 并按 `restore-runbook.md` 做隔离恢复。健康检查只证明近期脚本成功，不证明 dump/媒体能被应用读取。
