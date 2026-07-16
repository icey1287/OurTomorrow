# OurTomorrow 技术架构

本文定义 OurTomorrow 的实现边界、依赖规则和运行拓扑。架构目标不是服务大量租户，而是在一台小型服务器上可靠保护两个人的长期私人数据，并允许阶段 0–6 持续演进。

## 1. 架构目标

按优先级排序：

1. **空间隔离永远由服务端保证**，不能信任客户端传来的 `coupleId`。
2. **内容不可轻易丢失**，数据库、媒体、计划任务和转换关系都可恢复。
3. **秘密按状态释放**，未揭晓日记、未展示便利贴和未解锁胶囊不会被 API 提前序列化。
4. **时间规则一致**，日历日期使用情侣空间时区，解锁与调度使用服务端时钟。
5. **保持模块化单体**，领域边界清楚，但不引入微服务的部署和一致性成本。
6. **移动端优先且同域部署**，降低 CORS、缓存、媒体和 WebSocket 的配置复杂度。

## 2. 系统上下文与运行拓扑

```text
浏览器 / PWA
       │ HTTPS；显式 X-Our-Tomorrow-Role
       ▼
     Caddy
       ├── /              → web (Vue 静态应用，Nginx)
       ├── /api/v1/*      → api (NestJS)
       └── /socket/*      → api (WebSocket，阶段 3)
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
         PostgreSQL      私有媒体卷/S3       worker
          业务与角色映射   图片与缩略图        持久计划任务
              │               │                │
              └───────────────┴────────────────┘
                              │
                         backup + Restic
```

生产环境由 `infra/compose.yaml` 管理 `caddy`、`web`、`api`、`worker`、`postgres`、`migrate` 和 `backup`。公网只开放 Caddy 的 80/443；PostgreSQL、worker 和备份服务只在内部 Docker 网络。阶段 0 使用私有 `media_data` 卷，未来可替换为外部 S3 兼容存储，但领域层不应依赖具体存储实现。

## 3. 仓库结构与职责

```text
apps/
  web/                    Vue 3 应用：路由、页面编排和交互状态
  api/                    NestJS 模块化单体、Prisma、API 与 worker 入口
packages/
  contracts/              跨应用共享的稳定基础类型；最终契约以 OpenAPI 为准
infra/
  compose.yaml            生产形态的本地可复现拓扑
  docker/                 API/Web 镜像
  backup/                 pg_dump + media 的 Restic 加密备份
docs/                     产品、品牌、API、安全、开发和恢复基线
```

`apps/api/src/main.ts` 是 HTTP 进程入口，统一前缀为 `/api/v1`；`apps/api/src/worker.ts` 是独立 worker 进程入口。两者共享数据库和领域代码，但不能依赖进程内内存互相通信。

## 4. 模块化单体的分层

每个业务模块遵循以下方向：

```text
Controller / Gateway
        ↓ DTO + fixed-role actor context
Application service / use case
        ↓ domain policy + transaction boundary
Repository (Prisma implementation)
        ↓
PostgreSQL / media adapter / outbox
```

约束：

- Controller 只处理协议映射，不直接拼装跨表权限查询。
- 应用服务接收可信的 `ActorContext { role, userId, coupleId, requestId }`；`role` 来自显式 header，服务端把它映射到固定 `userId/coupleId`，请求体不能覆盖。
- 领域状态迁移集中在策略或应用服务中，不允许多个 Controller 各自复制条件。
- Prisma 是基础设施实现，不把 Prisma 类型暴露给 Web 或公共契约。
- 一个模块可以读取自己拥有的表；跨模块写入通过对方应用服务或已定义事件进行。
- 领域模块不能依赖 Nest Controller、Express Request 或 Vue 类型。
- 跨域工作若要求原子一致性，使用单个数据库事务；不要求同步完成的副作用写入 Outbox。

## 5. 领域边界与数据所有权

