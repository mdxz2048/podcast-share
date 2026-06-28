alter table rss_feeds add column if not exists access_token text;

create index if not exists idx_rss_feed_events_feed_created
  on rss_feed_events (rss_feed_id, created_at desc);
