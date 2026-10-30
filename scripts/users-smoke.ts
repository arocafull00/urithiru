import assert from "node:assert/strict";
import { getUsers } from "../src/lib/users";

async function main() {
  const result = await getUsers({ page: 0, period: 0, query: "" });
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
  const noMatch = await getUsers({
    page: 0,
    period: 0,
    query: "urithiru-smoke-no-such-user-28e42c",
  });
  assert.equal(noMatch.filteredTotal, 0);
  assert.deepEqual(noMatch.users, []);
  const recent = await getUsers({ page: 0, period: 1, query: "" });
  assert.equal(recent.filteredTotal, recent.newUsers.day);
  console.log(
    JSON.stringify({
      environment: result.environment,
      total: result.total,
      newUsers: result.newUsers,
      returned: result.users.length,
      search: "ok",
      period: "ok",
    }),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Prueba fallida");
  process.exitCode = 1;
});
