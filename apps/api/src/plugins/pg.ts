import { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

declare module "fastify" {
  interface FastifyInstance {
    pg: typeof pool;
  }
}

export async function pgPlugin(app: FastifyInstance): Promise<void> {
  app.decorate("pg", pool);
  app.addHook("onClose", async () => {
    await pool.end();
  });
}
