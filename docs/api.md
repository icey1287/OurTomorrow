# OurTomorrow API 契约

本文定义阶段 0–6 的目标 HTTP 契约。阶段标签表示端点首次必须可用的阶段；尚未实现的端点仍是后续实现的约束。运行中的 OpenAPI 文档位于 `/api/v1/docs`，机器可读文档位于 `/api/v1/openapi.json`。实现与本文冲突时，应在同一提交中更新 OpenAPI、共享契约、测试和本文。

## 1. 协议约定

### 1.1 基础路径与格式

- API 前缀：`/api/v1`
- 媒体类型：`application/json; charset=utf-8`
- 字段命名：JSON 使用 `camelCase`，数据库命名不外泄。
- ID：不透明字符串；客户端不能推断类型、顺序或情侣空间。
- 瞬时时间：ISO 8601 UTC，例如 `2026-07-16T08:30:00.000Z`。
- 本地日期：`YYYY-MM-DD`，按情侣空间 IANA 时区解释。
- 空值：字段适用但无值时返回 `null`；出于保密规则不可见的字段应**省略**，不能返回可推测长度的占位值。
- 金额、连续定位等当前产品没有的字段不得提前加入通用模型。

生产环境 Web 与 API 同域；开发环境允许 `WEB_ORIGIN` 指定的单一来源并携带 Cookie。除健康检查和登录所需端点外，响应包含 `Cache-Control: private, no-store`。

### 1.2 请求 ID

客户端可以发送合法的 `X-Request-Id`（8–128 位字母、数字、`.`、`_`、`:`、`-`）；否则服务端生成 UUID。响应头和错误体均返回该 ID。

### 1.3 认证与 CSRF

登录成功后服务端设置服务器 Session Cookie：

```http
Set-Cookie: our_tomorrow_session=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/
```

本地 HTTP 开发可关闭 `Secure`，生产必须开启。客户端不得把 Session 或长期令牌复制到 `localStorage`。

所有会改变状态的 Cookie 认证请求（`POST`、`PUT`、`PATCH`、`DELETE`）必须同时发送：

```http
X-CSRF-Token: <token returned by login or /auth/me>
```

CSRF 令牌与 Session 绑定，Session 轮换后旧令牌失效。跨来源、缺失、错误或过期令牌返回 `403 CSRF_INVALID`。

### 1.4 Actor 与空间上下文

客户端请求体和查询参数不接受授权用途的 `coupleId`。服务端从 Session 得到：

```ts
type ActorContext = {
  userId: string;
  coupleId: string | null;
  requestId: string;
};
```

需要绑定的端点在 `coupleId=null` 时返回 `409 COUPLE_REQUIRED`。资源不存在和资源属于其他空间统一返回 `404 RESOURCE_NOT_FOUND`，不泄露跨空间存在性。

## 2. 响应、错误与并发

### 2.1 成功响应

单资源直接返回资源对象；创建返回 `201` 和资源；无响应体的成功操作返回 `204`。不额外包裹固定 `data` 层。

分页列表使用：

