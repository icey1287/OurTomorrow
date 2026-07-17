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
- [ ] 阶段 6 双角色集成/E2E 通过：Touch、CalmLetter、盲盒、first-times、地图、年度书和导出均有结果记录。
- [ ] PWA production preview 验证通过；Service Worker 只缓存 shell/manifest/icon/assets，API、Socket、媒体和导出未进入 Cache Storage。
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
- 阶段 6 migration 验证：Place 双状态、MemoryResurface 本地日期唯一、CALM_LETTER_UNLOCK 与新增索引：
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
- 阶段 6 导出抽查：地点双状态、Touch 无 message、CalmLetter/盲盒/年度媒体按可见性裁剪：
- Touch 抽查：固定 kind、同发送者 30 秒冷却/12 每小时、离线通知仅固定 kind：
- CalmLetter 抽查：到期后仍需显式 open，open 前 API/通知/导出无收件正文：
- 地图抽查：无定位权限、无第三方地图/瓦片请求，愿望/计划完成后地点状态原子迁移：
- 年度书抽查：READY 可重算且只列当年 PUBLISHED 回忆图片，PUBLISHED 后冻结：
- PWA 隐私抽查：后台隐私幕、前台角色恢复、角色切换清理、抱抱到达浮层可关闭：
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
