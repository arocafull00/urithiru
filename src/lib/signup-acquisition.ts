import "server-only";
import { z } from "zod";
import { diariamenteFetch } from "./diariamente-billing";
import type { SignupAttribution, SignupSummary } from "./types";

const channel = z.enum(["linkedin", "instagram", "facebook", "web"]).nullable();
const platform = z.enum(["web", "android"]);
const attributionSchema = z.object({
  profileId: z.string(),
  channel,
  platform,
  landingHost: z.string().nullable(),
  registeredAt: z.string(),
});

export async function getUsersAcquisition(ids: string[]) {
  if (!ids.length) return new Map<string, SignupAttribution>();
  const body = await diariamenteFetch(`/api/admin/acquisition?${new URLSearchParams({ ids: ids.join(",") })}`);
  const { users } = z.object({ users: z.array(attributionSchema) }).parse(body);
  return new Map(users.map(({ profileId, ...attribution }) => [profileId, attribution]));
}

export async function getSignupSummary(period: number): Promise<SignupSummary> {
  const body = await diariamenteFetch(`/api/admin/acquisition?period=${period}`);
  return z.object({ rows: z.array(z.object({
    channel,
    platform: platform.nullable(),
    landingHost: z.string().nullable(),
    signups: z.number().int().nonnegative(),
  })) }).parse(body);
}
