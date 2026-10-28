import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-fA-F0-9]{40}$/.test(signature)) return false;
  const expected = createHmac("sha1", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
const drainLog = z.object({
  id: z.string().min(1).max(256),
  projectId: z.string().min(1).max(256),
  deploymentId: z.string().max(256).default(""),
  timestamp: z.number().finite().min(0).max(8640000000000000),
  level: z.string().max(32).optional(),
  message: z.string().max(32000).default(""),
  path: z.string().max(2048).optional(),
  source: z.string().max(64).default("runtime"),
  statusCode: z.number().int().optional(),
  environment: z.string().optional(),
  proxy: z
    .object({
      statusCode: z.number().int().optional(),
      path: z.string().max(2048).optional(),
    })
    .optional(),
});
export function parseDrain(body: string) {
  const text = body.trim();
  const input = text.startsWith("[")
    ? JSON.parse(text)
    : text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  return z.array(drainLog).max(1000).parse(input);
}
