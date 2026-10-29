import { getDashboard, getDetails, getLiveLogs } from "../src/lib/vercel";
import { getSentryLogs, sentryConfigured } from "../src/lib/sentry";
import { getSupabaseLogs, supabaseConfigured } from "../src/lib/supabase";
const team = process.env.VERCEL_TEAM_ID ?? "";
async function main() {
  const dashboard = await getDashboard(team, 7);
  console.log(
    JSON.stringify({
      projects: dashboard.projects.length,
      connected: dashboard.projects.filter((p) => p.analytics).length,
      errors: dashboard.projects
        .filter((p) => p.analyticsError)
        .map((p) => ({ name: p.name, error: p.analyticsError })),
      views: dashboard.projects.reduce(
        (n, p) => n + (p.analytics?.pageviews ?? 0),
        0,
      ),
    }),
  );
  const project = dashboard.projects.find(
    (p) => p.analytics && p.analytics.pageviews > 0,
  );
  if (project) {
    const [details, logs] = await Promise.all([
      getDetails(project.id, team, 7),
      getLiveLogs([project], team),
    ]);
    console.log(
      JSON.stringify({
        project: project.name,
        breakdowns: Object.fromEntries(
          Object.entries(details).map(([k, v]) => [k, v.length]),
        ),
        logs: logs.logs.length,
        coverage: logs.issues.length,
      }),
    );
  }
  const [sentry, supabase] = await Promise.all([
    getSentryLogs(dashboard.projects, "", 7, false),
    getSupabaseLogs(dashboard.projects, "", 1, false),
  ]);
  for (const [name, configured, result] of [
    ["sentry", sentryConfigured(), sentry],
    ["supabase", supabaseConfigured(), supabase],
  ] as const)
    console.log(
      JSON.stringify({
        source: name,
        configured,
        logs: result.logs.length,
        unmatched: [
          ...new Set(
            result.logs
              .filter((l) => l.projectId.startsWith(`${name}:`))
              .map((l) => l.projectName),
          ),
        ],
        coverage: result.issues.map((i) => i.message),
      }),
    );
  if (
    dashboard.projects.some((p) => p.analyticsError) ||
    sentry.issues.length ||
    supabase.issues.length
  )
    process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Prueba no completada",
  );
  process.exitCode = 1;
});
