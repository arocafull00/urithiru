import { requireAdmin } from "@/lib/auth";
import { getLiveLogs, listProjects } from "@/lib/vercel";
import { historyLogs } from "@/lib/db";
import { getSentryLogs } from "@/lib/sentry";
import { getSupabaseLogs } from "@/lib/supabase";
import { isError, mergeResults } from "@/lib/sources";
import { dateRange } from "@/lib/analytics";
import { errorResponse, json } from "@/lib/http";
import { query } from "@/lib/params";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { teamId, projectId, period } = query(request);
    const errorsOnly = new URL(request.url).searchParams.get("errors") === "1";
    const allProjects = await listProjects(teamId);
    const projects = allProjects.filter(
      (p) => !projectId || p.id === projectId,
    );
    const vercel = async () => {
      if (process.env.DATABASE_URL && process.env.VERCEL_DRAIN_SECRET)
        return historyLogs(projects, dateRange(period).since, errorsOnly);
      const live = await getLiveLogs(projects, teamId);
      if (errorsOnly) live.logs = live.logs.filter(isError);
      return live;
    };
    const [base, sentry, supabase] = await Promise.all([
      vercel(),
      getSentryLogs(allProjects, projectId, period, errorsOnly),
      getSupabaseLogs(allProjects, projectId, period, errorsOnly),
    ]);
    const result = mergeResults(base, [sentry, supabase]);
    if (errorsOnly) result.logs = result.logs.filter(isError);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
