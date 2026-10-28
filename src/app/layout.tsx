import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { PwaInstall } from "@/components/pwa";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3018"),
  ),
  title: {
    default: "Urithiru · Tus proyectos en un solo lugar",
    template: "%s · Urithiru",
  },
  description:
    "Panel privado para consultar el tráfico, los despliegues y los errores de tus proyectos en Vercel.",
  applicationName: "Urithiru",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Urithiru",
  },
  openGraph: {
    title: "Urithiru",
    description: "Todos tus proyectos. Un solo lugar.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "es_ES",
    type: "website",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        <Providers
          configured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
        >
          {children}
          <div className="pwa-install">
            <PwaInstall />
          </div>
        </Providers>
      </body>
    </html>
  );
}
