import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { createOpaqueToken, hashOpaqueToken } from "../utils/security.js";
import { buildRssXml, parseRange, type FeedItem, type RssTemplate } from "../utils/rss.js";

async function assertFeedOwner(app: FastifyInstance, userId: string, feedId: string) {
  const feedRes = await app.pg.query(
    `select id, name, status from rss_feeds
     where id = $1 and user_id = $2 and revoked_at is null`,
    [feedId, userId]
  );

  if ((feedRes.rowCount ?? 0) === 0) {
    return null;
  }

  return feedRes.rows[0];
}

function buildRssUrl(token: string | null | undefined): string | null {
  return token ? `${env.API_BASE_URL}/rss/private/${token}.xml` : null;
}

function accessSummary(request: { ip: string; headers: Record<string, unknown> }): string {
  const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : "";
  return `${request.ip}|${userAgent.slice(0, 240)}`;
}

const defaultRssTemplate: RssTemplate = {
  description: "爱听就多听。",
  siteUrl: "https://podcast.mddxz.top",
  contact: "",
  notice: ""
};

async function loadRssTemplate(app: FastifyInstance): Promise<RssTemplate> {
  const res = await app.pg.query("select value_json from app_settings where key = 'rss_template'");
  if ((res.rowCount ?? 0) === 0) {
    return defaultRssTemplate;
  }
  const raw = (res.rows[0].value_json ?? {}) as Partial<RssTemplate>;
  return {
    description: raw.description ?? defaultRssTemplate.description,
    siteUrl: raw.siteUrl ?? defaultRssTemplate.siteUrl,
    contact: raw.contact ?? defaultRssTemplate.contact,
    notice: raw.notice ?? defaultRssTemplate.notice
  };
}

