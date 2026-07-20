# 开发说明

## 目录

```text
apps/web        三个页面和手账视觉
apps/api        身份、设置、状态、留言、位置 API
packages/contracts  Web/API 共用类型
infra           PostgreSQL、API、Web、Caddy
```

## 环境变量

| 变量                   | 用途                               |
| ---------------------- | ---------------------------------- |
| `DATABASE_URL`         | PostgreSQL 连接                    |
| `WEB_ORIGIN`           | 唯一允许的 Web Origin              |
| `AMAP_WEB_SERVICE_KEY` | 高德坐标转换、逆地理编码和静态地图 |
| `API_PORT`             | API 端口，默认 `3001`              |
| `TRUST_PROXY`          | 是否信任已知反向代理               |
| `TZ`                   | 进程默认时区                       |

## 数据模型

数据库只保留：

- `users`
- `couples`
- `couple_members`
- `current_statuses`
- `notes`

迁移 `20260720020000_remove_legacy_features` 会删除旧功能表，并保留情侣设置、已发送留言和状态历史。应用迁移前仍应确认目标数据库正确。

## 数据刷新

状态和留言每 10 秒轻量刷新一次，并在窗口重新获得焦点时立即刷新。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:openapi
```

数据库集成测试只能使用名称含 `test` 或 `integration` 的 PostgreSQL 数据库。
