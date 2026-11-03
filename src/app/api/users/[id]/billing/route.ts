import { currentUser } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
import {
  billingUpdateSchema,
  updateUserBilling,
} from "@/lib/diariamente-billing";
import { errorResponse, HttpError, json } from "@/lib/http";
import { getClerkConnection } from "@/lib/clerk-projects";
import { usersSourceQuery } from "@/lib/user-data";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { teamId, projectId } = usersSourceQuery(request);
    const { project } = await getClerkConnection(teamId, projectId);
    if (!project.billing)
      throw new HttpError(
        400,
        "La gestión de planes solo está disponible para DiariaMente.",
      );
    const { id } = await params;
    if (!/^user_[A-Za-z0-9]+$/.test(id))
      throw new HttpError(400, "Usuario no válido.");
    const parsed = billingUpdateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      throw new HttpError(400, "Los datos de facturación no son válidos.");
    const admin = await currentUser();
    const user = await updateUserBilling(
      id,
      parsed.data,
      admin?.primaryEmailAddress?.emailAddress ?? null,
    );
    return json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