| 边界                    | 所有模型/职责                                                                                  | 可依赖                                 | 首次交付阶段     |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------- |
| Fixed Identity          | `User`、`boy/girl` 映射、确定性初始化、角色 header 解析                                        | Audit                                  | 1                |
| Couple Space            | `Couple`、`CoupleMember`、昵称、时区、固定 slot 1/2                                            | Identity、Media（头像/封面引用）       | 1                |
| Remember                | `Memory`、`MemoryPerspective`、`Tag`、`MemoryTag`、`Place`、`Comment`、`Reaction`              | Couple、Media、Revision                | 2                |
| Daily                   | `CurrentStatus`、`Note`、`DailyPrompt`、`DailyEntry`、`MoodEntry`、`TouchEvent`、`DailyRitual` | Couple、Scheduler、Notification        | 3/6              |
| Tomorrow                | `Wish`、`WishUpdate`、`Plan`、`Anniversary`、`Capsule`、`CapsuleMessage`、`CapsuleOpenRecord`  | Couple、Media、Scheduler、Notification | 4                |
| Media                   | `MediaAsset`、`MemoryMedia`、`CapsuleMedia`，验证、重编码、缩略图、签名读取                    | Couple、Audit                          | 2/4              |
| Conversion              | 便利贴/愿望/胶囊/纪念日到回忆的幂等转换与来源追溯                                              | Daily、Tomorrow、Remember、Outbox      | 3/4              |
| Scheduling              | `ScheduledEvent`，任务认领、重试、到期状态迁移                                                 | 各领域公开的任务处理器                 | 0 起步，3/4 完整 |
| Notification & Realtime | `Notification`、站内消息、WebSocket 推送、隐私化通知摘要                                       | Outbox、Couple                         | 3                |
| Data Lifecycle          | 软删除、回收站、`ExportJob`、延迟媒体清理                                                      | 所有内容模块、Scheduler                | 5                |
| Platform Audit          | `OutboxEvent`、`AuditLog`、`ContentRevision`、请求 ID、健康检查                                | 无业务反向依赖                         | 0/5              |

P1/P2 的 `MemoryResurface`、`AnnualReview`、`CalmLetter` 等模型仍归属现有领域，不创建独立服务。

### 5.1 边界间协作示例

愿望转换为回忆时，Tomorrow 模块不直接创建任意 `Memory` 行。Conversion 用例在一个事务中：

1. 以 `wish.id + actor.coupleId` 锁定并读取愿望；
2. 验证状态为 `COMPLETED`；
3. 调用 Remember 的创建策略生成带来源的回忆；
4. 将愿望置为 `CONVERTED_TO_MEMORY` 并保存目标回忆 ID；
5. 写入 `OutboxEvent` 和审计记录；
6. 提交后由 worker 发送通知或刷新首页。

唯一约束或幂等键保证同一愿望只有一个转换结果。

## 6. 多租户隔离与数据不变量

虽然产品通常只有一个情侣空间，所有共享业务表仍显式携带或可无歧义关联 `coupleId`。任何资源读取都必须形成等价查询：

```ts
where: { id: resourceId, coupleId: actor.coupleId }
```

不能先按 `id` 查询，再在 Controller 中检查 `coupleId`；前者可能在错误、日志、关联加载或计时差异中泄露信息。

数据库和应用共同维护以下不变量：

- 默认情侣空间恰有两名有效成员：`boy/slot 1` 与 `girl/slot 2`；同一用户最多一个有效成员关系。
- 身份初始化使用确定性 ID 和幂等事务；并发、重复和服务重启不能创建第三人或第二个默认空间。
- 每位成员在情侣空间本地日期内最多一条 `DailyEntry` 和一条 `MoodEntry`。
- 每条 `MemoryPerspective` 的作者必须是该回忆所属空间成员，且 `(memoryId, authorId)` 唯一。
- 内容关联的媒体、标签、地点、评论和回应必须属于同一情侣空间。
- 已封存胶囊不可更新正文/附件；已揭晓日记正文不可更新。
- 转换来源到目标的唯一关系防止重试产生重复内容。
- 软删除内容默认从普通查询排除；回收站查询显式包含 `deletedAt`。

## 7. 时间模型

时间字段分为三类：

| 类型         | 存储                           | 示例                                              | 规则                                |
| ------------ | ------------------------------ | ------------------------------------------------- | ----------------------------------- |
| 瞬时点       | PostgreSQL `timestamptz` / UTC | `createdAt`、`shownAt`、`unlockAt`、`completedAt` | 比较和调度只使用服务端时钟          |
| 本地日历日期 | `date` + `Couple.timezone`     | 恋爱开始日、生日、日记日期                        | 不先转换为浏览器时区                |
| 周期规则     | 月/日或 recurrence 规则 + 时区 | 每年纪念日                                        | 每次生成下次 UTC 触发点，保留原规则 |

`happenedAt` 表示事情发生时间，`createdAt` 表示写入时间；两者不能互相替代。若用户只知道某天而不知道时刻，模型应保留日期精度或明确使用本地中午等规范化策略，不能伪装成精确时刻。

