import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { AuthProvider } from "@/components/AuthProvider";
import { AuthNav } from "@/components/AuthNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pregnancy Nutrition Guide",
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
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AuthProvider>
          <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
              <Link href="/" className="text-base font-semibold tracking-tight">
                Pregnancy Nutrition Guide
              </Link>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <Link
                    href="/diet-planner"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Diet Planner
                  </Link>
                  <Link
                    href="/recipe-finder"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Recipe Finder
                  </Link>
                  <Link
                    href="/health-analytics"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Health Analytics
                  </Link>
                  <Link
                    href="/features"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Features
                  </Link>
                  <Link
                    href="/docs"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Docs
                  </Link>
                  <Link
                    href="/prescription-reader"
                    className="rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Prescription Reader
                  </Link>
                </nav>
                <AuthNav />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-600 dark:text-zinc-400">
              Always consult your healthcare provider before making significant dietary changes.
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
