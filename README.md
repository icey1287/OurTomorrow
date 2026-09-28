# OurTomorrow

一个只给两个人使用的手机端情侣手账。

它只做三件事：

- 写下自己的此刻状态和位置；
- 查看对方最近一次主动发送的位置与更新时间；
- 给对方发送可附一张照片的独立留言，并在便笺匣里查看全部往来和未读状态。

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
# 编辑 apps/api/.env，填入仅供本机使用的双人配置
docker compose -f infra/compose.yaml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web：<http://localhost:5173>
- API：<http://localhost:3001/api/v1>
- OpenAPI：<http://localhost:3001/api/v1/docs>

## 隐私配置

真实姓名、页面称呼、情侣空间名称和关系开始日期都从 API 的 `.env` 读取，不应写进源码或提交到 Git。仓库只提交使用中性示例值的 `.env.example`；本地开发请编辑 `apps/api/.env`，Docker 部署请编辑 `infra/.env`。

```dotenv
BOY_REAL_NAME=示例用户甲
GIRL_REAL_NAME=示例用户乙
BOY_DISPLAY_NAME=甲
GIRL_DISPLAY_NAME=乙
COUPLE_NAME=我们的明天
COUPLE_START_DATE=2024-01-01
COUPLE_TIMEZONE=Asia/Shanghai
COUPLE_SIGNATURE=一起记录普通的日子。
```

- `BOY_REAL_NAME`、`GIRL_REAL_NAME`：`/login` 接受的两个完整姓名。匹配在 API 服务端完成，不会被编译进 Web 静态资源。
- `BOY_DISPLAY_NAME`、`GIRL_DISPLAY_NAME`：进入手账后显示的简称或昵称。
- `COUPLE_NAME`、`COUPLE_START_DATE`、`COUPLE_TIMEZONE`、`COUPLE_SIGNATURE`：首次创建双人空间时采用的默认资料。

浏览器只保存匹配后的 `boy` 或 `girl` 角色。姓名匹配不是登录认证，因此线上入口仍必须放在只有两个人能访问的私有网络、VPN 或访问代理后面。

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

## CI 检查

类型检查、单元测试、API 集成测试、构建和容器校验失败仍会阻断 CI。
格式检查、依赖审计和仓库安全扫描作为非阻断提醒：结果保留在 Actions
日志中，发现问题或扫描失败时会显示 warning 和运行摘要，不再因此将整个工作流标红。
安全扫描仍会在 PR、main 推送和每周定时运行，也可手动触发；检查通过仅表示
阻断项通过，并不代表没有安全问题。
