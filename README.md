# 我们的明天 · OurTomorrow

> 记录每个昨天，共度每个今天，奔赴所有明天。

OurTomorrow 是一个仅供两位伴侣共同使用的私密时间空间。它把回忆、当下互动与未来愿望连接成一条可以持续生长的时间线。

## 技术栈

- Web：Vue 3、Vite、TypeScript、Vue Router、Pinia、TanStack Vue Query、Tailwind CSS
- API：NestJS、Prisma、PostgreSQL、WebSocket
- 运维：Docker Compose、Caddy、持久化 Worker、加密备份
- 测试：Vitest、Jest、Playwright

## 本地开发

```bash
corepack enable
pnpm install
cp .env.example apps/api/.env
docker compose -f infra/compose.yaml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`pnpm dev` 会同时启动 Web、API 与持久化 Worker；定时便利贴、冷静信箱解锁和提醒等后台任务无需再另开终端。

默认地址：

- Web：<http://localhost:5173>
- API：<http://localhost:3001/api/v1>
- OpenAPI：<http://localhost:3001/api/v1/docs>

应用固定服务男生和女生两种本地身份。首次打开在 `/login` 输入真名：`示例用户甲` 映射到 `boy`，`示例用户乙` 映射到 `girl`；匹配成功后播放身份揭晓动画。“甲/乙”只是默认称呼。身份数据只把 `boy` 或 `girl` 保存到 `localStorage`；theme、reduce-motion、touch-arrivals 等非敏感 UI 偏好也可本地保存，但正文、媒体和 API 实体不会持久化。API 通过 `X-Our-Tomorrow-Role` 显式映射到同一个双人空间。姓名匹配发生在 Web 前端，不是认证或安全边界；部署入口仍应只对两个人的设备、私有网络或外部访问代理开放。准确说明见 [`docs/development.md`](docs/development.md#2-首次本地启动) 与 [`docs/security.md`](docs/security.md#3-固定双人身份模型)。

## 已实现功能

- 记录：回忆、私有图片、双方视角、第一次博物馆、Couple 每日唯一回忆盲盒，以及不使用定位或第三方瓦片的足迹地图。
- 日常：状态、便利贴、交换日记、心情、固定种类的抱抱信号和冷静信箱。抱抱不接受自定义消息，并按发送者执行 30 秒冷却与滚动一小时最多 12 次限制。
- 明天与我们：愿望、计划、纪念日、时间胶囊、历史/未来双状态地点、未来地图，以及 READY 可重算、PUBLISHED 后冻结的年度回忆书。年度照片只能从对应年份的 PUBLISHED 回忆中选择。
- 私密 PWA：只缓存应用 shell、manifest、图标和构建静态资源；API、Socket、媒体和导出保持 network-only。应用进入后台时显示隐私幕，回到前台后重新确认已缓存角色并刷新私密数据；抱抱到达浮层可在设置中关闭。
- 数据生命周期：回收站、短时完整导出、加密备份与恢复演练。阶段 6 导出包含地点双状态、TouchEvent、按可见性裁剪的 CalmLetter、MemoryResurface 和 AnnualReview 数据。

“今日一件小事”、未来来信和月度合集仍是后续规划，不属于当前已实现范围。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:openapi
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm test:e2e
```

产品、架构、安全与恢复说明位于 [`docs/`](docs/)；部署入口位于 [`infra/`](infra/)。

## 私有上线

应用内没有注册、密码、邀请码或 Session；`boy`/`girl` 只缓存角色选择，不是认证。生产入口必须绑定明确的私网/VPN 接口，或仅监听 loopback 并由只允许两人设备的上游访问代理转发，禁止直接 wildcard 公网暴露。

```bash
cp infra/.env.example infra/.env
infra/scripts/preflight.sh --env-file infra/.env
infra/scripts/deploy.sh \
  --env-file infra/.env \
  --image-tag <immutable-tag> \
  --release-id <release-id> \
  --dry-run
```

确认 dry-run、迁移前备份目标和维护窗口后，去掉 `--dry-run`。脚本按“健康数据服务 → 已校验 Restic 快照 → migration → 健康应用 → TLS/安全头/boy+girl 同 Couple smoke”执行，并保存发布记录。完整步骤、失败回滚与恢复演练见 [`docs/operations/`](docs/operations/) 和 [`docs/restore-runbook.md`](docs/restore-runbook.md)。
