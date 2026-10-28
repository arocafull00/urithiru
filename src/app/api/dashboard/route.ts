import { requireAdmin } from "@/lib/auth";
import { getDashboard } from "@/lib/vercel";
import { errorResponse, json } from "@/lib/http";
import { query } from "@/lib/params";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, period } = query(request);
    return json(await getDashboard(teamId, period));
  } catch (error) {
    return errorResponse(error);
  }
}
