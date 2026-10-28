import { requireAdmin } from "@/lib/auth";
import { getLiveLogs, listProjects } from "@/lib/vercel";
import { historyLogs } from "@/lib/db";
import { dateRange } from "@/lib/analytics";
import { errorResponse, json } from "@/lib/http";
import { query } from "@/lib/params";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, projectId, period } = query(request);
    const errorsOnly = new URL(request.url).searchParams.get("errors") === "1";
    const projects = (await listProjects(teamId)).filter(
      (p) => !projectId || p.id === projectId,
    );
    if (process.env.DATABASE_URL && process.env.VERCEL_DRAIN_SECRET)
      return json(
        await historyLogs(projects, dateRange(period).since, errorsOnly),
      );
    const result = await getLiveLogs(projects, teamId);
    if (errorsOnly)
      result.logs = result.logs.filter(
        (log) =>
          ["error", "fatal"].includes(log.level) ||
          (log.statusCode ?? 0) >= 500,
      );
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
