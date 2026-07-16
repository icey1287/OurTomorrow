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

需要虚构的双账户开发数据时，seed 要求显式确认和临时密码环境变量：

```bash
read -rs "SEED_PASSWORD?Development seed password: "
echo
export SEED_PASSWORD
pnpm --filter @our-tomorrow/api exec prisma db seed -- --confirm-development-seed
unset SEED_PASSWORD
```

默认地址：

- Web：<http://localhost:5173>
- API：<http://localhost:3000/api/v1>
- OpenAPI UI：<http://localhost:3000/api/v1/docs>
- OpenAPI JSON：<http://localhost:3000/api/v1/openapi.json>

根 `pnpm dev` 并行启动 Web 和 API；持久化任务需要另开终端：

```bash
pnpm --filter @our-tomorrow/api dev:worker
```

阶段 1 前首次用户通过受控 CLI 创建，不存在公共注册：

```bash
read -rs "BOOTSTRAP_INPUT?Bootstrap token: "
echo
read -rs "INITIAL_PASSWORD?Initial account password: "
echo
printf '%s' "$INITIAL_PASSWORD" | pnpm --filter @our-tomorrow/api bootstrap -- \
  --token "$BOOTSTRAP_INPUT" \
  --username ming \
  --display-name '甲' \
  --password-stdin
unset BOOTSTRAP_INPUT INITIAL_PASSWORD
```

bootstrap 拒绝命令行 `--password`，只接受 `--password-stdin` 或命名的大写 `--password-env`，并验证 `apps/api/.env` 中的 `BOOTSTRAP_TOKEN`。令牌和密码均不应以字面量进入 shell history；示例令牌不可用于生产。数据库已有首个账户后 bootstrap 会永久拒绝再次创建。

### 2.1 分别启动应用

```bash
pnpm --filter @our-tomorrow/api dev
pnpm --filter @our-tomorrow/api dev:worker
pnpm --filter @our-tomorrow/web dev
```

Vite 把 `/api` 代理到 `VITE_DEV_API_TARGET`，默认 `http://localhost:3000`。开发仍应使用相对 `/api/v1`，不要在组件中硬编码主机名。

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

| 变量                      | 作用                        | 本地提示                | 生产要求                          |
| ------------------------- | --------------------------- | ----------------------- | --------------------------------- |
| `NODE_ENV`                | development/test/production | `development`           | `production`                      |
| `API_PORT`                | Nest 端口                   | `3000`                  | 容器内 3000                       |
| `DATABASE_URL`            | Prisma PostgreSQL URL       | localhost Compose DB    | URL encode 密码；不公开数据库端口 |
| `WEB_ORIGIN`              | 唯一允许的 Web Origin       | `http://localhost:5173` | 与实际 HTTPS 同源一致             |
| `PUBLIC_APP_URL`          | 邀请等绝对 URL 基址         | Web 地址                | HTTPS 正式域名                    |
| `SESSION_COOKIE_NAME`     | Session Cookie 名           | 默认值即可              | host-only；变更需会话迁移计划     |
| `SESSION_COOKIE_SECURE`   | 是否只经 HTTPS 发送         | 本地 `false`            | 必须 `true`                       |
| `SESSION_TTL_DAYS`        | Session 绝对期限            | 默认 30                 | 按安全策略配置                    |
| `CSRF_COOKIE_NAME`        | CSRF 相关名称               | 默认值                  | 与实现一致；令牌不得日志化        |
| `BOOTSTRAP_TOKEN`         | 首位用户引导秘密            | 至少 32 字符随机值      | 使用后移除/轮换                   |
| `MEDIA_STORAGE_PATH`      | 私有媒体根目录              | `./storage`             | 独立持久卷，不能由 Web 静态暴露   |
| `MEDIA_MAX_BYTES`         | 单文件上限                  | 默认 15 MiB             | 同时限制像素/解码资源             |
| `WORKER_POLL_INTERVAL_MS` | Worker 轮询间隔             | 默认 2000               | 结合任务延迟监控                  |
| `WORKER_BATCH_SIZE`       | 每次认领量                  | 默认 20                 | 不超过 100                        |
| `TRUST_PROXY`             | 信任反代头                  | 直连 API 时 false       | 仅在已知 Caddy 拓扑下 true        |
| `APP_VERSION`             | 健康/日志版本               | `0.1.0`                 | 设置为镜像或发布版本              |
| `TZ`                      | 进程/备份默认时区           | `Asia/Shanghai`         | 业务日历仍以 Couple.timezone 为准 |

