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

应用不提供公共注册入口。首次用户由受控 CLI 创建；开发双账户 seed 也要求显式确认和临时密码。准确命令见 [`docs/development.md`](docs/development.md#2-首次本地启动)。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm test:e2e
```

产品、架构、安全与恢复说明位于 [`docs/`](docs/)；部署入口位于 [`infra/`](infra/)。
