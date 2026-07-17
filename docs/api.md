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

生产环境 Web 与 API 同域；开发环境只允许 `WEB_ORIGIN` 指定的单一来源。除健康检查和身份选择所需端点外，响应包含 `Cache-Control: private, no-store`。

### 1.2 请求 ID

客户端可以发送合法的 `X-Request-Id`（8–128 位字母、数字、`.`、`_`、`:`、`-`）；否则服务端生成 UUID。响应头和错误体均返回该 ID。

### 1.3 固定身份选择

OurTomorrow 是只供固定两个人使用的自部署应用，不提供账号、密码、注册、邀请、Cookie Session 或 CSRF token。浏览器在欢迎页选择“我是男生”或“我是女生”，内部对应 `boy`/`girl`，随后在每个角色相关请求中显式发送：

```http
X-Our-Tomorrow-Role: boy
```

允许值只有 `boy` 和 `girl`。缺失或非法值返回 `400 IDENTITY_REQUIRED`。`POST /identity/select` 的请求体直接携带角色，因此该端点本身不要求 header。

Web 可以在 `localStorage` 的 `our-tomorrow-role` 中保存字符串 `boy` 或 `girl` 以记住界面选择，并保存 theme、reduce-motion、touch-arrivals 等非敏感 UI 偏好；不得保存正文、媒体、情侣空间/API 实体、令牌或未来新增的秘密。角色值不是凭据，header 也不是安全边界：任何能访问应用的人都能切换两个身份。部署者必须通过网络入口、设备访问控制或 VPN 保证应用只对这两个人可达。

因为请求不使用浏览器自动附带的认证 Cookie，当前 API 不采用 CSRF token。生产仍保持同域部署、配置的单一 CORS Origin、安全响应头和无公开内容入口；这些控制不能把角色选择包装成真正认证。

### 1.4 Actor 与空间上下文

客户端请求体和查询参数不接受作用域用途的 `coupleId`。服务端根据固定角色映射得到：

```ts
type ActorContext = {
  role: "boy" | "girl";
  userId: string;
  coupleId: string;
  requestId: string;
};
```

两个角色始终映射到同一个确定性情侣空间。资源不存在和资源属于其他空间统一返回 `404 RESOURCE_NOT_FOUND`，不泄露跨空间存在性。角色选择只决定“以哪一位成员操作”，不能让请求体覆盖 `userId`、`role` 或 `coupleId`。

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

| HTTP | code                       | 含义                                    |
| ---- | -------------------------- | --------------------------------------- |
| 400  | `VALIDATION_FAILED`        | DTO 格式错误、未知字段或无效游标        |
| 400  | `IDENTITY_REQUIRED`        | 角色 header 缺失或不是 `boy`/`girl`     |
| 403  | `ACTION_FORBIDDEN`         | 已确认资源同空间但作者/状态规则禁止动作 |
| 404  | `RESOURCE_NOT_FOUND`       | 资源不存在或不属于当前空间              |
| 409  | `STATE_CONFLICT`           | 并发版本冲突或条件更新失败              |
| 409  | `IDEMPOTENCY_CONFLICT`     | 同一幂等键被不同请求载荷复用            |
| 422  | `STATE_TRANSITION_INVALID` | 业务状态不允许该动作                    |
| 423  | `CONTENT_LOCKED`           | 日记已揭晓或胶囊已封存，正文不可编辑    |
| 429  | `RATE_LIMITED`             | 触摸信号、上传或其他高频操作超限        |
| 500  | `INTERNAL_ERROR`           | 未预期错误；不返回堆栈或内部 SQL        |
| 503  | `DEPENDENCY_UNAVAILABLE`   | 数据库或存储暂不可用                    |

`details` 只包含安全的结构化提示。秘密内容、资源所有者或其他空间标识不得出现在错误详情中。

### 2.3 乐观并发

共享可编辑资源返回 `version`（从 1 递增）和 ETag：

```http
ETag: "memory:m_123:7"
```

更新时发送 `If-Match`。缺失前置条件可返回 `428 PRECONDITION_REQUIRED`，版本不匹配返回 `409 STATE_CONFLICT`。个人草稿可由服务端按业务需要使用相同机制。

### 2.4 幂等命令

