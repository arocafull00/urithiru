import type { RegisteredUser } from "./types";
import { HttpError } from "./http";

export const USERS_PAGE_SIZE = 25;

export function usersQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 0);
  const period = Number(params.get("period") ?? 0);
  const query = (params.get("q") ?? "").trim();
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
    throw new HttpError(400, "Página no válida.");
  if (![0, 1, 7, 30].includes(period))
    throw new HttpError(400, "Periodo no válido.");
  if (query.length > 200)
    throw new HttpError(
      400,
      "La búsqueda no puede superar los 200 caracteres.",
    );
  return { page, period, query };
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
