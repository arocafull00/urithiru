"use client";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { shadcn } from "@clerk/ui/themes";
import { ThemeProvider } from "next-themes";
export function Providers({
  children,
  configured,
}: {
  children: React.ReactNode;
  configured: boolean;
}) {
  const themed = (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="centralita-theme"
    >
      {children}
    </ThemeProvider>
  );
  return configured ? (
    <ClerkProvider
      localization={esES}
      appearance={{ theme: shadcn }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {themed}
    </ClerkProvider>
  ) : (
    themed
  );
}
