# 备份与恢复（v1 基础）

## PostgreSQL 备份

```bash
docker compose -f deploy/compose/docker-compose.yml exec -T postgres pg_dump -U postgres podcast_hub > backup.sql
```

## PostgreSQL 恢复

```bash
cat backup.sql | docker compose -f deploy/compose/docker-compose.yml exec -T postgres psql -U postgres -d podcast_hub
```

## 媒体目录备份

v1 阶段 1 尚未落地真实媒体导入。阶段 2 将补充 local/minio 媒体对象备份策略。