```json
{
  "items": [],
  "meta": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

默认 `limit=20`，最大 `limit=100`。`cursor` 是不透明、带查询上下文的游标；改变排序或筛选条件后不能复用。内容流默认采用稳定的 `(业务时间, id)` 排序，禁止 offset 分页导致重复/遗漏。

### 2.2 标准错误

```json
{
  "statusCode": 422,
  "code": "STATE_TRANSITION_INVALID",
  "message": "The wish cannot be completed from its current state.",
  "requestId": "01J...",
  "timestamp": "2026-07-16T08:30:00.000Z",
  "path": "/api/v1/wishes/w_123/complete",
  "details": {
    "currentStatus": ["PLANNED"],
    "allowedStatuses": ["IN_PROGRESS"]
  }
}
```

稳定错误码至少包括：

| HTTP | code                       | 含义                                       |
| ---- | -------------------------- | ------------------------------------------ |
| 400  | `VALIDATION_FAILED`        | DTO 格式错误、未知字段或无效游标           |
| 401  | `AUTH_REQUIRED`            | 未登录、Session 无效或已撤销               |
| 401  | `LOGIN_FAILED`             | 用户名或密码错误；不区分账号是否存在       |
| 403  | `CSRF_INVALID`             | 写请求 CSRF 校验失败                       |
| 403  | `ACTION_FORBIDDEN`         | 已确认资源同空间但作者/状态规则禁止动作    |
| 404  | `RESOURCE_NOT_FOUND`       | 资源不存在或不属于当前空间                 |
| 409  | `COUPLE_REQUIRED`          | 当前账户尚未绑定空间                       |
| 409  | `COUPLE_FULL`              | 邀请接受时空间已有两名成员                 |
| 409  | `INVITATION_INVALID`       | 邀请过期、已用、错误或不可接受；不细分原因 |
| 409  | `STATE_CONFLICT`           | 并发版本冲突或条件更新失败                 |
| 409  | `IDEMPOTENCY_CONFLICT`     | 同一幂等键被不同请求载荷复用               |
| 422  | `STATE_TRANSITION_INVALID` | 业务状态不允许该动作                       |
| 423  | `CONTENT_LOCKED`           | 日记已揭晓或胶囊已封存，正文不可编辑       |
| 429  | `RATE_LIMITED`             | 登录、邀请、触摸信号或上传超限             |
| 500  | `INTERNAL_ERROR`           | 未预期错误；不返回堆栈或内部 SQL           |
| 503  | `DEPENDENCY_UNAVAILABLE`   | 数据库或存储暂不可用                       |

`details` 只包含安全的结构化提示。秘密内容、资源所有者、邀请码状态或其他空间标识不得出现在错误详情中。

### 2.3 乐观并发

共享可编辑资源返回 `version`（从 1 递增）和 ETag：

```http
ETag: "memory:m_123:7"
```

更新时发送 `If-Match`。缺失前置条件可返回 `428 PRECONDITION_REQUIRED`，版本不匹配返回 `409 STATE_CONFLICT`。个人草稿可由服务端按业务需要使用相同机制。

### 2.4 幂等命令

以下命令要求 `Idempotency-Key`：上传完成、愿望转回忆、胶囊转回忆、便利贴转换和导出创建。键在当前用户和路由范围内至少保留 24 小时。相同键和相同载荷返回首次状态码与结果。

## 3. 公共模型

### 3.1 AuthSession

```json
{
  "user": {
    "id": "usr_...",
    "username": "ming",
    "displayName": "甲",
    "nicknameInRelationship": "甲",
    "avatarUrl": null
  },
  "couple": {
    "id": "cpl_...",
    "name": "我们的明天",
    "startDate": "2023-09-17",
    "timezone": "Asia/Shanghai",
    "signature": "今天也一起认真生活。",
    "theme": "system",
    "members": []
  },
  "csrfToken": "<session-bound token>"
}
```

未绑定时 `couple` 为 `null`。`avatarUrl`、封面和媒体 URL 都是短时授权地址或同域鉴权端点。

### 3.2 内容来源

所有跨时间转换结果返回：

```ts
type SourceReference = {
  type: "NOTE" | "WISH" | "CAPSULE" | "ANNIVERSARY" | "STATUS";
  id: string;
  convertedAt: string;
  convertedBy: string;
};
```

来源被软删除后仍保留不可用于直接读取正文的审计引用。

### 3.3 审计元数据

普通资源可返回 `createdAt`、`updatedAt`、`createdBy`、`version`。不得向客户端返回密码摘要、Session ID/摘要、邀请码摘要、内部存储键、worker 负载、Outbox 内容或内部审计 IP 原值。

### 3.4 核心状态枚举

数据库、OpenAPI、`packages/contracts` 和 Web 映射必须使用同一组稳定值：

| 聚合           | 枚举值                                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| Note           | `DRAFT`, `SCHEDULED`, `VISIBLE`, `VIEWED`, `ARCHIVED`, `EXPIRED`                     |
| DailyEntry     | `DRAFT`, `EDITING`, `SUBMITTED`, `WAITING_FOR_PARTNER`, `BOTH_SUBMITTED`, `REVEALED` |
| Wish           | `IDEA`, `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CONVERTED_TO_MEMORY`                 |
| Capsule        | `DRAFT`, `SEALED`, `LOCKED`, `DUE`, `UNLOCKED`, `OPENED`, `CONVERTED_TO_MEMORY`      |
| ScheduledEvent | `PENDING`, `RUNNING`, `RETRYING`, `COMPLETED`, `FAILED`, `CANCELLED`                 |

枚举是协议的一部分，不得为了前端显示方便缩写或另造同义值。中文标签在 UI 层映射。

## 4. 阶段 0：平台端点

| 方法 | 路径            | 认证 | 响应                      | 说明                                    |
| ---- | --------------- | ---- | ------------------------- | --------------------------------------- |
| GET  | `/health/live`  | 否   | `200 LiveHealth`          | 仅进程存活，不访问依赖                  |
| GET  | `/health/ready` | 否   | `200 ReadyHealth` / `503` | 检查 PostgreSQL；依赖异常时必须是非 2xx |

```ts
type LiveHealth = {
  status: "ok";
  version: string;
  timestamp: string;
};

