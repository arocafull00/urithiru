"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import type { DiariamenteUser } from "@/lib/types";
import { Button } from "./ui/button";

const deletionError = "No se ha podido confirmar el borrado. Vuelve a intentarlo.";

export function DeleteUserDialog({
  user,
  source,
  onDeleted,
}: {
  user: DiariamenteUser;
  source: string;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeUser() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(user.id)}?${source}`,
        {
          method: "DELETE",
          headers: { "X-Confirm-Deletion": user.id },
        },
      );
      const body = await response.json();
      if (!response.ok || body.deleted !== true)
        return setError(body.error ?? deletionError);

      setOpen(false);
      onDeleted(user.id);
    } catch {
      setError(deletionError);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        setOpen(next);
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          size="xs"
          variant="outline"
          className="text-destructive"
          aria-label={`Eliminar a ${user.email ?? user.name}`}
        >
          <Trash2 aria-hidden="true" />
          Eliminar
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-5 shadow-lg"
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <AlertDialog.Title className="text-base font-semibold">
            ¿Eliminar este usuario de Diariamente?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            Se eliminarán de forma permanente la cuenta de{" "}
            <strong className="wrap-anywhere text-foreground">
              {user.name} ({user.email ?? user.id})
            </strong>{" "}
            y sus sesiones en Clerk, junto con su perfil, registros y datos
            asociados en Neon de producción. Si tiene una suscripción activa,
            se cancelará. Esta acción es irreversible.
          </AlertDialog.Description>
          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancelar
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void removeUser()}
            >
              {pending ? "Eliminando…" : "Eliminar usuario"}
            </Button>
          </div>
          {pending && (
            <span className="sr-only" role="status">Eliminando el usuario</span>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
