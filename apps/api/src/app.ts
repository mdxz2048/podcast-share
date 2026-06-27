import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { pgPlugin } from "./plugins/pg.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { adminAuthRoutes } from "./routes/admin-auth.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    credentials: true
  });
  app.register(cookie);
  app.register(pgPlugin);
  app.register(authPlugin);
  app.register(authRoutes);
  app.register(adminAuthRoutes);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
