import "server-only";
import { z } from "zod";
import { HttpError } from "./http";
import type { BillingUpdate, UserBilling } from "./types";

const userBillingSchema = z.object({
  id: z.string(),
  role: z.enum(["patient", "psychologist", "clinic", "admin"]).nullable(),
  access: z.enum([
    "free",
    "lifetime",
    "clinic",
    "subscribed",
    "trial",
    "pricing_pending",
    "expired",
  ]),
  lifetimeAccess: z.boolean(),
  trialEndsAt: z.string().nullable(),
  subscriptionStatus: z.string().nullable(),
  clinic: z
    .object({
      id: z.string(),
      name: z.string(),
      monthlyPriceCents: z.number().nullable(),
      psychologistCount: z.number(),
    })
    .nullable(),
});

export const billingUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lifetime"), enabled: z.boolean() }),
  z.object({
    action: z.literal("clinic-price"),
    monthlyPriceCents: z.number().int().min(100).max(10_000_000),
  }),
]);

export const diariamenteBillingConfigured = () =>
  Boolean(
    process.env.DIARIAMENTE_API_URL && process.env.DIARIAMENTE_ADMIN_API_SECRET,
  );

async function diariamenteFetch(path: string, init: RequestInit = {}) {
  if (!diariamenteBillingConfigured())
    throw new HttpError(
      503,
      "Configura DIARIAMENTE_API_URL y DIARIAMENTE_ADMIN_API_SECRET para gestionar la facturación de Diariamente.",
    );
  const base = process.env.DIARIAMENTE_API_URL!.replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...init.headers,
      Authorization: `Bearer ${process.env.DIARIAMENTE_ADMIN_API_SECRET}`,
    },
  }).catch(() => null);
  if (!response?.ok)
    throw new HttpError(
      502,
      "Diariamente no ha aceptado la operación de facturación. Revisa la conexión y vuelve a intentarlo.",
    );
  return response.json();
}

export async function getUsersBilling(ids: string[]) {
  if (!ids.length) return new Map<string, UserBilling>();
  const body = await diariamenteFetch(
    `/api/admin/billing?${new URLSearchParams({ ids: ids.join(",") })}`,
  );
  const users = z.object({ users: z.array(userBillingSchema) }).parse(body).users;
  return new Map(users.map((user) => [user.id, user]));
}

export async function updateUserBilling(
  id: string,
  update: BillingUpdate,
  adminEmail: string | null,
) {
  const body = await diariamenteFetch(
    `/api/admin/billing/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(adminEmail ? { "X-Admin-Email": adminEmail } : {}),
      },
      body: JSON.stringify(update),
    },
  );
  return z.object({ user: userBillingSchema }).parse(body).user;
}
