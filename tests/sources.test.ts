import test from "node:test";
import assert from "node:assert/strict";
import {
  isError,
  mergeResults,
  ownerOf,
  parseProjectMap,
  selectOwners,
  sentryLog,
  supabaseLog,
  supabaseTimestamp,
} from "../src/lib/sources";
import type { LogResult, Project } from "../src/lib/types";
const project = (id: string, name: string) => ({ id, name }) as Project;
const projects = [
  project("prj_1", "diariamente-web"),
  project("prj_2", "landora"),
  project("prj_3", "comunica-con-autoridad"),
];
const result = (logs: LogResult["logs"], truncated = false): LogResult => ({
  logs,
  issues: [],
  mode: "live",
  fetchedAt: "",
  truncated,
});
test("empareja por nombre normalizado y por mapa explícito", () => {
  const map = parseProjectMap(
    " diariamente:diariamente-web , abc123:comunica-con-autoridad,roto",
  );
  assert.deepEqual(
    ownerOf({ key: "landora", name: "Landora" }, projects, map, "sentry"),
    { id: "prj_2", name: "landora" },
  );
  assert.equal(
    ownerOf({ key: "diariamente", name: "diariamente" }, projects, map, "s")
      .id,
    "prj_1",
  );
  assert.equal(
    ownerOf({ key: "abc123", name: "comunicacion" }, projects, map, "s").id,
    "prj_3",
  );
  assert.deepEqual(
    ownerOf({ key: "wordle", name: "wordle" }, projects, map, "sentry"),
    { id: "sentry:wordle", name: "wordle" },
  );
});
test("el filtro de proyecto solo conserva fuentes de ese proyecto", () => {
  const externals = [
    { key: "landora", name: "landora" },
    { key: "wordle", name: "wordle" },
  ];
  const map = new Map<string, string>();
  assert.equal(selectOwners(externals, projects, map, "s", "").length, 2);
  assert.deepEqual(
    selectOwners(externals, projects, map, "s", "prj_2").map(
      (o) => o.external.key,
    ),
    ["landora"],
  );
});
test("un issue de Sentry se convierte en log con enlace y recuento", () => {
  const log = sentryLog(
    {
      id: "42",
      title: "TypeError: x is undefined",
      culprit: "app/page.tsx",
      level: "error",
      lastSeen: "2026-10-28T10:00:00Z",
      count: "17",
      permalink: "https://adrian-rocafull.sentry.io/issues/42/",
    },
    { id: "prj_2", name: "landora" },
  );
  assert.equal(log?.id, "sentry:42");
  assert.equal(log?.provider, "sentry");
  assert.equal(log?.timestamp, Date.parse("2026-10-28T10:00:00Z"));
  assert.equal(log?.count, 17);
  assert.equal(log?.url, "https://adrian-rocafull.sentry.io/issues/42/");
  assert.equal(
    sentryLog(
      { id: "1", lastSeen: "2026-10-28T10:00:00Z", permalink: "javascript:x" },
      { id: "a", name: "a" },
    )?.url,
    null,
  );
  assert.equal(sentryLog({ id: "1" }, { id: "a", name: "a" }), null);
});
test("Supabase: hora UTC sin zona, microsegundos y niveles", () => {
  assert.equal(
    supabaseTimestamp("2026-06-22T09:34:06.215000"),
    Date.parse("2026-06-22T09:34:06.215Z"),
  );
  assert.equal(supabaseTimestamp(1793200000000000), 1793200000000);
  const owner = { id: "prj_3", name: "comunica-con-autoridad" };
  const gateway = supabaseLog(
    {
      id: "r1",
      timestamp: "2026-10-28T10:00:00",
      source: "edge_logs",
      severity: "INFO",
      status: 503,
      path: "/rest/v1/x",
    },
    owner,
    "ref",
  );
  assert.equal(gateway?.level, "error");
  assert.equal(gateway?.statusCode, 503);
  assert.equal(gateway?.id, "supabase:ref:r1");
  const pg = supabaseLog(
    { id: "r2", timestamp: "2026-10-28T10:00:00", severity: "PANIC" },
    owner,
    "ref",
  );
  assert.equal(pg?.level, "fatal");
  assert.equal(pg?.statusCode, null);
  assert.equal(isError(pg!), true);
});
test("combina fuentes por fecha, avisos y límite", () => {
  const a = sentryLog(
    { id: "1", lastSeen: "2026-10-28T10:00:00Z" },
    { id: "p", name: "p" },
  )!;
  const b = { ...a, id: "2", timestamp: a.timestamp + 1000 };
  const merged = mergeResults(result([a]), [
    { ...result([b], true), issues: [{ projectId: "Sentry", message: "x" }] },
  ]);
  assert.deepEqual(
    merged.logs.map((l) => l.id),
    ["2", "sentry:1"],
  );
  assert.equal(merged.truncated, true);
  assert.equal(merged.issues.length, 1);
});
