import { requireAdmin } from "@/lib/auth";
import { getClerkConnection } from "@/lib/clerk-projects";
import { errorResponse, HttpError, json } from "@/lib/http";
import { getSignupSummary } from "@/lib/signup-acquisition";
import { usersSourceQuery } from "@/lib/user-data";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { projectId, teamId } = usersSourceQuery(request);
    const period = Number(new URL(request.url).searchParams.get("period") ?? "7");
    if (![0, 1, 7, 30].includes(period)) throw new HttpError(400, "Periodo no válido.");
    const { project } = await getClerkConnection(teamId, projectId);
    if (!project.billing) throw new HttpError(404, "El origen de las altas solo está disponible para Diariamente.");
    return json(await getSignupSummary(period));
  } catch (error) {
    return errorResponse(error);
  }
}
