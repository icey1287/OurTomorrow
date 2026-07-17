# OurTomorrow 运维入口

OurTomorrow 没有注册、密码、邀请码、Cookie Session 或应用内访问认证。`boy`/`girl` 只是在浏览器缓存的本地角色选择，任何能访问站点的人都能切换。因此，运维的首要上线条件是：入口只对两个人的设备可达。

常用入口：

- [`deployment.md`](deployment.md)：私有访问边界、上线、健康等待、烟测、发布记录与回滚；
- [`release-checklist.md`](release-checklist.md)：每次发布需保存的人工证据模板；
- [`../restore-runbook.md`](../restore-runbook.md)：备份核验、隔离恢复演练与灾难恢复。

仓库内脚本：

```text
infra/scripts/preflight.sh       只读配置/访问边界检查
infra/scripts/backup-now.sh      加锁、校验并记录一次手动快照
infra/scripts/deploy.sh          迁移前备份 → 迁移 → 健康等待 → smoke
infra/scripts/smoke.sh           TLS/安全头/无 Cookie/boy+girl 同 Couple
infra/scripts/restore-drill.sh   精确 snapshot 的隔离恢复演练
infra/scripts/check-shell.sh     Shell 静态检查
infra/tests/scripts-smoke.sh     dry-run、备份夹具和本地 HTTP 烟测
```

所有脚本默认从仓库根目录运行，真实生产环境文件为 `infra/.env`。不要把真实环境文件、发布 JSON、恢复演练 JSON 或任何私人正文提交到 Git。
