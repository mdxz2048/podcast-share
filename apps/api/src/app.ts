import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { pgPlugin } from "./plugins/pg.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { adminAuthRoutes } from "./routes/admin-auth.js";
import { programRoutes } from "./routes/programs.js";
import { rssRoutes } from "./routes/rss.js";
import { adminProgramRoutes } from "./routes/admin-programs.js";
import { adminConnectorRoutes } from "./routes/admin-connectors.js";
import { adminSourceRoutes } from "./routes/admin-sources.js";
import { adminJobRoutes } from "./routes/admin-jobs.js";
import { internalScheduleRoutes } from "./routes/internal-schedules.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    credentials: true
  });
  app.register(cookie);
  app.register(multipart, {
    limits: {
      fileSize: 30 * 1024 * 1024,
      files: 1
    }
  });
  app.register(pgPlugin);
  app.register(authPlugin);
  app.register(authRoutes);
  app.register(adminAuthRoutes);
  app.register(programRoutes);
  app.register(rssRoutes);
  app.register(adminProgramRoutes);
  app.register(adminConnectorRoutes);
  app.register(adminSourceRoutes);
  app.register(adminJobRoutes);
  app.register(internalScheduleRoutes);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
