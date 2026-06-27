import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { findSession } from "../services/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: null | {
      id: string;
      email: string;
      emailVerifiedAt: string | null;
      isAdmin: boolean;
    };
  }
}

async function authPluginImpl(app: FastifyInstance): Promise<void> {
  app.decorateRequest("user", null);

  app.addHook("preHandler", async (request) => {
    const token = request.cookies["ph_session"];
    if (!token) {
      return;
    }

    const session = await findSession(token);
    if (!session) {
      return;
    }

    const roleRes = await app.pg.query(
      `select 1 from user_roles where user_id = $1 and role = 'admin' limit 1`,
      [session.user_id]
    );

    request.user = {
      id: session.user_id,
      email: session.email,
      emailVerifiedAt: session.email_verified_at,
      isAdmin: (roleRes.rowCount ?? 0) > 0
    };
  });
}

export const authPlugin = fp(authPluginImpl, {
  name: "auth-plugin"
});
