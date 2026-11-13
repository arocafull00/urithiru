import { ACQUISITION_CHANNELS } from "@/lib/acquisition";
import type { DiariamenteUser, UsersResult } from "@/lib/types";

export function UserAcquisition({ acquisition, status }: {
  acquisition: DiariamenteUser["acquisition"];
  status: UsersResult["acquisition"];
}) {
  if (status !== "ok") return <span className="text-xs text-muted-foreground">{status === "error" ? "Consulta no disponible" : status === "unconfigured" ? "Sin conexión" : "Pendiente de consulta"}</span>;
  if (!acquisition) return <span className="text-xs text-muted-foreground">Sin origen registrado</span>;
  const channel = acquisition.channel === "web" ? "Web / directo" : ACQUISITION_CHANNELS.find((item) => item.id === acquisition.channel)?.label ?? "Sin origen registrado";
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{channel}</span>
      <span className="text-xs text-muted-foreground">{acquisition.platform === "android" ? "Android · Google Play" : "Web"}</span>
      {acquisition.landingHost && <span className="text-xs text-muted-foreground">Desde {acquisition.landingHost}</span>}
    </div>
  );
}
