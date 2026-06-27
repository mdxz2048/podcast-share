import { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendMail } from "../services/mailer.js";
import { createSession, revokeSession } from "../services/session.js";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../utils/security.js";
import { env } from "../config.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await app.pg.query("select id from users where email = $1", [body.email.toLowerCase()]);

    if ((existing.rowCount ?? 0) > 0) {
      return reply.status(409).send({ message: "该邮箱已注册" });
    }

    const passwordHash = await hashPassword(body.password);
    const userRes = await app.pg.query(
      `insert into users (id, email, password_hash, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, 'active', now(), now()) returning id, email`,
      [body.email.toLowerCase(), passwordHash]
    );

    await app.pg.query(
      `insert into user_roles (id, user_id, role, created_at)
       values (gen_random_uuid(), $1, 'user', now())`,
      [userRes.rows[0].id]
    );

    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    await app.pg.query(
      `insert into email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
       values (gen_random_uuid(), $1, $2, now() + interval '24 hours', now())`,
      [userRes.rows[0].id, tokenHash]
    );

    const verifyUrl = `${env.APP_BASE_URL}/verify-email?token=${token}`;
    await sendMail(body.email, "Podcast Hub 邮箱验证", `请打开链接完成验证：${verifyUrl}`);

    return reply.status(201).send({ message: "注册成功，请前往邮箱完成验证" });
  });

  app.post("/auth/verify-email", async (request, reply) => {
    const body = z.object({ token: z.string().min(20) }).parse(request.body);
    const tokenHash = hashOpaqueToken(body.token);

    const tokenRes = await app.pg.query(
      `select id, user_id, expires_at from email_verification_tokens
       where token_hash = $1 and used_at is null`,
      [tokenHash]
    );

    if (tokenRes.rowCount === 0) {
      return reply.status(400).send({ message: "验证链接无效" });
    }

    const tokenRow = tokenRes.rows[0];
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return reply.status(400).send({ message: "验证链接已过期" });
    }

    await app.pg.query("update users set email_verified_at = now(), updated_at = now() where id = $1", [tokenRow.user_id]);
    await app.pg.query("update email_verification_tokens set used_at = now() where id = $1", [tokenRow.id]);

    return reply.send({ message: "邮箱验证成功" });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const userRes = await app.pg.query("select id, email, password_hash, email_verified_at from users where email = $1", [
      body.email.toLowerCase()
    ]);

    if (userRes.rowCount === 0) {
      return reply.status(401).send({ message: "邮箱或密码错误" });
    }

    const user = userRes.rows[0];
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      return reply.status(401).send({ message: "邮箱或密码错误" });
    }

    const token = await createSession(user.id);
    reply.setCookie("ph_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production"
    });

    return reply.send({
      message: "登录成功",
      user: {
        id: user.id,
        email: user.email,
        emailVerified: Boolean(user.email_verified_at)
      }
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies["ph_session"];
    if (token) {
      await revokeSession(token);
    }

    reply.clearCookie("ph_session", { path: "/" });
    return reply.send({ message: "已退出登录" });
  });

  app.get("/auth/me", async (request) => {
    if (!request.user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: request.user.id,
        email: request.user.email,
        emailVerified: Boolean(request.user.emailVerifiedAt)
      }
    };
  });

  app.post("/auth/forgot-password", async (request, reply) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);
    const userRes = await app.pg.query("select id from users where email = $1", [body.email.toLowerCase()]);

    if ((userRes.rowCount ?? 0) > 0) {
      const token = createOpaqueToken();
      const tokenHash = hashOpaqueToken(token);
      await app.pg.query(
        `insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         values (gen_random_uuid(), $1, $2, now() + interval '1 hour', now())`,
        [userRes.rows[0].id, tokenHash]
      );
      const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${token}`;
      await sendMail(body.email, "Podcast Hub 重置密码", `请打开链接重置密码：${resetUrl}`);
    }

    return reply.send({ message: "如果邮箱存在，我们已发送重置链接" });
  });

  app.post("/auth/reset-password", async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(8)
      })
      .parse(request.body);

    const tokenHash = hashOpaqueToken(body.token);
    const tokenRes = await app.pg.query(
      `select id, user_id, expires_at from password_reset_tokens
       where token_hash = $1 and used_at is null`,
      [tokenHash]
    );

    if (tokenRes.rowCount === 0) {
      return reply.status(400).send({ message: "重置链接无效" });
    }

    const row = tokenRes.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return reply.status(400).send({ message: "重置链接已过期" });
    }

    const passwordHash = await hashPassword(body.password);
    await app.pg.query("update users set password_hash = $1, updated_at = now() where id = $2", [passwordHash, row.user_id]);
    await app.pg.query("update password_reset_tokens set used_at = now() where id = $1", [row.id]);

    return reply.send({ message: "密码重置成功" });
  });
}