type ReadyHealth = {
  status: "ok" | "error";
  version: string;
  timestamp: string;
  database: "up" | "down";
};
```

首位用户通过受控 CLI/部署流程使用 `BOOTSTRAP_TOKEN` 创建，不提供公网 `/register` 或 bootstrap HTTP 端点。

## 5. 阶段 1：认证、绑定与资料

### 5.1 认证

| 方法   | 路径                 | 请求                     | 响应                               |
| ------ | -------------------- | ------------------------ | ---------------------------------- |
| POST   | `/auth/login`        | `{ username, password }` | `200 AuthSession` + Session Cookie |
| POST   | `/auth/logout`       | 无                       | `204` + 清除 Cookie                |
| GET    | `/auth/me`           | 无                       | `200 AuthSession`                  |
| DELETE | `/auth/sessions/:id` | 无                       | `204`；撤销自己的其他会话          |
| GET    | `/auth/sessions`     | 无                       | 当前用户会话摘要列表，不返回令牌   |

登录成功必须轮换 Session；失败响应和耗时尽量不区分用户名不存在与密码错误。连续失败受 IP 与规范化账号双重限流。

### 5.2 情侣空间和邀请

| 方法   | 路径                          | 请求/查询                                                     | 响应                   |
| ------ | ----------------------------- | ------------------------------------------------------------- | ---------------------- |
| POST   | `/couples`                    | `{ name, startDate, timezone, myNickname, partnerNickname? }` | `201 CoupleSummary`    |
| GET    | `/couples/current`            | 无                                                            | `200 CoupleSummary`    |
| PATCH  | `/couples/current`            | `If-Match`; 名称、日期、时区、签名、主题等                    | `200 CoupleSummary`    |
| POST   | `/couples/invitations`        | `{ expiresInMinutes? }`                                       | `201 InvitationSecret` |
| POST   | `/couples/invitations/accept` | `{ code }`                                                    | `200 CoupleSummary`    |
| DELETE | `/couples/invitations/:id`    | 无                                                            | `204`；撤销未使用邀请  |

`InvitationSecret` 的明文 `code` 和 `inviteUrl` 只在创建响应返回一次：

```json
{
  "id": "inv_...",
  "code": "....",
  "inviteUrl": "https://example.com/onboarding?invite=...",
  "expiresAt": "2026-07-16T09:00:00.000Z"
}
```

邀请码消费在事务内检查空间容量并标记 `usedAt`。失败统一返回 `INVITATION_INVALID` 或已明确登录到目标空间时的 `COUPLE_FULL`，不返回创建者资料。

### 5.3 个人设置

| 方法  | 路径                    | 说明                                       |
| ----- | ----------------------- | ------------------------------------------ |
| PATCH | `/users/me`             | 修改 `displayName`、关系昵称、头像引用     |
| PATCH | `/settings/preferences` | 主题、减少动态效果、隐私通知、自动锁定偏好 |
| GET   | `/settings/preferences` | 获取当前成员偏好与空间级设置               |

空间级时区、关系日期由 `/couples/current` 修改；个人减少动效等不应覆盖对方偏好。

## 6. 今日聚合

| 方法 | 路径                      | 阶段             | 说明                             |
| ---- | ------------------------- | ---------------- | -------------------------------- |
| GET  | `/today`                  | 1 起，逐阶段扩展 | 一次返回首页所需的少量聚合数据   |
| GET  | `/today/random-memory`    | 2                | 获取一条去重后的随机回忆摘要     |
| GET  | `/today/upcoming?days=30` | 4                | 返回纪念日、计划和胶囊的安全摘要 |

`GET /today` 返回稳定顶层字段；未交付模块或无内容时为 `null`，但保密内容字段仍应省略：

```json
{
  "relationship": {
    "startDate": "2023-09-17",
    "daysTogether": 1035,
    "today": "2026-07-16",
    "timezone": "Asia/Shanghai",
    "signature": "今天也一起认真生活。",
    "members": []
  },
  "partnerStatus": null,
  "latestNote": null,
  "dailyEntryStatus": null,
  "nextAnniversary": null,
  "randomMemory": null,
  "activeWish": null,
  "generatedAt": "2026-07-16T08:30:00.000Z"
}
```

`daysTogether` 与 `today` 由服务端按情侣空间时区计算。聚合端点不返回完整回忆正文、胶囊正文或未揭晓日记答案。

## 7. 阶段 2：记录

### 7.1 回忆

| 方法   | 路径                                | 说明                                                                                         |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/memories`                         | 游标分页；筛选 `year`、`month`、`tagId`、`placeId`、`firstTime`、`perspectiveState`、`query` |
| POST   | `/memories`                         | 创建共享回忆；可引用同空间已完成上传的媒体                                                   |
| GET    | `/memories/:id`                     | 返回共享内容、双方视角可见状态、评论和媒体                                                   |
| PATCH  | `/memories/:id`                     | 更新共享字段；要求 `If-Match`，写入内容修订                                                  |
| DELETE | `/memories/:id`                     | 软删除进入回收站；默认 `204`                                                                 |
| PUT    | `/memories/:id/perspective`         | 创建或更新**当前用户**视角                                                                   |
| POST   | `/memories/:id/perspective/submit`  | 提交当前用户视角                                                                             |
| POST   | `/memories/:id/comments`            | 新增评论                                                                                     |
| DELETE | `/memories/:id/comments/:commentId` | 作者删除评论（软删除）                                                                       |
| PUT    | `/memories/:id/reactions/:emoji`    | 当前用户幂等设置回应                                                                         |
| DELETE | `/memories/:id/reactions/:emoji`    | 移除当前用户回应                                                                             |
| POST   | `/memories/:id/media`               | 绑定已上传媒体并指定顺序/封面                                                                |
| DELETE | `/memories/:id/media/:mediaId`      | 解除绑定；不立即物理删除对象                                                                 |
| GET    | `/memories/:id/revisions`           | 共享字段的安全修改历史                                                                       |

