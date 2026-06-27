# podcast-hub

Podcast Hub v1 monorepo（阶段 1：工程与认证基础）。

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 复制环境变量

```bash
cp .env.example .env
```

3. 启动基础依赖（PostgreSQL / Redis / Mailpit）

```bash
docker compose -f deploy/compose/docker-compose.yml up -d postgres redis mailpit
```

4. 执行数据库迁移与管理员初始化

```bash
pnpm db:migrate
pnpm db:seed
```

5. 启动开发服务

```bash
pnpm dev
```

- 用户端: http://localhost:3000
- API: http://localhost:4000
- Mailpit: http://localhost:8025

## 阶段 1 已实现

- Monorepo 工程结构
- Fastify API 基础服务
- 用户注册 / 验证 / 登录 / 退出 / 重置密码
- 管理员独立登录接口
- Next.js 中文页面基础布局（用户端 + 后台入口）
- PostgreSQL 迁移脚本
- Docker Compose 基础依赖

## 阶段 2 已实现

- Program / Episode / Media / RSS 数据模型迁移
- 用户节目目录、节目详情、单集查询 API
- 用户 RSS 创建、编辑、删除、Token 轮换 API
- 私有 RSS XML 输出（按发布时间倒序混排）
- 私有音频访问（GET / HEAD / HTTP Range）
- 管理员节目开放、关闭、可见范围基础 API
- 用户端节目与 RSS 页面接入

## 管理员初始化

默认从 `.env` 读取：

- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

执行：

```bash
pnpm db:seed
```

## 测试

```bash
pnpm --filter @podcast-hub/api test
```

## 目录概览

- `apps/web`: Next.js 用户端和后台页面骨架
- `apps/api`: Fastify API + 迁移 + seed
- `apps/worker`: 队列服务占位
- `apps/runner`: Runner 服务占位
- `deploy/compose`: 本地 Docker Compose
- `docs`: 设计文档

## 阶段文档

- `docs/stage-1.md`
- `docs/stage-2.md`