以下命令要求 `Idempotency-Key`：上传完成、愿望转回忆、胶囊转回忆、便利贴转换和导出创建。键在当前用户和路由范围内至少保留 24 小时。相同键和相同载荷返回首次状态码与结果。

## 3. 公共模型

### 3.1 IdentityResponse

这是角色选择后的当前上下文快照，不是登录 Session，也不会在服务端创建会话：

```json
{
  "role": "boy",
  "user": {
    "id": "usr_...",
    "displayName": "甲",
    "role": "boy",
    "slot": 1,
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
  }
}
```

`couple` 始终存在，且两个成员分别为 `boy/slot 1` 与 `girl/slot 2`。`avatarUrl`、封面和媒体 URL 都是同域、按当前显式角色与业务状态检查的端点或短时地址。

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

普通资源可返回 `createdAt`、`updatedAt`、`createdBy`、`version`。不得向客户端返回内部存储键、worker 负载、Outbox 内容、备份秘密或内部审计 IP 原值。

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

| 方法 | 路径            | 角色 header | 响应                      | 说明                                    |
| ---- | --------------- | ----------- | ------------------------- | --------------------------------------- |
| GET  | `/health/live`  | 不需要      | `200 LiveHealth`          | 仅进程存活，不访问依赖                  |
| GET  | `/health/ready` | 不需要      | `200 ReadyHealth` / `503` | 检查 PostgreSQL；依赖异常时必须是非 2xx |

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

固定情侣空间和两名成员由身份初始化流程幂等建立，不依赖成员凭据或配对端点。

## 5. 阶段 1：固定双人身份与资料

### 5.1 身份选择

| 方法 | 路径               | 请求/header                                              | 响应                   |
| ---- | ------------------ | -------------------------------------------------------- | ---------------------- |
| POST | `/identity/select` | `{ "role": "boy" }` 或 `{ "role": "girl" }`；无需 header | `200 IdentityResponse` |
| GET  | `/identity/me`     | `X-Our-Tomorrow-Role`                                    | `200 IdentityResponse` |

`POST /identity/select` 幂等创建或修复以下固定记录：

| 角色   | 内部键 | 默认显示名/关系称呼 | slot |
| ------ | ------ | ------------------- | ---- |
| `boy`  | `boy`  | 甲                  | 1    |
| `girl` | `girl` | 乙 | 2    |

内部键不进入 API 响应；Web 身份按钮显示“我是男生/我是女生”。

两个用户拥有确定性 ID，同属一个确定性情侣空间。默认空间为“我们的明天”，开始日期 `2024-01-01`，时区 `Asia/Shanghai`，签名“今天也一起认真生活。”。并发选择任一角色最多生成这两个用户、一个空间和两条成员关系；重复或重启后返回相同记录。

选择结果不设置 Cookie，也不建立服务器 Session。即使刚调用过 `select`，后续角色相关请求仍必须显式发送 header。

### 5.2 情侣空间

| 方法  | 路径               | 请求/header                                                | 响应                |
| ----- | ------------------ | ---------------------------------------------------------- | ------------------- |
| GET   | `/couples/current` | `X-Our-Tomorrow-Role`                                      | `200 CoupleSummary` |
| PATCH | `/couples/current` | header + `version`；名称、日期、时区、签名、主题等共享字段 | `200 CoupleSummary` |

两个角色读取和修改同一空间。共享字段使用乐观版本；相同旧版本并发更新最多一个成功，另一请求返回 `409 STATE_CONFLICT`。

### 5.3 个人设置

| 方法  | 路径                    | 说明                                                        |
| ----- | ----------------------- | ----------------------------------------------------------- |
| PATCH | `/users/me`             | header 选择当前角色；修改 `displayName`、关系昵称、头像引用 |
| PATCH | `/settings/preferences` | 主题、减少动态效果、隐私通知、自动锁定偏好                  |
| GET   | `/settings/preferences` | 获取当前成员偏好与空间级设置                                |

个人资料使用 `User.version`；更新后情侣空间成员摘要的 `Couple.version` 同步递增。空间级时区、关系日期由 `/couples/current` 修改；个人减少动效等不应覆盖对方偏好。

## 6. 今日聚合