创建请求示例：

```json
{
  "title": "第一次一起看海",
  "content": "傍晚风很大。",
  "happenedAt": "2024-01-01T10:30:00.000Z",
  "placeId": "plc_...",
  "isFirstTime": true,
  "tagIds": ["tag_trip"],
  "mediaIds": ["med_..."]
}
```

回忆详情中的视角只含两名成员的摘要。当前用户只能 PUT 自己的视角；请求体不接受 `authorId`。

### 7.2 标签与地点

| 方法         | 路径          | 说明                           |
| ------------ | ------------- | ------------------------------ |
| GET/POST     | `/tags`       | 获取/创建空间内标签            |
| PATCH/DELETE | `/tags/:id`   | 重命名或软删除；删除不删除回忆 |
| GET/POST     | `/places`     | 获取/创建用户主动提供的地点    |
| PATCH/DELETE | `/places/:id` | 更新或软删除地点               |

地点的经纬度可选；API 不接收持续位置轨迹。阶段 6 的地图仍复用这些显式地点。

### 7.3 随机回忆

`GET /today/random-memory` 只返回卡片摘要，并记录当前空间最近展示历史。可接受 `excludeId` 作为用户主动换一条的提示，但服务端仍执行去重和安全筛选。

## 8. 媒体上传与读取

