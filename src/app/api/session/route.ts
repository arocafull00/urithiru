import { requireAdmin } from "@/lib/auth";
import { listTeams } from "@/lib/vercel";
import { errorResponse, json } from "@/lib/http";
export async function GET() {
  try {
    const user = await requireAdmin();
    const teams = process.env.VERCEL_TOKEN ? await listTeams() : [];
    return json({
      ...user,
      teams,
      defaultTeamId: process.env.VERCEL_TEAM_ID ?? teams[0]?.id ?? "",
      vercel: Boolean(process.env.VERCEL_TOKEN),
      database: Boolean(process.env.DATABASE_URL),
      drains: Boolean(
        process.env.DATABASE_URL && process.env.VERCEL_DRAIN_SECRET,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
