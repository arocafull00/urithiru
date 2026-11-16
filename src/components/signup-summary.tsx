"use client";

import { useState } from "react";
import { X } from "lucide-react";
import useSWR from "swr";
import { ACQUISITION_CHANNELS } from "@/lib/acquisition";
import type { SignupSummary } from "@/lib/types";
import { useDashboard } from "@/stores/dashboard";
import { SignupChannelRow } from "./signup-channel-row";
import { TablePagination, usePagination } from "./table-pagination";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

const channels = [
  ...ACQUISITION_CHANNELS,
  { id: null, label: "Sin origen registrado" },
];

export function SignupSummaryPanel({ projectId, team, period, userId }: {
  projectId: string;
  team: string;
  period: number;
  userId: string;
}) {
  const [requested, setRequested] = useState(false);
  const url = `/api/signup-acquisition?${new URLSearchParams({ project: projectId, team, period: String(period) })}`;
  const key = `${userId}:${url}`;
  const snapshot = useDashboard((state) => state.signupSnapshots[key]);
  const { data, error, mutate, isValidating } = useSWR<SignupSummary>(requested ? [url, userId] : null, {
    fallbackData: snapshot,
    onSuccess: (result) => {
      const state = useDashboard.getState();
      if (JSON.stringify(state.signupSnapshots[key]) === JSON.stringify(result)) return;
      state.patch({ signupSnapshots: Object.fromEntries([
        ...Object.entries(state.signupSnapshots).filter(([entry]) => entry !== key).slice(-19),
        [key, result],
      ]) });
    },
  });
  const total = data?.rows.reduce((sum, row) => sum + row.signups, 0);
  const pagination = usePagination(channels, key);
  return (
    <Sheet onOpenChange={(open) => { if (open) setRequested(true); }}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-fit">
          Ver altas por origen
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="signup-summary-drawer w-full gap-0 overflow-hidden sm:max-w-3xl">
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle>Altas de cuentas por origen</SheetTitle>
          <SheetDescription>Cuentas creadas en Diariamente{period ? ` · ${period === 1 ? "últimas 24 horas" : `últimos ${period} días`}` : " · todas las fechas"}</SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute right-3 top-3" aria-label="Cerrar altas por origen">
            <X size={16} aria-hidden="true" />
          </Button>
        </SheetClose>
        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isValidating}>
          <div className="flex items-center justify-between gap-3 p-4">
            <strong className="text-sm tabular-nums">{total === undefined ? "—" : `${total.toLocaleString("es-ES")} altas`}</strong>
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()} disabled={isValidating}>
              {isValidating ? "Actualizando" : "Actualizar"}
            </Button>
          </div>
          {error && <p role="status" className="px-4 py-3 text-sm text-destructive">{error.message}{data ? " Se mantiene la última lectura guardada." : ""}</p>}
          {!data && !error && <Skeleton className="m-4 h-40" />}
          {data && <>
            <div className="overflow-x-auto">
              <table className="signup-summary-table w-full min-w-[620px] text-sm">
                <thead className="text-xs text-muted-foreground"><tr>
                  <th scope="col" className="px-4 py-2 font-medium">Origen del alta</th>
                  <th scope="col" className="px-4 py-2 font-medium">Total</th>
                  <th scope="col" className="px-4 py-2 font-medium">Web</th>
                  <th scope="col" className="px-4 py-2 font-medium">Android · Google Play</th>
                  <th scope="col" className="px-4 py-2 font-medium">Desde landing</th>
                </tr></thead>
                <tbody>
                  {pagination.rows.map((channel) => <SignupChannelRow key={channel.id ?? "unknown"} channel={channel.id} label={channel.id === "web" ? "Web / directo" : channel.label} rows={data.rows} />)}
                </tbody>
              </table>
            </div>
            <TablePagination label="altas por origen" page={pagination.page} total={channels.length} onPageChange={pagination.setPage} />
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
