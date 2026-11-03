import assert from "node:assert/strict";
import { getUsers } from "../src/lib/users";
import { getClerkProjects } from "../src/lib/clerk-projects";

async function check(projectId: string, teamId: string) {
  const source = { projectId, teamId };
  const result = await getUsers({ page: 0, period: 0, query: "" }, source);
  assert.equal(result.project.id, projectId);
  assert.equal(result.environment, "production");
  assert.equal(result.filteredTotal, result.total);
  assert.ok(result.users.length <= result.pageSize);
  assert.ok(result.newUsers.day <= result.newUsers.week);
  assert.ok(result.newUsers.week <= result.newUsers.month);
  assert.ok(result.newUsers.month <= result.total);
  assert.ok(
    result.users.every(
      (user, index) =>
        index === 0 || result.users[index - 1].createdAt >= user.createdAt,
    ),
  );
  const noMatch = await getUsers(
    {
      page: 0,
      period: 0,
      query: "urithiru-smoke-no-such-user-28e42c",
    },
    source,
  );
  assert.equal(noMatch.filteredTotal, 0);
  assert.deepEqual(noMatch.users, []);
  const recent = await getUsers({ page: 0, period: 1, query: "" }, source);
  assert.equal(recent.filteredTotal, recent.newUsers.day);
  console.log(
    JSON.stringify({
      project: result.project.name,
      environment: result.environment,
      total: result.total,
      newUsers: result.newUsers,
      returned: result.users.length,
      search: "ok",
      period: "ok",
    }),
  );
}
async function main() {
  const teamId = process.env.VERCEL_TEAM_ID ?? "";
  const catalog = await getClerkProjects(teamId);
  const connected = catalog.projects.filter((project) => project.connected);
  assert.ok(connected.length > 0, "No hay proyectos de producción conectados.");
  await Promise.all(connected.map((project) => check(project.id, teamId)));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Prueba fallida");
  process.exitCode = 1;
});
