import { database } from "@/lib/db";
import { parseDrain, verifySignature } from "@/lib/drains";
import { json } from "@/lib/http";
export const maxDuration = 30;
export async function GET() {
  return new Response(process.env.VERCEL_DRAIN_VERIFY ?? "", {
    status: process.env.VERCEL_DRAIN_VERIFY ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  const secret = process.env.VERCEL_DRAIN_SECRET;
  if (!secret || !process.env.DATABASE_URL)
    return json({ error: "Drain no configurado." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > 2000000)
    return json({ error: "Lote demasiado grande." }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Lote vacío." }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2000000) {
      await reader.cancel();
      return json({ error: "Lote demasiado grande." }, 413);
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!verifySignature(body, request.headers.get("x-vercel-signature"), secret))
    return json({ error: "Firma no válida." }, 403);
  let logs;
  try {
    logs = parseDrain(body).filter(
      (log) => !log.environment || log.environment === "production",
    );
  } catch {
    return json(
      { error: "Formato de logs no válido. Usa JSON o NDJSON." },
      400,
    );
  }
  try {
    const sql = database();
    // One atomic, idempotent insert for the entire signed batch. No IPs, headers or raw payloads stored.
    const rows = logs.map((log) => ({
      id: log.id,
      project_id: log.projectId,
      deployment_id: log.deploymentId,
      timestamp: new Date(log.timestamp).toISOString(),
      level:
        log.level ??
        ((log.statusCode ?? log.proxy?.statusCode ?? 0) >= 500
          ? "error"
          : "info"),
      message: log.message,
      path: log.path ?? log.proxy?.path ?? "",
      status_code: log.statusCode ?? log.proxy?.statusCode ?? null,
      source: log.source,
    }));
    await sql`INSERT INTO centralita_logs (id, project_id, deployment_id, timestamp, level, message, path, status_code, source)
      SELECT id, project_id, deployment_id, timestamp, level, message, path, status_code, source FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x(id text, project_id text, deployment_id text, timestamp timestamptz, level text, message text, path text, status_code integer, source text)
      ON CONFLICT (project_id, id) DO NOTHING`;
    return json({ accepted: logs.length });
  } catch {
    return json(
      { error: "No se ha podido guardar el lote. Vercel puede reintentarlo." },
      503,
    );
  }
}