| 方法 | 路径                      | 阶段             | 说明                             |
| ---- | ------------------------- | ---------------- | -------------------------------- |
| GET  | `/today`                  | 1 起，逐阶段扩展 | 一次返回首页所需的少量聚合数据   |
| GET  | `/today/random-memory`    | 2                | 获取一条去重后的随机回忆摘要     |
| GET  | `/today/upcoming?days=30` | 4                | 返回纪念日、计划和胶囊的安全摘要 |

`GET /today` 返回稳定顶层字段；未交付模块或无内容时为 `null`，但保密内容字段仍应省略：

```json
{
  "serverNow": "2026-07-16T08:30:00.000Z",
  "localDate": "2026-07-16",
  "greeting": "下午好，慢慢走向共同的明天。",
  "relationship": {
    "startDate": "2023-09-17",
    "daysTogether": 1035,
    "timezone": "Asia/Shanghai",
    "signature": "今天也一起认真生活。",
    "members": []
  },
  "partnerStatus": null,
  "latestNote": null,
  "dailyEntryStatus": {
    "date": "2026-07-16",
    "timezone": "Asia/Shanghai",
    "prompt": { "id": "prm_...", "text": "今天什么时候想起了对方？" },
    "status": "DRAFT",
    "mine": null,
    "partner": { "submitted": false }
  },
  "nextAnniversary": null,
  "randomMemory": null,
  "activeWish": null
}
```

`daysTogether` 与 `localDate` 由服务端按情侣空间时区计算。聚合端点不返回完整回忆正文、胶囊正文或未揭晓日记答案。

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
| POST   | `/memories/:id/media`               | 以 `mediaIds` 顺序同步已上传媒体，并用 `coverMediaId` 指定封面                               |
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

| 方法         | 路径             | 说明                                        |
| ------------ | ---------------- | ------------------------------------------- |
| GET/POST     | `/tags`          | 获取/创建空间内标签                         |
| PATCH/DELETE | `/tags/:id`      | 重命名或软删除；删除不删除回忆              |
| GET          | `/places/search` | 使用高德 Web 服务搜索地点并返回地址与经纬度 |
| GET/POST     | `/places`        | 获取/创建用户主动提供的地点                 |
| PATCH/DELETE | `/places/:id`    | 更新或软删除地点                            |

`GET /places/search?query=上海迪士尼&limit=8` 只接受 2～80 个字符的主动搜索词；请求日志不记录 query，服务端高德 Key 不返回浏览器。地点的经纬度可选；API 不接收持续位置轨迹。阶段 6 的地图仍复用这些显式地点。

### 7.3 随机回忆

`GET /today/random-memory` 是首页兼容端点，只返回卡片摘要。可接受 `excludeId` 作为用户主动换一条的提示，但服务端仍执行去重和安全筛选；它不会创建每日 MemoryResurface，也不会泄露尚未打开的盲盒内容。

## 8. 媒体上传与读取

| 方法   | 路径                   | 阶段 | 说明                                                         |
| ------ | ---------------------- | ---- | ------------------------------------------------------------ |
| POST   | `/uploads/presign`     | 2    | 创建短时上传意图；请求声明文件名、大小和 MIME                |
| PUT    | `/uploads/:id/content` | 2    | 同域上传原始二进制；仅创建意图的角色可在有效期内写入一次     |
| POST   | `/uploads/complete`    | 2    | 校验实际对象、重编码、去 EXIF、生成缩略图并登记 `MediaAsset` |
| GET    | `/media/:id`           | 2    | 校验显式角色、空间和可见性后流式读取或 302 到短时签名 URL    |
| GET    | `/media/:id/thumbnail` | 2    | 校验显式角色、空间和可见性后读取缩略图                       |
| DELETE | `/media/:id`           | 2    | 标记删除；仍被内容引用时返回冲突或只解除指定关系             |

`POST /uploads/presign` 返回 `{ uploadId, uploadUrl, method: "PUT", expiresAt }`；`POST /uploads/complete` 接受 `{ uploadId }` 并要求 `Idempotency-Key`。客户端声明 MIME 只用于早期提示，完成端点必须验证真实格式、像素、大小和解码完整性。响应只返回 `{ id, originalName, mimeType, size, width, height, url, thumbnailUrl, createdAt }`，不返回 `storageKey`。

