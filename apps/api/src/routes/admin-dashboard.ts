import { FastifyInstance } from "fastify";

function assertAdmin(request: { user: { isAdmin: boolean } | null }, reply: any): boolean {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

export async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/dashboard", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const [connectorRes, sourceRes, contentRes, jobRes, recentJobsRes, rssRes] = await Promise.all([
      app.pg.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'enabled')::int as enabled,
                count(*) filter (
                  where exists (select 1 from connector_sources s where s.connector_id = connectors.id)
                )::int as in_use
         from connectors`
      ),
      app.pg.query(
        `select count(*)::int as total,
                count(*) filter (where enabled)::int as enabled,
                count(*) filter (
                  where exists (
                    select 1 from import_jobs j
                    where j.source_id = connector_sources.id
                      and j.status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth')
                  )
                )::int as running
         from connector_sources`
      ),
      app.pg.query(
        `select (select count(*)::int from programs where is_archived = false) as programs,
                (select count(*)::int from episodes) as episodes,
                (select count(*)::int from media_assets where status = 'ready') as media,
                coalesce((select sum(size_bytes)::bigint from media_assets where status = 'ready'), 0)::bigint as media_bytes`
      ),
      app.pg.query(
        `select count(*) filter (where status = 'completed')::int as completed,
                count(*) filter (where status in ('failed', 'timeout'))::int as failed,
                count(*) filter (where status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth'))::int as running
         from import_jobs
         where created_at >= now() - interval '7 days'`
      ),
      app.pg.query(
        `select j.id, j.status, j.trigger_type, j.discovered_programs, j.discovered_episodes, j.imported_media,
                j.failed_count, j.created_at, j.updated_at,
                s.id as source_id, s.name as source_name,
                c.display_name as connector_display_name
         from import_jobs j
         join connector_sources s on s.id = j.source_id
         join connectors c on c.id = j.connector_id
         order by j.created_at desc
         limit 8`
      ),
      app.pg.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'active' and revoked_at is null)::int as active,
                count(*) filter (where status = 'revoked' or revoked_at is not null)::int as revoked
         from rss_feeds`
      )
    ]);

    return {
      connectors: connectorRes.rows[0],
      sources: sourceRes.rows[0],
      content: contentRes.rows[0],
      jobs7d: jobRes.rows[0],
      rss: rssRes.rows[0],
      recentJobs: recentJobsRes.rows.map((row) => ({
        id: row.id,
        status: row.status,
        triggerType: row.trigger_type,
        discoveredPrograms: row.discovered_programs,
        discoveredEpisodes: row.discovered_episodes,
        importedMedia: row.imported_media,
        failedCount: row.failed_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: {
          id: row.source_id,
          name: row.source_name
        },
        connector: {
          displayName: row.connector_display_name
        }
      }))
    };
  });
}
