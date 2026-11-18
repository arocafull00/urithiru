import { requireCronSecret } from "@/lib/cron-auth";
import { runErrorAlerts } from "@/lib/error-alerts";
import { errorResponse, json } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    requireCronSecret(request, process.env.ERROR_ALERT_CRON_SECRET);
    const params = new URL(request.url).searchParams;
    const result = await runErrorAlerts({ test: params.get("test") === "1", dryRun: params.get("dryRun") === "1" });
    return json(result, result.failures?.length || result.issues.length ? 503 : 200);
  } catch (error) { return errorResponse(error); }
}
