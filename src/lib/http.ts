export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Authorization",
    },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  console.error(
    "Urithiru request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    { error: "No se ha podido consultar la fuente. Inténtalo de nuevo." },
    502,
  );
}
