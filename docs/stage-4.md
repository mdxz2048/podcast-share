# 阶段 4 说明

已实现内容：

- Runner 独立服务（HTTP）
- 手动运行 Source：`POST /admin/sources/{sourceId}/run`
- Import Job 状态与事件记录
- Connector JSONL 输出导入 Program / Episode / Media
- 管理员任务列表与任务详情 API
- 管理员任务列表与任务详情页面
- Runner 子进程超时、错误处理与强制清理
- API 调用 Runner 超时收敛与任务终态写入
- 已捕获的 JSONL 事件和媒体文件在超时场景下仍会导入

当前限制：

- 阶段 4 为同步触发执行，重点验证链路可用。
- `waiting_for_input` / `waiting_for_auth` 的恢复执行将在阶段 5 完整实现。
