import { requireAdmin } from "@/lib/auth";
import { getClerkProjects } from "@/lib/clerk-projects";
import { errorResponse, json } from "@/lib/http";
import { usersSourceQuery } from "@/lib/user-data";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId } = usersSourceQuery(request);
    return json(await getClerkProjects(teamId));
  } catch (error) {
    return errorResponse(error);
  }
}
