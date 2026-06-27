import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { pool } from "../db/pool.js";

declare module "fastify" {
  interface FastifyInstance {
    pg: typeof pool;
  }
}

async function pgPluginImpl(app: FastifyInstance): Promise<void> {
  app.decorate("pg", pool);
  app.addHook("onClose", async () => {
    await pool.end();
  });
}

export const pgPlugin = fp(pgPluginImpl, {
  name: "pg-plugin"
});
