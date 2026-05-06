// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import FloatingBackButton from "@/components/FloatingBackButton";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SentryAuthListener } from "@/components/providers/sentry-auth-listener";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "True Competency",
  description: "Interventional Cardiology Training Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans bg-[var(--background)] text-[var(--foreground)] overflow-x-hidden">
        <ThemeProvider>
          <div className="min-h-svh flex flex-col">
            <FloatingBackButton />
            <main className="flex-1 flex flex-col overflow-x-hidden">
              <SentryAuthListener />
              {children}
            </main>
            <Analytics />
            <SpeedInsights />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
