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
          <SiteHeader />
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