所有可测试的时间判断依赖 `Clock` 抽象。浏览器只负责展示格式；修改浏览器时间不能改变胶囊、便利贴、纪念日和日记状态。

## 8. 状态机与并发

服务端只接受显式动作，而不是允许客户端任意 PATCH `status`：

| 聚合     | 动作端点示例                               | 允许迁移                                                                    |
| -------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| 便利贴   | schedule / publish / mark-viewed / archive | `DRAFT → SCHEDULED → VISIBLE → VIEWED → ARCHIVED/EXPIRED`                   |
| 交换日记 | save-draft / submit / add-postscript       | `DRAFT/EDITING → SUBMITTED/WAITING_FOR_PARTNER → BOTH_SUBMITTED → REVEALED` |
| 愿望     | plan / start / complete / convert          | `IDEA → PLANNED → IN_PROGRESS → COMPLETED → CONVERTED_TO_MEMORY`            |
| 胶囊     | seal / confirm-open / open / convert       | `DRAFT → SEALED/LOCKED → DUE → UNLOCKED → OPENED → CONVERTED_TO_MEMORY`     |

应用服务在事务内读取当前状态并执行条件更新；受并发影响的更新使用版本号、条件 `updateMany` 或行锁语义。冲突返回 `409 STATE_CONFLICT`，而不是最后写入者静默覆盖。

共享可编辑内容（例如回忆公共部分）携带 `version` 或 `updatedAt` 条件。客户端更新时提交 `If-Match`/版本；版本不匹配返回 409 和最新摘要，避免一方覆盖另一方刚完成的编辑。

## 9. 持久化任务、Outbox 与幂等性

### 9.1 ScheduledEvent

所有跨请求的定时行为写入 `ScheduledEvent`：

```text
PENDING / RETRYING → RUNNING → COMPLETED
                      └─────→ RETRYING / FAILED / CANCELLED
```

记录至少包含 `coupleId`、类型、负载、`runAt`、状态、尝试次数、最后错误、锁定进程和锁定到期时间。worker 以小批量原子认领到期任务，处理器必须幂等；进程崩溃后超时锁可再次认领。阶段 0 的 worker 骨架只证明独立进程和持久表连接，阶段 3/4 才加入各领域处理器。

### 9.2 OutboxEvent

需要“业务提交后必然发生”的通知、实时刷新或派生任务，与业务变更在同一事务写入 Outbox。worker 发送后标记完成。WebSocket 只是一种投递方式，不是事实来源；断线后客户端通过 REST 重新同步。

### 9.3 幂等请求

上传完成、愿望转回忆、胶囊转回忆、导出创建等可重试命令支持 `Idempotency-Key`。服务端将键与用户、路由和规范化请求摘要绑定；相同键不同载荷返回冲突，相同载荷返回首次结果。

## 10. API 请求生命周期

```text
Caddy TLS / 外部私有访问边界 / 安全响应头
  → Nest request-id middleware
  → X-Our-Tomorrow-Role 解析与固定 actor 映射
  → DTO validation（白名单 + 禁止未知字段）
  → Couple scope / author / secret-state policy
  → Application use case + transaction
  → response DTO（按状态裁剪秘密字段）
  → audit/outbox（需要时）
```

异常统一携带 `requestId`。日志只记录操作元数据，不记录正文、媒体字节、部署/存储秘密或签名媒体 URL。详细协议见 `api.md`，威胁与控制见 `security.md`。

## 11. 媒体架构

媒体适配器提供 `putQuarantined`、`promotePrivate`、`openAuthorized`、`deleteDeferred` 等能力。无论使用本地私有卷还是 S3，都执行相同流程：

```text
创建上传意图
  → 限额上传到 quarantine
  → 检测真实 MIME/尺寸/解码完整性
  → 图片重新编码并去除 EXIF（尤其定位）
  → 生成缩略图
  → 创建 MediaAsset
  → 在同空间内绑定业务内容
  → 延迟清理未绑定或已永久删除对象
```

V1 可由 API 接收上传或签发一次性上传凭证；读取始终先鉴权，再由 API 流式返回或生成短时签名 URL。数据库只保存不含秘密的存储键，不保存永久公开 URL。原图和缩略图分别校验并纳入备份。

## 12. Web 架构

Web 采用 Vue 3、Vue Router、Pinia、TanStack Vue Query 和 Tailwind CSS：

