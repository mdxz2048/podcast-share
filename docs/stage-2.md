# 阶段 2 说明

已实现内容：

- Program / Episode / Media / RSS 数据模型迁移
- 用户节目目录、节目详情和单集查询 API
- 用户 RSS Feed 管理 API（创建、修改、删除、轮换）
- 私有 RSS XML 输出（按发布时间倒序混排）
- 私有媒体访问接口（GET / HEAD / Range）
- 管理员节目开放/关闭与可见范围基础 API
- 用户端节目与 RSS 页面接入

说明：

- 当前可见范围前端与主查询逻辑重点支持 `all_registered_users` 与 `closed`。
- `audience_groups` 和 `specific_users` 数据结构已预留，后续阶段继续完善规则引擎。
