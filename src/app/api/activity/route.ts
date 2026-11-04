import { requireAdmin } from "@/lib/auth";
import { generateActivity, generateSummary, readActivity } from "@/lib/activity";
import { activityDate } from "@/lib/activity-data";
import { errorResponse, HttpError, json } from "@/lib/http";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return json(await readActivity(activityDate(new URL(request.url).searchParams.get("date"))));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    // This endpoint writes private reports; require a same-origin browser call.
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new HttpError(403, "Origen no permitido.");
    const params = new URL(request.url).searchParams;
    const date = activityDate(params.get("date"));
    if (params.get("action") === "summary") {
      const result = await generateSummary(date);
      return json({ ...await readActivity(date), saved: true, ai: result.ai });
    }
    const result = await generateActivity(date, { summarize: false });
    return json({ ...await readActivity(date), saved: result.saved, ai: result.ai });
  } catch (error) { return errorResponse(error); }
}