若阶段 2 的本地存储不支持浏览器直传，`presign` 可返回同域一次性上传 URL；外部契约不因存储后端改变。

由于角色通过自定义 header 传递，Web 不把授权 URL直接放入 `<img src>`，而是带角色 header `fetch` 为 Blob，再创建并及时撤销 object URL。角色值不放入 query string。

## 9. 阶段 3：日常

### 9.1 此刻状态

| 方法   | 路径                | 说明                                           |
| ------ | ------------------- | ---------------------------------------------- |
| GET    | `/statuses/current` | 返回双方状态；对方仅返回仍有效且允许共享的状态 |
| PUT    | `/statuses/me`      | 设置/替换当前用户状态，含 `expiresAt`          |
| DELETE | `/statuses/me`      | 提前结束当前状态                               |

服务端拒绝早于当前时间的失效时间，或直接将其视为结束；过期判断不采用浏览器时间。

### 9.2 便利贴

| 方法   | 路径                     | 说明                                                                                 |
| ------ | ------------------------ | ------------------------------------------------------------------------------------ |
| GET    | `/notes`                 | 可按 `scope=all/sent/received` 与 `includeArchived` 查询；接收方看不到计划显示前正文 |
| POST   | `/notes`                 | 创建草稿、立即显示或定时显示便利贴                                                   |
| GET    | `/notes/:id`             | 按作者、接收方和状态裁剪字段                                                         |
| PATCH  | `/notes/:id`             | 仅作者且未到不可编辑状态；要求版本                                                   |
| DELETE | `/notes/:id`             | 软删除/归档                                                                          |
| POST   | `/notes/:id/mark-viewed` | 接收方幂等标记已查看                                                                 |
| PUT    | `/notes/:id/reaction`    | 接收方设置一个表情回应                                                               |
| DELETE | `/notes/:id/reaction`    | 移除当前角色的指定回应                                                               |
| PUT    | `/notes/order`           | 用各条 `version` 原子更新排列与置顶                                                  |

`POST /notes/:id/convert` 在阶段 4 已启用，要求 `Idempotency-Key`，且只有作者能把仍有效的便利贴转为愿望、纪念日或回忆。同一便利贴由数据库唯一约束保证只能选择一个转换目标；成功后原便利贴归档。

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

| 方法   | 路径                           | 阶段 | 说明                             |
| ------ | ------------------------------ | ---- | -------------------------------- |
| PUT    | `/moods/today`                 | 3    | 当前用户当天 upsert 心情         |
| DELETE | `/moods/today?version=...`     | 3    | 删除当前用户当天心情             |
| GET    | `/moods?month=2026-07`         | 3    | 只返回有权查看的趋势和条目       |
| GET    | `/notifications`               | 3    | 私密站内通知游标分页             |
| GET    | `/notifications/unread-count`  | 3    | 当前角色未读数                   |
| POST   | `/notifications/:id/mark-read` | 3    | 幂等标记单条已读                 |
| POST   | `/notifications/mark-all-read` | 3    | 标记当前角色全部通知已读         |
| POST   | `/notifications/:id/archive`   | 3    | 归档当前角色通知                 |
| POST   | `/touch-events`                | 6    | 发送固定 kind 的低频信号         |
| GET    | `/calm-letters`                | 6    | 元数据列表，不查询正文           |
| GET    | `/calm-letters/:id`            | 6    | 作者或已显式打开的收件人可得正文 |
| POST   | `/calm-letters`                | 6    | 创建冷静信和服务端解锁规则       |
| POST   | `/calm-letters/:id/open`       | 6    | 收件人显式打开 AVAILABLE 信件    |

Touch 请求体只有 `{ kind }`，不接受 `message`、收件人或 Couple。服务端固定推导另一位成员，按发送者执行 30 秒冷却与滚动一小时最多 12 次限制。在线事件类型为 `touch.<kind>`；离线通知正文仍使用隐私摘要，payload 只包含允许列表内的固定 kind。

CalmLetter 到期只进入 `AVAILABLE`，不会自动返回或推送正文。收件人必须调用 `/open`，成功持久化为 `OPENED` 后，详情和导出才可包含正文。

“今日一件小事”尚未实现，不存在 `/daily-rituals/today` 公共端点。

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

独立计划端点：