| 方法   | 路径                   | 阶段 | 说明                                                         |
| ------ | ---------------------- | ---- | ------------------------------------------------------------ |
| POST   | `/uploads/presign`     | 2    | 创建短时上传意图；请求声明文件名、大小和 MIME                |
| POST   | `/uploads/complete`    | 2    | 校验实际对象、重编码、去 EXIF、生成缩略图并登记 `MediaAsset` |
| GET    | `/media/:id`           | 2    | 鉴权后流式读取或 302 到短时签名 URL                          |
| GET    | `/media/:id/thumbnail` | 2    | 鉴权缩略图                                                   |
| DELETE | `/media/:id`           | 2    | 标记删除；仍被内容引用时返回冲突或只解除指定关系             |

`/uploads/complete` 要求 `Idempotency-Key`。客户端声明 MIME 只用于早期提示，完成端点必须验证真实格式、像素、大小和解码完整性。响应只返回授权 URL，不返回 `storageKey`。

若阶段 2 的本地存储不支持浏览器直传，`presign` 可返回同域一次性上传 URL；外部契约不因存储后端改变。

## 9. 阶段 3：日常

### 9.1 此刻状态

| 方法   | 路径                               | 说明                                           |
| ------ | ---------------------------------- | ---------------------------------------------- |
| GET    | `/statuses/current`                | 返回双方状态；对方仅返回仍有效且允许共享的状态 |
| PUT    | `/statuses/me`                     | 设置/替换当前用户状态，含 `expiresAt`          |
| DELETE | `/statuses/me`                     | 提前结束当前状态                               |
| POST   | `/statuses/me/convert-to-fragment` | 阶段 6；显式保存为日常碎片                     |

服务端拒绝早于当前时间的失效时间，或直接将其视为结束；过期判断不采用浏览器时间。

### 9.2 便利贴

| 方法   | 路径                     | 说明                                                             |
| ------ | ------------------------ | ---------------------------------------------------------------- |
| GET    | `/notes`                 | 可按 `status`、`type`、`before` 查询；接收方看不到计划显示前正文 |
| POST   | `/notes`                 | 创建草稿、立即显示或定时显示便利贴                               |
| GET    | `/notes/:id`             | 按作者、接收方和状态裁剪字段                                     |
| PATCH  | `/notes/:id`             | 仅作者且未到不可编辑状态；要求版本                               |
| DELETE | `/notes/:id`             | 软删除/归档                                                      |
| POST   | `/notes/:id/mark-viewed` | 接收方幂等标记已查看                                             |
| PUT    | `/notes/:id/reaction`    | 接收方设置一个表情回应                                           |
| POST   | `/notes/:id/convert`     | 转换到 `WISH`、`ANNIVERSARY` 或 `MEMORY`                         |

