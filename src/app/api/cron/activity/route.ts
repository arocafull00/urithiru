import { generateActivity, requireActivityCron } from "@/lib/activity";
import { madridDate } from "@/lib/activity-data";
import { errorResponse, json } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    requireActivityCron(request);
    const result = await generateActivity(madridDate());
    // The scheduler needs status only, not private repository names or messages.
    if (result.digest?.issues.length)
      return json({ error: "Resumen parcial guardado. Revisa Actividad en Urithiru y reintenta." }, 503);
    return json({ saved: result.saved });
  } catch (error) { return errorResponse(error); }
}
