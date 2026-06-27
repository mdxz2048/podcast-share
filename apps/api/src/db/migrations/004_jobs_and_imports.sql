alter table programs add column if not exists external_program_id text;
create unique index if not exists uq_programs_source_external_program
  on programs (source_id, external_program_id)
  where source_id is not null and external_program_id is not null;

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references connector_sources(id) on delete cascade,
  connector_id uuid not null references connectors(id),
  connector_version_id uuid not null references connector_versions(id),
  trigger_type text not null,
  status text not null,
  started_at timestamptz,
  ended_at timestamptz,
  input_summary_json jsonb,
  auth_summary_json jsonb,
  progress_json jsonb,
  output_summary_json jsonb,
  discovered_programs integer not null default 0,
  discovered_episodes integer not null default 0,
  imported_media integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_jobs_source_created on import_jobs (source_id, created_at desc);
create index if not exists idx_import_jobs_status on import_jobs (status, created_at desc);

create table if not exists import_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  event_type text not null,
  level text,
  message text,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_job_events_job_created on import_job_events (job_id, created_at asc);

create table if not exists import_job_inputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  input_summary_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists import_job_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  output_summary_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists import_job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  artifact_type text not null,
  artifact_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists content_external_ids (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references connector_sources(id) on delete cascade,
  entity_type text not null,
  external_id text not null,
  internal_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id)
);

create table if not exists content_imports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  source_id uuid not null references connector_sources(id) on delete cascade,
  summary_json jsonb,
  created_at timestamptz not null default now()
);
