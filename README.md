# 我们的明天 · OurTomorrow

一个只给两个人使用的手机端情侣手账。

它只做三件事：

- 写下自己的此刻状态和位置；
- 查看对方最近一次主动发送的位置与更新时间；
- 给对方发送独立留言，并在便笺匣里查看全部往来和未读状态。

设置页只保留共同纪念日、首页扉页句子和切换当前使用者。

## 技术栈

- Web：Vue 3、Vite、TypeScript、Pinia、TanStack Vue Query
- API：NestJS、Prisma、PostgreSQL
- 地图：高德 Web 服务，由 API 代理，Key 不进入浏览器
- 部署：Docker Compose、Caddy

## 本地启动

```bash
corepack enable
pnpm install
cp .env.example apps/api/.env
docker compose -f infra/compose.yaml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web：<http://localhost:5173>
- API：<http://localhost:3001/api/v1>
- OpenAPI：<http://localhost:3001/api/v1/docs>

首次进入在 `/login` 输入真名：`示例用户甲` 对应 `boy`，`示例用户乙` 对应 `girl`。浏览器只保存当前角色；它不是登录认证，因此线上入口必须放在只有两个人能访问的私有网络或访问代理后面。

## 常用命令

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm test:openapi
pnpm test:e2e
```

产品边界、接口和开发说明位于 [`docs/`](docs/)。
