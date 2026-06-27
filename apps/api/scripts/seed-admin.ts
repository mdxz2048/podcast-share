import { env } from "../src/config.js";
import { pool } from "../src/db/pool.js";
import { hashPassword } from "../src/utils/security.js";

async function main() {
  const email = env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD);

  const existing = await pool.query("select id from users where email = $1", [email]);
  let userId: string;

  if (existing.rowCount === 0) {
    const inserted = await pool.query(
      `insert into users (id, email, password_hash, email_verified_at, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, now(), 'active', now(), now()) returning id`,
      [email, passwordHash]
    );
    userId = inserted.rows[0].id;
  } else {
    userId = existing.rows[0].id;
    await pool.query("update users set password_hash = $1, updated_at = now() where id = $2", [passwordHash, userId]);
  }

  await pool.query(
    `insert into user_roles (id, user_id, role, created_at)
     values (gen_random_uuid(), $1, 'admin', now())
     on conflict (user_id, role) do nothing`,
    [userId]
  );

  console.log(`admin seeded: ${email}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
