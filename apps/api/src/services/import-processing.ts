import { FastifyInstance } from "fastify";

type RunnerEvent = Record<string, unknown>;

type ImportSummary = {
  programs: number;
  episodes: number;
  media: number;
  failed: number;
};

async function findProgramIdByExternal(app: FastifyInstance, sourceId: string, externalProgramId: string): Promise<string | null> {
  const result = await app.pg.query(
    `select id from programs
     where source_id = $1 and external_program_id = $2
     limit 1`,
    [sourceId, externalProgramId]
  );
  return (result.rowCount ?? 0) > 0 ? result.rows[0].id : null;
}

async function upsertProgram(app: FastifyInstance, sourceId: string, event: RunnerEvent): Promise<string | null> {
  const externalProgramId = typeof event.external_program_id === "string" ? event.external_program_id : "";
  const title = typeof event.title === "string" ? event.title : "";
  if (!externalProgramId || !title) {
    return null;
  }

  const description = typeof event.description === "string" ? event.description : null;

  const inserted = await app.pg.query(
    `insert into programs (
        id, source_id, external_program_id, title, description,
        publish_status, visibility_mode, created_at, updated_at
     ) values (
        gen_random_uuid(), $1, $2, $3, $4,
        'published', 'closed', now(), now()
     )
     on conflict (source_id, external_program_id)
     where source_id is not null and external_program_id is not null
     do update set
       title = excluded.title,
       description = excluded.description,
       updated_at = now()
     returning id`,
    [sourceId, externalProgramId, title, description]
  );

  return inserted.rows[0].id;
}

async function upsertEpisode(app: FastifyInstance, sourceId: string, event: RunnerEvent): Promise<string | null> {
  const externalEpisodeId = typeof event.external_episode_id === "string" ? event.external_episode_id : "";
  const programExternalId = typeof event.program_external_id === "string" ? event.program_external_id : "";
  const title = typeof event.title === "string" ? event.title : "";
  const publishedAt = typeof event.published_at === "string" ? event.published_at : "";

  if (!externalEpisodeId || !programExternalId || !title || !publishedAt) {
    return null;
  }

  const programId = await findProgramIdByExternal(app, sourceId, programExternalId);
  if (!programId) {
    return null;
  }

  const description = typeof event.description === "string" ? event.description : null;
  const durationSeconds = typeof event.duration_seconds === "number" ? Math.max(0, Math.trunc(event.duration_seconds)) : null;

  const inserted = await app.pg.query(
    `insert into episodes (
        id, program_id, external_episode_id, title, description,
        published_at, duration_seconds, is_published, is_hidden, created_at, updated_at
     ) values (
        gen_random_uuid(), $1, $2, $3, $4,
        $5::timestamptz, $6, true, false, now(), now()
     )
     on conflict (program_id, external_episode_id)
     do update set
       title = excluded.title,
       description = excluded.description,
       published_at = excluded.published_at,
       duration_seconds = excluded.duration_seconds,
       updated_at = now()
     returning id`,
    [programId, externalEpisodeId, title, description, publishedAt, durationSeconds]
  );

  return inserted.rows[0].id;
}

async function upsertMedia(app: FastifyInstance, sourceId: string, event: RunnerEvent): Promise<boolean> {
  const externalEpisodeId = typeof event.external_episode_id === "string" ? event.external_episode_id : "";
  const file = typeof event.file === "string" ? event.file : "";
  const contentType = typeof event.content_type === "string" ? event.content_type : "audio/mpeg";
  const size = typeof event.size === "number" ? event.size : 0;
  const checksum = typeof event.checksum === "string" ? event.checksum : null;
  const durationSeconds = typeof event.duration_seconds === "number" ? Math.max(0, Math.trunc(event.duration_seconds)) : null;

  if (!externalEpisodeId || !file) {
    return false;
  }

  const episodeRes = await app.pg.query(
    `select e.id
     from episodes e
     join programs p on p.id = e.program_id
     where p.source_id = $1 and e.external_episode_id = $2
     limit 1`,
    [sourceId, externalEpisodeId]
  );

  if ((episodeRes.rowCount ?? 0) === 0) {
    return false;
  }

  const episodeId = episodeRes.rows[0].id;

  await app.pg.query(
    `insert into media_assets (
        id, episode_id, storage_provider, storage_bucket, storage_key, original_filename,
        content_type, size_bytes, checksum, duration_seconds, status, created_at, updated_at
     ) values (
        gen_random_uuid(), $1, 'local', null, $2, $3,
        $4, $5, $6, $7, 'ready', now(), now()
     )
     on conflict (storage_key)
     do update set
       content_type = excluded.content_type,
       size_bytes = excluded.size_bytes,
       checksum = excluded.checksum,
       duration_seconds = coalesce(excluded.duration_seconds, media_assets.duration_seconds),
       status = 'ready',
       updated_at = now()`,
    [episodeId, file, file.split("/").pop() ?? file, contentType, size, checksum, durationSeconds]
  );

  return true;
}

export async function applyRunnerEvents(
  app: FastifyInstance,
  jobId: string,
  sourceId: string,
  events: RunnerEvent[]
): Promise<ImportSummary> {
  const summary: ImportSummary = { programs: 0, episodes: 0, media: 0, failed: 0 };

  for (const event of events) {
    const eventType = typeof event.type === "string" ? event.type : "log";
    const level = typeof event.level === "string" ? event.level : null;
    const message = typeof event.message === "string" ? event.message : null;

    await app.pg.query(
      `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now())`,
      [jobId, eventType, level, message, JSON.stringify(event)]
    );

    if (eventType === "program") {
      const ok = await upsertProgram(app, sourceId, event);
      if (ok) {
        summary.programs += 1;
      } else {
        summary.failed += 1;
      }
      continue;
    }

    if (eventType === "episode") {
      const ok = await upsertEpisode(app, sourceId, event);
      if (ok) {
        summary.episodes += 1;
      } else {
        summary.failed += 1;
      }
      continue;
    }

    if (eventType === "media_ready") {
      const ok = await upsertMedia(app, sourceId, event);
      if (ok) {
        summary.media += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  await app.pg.query(
    `insert into content_imports (id, job_id, source_id, summary_json, created_at)
     values (gen_random_uuid(), $1, $2, $3::jsonb, now())`,
    [jobId, sourceId, JSON.stringify(summary)]
  );

  return summary;
}
