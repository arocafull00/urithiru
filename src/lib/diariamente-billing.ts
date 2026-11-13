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
    "trial_available",
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

export async function diariamenteFetch(path: string, init: RequestInit = {}) {
  const deleting = init.method === "DELETE";
  if (!diariamenteBillingConfigured())
    throw new HttpError(
      503,
      "Configura DIARIAMENTE_API_URL y DIARIAMENTE_ADMIN_API_SECRET para conectar Diariamente.",
    );
  const base = process.env.DIARIAMENTE_API_URL!.replace(/\/$/, "");
  if (deleting && base !== "https://diariamente.es")
    throw new HttpError(
      503,
      "El borrado requiere la API de producción de Diariamente.",
    );
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
      deleting
        ? "Diariamente no ha confirmado el borrado. Vuelve a intentarlo para completar la operación."
        : "Diariamente no ha aceptado la operación. Revisa la conexión y vuelve a intentarlo.",
    );
  return response.json();
}

export async function deleteDiariamenteUser(id: string, adminId: string) {
  const body = await diariamenteFetch(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: "DELETE", redirect: "error", headers: { "X-Admin-Id": adminId } },
  );
  z.object({ deleted: z.literal(true) }).parse(body);
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
