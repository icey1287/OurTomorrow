# OurTomorrow 发布记录模板

> 复制到受控运维记录系统。不要写入真实秘密、私人正文、完整响应或媒体 URL。

## 发布标识

- Release ID：
- 日期/维护窗口：
- 操作者/复核者：
- Git commit：
- API/Web/backup 镜像标签：
- 前一 release / 镜像：
- 目标环境与 Compose project：

## 门禁证据

- [ ] 阶段测试、类型检查、构建和 OpenAPI smoke 通过；附结果位置。
- [ ] tracked worktree 干净，镜像标签不可变，不是 `latest`/`local`。
- [ ] `preflight.sh` 通过。
- [ ] 只允许两人设备的私有接口/VPN/上游代理已从允许与拒绝路径验证。
- [ ] `PUBLIC_APP_URL` 为 HTTPS，证书、TLS 和安全头检查通过。
- [ ] PostgreSQL 未公开，Docker data 网络为 internal。
- [ ] 异地 Restic 仓库、恢复密码副本和剩余容量已核对。

## 数据保护

- 迁移前 snapshot ID：
- snapshot 开始/完成时间：
- backup metadata version：
- 最新 Prisma migration：
- dump SHA-256：
- `restic check` 结果：
- 最近恢复演练 ID/日期/结果：

## 变更与验证

- 迁移清单及 expand/contract 兼容说明：
- API/Web/worker/Caddy 健康等待结果：
- boy 用户 ID（可只记安全摘要）：
- girl 用户 ID（可只记安全摘要）：
- 双方共同 Couple ID（可只记安全摘要）：
- 无 `Set-Cookie`、token、session 回归：
- 回收站/导出/媒体清理/备份状态抽查：
- 日志与任务 backlog 抽查：

## 回滚决定

- 迁移是否已执行：是 / 否
- 前一镜像是否明确兼容新 schema：是 / 否 / 未知
- 应用级回滚命令已复核：
- 数据级恢复点与新 project 名：
- 切流量负责人/判定条件：

## 结果

- 状态：成功 / 失败 / 回滚 / 前向修复
- 完成时间：
- 异常、影响与采取动作：
- 后续事项、负责人、截止日期：
