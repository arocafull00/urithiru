import "server-only";
import { createClerkClient } from "@clerk/backend";
import {
  diariamenteBillingConfigured,
  getUsersBilling,
} from "./diariamente-billing";
import { HttpError } from "./http";
import { registeredUser, USERS_PAGE_SIZE, usersQuery } from "./user-data";
import type { UsersResult } from "./types";

export async function getUsers(
  filters: ReturnType<typeof usersQuery>,
): Promise<UsersResult> {
  // This is deliberately separate from Urithiru's own authentication instance.
  const secretKey = process.env.DIARIAMENTE_CLERK_SECRET_KEY;
  if (!secretKey || !/^sk_(live|test)_/.test(secretKey))
    throw new HttpError(
      503,
      "Conecta la instancia de Clerk de Diariamente en Configuración para consultar sus usuarios.",
    );
  const client = createClerkClient({ secretKey });
  const now = Date.now();
  const { page, period, query } = filters;
  const listFilters = {
    ...(query ? { query } : {}),
    ...(period ? { createdAtAfter: now - period * 86400000 } : {}),
  };
  try {
    const pageList = client.users.getUserList({
      ...listFilters,
      orderBy: "-created_at",
      limit: USERS_PAGE_SIZE,
      offset: page * USERS_PAGE_SIZE,
    });
    const pageBilling = diariamenteBillingConfigured()
      ? pageList
          .then((result) => getUsersBilling(result.data.map((user) => user.id)))
          .catch(() => null)
      : Promise.resolve(undefined);
    const [list, total, day, week, month, billing] = await Promise.all([
      pageList,
      client.users.getCount(),
      client.users.getUserList({ limit: 1, createdAtAfter: now - 86400000 }),
      client.users.getUserList({
        limit: 1,
        createdAtAfter: now - 7 * 86400000,
      }),
      client.users.getUserList({
        limit: 1,
        createdAtAfter: now - 30 * 86400000,
      }),
      pageBilling,
    ]);
    return {
      users: list.data.map((user) => ({
        ...registeredUser(user),
        billing: billing?.get(user.id) ?? null,
      })),
      billing:
        billing === undefined ? "unconfigured" : billing ? "ok" : "error",
      total,
      newUsers: {
        day: day.totalCount,
        week: week.totalCount,
        month: month.totalCount,
      },
      filteredTotal: list.totalCount,
      page,
      pageSize: USERS_PAGE_SIZE,
      environment: secretKey.startsWith("sk_live_")
        ? "production"
        : "development",
      fetchedAt: new Date(now).toISOString(),
    };
  } catch {
    // Upstream auth failures must neither sign out the admin nor expose SDK payloads.
    throw new HttpError(
      502,
      "No se han podido consultar los usuarios de Diariamente. Revisa su conexión de Clerk y vuelve a intentarlo.",
    );
  }
}
