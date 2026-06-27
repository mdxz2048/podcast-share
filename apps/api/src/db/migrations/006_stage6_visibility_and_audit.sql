create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references users(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs (created_at desc);
create index if not exists idx_admin_audit_logs_target on admin_audit_logs (target_type, target_id, created_at desc);
