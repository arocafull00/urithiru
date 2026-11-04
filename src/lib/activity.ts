import "server-only";
import { requireCronSecret } from "./cron-auth";
import { database } from "./db";
import { HttpError } from "./http";
import { collectActivity } from "./github-activity";
import { summarizeActivity } from "./activity-summary";
import { type ActivityDigest, type ActivityResult } from "./activity-data";

function settings() {
  return {
    token: process.env.GITHUB_ACTIVITY_TOKEN?.trim() ?? "",
    username: process.env.GITHUB_USERNAME?.trim() ?? "",
  };
}

export function requireActivityCron(request: Request) {
  requireCronSecret(request, process.env.CRON_SECRET);
}

export async function readActivity(date: string): Promise<ActivityResult> {
  const { token, username } = settings();
  const result: ActivityResult = { connected: Boolean(token && username), storage: Boolean(process.env.DATABASE_URL), digest: null, dates: [] };
  if (!result.storage || !username) return result;
  const sql = database();
  const [rows, dates] = await Promise.all([
    sql`SELECT digest FROM urithiru_activity WHERE username = ${username.toLowerCase()} AND activity_date = ${date}::date`,
    sql`SELECT activity_date::text AS date FROM urithiru_activity WHERE username = ${username.toLowerCase()} ORDER BY activity_date DESC LIMIT 90`,
  ]);
  result.digest = (rows[0]?.digest as ActivityDigest) ?? null;
  result.dates = dates.map((r) => r.date as string);
  return result;
}

function aiStatus(digest: ActivityDigest, apiKey: string) {
  // Lets the UI say why the AI summary is missing instead of silently omitting it.
  return digest.aiSummary ? "ok" : !apiKey ? "disabled" : digest.projects.some((p) => p.commits.length) ? "failed" : "ok";
}

function aiSettings() {
  return { apiKey: process.env.GROQ_API_KEY?.trim() ?? "", model: process.env.ACTIVITY_AI_MODEL?.trim() || undefined };
}

// Generates only the AI text for an already collected day, without querying GitHub.
export async function generateSummary(date: string) {
  const { username } = settings();
  if (!username) throw new HttpError(503, "Configura GITHUB_USERNAME en el servidor para conectar GitHub.");
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Configura DATABASE_URL y ejecuta las migraciones para guardar los resúmenes.");
  const sql = database();
  const rows = await sql`SELECT digest FROM urithiru_activity WHERE username = ${username.toLowerCase()} AND activity_date = ${date}::date`;
  const digest = rows[0]?.digest as ActivityDigest | undefined;
  if (!digest) throw new HttpError(409, "Primero obtén los datos de este día.");
  const ai = aiSettings();
  const text = await summarizeActivity({ ...ai, digest });
  if (text) {
    await sql`UPDATE urithiru_activity SET digest = jsonb_set(digest, '{aiSummary}', to_jsonb(${text}::text))
      WHERE username = ${username.toLowerCase()} AND activity_date = ${date}::date`;
    digest.aiSummary = text;
  }
  return { ai: aiStatus(digest, ai.apiKey) };
}

export async function generateActivity(date: string, { summarize = true } = {}) {
  const { token, username } = settings();
  if (!token || !username) throw new HttpError(503, "Configura GITHUB_ACTIVITY_TOKEN y GITHUB_USERNAME en el servidor para conectar GitHub.");
  if (!process.env.DATABASE_URL) throw new HttpError(503, "Configura DATABASE_URL y ejecuta las migraciones para guardar los resúmenes.");
  const sql = database();
  // Verify the migration before spending API quota collecting the day's work.
  await sql`SELECT 1 FROM urithiru_activity LIMIT 1`;
  const digest = await collectActivity({ token, username, date });
  const ai = aiSettings();
  // Refreshing the data leaves any earlier text stale, so it is regenerated on demand.
  digest.aiSummary = summarize ? await summarizeActivity({ ...ai, digest }) : null;
  // One row per account/day. Retries do not duplicate reports, and an older or
  // partial run never replaces a newer complete report.
  const rows = await sql`INSERT INTO urithiru_activity (username, activity_date, digest, generated_at)
    VALUES (${username.toLowerCase()}, ${date}::date, ${JSON.stringify(digest)}::jsonb, ${digest.generatedAt}::timestamptz)
    ON CONFLICT (username, activity_date) DO UPDATE SET digest = EXCLUDED.digest, generated_at = EXCLUDED.generated_at
    WHERE (EXCLUDED.digest->>'until')::timestamptz >= (urithiru_activity.digest->>'until')::timestamptz
      AND (jsonb_array_length(EXCLUDED.digest->'issues') = 0 OR jsonb_array_length(urithiru_activity.digest->'issues') > 0)
    RETURNING digest`;
  return { digest, saved: rows.length > 0, ai: aiStatus(digest, ai.apiKey) };
}