计划显示前，接收方列表项最多返回 `{ id, status: "SCHEDULED", showAt }`；不能返回正文、长度、类型、图标或附件数量。

### 9.3 交换日记

| 方法 | 路径                                    | 说明                                    |
| ---- | --------------------------------------- | --------------------------------------- |
| GET  | `/daily-entries/today`                  | 返回今日问题、自己的草稿/答案和安全状态 |
| PUT  | `/daily-entries/today`                  | 保存当前用户草稿；不接受日期或 authorId |
| POST | `/daily-entries/today/submit`           | 提交；双方提交后原子揭晓                |
| POST | `/daily-entries/today/postscript`       | 仅揭晓后追加当前用户附言                |
| GET  | `/daily-entries/calendar?month=2026-07` | 返回每日完成/揭晓状态，不批量返回正文   |
| GET  | `/daily-entries/:date`                  | 按揭晓规则返回指定日期详情              |

提交前响应示例：

```json
{
  "date": "2026-07-16",
  "prompt": { "id": "prm_...", "text": "今天什么时候想起了对方？" },
  "status": "WAITING_FOR_PARTNER",
  "mine": { "answer": "下班看到晚霞时。", "submittedAt": "..." },
  "partner": { "submitted": false }
}
```

只有 `status=REVEALED` 时 `partner.answer` 才存在。响应缓存、通知和 WebSocket 载荷遵守同一规则。

### 9.4 心情、通知和轻互动

| 方法    | 路径                      | 阶段 | 说明                             |
| ------- | ------------------------- | ---- | -------------------------------- |
| PUT     | `/moods/today`            | 3    | 当前用户当天 upsert 心情         |
| GET     | `/moods?month=2026-07`    | 3    | 只返回有权查看的趋势和条目       |
| GET     | `/notifications`          | 3    | 站内通知分页                     |
| POST    | `/notifications/:id/read` | 3    | 幂等已读                         |
| POST    | `/touch-events`           | 6    | 抱抱/想你等低频信号，受冷却限制  |
| GET/PUT | `/daily-rituals/today`    | 6    | 今日一件小事                     |
| POST    | `/calm-letters`           | 6    | 创建冷静信箱内容和服务端解锁规则 |

浏览器通知正文默认只返回“你收到了一条来自明天的新消息”一类隐私摘要；完整内容需解锁应用后通过受认证 API 获取。

## 10. 阶段 4：明天

### 10.1 愿望和计划

| 方法  | 路径                            | 说明                                              |
| ----- | ------------------------------- | ------------------------------------------------- |
| GET   | `/wishes`                       | 按状态、分类、地点筛选并游标分页                  |
| POST  | `/wishes`                       | 创建 `IDEA` 愿望                                  |
| GET   | `/wishes/:id`                   | 愿望、更新历史、计划与转换结果                    |
| PATCH | `/wishes/:id`                   | 更新可编辑描述字段；不允许任意改状态              |
| POST  | `/wishes/:id/plan`              | `IDEA → PLANNED`，创建/更新轻量计划               |
| POST  | `/wishes/:id/start`             | `PLANNED → IN_PROGRESS`                           |
| POST  | `/wishes/:id/complete`          | `IN_PROGRESS → COMPLETED`，记录完成时间/媒体/感受 |
| POST  | `/wishes/:id/reopen`            | 有约束地撤销最近迁移，写审计                      |
| POST  | `/wishes/:id/convert-to-memory` | 幂等创建回忆并置为 `CONVERTED_TO_MEMORY`          |
| POST  | `/wishes/:id/updates`           | 追加进度，不覆盖历史                              |

转换请求可包含对预填回忆的修改，但不能改变来源愿望：

```json
{
  "title": "终于一起看了极光",
  "content": "...",
  "happenedAt": "2027-02-11T19:00:00.000Z",
  "placeId": "plc_...",
  "mediaIds": ["med_..."]
}
```

