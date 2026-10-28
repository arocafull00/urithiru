import { requireAdmin } from "@/lib/auth";
import { getDetails, listProjects } from "@/lib/vercel";
import { errorResponse, HttpError, json } from "@/lib/http";
import { query } from "@/lib/params";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, projectId, period } = query(request);
    if (!(await listProjects(teamId)).some((p) => p.id === projectId))
      throw new HttpError(404, "Proyecto no encontrado.");
    return json(await getDetails(projectId, teamId, period));
  } catch (error) {
    return errorResponse(error);
  }
}
