create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references connector_sources(id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  schedule_type text not null,
  cron_expression text,
  minimum_interval_minutes integer not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id)
);

create index if not exists idx_schedules_next_run on schedules (enabled, paused, next_run_at);