| 方法   | 路径                  | 说明                                    |
| ------ | --------------------- | --------------------------------------- |
| GET    | `/plans`              | 按状态、愿望或纪念日筛选                |
| POST   | `/plans`              | 创建轻量草稿计划                        |
| GET    | `/plans/:id`          | 获取当前空间计划                        |
| PATCH  | `/plans/:id`          | 按版本更新仍可编辑字段                  |
| DELETE | `/plans/:id`          | 软删除并取消未完成提醒                  |
| POST   | `/plans/:id/schedule` | `DRAFT → SCHEDULED`                     |
| POST   | `/plans/:id/start`    | `SCHEDULED → IN_PROGRESS`               |
| POST   | `/plans/:id/complete` | `IN_PROGRESS → COMPLETED`，同步关联愿望 |
| POST   | `/plans/:id/cancel`   | 取消计划并安全释放尚未完成的关联愿望    |

完成愿望或完成其关联计划时，服务端在同一事务内为 `WISH_COMPLETION` 胶囊写入 `dueAt` 并 upsert 持久 `CAPSULE_DUE`，不能只依赖下一次读取时的懒判定。

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

| 方法             | 路径                                       | 说明                   |
| ---------------- | ------------------------------------------ | ---------------------- |
| GET/POST         | `/anniversaries`                           | 获取/创建重要日子      |
| GET/PATCH/DELETE | `/anniversaries/:id`                       | 详情、并发更新、软删除 |
| POST             | `/anniversaries/:id/reminders`             | 添加提前提醒规则       |
| DELETE           | `/anniversaries/:id/reminders/:reminderId` | 删除提醒规则           |
| GET              | `/anniversaries/:id/occurrences`           | 往年回忆和未来发生时间 |

请求使用本地日期和 IANA 时区规则；API 返回 `nextOccurrenceAt` UTC 值用于倒计时，同时保留原 `date`/recurrence，避免夏令时和闰日漂移。

### 10.3 时间胶囊

| 方法   | 路径                               | 说明                                       |
| ------ | ---------------------------------- | ------------------------------------------ |
| GET    | `/capsules`                        | 返回安全摘要；未解锁不含正文               |
| POST   | `/capsules`                        | 创建草稿；指定类型、解锁条件和共同确认规则 |
| GET    | `/capsules/:id`                    | 按当前状态返回元数据或完整内容             |
| PATCH  | `/capsules/:id`                    | 仅草稿且有作者权限；更新正文/附件/解锁规则 |
| DELETE | `/capsules/:id`                    | 仅允许草稿软删除；封存后按专门确认策略处理 |
| POST   | `/capsules/:id/seal`               | 校验后封存；正文不可再改                   |
| POST   | `/capsules/:id/mark-condition-met` | 服务端确认手动条件已满足                   |
| POST   | `/capsules/:id/confirm-open`       | 共同胶囊当前成员确认                       |
| POST   | `/capsules/:id/open`               | 服务端验证到期/确认条件并记录打开          |
| POST   | `/capsules/:id/convert-to-memory`  | 已打开后幂等转换                           |

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

正文、正文长度、附件名称、数量、媒体 ID 和缩略图均省略。原图与缩略图使用同一授权查询；未显式打开的成员也不能把已知媒体 UUID 重新绑定到愿望、纪念日或回忆来绕过锁定。

到期、双方确认与显式打开是三个不同门槛：`UNLOCKED` 仍不返回正文，每个有资格打开的成员都必须分别调用 `/open`。共享胶囊只有所有有资格打开的成员都已打开后才能转为共同回忆；`TO_SELF` 不允许转为共享 Memory。封存后正文和附件不可修改。服务端可以在读取时同步判定已到期，但持久状态、通知与重复执行去重最终由 worker 推进。

## 11. 阶段 5：回收站、导出与运维状态

### 11.1 回收站

| 方法   | 路径                       | 说明                                     |
| ------ | -------------------------- | ---------------------------------------- |
| GET    | `/recycle-bin?type=memory` | 按类型分页列出可恢复条目                 |
| POST   | `/recycle-bin/:id/restore` | 恢复同空间内容和仍在保留期内的媒体引用   |
| DELETE | `/recycle-bin/:id`         | 申请永久删除；共享重要内容可要求双方确认 |

