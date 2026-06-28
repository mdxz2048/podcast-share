create table if not exists app_settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value_json, updated_at)
values (
  'rss_template',
  '{"description":"爱听就多听。","siteUrl":"https://podcast.mddxz.top","contact":"","notice":""}'::jsonb,
  now()
)
on conflict (key) do nothing;
