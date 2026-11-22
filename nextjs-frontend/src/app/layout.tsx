import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MamaCare · Pregnancy nutrition & care",
  description:
    "Pregnancy-focused nutrition recommendations and health analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f7f8f7] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-200/70 bg-white/60 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">MamaCare</span>
              <span>General guidance, not medical advice. Always follow your clinician’s instructions.</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
