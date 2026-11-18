import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./db";
import { collectErrorCounts } from "./error-alert-sources";
import { alertMessage, exceedsThreshold, ERROR_COOLDOWN_MINUTES, ERROR_WINDOW_MINUTES, vercelAlertProjects } from "./error-alerts-data";
import { HttpError } from "./http";
import { listProjects } from "./vercel";

export async function sendAlertWhatsApp(message: string): Promise<"sent" | "failed" | "unknown"> {
  const response = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.ERROR_ALERT_WHAPI_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: `${process.env.ERROR_ALERT_WHATSAPP_TO!.replace(/^\+/, "")}@s.whatsapp.net`, body: message, no_link_preview: true }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!response) return "unknown";
  const body = await response.json().catch(() => null);
  if (response.ok && body?.sent === true) return "sent";
  if ((response.status >= 400 && response.status < 500) || (response.ok && body?.sent === false)) return "failed";
  return "unknown";
}

export async function runErrorAlerts({ test = false, dryRun = false } = {}) {
  if (!process.env.ERROR_ALERT_WHAPI_TOKEN || !/^\+?[1-9]\d{8,14}$/.test(process.env.ERROR_ALERT_WHATSAPP_TO ?? "") ||
    !process.env.DATABASE_URL || !process.env.VERCEL_TEAM_ID || !process.env.APP_URL?.startsWith("https://"))
    throw new HttpError(503, "Las alertas de WhatsApp no están configuradas.");
  const sql = database();
  // Idempotent bootstrap also covers existing deployments without a migration runner.
  await sql`CREATE TABLE IF NOT EXISTS urithiru_error_alerts (
    alert_key text PRIMARY KEY, attempt_id text NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL CHECK (status IN ('processing', 'sent', 'failed', 'unknown')), error_count integer NOT NULL, error text
  )`;
  const until = new Date();
  const since = new Date(until.getTime() - ERROR_WINDOW_MINUTES * 60000);
  const projects = test ? [] : await listProjects(process.env.VERCEL_TEAM_ID);
  const result = test ? { counts: [], issues: [] } : await collectErrorCounts(projects, since, until, vercelAlertProjects(projects, until));
  const spikes = result.counts.filter(exceedsThreshold);
  if (dryRun) return { dryRun: true, spikes, issues: result.issues, checked: result.counts.length };
  const messages = test ? [{ key: "test", count: 0,
    message: "✅ Urithiru: prueba de alertas por WhatsApp. Te avisaré cuando un proyecto y fuente registren 10 o más errores en 15 minutos, con un máximo de un aviso por hora para cada uno." }] :
    spikes.map((count) => ({ key: `${count.source}:${count.projectId}`, count: count.count, message: alertMessage(count, process.env.APP_URL!) }));
  let sent = 0, suppressed = 0;
  const failures: string[] = [];
  for (const item of messages) {
    const id = randomUUID();
    // Claim before calling the provider. Concurrent schedulers cannot send the same alert.
    // Timeouts are ambiguous: preserve the full cooldown rather than retrying immediately.
    const claim = await sql`INSERT INTO urithiru_error_alerts (alert_key, attempt_id, status, error_count)
      VALUES (${item.key}, ${id}, 'processing', ${item.count}) ON CONFLICT (alert_key) DO UPDATE SET
      attempt_id = EXCLUDED.attempt_id, attempted_at = now(), status = 'processing', error_count = EXCLUDED.error_count, error = NULL
      WHERE urithiru_error_alerts.attempted_at <= now() - make_interval(mins => CASE WHEN urithiru_error_alerts.status = 'failed' THEN 5 ELSE ${ERROR_COOLDOWN_MINUTES} END)
      RETURNING alert_key`;
    if (!claim.length) { suppressed++; continue; }
    const status = await sendAlertWhatsApp(item.message);
    await sql`UPDATE urithiru_error_alerts SET status = ${status}, error = ${status === "sent" ? null : "Whapi no confirmó el envío. Revisa la conexión y la cuota del canal."}
      WHERE alert_key = ${item.key} AND attempt_id = ${id}`;
    if (status === "sent") sent++;
    else failures.push(status);
  }
  return { sent, suppressed, failures, issues: result.issues, checked: result.counts.length };
}