Compose 额外需要 PostgreSQL、Restic/S3、端口和镜像 tag 变量，见 `infra/.env.example`。Web 的 `VITE_*` 会进入浏览器包，绝不放秘密。
备份容器使用不含 Prisma 专用 `?schema=` 参数的 `BACKUP_DATABASE_URL`；它与应用的 `DATABASE_URL` 指向同一数据库，但必须保持为 libpq/`pg_dump` 可识别的连接串。

## 4. 常用命令

| 命令                | 作用                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | 并行启动 Web 与 API 开发进程                                         |
| `pnpm build`        | 构建所有 workspace                                                   |
| `pnpm test`         | 运行各 workspace 测试                                                |
| `pnpm test:unit`    | 单元测试基线                                                         |
| `pnpm test:e2e`     | Playwright 双账户端到端测试                                          |
| `pnpm lint`         | 当前以严格 TypeScript/Vue 检查为基础                                 |
| `pnpm typecheck`    | 全 workspace 类型检查                                                |
| `pnpm format`       | Prettier 写入格式                                                    |
| `pnpm format:check` | CI 格式验证                                                          |
| `pnpm db:generate`  | 生成 Prisma Client                                                   |
| `pnpm db:migrate`   | 本地创建/应用 Prisma migration                                       |
| `pnpm db:seed`      | 调用 Prisma seed；仍需传入确认参数和 `SEED_PASSWORD`，见首次启动示例 |
| `pnpm db:studio`    | 本地数据库检查；禁止直接改生产                                       |

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
5. 运行双账户、越权、重启/重试和视觉状态验证；
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

另以 `NODE_ENV=development`、临时 `SEED_PASSWORD` 和 `--confirm-development-seed` 单独验证 seed 可重复执行；CI/生产不得隐式运行开发 seed。

还需人工检查 320 px、桌面、深色和减少动效的基础页面。

### 阶段 1：认证与双人空间

测试至少覆盖：登录/退出/Session 轮换与撤销、CSRF、空间创建、邀请码摘要/过期/重放/并发、第三人拒绝、三态路由守卫、所有资源空间隔离。

### 阶段 2：记录

先完成一条完整路径：创建回忆 → 上传私有图片 → A 视角 → B 视角 → 时间线找回。随后添加标签、地点、评论、回应和随机回忆。媒体测试必须含 MIME 欺骗、EXIF 清理、跨空间读取和删除保留期。

### 阶段 3：日常

使用可控 Clock 和真实 PostgreSQL 测定时便利贴与状态过期。交换日记的两个用户并发提交测试必须证明提交前没有任何端点/事件泄露对方答案。worker 重启后任务继续。

### 阶段 4：明天

状态迁移使用动作端点而非任意 PATCH。愿望和胶囊转回忆以 Idempotency-Key/唯一约束保证一次。测试情侣空间时区、闰日、浏览器时间篡改、共同胶囊确认和 overdue worker。

### 阶段 5：安全与上线

完成权限矩阵、回收站、导出、生产 Cookie/CSP/TLS、日志脱敏、备份监控和完整恢复演练。把 `restore-runbook.md` 的实际证据（不含秘密/正文）存入受控运维记录。

### 阶段 6：浪漫增强

逐项纵向实现抱抱、盲盒、足迹、第一次、冷静信箱、未来地图、年度回忆书和 PWA。每项评审“无评分/无持续定位/无默认追踪/可关闭/减少动效/离线缓存不泄密”。

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

