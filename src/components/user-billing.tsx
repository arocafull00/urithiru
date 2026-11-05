"use client";

import { memo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import type {
  BillingAccess,
  BillingUpdate,
  DiariamenteUser,
  UserBilling,
} from "@/lib/types";

const ACCESS_LABELS: Record<BillingAccess, string> = {
  free: "Paciente",
  lifetime: "De por vida",
  clinic: "Cubierto por clínica",
  subscribed: "Suscrito",
  trial: "Prueba",
  trial_available: "Prueba disponible",
  pricing_pending: "Precio pendiente",
  expired: "Caducado",
};

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );

function accessLabel(billing: UserBilling) {
  if (!billing.role) return "Sin perfil";
  if (billing.subscriptionStatus === "past_due") return "Pago pendiente";
  if (billing.access === "trial" && billing.trialEndsAt)
    return `Prueba hasta ${new Date(billing.trialEndsAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;
  return ACCESS_LABELS[billing.access];
}

async function sendUpdate(id: string, update: BillingUpdate, source: string) {
  const response = await fetch(
    `/api/users/${encodeURIComponent(id)}/billing?${source}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    },
  );
  if (response.ok) return null;
  const body = await response.json().catch(() => null);
  return (
    (body as { error?: string } | null)?.error ??
    "No se ha podido actualizar la facturación."
  );
}

export const UserPlanCell = memo(function UserPlanCell({
  billing,
}: {
  billing: UserBilling | null;
}) {
  if (!billing) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={billing.access === "expired" ? "destructive" : "outline"}>
        {accessLabel(billing)}
      </Badge>
      {billing.clinic && (
        <small className="text-muted-foreground">
          {billing.clinic.monthlyPriceCents === null
            ? "Sin precio"
            : `${euros(billing.clinic.monthlyPriceCents)}/mes`}{" "}
          · {billing.clinic.psychologistCount}{" "}
          {billing.clinic.psychologistCount === 1 ? "psicólogo" : "psicólogos"}
        </small>
      )}
    </div>
  );
});

export const UserActionsCell = memo(function UserActionsCell({
  user,
  onUpdated,
  source,
}: {
  user: DiariamenteUser;
  onUpdated: () => void;
  source: string;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { billing } = user;
  if (!billing || (billing.role !== "psychologist" && !billing.clinic))
    return null;

  async function run(update: BillingUpdate) {
    setPending(true);
    setError(null);
    const message = await sendUpdate(user.id, update, source);
    setPending(false);
    setConfirming(false);
    if (message) return setError(message);
    setPrice("");
    onUpdated();
  }

  const cents = Math.round(Number(price.replace(",", ".")) * 100);
  const validPrice = Number.isSafeInteger(cents) && cents >= 100;

  return (
    <div className="flex flex-col items-end gap-2">
      {billing.role === "psychologist" &&
        (confirming ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="xs"
              disabled={pending}
              onClick={() =>
                void run({
                  action: "lifetime",
                  enabled: !billing.lifetimeAccess,
                })
              }
            >
              {pending ? "Guardando" : "Confirmar"}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            {billing.lifetimeAccess
              ? "Quitar acceso de por vida"
              : "Dar acceso de por vida"}
          </Button>
        ))}
      {billing.clinic && (
        <form
          className="flex flex-wrap items-center justify-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (validPrice)
              void run({ action: "clinic-price", monthlyPriceCents: cents });
          }}
        >
          <Input
            aria-label={`Precio mensual de ${billing.clinic.name} en euros`}
            placeholder="€/mes"
            inputMode="decimal"
            className="h-6 w-20 text-xs"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <Button size="xs" type="submit" disabled={!validPrice || pending}>
            {pending ? "Guardando" : "Guardar precio"}
          </Button>
        </form>
      )}
      {error && (
        <small className="text-destructive" role="alert">
          {error}
        </small>
      )}
    </div>
  );
});
