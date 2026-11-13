import type { RegisteredUser } from "./types";
import { HttpError } from "./http";

export { TABLE_PAGE_SIZE as USERS_PAGE_SIZE } from "./pagination";
const USER_SORT_FIELDS = [
  "first_name",
  "created_at",
  "last_sign_in_at",
  "email_address",
] as const;
export type UsersOrderBy = `${"+" | "-"}${(typeof USER_SORT_FIELDS)[number]}`;

export function usersSourceQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const teamId = params.get("team") ?? process.env.VERCEL_TEAM_ID ?? "";
  const projectId = params.get("project") ?? "";
  if (teamId && !/^team_[a-zA-Z0-9]+$/.test(teamId))
    throw new HttpError(400, "Equipo no válido.");
  if (projectId && !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId))
    throw new HttpError(400, "Proyecto no válido.");
  return { teamId, projectId };
}

export function clerkProjectSettings(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const billing = ["diariamente", "diariamente-web"].includes(slug);
  return {
    name: billing ? "DiariaMente" : slug === "replay" ? "rePlay" : name,
    billing,
    secretKeyVariable: billing
      ? "DIARIAMENTE_CLERK_SECRET_KEY"
      : `${slug.replace(/-/g, "_").toUpperCase()}_CLERK_SECRET_KEY`,
  };
}

export function productionClerkVariable(
  envs: {
    id?: string;
    key: string;
    target?: string | string[];
    gitBranch?: string;
    value?: string;
    type?: string;
  }[],
) {
  return envs.find(
    (env) =>
      env.key === "CLERK_SECRET_KEY" &&
      !env.gitBranch &&
      (Array.isArray(env.target)
        ? env.target.includes("production")
        : env.target === "production"),
  );
}

export function usersQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 0);
  const period = Number(params.get("period") ?? 0);
  const query = (params.get("q") ?? "").trim();
  const orderBy = params.get("orderBy") ?? "-created_at";
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
    throw new HttpError(400, "Página no válida.");
  if (![0, 1, 7, 30].includes(period))
    throw new HttpError(400, "Periodo no válido.");
  if (query.length > 200)
    throw new HttpError(
      400,
      "La búsqueda no puede superar los 200 caracteres.",
    );
  if (
    !USER_SORT_FIELDS.some(
      (field) => orderBy === `+${field}` || orderBy === `-${field}`,
    )
  )
    throw new HttpError(400, "Orden de usuarios no válido.");
  return { page, period, query, orderBy: orderBy as UsersOrderBy };
}

// Only these fields may cross the server boundary. Never include Clerk metadata.
export function registeredUser(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
  createdAt: number;
  lastSignInAt: number | null;
}): RegisteredUser {
  const email = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  return {
    id: user.id,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Sin nombre",
    email: email?.emailAddress ?? null,
    emailVerified: email?.verification?.status === "verified",
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
  };
}