Seed 必须可重复运行且只生成虚构内容。不要把真实两人姓名、照片、日记、密码或生产 ID 放入仓库。测试账户凭据只用于本地/CI，并在 production 环境拒绝执行 seed。

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
- 写请求验证 CSRF；跨时间转换/上传完成/导出支持幂等键；
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
- Pinia 管 Session、主题和短期 UI 状态；
- 不把完整 API 数据复制到 Pinia；
- 退出/Session 失效时清空所有私密 Query cache 和 object URL；
- WebSocket 事件使精确查询失效，再通过 REST 读取事实。

### 11.2 路由

路由使用 `guestOnly`、`requiresAuth`、`requiresCouple` 元信息实现三态守卫：anonymous、authenticated-unbound、authenticated-bound。守卫只改善体验，API 授权仍是安全边界。

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
- 跨空间和未登录读取；
- 未解锁胶囊附件；
- 删除、回收站恢复和延迟清理。

存储通过 adapter 接口访问，业务代码不拼接磁盘路径或 S3 URL。测试使用临时目录并在测试结束清理。

## 14. 测试策略

### 14.1 单元测试

纯函数/策略：在一起天数、纪念日、时区、状态迁移、胶囊解锁、日记揭晓、权限、随机回忆去重、导出 manifest。单元测试不依赖真实网络或系统时钟。

### 14.2 集成测试

使用 PostgreSQL 16 和真实 Prisma migration，验证唯一约束、事务、并发、跨空间查询、Session、ScheduledEvent/Outbox、媒体适配器和导出。每个安全测试至少建立空间 A/B，避免仅测试单空间“看起来正确”。

### 14.3 E2E

Playwright 使用两个测试账户：

```text
A 创建空间 → B 接受邀请
→ A 创建回忆/上传图片 → B 补视角
→ 双方提交交换日记并同时揭晓
→ 创建未到期胶囊，确认 API/UI 不泄露
→ 愿望完成并转回忆
→ 首页双方看到结果
```

E2E 同时覆盖 320 px 移动视口、桌面、深色、键盘关键路径和减少动效。不要只依赖截图；对权限和状态查询 API/DOM 语义断言。

### 14.4 恢复测试

备份和恢复是产品测试，不是可选运维。按 `restore-runbook.md` 恢复数据库/媒体、登录并抽查内容，记录实际 RPO/RTO。

## 15. CI

`.github/workflows/ci.yml` 当前包含：

1. pnpm frozen install；
2. Prettier、lint、typecheck、unit test、workspace build；
3. PostgreSQL 16 上生成 Prisma Client、应用 migrations 和 API 测试；
4. Compose model、Caddy 配置和 API/Web/backup 镜像构建。

后续阶段加入：OpenAPI drift、授权集成、双账户 Playwright、媒体恶意样本、依赖/镜像扫描和恢复演练状态检查。CI 日志不得输出 `.env`、数据库 URL 密码、Cookie、测试日记正文或导出包。

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
- [ ] 写请求 CSRF；高风险命令近期认证；可重试命令幂等。
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

### Web 请求 401/CSRF 错误

确认 API/Web Origin 与端口、Cookie Secure（本地 HTTP 应 false）、`credentials`、Session 是否过期，以及写请求是否携带当前 Session 的 CSRF token。不要通过关闭 CSRF 解决。

### CORS 或 Cookie 在 Compose 不工作

生产优先通过 Caddy 同域访问，不直接暴露 API 端口。核对 `WEB_ORIGIN`、`PUBLIC_APP_URL`、`APP_SITE_ADDRESS` 和可信代理设置。

### Worker 没有触发

检查 worker 进程、数据库连接、ScheduledEvent 状态/runAt/锁、服务器时钟和日志 request/event ID。不要添加进程内 `setTimeout` 作为修复。

### 备份 healthy 但不确定可用

运行 `restic check` 并按 `restore-runbook.md` 做隔离恢复。健康检查只证明近期脚本成功，不证明 dump/媒体能被应用读取。
