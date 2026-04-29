import { CalendarDays } from "lucide-react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";

import { AnnouncementComposer } from "@/components/announcement-composer";
import { HeaderProfile } from "@/components/header-profile";
import { NotificationBell } from "@/components/notification-bell";
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
  title: "KIWI Juice",
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
        <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-4 sm:items-baseline sm:gap-8 sm:px-10">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-sm font-medium tracking-tight text-foreground"
          >
            <span className="sm:hidden">KIWI</span>
            <span className="hidden sm:inline">KIWI Juice</span>
          </Link>
          {/*
            Two visually distinct groups: section links (text), then
            action surfaces (calendar / announcements / bell / profile).
            A thin divider clarifies the role break instead of hoping
            users figure it out from the heterogeneous spacing.
          */}
          <nav className="flex items-center gap-4 whitespace-nowrap text-muted-foreground sm:gap-5">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider sm:gap-5">
              <Link href="/" className="transition-colors hover:text-foreground">
                <span className="sm:hidden">IDX</span>
                <span className="hidden sm:inline">Index</span>
              </Link>
              <Link
                href="/designer"
                className="transition-colors hover:text-foreground"
              >
                <span className="sm:hidden">DSGN</span>
                <span className="hidden sm:inline">Designer</span>
              </Link>
              <Link
                href="/upload"
                className="transition-colors hover:text-foreground"
              >
                <span className="sm:hidden">UP</span>
                <span className="hidden sm:inline">Upload</span>
              </Link>
              <Link
                href="/board"
                className="transition-colors hover:text-foreground"
              >
                <span className="sm:hidden">BRD</span>
                <span className="hidden sm:inline">Board</span>
              </Link>
              <Link
                href="/wip"
                className="transition-colors hover:text-foreground"
              >
                <span className="sm:hidden">WIP</span>
                <span className="hidden sm:inline">WIP</span>
              </Link>
            </div>
            <span aria-hidden className="h-3 w-px bg-border/60" />
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/calendar"
                aria-label="Calendar"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:text-foreground"
              >
                <CalendarDays className="size-4" />
              </Link>
              <AnnouncementComposer />
              <NotificationBell />
              <HeaderProfile profiles={profiles} />
            </div>
          </nav>
        </header>
        <main className="px-6 pb-24 pt-6 sm:px-10">{children}</main>
      </body>
    </html>
  );
}
