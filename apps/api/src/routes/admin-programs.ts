import { FastifyInstance } from "fastify";
import { z } from "zod";

function assertAdmin(request: { user: { isAdmin: boolean } | null }, reply: any): boolean {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

export async function adminProgramRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/programs", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const programs = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.publish_status, p.visibility_mode,
              p.updated_at, count(distinct e.id) as episode_count,
              count(distinct m.id) as media_count
       from programs p
       left join episodes e on e.program_id = p.id
       left join media_assets m on m.episode_id = e.id and m.status = 'ready'
       group by p.id
       order by p.updated_at desc`
    );

    return {
      items: programs.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        coverImageUrl: row.cover_image_url,
        publishStatus: row.publish_status,
        visibilityMode: row.visibility_mode,
        episodeCount: Number(row.episode_count),
        mediaCount: Number(row.media_count),
        updatedAt: row.updated_at
      }))
    };
  });

  app.get("/admin/programs/:programId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const program = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.publish_status, p.visibility_mode, p.updated_at
       from programs p where p.id = $1`,
      [programId]
    );

    if ((program.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const episodes = await app.pg.query(
      `select e.id, e.title, e.published_at, e.is_hidden, e.is_published,
              m.status as media_status, m.size_bytes
       from episodes e
       left join media_assets m on m.episode_id = e.id
       where e.program_id = $1
       order by e.published_at desc`,
      [programId]
    );

    return {
      ...program.rows[0],
      episodes: episodes.rows
    };
  });

  app.patch("/admin/programs/:programId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        publishStatus: z.enum(["draft", "published", "archived"]).optional(),
        visibilityMode: z.enum(["closed", "all_registered_users", "audience_groups", "specific_users"]).optional()
      })
      .parse(request.body);

    const current = await app.pg.query("select id from programs where id = $1", [programId]);
    if ((current.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    await app.pg.query(
      `update programs
       set title = coalesce($1, title),
           description = coalesce($2, description),
           publish_status = coalesce($3, publish_status),
           visibility_mode = coalesce($4, visibility_mode),
           updated_at = now()
       where id = $5`,
      [body.title ?? null, body.description ?? null, body.publishStatus ?? null, body.visibilityMode ?? null, programId]
    );

    return { message: "节目已更新" };
  });

  app.post("/admin/programs/:programId/open", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    await app.pg.query(
      `update programs
       set publish_status = 'published', visibility_mode = 'all_registered_users', updated_at = now()
       where id = $1`,
      [programId]
    );

    return { message: "节目已开放" };
  });

  app.post("/admin/programs/:programId/close", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    await app.pg.query(
      `update programs
       set visibility_mode = 'closed', updated_at = now()
       where id = $1`,
      [programId]
    );

    return { message: "节目已关闭" };
  });

  app.post("/admin/programs/:programId/visibility", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        visibilityMode: z.enum(["closed", "all_registered_users", "audience_groups", "specific_users"])
      })
      .parse(request.body);

    await app.pg.query("update programs set visibility_mode = $1, updated_at = now() where id = $2", [body.visibilityMode, programId]);

    return { message: "可见范围已更新" };
  });
}
