import { requireAdmin } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { getSentryEvent } from "@/lib/sentry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    return json({ event: await getSentryEvent(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
