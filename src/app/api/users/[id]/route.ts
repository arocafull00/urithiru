import { requireAdmin } from "@/lib/auth";
import { getClerkConnection } from "@/lib/clerk-projects";
import { deleteDiariamenteUser } from "@/lib/diariamente-billing";
import { errorResponse, HttpError, json } from "@/lib/http";
import { usersSourceQuery } from "@/lib/user-data";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!/^user_[A-Za-z0-9]{1,95}$/.test(id))
      throw new HttpError(400, "Usuario no válido.");
    if (request.headers.get("X-Confirm-Deletion") !== id)
      throw new HttpError(400, "Confirma la eliminación del usuario.");

    const { teamId, projectId } = usersSourceQuery(request);
    if (!projectId) throw new HttpError(400, "Selecciona el proyecto Diariamente.");
    const { project } = await getClerkConnection(teamId, projectId);
    if (!project.billing)
      throw new HttpError(400, "El borrado solo está disponible para Diariamente.");

    await deleteDiariamenteUser(id, admin.userId);
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
