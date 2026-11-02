import test from "node:test";
import assert from "node:assert/strict";
import { formatLog } from "../src/lib/log-copy";
import type { LogEntry } from "../src/lib/types";

const log: LogEntry = {
  id: "sentry:42",
  provider: "sentry",
  projectId: "p",
  projectName: "diariamente-web",
  timestamp: Date.parse("2026-11-03T10:00:00Z"),
  level: "error",
  message: "Error: Failed query…",
  path: "/api/subscriptions",
  statusCode: 500,
  source: "issue",
  deploymentId: "deploy1",
  url: "https://sentry.io/issues/42/",
  count: 4,
};

test("copia el mensaje entero y su contexto, incluidos saltos de línea", () => {
  const message =
    "Error: " + "consulta ".repeat(1000) + "\nCaused by: restricción única";
  const text = formatLog({ ...log, provider: "vercel", message });
  assert.ok(text.includes(message));
  for (const value of [
    log.projectName,
    log.path,
    "HTTP: 500",
    "Eventos: 4",
    log.deploymentId,
    log.url!,
  ]) {
    assert.ok(text.includes(value));
  }
  assert.ok(!text.includes("undefined"));
});

test("conserva el evento completo de Sentry, incluidas causas, stack y datos adicionales", () => {
  const event = {
    message: "Failed query: " + "sql ".repeat(2000),
    entries: [
      {
        type: "exception",
        data: {
          values: [
            {
              value: "duplicate key",
              stacktrace: { frames: [{ filename: "db.ts", lineNo: 42 }] },
            },
          ],
        },
      },
    ],
    contexts: { trace: { trace_id: "trace1" } },
  };
  const text = formatLog(log, event);
  const json = text.split("Último evento completo de Sentry:\n")[1];
  assert.deepEqual(JSON.parse(json), event);
});
