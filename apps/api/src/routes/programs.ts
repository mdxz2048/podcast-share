import { FastifyInstance } from "fastify";
import { z } from "zod";
import { canUserAccessProgram } from "../services/program-visibility.js";

export async function programRoutes(app: FastifyInstance): Promise<void> {
  app.get("/programs", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const userRes = await app.pg.query("select email_verified_at from users where id = $1", [request.user.id]);
    if ((userRes.rowCount ?? 0) === 0) {
      return reply.status(401).send({ message: "用户不存在" });
    }

    const rows = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.updated_at, p.visibility_mode,
              count(distinct e.id) as episode_count,
              max(e.published_at) as latest_episode_published_at
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
         )
       group by p.id
       order by max(e.published_at) desc`,
      [request.user.id]
    );

    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        coverImageUrl: row.cover_image_url,
        episodeCount: Number(row.episode_count),
        updatedAt: row.updated_at,
        latestEpisodePublishedAt: row.latest_episode_published_at
      }))
    };
  });

  app.get("/programs/:programId", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);

    const userRes = await app.pg.query("select email_verified_at from users where id = $1", [request.user.id]);
    if ((userRes.rowCount ?? 0) === 0) {
      return reply.status(401).send({ message: "用户不存在" });
    }

    const programRes = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.updated_at
       from programs p
       where p.id = $1 and p.publish_status = 'published' and p.is_archived = false`,
      [programId]
    );

    if ((programRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const program = programRes.rows[0];
    const canAccess = await canUserAccessProgram(app, request.user.id, programId);
    if (!canAccess) {
      return reply.status(403).send({ message: "无权限访问该节目" });
    }

    return {
      id: program.id,
      title: program.title,
      description: program.description,
      coverImageUrl: program.cover_image_url,
      updatedAt: program.updated_at
    };
  });

  app.get("/programs/:programId/episodes", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const userRes = await app.pg.query("select email_verified_at from users where id = $1", [request.user.id]);
    if ((userRes.rowCount ?? 0) === 0) {
      return reply.status(401).send({ message: "用户不存在" });
    }

    const programRes = await app.pg.query(
      `select id from programs
       where id = $1 and publish_status = 'published' and is_archived = false`,
      [programId]
    );
    if ((programRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const canAccess = await canUserAccessProgram(app, request.user.id, programId);
    if (!canAccess) {
      return reply.status(403).send({ message: "无权限访问该节目" });
    }

    const episodesRes = await app.pg.query(
      `select e.id, e.title, e.description, e.published_at, e.duration_seconds,
              m.status as media_status, m.size_bytes
       from episodes e
       left join media_assets m on m.episode_id = e.id and m.status = 'ready'
       where e.program_id = $1 and e.is_published = true and e.is_hidden = false
       order by e.published_at desc`,
      [programId]
    );

    return {
      items: episodesRes.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        publishedAt: row.published_at,
        durationSeconds: row.duration_seconds,
        mediaStatus: row.media_status ?? "missing",
        mediaSizeBytes: row.size_bytes ?? null
      }))
    };
  });

  app.get("/episodes/:episodeId", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: "请先登录" });
    }

    const { episodeId } = z.object({ episodeId: z.string().uuid() }).parse(request.params);

    const rowRes = await app.pg.query(
            `select e.id, e.title, e.description, e.published_at, e.duration_seconds,
              p.id as program_id, p.publish_status, p.is_archived
       from episodes e
       join programs p on p.id = e.program_id
       where e.id = $1 and e.is_published = true and e.is_hidden = false`,
      [episodeId]
    );

    if ((rowRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "单集不存在" });
    }

    const userRes = await app.pg.query("select email_verified_at from users where id = $1", [request.user.id]);
    if ((userRes.rowCount ?? 0) === 0) {
      return reply.status(401).send({ message: "用户不存在" });
    }

    const row = rowRes.rows[0];
    const canAccess = await canUserAccessProgram(app, request.user.id, row.program_id);
    if (row.publish_status !== "published" || row.is_archived || !canAccess) {
      return reply.status(403).send({ message: "无权限访问该单集" });
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      publishedAt: row.published_at,
      durationSeconds: row.duration_seconds
    };
  });
}
