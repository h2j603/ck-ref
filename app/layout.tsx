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
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:items-baseline sm:gap-6 sm:px-10">
          <Link
            href="/"
            className="whitespace-nowrap font-mono text-sm font-medium tracking-tight text-foreground"
          >
            <span className="sm:hidden">CK</span>
            <span className="hidden sm:inline">CK Ref.</span>
          </Link>
          <nav className="flex items-center gap-3 whitespace-nowrap font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:gap-6">
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
            <Link
              href="/calendar"
              aria-label="Calendar"
              className="inline-flex items-center transition-colors hover:text-foreground"
            >
              <CalendarDays className="size-4" />
            </Link>
            <AnnouncementComposer />
            <NotificationBell />
            <HeaderProfile profiles={profiles} />
          </nav>
        </header>
        <main className="px-6 pb-24 pt-6 sm:px-10">{children}</main>
      </body>
    </html>
  );
}
