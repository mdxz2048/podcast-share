import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSession, revokeSession } from "../services/session.js";
import { verifyPassword } from "../utils/security.js";
import { env } from "../config.js";

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/auth/login", async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body);

    const userRes = await app.pg.query(
      `select u.id, u.email, u.password_hash
       from users u
       join user_roles ur on ur.user_id = u.id and ur.role = 'admin'
       where u.email = $1`,
      [body.email.toLowerCase()]
    );

    if (userRes.rowCount === 0) {
      return reply.status(401).send({ message: "管理员账号或密码错误" });
    }

    const user = userRes.rows[0];
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      return reply.status(401).send({ message: "管理员账号或密码错误" });
    }

    const token = await createSession(user.id);
    reply.setCookie("ph_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production"
    });

    return reply.send({ message: "管理员登录成功" });
  });

  app.post("/admin/auth/logout", async (request, reply) => {
    const token = request.cookies["ph_session"];
    if (token) {
      await revokeSession(token);
    }
    reply.clearCookie("ph_session", { path: "/" });
    return reply.send({ message: "管理员已退出" });
  });

  app.get("/admin/me", async (request, reply) => {
    if (!request.user || !request.user.isAdmin) {
      return reply.status(401).send({ message: "未登录管理员" });
    }

    return {
      authenticated: true,
      user: {
        id: request.user.id,
        email: request.user.email
      }
    };
  });
}
