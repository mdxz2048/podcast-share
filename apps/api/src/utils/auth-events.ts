import { z } from "zod";

const rasterImage = z.string().max(512_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

export const authChallengeSchema = z.object({
  type: z.literal("auth_challenge"),
  challenge_id: z.string().min(1).max(128),
  method: z.literal("qr"),
  image_data_url: rasterImage,
  expires_at: z.string().datetime({ offset: true }),
  message: z.string().max(2000).optional()
});

export const authResultSchema = z.object({
  type: z.literal("auth_result"),
  challenge_id: z.string().max(128).optional(),
  status: z.enum(["authenticated", "expired", "failed"]),
  message: z.string().max(2000).optional()
});

export function validateAuthEvent(type: string, payload: Record<string, unknown>): boolean {
  if (type === "auth_challenge") return authChallengeSchema.safeParse(payload).success;
  if (type === "auth_result") return authResultSchema.safeParse(payload).success;
  if (type === "qr_image") return rasterImage.safeParse(payload.image_data_url).success;
  return true;
}

export function redactAuthEvent(payload: Record<string, unknown>) {
  return { ...payload, value: "[redacted]", secret_value: "[redacted]" };
}
