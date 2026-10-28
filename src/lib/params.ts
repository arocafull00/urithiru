import { HttpError } from "./http";
import type { Period } from "./types";
export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  const period = Number(params.get("period") ?? 7);
  if (![1, 7, 30].includes(period))
    throw new HttpError(400, "Periodo no válido.");
  const teamId = params.get("team") ?? process.env.VERCEL_TEAM_ID ?? "";
  if (teamId && !/^team_[a-zA-Z0-9]+$/.test(teamId))
    throw new HttpError(400, "Equipo no válido.");
  return {
    period: period as Period,
    teamId,
    projectId: params.get("project") ?? "",
  };
}
