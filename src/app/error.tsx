"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="auth-page">
      <h1>No se ha podido abrir esta vista</h1>
      <p>Puedes reintentarlo sin perder la última información guardada.</p>
      <button className="text-link" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
