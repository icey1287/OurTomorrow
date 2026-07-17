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

默认地址：

- Web：<http://localhost:5173>
- API：<http://localhost:3000/api/v1>
- OpenAPI：<http://localhost:3000/api/v1/docs>

应用固定服务男生和女生两种本地身份。首次打开在 `/login` 选择“我是男生”或“我是女生”；“甲/乙”只是默认称呼。浏览器只把 `boy` 或 `girl` 保存到 `localStorage`，API 通过 `X-Our-Tomorrow-Role` 显式映射到同一个双人空间。角色选择不是认证或安全边界；部署入口必须只对两个人的设备、私有网络或外部访问代理开放。准确说明见 [`docs/development.md`](docs/development.md#2-首次本地启动) 与 [`docs/security.md`](docs/security.md#3-固定双人身份模型)。

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
