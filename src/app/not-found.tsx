import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="auth-page">
      <span className="text-muted-foreground">404</span>
      <h1>Esta página no existe</h1>
      <p>Vuelve a tu espacio para consultar tus proyectos.</p>
      <Link className="text-link" href="/">
        Volver a Urithiru
      </Link>
    </main>
  );
}