- `app/`：应用启动、QueryClient、错误边界、主题和本地角色恢复；
- `router/`：未选择角色/已选择角色守卫；`/identity`、停用的 `/join`/`/onboarding` 重定向到 `/login`；
- `features/<domain>/`：页面、领域组件、请求 hooks 和表单 schema；
- `shared/api/`：OpenAPI 生成客户端、角色 header、请求 ID 处理；
- `shared/components/`：实现 `brand.md` 的基础组件；
- `shared/utils/`：纯函数，不包含业务状态机。

Pinia 保存短期 UI 状态，不复制服务器实体缓存；服务器数据由 Vue Query 管理。`localStorage` 只保存 `our-tomorrow-role=boy|girl`。查询键必须包含当前角色/空间语义，切换或清除角色时清空私密缓存和 object URL。响应中的秘密字段缺失被视为协议设计，而不是由 CSS 隐藏。

页面按路由懒加载；图片使用尺寸占位和懒加载。实时消息只触发精确查询失效或更新通知计数，不把 WebSocket 当作永久数据仓库。

## 13. 可观测性与健康检查

- `/api/v1/health/live` 仅证明 API 进程存活，不访问依赖。
- `/api/v1/health/ready` 检查 PostgreSQL，供 Compose/Caddy 判断是否接流量。
- Web `/healthz` 证明静态服务器可响应。
- backup 容器健康检查验证最近成功时间不超过阈值。
- 每个 HTTP 响应包含 `x-request-id`，异常体也返回同一 ID。
- 结构化日志包含时间、级别、服务、版本、请求 ID、路由模板、状态码和耗时；不包含正文或认证秘密。
- 阶段 3/4 增加 scheduled/outbox 待处理数、最老任务延迟和失败次数；阶段 5 为备份年龄、恢复结果和存储余量设置告警。

## 14. 部署、迁移与回滚

发布顺序固定为：

1. 生成发布镜像并运行测试；
2. 创建迁移前数据库与媒体备份；
3. 执行 `migrate` 一次性服务；
4. 启动/替换 API 与 worker，等待 readiness；
5. 启动 Web，再由 Caddy 接流量；
6. 分别选择 boy/girl 运行双角色冒烟，并确认进入同一空间；
7. 记录镜像标签、迁移版本和备份快照 ID。

数据库迁移采用 expand/contract：先增加向后兼容结构，再部署读写新结构，最后在后续发布删除旧结构。不能依赖把数据库回滚到旧 schema 来撤销已经写入的新数据。恢复流程见 `restore-runbook.md`。

## 15. 阶段演进与架构门槛

| 阶段 | 架构增量                                                                   | 不允许留下的临时方案                             |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| 0    | monorepo、设计系统、Prisma 基线、OpenAPI 骨架、Compose、worker/backup 骨架 | 内存数据库、内存计时器、公开媒体目录             |
| 1    | 固定 boy/girl、幂等共同空间初始化、显式角色上下文、路由守卫                | 把 role 伪装成认证、在 localStorage 保存私人实体 |
| 2    | Remember/Media、游标分页、并发版本、内容修订                               | 仅扩展名文件校验、按资源 ID 裸查询               |
| 3    | Daily、ScheduledEvent 处理器、Outbox、通知/实时                            | 前端定时解锁、提交后返回对方日记正文             |
| 4    | Tomorrow、纪念日时区规则、幂等转换                                         | 任意 PATCH 状态、浏览器时间决定胶囊状态          |
| 5    | 回收站、导出、生产安全、恢复证据、迁移演练                                 | 只验证“备份命令成功”、不可读的专有导出           |
| 6    | 地图/盲盒/回顾/PWA 等增强                                                  | 持续定位、关系评分、第三方默认追踪               |

## 16. 架构决策摘要

1. **模块化单体而非微服务**：规模小，强事务和低运维成本更重要。
2. **REST + OpenAPI 为事实契约**：WebSocket 只做提示；共享手写类型不能取代生成契约。
3. **固定本地身份而非成员认证系统**：Web 只记住 boy/girl，API 显式映射确定性成员；私有部署入口由外部网络/设备边界保护。
4. **PostgreSQL 保存业务、固定角色映射、计划任务和 Outbox**：重启后状态完整，事务边界清晰。
5. **私有媒体适配器**：先本地卷，保持可迁移到 S3；任何实现都必须执行角色、空间和业务可见性检查并纳入备份。
6. **服务端 Clock + 情侣空间时区**：保证日记、纪念日、胶囊和定时便利贴一致。
7. **软删除 + 延迟物理清理**：给回收站、撤销和备份恢复留窗口。
8. **同域部署**：缩小 CORS、媒体与实时连接配置面；开发跨端口仅用于本地环境。
