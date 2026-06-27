create table if not exists connectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  status text not null default 'pending_review',
  latest_version_id uuid,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id)
);

create table if not exists connector_versions (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  version text not null,
  manifest_json jsonb not null,
  run_modes_json jsonb not null,
  authentication_json jsonb not null,
  inputs_json jsonb not null,
  secrets_json jsonb,
  package_path text not null,
  package_sha256 text not null,
  status text not null default 'pending_review',
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (connector_id, version)
);

create index if not exists idx_connector_versions_connector on connector_versions (connector_id, created_at desc);

create table if not exists connector_packages (
  id uuid primary key default gen_random_uuid(),
  connector_version_id uuid not null references connector_versions(id) on delete cascade,
  storage_provider text not null default 'local',
  storage_key text not null unique,
  size_bytes bigint not null,
  checksum text not null,
  created_at timestamptz not null default now()
);

create table if not exists connector_events (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  connector_version_id uuid references connector_versions(id) on delete set null,
  event_type text not null,
  summary text,
  actor_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists connector_sources (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  connector_version_id uuid not null references connector_versions(id),
  name text not null,
  enabled boolean not null default false,
  auth_status text not null default 'not_configured',
  auth_unattended_ready boolean not null default false,
  run_policy text not null default 'manual_only',
  last_success_sync_at timestamptz,
  last_job_status text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_id, name)
);

create table if not exists connector_source_configs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references connector_sources(id) on delete cascade,
  config_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id)
);

create table if not exists secret_records (
  id uuid primary key default gen_random_uuid(),
  secret_kind text not null,
  cipher_text text not null,
  key_version text not null default 'v1',
  status text not null default 'configured',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_secret_bindings (
  source_id uuid not null references connector_sources(id) on delete cascade,
  secret_key text not null,
  secret_record_id uuid not null references secret_records(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, secret_key)
);

create table if not exists auth_profiles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references connector_sources(id) on delete cascade,
  mode text not null,
  status text not null,
  summary text,
  updated_at timestamptz not null default now(),
  unique (source_id)
);
