import { getDashboard, getDetails, getLiveLogs } from "../src/lib/vercel";
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
  if (dashboard.projects.some((p) => p.analyticsError)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Prueba no completada",
  );
  process.exitCode = 1;
});
