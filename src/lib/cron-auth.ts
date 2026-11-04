import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./http";

export function requireCronSecret(request: Request, secret: string | undefined) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HttpError(401, "No autorizado.");
}
