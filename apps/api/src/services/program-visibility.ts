import { FastifyInstance } from "fastify";

export async function canUserAccessProgram(app: FastifyInstance, userId: string, programId: string): Promise<boolean> {
  const res = await app.pg.query(
    `select p.id
     from programs p
     where p.id = $1
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
     limit 1`,
    [programId, userId]
  );

  return (res.rowCount ?? 0) > 0;
}
