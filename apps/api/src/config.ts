import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  MEDIA_LOCAL_ROOT: z.string().default("storage/media"),
  MAILPIT_SMTP_HOST: z.string().default("mailpit"),
  MAILPIT_SMTP_PORT: z.coerce.number().default(1025),
  SECRET_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  JWT_EMAIL_SECRET: z.string().min(16),
  SESSION_TTL_DAYS: z.coerce.number().default(14),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).default("ChangeMe123!")
});

export const env = envSchema.parse(process.env);
