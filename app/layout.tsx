import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

import { HeaderProfile } from "@/components/header-profile";
import { fetchProfiles } from "@/lib/queries";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CK Ref.",
  description: "Mass-symmetry graphic design reference archive.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profiles = await fetchProfiles();
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-border/60 px-6 py-4 sm:items-baseline sm:px-10">
          <Link
            href="/"
            className="font-mono text-sm font-medium tracking-tight text-foreground"
          >
            CK Ref.
          </Link>
          <nav className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:gap-6">
            <Link href="/" className="transition-colors hover:text-foreground">
              Index
            </Link>
            <Link
              href="/board"
              className="transition-colors hover:text-foreground"
            >
              Board
            </Link>
            <Link
              href="/designer"
              className="transition-colors hover:text-foreground"
            >
              Designer
            </Link>
            <Link
              href="/upload"
              className="transition-colors hover:text-foreground"
            >
              Upload
            </Link>
            <HeaderProfile profiles={profiles} />
          </nav>
        </header>
        <main className="px-6 pb-24 pt-6 sm:px-10">{children}</main>
      </body>
    </html>
  );
}