回收站 ID 应包含资源类型语义或返回显式 `resourceType`；不能仅按任意 ID 跨表查找。物理清理在保留期后由 worker 执行，并尊重法律/用户导出与备份策略。

当前保留期为删除后 30 天。普通删除与回收站记录在同一个数据库事务中完成；`restoreData` 只保存恢复状态所需的枚举、关联 ID 和时间，不复制标题、正文、文件名或胶囊内容。共享内容双方都能看到和恢复；回忆草稿、便利贴草稿/定时内容、胶囊草稿及未绑定媒体只对其作者可见。`DELETE /recycle-bin/:id` 返回 `202` 并持久化清理申请；清理时间是“申请后 7 天”与原 30 天保留截止中的较早者，实际物理删除由可重试 worker 执行。

### 11.2 数据导出

| 方法   | 路径                    | 说明                                                               |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/exports`              | 当前用户可见的导出任务列表                                         |
| POST   | `/exports`              | 创建完整空间导出任务；需要幂等键和当前角色再次确认（不是重新认证） |
| GET    | `/exports/:id`          | 状态、校验和、过期时间；不含永久下载 URL                           |
| POST   | `/exports/:id/download` | 生成一次性/短时下载授权                                            |
| DELETE | `/exports/:id`          | 提前删除导出包                                                     |

状态为 `QUEUED → RUNNING → READY/FAILED → EXPIRED`。导出包含版本化 `manifest.json`、可读 JSON 和媒体，不包含内部存储键、部署/备份秘密或原始审计敏感信息。固定角色值不是秘密，也无需作为独立凭据数据导出。

阶段 6 的 `data.json` 新增地点 `historyState/futureState`、`touchEvents`、`calmLetters`、`memoryResurfaces` 和 `annualReviews`。Touch 只导出固定 kind；CalmLetter 作者可导出自己的正文，收件人仅在 OPENED 后导出正文；未打开盲盒的 `memoryId` 为 null；年度选图 ID 仍经过当前角色媒体可见性检查。

### 11.3 运维状态

普通成员可在设置页读取非敏感状态：

| 方法 | 路径                    | 说明                                                     |
| ---- | ----------------------- | -------------------------------------------------------- |
| GET  | `/settings/data-status` | 最近成功备份时间、导出能力、回收站保留期；不返回仓库凭据 |

该端点不能代替运维侧 Restic 检查和恢复演练。

## 12. 阶段 6：增强端点

| 领域          | 方法  | 路径                                  | 约束                                                               |
| ------------- | ----- | ------------------------------------- | ------------------------------------------------------------------ |
| Touch         | POST  | `/touch-events`                       | 仅固定 kind；30 秒冷却、滚动一小时 12 次；伴侣由服务端推导         |
| 回忆盲盒      | GET   | `/memory-resurfaces/today`            | Couple 本地日期唯一；未打开时 `memory: null`                       |
| 回忆盲盒      | POST  | `/memory-resurfaces/:id/open`         | 显式打开当天盲盒；底层回忆仍需 PUBLISHED、未删除且非未来           |
| 回忆盲盒      | POST  | `/memory-resurfaces/:id/dismiss`      | 幂等忽略当天盲盒；忽略后不返回回忆                                 |
| 第一次博物馆  | GET   | `/memories/first-times`               | PUBLISHED、未删除、非未来、`isFirstTime=true`；游标分页            |
| 足迹/未来地图 | GET   | `/places/map`                         | 历史/未来双状态；只用主动地点，无定位或第三方地图/瓦片             |
| 足迹/未来地图 | GET   | `/places/search`                      | 高德地点候选；自动回填地址与经纬度；Key 仅服务端持有               |
| 足迹/未来地图 | PATCH | `/places/:id/status`                  | 按 version 更新 `historyState`/`futureState`                       |
| 冷静信箱      | GET   | `/calm-letters`                       | 元数据列表，不查询正文                                             |
| 冷静信箱      | GET   | `/calm-letters/:id`                   | 作者或 OPENED 收件人可得正文                                       |
| 冷静信箱      | POST  | `/calm-letters`                       | 创建 LOCKED 或 AVAILABLE 信件                                      |
| 冷静信箱      | POST  | `/calm-letters/:id/open`              | 收件人显式打开；到期但未 open 仍无正文                             |
| 年度回忆书    | GET   | `/annual-reviews`                     | 按年份倒序列出                                                     |
| 年度回忆书    | GET   | `/annual-reviews/:year`               | 返回统计、双方 contribution 和状态                                 |
| 年度回忆书    | GET   | `/annual-reviews/:year/media-options` | 仅对应年份 PUBLISHED 回忆中的 READY 图片                           |
| 年度回忆书    | POST  | `/annual-reviews/:year`               | 创建或重新排程生成；READY 可重算，PUBLISHED 不变                   |
| 年度回忆书    | PATCH | `/annual-reviews/:year`               | 仅 READY；更新当前角色选图/寄语或共享下一年信件                    |
| 年度回忆书    | POST  | `/annual-reviews/:year/publish`       | READY → PUBLISHED；发布后冻结                                      |
| PWA           | —     | 不新增业务端点                        | 只缓存 shell/manifest/icon/assets；业务、媒体、Socket network-only |

Place 同时保存历史轴 `UNVISITED / VISITED / LIVED` 与未来轴 `NONE / WANT_TO_GO / PLANNED / DEPARTING / COMPLETED`。愿望或计划完成时，关联地点状态在同一事务中迁入足迹；若仍有其他有效未来安排，可同时保留未来状态。

AnnualReview 的统计只读取共同公开来源，不读取私人心情、日记、胶囊或冷静信正文。READY 重算保留双方 contribution，PUBLISHED 后不再重算或编辑。未来来信、今日一件小事、简单共同日历和月度合集不属于当前公共 API。

## 13. WebSocket 契约

阶段 3 开始用 Socket.IO 在同域 `/socket` 建立 WebSocket-only 连接并校验 Origin。握手 `auth.role` 必须是 `boy` 或 `girl`，服务端再映射到固定成员和共同空间，不接受客户端声明或订阅 `coupleId`。该角色值仍不是秘密或凭据。

事件载荷保持最小：

```ts
type RealtimeEvent = {
  id: string;
  type: string; // 例如 current_status.updated、note.visible、daily-entry.revealed
  resourceId?: string;
  occurredAt: string;
};
```

事件不包含便利贴正文、日记答案、胶囊正文、媒体 URL 或对方未公开的心情说明。客户端收到事件后通过 REST 重新执行显式角色、空间和内容可见性检查。断线重连以通知/实体列表为准，不要求 WebSocket 回放成为唯一恢复机制。

## 14. OpenAPI 与客户端生成

- 所有公开 Controller、DTO、响应、错误和安全要求必须进入 OpenAPI。
- 枚举值使用稳定英文常量；中文只用于 UI 映射。
- Web 客户端从 `/api/v1/openapi.json` 生成到约定目录，生成文件不手改。
- `packages/contracts` 只保存跨运行时的基础类型、枚举和生成入口；不能同时维护另一套不同字段的手写完整 DTO。
- CI 必须验证 OpenAPI 生成后工作树无漂移，并运行 boy/girl 双角色契约/端到端测试。

破坏性变更包括删除字段、收紧枚举、改变保密字段出现条件、改变状态迁移或修改错误语义。V1 内优先新增可选字段；确需破坏时创建 `/api/v2` 或提供完整迁移窗口。

## 15. 必测契约场景

1. 缺失或非法 `X-Our-Tomorrow-Role` 时，角色相关端点返回 `400 IDENTITY_REQUIRED`。
2. `POST /identity/select` 并发和重启后仍只有固定两个用户、一个空间、两条成员关系。
3. 切换 `boy`/`girl` header 会切换当前成员，但两者始终看到同一个情侣空间。
4. 用其他空间资源 ID 请求详情、子资源或媒体统一返回 404。
5. 请求体伪造 `role`、`userId` 或 `coupleId` 被 DTO 白名单拒绝或完全不被接受。
6. A 提交日记后，B 提交前的所有响应和事件不含 A 答案。
7. 胶囊到期前直接请求详情/媒体不返回正文或可推测附件信息。
8. 修改浏览器时间不改变 `/today`、胶囊或计划便利贴状态。
9. 相同幂等键重试愿望转换只得到同一回忆。
10. 导出包不含部署秘密、内部摘要或不属于当前空间的数据。
