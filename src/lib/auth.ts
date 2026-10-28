import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { HttpError } from "./http";
export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new HttpError(401, "Inicia sesión para continuar.");
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.includes(userId)) return { userId, name: "Administrador" };
  const emails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length) {
    const user = await currentUser();
    if (
      user?.emailAddresses.some(
        (e) =>
          e.verification?.status === "verified" &&
          emails.includes(e.emailAddress.toLowerCase()),
      )
    )
      return { userId, name: user.firstName ?? "Administrador" };
  }
  throw new HttpError(
    403,
    "Esta cuenta no tiene acceso a Urithiru. Añade su ID a ADMIN_USER_IDS en el servidor.",
  );
}
