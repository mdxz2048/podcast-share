# 阶段 3 说明

已实现内容：

- Connector ZIP 上传 API（仅管理员）
- ZIP 静态安全校验（必需文件、路径安全、禁用文件名、禁用二进制）
- manifest.yaml 解析与 JSON Schema 校验
- v1 仅支持 Python Connector
- Connector 审核启用 / 禁用
- Source 创建、查看、更新、启用、禁用
- Source 输入配置与 Secret 分离存储
- Secret 加密存储（AES-256-GCM）
- 管理员前端页面：Connector 列表、上传、详情；Source 列表、详情

当前范围：

- 阶段 3 仅覆盖 ZIP 与 Source 配置管理。
- 手动运行、任务状态机、JSONL 导入属于阶段 4。
