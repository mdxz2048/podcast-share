create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null,
  unique(user_id, role)
);

create table if not exists email_verification_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null
);

create table if not exists password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null
);

create table if not exists user_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists audience_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_audience_groups (
  user_id uuid not null references users(id) on delete cascade,
  audience_group_id uuid not null references audience_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, audience_group_id)
);
