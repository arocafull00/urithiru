import "server-only";
import { createClerkClient } from "@clerk/backend";
import {
  diariamenteBillingConfigured,
  getUsersBilling,
} from "./diariamente-billing";
import { HttpError } from "./http";
import { getClerkConnection } from "./clerk-projects";
import { registeredUser, USERS_PAGE_SIZE, usersQuery } from "./user-data";
import type { UsersResult } from "./types";

export async function getUsers(
  filters: ReturnType<typeof usersQuery>,
  source = { teamId: process.env.VERCEL_TEAM_ID ?? "", projectId: "" },
): Promise<UsersResult> {
  const { project, secretKey } = await getClerkConnection(
    source.teamId,
    source.projectId,
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
    const pageBilling =
      project.billing && diariamenteBillingConfigured()
        ? pageList
            .then((result) =>
              getUsersBilling(result.data.map((user) => user.id)),
            )
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
      project,
      users: list.data.map((user) => ({
        ...registeredUser(user),
        billing: billing?.get(user.id) ?? null,
      })),
      billing: !project.billing
        ? "unsupported"
        : billing === undefined
          ? "unconfigured"
          : billing
            ? "ok"
            : "error",
      total,
      newUsers: {
        day: day.totalCount,
        week: week.totalCount,
        month: month.totalCount,
      },
      filteredTotal: list.totalCount,
      page,
      pageSize: USERS_PAGE_SIZE,
      environment: "production",
      fetchedAt: new Date(now).toISOString(),
    };
  } catch {
    // Upstream auth failures must neither sign out the admin nor expose SDK payloads.
    throw new HttpError(
      502,
      `No se han podido consultar los usuarios de ${project.name}. Revisa su conexión de Clerk y vuelve a intentarlo.`,
    );
  }
}
