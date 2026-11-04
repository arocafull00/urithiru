import test from "node:test";
import assert from "node:assert/strict";
import { activityDate, activityRange, madridDate, summarizeCommits, type ActivityCommit } from "../src/lib/activity-data";
import { collectActivity } from "../src/lib/github-activity";
import { requireCronSecret } from "../src/lib/cron-auth";

test("actividad: el cron rechaza secretos ausentes, incorrectos o sin prefijo Bearer", () => {
  const request = (authorization?: string) => new Request("https://urithiru.test/api/cron/activity", { headers: authorization ? { authorization } : {} });
  assert.doesNotThrow(() => requireCronSecret(request("Bearer test-secret"), "test-secret"));
  for (const [header, secret] of [[undefined, undefined], ["Bearer undefined", undefined], [undefined, "test-secret"], ["test-secret", "test-secret"], ["Bearer wrong", "test-secret"], ["Bearer test-secrex", "test-secret"]]) {
    assert.throws(() => requireCronSecret(request(header), secret), (error: unknown) => (error as { status: number }).status === 401);
  }
});

test("actividad: el día se calcula en Madrid aunque UTC aún sea el día anterior", () => {
  assert.equal(madridDate(new Date("2026-11-03T23:30:00Z")), "2026-11-04");
  assert.equal(madridDate(new Date("2026-07-03T22:30:00Z")), "2026-07-04");
});

test("actividad: días completos de 23 y 25 horas en los cambios de hora", () => {
  const now = new Date("2026-11-04T19:00:00Z");
  assert.deepEqual(activityRange("2026-03-29", now), { since: "2026-03-28T23:00:00.000Z", until: "2026-03-29T22:00:00.000Z" });
  assert.deepEqual(activityRange("2026-10-25", now), { since: "2026-10-24T22:00:00.000Z", until: "2026-10-25T23:00:00.000Z" });
  assert.deepEqual(activityRange("2026-11-04", now), { since: "2026-11-03T23:00:00.000Z", until: "2026-11-04T19:00:00.000Z" });
});

test("actividad: rechaza fechas inexistentes, futuras e inyección en parámetros", () => {
  const now = new Date("2026-11-04T19:00:00Z");
  for (const date of ["2026-02-30", "2026-13-01", "2027-01-01", "../repo", "2026-1-1", ""]) {
    assert.throws(() => activityDate(date, now), (error: unknown) => (error as { status: number }).status === 400);
  }
  assert.equal(activityDate(null, now), "2026-11-04");
});

const rawCommit = (id: string, date = "2026-11-04T10:00:00Z", message = "feat: añadir el resumen") => ({
  sha: id.repeat(40), commit: { message, committer: { date } },
});
const repo = (name: string) => ({ full_name: `owner/${name}`, pushed_at: "2026-11-04T14:00:00Z" });
const response = (body: unknown, next = false) => Response.json(body, { headers: next ? { link: '<https://api.github.com/next>; rel="next"' } : {} });

test("actividad: pagina repositorios, ramas y commits privados; deduplica SHA entre ramas", async () => {
  const requests: URL[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
    const page = url.searchParams.get("page");
    if (url.pathname === "/user") return response({ login: "owner" });
    if (url.pathname === "/user/repos") return page === "1" ? response([repo("private")], true) : response([repo("other"), { full_name: "owner/old", pushed_at: "2025-01-01T00:00:00Z" }]);
    if (url.pathname === "/repos/owner/other/branches") return response([]);
    if (url.pathname.endsWith("/branches")) return page === "1" ? response([{ name: "main" }], true) : response([{ name: "feat/daily report" }]);
    if (url.pathname.endsWith("/commits")) {
      assert.equal(url.searchParams.get("author"), "owner");
      assert.equal(url.searchParams.get("since"), "2026-11-03T23:00:00.000Z");
      if (url.searchParams.get("sha") === "main") return page === "1" ? response([rawCommit("a")], true) : response([
        rawCommit("b", "2026-11-04T12:00:00Z", "fix(ui): corregir el filtro\n\nEvita mezclar proyectos."),
        rawCommit("c", "2026-11-04T19:00:00Z"), // Exclusive upper bound.
        rawCommit("d", "2026-11-03T22:59:59Z"),
      ]);
      assert.equal(url.searchParams.get("sha"), "feat/daily report");
      return response([rawCommit("a")]);
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  const result = await collectActivity({ token: "test-token", date: "2026-11-04", now: new Date("2026-11-04T19:00:00Z"), transport });
  assert.equal(result.repositoriesChecked, 2);
  assert.deepEqual(result.issues, []);
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].commits.length, 2);
  assert.deepEqual(result.projects[0].commits[0].branches, ["main", "feat/daily report"]);
  assert.equal(result.projects[0].commits[1].title, "fix(ui): corregir el filtro");
  assert.deepEqual(result.projects[0].summary, [{ label: "Funcionalidades", count: 1 }, { label: "Correcciones", count: 1 }]);
  assert.ok(!requests.some((url) => url.pathname.includes("/old/")));
});

test("actividad: un fallo de rama conserva los commits y avisa de cobertura parcial", async () => {
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/user") return response({ login: "owner" });
    if (url.pathname === "/user/repos") return response([repo("one"), repo("two")]);
    if (url.pathname.includes("/two/") || url.searchParams.get("sha") === "dev") return new Response("PRIVATE ERROR WITH TOKEN", { status: 403 });
    if (url.pathname.endsWith("/branches")) return response([{ name: "main" }, { name: "dev" }]);
    return response([rawCommit("a")]);
  };
  const digest = await collectActivity({ token: "secret", date: "2026-11-04", now: new Date("2026-11-04T19:00:00Z"), transport });
  assert.equal(digest.projects[0].commits.length, 1);
  assert.equal(digest.issues.length, 2);
  assert.equal(digest.repositoriesChecked, 0);
  assert.ok(!JSON.stringify(digest).includes("PRIVATE ERROR"));
});

test("actividad: errores globales de autenticación y cuota no se convierten en cero commits", async () => {
  for (const status of [401, 429]) {
    const transport: typeof fetch = async () => new Response("sensitive upstream error", { status });
    await assert.rejects(collectActivity({ token: "secret", date: "2026-11-04", now: new Date("2026-11-04T19:00:00Z"), transport }), (error: unknown) => {
      assert.ok(!String(error).includes("sensitive"));
      return true;
    });
  }
});

test("actividad: el presupuesto agotado termina y se marca como incompleto", async () => {
  const transport: typeof fetch = async () => { throw new Error("Must not call transport"); };
  await assert.rejects(collectActivity({ token: "secret", date: "2026-11-04", now: new Date("2026-11-04T19:00:00Z"), transport, budgetMs: 0 }), (error: unknown) => (error as { status: number }).status === 504);
});

test("actividad: los mensajes sin prefijo no se presentan como una funcionalidad inventada", () => {
  assert.deepEqual(summarizeCommits([{ title: "trabajo de hoy" }, { title: "feat(ui)!: nuevo panel" }, { title: "chore: dependencias" }] as ActivityCommit[]), [
    { label: "Otros cambios", count: 1 }, { label: "Funcionalidades", count: 1 }, { label: "Mantenimiento", count: 1 },
  ]);
});
