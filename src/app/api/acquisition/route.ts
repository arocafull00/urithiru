import { requireAdmin } from "@/lib/auth";
import { diariamenteSurface } from "@/lib/acquisition";
import { getAcquisition } from "@/lib/acquisition-server";
import { errorResponse, HttpError, json } from "@/lib/http";
import { query } from "@/lib/params";
import { listProjects } from "@/lib/vercel";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, projectId, period } = query(request);
    const project = (await listProjects(teamId)).find((item) => item.id === projectId);
    if (!project || !diariamenteSurface(project)) throw new HttpError(404, "Proyecto de Diariamente no encontrado.");
    if (!project.analyticsEnabled) throw new HttpError(503, "Activa Web Analytics en este proyecto de Vercel para medir el origen.");
    return json(await getAcquisition(projectId, teamId, period));
  } catch (error) {
    return errorResponse(error);
  }
}
