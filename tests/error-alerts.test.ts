import test from "node:test";
import assert from "node:assert/strict";
import { alertMessage, exceedsThreshold, vercelAlertProjects, type ErrorCount } from "../src/lib/error-alerts-data";
import { requireCronSecret } from "../src/lib/cron-auth";

const count: ErrorCount = { source: "sentry", projectId: "prj_test", projectName: "Diariamente", count: 10 };

test("alertas: reparte Vercel sin omisiones ni duplicados entre dos ejecuciones", () => {
  const projects = Array.from({ length: 36 }, (_, i) => ({ id: `prj_${i}` }));
  const first = vercelAlertProjects(projects, new Date("2026-11-18T12:00:00Z"));
  const second = vercelAlertProjects([...projects].reverse(), new Date("2026-11-18T12:05:00Z"));
  assert.equal(first.length, 18);
  assert.equal(second.length, 18);
  assert.equal(new Set([...first, ...second].map((p) => p.id)).size, 36);
  assert.deepEqual(vercelAlertProjects(projects.slice(0, 10), new Date()), projects.slice(0, 10));
});

test("alertas: se activan al alcanzar diez errores recientes, no antes", () => {
  for (const value of [0, 1, 9, NaN, Infinity, -1]) assert.equal(exceedsThreshold({ ...count, count: value }), false);
  for (const value of [10, 11, 1000]) assert.equal(exceedsThreshold({ ...count, count: value }), true);
});

test("alertas: mensaje acotado con fuente, ventana y enlace al panel", () => {
  const message = alertMessage({ ...count, atLeast: true }, "https://urithiru.example");
  assert.match(message, /Diariamente/);
  assert.match(message, /sentry/);
  assert.match(message, /Al menos 10 errores en los últimos 15 minutos/);
  assert.match(message, /https:\/\/urithiru.example\/\?view=errors/);
  assert.doesNotMatch(message, /prj_test/);
});

test("alertas: el endpoint no admite llamadas sin el secreto dedicado", () => {
  const request = (authorization?: string) => new Request("https://test/api/cron/error-alerts", { headers: authorization ? { authorization } : {} });
  for (const auth of [undefined, "Bearer wrong", "secret", "Bearer undefined"]) assert.throws(() => requireCronSecret(request(auth), "secret"));
  assert.doesNotThrow(() => requireCronSecret(request("Bearer secret"), "secret"));
});
