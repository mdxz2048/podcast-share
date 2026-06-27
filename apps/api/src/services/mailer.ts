import nodemailer from "nodemailer";
import { env } from "../config.js";

const transporter = nodemailer.createTransport({
  host: env.MAILPIT_SMTP_HOST,
  port: env.MAILPIT_SMTP_PORT,
  secure: false
});

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  await transporter.sendMail({
    from: "Podcast Hub <no-reply@podcast-hub.local>",
    to,
    subject,
    text
  });
}