响应为 `201 Memory`；同一幂等键或已转换愿望返回 `200` 的既有 Memory。

### 10.2 纪念日

| 方法             | 路径                             | 说明                   |
| ---------------- | -------------------------------- | ---------------------- |
| GET/POST         | `/anniversaries`                 | 获取/创建重要日子      |
| GET/PATCH/DELETE | `/anniversaries/:id`             | 详情、并发更新、软删除 |
| POST             | `/anniversaries/:id/reminders`   | 添加提前提醒规则       |
| GET              | `/anniversaries/:id/occurrences` | 往年回忆和未来发生时间 |

请求使用本地日期和 IANA 时区规则；API 返回 `nextOccurrenceAt` UTC 值用于倒计时，同时保留原 `date`/recurrence，避免夏令时和闰日漂移。

### 10.3 时间胶囊

| 方法   | 路径                              | 说明                                       |
| ------ | --------------------------------- | ------------------------------------------ |
| GET    | `/capsules`                       | 返回安全摘要；未解锁不含正文               |
| POST   | `/capsules`                       | 创建草稿；指定类型、解锁条件和共同确认规则 |
| GET    | `/capsules/:id`                   | 按当前状态返回元数据或完整内容             |
| PATCH  | `/capsules/:id`                   | 仅草稿且有作者权限；更新正文/附件/解锁规则 |
| DELETE | `/capsules/:id`                   | 仅允许草稿软删除；封存后按专门确认策略处理 |
| POST   | `/capsules/:id/seal`              | 校验后封存；正文不可再改                   |
| POST   | `/capsules/:id/confirm-open`      | 共同胶囊当前成员确认                       |
| POST   | `/capsules/:id/open`              | 服务端验证到期/确认条件并记录打开          |
| POST   | `/capsules/:id/convert-to-memory` | 已打开后幂等转换                           |

到期前详情示例：

```json
{
  "id": "cap_...",
  "title": "写给五周年的我们",
  "status": "LOCKED",
  "unlockAt": "2028-09-17T00:00:00.000Z",
  "requiresBoth": true,
  "confirmedMemberIds": [],
  "bodyAvailable": false
}
```

正文、正文长度、附件名称和缩略图均省略。服务端可以在读取时同步判定已到期，但持久状态和通知最终由 worker 幂等推进。

## 11. 阶段 5：回收站、导出与运维状态

### 11.1 回收站

| 方法   | 路径                       | 说明                                     |
| ------ | -------------------------- | ---------------------------------------- |
| GET    | `/recycle-bin?type=memory` | 按类型分页列出可恢复条目                 |
| POST   | `/recycle-bin/:id/restore` | 恢复同空间内容和仍在保留期内的媒体引用   |
| DELETE | `/recycle-bin/:id`         | 申请永久删除；共享重要内容可要求双方确认 |

回收站 ID 应包含资源类型语义或返回显式 `resourceType`；不能仅按任意 ID 跨表查找。物理清理在保留期后由 worker 执行，并尊重法律/用户导出与备份策略。

### 11.2 数据导出

| 方法   | 路径                    | 说明                                           |
| ------ | ----------------------- | ---------------------------------------------- |
| GET    | `/exports`              | 当前用户可见的导出任务列表                     |
| POST   | `/exports`              | 创建完整空间导出任务；需要幂等键和近期重新认证 |
| GET    | `/exports/:id`          | 状态、校验和、过期时间；不含永久下载 URL       |
| POST   | `/exports/:id/download` | 生成一次性/短时下载授权                        |
| DELETE | `/exports/:id`          | 提前删除导出包                                 |

状态为 `QUEUED → RUNNING → READY/FAILED → EXPIRED`。导出包含版本化 `manifest.json`、可读 JSON 和媒体，不包含密码摘要、Session、邀请码摘要、CSRF、内部存储键或原始审计敏感信息。