export async function rssRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me/rss-feeds", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const feeds = await app.pg.query(
      `select rf.id, rf.name, rf.status, rf.created_at, rf.updated_at, rf.rotated_at, rf.access_token,
              coalesce(program_stats.program_count, 0)::int as program_count,
              coalesce(event_stats.request_count, 0)::int as request_count,
              coalesce(event_stats.subscriber_estimate, 0)::int as subscriber_estimate,
              event_stats.last_accessed_at
       from rss_feeds rf
       left join lateral (
         select count(*) as program_count
         from rss_feed_programs rfp
         where rfp.rss_feed_id = rf.id
       ) program_stats on true
       left join lateral (
         select count(*) filter (where event_type in ('rss_fetch', 'media_fetch')) as request_count,
                count(distinct summary) filter (where event_type in ('rss_fetch', 'media_fetch')) as subscriber_estimate,
                max(created_at) as last_accessed_at
         from rss_feed_events rfe
         where rfe.rss_feed_id = rf.id
       ) event_stats on true
       where rf.user_id = $1 and rf.revoked_at is null
       order by rf.created_at desc`,
      [request.user.id]
    );

    return {
      items: feeds.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        rssUrl: buildRssUrl(row.access_token),
        programCount: row.program_count,
        requestCount: row.request_count,
        subscriberEstimate: row.subscriber_estimate,
        lastAccessedAt: row.last_accessed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rotatedAt: row.rotated_at
      }))
    };
  });

  app.get("/me/overview", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const [feedStats, libraryStats, feedRows] = await Promise.all([
      app.pg.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'active' and revoked_at is null)::int as active,
                count(*) filter (where status = 'revoked' or revoked_at is not null)::int as revoked
         from rss_feeds
         where user_id = $1`,
        [request.user.id]
      ),
      app.pg.query(
        `select count(distinct p.id)::int as programs,
                count(distinct e.id)::int as episodes
         from programs p
         join episodes e on e.program_id = p.id and e.is_published = true and e.is_hidden = false
         join media_assets m on m.episode_id = e.id and m.status = 'ready'
         where p.publish_status = 'published'
           and p.is_archived = false
           and (
             p.visibility_mode = 'all_registered_users'
             or (
               p.visibility_mode = 'audience_groups'
               and exists (
                 select 1
                 from program_audience_groups pag
                 join user_audience_groups uag on uag.audience_group_id = pag.audience_group_id
                 where pag.program_id = p.id and uag.user_id = $1
               )
             )
             or (
               p.visibility_mode = 'specific_users'
               and exists (
                 select 1
                 from program_user_grants pug
                 where pug.program_id = p.id and pug.user_id = $1
               )
             )
           )`,
        [request.user.id]
      ),
      app.pg.query(
        `select rf.id, rf.name, rf.status, rf.created_at, rf.updated_at, rf.rotated_at,
                coalesce(program_stats.program_count, 0)::int as program_count,
                coalesce(event_stats.request_count, 0)::int as request_count,
                coalesce(event_stats.subscriber_estimate, 0)::int as subscriber_estimate,
                event_stats.last_accessed_at
         from rss_feeds rf
         left join lateral (
           select count(*) as program_count
           from rss_feed_programs rfp
           where rfp.rss_feed_id = rf.id
         ) program_stats on true
         left join lateral (
           select count(*) filter (where event_type in ('rss_fetch', 'media_fetch')) as request_count,
                  count(distinct summary) filter (where event_type in ('rss_fetch', 'media_fetch')) as subscriber_estimate,
                  max(created_at) as last_accessed_at
           from rss_feed_events rfe
           where rfe.rss_feed_id = rf.id
         ) event_stats on true
         where rf.user_id = $1
         order by rf.updated_at desc
         limit 12`,
        [request.user.id]
      )
    ]);

    return {
      rss: feedStats.rows[0],
      library: libraryStats.rows[0],
      feeds: feedRows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        programCount: row.program_count,
        requestCount: row.request_count,
        subscriberEstimate: row.subscriber_estimate,
        lastAccessedAt: row.last_accessed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rotatedAt: row.rotated_at
      }))
    };
  });

  app.get("/admin/rss/overview", async (request, reply) => {
    if (!request.user?.isAdmin) {
      return reply.status(401).send({ message: "未登录管理员" });
    }

    const [statsRes, feedRows, template] = await Promise.all([
      app.pg.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'active' and revoked_at is null)::int as active,
                count(*) filter (where status = 'revoked' or revoked_at is not null)::int as revoked,
                coalesce((
                  select count(*) from rss_feed_events
                  where event_type in ('rss_fetch', 'media_fetch')
                    and created_at >= now() - interval '7 days'
                ), 0)::int as requests_7d
         from rss_feeds`
      ),
      app.pg.query(
        `select rf.id, rf.name, rf.status, rf.created_at, rf.updated_at, rf.rotated_at,
                u.email as owner_email,
                coalesce(program_stats.program_count, 0)::int as program_count,
                coalesce(event_stats.request_count, 0)::int as request_count,
                coalesce(event_stats.subscriber_estimate, 0)::int as subscriber_estimate,
                event_stats.last_accessed_at
         from rss_feeds rf
         join users u on u.id = rf.user_id
         left join lateral (
           select count(*) as program_count
           from rss_feed_programs rfp
           where rfp.rss_feed_id = rf.id
         ) program_stats on true
         left join lateral (
           select count(*) filter (where event_type in ('rss_fetch', 'media_fetch')) as request_count,
                  count(distinct summary) filter (where event_type in ('rss_fetch', 'media_fetch')) as subscriber_estimate,
                  max(created_at) as last_accessed_at
           from rss_feed_events rfe
           where rfe.rss_feed_id = rf.id
         ) event_stats on true
         order by rf.updated_at desc
         limit 100`
      ),
      loadRssTemplate(app)
    ]);

    return {
      stats: statsRes.rows[0],
      template,
      items: feedRows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        ownerEmail: row.owner_email,
        programCount: row.program_count,
        requestCount: row.request_count,
        subscriberEstimate: row.subscriber_estimate,
        lastAccessedAt: row.last_accessed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        rotatedAt: row.rotated_at
      }))
    };
  });

  app.patch("/admin/rss/template", async (request, reply) => {
    if (!request.user?.isAdmin) {
      return reply.status(401).send({ message: "未登录管理员" });
    }

    const body = z
      .object({
        description: z.string().max(1000),
        siteUrl: z.union([z.string().url(), z.literal("")]).default(""),
        contact: z.string().max(500).default(""),
        notice: z.string().max(1000).default("")
      })
      .parse(request.body);

    await app.pg.query(
      `insert into app_settings (key, value_json, updated_at)
       values ('rss_template', $1::jsonb, now())
       on conflict (key)
       do update set value_json = excluded.value_json, updated_at = now()`,
      [JSON.stringify(body)]
    );

    return { message: "RSS 公共模板已更新", template: body };
  });

  app.post("/me/rss-feeds", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }
    if (!request.user.emailVerifiedAt) {
      return reply.status(403).send({ message: "邮箱验证后才可创建 RSS" });
    }

    const body = z
      .object({
        name: z.string().min(1).max(64),
        programIds: z.array(z.string().uuid()).min(1)
      })
      .parse(request.body);

    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);

    const feedRes = await app.pg.query(
      `insert into rss_feeds (id, user_id, name, token_hash, access_token, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'active', now(), now())
       returning id, name, created_at`,
      [request.user.id, body.name, tokenHash, token]
    );

    const feed = feedRes.rows[0];
    for (const programId of body.programIds) {
      await app.pg.query(
        `insert into rss_feed_programs (rss_feed_id, program_id, created_at)
         values ($1, $2, now())
         on conflict do nothing`,
        [feed.id, programId]
      );
    }

    return reply.status(201).send({
      id: feed.id,
      name: feed.name,
      createdAt: feed.created_at,
      rssUrl: `${env.API_BASE_URL}/rss/private/${token}.xml`,
      token
    });
  });

  app.get("/me/rss-feeds/:feedId", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { feedId } = z.object({ feedId: z.string().uuid() }).parse(request.params);
    const feed = await assertFeedOwner(app, request.user.id, feedId);
    if (!feed) {
      return reply.status(404).send({ message: "RSS 不存在" });
    }

    const selectedRes = await app.pg.query(
      `select p.id, p.title
       from rss_feed_programs rfp
       join programs p on p.id = rfp.program_id
       where rfp.rss_feed_id = $1
       order by p.title asc`,
      [feedId]
    );

    return {
      id: feed.id,
      name: feed.name,
      status: feed.status,
      selectedPrograms: selectedRes.rows.map((row) => ({ id: row.id, title: row.title }))
    };
  });

  app.patch("/me/rss-feeds/:feedId", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { feedId } = z.object({ feedId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(64).optional(),
        programIds: z.array(z.string().uuid()).min(1).optional()
      })
      .parse(request.body);

    const feed = await assertFeedOwner(app, request.user.id, feedId);
    if (!feed) {
      return reply.status(404).send({ message: "RSS 不存在" });
    }

    if (body.name) {
      await app.pg.query("update rss_feeds set name = $1, updated_at = now() where id = $2", [body.name, feedId]);
    }

    if (body.programIds) {
      await app.pg.query("delete from rss_feed_programs where rss_feed_id = $1", [feedId]);
      for (const programId of body.programIds) {
        await app.pg.query(
          `insert into rss_feed_programs (rss_feed_id, program_id, created_at)
           values ($1, $2, now())`,
          [feedId, programId]
        );
      }
    }

    return { message: "RSS 已更新" };
  });

  app.delete("/me/rss-feeds/:feedId", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { feedId } = z.object({ feedId: z.string().uuid() }).parse(request.params);
    const feed = await assertFeedOwner(app, request.user.id, feedId);
    if (!feed) {
      return reply.status(404).send({ message: "RSS 不存在" });
    }

    await app.pg.query(
      `update rss_feeds
       set revoked_at = now(), status = 'revoked', updated_at = now()
       where id = $1`,
      [feedId]
    );

    return { message: "RSS 已删除" };
  });

  app.post("/me/rss-feeds/:feedId/rotate", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { feedId } = z.object({ feedId: z.string().uuid() }).parse(request.params);
    const feed = await assertFeedOwner(app, request.user.id, feedId);
    if (!feed) {
      return reply.status(404).send({ message: "RSS 不存在" });
    }

    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    await app.pg.query(
      `update rss_feeds
       set token_hash = $1, access_token = $2, rotated_at = now(), updated_at = now()
       where id = $3`,
      [tokenHash, token, feedId]
    );

    return {
      message: "RSS Token 已轮换",
      rssUrl: `${env.API_BASE_URL}/rss/private/${token}.xml`,
      token
    };
  });

  app.get("/rss/private/:token.xml", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    const tokenHash = hashOpaqueToken(token);

    const feedRes = await app.pg.query(
      `select id, user_id, name
       from rss_feeds
       where token_hash = $1 and revoked_at is null and status = 'active'`,
      [tokenHash]
    );

    if ((feedRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "RSS 不存在" });
    }

    const feed = feedRes.rows[0];
    await app.pg.query(
      `insert into rss_feed_events (id, rss_feed_id, event_type, summary, created_at)
       values (gen_random_uuid(), $1, 'rss_fetch', $2, now())`,
      [feed.id, accessSummary(request)]
    );

    const itemRes = await app.pg.query(
            `select e.id as episode_id, e.title as episode_title, e.description as episode_description,
              e.published_at, e.duration_seconds, m.size_bytes, m.content_type,
              p.title as program_title, p.cover_image_url
       from rss_feed_programs rfp
       join programs p on p.id = rfp.program_id
       join episodes e on e.program_id = p.id
       join media_assets m on m.episode_id = e.id and m.status = 'ready'
       join users u on u.id = $2
       where rfp.rss_feed_id = $1
         and p.publish_status = 'published'
         and p.is_archived = false
         and (
           p.visibility_mode = 'all_registered_users'
           or (
             p.visibility_mode = 'audience_groups'
             and exists (
               select 1
               from program_audience_groups pag
               join user_audience_groups uag on uag.audience_group_id = pag.audience_group_id
               where pag.program_id = p.id and uag.user_id = $2
             )
           )
           or (
             p.visibility_mode = 'specific_users'
             and exists (
               select 1
               from program_user_grants pug
               where pug.program_id = p.id and pug.user_id = $2
             )
           )
         )
         and e.is_published = true
         and e.is_hidden = false
         and u.email_verified_at is not null
        order by e.published_at desc, e.id desc`,
      [feed.id, feed.user_id]
    );

    const items: FeedItem[] = itemRes.rows.map((row) => ({
      episodeId: row.episode_id,
      title: row.episode_title,
      description: row.episode_description,
      publishedAt: row.published_at,
      audioUrl: `${env.API_BASE_URL}/rss/private/${token}/episodes/${row.episode_id}/media`,
      mediaLength: Number(row.size_bytes),
      mediaType: row.content_type,
      programTitle: row.program_title,
      programImageUrl: row.cover_image_url,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds)
    }));

    const rssXml = buildRssXml(feed.name, `${env.API_BASE_URL}/rss/private/${token}.xml`, items, await loadRssTemplate(app));
    reply.type("application/rss+xml; charset=utf-8");
    return reply.send(rssXml);
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/rss/private/:token/episodes/:episodeId/media",
    handler: async (request, reply) => {
      const { token, episodeId } = z.object({ token: z.string().min(20), episodeId: z.string().uuid() }).parse(request.params);
      const tokenHash = hashOpaqueToken(token);

      const mediaRes = await app.pg.query(
        `select m.storage_provider, m.storage_key, m.content_type, m.size_bytes, m.updated_at,
                p.visibility_mode, p.publish_status, p.is_archived, e.is_published, e.is_hidden,
                rf.id as feed_id
         from rss_feeds rf
         join rss_feed_programs rfp on rfp.rss_feed_id = rf.id
         join programs p on p.id = rfp.program_id
         join episodes e on e.program_id = p.id and e.id = $2
         join media_assets m on m.episode_id = e.id and m.status = 'ready'
         join users u on u.id = rf.user_id
         where rf.token_hash = $1
           and rf.status = 'active'
           and rf.revoked_at is null
           and (
             p.visibility_mode = 'all_registered_users'
             or (
               p.visibility_mode = 'audience_groups'
               and exists (
                 select 1
                 from program_audience_groups pag
                 join user_audience_groups uag on uag.audience_group_id = pag.audience_group_id
                 where pag.program_id = p.id and uag.user_id = rf.user_id
               )
             )
             or (
               p.visibility_mode = 'specific_users'
               and exists (
                 select 1
                 from program_user_grants pug
                 where pug.program_id = p.id and pug.user_id = rf.user_id
               )
             )
           )
           and u.email_verified_at is not null`,
        [tokenHash, episodeId]
      );

      if ((mediaRes.rowCount ?? 0) === 0) {
        return reply.status(404).send({ message: "媒体不存在" });
      }

      const row = mediaRes.rows[0];
      if (row.publish_status !== "published" || row.is_archived || !row.is_published || row.is_hidden) {
        return reply.status(404).send({ message: "媒体不存在" });
      }

      if (row.storage_provider !== "local") {
        return reply.status(501).send({ message: "当前仅支持本地存储读取" });
      }

      await app.pg.query(
        `insert into rss_feed_events (id, rss_feed_id, event_type, summary, created_at)
         values (gen_random_uuid(), $1, 'media_fetch', $2, now())`,
        [row.feed_id, accessSummary(request)]
      );

      const absolutePath = resolve(process.cwd(), env.MEDIA_LOCAL_ROOT, row.storage_key);

      let fileStat;
      try {
        fileStat = statSync(absolutePath);
      } catch {
        return reply.status(404).send({ message: "媒体文件缺失" });
      }

      const size = Number(row.size_bytes || fileStat.size);
      const etagDigest = createHash("sha1").update(String(row.storage_key)).digest("hex");
      const etag = `"${etagDigest}-${size}"`;
      const lastModified = new Date(row.updated_at).toUTCString();

      reply.header("Accept-Ranges", "bytes");
      reply.header("ETag", etag);
      reply.header("Last-Modified", lastModified);
      reply.header("Content-Type", row.content_type);

      const rangeHeader = request.headers.range;
      if (rangeHeader) {
        const parsed = parseRange(rangeHeader, size);
        if (!parsed) {
          reply.header("Content-Range", `bytes */${size}`);
          return reply.status(416).send();
        }

        reply.status(206);
        reply.header("Content-Range", `bytes ${parsed.start}-${parsed.end}/${size}`);
        reply.header("Content-Length", String(parsed.end - parsed.start + 1));

        if (request.method === "HEAD") {
          return reply.send();
        }

        const stream = createReadStream(absolutePath, { start: parsed.start, end: parsed.end });
        return reply.send(stream);
      }

      reply.header("Content-Length", String(size));
      if (request.method === "HEAD") {
        return reply.send();
      }

      return reply.send(createReadStream(absolutePath));
    }
  });
}
