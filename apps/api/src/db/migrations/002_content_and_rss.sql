create table if not exists program_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  visibility_mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  title text not null,
  description text,
  cover_image_url text,
  source_label text,
  publish_status text not null default 'published',
  visibility_mode text not null default 'closed',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programs_visibility on programs (visibility_mode, publish_status);

create table if not exists program_audience_groups (
  program_id uuid not null references programs(id) on delete cascade,
  audience_group_id uuid not null references audience_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (program_id, audience_group_id)
);

create table if not exists program_user_grants (
  program_id uuid not null references programs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (program_id, user_id)
);

create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  external_episode_id text,
  title text not null,
  description text,
  published_at timestamptz not null,
  duration_seconds integer,
  is_published boolean not null default true,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, external_episode_id)
);

create index if not exists idx_episodes_program_published on episodes (program_id, published_at desc);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  storage_provider text not null default 'local',
  storage_bucket text,
  storage_key text not null unique,
  original_filename text,
  content_type text not null,
  size_bytes bigint not null,
  duration_seconds integer,
  checksum text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_assets_episode_status on media_assets (episode_id, status);

create table if not exists rss_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists rss_feed_programs (
  rss_feed_id uuid not null references rss_feeds(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rss_feed_id, program_id)
);

create table if not exists rss_feed_events (
  id uuid primary key default gen_random_uuid(),
  rss_feed_id uuid not null references rss_feeds(id) on delete cascade,
  event_type text not null,
  summary text,
  created_at timestamptz not null default now()
);