### 11.3 运维状态

普通成员可在设置页读取非敏感状态：

| 方法 | 路径                    | 说明                                                     |
| ---- | ----------------------- | -------------------------------------------------------- |
| GET  | `/settings/data-status` | 最近成功备份时间、导出能力、回收站保留期；不返回仓库凭据 |

该端点不能代替运维侧 Restic 检查和恢复演练。

## 12. 阶段 6：增强端点

| 领域          | 端点                                                                  | 约束                                                  |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 回忆盲盒      | `GET /memory-resurfaces/today`、`POST /memory-resurfaces/:id/dismiss` | 服务端去重，不形成“必须打开”任务                      |
| 足迹/未来地图 | `GET /places/map`、`PATCH /places/:id/status`                         | 只用用户主动地点；无后台持续定位                      |
| 第一次博物馆  | `GET /memories/first-times`                                           | 从回忆标记派生，游标分页                              |
| 冷静信箱      | `GET/POST /calm-letters`、`POST /calm-letters/:id/open`               | 未到服务端解锁条件不返回正文                          |
| 年度回忆书    | `GET/POST /annual-reviews/:year`、`PATCH /annual-reviews/:year`       | 自动草稿可编辑，不替用户编造文字                      |
| PWA           | 不新增业务端点                                                        | 缓存不得持久保存未揭晓/未解锁正文；退出时清除私密缓存 |

## 13. WebSocket 契约

阶段 3 开始在同域 `/socket` 建立连接，使用已有 Session Cookie 和 Origin 校验。连接后服务端再次解析当前成员空间，不接受客户端声明 `coupleId`。

事件载荷保持最小：

```ts
type RealtimeEvent = {
  id: string;
  type:
    | "notification.created"
    | "status.changed"
    | "note.visible"
    | "daily-entry.revealed"
    | "wish.changed"
    | "capsule.unlocked";
  resourceId?: string;
  occurredAt: string;
};
```

事件不包含便利贴正文、日记答案、胶囊正文、媒体 URL或对方未公开的心情说明。客户端收到事件后通过 REST 鉴权读取。断线重连以通知/实体列表为准，不要求 WebSocket 回放成为唯一恢复机制。

## 14. OpenAPI 与客户端生成

- 所有公开 Controller、DTO、响应、错误和安全要求必须进入 OpenAPI。
- 枚举值使用稳定英文常量；中文只用于 UI 映射。
- Web 客户端从 `/api/v1/openapi.json` 生成到约定目录，生成文件不手改。
- `packages/contracts` 只保存跨运行时的基础类型、枚举和生成入口；不能同时维护另一套不同字段的手写完整 DTO。
- CI 必须验证 OpenAPI 生成后工作树无漂移，并运行两个账户的契约/端到端测试。

破坏性变更包括删除字段、收紧枚举、改变保密字段出现条件、改变状态迁移或修改错误语义。V1 内优先新增可选字段；确需破坏时创建 `/api/v2` 或提供完整迁移窗口。

## 15. 必测契约场景

1. 未登录访问任一私人端点返回 401，媒体也不例外。
2. 用其他空间资源 ID 请求详情、子资源或媒体统一返回 404。
3. 请求体伪造 `coupleId` 被 DTO 白名单拒绝或完全不被接受。
4. 被撤销 Session 即刻失效；旧 CSRF 令牌不能复用。
5. 邀请码并发接受最多成功一次，第三位成员不能加入。
6. A 提交日记后，B 提交前的所有响应和事件不含 A 答案。
7. 胶囊到期前直接请求详情/媒体不返回正文或可推测附件信息。
8. 修改浏览器时间不改变 `/today`、胶囊或计划便利贴状态。
9. 相同幂等键重试愿望转换只得到同一回忆。
10. 导出包不含认证秘密、内部摘要或不属于当前空间的数据。
