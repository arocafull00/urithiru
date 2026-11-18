import test from "node:test";
import assert from "node:assert/strict";
import { collectErrorCounts } from "../../src/lib/error-alert-sources";
import { sendAlertWhatsApp } from "../../src/lib/error-alerts";
import type { Project } from "../../src/lib/types";

const project = { id: "prj_one", name: "one", deploymentId: "dpl_one" } as Project;
const until = new Date("2026-11-18T12:00:00Z"), since = new Date("2026-11-18T11:45:00Z");

test("Vercel: deduplica error+5xx, excluye eventos antiguos y conserva cobertura parcial", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.searchParams.get("projectId") === "prj_fail") return new Response(null, { status: 403 });
    assert.equal(url.searchParams.get("environment"), "production");
    assert.equal(url.searchParams.get("startDate"), String(since.getTime()));
    return Response.json({ hasMoreRows: false, rows: [
      { requestId: "same-error", timestamp: "2026-11-18T11:50:00Z" },
      { requestId: "old-error", timestamp: "2026-11-18T11:44:59Z" },
      { requestId: "future-error", timestamp: "2026-11-18T12:00:01Z" },
    ] });
  });
  const old = { ...process.env };
  delete process.env.SENTRY_AUTH_TOKEN;
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.VERCEL_DRAIN_SECRET;
  process.env.VERCEL_TEAM_ID = "team_test";
  t.after(() => { process.env = old; });
  const result = await collectErrorCounts([project, { ...project, id: "prj_fail", name: "failed" }], since, until);
  assert.equal(result.counts.length, 1);
  assert.equal(result.counts[0].count, 1);
  assert.equal(result.issues.length, 1);
});

test("Sentry: cuenta eventos de la ventana, incluidos issues resueltos", async (t) => {
  const old = { ...process.env };
  process.env.SENTRY_AUTH_TOKEN = "test";
  process.env.SENTRY_ORG = "test";
  process.env.SENTRY_URL = "https://sentry.test";
  delete process.env.SUPABASE_ACCESS_TOKEN;
  t.after(() => { process.env = old; });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("dataset"), "errors");
    assert.equal(url.searchParams.get("start"), since.toISOString());
    assert.equal(url.searchParams.get("end"), until.toISOString());
    assert.doesNotMatch(url.searchParams.get("query")!, /unresolved/);
    assert.deepEqual(url.searchParams.getAll("field"), ["project", "count()"]);
    return Response.json({ data: [{ project: "one", "count()": 12 }] });
  });
  const result = await collectErrorCounts([{ ...project, deploymentId: null }], since, until);
  assert.deepEqual(result.counts, [{ source: "sentry", projectId: project.id, projectName: "one", count: 12 }]);
  assert.deepEqual(result.issues, []);
});

test("WhatsApp: distingue aceptación, rechazo y timeout para evitar reintentos duplicados", async (t) => {
  const old = { ...process.env };
  process.env.ERROR_ALERT_WHATSAPP_TO = "+34123456789";
  process.env.ERROR_ALERT_WHAPI_TOKEN = "test-token";
  t.after(() => { process.env = old; });
  const responses = [Response.json({ sent: true }), Response.json({ sent: false }), new Response(null, { status: 429 }), new Response(null, { status: 500 }), null];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    assert.equal(body.to, "34123456789@s.whatsapp.net");
    assert.equal(body.body, "Prueba");
    const response = responses.shift();
    if (!response) throw new Error("Timeout");
    return response;
  });
  for (const expected of ["sent", "failed", "failed", "unknown", "unknown"]) assert.equal(await sendAlertWhatsApp("Prueba"), expected);
});
