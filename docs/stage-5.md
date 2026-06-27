# 阶段 5 说明

已实现内容：

- `waiting_for_input` / `waiting_for_auth` 状态识别
- 管理员提交任务输入并恢复执行
- Source 认证接口与认证输入提交接口
- Source 周期任务创建与更新
- 周期任务暂停与恢复
- Worker 定时触发调度 (`/internal/schedules/tick`)
- Source 运行锁：同一 Source 不并发执行

说明：

- 当前 cron 为 v1 简化推进策略（按小时推进），后续可替换完整 cron parser。
- 增量去重依赖外部 ID 和存储 key 唯一约束，满足阶段5去重主目标。
